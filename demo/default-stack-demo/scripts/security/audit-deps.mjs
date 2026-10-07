import console from 'node:console';
import { createHash } from 'node:crypto';
import { readdir, readFile, lstat, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';
import { verifyForge } from './forge-regression.mjs';
import { verifyBraces } from './braces-regression.mjs';
import { verifyDecoder } from './decoder-regression.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const assetRoot = path.dirname(fileURLToPath(import.meta.url));
const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const supported = {
  'node-forge': { version: '1.4.0', advisory: 'GHSA-86w9-cpqp-85rv', verify: verifyForge },
  braces: { version: '3.0.3', advisory: 'GHSA-vfj7-8cjw-p6xm', verify: verifyBraces },
  'decode-uri-component': { version: '0.2.2', advisory: 'GHSA-vcc3-ghjq-m6fr', verify: verifyDecoder },
};

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
const nonemptyString = (value) => typeof value === 'string' && value.length > 0;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value) => Array.isArray(value) && value.length > 0 && value.every(nonemptyString);

async function collectPackageFiles(directory, relative, files) {
  const names = (await readdir(directory)).sort().filter((name) => relative || name !== 'node_modules');
  for (const name of names) {
    const key = relative ? `${relative}/${name}` : name;
    await collectPackageEntry(path.join(directory, name), key, files);
  }
}

async function collectPackageEntry(location, key, files) {
  const entry = await lstat(location);
  ensure(!entry.isSymbolicLink(), `Unexpected package symlink: ${key}`);
  if (entry.isDirectory()) return collectPackageFiles(location, key, files);
  ensure(entry.isFile(), `Unexpected package file type: ${key}`);
  files.push([key, sha256(await readFile(location))]);
}

export async function hashPackageTree(packageRoot) {
  const files = [];
  await collectPackageFiles(packageRoot, '', files);
  // Use code-unit ordering independently of the host locale.
  const sortedNames = files.map(([name]) => name).sort();
  const hashes = new Map(files);
  return sha256(sortedNames.map((name) => `${name}\0${hashes.get(name)}\n`).join(''));
}

async function optionalStat(location) {
  try { return await lstat(location); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function discoverCopy(directory, name, copies, links) {
  const candidate = path.join(directory, name);
  const stat = await optionalStat(candidate);
  if (!stat) return;
  if (stat.isSymbolicLink()) return links.push(candidate);
  ensure(stat.isDirectory(), `Unexpected package location: ${candidate}`);
  copies.add(await realpath(candidate));
}

function insideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function discoverLinkedDirectory(location, name, copies, links, state) {
  const target = await realpath(location);
  const stat = await lstat(target);
  if (!stat.isDirectory()) return;
  ensure(insideRoot(state.root, target), `Directory link escapes dependency inspection: ${location}`);
  await discoverPackages(location, name, copies, links, state);
}

async function discoverPackages(directory, name, copies, links, state) {
  // Inspect logical node_modules aliases before deduplicating physical traversal.
  if (path.basename(directory) === 'node_modules') await discoverCopy(directory, name, copies, links);
  const physical = await realpath(directory);
  if (state.visited.has(physical)) return;
  state.visited.add(physical);
  const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.name !== '.git');
  for (const entry of entries) await discoverEntry(directory, entry, name, copies, links, state);

}

async function discoverEntry(directory, entry, name, copies, links, state) {
  const location = path.join(directory, entry.name);
  if (entry.isDirectory()) return discoverPackages(location, name, copies, links, state);
  if (entry.isSymbolicLink()) return discoverLinkedDirectory(location, name, copies, links, state);
}

async function packageCopies(projectRoot, name) {
  const copies = new Set();
  const links = [];
  const state = { root: await realpath(projectRoot), visited: new Set() };
  await discoverPackages(projectRoot, name, copies, links, state);
  const storeCopies = new Set([...copies].filter((copy) => copy.split(path.sep).includes('.pnpm')));
  for (const link of links) ensure(storeCopies.has(await realpath(link)), `Package link escapes verified pnpm copies: ${link}`);
  return [...copies];
}

function validateFinding(finding) {
  ensure(nonemptyString(finding?.version), 'Malformed pnpm advisory');
  ensure(strings(finding.paths), 'Malformed pnpm advisory');
}

function validateAdvisory(advisory) {
  ensure(nonemptyString(advisory?.module_name), 'Malformed pnpm advisory');
  ensure(severities.includes(advisory.severity), 'Malformed pnpm advisory');
  ensure(Array.isArray(advisory.findings), 'Malformed pnpm advisory');
  ensure(advisory.findings.length > 0, 'Malformed pnpm advisory');
  advisory.findings.forEach(validateFinding);
}

function validateCount(advisories, severity, count) {
  ensure(Number.isInteger(count) && count >= 0, 'Malformed pnpm vulnerability counts');
  const details = advisories.filter((advisory) => advisory.severity === severity).length;
  ensure(count === details, `Missing ${severity} advisory details: count ${count}, details ${details}`);
}

function validateReport(report) {
  ensure(record(report), 'Malformed pnpm audit report');
  ensure(record(report.advisories), 'Malformed pnpm audit report');
  ensure(record(report.metadata?.vulnerabilities), 'Malformed pnpm audit report');
  ensure(!report.error, 'Malformed pnpm audit report');
  const advisories = Object.values(report.advisories);
  advisories.forEach(validateAdvisory);
  for (const severity of severities) validateCount(advisories, severity, report.metadata.vulnerabilities[severity]);
}

function validateEntry(entry) {
  const message = 'Malformed remediation entry';
  ensure(record(entry), message);
  ensure(Object.hasOwn(supported, entry.name), message);
  const expected = supported[entry.name];
  ensure(entry.version === expected.version, message);
  ensure(Array.isArray(entry.advisoryIds), message);
  ensure(entry.advisoryIds.length === 1, message);
  ensure(entry.advisoryIds[0] === expected.advisory, message);
  ensure(/^[a-f0-9]{64}$/.test(entry.patchSha256 ?? ''), message);
  ensure(/^[a-f0-9]{64}$/.test(entry.installedTreeSha256 ?? ''), message);
  ensure(entry.patch === `${entry.name}@${entry.version}.patch`, message);
}

function validateManifest(manifest) {
  ensure(manifest?.schemaVersion === 1, 'Malformed remediation manifest');
  ensure(Array.isArray(manifest.packages), 'Malformed remediation manifest');
  manifest.packages.forEach(validateEntry);
  const names = manifest.packages.map((entry) => entry.name);
  ensure(new Set(names).size === names.length, 'Duplicate remediation entries');
  ensure(names.length === Object.keys(supported).length, 'Incomplete remediation manifest');
}

async function optionalFile(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

function parsePatchLine(line) {
  const match = line.match(/^\s+['"]?([^'"\s]+)['"]?:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/);
  return match?.slice(1);
}

function patchSection(workspace) {
  const lines = workspace.split(/\r?\n/);
  const headers = lines.flatMap((line, index) => /^(?:patchedDependencies|"patchedDependencies"|'patchedDependencies')\s*:\s*(?:#.*)?$/.test(line) ? [index] : []);
  ensure(headers.length <= 1, 'Duplicate patchedDependencies sections');
  if (headers.length === 0) return [];
  const remainder = lines.slice(headers[0] + 1);
  const end = remainder.findIndex((line) => /^\S/.test(line) && !line.startsWith('#'));
  return (end < 0 ? remainder : remainder.slice(0, end)).map(parsePatchLine).filter(Boolean);
}

async function hasPatchMapping(projectRoot, entry) {
  const section = patchSection(await optionalFile(path.join(projectRoot, 'pnpm-workspace.yaml')));
  const key = `${entry.name}@${entry.version}`;
  const matches = section.filter(([name]) => name === key);
  ensure(matches.length <= 1, `Duplicate patch mapping: ${key}`);
  return matches[0]?.[1] === path.posix.join('scripts/security', entry.patch);
}

async function verifyPatch(projectRoot, securityRoot, entry) {
  ensure(await hasPatchMapping(projectRoot, entry), `Missing patch mapping: ${entry.name}@${entry.version}`);
  const patch = path.join(securityRoot, entry.patch);
  ensure((await lstat(patch)).isFile(), `Unexpected patch file: ${entry.name}`);
  ensure(sha256(await readFile(patch)) === entry.patchSha256, `Patch checksum mismatch: ${entry.name}`);
}

async function verifyCopy(copy, entry, verify) {
  const pkg = JSON.parse(await readFile(path.join(copy, 'package.json'), 'utf8'));
  ensure(pkg.name === entry.name && pkg.version === entry.version, `Unexpected installed version: ${entry.name} at ${copy}`);
  ensure(await hashPackageTree(copy) === entry.installedTreeSha256, `Installed package bytes differ: ${copy}`);
  await verify(copy);
}

async function verifyEntry(entry, options) {
  const copies = await packageCopies(options.projectRoot, entry.name);
  if (copies.length === 0) return false;
  await verifyPatch(options.projectRoot, options.securityRoot, entry);
  const verify = options.regressions[entry.name] ?? supported[entry.name].verify;
  ensure(typeof verify === 'function', `Missing regression verifier: ${entry.name}`);
  for (const copy of copies) await verifyCopy(copy, entry, verify);
  return true;
}

function matchesAdvisory(entry, advisory) {
  return entry.name === advisory.module_name && entry.advisoryIds.includes(advisory.github_advisory_id);
}

function advisoryFixed(entry, advisory, verified) {
  return Boolean(entry && verified.has(entry.name) && advisory.findings.every((finding) => finding.version === entry.version));
}

function advisoryVerdict(advisory, manifest, verified) {
  const entry = manifest.packages.find((item) => matchesAdvisory(item, advisory));
  const fixed = advisoryFixed(entry, advisory, verified);
  const id = advisory.github_advisory_id ?? String(advisory.id);
  const state = fixed ? 'verified local backport; upstream audit remains affected' : 'unremediated';
  return { text: `${advisory.severity}: ${id} (${advisory.module_name}) — ${state}`, blocked: !fixed && ['high', 'critical'].includes(advisory.severity), id };
}

export async function verifyAuditReport(report, { projectRoot, manifest, securityRoot = assetRoot, regressions = {} }) {
  validateReport(report);
  validateManifest(manifest);
  const verified = new Set();
  for (const entry of manifest.packages) {
    if (await verifyEntry(entry, { projectRoot, securityRoot, regressions })) verified.add(entry.name);
  }
  const results = Object.values(report.advisories).map((advisory) => advisoryVerdict(advisory, manifest, verified));
  const verdicts = results.map((result) => result.text);
  const blocked = results.filter((result) => result.blocked).map((result) => result.id);
  ensure(blocked.length === 0, `Unremediated high/critical advisories: ${blocked.join(', ')}\n${verdicts.join('\n')}`);
  return { verdicts, verified: [...verified] };
}

function parseAuditResult(stdout, stderr, code, signal) {
  ensure(!signal && [0, 1].includes(code), `pnpm audit failed (${signal ?? code}): ${stderr.slice(0, 2000)}`);
  let report;
  try { report = JSON.parse(stdout); }
  catch { throw new Error(`pnpm audit returned malformed JSON: ${stderr.slice(0, 2000)}`); }
  validateReport(report);
  const clean = Object.values(report.metadata.vulnerabilities).every((count) => count === 0);
  ensure((code === 0) === clean, 'pnpm audit exit status disagrees with vulnerability counts');
  return { report, raw: stdout };
}

function collectAuditProcess(child) {
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '';
    const fail = (error) => { clearTimeout(timer); child.kill(); reject(error); };
    const timer = setTimeout(() => fail(new Error('pnpm audit timed out')), 120_000);
    child.stdout.on('data', (data) => {
      stdout += data;
      if (stdout.length > 16_000_000) fail(new Error('pnpm audit output exceeds limit'));
    });
    child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-16_000); });
    child.on('error', fail);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      try { resolve(parseAuditResult(stdout, stderr, code, signal)); }
      catch (error) { reject(error); }
    });
  });
}

export function runAudit(projectRoot, all = true) {
  const pnpm = process.env.npm_execpath;
  ensure(nonemptyString(pnpm), 'Run this check through pnpm');
  ensure(/pnpm/i.test(path.basename(pnpm)), 'Run this check through pnpm');
  const args = ['audit', '--json', '--audit-level', 'low', ...(all ? [] : ['--prod'])];
  const javascript = /\.[cm]?js$/i.test(pnpm);
  const child = spawn(javascript ? process.execPath : pnpm, javascript ? [pnpm, ...args] : args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  return collectAuditProcess(child);
}

async function main() {
  const projectRoot = process.cwd();
  const { report, raw } = await runAudit(projectRoot);
  const reportPath = path.join(projectRoot, '.anhedral-audit-report.json');
  await writeFile(reportPath, raw);
  console.log(`Unmodified pnpm audit report (all dependencies): ${reportPath}`);
  const manifest = JSON.parse(await readFile(path.join(assetRoot, 'manifest.json'), 'utf8'));
  const result = await verifyAuditReport(report, { projectRoot, manifest });
  result.verdicts.forEach((verdict) => console.log(verdict));
  console.log('Dependency gate passed: no unremediated high/critical findings.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { hashPackageTree, verifyAuditReport, runAudit } from '../assets/security/audit-deps.mjs';

async function fixture(run) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'anhedral-backport-test-'));
  const securityRoot = path.join(projectRoot, 'scripts/security');
  const packageRoot = path.join(projectRoot, 'node_modules/.pnpm/braces@3.0.3_patch_hash=test/node_modules/braces');
  try {
    await mkdir(packageRoot, { recursive: true });
    await mkdir(securityRoot, { recursive: true });
    await writeFile(path.join(projectRoot, 'package.json'), '{}');
    await writeFile(path.join(projectRoot, 'pnpm-workspace.yaml'), 'patchedDependencies:\n  braces@3.0.3: scripts/security/braces@3.0.3.patch\n');
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'braces', version: '3.0.3' }));
    await writeFile(path.join(packageRoot, 'index.js'), 'fixed fixture');
    await writeFile(path.join(securityRoot, 'braces@3.0.3.patch'), 'fixture patch');
    const entry = {
      name: 'braces', version: '3.0.3', advisoryIds: ['GHSA-vfj7-8cjw-p6xm'], patch: 'braces@3.0.3.patch',
      patchSha256: createHash('sha256').update('fixture patch').digest('hex'), installedTreeSha256: await hashPackageTree(packageRoot),
    };
    const advisory = { module_name: 'braces', severity: 'high', github_advisory_id: entry.advisoryIds[0], findings: [{ version: '3.0.3', paths: ['fixture>braces'] }] };
    const report = { advisories: { 1: advisory }, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } } };
    let regressions = 0;
    const unused = [
      { name: 'node-forge', version: '1.4.0', advisory: 'GHSA-86w9-cpqp-85rv' },
      { name: 'decode-uri-component', version: '0.2.2', advisory: 'GHSA-vcc3-ghjq-m6fr' },
    ].map(({ name, version, advisory }) => ({ name, version, advisoryIds: [advisory], patch: `${name}@${version}.patch`, patchSha256: '0'.repeat(64), installedTreeSha256: '0'.repeat(64) }));
    const options = { projectRoot, securityRoot, manifest: { schemaVersion: 1, packages: [entry, ...unused] }, regressions: { braces: () => { regressions++; } } };
    await run({ projectRoot, securityRoot, packageRoot, entry, advisory, report, options, regressionCount: () => regressions });
  } finally { await rm(projectRoot, { recursive: true, force: true }); }
}

test('backport gate retains truthful audit findings and verifies physical bytes and behavior', async () => fixture(async ({ projectRoot, packageRoot, report, options, regressionCount }) => {
  await symlink(packageRoot, path.join(projectRoot, 'node_modules/braces'));
  const result = await verifyAuditReport(report, options);
  assert.deepEqual(result.verified, ['braces']);
  assert.match(result.verdicts[0], /upstream audit remains affected/);
  assert.equal(report.advisories[1].severity, 'high');
  assert.equal(regressionCount(), 1);
  await writeFile(path.join(projectRoot, 'pnpm-workspace.yaml'), '"patchedDependencies": # effective YAML key\n# a comment does not end this map\n  braces@3.0.3: scripts/security/braces@3.0.3.patch\n');
  await verifyAuditReport(report, options);
  await assert.rejects(verifyAuditReport(report, { ...options, regressions: { braces: () => { throw new Error('behavior failed'); } } }), /behavior failed/);
}));

test('backport gate rejects missing reports, unknown advisories, altered versions and invented exemptions', async () => fixture(async ({ report, options, advisory, entry }) => {
  for (const invalid of [null, {}, { ...report, error: 'offline' }, { ...report, advisories: {} }]) await assert.rejects(verifyAuditReport(invalid, options), /Malformed|Missing high/);
  await assert.rejects(verifyAuditReport({ ...report, advisories: { 1: { ...advisory, github_advisory_id: 'GHSA-unknown' } } }, options), /Unremediated/);
  await assert.rejects(verifyAuditReport({ ...report, advisories: { 1: { ...advisory, findings: [{ version: '3.0.2', paths: ['fixture>braces'] }] } } }, options), /Unremediated/);
  await assert.rejects(verifyAuditReport(report, { ...options, manifest: { schemaVersion: 1, packages: [{ ...entry, advisoryIds: ['GHSA-unknown'] }] } }), /Malformed remediation/);
  for (const count of [0, 2]) {
    const incomplete = { ...report, metadata: { vulnerabilities: { ...report.metadata.vulnerabilities, high: count } } };
    await assert.rejects(verifyAuditReport(incomplete, options), /Missing high advisory details/);
  }
  const clean = { advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } };
  for (const omitted of options.manifest.packages) {
    const manifest = { ...options.manifest, packages: options.manifest.packages.filter((entry) => entry !== omitted) };
    await assert.rejects(verifyAuditReport(clean, { ...options, manifest }), /Incomplete remediation manifest/);
  }
  await assert.rejects(verifyAuditReport(clean, { ...options, manifest: { schemaVersion: 1, packages: [] } }), /Incomplete remediation manifest/);
  const moderate = await verifyAuditReport({ ...report, advisories: { 1: { ...advisory, severity: 'moderate', github_advisory_id: 'GHSA-unknown' } }, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0 } } }, options);
  assert.match(moderate.verdicts[0], /moderate.*unremediated/);
}));

test('backport gate preserves patch mappings after unindented YAML comments', async () => fixture(async ({ projectRoot, report, options }) => {
  await writeFile(path.join(projectRoot, 'pnpm-workspace.yaml'), 'patchedDependencies:\n  node-forge@1.4.0: scripts/security/node-forge@1.4.0.patch\n# Preserved user comment\n  braces@3.0.3: scripts/security/braces@3.0.3.patch\npackages:\n  - apps/*\n');
  assert.deepEqual((await verifyAuditReport(report, options)).verified, ['braces']);
}));

test('backport gate rejects patch/config/package drift including unused files and symlinks', async () => fixture(async ({ projectRoot, securityRoot, packageRoot, report, options }) => {
  await writeFile(path.join(packageRoot, 'unused.txt'), 'unexpected');
  await assert.rejects(verifyAuditReport(report, options), /bytes differ/);
  await rm(path.join(packageRoot, 'unused.txt'));
  await symlink('index.js', path.join(packageRoot, 'unexpected'));
  await assert.rejects(verifyAuditReport(report, options), /symlink/);
  await rm(path.join(packageRoot, 'unexpected'));
  await writeFile(path.join(securityRoot, 'braces@3.0.3.patch'), 'changed');
  await assert.rejects(verifyAuditReport(report, options), /checksum/);
  await writeFile(path.join(securityRoot, 'braces@3.0.3.patch'), 'fixture patch');
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'braces', version: '3.0.2' }));
  await assert.rejects(verifyAuditReport(report, options), /Unexpected installed version/);
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'braces', version: '3.0.3' }));
  await rm(path.join(projectRoot, 'pnpm-workspace.yaml'));
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ pnpm: { patchedDependencies: { 'braces@3.0.3': 'scripts/security/braces@3.0.3.patch' } } }));
  await assert.rejects(verifyAuditReport(report, options), /Missing patch mapping/);
}));

test('backport gate rejects every unpatched duplicate and plain shadow or redirected consumer even with a clean audit', async () => fixture(async ({ projectRoot, packageRoot, options }) => {
  const clean = { advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } };
  const plain = path.join(projectRoot, 'node_modules/braces');
  await mkdir(plain);
  await writeFile(path.join(plain, 'package.json'), JSON.stringify({ name: 'braces', version: '3.0.3' }));
  await assert.rejects(verifyAuditReport(clean, options), /bytes differ/);
  await rm(plain, { recursive: true });
  await symlink(options.securityRoot, plain);
  await assert.rejects(verifyAuditReport(clean, options), /escapes verified/);
  await rm(plain);
  const duplicate = path.join(projectRoot, 'node_modules/.pnpm/braces@3.0.3/node_modules/braces');
  await mkdir(duplicate, { recursive: true });
  await writeFile(path.join(duplicate, 'package.json'), JSON.stringify({ name: 'braces', version: '3.0.3' }));
  await assert.rejects(verifyAuditReport(clean, options), /bytes differ/);
  await rm(path.dirname(path.dirname(duplicate)), { recursive: true });
  await symlink(packageRoot, plain);
  await verifyAuditReport(clean, options);
}));


test('audit runner rejects invalid subprocess results and uses portable lifecycle arguments', async () => fixture(async ({ projectRoot }) => {
  const executable = path.join(projectRoot, 'pnpm.cjs');
  const previous = process.env.npm_execpath;
  process.env.npm_execpath = executable;
  try {
    const clean = { advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } };
    await writeFile(executable, `if (!process.argv.includes('--audit-level') || !process.argv.includes('low') || process.argv.includes('--prod')) process.exit(2); console.log(${JSON.stringify(JSON.stringify(clean))});`);
    assert.deepEqual((await runAudit(projectRoot)).report, clean);
    await writeFile(executable, `if (!process.argv.includes('--prod')) process.exit(2); console.log(${JSON.stringify(JSON.stringify(clean))});`);
    assert.deepEqual((await runAudit(projectRoot, false)).report, clean);
    await writeFile(executable, `console.log(${JSON.stringify(JSON.stringify(clean))}); process.exit(1);`);
    await assert.rejects(runAudit(projectRoot), /exit status disagrees/);
    await writeFile(executable, "console.log('not JSON');");
    await assert.rejects(runAudit(projectRoot), /malformed JSON/);
    await writeFile(executable, "console.error('network failed'); process.exit(2);");
    await assert.rejects(runAudit(projectRoot), /failed.*network failed/s);
  } finally {
    if (previous === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previous;
  }
}));


test('backport gate follows internal directory aliases but rejects hidden external consumers', async () => fixture(async ({ projectRoot, packageRoot, report, options }) => {
  const external = await mkdtemp(path.join(tmpdir(), 'anhedral-external-consumer-'));
  const app = path.join(projectRoot, 'apps/app');
  await mkdir(app, { recursive: true });
  const consumer = createRequire(path.join(app, 'package.json'));
  try {
    await mkdir(path.join(external, 'node_modules/braces'), { recursive: true });
    await writeFile(path.join(external, 'node_modules/braces/package.json'), JSON.stringify({ name: 'braces', version: '3.0.3' }));
    await writeFile(path.join(external, 'node_modules/braces/index.js'), "module.exports = 'unpatched consumer';");
    await symlink(path.join(external, 'node_modules'), path.join(app, 'node_modules'));
    assert.equal(consumer('braces'), 'unpatched consumer');
    await assert.rejects(verifyAuditReport(report, options), /Directory link escapes dependency inspection/);
    await rm(path.join(app, 'node_modules'));
    await symlink(external, path.join(projectRoot, 'apps/external'));
    await assert.rejects(verifyAuditReport(report, options), /Directory link escapes dependency inspection/);
    await rm(path.join(projectRoot, 'apps/external'));
    const shared = path.join(projectRoot, 'shared/node_modules');
    await mkdir(shared, { recursive: true });
    await symlink(packageRoot, path.join(shared, 'braces'));
    await symlink(shared, path.join(app, 'node_modules'));
    await symlink(app, path.join(projectRoot, 'apps/alias'));
    await symlink(projectRoot, path.join(projectRoot, 'shared/cycle'));
    const result = await verifyAuditReport(report, options);
    assert.deepEqual(result.verified, ['braces']);
  } finally { await rm(external, { recursive: true, force: true }); }
}));

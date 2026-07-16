import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const npmCache = mkdtempSync(path.join(tmpdir(), 'anhedral-npm-cache-'));

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: npmCache,
    },
  });
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  return { stdout, stderr };
}

function parsePackJson(output) {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  assert.ok(start >= 0 && end > start, `npm pack should emit a JSON array\noutput:\n${output}`);
  return JSON.parse(output.slice(start, end + 1));
}

function runInstalledCli(cwd) {
  const binRoot = path.join(cwd, 'node_modules', '.bin');
  const binPath = path.join(binRoot, process.platform === 'win32' ? 'anhedral.cmd' : 'anhedral');
  assert.equal(existsSync(binPath), true, `installed CLI shim should exist at ${binPath}`);

  if (process.platform === 'win32') {
    return run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${binPath}" --help`], cwd);
  }

  return run(binPath, ['--help'], cwd);
}

function resolveProvidedTarball(argument) {
  const providedPath = path.resolve(argument);
  if (!providedPath.endsWith('.json')) return providedPath;

  const metadata = JSON.parse(readFileSync(providedPath, 'utf8'));
  assert.equal(metadata.filename, path.basename(metadata.filename), 'artifact filename must be a basename');
  return path.join(path.dirname(providedPath), metadata.filename);
}

let ownsTarball = false;
let tarballPath;

if (process.argv[2]) {
  tarballPath = resolveProvidedTarball(process.argv[2]);
  assert.equal(existsSync(tarballPath), true, `provided tarball should exist at ${tarballPath}`);
} else {
  const packResult = run(npmCommand, ['pack', '--json', '--ignore-scripts'], repoRoot);
  const packed = parsePackJson(packResult.stdout);
  const tarballName = packed[0]?.filename;
  assert.equal(typeof tarballName, 'string', 'npm pack should report a tarball filename');
  tarballPath = path.join(repoRoot, tarballName);
  ownsTarball = true;
}

const installRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-packed-cli-'));

try {
  run(npmCommand, ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath], installRoot);
  const packageJson = JSON.parse(readFileSync(path.join(installRoot, 'node_modules/anhedral/package.json'), 'utf8'));
  assert.equal(packageJson.bin.anhedral, 'bin/anhedral.js');
  assert.equal(packageJson.types, './dist/index.d.ts');
  assert.match(runInstalledCli(installRoot).stdout, /anhedral init/);
  const imported = run(process.execPath, ['--input-type=module', '--eval', [
    "const packageApi = await import('anhedral');",
    "if (typeof packageApi.scaffoldProject !== 'function') throw new Error('missing scaffoldProject export');",
    "if (typeof packageApi.resolveModules !== 'function') throw new Error('missing resolveModules export');",
  ].join('\n')], installRoot);
  assert.equal(imported.stdout, '');
} finally {
  rmSync(installRoot, { recursive: true, force: true });
  rmSync(npmCache, { recursive: true, force: true });
  if (ownsTarball) unlinkSync(tarballPath);
}

console.log('Packed CLI smoke test passed');

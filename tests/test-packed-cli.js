import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

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

const packResult = run('npm', ['pack', '--json', '--ignore-scripts'], repoRoot);
const packed = JSON.parse(packResult.stdout);
const tarballName = packed[0]?.filename;
assert.equal(typeof tarballName, 'string', 'npm pack should report a tarball filename');

const tarballPath = path.join(repoRoot, tarballName);
const installRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-packed-cli-'));

try {
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath], installRoot);
  const packageJson = JSON.parse(readFileSync(path.join(installRoot, 'node_modules/anhedral/package.json'), 'utf8'));
  assert.equal(packageJson.bin.anhedral, 'bin/anhedral.js');
  assert.match(run('node', ['node_modules/anhedral/dist/index.js', '--help'], installRoot).stdout, /anhedral init/);
} finally {
  rmSync(installRoot, { recursive: true, force: true });
  rmSync(npmCache, { recursive: true, force: true });
  unlinkSync(tarballPath);
}

console.log('Packed CLI smoke test passed');

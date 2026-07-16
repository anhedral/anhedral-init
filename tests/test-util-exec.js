import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-util-exec-'));
const utilUrl = pathToFileURL(path.join(repoRoot, 'dist', 'util.js')).href;

function shellCommand(scriptPath) {
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)}`;
}

function runExec(command, env = {}) {
  const source = `
    import { exec } from ${JSON.stringify(utilUrl)};
    try {
      exec(${JSON.stringify(command)}, ${JSON.stringify(temporaryRoot)});
    } catch (error) {
      process.stdout.write(String(error instanceof Error ? error.message : error));
      process.exitCode = 1;
    }
  `;
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
  });
}

try {
  const noisySuccess = path.join(temporaryRoot, 'noisy-success.mjs');
  writeFileSync(noisySuccess, `
    process.stdout.write('o'.repeat(2 * 1024 * 1024));
    process.stderr.write('e'.repeat(2 * 1024 * 1024));
  `);
  const success = runExec(shellCommand(noisySuccess));
  assert.equal(success.status, 0, `large successful output must not overflow a memory buffer: ${success.stderr}`);
  assert.equal(success.stdout, '');
  assert.equal(success.stderr, '');

  const noisyFailure = path.join(temporaryRoot, 'noisy-failure.mjs');
  writeFileSync(noisyFailure, `
    process.stdout.write('discarded-stdout-prefix\\n' + 'x'.repeat(256 * 1024) + '\\nstdout-tail-marker\\n');
    process.stderr.write('discarded-stderr-prefix\\n' + 'y'.repeat(256 * 1024) + '\\nstderr-tail-marker\\n');
    process.exitCode = 7;
  `);
  const failure = runExec(shellCommand(noisyFailure));
  assert.equal(failure.status, 1);
  assert.match(failure.stdout, /Command failed \(exit 7\)/);
  assert.match(failure.stderr, /stdout-tail-marker/);
  assert.match(failure.stderr, /stderr-tail-marker/);
  assert.doesNotMatch(failure.stderr, /discarded-(?:stdout|stderr)-prefix/);
  assert.ok(Buffer.byteLength(failure.stderr) <= 2 * 128 * 1024, 'failure diagnostics must remain bounded');

  const quietFailure = runExec(shellCommand(noisyFailure), { ANHEDRAL_QUIET: '1' });
  assert.equal(quietFailure.status, 1);
  assert.match(quietFailure.stdout, /Command failed \(exit 7\)/);
  assert.equal(quietFailure.stderr, '', 'quiet mode must suppress child diagnostics');

  console.log('Command execution buffering regressions passed');
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const workspace = mkdtempSync(path.join(tmpdir(), 'anhedral-json-flush-'));
const project = path.join(workspace, 'large-doctor-report');
mkdirSync(project);

try {
  const initialized = spawnSync('node', [cliEntry, 'init', '--api', '--skip-install'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(initialized.status, 0, initialized.stderr);

  const manifestPath = path.join(project, 'anhedral.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (let index = 0; index < 5_000; index += 1) {
    manifest.files[`missing/generated-report-entry-${String(index).padStart(5, '0')}.txt`] = {
      owner: 'root',
      ownership: 'user',
      hash: '0'.repeat(64),
      mode: null,
    };
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const result = spawnSync('node', [cliEntry, 'doctor', '--json'], {
    cwd: project,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 1);
  assert.ok(result.stdout.length > 65_536, 'regression report must exceed a pipe buffer');
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.issues.filter((issue) => issue.message === 'Recorded file is missing.').length, 5_000);
  assert.equal(result.stderr, '');
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log('Large JSON stream flush test passed');

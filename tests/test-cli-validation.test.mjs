import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = mkdtempSync(path.join(tmpdir(), 'anhedral-cli-validation-'));
const cli = path.resolve('dist/bin.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
assert.match(readme, /\]\(docs\/application-stack-standard\.md\)/);
assert.match(readme, /anhedral --help/);
try {
  for (const args of [['add', 'expo'], ['doctor', '--unknown'], ['setup-vps'], ['init', '--legacy'], ['new', '--json'], ['init', '--fastify'], ['init', '--all'], ['init', '--neon', '--d1']]) {
    const result = run(...args, '--json');
    assert.equal(result.status, 1, `${args} must fail`);
    assert.ok(JSON.parse(result.stderr).error);
    assert.deepEqual(readdirSync(root), [], 'invalid commands must not create files');
  }
  const diagnosis = run('doctor', '--json');
  assert.equal(diagnosis.status, 1);
  assert.equal(JSON.parse(diagnosis.stdout).productionReady, false);
  assert.deepEqual(readdirSync(root), [], 'doctor must not write');
  const target = path.join(root, 'planned');
  const result = run('new', target, '--hono', '--neon', '--dry-run', '--json');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).products, ['hono', 'neon']);
  assert.equal(existsSync(target), false);
  assert.match(run('--help').stdout, /OpenNext/);
  assert.doesNotMatch(run('--help').stdout, /--legacy|setup-vps|Fastify/);
  assert.match(run('--version').stdout, /^\d+\.\d+\.\d+\n$/);
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('Current CLI validation passed');

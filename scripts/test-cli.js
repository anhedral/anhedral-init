import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function runScript(scriptName) {
  const result = spawnSync('node', [path.join('scripts', scriptName)], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');

  assert.equal(result.status, 0, `${scriptName} failed\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
}

runScript('test-cli-validation.js');
runScript('test-command-builders.js');
runScript('test-util-lift-nested-project.js');
runScript('test-default-web-template.js');
runScript('test-cli-scaffold-headless.js');

console.log('All CLI tests passed');

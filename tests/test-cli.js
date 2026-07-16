import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function runScript(scriptName) {
  const result = spawnSync('node', [path.join('tests', scriptName)], {
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
runScript('test-json-stream-flush.js');
runScript('test-util-exec.js');
runScript('test-command-builders.js');
runScript('test-architecture-foundation.js');
runScript('test-conditional-app-templates.js');
runScript('test-billing-template.js');
runScript('test-operational-api-template.js');
runScript('test-api-production-env.js');
runScript('test-database-migration-gate.js');
runScript('test-generated-config-regression.js');
runScript('test-security-audit.js');
runScript('test-release-tooling.js');
runScript('test-module-topology-invariants.js');
runScript('test-public-api-and-render-safety.js');
runScript('test-output-tree-contracts.js');
runScript('test-safe-add.js');
runScript('test-transaction-rollback.js');
runScript('test-scaffold-transaction-recovery.js');

console.log('All CLI tests passed');

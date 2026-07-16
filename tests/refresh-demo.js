import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOutputTreeManifest,
  findGoldenTreeViolations,
  findNestedWorkspaceIslands,
} from './support/output-tree.js';
import { runScenario } from './support/scenario-runner.js';
import { getRefreshDemoScenario } from './support/scenarios.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const scenario = getRefreshDemoScenario();
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-demo-'));
let completed = false;

try {
  const projectRoot = runScenario({
    cliEntry,
    scenario,
    workspaceRoot: temporaryRoot,
    skipInstall: true,
    toolchainChannel: 'stable',
  });
  const manifest = createOutputTreeManifest(projectRoot, scenario);

  assert.deepEqual(findGoldenTreeViolations(manifest), [], 'temporary demo should be source-only');
  assert.deepEqual(
    findNestedWorkspaceIslands(projectRoot),
    [],
    'temporary demo should not contain nested pnpm workspace islands',
  );
  completed = true;

  console.log('');
  console.log(`Source-only demo generated outside the repository: ${projectRoot}`);
  console.log(`Output-tree digest: ${manifest.digest}`);
  console.log('Run pnpm install in that directory when you are ready to install dependencies.');
  console.log('The operating system may remove this temporary directory automatically.');
} finally {
  if (!completed) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

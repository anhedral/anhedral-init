import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOutputTreeManifest,
  findGoldenTreeViolations,
  findNestedWorkspaceIslands,
  stableManifestJson,
} from './support/output-tree.js';
import { renderOutputTreeContract } from './support/output-tree-docs.js';
import { runScenario } from './support/scenario-runner.js';
import { GOLDEN_TREE_SCENARIOS, OUTPUT_TREE_SCENARIOS } from './support/scenarios.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'output-trees');
const docsPath = path.join(repoRoot, 'docs', 'output-tree-contract.md');

function generateManifest(scenario) {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), `anhedral-contract-${scenario.id}-`));

  try {
    const projectRoot = runScenario({
      cliEntry,
      scenario,
      workspaceRoot,
      skipInstall: true,
      toolchainChannel: 'stable',
    });
    const manifest = createOutputTreeManifest(projectRoot, scenario);

    assert.deepEqual(
      findGoldenTreeViolations(manifest),
      [],
      `${scenario.id} contains runtime artifacts that cannot enter a golden tree`,
    );
    assert.deepEqual(
      findNestedWorkspaceIslands(projectRoot),
      [],
      `${scenario.id} contains a nested pnpm workspace island`,
    );
    return manifest;
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

const manifests = GOLDEN_TREE_SCENARIOS.map(generateManifest);
mkdirSync(fixtureRoot, { recursive: true });
mkdirSync(path.dirname(docsPath), { recursive: true });

for (const manifest of manifests) {
  writeFileSync(
    path.join(fixtureRoot, `${manifest.scenario}.json`),
    stableManifestJson(manifest),
  );
}

writeFileSync(docsPath, renderOutputTreeContract(OUTPUT_TREE_SCENARIOS, manifests));
console.log(`Updated ${manifests.length} output-tree contracts and ${path.relative(repoRoot, docsPath)}`);

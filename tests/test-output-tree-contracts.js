import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOutputTreeManifest,
  findGoldenTreeViolations,
  findNestedWorkspaceIslands,
} from './support/output-tree.js';
import { renderOutputTreeContract } from './support/output-tree-docs.js';
import { runScenario } from './support/scenario-runner.js';
import { GOLDEN_TREE_SCENARIOS, OUTPUT_TREE_SCENARIOS } from './support/scenarios.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'output-trees');
const docsPath = path.join(repoRoot, 'docs', 'output-tree-contract.md');

function hash(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function testManifestUtility() {
  const root = mkdtempSync(path.join(tmpdir(), 'anhedral-manifest-unit-'));
  const scenario = { id: 'unit', projectDirectory: 'unit' };

  try {
    mkdirSync(path.join(root, 'nested'));
    writeFileSync(path.join(root, 'z.txt'), 'z\n');
    writeFileSync(path.join(root, 'nested', 'a.txt'), 'a\n');
    chmodSync(path.join(root, 'z.txt'), 0o755);
    symlinkSync('nested/a.txt', path.join(root, 'a-link'));

    const first = createOutputTreeManifest(root, scenario);
    const second = createOutputTreeManifest(root, scenario);
    assert.deepEqual(first, second, 'unchanged trees should produce byte-stable manifests');
    assert.deepEqual(
      first.entries.map((entry) => entry.path),
      ['a-link', 'nested/a.txt', 'z.txt'],
      'manifest paths should be sorted deterministically',
    );
    assert.equal(first.entries.find((entry) => entry.path === 'nested/a.txt').sha256, hash('a\n'));
    assert.equal(first.entries.find((entry) => entry.path === 'z.txt').mode, '0755');
    assert.equal(first.entries.find((entry) => entry.path === 'a-link').sha256, hash('nested/a.txt'));

    writeFileSync(path.join(root, 'nested', 'a.txt'), 'changed\n');
    const changed = createOutputTreeManifest(root, scenario);
    assert.notEqual(changed.digest, first.digest, 'content changes should change the tree digest');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function generateManifest(scenario, label) {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), `anhedral-contract-${scenario.id}-${label}-`));

  try {
    const projectRoot = runScenario({
      cliEntry,
      scenario,
      workspaceRoot,
      skipInstall: true,
      toolchainChannel: 'stable',
      log: false,
    });
    const manifest = createOutputTreeManifest(projectRoot, scenario);

    assert.deepEqual(
      findGoldenTreeViolations(manifest),
      [],
      `${scenario.id} should contain only source/configuration output`,
    );
    assert.deepEqual(
      findNestedWorkspaceIslands(projectRoot),
      [],
      `${scenario.id} should contain no nested pnpm workspace islands`,
    );
    return manifest;
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

assert.deepEqual(
  findGoldenTreeViolations({ entries: [{ path: 'apps/extension/.env' }] }),
  ['apps/extension/.env: generated environment files must be examples only'],
  'golden trees must never normalize a generated credential-bearing environment file',
);

testManifestUtility();

const expectedManifests = [];
for (const scenario of GOLDEN_TREE_SCENARIOS) {
  const expectedPath = path.join(fixtureRoot, `${scenario.id}.json`);
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
  const first = generateManifest(scenario, 'first');
  const second = generateManifest(scenario, 'second');

  assert.deepEqual(first, second, `${scenario.id} should generate identically in separate temp directories`);
  assert.deepEqual(
    first,
    expected,
    `${scenario.id} output-tree contract changed; run node tests/update-output-tree-contracts.js after review`,
  );
  expectedManifests.push(expected);
}

assert.equal(
  readFileSync(docsPath, 'utf8'),
  renderOutputTreeContract(OUTPUT_TREE_SCENARIOS, expectedManifests),
  'docs/output-tree-contract.md is stale; run node tests/update-output-tree-contracts.js',
);

console.log(`Output-tree contracts passed: ${GOLDEN_TREE_SCENARIOS.length} repeatable scenarios`);

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MODULE_REGISTRY,
  MODULE_IDS,
  resolveModules,
} from '../dist/architecture/index.js';
import { runCommand } from './support/scenario-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const root = mkdtempSync(path.join(tmpdir(), 'anhedral-topologies-'));

function allRequestedSets() {
  return Array.from({ length: 2 ** MODULE_IDS.length }, (_, mask) =>
    MODULE_IDS.filter((_, index) => (mask & (1 << index)) !== 0));
}

function initialize(directory, modules) {
  runCommand(process.execPath, [cliEntry, 'init', ...modules, '--skip-install'], directory, { log: false });
  return JSON.parse(readFileSync(path.join(directory, 'anhedral.json'), 'utf8'));
}

function assertManagedEquivalent(direct, incremental, label) {
  const directManifest = JSON.parse(readFileSync(path.join(direct, 'anhedral.json'), 'utf8'));
  const incrementalManifest = JSON.parse(readFileSync(path.join(incremental, 'anhedral.json'), 'utf8'));
  assert.deepEqual(incrementalManifest.modules, directManifest.modules, `${label}: modules`);
  const directManaged = Object.entries(directManifest.files)
    .filter(([, record]) => record.ownership === 'managed')
    .map(([file]) => file)
    .sort();
  const incrementalManaged = Object.entries(incrementalManifest.files)
    .filter(([, record]) => record.ownership === 'managed')
    .map(([file]) => file)
    .sort();
  assert.deepEqual(incrementalManaged, directManaged, `${label}: managed path set`);
  for (const file of directManaged) {
    assert.deepEqual(
      readFileSync(path.join(incremental, file)),
      readFileSync(path.join(direct, file)),
      `${label}: managed file ${file}`,
    );
    assert.equal(
      statSync(path.join(incremental, file)).mode & 0o777,
      statSync(path.join(direct, file)).mode & 0o777,
      `${label}: managed mode ${file}`,
    );
  }
}

try {
  const closures = new Map();
  for (const requested of allRequestedSets()) {
    const resolution = resolveModules(requested);
    const canonicalClosure = MODULE_IDS.filter((moduleId) => resolution.resolvedModules.includes(moduleId));
    const closureKey = canonicalClosure.join(',');
    closures.set(closureKey, canonicalClosure);
    assert.deepEqual(
      new Set(resolveModules(resolution.resolvedModules).resolvedModules),
      new Set(resolution.resolvedModules),
    );
    for (const moduleId of resolution.resolvedModules) {
      for (const requirement of DEFAULT_MODULE_REGISTRY[moduleId].requires) {
        assert.ok(resolution.resolvedModules.includes(requirement), `${moduleId} closure must include ${requirement}`);
      }
    }
  }
  assert.equal(closures.size, 216, '2,048 requested subsets should collapse to 216 resolved topologies');

  for (const moduleId of MODULE_IDS) {
    const project = path.join(root, `single-${moduleId}`);
    runCommand(process.execPath, ['-e', "require('node:fs').mkdirSync(process.argv[1], { recursive: true })", project], root, { log: false });
    const manifest = initialize(project, [moduleId]);
    assert.deepEqual(manifest.modules, resolveModules([moduleId]).resolvedModules);
  }

  for (const [first, second] of [
    ['api', 'auth'],
    ['mobile', 'native-subscriptions'],
    ['web', 'extension'],
    ['desktop', 'electron-updater'],
    ['web', 'electron-updater'],
    ['api', 'native-subscriptions'],
  ]) {
    const direct = path.join(root, `direct-${first}-${second}`, 'project');
    const incremental = path.join(root, `incremental-${first}-${second}`, 'project');
    for (const directory of [direct, incremental]) {
      runCommand(process.execPath, ['-e', "require('node:fs').mkdirSync(process.argv[1], { recursive: true })", directory], root, { log: false });
    }
    initialize(direct, [first, second]);
    initialize(incremental, [first]);
    runCommand(process.execPath, [cliEntry, 'add', second, '--skip-install'], incremental, { log: false });
    assertManagedEquivalent(direct, incremental, `${first} + ${second} add-equivalence`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Module topology invariants passed: 2,048 requests, 216 closures, 11 singleton scaffolds, 6 add paths');

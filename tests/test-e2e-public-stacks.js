import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import { findNestedWorkspaceIslands } from './support/output-tree.js';
import { runCommand, runScenario } from './support/scenario-runner.js';
import { OUTPUT_TREE_SCENARIOS } from './support/scenarios.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const TOOLCHAIN_CHANNELS = new Set(['stable', 'latest']);
const manifestKeys = ['files', 'generatorVersion', 'modules', 'project', 'schemaVersion', 'toolchain'];

function resolveToolchainChannel(rawArgs) {
  const args = [...rawArgs];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--toolchain') {
      const value = args[index + 1];

      if (!value || !TOOLCHAIN_CHANNELS.has(value)) {
        throw new Error('--toolchain must be one of: stable, latest');
      }

      return value;
    }

    if (arg.startsWith('--toolchain=')) {
      const value = arg.slice('--toolchain='.length);

      if (!TOOLCHAIN_CHANNELS.has(value)) {
        throw new Error('--toolchain must be one of: stable, latest');
      }

      return value;
    }
  }

  return process.env.ANHEDRAL_TOOLCHAIN ?? 'stable';
}

const toolchainChannel = resolveToolchainChannel(argv.slice(2));

function assertGitignoreContains(projectRoot, relativePath, expectedLines) {
  const filePath = path.join(projectRoot, relativePath);
  const contents = readFileSync(filePath, 'utf8');

  for (const line of expectedLines) {
    assert.match(contents, new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `${relativePath} should include ${line}`);
  }
}

function assertNoNestedGit(projectRoot, apps) {
  assert.equal(existsSync(path.join(projectRoot, 'apps')), true, 'generated project should create an apps/ directory');

  for (const appName of Object.keys(apps).filter((appName) => apps[appName])) {
    assert.equal(
      existsSync(path.join(projectRoot, 'apps', appName, '.git')),
      false,
      `apps/${appName} should not contain a nested .git directory`,
    );
  }
}

function assertProjectManifest(projectRoot, scenario) {
  const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'anhedral.json'), 'utf8'));

  assert.equal(manifest.schemaVersion, 3);
  assert.deepEqual(Object.keys(manifest).sort(), manifestKeys);
  assert.deepEqual(manifest.modules, scenario.modules);
  assert.equal(manifest.toolchain, toolchainChannel);
  assert.equal(typeof manifest.generatorVersion, 'string');
  assert.ok(manifest.generatorVersion.length > 0);
  assert.equal(typeof manifest.files, 'object');
  assert.ok(Object.keys(manifest.files).length > 0);
}

function representativeFile(directory, relativeDirectory = '') {
  const absoluteDirectory = path.join(directory, relativeDirectory);
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === 'cache') continue;
    const relative = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      const nested = representativeFile(directory, relative);
      if (nested) return nested;
    } else if (entry.isFile()) {
      return relative;
    }
  }
  return null;
}

function assertTurboRestoresOutputs(projectRoot) {
  const outputDirectories = [
    'apps/web/.next',
    'apps/mobile/dist',
    'apps/desktop/dist',
    'apps/extension/.output',
  ];
  const representatives = outputDirectories.map((relativeDirectory) => {
    assert.equal(existsSync(path.join(projectRoot, relativeDirectory)), true, `initial build should emit ${relativeDirectory}`);
    const file = representativeFile(path.join(projectRoot, relativeDirectory));
    assert.ok(file, `${relativeDirectory} should contain a representative build artifact`);
    return {
      outputDirectory: relativeDirectory,
      file,
      contents: readFileSync(path.join(projectRoot, relativeDirectory, file)),
    };
  });

  for (const { outputDirectory } of representatives) {
    rmSync(path.join(projectRoot, outputDirectory), { recursive: true, force: true });
  }

  const restored = runCommand('pnpm', ['build'], projectRoot);
  assert.match(`${restored.stdout}\n${restored.stderr}`, /cache hit/i, 'second build should report Turbo cache hits');
  for (const representative of representatives) {
    const restoredPath = path.join(projectRoot, representative.outputDirectory, representative.file);
    assert.equal(existsSync(restoredPath), true, `Turbo should restore ${representative.outputDirectory}/${representative.file}`);
    assert.deepEqual(readFileSync(restoredPath), representative.contents, `restored artifact should be byte-identical: ${representative.file}`);
  }
}

const e2eRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-e2e-'));
const keepOutput = process.env.ANHEDRAL_E2E_KEEP === '1';

console.log(`Executing public stack e2e verification in ${e2eRoot} with toolchain: ${toolchainChannel}`);

try {
  for (const scenario of OUTPUT_TREE_SCENARIOS) {
    console.log(`\n=== Verifying ${scenario.id} ===`);
    const projectRoot = runScenario({
      cliEntry,
      scenario,
      workspaceRoot: e2eRoot,
      toolchainChannel,
    });

    for (const [relativePath, expectedLines] of scenario.gitignoreExpectations) {
      assertGitignoreContains(projectRoot, relativePath, expectedLines);
    }
    assertNoNestedGit(projectRoot, scenario.apps);
    assertProjectManifest(projectRoot, scenario);
    assert.deepEqual(
      findNestedWorkspaceIslands(projectRoot),
      [],
      `${scenario.id} should have only the root pnpm lockfile, workspace, and package store`,
    );

    if (scenario.features.database) {
      runCommand('pnpm', ['db:generate'], projectRoot, { toolchainChannel });
      runCommand('git', ['init', '--quiet'], projectRoot, { toolchainChannel });
      runCommand('git', ['add', '--', 'packages/db/migrations'], projectRoot, { toolchainChannel });
    }

    for (const [command, args] of scenario.e2eChecks) {
      runCommand(command, args, projectRoot, { toolchainChannel });
    }

    if (scenario.id === 'expo-extension') {
      assertTurboRestoresOutputs(projectRoot);
    }

    if (scenario.apps.desktop) {
      const preload = path.join(projectRoot, 'apps/desktop/dist/main/preload.cjs');
      assert.equal(existsSync(preload), true, 'desktop build must emit a sandbox-compatible CommonJS preload');
      assert.match(readFileSync(preload, 'utf8'), /require\(["']electron["']\)/);
      assert.equal(existsSync(path.join(projectRoot, 'apps/desktop/dist/main/preload.js')), false);
    }

    if (scenario.auditLock) {
      runCommand('node', [path.join(repoRoot, 'scripts', 'audit-osv.mjs'), 'pnpm-lock.yaml'], projectRoot, {
        toolchainChannel,
      });
    }
  }

  console.log(`Public stack e2e verification passed: ${OUTPUT_TREE_SCENARIOS.length} stacks (${toolchainChannel})`);
} finally {
  if (keepOutput) {
    console.log(`ANHEDRAL_E2E_KEEP=1; retained E2E output at ${e2eRoot}`);
  } else {
    rmSync(e2eRoot, { recursive: true, force: true });
  }
}

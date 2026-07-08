import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'index.js');
const demoRoot = path.join(repoRoot, 'demo');
const TOOLCHAIN_CHANNELS = new Set(['stable', 'latest']);

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

function run(command, args, cwd) {
  console.log(`Running in ${cwd}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ANHEDRAL_TOOLCHAIN: toolchainChannel,
    },
  });

  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed in ${cwd}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
}

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

function assertStackManifest(projectRoot, scenario) {
  const stack = JSON.parse(readFileSync(path.join(projectRoot, 'stack.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'anhedral.json'), 'utf8'));
  const toolchain = stack.outputs.toolchain;

  assert.equal(stack.mode, 'modular');
  assert.deepEqual(stack.apps, scenario.apps);
  assert.deepEqual(stack.features, scenario.features);
  assert.deepEqual(manifest.apps, stack.apps);
  assert.deepEqual(manifest.features, stack.features);

  assert.equal('reactNativeReusables' in toolchain, true);
  assert.equal('wxt' in toolchain, true);
  assert.equal('shadcn' in toolchain, true);
  assert.equal('tauriCli' in toolchain, false);
  assert.equal('tauriApi' in toolchain, false);
  assert.equal('viteCreate' in toolchain, false);
}

rmSync(demoRoot, { recursive: true, force: true });
mkdirSync(demoRoot, { recursive: true });

console.log(`Executing public stack e2e verification in ${demoRoot} with toolchain: ${toolchainChannel}`);
const scenarios = [
  {
    name: 'expo-extension',
    args: [],
    folderName: 'expo-extension-sample',
    apps: {
      web: true,
      mobile: true,
      api: true,
      desktop: true,
      extension: true,
    },
    features: {
      database: true,
      auth: true,
      billing: true,
      storage: true,
      nativeSubscriptions: true,
    },
    gitignores: [
      ['.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/mobile/.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/api/.gitignore', ['.env', '.env.*', '!.env.example']],
    ],
    checks: [
      ['pnpm', ['verify']],
      ['pnpm', ['build']],
    ],
  },
  {
    name: 'web-api-minimal',
    args: ['--web', '--api', '--db', '--auth'],
    folderName: 'web-api-minimal',
    apps: {
      web: true,
      mobile: false,
      api: true,
      desktop: false,
      extension: false,
    },
    features: {
      database: true,
      auth: true,
      billing: false,
      storage: false,
      nativeSubscriptions: false,
    },
    gitignores: [
      ['.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/api/.gitignore', ['.env', '.env.*', '!.env.example']],
    ],
    checks: [
      ['pnpm', ['verify']],
      ['pnpm', ['build']],
    ],
  },
  {
    name: 'api-only',
    args: ['--api', '--db', '--auth'],
    folderName: 'api-only',
    apps: {
      web: false,
      mobile: false,
      api: true,
      desktop: false,
      extension: false,
    },
    features: {
      database: true,
      auth: true,
      billing: false,
      storage: false,
      nativeSubscriptions: false,
    },
    gitignores: [
      ['.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/api/.gitignore', ['.env', '.env.*', '!.env.example']],
    ],
    checks: [
      ['pnpm', ['verify']],
      ['pnpm', ['build']],
    ],
  },
  {
    name: 'add-desktop-flow',
    args: ['--api', '--db', '--auth', '--skip-install'],
    addArgs: ['desktop', '--skip-install'],
    folderName: 'add-desktop-flow',
    apps: {
      web: false,
      mobile: false,
      api: true,
      desktop: true,
      extension: false,
    },
    features: {
      database: true,
      auth: true,
      billing: false,
      storage: false,
      nativeSubscriptions: false,
    },
    gitignores: [
      ['.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/api/.gitignore', ['.env', '.env.*', '!.env.example']],
    ],
    checks: [],
  },
];

for (const scenario of scenarios) {
  console.log(`\n=== Verifying ${scenario.name} ===`);
  const projectRoot = path.join(demoRoot, scenario.folderName);
  rmSync(projectRoot, { recursive: true, force: true });
  mkdirSync(projectRoot, { recursive: true });
  run('node', [cliEntry, 'init', ...scenario.args], projectRoot);
  if (scenario.addArgs) {
    run('node', [cliEntry, 'add', ...scenario.addArgs], projectRoot);
  }

  for (const [relativePath, expectedLines] of scenario.gitignores) {
    assertGitignoreContains(projectRoot, relativePath, expectedLines);
  }
  assertNoNestedGit(projectRoot, scenario.apps);
  assertStackManifest(projectRoot, scenario);

  for (const [command, args] of scenario.checks) {
    run(command, args, projectRoot);
  }
}

console.log(`Public stack e2e verification passed: ${scenarios.length} stacks (${toolchainChannel})`);

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

function assertNoNestedGit(projectRoot) {
  for (const appName of ['web', 'mobile', 'api', 'extension']) {
    assert.equal(
      existsSync(path.join(projectRoot, 'apps', appName, '.git')),
      false,
      `apps/${appName} should not contain a nested .git directory`,
    );
  }
}

function assertStackManifest(projectRoot, scenario) {
  const stack = JSON.parse(readFileSync(path.join(projectRoot, 'stack.json'), 'utf8'));
  const toolchain = stack.outputs.toolchain;

  assert.equal(stack.mode, 'fullstack');
  assert.equal(stack.frontend, scenario.frontend);
  assert.equal(stack.extension, scenario.extension ? 'wxt_chrome_extension' : null);
  assert.equal(stack.backend, 'fastify');

  assert.equal('reactNativeReusables' in toolchain, scenario.frontend === 'expo_react_native_reusables');
  assert.equal('wxt' in toolchain, scenario.extension);
  assert.equal('shadcn' in toolchain, scenario.frontend === 'nextjs_shadcn' || scenario.extension);
  assert.equal('tauriCli' in toolchain, false);
  assert.equal('tauriApi' in toolchain, false);
  assert.equal('viteCreate' in toolchain, false);
}

rmSync(demoRoot, { recursive: true, force: true });
mkdirSync(demoRoot, { recursive: true });

console.log(`Executing public stack e2e verification in ${demoRoot} with toolchain: ${toolchainChannel}`);
const scenarios = [
  {
    name: 'default-expo',
    args: [],
    folderName: 'expo-sample',
    frontend: 'expo_react_native_reusables',
    extension: false,
    gitignores: [
      ['.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/mobile/.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/api/.gitignore', ['.env', '.env.*', '!.env.example']],
    ],
    checks: [
      ['pnpm', ['--filter', './apps/mobile', 'typecheck']],
      ['pnpm', ['--filter', './apps/api', 'typecheck']],
      ['pnpm', ['--filter', './apps/api', 'test']],
      ['pnpm', ['build']],
    ],
  },
  {
    name: 'next',
    args: ['--next'],
    folderName: 'next-sample',
    frontend: 'nextjs_shadcn',
    extension: false,
    gitignores: [
      ['.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/web/.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/api/.gitignore', ['.env', '.env.*', '!.env.example']],
    ],
    checks: [
      ['pnpm', ['--filter', './apps/web', 'typecheck']],
      ['pnpm', ['--filter', './apps/api', 'typecheck']],
      ['pnpm', ['--filter', './apps/api', 'test']],
      ['pnpm', ['build']],
    ],
  },
  {
    name: 'expo-extension',
    args: ['--extension'],
    folderName: 'expo-extension-sample',
    frontend: 'expo_react_native_reusables',
    extension: true,
    gitignores: [
      ['.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/mobile/.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/api/.gitignore', ['.env', '.env.*', '!.env.example']],
    ],
    checks: [
      ['pnpm', ['--filter', './apps/extension', 'typecheck']],
      ['pnpm', ['--filter', './apps/extension', 'build']],
      ['pnpm', ['build']],
    ],
  },
  {
    name: 'next-extension',
    args: ['--next', '--extension'],
    folderName: 'next-extension-sample',
    frontend: 'nextjs_shadcn',
    extension: true,
    gitignores: [
      ['.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/web/.gitignore', ['.env', '.env.*', '!.env.example']],
      ['apps/api/.gitignore', ['.env', '.env.*', '!.env.example']],
    ],
    checks: [
      ['pnpm', ['--filter', './apps/extension', 'typecheck']],
      ['pnpm', ['--filter', './apps/extension', 'build']],
      ['pnpm', ['build']],
    ],
  },
];

for (const scenario of scenarios) {
  console.log(`\n=== Verifying ${scenario.name} ===`);
  const projectRoot = path.join(demoRoot, scenario.folderName);
  rmSync(projectRoot, { recursive: true, force: true });
  mkdirSync(projectRoot, { recursive: true });
  run('node', [cliEntry, 'init', ...scenario.args], projectRoot);

  for (const [relativePath, expectedLines] of scenario.gitignores) {
    assertGitignoreContains(projectRoot, relativePath, expectedLines);
  }
  assertNoNestedGit(projectRoot);
  assertStackManifest(projectRoot, scenario);

  for (const [command, args] of scenario.checks) {
    run(command, args, projectRoot);
  }
}

console.log(`Public stack e2e verification passed: ${scenarios.length} stacks (${toolchainChannel})`);

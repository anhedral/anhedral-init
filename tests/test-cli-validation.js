import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'index.js');
const {
  USAGE,
  buildAddOptions,
  buildOptions,
  normalizeModuleName,
  parseCli,
} = await import(path.join(repoRoot, 'dist', 'cli.js'));
const usageLine = USAGE.trim().split('\n')[0];

function runCli(args) {
  return spawnSync('node', [cliEntry, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

const cases = [
  {
    name: 'prints usage on help',
    args: ['--help'],
    expectedExit: 0,
    stdoutIncludes: usageLine,
  },
  {
    name: 'prints usage on init help',
    args: ['init', '--help'],
    expectedExit: 0,
    stdoutIncludes: usageLine,
  },
  {
    name: 'fails unknown command',
    args: ['whoops'],
    expectedExit: 1,
    stderrIncludes: 'Unknown command: whoops',
  },
  {
    name: 'rejects unexpected positional arguments',
    args: ['init', 'demo'],
    expectedExit: 1,
    stderrIncludes: 'Unexpected argument: demo. Use module flags, --toolchain, or --skip-install',
  },
  {
    name: 'defaults stack before validating toolchain',
    args: ['init', '--toolchain', 'preview'],
    expectedExit: 1,
    stderrIncludes: '--toolchain must be one of: latest, stable',
  },
  {
    name: 'accepts desktop module flag',
    args: ['init', '--desktop', '--skip-install'],
    expectedExit: 1,
    stderrIncludes: 'Current directory is not empty.',
  },
  {
    name: 'accepts extension module flag',
    args: ['init', '--extension', '--skip-install'],
    expectedExit: 1,
    stderrIncludes: 'Current directory is not empty.',
  },
  {
    name: 'rejects unknown module flags',
    args: ['init', '--next'],
    expectedExit: 1,
    stderrIncludes: 'Unknown flag: --next',
  },
  {
    name: 'rejects old template flag',
    args: ['init', '--template', 'next', '--skip-install'],
    expectedExit: 1,
    stderrIncludes: 'Unknown flag: --template',
  },
  {
    name: 'rejects template positional value',
    args: ['init', '--template=next'],
    expectedExit: 1,
    stderrIncludes: 'Unknown flag: --template=next',
  },
  {
    name: 'rejects invalid toolchain values',
    args: ['init', '--toolchain', 'preview'],
    expectedExit: 1,
    stderrIncludes: '--toolchain must be one of: latest, stable',
  },
];

for (const testCase of cases) {
  const result = runCli(testCase.args);
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');

  assert.equal(result.status, testCase.expectedExit, `${testCase.name}: unexpected exit status\nstdout:\n${stdout}\nstderr:\n${stderr}`);

  if (testCase.stdoutIncludes) {
    assert.match(stdout, new RegExp(testCase.stdoutIncludes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${testCase.name}: stdout did not include expected text`);
  }

  if (testCase.stderrIncludes) {
    assert.match(stderr, new RegExp(testCase.stderrIncludes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${testCase.name}: stderr did not include expected text`);
  }
}

const defaultFlags = parseCli([]);
assert.equal(buildOptions(defaultFlags).payments, 'revenuecat_stripe', 'buildOptions should use RevenueCat + Stripe');
assert.equal(buildOptions(defaultFlags).skipInstall, false, 'buildOptions should install dependencies by default');
assert.equal(buildOptions(parseCli(['--skip-install'])).skipInstall, true, '--skip-install should disable dependency installs');
assert.equal(
  buildOptions(parseCli(['--toolchain', 'stable'])).api,
  'fastify',
  'toolchain flags should not require an explicit stack',
);
assert.equal(buildOptions(parseCli(['--toolchain=stable'])).api, 'fastify', 'toolchain assignment flags should be accepted');

const minimalOptions = buildOptions(parseCli(['--web', '--api', '--db', '--auth']));
assert.deepEqual(minimalOptions.apps, {
  web: true,
  mobile: false,
  api: true,
  desktop: false,
  extension: false,
});
assert.deepEqual(minimalOptions.features, {
  database: true,
  auth: true,
  billing: false,
  storage: false,
  nativeSubscriptions: false,
});

assert.equal(normalizeModuleName('database'), 'db');
assert.equal(normalizeModuleName('chrome-extension'), 'extension');
assert.equal(normalizeModuleName('native-billing'), 'native-subscriptions');
assert.deepEqual(
  buildAddOptions(['mobile', 'chrome-extension', 'mobile'], parseCli(['--skip-install'])).modules,
  ['mobile', 'extension'],
);

console.log(`Validation tests passed: ${cases.length}`);

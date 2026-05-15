import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'index.js');
const {
  USAGE,
  buildOptions,
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
    stderrIncludes: 'Unexpected argument: demo. Use flags: --toolchain, --skip-install',
  },
  {
    name: 'defaults stack before validating toolchain',
    args: ['init', '--toolchain', 'preview'],
    expectedExit: 1,
    stderrIncludes: '--toolchain must be one of: latest, stable',
  },
  {
    name: 'rejects unknown flags',
    args: ['init', '--desktop'],
    expectedExit: 1,
    stderrIncludes: 'Unknown flag: --desktop',
  },
  {
    name: 'rejects old next stack flag',
    args: ['init', '--next'],
    expectedExit: 1,
    stderrIncludes: 'Unknown flag: --next',
  },
  {
    name: 'rejects old extension stack flag',
    args: ['init', '--extension'],
    expectedExit: 1,
    stderrIncludes: 'Unknown flag: --extension',
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

console.log(`Validation tests passed: ${cases.length}`);

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const packageVersion = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
const {
  USAGE,
  buildAddOptions,
  buildOptions,
  deriveProjectName,
  normalizeModuleName,
  parseCli,
} = await import(pathToFileURL(path.join(repoRoot, 'dist', 'cli.js')).href);
const { assertPackageName, childPackageName } = await import(
  pathToFileURL(path.join(repoRoot, 'dist', 'render.js')).href
);
const {
  DEFAULT_PROMPT_APP_MODULES,
  DEFAULT_PROMPT_FEATURE_MODULES,
  shouldPromptForInitModules,
} = await import(pathToFileURL(path.join(repoRoot, 'dist', 'prompts.js')).href);
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
    name: 'prints generator version',
    args: ['--version'],
    expectedExit: 0,
    stdoutIncludes: packageVersion,
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
    stderrIncludes: 'Unexpected argument: demo. Use module names, module flags, --toolchain, or --skip-install',
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

const unknownJson = runCli(['whoops', '--json']);
assert.equal(unknownJson.status, 1);
assert.equal(unknownJson.stdout, '', 'unknown-command JSON errors must not print usage to stdout');
assert.deepEqual(JSON.parse(String(unknownJson.stderr).trim()), {
  error: 'Unknown command: whoops',
  code: 'UNKNOWN_COMMAND',
});

const invalidJson = runCli(['init', '--not-a-real-option', '--json']);
assert.equal(invalidJson.status, 1);
assert.deepEqual(JSON.parse(String(invalidJson.stderr).trim()), {
  error: 'Unknown flag: --not-a-real-option',
  code: 'INVALID_ARGUMENT',
});

const helpJson = runCli(['init', '--help', '--json']);
assert.equal(helpJson.status, 0);
assert.equal(JSON.parse(String(helpJson.stdout).trim()).usage, USAGE);
assert.equal(helpJson.stderr, '');

const versionJson = runCli(['--version', '--json']);
assert.equal(versionJson.status, 0);
assert.deepEqual(JSON.parse(String(versionJson.stdout).trim()), { version: packageVersion });
assert.equal(versionJson.stderr, '');

if (process.platform !== 'win32') {
  const failureRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-json-install-failure-'));
  try {
    const fakeBin = path.join(failureRoot, 'bin');
    const project = path.join(failureRoot, 'project');
    mkdirSync(fakeBin);
    mkdirSync(project);
    const fakePnpm = path.join(fakeBin, 'pnpm');
    writeFileSync(fakePnpm, '#!/bin/sh\necho fake-child-stdout\necho fake-child-stderr >&2\nexit 7\n');
    chmodSync(fakePnpm, 0o755);
    const failed = spawnSync('node', [cliEntry, 'init', '--api', '--json'], {
      cwd: project,
      encoding: 'utf8',
      env: {
        ...process.env,
        ANHEDRAL_VERBOSE: '1',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, '', 'JSON failures must not be preceded by child stdout');
    const errorDocument = JSON.parse(String(failed.stderr).trim());
    assert.equal(errorDocument.code, 'POST_COMMIT_FAILED');
    assert.match(errorDocument.error, /Changes were committed successfully/);
    assert.match(errorDocument.error, /Command failed \(exit 7\): pnpm install/);
    assert.equal(existsSync(path.join(project, 'anhedral.json')), true, 'post-commit failures must retain generated files');
    assert.doesNotMatch(String(failed.stderr), /fake-child/);
  } finally {
    rmSync(failureRoot, { recursive: true, force: true });
  }
}

const defaultFlags = parseCli([]);
assert.equal(buildOptions(defaultFlags).skipInstall, false, 'buildOptions should install dependencies by default');
assert.equal(buildOptions(parseCli(['--skip-install'])).skipInstall, true, '--skip-install should disable dependency installs');
assert.equal(parseCli(['--verbose']).verbose, true, '--verbose should be accepted as a first-class CLI flag');
assert.equal(
  buildOptions(parseCli(['--toolchain', 'stable'])).toolchainChannel,
  'stable',
  'toolchain flags should not require explicit modules',
);
assert.equal(
  buildOptions(parseCli(['--toolchain=stable'])).toolchainChannel,
  'stable',
  'toolchain assignment flags should be accepted',
);
assert.deepEqual([...parseCli(['web', 'api']).modules], ['web', 'api'], 'init should accept positional modules');

for (const [directoryName, expected] of [
  ['...Hidden Project', 'hidden-project'],
  ['Crème 🚀', 'creme'],
  ['node_modules', 'anhedral-node_modules'],
  ['favicon.ico', 'anhedral-favicon.ico'],
  ['💫', 'anhedral-app'],
]) {
  const derived = deriveProjectName(path.join('workspace', directoryName));
  assert.equal(derived, expected);
  assert.equal(assertPackageName(derived), derived);
}
const longDerivedName = deriveProjectName(path.join('workspace', `_${'a'.repeat(240)}_`));
assert.ok(longDerivedName.length <= 214);
assert.equal(assertPackageName(longDerivedName), longDerivedName);
const longChildName = childPackageName('a'.repeat(214), 'desktop');
assert.ok(longChildName.length <= 214);
assert.equal(assertPackageName(longChildName), longChildName);
assert.throws(() => assertPackageName('node_modules'), /Invalid package name/);

const minimalOptions = buildOptions(parseCli(['--web', '--api', '--db', '--auth']));
assert.deepEqual(minimalOptions.modules, ['web', 'api', 'db', 'auth']);

assert.deepEqual(
  buildAddOptions(['mobile', 'extension', 'mobile'], parseCli(['--skip-install'])).modules,
  ['mobile', 'extension'],
);
assert.deepEqual([...DEFAULT_PROMPT_APP_MODULES, ...DEFAULT_PROMPT_FEATURE_MODULES], [
  'web', 'mobile', 'api', 'desktop', 'extension',
  'db', 'auth', 'billing', 'storage', 'native-subscriptions',
]);
assert.equal(shouldPromptForInitModules([], true), true);
assert.equal(shouldPromptForInitModules(['--json'], true), false, '--json must never open interactive prompts');
assert.equal(shouldPromptForInitModules(['--web'], true), false);
assert.equal(shouldPromptForInitModules([], false), false);
assert.deepEqual(
  buildAddOptions(['billing'], parseCli(['--skip-install'])).modules,
  ['billing'],
  'add should preserve explicit intent instead of storing the dependency closure',
);

console.log(`Validation tests passed: ${cases.length}`);

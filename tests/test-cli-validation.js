import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  buildOptionsForRoot,
  deriveProjectName,
  normalizeModuleName,
  parseCli,
  parseNewProjectRequest,
} = await import(pathToFileURL(path.join(repoRoot, 'dist', 'cli.js')).href);
const { assertPackageName, childPackageName } = await import(
  pathToFileURL(path.join(repoRoot, 'dist', 'render.js')).href
);
const {
  DEFAULT_PROMPT_APP_MODULES,
  DEFAULT_PROMPT_FEATURE_MODULES,
  parsePromptConfirmation,
  parsePromptModuleSelection,
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
    name: 'requires a destination for new',
    args: ['new'],
    expectedExit: 1,
    stderrIncludes: 'anhedral new requires a destination directory before module flags',
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
    name: 'rejects ignored Git options on add',
    args: ['add', 'desktop', '--no-git'],
    expectedExit: 1,
    stderrIncludes: 'Git initialization options are only supported by anhedral new and anhedral init',
  },
  {
    name: 'routes UI additions to the UI command',
    args: ['add', 'desktop', '--ui=dialog'],
    expectedExit: 1,
    stderrIncludes: 'Use anhedral ui add <component...> to add UI components',
  },
  {
    name: 'routes separated UI additions to the UI command',
    args: ['add', 'desktop', '--ui', 'dialog'],
    expectedExit: 1,
    stderrIncludes: 'Use anhedral ui add <component...> to add UI components',
  },
  {
    name: 'rejects native styling changes on add',
    args: ['add', 'mobile', '--native-styling=uniwind'],
    expectedExit: 1,
    stderrIncludes: '--native-styling is only supported while creating a project',
  },
  {
    name: 'rejects separated native styling changes on add',
    args: ['add', 'mobile', '--native-styling', 'uniwind'],
    expectedExit: 1,
    stderrIncludes: '--native-styling is only supported while creating a project',
  },
  {
    name: 'rejects contradictory Git options',
    args: ['init', '--web', '--git', '--no-git'],
    expectedExit: 1,
    stderrIncludes: 'Conflicting values for --git/--no-git',
  },
  {
    name: 'rejects contradictory toolchain options',
    args: ['init', '--web', '--toolchain=stable', '--toolchain=latest'],
    expectedExit: 1,
    stderrIncludes: 'Conflicting values for --toolchain',
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

const newRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-new-command-'));
const newProject = path.join(newRoot, 'readable-stack');
try {
  const created = runCli(['new', newProject, '--web', '--api', '--db', '--auth', '--skip-install', '--json']);
  assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);
  assert.equal(created.stderr, '');
  const createdPlan = JSON.parse(created.stdout);
  assert.deepEqual(createdPlan.nextSteps, ['pnpm install', 'pnpm first-run', 'pnpm ready']);
  assert.equal(createdPlan.rootDirectory, newProject);
  assert.equal(existsSync(path.join(newProject, 'apps/web/app/page.tsx')), true);
  assert.equal(existsSync(path.join(newProject, 'apps/api/src/application.ts')), true);
  assert.equal(existsSync(path.join(newProject, 'apps/web/components/item-list.tsx')), true);
  const starterApiRoute = readFileSync(path.join(newProject, 'apps/api/src/routes/app.ts'), 'utf8');
  assert.match(starterApiRoute, /app\.post\('\/items'/);
  assert.match(starterApiRoute, /authenticatedUserId\(request, env\)/);
  assert.match(starterApiRoute, /\.where\(eq\(items\.userId, userId\)\)/);
  assert.match(readFileSync(path.join(newProject, 'packages/db/src/app-schema.ts'), 'utf8'), /userId: text\('user_id'\)\.notNull\(\)/);
  assert.match(readFileSync(path.join(newProject, 'apps/web/components/item-list.tsx'), 'utf8'), /Sign in to use the working starter feature/);
  assert.match(readFileSync(path.join(newProject, 'packages/api-client/src/app.ts'), 'utf8'), /export function createItem/);
  assert.match(readFileSync(path.join(newProject, 'packages/contracts/src/app.ts'), 'utf8'), /CreateItemRequestSchema/);
  assert.equal(existsSync(path.join(newProject, 'scripts/first-run.mjs')), true);
  assert.equal(existsSync(path.join(newProject, '.git')), true, '`new` should initialize Git by default');
  assert.equal(existsSync(path.join(newProject, 'docs/DEVELOPMENT.md')), true);
  assert.equal(existsSync(path.join(newProject, 'docs/STACK.md')), true);
  assert.match(readFileSync(path.join(newProject, 'README.md'), 'utf8'), /There is no hidden Anhedral application runtime/);
  assert.match(readFileSync(path.join(newProject, 'SKILL.md'), 'utf8'), /standard TypeScript monorepo assembled by Anhedral/);
  assert.match(readFileSync(path.join(newProject, 'SKILL.md'), 'utf8'), /Agent-assisted provisioning/);
  assert.match(readFileSync(path.join(newProject, 'SKILL.md'), 'utf8'), /Computer Use\/browser control and subagents/);
  assert.match(readFileSync(path.join(newProject, 'SKILL.md'), 'utf8'), /stop before the final button/i);
  const missingReady = spawnSync('node', ['scripts/first-run.mjs', '--check', '--json'], {
    cwd: newProject,
    encoding: 'utf8',
  });
  assert.equal(missingReady.status, 1, missingReady.stderr);
  assert.ok(JSON.parse(missingReady.stdout).missing.includes('packages/db/.env'));
  const firstRun = spawnSync('node', ['scripts/first-run.mjs'], { cwd: newProject, encoding: 'utf8' });
  assert.equal(firstRun.status, 0, firstRun.stderr);
  assert.match(firstRun.stdout, /created packages\/db\/\.env/);
  const repeatedFirstRun = spawnSync('node', ['scripts/first-run.mjs'], { cwd: newProject, encoding: 'utf8' });
  assert.equal(repeatedFirstRun.status, 0, repeatedFirstRun.stderr);
  assert.match(repeatedFirstRun.stdout, /kept    packages\/db\/\.env/);
  const blockedReady = spawnSync('node', ['scripts/first-run.mjs', '--check', '--json'], {
    cwd: newProject,
    encoding: 'utf8',
  });
  assert.equal(blockedReady.status, 1, blockedReady.stderr);
  const blockedReadyReport = JSON.parse(blockedReady.stdout);
  assert.equal(blockedReadyReport.operation, 'ready');
  assert.equal(blockedReadyReport.ok, false);
  assert.deepEqual(blockedReadyReport.missing, []);
  assert.ok(blockedReadyReport.unresolved.includes('packages/db/.env: DATABASE_URL'));
  assert.ok(blockedReadyReport.unresolved.includes('apps/api/.env: CLERK_SECRET_KEY'));
  const databaseEnvironmentPath = path.join(newProject, 'packages/db/.env');
  writeFileSync(
    databaseEnvironmentPath,
    readFileSync(databaseEnvironmentPath, 'utf8').replace(/^DATABASE_URL=.*\n?/m, ''),
  );
  const deletedVariableReady = spawnSync('node', ['scripts/first-run.mjs', '--check', '--json'], {
    cwd: newProject,
    encoding: 'utf8',
  });
  assert.equal(deletedVariableReady.status, 1, deletedVariableReady.stderr);
  assert.ok(
    JSON.parse(deletedVariableReady.stdout).unresolved.includes('packages/db/.env: DATABASE_URL'),
    'readiness must report required variables that were deleted from an existing environment file',
  );
  const humanProject = path.join(newRoot, 'human-readable-next-step');
  const humanCreated = runCli(['new', humanProject, '--web', '--skip-install']);
  assert.equal(humanCreated.status, 0, `${humanCreated.stdout}\n${humanCreated.stderr}`);
  assert.match(humanCreated.stdout, /pnpm first-run/);
  assert.match(humanCreated.stdout, /pnpm ready/);
  assert.match(humanCreated.stdout, /Then follow README\.md for verification, development, and deployment\./);
  assert.doesNotMatch(humanCreated.stdout, /&& pnpm dev/);
  const firstRunWeb = spawnSync('node', ['scripts/first-run.mjs'], { cwd: humanProject, encoding: 'utf8' });
  assert.equal(firstRunWeb.status, 0, firstRunWeb.stderr);
  const readyWeb = spawnSync('node', ['scripts/first-run.mjs', '--check', '--json'], {
    cwd: humanProject,
    encoding: 'utf8',
  });
  assert.equal(readyWeb.status, 0, readyWeb.stderr);
  assert.equal(JSON.parse(readyWeb.stdout).ok, true);
  const extensionProject = path.join(newRoot, 'optional-extension-config');
  const extensionCreated = runCli([
    'new',
    extensionProject,
    '--extension',
    '--skip-install',
    '--no-git',
    '--json',
  ]);
  assert.equal(extensionCreated.status, 0, extensionCreated.stderr);
  assert.equal(spawnSync('node', ['scripts/first-run.mjs'], {
    cwd: extensionProject,
    encoding: 'utf8',
  }).status, 0);
  const extensionReady = spawnSync('node', ['scripts/first-run.mjs', '--check', '--json'], {
    cwd: extensionProject,
    encoding: 'utf8',
  });
  assert.equal(extensionReady.status, 0, extensionReady.stderr);
  assert.equal(JSON.parse(extensionReady.stdout).ok, true, 'optional CRX key should not block local readiness');
} finally {
  rmSync(newRoot, { recursive: true, force: true });
}

if (process.platform !== 'win32') {
  const unsafeRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-new-symlink-'));
  try {
    const realDestination = path.join(unsafeRoot, 'real-destination');
    const linkedDestination = path.join(unsafeRoot, 'linked-destination');
    mkdirSync(realDestination);
    symlinkSync(realDestination, linkedDestination, 'dir');
    const rejected = runCli(['new', linkedDestination, '--api', '--skip-install']);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Refusing transaction root that is a symbolic link/);
    assert.deepEqual(readdirSync(realDestination), [], 'a rejected symbolic-link destination must remain untouched');
  } finally {
    rmSync(unsafeRoot, { recursive: true, force: true });
  }

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
assert.equal(parseCli(['--all']).modules.size, 11, '--all should explicitly select every supported module');
assert.deepEqual(parseNewProjectRequest(['my-app', '--web']), { directory: 'my-app', moduleArgs: ['--web'] });
assert.equal(buildOptionsForRoot(parseCli(['--web']), '/tmp/My Product').projectName, 'my-product');

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
  'web',
]);
assert.deepEqual(parsePromptModuleSelection('none', ['web'], ['web', 'api']), []);
assert.deepEqual(parsePromptModuleSelection('all', ['web'], ['web', 'api']), ['web', 'api']);
assert.deepEqual(parsePromptModuleSelection('WEB, web', ['web'], ['web', 'api']), ['web']);
assert.throws(
  () => parsePromptModuleSelection('none,web', ['web'], ['web', 'api']),
  /"none" must be used by itself/,
);
assert.throws(
  () => parsePromptModuleSelection('auth', ['web'], ['web', 'api']),
  /Unknown selection: auth/,
);
assert.equal(parsePromptConfirmation(''), true);
assert.equal(parsePromptConfirmation('YES'), true);
assert.equal(parsePromptConfirmation('no'), false);
assert.throws(() => parsePromptConfirmation('maybe'), /Enter yes or no/);
assert.throws(
  () => parseCli(['--native-styling=nativewind', '--native-styling=uniwind']),
  /Conflicting values for --native-styling/,
);
assert.deepEqual(
  buildAddOptions(['electron-updater'], parseCli(['--skip-install'])).modules,
  ['electron-updater'],
);
assert.equal(shouldPromptForInitModules([], true), true);
assert.equal(shouldPromptForInitModules(['--json'], true), false, '--json must never open interactive prompts');
assert.equal(shouldPromptForInitModules(['--web'], true), false);
assert.equal(shouldPromptForInitModules(['--all'], true), false);
assert.equal(shouldPromptForInitModules([], false), false);
assert.deepEqual(
  buildAddOptions(['billing'], parseCli(['--skip-install'])).modules,
  ['billing'],
  'add should preserve explicit intent instead of storing the dependency closure',
);

console.log(`Validation tests passed: ${cases.length}`);

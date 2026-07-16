import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const ui = await import(pathToFileURL(path.join(repoRoot, 'dist', 'ui.js')).href);
const cli = await import(pathToFileURL(path.join(repoRoot, 'dist', 'cli.js')).href);

assert.deepEqual(ui.parseUiComponentList('Button, alert-dialog button'), ['button', 'alert-dialog']);
assert.throws(() => ui.normalizeUiComponentName('../button'), /Invalid UI component name/);
assert.equal(ui.providerForTarget('mobile'), 'react-native-reusables');
assert.equal(ui.providerForTarget('desktop'), 'shadcn');
assert.equal(
  ui.registrySourceFor('button', 'mobile', 'uniwind'),
  'https://reactnativereusables.com/r/uniwind/button.json',
);

const installs = ui.resolveUiInstalls(['dialog', 'button'], ['mobile', 'web'], 'nativewind');
assert.deepEqual(installs.map(({ name, target, provider, variant }) => ({ name, target, provider, variant })), [
  { name: 'button', target: 'mobile', provider: 'react-native-reusables', variant: 'nativewind' },
  { name: 'dialog', target: 'mobile', provider: 'react-native-reusables', variant: 'nativewind' },
  { name: 'button', target: 'web', provider: 'shadcn', variant: null },
  { name: 'dialog', target: 'web', provider: 'shadcn', variant: null },
]);
const commands = ui.buildUiInstallCommands('/project', installs);
assert.equal(commands.length, 2);
assert.match(commands[0].args[1], /^shadcn@\d+\.\d+\.\d+$/);
assert.ok(commands.find((command) => command.target === 'mobile').args.includes('https://reactnativereusables.com/r/nativewind/button.json'));
assert.ok(commands.find((command) => command.target === 'web').args.includes('button'));

assert.deepEqual(cli.parseUiAddOptions(['button', 'dialog', '--target', 'mobile', '--dry-run']), {
  components: ['button', 'dialog'],
  targets: ['mobile'],
  skipInstall: false,
  dryRun: true,
  json: false,
});
assert.throws(() => cli.parseUiAddOptions(['button', '--target', 'api']), /--target must be one of/);

const project = mkdtempSync(path.join(tmpdir(), 'anhedral-ui-test-'));
try {
  const init = spawnSync('node', [cliEntry, 'init', '--web', '--mobile', '--native-styling', 'uniwind', '--skip-install'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);
  const manifestPath = path.join(project, 'anhedral.json');
  const before = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(before);
  assert.deepEqual(manifest.ui, { nativeStyling: 'uniwind', components: [] });
  assert.match(readFileSync(path.join(project, 'apps/mobile/metro.config.js'), 'utf8'), /withUniwindConfig/);
  assert.match(readFileSync(path.join(project, 'apps/mobile/global.css'), 'utf8'), /@import "uniwind"/);
  assert.equal(JSON.parse(readFileSync(path.join(project, 'apps/mobile/components.json'), 'utf8')).rsc, false);

  const dryRun = spawnSync('node', [cliEntry, 'ui', 'add', 'button', '--target', 'mobile', '--dry-run', '--skip-install'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /mobile: button \(react-native-reusables\)/);
  assert.equal(readFileSync(manifestPath, 'utf8'), before, 'UI dry-run must not mutate the manifest');

  const missingTarget = spawnSync('node', [cliEntry, 'ui', 'add', 'button', '--target', 'desktop', '--dry-run'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(missingTarget.status, 1);
  assert.match(missingTarget.stderr, /UI target is not installed: desktop/);
} finally {
  rmSync(project, { recursive: true, force: true });
}

console.log('Unified UI provider tests passed');

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const execFileAsync = promisify(execFile);

const { dependencyManifest } = await import(path.join(repoRoot, 'dist', 'dependencies.js'));

function overridePackageName(selector) {
  const rangeSeparator = selector.lastIndexOf('@');
  return rangeSeparator > 0 ? selector.slice(0, rangeSeparator) : selector;
}

function collectDependencyPins() {
  const manifest = dependencyManifest();
  const packageManagerSeparator = manifest.packageManager.lastIndexOf('@');
  assert.ok(packageManagerSeparator > 0, 'package manager must be an exact name@version pin');

  const groups = [
    {
      name: 'packageManager',
      group: {
        dependencies: {
          [manifest.packageManager.slice(0, packageManagerSeparator)]: manifest.packageManager.slice(packageManagerSeparator + 1),
        },
      },
    },
    { name: 'toolchain', group: { dependencies: manifest.toolchain } },
    {
      name: 'securityOverrides',
      group: { dependencies: manifest.securityOverrides },
    },
    { name: 'root', group: manifest.root },
    { name: 'contracts', group: manifest.contracts },
    { name: 'sharedDb', group: manifest.sharedDb },
    { name: 'sharedPackages', group: manifest.sharedPackages },
    { name: 'backend', group: manifest.backend },
    { name: 'extension', group: manifest.extension },
    { name: 'frontendAddons', group: { dependencies: manifest.frontendAddons } },
    { name: 'mobileApp', group: manifest.mobileApp },
    { name: 'webApp', group: manifest.webApp },
    { name: 'desktop', group: manifest.desktop },
  ];
  const pins = new Map();

  for (const { name: groupName, group } of groups) {
    for (const field of ['dependencies', 'devDependencies']) {
      for (const [selector, version] of Object.entries(group[field] ?? {})) {
        if (version === 'workspace:*') continue;

        const packageName = groupName === 'securityOverrides' ? overridePackageName(selector) : selector;

        pins.set(`${packageName}@${version}`, { packageName, version, groupName, field });
      }
    }
  }

  return [...pins.values()].sort((a, b) => a.packageName.localeCompare(b.packageName));
}

async function npmViewVersion(packageName, version) {
  const { stdout } = await execFileAsync('npm', ['view', `${packageName}@${version}`, 'version'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return stdout.trim();
}

const pins = collectDependencyPins();
const failures = [];

for (const pin of pins) {
  assert.doesNotMatch(pin.version, /^\^/, `${pin.packageName} should not use a caret range`);
  assert.notEqual(pin.version, 'latest', `${pin.packageName} should not use latest`);
}

let nextPinIndex = 0;
const workerCount = Math.min(8, pins.length);

await Promise.all(Array.from({ length: workerCount }, async () => {
  while (nextPinIndex < pins.length) {
    const pin = pins[nextPinIndex];
    nextPinIndex += 1;

    try {
      const publishedVersion = await npmViewVersion(pin.packageName, pin.version);
      assert.equal(
        publishedVersion,
        pin.version,
        `${pin.packageName}@${pin.version} resolved to unexpected version ${publishedVersion}`,
      );
    } catch (error) {
      failures.push({
        pin,
        message: error.stderr?.toString().trim() || error.message,
      });
    }
  }
}));

if (failures.length > 0) {
  const summary = failures
    .map(({ pin, message }) => `- ${pin.packageName}@${pin.version} (${pin.groupName}.${pin.field})\n${message}`)
    .join('\n\n');
  throw new Error(`Dependency manifest contains unpublished or inaccessible versions:\n${summary}`);
}

console.log(`Dependency manifest registry check passed: ${pins.length} published package versions verified`);

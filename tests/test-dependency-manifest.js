import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const { dependencyManifest } = await import(path.join(repoRoot, 'dist', 'dependencies.js'));

function collectDependencyPins() {
  const manifest = dependencyManifest();
  const groups = [
    { name: 'root', group: manifest.root },
    { name: 'contracts', group: manifest.contracts },
    { name: 'sharedDb', group: manifest.sharedDb },
    { name: 'sharedPackages', group: manifest.sharedPackages },
    { name: 'backend', group: manifest.backend },
    { name: 'extension', group: manifest.extension },
    { name: 'frontendAddons', group: { dependencies: manifest.frontendAddons } },
    { name: 'webApp', group: manifest.webApp },
    { name: 'desktop', group: manifest.desktop },
    { name: 'nextTemplate', group: manifest.nextTemplate },
  ];
  const pins = new Map();

  for (const { name: groupName, group } of groups) {
    for (const field of ['dependencies', 'devDependencies']) {
      for (const [packageName, version] of Object.entries(group[field] ?? {})) {
        if (version === 'workspace:*') continue;

        const existing = pins.get(packageName);
        if (existing && existing.version !== version) {
          throw new Error(
            `Conflicting versions for ${packageName}: ${existing.version} (${existing.groupName}) vs ${version} (${groupName})`,
          );
        }

        pins.set(packageName, { packageName, version, groupName, field });
      }
    }
  }

  return [...pins.values()].sort((a, b) => a.packageName.localeCompare(b.packageName));
}

function npmViewVersion(packageName, version) {
  return execFileSync('npm', ['view', `${packageName}@${version}`, 'version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const pins = collectDependencyPins();
const failures = [];

for (const pin of pins) {
  assert.doesNotMatch(pin.version, /^\^/, `${pin.packageName} should not use a caret range`);
  assert.notEqual(pin.version, 'latest', `${pin.packageName} should not use latest`);

  try {
    const publishedVersion = npmViewVersion(pin.packageName, pin.version);
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

if (failures.length > 0) {
  const summary = failures
    .map(({ pin, message }) => `- ${pin.packageName}@${pin.version} (${pin.groupName}.${pin.field})\n${message}`)
    .join('\n\n');
  throw new Error(`Dependency manifest contains unpublished or inaccessible versions:\n${summary}`);
}

console.log(`Dependency manifest registry check passed: ${pins.length} published package versions verified`);

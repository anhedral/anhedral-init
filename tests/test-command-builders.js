import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const { dependencyManifest, NODE_ENGINE } = await import(path.join(repoRoot, 'dist', 'dependencies.js'));
const { supportsMobileInstallNode } = await import(path.join(repoRoot, 'dist', 'scaffold.js'));

const manifest = dependencyManifest();
assert.match(manifest.packageManager, /^pnpm@\d+\.\d+\.\d+$/, 'package manager must be an exact pnpm release');
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
assert.equal(packageJson.packageManager, manifest.packageManager, 'package manager metadata must match the generator pin');
assert.equal(packageJson.engines.node, NODE_ENGINE, 'package runtime metadata must match generated workspaces');
assert.equal(supportsMobileInstallNode('20.19.4'), false);
assert.equal(supportsMobileInstallNode('22.12.9'), false);
assert.equal(supportsMobileInstallNode('22.13.0'), true);
assert.equal(supportsMobileInstallNode('24.2.9'), false);
assert.equal(supportsMobileInstallNode('24.3.0'), true);
assert.equal(supportsMobileInstallNode('25.0.0'), true);
assert.equal(supportsMobileInstallNode('not-semver'), false);
const pnpmVersion = manifest.packageManager.slice('pnpm@'.length);
const contributing = readFileSync(path.join(repoRoot, 'CONTRIBUTING.md'), 'utf8');
assert.equal(
  /\bpnpm (\d+\.\d+\.\d+)\b/.exec(contributing)?.[1],
  pnpmVersion,
  'contributor documentation must match the package manager pin',
);
for (const workflow of ['ci.yml', 'release.yml', 'toolchain-drift.yml']) {
  const content = readFileSync(path.join(repoRoot, '.github/workflows', workflow), 'utf8');
  const configuredVersions = [...content.matchAll(
    /uses:\s*pnpm\/action-setup@[^\n]+\n\s+with:\n\s+version:\s*['"]?([^'"\s]+)/g,
  )].map((match) => match[1]);
  assert.ok(configuredVersions.length > 0, `${workflow} must configure pnpm explicitly`);
  assert.deepEqual(
    [...new Set(configuredVersions)],
    [pnpmVersion],
    `${workflow} pnpm setup must match the generator pin`,
  );
}
assert.equal(manifest.backend.dependencies.fastify, '5.8.5');
assert.equal(manifest.backend.dependencies['@shared/db'], 'workspace:*');
assert.equal(manifest.frontendAddons['@shared/api-client'], 'workspace:*');
assert.equal(manifest.frontendAddons['@clerk/expo'], '3.7.5');
assert.equal(
  manifest.desktop.devDependencies['@vitejs/plugin-react'],
  manifest.securityOverrides['@vitejs/plugin-react'],
  'the direct Vite React plugin pin must track its security override',
);
assert.equal(
  manifest.extension.devDependencies.postcss,
  manifest.securityOverrides.postcss,
  'the direct PostCSS pin must track its security override',
);

console.log('Command builder regression tests passed');

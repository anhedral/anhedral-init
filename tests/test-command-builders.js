import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const { getBackendInstallCommands, getSkillCommands } = await import(path.join(repoRoot, 'dist', 'commands.js'));
const { dependencyManifest } = await import(path.join(repoRoot, 'dist', 'dependencies.js'));

const backendInstallCommands = getBackendInstallCommands().map((command) => command.cmd);
assert.equal(backendInstallCommands.length, 2);
assert.match(backendInstallCommands[0], /@aws-sdk\/s3-request-presigner/);
assert.match(backendInstallCommands[1], /\beslint\b/);
assert.match(backendInstallCommands[1], /@eslint\/js\b/);
assert.match(backendInstallCommands[1], /eslint@\d/);
for (const command of backendInstallCommands) {
  assert.doesNotMatch(command, /@latest\b/);
  assert.doesNotMatch(command, /@\^/);
}

const manifest = dependencyManifest();
assert.equal(manifest.packageManager, 'pnpm@10.15.1');
assert.equal(manifest.backend.dependencies.fastify, '5.6.2');
assert.equal(manifest.backend.dependencies['@anhedral/db'], 'workspace:*');
assert.equal(manifest.frontendAddons['@anhedral/api-client'], 'workspace:*');
assert.equal(manifest.frontendAddons['@clerk/clerk-expo'], '2.19.31');

assert.deepEqual(getSkillCommands(), [
  'pnpm dlx skills add https://github.com/clerk/skills --skill clerk-custom-ui',
  'pnpm dlx skills add https://github.com/revenuecat/revenuecat-skill --skill revenuecat',
  'pnpm dlx skills add https://github.com/stripe/ai --skill stripe-best-practices',
]);

console.log('Command builder regression tests passed');

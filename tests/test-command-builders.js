import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const { getBackendInstallCommands, getDefaultWebDependencyCommands, getDefaultWebInitCommand, getSkillCommands } = await import(path.join(repoRoot, 'dist', 'commands.js'));
const { resolveToolchain } = await import(path.join(repoRoot, 'dist', 'toolchain.js'));

const toolchain = resolveToolchain('stable');
const initCommand = getDefaultWebInitCommand(toolchain, 'demo-app').cmd;

assert.match(initCommand, /^pnpm dlx shadcn@4\.1\.0 init /);
assert.doesNotMatch(initCommand, /--pm\b/);
assert.match(initCommand, /-t next/);
assert.match(initCommand, /-n demo-app/);
assert.match(initCommand, /-d\b/);
assert.match(initCommand, /-y\b/);
assert.match(initCommand, /--css-variables/);

const defaultDependencyCommands = getDefaultWebDependencyCommands().map((command) => command.cmd);
assert.equal(defaultDependencyCommands.length, 2);
assert.match(defaultDependencyCommands[0], /@clerk\/nextjs/);
assert.doesNotMatch(defaultDependencyCommands[0], /@clerk\/ui/);
assert.match(defaultDependencyCommands[1], /\bbabel-plugin-react-compiler\b/);
assert.match(defaultDependencyCommands[1], /\btsx\b/);
assert.match(defaultDependencyCommands[1], /\bdotenv\b/);

const backendInstallCommands = getBackendInstallCommands().map((command) => command.cmd);
assert.equal(backendInstallCommands.length, 2);
assert.match(backendInstallCommands[0], /@aws-sdk\/s3-request-presigner/);
assert.match(backendInstallCommands[1], /eslint@9\.39\.4/);
assert.match(backendInstallCommands[1], /@eslint\/js@9\.39\.4/);

assert.deepEqual(getSkillCommands({ frontend: 'next', extension: false }), [
  'pnpm dlx skills add https://github.com/clerk/skills --skill clerk-custom-ui',
  'pnpm dlx skills add https://github.com/stripe/ai --skill stripe-best-practices',
]);

assert.deepEqual(getSkillCommands({ frontend: 'next', extension: true }), [
  'pnpm dlx skills add https://github.com/clerk/skills --skill clerk-custom-ui',
  'pnpm dlx skills add https://github.com/stripe/ai --skill stripe-best-practices',
]);

assert.deepEqual(getSkillCommands({ frontend: 'expo', extension: false }), [
  'pnpm dlx skills add https://github.com/clerk/skills --skill clerk-custom-ui',
  'pnpm dlx skills add https://github.com/revenuecat/revenuecat-skill --skill revenuecat',
  'pnpm dlx skills add https://github.com/stripe/ai --skill stripe-best-practices',
]);

console.log('Command builder regression tests passed');

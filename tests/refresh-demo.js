import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const demoRoot = path.join(repoRoot, 'demo');
const cliEntry = path.join(repoRoot, 'dist', 'index.js');

function run(command, args, cwd) {
  console.log(`Running in ${cwd}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      ANHEDRAL_TOOLCHAIN: 'stable',
    },
  });

  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed in ${cwd}`);
}

function writeFile(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function writeDemoReadme() {
  writeFile(path.join(demoRoot, 'README.md'), `# Demo Apps

These demos are generated from the local Anhedral CLI in this repository using the stable toolchain.

## Stacks

- \`demo/expo-extension\` — Expo app, Fastify backend, WXT extension, and shared packages

## Start Commands

\`\`\`sh
cd demo/expo-extension
pnpm dev
\`\`\`

## Notes

- API env files are generated with \`ANHEDRAL_DEMO=true\` for provider-free smoke testing.
- Auth, billing, storage, and database operations need real provider credentials for production behavior.
- The main UI surfaces worth previewing immediately are the Expo app shell and extension side panel.
- Root \`pnpm build\` passes in the demo after generation.
- Refresh the demos from the repo root with \`pnpm demo:refresh\`.
`);
}

function removeNestedGitDirs(projectRoot) {
  rmSync(path.join(projectRoot, '.git'), { recursive: true, force: true });
  rmSync(path.join(projectRoot, 'apps', 'web', '.git'), { recursive: true, force: true });
  rmSync(path.join(projectRoot, 'apps', 'frontend', '.git'), { recursive: true, force: true });
  rmSync(path.join(projectRoot, 'apps', 'api', '.git'), { recursive: true, force: true });
  rmSync(path.join(projectRoot, 'apps', 'extension', '.git'), { recursive: true, force: true });
}

const scenarios = [
  { args: [], dir: 'expo-extension' },
];

rmSync(demoRoot, { recursive: true, force: true });
mkdirSync(demoRoot, { recursive: true });

for (const scenario of scenarios) {
  const projectRoot = path.join(demoRoot, scenario.dir);
  mkdirSync(projectRoot, { recursive: true });
  run('node', [cliEntry, 'init', ...scenario.args], projectRoot);
  removeNestedGitDirs(projectRoot);
}

writeDemoReadme();

console.log(`Demo apps refreshed in ${demoRoot}`);

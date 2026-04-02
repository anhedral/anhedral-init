import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function patchJson(filePath, update) {
  const json = JSON.parse(readFileSync(filePath, 'utf8'));
  update(json);
  writeFile(filePath, JSON.stringify(json, null, 2) + '\n');
}

function setEnv(filePath, pairs) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const pending = new Map(Object.entries(pairs));
  const nextLines = lines.map((line) => {
    const idx = line.indexOf('=');
    if (idx === -1) {
      return line;
    }

    const key = line.slice(0, idx);
    if (!pending.has(key)) {
      return line;
    }

    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });

  if (pending.size > 0) {
    if (nextLines.length > 0 && nextLines.at(-1) !== '') {
      nextLines.push('');
    }

    for (const [key, value] of pending) {
      nextLines.push(`${key}=${value}`);
    }
  }

  writeFile(filePath, nextLines.join('\n').replace(/\n*$/, '\n'));
}

function writeNextRuntimeEnv(projectRoot, appUrl) {
  writeFile(path.join(projectRoot, '.env.local'), `NEXT_PUBLIC_APP_URL=${appUrl}

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_demo_placeholder
CLERK_SECRET_KEY=sk_test_demo_placeholder
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

DATABASE_URL=postgresql://user:pass@localhost:5432/anhedral_demo?sslmode=disable

R2_ACCOUNT_ID=demo-account
R2_ACCESS_KEY_ID=demo-access-key
R2_SECRET_ACCESS_KEY=demo-secret-key
R2_BUCKET=demo-bucket

STRIPE_SECRET_KEY=sk_test_demo_placeholder
STRIPE_WEBHOOK_SECRET=whsec_demo_placeholder
STRIPE_PRICE_STARTER=price_demo_placeholder
`);
}

function configureNextDemo(projectRoot) {
  writeNextRuntimeEnv(projectRoot, 'http://localhost:3000');
}

function configureNextFullstackDemo(projectRoot) {
  patchJson(path.join(projectRoot, 'frontend', 'package.json'), (pkg) => {
    pkg.scripts.dev = 'next dev --port 3001';
  });

  writeNextRuntimeEnv(path.join(projectRoot, 'frontend'), 'http://localhost:3001');
  setEnv(path.join(projectRoot, 'backend', '.env'), {
    PORT: '8788',
    FRONTEND_URL: 'http://localhost:3001',
  });
}

function configureExpoFullstackDemo(projectRoot) {
  setEnv(path.join(projectRoot, 'frontend', '.env'), {
    EXPO_PUBLIC_API_URL: 'http://localhost:8789',
  });
  setEnv(path.join(projectRoot, 'backend', '.env'), {
    PORT: '8789',
    FRONTEND_URL: 'http://localhost:8081',
  });
}

function configureBackendDemo(projectRoot) {
  writeFile(path.join(projectRoot, '.env'), `PORT=8790
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/anhedral_demo?sslmode=disable
R2_ACCOUNT_ID=demo-account
R2_ACCESS_KEY_ID=demo-access-key
R2_SECRET_ACCESS_KEY=demo-secret-key
R2_BUCKET=demo-bucket
`);
}

function writeDemoReadme() {
  writeFile(path.join(demoRoot, 'README.md'), `# Demo Apps

These demos are generated from the local Anhedral CLI in this repository using the stable toolchain.

## Stacks

- \`demo/next\` — Next-only app on [http://localhost:3000](http://localhost:3000)
- \`demo/next-fullstack\` — Next frontend on [http://localhost:3001](http://localhost:3001), Fastify backend on [http://localhost:8788](http://localhost:8788)
- \`demo/expo-fullstack\` — Expo dev server on \`localhost:8081\`, Fastify backend on [http://localhost:8789](http://localhost:8789)
- \`demo/backend\` — Fastify backend on [http://localhost:8790](http://localhost:8790)

## Start Commands

\`\`\`sh
cd demo/next
pnpm dev
\`\`\`

\`\`\`sh
cd demo/next-fullstack
pnpm dev
\`\`\`

\`\`\`sh
cd demo/expo-fullstack
pnpm dev
\`\`\`

\`\`\`sh
cd demo/backend
pnpm dev
\`\`\`

## Notes

- Runtime env files are prewritten with local placeholder values so the demos boot without copying \`.env.example\`.
- Auth, billing, storage, and database operations still need real provider credentials to fully work.
- The main UI pages worth previewing immediately are the landing page, sign-in page, and sign-up page for the web stacks.
- Refresh the demos from the repo root with \`pnpm demo:refresh\`.
`);
}

function removeNestedGitDirs(projectRoot) {
  rmSync(path.join(projectRoot, '.git'), { recursive: true, force: true });
  rmSync(path.join(projectRoot, 'frontend', '.git'), { recursive: true, force: true });
  rmSync(path.join(projectRoot, 'backend', '.git'), { recursive: true, force: true });
}

const scenarios = [
  {
    stack: 'next',
    dir: 'next',
    configure: configureNextDemo,
  },
  {
    stack: 'next-fullstack',
    dir: 'next-fullstack',
    configure: configureNextFullstackDemo,
  },
  {
    stack: 'expo-fullstack',
    dir: 'expo-fullstack',
    configure: configureExpoFullstackDemo,
  },
  {
    stack: 'backend',
    dir: 'backend',
    configure: configureBackendDemo,
  },
];

rmSync(demoRoot, { recursive: true, force: true });
mkdirSync(demoRoot, { recursive: true });

for (const scenario of scenarios) {
  const projectRoot = path.join(demoRoot, scenario.dir);
  mkdirSync(projectRoot, { recursive: true });
  run('node', [cliEntry, 'init', scenario.stack], projectRoot);
  removeNestedGitDirs(projectRoot);
  scenario.configure(projectRoot);
}

writeDemoReadme();

console.log(`Demo apps refreshed in ${demoRoot}`);

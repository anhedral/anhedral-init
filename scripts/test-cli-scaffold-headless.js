import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ASCII_LOGO = [
  '  .:-:.',
  '  .----:.',
  '  .-------:.',
  '  :---------:..',
  '  :--------..--:.',
  '  :-------.  :----::.',
  '  :------:   :-------:.',
  '  :------:  .---------::',
  '  :-------.  :::::::::.',
  '  :-------.',
  '  :-----:.',
  '  :----:.',
  '  :-:.',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'index.js');
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'anhedral-init-test-'));

try {
  const projectName = 'sample-backend';
  const projectRoot = path.join(tempRoot, projectName);
  mkdirSync(projectRoot, { recursive: true });
  const result = spawnSync(
    'node',
    [
      cliEntry,
      'init',
      'backend',
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        ANHEDRAL_SKIP_INSTALL: '1',
      },
    },
  );

  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');

  assert.equal(result.status, 0, `CLI failed\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  assert.match(stdout, new RegExp(ASCII_LOGO.map(escapeRegExp).join('\\r?\\n')), 'CLI should print the ASCII logo');
  assert.ok(
    stdout.indexOf(ASCII_LOGO[ASCII_LOGO.length - 1]) < stdout.indexOf('📁 Initializing'),
    'CLI should print the ASCII logo before initialization output',
  );

  const stackPath = path.join(projectRoot, 'stack.json');
  const readmePath = path.join(projectRoot, 'README.md');
  const envExamplePath = path.join(projectRoot, '.env.example');
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const appPath = path.join(projectRoot, 'src', 'app.ts');
  const authPath = path.join(projectRoot, 'src', 'lib', 'auth', 'auth.ts');
  const schemaPath = path.join(projectRoot, 'src', 'lib', 'db', 'schema.ts');
  const skillsPath = path.join(projectRoot, 'install-skills.sh');

  assert.equal(existsSync(stackPath), true, 'stack.json should exist');
  assert.equal(existsSync(readmePath), true, 'README.md should exist');
  assert.equal(existsSync(envExamplePath), true, '.env.example should exist');
  assert.equal(existsSync(packageJsonPath), true, 'package.json should exist');
  assert.equal(existsSync(gitignorePath), true, '.gitignore should exist');
  assert.equal(existsSync(appPath), true, 'backend app.ts should exist');
  assert.equal(existsSync(authPath), true, 'better auth scaffold should exist');
  assert.equal(existsSync(schemaPath), true, 'db schema should exist');
  assert.equal(existsSync(skillsPath), true, 'skills guide should exist');

  const stack = JSON.parse(readFileSync(stackPath, 'utf8'));
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  assert.equal(stack.mode, 'backend');
  assert.equal(stack.auth, 'betterauth');
  assert.equal(stack.payments, 'none');
  assert.deepEqual(stack.outputs.generated_paths, ['.']);
  assert.equal(stack.outputs.toolchain_channel, 'stable');
  assert.equal(stack.outputs.toolchain.verifiedAt, '2026-03-22');
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.packageManager, 'pnpm@10.15.1');
  assert.equal('skills:install' in packageJson.scripts, false);

  const readme = readFileSync(readmePath, 'utf8');
  const gitignore = readFileSync(gitignorePath, 'utf8');
  assert.match(readme, /Mode: backend/);
  assert.match(readme, /Better Auth/);
  assert.match(readme, /Toolchain: stable \(verified 2026-03-22\)/);
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);

  const appSource = readFileSync(appPath, 'utf8');
  assert.match(appSource, /Fastify/);
  assert.match(appSource, /\/api\/auth\/\*/);

  const authSource = readFileSync(authPath, 'utf8');
  assert.match(authSource, /betterAuth/);
  assert.match(authSource, /drizzleAdapter/);

  const skillsGuide = readFileSync(skillsPath, 'utf8');
  assert.match(skillsGuide, /Manual skill installation guide/);
  assert.match(skillsGuide, /pnpm dlx skills add/);

  console.log('Backend scaffold smoke test passed');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

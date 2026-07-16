import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = path.join(repoRoot, 'dist/bin.js');
const workspace = mkdtempSync(path.join(tmpdir(), 'anhedral-db-gate-'));
const project = path.join(workspace, 'database-only');

function run(command, args, cwd = project, env = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: '', ...env },
  });
}

function expectSuccess(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} failed\nstdout:\n${String(result.stdout)}\nstderr:\n${String(result.stderr)}`,
  );
}

try {
  mkdirSync(project);
  expectSuccess(run(process.execPath, [cliEntry, 'init', 'db', '--skip-install']), 'database-only init');

  const rootPackage = JSON.parse(readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.equal(
    rootPackage.scripts['verify:db'],
    'node scripts/verify-db-migrations.mjs && pnpm db:check',
  );
  assert.equal(rootPackage.scripts.verify, 'pnpm typecheck && pnpm verify:db');
  assert.equal(rootPackage.scripts['db:check'], 'pnpm --filter @shared/db db:check');

  const vercel = JSON.parse(readFileSync(path.join(project, 'vercel.json'), 'utf8'));
  assert.deepEqual(vercel, { $schema: 'https://openapi.vercel.sh/vercel.json' });

  const workflow = readFileSync(path.join(project, '.github/workflows/anhedral-ci.yml'), 'utf8');
  assert.match(workflow, /name: Verify committed database migration history\n\s+run: pnpm verify:db/);
  assert.match(workflow, /pnpm db:generate/);
  assert.match(workflow, /git diff --exit-code -- packages\/db\/migrations/);
  assert.match(workflow, /git status --porcelain --untracked-files=all -- packages\/db\/migrations/);

  const readmePath = path.join(project, 'README.md');
  const productionPath = path.join(project, 'PRODUCTION.md');
  const initialReadme = readFileSync(readmePath, 'utf8');
  const initialProduction = readFileSync(productionPath, 'utf8');
  const generateIndex = initialReadme.indexOf('pnpm db:generate');
  const stageIndex = initialReadme.indexOf('git add packages/db/migrations');
  const verifyIndex = initialReadme.indexOf('pnpm verify');
  const migrateIndex = initialReadme.indexOf('pnpm db:migrate');
  assert.ok(generateIndex >= 0 && generateIndex < stageIndex && stageIndex < verifyIndex && verifyIndex < migrateIndex);
  assert.match(initialProduction, /Commit every reviewed Drizzle SQL migration and its metadata/);
  assert.match(initialProduction, /CI runs `pnpm db:generate`/);

  const verifier = path.join(project, 'scripts/verify-db-migrations.mjs');
  const missingBaseline = run(process.execPath, [verifier]);
  assert.notEqual(missingBaseline.status, 0);
  assert.match(String(missingBaseline.stderr), /No database migration SQL is committed/);

  const baselinePath = path.join(project, 'packages/db/migrations/0000_baseline.sql');
  writeFileSync(baselinePath, 'CREATE TABLE "items" ("id" text PRIMARY KEY NOT NULL);\n');
  expectSuccess(run(process.execPath, [verifier]), 'migration baseline check outside Git');

  const ciWithoutGit = run(process.execPath, [verifier], project, { CI: '1' });
  assert.notEqual(ciWithoutGit.status, 0);
  assert.match(String(ciWithoutGit.stderr), /CI must run database migration verification inside a Git worktree/);

  expectSuccess(run('git', ['init', '--quiet']), 'git init');
  const untrackedBaseline = run(process.execPath, [verifier]);
  assert.notEqual(untrackedBaseline.status, 0);
  assert.match(String(untrackedBaseline.stderr), /Database migration SQL must be tracked by Git/);
  expectSuccess(run('git', ['add', '--', 'packages/db/migrations/0000_baseline.sql']), 'stage baseline migration');
  expectSuccess(run(process.execPath, [verifier]), 'tracked migration baseline check');
  expectSuccess(run(process.execPath, [verifier], project, { CI: '1' }), 'tracked migration baseline check in CI');

  const vercelPath = path.join(project, 'vercel.json');
  writeFileSync(vercelPath, JSON.stringify({ ...vercel, customTopLevel: { preserved: true } }, null, 2) + '\n');
  expectSuccess(run(process.execPath, [cliEntry, 'add', 'mobile', '--skip-install']), 'add mobile to database-only project');
  const mergedVercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
  assert.equal(mergedVercel.services, undefined);
  assert.equal(mergedVercel.rewrites, undefined);
  assert.deepEqual(mergedVercel.customTopLevel, { preserved: true });
  assert.equal(readFileSync(readmePath, 'utf8'), initialReadme, 'add must not overwrite the user-owned README');
  assert.equal(readFileSync(productionPath, 'utf8'), initialProduction, 'add must not overwrite the user-owned production guide');
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log('Database migration gate and empty Vercel config tests passed');

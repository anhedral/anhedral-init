import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseStandardOptions, scaffoldStandardProject } from '../dist/standard.js';

const temp = mkdtempSync(path.join(tmpdir(), 'anhedral-standard-test-'));
const calls = [];
function seed(root) {
  mkdirSync(path.join(root, 'apps/web'), { recursive: true });
  mkdirSync(path.join(root, 'packages/ui'), { recursive: true });
  mkdirSync(path.join(root, 'packages/eslint-config'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', packageManager: 'pnpm@11.0.0', devDependencies: { turbo: '^2' }, scripts: {} }));
  writeFileSync(path.join(root, 'apps/web/package.json'), JSON.stringify({ name: 'web', scripts: { build: 'next build' }, dependencies: { next: '16.3.6' } }));
  writeFileSync(path.join(root, 'packages/ui/package.json'), JSON.stringify({ name: '@workspace/ui' }));
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n  - "packages/*"\nallowBuilds:\n  esbuild: true\n');
  writeFileSync(path.join(root, 'turbo.json'), JSON.stringify({ tasks: { build: {}, dev: { persistent: true } } }));
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
}
function runner(command, args, cwd) {
  calls.push({ command, args, cwd });
  if (args[0] === 'dlx') seed(path.join(args[args.indexOf('--cwd') + 1], args[args.indexOf('--name') + 1]));
  if (args.includes('--lockfile-only')) writeFileSync(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');
}
function options(name, products = []) { return parseStandardOptions('new', [path.join(temp, name), '--skip-install', '--no-git', ...products]); }
function read(root, file) { return JSON.parse(readFileSync(path.join(root, file), 'utf8')); }
mock.method(console, 'log', () => {});
try {
  assert.deepEqual(options('default').products, ['next']);
  assert.deepEqual(options('mobile', ['--expo']).products, ['expo']);
  assert.deepEqual(options('auth', ['--clerk']).products, ['clerk', 'next']);
  for (const flags of [['--all'], ['--neon', '--d1'], ['--clerk', '--better-auth'], ['--better-auth'], ['--revenuecat'], ['--wxt', '--r2'], ['--expo', '--clerk'], ['--hono', '--hosting=vercel']]) {
    assert.throws(() => options('invalid', flags));
  }
  const dry = { ...options('dry', ['--expo']), dryRun: true, json: true };
  await scaffoldStandardProject(dry, runner);
  assert.equal(existsSync(dry.root), false);
  assert.equal(calls.length, 0);
  const web = options('web');
  await scaffoldStandardProject(web, runner);
  assert.equal(read(web.root, 'apps/web/wrangler.jsonc').main, '.open-next/worker.js');
  assert.equal(existsSync(path.join(web.root, 'apps/api')), false);
  assert.equal(read(web.root, 'package.json').scripts.audit, 'node scripts/audit.mjs');
  assert.equal(existsSync(path.join(web.root, 'pnpm-lock.yaml')), true);
  assert.match(readFileSync(path.join(web.root, 'AGENTS.md'), 'utf8'), /cloudflare\/security-audit-skill/);
  assert.match(readFileSync(path.join(web.root, 'pnpm-workspace.yaml'), 'utf8'), /onlyBuiltDependencies/);
  assert.ok(calls[0].args.includes('--monorepo'));
  assert.equal(calls.filter((call) => call.command === 'git').length, 0);
  const extension = options('extension', ['--wxt']);
  await scaffoldStandardProject(extension, runner);
  assert.equal(existsSync(path.join(extension.root, 'apps/web')), false);
  assert.equal(existsSync(path.join(extension.root, 'packages/ui')), false);
  assert.equal(existsSync(path.join(extension.root, 'apps/extension/src/entrypoints/sidepanel/index.html')), true);
  for (const product of ['expo', 'electron']) {
    const native = options(product, [`--${product}`]);
    await scaffoldStandardProject(native, runner);
    const app = product === 'expo' ? 'mobile' : 'desktop';
    assert.equal(existsSync(path.join(native.root, 'apps/web')), false);
    const manifest = read(native.root, `apps/${app}/package.json`);
    assert.ok(manifest.scripts.build || manifest.scripts.start);
    assert.equal(manifest.dependencies['@shared/api-client'], undefined);
    assert.equal(manifest.dependencies['@shared/realtime'], undefined);
  }
  const services = options('services', ['--hono', '--neon', '--r2', '--kv', '--basin', '--queues', '--cron', '--workflows', '--realtime', '--stripe']);
  await scaffoldStandardProject(services, runner);
  assert.equal(existsSync(path.join(services.root, 'apps/web')), false);
  const config = read(services.root, 'apps/api/wrangler.jsonc');
  assert.ok(config.hyperdrive && config.r2_buckets && config.kv_namespaces && config.pipelines);
  assert.equal(config.analytics_engine_datasets, undefined);
  assert.deepEqual(readdirSync(path.join(services.root, 'apps')).sort(), ['api', 'jobs', 'realtime', 'scheduled', 'workflows']);
  assert.ok(read(services.root, 'apps/api/package.json').dependencies['@hono/zod-openapi']);
  assert.equal(read(services.root, 'packages/billing/package.json').dependencies.stripe, '^20.0.0');
  const auth = options('better-auth', ['--hono', '--better-auth', '--d1']);
  await scaffoldStandardProject(auth, runner);
  assert.match(readFileSync(path.join(auth.root, 'apps/api/src/index.ts'), 'utf8'), /\/api\/auth\/\*/);
  const occupied = options('occupied');
  mkdirSync(occupied.root); writeFileSync(path.join(occupied.root, 'keep.txt'), 'keep');
  await assert.rejects(scaffoldStandardProject(occupied, runner), /must be empty/);
  assert.equal(readFileSync(path.join(occupied.root, 'keep.txt'), 'utf8'), 'keep');
  const rollback = options('rollback');
  mkdirSync(rollback.root); writeFileSync(path.join(rollback.root, '.gitignore'), 'client-secret\n');
  await assert.rejects(scaffoldStandardProject(rollback, () => { throw new Error('bootstrap failed'); }), /bootstrap failed/);
  assert.deepEqual(readdirSync(rollback.root), ['.gitignore']);
  const preserved = options('preserved');
  mkdirSync(preserved.root); writeFileSync(path.join(preserved.root, '.gitignore'), 'client-secret\n');
  await scaffoldStandardProject(preserved, runner);
  assert.match(readFileSync(path.join(preserved.root, '.gitignore'), 'utf8'), /client-secret/);
  const cli = spawnSync(process.execPath, ['dist/bin.js', 'new', path.join(temp, 'cli'), '--dry-run', '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout).products, ['next']);
  assert.equal(existsSync(path.join(temp, 'cli')), false);
  const invalid = spawnSync(process.execPath, ['dist/bin.js', 'init', '--all', '--json'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stderr).code, 'INVALID_ARGUMENT');
  console.log('Standard generation, selections, dry-run, destination preservation and rollback tests passed');
} finally { mock.restoreAll(); rmSync(temp, { recursive: true, force: true }); }

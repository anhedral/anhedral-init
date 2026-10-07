import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { parseStandardOptions, scaffoldStandardProject } from '../dist/standard.js';
import { CAPABILITIES, CAPABILITY_REGISTRY, createSetupPlan } from '../dist/capabilities.js';
import { inspectProject, validateSetupPlan } from '../dist/readiness.js';
import { STANDARD_PRODUCTS } from '../dist/standard-products.js';

const temp = mkdtempSync(path.join(tmpdir(), 'anhedral-standard-test-'));
const calls = [];
function seed(root) {
  mkdirSync(path.join(root, 'apps/web'), { recursive: true });
  mkdirSync(path.join(root, 'packages/ui'), { recursive: true });
  mkdirSync(path.join(root, 'packages/eslint-config'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', packageManager: 'pnpm@11.0.0', devDependencies: { turbo: '^2' }, scripts: {} }));
  writeFileSync(path.join(root, 'apps/web/package.json'), JSON.stringify({ name: 'web', scripts: { build: 'next build' }, dependencies: { next: '16.3.6' } }));
  writeFileSync(path.join(root, 'apps/web/tsconfig.json'), JSON.stringify({ exclude: ['node_modules'] }));
  mkdirSync(path.join(root, 'apps/web/app'), { recursive: true });
  writeFileSync(path.join(root, 'apps/web/app/layout.tsx'), 'export default function Layout({ children }: { children: React.ReactNode }) { return <html><body className="antialiased">{children}</body></html>; }\n');
  writeFileSync(path.join(root, 'packages/ui/package.json'), JSON.stringify({ name: '@workspace/ui', dependencies: { shadcn: '4.21.3' } }));
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
  assert.deepEqual(Object.keys(CAPABILITIES).sort(), [...STANDARD_PRODUCTS].sort());
  const pluginRegistry = read(process.cwd(), 'plugins/anhedral/skills/anhedral/references/capabilities.json');
  assert.deepEqual(pluginRegistry, CAPABILITY_REGISTRY);
  assert.equal(readFileSync('plugins/anhedral/skills/anhedral/references/application-stack-standard.md', 'utf8'), readFileSync('docs/application-stack-standard.md', 'utf8'));
  const mobilePlan = createSetupPlan(options('mobile-plan', ['--expo']));
  assert.equal(mobilePlan.setup.tools.includes('Wrangler'), false);
  assert.equal(mobilePlan.setup.capabilities.some(({ id }) => id === 'stripe'), false);
  const vercelPlan = createSetupPlan(options('vercel-plan', ['--hosting=vercel']));
  assert.equal(vercelPlan.setup.tools.includes('Wrangler'), false);
  assert.ok(vercelPlan.setup.tools.includes('Vercel integration or CLI'));
  assert.ok(createSetupPlan({ ...options('planned'), dryRun: true }).setup.capabilities.every(({ status }) => status === 'planned'));
  assert.deepEqual(options('default').products, ['next']);
  assert.deepEqual(options('mobile', ['--expo']).products, ['expo']);
  assert.deepEqual(options('auth', ['--clerk']).products, ['clerk', 'next']);
  for (const flags of [['--all'], ['--neon', '--d1'], ['--clerk', '--better-auth'], ['--better-auth'], ['--revenuecat'], ['--wxt', '--r2'], ['--expo', '--clerk'], ['--hono', '--hosting=vercel']]) {
    assert.throws(() => options('invalid', flags));
  }
  for (const override of [{ layout: 'invalid' }, { layout: 'single' }, { extensionSurface: 'invalid' }, { extensionSurface: 'popup' }, { products: ['hono', 'hono'] }]) {
    const invalidApi = { ...options('invalid-api'), ...override, dryRun: true };
    await assert.rejects(scaffoldStandardProject(invalidApi, runner));
    assert.equal(existsSync(invalidApi.root), false);
  }
  const dry = { ...options('dry', ['--expo']), dryRun: true, json: true };
  await scaffoldStandardProject(dry, runner);
  assert.equal(existsSync(dry.root), false);
  assert.equal(calls.length, 0);
  const web = options('web');
  await scaffoldStandardProject(web, runner);
  assert.equal(read(web.root, 'anhedral.setup.json').root, web.root);
  assert.equal(read(web.root, 'anhedral.setup.json').setup.resourcesProvisioned, false);
  assert.deepEqual(read(web.root, 'anhedral.setup.json').setup.capabilities.map(({ status }) => status), ['starter']);
  assert.equal(read(web.root, 'apps/web/wrangler.jsonc').main, '.open-next/worker.js');
  assert.equal(existsSync(path.join(web.root, 'apps/api')), false);
  assert.equal(read(web.root, 'package.json').scripts.audit, 'node scripts/audit.mjs');
  assert.equal(read(web.root, 'packages/ui/package.json').dependencies.shadcn, undefined);
  assert.equal(read(web.root, 'packages/ui/package.json').devDependencies.shadcn, '4.21.3');
  assert.match(read(web.root, 'package.json').scripts.check, /audit:deps/);
  assert.ok(read(web.root, '.fallowrc.json').ignorePatterns.includes('**/next-env.d.ts'));
  assert.equal(existsSync(path.join(web.root, 'pnpm-lock.yaml')), true);
  assert.match(readFileSync(path.join(web.root, 'AGENTS.md'), 'utf8'), /cloudflare\/security-audit-skill/);
  assert.match(readFileSync(path.join(web.root, 'pnpm-workspace.yaml'), 'utf8'), /allowBuilds/);
  assert.ok(calls[0].args.includes('--monorepo'));
  assert.ok(calls[0].args.includes('shadcn@4.21.3'));
  assert.equal(calls[0].args.includes('shadcn@latest'), false);
  assert.equal(calls.filter((call) => call.command === 'git').length, 0);
  const clerk = options('clerk', ['--clerk']);
  await scaffoldStandardProject(clerk, runner);
  const layout = readFileSync(path.join(clerk.root, 'apps/web/app/layout.tsx'), 'utf8');
  const compiledLayout = ts.transpileModule(layout, { fileName: 'layout.tsx', compilerOptions: { jsx: ts.JsxEmit.Preserve }, reportDiagnostics: true });
  assert.deepEqual(compiledLayout.diagnostics, [], 'Clerk setup must generate valid TSX');
  assert.match(layout, /<body className="antialiased"><ClerkProvider>\{children\}<\/ClerkProvider><\/body>/);
  const invalidLayout = options('invalid-layout', ['--clerk']);
  await assert.rejects(scaffoldStandardProject(invalidLayout, (command, args, cwd) => {
    runner(command, args, cwd);
    if (args[0] === 'dlx') writeFileSync(path.join(args[args.indexOf('--cwd') + 1], args[args.indexOf('--name') + 1], 'apps/web/app/layout.tsx'), 'export default function Layout() { return <main />; }\n');
  }), /must contain a body element/);
  assert.equal(existsSync(invalidLayout.root), false, 'invalid auth overlay must roll back');
  const beforeNonWeb = calls.length;
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
  assert.equal(read(services.root, 'packages/billing/package.json').dependencies.stripe, '23.0.0');
  assert.equal(calls.slice(beforeNonWeb).some(({ args }) => args[0] === 'dlx'), false, 'non-web recipes never bootstrap unrelated Next UI');
  const single = options('single-api', ['--hono', '--layout', 'single']);
  await scaffoldStandardProject(single, runner);
  assert.equal(read(single.root, 'anhedral.standard.json').layout, 'single');
  assert.equal(read(single.root, 'package.json').scripts.dev, 'wrangler dev');
  assert.equal(read(single.root, 'package.json').devDependencies.turbo, undefined);
  assert.equal(read(single.root, 'package.json').devDependencies['eslint-plugin-react-hooks'], undefined);
  for (const key of ['source-map-js@<1.2.2', 'baseline-browser-mapping@<2.11.0', 'browserslist@<4.28.7']) assert.equal(JSON.parse(readFileSync(path.join(single.root, 'pnpm-workspace.yaml'), 'utf8').match(/^overrides: (.+)$/m)[1])[key], undefined);
  assert.equal(existsSync(path.join(single.root, 'src/index.ts')), true);
  assert.equal(existsSync(path.join(single.root, 'apps')), false);
  assert.equal(existsSync(path.join(single.root, 'packages')), false);
  assert.doesNotMatch(readFileSync(path.join(single.root, 'pnpm-workspace.yaml'), 'utf8'), /^packages:/m);
  assert.equal(inspectProject(single.root).localReady, true);
  assert.throws(() => validateSetupPlan({ ...read(single.root, 'anhedral.setup.json'), layout: 'invalid' }), /Invalid layout/);
  assert.throws(() => validateSetupPlan({ ...read(web.root, 'anhedral.setup.json'), layout: 'single' }), /Unsupported standalone/);
  for (const flags of [['--layout=single'], ['--expo', '--layout=single'], ['--hono', '--neon', '--layout=single'], ['--layout=invalid'], ['--layout=single', '--layout=workspace'], ['--extension-surface=popup']]) assert.throws(() => options('invalid-layout-recipe', flags));
  assert.equal(options('popup', ['--wxt', '--extension-surface=popup']).extensionSurface, 'popup');
  const auth = options('better-auth', ['--hono', '--better-auth', '--d1']);
  await scaffoldStandardProject(auth, runner);
  assert.match(readFileSync(path.join(auth.root, 'apps/api/src/index.ts'), 'utf8'), /\/api\/auth\/\*/);
  const occupied = options('occupied');
  mkdirSync(occupied.root); writeFileSync(path.join(occupied.root, 'keep.txt'), 'keep');
  await assert.rejects(scaffoldStandardProject(occupied, runner), /must be empty/);
  assert.equal(readFileSync(path.join(occupied.root, 'keep.txt'), 'utf8'), 'keep');
  const blockedParent = path.join(temp, 'blocked-parent');
  writeFileSync(blockedParent, 'keep');
  const previousQuiet = process.env.ANHEDRAL_QUIET;
  process.env.ANHEDRAL_QUIET = 'previous';
  try {
    await assert.rejects(scaffoldStandardProject({ ...options('blocked'), root: path.join(blockedParent, 'child'), json: true }, runner));
    assert.equal(process.env.ANHEDRAL_QUIET, 'previous', 'failed destination creation must restore process state');
  } finally {
    if (previousQuiet === undefined) delete process.env.ANHEDRAL_QUIET;
    else process.env.ANHEDRAL_QUIET = previousQuiet;
  }
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

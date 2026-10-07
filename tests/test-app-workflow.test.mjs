import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseStandardOptions, scaffoldStandardProject } from '../dist/standard.js';
import { projectFingerprint, readProjectProgress, reportProjectProgress, evaluateProjectProgress } from '../dist/progress.js';

// Contract fixtures replace the upstream shadcn CLI, not provider provisioning.
function seed(root) {
  for (const dir of ['apps/web/app', 'packages/ui', 'packages/eslint-config']) mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', packageManager: 'pnpm@10.34.5', devDependencies: { turbo: '^2' }, scripts: {} }));
  writeFileSync(path.join(root, 'apps/web/package.json'), JSON.stringify({ name: 'web', scripts: { build: 'next build' }, dependencies: { next: '16.3.6' } }));
  writeFileSync(path.join(root, 'apps/web/tsconfig.json'), JSON.stringify({ exclude: ['node_modules'] }));
  writeFileSync(path.join(root, 'apps/web/app/layout.tsx'), 'export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }');
  writeFileSync(path.join(root, 'packages/ui/package.json'), JSON.stringify({ name: '@workspace/ui', dependencies: { shadcn: '4.21.1' } }));
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n  - "packages/*"\n');
  writeFileSync(path.join(root, 'turbo.json'), '{"tasks":{"build":{},"dev":{"persistent":true}}}');
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
}
async function connect(state) {
  const client = new Client({ name: 'beginner-workflow-acceptance', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('plugins/anhedral/server.mjs')], env: { PATH: process.env.PATH || '', ANHEDRAL_STATE_DIR: state }, stderr: 'pipe' }));
  return client;
}
function observation(fingerprint, fields = {}) {
  return { capability: 'next', milestone: 'generated', outcome: 'passed', source: 'agent', observedAt: new Date().toISOString(), evidence: 'Generated fixture source inspected', configurationFingerprint: fingerprint, ...fields };
}

test('beginner web/database workflow persists reports without mutating generated requirements or treating deployment as product success', async (context) => {
  context.mock.method(console, 'log', () => {});
  const temporary = mkdtempSync(path.join(tmpdir(), 'anhedral-workflow-'));
  let client;
  try {
    const root = path.join(temporary, 'app');
    const options = parseStandardOptions('new', [root, '--next', '--hono', '--neon', '--skip-install', '--no-git']);
    const calls = [];
    const dry = { ...options, dryRun: true, json: true };
    await scaffoldStandardProject(dry, () => { throw new Error('Dry run executed a command'); });
    assert.equal(existsSync(root), false);
    await scaffoldStandardProject(options, (command, args, cwd) => {
      calls.push(command);
      if (args[0] === 'dlx') seed(path.join(args[args.indexOf('--cwd') + 1], args[args.indexOf('--name') + 1]));
      if (args.includes('--lockfile-only')) writeFileSync(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');
    });
    assert.equal(calls.includes('git'), false);
    const requirements = readFileSync(path.join(root, 'anhedral.setup.json'), 'utf8');
    assert.equal(JSON.parse(requirements).setup.resourcesProvisioned, false);
    assert.ok(JSON.parse(requirements).setup.capabilities.every(item => item.status === 'starter'));
    const fingerprint = projectFingerprint(root);
    client = await connect(path.join(temporary, 'state'));
    const registered = await client.callTool({ name: 'anhedral_register_project', arguments: { folder: root } });
    const projectId = registered.structuredContent.project.id;
    const tool = (name, args) => client.callTool({ name, arguments: args });
    await tool('anhedral_update_settings', { projectId, environment: 'preview', cloudflareAccountId: 'a'.repeat(32), neonProjectId: 'existing-neon-project' });
    const report = {
      revision: 0, environment: 'preview',
      observations: [
        observation(fingerprint),
        observation(fingerprint, { capability: 'neon', milestone: 'provisioned', accountRef: 'existing-neon-project', resourceRef: 'existing-branch', evidence: 'Existing database reused after inspecting branch metadata' }),
        observation(fingerprint, { milestone: 'deployed', accountRef: 'a'.repeat(32), evidence: 'Preview HTTP request returned 200', revisionRef: 'reviewed-source' }),
        observation(fingerprint, { milestone: 'tested', outcome: 'failed', evidence: 'Authenticated persistence flow failed; deployment availability is insufficient' }),
      ],
      discovery: [
        { provider: 'neon', route: 'plugin', check: 'callable', outcome: 'passed', source: 'agent', observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), evidence: 'Current session exposes Neon read tools' },
        { provider: 'cloudflare', route: 'plugin', check: 'callable', outcome: 'blocked', source: 'agent', observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), evidence: 'Cloudflare tools unavailable in this session; choose an API or CLI route' },
        { provider: 'neon', route: 'cli', check: 'authorized', outcome: 'blocked', source: 'agent', observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), evidence: 'CLI credential availability not established' },
      ], blockers: ['Fix authenticated persistence'], nextAction: 'Inspect the failed product flow', previewUrl: 'https://preview.example.com/',
    };
    const result = await tool('anhedral_report_project_progress', { projectId, report });
    assert.equal(result.isError, undefined, JSON.stringify(result.content));
    let stored = readProjectProgress(root);
    const preview = stored.environments.find(env => env.id === 'preview');
    assert.equal(preview.observations.find(item => item.milestone === 'deployed').outcome, 'passed');
    assert.equal(preview.observations.find(item => item.milestone === 'tested').outcome, 'failed');
    assert.equal(preview.discovery.find(item => item.provider === 'neon' && item.route === 'plugin').check, 'callable');
    assert.equal(preview.discovery.find(item => item.route === 'cli').outcome, 'blocked');
    assert.equal(stored.environments.some(env => env.id === 'production'), false);
    assert.equal(readFileSync(path.join(root, 'anhedral.setup.json'), 'utf8'), requirements);
    await client.close(); client = await connect(path.join(temporary, 'state'));
    const resumed = await tool('anhedral_open', { projectId, environment: 'preview' });
    assert.ok(resumed.structuredContent.progress, 'Restart must retain project-local progress');
    const duplicate = await tool('anhedral_report_project_progress', { projectId, report: { revision: 1, environment: 'preview', observations: [report.observations[1]] } });
    assert.equal(duplicate.isError, undefined);
    stored = readProjectProgress(root);
    assert.equal(stored.environments[0].observations.filter(item => item.capability === 'neon').length, 1, 'Resource reuse must not create duplicate observations');
    for (const invalid of [
      { revision: 0, environment: 'preview', blockers: [] },
      { revision: 2, environment: 'preview', observations: [observation(fingerprint, { milestone: 'deployed' })] },
      { revision: 2, environment: 'preview', observations: [observation(fingerprint, { source: 'independent' })] },
      { revision: 2, environment: 'preview', observations: [observation(fingerprint, { capability: 'neon', accountRef: 'wrong-project' })] },
      { revision: 2, environment: 'preview', discovery: [{ ...report.discovery[0], check: 'authorized', accountRef: 'wrong-project' }] },
      { revision: 2, environment: 'preview', nextAction: 'DATABASE_URL=postgres://private' },
      { revision: 2, environment: 'preview', previewUrl: 'https://preview.example.com/?token=private' },
    ]) assert.equal((await tool('anhedral_report_project_progress', { projectId, report: invalid })).isError, true);
    assert.equal(readProjectProgress(root).revision, 2, 'Rejected reports must not mutate state');
    const cliShow = () => {
      const result = spawnSync(process.execPath, ['dist/bin.js', 'progress', 'show', root, '--json'], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    assert.deepEqual(cliShow(), readProjectProgress(root), 'CLI must read the exact MCP-written record');
    const cliReported = spawnSync(process.execPath, ['dist/bin.js', 'progress', 'report', root, '-', '--json'], {
      encoding: 'utf8', input: JSON.stringify({ revision: 2, environment: 'preview', nextAction: 'Continue product verification from the CLI', liveUrl: 'https://live.example.com/' }),
    });
    assert.equal(cliReported.status, 0, cliReported.stderr);
    const fromCli = await tool('anhedral_open', { projectId, environment: 'preview' });
    assert.deepEqual(fromCli.structuredContent.progress, JSON.parse(cliReported.stdout), 'MCP must read the canonical CLI-written record');
    assert.equal(fromCli.structuredContent.progress.environments.find(env => env.id === 'preview').nextAction, 'Continue product verification from the CLI');
    const cleared = await tool('anhedral_report_project_progress', { projectId, report: { revision: 3, environment: 'preview', nextAction: null, previewUrl: null, liveUrl: null } });
    assert.equal(cleared.isError, undefined, JSON.stringify(cleared.content));
    const clearedRecord = cliShow();
    assert.deepEqual(clearedRecord, cleared.structuredContent.progress);
    assert.deepEqual(clearedRecord.environments.map(env => env.id), ['preview']);
    for (const key of ['nextAction', 'previewUrl', 'liveUrl']) assert.equal(Object.hasOwn(clearedRecord.environments[0], key), false, `Explicit null must remove ${key} from the canonical record`);

    await tool('anhedral_update_settings', { projectId, environment: 'preview', neonProjectId: 'different-neon-project' });
    const changedScope = await tool('anhedral_open', { projectId, environment: 'preview' });
    const scoped = changedScope.structuredContent.progressEvaluation.environments.find(env => env.id === 'preview');
    assert.equal(scoped.observations.find(item => item.capability === 'neon').stale, true, 'Changing configured provider scope invalidates old account evidence');
    assert.equal(readFileSync(path.join(root, 'anhedral.setup.json'), 'utf8'), requirements);
  } finally { if (client) await client.close(); rmSync(temporary, { recursive: true, force: true }); }
});

function writer(root) {
  const code = `import {reportProjectProgress} from ${JSON.stringify(new URL('../dist/progress.js', import.meta.url).href)};try {reportProjectProgress(process.argv[1], {revision:0, environment:'preview', blockers:['Writer completed']});}catch {process.exitCode=2;}`;
  return new Promise(resolve => { const child = spawn(process.execPath, ['--input-type=module', '-e', code, root]); child.on('exit', resolve); });
}
test('project progress serializes competing writers and expires discovery separately from configuration drift', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'anhedral-progress-race-'));
  try {
    writeFileSync(path.join(root, 'package.json'), '{"name":"race"}');
    const results = await Promise.all([writer(root), writer(root)]);
    assert.equal(results.filter(code => code === 0).length, 1);
    assert.equal(results.filter(code => code === 2).length, 1);
    assert.equal(readProjectProgress(root).revision, 1);
    const fingerprint = projectFingerprint(root);
    const observedAt = new Date(Date.now() - 7200000).toISOString();
    reportProjectProgress(root, { revision: 1, environment: 'preview', observations: [observation(fingerprint)], discovery: [{ provider: 'cloudflare', route: 'plugin', check: 'installed', outcome: 'passed', source: 'agent', observedAt, expiresAt: new Date(Date.now() - 3600000).toISOString(), evidence: 'Historical installation observation; current session callable tools absent' }] });
    let evaluated = evaluateProjectProgress(readProjectProgress(root), fingerprint).environments[0];
    assert.equal(evaluated.discovery[0].stale, true);
    assert.equal(evaluated.observations[0].stale, false);
    writeFileSync(path.join(root, 'package.json'), '{"name":"changed"}');
    evaluated = evaluateProjectProgress(readProjectProgress(root), projectFingerprint(root)).environments[0];
    assert.equal(evaluated.observations[0].stale, true);
    assert.equal(evaluated.discovery[0].check, 'installed', 'An installed plugin never implies current tool/account authorization');
    assert.equal(existsSync(path.join(root, '.anhedral-progress.lock')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

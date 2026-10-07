import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { registerProject, snapshot, updateSettings, providerGet, createDraft, savePlan, recordProgress, recordPiece } from '../.artifacts/control-panel/status.js';

test('control panel scopes local configuration and never exposes provider credentials', async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'anhedral-panel-'));
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  try {
    process.env.ANHEDRAL_STATE_DIR = path.join(temporary, 'state');
    delete process.env.ANHEDRAL_PROJECT_ROOTS;
    process.env.CLOUDFLARE_API_TOKEN = ['test', 'credential', 'private'].join('-');
    const root = path.join(temporary, 'project');
    mkdirSync(path.join(root, 'apps/web'), { recursive: true });
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'panel-test' }));
    const account = 'a'.repeat(32);
    writeFileSync(path.join(root, 'apps/web/wrangler.jsonc'), JSON.stringify({ name: 'test-web', account_id: account, r2_buckets: [{ binding: 'FILES', bucket_name: 'test-files' }], kv_namespaces: 'invalid', env: { production: { name: 'production-web' } } }));
    assert.equal((await snapshot()).project, null);
    assert.equal(existsSync(path.join(temporary, 'state/projects.json')), false);
    const project = registerProject(root);
    assert.equal((await snapshot(project.id)).resources.length, 2);
    assert.equal((await snapshot(project.id, 'preview')).resources.length, 0);
    assert.equal((await snapshot(project.id, 'production')).resources.length, 1);
    assert.throws(() => updateSettings(project.id, 'default', { repository: '../outside' }));
    await assert.rejects(snapshot('f'.repeat(16)), /not registered/);
    for (const environment of ['__proto__', 'constructor', 'prototype']) { await assert.rejects(snapshot(project.id, environment), /Invalid environment/); assert.throws(() => updateSettings(project.id, environment, {}), /Invalid environment/); }
    for (const url of ['https://example.com/', 'https://api.cloudflare.com:444/', ['https://user', 'api.cloudflare.com/'].join('@')]) await assert.rejects(providerGet(url), /not allowed/);
    let requests = 0;
    globalThis.fetch = async (url, options) => {
      requests++;
      assert.ok(url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${account}/`));
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify({ success: true, result: { secret: process.env.CLOUDFLARE_API_TOKEN } }));
    };
    const verified = await snapshot(project.id, 'default', true);
    assert.ok(verified.resources.every((resource) => resource.status === 'verified'));
    assert.equal(JSON.stringify(verified).includes(process.env.CLOUDFLARE_API_TOKEN), false);
    assert.equal(verified.readiness.productionReady, false);
    updateSettings(project.id, 'default', { cloudflareAccountId: 'b'.repeat(32) });
    const mismatch = await snapshot(project.id, 'default', true);
    assert.ok(mismatch.resources.every((resource) => resource.status === 'error'));
    assert.equal(requests, 2, 'Mismatched account must never be queried');
    writeFileSync(path.join(temporary, 'outside.json'), '{}');
    symlinkSync(path.join(temporary, 'outside.json'), path.join(root, 'anhedral.setup.json'));
    await assert.rejects(snapshot(project.id), /outside its allowed boundary/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('self-contained plugin performs an MCP round trip and publishes native UI entrypoints', async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'anhedral-mcp-'));
  const client = new Client({ name: 'anhedral-contract-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('plugins/anhedral/server.mjs')], env: { PATH: process.env.PATH || '', ANHEDRAL_STATE_DIR: temporary }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, JSON.parse(readFileSync("plugins/anhedral/plugin.json", "utf8")).version);
    const tools = await client.listTools();
    const open = tools.tools.find((tool) => tool.name === 'anhedral_open');
    assert.equal(tools.tools.length, 7);
    assert.equal(open.icons[0].mimeType, 'image/svg+xml');
    assert.deepEqual(open.icons[0].sizes, ['any']);
    assert.ok(open.icons[0].src.startsWith('data:image/svg+xml;base64,'));
    const mark = Buffer.from(open.icons[0].src.split(',')[1], 'base64').toString();
    assert.equal(mark, readFileSync('assets/images/svg/logo-white-subtract.svg', 'utf8'));
    assert.equal(mark.includes('fill="black"'), false, 'Sidebar icon must not include the square background');
    assert.deepEqual(client.getServerVersion().icons, open.icons);
    assert.equal(open.inputSchema.properties.environment.default, 'default');
    assert.deepEqual(open._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }]);
    assert.equal(open.annotations.readOnlyHint, true);
    const resource = await client.readResource({ uri: open._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.ok(resource.contents[0].text.includes('Build your stack.'));
    assert.deepEqual(resource.contents[0]._meta.ui.csp.connectDomains, []);
    const result = await client.callTool({ name: 'anhedral_open', arguments: {} });
    assert.equal(result.structuredContent.project, null);
    const invalid = await client.callTool({ name: 'anhedral_register_project', arguments: { folder: path.join(temporary, 'missing') } });
    assert.equal(invalid.isError, true);
    const projectRoot = path.join(temporary, 'project');
    mkdirSync(projectRoot);
    writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"mcp-project"}');
    const registered = await client.callTool({ name: 'anhedral_register_project', arguments: { folder: projectRoot } });
    assert.equal(registered.structuredContent.project.name, 'mcp-project');
    const id = registered.structuredContent.project.id;
    const configured = await client.callTool({ name: 'anhedral_update_settings', arguments: { projectId: id, environment: 'preview', repository: 'anhedral/anhedral-init' } });
    assert.equal(configured.structuredContent.environment, 'preview');
    assert.equal(configured.structuredContent.settings.repository, 'anhedral/anhedral-init');
    const draft = await client.callTool({ name: 'anhedral_create_project', arguments: { name: 'Native draft', folder: path.join(temporary, 'native-draft'), brief: 'Test the native planning contract', selected: ['next'], hosting: 'cloudflare' } });
    const draftId = draft.structuredContent.project.id;
    const progressed = await client.callTool({ name: 'anhedral_record_progress', arguments: { projectId: draftId, revision: 1, stage: 'plan', status: 'done', summary: 'Requirements inspected', evidence: ['Test requirements'] } });
    assert.equal(progressed.structuredContent.checklist[0].status, 'done');
    const changed = await client.callTool({ name: 'anhedral_plan_stack', arguments: { projectId: draftId, revision: 2, selected: ['next', 'r2'] } });
    assert.equal(changed.structuredContent.checklist[0].status, 'pending');
    assert.equal(changed.structuredContent.assembly.revision, 3);

  } finally { await client.close(); rmSync(temporary, { recursive: true, force: true }); }
});

test('project assembly preserves scope, evidence order, revisions and draft identity', async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'anhedral-assembly-'));
  const previous = { ...process.env };
  try {
    process.env.ANHEDRAL_STATE_DIR = path.join(temporary, 'state');
    delete process.env.ANHEDRAL_PROJECT_ROOTS;
    const folder = path.join(temporary, 'new-app');
    const draft = createDraft({ name: 'New app', folder, brief: 'A private document application', selected: ['next', 'r2'], hosting: 'cloudflare' });
    assert.equal(existsSync(folder), false, 'Planning must not write code');
    let state = await snapshot(draft.id);
    assert.equal(state.project.planned, true);
    assert.equal(state.resources.length, 0);
    assert.equal(state.readiness, undefined);
    assert.equal(state.assembly.revision, 1);
    assert.ok(state.checklist.find((step) => step.id === 'provision').requirements.some((item) => item.includes('Private R2')));
    assert.equal(state.connections.some((item) => item.name === 'Neon'), false, 'Unselected providers are not required');
    assert.throws(() => createDraft({ name: 'Conflict', folder: path.join(temporary, 'conflict'), brief: 'Conflict', selected: ['next', 'neon', 'd1'], hosting: 'cloudflare' }), /Choose one/);
    assert.throws(() => savePlan(draft.id, 'default', 1, { selected: ['expo', 'r2'], hosting: 'cloudflare' }), /bindings/);
    assert.throws(() => savePlan(draft.id, 'default', 1, { selected: ['next', 'email-sending'], hosting: 'cloudflare' }), /domain/);
    assert.throws(() => recordProgress(draft.id, 'default', 1, { stage: 'deploy', status: 'done', summary: 'Shipped', evidence: ['Release URL'] }), /earlier/);
    assert.throws(() => recordProgress(draft.id, 'default', 1, { stage: 'plan', status: 'done', summary: 'Confirmed', evidence: [] }), /evidence/);
    assert.throws(() => recordProgress(draft.id, 'default', 1, { stage: 'plan', status: 'active', summary: 'DATABASE_URL=postgres://private', evidence: [] }), /non-secret/);
    recordProgress(draft.id, 'default', 1, { stage: 'plan', status: 'done', summary: 'Requirements confirmed', evidence: ['Product requirements reviewed in this conversation'] });
    assert.throws(() => recordProgress(draft.id, 'default', 1, { stage: 'accounts', status: 'active', summary: 'Starting', evidence: [] }), /changed/);
    assert.throws(() => recordProgress(draft.id, 'preview', 2, { stage: 'accounts', status: 'active', summary: 'Starting', evidence: [] }), /changed/);
    recordProgress(draft.id, 'default', 2, { stage: 'accounts', status: 'blocked', summary: 'Client account access needed', evidence: [] });
    state = await snapshot(draft.id);
    assert.equal(state.checklist[1].status, 'blocked');
    assert.equal((await snapshot(draft.id, 'preview')).checklist[0].status, 'pending');
    savePlan(draft.id, 'default', 3, { selected: ['r2', 'next'], hosting: 'cloudflare' });
    assert.equal((await snapshot(draft.id)).checklist[0].status, 'done', 'Identical scope preserves evidence');
    recordProgress(draft.id, 'default', 4, { stage: 'plan', status: 'active', summary: 'Revisit requirements', evidence: [] });
    assert.equal((await snapshot(draft.id)).checklist[1].status, 'pending', 'Reopened prerequisites invalidate later evidence');
    savePlan(draft.id, 'default', 5, { selected: ['next'], hosting: 'cloudflare' });
    assert.equal((await snapshot(draft.id)).checklist[0].status, 'pending', 'Changed scope resets evidence');
    mkdirSync(folder);
    writeFileSync(path.join(folder, 'package.json'), '{"name":"initialized-app"}');
    assert.throws(() => createDraft({ name: 'Overwrite', folder, brief: 'No', selected: ['next'], hosting: 'cloudflare' }), /existing/);
    assert.throws(() => registerProject(temporary, draft.id), /package.json/);
    const registered = registerProject(folder, draft.id);
    assert.equal(registered.id, draft.id);
    assert.equal(registered.planned, false);
    assert.equal(registerProject(folder).id, draft.id, "Registering again preserves planned-project identity");
    state = await snapshot(draft.id);
    assert.equal(state.assembly.revision, 6, 'Initialization preserves the plan');
    assert.ok(state.readiness);
    assert.throws(() => recordPiece(draft.id, 'default', 6, { piece: 'neon', status: 'configured', summary: 'Not selected', evidence: ['Project identifier'] }), /not selected/);
    assert.throws(() => recordPiece(draft.id, 'default', 6, { piece: 'next', status: 'released', summary: 'No release verification', evidence: ['Release reference'] }), /verification/);
    assert.throws(() => recordPiece(draft.id, 'default', 6, { piece: 'next', status: 'starter', summary: 'No proof', evidence: [] }), /evidence/);
    recordPiece(draft.id, 'default', 6, { piece: 'next', status: 'starter', summary: 'Code initialized', evidence: ['package.json'] });
    assert.equal((await snapshot(draft.id)).assembly.pieces.next.status, 'starter');
    assert.equal((await snapshot(draft.id, 'preview')).assembly.pieces.next, undefined);

    assert.equal(state.readiness.productionReady, false, 'Checklist reports never assert product readiness');
    const local = createDraft({ name: 'Offline desktop', folder: path.join(temporary, 'offline'), brief: 'Offline device application', selected: ['electron', 'local-data'], hosting: 'cloudflare' });
    recordProgress(local.id, 'default', 1, { stage: 'plan', status: 'done', summary: 'Requirements reviewed', evidence: ['Product brief'] });
    recordProgress(local.id, 'default', 2, { stage: 'accounts', status: 'blocked', summary: 'Signing access pending', evidence: [] });
    recordProgress(local.id, 'default', 3, { stage: 'tools', status: 'done', summary: 'Local tools available', evidence: ['Toolchain version checks'] });
    recordProgress(local.id, 'default', 4, { stage: 'init', status: 'done', summary: 'Local project inspected', evidence: ['Source inspection'] });
    const offline = await snapshot(local.id);
    assert.equal(offline.checklist.find((step) => step.id === 'init').status, 'done', 'Local code work can proceed while provider access is blocked');
    assert.equal(offline.connections.some((item) => item.name === 'Cloudflare'), false, 'Local-only apps do not require hosted infrastructure');

  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    rmSync(temporary, { recursive: true, force: true });
  }
});

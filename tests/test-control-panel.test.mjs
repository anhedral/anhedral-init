import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { registerProject, snapshot, updateSettings, providerGet } from '../.artifacts/control-panel/status.js';

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
    const tools = await client.listTools();
    const open = tools.tools.find((tool) => tool.name === 'anhedral_open');
    assert.deepEqual(open._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }]);
    assert.equal(open.annotations.readOnlyHint, true);
    const resource = await client.readResource({ uri: open._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.ok(resource.contents[0].text.includes('Developer control panel'));
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
  } finally { await client.close(); rmSync(temporary, { recursive: true, force: true }); }
});

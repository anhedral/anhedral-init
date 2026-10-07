import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { CAPABILITIES, createSetupPlan } from '../dist/capabilities.js';
import { parseStandardOptions } from '../dist/standard.js';
import { scaffoldExtension } from '../dist/platforms/extension.js';

const plan = (...flags) => createSetupPlan(parseStandardOptions('new', ['/tmp/capability-plan', '--dry-run', ...flags]));

test('recipe requirements distinguish starter delivery, provider choice and web bootstrap', () => {
  const mobile = plan('--expo');
  assert.deepEqual(mobile.bootstrap, []);
  assert.equal(mobile.setup.tools.includes('Cloudflare security audit skill'), false);
  const web = plan('--next');
  assert.ok(web.bootstrap.includes('shadcn@4.21.1'));
  assert.equal(web.bootstrap.some((argument) => argument.includes('@latest')), false);
  const alternative = plan('--next', '--hosting=vercel');
  assert.equal(alternative.setup.access.some((requirement) => /exception|approval/i.test(requirement)), false);
  assert.equal(alternative.setup.tools.includes('Wrangler'), false);
  assert.equal(plan('--hono', '--layout=single').layout, 'single');
  for (const id of ['local-data', 'revenuecat', 'sentry', 'basin', 'styling']) assert.equal(CAPABILITIES[id].delivery, 'integration-boundary');
  for (const id of ['openai', 'ai-sdk', 'resend', 'posthog', 'stripe']) assert.equal(CAPABILITIES[id].delivery, 'sdk-factory');
  assert.match(CAPABILITIES.basin.resources.join(' '), /reports separately/);
  assert.match(CAPABILITIES.clerk.verify.join(' '), /route-group names do not authorize/);
});

test('WXT popup and sidepanel generate distinct entrypoints and minimum permissions', async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'anhedral-extension-recipes-'));
  try {
    for (const surface of ['sidepanel', 'popup']) {
      const root = path.join(temporary, surface);
      await scaffoldExtension(root, { projectName: 'test-extension', displayName: 'Test extension', extensionSurface: surface });
      const app = path.join(root, 'apps/extension');
      const config = readFileSync(path.join(app, 'wxt.config.ts'), 'utf8');
      assert.equal(config.includes("'sidePanel'"), surface === 'sidepanel');
      assert.equal(config.includes('side_panel:'), surface === 'sidepanel');
      assert.equal(config.includes("default_popup: 'popup.html'"), surface === 'popup');
      assert.equal(existsSync(path.join(app, 'src/entrypoints/background.ts')), surface === 'sidepanel');
      assert.equal(existsSync(path.join(app, `src/entrypoints/${surface}/index.html`)), true);
      const other = surface === 'popup' ? 'sidepanel' : 'popup';
      assert.equal(existsSync(path.join(app, `src/entrypoints/${other}`)), false);
      assert.match(config, /host_permissions: \[\]/);
      for (const file of ['wxt.config.ts', `src/entrypoints/${surface}/main.tsx`, `src/entrypoints/${surface}/app.tsx`]) {
        const output = ts.transpileModule(readFileSync(path.join(app, file), 'utf8'), { fileName: file, compilerOptions: { jsx: ts.JsxEmit.Preserve }, reportDiagnostics: true });
        assert.deepEqual(output.diagnostics, [], `${surface} ${file} must parse`);
      }
    }
    assert.throws(() => parseStandardOptions('new', ['/tmp/non-extension', '--hono', '--extension-surface=popup']), /requires --wxt/);
    assert.throws(() => parseStandardOptions('new', ['/tmp/unsupported-extension', '--wxt', '--extension-surface=content']), /sidepanel or popup/);
    assert.equal(plan('--wxt', '--extension-surface=popup').extensionSurface, 'popup');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

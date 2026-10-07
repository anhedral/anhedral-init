import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { componentObservations, componentState, latestObservations, providerAttention } from '../dist/progress-view.js';
import { projectFingerprint, reportProjectProgress } from '../dist/progress.js';
import { registerProject, updateSettings, snapshot } from '../.artifacts/control-panel/status.js';

const observed = (fields = {}) => ({ capability: 'r2', milestone: 'tested', source: 'agent', outcome: 'passed', observedAt: '2026-10-06T10:00:00Z', evidence: 'Scoped integration check', configurationFingerprint: 'a'.repeat(64), stale: false, ...fields });
const node = (resourceId) => ({ id: 'files', capability: 'r2', status: 'configured', ...(resourceId ? { resourceId } : {}) });

test('architecture evidence retains failures across resources, accounts and independent checks', () => {
  const progress = { observations: [
    observed({ resourceRef: 'bucket-a', accountRef: 'account-a', outcome: 'failed' }),
    observed({ resourceRef: 'bucket-b', accountRef: 'account-a', observedAt: '2026-10-06T11:00:00Z' }),
    observed({ resourceRef: 'bucket-b', accountRef: 'account-b', outcome: 'failed' }),
    observed({ resourceRef: 'bucket-b', accountRef: 'account-a', source: 'independent', outcome: 'failed' }),
  ] };
  assert.equal(latestObservations(progress.observations).length, 4);
  assert.equal(componentState(progress, node()), 'blocked');
  assert.equal(componentState(progress, node('bucket-a')), 'blocked');
  assert.equal(componentObservations(progress, node('bucket-a')).length, 1);
  const onlyAgent = { observations: progress.observations.slice(0, 2) };
  assert.equal(componentState(onlyAgent, node('bucket-b')), 'verified');
  assert.equal(componentState(onlyAgent, node()), 'blocked', 'A pass for another resource cannot erase an active failure');
  const superseded = { observations: [...onlyAgent.observations, observed({ resourceRef: 'bucket-a', accountRef: 'account-a', observedAt: '2026-10-06T12:00:00Z' })] };
  assert.equal(componentState(superseded, node()), 'verified', 'A newer check on the same resource can resolve its failure');
  assert.equal(componentState({ observations: [observed({ milestone: 'deployed' })] }, node()), 'planned', 'Deployment alone never verifies product behavior');
  assert.equal(componentState({ observations: [observed({ outcome: 'failed', stale: true }), observed({ resourceRef: 'current' })] }, node()), 'verified', 'Stale historical failures do not override current tests');
});

test('provider lookup failures prevent green nodes without asserting product failure or promoting availability', () => {
  const progress = { observations: [observed({ resourceRef: 'bucket-a' })] };
  for (const status of ['missing', 'error']) {
    const resources = [{ id: 'bucket-a', name: 'Files', status }];
    assert.equal(componentState(progress, node('bucket-a'), resources), 'blocked');
    assert.equal(providerAttention(resources), true);
    assert.equal(progress.observations[0].outcome, 'passed', 'A failed provider lookup does not rewrite product-test evidence');
    assert.equal(componentState(progress, node('bucket-a'), [{ id: 'other-bucket', name: 'Files', status }]), 'verified', 'Explicit resource IDs do not match another similarly named resource');
  }
  assert.equal(componentState(undefined, node('bucket-a'), [{ id: 'bucket-a', name: 'Files', status: 'verified' }]), 'configured', 'Resource existence does not prove product behavior');
  assert.equal(componentState(undefined, { ...node(), label: 'Files' }, [{ id: 'bucket-a', name: 'Files', status: 'missing' }]), 'blocked', 'Unlinked nodes can match the declared resource name');
});

test('clearing provider scope invalidates account evidence while preserving local evidence and declared Worker scope', async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'anhedral-cleared-scope-'));
  const previous = { ...process.env };
  try {
    process.env.ANHEDRAL_STATE_DIR = path.join(temporary, 'state');
    delete process.env.ANHEDRAL_PROJECT_ROOTS;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.NEON_API_KEY;
    const account = 'a'.repeat(32);
    for (const declared of [false, true]) {
      const root = path.join(temporary, declared ? 'declared' : 'settings-only');
      mkdirSync(root);
      writeFileSync(path.join(root, 'package.json'), '{"name":"scope-test"}');
      writeFileSync(path.join(root, 'anhedral.standard.json'), JSON.stringify({ products: ['next', 'neon'], hosting: 'cloudflare' }));
      if (declared) writeFileSync(path.join(root, 'wrangler.jsonc'), JSON.stringify({ name: 'scope-worker', account_id: account }));
      const project = registerProject(root);
      updateSettings(project.id, 'default', { cloudflareAccountId: account, neonProjectId: 'project-a' });
      const fingerprint = projectFingerprint(root);
      const evidence = (fields) => { const { stale, ...item } = observed({ capability: 'next', configurationFingerprint: fingerprint, ...fields }); return item; };
      reportProjectProgress(root, { revision: 0, environment: 'default', observations: [
        evidence({ milestone: 'generated' }),
        evidence({ milestone: 'tested' }),
        evidence({ milestone: 'deployed', accountRef: account }),
        evidence({ capability: 'neon', milestone: 'connected', accountRef: 'project-a' }),
      ], discovery: [{ provider: 'cloudflare', route: 'api', check: 'authorized', source: 'agent', outcome: 'passed', accountRef: account, observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), evidence: 'Scoped account access checked' }] });
      updateSettings(project.id, 'default', {});
      const progress = (await snapshot(project.id)).progressEvaluation.environments[0];
      assert.equal(progress.observations.find(item => item.milestone === 'generated').stale, false);
      assert.equal(progress.observations.find(item => item.milestone === 'tested').stale, false);
      assert.equal(progress.observations.find(item => item.milestone === 'deployed').stale, !declared);
      assert.equal(progress.observations.find(item => item.capability === 'neon').stale, true);
      assert.equal(progress.discovery[0].stale, !declared);
    }
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    rmSync(temporary, { recursive: true, force: true });
  }
});

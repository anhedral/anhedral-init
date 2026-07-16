import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scaffoldApi } from '../dist/templates/api.js';
import { scaffoldSharedPackages } from '../dist/templates/shared.js';

const root = mkdtempSync(path.join(tmpdir(), 'anhedral-billing-template-'));
const options = {
  projectName: 'billing-template',
  displayName: 'Billing Template',
  apps: { web: false, mobile: false, api: true, desktop: false, extension: false },
  features: { database: true, auth: true, billing: true, storage: false, nativeSubscriptions: false },
  skipInstall: true,
};
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

try {
  scaffoldSharedPackages(root, options);
  await scaffoldApi(root, options);

  const apiPackage = JSON.parse(read('apps/api/package.json'));
  assert.equal(apiPackage.devDependencies['@vitest/coverage-v8'], '4.1.0');
  assert.equal(apiPackage.scripts['test:coverage'], 'vitest run --coverage');
  const coverageConfig = read('apps/api/vitest.config.ts');
  assert.match(coverageConfig, /include: \['src\/\*\*\/\*\.ts'\]/);
  assert.match(coverageConfig, /exclude: \['src\/index\.ts'\]/);
  assert.match(coverageConfig, /lines: 68/);
  assert.match(coverageConfig, /statements: 65/);
  assert.match(coverageConfig, /functions: 60/);
  assert.match(coverageConfig, /branches: 55/);
  assert.match(read('apps/api/.gitignore'), /^coverage$/m);

  const schema = read('packages/db/src/schema.ts');
  const subscriptionSchema = schema.slice(schema.indexOf('export const subscriptions'), schema.indexOf('export const webhookEvents'));
  assert.match(subscriptionSchema, /userId: text\('user_id'\)\.notNull\(\)\.unique\(\)/);
  assert.doesNotMatch(subscriptionSchema, /references\(\(\) => users\.id/);
  assert.match(subscriptionSchema, /eventTimestamp: timestamp\('event_timestamp'\)\.notNull\(\)/);
  assert.match(schema, /status: text\('status'\)\.notNull\(\)\.default\('pending'\)/);
  assert.match(schema, /claimToken: text\('claim_token'\)/);
  assert.match(schema, /attempts: integer\('attempts'\)\.notNull\(\)\.default\(0\)/);

  const billing = read('apps/api/src/billing.ts');
  assert.match(billing, /const CLAIM_LEASE_MS = 5 \* 60 \* 1000/);
  assert.match(billing, /eq\(webhookEvents\.status, 'failed'\)/);
  assert.match(billing, /lt\(webhookEvents\.claimedAt/);
  assert.match(billing, /eq\(webhookEvents\.claimToken, claimToken\)/);
  assert.match(billing, /sqlClient\.transaction\(\[/);
  assert.match(billing, /WITH "owned_claim" AS/);
  assert.match(billing, /FOR UPDATE/);
  assert.match(billing, /"subscriptions"\."event_timestamp" <= excluded\."event_timestamp"/);
  assert.match(billing, /RETURNING "provider_event_id" AS "providerEventId"/);
  assert.match(billing, /effectiveEntitlementStatus\(subscription\.status, subscription\.expiresAt\)/);
  assert.match(billing, /expiresAt\.getTime\(\) > now\.getTime\(\)/);

  const routes = read('apps/api/src/routes.ts');
  assert.match(routes, /claim\.status === 'processed'/);
  assert.match(routes, /claim\.status === 'in_progress'/);
  assert.match(routes, /header\('retry-after', '5'\)\.code\(503\)/);
  assert.match(routes, /billingStore\.reconcile\(providerEventId, claim\.token, subscriptionUpdates\)/);
  assert.match(routes, /await billingStore\.fail\(providerEventId, claim\.token, message\)/);

  const app = read('apps/api/src/application.ts');
  assert.match(app, /trustProxy: env\.TRUST_PROXY_HOPS > 0 \? env\.TRUST_PROXY_HOPS : false/);
  assert.match(app, /prefix: '\/api'/);
  assert.doesNotMatch(app, /trustProxy: true/);

  const routeTests = read('apps/api/tests/revenuecat-webhook.test.ts');
  assert.match(routeTests, /TRUST_PROXY_HOPS: 0/);
  assert.match(routeTests, /url: '\/api\/webhooks\/revenuecat'/);
  assert.match(routeTests, /body: object = payload/);
  assert.doesNotMatch(routeTests, /body: unknown/);
  assert.match(routeTests, /another worker owns the claim/);
  assert.match(routeTests, /acknowledges a processed duplicate/);
  assert.match(routeTests, /releases a failed claim/);
  assert.match(routeTests, /atomic database write failure/);
  assert.match(routeTests, /one database transaction/);
  assert.match(routeTests, /persisted active entitlement as expired/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Billing template tests passed');

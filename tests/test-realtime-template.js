import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scaffoldApi } from '../dist/templates/api.js';
import { scaffoldSharedPackages } from '../dist/templates/shared.js';
import { scaffoldWeb } from '../dist/templates/web.js';

const root = mkdtempSync(path.join(tmpdir(), 'anhedral-realtime-template-'));
const options = {
  projectName: 'realtime-template',
  displayName: 'Realtime Template',
  apps: { web: true, mobile: false, api: true, desktop: false, extension: false },
  features: {
    database: true,
    auth: true,
    realtime: true,
    billing: false,
    storage: false,
    nativeSubscriptions: false,
    electronUpdater: false,
  },
  skipInstall: true,
};
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

try {
  scaffoldSharedPackages(root, options);
  await scaffoldApi(root, options);
  await scaffoldWeb(root, options);

  const apiPackage = JSON.parse(read('apps/api/package.json'));
  const webPackage = JSON.parse(read('apps/web/package.json'));
  assert.equal(apiPackage.dependencies.ably, '2.24.0');
  assert.equal(webPackage.dependencies['@shared/realtime'], 'workspace:*');

  assert.equal(existsSync(path.join(root, 'apps/api/src/realtime.ts')), true);
  assert.equal(existsSync(path.join(root, 'apps/api/src/billing.ts')), false);
  assert.equal(existsSync(path.join(root, 'packages/realtime/src/generated.ts')), true);
  assert.equal(existsSync(path.join(root, 'packages/realtime/src/app.ts')), true);

  const schema = read('packages/db/src/generated-schema.ts');
  assert.doesNotMatch(schema, /realtimeOutbox|subscriptions|webhookEvents/);

  const contracts = read('packages/contracts/src/generated.ts');
  const apiClient = read('packages/api-client/src/generated.ts');
  assert.match(contracts, /RealtimeTokenRequestSchema/);
  assert.doesNotMatch(contracts, /SubscriptionChangedEventSchema|EntitlementResponseSchema/);
  assert.match(apiClient, /getRealtimeToken/);
  assert.doesNotMatch(apiClient, /getEntitlement|refreshEntitlement/);

  const realtime = read('apps/api/src/realtime.ts');
  assert.match(realtime, /return 'private:users:' \+ userId/);
  assert.match(realtime, /capability: JSON\.stringify\(\{ \[userChannelName\(userId\)\]: \['subscribe'\] \}\)/);
  assert.match(realtime, /publishUserMessage/);
  assert.match(realtime, /id: message\.id/);

  const routes = read('apps/api/src/routes.ts');
  assert.match(routes, /app\.post\('\/realtime\/token'/);
  assert.doesNotMatch(routes, /subscriptions|revenuecat|internal\/realtime\/flush/);

  const envExample = read('apps/api/.env.example');
  assert.match(envExample, /^ABLY_API_KEY=$/m);
  assert.doesNotMatch(envExample, /RC_WEBHOOK_SECRET|RC_SECRET_API_KEY|CRON_SECRET/);

  const realtimeApp = read('packages/realtime/src/app.ts');
  assert.match(realtimeApp, /product-specific, schema-validated realtime subscriptions/);
  assert.match(realtimeApp, /export \{\};/, 'the empty extension seam must remain a TypeScript module');
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Standalone realtime template tests passed');

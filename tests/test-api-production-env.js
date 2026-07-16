import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scaffoldApi } from '../dist/templates/api.js';

const root = mkdtempSync(path.join(tmpdir(), 'anhedral-api-production-env-'));
const apiOnlyRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-api-only-production-env-'));
const options = {
  projectName: 'provider-validation',
  displayName: 'Provider Validation',
  apps: { web: true, mobile: false, api: true, desktop: true, extension: false },
  features: { database: true, auth: true, billing: true, storage: true, nativeSubscriptions: false },
  skipInstall: true,
};
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

try {
  await scaffoldApi(root, options);

  const env = read('apps/api/src/env.ts');
  assert.match(env, /assertProductionDatabaseUrl/);
  assert.match(env, /\['postgres:', 'postgresql:'\]/);
  assert.match(env, /non-placeholder username and password credentials/);
  assert.match(env, /non-local, non-placeholder database host/);
  assert.match(env, /assertProductionClerkKey/);
  assert.match(env, /'pk_live_'/);
  assert.match(env, /'sk_live_'/);
  assert.match(env, /assertStrongBillingSecret/);
  assert.match(env, /ABLY_API_KEY/);
  assert.match(env, /R2_ACCOUNT_ID must be a 32-character/);
  assert.match(env, /R2_SECRET_ACCESS_KEY must be a 64-character/);
  assert.match(env, /R2_BUCKET must be 3-63 lowercase/);
  assert.match(env, /CRON_SECRET must be at least 32 characters/);
  assert.match(env, /only explicit HTTPS origins in production/);
  assert.match(env, /literal null is allowed for desktop applications/);

  const tests = read('apps/api/tests/env.test.ts');
  assert.match(tests, /accepts a complete, well-shaped provider configuration/);
  assert.match(tests, /requires a real PostgreSQL URL/);
  assert.match(tests, /requires well-formed Clerk live keys/);
  assert.match(tests, /retains strong RevenueCat server-secret validation/);
  assert.match(tests, /validates R2 credential and bucket formats/);
  assert.match(tests, /retaining the desktop null origin/);

  const example = read('apps/api/.env.example');
  assert.match(example, /Production requires a postgres\/postgresql URL/);
  assert.match(example, /pk_live_ \/ sk_live_/);
  assert.match(example, /32-hex account ID/);
  assert.match(example, /at least 32 characters/);
  assert.match(example, /Server-only Ably API key/);

  await scaffoldApi(apiOnlyRoot, {
    ...options,
    apps: { web: false, mobile: false, api: true, desktop: false, extension: false },
    features: { database: false, auth: false, billing: false, storage: false, nativeSubscriptions: false },
  });
  const apiOnlyEnv = readFileSync(path.join(apiOnlyRoot, 'apps/api/src/env.ts'), 'utf8');
  const apiOnlyTests = readFileSync(path.join(apiOnlyRoot, 'apps/api/tests/env.test.ts'), 'utf8');
  assert.match(apiOnlyEnv, /for \(const origin of env\.CORS_ORIGINS\)/);
  assert.match(apiOnlyEnv, /only explicit HTTPS origins in production/);
  assert.doesNotMatch(apiOnlyEnv, /Missing production environment variable: CORS_ORIGINS/);
  assert.match(apiOnlyTests, /API-only deployment opts into browser CORS/);
} finally {
  rmSync(root, { recursive: true, force: true });
  rmSync(apiOnlyRoot, { recursive: true, force: true });
}

console.log('API production environment tests passed');

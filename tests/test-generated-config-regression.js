import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const scaffoldSource = readFileSync(path.join(repoRoot, 'src', 'scaffold.ts'), 'utf8');
const frontendSource = readFileSync(path.join(repoRoot, 'src', 'templates', 'frontend.ts'), 'utf8');
const backendSource = readFileSync(path.join(repoRoot, 'src', 'templates', 'backend.ts'), 'utf8');
const extensionSource = readFileSync(path.join(repoRoot, 'src', 'templates', 'extension.ts'), 'utf8');
const dependenciesSource = readFileSync(path.join(repoRoot, 'src', 'dependencies.ts'), 'utf8');

assert.match(scaffoldSource, /subscriptionTier: text\('subscription_tier'\)\.notNull\(\)\.default\('free'\)/);
assert.doesNotMatch(scaffoldSource, /default\('starter'\)/);

assert.match(frontendSource, /output: 'static'/);
assert.match(frontendSource, /destination: '\/index\.html'/);
assert.match(frontendSource, /redeemPromoCode\(code: string\)/);
assert.match(frontendSource, /return this\.redeemCode\(code\)/);
assert.doesNotMatch(frontendSource, /output: 'single'/);

assert.match(backendSource, /version: 2/);
assert.match(backendSource, /use: '@vercel\/node'/);
assert.match(backendSource, /ANHEDRAL_DEMO must be false in production/);

assert.match(scaffoldSource, /Build Expo web/);
assert.match(scaffoldSource, /pnpm --filter \.\/apps\/extension zip/);

assert.match(extensionSource, /function writeButtonComponent/);
assert.doesNotMatch(extensionSource, /shadcn.*add button/);
assert.match(extensionSource, /permissions: \['activeTab', 'cookies', 'storage', 'sidePanel'\]/);
assert.match(extensionSource, /minimum_chrome_version: '114'/);
assert.match(extensionSource, /side_panel: \{\s+default_path: 'sidepanel\.html'/);
assert.match(extensionSource, /setPanelBehavior\(\{ openPanelOnActionClick: true \}\)/);

assert.doesNotMatch(dependenciesSource, /@latest\b/);
assert.doesNotMatch(dependenciesSource, /'\^[^']+'/);

console.log('Generated config regression tests passed');

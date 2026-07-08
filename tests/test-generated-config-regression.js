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
const webSource = readFileSync(path.join(repoRoot, 'src', 'templates', 'web.ts'), 'utf8');
const desktopSource = readFileSync(path.join(repoRoot, 'src', 'templates', 'desktop.ts'), 'utf8');
const dependenciesSource = readFileSync(path.join(repoRoot, 'src', 'dependencies.ts'), 'utf8');

assert.match(scaffoldSource, /subscriptionTier: text\('subscription_tier'\)\.notNull\(\)\.default\('free'\)/);
assert.doesNotMatch(scaffoldSource, /default\('starter'\)/);
assert.match(scaffoldSource, /@shared\/contracts/);
assert.match(scaffoldSource, /CreateUploadRequestSchema/);

assert.match(frontendSource, /output: 'static'/);
assert.match(frontendSource, /destination: '\/'/);
assert.match(frontendSource, /'@clerk\/expo': FRONTEND_ADDON_DEPENDENCIES\['@clerk\/expo'\]/);
assert.doesNotMatch(frontendSource, /clerk-expo/);
assert.match(frontendSource, /writeEasConfig/);
assert.doesNotMatch(frontendSource, /redeemPromoCode\(code: string\)/);
assert.doesNotMatch(frontendSource, /return this\.redeemCode\(code\)/);
assert.match(frontendSource, /delete packageJson\.dependencies\['expo-image-picker'\]/);
assert.doesNotMatch(frontendSource, /output: 'single'/);

assert.match(backendSource, /buildCommand: 'pnpm build'/);
assert.match(backendSource, /devCommand: 'vercel dev'/);
assert.doesNotMatch(backendSource, /use: '@vercel\/node'/);
assert.match(backendSource, /ANHEDRAL_DEMO must be false in production/);
assert.match(backendSource, /src\/routes\/storage\.ts/);
assert.match(backendSource, /createSignedUploadUrl/);
assert.match(backendSource, /prefix: '\/api'/);

assert.match(scaffoldSource, /Build Expo web/);
assert.match(scaffoldSource, /const services: Record<string, Record<string, string>> = \{\};/);
assert.match(scaffoldSource, /if \(options\.apps\.web\)/);
assert.match(scaffoldSource, /if \(options\.apps\.api\)/);
assert.match(scaffoldSource, /source: '\/api\/\(\.\*\)'/);
assert.match(scaffoldSource, /pnpm --filter \.\/apps\/extension zip/);
assert.match(scaffoldSource, /pnpm --filter \.\/apps\/desktop build:all/);
assert.match(scaffoldSource, /'apps\/\*', 'packages\/\*'/);
assert.match(scaffoldSource, /writeAnhedralManifest/);
assert.match(scaffoldSource, /readAnhedralManifest/);
assert.match(scaffoldSource, /export async function scaffoldAddModules/);
assert.match(scaffoldSource, /mode: 'modular'/);
assert.match(frontendSource, /path\.join\(root, 'apps\/mobile'\)/);
assert.match(backendSource, /path\.join\(root, 'apps\/api'\)/);
assert.match(extensionSource, /path\.join\(root, 'apps\/extension'\)/);
assert.match(webSource, /path\.join\(root, 'apps\/web'\)/);
assert.match(webSource, /pnpm dlx shadcn@latest init -d --template next --name web/);
assert.match(webSource, /Next\.js web app/);
assert.match(desktopSource, /path\.join\(root, 'apps\/desktop'\)/);
assert.match(desktopSource, /electron-builder --mac --win --linux/);

assert.match(extensionSource, /function writeButtonComponent/);
assert.doesNotMatch(extensionSource, /shadcn.*add button/);
assert.match(extensionSource, /pnpm dlx --allow-build=esbuild --allow-build=spawn-sync/);
assert.match(extensionSource, /permissions: \['activeTab', 'cookies', 'storage', 'sidePanel'\]/);
assert.match(extensionSource, /minimum_chrome_version: '114'/);
assert.match(extensionSource, /side_panel: \{\s+default_path: 'sidepanel\.html'/);
assert.match(extensionSource, /chunkSizeWarningLimit: 3000/);
assert.match(extensionSource, /setPanelBehavior\(\{ openPanelOnActionClick: true \}\)/);

assert.doesNotMatch(dependenciesSource, /@latest\b/);
assert.doesNotMatch(dependenciesSource, /'\^[^']+'/);
assert.doesNotMatch(dependenciesSource, /clerk-expo/);

console.log('Generated config regression tests passed');

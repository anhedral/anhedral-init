import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'anhedral-default-web-template-'));

try {
  const { writeDefaultWebEnvExample, writeDefaultWebFiles } = await import(path.join(repoRoot, 'dist', 'templates', 'default-web.js'));

  writeDefaultWebEnvExample(tempRoot);
  writeDefaultWebFiles(tempRoot, 'Demo App');

  const nextConfigPath = path.join(tempRoot, 'next.config.mjs');
  const clerkHelperPath = path.join(tempRoot, 'lib', 'auth', 'clerk.ts');
  const buttonHelperPath = path.join(tempRoot, 'lib', 'ui', 'button.ts');
  const buttonComponentPath = path.join(tempRoot, 'components', 'ui', 'button.tsx');
  const homePagePath = path.join(tempRoot, 'app', 'page.tsx');
  const dashboardPagePath = path.join(tempRoot, 'app', 'dashboard', 'page.tsx');
  const layoutPath = path.join(tempRoot, 'app', 'layout.tsx');
  const userMenuPath = path.join(tempRoot, 'components', 'dashboard', 'header-user-menu.tsx');
  const avatarRoutePath = path.join(tempRoot, 'app', 'api', 'account', 'avatar', 'route.ts');
  const stripeHelperPath = path.join(tempRoot, 'lib', 'payments', 'stripe.ts');
  const logoPath = path.join(tempRoot, 'public', 'anhedral.svg');
  const legacyLogoPath = path.join(tempRoot, 'public', 'anhedral-mark.svg');

  assert.equal(existsSync(nextConfigPath), true, 'next.config.mjs should exist');
  assert.equal(existsSync(clerkHelperPath), true, 'shared Clerk helper should exist');
  assert.equal(existsSync(buttonHelperPath), true, 'shared button helper should exist');
  assert.equal(existsSync(buttonComponentPath), true, 'button component should exist');
  assert.equal(existsSync(homePagePath), true, 'home page should exist');
  assert.equal(existsSync(dashboardPagePath), true, 'dashboard page should exist');
  assert.equal(existsSync(layoutPath), true, 'layout should exist');
  assert.equal(existsSync(userMenuPath), true, 'header user menu should exist');
  assert.equal(existsSync(avatarRoutePath), true, 'avatar route should exist');
  assert.equal(existsSync(stripeHelperPath), true, 'stripe helper should exist');
  assert.equal(existsSync(logoPath), true, 'anhedral.svg logo should exist');
  assert.equal(existsSync(legacyLogoPath), false, 'legacy anhedral-mark.svg should not exist');

  const nextConfig = readFileSync(nextConfigPath, 'utf8');
  const clerkHelper = readFileSync(clerkHelperPath, 'utf8');
  const buttonHelper = readFileSync(buttonHelperPath, 'utf8');
  const buttonComponent = readFileSync(buttonComponentPath, 'utf8');
  const homePage = readFileSync(homePagePath, 'utf8');
  const dashboardPage = readFileSync(dashboardPagePath, 'utf8');
  const layout = readFileSync(layoutPath, 'utf8');
  const userMenu = readFileSync(userMenuPath, 'utf8');
  const avatarRoute = readFileSync(avatarRoutePath, 'utf8');
  const stripeHelper = readFileSync(stripeHelperPath, 'utf8');
  const sourceLogo = readFileSync(path.join(repoRoot, 'anhedral.svg'), 'utf8');
  const generatedLogo = readFileSync(logoPath, 'utf8');

  assert.match(nextConfig, /reactCompiler:\s*true/);
  assert.match(clerkHelper, /export function getClerkProfile/);
  assert.match(clerkHelper, /export function getPrimaryEmail/);
  assert.match(buttonHelper, /export const buttonVariants = cva/);
  assert.match(buttonComponent, /import \{ type ButtonVariantProps, buttonVariants \} from '@\/lib\/ui\/button';/);
  assert.match(homePage, /import \{ buttonVariants \} from '@\/lib\/ui\/button';/);
  assert.match(dashboardPage, /import \{ getClerkProfile \} from '@\/lib\/auth\/clerk';/);
  assert.match(dashboardPage, /import \{ buttonVariants \} from '@\/lib\/ui\/button';/);
  assert.doesNotMatch(dashboardPage, /user\?\.firstName/);
  assert.match(layout, /logoImageUrl:\s*'\/anhedral\.svg'/);
  assert.match(userMenu, /import Image from 'next\/image';/);
  assert.doesNotMatch(userMenu, /useTransition/);
  assert.doesNotMatch(userMenu, /<img/);
  assert.match(avatarRoute, /import \{ getClerkProfile \} from '@\/lib\/auth\/clerk';/);
  assert.match(stripeHelper, /return new Stripe\(process\.env\.STRIPE_SECRET_KEY\);/);
  assert.doesNotMatch(stripeHelper, /apiVersion:/);
  assert.equal(generatedLogo, sourceLogo);

  console.log('Default web template regression test passed');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

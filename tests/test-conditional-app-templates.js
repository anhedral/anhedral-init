import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { scaffoldDesktop } from '../dist/templates/desktop.js';
import { scaffoldExtension } from '../dist/templates/extension.js';
import { scaffoldMobile } from '../dist/templates/mobile.js';
import { scaffoldSharedPackages } from '../dist/templates/shared.js';
import { scaffoldWeb } from '../dist/templates/web.js';

function options(mode) {
  const hasApi = mode !== 'app-only';
  const hasAuth = mode === 'auth' || mode === 'native';
  const hasNativeSubscriptions = mode === 'native' || mode === 'native-anonymous';
  return {
    projectName: 'conditional-app',
    displayName: 'Conditional App',
    apps: {
      web: false,
      mobile: false,
      api: hasApi,
      desktop: true,
      extension: true,
    },
    features: {
      database: hasApi,
      auth: hasAuth,
      billing: hasAuth,
      storage: false,
      nativeSubscriptions: hasNativeSubscriptions,
    },
    githubOrg: null,
    skipInstall: true,
  };
}

function read(root, relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function packageJson(root, app) {
  return JSON.parse(read(root, `apps/${app}/package.json`));
}

const roots = {
  appOnly: mkdtempSync(path.join(tmpdir(), 'anhedral-app-only-')),
  api: mkdtempSync(path.join(tmpdir(), 'anhedral-app-api-')),
  auth: mkdtempSync(path.join(tmpdir(), 'anhedral-app-auth-')),
  native: mkdtempSync(path.join(tmpdir(), 'anhedral-app-native-subscriptions-')),
  nativeAnonymous: mkdtempSync(path.join(tmpdir(), 'anhedral-app-native-anonymous-')),
  numericName: mkdtempSync(path.join(tmpdir(), 'anhedral-app-numeric-name-')),
};
const originalToolchain = process.env.ANHEDRAL_TOOLCHAIN;

try {
  process.env.ANHEDRAL_TOOLCHAIN = 'stable';
  await scaffoldWeb(roots.appOnly, options('app-only'));
  await scaffoldMobile(roots.appOnly, options('app-only'));
  await scaffoldDesktop(roots.appOnly, options('app-only'));
  await scaffoldExtension(roots.appOnly, options('app-only'));
  await scaffoldWeb(roots.api, options('api'));
  await scaffoldMobile(roots.api, options('api'));
  await scaffoldDesktop(roots.api, options('api'));
  await scaffoldExtension(roots.api, options('api'));
  scaffoldSharedPackages(roots.api, options('api'));
  await scaffoldWeb(roots.auth, options('auth'));
  await scaffoldMobile(roots.auth, options('auth'));
  await scaffoldDesktop(roots.auth, options('auth'));
  await scaffoldExtension(roots.auth, options('auth'));
  await scaffoldMobile(roots.native, options('native'));
  await scaffoldMobile(roots.nativeAnonymous, options('native-anonymous'));
  await scaffoldMobile(roots.numericName, { ...options('app-only'), projectName: '123-app' });

  assert.equal(JSON.parse(read(roots.numericName, 'apps/mobile/app.json')).expo.scheme, 'app-123-app');

  for (const app of ['desktop', 'extension']) {
    const appOnlyPackage = packageJson(roots.appOnly, app);
    assert.equal(appOnlyPackage.dependencies['@shared/api-client'], undefined);
    assert.equal(appOnlyPackage.dependencies[app === 'desktop' ? '@clerk/clerk-js' : '@clerk/chrome-extension'], undefined);

    const apiPackage = packageJson(roots.api, app);
    assert.equal(apiPackage.dependencies['@shared/api-client'], 'workspace:*');
    assert.equal(apiPackage.dependencies[app === 'desktop' ? '@clerk/clerk-js' : '@clerk/chrome-extension'], undefined);

    const authPackage = packageJson(roots.auth, app);
    assert.equal(authPackage.dependencies['@shared/api-client'], 'workspace:*');
    assert.ok(authPackage.dependencies[app === 'desktop' ? '@clerk/clerk-js' : '@clerk/chrome-extension']);
    if (app === 'desktop') {
      assert.ok(authPackage.dependencies['@clerk/ui']);
      assert.ok(authPackage.dependencies['@solana/web3.js']);
      assert.equal(appOnlyPackage.dependencies['@solana/web3.js'], undefined);
      assert.equal(apiPackage.dependencies['@solana/web3.js'], undefined);
    }
  }

  assert.equal(packageJson(roots.appOnly, 'web').dependencies['@shared/api-client'], undefined);
  assert.equal(packageJson(roots.appOnly, 'web').dependencies['@clerk/nextjs'], undefined);
  assert.equal(packageJson(roots.appOnly, 'mobile').dependencies['@shared/api-client'], undefined);
  assert.equal(packageJson(roots.appOnly, 'mobile').dependencies['@clerk/expo'], undefined);

  assert.equal(packageJson(roots.api, 'web').dependencies['@shared/api-client'], 'workspace:*');
  assert.equal(packageJson(roots.api, 'web').dependencies['@clerk/nextjs'], undefined);
  assert.equal(packageJson(roots.api, 'mobile').dependencies['@shared/api-client'], 'workspace:*');
  assert.equal(packageJson(roots.api, 'mobile').dependencies['@clerk/expo'], undefined);

  const authWebPackage = packageJson(roots.auth, 'web');
  assert.ok(authWebPackage.dependencies['@clerk/nextjs']);
  assert.ok(authWebPackage.dependencies['@clerk/ui']);
  assert.equal(authWebPackage.dependencies['@clerk/react'], undefined);

  const authMobilePackage = packageJson(roots.auth, 'mobile');
  assert.ok(authMobilePackage.dependencies['@clerk/expo']);
  assert.ok(authMobilePackage.dependencies['expo-secure-store']);
  assert.equal(authMobilePackage.dependencies['react-native-purchases'], undefined);
  assert.equal(authMobilePackage.dependencies['react-native-purchases-ui'], undefined);
  assert.equal(authMobilePackage.dependencies['@clerk/expo-passkeys'], undefined);
  assert.equal(authMobilePackage.dependencies['expo-apple-authentication'], undefined);
  assert.equal(authMobilePackage.dependencies['expo-auth-session'], undefined);
  assert.equal(authMobilePackage.dependencies['expo-local-authentication'], undefined);
  assert.equal(authMobilePackage.dependencies['expo-web-browser'], undefined);

  const nativeMobilePackage = packageJson(roots.native, 'mobile');
  assert.ok(nativeMobilePackage.dependencies['react-native-purchases']);
  assert.ok(nativeMobilePackage.dependencies['react-native-purchases-ui']);
  assert.equal(nativeMobilePackage.devDependencies['@testing-library/dom'], '10.4.1');

  const nativeAnonymousPackage = packageJson(roots.nativeAnonymous, 'mobile');
  assert.equal(nativeAnonymousPackage.dependencies['@clerk/expo'], undefined);
  assert.ok(nativeAnonymousPackage.dependencies['react-native-purchases']);

  for (const root of [roots.appOnly, roots.api, roots.auth]) {
    for (const app of ['desktop', 'extension']) {
      const manifest = packageJson(root, app);
      assert.equal(manifest.devDependencies.vite, '7.3.6');
      assert.equal(manifest.dependencies['class-variance-authority'], undefined);
      assert.equal(manifest.dependencies['lucide-react'], undefined);
    }
    assert.equal(packageJson(root, 'desktop').devDependencies['@vitejs/plugin-react'], '5.2.0');
    assert.equal(packageJson(root, 'desktop').dependencies.bs58, '6.0.0');
    assert.equal(packageJson(root, 'desktop').scripts.dev, 'tsc -p tsconfig.main.json && node scripts/dev.mjs');
    assert.match(read(root, 'apps/desktop/scripts/dev.mjs'), /electronCommand/);
    assert.match(read(root, 'apps/desktop/scripts/dev.mjs'), /VITE_DEV_SERVER_URL/);
    assert.match(read(root, 'apps/desktop/vite.config.ts'), /base: '\.\/'/);
    assert.doesNotMatch(read(root, 'apps/desktop/vite.config.ts'), /@tailwindcss\/vite/);
    assert.match(read(root, 'apps/desktop/postcss.config.mjs'), /@tailwindcss\/postcss/);
    assert.match(read(root, 'apps/desktop/src/renderer/styles.css'), /@import "tailwindcss"/);
    assert.match(read(root, 'apps/desktop/src/renderer/styles.css'), /--color-primary: var\(--primary\)/);
    assert.equal(existsSync(path.join(root, 'apps/extension/.env')), false);
    assert.equal(existsSync(path.join(root, 'apps/extension/.git')), false);
  }

  assert.equal(read(roots.appOnly, 'apps/desktop/.env.example'), '');
  assert.equal(existsSync(path.join(roots.appOnly, 'apps/desktop/src/renderer/lib/api.ts')), false);
  assert.equal(existsSync(path.join(roots.appOnly, 'apps/desktop/src/renderer/lib/auth.ts')), false);
  assert.doesNotMatch(read(roots.appOnly, 'apps/desktop/src/renderer/main.tsx'), /shared API|Clerk|Open account/);
  assert.equal(existsSync(path.join(roots.appOnly, 'apps/web/components/account-actions.tsx')), false);
  assert.equal(existsSync(path.join(roots.appOnly, 'apps/web/hooks/use-api-client.ts')), false);
  assert.equal(existsSync(path.join(roots.appOnly, 'apps/mobile/hooks/use-api-client.ts')), false);
  assert.equal(existsSync(path.join(roots.appOnly, 'apps/mobile/lib/subscriptions.ts')), false);

  assert.match(read(roots.api, 'apps/desktop/.env.example'), /VITE_API_URL/);
  assert.doesNotMatch(read(roots.api, 'apps/desktop/.env.example'), /CLERK/);
  assert.match(read(roots.api, 'apps/desktop/src/renderer/lib/api.ts'), /@shared\/api-client/);
  assert.doesNotMatch(read(roots.api, 'apps/desktop/src/renderer/lib/api.ts'), /getAuthToken/);
  assert.equal(existsSync(path.join(roots.api, 'apps/desktop/src/renderer/lib/auth.ts')), false);
  assert.equal(existsSync(path.join(roots.api, 'apps/web/hooks/use-api-client.ts')), false);
  assert.equal(existsSync(path.join(roots.api, 'apps/mobile/hooks/use-api-client.ts')), false);
  assert.doesNotMatch(read(roots.api, 'apps/web/lib/api.ts'), /platform:/);
  assert.doesNotMatch(read(roots.api, 'apps/mobile/lib/api.ts'), /platform:/);
  assert.match(read(roots.api, 'apps/web/lib/api.ts'), /NODE_ENV === 'production' && url\.protocol !== 'https:'/);
  assert.match(read(roots.api, 'apps/mobile/lib/api.ts'), /!__DEV__ && url\.protocol !== 'https:'/);
  assert.match(read(roots.api, 'apps/desktop/src/renderer/lib/api.ts'), /import\.meta\.env\.PROD && url\.protocol !== 'https:'/);
  assert.match(read(roots.api, 'apps/web/.env.example'), /^NEXT_PUBLIC_API_URL=http:\/\/localhost:8787\/api$/m);
  assert.match(read(roots.api, 'apps/mobile/.env.example'), /^EXPO_PUBLIC_API_URL=http:\/\/localhost:8787\/api$/m);
  assert.match(read(roots.api, 'apps/desktop/.env.example'), /^VITE_API_URL=http:\/\/localhost:8787\/api$/m);
  assert.match(read(roots.api, 'apps/extension/.env.example'), /^VITE_API_URL=http:\/\/localhost:8787\/api$/m);
  for (const apiPath of [
    'apps/web/lib/api.ts',
    'apps/mobile/lib/api.ts',
    'apps/desktop/src/renderer/lib/api.ts',
    'apps/extension/src/lib/api.ts',
  ]) {
    const source = read(roots.api, apiPath);
    assert.match(source, /normalizeApiBaseUrl\(candidate,/);
    assert.match(source, /return normalized;/);
  }
  const sharedApiClient = read(roots.api, 'packages/api-client/src/index.ts');
  assert.match(sharedApiClient, /const hasBody = init\.body !== undefined/);
  assert.match(sharedApiClient, /Promise\.race\(\[/);
  assert.match(sharedApiClient, /tokenWaitAborted/);
  assert.match(sharedApiClient, /REQUEST_TIMEOUT/);
  assert.match(sharedApiClient, /must not include URL credentials/);
  assert.match(sharedApiClient, /must not include a query string/);
  assert.match(sharedApiClient, /must not include a URL fragment/);
  assert.match(sharedApiClient, /while \(pathname\.endsWith\('\/'\)\)/);
  assert.doesNotMatch(sharedApiClient, /x-anhedral-platform|platform\?:/);

  const webApiSource = read(roots.api, 'apps/web/lib/api.ts').replace(
    /^import \{[^\n]+\} from '@shared\/api-client';\n/m,
    `class ApiClient {
  constructor(options) { this.baseUrl = options.baseUrl; }
}
function normalizeApiBaseUrl(value, label) {
  const candidate = value.trim();
  const parsed = new URL(candidate);
  if (parsed.search || candidate.includes('?')) throw new Error(\`${'${label}'} must not include a query string\`);
  if (parsed.hash || candidate.includes('#')) throw new Error(\`${'${label}'} must not include a URL fragment\`);
  let pathname = parsed.pathname;
  while (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  return parsed.origin + pathname;
}
`,
  );
  const transpiledWebApi = ts.transpileModule(webApiSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousWebApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const previousWindow = globalThis.window;
  try {
    process.env.NODE_ENV = 'production';
    globalThis.window = { location: { origin: 'https://preview.example' } };
    process.env.NEXT_PUBLIC_API_URL = '/api';
    const webApiModule = await import(`data:text/javascript;base64,${Buffer.from(transpiledWebApi).toString('base64')}`);
    assert.equal(webApiModule.createApiClient().baseUrl, 'https://preview.example/api');
    delete process.env.NEXT_PUBLIC_API_URL;
    assert.equal(webApiModule.createApiClient().baseUrl, 'https://preview.example/api');
    for (const invalid of ['//evil.example/api', '/api?debug=true', '/api#fragment', '/\\evil.example/api']) {
      process.env.NEXT_PUBLIC_API_URL = invalid;
      assert.throws(() => webApiModule.createApiClient());
    }
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com/api/';
    assert.equal(webApiModule.createApiClient().baseUrl, 'https://api.example.com/api');
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousWebApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = previousWebApiUrl;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  const executableApiClient = sharedApiClient.replace(
    /^import \{[^\n]+\} from '@shared\/contracts';\n/m,
    '',
  );
  const transpiledApiClient = ts.transpileModule(executableApiClient, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const apiClientModule = await import(`data:text/javascript;base64,${Buffer.from(transpiledApiClient).toString('base64')}`);
  assert.equal(apiClientModule.normalizeApiBaseUrl(' https://api.example.com/v1/// '), 'https://api.example.com/v1');
  assert.equal(apiClientModule.normalizeApiBaseUrl('https://api.example.com/'), 'https://api.example.com');
  for (const invalid of [
    'https://user:password@api.example.com',
    'https://api.example.com/v1?debug=true',
    'https://api.example.com/v1#section',
  ]) {
    assert.throws(() => apiClientModule.normalizeApiBaseUrl(invalid));
    assert.throws(() => new apiClientModule.ApiClient({ baseUrl: invalid }));
  }

  const originalFetch = globalThis.fetch;
  let requestedUrl = null;
  const requestedHeaders = [];
  try {
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedHeaders.push(new Headers(init?.headers));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const normalizedClient = new apiClientModule.ApiClient({
      baseUrl: 'https://api.example.com/v1///',
      getToken: async () => 'generated-token',
    });
    await normalizedClient.request('/health', {}, {
      safeParse: (value) => ({ success: true, data: value }),
    });
    assert.equal(requestedUrl, 'https://api.example.com/v1/health');

    const headerInputs = [
      { 'x-header-shape': 'record' },
      new Headers({ 'x-header-shape': 'headers', authorization: 'Bearer caller-token' }),
      [['x-header-shape', 'tuples'], ['content-type', 'application/problem+json']],
    ];
    for (const headers of headerInputs) {
      await normalizedClient.request('/headers', { method: 'POST', body: '{}', headers }, {
        safeParse: (value) => ({ success: true, data: value }),
      });
    }
    assert.equal(requestedHeaders[1].get('x-header-shape'), 'record');
    assert.equal(requestedHeaders[1].get('content-type'), 'application/json');
    assert.equal(requestedHeaders[1].get('authorization'), 'Bearer generated-token');
    assert.equal(requestedHeaders[2].get('x-header-shape'), 'headers');
    assert.equal(requestedHeaders[2].get('authorization'), 'Bearer caller-token');
    assert.equal(requestedHeaders[3].get('x-header-shape'), 'tuples');
    assert.equal(requestedHeaders[3].get('content-type'), 'application/problem+json');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(read(roots.auth, 'apps/desktop/.env.example'), /VITE_API_URL/);
  assert.match(read(roots.auth, 'apps/desktop/.env.example'), /VITE_CLERK_PUBLISHABLE_KEY/);
  assert.match(read(roots.auth, 'apps/desktop/src/renderer/main.tsx'), /Open account/);
  assert.doesNotMatch(read(roots.auth, 'apps/desktop/src/renderer/main.tsx'), /await initializeClerk\(\)/);
  assert.match(read(roots.auth, 'apps/desktop/src/renderer/main.tsx'), /void initializeClerk\(\)\.then/);
  assert.match(read(roots.auth, 'apps/desktop/src/renderer/main.tsx'), /onClick=\{\(\) => void handleAccount\(\)\}/);
  assert.match(read(roots.auth, 'apps/desktop/src/renderer/main.tsx'), /role=\{clerkState/);
  assert.match(read(roots.auth, 'apps/desktop/src/renderer/lib/auth.ts'), /new Clerk\(publishableKey\)/);
  assert.match(read(roots.auth, 'apps/desktop/src/renderer/lib/auth.ts'), /clerk\.load\(\{ ui \}\)/);
  assert.match(read(roots.auth, 'apps/desktop/src/renderer/lib/auth.ts'), /session\?\.getToken\(\)/);
  assert.match(read(roots.auth, 'apps/desktop/src/renderer/lib/auth.ts'), /clerk\.openUserProfile\(\)/);
  assert.match(read(roots.auth, 'apps/desktop/src/renderer/lib/auth.ts'), /clerk\.openSignIn\(\)/);
  assert.match(read(roots.auth, 'apps/desktop/src/renderer/lib/api.ts'), /getToken: getAuthToken/);

  const webAccountActions = read(roots.auth, 'apps/web/components/account-actions.tsx');
  assert.match(webAccountActions, /Show when="signed-in"/);
  assert.match(webAccountActions, /Show when="signed-out"/);
  assert.match(webAccountActions, /SignInButton mode="modal"/);
  assert.match(webAccountActions, /UserButton/);
  assert.match(read(roots.auth, 'apps/web/app/page.tsx'), /<AccountActions \/>/);
  assert.match(read(roots.auth, 'apps/web/app/layout.tsx'), /appearance=\{\{ theme: shadcn \}\}/);
  assert.match(read(roots.auth, 'apps/web/app/globals.css'), /@clerk\/ui\/themes\/shadcn\.css/);
  assert.match(read(roots.auth, 'apps/web/app/globals.css'), /--color-card: var\(--card\)/);
  assert.match(read(roots.auth, 'apps/web/hooks/use-api-client.ts'), /useAuth/);
  assert.match(read(roots.auth, 'apps/web/hooks/use-api-client.ts'), /createApiClient\(\(\) => getToken\(\)\)/);
  assert.doesNotMatch(read(roots.auth, 'apps/web/.env.example'), /NEXT_PUBLIC_RC_/);

  assert.equal(existsSync(path.join(roots.auth, 'apps/mobile/lib/subscriptions.ts')), false);
  assert.doesNotMatch(read(roots.auth, 'apps/mobile/app/_layout.tsx'), /initializeRevenueCat/);
  assert.doesNotMatch(read(roots.auth, 'apps/mobile/.env.example'), /EXPO_PUBLIC_RC_/);
  assert.match(read(roots.auth, 'apps/mobile/hooks/use-api-client.ts'), /createApiClient\(\(\) => getToken\(\)\)/);
  assert.match(read(roots.auth, 'apps/mobile/app/index.tsx'), /<AccountControls \/>/);
  assert.match(read(roots.auth, 'apps/mobile/components/account-controls.tsx'), /clerk\.openSignIn\(\{\}\)/);
  assert.match(read(roots.auth, 'apps/mobile/components/account-controls.tsx'), /clerk\.signOut\(\)/);

  const mobileSubscriptions = read(roots.native, 'apps/mobile/lib/subscriptions.ts');
  assert.match(mobileSubscriptions, /Platform\.OS === 'web'/);
  assert.match(mobileSubscriptions, /export async function initializeRevenueCat/);
  assert.match(mobileSubscriptions, /appUserID: appUserId/);
  assert.match(mobileSubscriptions, /Purchases\.logIn\(appUserId\)/);
  assert.match(mobileSubscriptions, /Purchases\.logOut\(\)/);
  assert.match(mobileSubscriptions, /export async function syncRevenueCatUser/);
  assert.match(mobileSubscriptions, /RevenueCatUI\.presentPaywallIfNeeded/);
  assert.match(mobileSubscriptions, /PAYWALL_RESULT\.CANCELLED/);
  assert.match(mobileSubscriptions, /status: 'error'/);
  assert.match(mobileSubscriptions, /desiredAppUserId/);
  assert.match(mobileSubscriptions, /identitySynchronized/);
  assert.match(mobileSubscriptions, /Subscription account synchronization is required before opening the paywall/);
  const nativeLayout = read(roots.native, 'apps/mobile/app/_layout.tsx');
  assert.match(nativeLayout, /useAuth\(\)/);
  assert.match(nativeLayout, /if \(!isLoaded\) return/);
  assert.match(nativeLayout, /syncRevenueCatUser\(userId \?\? null\)/);
  assert.match(nativeLayout, /Retry subscription sync/);
  assert.doesNotMatch(nativeLayout, /initializeRevenueCat/);
  assert.match(read(roots.native, 'apps/mobile/app/index.tsx'), /View subscription options/);
  assert.match(read(roots.native, 'apps/mobile/app/index.tsx'), /presentPaywallIfNeeded\(\)/);
  assert.match(read(roots.native, 'apps/mobile/hooks/use-api-client.ts'), /createApiClient\(\(\) => getToken\(\)\)/);
  assert.match(read(roots.native, 'apps/mobile/.env.example'), /EXPO_PUBLIC_RC_API_KEY_IOS/);
  assert.doesNotMatch(read(roots.native, 'apps/mobile/.env.example'), /EXPO_PUBLIC_RC_WEB_API_KEY/);

  const nativeAnonymousLayout = read(roots.nativeAnonymous, 'apps/mobile/app/_layout.tsx');
  assert.match(nativeAnonymousLayout, /initializeRevenueCat\(null\)/);
  assert.doesNotMatch(nativeAnonymousLayout, /useAuth|syncRevenueCatUser/);

  const appOnlyEnv = read(roots.appOnly, 'apps/extension/.env.example');
  assert.match(appOnlyEnv, /VITE_CRX_PUBLIC_KEY/);
  assert.doesNotMatch(appOnlyEnv, /VITE_(?:API|CLERK|WEBSITE|RC_BILLING)/);

  const apiEnv = read(roots.api, 'apps/extension/.env.example');
  assert.match(apiEnv, /VITE_API_URL/);
  assert.doesNotMatch(apiEnv, /VITE_(?:CLERK|WEBSITE|RC_BILLING)/);

  assert.equal(read(roots.api, 'packages/db/.env.example'), 'DATABASE_URL=postgresql://user:pass@localhost:5432/app\n');
  assert.equal(existsSync(path.join(roots.api, 'packages/db/.env')), false);
  assert.equal(JSON.parse(read(roots.api, 'packages/db/package.json')).scripts['db:migrate'], 'tsx --env-file=.env src/migrate.ts');
  assert.match(read(roots.api, 'packages/db/drizzle.config.ts'), /import 'dotenv\/config'/);

  const authEnv = read(roots.auth, 'apps/extension/.env.example');
  assert.match(authEnv, /VITE_API_URL/);
  assert.match(authEnv, /VITE_CLERK_PUBLISHABLE_KEY/);
  assert.match(authEnv, /VITE_CLERK_FRONTEND_API_URL=/);
  assert.match(authEnv, /VITE_CLERK_SYNC_HOST=/);
  assert.doesNotMatch(authEnv, /VITE_WEBSITE_URL/);
  assert.doesNotMatch(authEnv, /VITE_RC_BILLING_URL/);

  assert.equal(existsSync(path.join(roots.appOnly, 'apps/extension/src/lib/api.ts')), false);
  assert.equal(existsSync(path.join(roots.appOnly, 'apps/extension/src/contexts/auth-context.tsx')), false);
  assert.doesNotMatch(read(roots.appOnly, 'apps/extension/src/entrypoints/background.ts'), /Clerk|@clerk|VITE_CLERK/);
  assert.doesNotMatch(read(roots.appOnly, 'apps/extension/src/entrypoints/sidepanel/main.tsx'), /AuthProvider|auth-context/);
  assert.doesNotMatch(read(roots.appOnly, 'apps/extension/src/entrypoints/sidepanel/app.tsx'), /useAuth|SignIn|Subscription|Sign Out|@clerk/);
  assert.doesNotMatch(read(roots.appOnly, 'apps/extension/wxt.config.ts'), /cookies/);
  assert.doesNotMatch(read(roots.appOnly, 'apps/extension/wxt.config.ts'), /storage/);
  assert.match(read(roots.appOnly, 'apps/extension/wxt.config.ts'), /host_permissions: \[\]/);
  assert.doesNotMatch(read(roots.appOnly, 'apps/extension/wxt.config.ts'), /permissionForUrl|VITE_API_URL|VITE_CLERK/);
  assert.doesNotMatch(read(roots.appOnly, 'apps/extension/README.md'), /Clerk|VITE_API_URL|auth-backed/);

  assert.match(read(roots.api, 'apps/extension/src/lib/api.ts'), /@shared\/api-client/);
  assert.doesNotMatch(read(roots.api, 'apps/extension/src/lib/api.ts'), /platform:/);
  assert.equal(existsSync(path.join(roots.api, 'apps/extension/src/contexts/auth-context.tsx')), false);
  assert.doesNotMatch(read(roots.api, 'apps/extension/src/entrypoints/background.ts'), /Clerk|@clerk|VITE_CLERK/);
  assert.doesNotMatch(read(roots.api, 'apps/extension/wxt.config.ts'), /cookies/);
  assert.doesNotMatch(read(roots.api, 'apps/extension/wxt.config.ts'), /storage/);
  assert.match(read(roots.api, 'apps/extension/wxt.config.ts'), /import\.meta\.env\.DEV \? 'http:\/\/localhost:8787\/api'/);
  assert.match(read(roots.api, 'apps/extension/wxt.config.ts'), /must use https: in production/);
  assert.match(read(roots.api, 'apps/extension/wxt.config.ts'), /host_permissions: hostPermissions/);
  assert.match(read(roots.api, 'apps/extension/wxt.config.ts'), /new Set/);
  assert.match(read(roots.api, 'apps/extension/wxt.config.ts'), /url\.protocol !== 'http:'/);
  assert.match(read(roots.api, 'apps/extension/wxt.config.ts'), /url\.hostname/);
  assert.match(read(roots.api, 'apps/extension/wxt.config.ts'), /must not include a query string/);
  assert.match(read(roots.api, 'apps/extension/wxt.config.ts'), /must not include a URL fragment/);
  assert.match(read(roots.api, 'apps/extension/src/lib/api.ts'), /import\.meta\.env\.PROD && url\.protocol !== 'https:'/);

  assert.match(read(roots.auth, 'apps/extension/src/lib/api.ts'), /@shared\/api-client/);
  assert.match(read(roots.auth, 'apps/extension/src/contexts/auth-context.tsx'), /@clerk\/chrome-extension/);
  assert.match(read(roots.auth, 'apps/extension/src/contexts/auth-context.tsx'), /createApiClient\(\(\) => getToken\(\)\)/);
  assert.match(read(roots.auth, 'apps/extension/src/contexts/auth-context.tsx'), /api: ReturnType<typeof createApiClient>/);
  assert.match(read(roots.auth, 'apps/extension/src/contexts/auth-context.tsx'), /syncHost=\{CLERK_SYNC_HOST\}/);
  assert.match(read(roots.auth, 'apps/extension/src/entrypoints/background.ts'), /createClerkClient/);
  assert.match(read(roots.auth, 'apps/extension/src/entrypoints/background.ts'), /anhedralClerkBackgroundError/);
  assert.match(read(roots.auth, 'apps/extension/src/entrypoints/background.ts'), /syncHost: import\.meta\.env\.VITE_CLERK_SYNC_HOST/);
  assert.match(read(roots.auth, 'apps/extension/src/entrypoints/sidepanel/main.tsx'), /AuthProvider/);
  assert.match(read(roots.auth, 'apps/extension/src/entrypoints/sidepanel/app.tsx'), /SignIn/);
  assert.match(read(roots.auth, 'apps/extension/src/entrypoints/sidepanel/app.tsx'), /onClick=\{\(\) => void signOut\(\)\}/);
  assert.match(read(roots.auth, 'apps/extension/wxt.config.ts'), /cookies/);
  assert.match(read(roots.auth, 'apps/extension/wxt.config.ts'), /storage/);
  assert.match(read(roots.auth, 'apps/extension/wxt.config.ts'), /permissionForUrl\('VITE_CLERK_FRONTEND_API_URL'/);
  assert.match(read(roots.auth, 'apps/extension/wxt.config.ts'), /permissionForUrl\('VITE_CLERK_SYNC_HOST'/);
  assert.match(read(roots.auth, 'apps/extension/README.md'), /no source edit is required/);
} finally {
  if (originalToolchain === undefined) delete process.env.ANHEDRAL_TOOLCHAIN;
  else process.env.ANHEDRAL_TOOLCHAIN = originalToolchain;
  for (const root of Object.values(roots)) rmSync(root, { recursive: true, force: true });
}

console.log('Conditional application template tests passed');

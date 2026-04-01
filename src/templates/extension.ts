import path from 'node:path';
import { writeFile, exec } from '../util.js';
import type { ProjectOptions } from '../scaffold.js';
import { resolveToolchainChannel, resolveToolchain, toolPackageRef } from '../toolchain.js';

export async function scaffoldExtension(root: string, { projectName, displayName }: ProjectOptions): Promise<void> {
  const dir = path.join(root, 'extension');
  const toolchain = resolveToolchain(resolveToolchainChannel(process.env.ANHEDRAL_TOOLCHAIN));

  // ── 1. Scaffold via WXT CLI ───────────────────────────────────────────
  console.log('  Scaffolding WXT extension...');
  exec(`pnpm dlx ${toolPackageRef('wxt', toolchain.wxt)} init extension -t react --pm pnpm`, root);

  // ── 2. Overwrite package.json with proper scripts ──────────────────────
  writePackageJson(dir, projectName);

  // ── 3. Install dependencies ───────────────────────────────────────────
  console.log('  Installing Clerk + React + UI dependencies...');
  exec('pnpm add @clerk/chrome-extension react react-dom clsx tailwind-merge class-variance-authority lucide-react', dir);
  exec(`pnpm add -D @types/chrome @types/react @types/react-dom @wxt-dev/module-react autoprefixer postcss tailwindcss typescript ${toolPackageRef('wxt', toolchain.wxt)}`, dir);

  // ── 4. Write config files ─────────────────────────────────────────────
  writeWxtConfig(dir, displayName);
  writeTsConfig(dir);
  writeEnvExample(dir);
  writePostcssConfig(dir);
  writeTailwindConfig(dir);
  writeShadcnConfig(dir);
  writeCnUtil(dir);

  // ── 5. Write source files ─────────────────────────────────────────────
  writeAuthContext(dir);
  writeApiClient(dir);
  writeBackground(dir);
  writeSidepanelEntry(dir);
  writeSidepanelHtml(dir, displayName);
  writeSidepanelApp(dir);
  writeStyles(dir);

  // ── 6. Add shadcn button component (sets up CSS variables + component) ─
  console.log('  Adding shadcn button component...');
  exec(`pnpm dlx ${toolPackageRef('shadcn', toolchain.shadcn)} add button`, dir);
}

function writePackageJson(dir: string, projectName: string): void {
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: projectName + '-chrome-ext',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'wxt',
      'dev:firefox': 'wxt -b firefox',
      build: 'wxt build',
      'build:firefox': 'wxt build -b firefox',
      postinstall: 'wxt prepare',
      zip: 'wxt zip',
      'zip:firefox': 'wxt zip -b firefox',
      typecheck: 'tsc --noEmit',
    },
  }, null, 2) + '\n');
}

function writeWxtConfig(dir: string, displayName: string): void {
  writeFile(path.join(dir, 'wxt.config.ts'), `import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: () => {
    const crxPublicKey = process.env.VITE_CRX_PUBLIC_KEY || '';

    return {
      name: '${displayName}',
      description: '${displayName} Chrome Extension',
      version: '0.1.0',
      ...(crxPublicKey ? { key: crxPublicKey } : {}),
      permissions: ['cookies', 'storage'],
      host_permissions: [],
      action: {
        default_title: 'Open ${displayName}',
      },
    };
  },
  modules: ['@wxt-dev/module-react'],
});
`);
}

function writeTsConfig(dir: string): void {
  writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      lib: ['DOM', 'DOM.Iterable', 'ESNext'],
      types: ['wxt/browser', '@wxt-dev/module-react', 'chrome'],
      baseUrl: '.',
      paths: { '@/*': ['./src/*'] },
    },
    include: ['**/*.ts', '**/*.tsx', '.wxt/wxt.d.ts'],
    exclude: ['node_modules', '.output', 'dist'],
  }, null, 2) + '\n');
}

function writeEnvExample(dir: string): void {
  writeFile(path.join(dir, '.env.example'), `# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=pk_test_***

# Backend API URL
VITE_API_URL=http://localhost:8787

# Website URL (for sign-up and subscription links)
VITE_WEBSITE_URL=http://localhost:8081

# Chrome Extension CRX public key (optional, for stable extension ID)
VITE_CRX_PUBLIC_KEY=

# RevenueCat Web Billing URL (optional, for subscription management)
VITE_RC_BILLING_URL=
`);
}

function writePostcssConfig(dir: string): void {
  writeFile(path.join(dir, 'postcss.config.js'), `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);
}

function writeShadcnConfig(dir: string): void {
  writeFile(path.join(dir, 'components.json'), JSON.stringify({
    $schema: 'https://ui.shadcn.com/schema.json',
    style: 'new-york',
    rsc: false,
    tsx: true,
    tailwind: {
      config: '',
      css: 'src/styles/main.css',
      baseColor: 'neutral',
      cssVariables: true,
      prefix: '',
    },
    aliases: {
      components: '@/components',
      utils: '@/lib/utils',
      ui: '@/components/ui',
      lib: '@/lib',
      hooks: '@/hooks',
    },
    iconLibrary: 'lucide',
  }, null, 2) + '\n');
}

function writeCnUtil(dir: string): void {
  writeFile(path.join(dir, 'src/lib/utils.ts'), `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`);
}

function writeTailwindConfig(dir: string): void {
  writeFile(path.join(dir, 'tailwind.config.js'), `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: { extend: {} },
  plugins: [],
};
`);
}

function writeAuthContext(dir: string): void {
  writeFile(path.join(dir, 'src/contexts/auth-context.tsx'), `import * as React from 'react';
import { ClerkProvider, useAuth as useClerkAuth, useUser } from '@clerk/chrome-extension';
import { APIClient } from '../lib/api';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || 'http://localhost:8081';

function getExtensionUrl(path: string) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

const SIDEPANEL_URL = getExtensionUrl('sidepanel.html');

type AuthState = {
  isSignedIn: boolean;
  isLoading: boolean;
  userId: string | null;
  subscription: {
    status: 'idle' | 'loading' | 'active' | 'inactive' | 'error';
    canAccess: boolean;
    inTrial?: boolean;
    trialEndsAt?: string;
    expiresAt?: string;
    method?: 'trialing' | 'redeemed' | 'paid' | null;
    managementUrl?: string;
    cancelAtPeriodEnd?: boolean;
    error?: string;
  };
};

type AuthContextValue = AuthState & {
  signOut: () => Promise<void>;
  refreshSubscription: (opts?: { refresh?: boolean }) => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, userId, signOut, getToken } = useClerkAuth();
  const { user } = useUser();

  const [subscription, setSubscription] = React.useState<AuthState['subscription']>({
    status: 'idle',
    canAccess: false,
  });

  const apiRef = React.useRef<APIClient | null>(null);

  React.useEffect(() => {
    if (isSignedIn && getToken) {
      apiRef.current = new APIClient(getToken);
    } else {
      apiRef.current = null;
    }
  }, [isSignedIn, getToken]);

  const checkSubscription = React.useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (!apiRef.current || !isSignedIn) {
        setSubscription({ status: 'idle', canAccess: false });
        return;
      }
      setSubscription(prev => ({ ...prev, status: 'loading' }));
      try {
        const result = await apiRef.current.getSubscriptionEntitlements(opts);
        const isPro = result.pro;
        const inTrial = result.inTrial;
        setSubscription({
          status: isPro ? 'active' : 'inactive',
          canAccess: isPro,
          inTrial,
          trialEndsAt: result.trialEndsAt,
          expiresAt: result.expiresAt,
          method: result.method,
          managementUrl: result.managementUrl,
          cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        });
      } catch (error) {
        setSubscription({
          status: 'error',
          canAccess: false,
          error: error instanceof Error ? error.message : 'Failed to check subscription',
        });
      }
    },
    [isSignedIn],
  );

  React.useEffect(() => {
    if (isSignedIn && isLoaded) {
      void checkSubscription({ refresh: true });
    }
  }, [isSignedIn, isLoaded, checkSubscription]);

  const handleSignOut = React.useCallback(async () => {
    setSubscription({ status: 'idle', canAccess: false });
    await signOut();
  }, [signOut]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      isSignedIn: !!isSignedIn,
      isLoading: !isLoaded,
      userId: userId || null,
      subscription,
      signOut: handleSignOut,
      refreshSubscription: (opts?: { refresh?: boolean }) => checkSubscription(opts),
    }),
    [isSignedIn, isLoaded, userId, subscription, handleSignOut, checkSubscription],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl={SIDEPANEL_URL}
      signInFallbackRedirectUrl={SIDEPANEL_URL}
      signUpFallbackRedirectUrl={SIDEPANEL_URL}
    >
      <AuthProviderInner>{children}</AuthProviderInner>
    </ClerkProvider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { WEBSITE_URL };
`);
}

function writeApiClient(dir: string): void {
  writeFile(path.join(dir, 'src/lib/api.ts'), `const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export type SubscriptionEntitlements = {
  pro: boolean;
  inTrial: boolean;
  trialEndsAt?: string;
  expiresAt?: string;
  periodStart?: string;
  periodEnd?: string;
  method?: 'trialing' | 'redeemed' | 'paid' | null;
  managementUrl?: string;
  cancelAtPeriodEnd?: boolean;
};

export class APIClient {
  constructor(private getToken: () => Promise<string | null>) {}

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    if (!token) throw new Error('Not authenticated');

    const headers: Record<string, string> = {
      Authorization: \`Bearer \${token}\`,
      'Content-Type': 'application/json',
      'X-Client-Type': 'chrome-extension',
      'X-Platform': 'chrome',
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(\`\${API_BASE_URL}\${endpoint}\`, { ...options, headers });

    if (!response.ok) {
      let error: { message?: string } = {};
      try { error = await response.json(); } catch {}
      throw new Error(error.message || \`Request failed (\${response.status})\`);
    }

    if (response.status === 204) return {} as T;
    return response.json();
  }

  async getMe() {
    return this.request<{
      user: { id: string; email: string; subscriptionTier: string; subscriptionStatus: string };
    }>('/auth/me');
  }

  async getSubscriptionEntitlements(options?: { refresh?: boolean }): Promise<SubscriptionEntitlements> {
    const path = options?.refresh
      ? '/subscriptions/entitlements/me?refresh=true'
      : '/subscriptions/entitlements/me';
    return this.request<SubscriptionEntitlements>(path);
  }
}
`);
}

function writeBackground(dir: string): void {
  writeFile(path.join(dir, 'src/entrypoints/background.ts'), `import { createClerkClient } from '@clerk/chrome-extension/background';

export default defineBackground(() => {
  // Initialize Clerk in the background script for cookie-based auth
  void createClerkClient({
    publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '',
  }).catch(() => {});

  // Open the side panel when the extension icon is clicked
  // The sidePanel permission is auto-added by WXT when the sidepanel entrypoint exists
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});
`);
}

function writeSidepanelEntry(dir: string): void {
  writeFile(path.join(dir, 'src/entrypoints/sidepanel/main.tsx'), `import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../../contexts/auth-context';
import { SidePanelApp } from './app';
import '../../styles/main.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <AuthProvider>
        <SidePanelApp />
      </AuthProvider>
    </React.StrictMode>
  );
}
`);
}

function writeSidepanelHtml(dir: string, displayName: string): void {
  writeFile(path.join(dir, 'src/entrypoints/sidepanel/index.html'), `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${displayName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
`);
}

function writeSidepanelApp(dir: string): void {
  writeFile(path.join(dir, 'src/entrypoints/sidepanel/app.tsx'), `import * as React from 'react';
import { useAuth } from '../../contexts/auth-context';
import { SignIn } from '@clerk/chrome-extension';

export function SidePanelApp() {
  const { isSignedIn, isLoading, signOut, subscription } = useAuth();

  if (isLoading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>;
  }

  if (!isSignedIn) {
    return (
      <div style={{ padding: 24 }}>
        <SignIn />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Welcome!</h2>
      <p>Subscription: {subscription.status}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
`);
}

function writeStyles(dir: string): void {
  writeFile(path.join(dir, 'src/styles/main.css'), `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
`);
}

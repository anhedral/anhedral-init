import { rmSync } from 'node:fs';
import path from 'node:path';
import { writeFile, exec } from '../util.js';
import { anhedralPrint } from '../print.js';
import type { ProjectOptions } from '../scaffold.js';
import { resolveToolchainChannel, resolveToolchain, toolPackageRef } from '../toolchain.js';

export async function scaffoldExtension(root: string, { projectName, displayName }: ProjectOptions): Promise<void> {
  const appsRoot = path.join(root, 'apps');
  const dir = path.join(appsRoot, 'extension');
  const toolchain = resolveToolchain(resolveToolchainChannel(process.env.ANHEDRAL_TOOLCHAIN));

  anhedralPrint.section('Chrome extension (WXT)');

  anhedralPrint.step('Scaffolding WXT extension');
  writeFile(path.join(appsRoot, '.gitkeep'), '');
  exec(`pnpm dlx ${toolPackageRef('wxt', toolchain.wxt)} init extension -t react --pm pnpm`, appsRoot);
  writePackageJson(dir, projectName);
  anhedralPrint.done('WXT extension scaffolded');

  anhedralPrint.step('Installing Clerk + React + Tailwind dependencies');
  exec(`pnpm add -D @types/chrome @types/react @types/react-dom @wxt-dev/module-react autoprefixer postcss tailwindcss@3.4.19 typescript@5.9.3 ${toolPackageRef('wxt', toolchain.wxt)}`, dir);
  exec('pnpm add @clerk/chrome-extension react react-dom clsx tailwind-merge class-variance-authority lucide-react@0.468.0', dir);
  anhedralPrint.done('Extension dependencies installed');

  cleanWxtStarterFiles(dir);
  writeWxtConfig(dir, displayName);
  writeTsConfig(dir);
  writeEnvExample(dir);
  writeEnvFile(dir);
  writePostcssConfig(dir);
  writeTailwindConfig(dir);
  writeShadcnConfig(dir);
  writeReadme(dir, displayName);
  writeCnUtil(dir);
  writeAuthContext(dir);
  writeApiClient(dir);
  writeBackground(dir);
  writeContentScript(dir);
  writeSidepanelEntry(dir);
  writeSidepanelHtml(dir, displayName);
  writeSidepanelApp(dir);
  writeStyles(dir);

  anhedralPrint.step('Adding shadcn button component');
  exec(`pnpm dlx ${toolPackageRef('shadcn', toolchain.shadcn)} add button`, dir);
  writeStyles(dir);
  anhedralPrint.done('shadcn button installed');
}

function cleanWxtStarterFiles(dir: string): void {
  for (const relativePath of [
    'entrypoints',
    'assets/react.svg',
    'public/wxt.svg',
  ]) {
    rmSync(path.join(dir, relativePath), { recursive: true, force: true });
  }
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
      permissions: ['activeTab', 'cookies', 'storage'],
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
      allowImportingTsExtensions: true,
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

function writeEnvFile(dir: string): void {
  writeFile(path.join(dir, '.env'), `# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=

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
  writeFile(path.join(dir, 'postcss.config.cjs'), `module.exports = {
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
  writeFile(path.join(dir, 'tailwind.config.cjs'), `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
`);
}

function writeReadme(dir: string, displayName: string): void {
  writeFile(path.join(dir, 'README.md'), `# ${displayName} Chrome Extension

WXT side-panel extension generated by anhedral.

## Development

\`\`\`bash
pnpm dev
pnpm build
pnpm zip
\`\`\`

Set \`VITE_CLERK_PUBLISHABLE_KEY\` and \`VITE_API_URL\` in \`.env\` before using auth-backed routes. Set \`VITE_CRX_PUBLIC_KEY\` only when you need a stable Chrome extension ID.

## Chrome

Run \`pnpm build\`, then load \`.output/chrome-mv3\` as an unpacked extension from \`chrome://extensions\`.

The browser action opens the side panel. The background script initializes Clerk, the side panel handles sign-in/subscription state, and the content script is ready for page-to-extension messages.
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

function writeContentScript(dir: string): void {
  writeFile(path.join(dir, 'src/entrypoints/content.ts'), `export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'ANHEDRAL_PAGE_SNAPSHOT') return false;

      sendResponse({
        title: document.title,
        location: window.location.href,
      });
      return true;
    });
  },
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
import { Button } from '../../components/ui/button';

type PageSnapshot = {
  title: string;
  location: string;
};

export function SidePanelApp() {
  const { isSignedIn, isLoading, signOut, subscription } = useAuth();
  const [page, setPage] = React.useState<PageSnapshot | null>(null);
  const [pageError, setPageError] = React.useState<string | null>(null);

  const readActivePage = React.useCallback(async () => {
    setPageError(null);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      setPageError('No active tab is available.');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'ANHEDRAL_PAGE_SNAPSHOT' });
      setPage(response as PageSnapshot);
    } catch {
      setPageError('Refresh the active page, then try again.');
    }
  }, []);

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
      <Button type="button" onClick={() => void readActivePage()}>Read active page</Button>
      {page ? (
        <div style={{ marginTop: 16 }}>
          <strong>{page.title || 'Untitled page'}</strong>
          <p style={{ overflowWrap: 'anywhere' }}>{page.location}</p>
        </div>
      ) : null}
      {pageError ? <p style={{ color: 'hsl(var(--destructive))' }}>{pageError}</p> : null}
      <Button type="button" variant="outline" onClick={signOut}>Sign Out</Button>
    </div>
  );
}
`);
}

function writeStyles(dir: string): void {
  writeFile(path.join(dir, 'src/styles/main.css'), `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 63.9%;
    --radius: 0.5rem;
  }

  * {
    border-color: hsl(var(--border));
  }

  body {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
`);
}

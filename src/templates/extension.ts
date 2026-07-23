import { rmSync } from 'node:fs';
import path from 'node:path';
import { writeFile } from '../util.js';
import { anhedralPrint } from '../print.js';
import type { ProjectOptions } from '../project.js';
import { EXTENSION_DEPENDENCIES } from '../dependencies.js';
import { childPackageName, htmlText, jsString, markdownHeading } from '../render.js';

function selectedDependencies(options: ProjectOptions): Record<string, string> {
  const dependencies = { ...(EXTENSION_DEPENDENCIES.dependencies ?? {}) };
  if (!options.apps.api) delete dependencies['@shared/api-client'];
  if (!options.features.billing) delete dependencies['@shared/realtime'];
  if (!options.features.auth) delete dependencies['@clerk/chrome-extension'];
  return dependencies;
}

export async function scaffoldExtension(root: string, options: ProjectOptions): Promise<void> {
  const { projectName, displayName, skipInstall } = options;
  const dir = path.join(root, 'apps/extension');

  anhedralPrint.section('Chrome extension (WXT)');

  anhedralPrint.step('Materializing bundled WXT substrate');
  writePackageJson(dir, projectName, options);
  anhedralPrint.done('WXT extension substrate materialized');

  anhedralPrint.step(`Recording ${options.features.auth ? 'Clerk + ' : ''}React + Tailwind dependencies`);
  if (skipInstall) {
    anhedralPrint.info('Skipping extension dependency install (--skip-install)');
    anhedralPrint.info('Run after init: pnpm install');
  }
  anhedralPrint.done('Extension dependency manifests written');

  cleanWxtStarterFiles(dir);
  writeWxtConfig(dir, displayName, options);
  writeEnvExample(dir, options);
  writePostcssConfig(dir);
  writeTailwindConfig(dir);
  writeShadcnConfig(dir);
  writeReadme(dir, displayName, options);
  writeCnUtil(dir);
  writeButtonComponent(dir);
  if (options.features.auth) writeAuthContext(dir);
  if (options.apps.api) writeApiClient(dir);
  if (options.apps.api && options.features.database) writeItemList(dir, options.features.auth);
  if (options.features.billing) writeEntitlementHook(dir);
  writeBackground(dir, options.features.auth);
  writeSidepanelEntry(dir, options.features.auth);
  writeSidepanelHtml(dir, displayName);
  writeSidepanelApp(
    dir,
    options.features.auth,
    options.features.billing,
    options.apps.api && options.features.database,
  );
  writeStyles(dir);

  anhedralPrint.done('Extension source files written');
}

function cleanWxtStarterFiles(dir: string): void {
  for (const relativePath of [
    '.git',
    'entrypoints',
    'assets/react.svg',
    'public/wxt.svg',
  ]) {
    rmSync(path.join(dir, relativePath), { recursive: true, force: true });
  }
}

function writePackageJson(dir: string, projectName: string, options: ProjectOptions): void {
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: childPackageName(projectName, 'chrome-ext'),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'wxt',
      build: 'wxt build',
      postinstall: 'wxt prepare',
      zip: 'wxt zip',
      typecheck: 'tsc --noEmit',
    },
    dependencies: selectedDependencies(options),
    devDependencies: EXTENSION_DEPENDENCIES.devDependencies,
  }, null, 2) + '\n');
}

function writeWxtConfig(dir: string, displayName: string, options: ProjectOptions): void {
  const nameLiteral = jsString(displayName);
  const descriptionLiteral = jsString(`${displayName} Chrome Extension`);
  const actionTitleLiteral = jsString(`Open ${displayName}`);
  const permissionsLiteral = options.features.auth
    ? "['activeTab', 'cookies', 'scripting', 'storage', 'sidePanel']"
    : "['activeTab', 'scripting', 'sidePanel']";
  const permissionSources = [
    options.apps.api
      ? "    permissionForUrl('VITE_API_URL', import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787/api' : undefined)),"
      : null,
    options.features.auth
      ? "    permissionForUrl('VITE_CLERK_FRONTEND_API_URL', import.meta.env.VITE_CLERK_FRONTEND_API_URL),"
      : null,
    options.features.auth
      ? "    permissionForUrl('VITE_CLERK_SYNC_HOST', import.meta.env.VITE_CLERK_SYNC_HOST),"
      : null,
  ].filter((value): value is string => value !== null);
  const permissionHelper = permissionSources.length > 0
    ? `
function permissionForUrl(name: string, value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(\`\${name} must be a valid absolute URL\`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(\`\${name} must use http: or https:\`);
  }
  if (url.username || url.password) throw new Error(\`\${name} must not include URL credentials\`);
  if (url.search || candidate.includes('?')) throw new Error(\`\${name} must not include a query string\`);
  if (url.hash || candidate.includes('#')) throw new Error(\`\${name} must not include a URL fragment\`);
  if (import.meta.env.PROD && url.protocol !== 'https:') {
    throw new Error(\`\${name} must use https: in production\`);
  }
  return \`\${url.protocol}//\${url.hostname}/*\`;
}
`
    : '';
  const hostPermissionsSetup = permissionSources.length > 0
    ? `    const hostPermissions = [...new Set([
${permissionSources.join('\n')}
    ].filter((value): value is string => value !== null))];
`
    : '';
  const hostPermissionsLiteral = permissionSources.length > 0 ? 'hostPermissions' : '[]';
  writeFile(path.join(dir, 'wxt.config.ts'), `import { defineConfig } from 'wxt';
${permissionHelper}

export default defineConfig({
  srcDir: 'src',
  manifest: () => {
    const crxPublicKey = import.meta.env.VITE_CRX_PUBLIC_KEY || '';
${hostPermissionsSetup}

    return {
      name: ${nameLiteral},
      description: ${descriptionLiteral},
      version: '0.1.0',
      ...(crxPublicKey ? { key: crxPublicKey } : {}),
      minimum_chrome_version: '114',
      permissions: ${permissionsLiteral},
      host_permissions: ${hostPermissionsLiteral},
      action: {
        default_title: ${actionTitleLiteral},
      },
      side_panel: {
        default_path: 'sidepanel.html',
      },
    };
  },
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    build: {
      chunkSizeWarningLimit: 3000,
    },
  }),
});
`);
}

function extensionEnvContents(options: ProjectOptions): string {
  const sections: string[] = [];
  if (options.features.auth) {
    sections.push(`# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=pk_test_***
VITE_CLERK_FRONTEND_API_URL=
VITE_CLERK_SYNC_HOST=`);
  }
  if (options.apps.api) {
    sections.push(`# API URL
VITE_API_URL=http://localhost:8787/api`);
  }
  sections.push(`# Chrome Extension CRX public key (optional, for stable extension ID)
VITE_CRX_PUBLIC_KEY=`);
  return `${sections.join('\n\n')}\n`;
}

function writeEnvExample(dir: string, options: ProjectOptions): void {
  writeFile(path.join(dir, '.env.example'), extensionEnvContents(options));
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

function writeButtonComponent(dir: string): void {
  writeFile(path.join(dir, 'src/components/ui/button.tsx'), `import * as React from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'outline';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
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

function writeReadme(dir: string, displayName: string, options: ProjectOptions): void {
  const configuration = [
    options.features.auth
      ? 'Set `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_FRONTEND_API_URL` before using authenticated routes. Set `VITE_CLERK_SYNC_HOST` only when syncing auth with another Clerk application.'
      : null,
    options.apps.api ? 'Set `VITE_API_URL` before using the shared API client.' : null,
    'Set `VITE_CRX_PUBLIC_KEY` only when you need a stable Chrome extension ID.',
  ].filter((value): value is string => value !== null).join(' ');
  const authBehavior = options.features.auth ? ', the background script initializes Clerk' : '';
  const networkIntegrations = [
    options.apps.api ? '`VITE_API_URL`' : null,
    options.features.auth ? '`VITE_CLERK_FRONTEND_API_URL` and optional `VITE_CLERK_SYNC_HOST`' : null,
  ].filter((value): value is string => value !== null).join(' and ');
  const hostPermissionsGuidance = networkIntegrations
    ? `\n\nThe manifest derives deduplicated Chrome host permissions from ${networkIntegrations}. Only absolute HTTP(S) URLs are accepted; malformed configured URLs fail the build. Set production URLs in the extension environment before publishing—no source edit is required.`
    : '';

  writeFile(path.join(dir, 'README.md'), `# ${markdownHeading(displayName)} Chrome Extension

WXT side-panel extension generated by anhedral.

## Development

\`\`\`bash
cp .env.example .env
pnpm dev
pnpm build
pnpm zip
\`\`\`

Run these commands from \`apps/extension\`. Anhedral generates only \`.env.example\`; keep the local \`.env\` file uncommitted. ${configuration}

## Chrome

Run \`pnpm build\`, then load \`.output/chrome-mv3\` as an unpacked extension from \`chrome://extensions\`.

The extension uses Chrome's Side Panel API. The browser action opens \`sidepanel.html\`, \`wxt.config.ts\` declares the \`sidePanel\` permission and Chrome 114+ minimum version${authBehavior}, and active-page reads use a user-triggered \`activeTab\` + \`scripting\` grant instead of persistent site access.${hostPermissionsGuidance}
`);
}

function writeAuthContext(dir: string): void {
  writeFile(path.join(dir, 'src/contexts/auth-context.tsx'), `import * as React from 'react';
import { ClerkProvider, useAuth as useClerkAuth } from '@clerk/chrome-extension';
import { apiConfigurationError, createApiClient } from '../lib/api';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
const CLERK_SYNC_HOST = import.meta.env.VITE_CLERK_SYNC_HOST || undefined;
const BACKGROUND_AUTH_ERROR_KEY = 'anhedralClerkBackgroundError';

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
};

type AuthContextValue = AuthState & {
  api: ReturnType<typeof createApiClient>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function ConfigurationError({ message }: { message: string }) {
  return (
    <div role="alert" aria-live="assertive" style={{ padding: 24, color: 'hsl(var(--destructive))' }}>
      <h2>Extension configuration required</h2>
      <p>{message}</p>
    </div>
  );
}

function useBackgroundAuthError(): string | null {
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    void chrome.storage.local.get(BACKGROUND_AUTH_ERROR_KEY).then((values) => {
      const message = values[BACKGROUND_AUTH_ERROR_KEY];
      if (active) setError(typeof message === 'string' ? message : null);
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      const message = changes[BACKGROUND_AUTH_ERROR_KEY]?.newValue;
      setError(typeof message === 'string' ? message : null);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);
  return error;
}

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, userId, signOut, getToken } = useClerkAuth();
  const api = React.useMemo(() => createApiClient(() => getToken()), [getToken]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      api,
      isSignedIn: !!isSignedIn,
      isLoading: !isLoaded,
      userId: userId || null,
      signOut,
    }),
    [api, isSignedIn, isLoaded, userId, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const backgroundError = useBackgroundAuthError();
  if (!CLERK_PUBLISHABLE_KEY || CLERK_PUBLISHABLE_KEY.includes('***')) {
    return <ConfigurationError message="Set VITE_CLERK_PUBLISHABLE_KEY before building the extension." />;
  }
  const apiError = apiConfigurationError();
  if (apiError) return <ConfigurationError message={apiError} />;
  if (backgroundError) return <ConfigurationError message={backgroundError} />;
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      syncHost={CLERK_SYNC_HOST}
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
`);
}

function writeApiClient(dir: string): void {
  writeFile(path.join(dir, 'src/lib/api.ts'), `import { ApiClient, normalizeApiBaseUrl } from '@shared/api-client';

function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  const candidate = configured || (import.meta.env.DEV ? 'http://localhost:8787/api' : '');
  if (!candidate) throw new Error('VITE_API_URL is required in production builds');
  const normalized = normalizeApiBaseUrl(candidate, 'VITE_API_URL');
  const url = new URL(normalized);
  if (import.meta.env.PROD && url.protocol !== 'https:') {
    throw new Error('VITE_API_URL must use https: in production');
  }
  return normalized;
}

export function apiConfigurationError(): string | null {
  try {
    apiBaseUrl();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'The API URL is invalid';
  }
}

export function createApiClient(getToken?: () => Promise<string | null>) {
  return new ApiClient({
    baseUrl: apiBaseUrl(),
    getToken,
  });
}
`);
}

function writeItemList(dir: string, hasAuth: boolean): void {
  const apiImport = hasAuth
    ? "import { useAuth } from '../contexts/auth-context';\n"
    : "import { createApiClient } from '../lib/api';\n";
  const apiState = hasAuth
    ? '  const { api, userId } = useAuth();\n  const identity = userId;\n'
    : "  const api = React.useMemo(() => createApiClient(), []);\n  const identity = 'public';\n";
  writeFile(path.join(dir, 'src/components/item-list.tsx'), `import { createItem, listItems, type Item } from '@shared/api-client';
${apiImport}import * as React from 'react';
import { Button } from './ui/button';

export function ItemList() {
${apiState}  const [items, setItems] = React.useState<Item[]>([]);
  const [loadedIdentity, setLoadedIdentity] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'saving'>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const identityRef = React.useRef(identity);
  const visibleItems = loadedIdentity === identity ? items : [];
  const visibleError = loadedIdentity === identity ? error : null;
  const isLoading = status === 'loading' || loadedIdentity !== identity;

  React.useEffect(() => {
    identityRef.current = identity;
    if (!identity) return;
    let active = true;
    setLoadedIdentity(identity);
    setItems([]);
    setName('');
    setError(null);
    setStatus('loading');
    void listItems(api).then((nextItems) => {
      if (active) setItems(nextItems);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Unable to load items');
    }).finally(() => {
      if (active) setStatus('ready');
    });
    return () => { active = false; };
  }, [api, identity]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!identity || !nextName || status !== 'ready' || loadedIdentity !== identity) return;
    const submittedIdentity = identity;
    setStatus('saving');
    try {
      const created = await createItem(api, { name: nextName });
      if (identityRef.current !== submittedIdentity) return;
      setItems((current) => [created, ...current]);
      setName('');
      setError(null);
    } catch (cause) {
      if (identityRef.current === submittedIdentity) {
        setError(cause instanceof Error ? cause.message : 'Unable to create item');
      }
    } finally {
      if (identityRef.current === submittedIdentity) setStatus('ready');
    }
  }

  return (
    <section aria-labelledby="starter-feature-title" style={{ display: 'grid', gap: 10, marginTop: 20 }}>
      <h3 id="starter-feature-title" style={{ margin: 0 }}>Working starter feature</h3>
      <form onSubmit={(event) => void submit(event)} style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="item-name">Item name</label>
        <input
          id="item-name"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your first item"
          style={{ minHeight: 36, border: '1px solid hsl(var(--input))', borderRadius: 6, padding: '0 10px' }}
          value={name}
        />
        <Button disabled={status !== 'ready' || loadedIdentity !== identity || !name.trim()} type="submit">
          {status === 'saving' ? 'Adding…' : 'Add item'}
        </Button>
      </form>
      {visibleError ? (
        <p aria-live="assertive" role="alert" style={{ color: 'hsl(var(--destructive))' }}>
          {visibleError}. Check DATABASE_URL, run pnpm db:migrate, and make sure the API is running.
        </p>
      ) : null}
      {isLoading ? <p role="status">Loading items…</p> : null}
      {!isLoading && visibleItems.length === 0 && !visibleError
        ? <p>Your database is connected. Add the first item.</p>
        : null}
      {visibleItems.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {visibleItems.map((item) => <li key={item.id}>{item.name}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
`);
}

function writeEntitlementHook(dir: string): void {
  writeFile(path.join(dir, 'src/hooks/use-entitlement.ts'), `import { subscribeToSubscriptionChanges } from '@shared/realtime';
import * as React from 'react';
import { useAuth } from '../contexts/auth-context';

export function useEntitlement() {
  const { api, isSignedIn, userId } = useAuth();
  const identity = isSignedIn ? userId : null;
  const [entitlement, setEntitlement] = React.useState<Awaited<ReturnType<typeof api.getEntitlement>> | null>(null);
  const [loadedIdentity, setLoadedIdentity] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const revision = React.useRef(0);
  const identityRef = React.useRef(identity);
  const refresh = React.useCallback(async () => {
    if (!identity) return;
    try {
      const next = await api.getEntitlement();
      if (identityRef.current !== identity) return;
      revision.current = Math.max(revision.current, next.revision);
      setEntitlement(next);
      setLoadedIdentity(identity);
      setError(null);
    } catch (cause) {
      if (identityRef.current !== identity) return;
      setLoadedIdentity(identity);
      setError(cause instanceof Error ? cause.message : 'Unable to load subscription');
    }
  }, [api, identity]);
  React.useEffect(() => {
    identityRef.current = identity;
    revision.current = 0;
    setEntitlement(null);
    setLoadedIdentity(null);
    setError(null);
    void refresh();
  }, [identity, refresh]);
  React.useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);
  React.useEffect(() => {
    if (!identity) return;
    return subscribeToSubscriptionChanges({
      userId: identity,
      getTokenRequest: () => api.getRealtimeToken(),
      onChange: (nextRevision) => { if (nextRevision > revision.current) void refresh(); },
      onError: (cause) => {
        if (identityRef.current === identity) {
          setLoadedIdentity(identity);
          setError(cause.message);
        }
      },
    });
  }, [api, identity, refresh]);
  return {
    entitlement: loadedIdentity === identity ? entitlement : null,
    error: loadedIdentity === identity ? error : null,
  };
}
`);
}

function writeBackground(dir: string, hasAuth: boolean): void {
  const clerkImport = hasAuth
    ? "import { createClerkClient } from '@clerk/chrome-extension/background';\n\n"
    : '';
  const clerkInitialization = hasAuth
    ? `  const backgroundAuthErrorKey = 'anhedralClerkBackgroundError';
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  if (!publishableKey || publishableKey.includes('***')) {
    void chrome.storage.local.set({
      [backgroundAuthErrorKey]: 'Set VITE_CLERK_PUBLISHABLE_KEY before building the extension.',
    });
  } else {
    // Initialize Clerk in the background script for cookie-based auth and expose failures to the panel.
    void createClerkClient({
      publishableKey,
      syncHost: import.meta.env.VITE_CLERK_SYNC_HOST || undefined,
    }).then(
      () => chrome.storage.local.remove(backgroundAuthErrorKey),
      () => chrome.storage.local.set({
        [backgroundAuthErrorKey]: 'Clerk background initialization failed. Check the key and allowed origins.',
      }),
    );
  }

`
    : '';

  writeFile(path.join(dir, 'src/entrypoints/background.ts'), `${clerkImport}type ChromeWithSidePanel = typeof chrome & {
  sidePanel: {
    setPanelBehavior: (behavior: { openPanelOnActionClick: boolean }) => Promise<void>;
  };
};

export default defineBackground(() => {
${clerkInitialization}
  // Open the side panel when the extension icon is clicked.
  (chrome as ChromeWithSidePanel).sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});
`);
}

function writeSidepanelEntry(dir: string, hasAuth: boolean): void {
  const authImport = hasAuth ? "import { AuthProvider } from '../../contexts/auth-context';\n" : '';
  const app = hasAuth
    ? `      <AuthProvider>
        <SidePanelApp />
      </AuthProvider>`
    : '      <SidePanelApp />';

  writeFile(path.join(dir, 'src/entrypoints/sidepanel/main.tsx'), `import * as React from 'react';
import { createRoot } from 'react-dom/client';
${authImport}import { SidePanelApp } from './app';
import '../../styles/main.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
${app}
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
    <title>${htmlText(displayName)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
`);
}

function writeSidepanelApp(dir: string, hasAuth: boolean, hasBilling: boolean, hasItems: boolean): void {
  const authImports = hasAuth
    ? "import { useAuth } from '../../contexts/auth-context';\nimport { SignIn } from '@clerk/chrome-extension';\n"
    : '';
  const authState = hasAuth
    ? '  const { isSignedIn, isLoading, signOut } = useAuth();\n'
    : '';
  const authGuards = hasAuth
    ? `
  if (isLoading) {
    return <div role="status" aria-live="polite" style={{ padding: 24, textAlign: 'center' }}>Loading account…</div>;
  }

  if (!isSignedIn) {
    return (
      <div aria-label="Sign in" style={{ padding: 24 }}>
        <SignIn />
      </div>
    );
  }
`
    : '';
  const signOutButton = hasAuth
    ? '      <Button type="button" variant="outline" onClick={() => void signOut()}>Sign Out</Button>\n'
    : '';
  const entitlementImport = hasBilling ? "import { useEntitlement } from '../../hooks/use-entitlement';\n" : '';
  const entitlementState = hasBilling ? '  const { entitlement, error: entitlementError } = useEntitlement();\n' : '';
  const entitlementStatus = hasBilling
    ? `      {entitlement ? <p role="status">Plan: {entitlement.entitlement} ({entitlement.status})</p> : null}
      {entitlementError ? <p role="alert" style={{ color: 'hsl(var(--destructive))' }}>{entitlementError}</p> : null}
`
    : '';
  const itemListImport = hasItems ? "import { ItemList } from '../../components/item-list';\n" : '';
  const itemList = hasItems ? '      <ItemList />\n' : '';

  writeFile(path.join(dir, 'src/entrypoints/sidepanel/app.tsx'), `import * as React from 'react';
${authImports}${entitlementImport}${itemListImport}import { Button } from '../../components/ui/button';

type PageSnapshot = {
  title: string;
  location: string;
};

export function SidePanelApp() {
${authState}${entitlementState}  const [page, setPage] = React.useState<PageSnapshot | null>(null);
  const [pageError, setPageError] = React.useState<string | null>(null);

  const readActivePage = React.useCallback(async () => {
    setPageError(null);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      setPageError('No active tab is available.');
      return;
    }

    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ title: document.title, location: window.location.href }),
      });
      if (!injection?.result) throw new Error('The active page did not return a snapshot.');
      setPage(injection.result as PageSnapshot);
    } catch {
      setPageError('Chrome does not allow this page to be inspected. Open a normal website and try again.');
    }
  }, []);

${authGuards}
  return (
    <div style={{ padding: 24 }}>
      <h2>Welcome!</h2>
      <Button type="button" onClick={() => void readActivePage()}>Read active page</Button>
      {page ? (
        <div role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <strong>{page.title || 'Untitled page'}</strong>
          <p style={{ overflowWrap: 'anywhere' }}>{page.location}</p>
        </div>
      ) : null}
      {pageError ? <p role="alert" aria-live="assertive" style={{ color: 'hsl(var(--destructive))' }}>{pageError}</p> : null}
${itemList}${entitlementStatus}${signOutButton}    </div>
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

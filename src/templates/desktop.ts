import path from 'node:path';
import { writeFile } from '../util.js';
import { anhedralPrint } from '../print.js';
import type { ProjectOptions } from '../project.js';
import { DESKTOP_DEPENDENCIES, ELECTRON_UPDATER_DEPENDENCIES } from '../dependencies.js';
import { childPackageName, htmlText, identifierSegment, jsString } from '../render.js';

function selectedDependencies(options: ProjectOptions): Record<string, string> {
  const dependencies = { ...(DESKTOP_DEPENDENCIES.dependencies ?? {}) };
  if (!options.apps.api) delete dependencies['@shared/api-client'];
  if (!options.features.billing) delete dependencies['@shared/realtime'];
  if (!options.features.auth) {
    delete dependencies['@clerk/clerk-js'];
    delete dependencies['@clerk/ui'];
    delete dependencies['@solana/web3.js'];
    delete dependencies.bs58;
  }
  if (options.features.electronUpdater) {
    Object.assign(dependencies, ELECTRON_UPDATER_DEPENDENCIES.dependencies);
  }
  return dependencies;
}

export async function scaffoldDesktop(root: string, options: ProjectOptions): Promise<void> {
  const { projectName, displayName } = options;
  const dir = path.join(root, 'apps/desktop');

  anhedralPrint.section('Desktop (Electron + shadcn/ui)');
  anhedralPrint.step('Writing Electron desktop app');
  writePackageJson(dir, projectName, options);
  writeTsConfig(dir);
  writeViteConfig(dir);
  writePostcssConfig(dir);
  writeDevScript(dir);
  writeShadcnConfig(dir);
  writeEnvExample(dir, options);
  writeSourceFiles(dir, displayName, options);
  anhedralPrint.done('Electron desktop app written');
}

function writePackageJson(dir: string, projectName: string, options: ProjectOptions): void {
  const updatePublish = options.features.electronUpdater ? {
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    publish: [{
      provider: 'generic',
      url: '${env.DESKTOP_UPDATE_BASE_URL}/releases/${os}/${arch}',
      useMultipleRangeRequest: false,
    }],
  } : {};
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: childPackageName(projectName, 'desktop'),
    version: '0.1.0',
    private: true,
    type: 'module',
    main: 'dist/main/main.js',
    scripts: {
      dev: 'tsc -p tsconfig.main.json && node scripts/dev.mjs',
      build: 'tsc --noEmit && tsc -p tsconfig.main.json && vite build',
      typecheck: 'tsc --noEmit',
      'build:mac': `pnpm build && electron-builder --mac${options.features.electronUpdater ? ' --publish never' : ''}`,
      'build:win': `pnpm build && electron-builder --win${options.features.electronUpdater ? ' --publish never' : ''}`,
      'build:linux': `pnpm build && electron-builder --linux${options.features.electronUpdater ? ' --publish never' : ''}`,
      package: `pnpm build && electron-builder${options.features.electronUpdater ? ' --publish never' : ''}`,
      ...(options.features.electronUpdater ? {
        'updates:build:mac': 'pnpm build && electron-builder --mac --publish never',
        'updates:build:win': 'pnpm build && electron-builder --win --publish never',
        'updates:build:linux': 'pnpm build && electron-builder --linux --publish never',
      } : {}),
    },
    build: {
      appId: `dev.anhedral.${identifierSegment(projectName)}`,
      productName: projectName,
      directories: {
        output: 'release',
      },
      files: [
        'dist/**/*',
        'package.json',
      ],
      mac: {
        target: ['dmg', 'zip'],
      },
      win: {
        target: ['nsis', 'zip'],
      },
      linux: {
        executableName: identifierSegment(projectName),
        target: ['AppImage', 'deb'],
      },
      ...updatePublish,
    },
    dependencies: selectedDependencies(options),
    devDependencies: DESKTOP_DEPENDENCIES.devDependencies,
  }, null, 2) + '\n');
}

function writeTsConfig(dir: string): void {
  writeFile(path.join(dir, 'tsconfig.main.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      outDir: 'dist/main',
      rootDir: 'src/main',
      types: ['node'],
    },
    include: ['src/main/**/*'],
  }, null, 2) + '\n');
}

function writeViteConfig(dir: string): void {
  writeFile(path.join(dir, 'vite.config.ts'), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
});
`);
}

function writePostcssConfig(dir: string): void {
  writeFile(path.join(dir, 'postcss.config.mjs'), `const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
`);
}

function writeDevScript(dir: string): void {
  writeFile(path.join(dir, 'scripts/dev.mjs'), `import { spawn } from 'node:child_process';
import { once } from 'node:events';

const host = '127.0.0.1';
const port = '5173';
const devServerUrl = 'http://' + host + ':' + port;
const viteCommand = process.platform === 'win32' ? 'vite.cmd' : 'vite';
const electronCommand = process.platform === 'win32' ? 'electron.cmd' : 'electron';

function start(command, args, options = {}) {
  const invocation = process.platform === 'win32'
    ? {
        command: process.env.ComSpec || 'cmd.exe',
        args: ['/d', '/s', '/c', 'call', command, ...args],
      }
    : { command, args };
  return spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    ...options,
  });
}

function stop(child) {
  if (child && child.exitCode === null && !child.killed) child.kill('SIGTERM');
}

async function waitForServer(server, url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('Vite exited before the dev server was ready.');
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for Vite at ' + url + '.');
}

const vite = start(viteCommand, ['--host', host, '--port', port, '--strictPort']);
let electron;
let shuttingDown = false;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    shuttingDown = true;
    stop(electron);
    stop(vite);
  });
}

try {
  await waitForServer(vite, devServerUrl);
  electron = start(electronCommand, ['.'], {
    env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
  });
  vite.once('exit', (code) => {
    if (!shuttingDown) {
      console.error('Vite exited while Electron was running.');
      process.exitCode = code ?? 1;
      stop(electron);
    }
  });
  const [code] = await once(electron, 'exit');
  if (process.exitCode === undefined) process.exitCode = typeof code === 'number' ? code : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  shuttingDown = true;
  stop(electron);
  stop(vite);
}
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
      css: 'src/renderer/styles.css',
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

function writeEnvExample(dir: string, options: ProjectOptions): void {
  const lines = [
    options.apps.api ? 'VITE_API_URL=http://localhost:8787/api' : null,
    options.features.auth ? 'VITE_CLERK_PUBLISHABLE_KEY=pk_test_***' : null,
  ].filter((value): value is string => value !== null);
  writeFile(path.join(dir, '.env.example'), lines.join('\n') + (lines.length > 0 ? '\n' : ''));
  if (options.features.electronUpdater) {
    writeFile(path.join(dir, 'electron-builder.env.example'), 'DESKTOP_UPDATE_BASE_URL=https://updates.example.com\n');
  }
}

function writeSourceFiles(dir: string, displayName: string, options: ProjectOptions): void {
  const displayNameLiteral = jsString(displayName);
  const displayNameHtml = htmlText(displayName);
  const description = options.apps.api
    ? 'Electron + shadcn/ui desktop client using the same shared API client as web, mobile, and extension.'
    : 'Electron + shadcn/ui desktop client ready for your application.';
  const updaterImport = options.features.electronUpdater
    ? "import electronUpdater, { type AppUpdater } from 'electron-updater';\n"
    : '';
  const updaterRuntime = options.features.electronUpdater ? `
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
let updateTimer: NodeJS.Timeout | undefined;

function getAutoUpdater(): AppUpdater {
  const { autoUpdater } = electronUpdater;
  return autoUpdater;
}

async function checkForDesktopUpdate(updater: AppUpdater): Promise<void> {
  try {
    await updater.checkForUpdatesAndNotify();
  } catch (error) {
    console.error('Desktop update check failed:', error);
  }
}

function startDesktopUpdates(): void {
  if (!app.isPackaged) return;
  const updater = getAutoUpdater();
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('error', (error) => {
    console.error('Desktop updater error:', error);
  });
  void checkForDesktopUpdate(updater);
  updateTimer = setInterval(() => {
    void checkForDesktopUpdate(updater);
  }, UPDATE_CHECK_INTERVAL_MS);
  updateTimer.unref();
}
` : '';
  const updaterStart = options.features.electronUpdater ? '  startDesktopUpdates();\n' : '';
  const updaterStop = options.features.electronUpdater
    ? "app.on('before-quit', () => { if (updateTimer) clearInterval(updateTimer); });\n"
    : '';
  writeFile(path.join(dir, 'src/main/app-window.ts'), `import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererIndex = path.join(__dirname, '../renderer/index.html');

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isAllowedAppNavigation(value: string): boolean {
  try {
    const target = new URL(value);
    if (process.env.VITE_DEV_SERVER_URL) {
      return target.origin === new URL(process.env.VITE_DEV_SERVER_URL).origin;
    }
    return target.href === pathToFileURL(rendererIndex).href;
  } catch {
    return false;
  }
}

// Product-owned window options and navigation policy belong in this file.
// Anhedral's managed main.ts imports this seam and wires lifecycle integrations around it.
export function createAppWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    title: ${displayNameLiteral},
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedAppNavigation(url)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url).catch((error) => {
        console.error('Unable to open external URL:', error);
      });
    }
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL).catch((error) => {
      console.error('Unable to load the development renderer:', error);
    });
  } else {
    void window.loadFile(rendererIndex).catch((error) => {
      console.error('Unable to load the packaged renderer:', error);
    });
  }

  return window;
}
`);

  writeFile(path.join(dir, 'src/main/main.ts'), `import { app, BrowserWindow, session } from 'electron';
import { createAppWindow } from './app-window.js';
${updaterImport}${updaterRuntime}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createAppWindow();
${updaterStart}});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createAppWindow();
});
${updaterStop}`);

  writeFile(path.join(dir, 'src/main/preload.cts'), `import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('anhedral', {
  platform: process.platform,
});
`);

  writeFile(path.join(dir, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: ws://127.0.0.1:* wss:; img-src 'self' data: https:; font-src 'self' data: https:; frame-src https:; form-action 'self' https:" />
    <title>${displayNameHtml}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
`);

  writeFile(path.join(dir, 'src/renderer/lib/utils.ts'), `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`);

  if (options.apps.api) {
    const authImport = options.features.auth ? "import { getAuthToken } from './auth';\n" : '';
    const getToken = options.features.auth ? 'getAuthToken' : 'async () => null';
    writeFile(path.join(dir, 'src/renderer/lib/api.ts'), `import { ApiClient, normalizeApiBaseUrl } from '@shared/api-client';
${authImport}

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

export const api = new ApiClient({
  baseUrl: apiBaseUrl(),
  getToken: ${getToken},
});
`);
  }

  if (options.features.auth) {
    writeFile(path.join(dir, 'src/renderer/lib/auth.ts'), `import type { Clerk as ClerkInstance } from '@clerk/clerk-js';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
let initialization: Promise<ClerkInstance | null> | null = null;

export function isClerkConfigured(): boolean {
  return publishableKey.length > 0 && !publishableKey.includes('***');
}

export function initializeClerk(): Promise<ClerkInstance | null> {
  if (!isClerkConfigured()) return Promise.resolve(null);
  if (!initialization) {
    initialization = Promise.all([
      import('@clerk/clerk-js'),
      import('@clerk/ui'),
    ]).then(async ([{ Clerk }, { ui }]) => {
      const clerk = new Clerk(publishableKey);
      await clerk.load({ ui });
      return clerk;
    }).catch((error) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

export async function getAuthToken(): Promise<string | null> {
  const clerk = await initializeClerk();
  return clerk?.session?.getToken() ?? null;
}

export async function getAuthUserId(): Promise<string | null> {
  const clerk = await initializeClerk();
  return clerk?.user?.id ?? null;
}

export async function subscribeToAuthState(listener: (userId: string | null) => void): Promise<() => void> {
  const clerk = await initializeClerk();
  if (!clerk) {
    listener(null);
    return () => undefined;
  }
  const synchronize = () => listener(clerk.user?.id ?? null);
  synchronize();
  return clerk.addListener(synchronize);
}

export async function openAccount(): Promise<boolean> {
  const clerk = await initializeClerk();
  if (!clerk) return false;

  if (clerk.user) clerk.openUserProfile();
  else clerk.openSignIn();
  return true;
}
`);
  }

  if (options.features.billing) {
    writeFile(path.join(dir, 'src/renderer/hooks/use-entitlement.ts'), `import { subscribeToSubscriptionChanges } from '@shared/realtime';
import * as React from 'react';
import { api } from '../lib/api';
export function useEntitlement(identity: string | null) {
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
  }, [identity]);
  React.useEffect(() => {
    identityRef.current = identity;
    revision.current = 0;
    setEntitlement(null);
    setLoadedIdentity(null);
    setError(null);
    void refresh();
  }, [identity, refresh]);
  React.useEffect(() => {
    if (!identity) return;
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [identity, refresh]);
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
  }, [identity, refresh]);
  return {
    entitlement: loadedIdentity === identity ? entitlement : null,
    error: loadedIdentity === identity ? error : null,
  };
}
`);
  }

  writeFile(path.join(dir, 'src/renderer/components/ui/button.tsx'), `import * as React from 'react';
import { cn } from '@/lib/utils';

export function Button({ className, type = 'button', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn('inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50', className)}
      {...props}
    />
  );
}
`);

  if (options.apps.api && options.features.database) {
    writeFile(path.join(dir, 'src/renderer/components/item-list.tsx'), `import { createItem, listItems, type Item } from '@shared/api-client';
import * as React from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function ItemList({ identity = 'public' }: { identity?: string | null }) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [loadedIdentity, setLoadedIdentity] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'saving'>('idle');
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
  }, [identity]);

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

  if (!identity) {
    return <p className="text-muted-foreground">Open your account and sign in to use the working starter feature.</p>;
  }

  return (
    <section aria-labelledby="starter-feature-title" className="flex max-w-2xl flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-semibold" id="starter-feature-title">Working starter feature</h2>
      <form className="flex gap-2" onSubmit={(event) => void submit(event)}>
        <label className="sr-only" htmlFor="item-name">Item name</label>
        <input
          className="h-9 flex-1 rounded-md border border-slate-300 bg-background px-3 text-sm"
          id="item-name"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your first item"
          value={name}
        />
        <Button disabled={status !== 'ready' || loadedIdentity !== identity || !name.trim()} type="submit">
          {status === 'saving' ? 'Adding…' : 'Add item'}
        </Button>
      </form>
      {visibleError ? (
        <p className="text-sm text-red-700" role="alert">
          {visibleError}. Check DATABASE_URL, run pnpm db:migrate, and make sure the API is running.
        </p>
      ) : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading items…</p> : null}
      {!isLoading && visibleItems.length === 0 && !visibleError
        ? <p className="text-sm text-muted-foreground">Your database is connected. Add the first item.</p>
        : null}
      {visibleItems.length > 0 ? (
        <ul className="divide-y rounded-md border border-slate-200">
          {visibleItems.map((item) => <li className="px-3 py-2 text-sm" key={item.id}>{item.name}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
`);
  }

  const authImport = options.features.auth
    ? "import { getAuthUserId, isClerkConfigured, openAccount, subscribeToAuthState } from '@/lib/auth';\n"
    : '';
  const entitlementImport = options.features.billing ? "import { useEntitlement } from '@/hooks/use-entitlement';\n" : '';
  const itemListImport = options.apps.api && options.features.database ? "import { ItemList } from '@/components/item-list';\n" : '';
  const entitlementState = options.features.billing ? "  const { entitlement, error: entitlementError } = useEntitlement(clerkState === 'ready' ? clerkUserId : null);\n" : '';
  const entitlementStatus = options.features.billing ? `      {entitlement ? <p className="text-muted-foreground">Plan: {entitlement.entitlement} ({entitlement.status})</p> : null}
      {entitlementError ? <p role="alert" className="text-red-700">{entitlementError}</p> : null}
` : '';
  const authState = options.features.auth ? `  const [clerkState, setClerkState] = React.useState<'unconfigured' | 'signed-out' | 'loading' | 'ready' | 'error'>(
    () => isClerkConfigured() ? 'loading' : 'unconfigured',
  );
  const [clerkUserId, setClerkUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isClerkConfigured()) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void subscribeToAuthState((userId) => {
      if (!disposed) {
        setClerkUserId(userId);
        setClerkState(userId ? 'ready' : 'signed-out');
      }
    }).then((stop) => {
      if (disposed) stop();
      else unsubscribe = stop;
    }).catch(() => {
      if (!disposed) setClerkState('error');
    });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const handleAccount = async () => {
    setClerkState('loading');
    try {
      const opened = await openAccount();
      const userId = opened ? await getAuthUserId() : null;
      setClerkUserId(userId);
      setClerkState(opened ? (userId ? 'ready' : 'signed-out') : 'unconfigured');
    } catch {
      setClerkUserId(null);
      setClerkState('error');
    }
  };

` : '';
  const authStatus = options.features.auth ? `      <p
        role={clerkState === 'error' || clerkState === 'unconfigured' ? 'alert' : 'status'}
        aria-live={clerkState === 'error' || clerkState === 'unconfigured' ? 'assertive' : 'polite'}
        className={clerkState === 'error' || clerkState === 'unconfigured' ? 'text-red-700' : 'text-muted-foreground'}
      >
        {clerkState === 'unconfigured' ? 'Set VITE_CLERK_PUBLISHABLE_KEY to enable accounts.' : null}
        {clerkState === 'signed-out' ? 'Sign in to use account-backed features.' : null}
        {clerkState === 'loading' ? 'Loading account services…' : null}
        {clerkState === 'ready' ? 'Signed in. Account-backed features are ready.' : null}
        {clerkState === 'error' ? 'Clerk could not initialize. Check the publishable key and network connection.' : null}
      </p>
` : '';
  const buttonAction = options.features.auth
    ? " disabled={clerkState === 'loading' || clerkState === 'unconfigured'} onClick={() => void handleAccount()}"
    : '';
  const accountButton = options.features.auth
    ? `      <Button${buttonAction}>Open account</Button>\n`
    : '';
  const buttonImport = options.features.auth ? "import { Button } from '@/components/ui/button';\n" : '';
  const itemList = options.apps.api && options.features.database
    ? options.features.auth
      ? "      <ItemList identity={clerkState === 'ready' ? clerkUserId : null} />\n"
      : "      <ItemList />\n"
    : '';
  writeFile(path.join(dir, 'src/renderer/main.tsx'), `import React from 'react';
import ReactDOM from 'react-dom/client';
${buttonImport}${authImport}${entitlementImport}${itemListImport}import './styles.css';

function App() {
${authState}${entitlementState}  return (
    <main className="flex min-h-screen flex-col gap-6 bg-background p-8 text-foreground">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">{${displayNameLiteral}}</h1>
        <p className="max-w-2xl text-muted-foreground">
          ${description}
        </p>
      </section>
${authStatus}
${entitlementStatus}
${accountButton}
${itemList}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`);

  writeFile(path.join(dir, 'src/renderer/styles.css'), `@import "tailwindcss";

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --muted-foreground: oklch(0.556 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted-foreground: var(--muted-foreground);
}

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button {
  border: 0;
}
`);
}

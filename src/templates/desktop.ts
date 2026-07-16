import path from 'node:path';
import { writeFile } from '../util.js';
import { anhedralPrint } from '../print.js';
import type { ProjectOptions } from '../scaffold.js';
import { DESKTOP_DEPENDENCIES } from '../dependencies.js';
import { childPackageName, htmlText, identifierSegment, jsString } from '../render.js';

function selectedDependencies(options: ProjectOptions): Record<string, string> {
  const dependencies = { ...(DESKTOP_DEPENDENCIES.dependencies ?? {}) };
  if (!options.apps.api) delete dependencies['@shared/api-client'];
  if (!options.features.auth) {
    delete dependencies['@clerk/clerk-js'];
    delete dependencies['@clerk/ui'];
    delete dependencies['@solana/web3.js'];
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
      'build:mac': 'pnpm build && electron-builder --mac',
      'build:win': 'pnpm build && electron-builder --win',
      'build:linux': 'pnpm build && electron-builder --linux',
      package: 'pnpm build && electron-builder',
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
        target: ['AppImage', 'deb'],
      },
    },
    dependencies: selectedDependencies(options),
    devDependencies: DESKTOP_DEPENDENCIES.devDependencies,
  }, null, 2) + '\n');
}

function writeTsConfig(dir: string): void {
  writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      useDefineForClassFields: true,
      lib: ['DOM', 'DOM.Iterable', 'ES2022'],
      allowJs: false,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: true,
      forceConsistentCasingInFileNames: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      types: ['node', 'vite/client'],
      paths: { '@/*': ['./src/renderer/*'] },
    },
    include: ['src/**/*', 'vite.config.ts'],
    references: [],
  }, null, 2) + '\n');

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
}

function writeSourceFiles(dir: string, displayName: string, options: ProjectOptions): void {
  const displayNameLiteral = jsString(displayName);
  const displayNameHtml = htmlText(displayName);
  const description = options.apps.api
    ? 'Electron + shadcn/ui desktop client using the same shared API client as web, mobile, and extension.'
    : 'Electron + shadcn/ui desktop client ready for your application.';
  const buttonLabel = options.features.auth ? 'Open account' : options.apps.api ? 'Explore API' : 'Get started';
  writeFile(path.join(dir, 'src/main/main.ts'), `import { app, BrowserWindow, session, shell } from 'electron';
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

function createWindow() {
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
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
`);

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
    writeFile(path.join(dir, 'src/renderer/lib/auth.ts'), `import { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
let initialization: Promise<Clerk | null> | null = null;

export function isClerkConfigured(): boolean {
  return publishableKey.length > 0;
}

export function initializeClerk(): Promise<Clerk | null> {
  if (!publishableKey) return Promise.resolve(null);
  if (!initialization) {
    const clerk = new Clerk(publishableKey);
    initialization = clerk.load({ ui }).then(() => clerk).catch((error) => {
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

export async function openAccount(): Promise<boolean> {
  const clerk = await initializeClerk();
  if (!clerk) return false;

  if (clerk.user) clerk.openUserProfile();
  else clerk.openSignIn();
  return true;
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

  const authImport = options.features.auth ? "import { initializeClerk, isClerkConfigured, openAccount } from '@/lib/auth';\n" : '';
  const authState = options.features.auth ? `  const [clerkState, setClerkState] = React.useState<'unconfigured' | 'loading' | 'ready' | 'error'>(
    () => isClerkConfigured() ? 'loading' : 'unconfigured',
  );

  React.useEffect(() => {
    if (!isClerkConfigured()) return;
    let active = true;
    void initializeClerk().then(
      () => { if (active) setClerkState('ready'); },
      () => { if (active) setClerkState('error'); },
    );
    return () => { active = false; };
  }, []);

  const handleAccount = async () => {
    try {
      const opened = await openAccount();
      if (!opened) setClerkState('unconfigured');
    } catch {
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
        {clerkState === 'loading' ? 'Loading account services…' : null}
        {clerkState === 'ready' ? 'Account services are ready.' : null}
        {clerkState === 'error' ? 'Clerk could not initialize. Check the publishable key and network connection.' : null}
      </p>
` : '';
  const buttonAction = options.features.auth
    ? " disabled={clerkState !== 'ready'} onClick={() => void handleAccount()}"
    : '';
  writeFile(path.join(dir, 'src/renderer/main.tsx'), `import React from 'react';
import ReactDOM from 'react-dom/client';
import { Button } from '@/components/ui/button';
${authImport}import './styles.css';

function App() {
${authState}  return (
    <main className="flex min-h-screen flex-col gap-6 bg-background p-8 text-foreground">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">{${displayNameLiteral}}</h1>
        <p className="max-w-2xl text-muted-foreground">
          ${description}
        </p>
      </section>
${authStatus}
      <Button${buttonAction}>${buttonLabel}</Button>
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

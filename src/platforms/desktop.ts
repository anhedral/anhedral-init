import path from 'node:path';
import { writeReactLintConfig } from './lint.js';
import { writeFile } from '../util.js';
import type { ProjectOptions } from '../project.js';
import { DESKTOP_DEPENDENCIES } from '../dependencies.js';
import { childPackageName, htmlText, identifierSegment, jsString } from '../render.js';
export async function scaffoldDesktop(root: string, options: ProjectOptions): Promise<void> {
    const { projectName, displayName } = options;
    const dir = path.join(root, 'apps/desktop');
    writePackageJson(dir, projectName);
    writeReactLintConfig(dir);
    writeTsConfig(dir);
    writeViteConfig(dir);
    writePostcssConfig(dir);
    writeDevScript(dir);
    writeShadcnConfig(dir);
    writeEnvExample(dir);
    writeSourceFiles(dir, displayName);
}
function writePackageJson(dir: string, projectName: string): void {
    writeFile(path.join(dir, 'package.json'), JSON.stringify({
        name: childPackageName(projectName, 'desktop'),
        version: '0.1.0',
        private: true,
        type: 'module',
        main: 'dist/main/main.js',
        scripts: {
            dev: 'tsc -p tsconfig.main.json && node scripts/dev.mjs',
            build: 'tsc --noEmit && tsc -p tsconfig.main.json && vite build',
            typecheck: 'tsc --noEmit && tsc -p tsconfig.main.json --noEmit',
            lint: 'eslint src --max-warnings 0',
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
                executableName: identifierSegment(projectName),
                target: ['AppImage', 'deb'],
            },
        },
        dependencies: DESKTOP_DEPENDENCIES.dependencies,
        devDependencies: { ...DESKTOP_DEPENDENCIES.devDependencies, '@workspace/eslint-config': 'workspace:*' },
    }, null, 2) + '\n');
}
function writeTsConfig(dir: string): void {
    writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM'], module: 'ESNext',
            moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true,
            esModuleInterop: true, noEmit: true, types: ['node', 'vite/client'],
            paths: { '@/*': ['./src/renderer/*'] } },
        include: ['src/renderer/**/*', 'vite.config.ts'],
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
    // Clerk is already loaded behind a dynamic import. Its optional account-management
    // surface is intentionally a large async chunk and does not inflate initial rendering.
    chunkSizeWarningLimit: 1600,
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

async function isServerReady(url) {
  try { return (await fetch(url)).ok; }
  catch { return false; }
}

async function waitForServer(server, url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('Vite exited before the dev server was ready.');
    if (await isServerReady(url)) return;
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
function writeEnvExample(dir: string): void {
    writeFile(path.join(dir, '.env.example'), '');
}
function writeSourceFiles(dir: string, displayName: string): void {
    const displayNameLiteral = jsString(displayName);
    const displayNameHtml = htmlText(displayName);
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


app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createAppWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createAppWindow();
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
    writeFile(path.join(dir, 'src/renderer/main.tsx'), `import React from 'react';
import ReactDOM from 'react-dom/client';
import { Button } from '@/components/ui/button';
import './styles.css';

function App() {
  return (
    <main className="flex min-h-screen flex-col gap-6 bg-background p-8 text-foreground">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">{${displayNameLiteral}}</h1>
        <p className="max-w-2xl text-muted-foreground">
          ${"Electron + shadcn/ui desktop client ready for your application."}
        </p>
      </section>
      <Button className="self-start" onClick={() => window.location.reload()}>Reload</Button>
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

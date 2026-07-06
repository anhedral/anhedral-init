import path from 'node:path';
import { writeFile } from '../util.js';
import { anhedralPrint } from '../print.js';
import type { ProjectOptions } from '../scaffold.js';
import { DESKTOP_DEPENDENCIES } from '../dependencies.js';

export async function scaffoldDesktop(root: string, { projectName, displayName }: ProjectOptions): Promise<void> {
  const dir = path.join(root, 'apps/desktop');

  anhedralPrint.section('Desktop (Electron + shadcn/ui)');
  anhedralPrint.step('Writing Electron desktop app');
  writePackageJson(dir, projectName);
  writeTsConfig(dir);
  writeViteConfig(dir);
  writeShadcnConfig(dir);
  writeEnvExample(dir);
  writeSourceFiles(dir, displayName);
  anhedralPrint.done('Electron desktop app written');
}

function writePackageJson(dir: string, projectName: string): void {
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: `${projectName}-desktop`,
    version: '0.1.0',
    private: true,
    type: 'module',
    main: 'dist/main/main.js',
    scripts: {
      dev: 'vite --host 127.0.0.1',
      build: 'tsc --noEmit && tsc -p tsconfig.main.json && vite build',
      typecheck: 'tsc --noEmit',
      'build:mac': 'pnpm build && electron-builder --mac',
      'build:win': 'pnpm build && electron-builder --win',
      'build:linux': 'pnpm build && electron-builder --linux',
      'build:all': 'pnpm build && electron-builder --mac --win --linux',
    },
    build: {
      appId: `dev.anhedral.${projectName}`,
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
    dependencies: DESKTOP_DEPENDENCIES.dependencies,
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
      types: ['node'],
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
    include: ['src/main/**/*.ts'],
  }, null, 2) + '\n');
}

function writeViteConfig(dir: string): void {
  writeFile(path.join(dir, 'vite.config.ts'), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
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
  writeFile(path.join(dir, '.env.example'), `VITE_API_URL=http://localhost:8787
VITE_CLERK_PUBLISHABLE_KEY=pk_test_***
`);
}

function writeSourceFiles(dir: string, displayName: string): void {
  writeFile(path.join(dir, 'src/main/main.ts'), `import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    title: '${displayName}',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
`);

  writeFile(path.join(dir, 'src/main/preload.ts'), `import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('anhedral', {
  platform: process.platform,
});
`);

  writeFile(path.join(dir, 'index.html'), `<div id="root"></div>
<script type="module" src="/src/renderer/main.tsx"></script>
`);

  writeFile(path.join(dir, 'src/renderer/lib/utils.ts'), `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`);

  writeFile(path.join(dir, 'src/renderer/lib/api.ts'), `import { ApiClient } from '@shared/api-client';

export const api = new ApiClient({
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:8787',
  getToken: async () => null,
  platform: 'frontend',
});
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
        <h1 className="text-3xl font-semibold">${displayName}</h1>
        <p className="max-w-2xl text-muted-foreground">
          Electron + shadcn/ui desktop client using the same shared API client as web, mobile, and extension.
        </p>
      </section>
      <Button>Open account</Button>
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

body {
  margin: 0;
}
`);
}

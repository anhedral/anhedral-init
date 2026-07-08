import path from 'node:path';
import { rmSync } from 'node:fs';
import { exec, writeFile } from '../util.js';
import { anhedralPrint } from '../print.js';
import type { ProjectOptions } from '../scaffold.js';
import { WEB_APP_DEPENDENCIES } from '../dependencies.js';

export async function scaffoldWeb(root: string, { projectName, displayName, skipInstall }: ProjectOptions): Promise<void> {
  const dir = path.join(root, 'apps/web');

  anhedralPrint.section('Web (Next.js + shadcn/ui)');
  anhedralPrint.step('Scaffolding Next.js app with shadcn');
  if (skipInstall) {
    anhedralPrint.info('Skipping shadcn init (--skip-install). Run after init: pnpm dlx shadcn@latest init -d --template next --name web');
  } else {
    exec(`pnpm dlx shadcn@latest init -d --template next --name web`, path.join(root, 'apps'));
    rmSync(path.join(dir, '.git'), { recursive: true, force: true });
  }
  anhedralPrint.done(skipInstall ? 'Next.js + shadcn manifests written' : 'Next.js + shadcn app scaffolded');

  anhedralPrint.step('Writing web app customizations');
  writePackageJson(dir, projectName);
  writeTsConfig(dir);
  writeNextConfig(dir);
  writePostcssConfig(dir);
  writeShadcnConfig(dir);
  writeEnvExample(dir);
  writeUiFiles(dir);
  writeAppFiles(dir, displayName);
  if (!skipInstall) {
    exec('pnpm install --no-frozen-lockfile', root);
  }
  anhedralPrint.done(skipInstall ? 'Next.js web app written' : 'Next.js web dependencies installed');
}

function writePackageJson(dir: string, projectName: string): void {
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: `${projectName}-web`,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      typecheck: 'tsc --noEmit',
    },
    dependencies: WEB_APP_DEPENDENCIES.dependencies,
    devDependencies: WEB_APP_DEPENDENCIES.devDependencies,
  }, null, 2) + '\n');
}

function writeTsConfig(dir: string): void {
  writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2017',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2) + '\n');
  writeFile(path.join(dir, 'next-env.d.ts'), `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`);
}

function writeNextConfig(dir: string): void {
  writeFile(path.join(dir, 'next.config.ts'), `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
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

function writeShadcnConfig(dir: string): void {
  writeFile(path.join(dir, 'components.json'), JSON.stringify({
    $schema: 'https://ui.shadcn.com/schema.json',
    style: 'new-york',
    rsc: true,
    tsx: true,
    tailwind: {
      config: '',
      css: 'app/globals.css',
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
  writeFile(path.join(dir, '.env.example'), `NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***
NEXT_PUBLIC_RC_ENTITLEMENT_ID=pro
`);
}

function writeUiFiles(dir: string): void {
  writeFile(path.join(dir, 'lib/utils.ts'), `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`);

  writeFile(path.join(dir, 'lib/api.ts'), `import { ApiClient } from '@shared/api-client';

export function createApiClient(getToken?: () => Promise<string | null>) {
  return new ApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || '/api',
    getToken: getToken ?? (async () => null),
    platform: 'frontend',
  });
}
`);

  writeFile(path.join(dir, 'components/ui/button.tsx'), `import * as React from 'react';
import { cn } from '@/lib/utils';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline';
};

export function Button({ className, variant = 'default', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variant === 'outline' ? 'border border-input bg-background hover:bg-accent' : 'bg-primary text-primary-foreground hover:bg-primary/90',
        className,
      )}
      {...props}
    />
  );
}
`);

  writeFile(path.join(dir, 'components/ui/card.tsx'), `import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('text-2xl font-semibold leading-none', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}
`);
}

function writeAppFiles(dir: string, displayName: string): void {
  writeFile(path.join(dir, 'app/globals.css'), `@import "tailwindcss";

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
`);

  writeFile(path.join(dir, 'app/layout.tsx'), `import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: '${displayName}',
  description: '${displayName} web app',
};

function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return <>{children}</>;
  }

  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
`);

  writeFile(path.join(dir, 'app/page.tsx'), `import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <section className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-normal">${displayName}</h1>
        <p className="max-w-2xl text-muted-foreground">
          Next.js + shadcn/ui web client connected to the shared Fastify API through the monorepo API client.
        </p>
        <div className="flex gap-3">
          <Button>Open app</Button>
          <Button variant="outline">View account</Button>
        </div>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Shared modules</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Contracts, API access, database schema, and config live in packages/* and are reused by every client.
        </CardContent>
      </Card>
    </main>
  );
}
`);
}

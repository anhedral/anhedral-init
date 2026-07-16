import path from 'node:path';
import { writeFile } from '../util.js';
import { anhedralPrint } from '../print.js';
import type { ProjectOptions } from '../scaffold.js';
import { WEB_APP_DEPENDENCIES } from '../dependencies.js';
import { childPackageName, jsString } from '../render.js';

export async function scaffoldWeb(root: string, options: ProjectOptions): Promise<void> {
  const dir = path.join(root, 'apps/web');

  anhedralPrint.section('Web (Next.js + shadcn/ui)');
  anhedralPrint.step('Materializing bundled Next.js + shadcn substrate');
  anhedralPrint.done('Next.js + shadcn substrate materialized');

  anhedralPrint.step('Writing web app customizations');
  writePackageJson(dir, options);
  writeTsConfig(dir);
  writeNextConfig(dir);
  writePostcssConfig(dir);
  writeShadcnConfig(dir);
  writeEnvExample(dir, options);
  writeUiFiles(dir, options);
  writeAppFiles(dir, options);
  anhedralPrint.done('Next.js web app written');
}

function writePackageJson(dir: string, options: ProjectOptions): void {
  const dependencies = { ...(WEB_APP_DEPENDENCIES.dependencies ?? {}) };
  if (!options.apps.api) delete dependencies['@shared/api-client'];
  if (!options.features.billing) delete dependencies['@shared/realtime'];
  if (!options.features.auth) {
    delete dependencies['@clerk/nextjs'];
    delete dependencies['@clerk/ui'];
  }
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: childPackageName(options.projectName, 'web'),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      typecheck: 'tsc --noEmit',
    },
    dependencies,
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
      jsx: 'react-jsx',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2) + '\n');
}

function writeNextConfig(dir: string): void {
  writeFile(path.join(dir, 'next.config.ts'), `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [{ source: '/api/:path*', destination: 'http://localhost:8787/api/:path*' }];
  },
};

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

function writeEnvExample(dir: string, options: ProjectOptions): void {
  const lines = [
    options.apps.api ? 'NEXT_PUBLIC_API_URL=http://localhost:8787/api' : null,
    options.features.auth ? 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***' : null,
  ].filter((value): value is string => value !== null);
  writeFile(path.join(dir, '.env.example'), lines.join('\n') + (lines.length > 0 ? '\n' : ''));
}

function writeUiFiles(dir: string, options: ProjectOptions): void {
  writeFile(path.join(dir, 'lib/utils.ts'), `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`);

  if (options.apps.api) writeFile(path.join(dir, 'lib/api.ts'), `import { ApiClient, normalizeApiBaseUrl } from '@shared/api-client';

function normalizeWebApiBaseUrl(value: string): string {
  const candidate = value.trim();
  if (!candidate.startsWith('/')) return normalizeApiBaseUrl(candidate, 'NEXT_PUBLIC_API_URL');
  if (candidate.startsWith('//') || candidate.includes('\\\\')) {
    throw new Error('NEXT_PUBLIC_API_URL must be a single-slash root-relative path or an absolute URL');
  }
  if (typeof window === 'undefined') {
    throw new Error('A root-relative NEXT_PUBLIC_API_URL can only be resolved in the browser');
  }
  return normalizeApiBaseUrl(new URL(candidate, window.location.origin).toString(), 'NEXT_PUBLIC_API_URL');
}

function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  const candidate = configured || (process.env.NODE_ENV === 'development' ? 'http://localhost:8787/api' : '/api');
  const normalized = normalizeWebApiBaseUrl(candidate);
  const url = new URL(normalized);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_API_URL must use https: in production');
  }
  return normalized;
}

export function createApiClient(getToken?: () => Promise<string | null>) {
  return new ApiClient({
    baseUrl: apiBaseUrl(),
    getToken: getToken ?? (async () => null),
  });
}
`);

  if (options.apps.api && options.features.auth) {
    writeFile(path.join(dir, 'hooks/use-api-client.ts'), `'use client';

import { useAuth } from '@clerk/nextjs';
import { useMemo } from 'react';
import { createApiClient } from '@/lib/api';

export function useApiClient() {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(() => getToken()), [getToken]);
}
`);
  }

  if (options.features.billing) {
    writeFile(path.join(dir, 'hooks/use-entitlement.ts'), `'use client';

import { subscribeToSubscriptionChanges } from '@shared/realtime';
import { useAuth } from '@clerk/nextjs';
import * as React from 'react';
import { useApiClient } from './use-api-client';

export function useEntitlement() {
  const api = useApiClient();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [state, setState] = React.useState<Awaited<ReturnType<typeof api.getEntitlement>> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const revision = React.useRef(0);
  const refresh = React.useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const next = await api.getEntitlement();
      revision.current = Math.max(revision.current, next.revision);
      setState(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load subscription');
    }
  }, [api, isLoaded, isSignedIn]);

  React.useEffect(() => { void refresh(); }, [refresh]);
  React.useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);
  React.useEffect(() => {
    if (!userId || !isSignedIn) return;
    return subscribeToSubscriptionChanges({
      userId,
      getTokenRequest: () => api.getRealtimeToken(),
      onChange: (nextRevision) => {
        if (nextRevision > revision.current) void refresh();
      },
      onError: (cause) => setError(cause.message),
    });
  }, [api, isSignedIn, refresh, userId]);
  return { entitlement: state, error, refresh };
}
`);
    writeFile(path.join(dir, 'components/subscription-status.tsx'), `'use client';

import { useEntitlement } from '@/hooks/use-entitlement';

export function SubscriptionStatus() {
  const { entitlement, error } = useEntitlement();
  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!entitlement) return <p className="text-sm text-muted-foreground">Loading subscription…</p>;
  return <p className="text-sm text-muted-foreground">Plan: {entitlement.entitlement} ({entitlement.status})</p>;
}
`);
  }

  if (options.features.auth) {
    writeFile(path.join(dir, 'components/account-actions.tsx'), `'use client';

import { Show, SignInButton, UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

export function AccountActions() {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button variant="outline">Sign in</Button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  );
}
`);
  }

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

function writeAppFiles(dir: string, options: ProjectOptions): void {
  const { displayName } = options;
  const displayNameLiteral = jsString(displayName);
  const descriptionLiteral = jsString(`${displayName} web app`);
  const accountActionsImport = options.features.auth
    ? "import { AccountActions } from '@/components/account-actions';\n"
    : '';
  const accountAction = options.features.auth
    ? `{process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
            <AccountActions />
          ) : (
            <Button variant="outline" disabled>Configure Clerk to sign in</Button>
          )}`
    : '<Button variant="outline">View account</Button>';
  const clerkStyles = options.features.auth ? '@import "@clerk/ui/themes/shadcn.css";\n' : '';
  writeFile(path.join(dir, 'app/globals.css'), `@import "tailwindcss";
${clerkStyles}

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

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-border: var(--border);
  --color-input: var(--input);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
`);

  const authImport = options.features.auth
    ? "import { ClerkProvider } from '@clerk/nextjs';\nimport { shadcn } from '@clerk/ui/themes';\n"
    : '';
  const providers = options.features.auth ? `function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) return <>{children}</>;
  return <ClerkProvider publishableKey={publishableKey} appearance={{ theme: shadcn }}>{children}</ClerkProvider>;
}` : `function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}`;
  writeFile(path.join(dir, 'app/layout.tsx'), `import type { Metadata } from 'next';
${authImport}import './globals.css';

export const metadata: Metadata = {
  title: ${displayNameLiteral},
  description: ${descriptionLiteral},
};

${providers}

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

  const subscriptionImport = options.features.billing ? "import { SubscriptionStatus } from '@/components/subscription-status';\n" : '';
  const subscriptionStatus = options.features.billing
    ? '        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <SubscriptionStatus /> : null}\n'
    : '';
  writeFile(path.join(dir, 'app/page.tsx'), `${accountActionsImport}${subscriptionImport}import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <section className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-normal">{${displayNameLiteral}}</h1>
        <p className="max-w-2xl text-muted-foreground">
          ${options.apps.api ? 'Next.js + shadcn/ui web client connected to the shared Fastify API.' : 'Next.js + shadcn/ui web application.'}
        </p>
        <div className="flex gap-3">
          <Button>Open app</Button>
          ${accountAction}
        </div>
${subscriptionStatus}      </section>
      <Card>
        <CardHeader>
          <CardTitle>Shared modules</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          ${options.apps.api ? 'Contracts, API access, and configuration are shared through workspace packages.' : 'Add modules later with anhedral add; user-owned source remains untouched.'}
        </CardContent>
      </Card>
    </main>
  );
}
`);
}

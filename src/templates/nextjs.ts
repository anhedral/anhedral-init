import fs from 'node:fs';
import path from 'node:path';
import { anhedralPrint } from '../print.js';
import { NEXT_TEMPLATE_DEPENDENCIES } from '../dependencies.js';
import { appendGitignore, exec, liftNestedProject, writeFile } from '../util.js';
import type { ProjectOptions } from '../scaffold.js';

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  pnpm?: {
    onlyBuiltDependencies?: string[];
  };
};

export async function scaffoldNextjs(root: string, { projectName, displayName, skipInstall }: ProjectOptions): Promise<void> {
  anhedralPrint.section('Next.js (shadcn/ui)');
  anhedralPrint.step('Scaffolding Next.js app with shadcn');
  exec(`pnpm dlx --allow-build=msw shadcn@latest init -d --template next --name ${projectName}`, root);
  liftNestedProject(root, projectName);
  anhedralPrint.done('Next.js app scaffolded');

  anhedralPrint.step('Writing Next.js application, API routes, and provider wiring');
  patchPackageJson(root);
  writeEnvFiles(root);
  writePnpmWorkspace(root);
  writeDrizzleConfig(root);
  writeMiddleware(root);
  writeAppFiles(root, displayName);
  writeDbFiles(root);
  writeLibFiles(root);
  writeApiRoutes(root);
  writeVercelConfig(root);
  writeProductionGuide(root, displayName);
  writeReadme(root, displayName);
  appendGitignore(root, ['.env', '.env.*', '!.env.example', '*.tsbuildinfo', '.next', 'drizzle']);
  anhedralPrint.done('Next.js template files written');

  if (skipInstall) {
    anhedralPrint.info('shadcn init installs its base project dependencies; additional dependency manifests were written.');
    anhedralPrint.info('Run after init: pnpm install');
  }
}

function patchPackageJson(root: string): void {
  const filePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackageJson;

  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
    dev: 'next dev',
    build: 'next build',
    start: 'next start',
    typecheck: 'tsc --noEmit',
    'db:generate': 'drizzle-kit generate',
    'db:migrate': 'tsx --env-file=.env.local db/migrate.ts',
    'db:studio': 'drizzle-kit studio',
    'db:check': 'drizzle-kit check',
  };
  packageJson.dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...NEXT_TEMPLATE_DEPENDENCIES.dependencies,
  };
  packageJson.devDependencies = {
    ...(packageJson.devDependencies ?? {}),
    ...NEXT_TEMPLATE_DEPENDENCIES.devDependencies,
  };
  packageJson.pnpm = {
    ...(packageJson.pnpm ?? {}),
    onlyBuiltDependencies: Array.from(new Set([
      ...(packageJson.pnpm?.onlyBuiltDependencies ?? []),
      '@clerk/shared',
      'esbuild',
      'msw',
      'sharp',
      'unrs-resolver',
    ])).sort(),
  };

  writeFile(filePath, JSON.stringify(packageJson, null, 2) + '\n');
}

function writePnpmWorkspace(root: string): void {
  writeFile(path.join(root, 'pnpm-workspace.yaml'), `packages:
  - .

onlyBuiltDependencies:
  - '@clerk/shared'
  - esbuild
  - msw
  - sharp
  - unrs-resolver
allowBuilds:
  '@clerk/shared': true
  esbuild: true
  msw: true
  sharp: true
  unrs-resolver: true
`);
}

function writeEnvFiles(root: string): void {
  const env = `# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***
CLERK_SECRET_KEY=sk_test_***
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Stripe
STRIPE_SECRET_KEY=sk_test_***
STRIPE_WEBHOOK_SECRET=whsec_***
NEXT_PUBLIC_STRIPE_PRICE_ID=price_***
STRIPE_PORTAL_RETURN_URL=http://localhost:3000/account

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
`;

  writeFile(path.join(root, '.env.example'), env);
  writeFile(path.join(root, '.env.local'), env.replaceAll('pk_test_***', '').replaceAll('sk_test_***', '').replaceAll('whsec_***', '').replaceAll('price_***', ''));
}

function writeDrizzleConfig(root: string): void {
  writeFile(path.join(root, 'drizzle.config.ts'), `import type { Config } from 'drizzle-kit';

export default {
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
`);
}

function writeMiddleware(root: string): void {
  writeFile(path.join(root, 'proxy.ts'), `import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher(['/account(.*)', '/api/checkout(.*)', '/api/billing-portal(.*)', '/api/storage(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
`);
}

function writeAppFiles(root: string, displayName: string): void {
  writeFile(path.join(root, 'components/ui/card.tsx'), `import * as React from 'react';
import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 data-slot="card-title" className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-6 pt-0', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardContent };
`);

  writeFile(path.join(root, 'app/layout.tsx'), `import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '${displayName}',
  description: '${displayName} generated by Anhedral',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" className={\`\${geistSans.variable} \${geistMono.variable}\`}>
        <body className="min-h-screen bg-background text-foreground antialiased">
          <header className="border-b">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
              <Link href="/" className="font-semibold">${displayName}</Link>
              <nav className="flex items-center gap-3 text-sm">
                <Link href="/pricing">Pricing</Link>
                <Link href="/account">Account</Link>
                <Link href="/sign-in">Sign in</Link>
              </nav>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
`);

  writeFile(path.join(root, 'app/page.tsx'), `import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-5xl gap-6 px-4 py-12 md:grid-cols-[1.2fr_0.8fr] md:items-center">
      <section className="space-y-6">
        <div className="space-y-3">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-normal md:text-5xl">Next.js application foundation</h1>
          <p className="max-w-2xl text-muted-foreground">
            A single Next.js app with Clerk auth, Stripe subscriptions, Neon/Drizzle data, R2 signed uploads, and Vercel-ready deployment.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/account" className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80">Open account</Link>
          <Link href="/pricing" className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">View pricing</Link>
        </div>
      </section>
      <Card>
        <CardHeader><CardTitle>Generated surface</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Use API routes for checkout, billing portal, Stripe webhooks, subscription status, and signed R2 uploads.</p>
          <p>Use Server Components for product UI and Server Route Handlers for external integrations.</p>
        </CardContent>
      </Card>
    </main>
  );
}
`);

  writeFile(path.join(root, 'app/pricing/page.tsx'), `import { auth } from '@clerk/nextjs/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function PricingPage() {
  const { userId } = await auth();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Pro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Stripe Checkout creates the subscription and the webhook records entitlement state.</p>
          <form action="/api/checkout" method="post">
            <input type="hidden" name="priceId" value={process.env.NEXT_PUBLIC_STRIPE_PRICE_ID ?? ''} />
            <Button type="submit">{userId ? 'Subscribe' : 'Sign in to subscribe'}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
`);

  writeFile(path.join(root, 'app/account/page.tsx'), `import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSubscriptionForUser } from '@/db/queries';

export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const [user, subscription] = await Promise.all([
    currentUser(),
    getSubscriptionForUser(userId),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{user?.primaryEmailAddress?.emailAddress ?? userId}</p>
          <p className="text-muted-foreground">Subscription: {subscription?.status ?? 'inactive'}</p>
        </CardContent>
      </Card>
      <form action="/api/billing-portal" method="post">
        <Button type="submit" variant="outline">Manage billing</Button>
      </form>
    </main>
  );
}
`);

  writeFile(path.join(root, 'app/sign-in/[[...sign-in]]/page.tsx'), `import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4"><SignIn /></main>;
}
`);

  writeFile(path.join(root, 'app/sign-up/[[...sign-up]]/page.tsx'), `import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4"><SignUp /></main>;
}
`);
}

function writeDbFiles(root: string): void {
  writeFile(path.join(root, 'db/index.ts'), `import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

function createDb() {
  return drizzle(neon(process.env.DATABASE_URL!), { schema });
}

type Database = ReturnType<typeof createDb>;

let cachedDb: Database | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  cachedDb ??= createDb();
  return cachedDb;
}
`);

  writeFile(path.join(root, 'db/schema.ts'), `import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()).notNull(),
}, (table) => [
  index('users_clerk_user_id_idx').on(table.clerkUserId),
]);

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  stripePriceId: text('stripe_price_id'),
  status: text('status').notNull(),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()).notNull(),
}, (table) => [
  index('subscriptions_user_idx').on(table.userId),
  index('subscriptions_status_idx').on(table.status),
]);

export const uploads = pgTable('uploads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull().unique(),
  contentType: text('content_type'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
});
`);

  writeFile(path.join(root, 'db/queries.ts'), `import { eq } from 'drizzle-orm';
import { getDb } from './index';
import { subscriptions, uploads, users } from './schema';

export async function upsertUser(input: { clerkUserId: string; email: string; stripeCustomerId?: string | null }) {
  const db = getDb();
  const id = input.clerkUserId;

  await db.insert(users).values({
    id,
    clerkUserId: input.clerkUserId,
    email: input.email,
    stripeCustomerId: input.stripeCustomerId ?? null,
  }).onConflictDoUpdate({
    target: users.clerkUserId,
    set: {
      email: input.email,
      ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
      updatedAt: new Date(),
    },
  });

  return db.query.users.findFirst({ where: eq(users.clerkUserId, input.clerkUserId) });
}

export async function getSubscriptionForUser(clerkUserId: string) {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.clerkUserId, clerkUserId) });
  if (!user) return null;
  return db.query.subscriptions.findFirst({ where: eq(subscriptions.userId, user.id) });
}

export async function recordUpload(input: { userId: string; objectKey: string; contentType: string | null }) {
  await getDb().insert(uploads).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    objectKey: input.objectKey,
    contentType: input.contentType,
  });
}
`);

  writeFile(path.join(root, 'db/migrate.ts'), `import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

console.log('Running migrations...');
const db = drizzle(neon(process.env.DATABASE_URL));
await migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrations complete.');
`);
}

function writeLibFiles(root: string): void {
  writeFile(path.join(root, 'lib/stripe.ts'), `import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not defined');
  }

  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}
`);

  writeFile(path.join(root, 'lib/r2.ts'), `import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let r2Client: S3Client | null = null;

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials are not configured');
  }

  r2Client ??= new S3Client({
    region: 'auto',
    endpoint: \`https://\${accountId}.r2.cloudflarestorage.com\`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return r2Client;
}

export async function createUploadUrl(input: { userId: string; fileName: string; contentType: string }) {
  if (!process.env.R2_BUCKET) {
    throw new Error('R2_BUCKET is not defined');
  }

  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'upload';
  const objectKey = \`\${input.userId}/\${crypto.randomUUID()}-\${safeName}\`;
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: objectKey,
    ContentType: input.contentType,
  });

  return {
    objectKey,
    uploadUrl: await getSignedUrl(getR2Client(), command, { expiresIn: 300 }),
    expiresIn: 300,
    headers: { 'Content-Type': input.contentType },
  };
}
`);
}

function writeApiRoutes(root: string): void {
  writeFile(path.join(root, 'app/api/health/route.ts'), `import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ ok: true });
}
`);

  writeFile(path.join(root, 'app/api/checkout/route.ts'), `import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getStripe } from '@/lib/stripe';
import { upsertUser } from '@/db/queries';

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) throw new Error('Signed-in user must have an email address');

  const form = await request.formData();
  const priceId = String(form.get('priceId') || process.env.NEXT_PUBLIC_STRIPE_PRICE_ID || '');
  if (!priceId) throw new Error('Missing Stripe price id');

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const customer = await stripe.customers.create({
    email,
    metadata: { clerkUserId: userId },
  });
  await upsertUser({ clerkUserId: userId, email, stripeCustomerId: customer.id });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: \`\${appUrl}/account?checkout=success\`,
    cancel_url: \`\${appUrl}/pricing?checkout=cancelled\`,
    metadata: { clerkUserId: userId },
  });

  if (!session.url) throw new Error('Stripe did not return a Checkout URL');
  redirect(session.url);
}
`);

  writeFile(path.join(root, 'app/api/billing-portal/route.ts'), `import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { getStripe } from '@/lib/stripe';

export async function POST() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await getDb().query.users.findFirst({ where: eq(users.clerkUserId, userId) });
  if (!user?.stripeCustomerId) redirect('/pricing');

  const session = await getStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: process.env.STRIPE_PORTAL_RETURN_URL ?? \`\${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/account\`,
  });

  redirect(session.url);
}
`);

  writeFile(path.join(root, 'app/api/storage/upload-url/route.ts'), `import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createUploadUrl } from '@/lib/r2';
import { recordUpload } from '@/db/queries';

const CreateUploadRequest = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const input = CreateUploadRequest.parse(await request.json());
  const signed = await createUploadUrl({ userId, ...input });
  await recordUpload({ userId, objectKey: signed.objectKey, contentType: input.contentType });
  return NextResponse.json(signed);
}
`);

  writeFile(path.join(root, 'app/api/webhooks/stripe/route.ts'), `import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { getDb } from '@/db';
import { subscriptions, users } from '@/db/schema';
import { getStripe } from '@/lib/stripe';

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET is not configured' }, { status: 500 });
  }

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription;
    const periodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const user = await getDb().query.users.findFirst({ where: eq(users.stripeCustomerId, customerId) });

    if (user) {
      await getDb().insert(subscriptions).values({
        id: subscription.id,
        userId: user.id,
        stripeSubscriptionId: subscription.id,
        stripePriceId: subscription.items.data[0]?.price.id ?? null,
        status: subscription.status,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      }).onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: {
          status: subscription.status,
          stripePriceId: subscription.items.data[0]?.price.id ?? null,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          updatedAt: new Date(),
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}
`);
}

function writeVercelConfig(root: string): void {
  writeFile(path.join(root, 'vercel.json'), JSON.stringify({
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: 'nextjs',
    buildCommand: 'pnpm build',
    devCommand: 'pnpm dev',
  }, null, 2) + '\n');
}

function writeReadme(root: string, displayName: string): void {
  writeFile(path.join(root, 'README.md'), `# ${displayName}

Generated by anhedral's Next.js template.

## First Run

\`\`\`bash
pnpm install
cp .env.example .env.local
pnpm db:generate
pnpm db:migrate
pnpm typecheck
pnpm dev
\`\`\`

## Stack

- Next.js App Router
- shadcn/ui
- Clerk auth
- Stripe subscriptions
- Neon + Drizzle
- Cloudflare R2 signed uploads
- Vercel deployment
`);
}

function writeProductionGuide(root: string, displayName: string): void {
  writeFile(path.join(root, 'PRODUCTION.md'), `# ${displayName} Production Guide

## Provider Setup

1. Create a Neon database and set \`DATABASE_URL\`.
2. Create a Clerk app and set \`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY\` plus \`CLERK_SECRET_KEY\`.
3. Create a Stripe product and recurring price, then set \`STRIPE_SECRET_KEY\`, \`STRIPE_WEBHOOK_SECRET\`, and \`NEXT_PUBLIC_STRIPE_PRICE_ID\`.
4. Create a Cloudflare R2 bucket and set \`R2_ACCOUNT_ID\`, \`R2_ACCESS_KEY_ID\`, \`R2_SECRET_ACCESS_KEY\`, and \`R2_BUCKET\`.
5. Deploy to Vercel as a standard Next.js project.

## Commands

\`\`\`bash
pnpm db:generate
pnpm db:migrate
pnpm typecheck
pnpm build
\`\`\`

## Docs

- https://ui.shadcn.com/docs/cli
- https://nextjs.org/docs/app
- https://clerk.com/docs/references/nextjs/overview
- https://docs.stripe.com/checkout/quickstart
- https://docs.stripe.com/webhooks
- https://orm.drizzle.team/docs/tutorials/drizzle-nextjs-neon
- https://developers.cloudflare.com/r2/api/s3/
- https://vercel.com/docs/frameworks/nextjs
`);
}

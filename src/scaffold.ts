import { readdirSync } from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import { anhedralPrint } from './print.js';
import { appendGitignore, writeFile } from './util.js';
import { getSkillCommands } from './commands.js';
import {
  API_CLIENT_DEPENDENCIES,
  PACKAGE_MANAGER,
  ROOT_DEPENDENCIES,
  SHARED_DB_DEPENDENCIES,
  SHARED_PACKAGE_DEPENDENCIES,
  dependencyManifest,
} from './dependencies.js';
import { resolveToolchain, type ToolchainChannel, type ToolchainSpec } from './toolchain.js';
import { scaffoldBackend } from './templates/backend.js';
import { scaffoldExtension } from './templates/extension.js';
import { scaffoldFrontend } from './templates/frontend.js';

export type FrontendMode = 'expo';
export type AuthMode = 'clerk';
export type PaymentsMode = 'revenuecat_stripe';

const SHARED_ENV_GITIGNORE_LINES = ['.env', '.env.*', '!.env.example'] as const;
const SHARED_TYPESCRIPT_GITIGNORE_LINES = ['*.tsbuildinfo'] as const;
const ASCII_LOGO = [
  '  .:-:.',
  '  .----:.',
  '  .-------:.',
  '  :---------:..',
  '  :--------..--:.',
  '  :-------.  :----::.',
  '  :------:   :-------:.',
  '  :------:  .---------::',
  '  :-------.  :::::::::.',
  '  :-------.',
  '  :-----:.',
  '  :----:.',
  '  :-:.',
] as const;
const ASCII_LOGO_LINE_DELAY_MS = 30;

async function printAsciiLogo(): Promise<void> {
  console.log('');

  for (let index = 0; index < ASCII_LOGO.length; index += 1) {
    console.log(ASCII_LOGO[index]);

    if (index < ASCII_LOGO.length - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, ASCII_LOGO_LINE_DELAY_MS);
      });
    }
  }

  console.log('');
}

export interface InitOptions {
  projectName: string;
  displayName: string;
  auth: AuthMode;
  payments: PaymentsMode;
  db: 'neon';
  orm: 'drizzle';
  storage: 'r2';
  api: 'fastify';
  skipInstall: boolean;
  toolchainChannel: ToolchainChannel;
}

export interface ProjectOptions {
  projectName: string;
  displayName: string;
  githubOrg: string | null;
  frontendUrl?: string;
  skipInstall?: boolean;
}

type NormalizedStack = {
  schema_version: '2.0.0';
  mode: 'fullstack';
  project_name: string;
  display_name: string;
  frontend: 'expo_react_native_reusables';
  extension: 'wxt_chrome_extension';
  backend: 'fastify';
  auth: AuthMode;
  payments: PaymentsMode;
  storage: 'cloudflare_r2_via_aws_s3_sdk';
  database: 'neon_plus_drizzle';
  skills: string[];
    outputs: {
      monorepo: boolean;
      package_manager: 'pnpm';
      dependency_manifest: ReturnType<typeof dependencyManifest>;
      toolchain_channel: ToolchainChannel;
      toolchain: Partial<ToolchainSpec>;
      generated_paths: string[];
  };
};

function getUsedToolchain(options: InitOptions, toolchain: ToolchainSpec): Partial<ToolchainSpec> {
  return {
    verifiedAt: toolchain.verifiedAt,
    shadcn: toolchain.shadcn,
    reactNativeReusables: toolchain.reactNativeReusables,
    wxt: toolchain.wxt,
  };
}

function normalizeStack(options: InitOptions, generatedPaths: string[]): NormalizedStack {
  const toolchain = resolveToolchain(options.toolchainChannel);

  return {
    schema_version: '2.0.0',
    mode: 'fullstack',
    project_name: options.projectName,
    display_name: options.displayName,
    frontend: 'expo_react_native_reusables',
    extension: 'wxt_chrome_extension',
    backend: 'fastify',
    auth: options.auth,
    payments: options.payments,
    storage: 'cloudflare_r2_via_aws_s3_sdk',
    database: 'neon_plus_drizzle',
    skills: getSkillCommands(),
    outputs: {
      monorepo: true,
      package_manager: 'pnpm',
      dependency_manifest: dependencyManifest(),
      toolchain_channel: options.toolchainChannel,
      toolchain: getUsedToolchain(options, toolchain),
      generated_paths: generatedPaths,
    },
  };
}

function writeJsonFile(filePath: string, payload: Record<string, unknown>): void {
  writeFile(filePath, JSON.stringify(payload, null, 2) + '\n');
}

function ensureScaffoldRoot(root: string): void {
  const allowedEntries = new Set(['.git', '.gitignore', '.DS_Store']);
  const unexpected = readdirSync(root).filter((entry) => !allowedEntries.has(entry));
  if (unexpected.length > 0) {
    throw new Error(`Current directory is not empty. Remove existing files before running anhedral init. Found: ${unexpected.join(', ')}`);
  }
}

function writeRootPackageJson(
  root: string,
  projectName: string,
  scripts: Record<string, string>,
  workspaces?: string[],
  extraFields?: Record<string, unknown>,
): void {
  const packageJson: Record<string, unknown> = {
    name: projectName,
    private: true,
    version: '0.1.0',
    packageManager: PACKAGE_MANAGER,
    scripts,
    ...extraFields,
  };

  if (workspaces && workspaces.length > 0) {
    packageJson.workspaces = workspaces;
  }

  writeJsonFile(path.join(root, 'package.json'), packageJson);
}

function writePnpmWorkspace(root: string, packages: string[]): void {
  const serializedPackages = packages.map((entry) => `  - '${entry}'`).join('\n');
  writeFile(path.join(root, 'pnpm-workspace.yaml'), `packages:\n${serializedPackages}\n`);
}

function writeSkillsGuide(root: string, commands: string[]): void {
  const commandBlock = commands.map((command) => `${command}\n`).join('\n');
  writeFile(path.join(root, 'install-skills.sh'), `#!/usr/bin/env bash
# Manual skill installation guide for this project.
#
# Run the commands below after setup. The skills CLI will prompt you to:
# - choose which agents to install to
# - choose whether the install should be project-scoped or global
#
# If you want the skill files tracked with this project, choose the project scope.
# Run each command one at a time if you want to review each prompt separately.

${commandBlock}`);
}

function writeRootDocs(root: string, options: InitOptions, stack: NormalizedStack): void {
  const toolchainLine = stack.outputs.toolchain.verifiedAt
    ? `${options.toolchainChannel} (verified ${stack.outputs.toolchain.verifiedAt})`
    : `${options.toolchainChannel} (floating latest)`;
  const generatedPaths = stack.outputs.generated_paths.map((entry) => `- \`${entry}\``).join('\n') || '- `.`';

  writeFile(path.join(root, 'README.md'), `# ${options.displayName}

Generated by anhedral.

## Stack

- Mode: fullstack
- Frontend: Expo + React Native Reusables
- Backend: Fastify
- Extension: WXT Chrome extension
- Shared packages: \`packages/*\`
- Auth: ${options.auth}
- Payments: ${options.payments}
- Database: ${options.db} + ${options.orm}
- Storage: ${options.storage}
- API: ${options.api ?? 'framework-native'}
- Toolchain: ${toolchainLine}
- Dependency manifest: recorded in \`stack.json\`

## Generated paths

${generatedPaths}

## First Run

\`\`\`bash
pnpm install
cp .env.example .env
# Frontend/.env is generated for local Expo development
cp Extension/.env.example Extension/.env
pnpm db:generate
pnpm db:migrate
pnpm verify
pnpm dev:backend
pnpm dev:frontend
pnpm dev:extension
\`\`\`

For a provider-free smoke test, keep \`ANHEDRAL_DEMO=true\` in \`Backend/.env\`. Demo mode returns a signed-in sample user and active subscription responses without Clerk, RevenueCat, or Stripe credentials. It is for local development only.

## Provider Setup

- Neon: create a Postgres database and set \`DATABASE_URL\` in the root and API env files.
- Clerk: create an application, configure allowed origins, and set \`CLERK_PUBLISHABLE_KEY\`, \`CLERK_SECRET_KEY\`, plus the Expo and extension publishable keys.
- RevenueCat + Stripe: create an entitlement named \`pro\`, configure Stripe as a RevenueCat web billing source, configure app keys, then set \`RC_SECRET_API_KEY\`, \`RC_WEBHOOK_SECRET\`, and the \`EXPO_PUBLIC_RC_*\` values.
- Cloudflare R2: create a bucket and API token, then set \`R2_ACCOUNT_ID\`, \`R2_ACCESS_KEY_ID\`, \`R2_SECRET_ACCESS_KEY\`, and \`R2_BUCKET\`.
- Vercel: import this same Git repository twice. Use \`Frontend\` as the root directory for the Expo web project, and \`Backend\` as the root directory for the Fastify API project. Enable access to source files outside each root directory so workspace packages under \`packages/*\` are available during builds. The Backend project uses Vercel Fastify entrypoint detection from \`Backend/src/index.ts\`.
- EAS: use \`Frontend\` as the Expo project root for iOS and Android builds. Vercel deploys the web export from the same source.

## Setup Notes

1. Copy \`.env.example\` into the runtime env files your apps need and fill in provider values.
2. Review \`install-skills.sh\` and run the listed skill commands manually so you can choose scope and agent targets.
3. Add the real provider configuration for Clerk, RevenueCat, Stripe web billing, Neon, and R2 where the scaffolded helper files indicate.
4. Use \`stack.json\` when debugging generated projects; it records the verified dependency manifest used by this init run.
5. Review \`PRODUCTION.md\` before connecting live provider projects.
6. Run database generation and migrations from the shared DB package:

\`\`\`bash
pnpm db:generate
pnpm db:migrate
\`\`\`

Run deployment readiness checks before pushing:

\`\`\`bash
pnpm verify
pnpm verify:frontend
pnpm verify:backend
pnpm verify:extension
\`\`\`

7. Build or run the extension separately. It is not deployed by Vercel:

\`\`\`bash
pnpm dev:extension
pnpm extension:zip
\`\`\`
`);
}

function writeProductionGuide(root: string, options: InitOptions): void {
  writeFile(path.join(root, 'PRODUCTION.md'), `# ${options.displayName} Production Guide

## Project Structure

The generated app is one pnpm monorepo:

\`\`\`txt
.
├─ Frontend/        Expo + React Native Reusables app
├─ Backend/         Fastify API
├─ Extension/       WXT Chrome extension
├─ packages/
│  ├─ api-client/   shared typed API client
│  ├─ config/       shared config constants/helpers
│  ├─ db/           Drizzle schema, Neon client, migrations
│  └─ types/        shared TypeScript types
├─ PRODUCTION.md    development and deployment guide
├─ turbo.json       workspace build graph
└─ package.json     root scripts
\`\`\`

## Frontend

\`Frontend\` is the single Expo source for:

- Web on Vercel
- iOS through EAS
- Android through EAS

Important files:

- \`Frontend/package.json\`: Expo scripts
- \`Frontend/vercel.json\`: Vercel web export config
- \`Frontend/eas.json\`: native build profiles
- \`Frontend/app\`: Expo Router screens

Build output goes to \`Frontend/dist\`.

## Backend

\`Backend\` is the Fastify API.

Important files:

- \`Backend/src/index.ts\`: Vercel Fastify entrypoint
- \`Backend/src/app.ts\`: Fastify app construction
- \`Backend/vercel.json\`: minimal Vercel config
- \`Backend/src/routes\`: health/auth/subscription routes

## Extension

\`Extension\` is the WXT Chrome extension using the Side Panel API.

Important files:

- \`Extension/wxt.config.ts\`: manifest, side panel, permissions
- \`Extension/src/entrypoints/sidepanel\`: side panel UI
- \`Extension/src/entrypoints/background.ts\`: side panel behavior

ZIP output goes to \`Extension/.output\`.

## Develop

From the repository root:

\`\`\`sh
pnpm install
pnpm dev
\`\`\`

Or run one surface at a time:

\`\`\`sh
pnpm dev:frontend
pnpm dev:backend
pnpm dev:extension
\`\`\`

Use these before deploy:

\`\`\`sh
pnpm verify
pnpm verify:frontend
pnpm verify:backend
pnpm verify:extension
\`\`\`

Database workflow:

\`\`\`sh
pnpm db:generate
pnpm db:migrate
\`\`\`

Local demo mode is enabled through generated \`.env\` files. Real provider behavior needs Clerk, RevenueCat/Stripe, Neon, and R2 credentials.

## Environment Variables

- Root/local: \`DATABASE_URL\` for shared Drizzle commands.
- Frontend/Vercel Frontend: only \`EXPO_PUBLIC_*\` values.
- Backend/Vercel Backend: server secrets such as \`DATABASE_URL\`, \`CLERK_SECRET_KEY\`, \`RC_SECRET_API_KEY\`, \`RC_WEBHOOK_SECRET\`, and R2 credentials.
- Extension: \`VITE_API_URL\`, \`VITE_CLERK_PUBLISHABLE_KEY\`, and optionally \`VITE_CRX_PUBLIC_KEY\`.
- EAS: add native app public keys with \`eas secret:create\` or the EAS dashboard.

## Deploy

Vercel deployment is two Vercel projects from the same Git repo:

1. Frontend Vercel project
   - Root Directory: \`Frontend\`
   - Build command: \`pnpm build:web\`
   - Output directory: \`dist\`

2. Backend Vercel project
   - Root Directory: \`Backend\`
   - Build command: \`pnpm build\`
   - Fastify entrypoint: \`src/index.ts\`

Enable Vercel access to source files outside each project root so \`packages/*\` workspace packages resolve.

Native app deployment:

\`\`\`sh
cd Frontend
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init
pnpm dlx eas-cli@latest build --platform all --profile production
pnpm dlx eas-cli@latest submit --platform all --latest --profile production
\`\`\`

Chrome extension deployment:

\`\`\`sh
pnpm extension:zip
\`\`\`

Upload \`Extension/.output/*-chrome.zip\` to the Chrome Web Store Developer Dashboard.

## Provider Checklist

- Clerk: configure allowed origins for the Expo web Vercel domain, native redirect/deep-link settings for the Expo scheme in \`Frontend/app.json\`, and the Chrome extension origin after publishing or after assigning a stable extension key.
- RevenueCat + Stripe: create a \`pro\` entitlement, configure iOS/Android/Web app API keys separately, connect Stripe as the web billing source, set the RevenueCat webhook URL to \`https://<backend-domain>/webhooks/revenuecat\`, and keep \`RC_WEBHOOK_SECRET\` only in Backend.
- Neon + Drizzle: create the Neon database, set \`DATABASE_URL\` locally and in the Backend Vercel project, then run \`pnpm db:generate\` and \`pnpm db:migrate\` before production traffic.
- Cloudflare R2: create an R2 bucket and least-privilege API token, then set \`R2_ACCOUNT_ID\`, \`R2_ACCESS_KEY_ID\`, \`R2_SECRET_ACCESS_KEY\`, and \`R2_BUCKET\` in Backend only.

## Relevant Docs

- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Expo web publishing](https://docs.expo.dev/guides/publishing-websites/)
- [Expo EAS](https://docs.expo.dev/eas/)
- [WXT publishing](https://wxt.dev/guide/essentials/publishing.html)
- [Chrome Web Store publishing](https://developer.chrome.com/docs/webstore/publish)
`);
}

function writeStackFile(root: string, stack: NormalizedStack): void {
  writeFile(path.join(root, 'stack.json'), JSON.stringify(stack, null, 2) + '\n');
}

function writeSharedPackages(root: string): void {
  const dbRoot = path.join(root, 'packages/db');
  writeFile(path.join(dbRoot, 'package.json'), JSON.stringify({
    name: '@anhedral/db',
    version: '0.1.0',
    private: true,
    type: 'module',
    exports: {
      '.': './src/index.ts',
      './schema': './src/schema.ts',
      './queries': './src/queries/index.ts',
      './migrate': './src/migrate.ts',
    },
    scripts: {
      build: 'pnpm typecheck',
      typecheck: 'tsc --noEmit',
      'db:generate': 'drizzle-kit generate',
      'db:migrate': 'tsx --env-file=../../.env src/migrate.ts',
    },
    dependencies: SHARED_DB_DEPENDENCIES.dependencies,
    devDependencies: SHARED_DB_DEPENDENCIES.devDependencies,
  }, null, 2) + '\n');

  writeFile(path.join(dbRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: ['node'],
    },
    include: ['src/**/*', 'drizzle.config.ts'],
  }, null, 2) + '\n');

  writeFile(path.join(dbRoot, 'drizzle.config.ts'), `import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
`);

  writeFile(path.join(dbRoot, 'src/index.ts'), `import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;

let cachedDb: Database | undefined;

function getDb() {
  cachedDb ??= createDb();
  return cachedDb;
}

export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export * from './schema';
`);

  writeFile(path.join(dbRoot, 'src/schema.ts'), `import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export const SUBSCRIPTION_TIERS = ['free', 'pro'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'expired', 'canceled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_METHODS = ['trialing', 'redeemed', 'paid'] as const;
export type SubscriptionMethod = (typeof SUBSCRIPTION_METHODS)[number];

export const SUBSCRIPTION_ORIGINS = ['web', 'apple', 'google'] as const;
export type SubscriptionOrigin = (typeof SUBSCRIPTION_ORIGINS)[number];

export const SUBSCRIPTION_EVENT_TYPES = [
  'trial_started', 'trial_converted', 'trial_expired',
  'initial_purchase', 'renewal', 'product_change',
  'cancellation_scheduled', 'cancellation_unscheduled', 'subscription_expired', 'subscription_canceled',
  'promo_redeemed', 'billing_issue', 'billing_recovered',
] as const;
export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];

export type SubscriptionMetadata = {
  revenueCatProductId?: string;
  lastWebhookUpdate?: string;
  cancelReason?: string;
  redeemCode?: string;
  redeemCodeRedeemedAt?: string;
};

export type SubscriptionEventMetadata = {
  revenueCatEventType?: string;
  revenueCatProductId?: string;
  promoCode?: string;
  billingPeriod?: string;
  price?: { amount: number; currency: string };
  store?: string;
  transactionId?: string;
  reason?: string;
};

export const PROMO_CODE_DURATIONS = [1, 6, 12] as const;
export type PromoCodeDuration = (typeof PROMO_CODE_DURATIONS)[number];

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  clerkUserId: text('clerk_user_id').unique(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  lastLoginAt: timestamp('last_login_at'),
  profileImageUrl: text('profile_image_url'),
  subscriptionTier: text('subscription_tier').notNull().default('free'),
  subscriptionStatus: text('subscription_status').notNull().default('active'),
  avatarObjectKey: text('avatar_object_key'),
  avatarMimeType: text('avatar_mime_type'),
  creditsBalance: integer('credits_balance').notNull().default(250),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index('users_clerk_user_id_idx').on(t.clerkUserId),
  index('users_email_idx').on(t.email),
]);

export const uploads = pgTable('uploads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull().unique(),
  bucket: text('bucket').notNull(),
  contentType: text('content_type'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  tier: text('tier').$type<SubscriptionTier>().notNull().default('free'),
  status: text('status').$type<SubscriptionStatus>().notNull().default('active'),
  method: text('method').$type<SubscriptionMethod>(),
  origin: text('origin').$type<SubscriptionOrigin>(),
  billingPeriod: text('billing_period'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  canceledAt: timestamp('canceled_at'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  trialStart: timestamp('trial_start'),
  trialEnd: timestamp('trial_end'),
  dailyLimit: integer('daily_limit'),
  metadata: jsonb('metadata').$type<SubscriptionMetadata>(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index('subscriptions_user_idx').on(t.userId),
  index('subscriptions_status_idx').on(t.status),
  index('subscriptions_tier_idx').on(t.tier),
  index('subscriptions_period_end_idx').on(t.currentPeriodEnd),
]);

export const subscriptionEvents = pgTable('subscription_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subscriptionId: text('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  eventType: text('event_type').$type<SubscriptionEventType>().notNull(),
  previousTier: text('previous_tier').$type<SubscriptionTier>(),
  previousStatus: text('previous_status').$type<SubscriptionStatus>(),
  previousMethod: text('previous_method').$type<SubscriptionMethod>(),
  newTier: text('new_tier').$type<SubscriptionTier>(),
  newStatus: text('new_status').$type<SubscriptionStatus>(),
  newMethod: text('new_method').$type<SubscriptionMethod>(),
  revenueCatEventType: text('revenuecat_event_type'),
  revenueCatProductId: text('revenuecat_product_id'),
  origin: text('origin').$type<SubscriptionOrigin>(),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  metadata: jsonb('metadata').$type<SubscriptionEventMetadata>(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index('sub_events_user_idx').on(t.userId),
  index('sub_events_user_created_idx').on(t.userId, t.createdAt),
  index('sub_events_type_idx').on(t.eventType),
]);

export const trialClaims = pgTable('trial_claims', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  email: text('email').notNull().unique(),
  claimedAt: timestamp('claimed_at').$defaultFn(() => new Date()).notNull(),
}, (t) => [index('trial_claims_email_idx').on(t.email)]);

export const promoCodes = pgTable('promo_codes', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  months: integer('months').$type<PromoCodeDuration>().notNull(),
  maxRedemptions: integer('max_redemptions').notNull().default(1),
  redeemedCount: integer('redeemed_count').notNull().default(0),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
}, (t) => [index('promo_codes_code_idx').on(t.code)]);

export const promoRedemptions = pgTable('promo_redemptions', {
  id: text('id').primaryKey(),
  promoCodeId: text('promo_code_id').notNull().references(() => promoCodes.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redeemedAt: timestamp('redeemed_at').$defaultFn(() => new Date()).notNull(),
  entitlementExpiresAt: timestamp('entitlement_expires_at').notNull(),
}, (t) => [
  index('promo_redemptions_user_idx').on(t.userId),
  index('promo_redemptions_code_idx').on(t.promoCodeId),
]);

export type Users = InferSelectModel<typeof users>;
export type NewUsers = InferInsertModel<typeof users>;
export type Uploads = InferSelectModel<typeof uploads>;
export type NewUploads = InferInsertModel<typeof uploads>;
export type Subscriptions = InferSelectModel<typeof subscriptions>;
export type NewSubscriptions = InferInsertModel<typeof subscriptions>;
export type SubscriptionEvents = InferSelectModel<typeof subscriptionEvents>;
export type NewSubscriptionEvents = InferInsertModel<typeof subscriptionEvents>;
export type TrialClaims = InferSelectModel<typeof trialClaims>;
export type NewTrialClaims = InferInsertModel<typeof trialClaims>;
export type PromoCodes = InferSelectModel<typeof promoCodes>;
export type NewPromoCodes = InferInsertModel<typeof promoCodes>;
export type PromoRedemptions = InferSelectModel<typeof promoRedemptions>;
export type NewPromoRedemptions = InferInsertModel<typeof promoRedemptions>;
`);

  writeFile(path.join(dbRoot, 'src/queries/users.ts'), `import { eq } from 'drizzle-orm';
import { db } from '../index';
import { uploads, users } from '../schema';

type SyncUserInput = {
  clerkUserId: string;
  email: string;
  displayName: string | null;
};

export async function findUserByClerkId(clerkUserId: string) {
  return db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });
}

export async function syncUserProfile(input: SyncUserInput) {
  await db
    .insert(users)
    .values({
      id: input.clerkUserId,
      clerkUserId: input.clerkUserId,
      email: input.email,
      displayName: input.displayName,
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email: input.email,
        displayName: input.displayName,
        updatedAt: new Date(),
      },
    });

  return findUserByClerkId(input.clerkUserId);
}

export async function updateAvatarForUser(
  clerkUserId: string,
  input: { objectKey: string; contentType: string | null },
) {
  await db
    .update(users)
    .set({
      avatarObjectKey: input.objectKey,
      avatarMimeType: input.contentType,
      updatedAt: new Date(),
    })
    .where(eq(users.clerkUserId, clerkUserId));
}

export async function createUploadRecord(
  clerkUserId: string,
  input: { objectKey: string; bucket: string; contentType: string | null },
) {
  await db.insert(uploads).values({
    id: crypto.randomUUID(),
    userId: clerkUserId,
    objectKey: input.objectKey,
    bucket: input.bucket,
    contentType: input.contentType,
  });
}
`);

  writeFile(path.join(dbRoot, 'src/queries/uploads.ts'), `import { eq } from 'drizzle-orm';
import { db } from '../index';
import { uploads } from '../schema';

export async function listUploadsForUser(userId: string) {
  return db.query.uploads.findMany({
    where: eq(uploads.userId, userId),
  });
}
`);

  writeFile(path.join(dbRoot, 'src/queries/index.ts'), `export * from './uploads';
export * from './users';
`);

  writeFile(path.join(dbRoot, 'src/migrate.ts'), `import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env', quiet: true });
dotenv.config({ quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

const client = neon(process.env.DATABASE_URL);
const database = drizzle(client);

console.log('Running migrations...');
const start = Date.now();
await migrate(database, { migrationsFolder: './migrations' });
console.log('Migrations completed in', Date.now() - start, 'ms');
`);

  writeFile(path.join(dbRoot, 'migrations/.gitkeep'), '');

  const simplePackages = [
    ['types', { exports: { '.': './src/index.ts' } }, `export type ApiEnvelope<T> = { data: T } | { error: string; message: string };
export type ClientPlatform = 'frontend' | 'extension';
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
export type AuthMeResponse = {
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    displayName: string;
    imageUrl?: string | null;
    avatarUrl?: string | null;
    creditsBalance: number;
    subscriptionTier: string;
    subscriptionStatus: string;
  };
};
export type PricingResponse = {
  tiers: Array<{
    tier: 'free' | 'pro';
    displayName: string;
    description: string;
    priceMonthly: number | null;
    priceYearly: number | null;
    currency: string;
    limits: {
      dailyLimit: number | null;
    };
    paymentInfo?: {
      revenueCatEntitlementId: string;
      revenueCatOfferingId: string;
    };
  }>;
};
`],
    ['config', { exports: { '.': './src/index.ts' } }, `export const DEFAULT_API_PATH_PREFIX = '/api';
export const DEFAULT_LOCAL_API_URL = 'http://localhost:8787';
export const DEFAULT_FRONTEND_URL = 'http://localhost:8081';
export const DEFAULT_EXTENSION_URL = 'chrome-extension://';

export function joinApiUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\\/$/, '');
  const suffix = path.startsWith('/') ? path : \`/\${path}\`;
  return \`\${base}\${suffix}\`;
}
`],
    ['api-client', {
      exports: { '.': './src/index.ts' },
      dependencies: API_CLIENT_DEPENDENCIES.dependencies,
    }, `import { joinApiUrl } from '@anhedral/config';
import type { AuthMeResponse, ClientPlatform, PricingResponse, SubscriptionEntitlements } from '@anhedral/types';

export class APIRequestError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errorCode?: string,
  ) {
    super(message);
    this.name = 'APIRequestError';
  }
}

export type ApiClientOptions = {
  baseUrl: string;
  platform: ClientPlatform;
  getToken?: () => Promise<string | null>;
};

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.options.getToken?.();
    const headers = new Headers(init.headers);
    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
    headers.set('X-Platform', this.options.platform);
    if (token) headers.set('Authorization', \`Bearer \${token}\`);

    const response = await fetch(joinApiUrl(this.options.baseUrl, path), {
      ...init,
      headers,
    });

    if (!response.ok) {
      let error: { error?: string; message?: string } = {};
      try { error = await response.json(); } catch {}
      throw new APIRequestError(
        response.status,
        error.message || \`API request failed: \${response.status}\`,
        error.error,
      );
    }

    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  getMe() {
    return this.request<AuthMeResponse>('/auth/me');
  }

  getPricing() {
    return this.request<PricingResponse>('/subscriptions/pricing');
  }

  getSubscriptionPricing() {
    return this.getPricing();
  }

  getSubscriptionEntitlements(options?: { refresh?: boolean }) {
    return this.request<SubscriptionEntitlements>(
      options?.refresh ? '/subscriptions/entitlements/me?refresh=true' : '/subscriptions/entitlements/me',
    );
  }

  redeemCode(code: string) {
    return this.request<{ ok: boolean; expiresAt: string }>('/subscriptions/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  signOut() {
    return this.request<{ success: boolean }>('/auth/signout', {
      method: 'POST',
    });
  }

  uploadAvatar(input: { base64: string; mimeType: string; fileName?: string }) {
    return this.request<{ ok: boolean; avatarUrl: string }>('/auth/avatar', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  deleteAccount() {
    return this.request<void>('/auth/account', {
      method: 'DELETE',
    });
  }
}
`],
  ] as const;

  for (const [name, packageFields, source] of simplePackages) {
    const packageRoot = path.join(root, `packages/${name}`);
    writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({
      name: `@anhedral/${name}`,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'pnpm typecheck',
        typecheck: 'tsc --noEmit',
      },
      devDependencies: SHARED_PACKAGE_DEPENDENCIES.devDependencies,
      ...packageFields,
    }, null, 2) + '\n');
    writeFile(path.join(packageRoot, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ['src/**/*'],
    }, null, 2) + '\n');
    writeFile(path.join(packageRoot, 'src/index.ts'), source);
  }
}

function writeRootEnvExample(root: string): void {
  const frontendUrl = 'http://localhost:8081';
  const expoEnv = `EXPO_PUBLIC_API_URL=http://localhost:8787
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***
EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro
EXPO_PUBLIC_RC_API_KEY_IOS=
EXPO_PUBLIC_RC_API_KEY_ANDROID=
EXPO_PUBLIC_RC_WEB_API_KEY=
`;
  const extensionEnv = `VITE_API_URL=http://localhost:8787
VITE_WEBSITE_URL=${frontendUrl}
VITE_CLERK_PUBLISHABLE_KEY=pk_test_***
VITE_CRX_PUBLIC_KEY=
VITE_RC_BILLING_URL=
`;
  const paymentsEnv = `# RevenueCat
RC_SECRET_API_KEY=
RC_WEBHOOK_SECRET=
RC_ENTITLEMENT_ID=pro
RC_OFFERING_ID=default
`;

  writeFile(path.join(root, '.env.example'), `# Apps
FRONTEND_URL=${frontendUrl}
ANHEDRAL_DEMO=false
${expoEnv}${extensionEnv}

# Server
PORT=8787
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require

# Clerk
CLERK_PUBLISHABLE_KEY=pk_test_***
CLERK_SECRET_KEY=sk_test_***

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

${paymentsEnv}`);
}

function writeRootVercelFiles(root: string): void {
  writeFile(path.join(root, '.vercelignore'), `Extension/.output
Extension/.wxt
Extension/dist
`);
}

function writeGeneratedCiWorkflow(root: string): void {
  writeFile(path.join(root, '.github/workflows/ci.yml'), `name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.15.1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Check Expo dependency alignment
        run: pnpm --filter ./Frontend exec expo install --check

      - name: Build Expo web
        run: pnpm --filter ./Frontend build:web

      - name: Test API
        run: pnpm --filter ./Backend test

      - name: Build API
        run: pnpm --filter ./Backend build

      - name: Build extension
        run: pnpm --filter ./Extension build

      - name: Zip extension
        run: pnpm --filter ./Extension zip

      - name: Build workspace
        run: pnpm build
`);
}

function writeFullstackRootFiles(root: string, options: InitOptions): void {
  const appFilters = [
    './Frontend',
    './Backend',
    './Extension',
  ];
  const parallelFilters = appFilters.map((entry) => `--filter=${entry}`).join(' ');

  const scripts: Record<string, string> = {
    dev: `turbo dev --parallel ${parallelFilters}`,
    'dev:backend': 'pnpm --filter ./Backend dev',
    build: 'turbo build',
    typecheck: 'turbo typecheck',
    verify: 'pnpm verify:frontend && pnpm verify:backend && pnpm verify:extension',
    'verify:frontend': 'pnpm --filter ./Frontend exec expo install --check && pnpm --filter ./Frontend build:web',
    'verify:backend': 'pnpm --filter ./Backend test && pnpm --filter ./Backend build',
    'verify:extension': 'pnpm --filter ./Extension typecheck && pnpm --filter ./Extension zip',
    'db:generate': 'pnpm --filter @anhedral/db db:generate',
    'db:migrate': 'pnpm --filter @anhedral/db db:migrate',
  };

  scripts['dev:frontend'] = 'pnpm --filter ./Frontend dev';
  scripts['dev:extension'] = 'pnpm --filter ./Extension dev';
  scripts['extension:zip'] = 'pnpm --filter ./Extension zip';

  writeRootPackageJson(root, options.projectName, scripts, ['Frontend', 'Backend', 'Extension', 'packages/*'], {
    devDependencies: ROOT_DEPENDENCIES.devDependencies,
  });
  writePnpmWorkspace(root, ['Frontend', 'Backend', 'Extension', 'packages/*']);
  writeFile(path.join(root, 'turbo.json'), JSON.stringify({
    $schema: 'https://turborepo.dev/schema.json',
    tasks: {
      build: {
        dependsOn: ['^build'],
        outputs: [],
      },
      typecheck: {
        dependsOn: ['^build'],
      },
      dev: {
        cache: false,
        persistent: true,
      },
    },
  }, null, 2) + '\n');
  appendGitignore(root, [
    'node_modules',
    '.turbo',
    'Frontend/node_modules',
    'Backend/node_modules',
    'Extension/node_modules',
    'packages/*/node_modules',
    ...SHARED_ENV_GITIGNORE_LINES,
    ...SHARED_TYPESCRIPT_GITIGNORE_LINES,
  ]);
  writeRootEnvExample(root);
  writeRootVercelFiles(root);
  writeGeneratedCiWorkflow(root);
}

async function scaffoldFullstack(root: string, options: InitOptions): Promise<string[]> {
  anhedralPrint.section('Workspace root');
  anhedralPrint.step('Writing root config (package.json, pnpm workspace, env, vercel)');
  writeFullstackRootFiles(root, options);
  anhedralPrint.done('Root config written');

  anhedralPrint.section('Shared packages');
  anhedralPrint.step('Writing @anhedral/db, types, config, api-client');
  writeSharedPackages(root);
  anhedralPrint.done('Shared packages written');

  const frontendUrl = 'http://localhost:8081';
  await scaffoldBackend(root, {
    projectName: options.projectName,
    displayName: options.displayName,
    githubOrg: null,
    frontendUrl,
    skipInstall: options.skipInstall,
  });

  await scaffoldFrontend(root, {
    projectName: options.projectName,
    displayName: options.displayName,
    githubOrg: null,
    frontendUrl,
    skipInstall: options.skipInstall,
  });

  await scaffoldExtension(root, {
    projectName: options.projectName,
    displayName: options.displayName,
    githubOrg: null,
    frontendUrl,
    skipInstall: options.skipInstall,
  });

  return [
    '.github/workflows/ci.yml',
    'PRODUCTION.md',
    'Frontend',
    'Backend',
    'Extension',
    'packages/db',
    'packages/types',
    'packages/config',
    'packages/api-client',
  ];
}

export async function scaffoldProject(options: InitOptions): Promise<void> {
  const root = path.resolve(process.cwd());
  ensureScaffoldRoot(root);

  const previousToolchain = env.ANHEDRAL_TOOLCHAIN;
  env.ANHEDRAL_TOOLCHAIN = options.toolchainChannel;

  try {
    await printAsciiLogo();
    anhedralPrint.banner(`Initializing ${options.displayName} in ${root}`);

    const generatedPaths = await scaffoldFullstack(root, options);

    anhedralPrint.section('Project metadata');
    anhedralPrint.step('Writing skills guide, README, and stack.json');
    const skillCommands = getSkillCommands();
    writeSkillsGuide(root, skillCommands);

    const stack = normalizeStack(options, generatedPaths);
    writeRootDocs(root, options, stack);
    writeProductionGuide(root, options);
    writeStackFile(root, stack);
    anhedralPrint.done('Project metadata written');

    console.log('');
    anhedralPrint.banner(`${options.displayName} is ready`);
    for (const generatedPath of generatedPaths) {
      anhedralPrint.done(generatedPath);
    }
    console.log('');
    anhedralPrint.info('Next commands:');
    console.log('  pnpm install');
    console.log('  cp .env.example .env');
    console.log('  cp Extension/.env.example Extension/.env');
    console.log('  pnpm db:generate && pnpm db:migrate');
    console.log('  pnpm verify');
    console.log('  pnpm dev:backend');
    console.log('  pnpm dev:frontend');
    console.log('  pnpm dev:extension');
    console.log('');
  } finally {
    if (previousToolchain == null) {
      delete env.ANHEDRAL_TOOLCHAIN;
    } else {
      env.ANHEDRAL_TOOLCHAIN = previousToolchain;
    }
  }
}

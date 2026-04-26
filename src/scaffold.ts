import { readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import { anhedralPrint } from './print.js';
import { appendGitignore, exec, execWithInput, writeFile } from './util.js';
import {
  getDefaultWebDependencyCommands,
  getDefaultWebInitCommand,
  getSkillCommands,
  type ScaffoldCommand,
} from './commands.js';
import { resolveToolchain, type ToolchainChannel, type ToolchainSpec } from './toolchain.js';
import { scaffoldBackend } from './templates/backend.js';
import { writeDefaultWebEnvExample, writeDefaultWebFiles } from './templates/default-web.js';
import { scaffoldExtension } from './templates/extension.js';
import { scaffoldFrontend } from './templates/frontend.js';

export type FrontendMode = 'expo' | 'next';
export type AuthMode = 'clerk' | 'betterauth';
export type PaymentsMode = 'none' | 'stripe' | 'revenuecat';

const PNPM_PACKAGE_MANAGER = 'pnpm@10.15.1';
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
  frontend: FrontendMode;
  extension: boolean;
  projectName: string;
  displayName: string;
  auth: AuthMode;
  payments: PaymentsMode;
  db: 'neon';
  orm: 'drizzle';
  storage: 'r2';
  api: 'fastify' | null;
  monorepo: boolean;
  toolchainChannel: ToolchainChannel;
}

export interface ProjectOptions {
  projectName: string;
  displayName: string;
  githubOrg: string | null;
  frontendUrl?: string;
}

type NormalizedStack = {
  schema_version: '2.0.0';
  mode: 'fullstack';
  project_name: string;
  display_name: string;
  frontend: 'nextjs_shadcn' | 'expo_react_native_reusables';
  extension: 'wxt_chrome_extension' | null;
  backend: 'fastify';
  auth: AuthMode;
  payments: PaymentsMode;
  storage: 'cloudflare_r2_via_aws_s3_sdk';
  database: 'neon_plus_drizzle';
  skills: string[];
  outputs: {
    monorepo: boolean;
    package_manager: 'pnpm';
    toolchain_channel: ToolchainChannel;
    toolchain: Partial<ToolchainSpec>;
    generated_paths: string[];
  };
};

function getUsedToolchain(options: InitOptions, toolchain: ToolchainSpec): Partial<ToolchainSpec> {
  return {
    verifiedAt: toolchain.verifiedAt,
    ...(options.frontend === 'next' || options.extension ? { shadcn: toolchain.shadcn } : {}),
    ...(options.frontend === 'expo' ? { reactNativeReusables: toolchain.reactNativeReusables } : {}),
    ...(options.extension ? { wxt: toolchain.wxt } : {}),
  };
}

function normalizeStack(options: InitOptions, generatedPaths: string[]): NormalizedStack {
  const toolchain = resolveToolchain(options.toolchainChannel);
  const frontend = options.frontend === 'next'
    ? 'nextjs_shadcn'
    : 'expo_react_native_reusables';

  return {
    schema_version: '2.0.0',
    mode: 'fullstack',
    project_name: options.projectName,
    display_name: options.displayName,
    frontend,
    extension: options.extension ? 'wxt_chrome_extension' : null,
    backend: 'fastify',
    auth: options.auth,
    payments: options.payments,
    storage: 'cloudflare_r2_via_aws_s3_sdk',
    database: 'neon_plus_drizzle',
    skills: getSkillCommands(options),
    outputs: {
      monorepo: options.monorepo,
      package_manager: 'pnpm',
      toolchain_channel: options.toolchainChannel,
      toolchain: getUsedToolchain(options, toolchain),
      generated_paths: generatedPaths,
    },
  };
}

function readJsonFile(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
}

function writeJsonFile(filePath: string, payload: Record<string, unknown>): void {
  writeFile(filePath, JSON.stringify(payload, null, 2) + '\n');
}

function runScaffoldCommands(cwd: string, commands: ScaffoldCommand[]): void {
  let skippedCount = 0;
  for (const command of commands) {
    if (env.ANHEDRAL_SKIP_INSTALL === '1' && command.skippable) {
      skippedCount += 1;
      continue;
    }

    if (command.stdinInput == null) {
      exec(command.cmd, cwd);
      continue;
    }

    execWithInput(command.cmd, cwd, command.stdinInput);
  }

  if (skippedCount > 0) {
    anhedralPrint.info(`Skipped ${skippedCount} install step${skippedCount === 1 ? '' : 's'} (ANHEDRAL_SKIP_INSTALL=1)`);
  }
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
    packageManager: PNPM_PACKAGE_MANAGER,
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

function patchPackageJson(root: string, updates: {
  scripts?: Record<string, string>;
  packageManager?: string;
}): void {
  const filePath = path.join(root, 'package.json');
  const packageJson = readJsonFile(filePath);
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;

  if (updates.scripts) {
    Object.assign(scripts, updates.scripts);
  }

  packageJson.scripts = scripts;
  if (updates.packageManager) {
    packageJson.packageManager = updates.packageManager;
  }

  writeJsonFile(filePath, packageJson);
}

function replaceInFile(filePath: string, replacements: [search: string, replacement: string][]): void {
  let contents = readFileSync(filePath, 'utf-8');
  for (const [search, replacement] of replacements) {
    contents = contents.split(search).join(replacement);
  }
  writeFile(filePath, contents);
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
  const frontendLabel = options.frontend === 'next' ? 'Next.js' : 'Expo';
  const extensionLine = options.extension ? '- Extension: WXT Chrome extension\n' : '';
  const extensionSetup = options.extension
    ? '\n5. Build or run the extension separately. It is not deployed by Vercel:\n\n```bash\npnpm dev:extension\npnpm extension:zip\n```\n'
    : '';
  const frontendDevCommand = options.frontend === 'next' ? 'pnpm dev:web' : 'pnpm dev:mobile';
  const frontendEnvCommand = options.frontend === 'next'
    ? 'cp apps/web/.env.example apps/web/.env.local'
    : '# apps/mobile/.env is generated for local Expo development';
  const extensionEnvCommand = options.extension ? '\ncp apps/extension/.env.example apps/extension/.env' : '';
  const extensionDevCommand = options.extension ? '\npnpm dev:extension' : '';
  const paymentSetup = options.payments === 'stripe'
    ? `- Stripe: create a Checkout price, then set \`STRIPE_SECRET_KEY\`, \`STRIPE_WEBHOOK_SECRET\`, and \`STRIPE_PRICE_STARTER\`.`
    : `- RevenueCat: create an entitlement named \`pro\`, configure app keys, then set \`RC_SECRET_API_KEY\`, \`RC_WEBHOOK_SECRET\`, and the \`EXPO_PUBLIC_RC_*\` values.`;
  const deploySetup = options.frontend === 'next'
    ? '- Vercel: deploy this repo from the root. The root `vercel.json` builds `apps/web` and `apps/api`; Fastify is routed under `/backend/*`.'
    : '- Vercel: deploy this repo from the root when you want the Fastify API hosted. Expo is built and shipped outside Vercel.';

  writeFile(path.join(root, 'README.md'), `# ${options.displayName}

Generated by anhedral.

## Stack

- Mode: fullstack
- Frontend: ${frontendLabel}
- Backend: Fastify
${extensionLine}- Shared packages: \`packages/*\`
- Auth: ${options.auth}
- Payments: ${options.payments}
- Database: ${options.db} + ${options.orm}
- Storage: ${options.storage}
- API: ${options.api ?? 'framework-native'}
- Toolchain: ${toolchainLine}

## Generated paths

${generatedPaths}

## First Run

\`\`\`bash
pnpm install
cp .env.example .env
${frontendEnvCommand}${extensionEnvCommand}
pnpm db:generate
pnpm db:migrate
pnpm dev:api
${frontendDevCommand}${extensionDevCommand}
\`\`\`

For a provider-free smoke test, keep \`ANHEDRAL_DEMO=true\` in \`apps/api/.env\`. Demo mode returns a signed-in sample user and active subscription responses without Clerk, RevenueCat, or Stripe credentials. It is for local development only.

## Provider Setup

- Neon: create a Postgres database and set \`DATABASE_URL\` in the root and API env files.
- Clerk: create an application, configure allowed origins, and set \`CLERK_PUBLISHABLE_KEY\`, \`CLERK_SECRET_KEY\`, plus the frontend publishable key for your selected client.
${paymentSetup}
- Cloudflare R2: create a bucket and API token, then set \`R2_ACCOUNT_ID\`, \`R2_ACCESS_KEY_ID\`, \`R2_SECRET_ACCESS_KEY\`, and \`R2_BUCKET\`.
${deploySetup}

## Setup Notes

1. Copy \`.env.example\` into the runtime env files your apps need and fill in provider values.
2. Review \`install-skills.sh\` and run the listed skill commands manually so you can choose scope and agent targets.
3. Add the real provider configuration for Clerk, Stripe, RevenueCat, Neon, and R2 where the scaffolded helper files indicate.
4. Run database generation and migrations from the shared DB package:

\`\`\`bash
pnpm db:generate
pnpm db:migrate
\`\`\`
${extensionSetup}
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
    dependencies: {
      '@neondatabase/serverless': '^1.0.0',
      'drizzle-orm': '^0.44.0',
      dotenv: '^17.2.3',
    },
    devDependencies: {
      'drizzle-kit': '^0.31.0',
      tsx: '^4.20.5',
      typescript: '^5.9.3',
      '@types/node': '25.5.0',
    },
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
  stripeCustomerId: text('stripe_customer_id').unique(),
  subscriptionTier: text('subscription_tier').notNull().default('starter'),
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

export async function updateStripeCustomerForUser(clerkUserId: string, stripeCustomerId: string) {
  await db
    .update(users)
    .set({
      stripeCustomerId,
      subscriptionStatus: 'checkout_started',
      updatedAt: new Date(),
    })
    .where(eq(users.clerkUserId, clerkUserId));
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
export type ClientPlatform = 'web' | 'mobile' | 'extension';
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
    displayName?: string | null;
    imageUrl?: string | null;
    avatarUrl?: string | null;
    creditsBalance: number;
    subscriptionTier: string;
    subscriptionStatus: string;
  };
};
export type PricingResponse = {
  plans: Array<{
    id: string;
    name: string;
    description: string;
    price: string;
    features: string[];
  }>;
};
`],
    ['config', { exports: { '.': './src/index.ts' } }, `export const DEFAULT_API_PATH_PREFIX = '/api';
export const DEFAULT_LOCAL_API_URL = 'http://localhost:8787';
export const DEFAULT_WEB_URL = 'http://localhost:3000';
export const DEFAULT_MOBILE_URL = 'http://localhost:8081';
export const DEFAULT_EXTENSION_URL = 'chrome-extension://';

export function joinApiUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\\/$/, '');
  const suffix = path.startsWith('/') ? path : \`/\${path}\`;
  return \`\${base}\${suffix}\`;
}
`],
    ['api-client', {
      exports: { '.': './src/index.ts' },
      dependencies: {
        '@anhedral/config': 'workspace:*',
        '@anhedral/types': 'workspace:*',
      },
    }, `import { joinApiUrl } from '@anhedral/config';
import type { AuthMeResponse, ClientPlatform, PricingResponse, SubscriptionEntitlements } from '@anhedral/types';

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
      throw new Error(\`API request failed: \${response.status}\`);
    }

    return response.json() as Promise<T>;
  }

  getMe() {
    return this.request<AuthMeResponse>('/auth/me');
  }

  getPricing() {
    return this.request<PricingResponse>('/subscriptions/pricing');
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
      devDependencies: {
        typescript: '^5.9.3',
      },
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

function writeRootEnvExample(root: string, options: InitOptions): void {
  const frontendUrl = options.frontend === 'next' ? 'http://localhost:3000' : 'http://localhost:8081';
  const nextEnv = options.frontend === 'next'
    ? `NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
`
    : '';
  const expoEnv = options.frontend === 'expo'
    ? `EXPO_PUBLIC_API_URL=http://localhost:8787
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***
EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro
EXPO_PUBLIC_RC_API_KEY_IOS=
EXPO_PUBLIC_RC_API_KEY_ANDROID=
EXPO_PUBLIC_RC_WEB_API_KEY=
`
    : '';
  const extensionEnv = options.extension
    ? `VITE_API_URL=http://localhost:8787
VITE_WEBSITE_URL=${frontendUrl}
VITE_CLERK_PUBLISHABLE_KEY=pk_test_***
VITE_CRX_PUBLIC_KEY=
VITE_RC_BILLING_URL=
`
    : '';
  const revenueCatEnv = options.payments === 'revenuecat'
    ? `# RevenueCat
RC_SECRET_API_KEY=
RC_WEBHOOK_SECRET=
RC_ENTITLEMENT_ID=pro
RC_OFFERING_ID=default
`
    : '';
  const stripeEnv = options.payments === 'stripe'
    ? `# Stripe
STRIPE_SECRET_KEY=sk_test_***
STRIPE_WEBHOOK_SECRET=whsec_***
STRIPE_PRICE_STARTER=price_***
`
    : '';

  writeFile(path.join(root, '.env.example'), `# Apps
FRONTEND_URL=${frontendUrl}
ANHEDRAL_DEMO=false
${nextEnv}${expoEnv}${extensionEnv}

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

${revenueCatEnv}${stripeEnv}`);
}

function writeRootVercelJson(root: string, options: InitOptions): void {
  const builds = options.frontend === 'next'
    ? [
        { src: 'apps/web/package.json', use: '@vercel/next' },
        { src: 'apps/api/api/index.ts', use: '@vercel/node' },
      ]
    : [
        { src: 'apps/api/api/index.ts', use: '@vercel/node' },
      ];
  const routes = options.frontend === 'next'
    ? [
        { src: '/backend/(.*)', dest: 'apps/api/api/index.ts' },
        { src: '/(.*)', dest: 'apps/web/$1' },
      ]
    : [
        { src: '/api/(.*)', dest: 'apps/api/api/index.ts' },
        { src: '/(.*)', dest: 'apps/api/api/index.ts' },
      ];

  writeFile(path.join(root, 'vercel.json'), JSON.stringify({ version: 2, builds, routes }, null, 2) + '\n');
  writeFile(path.join(root, '.vercelignore'), `apps/extension/.output
apps/extension/.wxt
apps/extension/dist
apps/mobile/.expo
`);
}

function patchGeneratedPackageName(root: string, name: string): void {
  const filePath = path.join(root, 'package.json');
  const packageJson = readJsonFile(filePath);
  packageJson.name = name;
  writeJsonFile(filePath, packageJson);
}

function scaffoldNextFrontend(root: string, options: InitOptions, directoryName: string): void {
  const toolchain = resolveToolchain(options.toolchainChannel);
  const appsRoot = path.join(root, 'apps');
  const appRoot = path.join(appsRoot, directoryName);

  anhedralPrint.section('Web (Next.js + shadcn/ui)');
  anhedralPrint.step('Scaffolding Next.js app');
  writeFile(path.join(appsRoot, '.gitkeep'), '');
  runScaffoldCommands(appsRoot, [getDefaultWebInitCommand(toolchain, directoryName)]);
  anhedralPrint.done('Next.js app scaffolded');

  const packageJsonPath = path.join(appRoot, 'package.json');
  const packageJson = readJsonFile(packageJsonPath);
  packageJson.dependencies = {
    ...((packageJson.dependencies ?? {}) as Record<string, string>),
    '@anhedral/db': 'workspace:*',
  };
  writeJsonFile(packageJsonPath, packageJson);

  anhedralPrint.step('Installing web dependencies');
  runScaffoldCommands(appRoot, getDefaultWebDependencyCommands());
  anhedralPrint.done('Web dependencies installed');
  rmSync(path.join(appRoot, '.git'), { recursive: true, force: true });

  appendGitignore(appRoot, [
    ...SHARED_ENV_GITIGNORE_LINES,
    '.next',
    'node_modules',
    'lib/db/migrations',
    ...SHARED_TYPESCRIPT_GITIGNORE_LINES,
  ]);
  patchPackageJson(appRoot, {
    packageManager: PNPM_PACKAGE_MANAGER,
    scripts: {
      typecheck: 'tsc --noEmit',
      'db:generate': 'pnpm --filter @anhedral/db db:generate',
      'db:migrate': 'pnpm --filter @anhedral/db db:migrate',
    },
  });
  patchGeneratedPackageName(appRoot, `${options.projectName}-${directoryName}`);
  writeDefaultWebEnvExample(appRoot);
  writeDefaultWebFiles(appRoot, options.displayName);

  for (const relativePath of [
    'lib/app/dashboard.ts',
    'app/api/account/avatar/route.ts',
    'app/api/stripe/checkout/route.ts',
    'app/api/stripe/portal/route.ts',
  ]) {
    replaceInFile(path.join(appRoot, relativePath), [
      ["@/lib/db/queries", '@anhedral/db/queries'],
    ]);
  }
  rmSync(path.join(appRoot, 'lib/db'), { recursive: true, force: true });
}

function writeFullstackRootFiles(root: string, options: InitOptions): void {
  const appFilters = [
    options.frontend === 'next' ? './apps/web' : './apps/mobile',
    './apps/api',
    ...(options.extension ? ['./apps/extension'] : []),
  ];
  const parallelFilters = appFilters.map((entry) => `--filter ${entry}`).join(' ');
  const buildFilters = ['./packages/db', ...appFilters].map((entry) => `--filter ${entry}`).join(' ');

  const scripts: Record<string, string> = {
    dev: `pnpm -r --parallel ${parallelFilters} run dev`,
    'dev:api': 'pnpm --filter ./apps/api dev',
    build: `pnpm -r ${buildFilters} build`,
    typecheck: 'pnpm -r typecheck',
    'db:generate': 'pnpm --filter @anhedral/db db:generate',
    'db:migrate': 'pnpm --filter @anhedral/db db:migrate',
  };

  if (options.frontend === 'next') {
    scripts['dev:web'] = 'pnpm --filter ./apps/web dev';
  } else {
    scripts['dev:mobile'] = 'pnpm --filter ./apps/mobile dev';
  }

  if (options.extension) {
    scripts['dev:extension'] = 'pnpm --filter ./apps/extension dev';
    scripts['extension:zip'] = 'pnpm --filter ./apps/extension zip';
  }

  writeRootPackageJson(root, options.projectName, scripts, ['apps/*', 'packages/*']);
  writePnpmWorkspace(root, ['apps/*', 'packages/*']);
  appendGitignore(root, [
    'node_modules',
    'apps/*/node_modules',
    'packages/*/node_modules',
    ...SHARED_ENV_GITIGNORE_LINES,
    ...SHARED_TYPESCRIPT_GITIGNORE_LINES,
  ]);
  writeRootEnvExample(root, options);
  writeRootVercelJson(root, options);
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

  const frontendUrl = options.frontend === 'next' ? 'http://localhost:3000' : 'http://localhost:8081';
  await scaffoldBackend(root, {
    projectName: options.projectName,
    displayName: options.displayName,
    githubOrg: null,
    frontendUrl,
  });

  if (options.frontend === 'next') {
    scaffoldNextFrontend(root, options, 'web');
  } else {
    await scaffoldFrontend(root, {
      projectName: options.projectName,
      displayName: options.displayName,
      githubOrg: null,
      frontendUrl,
    });
  }

  if (options.extension) {
    await scaffoldExtension(root, {
      projectName: options.projectName,
      displayName: options.displayName,
      githubOrg: null,
      frontendUrl,
    });
  }

  return [
    options.frontend === 'next' ? 'apps/web' : 'apps/mobile',
    'apps/api',
    ...(options.extension ? ['apps/extension'] : []),
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
    const skillCommands = getSkillCommands(options);
    writeSkillsGuide(root, skillCommands);

    const stack = normalizeStack(options, generatedPaths);
    writeRootDocs(root, options, stack);
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
    if (options.frontend === 'next') {
      console.log('  cp apps/web/.env.example apps/web/.env.local');
    }
    if (options.extension) {
      console.log('  cp apps/extension/.env.example apps/extension/.env');
    }
    console.log('  pnpm db:generate && pnpm db:migrate');
    console.log('  pnpm dev:api');
    console.log(options.frontend === 'next' ? '  pnpm dev:web' : '  pnpm dev:mobile');
    if (options.extension) {
      console.log('  pnpm dev:extension');
    }
    console.log('');
  } finally {
    if (previousToolchain == null) {
      delete env.ANHEDRAL_TOOLCHAIN;
    } else {
      env.ANHEDRAL_TOOLCHAIN = previousToolchain;
    }
  }
}

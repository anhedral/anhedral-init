import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import { appendGitignore, exec, execWithInput, liftNestedProject, writeFile } from './util.js';
import {
  getDefaultWebDependencyCommands,
  getDefaultWebInitCommand,
  getHeadlessInstallCommands,
  getSkillCommands,
  type ScaffoldCommand,
} from './commands.js';
import { resolveToolchain, type ToolchainChannel, type ToolchainSpec } from './toolchain.js';
import { scaffoldBackend } from './templates/backend.js';
import { writeDefaultWebEnvExample, writeDefaultWebFiles } from './templates/default-web.js';
import { scaffoldFrontend } from './templates/frontend.js';

export const STACK_IDS = ['next', 'next-fullstack', 'expo-fullstack', 'backend'] as const;

export type InitMode = (typeof STACK_IDS)[number];
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
  mode: InitMode;
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
  mode: InitMode;
  project_name: string;
  display_name: string;
  frontend: 'nextjs_shadcn' | 'expo_react_native_reusables' | null;
  backend: 'fastify' | null;
  auth: AuthMode;
  payments: PaymentsMode;
  storage: 'cloudflare_r2_via_aws_s3_sdk';
  database: 'neon_plus_drizzle';
  skills: string[];
  outputs: {
    monorepo: boolean;
    package_manager: 'pnpm';
    toolchain_channel: ToolchainChannel;
    toolchain: ToolchainSpec;
    generated_paths: string[];
  };
};

function normalizeStack(options: InitOptions, generatedPaths: string[]): NormalizedStack {
  const toolchain = resolveToolchain(options.toolchainChannel);
  const frontend = options.mode === 'next'
    ? 'nextjs_shadcn'
    : options.mode === 'next-fullstack'
      ? 'nextjs_shadcn'
      : options.mode === 'expo-fullstack'
      ? 'expo_react_native_reusables'
      : null;
  const backend = options.mode === 'next' ? null : 'fastify';

  return {
    schema_version: '2.0.0',
    mode: options.mode,
    project_name: options.projectName,
    display_name: options.displayName,
    frontend,
    backend,
    auth: options.auth,
    payments: options.payments,
    storage: 'cloudflare_r2_via_aws_s3_sdk',
    database: 'neon_plus_drizzle',
    skills: getSkillCommands(options.mode),
    outputs: {
      monorepo: options.monorepo,
      package_manager: 'pnpm',
      toolchain_channel: options.toolchainChannel,
      toolchain,
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
  for (const command of commands) {
    if (env.ANHEDRAL_SKIP_INSTALL === '1' && command.skippable) {
      console.log(`  $ ${command.cmd} (skipped via ANHEDRAL_SKIP_INSTALL=1)`);
      continue;
    }

    if (command.stdinInput == null) {
      exec(command.cmd, cwd);
      continue;
    }

    execWithInput(command.cmd, cwd, command.stdinInput);
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

function writeDrizzleConfig(root: string, schemaPath: string, migrationsPath: string): void {
  writeFile(path.join(root, 'drizzle.config.ts'), `import type { Config } from 'drizzle-kit';

export default {
  schema: '${schemaPath}',
  out: '${migrationsPath}',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
`);
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

function writeCrossplatformEnvExample(root: string): void {
  writeFile(path.join(root, '.env.example'), `# Shared services
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***
CLERK_SECRET_KEY=sk_test_***
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# RevenueCat
RC_SECRET_API_KEY=
RC_WEBHOOK_SECRET=
RC_ENTITLEMENT_ID=pro
RC_OFFERING_ID=default
EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro
EXPO_PUBLIC_RC_API_KEY_IOS=
EXPO_PUBLIC_RC_API_KEY_ANDROID=
EXPO_PUBLIC_RC_WEB_API_KEY=

# Stripe
STRIPE_SECRET_KEY=sk_test_***
STRIPE_WEBHOOK_SECRET=whsec_***
`);
}

function writeNextFullstackRootEnvExample(root: string): void {
  writeFile(path.join(root, '.env.example'), `# Frontend
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Backend
PORT=8787
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require
CLERK_SECRET_KEY=sk_test_***
CLERK_PUBLISHABLE_KEY=pk_test_***

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# Stripe
STRIPE_SECRET_KEY=sk_test_***
STRIPE_WEBHOOK_SECRET=whsec_***
STRIPE_PRICE_STARTER=price_***
`);
}

function writeHeadlessPackageJson(root: string, projectName: string): void {
  writeRootPackageJson(root, projectName, {
    dev: 'tsx --env-file=.env --watch src/index.ts',
    build: 'tsc',
    typecheck: 'tsc --noEmit',
    'db:generate': 'drizzle-kit generate',
    'db:migrate': 'pnpm tsx src/lib/db/migrate.ts',
  }, undefined, {
    type: 'module',
  });
}

function writeHeadlessTsConfig(root: string): void {
  writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: 'dist',
      rootDir: 'src',
      types: ['node'],
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  }, null, 2) + '\n');
}

function writeHeadlessEnvExample(root: string): void {
  writeFile(path.join(root, '.env.example'), `PORT=8787
CLIENT_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require

# Better Auth
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:8787
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
`);
}

function writeHeadlessFiles(root: string): void {
  writeFile(path.join(root, 'src/lib/db/client.ts'), `import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
`);

  writeFile(path.join(root, 'src/lib/db/schema.ts'), `import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('users_email_idx').on(table.email),
]);

export const uploads = pgTable('uploads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull().unique(),
  bucket: text('bucket').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
`);

  writeFile(path.join(root, 'src/lib/db/queries/users.ts'), `import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { users } from '../schema.js';

export async function findUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email),
  });
}
`);

  writeFile(path.join(root, 'src/lib/db/queries/index.ts'), `export * from './users.js';
`);

  writeFile(path.join(root, 'src/lib/db/migrate.ts'), `import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

await migrate(db, { migrationsFolder: './src/lib/db/migrations' });
`);

  writeFile(path.join(root, 'src/lib/db/migrations/.gitkeep'), '');

  writeFile(path.join(root, 'src/lib/storage/r2.ts'), `import { S3Client } from '@aws-sdk/client-s3';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: \`https://\${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com\`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});
`);

  writeFile(path.join(root, 'src/lib/auth/auth.ts'), `import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
});
`);

  writeFile(path.join(root, 'src/app.ts'), `import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './lib/auth/auth.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: process.env.CLIENT_ORIGIN ?? true,
    credentials: true,
  });

  app.get('/health', async () => ({ ok: true }));

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, \`http://\${request.headers.host}\`);
      const headers = new Headers();

      Object.entries(request.headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          for (const entry of value) headers.append(key, entry);
          return;
        }

        if (value) headers.append(key, value.toString());
      });

      const authRequest = new Request(url.toString(), {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      const response = await auth.handler(authRequest);
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    },
  });

  app.get('/api/me', async (request, reply) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    return reply.send(session);
  });

  return app;
}
`);

  writeFile(path.join(root, 'src/index.ts'), `import 'dotenv/config';
import { buildApp } from './app.js';

const app = buildApp();
const port = Number(process.env.PORT ?? 8787);

app.listen({ port, host: '0.0.0.0' })
  .then(() => {
    app.log.info({ port }, 'server_started');
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
`);
}

function writeRootDocs(root: string, options: InitOptions, stack: NormalizedStack): void {
  const toolchainLine = stack.outputs.toolchain.verifiedAt
    ? `${options.toolchainChannel} (verified ${stack.outputs.toolchain.verifiedAt})`
    : `${options.toolchainChannel} (floating latest)`;
  const generatedPaths = stack.outputs.generated_paths.map((entry) => `- \`${entry}\``).join('\n') || '- `.`';
  const envCopyStep = options.mode === 'next'
    ? 'Copy `.env.example` to `.env.local` and fill in your provider values.'
    : options.mode === 'next-fullstack'
      ? 'Copy the root `.env.example` values into the `.env.local` and `.env` files your frontend and backend will read before starting the apps.'
      : options.mode === 'expo-fullstack'
      ? 'Copy the generated `.env.example` files into the runtime `.env` files each package expects before starting the apps.'
      : 'Copy `.env.example` to `.env` and fill in your provider values.';
  const authStep = options.mode === 'backend'
    ? 'Review `src/lib/auth/auth.ts` and align the Better Auth schema with your production auth tables before shipping.'
    : options.mode === 'expo-fullstack'
      ? 'Add the real provider configuration for Clerk, RevenueCat, and Stripe where the scaffolded helper files indicate.'
      : options.mode === 'next-fullstack'
        ? 'Add the real provider configuration for Clerk and Stripe across the frontend and backend where the scaffolded helper files indicate.'
      : 'Add the real provider configuration for Clerk and Stripe where the scaffolded helper files indicate.';
  const databaseCommands = options.mode === 'next-fullstack' || options.mode === 'expo-fullstack'
    ? '```bash\ncd backend\npnpm db:generate\npnpm db:migrate\n```'
    : '```bash\npnpm db:generate\npnpm db:migrate\n```';

  writeFile(path.join(root, 'README.md'), `# ${options.displayName}

Generated by anhedral.

## Stack

- Mode: ${options.mode}
- Auth: ${options.auth}
- Payments: ${options.payments}
- Database: ${options.db} + ${options.orm}
- Storage: ${options.storage}
- API: ${options.api ?? 'framework-native'}
- Toolchain: ${toolchainLine}

## Generated paths

${generatedPaths}

## Setup

1. ${envCopyStep}
2. Review \`install-skills.sh\` and run the listed skill commands manually so you can choose scope and agent targets.
3. ${authStep}
4. Run database generation and migrations:

${databaseCommands}
`);
}

function writeStackFile(root: string, stack: NormalizedStack): void {
  writeFile(path.join(root, 'stack.json'), JSON.stringify(stack, null, 2) + '\n');
}

function scaffoldDefaultWeb(root: string, options: InitOptions): string[] {
  const toolchain = resolveToolchain(options.toolchainChannel);
  runScaffoldCommands(root, [getDefaultWebInitCommand(toolchain, options.projectName)]);
  liftNestedProject(root, options.projectName);
  runScaffoldCommands(root, getDefaultWebDependencyCommands());

  appendGitignore(root, [
    ...SHARED_ENV_GITIGNORE_LINES,
    '.next',
    'node_modules',
    'lib/db/migrations',
    ...SHARED_TYPESCRIPT_GITIGNORE_LINES,
  ]);
  patchPackageJson(root, {
    packageManager: PNPM_PACKAGE_MANAGER,
    scripts: {
      typecheck: 'tsc --noEmit',
      'db:generate': 'drizzle-kit generate',
      'db:migrate': 'pnpm tsx lib/db/migrate.ts',
    },
  });

  writeDrizzleConfig(root, './lib/db/schema.ts', './lib/db/migrations');
  writeDefaultWebEnvExample(root);
  writeDefaultWebFiles(root, options.displayName);

  return ['.'];
}

function patchGeneratedPackageName(root: string, name: string): void {
  const filePath = path.join(root, 'package.json');
  const packageJson = readJsonFile(filePath);
  packageJson.name = name;
  writeJsonFile(filePath, packageJson);
}

function scaffoldNextFrontend(root: string, options: InitOptions, directoryName: string): void {
  const toolchain = resolveToolchain(options.toolchainChannel);
  runScaffoldCommands(root, [getDefaultWebInitCommand(toolchain, directoryName)]);
  runScaffoldCommands(path.join(root, directoryName), getDefaultWebDependencyCommands());

  appendGitignore(path.join(root, directoryName), [
    ...SHARED_ENV_GITIGNORE_LINES,
    '.next',
    'node_modules',
    'lib/db/migrations',
    ...SHARED_TYPESCRIPT_GITIGNORE_LINES,
  ]);
  patchPackageJson(path.join(root, directoryName), {
    packageManager: PNPM_PACKAGE_MANAGER,
    scripts: {
      typecheck: 'tsc --noEmit',
      'db:generate': 'drizzle-kit generate',
      'db:migrate': 'pnpm tsx lib/db/migrate.ts',
    },
  });
  patchGeneratedPackageName(path.join(root, directoryName), `${options.projectName}-${directoryName}`);
  writeDrizzleConfig(path.join(root, directoryName), './lib/db/schema.ts', './lib/db/migrations');
  writeDefaultWebEnvExample(path.join(root, directoryName));
  writeDefaultWebFiles(path.join(root, directoryName), options.displayName);
}

async function scaffoldNextFullstack(root: string, options: InitOptions): Promise<string[]> {
  scaffoldNextFrontend(root, options, 'frontend');

  writeRootPackageJson(root, options.projectName, {
    dev: 'pnpm -r --parallel --filter ./frontend --filter ./backend run dev',
  }, ['frontend', 'backend']);
  writePnpmWorkspace(root, ['frontend', 'backend']);

  appendGitignore(root, [
    'node_modules',
    'frontend/node_modules',
    'backend/node_modules',
    ...SHARED_ENV_GITIGNORE_LINES,
  ]);
  writeNextFullstackRootEnvExample(root);
  await scaffoldBackend(root, {
    projectName: options.projectName,
    displayName: options.displayName,
    githubOrg: null,
    frontendUrl: 'http://localhost:3000',
  });

  return ['frontend', 'backend'];
}

async function scaffoldCrossplatform(root: string, options: InitOptions): Promise<string[]> {
  writeRootPackageJson(root, options.projectName, {
    dev: 'pnpm -r --parallel --filter ./frontend --filter ./backend run dev',
  }, ['frontend', 'backend']);
  writePnpmWorkspace(root, ['frontend', 'backend']);

  appendGitignore(root, [
    'node_modules',
    'frontend/node_modules',
    'backend/node_modules',
    ...SHARED_ENV_GITIGNORE_LINES,
  ]);
  writeCrossplatformEnvExample(root);

  const projectOptions: ProjectOptions = {
    projectName: options.projectName,
    displayName: options.displayName,
    githubOrg: null,
    frontendUrl: 'http://localhost:8081',
  };

  await scaffoldFrontend(root, projectOptions);
  await scaffoldBackend(root, projectOptions);

  return ['frontend', 'backend'];
}

function scaffoldHeadless(root: string, options: InitOptions): string[] {
  writeHeadlessPackageJson(root, options.projectName);
  appendGitignore(root, [
    'dist',
    'node_modules',
    ...SHARED_ENV_GITIGNORE_LINES,
    '*.log',
    ...SHARED_TYPESCRIPT_GITIGNORE_LINES,
  ]);
  writeHeadlessTsConfig(root);
  writeDrizzleConfig(root, './src/lib/db/schema.ts', './src/lib/db/migrations');
  writeHeadlessEnvExample(root);
  writeHeadlessFiles(root);
  runScaffoldCommands(root, getHeadlessInstallCommands());
  return ['.'];
}

export async function scaffoldProject(options: InitOptions): Promise<void> {
  const root = path.resolve(process.cwd());
  ensureScaffoldRoot(root);

  const previousToolchain = env.ANHEDRAL_TOOLCHAIN;
  env.ANHEDRAL_TOOLCHAIN = options.toolchainChannel;

  try {
    await printAsciiLogo();
    console.log(`\n📁 Initializing ${options.displayName} in ${root}\n`);

    const generatedPaths = options.mode === 'next'
      ? scaffoldDefaultWeb(root, options)
      : options.mode === 'next-fullstack'
        ? await scaffoldNextFullstack(root, options)
        : options.mode === 'expo-fullstack'
        ? await scaffoldCrossplatform(root, options)
        : scaffoldHeadless(root, options);

    const skillCommands = getSkillCommands(options.mode);
    writeSkillsGuide(root, skillCommands);

    const stack = normalizeStack(options, generatedPaths);
    writeRootDocs(root, options, stack);
    writeStackFile(root, stack);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n🎉 ${options.displayName} is ready.\n`);
    console.log('Generated:');
    for (const generatedPath of generatedPaths) {
      console.log(`  - ${generatedPath}`);
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

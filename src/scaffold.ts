import { readdirSync } from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import { anhedralPrint } from './print.js';
import { appendGitignore, writeFile } from './util.js';
import { getSkillCommands } from './commands.js';
import {
  API_CLIENT_DEPENDENCIES,
  CONTRACTS_DEPENDENCIES,
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
import { scaffoldDesktop } from './templates/desktop.js';
import { scaffoldWeb } from './templates/web.js';
import { scaffoldNextjs } from './templates/nextjs.js';

export type FrontendMode = 'expo';
export type AuthMode = 'clerk';
export type PaymentsMode = 'revenuecat_stripe' | 'stripe';

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
  template: 'fullstack' | 'next';
  projectName: string;
  displayName: string;
  auth: AuthMode;
  payments: PaymentsMode;
  db: 'neon';
  orm: 'drizzle';
  storage: 'r2';
  api: 'fastify' | 'nextjs_route_handlers';
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
  mode: 'fullstack' | 'next';
  project_name: string;
  display_name: string;
  frontend: 'monorepo_clients' | 'nextjs_shadcn';
  clients: {
    web: 'nextjs_shadcn';
    mobile: 'expo_react_native_reusables';
    desktop: 'electron_shadcn';
    extension: 'wxt_shadcn';
  } | null;
  extension: 'wxt_chrome_extension' | null;
  backend: 'fastify' | 'nextjs_route_handlers';
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
  const isNext = options.template === 'next';

  return {
    schema_version: '2.0.0',
    mode: options.template,
    project_name: options.projectName,
    display_name: options.displayName,
    frontend: isNext ? 'nextjs_shadcn' : 'monorepo_clients',
    clients: isNext ? null : {
      web: 'nextjs_shadcn',
      mobile: 'expo_react_native_reusables',
      desktop: 'electron_shadcn',
      extension: 'wxt_shadcn',
    },
    extension: isNext ? null : 'wxt_chrome_extension',
    backend: isNext ? 'nextjs_route_handlers' : 'fastify',
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
- Web: Next.js + shadcn/ui
- Mobile: Expo + React Native Reusables
- API: Fastify
- Desktop: Electron + shadcn/ui
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
# apps/mobile/.env is generated for local Expo development
cp apps/extension/.env.example apps/extension/.env
pnpm db:generate
pnpm db:migrate
pnpm verify
pnpm dev:web
pnpm dev:api
pnpm dev:mobile
pnpm dev:desktop
pnpm dev:extension
\`\`\`

The generated env files intentionally contain placeholder provider values. That is enough to inspect the project structure and run backend smoke tests, but the full UI needs real provider keys before auth, billing, uploads, and extension sign-in behave like production.

For a provider-free backend smoke test, keep \`ANHEDRAL_DEMO=true\` in \`apps/api/.env\`. Demo mode returns a signed-in sample user and active subscription responses without Clerk, RevenueCat, or Stripe credentials. It is for local development only.

## Provider Setup

Use this order so each service has the domains and callback URLs it needs:

1. Neon database
   - Create a Neon project and database: https://neon.com/docs/get-started-with-neon/connect-neon
   - Put the pooled connection string in \`DATABASE_URL\` in \`.env\`, \`apps/api/.env\`, and the API Vercel project.
   - Run \`pnpm db:generate\` and \`pnpm db:migrate\` after \`DATABASE_URL\` is real.

2. Clerk auth
   - Expo setup: https://docs.expo.dev/guides/using-clerk/
   - Clerk Expo quickstart: https://clerk.com/docs/quickstarts/get-started-with-expo
   - Set \`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY\` in \`apps/mobile/.env\`, Vercel Mobile, and EAS.
   - Set \`CLERK_PUBLISHABLE_KEY\` and \`CLERK_SECRET_KEY\` in \`apps/api/.env\` and Vercel API.
   - Set \`VITE_CLERK_PUBLISHABLE_KEY\` in \`apps/extension/.env\`.
   - Add allowed origins for \`http://localhost:8081\`, the Mobile Vercel domain, and the extension origin after Chrome assigns an extension id.

3. RevenueCat + Stripe
   - RevenueCat Web overview: https://www.revenuecat.com/docs/web/overview
   - RevenueCat Stripe Billing integration: https://www.revenuecat.com/docs/web/integrations/stripe
   - Stripe API keys: https://docs.stripe.com/keys
   - Create an entitlement named \`pro\`.
   - Create iOS, Android, and Web apps in RevenueCat and copy their public SDK keys into \`EXPO_PUBLIC_RC_API_KEY_IOS\`, \`EXPO_PUBLIC_RC_API_KEY_ANDROID\`, and \`EXPO_PUBLIC_RC_WEB_API_KEY\`.
   - Set \`EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro\`.
   - Set \`RC_SECRET_API_KEY\` and \`RC_WEBHOOK_SECRET\` only in API envs.
   - Point the RevenueCat webhook to \`https://<backend-domain>/webhooks/revenuecat\`.

4. Cloudflare R2/CDN
   - R2 S3-compatible setup: https://developers.cloudflare.com/r2/get-started/s3/
   - R2 API tokens: https://developers.cloudflare.com/r2/api/tokens/
   - Create a bucket and least-privilege API token.
   - Set \`R2_ACCOUNT_ID\`, \`R2_ACCESS_KEY_ID\`, \`R2_SECRET_ACCESS_KEY\`, and \`R2_BUCKET\` only in API envs.
   - If you use a public CDN/custom domain for uploaded files, add that URL to your own app config before exposing uploads broadly.

5. Vercel Services web/API deploy
   - Services docs: https://vercel.com/docs/services
   - Import this repository once as one Vercel project and select the Services framework preset.
   - Root \`vercel.json\` defines \`apps/web\` as the Next.js service at \`/\` and \`apps/api\` as the Fastify service at \`/api/*\`.
   - Web service build command: \`pnpm build\`.
   - API service build command: \`pnpm build\`; entrypoint: \`apps/api/src/index.ts\`.

6. EAS native app builds
   - EAS docs: https://docs.expo.dev/eas/
   - Store submission docs: https://docs.expo.dev/deploy/submit-to-app-stores/
   - Use \`apps/mobile\` as the Expo project root for iOS and Android builds.

7. Desktop app builds
   - Build all desktop targets with \`pnpm desktop:build\`.
   - Build one target with \`pnpm desktop:build:mac\`, \`pnpm desktop:build:win\`, or \`pnpm desktop:build:linux\`.

8. Chrome Web Store
   - WXT publishing: https://wxt.dev/guide/essentials/publishing.html
   - Chrome publishing: https://developer.chrome.com/docs/webstore/publish
   - Build with \`pnpm extension:zip\`, then upload \`apps/extension/.output/*-chrome.zip\` in the Chrome Web Store Developer Dashboard.

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
pnpm verify:web
pnpm verify:mobile
pnpm verify:api
pnpm verify:desktop
pnpm verify:extension
\`\`\`

7. Build platform artifacts separately:

\`\`\`bash
pnpm eas:build:ios
pnpm eas:build:android
pnpm desktop:build
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
├─ apps/web/           Next.js + shadcn/ui web app
├─ apps/mobile/        Expo + React Native Reusables app
├─ apps/api/           Fastify API
├─ apps/desktop/       Electron + shadcn/ui desktop app
├─ apps/extension/     WXT + shadcn/ui Chrome extension
├─ packages/
│  ├─ api-client/   shared typed API client
│  ├─ config/       shared config constants/helpers
│  ├─ contracts/    shared Zod request/response contracts
│  ├─ db/           Drizzle schema, Neon client, migrations
│  └─ types/        shared TypeScript types
├─ PRODUCTION.md    development and deployment guide
├─ turbo.json       workspace build graph
└─ package.json     root scripts
\`\`\`

## Web

\`apps/web\` is the Next.js + shadcn/ui web client deployed by Vercel Services at \`/\`.

Important files:

- \`apps/web/package.json\`: Next.js scripts
- \`apps/web/components.json\`: shadcn/ui config
- \`apps/web/app\`: App Router routes
- \`apps/web/lib/api.ts\`: shared API client wiring

## Mobile

\`apps/mobile\` is the Expo source for:

- iOS through EAS
- Android through EAS

Important files:

- \`apps/mobile/package.json\`: Expo scripts
- \`apps/mobile/vercel.json\`: Vercel web export config
- \`apps/mobile/eas.json\`: native build profiles
- \`apps/mobile/app\`: Expo Router screens

Build output goes to \`apps/mobile/dist\`.

## API

\`apps/api\` is the Fastify API. Vercel Services routes public \`/api/*\` traffic to this service, while local API development can still call bare routes like \`/health\`.

Important files:

- \`apps/api/src/index.ts\`: Vercel Fastify entrypoint
- \`apps/api/src/app.ts\`: Fastify app construction
- \`apps/api/vercel.json\`: minimal Vercel config
- \`apps/api/src/routes\`: health/auth/subscription/storage routes

## Desktop

\`apps/desktop\` is the Electron + shadcn/ui desktop client.

Important files:

- \`apps/desktop/package.json\`: Electron Builder targets
- \`apps/desktop/components.json\`: shadcn/ui config
- \`apps/desktop/src/main\`: Electron main/preload process
- \`apps/desktop/src/renderer\`: React renderer UI

## Extension

\`apps/extension\` is the WXT + shadcn/ui Chrome extension using the Side Panel API.

Important files:

- \`apps/extension/wxt.config.ts\`: manifest, side panel, permissions
- \`apps/extension/src/entrypoints/sidepanel\`: side panel UI
- \`apps/extension/src/entrypoints/background.ts\`: side panel behavior

ZIP output goes to \`apps/extension/.output\`.

## Develop

From the repository root:

\`\`\`sh
pnpm install
pnpm dev
\`\`\`

Or run one surface at a time:

\`\`\`sh
pnpm dev:web
pnpm dev:mobile
pnpm dev:api
pnpm dev:desktop
pnpm dev:extension
\`\`\`

Use these before deploy:

\`\`\`sh
pnpm verify
pnpm verify:web
pnpm verify:mobile
pnpm verify:api
pnpm verify:desktop
pnpm verify:extension
\`\`\`

Database workflow:

\`\`\`sh
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm db:check
\`\`\`

Local demo mode is enabled through generated \`.env\` files. Real provider behavior needs Clerk, RevenueCat/Stripe, Neon, and R2 credentials.

The generated placeholder values are intentionally non-production. They let you inspect files and run backend demo checks, but browser auth, paid subscriptions, uploads, and extension sign-in require the setup below.

## Environment Variables

- Root/local: \`DATABASE_URL\` for shared Drizzle commands.
- apps/web/Vercel web service: \`NEXT_PUBLIC_*\` values.
- apps/mobile/EAS: \`EXPO_PUBLIC_*\` values.
- apps/api/Vercel API service: server secrets such as \`DATABASE_URL\`, \`CLERK_SECRET_KEY\`, \`RC_SECRET_API_KEY\`, \`RC_WEBHOOK_SECRET\`, and R2 credentials.
- apps/desktop and apps/extension: \`VITE_API_URL\`, \`VITE_CLERK_PUBLISHABLE_KEY\`, and client-safe public values.
- EAS: add native app public keys with \`eas secret:create\` or the EAS dashboard.

## Provider Setup

### Neon + Drizzle

Docs:

- https://neon.com/docs/get-started-with-neon/connect-neon
- https://orm.drizzle.team/docs/tutorials/drizzle-with-neon

Steps:

1. Create a Neon project and Postgres database.
2. Copy the pooled connection string.
3. Set \`DATABASE_URL\` in the root \`.env\`, \`apps/api/.env\`, and the API Vercel project.
4. Run:

\`\`\`sh
pnpm db:generate
pnpm db:migrate
\`\`\`

### Clerk

Docs:

- https://docs.expo.dev/guides/using-clerk/
- https://clerk.com/docs/quickstarts/get-started-with-expo

Steps:

1. Create a Clerk application.
2. Set \`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY\` in \`apps/mobile/.env\`, the Mobile Vercel project, and EAS.
3. Set \`CLERK_PUBLISHABLE_KEY\` and \`CLERK_SECRET_KEY\` in \`apps/api/.env\` and the API Vercel project.
4. Set \`VITE_CLERK_PUBLISHABLE_KEY\` in \`apps/extension/.env\`.
5. Add allowed origins for local Expo web, the deployed Mobile Vercel domain, and the Chrome extension origin after the extension id is stable.
6. Configure native redirect/deep-link settings for the Expo scheme in \`apps/mobile/app.json\`.

### RevenueCat + Stripe

Docs:

- https://www.revenuecat.com/docs/web/overview
- https://www.revenuecat.com/docs/web/integrations/stripe
- https://docs.stripe.com/keys

Steps:

1. Create the RevenueCat project.
2. Create an entitlement named \`pro\`.
3. Create iOS, Android, and Web apps in RevenueCat.
4. Copy the public SDK keys into \`EXPO_PUBLIC_RC_API_KEY_IOS\`, \`EXPO_PUBLIC_RC_API_KEY_ANDROID\`, and \`EXPO_PUBLIC_RC_WEB_API_KEY\`.
5. Set \`EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro\`.
6. Connect Stripe as the RevenueCat web billing source.
7. Set \`RC_SECRET_API_KEY\` and \`RC_WEBHOOK_SECRET\` only in API envs.
8. Configure the RevenueCat webhook URL as \`https://<backend-domain>/webhooks/revenuecat\`.

### Cloudflare R2/CDN

Docs:

- https://developers.cloudflare.com/r2/get-started/s3/
- https://developers.cloudflare.com/r2/api/tokens/

Steps:

1. Create an R2 bucket.
2. Create a least-privilege API token for that bucket.
3. Set \`R2_ACCOUNT_ID\`, \`R2_ACCESS_KEY_ID\`, \`R2_SECRET_ACCESS_KEY\`, and \`R2_BUCKET\` only in API envs.
4. Use \`POST /storage/uploads\` to create signed upload URLs, then \`GET /storage/files/:key\` or \`DELETE /storage/files/:key\` for user-owned objects.
5. Configure a public bucket URL or custom domain if uploaded assets need public CDN delivery.

## Deploy

Vercel deployment is one Vercel project from this repository using Services:

- Framework preset: Services
- Root config: \`vercel.json\`
- Web service: \`apps/web\`, route \`/\`, build command \`pnpm build\`
- API service: \`apps/api\`, route \`/api/*\`, build command \`pnpm build\`, entrypoint \`src/index.ts\`

The root \`vercel.json\` owns public routing and keeps the deployment on one domain.

Native app deployment:

\`\`\`sh
cd apps/mobile
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init
pnpm dlx eas-cli@latest build --platform all --profile production
pnpm dlx eas-cli@latest submit --platform all --latest --profile production
\`\`\`

Desktop deployment artifacts:

\`\`\`sh
pnpm desktop:build:mac
pnpm desktop:build:win
pnpm desktop:build:linux
\`\`\`

Chrome extension deployment:

\`\`\`sh
pnpm extension:zip
\`\`\`

Upload \`apps/extension/.output/*-chrome.zip\` to the Chrome Web Store Developer Dashboard.

## Production Checklist

- Replace every \`*_placeholder\` value before production deploy.
- Keep server secrets out of web, mobile, desktop, extension, and EAS public envs.
- Confirm Clerk works on local web, Vercel web, iOS, Android, and the Chrome extension.
- Confirm RevenueCat returns the \`pro\` entitlement after Stripe web purchase and native store purchase.
- Confirm \`pnpm db:migrate\` has run against the production Neon database.
- Confirm R2 upload, signed URL retrieval, and deletion work from the deployed API domain.
- Confirm Vercel Services routes \`/\` to \`apps/web\` and \`/api/*\` to \`apps/api\`.
- Confirm the Chrome extension ZIP is tested locally with \`chrome://extensions\` before Chrome Web Store upload.

## Relevant Docs

- [Vercel Services](https://vercel.com/docs/services)
- [Expo web publishing](https://docs.expo.dev/guides/publishing-websites/)
- [Expo EAS](https://docs.expo.dev/eas/)
- [Expo store submissions](https://docs.expo.dev/deploy/submit-to-app-stores/)
- [Clerk with Expo](https://docs.expo.dev/guides/using-clerk/)
- [Clerk Expo quickstart](https://clerk.com/docs/quickstarts/get-started-with-expo)
- [Neon connection strings](https://neon.com/docs/get-started-with-neon/connect-neon)
- [Drizzle with Neon](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon)
- [RevenueCat Web](https://www.revenuecat.com/docs/web/overview)
- [RevenueCat Stripe Billing](https://www.revenuecat.com/docs/web/integrations/stripe)
- [Stripe API keys](https://docs.stripe.com/keys)
- [Cloudflare R2 S3 API](https://developers.cloudflare.com/r2/get-started/s3/)
- [Cloudflare R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/)
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
    name: '@shared/db',
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
      'db:studio': 'drizzle-kit studio',
      'db:check': 'drizzle-kit check',
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
  'billing_issue', 'billing_recovered',
] as const;
export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];

export type SubscriptionMetadata = {
  revenueCatProductId?: string;
  lastWebhookUpdate?: string;
  cancelReason?: string;
};

export type SubscriptionEventMetadata = {
  revenueCatEventType?: string;
  revenueCatProductId?: string;
  billingPeriod?: string;
  price?: { amount: number; currency: string };
  store?: string;
  transactionId?: string;
  reason?: string;
};

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  clerkUserId: text('clerk_user_id').unique(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  lastLoginAt: timestamp('last_login_at'),
  profileImageUrl: text('profile_image_url'),
  subscriptionTier: text('subscription_tier').notNull().default('free'),
  subscriptionStatus: text('subscription_status').notNull().default('active'),
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
    ['contracts', {
      exports: { '.': './src/index.ts' },
      dependencies: CONTRACTS_DEPENDENCIES.dependencies,
    }, `import { z } from 'zod';

export const ClientPlatformSchema = z.enum(['frontend', 'extension']);
export type ClientPlatform = z.infer<typeof ClientPlatformSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const AuthMeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    displayName: z.string(),
    imageUrl: z.string().url().nullable().optional(),
  }),
});
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

export const PricingResponseSchema = z.object({
  tiers: z.array(z.object({
    tier: z.enum(['free', 'pro']),
    displayName: z.string(),
    description: z.string(),
    priceMonthly: z.number().nullable(),
    priceYearly: z.number().nullable(),
    currency: z.string(),
    limits: z.object({
      dailyLimit: z.number().nullable(),
    }),
    paymentInfo: z.object({
      revenueCatEntitlementId: z.string(),
      revenueCatOfferingId: z.string(),
    }).optional(),
  })),
});
export type PricingResponse = z.infer<typeof PricingResponseSchema>;

export const SubscriptionEntitlementsSchema = z.object({
  pro: z.boolean(),
  inTrial: z.boolean(),
  trialEndsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  method: z.enum(['trialing', 'redeemed', 'paid']).nullable().optional(),
  managementUrl: z.string().url().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});
export type SubscriptionEntitlements = z.infer<typeof SubscriptionEntitlementsSchema>;

export const SignOutResponseSchema = z.object({
  success: z.boolean(),
});
export type SignOutResponse = z.infer<typeof SignOutResponseSchema>;

export const CreateUploadRequestSchema = z.object({
  fileName: z.string().min(1).max(200).optional(),
  contentType: z.string().min(1).max(200),
});
export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;

export const CreateUploadResponseSchema = z.object({
  objectKey: z.string(),
  uploadUrl: z.string().url(),
  expiresIn: z.number(),
  headers: z.record(z.string(), z.string()),
});
export type CreateUploadResponse = z.infer<typeof CreateUploadResponseSchema>;

export const StorageFileResponseSchema = z.object({
  objectKey: z.string(),
  downloadUrl: z.string().url(),
  expiresIn: z.number(),
});
export type StorageFileResponse = z.infer<typeof StorageFileResponseSchema>;
`],
    ['types', {
      exports: { '.': './src/index.ts' },
      dependencies: { '@shared/contracts': 'workspace:*' },
    }, `export type ApiEnvelope<T> = { data: T } | { error: string; message: string };
export type {
  AuthMeResponse,
  ClientPlatform,
  CreateUploadRequest,
  CreateUploadResponse,
  PricingResponse,
  SignOutResponse,
  StorageFileResponse,
  SubscriptionEntitlements,
} from '@shared/contracts';
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
    }, `import type { ZodType } from 'zod';
import { joinApiUrl } from '@shared/config';
import {
  AuthMeResponseSchema,
  CreateUploadResponseSchema,
  PricingResponseSchema,
  SignOutResponseSchema,
  StorageFileResponseSchema,
  SubscriptionEntitlementsSchema,
  type AuthMeResponse,
  type ClientPlatform,
  type CreateUploadRequest,
  type CreateUploadResponse,
  type PricingResponse,
  type SignOutResponse,
  type StorageFileResponse,
  type SubscriptionEntitlements,
} from '@shared/contracts';

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

  async request<T>(path: string, init: RequestInit = {}, schema?: ZodType<T>): Promise<T> {
    const token = await this.options.getToken?.();
    const headers = new Headers(init.headers);
    if (init.body != null) {
      headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
    }
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
    const data = await response.json();
    return schema ? schema.parse(data) : data as T;
  }

  getMe() {
    return this.request<AuthMeResponse>('/auth/me', {}, AuthMeResponseSchema);
  }

  getPricing() {
    return this.request<PricingResponse>('/subscriptions/pricing', {}, PricingResponseSchema);
  }

  getSubscriptionPricing() {
    return this.getPricing();
  }

  getSubscriptionEntitlements(options?: { refresh?: boolean }) {
    return this.request<SubscriptionEntitlements>(
      options?.refresh ? '/subscriptions/entitlements/me?refresh=true' : '/subscriptions/entitlements/me',
      {},
      SubscriptionEntitlementsSchema,
    );
  }

  signOut() {
    return this.request<SignOutResponse>('/auth/signout', {
      method: 'POST',
    }, SignOutResponseSchema);
  }

  deleteAccount() {
    return this.request<void>('/auth/account', {
      method: 'DELETE',
    });
  }

  createUpload(input: CreateUploadRequest) {
    return this.request<CreateUploadResponse>('/storage/uploads', {
      method: 'POST',
      body: JSON.stringify(input),
    }, CreateUploadResponseSchema);
  }

  getStorageFile(objectKey: string) {
    return this.request<StorageFileResponse>(
      \`/storage/files/\${encodeURIComponent(objectKey)}\`,
      {},
      StorageFileResponseSchema,
    );
  }

  deleteStorageFile(objectKey: string) {
    return this.request<void>(\`/storage/files/\${encodeURIComponent(objectKey)}\`, {
      method: 'DELETE',
    });
  }
}
`],
  ] as const;

  for (const [name, packageFields, source] of simplePackages) {
    const packageRoot = path.join(root, `packages/${name}`);
    writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({
      name: `@shared/${name}`,
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
  const webEnv = `NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***
NEXT_PUBLIC_RC_ENTITLEMENT_ID=pro
`;
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
${webEnv}${expoEnv}${extensionEnv}

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
  writeFile(path.join(root, '.vercelignore'), `apps/extension/.output
apps/extension/.wxt
apps/extension/dist
apps/mobile/.expo
apps/mobile/dist
apps/desktop/dist
apps/desktop/release
`);

  writeJsonFile(path.join(root, 'vercel.json'), {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    services: {
      web: {
        root: 'apps/web',
        framework: 'nextjs',
        buildCommand: 'pnpm build',
      },
      api: {
        root: 'apps/api',
        entrypoint: 'src/index.ts',
        buildCommand: 'pnpm build',
      },
    },
    rewrites: [
      {
        source: '/api/(.*)',
        destination: { service: 'api' },
      },
      {
        source: '/(.*)',
        destination: { service: 'web' },
      },
    ],
  });
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
        run: pnpm --filter ./apps/mobile exec expo install --check

      - name: Build Next.js web
        run: pnpm --filter ./apps/web build

      - name: Build Expo web
        run: pnpm --filter ./apps/mobile build:web

      - name: Test API
        run: pnpm --filter ./apps/api test

      - name: Build API
        run: pnpm --filter ./apps/api build

      - name: Build extension
        run: pnpm --filter ./apps/extension build

      - name: Zip extension
        run: pnpm --filter ./apps/extension zip

      - name: Build desktop
        run: pnpm --filter ./apps/desktop build

      - name: Build workspace
        run: pnpm build
`);
}

function writeFullstackRootFiles(root: string, options: InitOptions): void {
  const appFilters = [
    './apps/web',
    './apps/mobile',
    './apps/api',
    './apps/desktop',
    './apps/extension',
  ];
  const parallelFilters = appFilters.map((entry) => `--filter=${entry}`).join(' ');

  const scripts: Record<string, string> = {
    dev: `turbo dev --parallel ${parallelFilters}`,
    'dev:api': 'pnpm --filter ./apps/api dev',
    'dev:backend': 'pnpm --filter ./apps/api dev',
    build: 'turbo build',
    typecheck: 'turbo typecheck',
    verify: 'pnpm verify:web && pnpm verify:mobile && pnpm verify:api && pnpm verify:desktop && pnpm verify:extension',
    'verify:web': 'pnpm --filter ./apps/web typecheck && pnpm --filter ./apps/web build',
    'verify:mobile': 'pnpm --filter ./apps/mobile exec expo install --check && pnpm --filter ./apps/mobile build:web',
    'verify:frontend': 'pnpm verify:web && pnpm verify:mobile',
    'verify:api': 'pnpm --filter ./apps/api test && pnpm --filter ./apps/api build',
    'verify:backend': 'pnpm verify:api',
    'verify:desktop': 'pnpm --filter ./apps/desktop typecheck && pnpm --filter ./apps/desktop build',
    'verify:extension': 'pnpm --filter ./apps/extension typecheck && pnpm --filter ./apps/extension zip',
    'db:generate': 'pnpm --filter @shared/db db:generate',
    'db:migrate': 'pnpm --filter @shared/db db:migrate',
    'db:studio': 'pnpm --filter @shared/db db:studio',
    'db:check': 'pnpm --filter @shared/db db:check',
  };

  scripts['dev:web'] = 'pnpm --filter ./apps/web dev';
  scripts['dev:frontend'] = 'pnpm --filter ./apps/mobile dev';
  scripts['dev:mobile'] = 'pnpm --filter ./apps/mobile dev';
  scripts['dev:desktop'] = 'pnpm --filter ./apps/desktop dev';
  scripts['desktop:build'] = 'pnpm --filter ./apps/desktop build:all';
  scripts['desktop:build:mac'] = 'pnpm --filter ./apps/desktop build:mac';
  scripts['desktop:build:win'] = 'pnpm --filter ./apps/desktop build:win';
  scripts['desktop:build:linux'] = 'pnpm --filter ./apps/desktop build:linux';
  scripts['dev:extension'] = 'pnpm --filter ./apps/extension dev';
  scripts['extension:zip'] = 'pnpm --filter ./apps/extension zip';
  scripts['eas:build:ios'] = 'pnpm --dir apps/mobile dlx eas-cli@latest build --platform ios --profile production';
  scripts['eas:build:android'] = 'pnpm --dir apps/mobile dlx eas-cli@latest build --platform android --profile production';
  scripts['eas:build:all'] = 'pnpm --dir apps/mobile dlx eas-cli@latest build --platform all --profile production';
  scripts['wxt:build'] = 'pnpm --filter ./apps/extension build';
  scripts['wxt:zip'] = 'pnpm --filter ./apps/extension zip';

  writeRootPackageJson(root, options.projectName, scripts, ['apps/*', 'packages/*'], {
    devDependencies: ROOT_DEPENDENCIES.devDependencies,
  });
  writePnpmWorkspace(root, ['apps/*', 'packages/*']);
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
    'apps/mobile/node_modules',
    'apps/api/node_modules',
    'apps/web/node_modules',
    'apps/desktop/node_modules',
    'apps/extension/node_modules',
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
  anhedralPrint.step('Writing @shared/db, types, config, api-client');
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

  await scaffoldWeb(root, {
    projectName: options.projectName,
    displayName: options.displayName,
    githubOrg: null,
    frontendUrl: 'http://localhost:3000',
    skipInstall: options.skipInstall,
  });

  await scaffoldDesktop(root, {
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
    'vercel.json',
    'apps/web',
    'apps/mobile',
    'apps/api',
    'apps/desktop',
    'apps/extension',
    'packages/db',
    'packages/types',
    'packages/config',
    'packages/api-client',
  ];
}

async function scaffoldNextTemplate(root: string, options: InitOptions): Promise<string[]> {
  await scaffoldNextjs(root, {
    projectName: options.projectName,
    displayName: options.displayName,
    githubOrg: null,
    frontendUrl: 'http://localhost:3000',
    skipInstall: options.skipInstall,
  });

  return [
    'app',
    'db',
    'lib',
    'proxy.ts',
    'drizzle.config.ts',
    'PRODUCTION.md',
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

    const generatedPaths = options.template === 'next'
      ? await scaffoldNextTemplate(root, options)
      : await scaffoldFullstack(root, options);

    anhedralPrint.section('Project metadata');
    anhedralPrint.step('Writing skills guide, README, and stack.json');
    const skillCommands = options.template === 'next' ? [] : getSkillCommands();
    if (skillCommands.length > 0) {
      writeSkillsGuide(root, skillCommands);
    }

    const stack = normalizeStack(options, generatedPaths);
    if (options.template === 'fullstack') {
      writeRootDocs(root, options, stack);
      writeProductionGuide(root, options);
    }
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
    if (options.template === 'next') {
      console.log('  cp .env.example .env.local');
      console.log('  pnpm db:generate && pnpm db:migrate');
      console.log('  pnpm typecheck');
      console.log('  pnpm dev');
    } else {
      console.log('  cp .env.example .env');
      console.log('  cp apps/extension/.env.example apps/extension/.env');
      console.log('  pnpm db:generate && pnpm db:migrate');
      console.log('  pnpm verify');
      console.log('  pnpm dev:web');
      console.log('  pnpm dev:api');
      console.log('  pnpm dev:mobile');
      console.log('  pnpm dev:desktop');
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

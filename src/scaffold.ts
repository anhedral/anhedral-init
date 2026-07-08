import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import { anhedralPrint } from './print.js';
import { appendGitignore, exec, writeFile } from './util.js';
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
import type { SupportedModule } from './cli.js';

export type FrontendMode = 'expo';
export type AuthMode = 'clerk';
export type PaymentsMode = 'revenuecat_stripe' | 'stripe';

export type AppSelections = {
  web: boolean;
  mobile: boolean;
  api: boolean;
  desktop: boolean;
  extension: boolean;
};

export type FeatureSelections = {
  database: boolean;
  auth: boolean;
  billing: boolean;
  storage: boolean;
  nativeSubscriptions: boolean;
};

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
  apps: AppSelections;
  features: FeatureSelections;
  auth: AuthMode;
  payments: PaymentsMode;
  db: 'neon';
  orm: 'drizzle';
  storage: 'r2';
  api: 'fastify' | 'nextjs_route_handlers';
  skipInstall: boolean;
  toolchainChannel: ToolchainChannel;
}

export interface AddOptions {
  modules: SupportedModule[];
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
  mode: 'modular';
  project_name: string;
  display_name: string;
  apps: AppSelections;
  features: FeatureSelections;
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

export type AnhedralManifest = {
  version: string;
  apps: AppSelections;
  features: FeatureSelections;
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
    mode: 'modular',
    project_name: options.projectName,
    display_name: options.displayName,
    apps: options.apps,
    features: options.features,
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
  const selectedApps = [
    options.apps.web ? 'Web: Next.js + shadcn/ui' : null,
    options.apps.mobile ? 'Mobile: Expo + React Native Reusables' : null,
    options.apps.api ? 'API: Fastify' : null,
    options.apps.desktop ? 'Desktop: Electron + shadcn/ui' : null,
    options.apps.extension ? 'Extension: WXT Chrome extension' : null,
  ].filter(Boolean).map((entry) => `- ${entry}`).join('\n') || '- No app surfaces selected';
  const selectedFeatures = [
    options.features.database ? `Database: ${options.db} + ${options.orm}` : null,
    options.features.auth ? `Auth: ${options.auth}` : null,
    options.features.billing ? 'Billing: RevenueCat + Stripe' : null,
    options.features.storage ? `Storage: ${options.storage}` : null,
    options.features.nativeSubscriptions ? 'Native subscriptions: RevenueCat' : null,
  ].filter(Boolean).map((entry) => `- ${entry}`).join('\n') || '- No backend features selected';
  const selectedProviderNames = [
    options.features.auth ? 'Clerk' : null,
    options.features.billing || options.features.nativeSubscriptions ? 'RevenueCat/Stripe' : null,
    options.features.database ? 'Neon' : null,
    options.features.storage ? 'R2' : null,
  ].filter(Boolean).join(', ') || 'the selected providers';
  const firstRunCommands = [
    'pnpm install',
    'cp .env.example .env',
    options.apps.extension ? 'cp apps/extension/.env.example apps/extension/.env' : null,
    options.features.database ? 'pnpm db:generate' : null,
    options.features.database ? 'pnpm db:migrate' : null,
    'pnpm verify',
    options.apps.web ? 'pnpm dev:web' : null,
    options.apps.api ? 'pnpm dev:api' : null,
    options.apps.mobile ? 'pnpm dev:mobile' : null,
    options.apps.desktop ? 'pnpm dev:desktop' : null,
    options.apps.extension ? 'pnpm dev:extension' : null,
  ].filter(Boolean).join('\n');
  const verifyCommands = [
    'pnpm verify',
    options.apps.web ? 'pnpm verify:web' : null,
    options.apps.mobile ? 'pnpm verify:mobile' : null,
    options.apps.api ? 'pnpm verify:api' : null,
    options.apps.desktop ? 'pnpm verify:desktop' : null,
    options.apps.extension ? 'pnpm verify:extension' : null,
  ].filter(Boolean).join('\n');
  const platformBuildCommands = [
    options.apps.mobile ? 'pnpm eas:build:ios' : null,
    options.apps.mobile ? 'pnpm eas:build:android' : null,
    options.apps.desktop ? 'pnpm desktop:build' : null,
    options.apps.extension ? 'pnpm extension:zip' : null,
  ].filter(Boolean).join('\n') || '# No platform build commands were generated for the selected app surfaces.';
  const providerSetup = [
    options.features.database ? `### Neon database

- Create a Neon project and database: https://neon.com/docs/get-started-with-neon/connect-neon
- Put the pooled connection string in \`DATABASE_URL\` in \`.env\`${options.apps.api ? ', `apps/api/.env`, and the API Vercel service' : ''}.
- Run \`pnpm db:generate\` and \`pnpm db:migrate\` after \`DATABASE_URL\` is real.` : null,
    options.features.auth ? `### Clerk auth

- Expo setup: https://docs.expo.dev/guides/using-clerk/
- Clerk Expo quickstart: https://clerk.com/docs/quickstarts/get-started-with-expo
${options.apps.mobile ? '- Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/mobile/.env` and EAS.\n' : ''}${options.apps.web ? '- Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in the web app env.\n' : ''}${options.apps.api ? '- Set `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `apps/api/.env` and the API Vercel service.\n' : ''}${options.apps.extension ? '- Set `VITE_CLERK_PUBLISHABLE_KEY` in `apps/extension/.env`.\n' : ''}- Add allowed origins for the selected clients.` : null,
    (options.features.billing || options.features.nativeSubscriptions) ? `### RevenueCat + Stripe

- RevenueCat Web overview: https://www.revenuecat.com/docs/web/overview
- RevenueCat Stripe Billing integration: https://www.revenuecat.com/docs/web/integrations/stripe
- Stripe API keys: https://docs.stripe.com/keys
- Create an entitlement named \`pro\`.
${options.apps.mobile ? '- Create iOS and Android apps in RevenueCat and set `EXPO_PUBLIC_RC_API_KEY_IOS`, `EXPO_PUBLIC_RC_API_KEY_ANDROID`, and `EXPO_PUBLIC_RC_ENTITLEMENT_ID`.\n' : ''}${options.apps.web ? '- Create a Web app in RevenueCat and set `NEXT_PUBLIC_RC_WEB_API_KEY` for the web client.\n' : ''}${options.apps.api ? '- Set `RC_SECRET_API_KEY` and `RC_WEBHOOK_SECRET` only in API envs.\n- Point the RevenueCat webhook to `https://<backend-domain>/webhooks/revenuecat`.\n' : ''}` : null,
    options.features.storage ? `### Cloudflare R2/CDN

- R2 S3-compatible setup: https://developers.cloudflare.com/r2/get-started/s3/
- R2 API tokens: https://developers.cloudflare.com/r2/api/tokens/
- Create a bucket and least-privilege API token.
- Set \`R2_ACCOUNT_ID\`, \`R2_ACCESS_KEY_ID\`, \`R2_SECRET_ACCESS_KEY\`, and \`R2_BUCKET\`${options.apps.api ? ' only in API envs' : ''}.` : null,
    (options.apps.web || options.apps.api) ? `### Vercel Services

- Services docs: https://vercel.com/docs/services
- Import this repository once as one Vercel project and select the Services framework preset.
${options.apps.web ? '- Web service: `apps/web`, route `/`, build command `pnpm build`.\n' : ''}${options.apps.api ? '- API service: `apps/api`, route `/api/*`, build command `pnpm build`, entrypoint `apps/api/src/index.ts`.\n' : ''}` : null,
    options.apps.mobile ? `### EAS native app builds

- EAS docs: https://docs.expo.dev/eas/
- Store submission docs: https://docs.expo.dev/deploy/submit-to-app-stores/
- Use \`apps/mobile\` as the Expo project root for iOS and Android builds.` : null,
    options.apps.desktop ? `### Desktop app builds

- Build all desktop targets with \`pnpm desktop:build\`.
- Build one target with \`pnpm desktop:build:mac\`, \`pnpm desktop:build:win\`, or \`pnpm desktop:build:linux\`.` : null,
    options.apps.extension ? `### Chrome Web Store

- WXT publishing: https://wxt.dev/guide/essentials/publishing.html
- Chrome publishing: https://developer.chrome.com/docs/webstore/publish
- Build with \`pnpm extension:zip\`, then upload \`apps/extension/.output/*-chrome.zip\` in the Chrome Web Store Developer Dashboard.` : null,
  ].filter(Boolean).join('\n\n') || 'No external provider setup is required for the selected modules.';

  writeFile(path.join(root, 'README.md'), `# ${options.displayName}

Generated by anhedral.

## Stack

Selected app surfaces:

${selectedApps}

Selected backend features:

${selectedFeatures}

- Shared packages: \`packages/*\`
- API: ${options.api ?? 'framework-native'}
- Toolchain: ${toolchainLine}
- Project manifest: recorded in \`anhedral.json\`
- Dependency manifest: recorded in \`stack.json\`

## Generated paths

${generatedPaths}

## First Run

\`\`\`bash
${firstRunCommands}
\`\`\`

The generated env files intentionally contain placeholder provider values. That is enough to inspect the project structure and run backend smoke tests, but selected provider features need real keys before they behave like production.

For a provider-free backend smoke test, keep \`ANHEDRAL_DEMO=true\` in \`apps/api/.env\`. Demo mode returns a signed-in sample user and active subscription responses without Clerk, RevenueCat, or Stripe credentials. It is for local development only.

## Provider Setup

${providerSetup}

## Setup Notes

1. Copy \`.env.example\` into the runtime env files your apps need and fill in provider values.
2. Review \`install-skills.sh\` and run the listed skill commands manually so you can choose scope and agent targets.
3. Add the real provider configuration for ${selectedProviderNames} where the scaffolded helper files indicate.
4. Use \`stack.json\` when debugging generated projects; it records the verified dependency manifest used by this init run.
5. Review \`PRODUCTION.md\` before connecting live provider projects.
6. Run database generation and migrations from the shared DB package:

\`\`\`bash
${options.features.database ? 'pnpm db:generate\npnpm db:migrate' : '# Database scripts are generated when the db module is selected.'}
\`\`\`

Run deployment readiness checks before pushing:

\`\`\`bash
${verifyCommands}
\`\`\`

7. Build platform artifacts separately:

\`\`\`bash
${platformBuildCommands}
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

function manifestFromOptions(options: Pick<InitOptions, 'apps' | 'features'>): AnhedralManifest {
  return {
    version: '0.1.0',
    apps: options.apps,
    features: options.features,
  };
}

function writeAnhedralManifest(root: string, manifest: AnhedralManifest): void {
  writeJsonFile(path.join(root, 'anhedral.json'), manifest);
}

function readAnhedralManifest(root: string): AnhedralManifest {
  const filePath = path.join(root, 'anhedral.json');
  if (!existsSync(filePath)) {
    throw new Error('anhedral.json was not found. Run anhedral init before anhedral add.');
  }

  return JSON.parse(readFileSync(filePath, 'utf8')) as AnhedralManifest;
}

function selectedAppFilters(apps: AppSelections): string[] {
  const filters: string[] = [];
  if (apps.web) filters.push('./apps/web');
  if (apps.mobile) filters.push('./apps/mobile');
  if (apps.api) filters.push('./apps/api');
  if (apps.desktop) filters.push('./apps/desktop');
  if (apps.extension) filters.push('./apps/extension');
  return filters;
}

function generatedPathsForOptions(options: Pick<InitOptions, 'apps'>): string[] {
  const generatedPaths = [
    'anhedral.json',
    '.github/workflows/ci.yml',
    'PRODUCTION.md',
    'vercel.json',
    'packages/db',
    'packages/types',
    'packages/config',
    'packages/api-client',
  ];

  if (options.apps.api) generatedPaths.push('apps/api');
  if (options.apps.mobile) generatedPaths.push('apps/mobile');
  if (options.apps.web) generatedPaths.push('apps/web');
  if (options.apps.desktop) generatedPaths.push('apps/desktop');
  if (options.apps.extension) generatedPaths.push('apps/extension');

  return generatedPaths;
}

function optionsFromManifest(root: string, manifest: AnhedralManifest, addOptions: AddOptions): InitOptions {
  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = existsSync(packageJsonPath)
    ? JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string }
    : {};
  const projectName = packageJson.name ?? path.basename(root).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

  return {
    projectName,
    displayName: path.basename(root) || 'Anhedral App',
    apps: manifest.apps,
    features: manifest.features,
    auth: 'clerk',
    payments: 'revenuecat_stripe',
    db: 'neon',
    orm: 'drizzle',
    storage: 'r2',
    api: 'fastify',
    skipInstall: addOptions.skipInstall,
    toolchainChannel: addOptions.toolchainChannel,
  };
}

function updateManifestForModule(manifest: AnhedralManifest, moduleName: SupportedModule): boolean {
  switch (moduleName) {
    case 'web':
    case 'mobile':
    case 'api':
    case 'desktop':
    case 'extension': {
      if (manifest.apps[moduleName]) return false;
      manifest.apps[moduleName] = true;
      return true;
    }
    case 'db':
      if (manifest.features.database) return false;
      manifest.features.database = true;
      return true;
    case 'auth':
      if (manifest.features.auth) return false;
      manifest.features.auth = true;
      return true;
    case 'billing':
      if (manifest.features.billing) return false;
      manifest.features.billing = true;
      return true;
    case 'storage':
      if (manifest.features.storage) return false;
      manifest.features.storage = true;
      return true;
    case 'native-subscriptions':
      if (manifest.features.nativeSubscriptions) return false;
      manifest.features.nativeSubscriptions = true;
      return true;
  }
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

function writeRootEnvExample(root: string, options: InitOptions): void {
  const frontendUrl = 'http://localhost:8081';
  const appBlocks = [
    options.apps.web ? `# Web
NEXT_PUBLIC_API_URL=/api
${options.features.auth ? 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***\n' : ''}${options.features.billing ? 'NEXT_PUBLIC_RC_ENTITLEMENT_ID=pro\nNEXT_PUBLIC_RC_WEB_API_KEY=\n' : ''}` : null,
    options.apps.mobile ? `# Mobile
EXPO_PUBLIC_API_URL=http://localhost:8787
${options.features.auth ? 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***\n' : ''}${options.features.nativeSubscriptions || options.features.billing ? 'EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro\nEXPO_PUBLIC_RC_API_KEY_IOS=\nEXPO_PUBLIC_RC_API_KEY_ANDROID=\nEXPO_PUBLIC_RC_WEB_API_KEY=\n' : ''}` : null,
    options.apps.extension ? `# Extension
VITE_API_URL=http://localhost:8787
VITE_WEBSITE_URL=${frontendUrl}
${options.features.auth ? 'VITE_CLERK_PUBLISHABLE_KEY=pk_test_***\n' : ''}VITE_CRX_PUBLIC_KEY=
${options.features.billing ? 'VITE_RC_BILLING_URL=\n' : ''}` : null,
  ].filter(Boolean).join('\n');
  const serverBlocks = [
    '# Server',
    'PORT=8787',
    options.features.database ? 'DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require' : null,
    options.features.auth ? '\n# Clerk\nCLERK_PUBLISHABLE_KEY=pk_test_***\nCLERK_SECRET_KEY=sk_test_***' : null,
    options.features.storage ? '\n# Cloudflare R2\nR2_ACCOUNT_ID=\nR2_ACCESS_KEY_ID=\nR2_SECRET_ACCESS_KEY=\nR2_BUCKET=' : null,
    options.features.billing || options.features.nativeSubscriptions ? `\n# RevenueCat
RC_SECRET_API_KEY=
RC_WEBHOOK_SECRET=
RC_ENTITLEMENT_ID=pro
RC_OFFERING_ID=default` : null,
  ].filter(Boolean).join('\n');

  writeFile(path.join(root, '.env.example'), `# Apps
FRONTEND_URL=${frontendUrl}
ANHEDRAL_DEMO=false
${appBlocks}

${serverBlocks}
`);
}

function writeRootVercelFiles(root: string, options: InitOptions): void {
  writeFile(path.join(root, '.vercelignore'), `apps/extension/.output
apps/extension/.wxt
apps/extension/dist
apps/mobile/.expo
apps/mobile/dist
apps/desktop/dist
apps/desktop/release
`);

  const services: Record<string, Record<string, string>> = {};
  const rewrites: Array<{ source: string; destination: { service: string } }> = [];

  if (options.apps.web) {
    services.web = {
      root: 'apps/web',
      framework: 'nextjs',
      buildCommand: 'pnpm build',
    };
    rewrites.push({
      source: '/(.*)',
      destination: { service: 'web' },
    });
  }

  if (options.apps.api) {
    services.api = {
      root: 'apps/api',
      entrypoint: 'src/index.ts',
      buildCommand: 'pnpm build',
    };
    rewrites.unshift({
      source: '/api/(.*)',
      destination: { service: 'api' },
    });
  }

  writeJsonFile(path.join(root, 'vercel.json'), {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    services,
    rewrites,
  });
}

function writeGeneratedCiWorkflow(root: string, options: InitOptions): void {
  const moduleSteps = [
    options.apps.mobile ? `      - name: Check Expo dependency alignment
        run: pnpm --filter ./apps/mobile exec expo install --check

      - name: Build Expo web
        run: pnpm --filter ./apps/mobile build:web
` : '',
    options.apps.web ? `      - name: Build Next.js web
        run: pnpm --filter ./apps/web build
` : '',
    options.apps.api ? `      - name: Test API
        run: pnpm --filter ./apps/api test

      - name: Build API
        run: pnpm --filter ./apps/api build
` : '',
    options.apps.extension ? `      - name: Build extension
        run: pnpm --filter ./apps/extension build

      - name: Zip extension
        run: pnpm --filter ./apps/extension zip
` : '',
    options.apps.desktop ? `      - name: Build desktop
        run: pnpm --filter ./apps/desktop build
` : '',
  ].filter(Boolean).join('\n');

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

${moduleSteps}
      - name: Build workspace
        run: pnpm build
`);
}

function writeFullstackRootFiles(root: string, options: InitOptions): void {
  const appFilters = selectedAppFilters(options.apps);
  const parallelFilters = appFilters.map((entry) => `--filter=${entry}`).join(' ');

  const scripts: Record<string, string> = {
    dev: appFilters.length > 0 ? `turbo dev --parallel ${parallelFilters}` : 'echo "No app surfaces selected."',
    build: 'turbo build',
    typecheck: 'turbo typecheck',
  };

  const verifyScripts: string[] = [];
  if (options.apps.web) {
    scripts['dev:web'] = 'pnpm --filter ./apps/web dev';
    scripts['verify:web'] = 'pnpm --filter ./apps/web typecheck && pnpm --filter ./apps/web build';
    verifyScripts.push('pnpm verify:web');
  }
  if (options.apps.mobile) {
    scripts['dev:frontend'] = 'pnpm --filter ./apps/mobile dev';
    scripts['dev:mobile'] = 'pnpm --filter ./apps/mobile dev';
    scripts['verify:mobile'] = 'pnpm --filter ./apps/mobile exec expo install --check && pnpm --filter ./apps/mobile build:web';
    scripts['eas:build:ios'] = 'pnpm --dir apps/mobile dlx eas-cli@latest build --platform ios --profile production';
    scripts['eas:build:android'] = 'pnpm --dir apps/mobile dlx eas-cli@latest build --platform android --profile production';
    scripts['eas:build:all'] = 'pnpm --dir apps/mobile dlx eas-cli@latest build --platform all --profile production';
    verifyScripts.push('pnpm verify:mobile');
  }
  if (options.apps.api) {
    scripts['dev:api'] = 'pnpm --filter ./apps/api dev';
    scripts['dev:backend'] = 'pnpm --filter ./apps/api dev';
    scripts['verify:api'] = 'pnpm --filter ./apps/api test && pnpm --filter ./apps/api build';
    scripts['verify:backend'] = 'pnpm verify:api';
    verifyScripts.push('pnpm verify:api');
  }
  if (options.apps.desktop) {
    scripts['dev:desktop'] = 'pnpm --filter ./apps/desktop dev';
    scripts['desktop:build'] = 'pnpm --filter ./apps/desktop build:all';
    scripts['desktop:build:mac'] = 'pnpm --filter ./apps/desktop build:mac';
    scripts['desktop:build:win'] = 'pnpm --filter ./apps/desktop build:win';
    scripts['desktop:build:linux'] = 'pnpm --filter ./apps/desktop build:linux';
    scripts['verify:desktop'] = 'pnpm --filter ./apps/desktop typecheck && pnpm --filter ./apps/desktop build';
    verifyScripts.push('pnpm verify:desktop');
  }
  if (options.apps.extension) {
    scripts['dev:extension'] = 'pnpm --filter ./apps/extension dev';
    scripts['extension:zip'] = 'pnpm --filter ./apps/extension zip';
    scripts['wxt:build'] = 'pnpm --filter ./apps/extension build';
    scripts['wxt:zip'] = 'pnpm --filter ./apps/extension zip';
    scripts['verify:extension'] = 'pnpm --filter ./apps/extension typecheck && pnpm --filter ./apps/extension zip';
    verifyScripts.push('pnpm verify:extension');
  }
  if (options.apps.web || options.apps.mobile) {
    scripts['verify:frontend'] = [options.apps.web ? 'pnpm verify:web' : null, options.apps.mobile ? 'pnpm verify:mobile' : null].filter(Boolean).join(' && ');
  }
  if (options.features.database) {
    scripts['db:generate'] = 'pnpm --filter @shared/db db:generate';
    scripts['db:migrate'] = 'pnpm --filter @shared/db db:migrate';
    scripts['db:studio'] = 'pnpm --filter @shared/db db:studio';
    scripts['db:check'] = 'pnpm --filter @shared/db db:check';
  }
  scripts.verify = verifyScripts.length > 0 ? verifyScripts.join(' && ') : 'pnpm typecheck';

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
  writeRootEnvExample(root, options);
  writeRootVercelFiles(root, options);
  writeGeneratedCiWorkflow(root, options);
}

async function scaffoldFullstack(root: string, options: InitOptions): Promise<string[]> {
  const generatedPaths = generatedPathsForOptions(options);

  anhedralPrint.section('Workspace root');
  anhedralPrint.step('Writing root config (package.json, pnpm workspace, env, vercel)');
  writeFullstackRootFiles(root, options);
  anhedralPrint.done('Root config written');

  anhedralPrint.section('Shared packages');
  anhedralPrint.step('Writing @shared/db, types, config, api-client');
  writeSharedPackages(root);
  anhedralPrint.done('Shared packages written');

  const frontendUrl = 'http://localhost:8081';
  if (options.apps.api) {
    await scaffoldBackend(root, {
      projectName: options.projectName,
      displayName: options.displayName,
      githubOrg: null,
      frontendUrl,
      skipInstall: options.skipInstall,
    });
  }

  if (options.apps.mobile) {
    await scaffoldFrontend(root, {
      projectName: options.projectName,
      displayName: options.displayName,
      githubOrg: null,
      frontendUrl,
      skipInstall: options.skipInstall,
    });
  }

  if (options.apps.web) {
    await scaffoldWeb(root, {
      projectName: options.projectName,
      displayName: options.displayName,
      githubOrg: null,
      frontendUrl: 'http://localhost:3000',
      skipInstall: options.skipInstall,
    });
  }

  if (options.apps.desktop) {
    await scaffoldDesktop(root, {
      projectName: options.projectName,
      displayName: options.displayName,
      githubOrg: null,
      frontendUrl,
      skipInstall: options.skipInstall,
    });
  }

  if (options.apps.extension) {
    await scaffoldExtension(root, {
      projectName: options.projectName,
      displayName: options.displayName,
      githubOrg: null,
      frontendUrl,
      skipInstall: options.skipInstall,
    });
  }

  return generatedPaths;
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
    if (!options.skipInstall) {
      anhedralPrint.section('Workspace install');
      anhedralPrint.step('Installing workspace dependencies');
      exec('pnpm install --no-frozen-lockfile', root);
      anhedralPrint.done('Workspace dependencies installed');
    }

    anhedralPrint.section('Project metadata');
    anhedralPrint.step('Writing skills guide, README, stack.json, and anhedral.json');
    const skillCommands = getSkillCommands();
    if (skillCommands.length > 0) {
      writeSkillsGuide(root, skillCommands);
    }

    const stack = normalizeStack(options, generatedPaths);
    writeRootDocs(root, options, stack);
    writeProductionGuide(root, options);
    writeStackFile(root, stack);
    writeAnhedralManifest(root, manifestFromOptions(options));
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
    if (options.apps.extension) {
      console.log('  cp apps/extension/.env.example apps/extension/.env');
    }
    if (options.features.database) {
      console.log('  pnpm db:generate && pnpm db:migrate');
    }
    console.log('  pnpm verify');
    if (options.apps.web) {
      console.log('  pnpm dev:web');
    }
    if (options.apps.api) {
      console.log('  pnpm dev:api');
    }
    if (options.apps.mobile) {
      console.log('  pnpm dev:mobile');
    }
    if (options.apps.desktop) {
      console.log('  pnpm dev:desktop');
    }
    if (options.apps.extension) {
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

export async function scaffoldAddModules(addOptions: AddOptions): Promise<void> {
  const root = path.resolve(process.cwd());
  const manifest = readAnhedralManifest(root);
  const requestedMissing = addOptions.modules.filter((moduleName) => updateManifestForModule(manifest, moduleName));

  if (requestedMissing.length === 0) {
    anhedralPrint.info('All requested modules are already installed.');
    return;
  }

  const options = optionsFromManifest(root, manifest, addOptions);
  const previousToolchain = env.ANHEDRAL_TOOLCHAIN;
  env.ANHEDRAL_TOOLCHAIN = addOptions.toolchainChannel;

  try {
    anhedralPrint.banner(`Adding ${requestedMissing.join(', ')} to ${root}`);

    anhedralPrint.section('Workspace root');
    anhedralPrint.step('Refreshing root config for selected modules');
    writeFullstackRootFiles(root, options);
    anhedralPrint.done('Root config refreshed');

    const frontendUrl = 'http://localhost:8081';
    const generatedPaths: string[] = [];

    if (requestedMissing.includes('api')) {
      await scaffoldBackend(root, {
        projectName: options.projectName,
        displayName: options.displayName,
        githubOrg: null,
        frontendUrl,
        skipInstall: options.skipInstall,
      });
      generatedPaths.push('apps/api');
    }

    if (requestedMissing.includes('mobile')) {
      await scaffoldFrontend(root, {
        projectName: options.projectName,
        displayName: options.displayName,
        githubOrg: null,
        frontendUrl,
        skipInstall: options.skipInstall,
      });
      generatedPaths.push('apps/mobile');
    }

    if (requestedMissing.includes('web')) {
      await scaffoldWeb(root, {
        projectName: options.projectName,
        displayName: options.displayName,
        githubOrg: null,
        frontendUrl: 'http://localhost:3000',
        skipInstall: options.skipInstall,
      });
      generatedPaths.push('apps/web');
    }

    if (requestedMissing.includes('desktop')) {
      await scaffoldDesktop(root, {
        projectName: options.projectName,
        displayName: options.displayName,
        githubOrg: null,
        frontendUrl,
        skipInstall: options.skipInstall,
      });
      generatedPaths.push('apps/desktop');
    }

    if (requestedMissing.includes('extension')) {
      await scaffoldExtension(root, {
        projectName: options.projectName,
        displayName: options.displayName,
        githubOrg: null,
        frontendUrl,
        skipInstall: options.skipInstall,
      });
      generatedPaths.push('apps/extension');
    }

    if (!options.skipInstall) {
      anhedralPrint.section('Workspace install');
      anhedralPrint.step('Installing workspace dependencies');
      exec('pnpm install --no-frozen-lockfile', root);
      anhedralPrint.done('Workspace dependencies installed');
    }

    anhedralPrint.section('Project metadata');
    anhedralPrint.step('Updating README, PRODUCTION.md, anhedral.json, and stack.json');
    const stack = normalizeStack(options, generatedPathsForOptions(options));
    writeRootDocs(root, options, stack);
    writeProductionGuide(root, options);
    writeAnhedralManifest(root, manifest);
    writeStackFile(root, stack);
    anhedralPrint.done('Project metadata updated');

    for (const generatedPath of generatedPaths) {
      anhedralPrint.done(generatedPath);
    }
  } finally {
    if (previousToolchain == null) {
      delete env.ANHEDRAL_TOOLCHAIN;
    } else {
      env.ANHEDRAL_TOOLCHAIN = previousToolchain;
    }
  }
}

# Anhedral Scaffold Workflow

This file is the single-document workflow for the Anhedral init scaffold. It replaces a long CLI checklist with one ordered runbook that explains what gets generated, which commands are used, which provider accounts must be configured, and what code/config files the scaffold writes.

The current scaffold is intentionally one stack: Expo + React Native Reusables for web/iOS/Android, Fastify for the API, WXT for the Chrome extension, pnpm workspaces + Turborepo for the monorepo, Neon + Drizzle for Postgres, Clerk for auth, RevenueCat + Stripe for subscriptions, Cloudflare R2 for object storage, Vercel for web/API deploys, and EAS for native builds.

## Source Documentation

Use these upstream docs when setting up or debugging the generated app. These links were verified while writing this workflow.

| Area | Documentation | Why it matters |
| --- | --- | --- |
| Expo web app | [Expo CLI](https://docs.expo.dev/more/expo-cli/), [Publishing Expo websites](https://docs.expo.dev/guides/publishing-websites/) | The frontend uses Expo Router and exports web output with `expo export --platform web`. |
| Expo native builds | [EAS docs](https://docs.expo.dev/eas/), [Store submissions](https://docs.expo.dev/deploy/submit-to-app-stores/) | Native iOS and Android builds are produced from `Frontend` through EAS. |
| React Native Reusables | [Authentication block](https://reactnativereusables.com/docs/blocks/authentication) | The frontend starts from the `@react-native-reusables/cli init -t clerk-auth` template. |
| Clerk Expo auth | [Expo Clerk guide](https://docs.expo.dev/guides/using-clerk/), [Clerk Expo quickstart](https://clerk.com/docs/quickstarts/get-started-with-expo) | The frontend uses `@clerk/expo`; backend and extension also validate/use Clerk sessions. |
| Clerk Chrome extension auth | [Clerk Chrome Extension SDK](https://clerk.com/docs/references/chrome-extension/overview) | The extension uses `@clerk/chrome-extension` in the side panel and background script. |
| Fastify API | [Fastify TypeScript reference](https://fastify.dev/docs/latest/Reference/TypeScript/), [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify/) | The backend is a typed Fastify API deployed as a Vercel backend project. |
| Neon + Drizzle | [Neon connection docs](https://neon.com/docs/get-started-with-neon/connect-neon), [Drizzle with Neon](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon) | Shared package `@shared/db` owns schema, migrations, and Neon access. |
| Cloudflare R2 | [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/), [R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) | The backend signs upload/download/delete URLs using the AWS S3 SDK against R2. |
| RevenueCat + Stripe | [RevenueCat Web](https://www.revenuecat.com/docs/web/overview), [RevenueCat Stripe Billing](https://www.revenuecat.com/docs/web/integrations/stripe), [RevenueCat API keys](https://www.revenuecat.com/docs/projects/authentication), [Stripe API keys](https://docs.stripe.com/keys) | RevenueCat is the entitlement source; Stripe backs web billing. |
| Vercel monorepo deploys | [Vercel monorepos](https://vercel.com/docs/monorepos), [Monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq) | The same repo is imported twice, once with root `Frontend` and once with root `Backend`; workspace packages must resolve outside each root. |
| WXT extension | [WXT docs](https://wxt.dev/), [WXT publishing](https://wxt.dev/guide/essentials/publishing.html), [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/sidePanel/), [Chrome Web Store publishing](https://developer.chrome.com/docs/webstore/publish) | The extension is a WXT React side-panel extension that builds and zips separately from Vercel. |
| pnpm + Turborepo | [pnpm workspace docs](https://pnpm.io/pnpm-workspace_yaml), [Turborepo tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks), [turbo.json reference](https://turborepo.dev/docs/reference/configuration) | The generated root package coordinates workspace scripts through pnpm filters and Turbo. |

## 1. Run The Init

Run Anhedral from an empty directory. The CLI refuses to scaffold into a directory that contains anything other than `.git`, `.gitignore`, or `.DS_Store`.

```bash
pnpm dlx anhedral@latest init

# npm alternative
npx anhedral@latest init

# deterministic file generation before installing dependencies
pnpm dlx anhedral@latest init --skip-install
pnpm install

# use latest upstream scaffold tools instead of the verified stable toolchain
pnpm dlx anhedral@latest init --toolchain latest

# environment alternatives
ANHEDRAL_SKIP_INSTALL=1 pnpm dlx anhedral@latest init
ANHEDRAL_TOOLCHAIN=latest pnpm dlx anhedral@latest init
```

Default behavior uses the stable toolchain recorded by the CLI release. In this repo that stable manifest is verified at `2026-04-26` and pins `@react-native-reusables/cli@0.7.1`, `wxt@0.20.25`, and `shadcn@4.5.0`. The generated root package records the full dependency manifest in `stack.json`.

## 2. What The CLI Does

The CLI derives names from the current directory:

- `projectName`: lowercased, URL/package-safe directory name, falling back to `anhedral-app`.
- `displayName`: original directory basename, falling back to `Anhedral App`.

It then generates one pnpm monorepo:

```txt
.
├─ Frontend/        Expo + React Native Reusables app for web/iOS/Android
├─ Backend/         Fastify API for auth, subscriptions, storage, and webhooks
├─ Extension/       WXT Chrome side-panel extension
├─ packages/
│  ├─ api-client/   shared typed API client
│  ├─ config/       shared URL/config helpers
│  ├─ contracts/    shared Zod request/response schemas
│  ├─ db/           Drizzle schema, Neon client, migrations, queries
│  └─ types/        shared exported TypeScript types
├─ .github/workflows/ci.yml
├─ .env.example
├─ .vercelignore
├─ install-skills.sh
├─ package.json
├─ pnpm-workspace.yaml
├─ PRODUCTION.md
├─ README.md
├─ stack.json
└─ turbo.json
```

## 3. Scaffold Commands Used Internally

The CLI uses these scaffold/install commands as part of generation. With `--skip-install`, dependency manifests are still written but installs are skipped where supported.

```bash
# Frontend starter
pnpm dlx @react-native-reusables/cli@0.7.1 init -t clerk-auth
# prompted answers:
# - project name: <projectName>
# - install dependencies: n
# - initialize git: n

# Frontend dependency alignment, unless --skip-install
pnpm install --no-frozen-lockfile
pnpm exec expo install --fix --pnpm
pnpm add react-native-purchases@10.1.1 react-native-purchases-ui@10.1.1 @revenuecat/purchases-js@1.11.1

# Extension starter
pnpm dlx --allow-build=esbuild --allow-build=spawn-sync wxt@0.20.25 init Extension -t react --pm pnpm

# Extension install, unless --skip-install
pnpm install --no-frozen-lockfile

# Backend dependencies, unless --skip-install
pnpm add @shared/contracts@workspace:* @shared/db@workspace:* fastify@5.6.2 fastify-plugin@5.1.0 @fastify/cors@11.1.0 @fastify/env@5.0.3 @fastify/compress@8.3.0 @fastify/helmet@13.0.2 @fastify/rate-limit@10.3.0 @fastify/swagger@9.6.1 @fastify/swagger-ui@5.2.3 @fastify/multipart@9.3.0 @clerk/fastify@3.1.26 @neondatabase/serverless@1.0.2 drizzle-orm@0.44.7 @aws-sdk/client-s3@3.1047.0 @aws-sdk/lib-storage@3.1047.0 @aws-sdk/s3-request-presigner@3.1047.0 dotenv@17.2.3 zod@4.2.1
pnpm add -D typescript@5.9.3 tsx@4.20.6 @types/node@25.6.0 drizzle-kit@0.31.7 vitest@4.0.16 @vitest/coverage-v8@4.0.16 eslint@9.39.2 @eslint/js@9.39.2 globals@16.5.0 typescript-eslint@8.49.0 pino-pretty@13.1.3
```

The generated `install-skills.sh` records optional agent skill installs:

```bash
pnpm dlx skills add https://github.com/clerk/skills --skill clerk-custom-ui
pnpm dlx skills add https://github.com/revenuecat/revenuecat-skill --skill revenuecat
pnpm dlx skills add https://github.com/stripe/ai --skill stripe-best-practices
```

## 4. Root Workspace Commands

Run these from the generated repo root after install.

```bash
pnpm install
pnpm dev
pnpm dev:frontend
pnpm dev:backend
pnpm dev:extension

pnpm build
pnpm typecheck
pnpm verify
pnpm verify:frontend
pnpm verify:backend
pnpm verify:extension

pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm db:check

pnpm extension:zip
```

`pnpm dev` starts Frontend, Backend, and Extension through Turbo in parallel. The verify commands check Expo dependency alignment, build the Expo web output, test/build the API, typecheck the extension, and produce an extension ZIP.

## 5. Local First Run

```bash
pnpm install
cp .env.example .env
cp Extension/.env.example Extension/.env
# Frontend/.env and Backend/.env are generated for local development.
pnpm db:generate
pnpm db:migrate
pnpm verify
pnpm dev:backend
pnpm dev:frontend
pnpm dev:extension
```

Local backend demo mode is enabled through `ANHEDRAL_DEMO=true` in `Backend/.env`. Demo mode returns a sample signed-in user and active subscription responses without real Clerk, RevenueCat, Stripe, Neon, or R2 credentials. It is only for local inspection and smoke tests.

## 6. Environment Ownership

Use a strict boundary between public client configuration and server secrets.

| Location | Variables | Notes |
| --- | --- | --- |
| Root `.env` | `DATABASE_URL`, shared local values | Used by shared Drizzle migration commands. |
| `Frontend/.env` and Frontend Vercel/EAS | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_RC_*` | Only public client values belong here. |
| `Backend/.env` and Backend Vercel | `DATABASE_URL`, `CLERK_SECRET_KEY`, `RC_SECRET_API_KEY`, `RC_WEBHOOK_SECRET`, `R2_*` | Server secrets belong only in backend environments. |
| `Extension/.env` | `VITE_API_URL`, `VITE_WEBSITE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, optional `VITE_CRX_PUBLIC_KEY`, optional `VITE_RC_BILLING_URL` | Extension values are bundled into extension builds unless supplied by runtime APIs. |

## 7. Provider Setup Order

Follow this order because later services need domains, callback URLs, IDs, or webhook URLs from earlier steps.

### 7.1 Neon + Drizzle

1. Create a Neon project and Postgres database.
2. Copy the pooled connection string.
3. Set `DATABASE_URL` in root `.env`, `Backend/.env`, and the Backend Vercel project.
4. Generate and apply migrations.

```bash
pnpm db:generate
pnpm db:migrate
```

### 7.2 Clerk

1. Create a Clerk application.
2. Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `Frontend/.env`, Frontend Vercel, and EAS.
3. Set `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `Backend/.env` and Backend Vercel.
4. Set `VITE_CLERK_PUBLISHABLE_KEY` in `Extension/.env`.
5. Add allowed origins for `http://localhost:8081`, the Frontend Vercel domain, and the Chrome extension origin after the extension ID is stable.
6. Configure native redirect/deep-link settings for the Expo scheme in `Frontend/app.json`.

### 7.3 RevenueCat + Stripe

1. Create a RevenueCat project.
2. Create an entitlement named `pro`.
3. Create iOS, Android, and Web apps in RevenueCat.
4. Copy public SDK keys into `EXPO_PUBLIC_RC_API_KEY_IOS`, `EXPO_PUBLIC_RC_API_KEY_ANDROID`, and `EXPO_PUBLIC_RC_WEB_API_KEY`.
5. Set `EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro`.
6. Connect Stripe as the RevenueCat web billing source.
7. Set `RC_SECRET_API_KEY` and `RC_WEBHOOK_SECRET` only in backend environments.
8. Point the RevenueCat webhook to `https://<backend-domain>/webhooks/revenuecat`.

### 7.4 Cloudflare R2

1. Create an R2 bucket.
2. Create a least-privilege R2 API token.
3. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` only in backend environments.
4. Use backend storage routes for signed uploads and object access.
5. Configure a public bucket URL or custom CDN domain only if uploaded assets must be publicly delivered.

## 8. Deployment Workflow

### 8.1 Vercel Web And API

Import the same Git repository twice in Vercel.

| Vercel project | Root directory | Build command | Output/entrypoint |
| --- | --- | --- | --- |
| Frontend | `Frontend` | `pnpm build:web` | `dist` |
| Backend | `Backend` | `pnpm build` | Fastify entrypoint at `src/index.ts` |

Enable Vercel access to source files outside each root directory so `packages/*` workspace imports resolve during builds.

### 8.2 EAS Native Builds

Use `Frontend` as the Expo project root for iOS and Android.

```bash
cd Frontend
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init
pnpm dlx eas-cli@latest build --platform all --profile production
pnpm dlx eas-cli@latest submit --platform all --latest --profile production
```

### 8.3 Chrome Extension

```bash
pnpm extension:zip
```

Upload `Extension/.output/*-chrome.zip` to the Chrome Web Store Developer Dashboard. For local testing, run `pnpm --filter ./Extension build` and load `Extension/.output/chrome-mv3` from `chrome://extensions`.

## 9. Production Checklist

- Replace every placeholder env value before production deployment.
- Keep server secrets out of Frontend, Extension, and EAS public env values.
- Confirm Clerk works on local web, Vercel web, iOS, Android, and Chrome extension surfaces.
- Confirm RevenueCat returns the `pro` entitlement after Stripe web purchase and native store purchase.
- Confirm `pnpm db:migrate` has run against production Neon.
- Confirm R2 upload, signed URL retrieval, and deletion through the deployed backend domain.
- Confirm both Vercel projects can resolve `packages/*`.
- Confirm the extension ZIP is tested locally before Chrome Web Store upload.
- Run `pnpm verify` before tagging or deploying a release.

## 10. Generated File Inventory

The generated demo includes these text files. Binary assets such as PNG icons, SVG logos, favicon files, and the lockfile are intentionally excluded from the embedded source appendix.

```txt
.env.example
.github/workflows/ci.yml
.gitignore
.vercelignore
Backend/.env
Backend/.env.example
Backend/.gitignore
Backend/drizzle.config.ts
Backend/eslint.config.mjs
Backend/package.json
Backend/src/app.ts
Backend/src/config/cors.ts
Backend/src/config/database.ts
Backend/src/config/index.ts
Backend/src/config/server.ts
Backend/src/db/index.ts
Backend/src/db/migrate.ts
Backend/src/db/schema.ts
Backend/src/errors/AppError.ts
Backend/src/errors/AuthError.ts
Backend/src/errors/errorHandler.ts
Backend/src/errors/index.ts
Backend/src/errors/NotFoundError.ts
Backend/src/errors/RateLimitError.ts
Backend/src/errors/ServerError.ts
Backend/src/errors/ValidationError.ts
Backend/src/index.ts
Backend/src/lib/constants.ts
Backend/src/lib/fetchWithTimeout.ts
Backend/src/lib/lruCache.ts
Backend/src/lib/r2.ts
Backend/src/lib/requestUtils.ts
Backend/src/lib/revenuecat.ts
Backend/src/lib/routeHelpers.ts
Backend/src/plugins/clerkAuth.ts
Backend/src/plugins/env.ts
Backend/src/repositories/index.ts
Backend/src/repositories/SubscriptionEventRepository.ts
Backend/src/repositories/SubscriptionRepository.ts
Backend/src/repositories/UserRepository.ts
Backend/src/routes/auth.ts
Backend/src/routes/health.ts
Backend/src/routes/index.ts
Backend/src/routes/storage.ts
Backend/src/routes/subscriptions.ts
Backend/src/services/SubscriptionService.ts
Backend/src/types/fastify-env.d.ts
Backend/src/types/fastify.d.ts
Backend/src/types/index.ts
Backend/test/health.test.ts
Backend/test/setup.ts
Backend/tsconfig.json
Backend/vercel.json
Backend/vitest.config.ts
Extension/.env
Extension/.env.example
Extension/.gitignore
Extension/components.json
Extension/package.json
Extension/postcss.config.cjs
Extension/README.md
Extension/src/components/ui/button.tsx
Extension/src/contexts/auth-context.tsx
Extension/src/entrypoints/background.ts
Extension/src/entrypoints/content.ts
Extension/src/entrypoints/sidepanel/app.tsx
Extension/src/entrypoints/sidepanel/index.html
Extension/src/entrypoints/sidepanel/main.tsx
Extension/src/lib/api.ts
Extension/src/lib/utils.ts
Extension/src/styles/main.css
Extension/tailwind.config.cjs
Extension/tsconfig.json
Extension/wxt.config.ts
Frontend/.env
Frontend/.env.example
Frontend/.gitignore
Frontend/.npmrc
Frontend/.prettierrc
Frontend/api/client.ts
Frontend/api/index.ts
Frontend/app.json
Frontend/app/_layout.tsx
Frontend/app/(app)/system.tsx
Frontend/app/(auth)/forgot-password.tsx
Frontend/app/(auth)/reset-password.tsx
Frontend/app/(auth)/sign-in.tsx
Frontend/app/(auth)/sign-up/_layout.tsx
Frontend/app/(auth)/sign-up/index.tsx
Frontend/app/(auth)/sign-up/verify-email.tsx
Frontend/app/+html.tsx
Frontend/app/+not-found.tsx
Frontend/app/index.tsx
Frontend/babel.config.js
Frontend/components.json
Frontend/components/forgot-password-form.tsx
Frontend/components/reset-password-form.tsx
Frontend/components/sign-in-form.tsx
Frontend/components/sign-up-form.tsx
Frontend/components/social-connections.tsx
Frontend/components/theme-toggle.tsx
Frontend/components/ui/button.tsx
Frontend/components/ui/card.tsx
Frontend/components/ui/icon.tsx
Frontend/components/ui/input.tsx
Frontend/components/ui/label.tsx
Frontend/components/ui/native-only-animated-view.tsx
Frontend/components/ui/popover.tsx
Frontend/components/ui/separator.tsx
Frontend/components/ui/text.tsx
Frontend/components/user-menu.tsx
Frontend/components/verify-email-form.tsx
Frontend/contexts/SubscriptionProvider.tsx
Frontend/eas.json
Frontend/expo-env.d.ts
Frontend/global.css
Frontend/hooks/useAccount.ts
Frontend/hooks/useAPI.ts
Frontend/hooks/useSubscription.ts
Frontend/lib/config.ts
Frontend/lib/theme.ts
Frontend/lib/utils.ts
Frontend/metro.config.js
Frontend/nativewind-env.d.ts
Frontend/package.json
Frontend/README.md
Frontend/tailwind.config.js
Frontend/tsconfig.json
Frontend/vercel.json
install-skills.sh
package.json
packages/api-client/package.json
packages/api-client/src/index.ts
packages/api-client/tsconfig.json
packages/config/package.json
packages/config/src/index.ts
packages/config/tsconfig.json
packages/contracts/package.json
packages/contracts/src/index.ts
packages/contracts/tsconfig.json
packages/db/drizzle.config.ts
packages/db/migrations/.gitkeep
packages/db/package.json
packages/db/src/index.ts
packages/db/src/migrate.ts
packages/db/src/queries/index.ts
packages/db/src/queries/uploads.ts
packages/db/src/queries/users.ts
packages/db/src/schema.ts
packages/db/tsconfig.json
packages/types/package.json
packages/types/src/index.ts
packages/types/tsconfig.json
pnpm-workspace.yaml
turbo.json
```

## 11. Generated Code Appendix

The following appendix embeds the scaffolded text source and configuration files from `docs/demo`. Treat project-specific names and placeholder values as examples; a real run derives names from the directory where `anhedral init` is executed.

### .env.example

```dotenv
# Apps
FRONTEND_URL=http://localhost:8081
ANHEDRAL_DEMO=false
EXPO_PUBLIC_API_URL=http://localhost:8787
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***
EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro
EXPO_PUBLIC_RC_API_KEY_IOS=
EXPO_PUBLIC_RC_API_KEY_ANDROID=
EXPO_PUBLIC_RC_WEB_API_KEY=
VITE_API_URL=http://localhost:8787
VITE_WEBSITE_URL=http://localhost:8081
VITE_CLERK_PUBLISHABLE_KEY=pk_test_***
VITE_CRX_PUBLIC_KEY=
VITE_RC_BILLING_URL=


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

# RevenueCat
RC_SECRET_API_KEY=
RC_WEBHOOK_SECRET=
RC_ENTITLEMENT_ID=pro
RC_OFFERING_ID=default

```

### .github/workflows/ci.yml

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
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

```

### .gitignore

```
node_modules
.turbo
Frontend/node_modules
Backend/node_modules
Extension/node_modules
packages/*/node_modules
.env
.env.*
!.env.example
*.tsbuildinfo

```

### .vercelignore

```
Extension/.output
Extension/.wxt
Extension/dist

```

### Backend/.env

```dotenv
# Server
PORT=8787
NODE_ENV=development
LOG_LEVEL=info
ANHEDRAL_DEMO=true

# Database (NeonDB)
DATABASE_URL="postgresql://user:pass@localhost:5432/app?sslmode=disable"

# Clerk
CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""

# CORS
FRONTEND_URL=http://localhost:8081
EXTENSION_ORIGINS=

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

```

### Backend/.env.example

```dotenv
# Server
PORT=8787
NODE_ENV=development
LOG_LEVEL=info
ANHEDRAL_DEMO=false

# Database (NeonDB)
DATABASE_URL="postgresql://neondb_owner:***@***.neon.tech/neondb?sslmode=require"

# Clerk
CLERK_PUBLISHABLE_KEY="pk_test_***"
CLERK_SECRET_KEY="sk_test_***"

# CORS
FRONTEND_URL=http://localhost:8081
EXTENSION_ORIGINS=

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

```

### Backend/.gitignore

```
node_modules/
dist/
.env
.env.*
!.env.example
*.log
*.tsbuildinfo

```

### Backend/drizzle.config.ts

```ts
import type { Config } from 'drizzle-kit';
export default {
  schema: '../../packages/db/src/schema.ts',
  out: '../../packages/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! }
} satisfies Config;

```

### Backend/eslint.config.mjs

```js
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  { languageOptions: { globals: globals.node } },
  ...tseslint.configs.recommended,
);

```

### Backend/package.json

```json
{
  "name": "demo-backend",
  "version": "1.0.0",
  "description": "demo Backend",
  "type": "module",
  "scripts": {
    "dev": "tsx --env-file=.env --watch src/index.ts",
    "build": "pnpm typecheck",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "pnpm --filter @shared/db db:migrate",
    "db:studio": "drizzle-kit studio",
    "db:check": "drizzle-kit check",
    "db:push": "drizzle-kit push",
    "lint": "eslint . --ext .js,.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": [],
  "license": "MIT",
  "dependencies": {
    "@shared/contracts": "workspace:*",
    "@shared/db": "workspace:*",
    "fastify": "5.6.2",
    "fastify-plugin": "5.1.0",
    "@fastify/cors": "11.1.0",
    "@fastify/env": "5.0.3",
    "@fastify/compress": "8.3.0",
    "@fastify/helmet": "13.0.2",
    "@fastify/rate-limit": "10.3.0",
    "@fastify/swagger": "9.6.1",
    "@fastify/swagger-ui": "5.2.3",
    "@fastify/multipart": "9.3.0",
    "@clerk/fastify": "3.1.26",
    "@neondatabase/serverless": "1.0.2",
    "drizzle-orm": "0.44.7",
    "@aws-sdk/client-s3": "3.1047.0",
    "@aws-sdk/lib-storage": "3.1047.0",
    "@aws-sdk/s3-request-presigner": "3.1047.0",
    "dotenv": "17.2.3",
    "zod": "4.2.1"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "tsx": "4.20.6",
    "@types/node": "25.6.0",
    "drizzle-kit": "0.31.7",
    "vitest": "4.0.16",
    "@vitest/coverage-v8": "4.0.16",
    "eslint": "9.39.2",
    "@eslint/js": "9.39.2",
    "globals": "16.5.0",
    "typescript-eslint": "8.49.0",
    "pino-pretty": "13.1.3"
  }
}

```

### Backend/src/app.ts

```ts
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import routes from './routes/index.js';
import envConfig from './plugins/env.js';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import { errorHandler } from './errors/index.js';
import { AppConfig } from './config/index.js';
import { Repositories } from './repositories/index.js';
import { db } from './db/index.js';

const isProduction = process.env.NODE_ENV === 'production';

function createBaseApp(): FastifyInstance {
  return Fastify({
    trustProxy: true,
    logger: {
      level: process.env.LOG_LEVEL ?? (isProduction ? 'warn' : 'info'),
      redact: ['req.headers.authorization'],
      ...(isProduction ? {} : {
        transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } },
      }),
    },
    bodyLimit: 12 * 1024 * 1024,
    disableRequestLogging: isProduction,
  });
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = createBaseApp();

  if (!isProduction && !process.env.VERCEL) {
    await import('dotenv/config');
  }

  await app.register(envConfig);

  const config = AppConfig.fromEnv(app.env!);
  app.decorate('config', config);

  const repos = new Repositories(db);
  app.decorate('repos', repos);

  await app.register(compress, { global: true, threshold: 512, encodings: ['br', 'gzip', 'deflate'] });
  app.setErrorHandler(errorHandler);

  const isDevelopment = app.env?.NODE_ENV === 'development';

  await app.register(helmet, {
    contentSecurityPolicy: isDevelopment ? false : undefined,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: isDevelopment ? ['127.0.0.1'] : [],
  });

  if (isDevelopment) {
    const [{ default: swagger }, { default: swaggerUI }] = await Promise.all([
      import('@fastify/swagger'),
      import('@fastify/swagger-ui'),
    ]);
    await app.register(swagger, {
      openapi: {
        info: { title: 'demo API', version: '1.0.0' },
        servers: [{ url: `http://localhost:${app.env?.PORT ?? 3000}` }],
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      },
    });
    await app.register(swaggerUI, { routePrefix: '/docs' });
  }

  await app.register(routes);

  return app;
}

```

### Backend/src/config/cors.ts

```ts
import type { AppEnv } from '../types/index.js';

export class CorsConfig {
  readonly frontendUrl?: string;
  readonly extensionOrigins: string[];
  readonly restrictedOrigins: string[];

  constructor(env: AppEnv) {
    if (env.FRONTEND_URL) this.frontendUrl = env.FRONTEND_URL;
    this.extensionOrigins = String(env.EXTENSION_ORIGINS || '')
      .split(',').map(o => o.trim()).filter(o => o.length > 0);
    this.restrictedOrigins = [
      ...new Set([
        ...(this.frontendUrl ? [this.frontendUrl] : []),
        ...this.extensionOrigins,
      ]),
    ];
  }

  getRestrictedOrigins(): string[] | false {
    return this.restrictedOrigins.length > 0 ? this.restrictedOrigins : false;
  }
}

```

### Backend/src/config/database.ts

```ts
import type { AppEnv } from '../types/index.js';

export class DatabaseConfig {
  readonly url: string;

  constructor(env: AppEnv) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    this.url = env.DATABASE_URL;
  }
}

```

### Backend/src/config/index.ts

```ts
import type { AppEnv } from '../types/index.js';
import { ServerConfig } from './server.js';
import { DatabaseConfig } from './database.js';
import { CorsConfig } from './cors.js';

export class AppConfig {
  readonly server: ServerConfig;
  readonly database: DatabaseConfig;
  readonly cors: CorsConfig;

  constructor(env: AppEnv) {
    this.server = new ServerConfig(env);
    this.database = new DatabaseConfig(env);
    this.cors = new CorsConfig(env);
  }

  static fromEnv(env: AppEnv): AppConfig {
    return new AppConfig(env);
  }
}

export { ServerConfig } from './server.js';
export { DatabaseConfig } from './database.js';
export { CorsConfig } from './cors.js';

```

### Backend/src/config/server.ts

```ts
import type { AppEnv } from '../types/index.js';

export class ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly nodeEnv: string;
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;

  constructor(env: AppEnv) {
    this.port = env.PORT;
    this.host = '0.0.0.0';
    this.nodeEnv = env.NODE_ENV;
    this.isDevelopment = env.NODE_ENV === 'development';
    this.isProduction = env.NODE_ENV === 'production';
  }
}

```

### Backend/src/db/index.ts

```ts
export { db } from '@shared/db';
export type { Database } from '@shared/db';

```

### Backend/src/db/migrate.ts

```ts
import '@shared/db/migrate';

```

### Backend/src/db/schema.ts

```ts
export * from '@shared/db/schema';

```

### Backend/src/errors/AppError.ts

```ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    const json: { error: string; message: string; details?: unknown } = {
      error: this.code,
      message: this.message,
    };
    if (this.details !== undefined) json.details = this.details;
    return json;
  }
}

```

### Backend/src/errors/AuthError.ts

```ts
import { AppError } from './AppError.js';

export class AuthError extends AppError {
  constructor(code: string, message: string, details?: unknown, statusCode: number = 401) {
    super(code, statusCode, message, details);
  }

  static missingAuthorization() {
    return new AuthError('missing_authorization', 'Authorization header is required');
  }

  static invalidAuthorization() {
    return new AuthError('invalid_authorization', 'Invalid authorization credentials');
  }

  static invalidToken() {
    return new AuthError('invalid_session_token', 'Invalid or malformed authentication token');
  }

  static tokenExpired() {
    return new AuthError('token_expired', 'Authentication token has expired');
  }

  static userRequired() {
    return new AuthError('user_authentication_required', 'This endpoint requires user authentication (JWT token)');
  }

  static unauthorized() {
    return new AuthError('unauthorized', 'Authentication required');
  }

  static forbidden() {
    return new AuthError('forbidden', 'Insufficient permissions', undefined, 403);
  }
}

```

### Backend/src/errors/errorHandler.ts

```ts
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './AppError.js';

export function errorHandler(
  error: Error | FastifyError,
  req: FastifyRequest,
  reply: FastifyReply
) {
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode =
    error instanceof AppError
      ? error.statusCode
      : ('statusCode' in error && typeof error.statusCode === 'number')
          ? error.statusCode
          : ('validation' in error && (error as FastifyError).validation)
              ? 400
              : 500;

  const logPayload = {
    msg: '[error_handler]',
    id: req.id,
    method: req.method,
    url: req.url,
    statusCode,
    errorName: error.name,
    errorMessage: error.message,
    errorCode: (error as AppError).code,
    ...(isProduction && statusCode < 500 ? {} : { stack: error.stack }),
  };

  if (statusCode < 500) {
    req.log.warn(logPayload);
  } else {
    req.log.error(logPayload);
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(error.toJSON());
  }

  if ('validation' in error && error.validation) {
    const validation = error.validation as Array<{ instancePath?: string; params?: { missingProperty?: string }; keyword?: string }>;
    const missingField = validation.find(v => v.keyword === 'required');
    if (missingField && missingField.params?.missingProperty) {
      return reply.status(400).send({
        error: 'missing_field',
        message: `Required field is missing: ${missingField.params.missingProperty}`,
        details: { field: missingField.params.missingProperty },
      });
    }
    return reply.status(400).send({
      error: 'validation_error',
      message: 'Invalid request',
      details: isProduction ? undefined : error.validation,
    });
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return reply.status(error.statusCode).send({
      error: error.name || 'error',
      message: error.message,
    });
  }

  return reply.status(500).send({ error: 'server_error', message: 'An unexpected error occurred' });
}

```

### Backend/src/errors/index.ts

```ts
export { AppError } from './AppError.js';
export { AuthError } from './AuthError.js';
export { ValidationError } from './ValidationError.js';
export { NotFoundError } from './NotFoundError.js';
export { RateLimitError } from './RateLimitError.js';
export { ServerError } from './ServerError.js';
export { errorHandler } from './errorHandler.js';

```

### Backend/src/errors/NotFoundError.ts

```ts
import { AppError } from './AppError.js';

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('not_found', 404, `${resource} not found`);
  }
}

```

### Backend/src/errors/RateLimitError.ts

```ts
import { AppError } from './AppError.js';

export class RateLimitError extends AppError {
  constructor(message: string, details?: unknown) {
    super('rate_limited', 429, message, details);
  }

  static dailyLimit(resource: string, limit: number) {
    return new RateLimitError(
      `Daily ${resource} limit reached (${limit} requests per day)`,
      { resource, limit, window: '24h' }
    );
  }

  static tooManyRequests(retryAfter?: number) {
    return new RateLimitError('Too many requests. Please try again later.', { retryAfter });
  }
}

```

### Backend/src/errors/ServerError.ts

```ts
import { AppError } from './AppError.js';

export class ServerError extends AppError {
  constructor(message: string, details?: unknown) {
    super('server_error', 500, message, details);
  }

  static generic(details?: unknown) {
    return new ServerError('An internal server error occurred', details);
  }

  static missingConfiguration(key: string) {
    return new ServerError(`Server misconfiguration: ${key} is not defined`, { missingKey: key });
  }

  static databaseError(operation: string, error?: unknown) {
    return new ServerError(`Database operation failed: ${operation}`, { operation, error });
  }
}

```

### Backend/src/errors/ValidationError.ts

```ts
import { AppError } from './AppError.js';

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('validation_error', 400, message, details);
  }

  static missingField(field: string) {
    return new ValidationError(`Required field is missing: ${field}`, { field });
  }

  static invalidFormat(field: string, expected: string) {
    return new ValidationError(`Invalid format for ${field}. Expected: ${expected}`, { field, expected });
  }
}

```

### Backend/src/index.ts

```ts
import { buildApp } from './app.js';

async function main() {
  const fastify = await buildApp();
  const PORT = fastify.env?.PORT ?? 0;
  if (!Number.isFinite(PORT) || Number(PORT) <= 0) {
    throw new Error(`PORT must be set and be a positive number. Got: ${PORT}`);
  }
  await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
  fastify.log.info({ msg: '[startup]', addr: `http://0.0.0.0:${PORT}` });
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});

```

### Backend/src/lib/constants.ts

```ts
export {
  SUBSCRIPTION_TIERS, SUBSCRIPTION_STATUSES, SUBSCRIPTION_METHODS, SUBSCRIPTION_ORIGINS,
  type SubscriptionTier, type SubscriptionStatus, type SubscriptionMethod, type SubscriptionOrigin,
} from '../db/schema.js';

export const TIER_LIMITS = {
  free: { tier: 'free' as const, dailyLimit: 0 },
  pro:  { tier: 'pro'  as const, dailyLimit: null },
} as const;

export const TIER_PRICING = {
  free: { tier: 'free' as const, priceMonthly: 0,  priceYearly: 0,  currency: 'USD', displayName: 'Free', description: 'Get started for free' },
  pro:  { tier: 'pro'  as const, priceMonthly: 5,  priceYearly: 54, currency: 'USD', displayName: 'Pro',  description: 'Unlimited access' },
} as const;

export const CACHE_SECONDS = {
  SUBSCRIPTIONS_PRICING: 60,
} as const;

```

### Backend/src/lib/fetchWithTimeout.ts

```ts
export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = 60000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchWithTimeoutAndRetry(
  url: string,
  options: FetchWithTimeoutOptions = {},
  retries = 0
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Request failed');
}

```

### Backend/src/lib/lruCache.ts

```ts
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttlMs: number;
  private pruneIntervalMs: number;
  private lastPruneAt = 0;

  constructor(opts: { maxSize: number; ttlMs: number; pruneIntervalMs?: number }) {
    this.maxSize = opts.maxSize;
    this.ttlMs = opts.ttlMs;
    this.pruneIntervalMs = opts.pruneIntervalMs ?? Math.max(opts.ttlMs * 2, 60_000);
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.delete(key);
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.evictIfNeeded();
    this.maybePrune();
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
      else break;
    }
  }

  private maybePrune(): void {
    const now = Date.now();
    if (now - this.lastPruneAt < this.pruneIntervalMs) return;
    this.lastPruneAt = now;
    const expired: string[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) expired.push(key);
    }
    for (const key of expired) this.cache.delete(key);
  }
}

```

### Backend/src/lib/r2.ts

```ts
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type UploadObjectInput = {
  objectKey: string;
  contentType: string;
};

function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET
  );
}

function getR2Client() {
  if (!hasR2Config()) {
    throw new Error('R2 is not configured');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
}

function getBucket() {
  if (!process.env.R2_BUCKET) {
    throw new Error('R2_BUCKET is not configured');
  }

  return process.env.R2_BUCKET;
}

export function isR2Configured() {
  return hasR2Config();
}

export async function createSignedUploadUrl(input: UploadObjectInput, expiresIn = 60 * 10) {
  const client = getR2Client();
  const bucket = getBucket();

  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: input.objectKey,
    ContentType: input.contentType,
  }), { expiresIn });

  return {
    bucket,
    objectKey: input.objectKey,
    uploadUrl,
    expiresIn,
  };
}

export async function createSignedDownloadUrl(objectKey: string, expiresIn = 60 * 10) {
  const client = getR2Client();
  const downloadUrl = await getSignedUrl(client, new GetObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  }), { expiresIn });

  return { objectKey, downloadUrl, expiresIn };
}

export async function deleteObjectFromR2(objectKey: string) {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  }));
}

```

### Backend/src/lib/requestUtils.ts

```ts
import type { FastifyRequest } from 'fastify';

export function extractDeviceType(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile';
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet';
  if (ua.includes('chrome-extension') || ua.includes('firefox-extension')) return 'extension';
  return 'desktop';
}

export function extractIpAddress(req: FastifyRequest): string | null {
  const realIp = req.headers['x-real-ip'] as string | undefined;
  if (realIp) return realIp;
  const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.ip || null;
}

export function extractDeviceInfo(req: FastifyRequest) {
  const userAgent = req.headers['user-agent'] || null;
  const deviceType = extractDeviceType(userAgent);
  const rawIp = extractIpAddress(req);
  const ipAddress = anonymizeIp(rawIp);
  return { deviceType, userAgent, ipAddress };
}

export function sanitizeEmail(email: unknown): string {
  return String(email || '').toLowerCase().trim();
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const maskedLocal = local.length > 0 ? `${local[0]}***` : '***';
  return `${maskedLocal}@${domain}`;
}

export function anonymizeIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length === 4) { parts[3] = '0'; return parts.join('.'); }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 3) return `${parts.slice(0, 3).join(':')}::`;
  }
  return ip;
}

```

### Backend/src/lib/revenuecat.ts

```ts
import { createHmac } from 'node:crypto';
import { fetchWithTimeout } from './fetchWithTimeout.js';
import { LRUCache } from './lruCache.js';

export interface RevenueCatEntitlement {
  pro: boolean;
  expiresAt?: string;
  purchaseDate?: string;
  managementUrl?: string;
  cancelAtPeriodEnd?: boolean;
}

const RC_CACHE_TTL_MS = process.env.NODE_ENV === 'production' ? 60_000 : 10_000;
const rcEntitlementCache = new LRUCache<RevenueCatEntitlement>({ maxSize: 100_000, ttlMs: RC_CACHE_TTL_MS });
const inflightCached = new Map<string, Promise<RevenueCatEntitlement>>();
const inflightForced  = new Map<string, Promise<RevenueCatEntitlement>>();

export function invalidateRcEntitlementCache(appUserId: string, entitlementId: string): void {
  rcEntitlementCache.invalidate(`${entitlementId}:${appUserId}`);
}

interface RcSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string; purchase_date?: string; product_identifier?: string; will_renew?: boolean | null; unsubscribe_detected_at?: string | null }>;
    subscriptions?: Record<string, { expires_date?: string; management_url?: string; unsubscribe_detected_at?: string | null }>;
    management_url?: string;
  };
}

export async function getRcEntitlement(
  appUserId: string, entitlementId: string, apiKey: string, opts?: { bypassCache?: boolean }
): Promise<RevenueCatEntitlement> {
  const cacheKey = `${entitlementId}:${appUserId}`;
  const bypass = opts?.bypassCache === true;

  if (!bypass) {
    const cached = rcEntitlementCache.get(cacheKey);
    if (cached) return cached;
    const inflight = inflightCached.get(cacheKey);
    if (inflight) return inflight;
  } else {
    const inflight = inflightForced.get(cacheKey);
    if (inflight) return inflight;
  }

  const map = bypass ? inflightForced : inflightCached;
  const p = (async (): Promise<RevenueCatEntitlement> => {
    const res = await fetchWithTimeout(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60_000,
    });
    if (res.status === 404) return { pro: false };
    if (!res.ok) throw new Error(`RevenueCat API error: ${res.status}`);

    const data = (await res.json()) as RcSubscriberResponse;
    const now  = new Date();
    const ent  = data.subscriber?.entitlements?.[entitlementId];
    const entExpires = ent?.expires_date ? new Date(ent.expires_date) : null;
    const entActive  = entExpires ? entExpires > now : false;

    const subs = data.subscriber?.subscriptions ?? {};
    let bestSub: { expires_date?: string; management_url?: string; unsubscribe_detected_at?: string | null } | undefined;
    let bestSubExpires: Date | null = null;
    for (const sub of Object.values(subs)) {
      const d = sub?.expires_date ? new Date(sub.expires_date) : null;
      if (!d || !Number.isFinite(d.getTime())) continue;
      if (!bestSubExpires || d > bestSubExpires) { bestSubExpires = d; bestSub = sub; }
    }

    const pro = entActive || (bestSubExpires ? bestSubExpires > now : false);
    const productId = ent?.product_identifier;
    const entSub    = productId ? data.subscriber?.subscriptions?.[productId] : undefined;
    const managementUrl = entSub?.management_url || bestSub?.management_url || data.subscriber?.management_url;
    const cancelAtPeriodEnd = ent?.will_renew === false || ent?.unsubscribe_detected_at != null
      || (entSub?.unsubscribe_detected_at ?? bestSub?.unsubscribe_detected_at) != null;

    const entMs = entExpires?.getTime() ?? 0;
    const subMs = bestSubExpires?.getTime() ?? 0;
    const bestMs = Math.max(entMs, subMs);
    const expiresAt = bestMs ? new Date(bestMs).toISOString() : undefined;

    return { pro, expiresAt, purchaseDate: ent?.purchase_date, managementUrl, cancelAtPeriodEnd };
  })();

  map.set(cacheKey, p);
  try {
    const value = await p;
    if (!bypass && value.pro) rcEntitlementCache.set(cacheKey, value);
    return value;
  } finally {
    map.delete(cacheKey);
  }
}

export function verifyRevenueCatWebhook(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  try {
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'v1' || !parts[1]) return false;
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const computed = hmac.digest('hex');
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(parts[1], 'hex');
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return result === 0;
  } catch { return false; }
}

export function verifyRevenueCatWebhookAuthorization(authHeader: string | undefined, secret: string): boolean {
  if (!authHeader) return false;
  const normalize = (v: string) => v.trim().replace(/^bearer\s+/i, '');
  return normalize(authHeader) === normalize(secret);
}

```

### Backend/src/lib/routeHelpers.ts

```ts
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { AuthError } from '../errors/index.js';

export function createAuthHook(fastify: FastifyInstance) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (typeof fastify.authenticate === 'function') {
      await fastify.authenticate(req, reply);
    } else {
      throw AuthError.unauthorized();
    }
  };
}

export function runBackgroundTask(
  req: FastifyRequest,
  task: Promise<unknown>,
  label?: string
): void {
  const wrapped = task.catch((error) => {
    req.log.warn({
      msg: '[background_task_failed]',
      label,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  if (typeof req.waitUntil === 'function') {
    req.waitUntil(wrapped);
  } else {
    void wrapped;
  }
}

```

### Backend/src/plugins/clerkAuth.ts

```ts
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { clerkPlugin, getAuth, clerkClient } from '@clerk/fastify';
import { AuthError } from '../errors/index.js';
import { runBackgroundTask } from '../lib/routeHelpers.js';
import type { AppUser } from '../types/index.js';
import crypto from 'node:crypto';
import { LRUCache } from '../lib/lruCache.js';

export const clerkAuthPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(clerkPlugin);

  const trackedSessions = new LRUCache<number>({ maxSize: 50_000, ttlMs: 24 * 60 * 60 * 1000 });

  type ClerkUser = Awaited<ReturnType<(typeof clerkClient.users)['getUser']>>;
  const CLERK_USER_CACHE = new LRUCache<ClerkUser>({
    maxSize: 50_000,
    ttlMs: fastify.env?.NODE_ENV === 'production' ? 300_000 : 60_000,
  });
  const INFLIGHT_CLERK_USER = new Map<string, Promise<ClerkUser>>();

  const getClerkUser = async (userId: string): Promise<ClerkUser> => {
    const cached = CLERK_USER_CACHE.get(userId);
    if (cached) return cached;
    const existing = INFLIGHT_CLERK_USER.get(userId);
    if (existing) return existing;
    const p = (async () => {
      try {
        const user = await clerkClient.users.getUser(userId);
        CLERK_USER_CACHE.set(userId, user);
        return user;
      } finally {
        INFLIGHT_CLERK_USER.delete(userId);
      }
    })();
    INFLIGHT_CLERK_USER.set(userId, p);
    return p;
  };

  fastify.addHook('onRequest', async (req) => { req._startedAt = Date.now(); });

  const authenticate = async (req: FastifyRequest, _reply: FastifyReply) => {
    if (req.method === 'OPTIONS' || req.url.startsWith('/health')) return;

    if (fastify.env?.ANHEDRAL_DEMO === 'true') {
      req.user = {
        id: 'user_demo',
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
      };
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw AuthError.unauthorized();

    const jwtToken = authHeader.slice('Bearer '.length).trim();
    if (!jwtToken) throw AuthError.unauthorized();

    try {
      const auth = getAuth(req);
      if (!auth.userId) throw AuthError.unauthorized();

      const userId = auth.userId as string;
      const clerkUser = await getClerkUser(userId);
      if (!clerkUser) throw AuthError.unauthorized();

      let userData = await fastify.repos.users.getAuthDataForPlugin(userId);

      if (!userData) {
        const primaryEmail = clerkUser.emailAddresses.find(
          (e: { id: string }) => e.id === clerkUser.primaryEmailAddressId
        );
        const displayName = [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean).join(' ').trim() || (primaryEmail?.emailAddress?.split('@')[0] ?? '');

        await fastify.repos.users.createIfMissing({
          id: userId,
          email: primaryEmail?.emailAddress || '',
          displayName,
          profileImageUrl: clerkUser.imageUrl || null,
        });

        await fastify.repos.subscriptions.createIfMissing({
          id: crypto.randomUUID(),
          userId,
          tier: 'free',
          status: 'active',
        });

        userData = await fastify.repos.users.getAuthDataForPlugin(userId);
      } else {
        const sessionKey = auth.sessionId ?? userId;
        if (trackedSessions.get(sessionKey) === undefined) {
          trackedSessions.set(sessionKey, Date.now());
          runBackgroundTask(req, fastify.repos.users.updateLastLogin(userId), 'session_sync');
        }
      }

      if (!userData) throw AuthError.unauthorized();

      const userObj: AppUser = { id: userId };
      if (userData.subscriptionTier) userObj.subscriptionTier = userData.subscriptionTier;
      if (userData.subscriptionStatus) userObj.subscriptionStatus = userData.subscriptionStatus;
      req.user = userObj;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      req.log.error({ msg: '[clerk-auth:error]', error: (err as Error).message });
      throw err;
    }
  };

  fastify.decorate('authenticate', authenticate);
};

export default fp(clerkAuthPlugin, { name: 'clerk-auth-plugin', fastify: '5.x' });

```

### Backend/src/plugins/env.ts

```ts
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyEnv from '@fastify/env';
import fp from 'fastify-plugin';

const configPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const schema = {
    type: 'object',
    required: ['PORT', 'DATABASE_URL'],
    properties: {
      PORT: { type: 'number' },
      NODE_ENV: { type: 'string', default: 'development' },
      LOG_LEVEL: { type: 'string', default: 'info' },
      ANHEDRAL_DEMO: { type: 'string', default: 'false' },
      CLERK_PUBLISHABLE_KEY: { type: 'string', nullable: true },
      CLERK_SECRET_KEY: { type: 'string', nullable: true },
      FRONTEND_URL: { type: 'string', nullable: true },
      EXTENSION_ORIGINS: { type: 'string', nullable: true },
      DATABASE_URL: { type: 'string' },
      R2_ACCOUNT_ID: { type: 'string', nullable: true },
      R2_ACCESS_KEY_ID: { type: 'string', nullable: true },
      R2_SECRET_ACCESS_KEY: { type: 'string', nullable: true },
      R2_BUCKET: { type: 'string', nullable: true },
      RC_SECRET_API_KEY: { type: 'string', nullable: true, default: '' },
      RC_WEBHOOK_SECRET: { type: 'string', nullable: true, default: '' },
      RC_ENTITLEMENT_ID: { type: 'string', default: 'pro' },
      RC_OFFERING_ID: { type: 'string', default: 'default' },
    },
  } as const;

  await fastify.register(fastifyEnv as unknown as FastifyPluginAsync, {
    schema,
    dotenv: !process.env.VERCEL,
    confKey: 'env',
  } as unknown as Record<string, unknown>);

  if (fastify.env.NODE_ENV === 'production') {
    if (fastify.env.ANHEDRAL_DEMO === 'true') {
      throw new Error('ANHEDRAL_DEMO must be false in production');
    }

    const required = [
      'CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'RC_SECRET_API_KEY',
      'RC_WEBHOOK_SECRET',
    ] as const;
    const missing = required.filter((key) => !fastify.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
    }
  }
};

export default fp(configPlugin, { name: 'env-config', fastify: '5.x' });

```

### Backend/src/repositories/index.ts

```ts
import type { Database } from '../db/index.js';
import { UserRepository } from './UserRepository.js';
import { SubscriptionRepository } from './SubscriptionRepository.js';
import { SubscriptionEventRepository } from './SubscriptionEventRepository.js';

export class Repositories {
  public readonly users: UserRepository;
  public readonly subscriptions: SubscriptionRepository;
  public readonly subscriptionEvents: SubscriptionEventRepository;

  constructor(db: Database) {
    this.users = new UserRepository(db);
    this.subscriptions = new SubscriptionRepository(db);
    this.subscriptionEvents = new SubscriptionEventRepository(db);
  }
}

export { UserRepository } from './UserRepository.js';
export { SubscriptionRepository } from './SubscriptionRepository.js';
export { SubscriptionEventRepository } from './SubscriptionEventRepository.js';
export type { UserAuthData } from './UserRepository.js';
export type { RecordEventParams } from './SubscriptionEventRepository.js';

```

### Backend/src/repositories/SubscriptionEventRepository.ts

```ts
import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { Database } from '../db/index.js';
import {
  subscriptionEvents,
  type SubscriptionEvents, type NewSubscriptionEvents,
  type SubscriptionEventType, type SubscriptionTier, type SubscriptionStatus,
  type SubscriptionMethod, type SubscriptionOrigin, type SubscriptionEventMetadata,
} from '../db/schema.js';

export interface RecordEventParams {
  userId: string;
  subscriptionId?: string | null;
  eventType: SubscriptionEventType;
  previousState?: { tier?: SubscriptionTier | null; status?: SubscriptionStatus | null; method?: SubscriptionMethod | null };
  newState?: { tier?: SubscriptionTier | null; status?: SubscriptionStatus | null; method?: SubscriptionMethod | null };
  revenueCatEventType?: string;
  revenueCatProductId?: string;
  origin?: SubscriptionOrigin;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  metadata?: SubscriptionEventMetadata;
}

export class SubscriptionEventRepository {
  constructor(private db: Database) {}

  async recordEvent(params: RecordEventParams): Promise<SubscriptionEvents> {
    const data: NewSubscriptionEvents = {
      id: crypto.randomUUID(),
      userId: params.userId,
      subscriptionId: params.subscriptionId ?? null,
      eventType: params.eventType,
      previousTier: params.previousState?.tier ?? null,
      previousStatus: params.previousState?.status ?? null,
      previousMethod: params.previousState?.method ?? null,
      newTier: params.newState?.tier ?? null,
      newStatus: params.newState?.status ?? null,
      newMethod: params.newState?.method ?? null,
      revenueCatEventType: params.revenueCatEventType ?? null,
      revenueCatProductId: params.revenueCatProductId ?? null,
      origin: params.origin ?? null,
      periodStart: params.periodStart ?? null,
      periodEnd: params.periodEnd ?? null,
      metadata: params.metadata ?? null,
    };
    const [event] = await this.db.insert(subscriptionEvents).values(data).returning();
    return event!;
  }

  async getEventHistory(userId: string, opts: { limit?: number; offset?: number; eventTypes?: SubscriptionEventType[] } = {}): Promise<SubscriptionEvents[]> {
    const { limit = 50, offset = 0, eventTypes } = opts;
    const conditions = [eq(subscriptionEvents.userId, userId)];
    if (eventTypes?.length) conditions.push(inArray(subscriptionEvents.eventType, eventTypes));
    return this.db.select().from(subscriptionEvents)
      .where(and(...conditions))
      .orderBy(desc(subscriptionEvents.createdAt))
      .limit(limit).offset(offset);
  }

  async getEventCountByType(userId: string): Promise<Record<string, number>> {
    const results = await this.db
      .select({ eventType: subscriptionEvents.eventType, count: sql<number>`count(*)::int` })
      .from(subscriptionEvents).where(eq(subscriptionEvents.userId, userId))
      .groupBy(subscriptionEvents.eventType);
    return results.reduce((acc, r) => { acc[r.eventType] = r.count; return acc; }, {} as Record<string, number>);
  }
}

```

### Backend/src/repositories/SubscriptionRepository.ts

```ts
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { subscriptions } from '../db/schema.js';
import type { Subscriptions, NewSubscriptions } from '../db/schema.js';
import { LRUCache } from '../lib/lruCache.js';
import { invalidateAuthPluginCache } from './UserRepository.js';

const subscriptionCache = new LRUCache<Subscriptions>({ maxSize: 50_000, ttlMs: 30_000 });

export class SubscriptionRepository {
  constructor(private db: Database) {}

  async findByUserId(userId: string): Promise<Subscriptions | null> {
    const cached = subscriptionCache.get(`sub:${userId}`);
    if (cached !== undefined) return cached;
    const [row] = await this.db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId)).limit(1);
    const result = row || null;
    if (result) subscriptionCache.set(`sub:${userId}`, result);
    return result;
  }

  async createIfMissing(data: NewSubscriptions): Promise<{ subscription: Subscriptions; created: boolean }> {
    try {
      const [inserted] = await this.db.insert(subscriptions).values(data)
        .onConflictDoNothing({ target: subscriptions.userId }).returning();
      if (inserted) {
        subscriptionCache.set(`sub:${inserted.userId}`, inserted);
        return { subscription: inserted, created: true };
      }
    } catch {}
    const existing = await this.findByUserId(data.userId);
    if (existing) return { subscription: existing, created: false };
    throw new Error(`Failed to create subscription for user ${data.userId}`);
  }

  async upsert(userId: string, data: Partial<Omit<NewSubscriptions, 'id' | 'userId'>>): Promise<Subscriptions> {
    const insertData: NewSubscriptions = {
      id: crypto.randomUUID(), userId,
      tier: data.tier ?? 'free',
      status: data.status ?? 'active',
      method: data.method ?? null,
      origin: data.origin ?? null,
      billingPeriod: data.billingPeriod ?? null,
      currentPeriodStart: data.currentPeriodStart ?? null,
      currentPeriodEnd: data.currentPeriodEnd ?? null,
      canceledAt: data.canceledAt ?? null,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      trialStart: data.trialStart ?? null,
      trialEnd: data.trialEnd ?? null,
      dailyLimit: data.dailyLimit ?? null,
      metadata: data.metadata ?? null,
    };
    const updateData = Object.fromEntries(
      Object.entries({ ...data, updatedAt: new Date() }).filter(([, v]) => v !== undefined)
    ) as Partial<Subscriptions>;
    const [row] = await this.db.insert(subscriptions).values(insertData)
      .onConflictDoUpdate({ target: subscriptions.userId, set: updateData }).returning();
    if (!row) throw new Error(`Failed to upsert subscription for user ${userId}`);
    subscriptionCache.set(`sub:${userId}`, row);
    invalidateAuthPluginCache(userId);
    return row;
  }

  async updateByUserId(userId: string, data: Partial<Subscriptions>): Promise<Subscriptions | null> {
    const [updated] = await this.db.update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId)).returning();
    if (updated) subscriptionCache.set(`sub:${userId}`, updated);
    else subscriptionCache.invalidate(`sub:${userId}`);
    invalidateAuthPluginCache(userId);
    return updated || null;
  }

  async getOrCreate(userId: string, options?: { allowTrial?: boolean }): Promise<Subscriptions> {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;
    const allowTrial = options?.allowTrial ?? true;
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { subscription } = await this.createIfMissing(allowTrial
      ? { id: crypto.randomUUID(), userId, tier: 'pro', status: 'active', method: 'trialing', trialStart: now, trialEnd }
      : { id: crypto.randomUUID(), userId, tier: 'free', status: 'active', method: null, trialStart: null, trialEnd: null }
    );
    return subscription;
  }
}

```

### Backend/src/repositories/UserRepository.ts

```ts
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { users } from '../db/schema.js';
import type { NewUsers, SubscriptionStatus, SubscriptionTier } from '../db/schema.js';
import { LRUCache } from '../lib/lruCache.js';
import { subscriptions, uploads } from '../db/schema.js';

export type UserAuthData = {
  id: string;
  email: string;
  subscriptionTier?: SubscriptionTier | null;
  subscriptionStatus?: SubscriptionStatus | null;
};

const authPluginCache = new LRUCache<UserAuthData>({
  maxSize: 50_000,
  ttlMs: 60_000,
});

export function invalidateAuthPluginCache(userId: string): void {
  authPluginCache.invalidate(`auth:${userId}`);
}

export class UserRepository {
  constructor(private db: Database) {}

  async getAuthDataForPlugin(userId: string): Promise<UserAuthData | null> {
    const cached = authPluginCache.get(`auth:${userId}`);
    if (cached) return cached;

    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        subscriptionTier: subscriptions.tier,
        subscriptionStatus: subscriptions.status,
      })
      .from(users)
      .leftJoin(subscriptions, eq(users.id, subscriptions.userId))
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0] ?? null;
    if (row) authPluginCache.set(`auth:${userId}`, row);
    return row;
  }

  async findById(userId: string) {
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string) {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async createIfMissing(data: NewUsers): Promise<{ created: boolean }> {
    const existing = await this.findById(data.id);
    if (existing) return { created: false };
    await this.db.insert(users).values(data).onConflictDoNothing();
    return { created: true };
  }

  async getProfile(userId: string) {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        profileImageUrl: users.profileImageUrl,
        subscriptionTier: subscriptions.tier,
        subscriptionStatus: subscriptions.status,
      })
      .from(users)
      .leftJoin(subscriptions, eq(users.id, subscriptions.userId))
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
    authPluginCache.invalidate(`auth:${userId}`);
  }

  async createUploadRecord(
    userId: string,
    input: { objectKey: string; bucket: string; contentType: string | null },
  ): Promise<void> {
    await this.db.insert(uploads).values({
      id: crypto.randomUUID(),
      userId,
      objectKey: input.objectKey,
      bucket: input.bucket,
      contentType: input.contentType,
    });
  }

  async deleteById(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId));
    authPluginCache.invalidate(`auth:${userId}`);
  }
}

```

### Backend/src/routes/auth.ts

```ts
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { clerkClient } from '@clerk/fastify';
import { AuthError } from '../errors/index.js';
import { createAuthHook } from '../lib/routeHelpers.js';

function getDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  fallback?: string | null;
}) {
  return [input.firstName, input.lastName].filter(Boolean).join(' ').trim()
    || input.fallback
    || (input.email ? input.email.split('@')[0] : 'Builder');
}

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/me', {
    preHandler: createAuthHook(fastify),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.id) throw AuthError.unauthorized();

    if (fastify.env.ANHEDRAL_DEMO === 'true') {
      return reply.send({
        user: {
          id: 'user_demo',
          email: 'demo@anhedral.dev',
          firstName: 'Demo',
          lastName: 'Builder',
          displayName: 'demo Demo',
          imageUrl: null,
        },
      });
    }

    const clerkUser = await clerkClient.users.getUser(req.user.id);
    const userData = await fastify.repos.users.getProfile(req.user.id);
    const primaryEmail = clerkUser.emailAddresses.find(
      (e: { id: string }) => e.id === clerkUser.primaryEmailAddressId
    );
    const email = primaryEmail?.emailAddress ?? '';
    const displayName = getDisplayName({
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      email,
      fallback: userData?.displayName ?? null,
    });

    return reply.send({
      user: {
        id: clerkUser.id,
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        displayName,
        imageUrl: userData?.profileImageUrl ?? clerkUser.imageUrl,
      },
    });
  });

  fastify.post('/signout', {
    preHandler: createAuthHook(fastify),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    return reply.send({ success: true });
  });

  fastify.delete('/account', {
    preHandler: createAuthHook(fastify),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    await clerkClient.users.deleteUser(req.user.id);
    await fastify.repos.users.deleteById(req.user.id);
    return reply.code(204).send();
  });
};

export default authRoutes;

```

### Backend/src/routes/health.ts

```ts
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('', async (_req, reply) => {
    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  fastify.get('/ready', async (_req, reply) => {
    try {
      await fastify.repos.users.findByEmail('health-check@test.invalid');
      return reply.send({ ok: true, database: 'connected' });
    } catch {
      return reply.status(503).send({ ok: false, error: 'Database connection failed' });
    }
  });
};

export default healthRoutes;

```

### Backend/src/routes/index.ts

```ts
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import clerkAuthPlugin from '../plugins/clerkAuth.js';
import health from './health.js';
import auth from './auth.js';
import subscriptions from './subscriptions.js';
import storage from './storage.js';
import cors from '@fastify/cors';

const routes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const FRONTEND_URL = fastify.env?.FRONTEND_URL;
  const extensionOrigins = String(fastify.env?.EXTENSION_ORIGINS ?? '')
    .split(',').map(o => o.trim()).filter(o => o.length > 0);
  const restrictedOrigins = [...new Set([
    ...(FRONTEND_URL ? [FRONTEND_URL] : []),
    ...extensionOrigins,
  ])];
  const restrictedCorsOrigin = restrictedOrigins.length > 0 ? restrictedOrigins : false;

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'OPTIONS'], allowedHeaders: ['Content-Type'] });
    await app.register(health);
  }, { prefix: '/health' });

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Platform'] });
    await app.register(clerkAuthPlugin);
    await app.register(auth);
  }, { prefix: '/auth' });

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Platform', 'X-RevenueCat-Signature'] });
    await app.register(subscriptions);
  }, { prefix: '/subscriptions' });

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Platform'] });
    await app.register(clerkAuthPlugin);
    await app.register(storage);
  }, { prefix: '/storage' });
};

export default routes;

```

### Backend/src/routes/storage.ts

```ts
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateUploadRequestSchema } from '@shared/contracts';
import { AuthError, ServerError, ValidationError } from '../errors/index.js';
import { createAuthHook } from '../lib/routeHelpers.js';
import { createSignedDownloadUrl, createSignedUploadUrl, deleteObjectFromR2, isR2Configured } from '../lib/r2.js';

const SIGNED_URL_EXPIRES_IN = 60 * 10;

function sanitizeFileName(fileName: string | undefined) {
  const fallback = 'upload';
  const cleaned = (fileName ?? fallback)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

function objectKeyForUser(userId: string, fileName: string | undefined) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `${safeUserId}--${crypto.randomUUID()}--${sanitizeFileName(fileName)}`;
}

function assertUserOwnsObject(userId: string, objectKey: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]+/g, '_');
  if (!objectKey.startsWith(`${safeUserId}--`)) {
    throw AuthError.forbidden();
  }
}

const storageRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/uploads', {
    preHandler: createAuthHook(fastify),
  }, async (req, reply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    if (!isR2Configured()) throw ServerError.missingConfiguration('R2');

    const parsed = CreateUploadRequestSchema.safeParse(req.body);
    if (!parsed.success) throw ValidationError.invalidFormat('body', 'CreateUploadRequest');
    const input = parsed.data;
    const objectKey = objectKeyForUser(req.user.id, input.fileName);
    const signed = await createSignedUploadUrl({
      objectKey,
      contentType: input.contentType,
    }, SIGNED_URL_EXPIRES_IN);

    await fastify.repos.users.createUploadRecord(req.user.id, {
      objectKey,
      bucket: signed.bucket,
      contentType: input.contentType,
    });

    return reply.send({
      objectKey,
      uploadUrl: signed.uploadUrl,
      expiresIn: signed.expiresIn,
      headers: { 'Content-Type': input.contentType },
    });
  });

  fastify.get<{ Params: { key: string } }>('/files/:key', {
    preHandler: createAuthHook(fastify),
  }, async (req, reply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    if (!isR2Configured()) throw ServerError.missingConfiguration('R2');

    const objectKey = decodeURIComponent(req.params.key);
    assertUserOwnsObject(req.user.id, objectKey);
    return reply.send(await createSignedDownloadUrl(objectKey, SIGNED_URL_EXPIRES_IN));
  });

  fastify.delete<{ Params: { key: string } }>('/files/:key', {
    preHandler: createAuthHook(fastify),
  }, async (req, reply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    if (!isR2Configured()) throw ServerError.missingConfiguration('R2');

    const objectKey = decodeURIComponent(req.params.key);
    assertUserOwnsObject(req.user.id, objectKey);
    await deleteObjectFromR2(objectKey);
    return reply.code(204).send();
  });
};

export default storageRoutes;

```

### Backend/src/routes/subscriptions.ts

```ts
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import clerkAuthPlugin from '../plugins/clerkAuth.js';
import { SubscriptionService } from '../services/SubscriptionService.js';
import { AuthError } from '../errors/index.js';
import { verifyRevenueCatWebhook, verifyRevenueCatWebhookAuthorization } from '../lib/revenuecat.js';
import { createAuthHook } from '../lib/routeHelpers.js';
import { CACHE_SECONDS } from '../lib/constants.js';

const subscriptionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const service = new SubscriptionService(fastify);

  fastify.get('/pricing', async (_req, reply) => {
    const data = await service.getPricing();
    reply.header('Cache-Control', `private, max-age=${CACHE_SECONDS.SUBSCRIPTIONS_PRICING}`);
    return reply.send(data);
  });

  await fastify.register(async (app) => {
    await app.register(clerkAuthPlugin);

    app.get<{ Querystring: { refresh?: boolean } }>('/entitlements/me', {
      preHandler: createAuthHook(app),
    }, async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) throw AuthError.unauthorized();
      if (app.env.ANHEDRAL_DEMO === 'true') {
        reply.header('Cache-Control', 'private, no-store');
        return reply.send({
          pro: true,
          inTrial: false,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          method: 'paid',
          managementUrl: 'https://app.revenuecat.com/',
          cancelAtPeriodEnd: false,
        });
      }
      const refreshRaw = (req.query as unknown as { refresh?: unknown }).refresh;
      const requestedRefresh = refreshRaw === true || refreshRaw === 'true' || refreshRaw === 1 || refreshRaw === '1';
      const forceRefresh = Boolean(app.env.RC_SECRET_API_KEY) && requestedRefresh;
      const data = await service.getEntitlementWithTrial(userId, { refreshRevenueCat: forceRefresh }, req);
      reply.header('Cache-Control', 'private, no-store');
      return reply.send(data);
    });
  });

  await fastify.register(async (app) => {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      try {
        const raw = typeof body === 'string' ? body : body.toString();
        (req as unknown as { rawBody?: string }).rawBody = raw;
        done(null, raw.trim().length === 0 ? {} : JSON.parse(raw));
      } catch (err) { done(err as Error, undefined); }
    });

    app.post('/webhooks/revenuecat', async (req: FastifyRequest, reply) => {
      const rawBody = (req as unknown as { rawBody?: string }).rawBody;
      const bodyString = rawBody ?? (typeof req.body === 'string' ? req.body : '');
      const signature = req.headers['x-revenuecat-signature'] as string | undefined;
      const authorization = req.headers.authorization as string | undefined;
      const webhookSecret = fastify.env.RC_WEBHOOK_SECRET;

      if (!webhookSecret && fastify.env.NODE_ENV === 'production') {
        return reply.code(500).send({ ok: false, error: 'webhook_not_configured' });
      }
      if (webhookSecret) {
        if (!bodyString) return reply.code(400).send({ ok: false, error: 'invalid_body' });
        const verifiedByAuth = verifyRevenueCatWebhookAuthorization(authorization, webhookSecret);
        const verifiedBySig  = signature ? verifyRevenueCatWebhook(bodyString, signature, webhookSecret) : false;
        if (!verifiedByAuth && !verifiedBySig) return reply.code(401).send({ ok: false, error: 'invalid_signature' });
      }

      const parsed = req.body as Record<string, unknown>;
      const event  = (parsed?.event && typeof parsed.event === 'object') ? (parsed.event as Record<string, unknown>) : parsed;
      try { await service.handleRevenueCatWebhook(event, req); } catch (err) {
        fastify.log.error({ msg: '[webhook:revenuecat_failed]', error: (err as Error).message });
      }
      return { ok: true };
    });
  });

};

export default subscriptionRoutes;

```

### Backend/src/services/SubscriptionService.ts

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getRcEntitlement, invalidateRcEntitlementCache } from '../lib/revenuecat.js';
import { TIER_PRICING, TIER_LIMITS } from '../lib/constants.js';
import type { Subscriptions, SubscriptionEventType } from '../db/schema.js';
import type { RecordEventParams } from '../repositories/index.js';
import { runBackgroundTask } from '../lib/routeHelpers.js';

export interface EntitlementWithTrial {
  tier: 'free' | 'pro';
  pro: boolean;
  inTrial: boolean;
  trialEndsAt?: string;
  expiresAt?: string;
  periodStart?: string;
  periodEnd?: string;
  method?: 'trialing' | 'redeemed' | 'paid' | null;
  managementUrl?: string;
  cancelAtPeriodEnd?: boolean;
}

export class SubscriptionService {
  constructor(private fastify: FastifyInstance) {}

  private async recordEvent(req: FastifyRequest | undefined, params: RecordEventParams, label: string): Promise<void> {
    const task = this.fastify.repos.subscriptionEvents.recordEvent(params);
    if (req) { runBackgroundTask(req, task, label); return; }
    await task;
  }

  async getPricing() {
    return {
      tiers: [
        { tier: TIER_PRICING.free.tier, displayName: TIER_PRICING.free.displayName, description: TIER_PRICING.free.description, priceMonthly: TIER_PRICING.free.priceMonthly, priceYearly: TIER_PRICING.free.priceYearly, currency: TIER_PRICING.free.currency, limits: { dailyLimit: TIER_LIMITS.free.dailyLimit } },
        { tier: TIER_PRICING.pro.tier,  displayName: TIER_PRICING.pro.displayName,  description: TIER_PRICING.pro.description,  priceMonthly: TIER_PRICING.pro.priceMonthly,  priceYearly: TIER_PRICING.pro.priceYearly,  currency: TIER_PRICING.pro.currency,  limits: { dailyLimit: TIER_LIMITS.pro.dailyLimit }, paymentInfo: { revenueCatEntitlementId: this.fastify.env.RC_ENTITLEMENT_ID, revenueCatOfferingId: this.fastify.env.RC_OFFERING_ID } },
      ],
    };
  }

  private async getEntitlement(appUserId: string, opts?: { bypassCache?: boolean }) {
    const key = this.fastify.env.RC_SECRET_API_KEY;
    if (!key) throw new Error('RevenueCat not configured');
    return getRcEntitlement(appUserId, this.fastify.env.RC_ENTITLEMENT_ID || 'pro', key, { bypassCache: opts?.bypassCache });
  }

  async getEntitlementWithTrial(appUserId: string, opts?: { refreshRevenueCat?: boolean }, req?: FastifyRequest): Promise<EntitlementWithTrial> {
    const forceRefresh = opts?.refreshRevenueCat === true;
    let subscription = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    if (!subscription) {
      try { subscription = await this.fastify.repos.subscriptions.getOrCreate(appUserId, { allowTrial: true }); } catch {}
    }

    const now = new Date();
    const hasRC = Boolean(this.fastify.env.RC_SECRET_API_KEY);
    const periodEndMs = subscription?.currentPeriodEnd?.getTime();
    const nearPeriodEnd = typeof periodEndMs === 'number' && periodEndMs - now.getTime() <= 12 * 60 * 60 * 1000;
    const isPaidOrRedeemed = subscription?.method === 'paid' || subscription?.method === 'redeemed';

    const shouldSyncRC = hasRC && (forceRefresh || !subscription || subscription.status !== 'active' || subscription.method === 'trialing' || nearPeriodEnd);

    let rcEnt: Awaited<ReturnType<SubscriptionService['getEntitlement']>> | null = null;
    let rcFailed = false;
    if (shouldSyncRC) {
      try { rcEnt = await this.getEntitlement(appUserId, { bypassCache: forceRefresh }); }
      catch { rcFailed = true; }
    }

    // RC says pro → trust it, sync DB
    if (rcEnt?.pro) {
      const rcEnd   = rcEnt.expiresAt   ? new Date(rcEnt.expiresAt)   : null;
      const rcStart = rcEnt.purchaseDate ? new Date(rcEnt.purchaseDate) : null;
      const method: 'paid' | 'redeemed' = subscription?.method === 'redeemed' ? 'redeemed' : 'paid';
      const cancelAtPeriodEnd = rcEnt.cancelAtPeriodEnd ?? subscription?.cancelAtPeriodEnd ?? false;
      const needsUpdate = subscription?.method !== method || subscription?.status !== 'active' || subscription?.tier !== 'pro'
        || (rcEnd && subscription?.currentPeriodEnd?.getTime() !== rcEnd.getTime())
        || (subscription?.cancelAtPeriodEnd ?? false) !== cancelAtPeriodEnd;

      if (needsUpdate) {
        const wasNotPaid = subscription?.method !== method || subscription?.status !== 'active';
        await this.fastify.repos.subscriptions.upsert(appUserId, {
          tier: 'pro', status: 'active', method, cancelAtPeriodEnd, trialStart: null, trialEnd: null,
          ...(rcStart ? { currentPeriodStart: rcStart } : {}),
          ...(rcEnd   ? { currentPeriodEnd:   rcEnd   } : {}),
        });
        if (wasNotPaid) {
          const eventType: SubscriptionEventType = subscription?.method === 'trialing' ? 'trial_converted' : 'initial_purchase';
          await this.recordEvent(req, { userId: appUserId, subscriptionId: subscription?.id, eventType, previousState: { tier: subscription?.tier, status: subscription?.status, method: subscription?.method }, newState: { tier: 'pro', status: 'active', method }, periodStart: rcStart, periodEnd: rcEnd }, eventType);
        }
      }
      return { tier: 'pro', pro: true, inTrial: false, expiresAt: rcEnt.expiresAt, periodStart: rcStart?.toISOString() ?? subscription?.currentPeriodStart?.toISOString(), periodEnd: rcEnt.expiresAt ?? subscription?.currentPeriodEnd?.toISOString(), method, managementUrl: rcEnt.managementUrl, cancelAtPeriodEnd };
    }

    // Expire paid if RC confirmed not-pro on forced refresh
    if (forceRefresh && !rcFailed && rcEnt && !rcEnt.pro && subscription?.tier === 'pro' && subscription.status === 'active' && isPaidOrRedeemed) {
      await this.expirePaidSubscription(appUserId, rcEnt.expiresAt, req);
      subscription = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    }

    // Trial handling
    if (subscription?.method === 'trialing' && subscription.trialEnd) {
      if (subscription.trialEnd > now) {
        return { tier: 'pro', pro: true, inTrial: true, trialEndsAt: subscription.trialEnd.toISOString(), periodStart: subscription.trialStart?.toISOString(), periodEnd: subscription.trialEnd.toISOString(), method: 'trialing', cancelAtPeriodEnd: false };
      }
      if (subscription.status !== 'expired') {
        await this.expireTrial(appUserId, req);
        subscription = await this.fastify.repos.subscriptions.findByUserId(appUserId);
      }
    }

    // DB says active pro
    if (subscription?.tier === 'pro' && subscription.status === 'active') {
      return { tier: 'pro', pro: true, inTrial: false, expiresAt: subscription.currentPeriodEnd?.toISOString(), periodStart: subscription.currentPeriodStart?.toISOString(), periodEnd: subscription.currentPeriodEnd?.toISOString(), method: subscription.method, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd };
    }

    return { tier: 'free', pro: false, inTrial: false, periodStart: subscription?.currentPeriodStart?.toISOString() ?? subscription?.trialStart?.toISOString(), periodEnd: subscription?.currentPeriodEnd?.toISOString() ?? subscription?.trialEnd?.toISOString(), method: subscription?.method, cancelAtPeriodEnd: false };
  }

  async expireTrial(appUserId: string, req?: FastifyRequest): Promise<void> {
    const sub = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    await this.fastify.repos.subscriptions.updateByUserId(appUserId, { tier: 'free', status: 'expired' });
    await this.recordEvent(req, { userId: appUserId, subscriptionId: sub?.id, eventType: 'trial_expired', previousState: { tier: sub?.tier, status: sub?.status, method: sub?.method }, newState: { tier: 'free', status: 'expired', method: sub?.method }, periodStart: sub?.trialStart, periodEnd: sub?.trialEnd }, 'trial_expired');
  }

  async expirePaidSubscription(appUserId: string, expiresAt?: string, req?: FastifyRequest): Promise<void> {
    const sub = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    const expiresDate = expiresAt ? new Date(expiresAt) : sub?.currentPeriodEnd ?? null;
    await this.fastify.repos.subscriptions.updateByUserId(appUserId, { tier: 'free', status: 'expired', cancelAtPeriodEnd: false, ...(expiresDate ? { currentPeriodEnd: expiresDate } : {}) });
    await this.recordEvent(req, { userId: appUserId, subscriptionId: sub?.id, eventType: 'subscription_expired', previousState: { tier: sub?.tier, status: sub?.status, method: sub?.method }, newState: { tier: 'free', status: 'expired', method: sub?.method }, periodStart: sub?.currentPeriodStart, periodEnd: expiresDate }, 'subscription_expired');
  }

  async handleRevenueCatWebhook(event: Record<string, unknown>, req?: FastifyRequest): Promise<void> {
    const appUserId = event.app_user_id as string | undefined;
    if (!appUserId) return;

    const rcEventType   = event.type as string | undefined;
    const entitlementId = this.fastify.env.RC_ENTITLEMENT_ID || 'pro';
    const entIds        = event.entitlement_ids as unknown;
    const entIdSingle   = event.entitlement_id as string | null | undefined;
    const hasEnt = Array.isArray(entIds) ? entIds.some(x => x === entitlementId) : entIdSingle === entitlementId;

    const expirationMs = event.expiration_at_ms as number | undefined;
    const expiresAt    = typeof expirationMs === 'number' ? new Date(expirationMs) : null;
    if (expiresAt && isNaN(expiresAt.getTime())) return;

    const now      = new Date();
    const isActive = hasEnt && (expiresAt ? expiresAt > now : false);
    const tier     = isActive ? 'pro' : 'free';
    const status   = isActive ? 'active' : 'expired';
    const method   = isActive ? 'paid' : null;

    const purchasedMs  = event.purchased_at_ms as number | undefined;
    const periodStart  = typeof purchasedMs === 'number' ? new Date(purchasedMs) : null;
    const validStart   = periodStart && !isNaN(periodStart.getTime()) ? periodStart : null;
    const storeRaw     = event.store as string | undefined;
    const storeNorm    = storeRaw?.toLowerCase();
    const willRenew    = event.will_renew as boolean | undefined;
    const cancelReason = event.cancel_reason as string | undefined;
    const price        = event.price as number | undefined;
    const currency     = event.currency as string | undefined;
    const transactionId = event.transaction_id as string | undefined;
    const productId    = event.product_id as string | undefined;
    const origin       = storeNorm === 'app_store' ? 'apple' : storeNorm === 'play_store' ? 'google' : (storeNorm === 'stripe' || storeNorm === 'rc_billing') ? 'web' : undefined;

    const currentSub = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    await this.fastify.repos.subscriptions.upsert(appUserId, {
      tier: tier as 'free' | 'pro', status: status as 'active' | 'expired', method,
      origin: origin as 'web' | 'apple' | 'google' | undefined,
      currentPeriodStart: validStart, currentPeriodEnd: expiresAt,
      billingPeriod: (event.period_type as string | undefined) ?? null,
      canceledAt: (rcEventType === 'CANCELLATION' || rcEventType === 'EXPIRATION') ? new Date() : null,
      cancelAtPeriodEnd: willRenew === false && isActive,
      trialStart: null, trialEnd: null,
      metadata: { ...(productId ? { revenueCatProductId: productId } : {}), ...(cancelReason ? { cancelReason } : {}), lastWebhookUpdate: new Date().toISOString() },
    });

    invalidateRcEntitlementCache(appUserId, entitlementId);

    const eventMap: Record<string, string> = {
      INITIAL_PURCHASE: 'initial_purchase', RENEWAL: 'renewal', PRODUCT_CHANGE: 'product_change',
      CANCELLATION: 'cancellation_scheduled', UNCANCELLATION: 'cancellation_unscheduled',
      EXPIRATION: 'subscription_expired', BILLING_ISSUE: 'billing_issue', BILLING_ISSUE_RESOLVED: 'billing_recovered',
    };
    const mappedType = rcEventType ? (eventMap[rcEventType] ?? (!isActive ? 'subscription_expired' : 'renewal')) : null;
    if (mappedType) {
      await this.recordEvent(req, {
        userId: appUserId, subscriptionId: currentSub?.id, eventType: mappedType as SubscriptionEventType,
        previousState: { tier: currentSub?.tier, status: currentSub?.status, method: currentSub?.method },
        newState: { tier: tier as 'free' | 'pro', status: status as 'active' | 'expired', method },
        revenueCatEventType: rcEventType, revenueCatProductId: productId,
        origin: origin as 'web' | 'apple' | 'google' | undefined,
        periodStart: validStart, periodEnd: expiresAt,
        metadata: { ...(rcEventType ? { revenueCatEventType: rcEventType } : {}), ...(productId ? { revenueCatProductId: productId } : {}), ...(storeRaw ? { store: storeRaw } : {}), ...(transactionId ? { transactionId } : {}), ...(price !== undefined && currency ? { price: { amount: price, currency } } : {}) },
      }, 'revenuecat_event');
    }
  }
}

```

### Backend/src/types/fastify-env.d.ts

```ts
import 'fastify';
import type { AppEnv } from '../types/index.js';

type FastifyReplyType = import('fastify').FastifyReply;
type FastifyRequestType = import('fastify').FastifyRequest;

declare module 'fastify' {
  interface FastifyInstance {
    env: AppEnv;
    authenticate?: (req: FastifyRequestType, reply: FastifyReplyType) => Promise<void> | void;
  }

  interface FastifyRequest {
    _startedAt?: number;
  }
}

```

### Backend/src/types/fastify.d.ts

```ts
import 'fastify';
import type { AppConfig } from '../config/index.js';
import type { Repositories } from '../repositories/index.js';
import type { AppUser } from '../types/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    config: AppConfig;
    repos: Repositories;
  }

  interface FastifyRequest {
    user?: AppUser;
    _startedAt?: number;
    waitUntil?: (promise: Promise<unknown>) => void;
  }
}

export {};

```

### Backend/src/types/index.ts

```ts
import type { SubscriptionTier, SubscriptionStatus } from '../db/schema.js';

export interface AppUser {
  id: string;
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
}

export interface AppEnv {
  PORT: number;
  NODE_ENV: string;
  LOG_LEVEL: string;
  ANHEDRAL_DEMO?: string | null;
  CLERK_PUBLISHABLE_KEY?: string | null;
  CLERK_SECRET_KEY?: string | null;
  FRONTEND_URL?: string | null;
  EXTENSION_ORIGINS?: string | null;
  DATABASE_URL?: string | null;
  R2_ACCOUNT_ID?: string | null;
  R2_ACCESS_KEY_ID?: string | null;
  R2_SECRET_ACCESS_KEY?: string | null;
  R2_BUCKET?: string | null;
  RC_SECRET_API_KEY: string;
  RC_WEBHOOK_SECRET: string;
  RC_ENTITLEMENT_ID: string;
  RC_OFFERING_ID: string;
}

```

### Backend/test/health.test.ts

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Health Routes', () => {
  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
  });
});

```

### Backend/test/setup.ts

```ts
import dotenv from 'dotenv';
dotenv.config();

```

### Backend/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "rootDir": ".",
    "outDir": "dist",
    "lib": [
      "ESNext",
      "DOM",
      "DOM.Iterable"
    ],
    "types": [
      "node"
    ],
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": [
    "src/**/*",
    "api/**/*"
  ],
  "exclude": [
    "node_modules"
  ]
}

```

### Backend/vercel.json

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm build",
  "devCommand": "vercel dev"
}

```

### Backend/vitest.config.ts

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
  },
});

```

### Extension/.env

```dotenv
# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=

# Backend API URL
VITE_API_URL=http://localhost:8787

# Website URL (for sign-up and subscription links)
VITE_WEBSITE_URL=http://localhost:8081

# Chrome Extension CRX public key (optional, for stable extension ID)
VITE_CRX_PUBLIC_KEY=

# RevenueCat Web Billing URL (optional, for subscription management)
VITE_RC_BILLING_URL=

```

### Extension/.env.example

```dotenv
# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=pk_test_***

# Backend API URL
VITE_API_URL=http://localhost:8787

# Website URL (for sign-up and subscription links)
VITE_WEBSITE_URL=http://localhost:8081

# Chrome Extension CRX public key (optional, for stable extension ID)
VITE_CRX_PUBLIC_KEY=

# RevenueCat Web Billing URL (optional, for subscription management)
VITE_RC_BILLING_URL=

```

### Extension/.gitignore

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
.output
stats.html
stats-*.json
.wxt
web-ext.config.ts

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

```

### Extension/components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/main.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}

```

### Extension/package.json

```json
{
  "name": "demo-chrome-ext",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "postinstall": "wxt prepare",
    "zip": "wxt zip",
    "zip:firefox": "wxt zip -b firefox",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shared/api-client": "workspace:*",
    "@clerk/chrome-extension": "3.1.25",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "clsx": "2.1.1",
    "tailwind-merge": "3.4.0",
    "class-variance-authority": "0.7.1",
    "lucide-react": "0.562.0"
  },
  "devDependencies": {
    "@types/chrome": "0.1.9",
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3",
    "@wxt-dev/module-react": "1.1.5",
    "autoprefixer": "10.4.23",
    "postcss": "8.5.6",
    "tailwindcss": "3.4.19",
    "typescript": "5.9.3",
    "wxt": "0.20.25"
  }
}

```

### Extension/postcss.config.cjs

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

```

### Extension/README.md

```md
# demo Chrome Extension

WXT side-panel extension generated by anhedral.

## Development

``\`bash
pnpm dev
pnpm build
pnpm zip
``\`

Set `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL` in `.env` before using auth-backed routes. Set `VITE_CRX_PUBLIC_KEY` only when you need a stable Chrome extension ID.

## Chrome

Run `pnpm build`, then load `.output/chrome-mv3` as an unpacked extension from `chrome://extensions`.

The extension uses Chrome's Side Panel API. The browser action opens `sidepanel.html`, `wxt.config.ts` declares the `sidePanel` permission and Chrome 114+ minimum version, the background script initializes Clerk, and the content script is ready for page-to-extension messages.

```

### Extension/src/components/ui/button.tsx

```ts
import * as React from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'outline';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

```

### Extension/src/contexts/auth-context.tsx

```ts
import * as React from 'react';
import { ClerkProvider, useAuth as useClerkAuth, useUser } from '@clerk/chrome-extension';
import { APIClient } from '../lib/api';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || 'http://localhost:8081';

function getExtensionUrl(path: string) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

const SIDEPANEL_URL = getExtensionUrl('sidepanel.html');

type AuthState = {
  isSignedIn: boolean;
  isLoading: boolean;
  userId: string | null;
  subscription: {
    status: 'idle' | 'loading' | 'active' | 'inactive' | 'error';
    canAccess: boolean;
    inTrial?: boolean;
    trialEndsAt?: string;
    expiresAt?: string;
    method?: 'trialing' | 'redeemed' | 'paid' | null;
    managementUrl?: string;
    cancelAtPeriodEnd?: boolean;
    error?: string;
  };
};

type AuthContextValue = AuthState & {
  signOut: () => Promise<void>;
  refreshSubscription: (opts?: { refresh?: boolean }) => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, userId, signOut, getToken } = useClerkAuth();
  const { user } = useUser();

  const [subscription, setSubscription] = React.useState<AuthState['subscription']>({
    status: 'idle',
    canAccess: false,
  });

  const apiRef = React.useRef<APIClient | null>(null);

  React.useEffect(() => {
    if (isSignedIn && getToken) {
      apiRef.current = new APIClient(getToken);
    } else {
      apiRef.current = null;
    }
  }, [isSignedIn, getToken]);

  const checkSubscription = React.useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (!apiRef.current || !isSignedIn) {
        setSubscription({ status: 'idle', canAccess: false });
        return;
      }
      setSubscription(prev => ({ ...prev, status: 'loading' }));
      try {
        const result = await apiRef.current.getSubscriptionEntitlements(opts);
        const isPro = result.pro;
        const inTrial = result.inTrial;
        setSubscription({
          status: isPro ? 'active' : 'inactive',
          canAccess: isPro,
          inTrial,
          trialEndsAt: result.trialEndsAt,
          expiresAt: result.expiresAt,
          method: result.method,
          managementUrl: result.managementUrl,
          cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        });
      } catch (error) {
        setSubscription({
          status: 'error',
          canAccess: false,
          error: error instanceof Error ? error.message : 'Failed to check subscription',
        });
      }
    },
    [isSignedIn],
  );

  React.useEffect(() => {
    if (isSignedIn && isLoaded) {
      void checkSubscription({ refresh: true });
    }
  }, [isSignedIn, isLoaded, checkSubscription]);

  const handleSignOut = React.useCallback(async () => {
    setSubscription({ status: 'idle', canAccess: false });
    await signOut();
  }, [signOut]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      isSignedIn: !!isSignedIn,
      isLoading: !isLoaded,
      userId: userId || null,
      subscription,
      signOut: handleSignOut,
      refreshSubscription: (opts?: { refresh?: boolean }) => checkSubscription(opts),
    }),
    [isSignedIn, isLoaded, userId, subscription, handleSignOut, checkSubscription],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl={SIDEPANEL_URL}
      signInFallbackRedirectUrl={SIDEPANEL_URL}
      signUpFallbackRedirectUrl={SIDEPANEL_URL}
    >
      <AuthProviderInner>{children}</AuthProviderInner>
    </ClerkProvider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { WEBSITE_URL };

```

### Extension/src/entrypoints/background.ts

```ts
import { createClerkClient } from '@clerk/chrome-extension/background';

type ChromeWithSidePanel = typeof chrome & {
  sidePanel: {
    setPanelBehavior: (behavior: { openPanelOnActionClick: boolean }) => Promise<void>;
  };
};

export default defineBackground(() => {
  // Initialize Clerk in the background script for cookie-based auth
  void createClerkClient({
    publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '',
  }).catch(() => {});

  // Open the side panel when the extension icon is clicked.
  (chrome as ChromeWithSidePanel).sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

```

### Extension/src/entrypoints/content.ts

```ts
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'ANHEDRAL_PAGE_SNAPSHOT') return false;

      sendResponse({
        title: document.title,
        location: window.location.href,
      });
      return true;
    });
  },
});

```

### Extension/src/entrypoints/sidepanel/app.tsx

```ts
import * as React from 'react';
import { useAuth } from '../../contexts/auth-context';
import { SignIn } from '@clerk/chrome-extension';
import { Button } from '../../components/ui/button';

type PageSnapshot = {
  title: string;
  location: string;
};

export function SidePanelApp() {
  const { isSignedIn, isLoading, signOut, subscription } = useAuth();
  const [page, setPage] = React.useState<PageSnapshot | null>(null);
  const [pageError, setPageError] = React.useState<string | null>(null);

  const readActivePage = React.useCallback(async () => {
    setPageError(null);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      setPageError('No active tab is available.');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'ANHEDRAL_PAGE_SNAPSHOT' });
      setPage(response as PageSnapshot);
    } catch {
      setPageError('Refresh the active page, then try again.');
    }
  }, []);

  if (isLoading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>;
  }

  if (!isSignedIn) {
    return (
      <div style={{ padding: 24 }}>
        <SignIn />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Welcome!</h2>
      <p>Subscription: {subscription.status}</p>
      <Button type="button" onClick={() => void readActivePage()}>Read active page</Button>
      {page ? (
        <div style={{ marginTop: 16 }}>
          <strong>{page.title || 'Untitled page'}</strong>
          <p style={{ overflowWrap: 'anywhere' }}>{page.location}</p>
        </div>
      ) : null}
      {pageError ? <p style={{ color: 'hsl(var(--destructive))' }}>{pageError}</p> : null}
      <Button type="button" variant="outline" onClick={signOut}>Sign Out</Button>
    </div>
  );
}

```

### Extension/src/entrypoints/sidepanel/index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>

```

### Extension/src/entrypoints/sidepanel/main.tsx

```ts
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../../contexts/auth-context';
import { SidePanelApp } from './app';
import '../../styles/main.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <AuthProvider>
        <SidePanelApp />
      </AuthProvider>
    </React.StrictMode>
  );
}

```

### Extension/src/lib/api.ts

```ts
import { ApiClient } from '@shared/api-client';

export class APIClient {
  constructor(private getToken: () => Promise<string | null>) {}

  private client() {
    return new ApiClient({
      baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:8787',
      getToken: this.getToken,
      platform: 'extension',
    });
  }

  getMe() {
    return this.client().getMe();
  }

  getSubscriptionEntitlements(options?: { refresh?: boolean }) {
    return this.client().getSubscriptionEntitlements(options);
  }
}

```

### Extension/src/lib/utils.ts

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

```

### Extension/src/styles/main.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 63.9%;
    --radius: 0.5rem;
  }

  * {
    border-color: hsl(var(--border));
  }

  body {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

```

### Extension/tailwind.config.cjs

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};

```

### Extension/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": [
      "DOM",
      "DOM.Iterable",
      "ESNext"
    ],
    "types": [
      "wxt/browser",
      "@wxt-dev/module-react",
      "chrome"
    ],
    "paths": {
      "@/*": [
        "./src/*"
      ]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".wxt/wxt.d.ts"
  ],
  "exclude": [
    "node_modules",
    ".output",
    "dist"
  ]
}

```

### Extension/wxt.config.ts

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: () => {
    const crxPublicKey = process.env.VITE_CRX_PUBLIC_KEY || '';

    return {
      name: 'demo',
      description: 'demo Chrome Extension',
      version: '0.1.0',
      ...(crxPublicKey ? { key: crxPublicKey } : {}),
      minimum_chrome_version: '114',
      permissions: ['activeTab', 'cookies', 'storage', 'sidePanel'],
      host_permissions: [],
      action: {
        default_title: 'Open demo',
      },
      side_panel: {
        default_path: 'sidepanel.html',
      },
    };
  },
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    build: {
      chunkSizeWarningLimit: 3000,
    },
  }),
});

```

### Frontend/.env

```dotenv
# Clerk
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_demo_placeholder

# Backend API URL
EXPO_PUBLIC_API_URL=http://localhost:8787

# RevenueCat
EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro
EXPO_PUBLIC_RC_API_KEY_IOS=appl_demo_placeholder
EXPO_PUBLIC_RC_API_KEY_ANDROID=goog_demo_placeholder
EXPO_PUBLIC_RC_WEB_API_KEY=rcb_demo_placeholder

```

### Frontend/.env.example

```dotenv
# Clerk
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_***

# Backend API URL
EXPO_PUBLIC_API_URL=http://localhost:8787

# RevenueCat
EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro
EXPO_PUBLIC_RC_API_KEY_IOS=appl_***
EXPO_PUBLIC_RC_API_KEY_ANDROID=goog_***
EXPO_PUBLIC_RC_WEB_API_KEY=rcb_***

```

### Frontend/.gitignore

```
# Learn more https://docs.github.com/en/get-started/getting-started-with-git/ignoring-files
# dependencies
node_modules/
# Expo
.expo/
dist/
web-build/
# Native
*.orig.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision
# Metro
.metro-health-check*
# debug
npm-debug.*
yarn-debug.*
yarn-error.*
# macOS
.DS_Store
*.pem
# local env files
.env*.local
# typescript
*.tsbuildinfo
# @generated expo-cli sync-2b81b286409207a5da26e14c78851eb30d8ccbdb
# The following patterns were generated by expo-cli
expo-env.d.ts
# @end expo-cli
.env
.env.*
!.env.example

```

### Frontend/.npmrc

```
node-linker=hoisted
enable-pre-post-scripts=true
```

### Frontend/.prettierrc

```
{
  "printWidth": 100,
  "tabWidth": 2,
  "singleQuote": true,
  "bracketSameLine": true,
  "trailingComma": "es5",
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindFunctions": ["cva"]
}

```

### Frontend/api/client.ts

```ts
import { ApiClient, APIRequestError } from '@shared/api-client';

export class APIClient extends ApiClient {
  constructor(baseUrl: string, getToken: () => Promise<string | null>) {
    super({ baseUrl, getToken, platform: 'frontend' });
  }
}

export { APIRequestError };

```

### Frontend/api/index.ts

```ts
export { APIClient, APIRequestError } from './client';

```

### Frontend/app.json

```json
{
  "expo": {
    "name": "demo",
    "slug": "demo",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "demo",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/images/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      "expo-web-browser",
      "@clerk/expo"
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}

```

### Frontend/app/_layout.tsx

```ts
import '@/global.css';

import { SubscriptionProvider } from '@/contexts/SubscriptionProvider';
import { clerkPublishableKey } from '@/lib/config';
import { NAV_THEME } from '@/lib/theme';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import * as React from 'react';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
        <SubscriptionProvider>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <Routes />
          <PortalHost />
        </SubscriptionProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { isSignedIn, isLoaded } = useAuth();

  React.useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded]);

  if (!isLoaded) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />

      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false, title: 'Sign in' }} />
        <Stack.Screen name="(auth)/sign-up" options={{ presentation: 'modal', title: '', headerTransparent: true, gestureEnabled: false }} />
        <Stack.Screen name="(auth)/reset-password" options={{ title: '', headerShadowVisible: false, headerTransparent: true }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ title: '', headerShadowVisible: false, headerTransparent: true }} />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)/system" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

```

### Frontend/app/(app)/system.tsx

```ts
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAccount } from '@/hooks/useAccount';
import { useSubscription } from '@/hooks/useSubscription';
import { Stack } from 'expo-router';
import { CheckCircleIcon, CircleAlertIcon, CreditCardIcon, DatabaseIcon } from 'lucide-react-native';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

export default function SystemScreen() {
  const { account, loading, error, refresh } = useAccount();
  const subscription = useSubscription();

  const subscriptionLabel = React.useMemo(() => {
    if (subscription.isPaid) return 'Paid';
    if (subscription.isTrial) return `Trial, ${subscription.trialDaysRemaining} days left`;
    if (subscription.isRedeemed) return 'Redeemed';
    if (subscription.canAccess) return 'Active';
    return 'Inactive';
  }, [subscription.canAccess, subscription.isPaid, subscription.isRedeemed, subscription.isTrial, subscription.trialDaysRemaining]);

  const runSubscriptionAction = React.useCallback(async () => {
    if (subscription.managementUrl) {
      await subscription.manageSubscription();
      return;
    }

    await subscription.subscribe('monthly');
  }, [subscription]);

  return (
    <>
      <Stack.Screen
        options={{
          header: () => (
            <View className="top-safe flex-row items-center justify-between bg-background px-4 py-3">
              <ThemeToggle />
              <UserMenu />
            </View>
          ),
        }}
      />

      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="px-4 pb-10 pt-4 sm:px-6"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}>
        <View className="mx-auto w-full max-w-3xl gap-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-left text-2xl">System status</CardTitle>
            </CardHeader>
            <CardContent className="flex-row flex-wrap gap-2">
              <Button onPress={() => void runSubscriptionAction()}>
                <Text>{subscription.managementUrl ? 'Manage subscription' : 'Open paywall'}</Text>
              </Button>
              <Button variant="outline" onPress={() => void refresh()}>
                <Text>Refresh</Text>
              </Button>
            </CardContent>
          </Card>

          <View className="gap-3">
            <Card className="border-border bg-card">
              <CardHeader>
                <View className="flex-row items-center gap-2">
                  {account ? <CheckCircleIcon size={18} color="currentColor" /> : <CircleAlertIcon size={18} color="currentColor" />}
                  <CardTitle className="text-left text-lg">Authenticated API</CardTitle>
                </View>
              </CardHeader>
              <CardContent className="gap-1">
                <Text className="text-sm text-muted-foreground">{account ? 'Connected' : loading ? 'Loading' : 'Unavailable'}</Text>
                {account ? <Text>{account.email}</Text> : null}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <View className="flex-row items-center gap-2">
                  <CreditCardIcon size={18} color="currentColor" />
                  <CardTitle className="text-left text-lg">Subscription entitlement</CardTitle>
                </View>
              </CardHeader>
              <CardContent className="gap-1">
                <Text>{subscriptionLabel}</Text>
                {subscription.expiresAt ? <Text className="text-sm text-muted-foreground">Expires {new Date(subscription.expiresAt).toLocaleDateString()}</Text> : null}
                {subscription.cancelAtPeriodEnd ? <Text className="text-sm text-muted-foreground">Cancels at period end</Text> : null}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <View className="flex-row items-center gap-2">
                  <DatabaseIcon size={18} color="currentColor" />
                  <CardTitle className="text-left text-lg">Database record</CardTitle>
                </View>
              </CardHeader>
              <CardContent className="gap-1">
                <Text>{account?.id ?? 'Not loaded'}</Text>
                <Text className="text-sm text-muted-foreground">Use this route as the starting point for your product data.</Text>
              </CardContent>
            </Card>
          </View>

          {error ? (
            <Card className="rounded-[24px] border-amber-300/60 bg-amber-50 dark:bg-amber-500/10">
              <CardContent className="px-5 py-5">
                <Text className="text-sm leading-6 text-amber-900 dark:text-amber-100">
                  API error: {error}
                </Text>
              </CardContent>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

```

### Frontend/app/(auth)/forgot-password.tsx

```ts
import { ForgotPasswordForm } from '@/components/forgot-password-form';
import * as React from 'react';
import { ScrollView, View } from 'react-native';

export default function ForgotPasswordScreen() {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="sm:flex-1 items-center justify-center p-4 py-8 sm:py-4 sm:p-6 mt-safe"
      keyboardDismissMode="interactive">
      <View className="w-full max-w-sm">
        <ForgotPasswordForm />
      </View>
    </ScrollView>
  );
}

```

### Frontend/app/(auth)/reset-password.tsx

```ts
import { ResetPasswordForm } from '@/components/reset-password-form';
import * as React from 'react';
import { ScrollView, View } from 'react-native';

export default function ResetPasswordScreen() {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="sm:flex-1 items-center justify-center p-4 py-8 sm:py-4 sm:p-6 mt-safe"
      keyboardDismissMode="interactive">
      <View className="w-full max-w-sm">
        <ResetPasswordForm />
      </View>
    </ScrollView>
  );
}

```

### Frontend/app/(auth)/sign-in.tsx

```ts
import { SignInForm } from '@/components/sign-in-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { Text } from '@/components/ui/text';
import { Link } from 'expo-router';
import { ScrollView, View } from 'react-native';

export default function SignInScreen() {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="min-h-full bg-background px-4 pb-10 pt-6 sm:px-6"
      keyboardDismissMode="interactive">
      <View className="mx-auto w-full max-w-5xl gap-6">
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <View>
            <Text className="text-lg font-semibold">demo</Text>
          </View>
          <ThemeToggle />
        </View>

        <View className="gap-4 sm:flex-row">
          <View className="flex-1 border border-border bg-card px-6 py-8">
            <Text className="text-2xl font-semibold">Sign in</Text>
            <Text className="mt-3 text-muted-foreground">
              Access the protected application area.
            </Text>
            <Link href="/" className="mt-6 text-sm underline underline-offset-4">
              Back
            </Link>
          </View>

          <View className="w-full sm:max-w-md">
            <SignInForm />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

```

### Frontend/app/(auth)/sign-up/_layout.tsx

```ts
import { Stack } from 'expo-router';

const SCREEN_OPTIONS = {
  headerShown: false,
};
export default function SignUpLayout() {
  return <Stack screenOptions={SCREEN_OPTIONS} />;
}

```

### Frontend/app/(auth)/sign-up/index.tsx

```ts
import { SignUpForm } from '@/components/sign-up-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { Text } from '@/components/ui/text';
import { ScrollView, View } from 'react-native';

export default function SignUpScreen() {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="min-h-full bg-background px-4 pb-10 pt-6 sm:px-6"
      keyboardDismissMode="interactive">
      <View className="mx-auto w-full max-w-5xl gap-6">
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <View>
            <Text className="text-lg font-semibold">demo</Text>
          </View>
          <ThemeToggle />
        </View>

        <View className="gap-4 sm:flex-row">
          <View className="w-full sm:max-w-md sm:order-2">
            <SignUpForm />
          </View>

          <View className="flex-1 border border-border bg-card px-6 py-8 sm:order-1">
            <Text className="text-2xl font-semibold">Create account</Text>
            <Text className="mt-3 text-muted-foreground">
              Create a user and continue into the protected application area.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

```

### Frontend/app/(auth)/sign-up/verify-email.tsx

```ts
import { VerifyEmailForm } from '@/components/verify-email-form';
import { ScrollView, View } from 'react-native';

export default function VerifyEmailScreen() {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="sm:flex-1 items-center justify-center p-4 py-8 sm:py-4 sm:p-6 mt-safe ios:mt-0"
      keyboardDismissMode="interactive">
      <View className="w-full max-w-sm">
        <VerifyEmailForm />
      </View>
    </ScrollView>
  );
}

```

### Frontend/app/+html.tsx

```ts
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" className="bg-background">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

```

### Frontend/app/+not-found.tsx

```ts
import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View>
        <Text>This screen doesn't exist.</Text>

        <Link href="/">
          <Text>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

```

### Frontend/app/index.tsx

```ts
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAuth } from '@clerk/expo';
import { Link } from 'expo-router';
import { ScrollView, View } from 'react-native';

export default function HomeScreen() {
  const { isSignedIn } = useAuth();

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="min-h-full px-4 pb-10 pt-6 sm:px-6">
      <View className="mx-auto w-full max-w-3xl gap-4">
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <Text className="text-lg font-semibold">demo</Text>
          <ThemeToggle />
        </View>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-left text-2xl">Application foundation ready</CardTitle>
          </CardHeader>
          <CardContent className="gap-4">
            <Text className="text-muted-foreground">
              Configure providers, then use the protected area to verify auth, API, subscription, database, and storage wiring.
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {isSignedIn ? (
                <Link href="/system" asChild>
                  <Button>
                    <Text>Open app</Text>
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/(auth)/sign-in" asChild>
                    <Button>
                      <Text>Sign in</Text>
                    </Button>
                  </Link>
                  <Link href="/(auth)/sign-up" asChild>
                    <Button variant="outline">
                      <Text>Create account</Text>
                    </Button>
                  </Link>
                </>
              )}
            </View>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}

```

### Frontend/babel.config.js

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};

```

### Frontend/components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "global.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}

```

### Frontend/components/forgot-password-form.tsx

```ts
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useSignIn } from '@clerk/expo';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import * as React from 'react';
import { View } from 'react-native';

export function ForgotPasswordForm() {
  const { email: emailParam = '' } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = React.useState(emailParam);
  const { signIn, fetchStatus } = useSignIn();
  const [error, setError] = React.useState<{ email?: string; password?: string }>({});

  const onSubmit = async () => {
    if (!email) {
      setError({ email: 'Email is required' });
      return;
    }
    if (fetchStatus === 'fetching') {
      return;
    }

    try {
      const { error: createError } = await signIn.create({
        identifier: email,
      });

      if (createError) {
        setError({ email: createError.longMessage ?? createError.message });
        return;
      }

      const { error: sendCodeError } = await signIn.resetPasswordEmailCode.sendCode();

      if (sendCodeError) {
        setError({ email: sendCodeError.longMessage ?? sendCodeError.message });
        return;
      }

      router.push(`/(auth)/reset-password?email=${email}`);
    } catch (err) {
      // See https://go.clerk.com/mRUDrIe for more info on error handling
      setError({ email: err instanceof Error ? err.message : 'Something went wrong' });
    }
  };

  return (
    <View className="gap-6">
      <Card className="border-border/0 shadow-none sm:border-border sm:shadow-sm sm:shadow-black/5">
        <CardHeader>
          <CardTitle className="text-center text-xl sm:text-left">Forgot password?</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Enter your email to reset your password
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <View className="gap-6">
            <View className="gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                defaultValue={email}
                placeholder="m@example.com"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                onChangeText={setEmail}
                onSubmitEditing={onSubmit}
                returnKeyType="send"
              />
              {error.email ? (
                <Text className="text-sm font-medium text-destructive">{error.email}</Text>
              ) : null}
            </View>
            <Button className={cn("w-full", fetchStatus === 'fetching' && 'opacity-50')} onPress={onSubmit}>
              <Text>Reset your password</Text>
            </Button>
          </View>
        </CardContent>
      </Card>
    </View>
  );
}

```

### Frontend/components/reset-password-form.tsx

```ts
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useSignIn } from '@clerk/expo';
import * as React from 'react';
import { TextInput, View } from 'react-native';

export function ResetPasswordForm() {
  const { signIn, fetchStatus } = useSignIn();
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const codeInputRef = React.useRef<TextInput>(null);
  const [error, setError] = React.useState({ code: '', password: '' });

  async function onSubmit() {
    if (fetchStatus === 'fetching') {
      return;
    }
    try {
      const { error: verifyCodeError } = await signIn.resetPasswordEmailCode.verifyCode({
        code,
      });

      if (verifyCodeError) {
        setError({ code: verifyCodeError.longMessage ?? verifyCodeError.message, password: '' });
        return;
      }

      const { error: submitPasswordError } = await signIn.resetPasswordEmailCode.submitPassword({
        password,
      });

      if (submitPasswordError) {
        setError({
          code: '',
          password: submitPasswordError.longMessage ?? submitPasswordError.message,
        });
        return;
      }

      if (signIn.status === 'complete') {
        // Set the active session to
        // the newly created session (user is now signed in)
        await signIn.finalize();
        return;
      }
      // TODO: Handle other statuses
    } catch (err) {
      // See https://go.clerk.com/mRUDrIe for more info on error handling
      const message = err instanceof Error ? err.message : 'Something went wrong';
      const isPasswordMessage = message.toLowerCase().includes('password');
      setError({
        code: isPasswordMessage ? '' : message,
        password: isPasswordMessage ? message : '',
      });
      console.error(err);
    }
  }

  function onPasswordSubmitEditing() {
    codeInputRef.current?.focus();
  }

  return (
    <View className="gap-6">
      <Card className="border-border/0 shadow-none sm:border-border sm:shadow-sm sm:shadow-black/5">
        <CardHeader>
          <CardTitle className="text-center text-xl sm:text-left">Reset password</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Enter the code sent to your email and set a new password
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <View className="gap-6">
            <View className="gap-1.5">
              <View className="flex-row items-center">
                <Label htmlFor="password">New password</Label>
              </View>
              <Input
                id="password"
                secureTextEntry
                onChangeText={setPassword}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={onPasswordSubmitEditing}
              />
              {error.password ? (
                <Text className="text-sm font-medium text-destructive">{error.password}</Text>
              ) : null}
            </View>
            <View className="gap-1.5">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                autoCapitalize="none"
                onChangeText={setCode}
                returnKeyType="send"
                keyboardType="numeric"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                onSubmitEditing={onSubmit}
              />
              {error.code ? (
                <Text className="text-sm font-medium text-destructive">{error.code}</Text>
              ) : null}
            </View>
            <Button className={cn("w-full", fetchStatus === 'fetching' && 'opacity-50')} onPress={onSubmit}>
              <Text>Reset Password</Text>
            </Button>
          </View>
        </CardContent>
      </Card>
    </View>
  );
}

```

### Frontend/components/sign-in-form.tsx

```ts
import { SocialConnections } from '@/components/social-connections';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useSignIn } from '@clerk/expo/legacy';
import { Link } from 'expo-router';
import * as React from 'react';
import { type TextInput, View } from 'react-native';

export function SignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const passwordInputRef = React.useRef<TextInput>(null);
  const [error, setError] = React.useState<{ email?: string; password?: string }>({});

  async function onSubmit() {
    if (!isLoaded) return;

    try {
      const signInAttempt = await signIn.create({
        identifier: email,
        password,
      });

      if (signInAttempt.status === 'complete') {
        setError({ email: '', password: '' });
        await setActive({ session: signInAttempt.createdSessionId });
        return;
      }
    } catch (err) {
      if (err instanceof Error) {
        const message = err.message;
        const isEmailMessage = message.toLowerCase().includes('identifier') || message.toLowerCase().includes('email');
        setError(isEmailMessage ? { email: message } : { password: message });
      }
    }
  }

  return (
    <View className="gap-6">
      <Card className="rounded-[28px] border-border/70 bg-card shadow-sm shadow-black/5">
        <CardHeader className="px-6 pt-8">
          <CardTitle className="text-center text-2xl sm:text-left">Sign in</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Continue with your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6 px-6 pb-8">
          <View className="gap-4">
            <View className="gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                onChangeText={setEmail}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                returnKeyType="next"
                submitBehavior="submit"
              />
              {error.email ? <Text className="text-sm font-medium text-destructive">{error.email}</Text> : null}
            </View>

            <View className="gap-1.5">
              <View className="flex-row items-center">
                <Label htmlFor="password">Password</Label>
                <Link asChild href={`/(auth)/forgot-password?email=${email}`}>
                  <Button variant="link" size="sm" className="ml-auto h-4 px-1 py-0 web:h-fit sm:h-4">
                    <Text className="font-normal leading-4">Forgot password?</Text>
                  </Button>
                </Link>
              </View>
              <Input
                ref={passwordInputRef}
                id="password"
                secureTextEntry
                onChangeText={setPassword}
                returnKeyType="send"
                onSubmitEditing={onSubmit}
              />
              {error.password ? <Text className="text-sm font-medium text-destructive">{error.password}</Text> : null}
            </View>

            <Button className="w-full" onPress={onSubmit}>
              <Text>Continue</Text>
            </Button>
          </View>

          <Text className="text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/(auth)/sign-up" className="text-sm underline underline-offset-4">
              Sign up
            </Link>
          </Text>

          <View className="flex-row items-center">
            <Separator className="flex-1" />
            <Text className="px-4 text-sm text-muted-foreground">or</Text>
            <Separator className="flex-1" />
          </View>

          <SocialConnections />
        </CardContent>
      </Card>
    </View>
  );
}

```

### Frontend/components/sign-up-form.tsx

```ts
import { SocialConnections } from '@/components/social-connections';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useSignUp } from '@clerk/expo/legacy';
import { Link, router } from 'expo-router';
import * as React from 'react';
import { TextInput, View } from 'react-native';

export function SignUpForm() {
  const { signUp, isLoaded } = useSignUp();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const passwordInputRef = React.useRef<TextInput>(null);
  const [error, setError] = React.useState<{ email?: string; password?: string }>({});

  async function onSubmit() {
    if (!isLoaded) return;

    try {
      await signUp.create({
        emailAddress: email,
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      router.push(`/(auth)/sign-up/verify-email?email=${email}`);
    } catch (err) {
      if (err instanceof Error) {
        const message = err.message;
        const isEmailMessage = message.toLowerCase().includes('identifier') || message.toLowerCase().includes('email');
        setError(isEmailMessage ? { email: message } : { password: message });
      }
    }
  }

  return (
    <View className="gap-6">
      <Card className="rounded-[28px] border-border/70 bg-card shadow-sm shadow-black/5">
        <CardHeader className="px-6 pt-8">
          <CardTitle className="text-center text-2xl sm:text-left">Create your account</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Enter an email and password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6 px-6 pb-8">
          <View className="gap-4">
            <View className="gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                onChangeText={setEmail}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                returnKeyType="next"
                submitBehavior="submit"
              />
              {error.email ? <Text className="text-sm font-medium text-destructive">{error.email}</Text> : null}
            </View>

            <View className="gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                ref={passwordInputRef}
                id="password"
                secureTextEntry
                onChangeText={setPassword}
                returnKeyType="send"
                onSubmitEditing={onSubmit}
              />
              {error.password ? <Text className="text-sm font-medium text-destructive">{error.password}</Text> : null}
            </View>

            <Button className="w-full" onPress={onSubmit}>
              <Text>Continue</Text>
            </Button>
          </View>

          <Text className="text-center text-sm">
            Already have an account?{' '}
            <Link href="/(auth)/sign-in" dismissTo className="text-sm underline underline-offset-4">
              Sign in
            </Link>
          </Text>

          <View className="flex-row items-center">
            <Separator className="flex-1" />
            <Text className="px-4 text-sm text-muted-foreground">or</Text>
            <Separator className="flex-1" />
          </View>

          <SocialConnections />
        </CardContent>
      </Card>
    </View>
  );
}

```

### Frontend/components/social-connections.tsx

```ts
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSSO, type StartSSOFlowParams } from '@clerk/expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Image, Platform, View, type ImageSourcePropType } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

type SocialConnectionStrategy = Extract<
  StartSSOFlowParams['strategy'],
  'oauth_google' | 'oauth_github' | 'oauth_apple'
>;

const SOCIAL_CONNECTION_STRATEGIES: {
  type: SocialConnectionStrategy;
  source: ImageSourcePropType;
  useTint?: boolean;
}[] = [
    {
      type: 'oauth_apple',
      source: { uri: 'https://img.clerk.com/static/apple.png?width=160' },
      useTint: true,
    },
    {
      type: 'oauth_google',
      source: { uri: 'https://img.clerk.com/static/google.png?width=160' },
      useTint: false,
    },
    {
      type: 'oauth_github',
      source: { uri: 'https://img.clerk.com/static/github.png?width=160' },
      useTint: true,
    },
  ];

export function SocialConnections() {
  useWarmUpBrowser();
  const { colorScheme } = useColorScheme();
  const { startSSOFlow } = useSSO();

  function onSocialLoginPress(strategy: SocialConnectionStrategy) {
    return async () => {
      try {
        // Start the authentication process by calling `startSSOFlow()`
        const { createdSessionId, setActive, signIn } = await startSSOFlow({
          strategy,
          // For web, defaults to current path
          // For native, you must pass a scheme, like AuthSession.makeRedirectUri({ scheme, path })
          // For more info, see https://docs.expo.dev/versions/latest/sdk/auth-session/#authsessionmakeredirecturioptions
          redirectUrl: AuthSession.makeRedirectUri(),
        });

        // If sign in was successful, set the active session
        if (createdSessionId && setActive) {
          setActive({ session: createdSessionId });
          return;
        }

        // TODO: Handle other statuses
        // If there is no `createdSessionId`,
        // there are missing requirements, such as MFA
        // Use the `signIn` or `signUp` returned from `startSSOFlow`
        // to handle next steps
      } catch (err) {
        // See https://go.clerk.com/mRUDrIe for more info on error handling
        console.error(JSON.stringify(err, null, 2));
      }
    };
  }

  return (
    <View className="gap-2 sm:flex-row sm:gap-3">
      {SOCIAL_CONNECTION_STRATEGIES.map((strategy) => {
        return (
          <Button
            key={strategy.type}
            variant="outline"
            size="sm"
            className="sm:flex-1"
            onPress={onSocialLoginPress(strategy.type)}>
            <Image
              className={cn('size-4', strategy.useTint && Platform.select({ web: 'dark:invert' }))}
              tintColor={Platform.select({
                native: strategy.useTint ? (colorScheme === 'dark' ? 'white' : 'black') : undefined,
              })}
              source={strategy.source}
            />
          </Button>
        );
      })}
    </View>
  );
}

const useWarmUpBrowser = Platform.select({
  web: () => { },
  default: () => {
    React.useEffect(() => {
      // Preloads the browser for Android devices to reduce authentication load time
      // See: https://docs.expo.dev/guides/authentication/#improving-user-experience
      void WebBrowser.warmUpAsync();
      return () => {
        // Cleanup: closes browser when component unmounts
        void WebBrowser.coolDownAsync();
      };
    }, []);
  },
});

```

### Frontend/components/theme-toggle.tsx

```ts
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MoonStarIcon, SunIcon } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

const THEME_ICONS = {
  light: SunIcon,
  dark: MoonStarIcon,
};

export function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useColorScheme();

  return (
    <Button onPress={toggleColorScheme} size="icon" variant="ghost" className="rounded-full">
      <Icon as={THEME_ICONS[colorScheme ?? 'light']} className="size-6" />
    </Button>
  );
}

```

### Frontend/components/ui/button.tsx

```ts
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, Pressable } from 'react-native';

const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-2 rounded-md shadow-none',
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    })
  ),
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary active:bg-primary/90 shadow-sm shadow-black/5',
          Platform.select({ web: 'hover:bg-primary/90' })
        ),
        destructive: cn(
          'bg-destructive active:bg-destructive/90 dark:bg-destructive/60 shadow-sm shadow-black/5',
          Platform.select({
            web: 'hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
          })
        ),
        outline: cn(
          'border-border bg-background active:bg-accent dark:bg-input/30 dark:border-input dark:active:bg-input/50 border shadow-sm shadow-black/5',
          Platform.select({
            web: 'hover:bg-accent dark:hover:bg-input/50',
          })
        ),
        secondary: cn(
          'bg-secondary active:bg-secondary/80 shadow-sm shadow-black/5',
          Platform.select({ web: 'hover:bg-secondary/80' })
        ),
        ghost: cn(
          'active:bg-accent dark:active:bg-accent/50',
          Platform.select({ web: 'hover:bg-accent dark:hover:bg-accent/50' })
        ),
        link: '',
      },
      size: {
        default: cn('h-10 px-4 py-2 sm:h-9', Platform.select({ web: 'has-[>svg]:px-3' })),
        sm: cn('h-9 gap-1.5 rounded-md px-3 sm:h-8', Platform.select({ web: 'has-[>svg]:px-2.5' })),
        lg: cn('h-11 rounded-md px-6 sm:h-10', Platform.select({ web: 'has-[>svg]:px-4' })),
        icon: 'h-10 w-10 sm:h-9 sm:w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const buttonTextVariants = cva(
  cn(
    'text-foreground text-sm font-medium',
    Platform.select({ web: 'pointer-events-none transition-colors' })
  ),
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        destructive: 'text-white',
        outline: cn(
          'group-active:text-accent-foreground',
          Platform.select({ web: 'group-hover:text-accent-foreground' })
        ),
        secondary: 'text-secondary-foreground',
        ghost: 'group-active:text-accent-foreground',
        link: cn(
          'text-primary group-active:underline',
          Platform.select({ web: 'underline-offset-4 hover:underline group-hover:underline' })
        ),
      },
      size: {
        default: '',
        sm: '',
        lg: '',
        icon: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonProps = React.ComponentProps<typeof Pressable> & React.RefAttributes<typeof Pressable> & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(props.disabled && 'opacity-50', buttonVariants({ variant, size }), className)}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };

```

### Frontend/components/ui/card.tsx

```ts
import { Text, TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { View } from 'react-native';

function Card({ className, ...props }: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return (
    <TextClassContext.Provider value="text-card-foreground">
      <View
        className={cn(
          'bg-card border-border flex flex-col gap-6 rounded-xl border py-6 shadow-sm shadow-black/5',
          className
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return <View className={cn('flex flex-col gap-1.5 px-6', className)} {...props} />;
}

function CardTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<typeof Text>) {

  return (
    <Text
      ref={ref}
      role="heading"
      aria-level={3}
      className={cn('font-semibold leading-none', className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<typeof Text>) {
  return <Text className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return <View className={cn('px-6', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return <View className={cn('flex flex-row items-center px-6', className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };

```

### Frontend/components/ui/icon.tsx

```ts
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import * as React from 'react';

type IconProps = LucideProps & {
  as: LucideIcon;
} & React.RefAttributes<LucideIcon>;

function IconImpl({ as: IconComponent, ...props }: IconProps) {
  return <IconComponent {...props} />;
}

cssInterop(IconImpl, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      height: 'size',
      width: 'size',
    },
  },
});

/**
 * A wrapper component for Lucide icons with Nativewind `className` support via `cssInterop`.
 *
 * This component allows you to render any Lucide icon while applying utility classes
 * using `nativewind`. It avoids the need to wrap or configure each icon individually.
 *
 * @component
 * @example
 * ``\`tsx
 * import { ArrowRight } from 'lucide-react-native';
 * import { Icon } from '@/registry/components/ui/icon';
 *
 * <Icon as={ArrowRight} className="text-red-500" size={16} />
 * ``\`
 *
 * @param {LucideIcon} as - The Lucide icon component to render.
 * @param {string} className - Utility classes to style the icon using Nativewind.
 * @param {number} size - Icon size (defaults to 14).
 * @param {...LucideProps} ...props - Additional Lucide icon props passed to the "as" icon.
 */
function Icon({ as: IconComponent, className, size = 14, ...props }: IconProps) {
  const textClass = React.useContext(TextClassContext);
  return (
    <IconImpl
      as={IconComponent}
      className={cn('text-foreground', textClass, className)}
      size={size}
      {...props}
    />
  );
}

export { Icon };

```

### Frontend/components/ui/input.tsx

```ts
import { cn } from '@/lib/utils';
import { Platform, TextInput } from 'react-native';

function Input({ className, ...props }: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'dark:bg-input/30 border-input bg-background text-foreground flex h-10 w-full min-w-0 flex-row items-center rounded-md border px-3 py-1 text-base leading-5 shadow-sm shadow-black/5 sm:h-9',
        props.editable === false &&
        cn(
          'opacity-50',
          Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
        ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow] md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
          ),
          native: 'placeholder:text-muted-foreground/50',
        }),
        className
      )}
      {...props}
    />
  );
}

export { Input };

```

### Frontend/components/ui/label.tsx

```ts
import { cn } from '@/lib/utils';
import * as LabelPrimitive from '@rn-primitives/label';
import { Platform } from 'react-native';

function Label({
  className,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Text>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'flex select-none flex-row items-center gap-2',
        Platform.select({
          web: 'cursor-default leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        }),
        disabled && 'opacity-50'
      )}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}>
      <LabelPrimitive.Text
        className={cn(
          'text-foreground text-sm font-medium',
          Platform.select({ web: 'leading-none' }),
          className
        )}
        {...props}
      />
    </LabelPrimitive.Root>
  );
}

export { Label };

```

### Frontend/components/ui/native-only-animated-view.tsx

```ts
import { Platform } from 'react-native';
import Animated from 'react-native-reanimated';

/**
 * This component is used to wrap animated views that should only be animated on native.
 * @param props - The props for the animated view.
 * @returns The animated view if the platform is native, otherwise the children.
 * @example
 * <NativeOnlyAnimatedView entering={FadeIn} exiting={FadeOut}>
 *   <Text>I am only animated on native</Text>
 * </NativeOnlyAnimatedView>
 */
function NativeOnlyAnimatedView(
  props: React.ComponentProps<typeof Animated.View> & React.RefAttributes<typeof Animated.View>
) {
  if (Platform.OS === 'web') {
    return <>{props.children as React.ReactNode}</>;
  } else {
    return <Animated.View {...props} />;
  }
}

export { NativeOnlyAnimatedView };

```

### Frontend/components/ui/popover.tsx

```ts
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view';
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as PopoverPrimitive from '@rn-primitives/popover';
import * as React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  portalHost,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  portalHost?: string;
}) {
  return (
    <PopoverPrimitive.Portal hostName={portalHost}>
      <FullWindowOverlay>
        <PopoverPrimitive.Overlay style={Platform.select({ native: StyleSheet.absoluteFill })}>
          <NativeOnlyAnimatedView entering={FadeIn.duration(200)} exiting={FadeOut}>
            <TextClassContext.Provider value="text-popover-foreground">
              <PopoverPrimitive.Content
                align={align}
                sideOffset={sideOffset}
                className={cn(
                  'bg-popover border-border outline-hidden z-50 w-72 rounded-md border p-4 shadow-md shadow-black/5',
                  Platform.select({
                    web: cn(
                      'animate-in fade-in-0 zoom-in-95 origin-(--radix-popover-content-transform-origin) cursor-auto',
                      props.side === 'bottom' && 'slide-in-from-top-2',
                      props.side === 'top' && 'slide-in-from-bottom-2'
                    ),
                  }),
                  className
                )}
                {...props}
              />
            </TextClassContext.Provider>
          </NativeOnlyAnimatedView>
        </PopoverPrimitive.Overlay>
      </FullWindowOverlay>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };

```

### Frontend/components/ui/separator.tsx

```ts
import { cn } from '@/lib/utils';
import * as SeparatorPrimitive from '@rn-primitives/separator';

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'bg-border shrink-0',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  );
}

export { Separator };

```

### Frontend/components/ui/text.tsx

```ts
import { cn } from '@/lib/utils';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Platform, Text as RNText, type Role } from 'react-native';

const textVariants = cva(
  cn(
    'text-foreground text-base',
    Platform.select({
      web: 'select-text',
    })
  ),
  {
    variants: {
      variant: {
        default: '',
        h1: cn(
          'text-center text-4xl font-extrabold tracking-tight',
          Platform.select({ web: 'scroll-m-20 text-balance' })
        ),
        h2: cn(
          'border-border border-b pb-2 text-3xl font-semibold tracking-tight',
          Platform.select({ web: 'scroll-m-20 first:mt-0' })
        ),
        h3: cn('text-2xl font-semibold tracking-tight', Platform.select({ web: 'scroll-m-20' })),
        h4: cn('text-xl font-semibold tracking-tight', Platform.select({ web: 'scroll-m-20' })),
        p: 'mt-3 leading-7 sm:mt-6',
        blockquote: 'mt-4 border-l-2 pl-3 italic sm:mt-6 sm:pl-6',
        code: cn(
          'bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold'
        ),
        lead: 'text-muted-foreground text-xl',
        large: 'text-lg font-semibold',
        small: 'text-sm font-medium leading-none',
        muted: 'text-muted-foreground text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  blockquote: Platform.select({ web: 'blockquote' as Role }),
  code: Platform.select({ web: 'code' as Role }),
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: '1',
  h2: '2',
  h3: '3',
  h4: '4',
};

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> &
  TextVariantProps & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot : RNText;
  return (
    <Component
      className={cn(textVariants({ variant }), textClass, className)}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      {...props}
    />
  );
}

export { Text, TextClassContext };

```

### Frontend/components/user-menu.tsx

```ts
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Text } from '@/components/ui/text';
import { useAccount } from '@/hooks/useAccount';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@clerk/expo';
import type { TriggerRef } from '@rn-primitives/popover';
import { CreditCardIcon, LogOutIcon, UserIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

export function UserMenu() {
  const { signOut } = useAuth();
  const { account } = useAccount();
  const subscription = useSubscription();
  const popoverTriggerRef = React.useRef<TriggerRef>(null);

  async function onSignOut() {
    popoverTriggerRef.current?.close();
    await signOut();
  }

  async function onSubscriptionAction() {
    popoverTriggerRef.current?.close();
    if (subscription.managementUrl) {
      await subscription.manageSubscription();
      return;
    }

    await subscription.subscribe('monthly');
  }

  return (
    <Popover>
      <PopoverTrigger asChild ref={popoverTriggerRef}>
        <Button variant="ghost" size="sm">
          <Icon as={UserIcon} className="size-4" />
          <Text>Account</Text>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" className="w-72 gap-0 p-0">
        <View className="gap-1 border-b border-border p-4">
          <Text className="font-medium">{account?.displayName ?? 'Account'}</Text>
          <Text className="text-sm text-muted-foreground">{account?.email ?? 'Loading account...'}</Text>
        </View>

        <View className="gap-2 p-3">
          <Button variant="outline" onPress={() => void onSubscriptionAction()}>
            <Icon as={CreditCardIcon} className="size-4" />
            <Text>{subscription.managementUrl ? 'Manage subscription' : 'Open paywall'}</Text>
          </Button>

          <Button variant="outline" onPress={() => void onSignOut()}>
            <Icon as={LogOutIcon} className="size-4" />
            <Text>Sign out</Text>
          </Button>
        </View>
      </PopoverContent>
    </Popover>
  );
}

```

### Frontend/components/verify-email-form.tsx

```ts
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useSignUp } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { type TextStyle, View } from 'react-native';

const RESEND_CODE_INTERVAL_SECONDS = 30;

const TABULAR_NUMBERS_STYLE: TextStyle = { fontVariant: ['tabular-nums'] };

export function VerifyEmailForm() {
  const { signUp, fetchStatus } = useSignUp();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState('');
  const { countdown, restartCountdown } = useCountdown(RESEND_CODE_INTERVAL_SECONDS);

  async function onSubmit() {
    if (fetchStatus === 'fetching') return;

    try {
      // Use the code the user provided to attempt verification
      const { error: verifyCodeError } = await signUp.verifications.verifyEmailCode({
        code,
      });

      if (verifyCodeError) {
        setError(verifyCodeError.longMessage ?? verifyCodeError.message);
        return;
      }

      // If verification was completed, set the session to active
      // and redirect the user
      if (signUp.status === 'complete') {
        await signUp.finalize();
        return;
      }
      // TODO: Handle other statuses
      // If the status is not complete, check why. User may need to
      // complete further steps.
      console.error(JSON.stringify(signUp, null, 2));
    } catch (err) {
      // See https://go.clerk.com/mRUDrIe for more info on error handling
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  async function onResendCode() {
    if (fetchStatus === 'fetching') return;

    try {
      const { error: sendCodeError } = await signUp.verifications.sendEmailCode();

      if (sendCodeError) {
        setError(sendCodeError.longMessage ?? sendCodeError.message);
        return;
      }

      restartCountdown();
    } catch (err) {
      // See https://go.clerk.com/mRUDrIe for more info on error handling
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <View className="gap-6">
      <Card className="border-border/0 shadow-none sm:border-border sm:shadow-sm sm:shadow-black/5">
        <CardHeader>
          <CardTitle className="text-center text-xl sm:text-left">Verify your email</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Enter the verification code sent to {email || 'your email'}
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <View className="gap-6">
            <View className="gap-1.5">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                autoCapitalize="none"
                onChangeText={setCode}
                returnKeyType="send"
                keyboardType="numeric"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                onSubmitEditing={onSubmit}
              />
              {!error ? null : (
                <Text className="text-sm font-medium text-destructive">{error}</Text>
              )}
              <Button variant="link" size="sm" disabled={countdown > 0} onPress={onResendCode}>
                <Text className="text-center text-xs">
                  Didn&apos;t receive the code? Resend{' '}
                  {countdown > 0 ? (
                    <Text className="text-xs" style={TABULAR_NUMBERS_STYLE}>
                      ({countdown})
                    </Text>
                  ) : null}
                </Text>
              </Button>
            </View>
            <View className="gap-3">
              <Button className={cn("w-full", fetchStatus === 'fetching' && 'opacity-50')} onPress={onSubmit}>
                <Text>Continue</Text>
              </Button>
              <Button variant="link" className="mx-auto" onPress={router.back}>
                <Text>Cancel</Text>
              </Button>
            </View>
          </View>
        </CardContent>
      </Card>
    </View>
  );
}

function useCountdown(seconds = 30) {
  const [countdown, setCountdown] = React.useState(seconds);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCountdown = React.useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startCountdown = React.useCallback(() => {
    stopCountdown();
    setCountdown(seconds);

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          stopCountdown();
          return 0;
        }

        return prev - 1;
      });
    }, 1000);
  }, [seconds, stopCountdown]);

  React.useEffect(() => {
    startCountdown();

    return stopCountdown;
  }, [startCountdown, stopCountdown]);

  return { countdown, restartCountdown: startCountdown };
}

```

### Frontend/contexts/SubscriptionProvider.tsx

```ts
import * as React from 'react';
import Purchases, { type CustomerInfo, type PurchasesOfferings } from 'react-native-purchases';
import { Purchases as PurchasesWeb } from '@revenuecat/purchases-js';
import { AppState, Platform } from 'react-native';
import { subscriptionConfig, getPlatformRevenueCatApiKey } from '@/lib/config';
import { useAuth, useUser } from '@clerk/expo';
import { useAPI } from '@/hooks/useAPI';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

export type SubscriptionState = {
  status: 'idle' | 'loading' | 'active' | 'inactive' | 'error';
  entitlementActive: boolean;
  inTrial: boolean;
  trialEndsAt?: string | null;
  expiresAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  method?: 'trialing' | 'redeemed' | 'paid' | null;
  managementUrl?: string | null;
  cancelAtPeriodEnd?: boolean;
  offerings?: PurchasesOfferings | null;
  lastError?: Error | null;
  pricing?: { monthly: number; yearly: number } | null;
};

interface SubscriptionContextValue extends SubscriptionState {
  refresh: () => Promise<void>;
  openPaywall: (plan?: 'monthly' | 'yearly') => Promise<void>;
}

const SubscriptionContext = React.createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const { user } = useUser();
  const api = useAPI();

  const [state, setState] = React.useState<SubscriptionState>({
    status: 'idle', entitlementActive: false, inTrial: false,
    periodStart: null, periodEnd: null, method: null,
  });

  const configuredRef = React.useRef<string | null>(null);
  const apiRef = React.useRef(api);
  React.useEffect(() => { apiRef.current = api; }, [api]);
  const userRef = React.useRef(user);
  React.useEffect(() => { userRef.current = user; }, [user]);
  const expiryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = React.useRef<Promise<unknown> | null>(null);
  const didSkipInitialVisibilityRef = React.useRef(false);

  const sleep = React.useCallback((ms: number) => new Promise<void>((r) => setTimeout(r, ms)), []);

  const loadEntitlements = React.useCallback(async (options?: { refresh?: boolean }) => {
    const forced = Boolean(options?.refresh);
    if (!forced && inflightRef.current) {
      try { return (await inflightRef.current) as Awaited<ReturnType<typeof apiRef.current.getSubscriptionEntitlements>>; } catch { return null; }
    }
    try {
      const p = apiRef.current.getSubscriptionEntitlements(options);
      if (!forced) inflightRef.current = p;
      const e = await p;
      setState(prev => ({
        ...prev,
        status: e.pro ? 'active' : 'inactive',
        entitlementActive: e.pro,
        inTrial: e.inTrial ?? false,
        trialEndsAt: e.trialEndsAt ?? null,
        expiresAt: e.expiresAt ?? null,
        periodStart: e.periodStart ?? null,
        periodEnd: e.periodEnd ?? null,
        method: e.pro ? (e.method ?? prev.method ?? null) : null,
        managementUrl: e.pro ? (e.managementUrl ?? prev.managementUrl ?? null) : null,
        cancelAtPeriodEnd: e.cancelAtPeriodEnd ?? (e.pro ? (prev.cancelAtPeriodEnd ?? false) : false),
      }));
      return e;
    } catch {
      setState(prev => ({ ...prev, status: prev.status === 'loading' ? 'inactive' : prev.status }));
      return null;
    } finally {
      if (!forced) inflightRef.current = null;
    }
  }, []);

  const loadPricingAndOfferings = React.useCallback(async () => {
    try {
      const [pricingRes, offerings] = await Promise.all([
        apiRef.current.getSubscriptionPricing(),
        Platform.OS === 'web'
          ? PurchasesWeb.getSharedInstance().getOfferings()
          : Purchases.getOfferings(),
      ]);
      const pro = pricingRes.tiers.find(t => t.tier === 'pro');
      setState(prev => ({
        ...prev,
        pricing: pro?.priceMonthly != null && pro?.priceYearly != null
          ? { monthly: pro.priceMonthly, yearly: pro.priceYearly } : prev.pricing,
        offerings: offerings as PurchasesOfferings,
      }));
    } catch (e) { console.error('[Subscription] Failed to load pricing/offerings:', e); }
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        await PurchasesWeb.getSharedInstance().getCustomerInfo();
      } else {
        await Purchases.getCustomerInfo();
      }
      await loadPricingAndOfferings();
      for (let i = 0; i < 4; i++) {
        const e = await loadEntitlements({ refresh: true });
        if (e?.pro) break;
        if (i < 3) await sleep(1500);
      }
    } catch (e) { console.error('[Subscription] Refresh error:', e); }
  }, [loadEntitlements, loadPricingAndOfferings, sleep]);

  const openPaywall = React.useCallback(async (plan?: 'monthly' | 'yearly') => {
    try {
      const current = await apiRef.current.getSubscriptionEntitlements({ refresh: true });
      if (current.pro && (current.method === 'paid' || current.method === 'redeemed')) {
        setState(prev => ({ ...prev, status: 'active', entitlementActive: true, inTrial: false, expiresAt: current.expiresAt ?? prev.expiresAt ?? null, method: current.method ?? prev.method ?? null }));
        try { await userRef.current?.reload(); } catch {}
        return;
      }
      setState(prev => ({ ...prev, status: 'loading', lastError: null }));

      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        const result = await RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier: subscriptionConfig.entitlementId });
        if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED || result === PAYWALL_RESULT.NOT_PRESENTED) {
          setState(prev => ({ ...prev, status: 'active', entitlementActive: true, inTrial: prev.inTrial ?? false }));
          await refresh();
          try { await userRef.current?.reload(); } catch {}
        } else {
          setState(prev => ({ ...prev, status: prev.entitlementActive ? 'active' : 'inactive' }));
        }
      } else {
        const offerings = await PurchasesWeb.getSharedInstance().getOfferings();
        const cur = offerings.current;
        if (!cur?.availablePackages.length) throw new Error('No offerings');
        const pkg = plan === 'monthly'
          ? (cur.monthly ?? cur.availablePackages.find(p => p.identifier.includes('month')))
          : plan === 'yearly'
            ? (cur.annual ?? cur.availablePackages.find(p => p.identifier.includes('year')))
            : cur.availablePackages[0];
        if (pkg) {
          try {
            await PurchasesWeb.getSharedInstance().purchase({ rcPackage: pkg });
          } catch (purchaseErr) {
            const pe = purchaseErr as { errorCode?: unknown; message?: unknown };
            const code = typeof pe?.errorCode === 'number' ? pe.errorCode : null;
            if (code === 6 || code === 7) {
              setState(prev => ({ ...prev, status: 'loading', lastError: null }));
              await refresh();
              try { await userRef.current?.reload(); } catch {}
              return;
            }
            throw purchaseErr;
          }
          setState(prev => ({ ...prev, status: 'active', entitlementActive: true, inTrial: prev.inTrial ?? false }));
          await refresh();
          try { await userRef.current?.reload(); } catch {}
        }
      }
    } catch (error) {
      const err = error as Error & { userCancelled?: boolean | null; code?: unknown };
      const code = typeof err.code === 'string' ? err.code : typeof err.code === 'number' ? String(err.code) : null;
      const cancelled = Boolean(err.userCancelled) || code === 'USER_CANCELLED';
      if (cancelled) {
        setState(prev => ({ ...prev, status: prev.entitlementActive ? 'active' : 'inactive' }));
      } else {
        setState(prev => ({ ...prev, status: 'error', lastError: error as Error }));
      }
    }
  }, [loadEntitlements, refresh]);

  // Auto-expire timer
  React.useEffect(() => {
    if (expiryTimerRef.current) { clearTimeout(expiryTimerRef.current); expiryTimerRef.current = null; }
    if (!userId) return;
    const until = (state.method === 'trialing' ? (state.trialEndsAt ?? state.periodEnd) : (state.expiresAt ?? state.periodEnd)) ?? null;
    if (!until) return;
    const untilMs = new Date(until).getTime();
    if (!Number.isFinite(untilMs)) return;
    const delay = Math.min(Math.max(untilMs - Date.now() + 1500, 0), 2147483647);
    if (delay <= 0) { if (state.entitlementActive) void loadEntitlements({ refresh: true }); return; }
    expiryTimerRef.current = setTimeout(() => {
      let shouldRefresh = false;
      setState(prev => {
        const prevUntil = (prev.method === 'trialing' ? (prev.trialEndsAt ?? prev.periodEnd) : (prev.expiresAt ?? prev.periodEnd)) ?? null;
        const prevMs = prevUntil ? new Date(prevUntil).getTime() : null;
        if (!prevMs || !Number.isFinite(prevMs) || prevMs > Date.now()) return prev;
        if (!prev.entitlementActive) return prev;
        shouldRefresh = true;
        if (prev.method === 'paid' || prev.method === 'redeemed') return prev;
        return { ...prev, status: 'inactive', entitlementActive: false, inTrial: false };
      });
      if (shouldRefresh) void loadEntitlements({ refresh: true });
    }, delay);
    return () => { if (expiryTimerRef.current) { clearTimeout(expiryTimerRef.current); expiryTimerRef.current = null; } };
  }, [loadEntitlements, state.entitlementActive, state.expiresAt, state.method, state.periodEnd, state.trialEndsAt, userId]);

  // Periodic refresh
  React.useEffect(() => {
    if (refreshIntervalRef.current) { clearInterval(refreshIntervalRef.current); refreshIntervalRef.current = null; }
    if (!userId || !state.entitlementActive || state.status === 'loading') return;
    const until = (state.method === 'trialing' ? (state.trialEndsAt ?? state.periodEnd) : (state.expiresAt ?? state.periodEnd)) ?? null;
    const untilMs = until ? new Date(until).getTime() : null;
    const remainingMs = untilMs != null && Number.isFinite(untilMs) ? (untilMs - Date.now()) : null;
    const intervalMs = remainingMs != null
      ? (remainingMs <= 5 * 60_000 ? 60_000 : remainingMs <= 60 * 60_000 ? 5 * 60_000 : 15 * 60_000)
      : 15 * 60_000;
    refreshIntervalRef.current = setInterval(() => { void loadEntitlements({ refresh: false }); }, intervalMs);
    return () => { if (refreshIntervalRef.current) { clearInterval(refreshIntervalRef.current); refreshIntervalRef.current = null; } };
  }, [loadEntitlements, state.entitlementActive, state.expiresAt, state.method, state.periodEnd, state.status, state.trialEndsAt, userId]);

  // Initialize RevenueCat SDK
  React.useEffect(() => {
    const key = getPlatformRevenueCatApiKey();
    if (!key || !userId || configuredRef.current === userId) return;
    configuredRef.current = userId;
    if (Platform.OS === 'web') {
      PurchasesWeb.configure({ apiKey: key, appUserId: userId });
    } else {
      Purchases.configure({ apiKey: key, appUserID: userId });
    }
    setState(prev => ({ ...prev, status: 'loading' }));
    void Promise.all([loadPricingAndOfferings(), loadEntitlements({ refresh: true })]);

    if (Platform.OS === 'web') {
      didSkipInitialVisibilityRef.current = false;
      const handleVisibility = () => {
        if (!didSkipInitialVisibilityRef.current) { didSkipInitialVisibilityRef.current = true; return; }
        if (document.visibilityState === 'visible') void loadEntitlements({ refresh: false });
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    } else {
      const listener = (_: CustomerInfo) => { void loadEntitlements({ refresh: false }); };
      Purchases.addCustomerInfoUpdateListener(listener);
      const appSub = AppState.addEventListener('change', s => { if (s === 'active') void loadEntitlements({ refresh: false }); });
      return () => { Purchases.removeCustomerInfoUpdateListener(listener); appSub.remove(); };
    }
  }, [userId, loadPricingAndOfferings, loadEntitlements]);

  const value = React.useMemo(() => ({ ...state, refresh, openPaywall }), [state, refresh, openPaywall]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscriptionContext() {
  const ctx = React.useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscriptionContext must be used within SubscriptionProvider');
  return ctx;
}

```

### Frontend/eas.json

```json
{
  "cli": {
    "version": ">= 16.24.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}

```

### Frontend/expo-env.d.ts

```ts
/// <reference types="expo/types" />

// NOTE: This file should not be edited and should be in your git ignore
```

### Frontend/global.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 63%;
    --radius: 0.625rem;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
  }

  .dark:root {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 0 0% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 70.9% 59.4%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 300 0% 45%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }
}
```

### Frontend/hooks/useAccount.ts

```ts
import { useAuth } from '@clerk/expo';
import * as React from 'react';
import { useAPI } from '@/hooks/useAPI';

export type AccountSummary = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  imageUrl?: string | null;
};

export function useAccount() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useAPI();
  const [account, setAccount] = React.useState<AccountSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      setAccount(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.getMe();
      setAccount(response.user);
      return response.user;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account');
      return null;
    } finally {
      setLoading(false);
    }
  }, [api, isLoaded, isSignedIn]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    account,
    loading,
    error,
    refresh,
  };
}

```

### Frontend/hooks/useAPI.ts

```ts
import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';
import { APIClient } from '@/api/client';
import { apiBaseUrl } from '@/lib/config';

export function useAPI() {
  const { getToken } = useAuth();
  return useMemo(() => new APIClient(apiBaseUrl, getToken), [getToken]);
}

```

### Frontend/hooks/useSubscription.ts

```ts
import { useCallback } from 'react';
import { Linking, Platform } from 'react-native';
import { useSubscriptionContext } from '@/contexts/SubscriptionProvider';
import { useAPI } from '@/hooks/useAPI';

export function useSubscription() {
  const ctx = useSubscriptionContext();
  const api = useAPI();

  const accessUntilMs = (() => {
    const until = (ctx.method === 'trialing' ? (ctx.trialEndsAt ?? ctx.periodEnd) : (ctx.expiresAt ?? ctx.periodEnd)) ?? null;
    if (!until) return null;
    const t = new Date(until).getTime();
    return Number.isFinite(t) ? t : null;
  })();

  const canAccess = ctx.entitlementActive && (
    ctx.method === 'paid' || ctx.method === 'redeemed' || accessUntilMs == null || accessUntilMs > Date.now() + 1500
  );
  const isLoading = ctx.status === 'idle' || ctx.status === 'loading';
  const isPaid = ctx.method === 'paid';
  const isRedeemed = ctx.method === 'redeemed';
  const isTrial = ctx.method === 'trialing' && ctx.inTrial;
  const trialDaysRemaining = ctx.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(ctx.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const managementUrl = (() => {
    if (ctx.managementUrl) return ctx.managementUrl;
    if (!ctx.entitlementActive) return null;
    if (Platform.OS === 'ios') return 'https://apps.apple.com/account/subscriptions';
    if (Platform.OS === 'android') return 'https://play.google.com/store/account/subscriptions';
    return null;
  })();

  const subscribe = useCallback(async (plan?: 'monthly' | 'yearly') => {
    await ctx.openPaywall(plan);
  }, [ctx]);

  const manageSubscription = useCallback(async () => {
    let url: string | null = managementUrl ?? null;
    if (!url && Platform.OS === 'web' && ctx.entitlementActive) {
      try { const r = await api.getSubscriptionEntitlements({ refresh: true }); url = r.managementUrl ?? null; } catch {}
    }
    if (!url) return;
    if (Platform.OS === 'web') { window.open(url, '_blank'); return; }
    await Linking.openURL(url);
  }, [api, ctx.entitlementActive, managementUrl]);

  return {
    status: ctx.status, canAccess, isLoading, isPaid, isRedeemed, isTrial,
    inTrial: ctx.inTrial, method: ctx.method, trialEndsAt: ctx.trialEndsAt,
    trialDaysRemaining, expiresAt: ctx.expiresAt, periodStart: ctx.periodStart,
    periodEnd: ctx.periodEnd, managementUrl, cancelAtPeriodEnd: ctx.cancelAtPeriodEnd,
    pricing: ctx.pricing, offerings: ctx.offerings, lastError: ctx.lastError,
    subscribe, refresh: ctx.refresh, manageSubscription,
  };
}

export type { SubscriptionState } from '@/contexts/SubscriptionProvider';

```

### Frontend/lib/config.ts

```ts
import { Platform } from 'react-native';

type EnvKey =
  | 'EXPO_PUBLIC_API_URL'
  | 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'
  | 'EXPO_PUBLIC_RC_ENTITLEMENT_ID'
  | 'EXPO_PUBLIC_RC_API_KEY_IOS'
  | 'EXPO_PUBLIC_RC_API_KEY_ANDROID'
  | 'EXPO_PUBLIC_RC_WEB_API_KEY';

const envValue = (key: EnvKey): string | undefined => {
  switch (key) {
    case 'EXPO_PUBLIC_API_URL': return process.env.EXPO_PUBLIC_API_URL;
    case 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY': return process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    case 'EXPO_PUBLIC_RC_ENTITLEMENT_ID': return process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID;
    case 'EXPO_PUBLIC_RC_API_KEY_IOS': return process.env.EXPO_PUBLIC_RC_API_KEY_IOS;
    case 'EXPO_PUBLIC_RC_API_KEY_ANDROID': return process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID;
    case 'EXPO_PUBLIC_RC_WEB_API_KEY': return process.env.EXPO_PUBLIC_RC_WEB_API_KEY;
    default: return undefined;
  }
};

const requireEnv = (key: EnvKey): string => {
  const value = envValue(key);
  if (!value) throw new Error(`Missing ${key}. Set it in your environment variables.`);
  return value;
};

export const apiBaseUrl = requireEnv('EXPO_PUBLIC_API_URL');
export const clerkPublishableKey = requireEnv('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');

export type SubscriptionConfig = {
  entitlementId: string;
  iosApiKey: string;
  androidApiKey: string;
  webApiKey: string;
};

export const subscriptionConfig: SubscriptionConfig = {
  entitlementId: requireEnv('EXPO_PUBLIC_RC_ENTITLEMENT_ID'),
  iosApiKey: requireEnv('EXPO_PUBLIC_RC_API_KEY_IOS'),
  androidApiKey: requireEnv('EXPO_PUBLIC_RC_API_KEY_ANDROID'),
  webApiKey: requireEnv('EXPO_PUBLIC_RC_WEB_API_KEY'),
};

export function getPlatformRevenueCatApiKey(): string {
  if (Platform.OS === 'ios') return subscriptionConfig.iosApiKey;
  if (Platform.OS === 'android') return subscriptionConfig.androidApiKey;
  if (Platform.OS === 'web') return subscriptionConfig.webApiKey;
  throw new Error(`Unsupported platform: ${Platform.OS}`);
}

```

### Frontend/lib/theme.ts

```ts
import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

export const THEME = {
  light: {
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(0 0% 3.9%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(0 0% 3.9%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(0 0% 3.9%)',
    primary: 'hsl(0 0% 9%)',
    primaryForeground: 'hsl(0 0% 98%)',
    secondary: 'hsl(0 0% 96.1%)',
    secondaryForeground: 'hsl(0 0% 9%)',
    muted: 'hsl(0 0% 96.1%)',
    mutedForeground: 'hsl(0 0% 45.1%)',
    accent: 'hsl(0 0% 96.1%)',
    accentForeground: 'hsl(0 0% 9%)',
    destructive: 'hsl(0 84.2% 60.2%)',
    border: 'hsl(0 0% 89.8%)',
    input: 'hsl(0 0% 89.8%)',
    ring: 'hsl(0 0% 63%)',
    radius: '0.625rem',
    chart1: 'hsl(12 76% 61%)',
    chart2: 'hsl(173 58% 39%)',
    chart3: 'hsl(197 37% 24%)',
    chart4: 'hsl(43 74% 66%)',
    chart5: 'hsl(27 87% 67%)',
  },
  dark: {
    background: 'hsl(0 0% 3.9%)',
    foreground: 'hsl(0 0% 98%)',
    card: 'hsl(0 0% 3.9%)',
    cardForeground: 'hsl(0 0% 98%)',
    popover: 'hsl(0 0% 3.9%)',
    popoverForeground: 'hsl(0 0% 98%)',
    primary: 'hsl(0 0% 98%)',
    primaryForeground: 'hsl(0 0% 9%)',
    secondary: 'hsl(0 0% 14.9%)',
    secondaryForeground: 'hsl(0 0% 98%)',
    muted: 'hsl(0 0% 14.9%)',
    mutedForeground: 'hsl(0 0% 63.9%)',
    accent: 'hsl(0 0% 14.9%)',
    accentForeground: 'hsl(0 0% 98%)',
    destructive: 'hsl(0 70.9% 59.4%)',
    border: 'hsl(0 0% 14.9%)',
    input: 'hsl(0 0% 14.9%)',
    ring: 'hsl(300 0% 45%)',
    radius: '0.625rem',
    chart1: 'hsl(220 70% 50%)',
    chart2: 'hsl(160 60% 45%)',
    chart3: 'hsl(30 80% 55%)',
    chart4: 'hsl(280 65% 60%)',
    chart5: 'hsl(340 75% 55%)',
  },
};

export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};

```

### Frontend/lib/utils.ts

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

```

### Frontend/metro.config.js

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });

```

### Frontend/nativewind-env.d.ts

```ts
/// <reference types="nativewind/types" />

```

### Frontend/package.json

```json
{
  "name": "demo",
  "main": "expo-router/entry",
  "version": "1.0.0",
  "scripts": {
    "dev": "expo start -c",
    "android": "expo start -c --android",
    "ios": "expo start -c --ios",
    "web": "expo start -c --web",
    "clean": "rm -rf .expo node_modules",
    "build": "pnpm typecheck && pnpm build:web",
    "build:web": "expo export --platform web",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shared/api-client": "workspace:*",
    "@clerk/expo": "3.2.11",
    "@react-navigation/native": "^7.0.0",
    "@revenuecat/purchases-js": "1.11.1",
    "@rn-primitives/label": "^1.4.0",
    "@rn-primitives/popover": "^1.4.0",
    "@rn-primitives/portal": "~1.4.0",
    "@rn-primitives/separator": "^1.4.0",
    "@rn-primitives/slot": "^1.4.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "expo": "~55.0.19",
    "expo-auth-session": "~55.0.15",
    "expo-constants": "~55.0.15",
    "expo-linking": "~55.0.14",
    "expo-router": "~55.0.13",
    "expo-secure-store": "~55.0.13",
    "expo-splash-screen": "~55.0.19",
    "expo-status-bar": "~55.0.5",
    "expo-system-ui": "~55.0.16",
    "expo-web-browser": "~55.0.14",
    "lucide-react-native": "^0.545.0",
    "nativewind": "^4.2.3",
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "react-native": "0.83.6",
    "react-native-purchases": "10.1.1",
    "react-native-purchases-ui": "10.1.1",
    "react-native-reanimated": "4.2.1",
    "react-native-safe-area-context": "~5.6.2",
    "react-native-screens": "~4.23.0",
    "react-native-svg": "15.15.3",
    "react-native-web": "^0.21.0",
    "react-native-worklets": "0.7.4",
    "tailwind-merge": "^3.5.0",
    "tailwindcss": "^3.4.14",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@babel/core": "^7.26.0",
    "@types/react": "~19.2.10",
    "prettier": "^3.8.3",
    "prettier-plugin-tailwindcss": "^0.8.0",
    "typescript": "~5.9.2"
  },
  "private": true
}

```

### Frontend/README.md

```md
# Clerk Auth Template

This is a [React Native](https://reactnative.dev) project built with [Expo](https://expo.dev), [Clerk](https://go.clerk.com/gjgxNgT), and [React Native Reusables](https://reactnativereusables.com).

It was initialized using the following command, then the `Clerk auth (Nativewind)` template was selected when prompted:

``\`bash
npx @react-native-reusables/cli@latest init
``\`

## Getting Started

Before running the app, make sure to:

1. [Set up your Clerk account](https://go.clerk.com/blVsQlm)
2. In the instance setup, leave the default option selected: **Email, phone, username**
3. Enable Apple, GitHub, and Google as sign-in options under SSO Connections
4. Rename `.env.example` to `.env.local` and paste your `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` from [your API keys](https://go.clerk.com/u8KAui7)

Then start the development server:

``\`bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
``\`

This will launch the Expo Go Server. You can open the app with:

- **iOS**: press `i` to launch in the iOS simulator (Mac only)
- **Android**: press `a` to launch in the Android emulator
- **Web**: press `w` to run in a browser

Or scan the QR code with the [Expo Go](https://expo.dev/go) app to test on your device.

## Included Screens and Features

- Protected routes using Clerk authentication
- Sign in screen
- OAuth with Apple, GitHub, and Google
- Forgot password screen
- Reset password screen
- Verify email screen
- User profile button
- Sign out screen

## Project Features

- ⚛️ Built with [Expo Router](https://expo.dev/router)
- 🔐 Authentication powered by [Clerk](https://go.clerk.com/Q1MKAz0)
- 🎨 Styled with [Tailwind CSS](https://tailwindcss.com/) via [Nativewind](https://www.nativewind.dev/)
- 📦 UI powered by [React Native Reusables](https://github.com/founded-labs/react-native-reusables)
- 🚀 New Architecture enabled
- 🔥 Edge to Edge enabled
- 📱 Runs on iOS, Android, and Web

## Learn More

- [Clerk Docs](https://go.clerk.com/Q1MKAz0)
- [React Native Docs](https://reactnative.dev/docs/getting-started)
- [Expo Docs](https://docs.expo.dev/)
- [Nativewind Docs](https://www.nativewind.dev/)
- [React Native Reusables](https://reactnativereusables.com)

---

If this template helps you move faster, consider giving [React Native Reusables](https://github.com/founded-labs/react-native-reusables) a ⭐ on GitHub. It helps a lot!

```

### Frontend/tailwind.config.js

```js
const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [require('tailwindcss-animate')],
};

```

### Frontend/tsconfig.json

```json
{
  "extends": "expo/tsconfig.base.json",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts", "nativewind-env.d.ts"]
}

```

### Frontend/vercel.json

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm build:web",
  "outputDirectory": "dist",
  "devCommand": "pnpm dev",
  "cleanUrls": true,
  "framework": null,
  "rewrites": [
    {
      "source": "/:path*",
      "destination": "/"
    }
  ]
}

```

### install-skills.sh

```bash
#!/usr/bin/env bash
# Manual skill installation guide for this project.
#
# Run the commands below after setup. The skills CLI will prompt you to:
# - choose which agents to install to
# - choose whether the install should be project-scoped or global
#
# If you want the skill files tracked with this project, choose the project scope.
# Run each command one at a time if you want to review each prompt separately.

pnpm dlx skills add https://github.com/clerk/skills --skill clerk-custom-ui

pnpm dlx skills add https://github.com/revenuecat/revenuecat-skill --skill revenuecat

pnpm dlx skills add https://github.com/stripe/ai --skill stripe-best-practices

```

### package.json

```json
{
  "name": "demo",
  "private": true,
  "version": "0.1.0",
  "packageManager": "pnpm@10.15.1",
  "scripts": {
    "dev": "turbo dev --parallel --filter=./Frontend --filter=./Backend --filter=./Extension",
    "dev:backend": "pnpm --filter ./Backend dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "verify": "pnpm verify:frontend && pnpm verify:backend && pnpm verify:extension",
    "verify:frontend": "pnpm --filter ./Frontend exec expo install --check && pnpm --filter ./Frontend build:web",
    "verify:backend": "pnpm --filter ./Backend test && pnpm --filter ./Backend build",
    "verify:extension": "pnpm --filter ./Extension typecheck && pnpm --filter ./Extension zip",
    "db:generate": "pnpm --filter @shared/db db:generate",
    "db:migrate": "pnpm --filter @shared/db db:migrate",
    "db:studio": "pnpm --filter @shared/db db:studio",
    "db:check": "pnpm --filter @shared/db db:check",
    "dev:frontend": "pnpm --filter ./Frontend dev",
    "dev:extension": "pnpm --filter ./Extension dev",
    "extension:zip": "pnpm --filter ./Extension zip"
  },
  "devDependencies": {
    "turbo": "2.8.0"
  },
  "workspaces": [
    "Frontend",
    "Backend",
    "Extension",
    "packages/*"
  ]
}

```

### packages/api-client/package.json

```json
{
  "name": "@shared/api-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm typecheck",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.9.3"
  },
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@shared/config": "workspace:*",
    "@shared/contracts": "workspace:*",
    "@shared/types": "workspace:*",
    "zod": "4.2.1"
  }
}

```

### packages/api-client/src/index.ts

```ts
import type { ZodType } from 'zod';
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
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(joinApiUrl(this.options.baseUrl, path), {
      ...init,
      headers,
    });

    if (!response.ok) {
      let error: { error?: string; message?: string } = {};
      try { error = await response.json(); } catch {}
      throw new APIRequestError(
        response.status,
        error.message || `API request failed: ${response.status}`,
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
      `/storage/files/${encodeURIComponent(objectKey)}`,
      {},
      StorageFileResponseSchema,
    );
  }

  deleteStorageFile(objectKey: string) {
    return this.request<void>(`/storage/files/${encodeURIComponent(objectKey)}`, {
      method: 'DELETE',
    });
  }
}

```

### packages/api-client/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "src/**/*"
  ]
}

```

### packages/config/package.json

```json
{
  "name": "@shared/config",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm typecheck",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.9.3"
  },
  "exports": {
    ".": "./src/index.ts"
  }
}

```

### packages/config/src/index.ts

```ts
export const DEFAULT_API_PATH_PREFIX = '/api';
export const DEFAULT_LOCAL_API_URL = 'http://localhost:8787';
export const DEFAULT_FRONTEND_URL = 'http://localhost:8081';
export const DEFAULT_EXTENSION_URL = 'chrome-extension://';

export function joinApiUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

```

### packages/config/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "src/**/*"
  ]
}

```

### packages/contracts/package.json

```json
{
  "name": "@shared/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm typecheck",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.9.3"
  },
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "zod": "4.2.1"
  }
}

```

### packages/contracts/src/index.ts

```ts
import { z } from 'zod';

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

```

### packages/contracts/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "src/**/*"
  ]
}

```

### packages/db/drizzle.config.ts

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;

```

### packages/db/migrations/.gitkeep

```

```

### packages/db/package.json

```json
{
  "name": "@shared/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts",
    "./queries": "./src/queries/index.ts",
    "./migrate": "./src/migrate.ts"
  },
  "scripts": {
    "build": "pnpm typecheck",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx --env-file=../../.env src/migrate.ts",
    "db:studio": "drizzle-kit studio",
    "db:check": "drizzle-kit check"
  },
  "dependencies": {
    "@neondatabase/serverless": "1.0.2",
    "drizzle-orm": "0.44.7",
    "dotenv": "17.2.3"
  },
  "devDependencies": {
    "drizzle-kit": "0.31.7",
    "tsx": "4.20.6",
    "typescript": "5.9.3",
    "@types/node": "25.6.0"
  }
}

```

### packages/db/src/index.ts

```ts
import { drizzle } from 'drizzle-orm/neon-http';
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

```

### packages/db/src/migrate.ts

```ts
import { drizzle } from 'drizzle-orm/neon-http';
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

```

### packages/db/src/queries/index.ts

```ts
export * from './uploads';
export * from './users';

```

### packages/db/src/queries/uploads.ts

```ts
import { eq } from 'drizzle-orm';
import { db } from '../index';
import { uploads } from '../schema';

export async function listUploadsForUser(userId: string) {
  return db.query.uploads.findMany({
    where: eq(uploads.userId, userId),
  });
}

```

### packages/db/src/queries/users.ts

```ts
import { eq } from 'drizzle-orm';
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

```

### packages/db/src/schema.ts

```ts
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
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

```

### packages/db/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": [
      "node"
    ]
  },
  "include": [
    "src/**/*",
    "drizzle.config.ts"
  ]
}

```

### packages/types/package.json

```json
{
  "name": "@shared/types",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm typecheck",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.9.3"
  },
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@shared/contracts": "workspace:*"
  }
}

```

### packages/types/src/index.ts

```ts
export type ApiEnvelope<T> = { data: T } | { error: string; message: string };
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

```

### packages/types/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "src/**/*"
  ]
}

```

### pnpm-workspace.yaml

```yaml
packages:
  - 'Frontend'
  - 'Backend'
  - 'Extension'
  - 'packages/*'

```

### turbo.json

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": [
        "^build"
      ],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": [
        "^build"
      ]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}

```

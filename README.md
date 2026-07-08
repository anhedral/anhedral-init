# Anhedral

[![npm version](https://img.shields.io/npm/v/anhedral.svg)](https://www.npmjs.com/package/anhedral)
[![license](https://img.shields.io/npm/l/anhedral.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/anhedral.svg)](https://www.npmjs.com/package/anhedral)

One command to start a production-shaped modular application.

Anhedral is an opinionated init CLI for teams that want stable full-stack architecture without choosing providers or frameworks. It generates a single pnpm monorepo and lets you choose which app surfaces and backend features to scaffold up front, then add more later.

The stack stays fixed: Next.js + shadcn/ui, Expo + React Native Reusables, Electron + shadcn/ui, WXT + shadcn/ui, Fastify, shared packages, Neon + Drizzle, Cloudflare R2, Clerk, RevenueCat, Vercel Services, EAS, pnpm workspaces, and Turborepo.

![Anhedral init CLI](docs/anhedral-cli-init.png)

## Quick Start

```sh
pnpm dlx anhedral@latest init
```

The interactive init prompts for app surfaces and backend features. You can also pass the same choices as flags:

```sh
pnpm dlx anhedral@latest init --web --api --db --auth
pnpm dlx anhedral@latest init --web --mobile --api --db --auth --billing --storage
```

Or with npm:

```sh
npx anhedral@latest init
```

Use `--skip-install` when you want deterministic file generation before installing dependencies:

```sh
pnpm dlx anhedral@latest init --skip-install
pnpm install
```

Add modules later from the generated project root:

```sh
pnpm dlx anhedral@latest add mobile extension desktop
pnpm dlx anhedral@latest add billing storage native-subscriptions
```

## What It Generates

Anhedral creates only the selected app surfaces and backend features, plus the shared workspace packages needed to keep clients connected to the same backend API:

```txt
.
├─ apps/web/          Next.js + shadcn/ui web app
├─ apps/mobile/       Expo + React Native Reusables app
├─ apps/api/          Fastify API
├─ apps/desktop/      Electron + shadcn/ui desktop app
├─ apps/extension/    WXT + shadcn/ui Chrome extension
├─ packages/
│  ├─ api-client/   shared typed API client
│  ├─ config/       shared config helpers
│  ├─ contracts/    shared Zod request/response contracts
│  ├─ db/           Drizzle schema, Neon client, migrations
│  └─ types/        shared TypeScript types
├─ PRODUCTION.md    deployment checklist
├─ turbo.json       workspace task graph
└─ package.json     root scripts
```

The generated app is intentionally one repository. When web and API are selected, deploy them together as one Vercel Services project:

- `apps/web`: Next.js + shadcn/ui service at `/`, built with `pnpm build`
- `apps/api`: Fastify service at `/api/*`, built with `pnpm build`, entrypoint at `src/index.ts`

The `apps/mobile` source is used for native iOS and Android builds through EAS. The `apps/desktop` source builds Electron artifacts for macOS, Windows, and Linux. The `apps/extension` source builds a WXT Chrome extension ZIP for the Chrome Web Store.

The root `anhedral.json` manifest records installed modules so `anhedral add` only scaffolds missing pieces.

## Scaffold Setup Commands

Anhedral runs framework setup commands where upstream generators provide useful project structure:

```sh
pnpm dlx shadcn@latest init -d --template next --name web
pnpm dlx @react-native-reusables/cli@<resolved> init -t clerk-auth
pnpm dlx wxt@<resolved> init apps/extension -t react --pm pnpm
```

The Fastify API, Electron app, and shared packages are written directly by Anhedral so their workspace wiring, API contracts, provider integrations, and build scripts stay consistent.

## Stack

Anhedral supports one carefully maintained modular stack:

- App surfaces: `web`, `mobile`, `api`, `desktop`, `extension`
- Backend features: `db`, `auth`, `billing`, `storage`, `native-subscriptions`
- Aliases: `database`, `chrome-extension`, `native-billing`

The goal is stability. The generated project avoids framework sprawl, duplicate schemas, and separate frontend/backend/extension repositories.

## Why This Stack

Anhedral is built around one idea: a startup should be able to launch every major client from one repository without committing to infrastructure that becomes expensive, fragmented, or hard to change later.

The stack is intentionally narrow:

| Choice | Why Anhedral uses it |
| --- | --- |
| Expo | One React Native codebase targets web browsers, iOS, and Android. Compared with separate web and native apps, Expo keeps product iteration faster and avoids rebuilding shared screens, auth flows, and client logic three times. |
| React Native Reusables | It brings shadcn-style primitives to React Native and Expo without locking the app into a heavy design system. Compared with bespoke component scaffolds, it gives teams accessible primitives they can replace or extend as the product becomes specific. |
| Fastify | Fastify is small, fast, TypeScript-friendly, and works well as a central API layer on Vercel. Compared with pushing logic into many frontend routes, serverless functions, or client SDK calls, a Fastify backend centralizes auth, billing, storage, database access, webhooks, and internal APIs in one place. |
| TypeScript | The whole stack shares types, contracts, and API clients. Compared with untyped template code, this catches frontend/backend drift before deploy and makes the generated app safer to evolve. |
| Zod contracts | Request and response schemas live in shared packages. Compared with duplicating interfaces across clients, Zod lets the backend validate inputs while the frontend parses responses from the same source of truth. |
| Neon + Drizzle | Neon gives serverless Postgres that can start free and scale with usage; Drizzle keeps schema and queries close to TypeScript. Compared with proprietary document databases or opaque ORMs, this keeps the data layer portable, SQL-native, and easy to inspect. |
| Cloudflare R2/CDN | R2 provides S3-compatible object storage without S3-style egress fees. Compared with storing files in the database or coupling uploads to one app client, signed storage routes give every client the same upload/download primitive. |
| Clerk | Clerk handles modern auth across web, native, and extension clients. Compared with hand-rolled auth, it removes a high-risk surface area while still letting the backend own authorization decisions. |
| RevenueCat + Stripe | RevenueCat coordinates native subscriptions and Stripe web billing behind one entitlement model. Compared with separate payment implementations per platform, the backend can ask one question: what is this user allowed to access? |
| WXT | WXT gives the Chrome extension a modern TypeScript/Vite workflow and supports the Side Panel API. Compared with hand-maintained manifest scaffolds, it reduces extension build and packaging mistakes. |
| Vercel | Vercel Services deploys the Next.js web app and Fastify API from the same Git repository and domain. Compared with manually wiring CI/CD early, teams get preview deployments and production deploys from normal commits. |

Every part of the stack can be started on free tiers and scales automatically as traffic grows. That matters because the first production architecture should not force a team to choose between moving quickly and being able to handle success.

The bigger advantage is architectural: Anhedral creates all target clients plus one backend that can serve internal and external requests. Product logic, auth decisions, subscription entitlements, storage access, database writes, and webhooks have a central home. That helps startups avoid the common failure mode where every client invents its own rules, and the team later cannot respond quickly when the product needs to shift.

## Local Development

From the generated project root:

```sh
pnpm install
pnpm dev
```

Run one surface at a time:

```sh
pnpm dev:web
pnpm dev:mobile
pnpm dev:api
pnpm dev:desktop
pnpm dev:extension
```

Verify before deployment:

```sh
pnpm verify
pnpm verify:web
pnpm verify:mobile
pnpm verify:api
pnpm verify:desktop
pnpm verify:extension
```

Database workflow:

```sh
pnpm db:generate
pnpm db:migrate
```

## Provider Setup

Generated projects include placeholder env values so the repository can be inspected before accounts are provisioned. Real auth, billing, uploads, native builds, and extension sign-in require provider keys.

The generated `README.md` and `PRODUCTION.md` explain where every key belongs:

- Neon: `DATABASE_URL`
- Clerk: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- RevenueCat + Stripe: `EXPO_PUBLIC_RC_*`, `RC_SECRET_API_KEY`, `RC_WEBHOOK_SECRET`
- Cloudflare R2/CDN: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Vercel: one Services project from the repository root, with `apps/web` and `apps/api`
- EAS: native iOS and Android builds from `apps/mobile`
- Desktop: Electron artifacts from `apps/desktop`
- Chrome Web Store: WXT ZIP upload from `apps/extension/.output`

## Deployment

### Vercel

Import the repository once and set the Vercel Framework Preset to Services.

| Service | Root | Route | Build Command |
| --- | --- | --- | --- |
| Web | `apps/web` | `/` | `pnpm build` |
| API | `apps/api` | `/api/*` | `pnpm build` |

### EAS

Use `apps/mobile` as the Expo project root:

```sh
cd apps/mobile
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init
pnpm dlx eas-cli@latest build --platform all --profile production
pnpm dlx eas-cli@latest submit --platform all --latest --profile production
```

### Desktop

```sh
pnpm desktop:build:mac
pnpm desktop:build:win
pnpm desktop:build:linux
```

### Chrome Extension

```sh
pnpm extension:zip
```

Upload `apps/extension/.output/*-chrome.zip` to the Chrome Web Store Developer Dashboard.

## Dependency Policy

`pnpm dlx anhedral@latest init` gives users the latest published Anhedral CLI, but generated projects use the dependency manifest verified for that release.

Runtime dependency versions live in `src/dependencies.ts`. Generated projects also receive a `stack.json` file recording the exact stack and dependency manifest used for that init run.

This keeps generated apps reproducible while still allowing Anhedral itself to move forward quickly through verified releases.

## Development

Work on the CLI locally:

```sh
pnpm install
pnpm build
pnpm test:all
```

Refresh the checked-in demo output:

```sh
pnpm demo:refresh
```

Validate upstream scaffold drift:

```sh
pnpm test:e2e:latest
```

## Release

Official releases are automatic on merges to `main`. The release workflow bumps the patch version, runs the release checks, creates a release commit and tag, and publishes to npm.

Manual fallback:

```sh
pnpm release:check
npm publish --provenance=false --ignore-scripts
```

## License

MIT

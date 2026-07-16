# Manual Anhedral scaffolding

Use this procedure to build an Anhedral-style workspace without invoking the Anhedral CLI or importing its generator. Complete the phases in order. Do not stop after framework initialization: shared contracts, integration wiring, tests, root scripts, environment examples, CI, and deployment files are part of the scaffold.

## Contents

1. Record inputs and resolve modules
2. Establish the workspace contract
3. Create root configuration
4. Create shared packages
5. Create the API
6. Create client surfaces
7. Wire optional features
8. Configure environments and providers
9. Install, migrate, and verify
10. Audit completeness
11. Work from the Anhedral source repository

## 1. Record inputs and resolve modules

Record these values before editing:

- `projectName`: a valid npm package name; use it for the root package and child package prefixes.
- `displayName`: human-readable product name; escape it for every JSON, JavaScript, HTML, and Markdown context.
- requested app surfaces: `web`, `mobile`, `api`, `desktop`, `extension`.
- requested features: `db`, `auth`, `billing`, `storage`, `native-subscriptions`.
- toolchain policy: exact tested versions for reproducibility, or current compatible versions when the user explicitly wants upgrades.

Resolve the transitive closure before writing files:

```text
auth                 -> api + db
billing              -> auth -> api + db
storage              -> auth -> api + db
native-subscriptions -> mobile + billing -> auth + api + db
```

If no modules were specified, select all five surfaces and all five features. Never create a feature without its prerequisites. Keep normalized order `web, mobile, api, desktop, extension, db, auth, billing, storage, native-subscriptions` when displaying or recording a plan.

Choose Node `^20.19.0 || >=22.12.0` unless mobile is selected. Expo mobile requires `^22.13.0 || ^24.3.0 || >=25`. Use one root pnpm workspace and one root lockfile; never leave nested lockfiles, workspaces, `.git` directories, or `node_modules` inside apps.

Use this stable baseline when current source is unavailable. It was verified on 2026-07-15; keep each version exact and update the baseline as one tested set rather than upgrading packages independently:

```text
pnpm 10.34.5; turbo 2.9.14; TypeScript 5.9.3; @types/node 20.19.43
contracts: zod 4.2.1
db: @neondatabase/serverless 1.0.2, drizzle-orm 0.45.2,
    drizzle-kit 0.31.7, dotenv 17.2.3, tsx 4.20.6
api: fastify 5.8.5, @fastify/cors 11.1.0, @fastify/compress 8.3.0,
     @fastify/helmet 13.0.2, @fastify/rate-limit 10.3.0,
     @clerk/fastify 3.1.51, @aws-sdk/client-s3 3.1047.0,
     @aws-sdk/s3-request-presigner 3.1047.0, vitest 4.1.0
web: next 16.2.10, react/react-dom 19.2.3, @clerk/nextjs 7.5.18,
     @clerk/ui 1.25.3, tailwindcss and @tailwindcss/postcss 4.1.18
mobile: expo 56.0.16, expo-router 56.2.15, react-native 0.85.3,
        @clerk/expo 3.7.5, expo-secure-store 56.0.4,
        react-native-purchases/react-native-purchases-ui 10.4.2
desktop: electron 43.1.1, electron-builder 26.15.3, vite 7.3.6,
         @vitejs/plugin-react 5.2.0, @clerk/clerk-js 6.25.3
extension: wxt 0.20.27, @wxt-dev/module-react 1.2.2,
           @clerk/chrome-extension 3.1.52, tailwindcss 3.4.19
shared UI: clsx 2.1.1, tailwind-merge 3.4.0
```

Expo's package uses TypeScript 6.0.3 and its SDK-compatible React Native support packages from `src/dependencies.ts`; do not force the root TypeScript version into mobile.

## 2. Establish the workspace contract

Create only selected branches of this tree. A bracketed condition makes the file required exactly when true.

```text
<root>/
  .env.example
  .github/workflows/anhedral-ci.yml
  .gitignore
  .vercelignore
  README.md
  PRODUCTION.md
  package.json
  pnpm-workspace.yaml
  turbo.json
  vercel.json
  scripts/verify-db-migrations.mjs                         [db]
  packages/contracts/{package.json,tsconfig.json,src/index.ts} [api]
  packages/api-client/{package.json,tsconfig.json,src/index.ts} [api + any client]
  packages/db/{package.json,tsconfig.json,drizzle.config.ts,.env.example} [db]
  packages/db/src/{index.ts,migrate.ts,schema.ts}           [db]
  packages/db/migrations/.gitkeep                           [db]
  apps/api/{package.json,tsconfig.json,vitest.config.ts,.env.example,.gitignore} [api]
  apps/api/src/{application.ts,env.ts,index.ts,routes.ts}    [api]
  apps/api/src/auth.ts                                      [auth]
  apps/api/src/billing.ts                                   [billing]
  apps/api/src/storage.ts                                   [storage]
  apps/api/tests/{health.test.ts,env.test.ts}                [api]
  apps/api/tests/revenuecat-webhook.test.ts                  [billing]
  apps/api/tests/storage.test.ts                             [storage]
  apps/web/{package.json,tsconfig.json,next-env.d.ts,next.config.ts,postcss.config.mjs,components.json,.env.example} [web]
  apps/web/app/{layout.tsx,page.tsx,globals.css}             [web]
  apps/web/components/ui/{button.tsx,card.tsx}               [web]
  apps/web/lib/utils.ts                                     [web]
  apps/web/{lib/api.ts,hooks/use-api-client.ts}              [web + api]
  apps/web/components/account-actions.tsx                   [web + auth]
  apps/mobile/{package.json,app.json,tsconfig.json,expo-env.d.ts,eas.json,.env.example,.gitignore} [mobile]
  apps/mobile/app/{_layout.tsx,index.tsx}                    [mobile]
  apps/mobile/{lib/api.ts,hooks/use-api-client.ts}           [mobile + api]
  apps/mobile/components/account-controls.tsx               [mobile + auth]
  apps/mobile/lib/subscriptions.ts                           [native-subscriptions]
  apps/desktop/{package.json,tsconfig.json,tsconfig.main.json,vite.config.ts,postcss.config.mjs,components.json,index.html,.env.example} [desktop]
  apps/desktop/scripts/dev.mjs                              [desktop]
  apps/desktop/src/main/{main.ts,preload.cts}                [desktop]
  apps/desktop/src/renderer/{main.tsx,styles.css,lib/utils.ts} [desktop]
  apps/desktop/src/renderer/components/ui/button.tsx        [desktop]
  apps/desktop/src/renderer/lib/api.ts                       [desktop + api]
  apps/desktop/src/renderer/lib/auth.ts                      [desktop + auth]
  apps/extension/{package.json,tsconfig.json,wxt.config.ts,postcss.config.cjs,tailwind.config.cjs,components.json,.env.example,README.md} [extension]
  apps/extension/src/{styles/main.css,lib/utils.ts}          [extension]
  apps/extension/src/components/ui/button.tsx               [extension]
  apps/extension/src/entrypoints/{background.ts,sidepanel/index.html,sidepanel/main.tsx,sidepanel/app.tsx} [extension]
  apps/extension/src/contexts/auth-context.tsx              [extension + auth]
  apps/extension/src/lib/api.ts                              [extension + api]
```

Do not create `anhedral.json` manually. Its schema-v3 hashes, modes, ownership classes, plan fingerprint, module resolution, generator version, and toolchain channel form a trust boundary for `add` and `doctor`. Invented records are worse than no manifest. Also omit `ANHEDRAL.md`, whose CLI-management claims would be false for a manual workspace.

## 3. Create root configuration

### Root package

Create a private `package.json` with version `0.1.0`, the selected Node engine, the pnpm version being used, `turbo` as an exact dev dependency, and `workspaces` containing `apps/*` when any app exists and `packages/*` when API or database exists.

Always add `build: turbo build` and `typecheck: turbo typecheck`. Set `dev` to `turbo dev --parallel` followed by one `--filter=./apps/<surface>` per selected surface. Add only selected scripts:

```text
web:       dev:web, verify:web = typecheck + build
mobile:    dev:mobile, verify:mobile = typecheck + build:web
api:       dev:api, verify:api = test:coverage + build
desktop:   dev:desktop, desktop:build, verify:desktop = typecheck + build
extension: dev:extension, extension:zip, verify:extension = typecheck + zip
db:        db:generate, db:migrate, db:check, db:studio, verify:db
```

Set root `verify` to every selected `verify:<module>` joined with `&&`; include `verify:db`. If no app exists, begin it with `pnpm typecheck`.

### pnpm workspace

Create `pnpm-workspace.yaml` with the same workspace globs as the root package. Set `autoInstallPeers: false`, then add:

```yaml
onlyBuiltDependencies:
  - electron
  - esbuild
  - sharp
ignoredBuiltDependencies:
  - browser-tabs-lock
  - bufferutil
  - core-js
  - electron-winstaller
  - spawn-sync
  - utf-8-validate
peerDependencyRules:
  ignoreMissing:
    - '@solana/web3.js'
    - bs58
    - react-native
  allowedVersions:
    esbuild: '>=0.25.0'
    utf-8-validate: '>=5.0.2'
```

Pin current security overrides for `@vitejs/plugin-react`, `postcss`, vulnerable `esbuild` ranges, `shell-quote`, `tmp`, and `uuid`. Inside the Anhedral repository, copy exact override keys and values from `SECURITY_OVERRIDES` in `src/dependencies.ts`.

### Turbo, ignore files, Vercel, and CI

Create `turbo.json` using `https://turborepo.dev/schema.json` with:

- `build.dependsOn = ["^build"]` and outputs `.next/**`, `!.next/cache/**`, `.output/**`, `dist/**`.
- `typecheck.dependsOn = ["^build"]`.
- `dev.cache = false` and `dev.persistent = true`.

Ignore `node_modules`, framework/build caches, coverage, release output, every `.env` variant except `.env.example`, and `*.tsbuildinfo`. Put extension output, mobile web export, and desktop release output in `.vercelignore`.

Create the single root `vercel.json` using `https://openapi.vercel.sh/vercel.json`. Add service `api` rooted at `apps/api` and service `web` rooted at `apps/web` as selected. Put the `/api/(.*)` rewrite before the web `/(.*)` catch-all. If storage is selected, add a daily `0 3 * * *` cron for `/api/internal/storage/cleanup`.

Create `.github/workflows/anhedral-ci.yml` with read-only contents permission, concurrency cancellation, pinned action commit SHAs, pnpm setup, Node `22.13.0` for mobile or `20.19.0` otherwise, and frozen installation. Run `pnpm typecheck`, API coverage tests when API exists, and `pnpm build`. For database workspaces also run `pnpm verify:db`, run `pnpm db:generate`, fail on any migration diff, and fail on untracked migration artifacts.

Create `README.md` containing selected modules and first-run commands. Create `PRODUCTION.md` containing provider and deployment requirements from sections 8 and 9. These two files become user-owned; do not rewrite them during later manual module additions.

## 4. Create shared packages

Use strict TypeScript with `moduleResolution: Bundler`, `noEmit`, `skipLibCheck`, and `noUncheckedIndexedAccess`. Export source TypeScript directly inside the workspace.

### Contracts

Create `@shared/contracts` whenever API is selected. Depend on Zod. Define and export schemas plus inferred types for health and readiness; authenticated user when auth is selected; entitlement when billing is selected; and strict create-upload, confirm-upload, upload-record, and route-param data when storage is selected.

Keep the upload content-type allowlist and maximum upload size in contracts so API and clients share one source of truth. Validate API response bodies in the client package before returning them.

### API client

Create `@shared/api-client` when API and at least one client surface are selected. Depend on contracts and Zod. Implement:

- strict absolute `http:`/`https:` base-URL normalization with no credentials, query, or fragment;
- an `ApiError` carrying HTTP status, stable code, details, and cause;
- optional async token retrieval;
- timeout and caller-abort composition with listener/timer cleanup;
- JSON parsing and Zod response validation;
- typed methods for health/readiness and only selected auth, billing, and storage routes.

Do not make server-only provider SDKs dependencies of clients.

### Database

Create `@shared/db` when `db` is selected. Use Neon serverless, Drizzle ORM, dotenv, Drizzle Kit, and tsx. Provide `db:generate`, `db:migrate`, `db:check`, and `db:studio`. Configure PostgreSQL with `src/schema.ts` and `migrations/`.

Always define an `items` table. Add `subscriptions` and idempotent `webhookEvents` for billing. Add `uploads` for storage, including user ownership, staging/final keys, declared and actual metadata, status/rejection fields, expiry, cleanup, confirmation, and creation timestamps. Export the Drizzle client and schema, and fail immediately when `DATABASE_URL` is absent.

Create `scripts/verify-db-migrations.mjs`. It must recursively find committed SQL files, fail when none exist, fail when SQL is untracked inside a Git worktree, and require a Git worktree in CI.

## 5. Create the API

Create a Fastify TypeScript package with `dev`, `build`, `typecheck`, `test`, and `test:coverage`. Use Fastify, CORS, compression, Helmet, rate limiting, Zod, and only provider/database dependencies selected by the module plan.

Implement these layers:

- `env.ts`: validate selected values, exact CORS origins, port, proxy hops, demo mode, production key prefixes, URL forms, secret strength, and provider identifier formats. Never silently fall back to demo behavior in production.
- `application.ts`: construct the app, set proxy trust, register security plugins, expose shutdown state, centralize safe error serialization, and register routes under `/api`.
- `routes.ts`: register health/readiness unconditionally and provider routes conditionally.
- `index.ts`: listen on `0.0.0.0`, handle `SIGINT`/`SIGTERM` once, begin draining, close gracefully, and enforce a shutdown deadline.

Always provide `GET /api/health` and `GET /api/ready`. Readiness returns 503 for dependency failure or shutdown. Do not leak internal errors, stack traces, credentials, or arbitrary details in 5xx responses. Allow safe details only for intentional 4xx errors.

When auth is selected, verify Clerk requests server-side and expose protected `/api/me`. When billing is selected, implement a RevenueCat webhook with constant-time secret comparison, shape validation, durable idempotency, claim/retry handling, monotonic event timestamps, and server-side subscriber reconciliation; expose an authenticated entitlement route. When storage is selected, issue short-lived R2 presigned PUTs bound to content type and length, persist pending uploads, verify object metadata before confirmation, isolate keys by authenticated user, and provide an authenticated cleanup endpoint for the scheduled cron.

Test health, readiness, shutdown state, safe errors, and exact CORS behavior. Test environment validation. Add replay/out-of-order/retry tests for billing and size/type/ownership/cleanup tests for storage.

## 6. Create client surfaces

Every client with API access must use `@shared/api-client`; do not duplicate fetch/error logic. Every authenticated client supplies its Clerk session token to that client. Require HTTPS for configured production API URLs.

### Web

Create a Next.js App Router app with Tailwind and shadcn-style `Button` and `Card` primitives. Use strict TypeScript, the `@/*` alias, a development rewrite from `/api/:path*` to `http://localhost:8787/api/:path*`, and same-origin `/api` in production. Wrap the layout in Clerk only for auth. Add account controls for auth and typed API status UI for API.

### Mobile

Create an Expo Router app with static web export, a normalized URL scheme, strict TypeScript, and EAS production profiles. Add Clerk plus secure token caching only for auth. Add the typed API hook only for API. For native subscriptions, configure RevenueCat independently for iOS and Android public SDK keys, synchronize the RevenueCat app-user ID after Clerk loads, log RevenueCat out when Clerk signs out, expose retryable synchronization errors, and present the configured entitlement paywall.

### Desktop

Create Electron main/preload and a Vite React renderer. Keep `contextIsolation: true`, `nodeIntegration: false`, sandboxing enabled, and navigation/window-open restricted to trusted targets. Use a preload bridge rather than exposing Node. Add Tailwind/shadcn-style UI. Add typed API and Clerk browser auth only when selected. Provide development orchestration plus current-host and platform-specific electron-builder scripts.

### Extension

Create a WXT React side-panel extension with Tailwind/shadcn-style UI. Generate permissions from selected features and host permissions only from validated API/Clerk origins. Require HTTPS in production. Add Clerk's extension provider/context only for auth and typed API only for API. Include `storage` and `cookies` permissions only when Clerk needs them. Provide `dev`, `build`, `zip`, `postinstall`, and `typecheck`.

## 7. Wire optional features

After selected surfaces exist, perform a cross-surface pass:

- `auth`: Clerk server verification; protected API route; provider/account UI in every selected client; token-aware API hooks; client publishable keys and server secret separated.
- `billing`: database tables; RevenueCat webhook and entitlement route; contracts and API-client methods. Never expose RevenueCat secret keys.
- `storage`: upload tables; R2 presign/confirm/cleanup; contracts and client methods; Vercel cron; R2 CORS and lifecycle documentation.
- `native-subscriptions`: mobile RevenueCat SDKs, platform keys, Clerk identity synchronization, entitlement/paywall behavior, and error recovery.

Search the finished workspace for imports of unselected providers. Remove both source branches and dependencies when a feature is absent.

## 8. Configure environments and providers

The root `.env.example` is an inventory, not a runtime file. Create package-local examples and copy them to ignored runtime files:

```text
apps/api/.env.example       -> apps/api/.env
packages/db/.env.example    -> packages/db/.env
apps/web/.env.example       -> apps/web/.env.local
apps/mobile/.env.example    -> apps/mobile/.env
apps/desktop/.env.example   -> apps/desktop/.env
apps/extension/.env.example -> apps/extension/.env
```

Include only selected values:

```text
API:       NODE_ENV, PORT, TRUST_PROXY_HOPS, CORS_ORIGINS, ANHEDRAL_DEMO
db:        DATABASE_URL
auth:      CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
web:       NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_API_URL
mobile:    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, EXPO_PUBLIC_API_URL
desktop:   VITE_CLERK_PUBLISHABLE_KEY, VITE_API_URL
extension: VITE_CLERK_PUBLISHABLE_KEY, VITE_CLERK_FRONTEND_API_URL,
           VITE_CLERK_SYNC_HOST, VITE_API_URL, optional VITE_CRX_PUBLIC_KEY
billing:   RC_WEBHOOK_SECRET, RC_SECRET_API_KEY, RC_ENTITLEMENT_ID
native:    EXPO_PUBLIC_RC_API_KEY_IOS, EXPO_PUBLIC_RC_API_KEY_ANDROID,
           EXPO_PUBLIC_RC_ENTITLEMENT_ID
storage:   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
           CRON_SECRET
```

Use explicit local CORS origins for selected browser clients. Include `null` only for Electron's file origin. Production uses exact HTTPS origins. Keep `ANHEDRAL_DEMO=false`, server secrets server-only, and real environment files out of Git.

For R2, document browser-origin CORS allowing PUT and `Content-Type`, optionally exposing `ETag`, and add a lifecycle rule for `staging/` whose age exceeds the application cleanup grace period.

## 9. Install, migrate, and verify

Run from the root:

```sh
pnpm install
pnpm typecheck
```

For a database workspace, copy its environment, generate and review the initial migration, and add it to Git before the gate:

```sh
pnpm db:generate
git add packages/db/migrations
pnpm verify:db
pnpm db:migrate
```

Then run every selected package verification, root verification, and build:

```sh
pnpm verify
pnpm build
```

Run API coverage when API exists, Expo compatibility checks when mobile exists, a packaged Electron smoke test when desktop exists, and load unpacked WXT output when extension exists. Exercise one authenticated API call per selected client. For billing, replay a webhook and send an older event. For storage, perform browser preflight, presigned upload, confirmation, cross-user rejection, and cleanup.

Do not weaken types, tests, provider validation, security headers, or migration checks to make verification green. Report the failing package and command, fix the owning layer, and rerun the narrow check before root verification.

## 10. Audit completeness

Answer yes to every applicable item:

- Were prerequisites resolved before creation?
- Is there exactly one pnpm workspace and lockfile?
- Do root scripts reference only selected modules?
- Does every selected conditional file exist and every unselected one stay absent?
- Are contracts shared by API and clients?
- Are provider dependencies and environment keys gated by selection?
- Are secrets absent from clients and committed files?
- Are optional flows wired end to end rather than represented by placeholders?
- Is a reviewed, committed migration present for `db`?
- Do CI, Vercel services/rewrites, cron, CORS, and local ports agree?
- Did `pnpm verify` and `pnpm build` pass?
- Is `anhedral.json` absent unless produced by the matching CLI?

## 11. Work from the Anhedral source repository

Inside the Anhedral repository, treat current source as higher authority than copied versions or prose. Read before exact reconstruction:

```text
src/architecture/modules.ts   dependency closure and canonical module IDs
src/dependencies.ts           exact versions, engines, and overrides
src/scaffold.ts               root config, CI, docs, env inventory, manifest boundary
src/templates/shared.ts       contracts, API client, and database
src/templates/api.ts          Fastify source, providers, and tests
src/templates/web.ts          Next.js source and conditional wiring
src/templates/mobile.ts       Expo source and RevenueCat integration
src/templates/desktop.ts      Electron/Vite source and security settings
src/templates/extension.ts    WXT source, permissions, auth, and side panel
docs/output-tree-contract.md   expected paths for representative plans
```

Render selected branches manually and replace project/display-name literals safely. Do not execute `dist/bin.js`, `bin/anhedral.js`, `scaffoldProject`, or template scaffold functions. Compare against the relevant output-tree contract, but never copy `demo/`: demos can contain installed artifacts or lag current templates. If source and this guide disagree, follow source and update this guide in the same change.

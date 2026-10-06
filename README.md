# Anhedral

Initialize client-owned applications using the [Anhedral Application Stack & Delivery Standard](docs/application-stack-standard.md).

Every new project starts from the official **shadcn pnpm/Turborepo monorepo**. The default creates **Next.js + React + TypeScript + Tailwind + shadcn/ui**, hosted on **Cloudflare Workers through OpenNext**. Select additional apps and services only when needed.

![Anhedral CLI init stack](assets/anhedral-cli-init.svg)

```sh
pnpm dlx anhedral@latest new my-app
pnpm dlx anhedral@latest new mobile-app --expo
pnpm dlx anhedral@latest new product --next --expo --hono --neon --clerk --r2
pnpm dlx anhedral@latest init --wxt
```

The updated source must be built and published before `anhedral@latest` includes this behavior. To use this checkout now, run `pnpm build`, then `node dist/bin.js new <directory>`.

Applications: `next`, `expo`, `electron`, `wxt`, `hono`.

Optional capabilities: `neon`, `d1`, `local-data`, `clerk`, `better-auth`, `r2`, `kv`, `realtime`, `queues`, `cron`, `workflows`, `openai`, `ai-sdk`, `workers-ai`, `resend`, `stripe`, `revenuecat`, `sentry`, `basin`, `posthog`, `styling`.

Hono provides an OpenAPI Worker when a shared API is selected. Web-only endpoints belong in Next.js route handlers; `apps/api` is never added automatically. Workers services live under `apps/*`, reusable code under `packages/*`. Mobile-only, desktop-only, extension-only and API-only selections remove the unused Next.js starter after the shadcn bootstrap.

Choose either Neon + Drizzle + Hyperdrive or D1 + Drizzle. Authentication is optional; Clerk and Better Auth are mutually exclusive. Better Auth requires an explicit database selection. Stripe is the web billing choice; RevenueCat is an optional addition for cross-store entitlements. Private files use R2 Worker bindings; clients never receive R2 credentials.

`--hosting=vercel` explicitly selects Vercel for Next.js. It requires project approval as an architecture exception. Vinext, GPUI/Rust, Containers and alternative source/CI platforms remain deliberate project adaptations rather than generated templates.

`--dry-run --json` prints a plan without writes or network calls. `--skip-install` skips the final workspace installation; the official shadcn bootstrap still needs network access and can install dependencies. Generation resolves and retains a workspace lockfile. Commit it with the source.

Generated projects include `dev`, `build`, `lint`, `typecheck`, `test`, `audit`, `audit:full`, and `check`, plus GitHub Actions PR checks. Fallow is part of the deterministic gate. Tests run in workspaces that define them; add meaningful product and integration tests as behavior is implemented.

Provider packages and services are **starters**, not finished product features. Generated READMEs identify the remaining setup: resource IDs, migrations, product authorization, webhooks, native adapters and runtime SDK initialization. Initialization does not create cloud resources, activate billing, or deploy. Human approval is required for paid activation, material spending, architecture exceptions and production releases.

The CLI supports `new`, `init`, `--help`, and `--version`. Use `anhedral --help` for options.

## Workspace layout

```text
demo/
├── anhedral-factory/        Factory application and service workspaces
└── default-stack-demo/      Preserved, tested default stack snapshot

src/                        Current initializer implementation
dist/                       Generated JavaScript + declarations
.artifacts/release/         Generated npm tarball + integrity metadata
scripts/, tests/, docs/      Tooling, verification, and the stack standard
```

Each demo retains its own pnpm workspace and lockfile; the root package remains the initializer. Dependencies, caches, generated artifacts, and local credentials are ignored.

```sh
pnpm --dir demo/anhedral-factory dev
pnpm --dir demo/anhedral-factory check
```

Anhedral is open source under the [Apache License 2.0](LICENSE). Generated applications remain ordinary project source that their developers can customize and license for their products.

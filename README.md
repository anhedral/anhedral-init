# Anhedral

[![CI](https://github.com/anhedral/anhedral-init/actions/workflows/ci.yml/badge.svg)](https://github.com/anhedral/anhedral-init/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/anhedral)](https://www.npmjs.com/package/anhedral)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Anhedral guides the development lifecycle through a ChatGPT/Codex plugin: planning, developer setup, infrastructure, implementation, verification, delivery, and operations. The CLI initializes the repository foundation using the [Anhedral Application Stack & Delivery Standard](docs/application-stack-standard.md).

The plugin source lives in `plugins/anhedral`. It guides recommended plugins, CLI tooling, client-owned accounts, infrastructure and scoped permissions for the selected stack. It uses available integrations and documented alternatives; installation does not grant provider access. Install the repository plugin with `codex plugin marketplace add anhedral/anhedral-init`, then `codex plugin add anhedral@anhedral`. Releases include a self-contained plugin ZIP with the same version as the CLI. A public ChatGPT directory listing requires separate submission.

The plugin includes a native control panel with Overview, Infrastructure, Readiness, Delivery, and Settings. Open Anhedral from the plugin menu or ask it to open the control panel, then register an existing project folder. The self-contained Node MCP server reads configuration and checks supported Cloudflare resources, Neon project access, and GitHub Actions on refresh. Provider credentials stay server-side; selected environment identifiers are saved locally. Resource availability, local readiness, and released product behavior remain separate states. Local desktop plugins support this panel; a public ChatGPT directory app requires a separately hosted HTTPS MCP service and submission.

Every new project starts from the official **shadcn pnpm/Turborepo monorepo**. The default creates **Next.js + React + TypeScript + Tailwind + shadcn/ui**, hosted on **Cloudflare Workers through OpenNext**. Select additional apps and services only when needed.

![Anhedral CLI init stack](assets/anhedral-cli-init.svg)

```sh
pnpm dlx anhedral@latest new my-app
pnpm dlx anhedral@latest new mobile-app --expo
pnpm dlx anhedral@latest new product --next --expo --hono --neon --clerk --r2
pnpm dlx anhedral@latest init --wxt
```

To use a local checkout, run `pnpm build`, then `node dist/bin.js new <directory>`.

Applications: `next`, `expo`, `electron`, `wxt`, `hono`.

Optional capabilities: `neon`, `d1`, `local-data`, `clerk`, `better-auth`, `r2`, `kv`, `realtime`, `queues`, `cron`, `workflows`, `openai`, `ai-sdk`, `workers-ai`, `resend`, `stripe`, `revenuecat`, `sentry`, `basin`, `posthog`, `styling`.

Hono provides an OpenAPI Worker when a shared API is selected. Web-only endpoints belong in Next.js route handlers; `apps/api` is never added automatically. Workers services live under `apps/*`, reusable code under `packages/*`. Mobile-only, desktop-only, extension-only and API-only selections remove the unused Next.js starter after the shadcn bootstrap.

Choose either Neon + Drizzle + Hyperdrive or D1 + Drizzle. Authentication is optional; Clerk and Better Auth are mutually exclusive. Better Auth requires an explicit database selection. Stripe is the web billing choice; RevenueCat is an optional addition for cross-store entitlements. Private files use R2 Worker bindings; clients never receive R2 credentials.

`--hosting=vercel` explicitly selects Vercel for Next.js. It requires project approval as an architecture exception. Vinext, GPUI/Rust, Containers and alternative source/CI platforms remain deliberate project adaptations rather than generated templates.

`--dry-run --json` prints a plan without writes or network calls. `--skip-install` skips the final workspace installation; the official shadcn bootstrap still needs network access and can install dependencies. Generation resolves and retains a workspace lockfile. Commit it with the source.

Generated projects include `dev`, `build`, `lint`, `typecheck`, `test`, `audit`, `audit:full`, and `check`, plus GitHub Actions PR checks. Fallow is part of the deterministic gate. Tests run in workspaces that define them; add meaningful product and integration tests as behavior is implemented.

Provider packages and services are **starters**, not finished product features. Generated READMEs identify the remaining setup: resource IDs, migrations, product authorization, webhooks, native adapters and runtime SDK initialization. Initialization does not create cloud resources, activate billing, or deploy. Human approval is required for paid activation, material spending, architecture exceptions and production releases.

The CLI supports `new`, `init`, `doctor`, `--help`, and `--version`. `anhedral doctor <directory> --json` checks local setup requirements without writes; provider access and production readiness remain unverified. Use `anhedral --help` for options. Its JSON plan includes versioned setup requirements, and generated projects include `anhedral.setup.json`. Requirements do not imply that accounts or resources are configured. The CLI and plugin registry share one source in `src/capabilities.ts`; `pnpm build` refreshes the plugin's bundled registry and stack standard.

Requires Node.js 20.19+ in the 20 series or 22.12+ and pnpm 10.34.5. Version 0.6 replaces the legacy generator and builder with the Cloudflare-first initializer; earlier generator commands and templates are retired. Existing applications are not automatically migrated. Pin the CLI version and commit the generated lockfile. The `shadcn@latest` bootstrap can change between generation dates; review upgrades before use.

Initialize from Linux, macOS, or WSL. Native Windows initialization fails before writes because upstream shadcn currently resolves monorepo component paths outside the project; planning and `doctor` remain portable. Expo's release gate currently blocks unpatched `node-forge` and `braces` advisories in its CLI/Metro dependencies. Application releases require resolving or explicitly reviewing those risks; the initializer does not waive them.

## Contributing and security

Anhedral is maintainer-led, with a small contribution surface. Focused bug fixes, tests, and documentation corrections are welcome; discuss larger changes before implementation. See [contributing](https://github.com/anhedral/anhedral-init/blob/main/.github/CONTRIBUTING.md), the [code of conduct](https://github.com/anhedral/anhedral-init/blob/main/.github/CODE_OF_CONDUCT.md), and [security reporting](https://github.com/anhedral/anhedral-init/blob/main/.github/SECURITY.md). Use [issues](https://github.com/anhedral/anhedral-init/issues) for reproducible CLI problems and [private reporting](https://github.com/anhedral/anhedral-init/security/advisories/new) for vulnerabilities.

## Workspace layout

```text
demo/
├── anhedral-factory/        Factory application and service workspaces
└── default-stack-demo/      Default stack snapshot with security maintenance

apps/control-panel/         Embedded plugin UI and MCP status server
plugins/anhedral/           Self-contained installable plugin
src/                        Current initializer implementation
dist/                       Generated JavaScript + declarations
.artifacts/release/         Generated npm tarball + integrity metadata
scripts/, tests/, docs/      Tooling, verification, and the stack standard
```

Each demo retains its own pnpm workspace and lockfile; the root package remains the initializer. Dependencies, caches, generated artifacts, and local credentials are ignored.

```sh
pnpm dev:panel                        # Local UI preview after pnpm build
pnpm test:integration                 # Real web, API/auth, and packaged desktop paths
pnpm --dir demo/anhedral-factory dev
pnpm --dir demo/anhedral-factory check
```

Anhedral is open source under the [Apache License 2.0](LICENSE). Generated applications remain ordinary project source that their developers can customize and license for their products. Preserve applicable license notices for upstream code and dependencies.

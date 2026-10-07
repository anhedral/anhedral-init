# Anhedral

[![CI](https://github.com/anhedral/anhedral-init/actions/workflows/ci.yml/badge.svg)](https://github.com/anhedral/anhedral-init/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/anhedral)](https://www.npmjs.com/package/anhedral)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Anhedral guides the development lifecycle through a ChatGPT/Codex plugin: planning, developer setup, infrastructure, implementation, verification, delivery, and operations. The CLI initializes the repository foundation using the [Anhedral Application Stack & Delivery Standard](docs/application-stack-standard.md).

The plugin source lives in `plugins/anhedral`. It guides recommended plugins, CLI tooling, client-owned accounts, infrastructure and scoped permissions for the selected stack. It uses available integrations and documented alternatives; installation does not grant provider access. Install the repository plugin with `codex plugin marketplace add anhedral/anhedral-init`, then `codex plugin add anhedral@anhedral`. Releases include a self-contained plugin ZIP with the same version as the CLI. A public ChatGPT directory listing requires separate submission.

The plugin includes a single architecture view. Describe an app to Codex; the agent chooses the needed stack, builds it and updates its components, connections and status through the control-panel tools. Select a component for evidence and details. Setup and lifecycle tracking stay behind the scenes. Existing projects are inspected rather than reinitialized.

The self-contained Node MCP server saves plans locally and checks supported Cloudflare resources, Neon project access and GitHub Actions on refresh. Credential values stay server-side. Agent-recorded stack progress, configured bindings, provider availability and verified product behavior are distinct. A local preview copies agent requests instead of executing them; a host without the necessary tools needs those integrations connected. Local desktop plugins support this panel; a public ChatGPT directory app requires a separately hosted HTTPS MCP service and submission.

`anhedral.progress.json` stores non-secret milestones, discovery observations, blockers and app links separately from generated requirements. Read it with `anhedral progress show <directory>`; report validated evidence with `anhedral progress report <directory> <report.json|->`. Plugin reports share this contract. Source/configuration changes, provider-scope changes and expired discovery require rechecking. Deployment and product tests remain separate outcomes.

The default web recipe creates **Next.js + React + TypeScript + Tailwind + shadcn/ui**, hosted on **Cloudflare Workers through OpenNext**. Non-web recipes initialize their own foundations without an unrelated Next.js bootstrap. Choose applications and services for workload, compatibility, client constraints, operations, and cost; preserve suitable existing architecture.

![Anhedral CLI init stack](assets/anhedral-cli-init.svg)

```sh
pnpm dlx anhedral@latest new my-app
pnpm dlx anhedral@latest new mobile-app --expo
pnpm dlx anhedral@latest new product --next --expo --hono --neon --clerk --r2
pnpm dlx anhedral@latest init --wxt
pnpm dlx anhedral@latest new api --hono --layout single
```

To use a local checkout, run `pnpm build`, then `node dist/bin.js new <directory>`.

Applications: `next`, `expo`, `electron`, `wxt`, `hono`.

Optional capabilities: `neon`, `d1`, `local-data`, `clerk`, `better-auth`, `r2`, `kv`, `realtime`, `queues`, `cron`, `workflows`, `openai`, `ai-sdk`, `workers-ai`, `resend`, `stripe`, `revenuecat`, `sentry`, `basin`, `posthog`, `styling`.

Hono provides an OpenAPI Worker when a shared API is selected. Web-only endpoints belong in Next.js route handlers; `apps/api` is never added automatically. Workspace recipes use `apps/*` for applications/services and `packages/*` for reusable code, with pnpm/Turborepo. `--layout single` provides a root Hono API without workspace orchestration; unsupported shared/platform combinations are rejected. WXT generates a side panel by default or a selected popup; other extension surfaces require targeted implementation.

The generated database recipes are Neon + Drizzle + Hyperdrive or D1 + Drizzle; direct Neon serverless access is another project-specific integration choice. Authentication is optional; Clerk and Better Auth are mutually exclusive. Better Auth requires an explicit database selection. Stripe is the web billing choice; RevenueCat is an optional addition for cross-store entitlements. Private files use R2 Worker bindings; clients never receive R2 credentials.

`--hosting=vercel` explicitly selects Vercel for Next.js. Select hosting for compatibility, operations, and cost. Vinext, GPUI/Rust, Containers and alternative source/CI platforms remain deliberate project adaptations rather than generated templates.

`--dry-run --json` prints a plan without writes or network calls. `--skip-install` skips the final workspace installation; the pinned web bootstrap still needs network access and can install dependencies. Non-web foundations do not invoke shadcn. Generation resolves and retains a workspace lockfile. Commit it with the source.

Generated projects include `dev`, `build`, `lint`, `typecheck`, `test`, `audit`, `audit:full`, and `check`, plus GitHub Actions PR checks. The pinned Fallow audit is part of the local gate; external integration and advisory checks remain time-sensitive evidence. Tests run in workspaces that define them; add meaningful product and integration tests as behavior is implemented.

Provider packages and services are **starters**, not finished product features. Generated READMEs identify the remaining setup: resource IDs, migrations, product authorization, webhooks, native adapters and runtime SDK initialization. Initialization does not create cloud resources, activate billing, or deploy. Honor existing authorization and the project budget; obtain missing authority for paid activation, material spending, broader access, terms, and production changes. A local-only development instruction does not authorize shipping.

The CLI supports `new`, `init`, `doctor`, `progress`, `--help`, and `--version`. `anhedral doctor <directory> --json` checks local setup requirements without writes; provider access and production readiness remain unverified. Use `anhedral --help` for options. Its JSON plan includes versioned setup requirements, and generated projects include `anhedral.setup.json`. Requirements do not imply that accounts or resources are configured. The CLI and plugin registry share one source in `src/capabilities.ts`; `pnpm build` refreshes the plugin's bundled registry and stack standard.

Requires Node.js 20.19+ in the 20 series or 22.12+ and pnpm 10.34.5. Version 0.6 replaces the legacy generator and builder with the Cloudflare-first initializer; earlier generator commands and templates are retired. Existing applications are not automatically migrated. Pin the CLI version and commit the generated lockfile. The web bootstrap pins `shadcn@4.21.1`; upstream templates/registries can still change. Review output and compatibility when upgrading generator inputs. Cloudflare currently recommends beta vinext, but this CLI retains its tested OpenNext recipe; no existing projects are automatically migrated.

Initialize from Linux, macOS, or WSL. Web initialization on native Windows fails before writes because upstream shadcn resolves monorepo component paths outside the project; use WSL for that recipe. Other recipes have their own platform/build requirements; planning and `doctor` remain portable. The Expo recipe is experimental: its production release gate blocks unpatched `node-forge` and `braces` advisories in upstream CLI/Metro dependencies. Compatibility checks prove that rejection; they do not waive the audit or certify a mobile application for release.

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

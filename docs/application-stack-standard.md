# Anhedral Application Stack & Delivery Standard

## 1. Standard

Anhedral builds **client-owned, monorepo-first applications** using established frameworks, services, APIs, CLIs, plugins, and agent tooling.

The standard is:

- **Cloudflare-first** for hosted application infrastructure.
- **Free-first** where suitable.
- **OpenAI/Codex-operated** for development and operations.
- **Computer Use and Control Chrome throughout development.**
- **GitHub-first** for source control and delivery.
- **Next.js-first** for web applications.
- **pnpm + Turborepo** for TypeScript/JavaScript monorepos.
- **shadcn monorepo initialization for every new project.**
- **macOS** as the Anhedral development environment.
- Add applications, packages, providers, and infrastructure only when required.
- Keep client accounts, source, infrastructure, billing, and recovery client-owned.

Human approval is required for paid activation, material spending, architecture exceptions, and production releases.

---

# 2. Tooling selection chart

|Need|Default|Option|When to use|
|---|---|---|---|
|**Repository foundation**|**shadcn monorepo initializer + pnpm + Turborepo**|Native language workspaces alongside it|Every new project, including mobile-only, desktop-only, extensions, or projects using another app template.|
|**Web**|**Next.js + React + TypeScript + Tailwind + shadcn/ui**|Vinext|Next.js by default. Vinext only when its Vite/Workers architecture provides a demonstrated benefit.|
|**Mobile**|**Expo + React Native Reusables**|—|iOS/Android applications.|
|**Desktop**|**Electron** + **React** + **TypeScript** + **Tailwind** + **shadcn/ui**|GPUI + Rust|Electron for React/TS reuse. GPUI for deliberately Rust-first applications.|
|**Extension**|**WXT + Chrome Side Panel API**|—|Browser-integrated products. Side Panel is the primary UI.|
|**API**|**Hono + OpenAPI on Workers**|Next.js route handlers|Hono for shared/mobile/external APIs. Next.js handlers when only the web application needs them.|
|**Next.js hosting**|**Cloudflare Workers + OpenNext**|Vercel|Cloudflare by default. Vercel when native Next.js hosting materially simplifies the project and its applicable plan is appropriate.|
|**General compute**|**Cloudflare Workers**|Containers|Containers for Linux/native dependencies or workloads that do not fit Workers.|
|**PostgreSQL**|**Neon + Drizzle + Hyperdrive**|—|Relational PostgreSQL persistence.|
|**Cloudflare SQL**|**D1 + Drizzle**|Neon|D1 when SQLite semantics are sufficient.|
|**Local data**|**SQLite + filesystem**|—|Offline/device-local applications.|
|**Authentication**|**Clerk or Better Auth**|No auth|Clerk for managed identity; Better Auth for application-managed auth; no auth when unnecessary.|
|**Files**|**Private R2 + Worker binding**|Local filesystem|R2 for remote files; filesystem for local files.|
|**Cache/config**|**KV**|—|Eventually consistent configuration/cache, never authoritative transactional state.|
|**Realtime**|**Durable Objects + WebSockets**|—|Presence, rooms, collaboration, and stateful realtime coordination.|
|**Jobs**|**Queues**|—|Deferred/asynchronous processing.|
|**Scheduled work**|**Cron Triggers**|—|Recurring scheduled work.|
|**Durable workflows**|**Workflows**|—|Resumable multi-step processes.|
|**AI**|**OpenAI SDK or AI SDK**|Workers AI|OpenAI SDK for direct OpenAI use; AI SDK for streaming/tools/provider abstraction; Workers AI when Cloudflare inference is advantageous.|
|**Outbound email**|**Resend**|—|Transactional application email.|
|**Inbound email**|**Cloudflare Email Routing**|—|Incoming domain-email forwarding.|
|**Business email**|**Existing provider**|Future Cloudflare offering|Reconsider when Cloudflare's offering is GA/free and preferable.|
|**Payments**|**Stripe**|RevenueCat + Stripe|Add RevenueCat when web/App Store/Play Store entitlements need unified management.|
|**Operational telemetry**|**Cloudflare Observability**|Sentry|Add Sentry when additional crash/runtime diagnostics are required.|
|**Product analytics**|**Basin**|PostHog|PostHog when replay, experiments, funnels, or other required capabilities justify it.|
|**TS/JS auditing**|**Fallow**|—|Standard static/codebase audit for TypeScript and JavaScript. Use in development and PR checks.|
|**Source**|**Git + GitHub**|Cloudflare Artifacts|GitHub by default. Artifacts when it provides a concrete advantage and required controls are supported.|
|**CI/CD**|**GitHub Actions**|Workers Builds|Workers Builds when equivalent controls are available and useful.|
|**Development agent**|**OpenAI / Codex**|—|Primary implementation, reasoning, testing, and operational agent.|
|**Interactive development**|**Computer Use + Control Chrome**|—|Used heavily throughout implementation, iteration, setup, automation, and verification.|
|**Cloudflare operations**|**Cloudflare plugin + `cf` + API/MCP**|Dashboard when useful|Provisioning, deployment, configuration, analytics, observability, and operations.|

Do not activate every option simply because it appears in the table.

---

# 3. Repository foundation

## Every project starts with shadcn

Every new Anhedral project starts from the **shadcn-generated pnpm/Turborepo monorepo**, regardless of initial application type.

Initialize:

```
pnpm dlx shadcn@latest init --monorepo --template next
```

This is the **repository bootstrap**, not a requirement that every project remain a Next.js application.

After initialization:

- Preserve the generated pnpm/Turborepo structure and conventions.
- Use `apps/*` for applications/services.
- Use `packages/*` for reusable packages.
- Keep the generated Next.js app when Next.js is required.
- Remove or replace the starter app when the project is mobile-only, desktop-only, extension-only, or uses another explicitly selected application template.
- Never retain an unused Next.js application solely because it initialized the repository.
- Add application-specific templates inside the established monorepo.

Examples:

```
Mobile-only

apps/
└── mobile/
```

```
Extension-only

apps/
└── extension/
```

```
Full product

apps/
├── web/
├── mobile/
├── desktop/
├── extension/
├── api/
├── jobs/
└── realtime/
```

## Additional initialization

Mobile:

```
pnpm dlx @react-native-reusables/cli@latest init
```

Extension:

```
pnpm dlx wxt@latest init
```

Standard commands where applicable:

```
dev
build
lint
typecheck
test
audit
check
```

Other languages retain their native toolchains. Turborepo coordinates them where useful but does not replace Cargo, Python tooling, Expo tooling, or other native systems.

Commit lockfiles and record important toolchain versions.

---

# 4. Application conventions

## Web

Default:

**Next.js + React + TypeScript + Tailwind CSS + shadcn/ui**

Keep the App Router product-driven:

```
app/
├── page.tsx
├── dashboard/
├── projects/
├── settings/
└── (admin)/
```

Use route groups such as `(admin)` and `(auth)` when they provide a meaningful layout, authorization, or organizational boundary.

### Vinext

Vinext is an explicit project choice, not an automatic Next.js replacement.

Use it only when its Vite/Workers architecture provides a concrete benefit and the project's dependencies and framework behavior have been verified.

## Mobile

Use:

**Expo + React Native + React Native Reusables + TypeScript**

Follow the same general package, styling, naming, and domain conventions as web.

Share appropriate business logic, contracts, validation, styling, and utilities.

Do not force React and React Native to share rendered components when separate implementations are cleaner.

## Desktop

Use **Electron** when React/TypeScript reuse is useful.

Use **GPUI + Rust** when a deliberately Rust-first architecture, native integration, or performance requirement justifies a separate implementation.

## Browser extensions

Use:

**WXT + Chrome Side Panel API**

The Chrome Side Panel is the primary extension interface.

Use WXT for:

- side panel
- service worker/background logic
- content scripts
- browser messaging
- permissions
- packaging

Do not default to popup-first extension architecture.

---

# 5. Shared packages

Create packages only when genuine reusable behavior exists.

Typical options:

```
packages/
├── ui/                 # React / shadcn
├── ui-native/          # React Native Reusables
├── styling/            # colors, typography, spacing, themes
├── contracts/          # schemas, types, API/event contracts
├── api-client/
├── domain/             # portable business logic
├── server/             # server-only logic
├── auth/
├── db/
├── local-data/
├── storage/
├── billing/
├── email/
├── ai/
├── analytics/
├── observability/
├── i18n/
├── eslint-config/
├── typescript-config/
└── test-config/
```

Use **`styling`**, not `tokens`, for shared styling definitions.

Share:

- styling
- schemas
- validation
- contracts
- API types
- event definitions
- portable business logic

Keep platform-specific UI separate where appropriate.

Keep privileged/server integrations out of client-safe packages.

Never expose server credentials through shared client code.

---

# 6. Cloudflare hosting

Cloudflare is the preferred hosted application platform.

Typical architecture:

```
Web / Mobile / Desktop / Extension
                  │
                  ▼
          Cloudflare Workers
            Hono / Next.js
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   Hyperdrive    R2      Durable Objects
       │                     │
       ▼                  WebSockets
     Neon

Workers
├── Queues
├── Cron
├── Workflows
├── KV
├── Observability
└── Basin
```

Use only required services.

## Next.js hosting

Default:

```
Next.js
   ↓
OpenNext
   ↓
Cloudflare Workers
```

Alternative:

```
Next.js
   ↓
Vercel
   │
   └─────────────→ Cloudflare infrastructure
```

Vercel may host only the Next.js application while Cloudflare continues to provide:

- APIs
- R2
- Hyperdrive
- Durable Objects
- Queues
- Workflows
- analytics
- other infrastructure

Use Vercel when its native Next.js integration, previews, deployment experience, or framework support materially simplifies the project and its applicable plan/cost is appropriate.

Cloudflare remains the default.

---

# 7. APIs

Use:

**Hono + OpenAPI on Cloudflare Workers**

when a shared network API is required by:

- mobile
- desktop
- extensions
- integrations
- external consumers
- multiple application interfaces

Use **Next.js route handlers** when endpoints belong only to the web application and a separate service adds no useful boundary.

Do not create `apps/api` automatically.

---

# 8. Data

## PostgreSQL

Default:

```
Worker
  ↓
Drizzle
  ↓
Hyperdrive
  ↓
Neon PostgreSQL
```

Use PostgreSQL when relational requirements justify it.

Neon remains independently managed.

Avoid inappropriate Hyperdrive query caching for correctness-sensitive operations such as:

- authentication
- permissions
- entitlements
- balances
- quotas
- financial records
- paid-unit consumption

## D1

Use:

**D1 + Drizzle**

when SQLite semantics are sufficient and Cloudflare-native persistence is preferable.

D1 is an alternative database choice, not an automatic PostgreSQL replacement.

## Local data

Use:

**SQLite + filesystem**

for local/device-resident data.

Do not add cloud persistence merely because other applications use it.

Offline synchronization requires explicit design for:

- identity
- offline writes
- conflicts
- reconciliation
- authoritative state

---

# 9. Private files

Remote application files use:

**private Cloudflare R2 buckets accessed through Worker bindings.**

```
web / mobile / desktop / extension
                 ↓
              Worker
                 ↓
       authenticate + authorize
                 ↓
         private R2 binding
```

Clients never receive R2 credentials.

The Worker enforces file-level authorization.

Do not make private application buckets public for convenience.

Use the local filesystem when files are intentionally device-local.

---

# 10. Authentication

Choose per project.

### Clerk

Use when managed identity reduces implementation and maintenance.

### Better Auth

Use when application-managed authentication is preferred.

### No authentication

Use when accounts are unnecessary.

Do not add authentication merely because other projects use it.

Cloudflare Access may separately protect internal applications or staging environments.

---

# 11. Realtime and asynchronous work

Use **Durable Objects + WebSockets** for:

- rooms
- presence
- collaboration
- connection coordination
- stateful realtime behavior

Use **Queues** for asynchronous jobs.

Use **Cron Triggers** for scheduled work.

Use **Workflows** for durable, resumable multi-step processes.

Use **Containers** when suitable workloads require:

- Linux binaries
- native dependencies
- heavier compute
- isolated processing

Define retries, idempotency, concurrency, and failure handling where applicable.

---

# 12. AI

Normal choices:

### OpenAI SDK

Use when directly integrating OpenAI.

### AI SDK

Use when the application benefits from:

- streaming
- tool calling
- provider abstraction
- structured AI UI patterns
- established templates/examples

Prefer official examples and suitable Next.js templates over unnecessary custom infrastructure.

### Workers AI

Optional.

Use when Cloudflare-hosted inference provides a concrete project advantage.

AI Gateway and related Cloudflare AI services may be selected when their routing, observability, control, or cost features justify them.

---

# 13. Email

Use:

```
Outbound application email → Resend
Inbound email             → Cloudflare Email Routing
Business mailbox          → existing provider
```

Treat these as separate concerns.

Do not migrate business email solely for provider consolidation.

Reconsider Cloudflare business email when its offering is generally available or free and actually preferable.

---

# 14. Payments

Use **Stripe** for web payments and subscriptions.

Add **RevenueCat** when subscriptions span web, App Store, and Play Store ecosystems and unified entitlement management is useful.

Keep separate concepts for:

- billing
- subscriptions
- entitlements
- credits
- quotas
- seats
- consumption

Paid-unit consumption must be transactional and idempotent.

---

# 15. Analytics and observability

## Operations

Use **Cloudflare Observability** for:

- logs
- errors
- traces
- latency
- deployments
- request behavior
- operational investigation

Add **Sentry** when additional runtime or crash diagnostics are required.

## Product analytics

Use **Basin** for:

- application events
- analytical datasets
- analytical queries

Add **PostHog** when requirements such as:

- session replay
- funnels
- experiments
- specialized product analytics

justify it.

Do not install every analytics platform by default.

Operational telemetry and product analytics are separate concerns.

---

# 16. TypeScript/JavaScript auditing

Use **Fallow** as the standard TypeScript/JavaScript codebase auditing tool.

Fallow complements linting, typechecking, testing, builds, and runtime verification.

Use it for:

- unused code
- unused dependencies
- circular dependencies
- duplication
- complexity
- architecture-boundary problems
- dependency issues
- styling/design-system drift

During development:

```
pnpm exec fallow
```

For PR/change auditing:

```
pnpm exec fallow audit
```

Use `fallow audit` in PR checks where applicable to identify problems introduced by the change.

The deterministic gate should generally include:

```
format / lint
      ↓
typecheck
      ↓
Fallow audit
      ↓
tests
      ↓
build
      ↓
integration checks
```

`pnpm check` should run the project's required deterministic gate.

Fix legitimate findings. Use narrow documented exceptions for intentional behavior rather than broad ignores.

---

# 17. Anhedral developers

Anhedral development is **agent-driven on macOS**.

The core environment is:

```
macOS
├── OpenAI / Codex
├── Computer Use
├── Control Chrome
├── terminal + development servers
├── native apps / simulators
├── provider plugins
├── APIs / MCP
└── CLIs
```

## Developer tooling

|Tool|Primary use|
|---|---|
|**OpenAI / Codex**|Primary coding and reasoning agent: planning, implementation, debugging, review, testing, and operations.|
|**Computer Use**|Dynamic testing, fast iteration, macOS interaction, application testing, setup automation, task automation, debugging, and cross-application workflows.|
|**Control Chrome**|Browser development, rapid UI iteration, authentication flows, integrations, console/network inspection, dashboards, and deployed-app verification.|
|**Cloudflare plugin + `cf` + API/MCP**|Cloudflare provisioning, configuration, deployments, logs, observability, analytics, and operations.|
|**GitHub plugin**|Repositories, branches, worktrees, PRs, issues, checks, reviews, and releases.|
|**Neon integration/API**|PostgreSQL projects, branches, databases, migrations, and operations.|
|**Stripe plugin**|Products, prices, payments, subscriptions, test transactions, and billing operations.|
|**RevenueCat integration**|Products, offerings, subscriptions, and entitlements.|
|**Email integrations**|Application email and supported mailbox/email workflows.|
|**Slack plugin**|Project context, communication, decisions, notifications, and workflows.|
|**[Cloudflare security audit](https://github.com/cloudflare/security-audit-skill)**|Repository security reviews and verified vulnerability findings.|
|**Next.js skills/tools**|Framework conventions, implementation, routing, rendering, debugging, and optimization.|
|**Vercel plugin**|Projects, deployments, environments, logs, and operations when Vercel is selected.|

---

# 18. Accounts and access

Configure only the services selected by the project.

- **Cloudflare:** client-owned account, account ID, authorized plugin/OAuth or scoped API token, and a plan supporting the selected services. Add billing or DNS access only when required.
- **Neon / Hyperdrive:** authorized Neon project access, database connection credentials, separate migration/runtime roles, and Hyperdrive origin configuration.
- **Private R2 / Pipelines:** Worker bindings for application storage; authorized sink writes to the selected private bucket. Cloudflare's managed setup requires the Workers Pipelines app's **Pipelines Setup** grant. Keep ingestion private unless an authorized public endpoint is required.
- **Auth and optional providers:** Better Auth secret/URL or Clerk keys; selected AI, email, payments, analytics, and observability credentials, domains, and webhooks.
- **GitHub / CI:** repository access, protected deployment secrets, and environment-specific resource identifiers.

Keep secrets server-side and out of source control. Obtain approval for paid activation, broader access, and required terms. Configure resource bindings, verify selected integrations in the deployed application, and record remaining setup before production approval.

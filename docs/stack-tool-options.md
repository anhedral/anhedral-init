# Existing stack components and tools

This document indexes the technologies Anhedral currently generates, configures,
or directly uses in generated projects. It deliberately excludes possible
future stack options.

The links point to each tool's primary official documentation index. Those
indexes provide access to the tool's guides, concepts, configuration reference,
and API reference.

## Application foundations

### Programming language

TypeScript is mandatory for every Anhedral-generated application. It is a
fixed foundation, not a selectable stack option.

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| TypeScript | Required language for generated applications, components, services, and shared packages | [TypeScript documentation](https://www.typescriptlang.org/docs/) |
| JavaScript | Used only where a runtime, script, or configuration format requires JavaScript | [MDN JavaScript guide and reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript) |

### Server runtime

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Node.js | CLI, workspace scripts, Fastify API, Next.js, and build tooling | [Node.js documentation](https://nodejs.org/docs/latest/api/) |
| Cloudflare Workers runtime | Private R2 gateways and Cloudflare Workflows control endpoints | [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/) |

## Web application

### Web application framework

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Next.js App Router | Web routes, layouts, server rendering, and application runtime | [Next.js documentation](https://nextjs.org/docs) |

### Frontend UI library

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| React | Web, Electron renderer, and browser-extension user interfaces | [React documentation](https://react.dev/) |

### Frontend build tool

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Turbopack | Next.js development and build integration | [Turbopack documentation](https://nextjs.org/docs/app/api-reference/turbopack) |
| Vite | Electron renderer build tool | [Vite documentation](https://vite.dev/guide/) |

### Web styling and components

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Tailwind CSS | Utility-first styling for DOM applications | [Tailwind CSS documentation](https://tailwindcss.com/docs) |
| shadcn/ui | Source-owned DOM component collection | [shadcn/ui documentation](https://ui.shadcn.com/docs) |
| Radix Primitives | Accessible primitives used by generated shadcn/ui components | [Radix Primitives documentation](https://www.radix-ui.com/primitives/docs/overview/introduction) |

## Mobile application

### Mobile framework and routing

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Expo | Native application development, builds, and platform integration | [Expo documentation](https://docs.expo.dev/) |
| React Native | Native UI runtime used through Expo | [React Native documentation](https://reactnative.dev/docs/getting-started) |
| Expo Router | File-based native application routing | [Expo Router documentation](https://docs.expo.dev/router/introduction/) |

### Native components

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| React Native Reusables | Source-owned TypeScript component collection for the Expo application | [React Native Reusables documentation](https://rnr-docs.vercel.app/getting-started/introduction/) |

## Desktop application

### Desktop framework

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Electron | Cross-platform desktop main process, preload bridge, and renderer runtime | [Electron documentation](https://www.electronjs.org/docs/latest/) |

### Desktop packaging and updates

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| electron-builder | Native desktop application packaging | [electron-builder documentation](https://www.electron.build/) |
| electron-updater | Optional signed desktop update checks and installation | [electron-updater documentation](https://www.electron.build/auto-update.html) |

Desktop update delivery additionally uses the existing Cloudflare Workers and
private R2 options documented below.

## Browser extension

### Browser extension framework

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| WXT | Manifest V3 entrypoints, development, builds, and packaging | [WXT documentation](https://wxt.dev/guide/introduction.html) |
| Chrome Extensions APIs | Chrome-specific extension APIs and publishing model | [Chrome Extensions documentation](https://developer.chrome.com/docs/extensions/) |
| WebExtensions APIs | Cross-browser extension interfaces | [MDN WebExtensions documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions) |

## Backend and API

### API framework

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Fastify | HTTP routes, plugins, validation integration, and structured logging | [Fastify documentation](https://fastify.dev/docs/latest/) |

### API protocol and contracts

| Tool or standard | Current responsibility | Official documentation |
| --- | --- | --- |
| HTTP and REST/JSON | Transport between generated clients and the Fastify API | [MDN HTTP documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP) |
| Zod | Shared request, response, environment, and boundary validation | [Zod documentation](https://zod.dev/) |

## Database and persistence

### Database engine

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| PostgreSQL | Relational database engine for managed and self-hosted selections | [PostgreSQL documentation](https://www.postgresql.org/docs/) |

### Database deployment

| Option | Current responsibility | Official documentation |
| --- | --- | --- |
| Neon | Default managed PostgreSQL provider | [Neon documentation](https://neon.com/docs/introduction) |
| Self-hosted PostgreSQL | Optional private PostgreSQL service on the generated Docker/VPS infrastructure | [PostgreSQL server administration](https://www.postgresql.org/docs/current/admin.html) |

### ORM and migrations

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Drizzle ORM | TypeScript schema definitions and database queries | [Drizzle ORM documentation](https://orm.drizzle.team/docs/overview) |
| Drizzle Kit | Reviewed SQL migration generation and application | [Drizzle Kit documentation](https://orm.drizzle.team/docs/kit-overview) |

## Authentication and authorization

### Authentication and identity

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Clerk | User identity, client sessions, organizations, and server-side token verification | [Clerk documentation](https://clerk.com/docs) |
| Auth.js | Database-backed credentials and secure Next.js sessions; generated under `app/(auth)` | [Auth.js documentation](https://authjs.dev/getting-started) · [Credentials provider](https://authjs.dev/getting-started/authentication/credentials) |

Auth.js is supported for the Next.js + Fastify topology through a server-side
session bridge. Clerk remains the authentication option for Expo, Electron, and
browser-extension surfaces until equivalent native Auth.js session exchange is
implemented.

### Administration surface

| Option | Generated structure | Documentation |
| --- | --- | --- |
| Admin page | `apps/web/app/(admin)/admin` within the primary Next.js application | [Next.js route groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) |
| Admin app | Separate `apps/admin` Next.js application with `(auth)` and `(admin)` groups | [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure) |

### Authorization

Authorization is currently application-defined. Generated services derive the
authenticated user on the server and enforce ownership or role checks at trusted
boundaries.

| Reference | Current responsibility | Documentation |
| --- | --- | --- |
| OWASP Authorization guidance | Security guidance for application-defined authorization | [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) |

## Storage, realtime, and background work

### Object storage

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Cloudflare R2 | Private application assets and optional desktop update artifacts | [Cloudflare R2 documentation](https://developers.cloudflare.com/r2/) |

### Asset and update gateway

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Cloudflare Workers | Authenticated or controlled delivery from private R2 buckets | [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/) |
| R2 Workers API | Direct bound-bucket access from generated Workers | [R2 Workers API documentation](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/) |
| R2 S3-compatible API | Presigned uploads and release artifact publishing | [R2 S3 API documentation](https://developers.cloudflare.com/r2/api/s3/api/) |

### Realtime communication

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Ably | Authenticated, user-scoped realtime events across selected clients | [Ably documentation](https://ably.com/docs/) |

### Durable workflows

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Cloudflare Workflows | Optional retryable multi-step jobs, sleeps, and external events | [Cloudflare Workflows documentation](https://developers.cloudflare.com/workflows/) |

## Billing and native purchases

### Subscription authority

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| RevenueCat | Subscription products, customer entitlements, webhooks, and native purchase reconciliation | [RevenueCat documentation](https://www.revenuecat.com/docs) |

### Web payments and billing

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Stripe Payments | Payment processing used by the current web billing path | [Stripe Payments documentation](https://docs.stripe.com/payments) |
| Stripe Billing | Web subscription catalog and lifecycle integration | [Stripe Billing documentation](https://docs.stripe.com/billing) |

### Native app-store purchases

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Apple StoreKit | Apple App Store purchase platform integrated through RevenueCat | [StoreKit documentation](https://developer.apple.com/documentation/storekit) |
| Google Play Billing | Google Play purchase platform integrated through RevenueCat | [Google Play Billing documentation](https://developer.android.com/google/play/billing) |

## Hosting and infrastructure

### Deployment model

Anhedral currently supports two application deployment shapes:

| Option | Current responsibility | Documentation |
| --- | --- | --- |
| Vercel services | Default managed web and API deployment | [Vercel documentation](https://vercel.com/docs) |
| Self-managed VPS | Optional Ubuntu, Docker Compose, Nginx, Certbot, and PostgreSQL deployment | [Anhedral provisioning reference](references/provisioning.md) |

Cloudflare Workers host the selected R2 delivery gateways and Workflows
components independently of the web/API deployment model.

### Serverless and edge compute

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Vercel Functions | Managed Next.js and Fastify compute | [Vercel Functions documentation](https://vercel.com/docs/functions) |
| Cloudflare Workers | Edge compute for storage, updates, and workflows | [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/) |

### Host operating system

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Ubuntu Server | Optional hardened VPS host baseline | [Ubuntu Server documentation](https://ubuntu.com/server/docs) |

### Containers

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Docker Engine | Optional VPS container runtime | [Docker Engine documentation](https://docs.docker.com/engine/) |
| Docker Compose | Optional multi-service VPS deployment | [Docker Compose documentation](https://docs.docker.com/compose/) |

### Reverse proxy and TLS

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Nginx | Optional VPS reverse proxy for public application traffic | [Nginx documentation](https://nginx.org/en/docs/) |
| Certbot | Optional automated certificate lifecycle | [Certbot documentation](https://eff-certbot.readthedocs.io/) |
| Let's Encrypt | Certificate authority used by Certbot | [Let's Encrypt documentation](https://letsencrypt.org/docs/) |

### DNS and CDN

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Cloudflare DNS | DNS for generated Worker custom domains and documented application-domain topology | [Cloudflare DNS documentation](https://developers.cloudflare.com/dns/) |
| Cloudflare Cache | Edge caching for generated asset and update delivery Workers | [Cloudflare Cache documentation](https://developers.cloudflare.com/cache/) |
| Vercel domains and DNS integration | Managed web/API domains and TLS | [Vercel domains documentation](https://vercel.com/docs/domains) |

## Workspace and delivery

### Package manager and monorepo

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| pnpm | Workspace package management and root command surface | [pnpm documentation](https://pnpm.io/) |
| Turborepo | Dependency-aware workspace tasks and caching | [Turborepo documentation](https://turborepo.com/docs) |

### Source control and hosting

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Git | Generated repository version control | [Git documentation](https://git-scm.com/doc) |
| GitHub | Source hosting and release integration | [GitHub documentation](https://docs.github.com/) |

### Continuous integration

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| GitHub Actions | Generated build, test, packaging, and release workflows | [GitHub Actions documentation](https://docs.github.com/en/actions) |

### Mobile build and distribution

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| EAS Build | Expo native application builds | [EAS Build documentation](https://docs.expo.dev/build/introduction/) |
| EAS Submit | App Store and Google Play submission | [EAS Submit documentation](https://docs.expo.dev/submit/introduction/) |
| App Store Connect | iOS application configuration, testing, review, and release | [App Store Connect documentation](https://developer.apple.com/help/app-store-connect/) |
| Google Play Console | Android application configuration, testing, review, and release | [Google Play Console documentation](https://support.google.com/googleplay/android-developer/) |

### Testing and verification

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Node.js test runner | Generator and generated JavaScript tests | [Node.js test-runner documentation](https://nodejs.org/api/test.html) |
| TypeScript compiler | Static type verification | [TypeScript compiler documentation](https://www.typescriptlang.org/docs/handbook/compiler-options.html) |
| OSV | Dependency-vulnerability auditing | [OSV documentation](https://google.github.io/osv.dev/) |

## Operations

### Logging and observability

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Fastify logging | Structured API logging | [Fastify logging documentation](https://fastify.dev/docs/latest/Reference/Logging/) |
| Vercel observability | Managed web/API deployment logs and metrics | [Vercel observability documentation](https://vercel.com/docs/observability) |
| Cloudflare Workers observability | Logs and metrics for generated Workers | [Workers observability documentation](https://developers.cloudflare.com/workers/observability/) |

### Secrets and environment configuration

| Tool | Current responsibility | Official documentation |
| --- | --- | --- |
| Vercel environment variables | Managed web/API deployment configuration and secrets | [Vercel environment-variable documentation](https://vercel.com/docs/environment-variables) |
| Wrangler secrets | Cloudflare Worker secrets | [Wrangler secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/) |
| GitHub Actions secrets | CI and release credentials | [GitHub Actions secrets documentation](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions) |
| EAS environment variables and secrets | Expo build and submission configuration | [EAS environment-variable documentation](https://docs.expo.dev/eas/environment-variables/) |

## Existing integration connections

Individual tool documentation is not enough to explain a composed stack. Each
supported connection also needs documentation for configuration ownership,
identity mapping, data flow, environment separation, failure handling, and
testing.

### RevenueCat and Stripe

#### Connection model

```text
Stripe products, prices, checkout, and billing lifecycle
    -> RevenueCat Stripe connection and imported product catalog
    -> RevenueCat Offering and entitlement
    -> RevenueCat webhook
    -> Fastify reconciliation endpoint
    -> RevenueCat subscriber lookup
    -> Drizzle subscription record
    -> Ably invalidation
    -> authenticated clients refetch authoritative state
```

Stripe and RevenueCat are connected operationally through the RevenueCat Stripe
App and RevenueCat dashboard configuration. The generated application does not
currently call the Stripe API or Stripe SDK directly.

| Integration subject | Official documentation |
| --- | --- |
| RevenueCat Stripe Billing integration | [Stripe Billing in RevenueCat Web](https://www.revenuecat.com/docs/web/integrations/stripe) |
| Connecting the Stripe account | [Connect to your Stripe account](https://www.revenuecat.com/docs/web/connect-stripe-account) |
| Stripe product setup | [RevenueCat Stripe product setup](https://www.revenuecat.com/docs/getting-started/entitlements/stripe-products) |
| RevenueCat products, offerings, and entitlements | [Product configuration](https://www.revenuecat.com/docs/projects/configuring-products) · [Entitlements](https://www.revenuecat.com/docs/getting-started/entitlements) · [Offerings](https://www.revenuecat.com/docs/offerings/overview) |
| Purchases created outside RevenueCat flows | [Track external Stripe purchases](https://www.revenuecat.com/docs/web/integrations/stripe/track-external-purchases) |
| RevenueCat webhook delivery | [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks) |
| Reading authoritative subscription status | [Getting subscription status](https://www.revenuecat.com/docs/customers/customer-info) |
| Mapping application users to RevenueCat | [Identifying customers](https://www.revenuecat.com/docs/customers/identifying-customers) |
| Stripe customer self-service | [Stripe Customer Portal](https://docs.stripe.com/customer-management) |
| Stripe sandbox configuration | [Stripe sandboxes](https://docs.stripe.com/sandboxes) |

#### Current Anhedral coverage

- The Expo client uses the authenticated Clerk user ID as the RevenueCat App
  User ID.
- The API authenticates RevenueCat webhook requests with a configured
  authorization value.
- Webhook event IDs are persisted so duplicate deliveries can be handled
  idempotently.
- After a webhook, the API fetches the subscriber from RevenueCat instead of
  treating the webhook payload as the complete subscription state.
- Drizzle persists the reconciled entitlement before an Ably invalidation is
  published.
- Clients refetch the persisted entitlement; the realtime event is not treated
  as authoritative.

#### Documentation and implementation findings

- RevenueCat requires a connected Stripe account, a Stripe web configuration,
  imported products, packages, an Offering, and separate sandbox/live
  configuration. The generated production guide does not yet teach that full
  sequence.
- RevenueCat documents Web Purchase Links, Web Funnels, and its Web SDK as the
  purchase-flow options. Anhedral does not currently scaffold one of those web
  purchase flows, so “RevenueCat + Stripe checkout” describes the intended
  provider topology more completely than the generated application behavior.
- RevenueCat recommends an authorization header for webhooks and also supports
  HMAC signature verification over the raw request body. Anhedral currently
  verifies the authorization value but does not verify the optional RevenueCat
  HMAC signature.
- RevenueCat recommends returning success quickly and deferring webhook
  processing. Anhedral currently completes the subscriber lookup, database
  reconciliation, and initial realtime publication attempt before responding.
  The code is retryable and idempotent, but the response-time boundary should be
  documented and evaluated.
- Sandbox and production purchases need separate Stripe and webhook
  configuration. They must never be represented as only an environment-variable
  change in the generated application.

### Drizzle and Neon

#### Connection model

```text
TypeScript Drizzle schema
    -> reviewed Drizzle Kit SQL migration
    -> Neon PostgreSQL branch
    -> @neondatabase/serverless HTTP driver
    -> drizzle-orm/neon-http
    -> Fastify services and routes
```

| Integration subject | Official documentation |
| --- | --- |
| Complete Neon and Drizzle connection guide | [Connect from Drizzle to Neon](https://neon.com/docs/guides/drizzle) |
| Drizzle's Neon guide | [Drizzle with Neon Postgres](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon) |
| Neon HTTP and WebSocket driver choices | [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver) |
| Drizzle schema migrations on Neon | [Schema migration with Drizzle](https://neon.com/docs/guides/drizzle-migrations) |
| Drizzle Kit migration tooling | [Drizzle Kit documentation](https://orm.drizzle.team/docs/kit-overview) |
| Pooled and direct Neon connections | [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) |
| Isolated development and preview databases | [Neon branching workflow primer](https://neon.com/docs/get-started/workflow-primer) |

#### Current Anhedral coverage

- Managed database projects install `@neondatabase/serverless`,
  `drizzle-orm`, and `drizzle-kit`.
- Runtime queries use `@neondatabase/serverless` with
  `drizzle-orm/neon-http`.
- Schema source is TypeScript; generated SQL migrations are reviewed and
  committed.
- `pnpm db:generate` generates migration artifacts and CI detects uncommitted
  migration changes.
- `pnpm db:migrate` applies committed migrations as a controlled release step.
- Generated production guidance calls for separate Neon branches or projects
  for development, preview, and production.
- Selecting self-hosted PostgreSQL replaces the Neon driver with
  `postgres.js`; it is a distinct connection implementation.

#### Documentation and implementation findings

- The selected Neon HTTP driver is a documented Drizzle integration and fits
  short-lived serverless queries.
- Neon recommends pooled connections for serverless or
  connection-per-request application traffic.
- Neon recommends direct connections for schema migrations and other operations
  that depend on session-level behavior.
- Anhedral currently documents one pooled `DATABASE_URL` and uses it for both
  application queries and `pnpm db:migrate`. The connection contract should
  distinguish a pooled runtime URL from a direct migration URL, or explicitly
  verify and document why the HTTP migrator is safe with the pooled URL.
- Branch selection is currently environment configuration rather than a
  first-class generated preview lifecycle. The documentation should make clear
  who creates, expires, and resets preview branches.
- Migration generation and migration application are correctly separated;
  generation does not belong in the Vercel build.

### Other current connection documentation

| Connection | Current integration responsibility | Official connection documentation |
| --- | --- | --- |
| Next.js + Clerk | Web provider, middleware, sessions, and server helpers | [Clerk Next.js quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart) |
| Expo + Clerk | Native session provider, token storage, and authentication flows | [Clerk Expo quickstart](https://clerk.com/docs/expo/getting-started/quickstart) |
| Fastify + Clerk | Server-side session-token verification and authenticated user derivation | [Clerk Fastify quickstart](https://clerk.com/docs/fastify/getting-started/quickstart) |
| Browser extension + Clerk | Extension authentication, stable CRX ID, and optional Sync Host | [Clerk Chrome Extension documentation](https://clerk.com/docs/reference/chrome-extension/overview) |
| Expo + RevenueCat | Native SDK configuration, purchases, paywalls, and customer updates | [RevenueCat Expo installation](https://www.revenuecat.com/docs/getting-started/installation/expo) |
| Clerk identity + RevenueCat identity | Clerk user ID is supplied as the RevenueCat App User ID | [RevenueCat identifying customers](https://www.revenuecat.com/docs/customers/identifying-customers) |
| RevenueCat + Fastify | Authenticated, idempotent webhook intake and subscriber reconciliation | [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks) · [RevenueCat REST API v1](https://www.revenuecat.com/docs/api-v1) |
| RevenueCat + Drizzle/PostgreSQL | Persisted entitlement projection and webhook event ledger | [Getting RevenueCat subscription status](https://www.revenuecat.com/docs/customers/customer-info) · [Drizzle transactions](https://orm.drizzle.team/docs/transactions) |
| Clerk + Ably | Authenticated API issues user-scoped realtime credentials | [Ably token authentication](https://ably.com/docs/auth/token) · [Ably capabilities](https://ably.com/docs/auth/capabilities) |
| RevenueCat + Ably | Persisted entitlement changes publish invalidations; clients refetch state | [Ably Pub/Sub documentation](https://ably.com/docs/pub-sub) |
| Fastify + R2 | API creates S3-compatible presigned upload and read URLs | [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/) · [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) |
| Cloudflare Workers + R2 | Bound private bucket supplies controlled asset and update delivery | [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/) |
| Electron updater + Worker + R2 | Update metadata and signed artifacts are read through a custom-domain Worker | [electron-updater documentation](https://www.electron.build/auto-update.html) · [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/) |
| Cloudflare Workers + Workflows | Worker entrypoint creates and controls durable workflow instances | [Cloudflare Workflows documentation](https://developers.cloudflare.com/workflows/) |
| Next.js/Fastify + Vercel | Separate web and API services deploy from one monorepo | [Vercel Services documentation](https://vercel.com/docs/services) · [Vercel monorepo documentation](https://vercel.com/docs/monorepos) |
| Drizzle + self-hosted PostgreSQL | `postgres.js` runtime client and Drizzle migration adapter | [Drizzle PostgreSQL guide](https://orm.drizzle.team/docs/get-started/postgresql-new) · [postgres.js documentation](https://github.com/porsager/postgres) |
| Docker Compose + PostgreSQL | Private database service and application network | [Docker Compose documentation](https://docs.docker.com/compose/) · [PostgreSQL Docker image documentation](https://hub.docker.com/_/postgres) |
| Nginx + Certbot | VPS reverse proxy and automated Let's Encrypt certificate lifecycle | [Certbot with Nginx](https://eff-certbot.readthedocs.io/en/stable/using.html#nginx) |
| React + Tailwind + shadcn/ui | Source-owned DOM component foundation | [shadcn/ui Next.js installation](https://ui.shadcn.com/docs/installation/next) |
| Expo + React Native Reusables | Source-owned TypeScript native components | [React Native Reusables introduction](https://rnr-docs.vercel.app/getting-started/introduction/) |

## Documentation maintenance

When an existing tool changes or a new supported tool is introduced:

1. Add or update its entry in this document.
2. Link its primary official documentation index.
3. Add integration-specific documentation when multiple selected tools require
   Anhedral-owned wiring.
4. Generate each project's `docs/STACK.md` from the tools actually selected for
   that project.
5. Verify that every local documentation path exists.
6. Periodically check official links for redirects or inaccessible pages.

Future documentation checks should distinguish deterministic repository checks
from live network checks:

```sh
pnpm check:documentation
pnpm check:documentation --online
```

The deterministic check should validate catalog coverage, local documentation,
URL shape, and template ownership. The online check should additionally follow
redirects and confirm that each official documentation index is reachable.

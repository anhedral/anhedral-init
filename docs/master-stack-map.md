# Anhedral master stack map

This is the canonical whole-stack map for Anhedral. It shows the ordered flow
from skill-led planning through deterministic generation, source layout,
connected capabilities, cloud provisioning, command-driven operations, agent
experience, and production verification.

Read top to bottom. Arrows represent lifecycle order, not runtime network calls.
Runtime and provider connections are stated explicitly inside each stage.

```text
+==========================================================================================================================+
|                                                ANHEDRAL MASTER STACK MAP                                                 |
+--------------------------------------------------------------------------------------------------------------------------+
|OUTCOME One readable TypeScript codebase and one command surface connecting every application, cloud resource, release    |
|path, runbook, and coding agent.                                                                                          |
|PRINCIPLE Ordinary framework code, source ownership, and generated integration boundaries. Anhedral assembles the stack;  |
|it is not the application runtime.                                                                                        |
+==========================================================================================================================+
                                                             |
                                                             v
+==========================================================================================================================+
|                                                     1  SELECT + PLAN                                                     |
+--------------------------------------------------------------------------------------------------------------------------+
|SKILL FIRST Install and invoke $anhedral-init. Ask for project name and custom-domain status before generating or         |
|provisioning.                                                                                                             |
|CREATE anhedral new <directory> | anhedral init EXTEND anhedral add <modules> | anhedral ui add <components>              |
|INSPECT anhedral doctor AUTOMATE --dry-run | --json | --verbose | --skip-install                                          |
|SURFACES web | mobile | api | desktop | extension                                                                         |
|FEATURES db | auth | billing | storage | native-subscriptions | electron-updater                                          |
|UI shadcn/ui for DOM clients | React Native Reusables for Expo | NativeWind or Uniwind                                    |
|CLOSURE auth -> api + db | billing -> auth | storage -> auth | native-subscriptions -> mobile + billing |                 |
|electron-updater -> desktop                                                                                               |
+==========================================================================================================================+
                                                             |
                                                             v
+==========================================================================================================================+
|                                                    2  GENERATE SAFELY                                                    |
+--------------------------------------------------------------------------------------------------------------------------+
|PIPELINE Resolve modules -> select immutable templates -> verify SHA-256 catalog -> stage files -> compose typed          |
|contributions.                                                                                                            |
|PIPELINE Run pinned UI providers only in staging -> record provenance and ownership -> atomic commit -> one root pnpm     |
|install.                                                                                                                  |
|REFUSES traversal | symlinks | nested repositories/workspaces | caches | oversized files | unowned collisions | managed   |
|drift.                                                                                                                    |
|OWNERSHIP Product source plus README/PRODUCTION are user-owned | root configuration is mergeable | integration substrate  |
|is managed.                                                                                                               |
|STATE anhedral.json records modules, versions, template/UI provenance, styling, file hashes, modes, and ownership.        |
|WHY Deterministic, inspectable generation and safe incremental adds without replacing user work.                          |
+==========================================================================================================================+
                                                             |
                                                             v
+==========================================================================================================================+
|                                       3  ONE PNPM + TURBOREPO TYPESCRIPT WORKSPACE                                       |
+--------------------------------------------------------------------------------------------------------------------------+
|apps/web Next.js App Router + React + shadcn/ui. WHY: SSR, routing, server-first web, and source-owned UI.                |
|apps/mobile Expo Router + React Native Reusables. WHY: one native TypeScript product for iOS and Android.                 |
|apps/api Fastify + validation/security plugins. WHY: thin routes, services, structured logs, and explicit boundaries.     |
|apps/desktop Electron + Vite + sandboxed React renderer. WHY: cross-platform desktop with a narrow privileged bridge.     |
|apps/extension WXT + React + MV3 entrypoints. WHY: browser permissions, side panel/background, builds, and packaging.     |
|apps/assets-private-proxy Cloudflare Worker + private R2 binding. WHY: controlled GET/HEAD media delivery without bucket  |
|listing.                                                                                                                  |
|apps/desktop-updater-worker Cloudflare Worker + private R2 binding. WHY: custom-domain Electron metadata, ranges, and     |
|downloads.                                                                                                                |
|packages/contracts Zod schemas. WHY: one validated network contract shared across every boundary.                         |
|packages/api-client Typed client-safe HTTP. WHY: one request path for web, mobile, desktop, and extension.                |
|packages/db Drizzle schema + reviewed SQL migrations. WHY: readable TypeScript schema and explicit release artifacts.     |
|packages/realtime Ably client. WHY: scoped invalidation events while clients refetch authoritative state.                 |
+==========================================================================================================================+
                                                             |
                                                             v
+==========================================================================================================================+
|                                            4  CONNECTED PRODUCT CAPABILITIES                                             |
+--------------------------------------------------------------------------------------------------------------------------+
|REQUESTS Zod contract -> service/Drizzle query -> Fastify route -> typed API client -> every selected client.             |
|IDENTITY Clerk sessions in clients -> verified server identity; never trust a client-supplied user ID.                    |
|DATABASE Fastify -> Drizzle -> managed Neon Postgres with isolated dev/preview/production; no generated local Postgres.   |
|STORAGE API presigns R2 PUT -> client uploads -> API confirms -> Worker streams confirmed assets or owner-authorized      |
|reads.                                                                                                                    |
|BILLING Expo purchase -> RevenueCat -> signed webhook -> Neon entitlement + transactional outbox.                         |
|REALTIME Outbox -> scoped Ably event -> every client refetches the authoritative entitlement.                             |
|DESKTOP UPDATE Signed native build -> artifacts then latest metadata -> private R2 -> updates.<domain> Worker ->          |
|electron-updater.                                                                                                         |
|SECURITY Server-only secrets | exact CORS | rate limits/headers | Electron isolation | least privilege | private buckets. |
+==========================================================================================================================+
                                                             |
                                                             v
+==========================================================================================================================+
|                                            5  PROVISION + CONFIGURE THE CLOUD                                            |
+--------------------------------------------------------------------------------------------------------------------------+
|DOMAIN Buy/confirm domain -> add Cloudflare zone -> preserve mail records -> delegate nameservers -> activate DNSSEC.     |
|GITHUB + CI Organization repository, protected environments, pinned Actions, PR checks, branches, and release artifacts.  |
|NEON Projects/branches per environment, pooled DATABASE_URL, backups, reviewed migrations, and controlled deploy gates.   |
|CLERK Development/production instances, publishable/secret keys, domains, OAuth, redirects, webhooks, native and CRX IDs. |
|CLOUDFLARE Authoritative DNS, private R2 buckets, scoped tokens, CORS/lifecycle, Worker bindings, logs, and custom        |
|domains.                                                                                                                  |
|VERCEL Services deployment for web/API, rewrites, environment scopes, preview/production, cron endpoints, domains, and    |
|TLS.                                                                                                                      |
|REVENUECAT + ABLY Products, offerings, entitlements, store credentials, signed webhook, scoped realtime, and retry cron.  |
|EAS + STORES Expo project, credentials, internal builds, TestFlight/Play testing, metadata, privacy, review, and rollout. |
|BROWSER STORE Stable extension ID, least host permissions, OAuth sync, privacy disclosure, trusted testing, and review.   |
|DESKTOP Native-OS signing/notarization, electron-builder installers, private update channel, upgrade tests, and rollback. |
|DNS app.<domain> points from Cloudflare DNS to Vercel and stays DNS-only; assets/updates are Cloudflare Worker Custom     |
|Domains.                                                                                                                  |
|AGENT STOPS User handles sign-in/MFA, purchases, secret generation/reveal, destructive confirmations, and final           |
|submissions.                                                                                                              |
+==========================================================================================================================+
                                                             |
                                                             v
+==========================================================================================================================+
|                                        6  GENERATED package.json COMMAND SURFACE                                         |
+--------------------------------------------------------------------------------------------------------------------------+
|WORKSPACE dev | build | typecheck | verify WHY: run and validate exactly the selected monorepo.                           |
|APP LOOPS dev:web | dev:mobile | dev:api | dev:desktop | dev:extension                                                    |
|APP CHECKS verify:web | verify:mobile | verify:api | verify:desktop | verify:extension                                    |
|VERCEL deploy:vercel:{link,preview,production,inspect,domain:inspect} WHY: connect, release, diagnose, and configure DNS. |
|MOBILE mobile:eas:{login,init} | mobile:build:{internal,production}:{ios,android} | mobile:submit:{ios,android}           |
|DATABASE neon:{login,project:create} | db:{generate,migrate,check,studio} | verify:db                                     |
|STORAGE r2:{login,bucket:create,cors:list,cors:set} | assets:proxy:{check,dev,deploy} | verify:assets-proxy               |
|UPDATES desktop:updates:{cloudflare:login,bucket:create,provision,publish}                                                |
|UPDATES desktop:updates:worker:{check,dev,deploy,types} | desktop:updates:build:{mac,win,linux} | verify:desktop-updates  |
|DESKTOP desktop:build | verify:desktop EXTENSION extension:zip | verify:extension                                         |
|STRUCTURE anhedral doctor | add/ui --dry-run WHY: detect drift and preview safe structural changes.                       |
+==========================================================================================================================+
                                                             |
                                                             v
+==========================================================================================================================+
|                                      7  DEVELOPER, AGENT + COMPUTER-USE EXPERIENCE                                       |
+--------------------------------------------------------------------------------------------------------------------------+
|DOCS README.md first run/source map | docs/DEVELOPMENT.md recipes | docs/STACK.md tool map | PRODUCTION.md cloud runbook. |
|CONTROL SKILL.md agent workflow | ANHEDRAL.md ownership notes | anhedral.json source of truth | .env.example inventories. |
|CODING AGENT Ask name/domain -> resolve modules -> generate -> read docs/manifest -> doctor -> provision -> verify ->     |
|hand off.                                                                                                                 |
|SUBAGENTS Lead owns mutations; delegate docs/env inventory, read-only DNS checks, and final verification without secrets. |
|COMPUTER USE Drive provider consoles after user authentication; configure accounts, domains, OAuth, DNS, stores, and      |
|rollout.                                                                                                                  |
|SECRET HANDOFF Stop before Generate/Reveal/Create; name the variable/file; user pastes directly into uncommitted          |
|env/provider UI.                                                                                                          |
|UI DX Source-owned components, target routing, accessibility, ordinary framework APIs, and no hidden proprietary runtime. |
|OPERATIONS DX Exact root commands, selection-aware docs/scripts, machine-readable plans, provider ledger, and explicit    |
|stop gates.                                                                                                               |
+==========================================================================================================================+
                                                             |
                                                             v
+==========================================================================================================================+
|                                               8  VERIFY, RELEASE + OPERATE                                               |
+--------------------------------------------------------------------------------------------------------------------------+
|LOCAL Smallest package check -> typecheck -> full verify -> build -> doctor; never weaken a failing gate.                 |
|DATABASE Generate -> review/commit SQL -> drift gate -> controlled migrate -> health/readiness checks.                    |
|RUNTIME API coverage, auth/CORS, billing replay/order, Ably reconnect, R2 upload/read/range/cache, Worker method/host     |
|security.                                                                                                                 |
|CLIENTS Next build | Expo compatibility/device checks | packaged Electron smoke/upgrade | live WXT MV3 worker in Chrome.  |
|INFRA Confirm provider team/resource names, protected env presence, DNS answers, TLS, Vercel health, Worker bindings, and |
|logs.                                                                                                                     |
|CI Pinned toolchain, strict pnpm policy, allowed build scripts, OSV audit, secret scan, deterministic outputs, and        |
|release checks.                                                                                                           |
|RELEASES Vercel preview/prod | TestFlight/Play tracks | browser-store trusted/review | signed desktop staged update       |
|channel.                                                                                                                  |
|RECOVERY Transaction rollback, provider backups, database rollback plan, staged/phased rollout, telemetry, and documented |
|owners.                                                                                                                   |
+==========================================================================================================================+
```

## Runtime connection summary

```text
web / mobile / desktop / extension
                |
                v
       packages/api-client
                |
                v
       Fastify API + Zod contracts
          |         |          |
          v         v          v
   Clerk identity  Neon     private R2
                    |
                    v
          RevenueCat entitlement
                    |
                    v
               Ably event
                    |
                    v
           clients refetch state

signed desktop release -> private update R2 -> updates.<domain> Worker -> electron-updater
```

The runtime summary is intentionally smaller than the lifecycle map. It shows
only application data flow; DNS, provisioning, release gates, and agent actions
remain in the master map above.

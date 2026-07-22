---
name: anhedral-init
description: Create, extend, explain, or diagnose complete Anhedral-generated TypeScript stacks. Use for new/init/add/ui/doctor; ordinary Next.js, Expo, Fastify, Drizzle/Neon, Clerk, R2, Electron, or WXT development inside a generated workspace; interpreting anhedral.json ownership; reproducing the scaffold manually; or verifying generated applications.
---

# Anhedral Init

Anhedral is a stack generator, not an application runtime or programming language. Generated projects use ordinary framework source and expose the complete integration code. Do not invent Anhedral-specific models, routes, queries, components, or client hooks when the selected framework already has a documented convention.

Use Node.js 20.19+ or 22.12+ and pnpm. `new` creates a destination directory; `init` works in an empty current directory where `.git`, `.gitignore`, and `.DS_Store` are allowed.

## Choose the construction path

- Use the manual path whenever the user asks to avoid the Anhedral CLI, the CLI is unavailable, or the task requires explaining/reproducing the scaffold itself.
- Before creating or changing files manually, read [references/manual-scaffolding.md](references/manual-scaffolding.md) completely and follow its ordered procedure. Treat it as the canonical manual checklist, including its source-file matrix and feature gates.
- Use the CLI path only when the user permits it. Do not silently substitute `anhedral init`, `anhedral add`, imported generator code, or a generated demo for the manual path.
- For an exact-version scaffold inside the Anhedral source repository, render from the current `src/templates/*.ts`, `src/scaffold.ts`, and `src/dependencies.ts`; do not copy stale demo output. Outside that repository, implement the behavior and file contract in the manual reference and pin a mutually compatible toolchain.

The manual path must leave a complete working workspace, not merely a directory tree or list of commands. Write the source, configuration, tests, environment examples, CI, deployment configuration, and database migration gate selected by the module plan. Install and verify when the environment permits it.

## Select modules

Choose app surfaces from `web`, `mobile`, `api`, `desktop`, and `extension`.

Choose backend features from `db`, `auth`, `billing`, `storage`, and `native-subscriptions`.

Apply these dependency rules automatically:

```text
auth                 -> api + db
billing              -> auth
storage              -> auth
native-subscriptions -> mobile + billing
```

With no module flags, generate the full stack.

## Initialize

```sh
pnpm dlx anhedral@latest new my-product
cd my-product
```

Prefer explicit modules when the user requests a smaller stack:

```sh
pnpm dlx anhedral@latest new my-product --web --api --db --auth
pnpm dlx anhedral@latest new my-product --web --mobile --ui button,dialog --native-styling nativewind
pnpm dlx anhedral@latest new my-api --api --skip-install
```

Use the stable toolchain for normal generation. The `latest` value is retained only as a metadata compatibility channel for maintainer investigations:

```sh
pnpm dlx anhedral@latest new my-product --toolchain stable
pnpm dlx anhedral@latest new my-product --toolchain latest
```

Both channels generate the same exact verified dependencies and integrity-checked bundled templates; `latest` only records investigation intent in `anhedral.json`. Upstream refreshes happen outside user projects and are shipped only after review and checksum verification. Neither channel invokes mutable upstream framework generators inside a user project.

Do not run any command in this section during the manual path.

## Develop inside a generated project

Read these files before changing product code:

1. `README.md` for the selected modules, first run, and source-location map.
2. `docs/DEVELOPMENT.md` for end-to-end feature recipes.
3. `docs/STACK.md` for responsibility boundaries and official tool documentation.
4. `PRODUCTION.md` only for provisioning, deployment, DNS, stores, or release work.

Use the native source conventions:

- Next.js code belongs in `apps/web/app`, `apps/web/components`, and `apps/web/lib`.
- Expo Router code belongs in `apps/mobile/app` and `apps/mobile/components`.
- Fastify routes and server-only services belong in `apps/api/src/routes` and `apps/api/src/services`.
- Shared Zod network schemas belong in `packages/contracts/src`.
- Client-safe HTTP methods belong in `packages/api-client/src`.
- Drizzle schema and queries belong in `packages/db`; generate and review SQL migrations.

Implement an end-to-end feature as `contracts -> database/service -> route -> API client -> frontend`. Frontends may import contracts and client-safe packages, never API services, database connections, or server environments. This stack uses managed Neon and intentionally has no local Postgres service.

## Add modules safely

Run `add` only from a project containing `anhedral.json` schema v5:

```sh
pnpm dlx anhedral@latest add desktop extension
pnpm dlx anhedral@latest add storage --dry-run
```

Use `--dry-run` before a consequential add. Use `--json` when another program needs the plan; JSON failures include a stable `code` and a human-readable `error`. Use `--verbose` for interactive child-command diagnostics. Do not bypass ownership conflicts: Anhedral intentionally refuses modified managed files, user-owned files, symlinks, and unowned collisions.

Require the manifest generator version to match the running CLI. Regenerate projects created by another version; do not add compatibility branches.

Do not rewrite a generated project's README or custom workflows while adding modules. Preserve custom package fields and mergeable root configuration.

For manual projects without a trustworthy schema-v5 `anhedral.json`, add modules with the manual reference instead. Never fabricate manifest ownership records, template provenance, UI installation records, or hashes. A manually authored workspace is valid as an application workspace but is not CLI-managed until it has been regenerated by a matching Anhedral version.

## Add UI components

Use the unified UI wrapper for source-owned components:

```sh
pnpm dlx anhedral@latest ui add button dialog
pnpm dlx anhedral@latest ui add select --target mobile
pnpm dlx anhedral@latest ui add data-table --target web --dry-run
```

Anhedral routes web, desktop, and extension targets to shadcn/ui. It routes Expo mobile to React Native Reusables using the manifest's NativeWind or Uniwind selection. Omit `--target` to add the provider-specific implementation to every selected UI client. Provider writes occur in transaction staging and must pass the same ownership checks as module additions.

## Diagnose

Dry-runs never perform transaction recovery. If a recovery journal is pending, rerun the original command without `--dry-run` before requesting a new preview.

Check recorded files and hashes with:

```sh
pnpm dlx anhedral@latest doctor
pnpm dlx anhedral@latest doctor --json
```

Explain that warnings can represent mergeable or user-owned drift, while modified or missing managed files make the project unhealthy.

## Configure the generated project

Copy environment examples, fill only selected provider values, install, and verify:

```sh
cp apps/api/.env.example apps/api/.env
cp packages/db/.env.example packages/db/.env
pnpm install
pnpm verify
```

Copy only examples that exist for the selected surfaces. Client packages use package-local runtime files (for example, copy `apps/web/.env.example` to `apps/web/.env.local` and `apps/desktop/.env.example` to `apps/desktop/.env`); the root `.env.example` is an inventory, not a runtime environment file.

Common selected keys are:

- Neon: `DATABASE_URL`
- Clerk server: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Clerk clients: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- RevenueCat: `RC_WEBHOOK_SECRET`, `RC_SECRET_API_KEY`, `RC_ENTITLEMENT_ID`, `EXPO_PUBLIC_RC_*`
- Ably billing synchronization: server-only `ABLY_API_KEY`; clients obtain scoped tokens from the API
- R2: `BASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PREFIX=storage`, `R2_PROXY_READ_URL_TTL_SECONDS=600`; keep `CLOUDFLARE_API_TOKEN` operations/CI-only
- Internal billing/storage jobs: high-entropy server-only `CRON_SECRET`

Never commit real `.env` files. Keep `ANHEDRAL_DEMO=false` in production.

Run only scripts present for installed modules. Typical commands include `dev:web`, `dev:mobile`, `dev:api`, `dev:desktop`, `dev:extension`, corresponding `verify:*` scripts, and database scripts for `db` projects.

## Understand deployment

Treat the root `vercel.json` as the only Vercel Services configuration. It uses the current `services` schema, declares `apps/api` and `apps/web` as independent service roots, and routes `/api/(.*)` before the web catch-all. Vercel preserves the original path, so Fastify mounts its routes under `/api` locally and in deployment. Select the Services framework preset before deploying.

For billing, keep Neon authoritative: RevenueCat reconciliation writes the subscription revision and realtime outbox atomically, Ably carries only per-user invalidations, and every client refetches the entitlement. Schedule the authenticated outbox flush every five minutes and verify purchase, webhook, reconnect, and foreground recovery paths.

Use `apps/mobile` for EAS, `pnpm desktop:build` for a current-host Electron artifact, matching platform-specific desktop scripts in CI, and `pnpm extension:zip` for the WXT archive.

For storage, generate `apps/assets-private-proxy` plus `cloudflare/r2-cors.template.json` and keep the R2 bucket private. The Worker must be named `assets-private-proxy`, bind the normalized `<project>-assets` bucket as `ASSETS`, disable `workers.dev`, and own `assets.<domain>` as a Worker Custom Domain. Presigned uploads continue on the R2 S3 API hostname. Root every key below `R2_PREFIX=storage`; expose only `storage/confirmed/` through the Worker and reject staging plus `generation-inputs`. Authenticated private reads must verify upload ownership and return a presigned GET URL bounded by `R2_PROXY_READ_URL_TTL_SECONDS`.

When explaining domains, distinguish DNS delegation from registrar transfer. A GoDaddy registration can use Cloudflare authoritative nameservers immediately; transferring registration/billing to Cloudflare Registrar is optional and subject to eligibility locks. Keep Vercel app/API A or CNAME records DNS-only in Cloudflare, while Worker Custom Domains stay Cloudflare-managed and proxied.

## Verify outcomes

After generation or repair, run the strongest practical checks:

```sh
pnpm typecheck
pnpm verify
pnpm build
```

Use `pnpm --filter ./apps/api test` when the API exists. If verification fails, report the exact package and command rather than replacing generated ownership records manually.

For exact representative trees, consult `docs/output-tree-contract.md` in the Anhedral repository. During manual construction, also compare the finished workspace with the file matrix in [references/manual-scaffolding.md](references/manual-scaffolding.md); every selected conditional file must exist and every unselected provider integration must be absent.

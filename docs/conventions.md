# Anhedral generated-project conventions

Anhedral is a deterministic stack generator. These conventions describe the readable workspace it produces; they are not a new application framework or runtime API.

## Core rule

Use the underlying tool's normal programming model. Anhedral decides where integrations meet and generates safe defaults, but developers write ordinary Next.js, Expo Router, Fastify, Drizzle, Electron, and WXT code.

## Source ownership

```text
apps/       deployable framework applications
packages/   client-safe or server-shared TypeScript packages
docs/       generated stack and development guidance
```

- `apps/web`: Next.js App Router pages, layouts, components, hooks, and web utilities.
- `apps/mobile`: Expo Router screens, layouts, native components, and hooks.
- `apps/api`: Fastify routes, services, plugins, provider clients, and server environment validation.
- `apps/desktop`: Electron main/preload code and sandboxed React renderer code.
- `apps/desktop-updater-worker`: optional read-only Cloudflare Worker serving signed Electron updates from a bound private R2 bucket.
- `apps/extension`: WXT entrypoints, extension components, background logic, and content scripts.
- `packages/contracts`: Zod schemas for data crossing HTTP boundaries.
- `packages/api-client`: client-safe HTTP behavior shared across frontends.
- `packages/db`: Drizzle schema, database access, and reviewed SQL migrations.
- `packages/realtime`: client-safe Ably subscription behavior when selected.

## End-to-end feature flow

```text
Zod contract
    -> Drizzle schema/query or server service
    -> Fastify route
    -> shared API client
    -> Next.js / Expo / Electron / WXT UI
```

Routes stay thin. They authenticate, validate, call a service, and return a declared contract. Business behavior and provider SDK calls live in server services. Frontends never import API services, database connections, or server environment modules.

When `electron-updater` is selected, desktop releases follow a separate delivery path: the packaged Electron main process reads generated update metadata from an HTTPS custom domain, the Worker streams known keys from its private R2 binding, and release tooling uploads signed artifacts before mutable channel metadata. Neither Cloudflare credentials nor a public bucket URL enter the desktop application.

## Database

Database-enabled projects use managed Neon Postgres. Anhedral does not generate local Postgres, Docker Compose, or an embedded database substitute.

1. Edit the user-owned `packages/db/src/app-schema.ts`; Anhedral keeps provider tables in `generated-schema.ts`.
2. Run `pnpm db:generate`.
3. Review and commit generated SQL and metadata.
4. Run `pnpm verify:db`.
5. Apply with `pnpm db:migrate` against the intended Neon branch or project.

Schema generation must not happen during an application build. Migrations are reviewed release artifacts.

## Authentication and secrets

Clerk owns identity and sessions. The API derives identity from a verified server session and never trusts a client-supplied user ID. Only variables with a framework's explicit public prefix may enter client bundles. Database, Clerk secret, R2, RevenueCat, Ably, cron, and provider credentials remain server-only.

## UI

DOM clients use source-owned shadcn/ui components. Expo uses React Native Reusables with the selected NativeWind or Uniwind configuration.

```sh
pnpm anhedral:ui button dialog
pnpm anhedral:ui data-table --target web
```

Generated UI files are application source and can be customized. Preserve accessibility, keyboard/focus behavior, and platform conventions.

## Naming

- Directories and source files use lowercase kebab-case.
- React component filenames use kebab-case and export PascalCase components.
- Hooks start with `use-`.
- Framework-required entrypoint names stay unchanged.
- Shared packages use the `@shared/<name>` namespace.

## Structural changes

Run `pnpm anhedral:doctor` before changing generated structure. Preview new modules or UI with `--dry-run`. Anhedral refuses managed-file drift, symlinks, and unowned collisions instead of overwriting source.

Application product files are developer-owned. `README.md` and `PRODUCTION.md` become user-owned after initialization. Root configuration is mergeable. Integration substrate and generated guidance are recorded in `anhedral.json`.

## Verification

Run the smallest relevant package check while iterating, then the generated root verification before handoff:

```sh
pnpm first-run
pnpm ready
pnpm typecheck
pnpm verify
pnpm build
pnpm anhedral:doctor
```

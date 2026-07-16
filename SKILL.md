---
name: anhedral-init
description: Scaffold, extend, diagnose, or explain Anhedral modular TypeScript workspaces. Use for Anhedral CLI requests involving init/add/doctor, selecting web/mobile/API/desktop/extension surfaces, enabling database/auth/billing/storage/native subscriptions, interpreting anhedral.json ownership, or verifying generated projects.
---

# Anhedral Init

Use Node.js 20.19+ or 22.12+ and pnpm. Run the CLI in an empty directory for `init`; `.git`, `.gitignore`, and `.DS_Store` are allowed.

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
mkdir my-product
cd my-product
pnpm dlx anhedral@latest init
```

Prefer explicit modules when the user requests a smaller stack:

```sh
pnpm dlx anhedral@latest init --web --api --db --auth
pnpm dlx anhedral@latest init --api --skip-install
```

Use the stable toolchain unless the user explicitly wants upstream drift testing:

```sh
pnpm dlx anhedral@latest init --toolchain stable
pnpm dlx anhedral@latest init --toolchain latest
```

Treat `latest` as an investigation channel. Stable generation uses exact verified versions and local deterministic templates.

## Add modules safely

Run `add` only from a project containing `anhedral.json` schema v3:

```sh
pnpm dlx anhedral@latest add desktop extension
pnpm dlx anhedral@latest add storage --dry-run
```

Use `--dry-run` before a consequential add. Use `--json` when another program needs the plan; JSON failures include a stable `code` and a human-readable `error`. Use `--verbose` for interactive child-command diagnostics. Do not bypass ownership conflicts: Anhedral intentionally refuses modified managed files, user-owned files, symlinks, and unowned collisions.

Require the manifest generator version to match the running CLI. Regenerate projects created by another version; do not add compatibility branches.

Do not rewrite a generated project's README or custom workflows while adding modules. Preserve custom package fields and mergeable root configuration.

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
- RevenueCat: `RC_WEBHOOK_SECRET`, `RC_ENTITLEMENT_ID`, `EXPO_PUBLIC_RC_*`
- R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`

Never commit real `.env` files. Keep `ANHEDRAL_DEMO=false` in production.

Run only scripts present for installed modules. Typical commands include `dev:web`, `dev:mobile`, `dev:api`, `dev:desktop`, `dev:extension`, corresponding `verify:*` scripts, and database scripts for `db` projects.

## Understand deployment

Treat the root `vercel.json` as the only Vercel Services configuration. It uses the current `services` schema, declares `apps/api` and `apps/web` as independent service roots, and routes `/api/(.*)` before the web catch-all. Vercel preserves the original path, so Fastify mounts its routes under `/api` locally and in deployment. Select the Services framework preset before deploying.

Use `apps/mobile` for EAS, `pnpm desktop:build` for a current-host Electron artifact, matching platform-specific desktop scripts in CI, and `pnpm extension:zip` for the WXT archive.

## Verify outcomes

After generation or repair, run the strongest practical checks:

```sh
pnpm typecheck
pnpm verify
pnpm build
```

Use `pnpm --filter ./apps/api test` when the API exists. If verification fails, report the exact package and command rather than replacing generated ownership records manually.

For exact representative trees, consult `docs/output-tree-contract.md` in the Anhedral repository.

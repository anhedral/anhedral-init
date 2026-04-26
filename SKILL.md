---
name: anhedral-init
description: Use this skill when a user asks to scaffold, initialize, repair, or explain an Anhedral app using the anhedral init CLI. Covers the current commands, generated project structure, provider setup, skill installation, verification, and official documentation links for the stack.
---

# Anhedral Init

Use this skill when the user asks for "anhedral init", "set up an Anhedral app", "make an Anhedral starter", or wants a project scaffold with Expo or Next.js, Fastify, Drizzle, Neon, Clerk, Stripe or RevenueCat, Cloudflare R2, and optional WXT extension support.

Always prefer the current official docs linked below when the user asks for exact current behavior. The Anhedral CLI pins a stable toolchain by default, but upstream frameworks and provider dashboards change frequently.

## Source Links

Anhedral:
- Anhedral init repository: https://github.com/anhedral/anhedral-init
- Anhedral npm package: https://www.npmjs.com/package/anhedral

Skills:
- Skills CLI docs: https://skills.sh/docs/cli
- Skills docs overview: https://skills.sh/docs

Runtime and package manager:
- Node.js downloads: https://nodejs.org/en/download
- pnpm installation: https://pnpm.io/installation
- pnpm `dlx`: https://pnpm.io/cli/dlx

Generated stack docs:
- Expo docs: https://docs.expo.dev/
- Next.js App Router docs: https://nextjs.org/docs/app
- shadcn/ui Next.js install: https://ui.shadcn.com/docs/installation/next
- shadcn/ui CLI: https://ui.shadcn.com/docs/cli
- React Native Reusables repository: https://github.com/founded-labs/react-native-reusables
- React Native Reusables CLI package: https://www.npmjs.com/package/@react-native-reusables/cli
- Fastify getting started: https://fastify.dev/docs/latest/Guides/Getting-Started/
- Drizzle with Neon: https://orm.drizzle.team/docs/get-started/neon-existing
- Neon connect docs: https://neon.com/docs/get-started-with-neon/connect-neon
- Clerk quickstarts: https://clerk.com/docs/getting-started/quickstart/overview
- Clerk Next.js App Router quickstart: https://clerk.com/docs/nextjs/getting-started/quickstart
- Clerk Chrome extension docs: https://clerk.com/docs/chrome-extension/overview
- Stripe docs: https://docs.stripe.com/
- Stripe Node API reference: https://docs.stripe.com/api?lang=node
- RevenueCat Expo docs: https://www.revenuecat.com/docs/getting-started/installation/expo
- RevenueCat React Native docs: https://www.revenuecat.com/docs/getting-started/installation/reactnative
- Cloudflare R2 S3 getting started: https://developers.cloudflare.com/r2/get-started/s3/
- Cloudflare R2 S3 API: https://developers.cloudflare.com/r2/api/s3/
- Cloudflare R2 LLM docs index: https://developers.cloudflare.com/r2/llms.txt
- WXT introduction: https://wxt.dev/guide/introduction
- WXT installation: https://wxt.dev/guide/installation
- WXT LLM docs index: https://wxt.dev/llms.txt
- Vercel project configuration: https://vercel.com/docs/project-configuration
- Vercel Node.js runtime: https://vercel.com/docs/functions/runtimes/node-js

## Before Running

Verify the machine has Node.js 20 or newer and pnpm available:

```bash
node --version
pnpm --version
```

If pnpm is missing and Node ships with Corepack:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Anhedral must run in an empty directory. Existing `.git`, `.gitignore`, and `.DS_Store` entries are allowed, but normal project files are not.

## Scaffold Commands

The Anhedral Expo path is based on React Native Reusables, not `create-expo-app`. Do not scaffold the mobile app with `create-expo-app` for Anhedral projects.

User-facing default scaffold: Expo mobile app from the React Native Reusables `clerk-auth` template, Fastify API, shared packages, Clerk, RevenueCat plus Stripe env fields, Neon plus Drizzle, Cloudflare R2.

```bash
mkdir my-anhedral-app
cd my-anhedral-app
pnpm dlx anhedral@latest init
```

Underlying Expo scaffold command used by Anhedral:

```bash
mkdir -p apps/mobile
cd apps/mobile
pnpm dlx @react-native-reusables/cli@0.5.0 init -t clerk-auth
```

Answer the React Native Reusables prompts this way when reproducing the Anhedral flow manually:

```text
What is the name of your project? <project-name>
Would you like to install dependencies? n
Would you like to initialize a Git repository? n
```

After the React Native Reusables CLI creates the nested `<project-name>` directory, move its contents up into `apps/mobile`, then install dependencies from `apps/mobile`.

Add or verify the React Native Reusables components used by the Anhedral mobile screens:

```bash
pnpm dlx @react-native-reusables/cli@0.5.0 add avatar button card icon input label popover separator text
```

Then add the Anhedral mobile extras:

```bash
pnpm install
pnpm exec expo install expo-image-picker
pnpm add react-native-purchases react-native-purchases-ui @revenuecat/purchases-js
```

Next.js web scaffold:

```bash
mkdir my-anhedral-web-app
cd my-anhedral-web-app
pnpm dlx anhedral@latest init --next
```

Expo plus WXT Chrome extension:

```bash
mkdir my-anhedral-mobile-extension-app
cd my-anhedral-mobile-extension-app
pnpm dlx anhedral@latest init --extension
```

Next.js plus WXT Chrome extension:

```bash
mkdir my-anhedral-web-extension-app
cd my-anhedral-web-extension-app
pnpm dlx anhedral@latest init --next --extension
```

Use the stable toolchain unless the user explicitly wants upstream drift testing:

```bash
pnpm dlx anhedral@latest init --toolchain stable
pnpm dlx anhedral@latest init --toolchain latest
```

The `latest` channel floats upstream scaffold tools and can break when upstream CLIs change. Use it for investigation, not normal user setup.

## Expected Structure

The current fullstack scaffold writes:

```text
.
|-- apps/
|   |-- api/          # Fastify API, Vercel Node entry, tests, provider integrations
|   |-- mobile/       # Expo app when using default mode
|   |-- web/          # Next.js app when using --next
|   `-- extension/    # WXT Chrome extension when using --extension
|-- packages/
|   |-- api-client/
|   |-- config/
|   |-- db/           # Drizzle schema and migrations
|   `-- types/
|-- .env.example
|-- install-skills.sh
|-- package.json
|-- pnpm-workspace.yaml
|-- stack.json
`-- vercel.json
```

The exact generated paths are recorded in `stack.json` under `outputs.generated_paths`.

## Install Skills

After scaffolding, inspect and run `install-skills.sh`. Install project-scoped skills when the user wants the skill files tracked with the generated project; otherwise use the agent's normal global scope.

Commands generated by Anhedral:

```bash
pnpm dlx skills add https://github.com/clerk/skills --skill clerk-custom-ui
pnpm dlx skills add https://github.com/stripe/ai --skill stripe-best-practices
```

For Expo or RevenueCat projects, also run:

```bash
pnpm dlx skills add https://github.com/revenuecat/revenuecat-skill --skill revenuecat
```

Recommended when the user expects database-specific agent help:

```bash
pnpm dlx skills add https://github.com/neondatabase/agent-skills --skill neon-postgres
```

Skills CLI examples often use `npx skills`. In pnpm projects, prefer `pnpm dlx skills` unless the user asks for another package manager.

## Provider Setup

Create runtime env files from the generated examples:

```bash
cp .env.example .env
```

Then fill these values before running the complete app:

```text
DATABASE_URL
CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER
RC_SECRET_API_KEY
RC_WEBHOOK_SECRET
RC_ENTITLEMENT_ID
RC_OFFERING_ID
EXPO_PUBLIC_RC_API_KEY_IOS
EXPO_PUBLIC_RC_API_KEY_ANDROID
EXPO_PUBLIC_RC_WEB_API_KEY
```

Use only the values required by the generated stack. For example, a Next.js-only setup may not need Expo public RevenueCat keys immediately, and an Expo-first setup may not need `NEXT_PUBLIC_APP_URL`.

Provider checklist:
- Neon: create a project, copy the pooled or direct Postgres connection string, and set `DATABASE_URL`.
- Clerk: create an application, enable the required frontend platform, and set publishable and secret keys.
- Stripe: create products/prices if the project uses web billing, then set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_STARTER`.
- RevenueCat: create apps, entitlements, offerings, and platform API keys for Expo/mobile billing.
- Cloudflare R2: create a bucket, create S3-compatible credentials, and set account, key, secret, and bucket values.
- WXT extension: set `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_URL`, `VITE_WEBSITE_URL`, and optionally `VITE_CRX_PUBLIC_KEY` in `apps/extension`.

Do not commit real `.env` files.

## Post-Scaffold Commands

Install dependencies if the scaffold did not complete dependency installation, or after changing workspace dependencies:

```bash
pnpm install
```

Generate and run database migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

Run the app:

```bash
pnpm dev
```

Run only the API:

```bash
pnpm dev:api
```

Run only the web app when `--next` was used:

```bash
pnpm dev:web
```

Run only the mobile app when default Expo mode was used:

```bash
pnpm dev:mobile
```

Run or package the extension when `--extension` was used:

```bash
pnpm dev:extension
pnpm extension:zip
```

Verify the workspace:

```bash
pnpm typecheck
pnpm build
```

The API also includes tests:

```bash
pnpm --filter ./apps/api test
```

## Troubleshooting

If `anhedral init` fails with "Current directory is not empty", create a new empty directory and rerun the command there.

If an upstream scaffold CLI fails, rerun with the stable channel:

```bash
pnpm dlx anhedral@latest init --toolchain stable
```

If a package install fails due to network or registry access, ask the user for permission to retry with network access in the coding environment.

If migrations fail, verify `DATABASE_URL`, then run:

```bash
pnpm --filter @anhedral/db db:generate
pnpm --filter @anhedral/db db:migrate
```

If Clerk auth fails, verify that frontend URLs, extension origins, and redirect URLs match the active local ports.

If R2 uploads fail, verify the endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region is `auto`, and the token has read/write access to the configured bucket.

## Maintenance

When updating this skill, check the Anhedral CLI source for current flags and generated paths before changing commands. The authoritative local files are:

```text
src/cli.ts
src/scaffold.ts
src/commands.ts
src/toolchain.ts
src/templates/frontend.ts
src/templates/backend.ts
src/templates/extension.ts
```

If upstream docs mention LLM-optimized Markdown or `llms.txt`, prefer those sources when the agent has web access.

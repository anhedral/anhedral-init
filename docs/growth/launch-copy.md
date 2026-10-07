# Launch copy drafts

Prepared October 6, 2026. Review and publish from maintainer accounts after the launch gate in [the growth plan](README.md). These drafts contain no claims about measured setup speed or completed provider provisioning.

## Short announcement

Starting a Next.js app on Cloudflare?

Anhedral Init creates a shadcn pnpm/Turborepo workspace configured for Workers through OpenNext. Add Expo, Electron, WXT, a Hono API, or provider starters when your product needs them.

Preview the setup plan:

```sh
pnpm dlx anhedral@latest new my-app --dry-run --json
```

The generated source is yours to edit. Provider setup and product behavior still need implementation.

Try it: https://github.com/anhedral/anhedral-init

If it helps, a GitHub star supports discovery. We'd also like feedback on the first-run experience.

## Show HN

Title: Show HN: Anhedral – shadcn monorepos for Next.js on Cloudflare

URL: https://github.com/anhedral/anhedral-init

First comment:

We built Anhedral to make the beginning of a TypeScript application more repeatable: start with the official shadcn pnpm/Turborepo workspace, configure Next.js for Cloudflare Workers through OpenNext, then select additional application surfaces and services.

The default is Next.js only. Hono, Expo, Electron, WXT, databases, authentication, and other capabilities are optional. Provider packages are integration starters; the CLI does not create cloud resources or implement your application's business behavior.

You can inspect a plan before generation:

```sh
pnpm dlx anhedral@latest new my-app --dry-run --json
```

To create a workspace:

```sh
pnpm dlx anhedral@latest new my-app
cd my-app
pnpm dev
```

Generation supports Linux, macOS, and WSL. It uses the upstream shadcn bootstrap, so it needs network access. The repository is Apache-2.0, and generated apps remain editable source.

I'm interested in where this is useful versus starting directly from shadcn, and which setup steps still feel unclear. What would you want to inspect before trusting an initializer with a new project?

## Tutorial draft

Title: Start a shadcn Next.js monorepo for Cloudflare with Anhedral

A new application starts with a collection of decisions: framework, workspace structure, hosting adapter, shared UI, and development checks. Anhedral Init puts a specific combination of those decisions into a CLI: the official shadcn pnpm/Turborepo monorepo, with Next.js configured for Cloudflare Workers through OpenNext.

The default selects only the web application. You can add other surfaces and service starters explicitly as the product grows.

### Inspect before generating

Use Node.js 22.13+ and pnpm 10.34.5 for generated workspaces. Generate on Linux, macOS, or WSL.

```sh
pnpm dlx anhedral@latest new my-app --dry-run --json
```

pnpm downloads the CLI. The CLI's dry run then prints the selected products, hosting, bootstrap command, and setup requirements without creating the project or contacting providers. It is a useful first check of what an initializer intends to do.

### Create the web workspace

```sh
pnpm dlx anhedral@latest new my-app
cd my-app
pnpm dev
```

Generation runs the official shadcn bootstrap and needs network access. Inspect `apps/web`, the shared packages, the workspace lockfile, the generated README, and `anhedral.setup.json` before adding product code. Follow the development server's printed URL.

The web application includes Next.js, React, TypeScript, Tailwind, and shadcn/ui. Its hosting configuration targets Cloudflare Workers through OpenNext. The generated workspace also defines build, lint, typecheck, test, audit, and check commands, with GitHub Actions PR checks.

### Add a shared backend when you need one

A web-only application can use Next.js route handlers. If mobile or other clients need a shared API, make that choice explicit in a new workspace:

```sh
pnpm dlx anhedral@latest new shared-product --next --hono --neon --clerk --r2
```

This selects a web application, a Hono/OpenAPI Worker, Neon/Drizzle/Hyperdrive database foundations, Clerk identity, and a private R2 binding. Review each generated package's setup instructions. These boundaries still need resource configuration, migrations, route authorization, and product implementation.

### Check what remains

```sh
pnpm dlx anhedral@latest doctor . --json
pnpm check
```

`doctor` checks local setup requirements without writing to the project. A nonzero exit can mean setup is incomplete. It does not prove provider access or production readiness. `pnpm check` runs the generated deterministic checks; add meaningful tests for the product behavior you implement.

Before deployment, configure the selected Cloudflare resources and bindings, follow the generated instructions for the Worker build and preview, and test the actual user flows. Initialization does not provision or deploy infrastructure.

Anhedral also includes a Codex plugin for the development lifecycle and a project status control panel. The repository documents installation separately so the CLI remains easy to try on its own.

Source and installation: https://github.com/anhedral/anhedral-init

If this approach helps your next project, star the repository and share first-run feedback through its issues.

### Evidence to add before publication

Attach a real default-generation recording and a browser screenshot, identify the tested published version and environment, and include the observed first-run result. Run every command above against that version. The prose is ready for review; these runtime assets are still required for a convincing launch.

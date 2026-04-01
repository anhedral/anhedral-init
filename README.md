# anhedral

Opinionated init CLI for product teams shipping with Next.js, Expo, Fastify, Drizzle, Neon, Clerk, Stripe, RevenueCat, and Cloudflare R2.

## Requirements

- Node.js 20+
- `pnpm` available on your machine

## Usage

Run the latest published CLI directly without installing it globally:

```sh
pnpm dlx anhedral@latest init next
pnpm dlx anhedral@latest init next-fullstack
pnpm dlx anhedral@latest init expo-fullstack
pnpm dlx anhedral@latest init backend
```

```sh
npx anhedral@latest init next
npx anhedral@latest init next-fullstack
npx anhedral@latest init expo-fullstack
npx anhedral@latest init backend
```

Global install also works:

```sh
pnpm add -g anhedral@latest
anhedral init next
```

```sh
npm install -g anhedral@latest
anhedral init next
```

## Stacks

- `next`: Next.js App Router for the fastest web-only SaaS path.
- `next-fullstack`: Next.js frontend plus Fastify backend for clearer service boundaries.
- `expo-fullstack`: Expo app plus Fastify backend for mobile-first or multi-client products.
- `backend`: Fastify-only API foundation for headless products and integrations.

Each scaffold writes a `stack.json` file with the selected architecture and generated outputs.

## Local Development

```sh
pnpm install
pnpm build
pnpm test:all
```

## Publishing

This package is published once to the npm registry. `pnpm`, `npm`, `yarn`, and `bun` users all install that same published package.

```sh
pnpm build
pnpm test:all
npm publish
```

## Maintenance

This repo is now maintained in two lanes:

- `stable`: the default user-facing toolchain, pinned to known-good upstream CLI versions in `src/toolchain.ts`.
- `latest`: an early-warning lane that tracks upstream scaffold tools without pinning, so breakage is detected before it reaches the default path.

The practical rule is simple: detect drift on `latest`, verify it, then promote the pinned `stable` versions only after the e2e matrix passes.

### Recommended automation

- Renovate is configured in `renovate.json` to keep this repo's own dependencies current.
- GitHub Actions CI runs on pushes and pull requests in `.github/workflows/ci.yml`.
- Weekly toolchain drift checks run in `.github/workflows/toolchain-drift.yml` for both `stable` and `latest`.
- Stable toolchain pins in `src/toolchain.ts` are annotated so Renovate can open PRs when upstream scaffold CLIs publish updates.
- `prepublishOnly` stays strict. Every publish still runs `pnpm test:all`.

### Upgrade workflow

Use this sequence when Renovate opens a dependency or toolchain PR:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:e2e
npm pack --dry-run
```

If you want to validate upstream scaffold drift manually, use the explicit latest-lane script:

```sh
pnpm test:e2e:latest
```

When a toolchain pin PR passes and the generated outputs look good, update the `verifiedAt` date in `src/toolchain.ts` and release normally.

### Release policy

- Publish `patch` releases for scaffold fixes, dependency bumps, and safer defaults.
- Publish `minor` releases for new stacks, new flags, or new generated capabilities.
- Publish `major` releases for breaking CLI changes or incompatible generated-project structure changes.
- Never publish from a dirty worktree.

# anhedral

Opinionated init CLI for product teams shipping with Next.js, Expo, Fastify, Drizzle, Neon, Clerk, Stripe, RevenueCat, and Cloudflare R2.

## Requirements

- Node.js 20+
- `pnpm` available on your machine

## Usage

Run the latest published CLI directly without installing it globally:

```sh
pnpm dlx anhedral@latest init
pnpm dlx anhedral@latest init --next
pnpm dlx anhedral@latest init --extension
pnpm dlx anhedral@latest init --next --extension
```

```sh
npx anhedral@latest init
npx anhedral@latest init --next
npx anhedral@latest init --extension
npx anhedral@latest init --next --extension
```

Global install also works:

```sh
pnpm add -g anhedral@latest
anhedral init
```

```sh
npm install -g anhedral@latest
anhedral init
```

## Stacks

- `init`: Expo app plus Fastify backend. This is the default.
- `init --next`: Next.js frontend plus Fastify backend.
- `init --extension`: default Expo fullstack plus a WXT Chrome extension.
- `init --next --extension`: Next.js fullstack plus a WXT Chrome extension.

Every scaffold is a pnpm workspace with `apps/*` and `packages/*`. Shared code such as the Drizzle schema lives under `packages/db` so apps do not need separate database schemas.

Each scaffold writes a `stack.json` file with the selected architecture and generated outputs.

## Local Development

```sh
pnpm install
pnpm build
pnpm test:all
```

## Publishing

This package is published once to the npm registry. `pnpm`, `npm`, `yarn`, and `bun` users all install that same published package.

Official releases are automatic on merges to `main`. GitHub Actions bumps the patch version, runs the release checks once, creates a release commit and tag, and publishes that version to npm.

Recommended release flow:

```sh
git push origin main
```

Release publishing is handled by:

- `.github/workflows/release-on-main.yml`: runs on pushes to `main`, bumps `package.json`, verifies the repo, pushes a `v*.*.*` tag, and publishes to npm.
- `.github/workflows/release.yml`: manual retry workflow for publishing the current checked-out package version.

The repository is private, so npm provenance publishing is not supported. GitHub Actions publishes with `--provenance=false` and skips npm lifecycle scripts because `pnpm release:check` has already run. Configure an npm automation token as `NPM_TOKEN` in the `npm` GitHub environment or repository secrets.

Manual local publish is still available as an emergency fallback:

```sh
pnpm release:check
npm publish --provenance=false --ignore-scripts
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
- Automatic releases publish through `.github/workflows/release-on-main.yml`; `.github/workflows/release.yml` is for manual retry only.
- Stable toolchain pins in `src/toolchain.ts` are annotated so Renovate can open PRs when upstream scaffold CLIs publish updates.
- `prepublishOnly` stays strict for manual local publishing. GitHub Actions skips npm lifecycle scripts during publish after running `pnpm release:check`.

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

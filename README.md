# anhedral

Opinionated init CLI for product teams shipping one stable stack: Expo + React Native Reusables, Fastify, WXT, Drizzle, Neon, Clerk, RevenueCat + Stripe, Cloudflare R2/CDN, and Vercel.

## Requirements

- Node.js 20+
- `pnpm` available on your machine

## Usage

Run the latest published CLI directly without installing it globally:

```sh
pnpm dlx anhedral@latest init
```

```sh
npx anhedral@latest init
```

Use `--skip-install` when you want deterministic file generation without running dependency installation during init:

```sh
pnpm dlx anhedral@latest init --skip-install
pnpm install
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

## Stack

`init` generates the only supported stack:

- Expo + React Native Reusables frontend
- Fastify backend
- WXT extension
- Neon + Drizzle
- Cloudflare R2/CDN
- Clerk auth
- RevenueCat + Stripe
- Vercel deploy

The scaffold is a pnpm workspace with top-level `Frontend`, `Backend`, `Extension`, and `packages/*` folders. Shared code such as the Drizzle schema lives under `packages/db` so apps do not need separate database schemas.

Each scaffold writes a `stack.json` file with the selected architecture, generated outputs, and the verified dependency manifest used for that run.

## Vercel Deployment

The generated workspace is one Git repository with two Vercel projects:

- `Frontend`: Expo web build. Build command: `pnpm build:web`. Output directory: `dist`.
- `Backend`: Fastify API. Build command: `pnpm build`. Vercel detects `src/index.ts` as the Fastify entrypoint.

The `Frontend` source is also the EAS source for iOS and Android builds; Vercel only deploys its web export.

Import the same repository twice in Vercel and set each project Root Directory to the app path above. Enable source access outside the app root so `packages/*` workspace dependencies are available during builds.

Vercel deployments are Git-driven. After both projects are connected, pushes and pull requests deploy the Expo web app and Fastify API automatically from GitHub commits.

Generated projects also include `PRODUCTION.md` with the provider checklist and these root verification scripts:

```sh
pnpm verify
pnpm verify:frontend
pnpm verify:backend
pnpm verify:extension
```

## Generated Provider Setup

New projects ship with placeholder env values so the repository can be inspected before accounts are provisioned. A production UI requires real keys from each provider. The generated `README.md` and `PRODUCTION.md` now include setup links and exact env placement for:

- Neon database: `DATABASE_URL`
- Clerk auth: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- RevenueCat + Stripe: `EXPO_PUBLIC_RC_*`, `RC_SECRET_API_KEY`, `RC_WEBHOOK_SECRET`
- Cloudflare R2/CDN: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Vercel: two projects from the same Git repo, rooted at `Frontend` and `Backend`
- EAS: native iOS and Android builds from `Frontend`
- Chrome Web Store: WXT ZIP upload from `Extension/.output`

## Native App Deployment

Use `Frontend` as the Expo project root for iOS and Android. Vercel only deploys the web export from this app; native builds go through EAS.

```sh
cd Frontend
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init
```

The scaffold generates `Frontend/eas.json` with `development`, `preview`, and `production` profiles.

Build commands:

```sh
# Android
pnpm dlx eas-cli@latest build --platform android --profile production

# iOS
pnpm dlx eas-cli@latest build --platform ios --profile production

# Both platforms
pnpm dlx eas-cli@latest build --platform all --profile production
```

Submit latest successful builds to the stores:

```sh
# Google Play
pnpm dlx eas-cli@latest submit --platform android --latest --profile production

# App Store Connect / TestFlight
pnpm dlx eas-cli@latest submit --platform ios --latest --profile production

# Both platforms
pnpm dlx eas-cli@latest submit --platform all --latest --profile production
```

One-step build and submit:

```sh
pnpm dlx eas-cli@latest build --platform android --profile production --auto-submit
pnpm dlx eas-cli@latest build --platform ios --profile production --auto-submit
pnpm dlx eas-cli@latest build --platform all --profile production --auto-submit
```

Useful release checks:

```sh
pnpm dlx eas-cli@latest build:list
pnpm dlx eas-cli@latest build:version:get --platform all --profile production
pnpm dlx eas-cli@latest credentials
```

## Extension Release

The WXT extension is built from `Extension`. It is not deployed by Vercel.

```sh
cd Extension
pnpm build
pnpm zip
```

The Chrome ZIP is generated under `.output/`. Upload that ZIP in the Chrome Web Store Developer Dashboard:

1. Open the Chrome Web Store Developer Dashboard.
2. Create the item the first time, or open the existing extension item.
3. Upload the generated Chrome ZIP.
4. Complete or update the store listing, screenshots, privacy practices, permissions justification, and distribution settings.
5. Submit the item for review.

For automated store submissions later, WXT supports:

```sh
pnpm wxt submit init
pnpm wxt submit
```

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

This repo is maintained in two lanes:

- `stable`: the default user-facing toolchain, pinned to known-good upstream CLI and package versions in `src/dependencies.ts`.
- `latest`: an early-warning lane that tracks upstream scaffold tools without pinning, so breakage is detected before it reaches the default path.

The practical rule is simple: users get the latest verified Anhedral release, not uncontrolled registry drift at init time. Detect drift on `latest`, verify it, then promote the pinned dependency manifest only after the e2e matrix passes.

### Dependency policy

- Runtime dependency versions for generated projects live in `src/dependencies.ts`.
- Generated package manifests and install commands must read from that manifest.
- Avoid raw `@latest` and caret ranges in generated output unless a package manager or platform command explicitly requires it.
- `pnpm dlx anhedral@latest init` means the newest published Anhedral CLI. The generated project should still be reproducible for that exact Anhedral version.
- `stack.json` records the dependency manifest so support and debugging can identify exactly what was generated.

### Recommended automation

- Renovate is configured in `renovate.json` to keep this repo's own dependencies and generated dependency manifest current.
- GitHub Actions CI runs on pushes and pull requests in `.github/workflows/ci.yml`.
- Weekly toolchain drift checks run in `.github/workflows/toolchain-drift.yml` for both `stable` and `latest`.
- Automatic releases publish through `.github/workflows/release-on-main.yml`; `.github/workflows/release.yml` is for manual retry only.
- Stable dependency pins in `src/dependencies.ts` are annotated so Renovate can open PRs when upstream packages and scaffold CLIs publish updates.
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

When a dependency pin PR passes and the generated outputs look good, update the `VERIFIED_AT` date in `src/dependencies.ts` and release normally.

### Release policy

- Publish `patch` releases for scaffold fixes, dependency bumps, and safer defaults.
- Publish `minor` releases for new stacks, new flags, or new generated capabilities.
- Publish `major` releases for breaking CLI changes or incompatible generated-project structure changes.
- Never publish from a dirty worktree.

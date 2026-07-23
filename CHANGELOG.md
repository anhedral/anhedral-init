# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Add idempotent `pnpm first-run` setup plus a secret-safe `pnpm ready` gate with
  human and JSON output, required/optional variable awareness, and truthful exit
  status.
- Generate a working items feature across Drizzle, Zod contracts, Fastify
  routes, the shared API client, and idiomatic Next.js, Expo, Electron, and WXT
  interfaces for every selected client.
- Add explicit `--all`, automatic Git initialization for `new`, dependency-resolution previews, confirmation, exact generated lifecycle scripts, UI-provider command previews, and actionable `doctor` recommendations.
- Add a published DX north star that defines measurable discovery, creation,
  configuration, development, extension, diagnosis, upgrade, and shipping
  journeys.

### Changed

- Default interactive creation to a focused web app with optional capabilities while preserving the complete-stack default for noninteractive compatibility.
- Replace deprecated Turborepo development commands, make cache outputs package-specific, and let typechecks depend on upstream typechecks instead of builds.
- Track bundled UI primitives in the project manifest and make generated onboarding, deployment, provider, and source-location guidance selection-aware.
- Include status, generator version, project root, resolved modules, and next
  steps in machine-readable plans; make human lifecycle output concise unless a
  dry-run or verbose path listing is requested.

### Fixed

- Allow Next.js client API factories to render safely during production prerendering while preserving HTTPS enforcement for non-loopback production endpoints.
- Make generated lifecycle commands reproducible even though Anhedral is intentionally not installed in application dependencies.
- Forward arguments through generated pnpm lifecycle scripts without inserting a literal `--` that the Anhedral or provider CLI would reject.
- Treat generated Clerk placeholder keys as unconfigured on every client instead
  of mounting providers with knowingly invalid values.
- Keep Electron starter features synchronized with Clerk sign-in changes instead
  of treating an opened account dialog as an authenticated session.
- Put reviewed database migration generation, Git staging, verification, and
  application in one consistent onboarding order.
- Detect required environment variables that were deleted from an existing
  package-local configuration file.

### Security

- Scope generated starter-item reads and writes to the authenticated Clerk user
  whenever authentication is selected.
- Reject local home-directory paths and email addresses in source and packed
  release artifacts while continuing to allow documentation placeholders and
  public GitHub noreply contributor identities.

## 0.4.1 - 2026-07-22

### Added

- Add the public launch artwork, reusable stack-map renderer, and expanded brand asset library to the repository and published package.

### Changed

- Present Anhedral as a cross-platform, modular product stack that lets teams build once, ship everywhere, and scale without repeating framework setup.
- Automatically create patch versions for ordinary changes merged to `main`, while preserving explicitly declared minor and major releases.
- Keep project upgrades compatible across automatic patch releases and retain the supported 0.3-to-0.4 ownership migration.
- Publish from the exact generated release commit and attach npm provenance now that the source repository is public.

## 0.4.0 - 2026-07-22

### Added

- Add the `electron-updater` feature module, including packaged-app update checks, private R2 storage, a read-only bound Cloudflare Worker on a custom domain, ordered architecture-specific publishing commands, and a complete generated release runbook.
- Make the `anhedral-init` coding-agent skill the recommended setup path, with project/domain intake, Computer Use and subagent orchestration, provider provisioning order, authentication and secret-generation stops, and verified Cloudflare/Vercel domain handoffs.
- Add the canonical fixed-width master stack map to the published documentation and route the coding-agent skill through it for whole-platform planning and explanation.
- Add a transactional project-upgrade path so compatible 0.3 projects can adopt 0.4 without regeneration.
- Add a focused default development loop for the primary web and API surfaces, with `dev:all` available for intentionally launching every selected client.

### Changed

- Make generated onboarding follow the real environment, managed-Neon, verification, and framework source layout instead of promising an unconfigured one-command boot.
- Treat developer extension points as user-owned source while retaining conflict protection for generated wiring and mergeable workspace configuration.
- Publish the skill's provisioning references from their canonical `docs/references` location and validate every packed local documentation link.
- Upgrade GitHub artifact transfer actions to their Node.js 24-native releases and keep manual npm publication routed through the trusted-publisher workflow identity.

### Fixed

- Canonicalize module ordering when an incremental feature contributes a previously absent dependency.
- Attach release integrity metadata beside the npm tarball in GitHub Releases.

## 0.3.0 - 2026-07-21

### Added

- Add a unified `anhedral ui add` workflow that routes DOM clients to shadcn/ui and Expo clients to React Native Reusables.
- Add interactive starter-component selection after app surfaces and feature sets, with NativeWind or Uniwind selection for Expo.
- Add React Native Reusables-ready Expo configuration, theme CSS, aliases, utilities, Metro integration, and portal hosting.
- Add manifest schema v5 UI configuration and per-client component installation records.
- Add staged provider execution, dry-run plans, duplicate-install detection, target validation, and provider routing tests.
- Add `anhedral new <directory>` as the primary complete-stack creation flow while retaining `init` for an empty current directory.
- Generate selection-aware `README.md`, `docs/DEVELOPMENT.md`, `docs/STACK.md`, and `SKILL.md` guidance that maps product tasks to ordinary framework source.
- Publish the repository skill, manual scaffolding reference, conventions, and output-tree contract with the npm package.

### Changed

- Pin the component installer to shadcn 4.13.0 and run all provider mutations inside Anhedral transaction staging.
- Preserve Anhedral's exact Expo SDK dependency while resolving React Native Reusables registry dependencies before the root workspace install.
- Present Anhedral as a readable TypeScript stack generator with native Next.js, Expo, Fastify, Drizzle, Electron, and WXT conventions rather than a proprietary application runtime.
- Use argument-vector process execution for workspace installation instead of invoking a command through a shell.
- Remove the retired one-app compiler experiment from the production CLI and package surface.

### Security

- Reject symbolic-link scaffold roots before creating transaction metadata or modifying their targets.
- Override vulnerable `shell-quote` and `sharp` dependency ranges in generated workspaces.

## 0.2.1 - 2026-07-16

### Added

- Add integrity-checked bundled framework substrates, typed module contributions, deterministic root composers, and manifest schema v4 template provenance.
- Add template tamper, symbolic-link, package-content, and contribution-composition regression tests.
- Add exact-artifact portability checks at the minimum Node.js 20 and 22 releases and the pinned Node.js 24 release on macOS and Windows.
- Add scheduled and release-gated Electron, WXT, and Expo native runtime acceptance lanes.
- Add deterministic workflow, Renovate extraction, release declaration, registry recovery, and module-topology policy tests.

### Security

- Reject altered template catalogs, mismatched substrate digests, symbolic links, forbidden generated artifacts, and oversized template trees before transactional commit.
- Scan all tracked text, built output, and final package tarballs for high-confidence secret formats before publication.
- Clarify that public package availability grants no installation, execution, or generated-output rights without a separate written agreement.

## 0.2.0 - 2026-07-15

### Added

- Add manifest schema v3 with deterministic module dependency resolution, file ownership, hashes, modes, and an explicit toolchain channel.
- Add transactional `init` and `add` operations with locking, journaling, rollback, dry-run plans, and JSON output.
- Add the `anhedral doctor` command.
- Add deterministic output-tree contracts for representative scaffold combinations.

### Changed

- Generate only the dependencies, source files, environment keys, apps, and shared packages required by selected modules.
- Align Vercel Services output with the current `services` schema and mount Fastify routes under the preserved `/api` path.
- Refresh the verified Next.js, Expo, Clerk, Electron, WXT, Vite, and RevenueCat integration matrix.
- Separate the side-effect-free package API from the executable CLI entry point.
- Preserve user-owned documentation, workflows, package fields, and mergeable root configuration during incremental adds.
- Build from a clean `dist/` directory before tests and packaging.
- Publish one verified tarball and compare its integrity with npm before tagging.
- Pin the release Node.js/npm packer so recovery rebuilds remain reproducible.
- Install the exact release artifact and run its `.bin/anhedral` shim in package smoke tests.
- Enforce an explicit npm package allowlist and artifact size policy.
- Test the CLI on Node.js 20, 22, and 24 in CI.
- Wire Clerk controls and token-aware API helpers into web and mobile templates, and make the desktop account action open Clerk sign-in or profile UI.
- Bootstrap RevenueCat only for `native-subscriptions`, connect native purchases to the authenticated user, and expose a native paywall action.
- Put pnpm overrides, build permissions, and peer policy in `pnpm-workspace.yaml`, with conflict-safe structural merges.
- Keep public API GET requests simple by omitting unused platform and content-type headers.
- Remove unused provider dependencies and environment placeholders from generated clients.
- Wire Tailwind CSS v4 into generated web and desktop builds, including semantic shadcn color tokens.
- Keep canonical module IDs and valid RFC 3986 URI schemes in generated project metadata and documentation.
- Refresh generator-owned Node.js and pnpm policy during incremental adds when the recorded package manifest is unmodified.

### Removed

- Remove pre-schema-v3 manifest migration, generated-layout adoption, deprecated module aliases, and duplicate `stack.json` output. Projects must be generated with the current CLI and use canonical module IDs.

### Security

- Reject modified managed files and unowned path collisions before committing incremental changes.
- Validate recovery journals, reject symlink traversal, and persist transaction intent before moving files.
- Audit every locked CLI dependency through OSV after pnpm's retired audit endpoint became unavailable.
- Make RevenueCat webhook processing fail closed and persist idempotency records when billing is selected.
- Scope npm credentials to the single publish step in the protected release job.
- Separate read-only release verification from npm publication and Git tag creation.
- Pin GitHub Actions to verified upstream commit SHAs.
- Default Fastify proxy trust to off, require an explicit bounded trusted-hop count, and minimize conditional Chrome permissions.
- Reconcile exact package versions against detailed OSV advisory ranges when the batch index is over-broad.
- Reject manifest-recorded directories and other non-regular paths during project health checks.

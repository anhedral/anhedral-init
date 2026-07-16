# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Add exact-artifact portability checks at the minimum Node.js 20 and 22 releases and the pinned Node.js 24 release on macOS and Windows.
- Add scheduled and release-gated Electron, WXT, and Expo native runtime acceptance lanes.
- Add deterministic workflow, Renovate extraction, release declaration, registry recovery, and module-topology policy tests.

### Security

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

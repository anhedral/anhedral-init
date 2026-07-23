# Contributing

Changes should follow the repository's
[engineering principles](docs/engineering-principles.md): explicit behavior,
one source of truth, narrow namespaces, visible failures, and focused tests.

## Local setup

Anhedral requires Node.js 20.19+ or 22.12+ and pnpm 10.34.5.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm check:security
pnpm check:release-policy
pnpm audit:osv
pnpm test
```

## Before opening a pull request

Run the checks relevant to the files you changed:

```sh
pnpm typecheck
pnpm test
pnpm test:pack
pnpm test:packlist
pnpm test:release-tooling
```

Changes to generated templates or dependency pins should also run:

```sh
pnpm test:deps
pnpm test:e2e
```

The E2E test installs upstream packages in a disposable operating-system temp directory, so it requires network access and may take several minutes. It removes the workspace in a `finally` block; set `ANHEDRAL_E2E_KEEP=1` only when you intentionally need to inspect a failed or completed run.

After an intentional scaffold-output change, regenerate and review the path/mode/SHA-256 contracts and generated tree documentation:

```sh
pnpm build
node tests/update-output-tree-contracts.js
```

## Package changes

- Keep the public package allowlist narrow.
- Do not commit `dist/`, tarballs, `release-artifact/`, or temporary E2E/demo workspaces.
- Add or update a regression test for CLI behavior and generated configuration changes.
- Keep stable toolchain commands pinned; mutable upstream versions belong only in the `latest` lane.
- Run the OSV audit against a newly installed representative generated lockfile when changing framework or runtime pins.

## Ownership and required review

Repository administrators must map the following roles to real maintainers in branch protection, the protected `npm` environment, private vulnerability reporting, and workflow-failure notifications:

- **Generator owner:** core architecture, transactions, manifests, and generated-file ownership.
- **Runtime owner:** application templates, provider integrations, and the stable dependency manifest.
- **Release owner:** package metadata, CI workflows, registry publication, tags, and recovery.
- **Security responder:** vulnerability intake, secret-exposure response, and supply-chain incidents.

No `CODEOWNERS` file is committed until an actual GitHub user or team slug is selected. A placeholder would create false confidence without enforcing review. Require at least one appropriate owner review for generator/runtime changes and a release-owner review for `.github/workflows/`, `scripts/`, `package.json`, `renovate.json`, `SECURITY.md`, or `docs/RELEASING.md`.

Scheduled Toolchain Drift failures and release-workflow failures must alert the release owner. Security-policy, secret-scan, or OSV failures must additionally alert the security responder. Configure those routes in repository notification settings and test them after changing ownership.

## Releases

Do not run `npm publish` from a development checkout. Version changes are reviewed before release, and CI publishes the verified tarball. See [docs/RELEASING.md](docs/RELEASING.md).

This repository and package are licensed under the Apache License 2.0. Unless
explicitly stated otherwise, contributions intentionally submitted for
inclusion in Anhedral are provided under the same license, as described in
Section 5 of [LICENSE](LICENSE).

# Security Policy

## Supported versions

Security fixes are made on the current development branch and released as a new npm version. Consumers should use the latest version published under the `latest` dist-tag.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting or security-advisory flow for this repository. If repository access is unavailable, contact the package maintainers through the owner information on the [anhedral npm package](https://www.npmjs.com/package/anhedral).

Include the affected version, reproduction steps, impact, and any suggested mitigation. Please avoid accessing data that is not yours and allow maintainers time to investigate before public disclosure.

## Supply-chain policy

- Release artifacts are built and tested in a read-only job.
- The exact tarball uploaded by CI is the artifact submitted to npm.
- npm integrity is checked before and after publication.
- npm publication uses Trusted Publishing: GitHub exchanges an OIDC identity for a short-lived credential only in the publish step of the protected `npm` environment. No npm write token is stored in GitHub.
- A Git tag and GitHub release are created only after npm confirms the expected artifact integrity.
- GitHub Actions are pinned to reviewed commit SHAs, and the release Node.js/npm packer is pinned to an exact version.
- CI queries OSV for every exact package version in `pnpm-lock.yaml` and every dependency version shipped by the generator; it fails closed if the service remains unavailable after bounded retries or reports a finding.
- Local policy scans every tracked or non-ignored working-tree text file and built `dist/` file for high-confidence credential formats. Release jobs repeat the scan against the exact gzip tarball before it crosses the publish boundary. Placeholder examples use explicit non-secret values rather than allowlisting token-shaped strings.
- Release declarations must be valid Semantic Versioning and have a matching `CHANGELOG.md` section. Local deterministic checks validate workflow policy and confirm every Renovate custom manager still extracts a maintained pin.

Generated projects pin their stable dependency manifest, explicitly allow only required dependency build scripts, and record the selected toolchain channel in `anhedral.json`. The `latest` channel is for upstream-drift testing and is not the reproducible default.

Incremental generation rejects path traversal, symbolic-link targets, unowned collisions, modified managed files, and managed-file permission drift. Transaction journals are validated before recovery, fsynced before filesystem moves, and advanced only around durable rename barriers where the host filesystem supports directory synchronization.

UI component installation is an explicit networked supply-chain operation. Anhedral pins the shadcn installer version, routes Expo only to the official HTTPS React Native Reusables registry, validates component names and target paths, and runs provider mutation inside transaction staging. Provider-generated files and dependency manifests must pass ownership checks before commit. Users should review `--dry-run` output and the resulting source diff; registry content is upstream-maintained and is not part of Anhedral's immutable bundled-template catalog.

## Secret response

If a secret-shaped finding is real, do not merely remove it from the latest commit. Revoke or rotate the credential first, identify every log, artifact, cache, fork, and package version that may contain it, and coordinate history or artifact cleanup with the security responder. Treat false positives by changing the example to an unmistakable placeholder; do not add broad path exclusions.

Anhedral is licensed under the Apache License 2.0. Security research must still
comply with applicable law and the systems owner's authorization; the software
license does not authorize testing infrastructure or accounts you do not own.

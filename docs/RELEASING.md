# Release Runbook

## Release model

Every ordinary change merged to `main` becomes a patch release after the matching `CI` run succeeds. `Release On Main` compares the committed package version with npm, creates the next patch version when they match, synchronizes `package.json`, `src/version.ts`, `CHANGELOG.md`, and the version-dependent output-tree contracts, and pushes a release commit with `[skip ci]`. If a reviewed change already declares a newer version, the workflow preserves it so maintainers can intentionally choose a minor or major release.

Release preparation is serialized, always refreshes the latest `main`, ignores a successful CI run superseded by a newer commit, skips a commit that already has its matching version tag, and passes the exact prepared commit to the canonical `Release` workflow. The canonical workflow:

1. Checks out the exact prepared release commit without persisted credentials.
2. Verifies that the prepared commit is contained in `main`.
3. Runs the complete release checks.
4. Builds one tarball and records its SHA-1 and SHA-512 integrity.
5. Scans tracked files, built output, and the exact tarball for high-confidence secret formats.
6. Installs that exact tarball and executes its generated `.bin/anhedral` shim.
7. Transfers the exact artifact to macOS and Windows and repeats the smoke test on Node.js 20.19.0, 22.12.0, and the pinned Node.js 24 release.
8. Installs the exact tarball in each runtime lane, launches the packaged Electron app under Xvfb and inspects its rendered page over CDP, loads and inspects the WXT extension's live MV3 service worker in Chrome, and runs Expo Android prebuild plus Gradle `assembleDebug` with an APK assertion.
9. Uploads the verified tarball and integrity metadata as a short-lived Actions artifact.
10. Checks npm for the declared version.
11. Publishes only when the version is absent, using the protected `npm` environment.
12. Confirms that npm reports the exact local integrity.
13. Creates the Git tag and GitHub release only after registry verification, attaching both the npm tarball and its integrity metadata.

Manual and recovery runs must dispatch **Release On Main**, which preserves the current declared version and calls the reusable `Release` workflow under the filename trusted by npm. Never dispatch the reusable workflow directly. Release preparation and publication use non-cancelling concurrency groups, and the selected commit must be contained in `main`.

The release workflow pins an exact Node.js release, including its bundled npm version, so rebuilding the same source for recovery does not silently change the tarball packer. Update that pin only in a reviewed workflow change.

## Preparing a normal release

1. Start from an up-to-date clean branch.
2. For a normal patch, leave the current version unchanged; the workflow creates the next patch release after merge. For a minor or major release, update `package.json`, `src/version.ts`, and `CHANGELOG.md` together in the reviewed change.
3. Run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm release:check
   pnpm release:pack
   pnpm release:artifact:verify
   pnpm release:artifact:smoke
   ```

4. Inspect `release-artifact/metadata.json` and the dry-run packlist.
5. Merge after required checks pass.
6. Confirm the generated release commit, npm version, integrity, Git tag, and GitHub release agree.

Before merging, also confirm:

- The release owner approved package and workflow changes.
- The security responder reviewed any security-policy exception; broad secret-scan exclusions are not permitted.
- Toolchain Drift is healthy or every known upstream failure is recorded with an owner.
- The protected `npm` environment is restricted to `main`. When the repository plan supports environment reviewers for this private repository, require a current release reviewer as an additional control.
- npm trusts `anhedral/anhedral-init`, calling workflow `release-on-main.yml`, environment `npm`, for `npm publish`.
- Workflow and scheduled-job failure notifications route to the documented owners.
- Package metadata declares `Apache-2.0`, the complete license is included in the tarball, and the README describes generated applications without imposing a conflicting proprietary-use restriction.

Never reuse or overwrite a version that npm already contains.

## Authentication

The release uses npm Trusted Publishing. GitHub obtains a short-lived OIDC credential for the exact trusted workflow instead of storing an npm write token. Because `release-on-main.yml` calls the reusable `release.yml`, both the caller's release job and the reusable workflow's publish job grant `id-token: write`; npm validates the calling filename `release-on-main.yml`.

The npm package settings must contain exactly one GitHub Actions trusted publisher with organization/user `anhedral`, repository `anhedral-init`, workflow filename `release-on-main.yml`, environment `npm`, and permission `npm publish`. The publishing job uses a GitHub-hosted runner, configures `registry.npmjs.org`, and requires npm 11.5.1 or newer. No `NODE_AUTH_TOKEN`, `NPM_TOKEN`, or npm authentication file is permitted in the release workflows.

The repository is public, so npm publication includes provenance generated from the trusted GitHub Actions identity.

Trusted publication was established with the 0.3 release. Keep npm package **Publishing access** set to **Require two-factor authentication and disallow tokens**, keep the GitHub `npm` environment and repository free of `NPM_TOKEN`, and do not create a fallback automation token. If trusted-publisher recovery is required, repair the OIDC identity or workflow configuration instead of weakening publishing access.

## Idempotent retries

The registry preflight has three outcomes:

- **Missing:** publish the verified tarball.
- **Matching integrity:** skip `npm publish` and continue recovery with registry verification and tagging.
- **Different integrity:** stop. npm versions are immutable and the local artifact must not be associated with that version.

The workflow also stops before publication when the intended tag already points to a different commit.

## Recovery scenarios

### Verification or packing failed

Fix the source and checks. Re-run **Release On Main** for the prepared release commit; do not reuse a version after npm has published it.

### npm publish failed and the version is still absent

Correct authentication or registry availability, then dispatch **Release On Main** again for the same commit. The workflow rebuilds and verifies the artifact before retrying.

### npm accepted the package but the workflow failed afterward

Dispatch **Release On Main** again for the same commit. The integrity preflight must report `matching`; publication is skipped, and the workflow resumes tag/release creation.

### A tag exists but npm does not contain the version

First compare the tag commit with the commit that would be packaged. The workflow intentionally refuses a mismatch before publication. Do not force-move a release tag casually. If subsequent source changes make the artifact differ, prefer a new reviewed version and document the unpublished tag as skipped. Rewriting an unpublished tag requires explicit maintainer approval and coordination with every consumer of that tag.

Historical tags `v0.1.11` and `v0.1.12` were created ahead of npm's `0.1.10` and remain unpublished. Never reuse those version numbers; choose a new reviewed version for every future artifact.

### A bad package was published

Do not attempt to overwrite it. Deprecate the affected version, publish a corrected new version, update the `latest` dist-tag if necessary, and document the incident.

## Post-release verification

```sh
npm view anhedral version dist-tags.latest
npm view anhedral@<version> dist.integrity
pnpm dlx anhedral@<version> --help
git show v<version>:package.json
```

The npm version, npm integrity, Git tag, GitHub tarball, attached `metadata.json`, and committed `package.json` version must all agree.

After verification, the release owner records completion in the release run or associated change. If any runtime-acceptance lane was skipped by an explicit availability guard, record the skipped capability and complete it on a suitable runner before representing that surface as verified.

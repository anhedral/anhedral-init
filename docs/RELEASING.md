# Release Runbook

## Release model

The repository does not bump versions inside the publishing workflow. A release version must already be reviewed and committed in `package.json`.

When a committed `package.json` version change reaches `main`, `Release On Main` calls the canonical `Release` workflow. Other `package.json` edits are detected and skipped. The canonical workflow:

1. Checks out the declared commit without persisted credentials.
2. Verifies that the commit is contained in `main`.
3. Runs the complete release checks.
4. Builds one tarball and records its SHA-1 and SHA-512 integrity.
5. Scans tracked files, built output, and the exact tarball for high-confidence secret formats.
6. Installs that exact tarball and executes its generated `.bin/anhedral` shim.
7. Transfers the exact artifact to macOS and Windows and repeats the smoke test on Node.js 20.19.0, 22.12.0, and the pinned Node.js 24 release.
8. Installs the exact tarball in each runtime lane, launches the packaged Electron app under Xvfb and inspects its rendered page over CDP, loads and inspects the WXT extension's live MV3 service worker in Chrome, and runs Expo Android prebuild plus Gradle `assembleDebug` with an APK assertion.
9. Uploads the verified tarball as a short-lived Actions artifact.
10. Checks npm for the declared version.
11. Publishes only when the version is absent, using the protected `npm` environment.
12. Confirms that npm reports the exact local integrity.
13. Creates the Git tag and GitHub release only after registry verification.

The manual `Release` dispatch uses the same workflow and the same `npm-publish-anhedral` concurrency group. It may retry an older commit, but that commit must be contained in `main`.

The release workflow pins an exact Node.js release, including its bundled npm version, so rebuilding the same source for recovery does not silently change the tarball packer. Update that pin only in a reviewed workflow change.

## Preparing a normal release

1. Start from an up-to-date clean branch.
2. Choose the intended semantic version.
3. Update `package.json` and `CHANGELOG.md` in a reviewable pull request. The declared version must be valid SemVer and must have its own level-two changelog heading.
4. Run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm release:check
   pnpm release:pack
   pnpm release:artifact:verify
   pnpm release:artifact:smoke
   ```

5. Inspect `release-artifact/metadata.json` and the dry-run packlist.
6. Merge the version pull request after required checks pass.
7. Confirm the npm version, integrity, Git tag, and GitHub release agree.

Before merging, also confirm:

- The release owner approved package and workflow changes.
- The security responder reviewed any security-policy exception; broad secret-scan exclusions are not permitted.
- Toolchain Drift is healthy or every known upstream failure is recorded with an owner.
- The protected `npm` environment has a current reviewer and credential.
- Workflow and scheduled-job failure notifications route to the documented owners.
- The intended recipients have a written Anhedral agreement covering installation, use, and generated-output rights. Public npm availability is distribution infrastructure, not a license grant.

Never reuse or overwrite a version that npm already contains.

## Authentication

The current workflow uses the `NPM_TOKEN` secret from the protected `npm` environment. The caller maps it to `NODE_AUTH_TOKEN`, and the canonical workflow writes only an environment-variable reference to a temporary npm user config for the `npm publish` step. The temporary config is removed when the step exits.

The repository is not publicly accessible, so publication explicitly disables npm provenance. If the source repository becomes public, migrate to npm trusted publishing in a separate reviewed change: remove the long-lived token, grant `id-token: write` only to the publish job, configure the exact workflow as npm's trusted publisher, and enable provenance.

## Idempotent retries

The registry preflight has three outcomes:

- **Missing:** publish the verified tarball.
- **Matching integrity:** skip `npm publish` and continue recovery with registry verification and tagging.
- **Different integrity:** stop. npm versions are immutable and the local artifact must not be associated with that version.

The workflow also stops before publication when the intended tag already points to a different commit.

## Recovery scenarios

### Verification or packing failed

Fix the source and checks. Do not change the version unless a package was actually published.

### npm publish failed and the version is still absent

Correct authentication or registry availability, then dispatch the canonical `Release` workflow again for the same commit. The workflow rebuilds and verifies the artifact before retrying.

### npm accepted the package but the workflow failed afterward

Dispatch `Release` again for the same commit. The integrity preflight must report `matching`; publication is skipped, and the workflow resumes tag/release creation.

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

The npm version, npm integrity, Git tag, GitHub release asset, and committed `package.json` version must all agree.

After verification, the release owner records completion in the release run or associated change. If any runtime-acceptance lane was skipped by an explicit availability guard, record the skipped capability and complete it on a suitable runner before representing that surface as verified.

# Template substrates and typed overlays

## Decision

Anhedral generates projects by materializing immutable framework substrates into its transaction staging directory and then composing the selected modules over those substrates. Stable generation never invokes framework generators or checks out a mutable repository branch at runtime.

The generation pipeline is:

1. Resolve the canonical module dependency closure.
2. Select the corresponding bundled substrates.
3. Validate the template catalog and SHA-256 digest of every selected substrate.
4. Materialize regular files into transaction staging while rejecting symbolic links, traversal, nested workspaces, repositories, caches, and size-limit violations.
5. Collect typed module contributions.
6. Compose shared configuration once from the complete contribution model.
7. Render module-owned source files.
8. Build the file ownership manifest and record template provenance.
9. Atomically commit the staged result.
10. Run one root package installation after commit unless installation was skipped.

## Invariants

- The same CLI artifact and inputs produce byte-identical source trees.
- Templates never execute hooks or install dependencies.
- Template materialization cannot write outside transaction staging.
- A final path has one generation-plan owner.
- Shared files are composed from typed data rather than sequential text patches.
- `add` retains managed, mergeable, and user-owned conflict rules.
- Template catalog version and digest are part of the `anhedral.json` trust boundary.
- The published npm artifact contains everything needed for stable generation.

## Template maintenance

The `templates/catalog.json` file is an allowlist. Each directory digest covers canonical relative paths, byte lengths, and exact file bytes. Any substrate change requires updating its digest, reviewing the generated output contracts, and passing packaged-CLI verification.

Upstream framework generators may be used by maintainers to prepare a proposed substrate refresh in a disposable directory. Their output is never trusted or executed directly in a user's generation transaction. The reviewed result is reduced to the Anhedral substrate and shipped in a versioned CLI artifact.

## Existing projects

Arbitrary project adoption is intentionally separate from `init`. A future adoption command must first detect the framework, report collisions, establish an observed ownership baseline, and create a manifest only from verified files. The template architecture does not authorize silent modification of an unmanaged project.

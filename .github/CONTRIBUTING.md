# Contributing

Anhedral is maintainer-led. Small bug fixes, tests, and documentation corrections are welcome. Open an issue and obtain maintainer agreement before implementing new capabilities, architectural changes, or broad refactors. Unsolicited large changes may be closed.

Use the issue forms, search existing reports, and include the CLI version and a minimal reproduction. Keep credentials, customer data, and private deployment details out of issues, pull requests, screenshots, and logs. Report vulnerabilities through [private security reporting](https://github.com/anhedral/anhedral-init/security/advisories/new).

For a pull request, fork the repository, create a focused branch, run `pnpm install --frozen-lockfile` and `pnpm test:all`, and describe the behavior change and validation. Include meaningful regression tests for code fixes. The demos have separate workspaces; validate any demo you change with its `check` script. Avoid generated artifacts and unrelated formatting changes.

`rswearin` owns review and merge decisions. Required CI and CodeQL checks must pass; dependency updates are reviewed rather than automatically merged. Releases use verified artifacts and npm trusted publishing. Release credentials are never available to contribution workflows.

Contributions are licensed under this repository's Apache-2.0 license. Contributors must have the right to submit their work. Participate respectfully and follow the [code of conduct](CODE_OF_CONDUCT.md). Maintenance is provided as capacity permits; an issue or pull request does not guarantee acceptance or a response deadline.

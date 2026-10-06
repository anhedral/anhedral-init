# Security

Security fixes target the latest published Anhedral release. Upgrade to the current version before reporting a problem. Generated applications and deployed demos need their own dependency updates, access controls, secrets, and production validation.

Use [GitHub private vulnerability reporting](https://github.com/anhedral/anhedral-init/security/advisories/new). Include the affected version, reproduction, impact, and suggested mitigation. Do not disclose credentials, customer data, or vulnerability details in public issues. Coordinate publication with the maintainer; response timing depends on availability.

The CLI initializes source; it does not provision resources or establish production readiness. Review generated code, commit its lockfile, and run its checks before deployment. Keep real secrets in ignored local files and provider secret stores. Never use example secrets in production.

# Verification, delivery and operations

Use the project's deterministic gate: lint/types, Fallow, dependency/security checks, meaningful tests and builds. Fix legitimate findings and document narrow intentional exceptions. Use the Cloudflare security-audit skill when available and relevant; do not claim an unavailable audit occurred.

Verify real platform deliverables. Cloudflare Next.js needs its OpenNext Worker build and deployed preview. Expo web export does not prove mobile readiness: use native device/simulator flows and signed builds. Electron needs the packaged app and platform signing where distributed. WXT needs an installed side panel, permission checks and background/content behavior. SDK factories and mocks do not prove provider integration.

Exercise acceptance criteria and applicable provider boundaries: authentication, resource ownership, private files, billing/webhook replay, job retries/resume and observable failures. Distinguish source, local runtime, artifact, preview and production evidence. Retain reproducible evidence without secrets or customer data.

Prepare focused reviewed changes and preserve source/license notices. Keep CI and required review protections intact. Artifact releases need exact package contents, secret scans, supported-platform checks and published integrity verification. Use protected environments and short-lived/OIDC publishing when supported. Never replace a published version with different bytes.

Before production delivery, establish the exact version/environment, migration impact, acceptance evidence, operating owner and rollback procedure. Apply existing user authorization and request only missing approval for the concrete release. Verify public/installable artifacts and deployed user flows after shipping; a green build or accepted deployment request is insufficient.

Record useful alerts/logs, failure recovery, cost controls, dependency maintenance, database backups and tested recovery appropriate to selected services. Recurring monitoring requires explicit scope and an authorized working schedule. Finish with the shipped result, verification evidence and material remaining limitations.

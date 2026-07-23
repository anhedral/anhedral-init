# Anhedral DX north star

## One command in. A working product foundation out.

Anhedral should let a developer choose the surfaces and capabilities their idea
needs, generate one understandable TypeScript workspace, and reach a working
feature without first becoming an expert in every framework and provider.

The generated application must feel like a project the developer wrote
themselves:

- ordinary framework source, package scripts, environment files, and tests;
- one shared contract and API client across every selected surface;
- working vertical slices instead of disconnected demonstrations;
- safe, inspectable structural changes with no hidden runtime or control plane;
- a clear path from first run to production without changing architecture; and
- built-in scale through managed, autoscaling providers rather than custom
  infrastructure.

Anhedral succeeds when developers spend their time on the product idea, not on
repeating setup, reconciling integrations, or reverse-engineering generated
code.

## Product principles

### Fast to first value

A developer should understand the choices before generation, see the resolved
dependency closure, and know the next command when generation finishes.
`pnpm first-run` prepares local configuration without overwriting it.
`pnpm ready` answers whether required configuration is complete without
revealing values. `pnpm verify` proves the source and selected integrations
build.

### Build once, ship everywhere

Contracts, validation, API calls, authentication, persistence, and product
behavior should be shared where the platforms permit it. Every selected client
should receive an idiomatic UI for the same starter feature so the developer can
prove the whole path on web, iOS, Android, desktop, and browser extension
surfaces before replacing it with their idea.

### Explicit composition

The CLI must distinguish what the developer requested from what dependencies
added. Interactive and automated use must produce the same canonical module
closure. Complete-stack generation is explicit with `--all`; focused stacks
remain first-class.

### Safe evolution

`add`, `ui add`, and `upgrade` must be transactional, previewable, deterministic,
and ownership-aware. They may merge known configuration and replace unmodified
managed substrate, but must never silently overwrite product code. `doctor`
must explain drift and give a concrete recovery action.

### Production-shaped from the start

Development and production use the same package boundaries and provider
integrations. Environment examples may contain placeholders, but generated
applications must identify them before launch. Secrets stay server-side and
uncommitted. Deployment guidance is specific to the selected stack and does not
claim resources already exist.

### Human and automation parity

Human output should be concise and actionable. `--json` should provide one clean,
stable document with the same resolved modules, plans, outcomes, and next steps
for CI and coding agents. Noninteractive commands must never depend on a prompt.

### Source ownership is the feature

Generated product seams are user-owned and readable. Provider substrate is
managed only where consistency and security require it. The manifest records
the boundary, and every lifecycle command honors it.

## Journey contract

| Journey | The developer should experience | Acceptance signal |
| --- | --- | --- |
| Discover | Immediately understand cross-platform scope, modularity, cost posture, and ownership | README states the value plainly and links to exact commands |
| Choose | See app surfaces, capabilities, dependencies, and runtime requirements before writes | Interactive confirmation and `--help` show the canonical resolved stack |
| Create | Receive deterministic source, optional Git initialization, visible installation progress, and exact next steps | `new`, `init`, dry-run, JSON, skip-install, and Git variants are tested |
| Configure | Safely create only missing local environment files and identify every unresolved placeholder without printing secrets | `pnpm first-run` is idempotent; `pnpm ready` returns a truthful exit status |
| Prove | Exercise a real contract → database → API → client → UI feature on every selected surface | Focused and complete generated stacks typecheck, test, and build |
| Develop | Know where product code belongs and use each framework normally | Generated README, development guide, stack map, and coding-agent skill agree |
| Extend | Preview and add modules or source-owned UI without losing edits | Dry-run and apply plans are deterministic, transactional, and ownership-safe |
| Diagnose | Understand generator drift, configuration readiness, and recovery actions | `pnpm ready` reports configuration blockers; `doctor` reports structural issues and actionable recommendations |
| Upgrade | Move supported projects forward without replacing product seams | Upgrade is transactional, no-op when current, and tested from supported versions |
| Ship | Follow selection-specific steps from previews to production and stores | Generated production guide and exact package scripts cover every selected target |
| Automate | Consume stable output and releases without scraping terminal prose | JSON remains parseable; successful `main` CI prepares the next patch release |

## Definition of done

A change is complete only when:

1. focused and complete module topologies generate deterministically;
2. generated environment setup is idempotent and readiness checks are truthful;
3. the shared starter feature reaches every selected compatible client;
4. generated code typechecks, tests, builds, and passes runtime acceptance where
   the platform is available;
5. dry-run, JSON, no-op, failure, rollback, and recovery paths are covered;
6. source ownership survives `add`, `ui add`, and `upgrade`;
7. packed npm output behaves the same as repository source;
8. security, dependency, secret, PII, source-hygiene, and release-policy checks
   pass; and
9. documentation describes the behavior that was actually verified.

## Deliberate boundaries

Anhedral does not hide provider accounts, fabricate credentials, submit paid or
review-gated releases, run a proprietary application runtime, or own product
code after generation. Those boundaries keep the output understandable,
portable, and under the developer's control.

# The Zen of Anhedral

Anhedral applies the spirit of Tim Peters' *Zen of Python* to a TypeScript stack
generator. This is an engineering policy, not a preference for Python syntax.
The goal is generated software whose behavior, ownership, and failure modes are
easy to see.

## Working rules

1. **Make the result readable.** Generated source should look like ordinary,
   idiomatic framework code. Prefer clear names and small seams over clever
   abstractions or compressed templates.
2. **Make choices explicit.** Keep requested modules distinct from dependencies
   added by resolution. Record ownership, toolchain, template provenance, and
   planned writes. Never infer permission to replace product code.
3. **Keep one source of truth.** Module identity and kind belong to the
   architecture registry. Project shape belongs to the project model. CLI,
   templates, manifests, and docs consume those definitions instead of
   restating them.
4. **Choose the smallest complete design.** A simple vertical slice is better
   than a generic subsystem. Real provider complexity may be necessary, but it
   must stay behind a narrow, named boundary.
5. **Prefer flat control flow.** Validate early, return early, and dispatch once.
   Split orchestration, domain rules, rendering, filesystem transactions, and
   process execution into distinct namespaces.
6. **Generate sparsely.** A selected stack receives what it needs. Unselected
   apps and providers must not leave dead packages, environment variables,
   scripts, or documentation behind.
7. **Treat rules uniformly.** Add module dependencies and conflicts to the
   registry; do not scatter special-case resolution across commands. Introduce
   an exception only when the practical behavior is clearer and it is covered
   by a regression test.
8. **Never hide failure.** Invalid input, drift, child-process failure, partial
   configuration, and unsafe writes must produce a useful error and nonzero
   status. An intentionally ignored failure must be named, local, and tested.
9. **Do not guess through ambiguity.** Reject unknown commands, conflicting
   edits, unowned collisions, unsafe paths, and unsupported project versions.
   Interactive choices require confirmation; noninteractive behavior must be
   deterministic.
10. **Provide one obvious path.** Use `new` or `init` to create, `add` for
    modules, `ui add` for source-owned UI, `upgrade` for schema evolution, and
    `doctor` for drift. Generated projects use `first-run`, `ready`, `verify`,
    and then `dev`.
11. **Ship deliberate increments.** Finish a small explainable change now when
    its behavior is proven. Defer a broad abstraction until it has a concrete
    caller and an acceptance test.
12. **Make explanation a design test.** If a change cannot be summarized as
    input → decision → observable result, simplify it before merging.

## Namespace boundaries

```text
CLI parsing and presentation
    -> architecture and project model
    -> scaffold orchestration and transactions
    -> templates and configuration composers
    -> generated framework source
```

- `src/architecture/` owns module resolution, plans, manifests, and composition
  invariants.
- `src/project.ts` owns the template-facing project shape.
- `src/scaffold.ts` coordinates lifecycle operations; it must not become the
  source of domain types or embed unrelated templates.
- `src/templates/` renders selected framework and lifecycle files.
- `src/transaction.ts` owns safe application and rollback.
- `src/bin.ts`, `src/cli.ts`, and `src/prompts.ts` own user input and output.

Dependencies point toward the model, not back toward the orchestrator. A
template may depend on `ProjectOptions`; it should not depend on the scaffold
command that called it.

## Review questions

Before merging, answer these plainly:

- Where is the single authoritative definition for this behavior?
- What input is explicit, what is derived, and is that distinction observable?
- Does the happy path read top-to-bottom without hidden mutation?
- What ambiguity or failure can occur, and how does the user see it?
- Does the change add output for an unselected module?
- Can an existing user-owned file be overwritten or silently reclassified?
- Is there a focused test for the rule and a broader test for the journey?
- Can the implementation be explained in a short paragraph?

Practicality still wins: duplicated literal output inside generated framework
code can be clearer than a generator-only abstraction. The burden is on an
abstraction to remove real ambiguity or repetition without hiding behavior.

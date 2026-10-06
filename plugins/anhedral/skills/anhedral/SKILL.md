---
name: anhedral
description: Plan, set up, build, verify, deliver, and operate Anhedral applications, including recommended plugins, infrastructure, developer tools, and account permissions. Use for Anhedral projects or an explicit request to adopt this stack.
---

# Anhedral

Guide the requested development lifecycle. The plugin supplies decisions and setup workflows; the `anhedral` CLI creates the repository foundation. Continue from the project's actual state instead of restarting the lifecycle.

Read [the stack standard](references/application-stack-standard.md) when selecting architecture. Inspect existing source, manifests, instructions, Git state and provider configuration before changes. Preserve existing work and accepted architecture; never run `init` over an existing application.

Establish intended users, interfaces, core workflows, data, budget and observable acceptance criteria. Infer what the project already establishes and ask only for consequential missing choices. Select only necessary apps and services. Default web hosting to Cloudflare Workers + OpenNext; use shared Hono APIs when additional consumers justify them.

When the control-panel tools are available, use `anhedral_open` to show infrastructure, readiness, and delivery status. Register only project folders the user selected; use the intended environment and account. Refresh supported provider checks on request. Credential availability is not authorization proof, and resource existence is not product readiness. Keep credential values server-side; settings accept only non-secret identifiers.

Use [setup](references/setup.md) for plugins, tools, accounts, access, initialization and infrastructure. The versioned [capability registry](references/capabilities.json) defines initializer requirements and remaining starter work. Read selected entries; installed plugins, provider authorization, project SDKs and runtime credentials are separate requirements.

Implement product behavior, authorization and integrations before calling a starter complete. Consult available specialized provider, framework and design skills for their actual scope. Use [delivery](references/delivery.md) for verification, release and operations.

Track selected capabilities in a concise project handoff: environment, account/resource identifiers, state, evidence, next action and owner. States are `planned` (no source generated), `starter`, `configured`, `locally-verified`, `preview-verified`, and `released`; advance only with evidence for that environment. Keep credential values out of the handoff. `anhedral.setup.json` is a generated requirements plan, not readiness evidence.

Discover provider plugins at setup time and offer CLI/API/browser alternatives when unavailable. Never invent an installable plugin, tool, successful grant or deployment. A skills-only plugin supplies guidance, not execution tools; when the ChatGPT surface lacks shell or computer/provider access, provide exact next steps and state the limitation.

Respect existing authorization. Setup is not blanket permission to accept terms, activate paid plans, broaden access, send messages or release production. Prepare concrete reviewable changes before requesting missing authorization; do not ask again for approved actions within scope.

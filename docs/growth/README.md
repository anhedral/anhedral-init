# Anhedral GitHub growth plan

Prepared October 6, 2026. Owner: Anhedral maintainers. These are campaign proposals and drafts; no outreach has been sent.

## Positioning

Lead with **a shadcn/Turborepo initializer for Next.js on Cloudflare**, then show optional application surfaces and services. Target developers already choosing Next.js, shadcn, and Workers, especially small teams and agencies starting new products. Give Codex users a second entry point through the plugin.

The repository should answer, in order: what does this do, why would I use it, how can I try it, what does it generate, and what still needs setup? Use the CLI to demonstrate the value before asking visitors to understand the full delivery standard.

## Baseline and audit

Live GitHub API inspection: 3 stars, 0 forks, description `Anhedral Init`, no topics, and an npm homepage. npm and the latest GitHub release both reported 0.8.3; the local manifest reported 0.8.4. Public search results contained an older README with retired flags, so use the live API and published package for launch claims.

| Finding | Effect | Action |
| --- | --- | --- |
| Generic About description; no topics | Visitors cannot identify the use case from a repository preview | Use the description and topics below |
| Long plugin/setup introduction before a command | Visitors must read too much before trying it | Lead with a focused value statement, dry run, and quick start |
| Broad stack diagram | Explains architecture but does not demonstrate the CLI experience | Keep it after examples; add a real generation recording next |
| No explicit star request | Interested readers have no prompt to support discovery | Add one short, voluntary request after the quick start |
| Provider starters can look like completed integrations | Broad claims risk disappointed users | Show generated files and remaining setup accurately |
| npm version differs from the checkout | Launch copy may describe unavailable behavior | Verify the published version before each campaign |
| No channel attribution baseline | Hard to know which distribution worked | Record launch times, referral traffic, installs, and star changes |

The authenticated `rswearin` account has push/triage permission but lacks admin/maintain permission. The metadata update returned HTTP 404; the description and topics below still need a repository administrator.

The published 0.8.3 default dry run was verified on Node.js 24.14.0 with pnpm 10.34.5.

Proposed About description:

> Create shadcn/Turborepo apps for Cloudflare. Optional Expo, Electron, WXT, Hono, and provider starters. Includes a Codex plugin.

Proposed topics: `nextjs`, `cloudflare-workers`, `shadcn-ui`, `turborepo`, `pnpm`, `typescript`, `cli`, `scaffolding`, `opennext`, `hono`, `expo`, `electron`, `wxt`, `codex`, `mcp`.

Repository admins can add topics directly. The blog's claim that an unaffiliated person must submit a repository to a topic does not match [GitHub's current documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics).

## First 30 days

The working target is 100 relevant stars, starting from 3. This is an experiment target, not a forecast. Prioritize developers who try the tool and return useful feedback.

| Window | Work | Evidence to record |
| --- | --- | --- |
| Days 1–3 | Merge README improvements; set metadata; verify public install; record default generation and local web startup | Published version, exact commands, recording, setup failures |
| Days 4–7 | Publish the first tutorial; share once through owned channels and permitted Cloudflare/Next.js community channels | Referrals, unique repo visitors, new stars, install feedback |
| Days 8–14 | Submit Show HN when a maintainer can respond; prepare a Console review submission; identify relevant curated lists | Submission URLs, questions, accepted listings, channel results |
| Days 15–21 | Publish a walkthrough of adding a Hono API and Neon/Hyperdrive; invite existing users to share examples | Reproducible example, feedback, voluntary user stories |
| Days 22–30 | Publish a Codex plugin walkthrough; share a genuine milestone and lessons; repeat the best-performing content format | Weekly results and next month's priorities |

Before choosing a community, check its current rules and designated project-sharing channels. Curated lists should receive a focused contribution only when the project meets their requirements. Prepare submissions first; maintainers send them from their own accounts.

Show HN should link to the runnable repository, explain the implementation, and make trial easy. [Its guidelines](https://news.ycombinator.com/showhn.html) prohibit asking friends to upvote or comment. Respond to technical questions instead of coordinating votes.

Do not buy stars or trade stars. Avoid scraping stargazer email addresses for unsolicited outreach. Start with useful public content and conversations with developers who have expressed interest. Paid campaigns are a later experiment after an organic channel demonstrates useful traffic and a budget is authorized.

## Content to produce

1. **From shadcn to Cloudflare: a Next.js monorepo with Anhedral.** Show default generation, the generated files, local development, Worker build, and remaining deployment setup. See the draft in [launch-copy.md](launch-copy.md).
2. **Next.js routes or a Hono Worker?** Explain when the shared API is useful and why Anhedral leaves it optional. Include a small working route and contract.
3. **Neon on Workers: where Drizzle and Hyperdrive fit.** Demonstrate migration credentials versus runtime bindings and a real query. Publish after testing the complete example.
4. **Using Codex to inspect application readiness.** Demonstrate plugin installation, project registration, the control panel, and the distinction between local checks and provider verification.

Record an actual 30–60 second demo: command, generated workspace, Next.js startup, and browser output. List the environment and elapsed time without promising the same timing to everyone. Use the existing architecture image for explanation; do not present it as runtime evidence. A social preview should repeat the focused positioning and use a readable screenshot from this demo.

## Measurement

Capture a baseline before publishing, then daily for the first week and weekly afterward. GitHub traffic history is short, so save snapshots. Use [repository traffic](https://docs.github.com/en/rest/metrics/traffic) if maintainer credentials have access; record unavailable data as unavailable.

| Metric | Why it matters |
| --- | --- |
| New stars per week | Primary campaign outcome |
| Unique repository visitors and referring sites | Discovery and channel quality |
| Net star change / unique visitors | Rough conversion indicator; visitors and stargazers are not a matched cohort |
| npm downloads | Supporting installation signal, affected by CI and repeat installs |
| Successful first-run reports and setup failures | Whether attention turns into useful trials |
| Issues, contributions, and returning users | Evidence of interest beyond a star |

Use distinct tracked links on owned content when possible. Log campaign timestamps and avoid simultaneous launches when trying to compare channels. Select next actions from results, not from star count alone.

## Launch gate

Before external promotion, verify the published CLI's documented commands on a supported environment, record a real default generation, and check npm/GitHub version alignment. Have one maintainer available to handle responses and reproducible failures. Keep provider features described as starters until their end-to-end flows are verified.

# Agent-run Anhedral provisioning

Use this checklist after the user asks a coding agent to create or provision an
Anhedral project. Keep one lead agent responsible for the plan, names, secrets,
and final verification.

## 1. Start with user inputs

Before running `anhedral new` or opening a provider dashboard, ask the user:

1. What is the project name? Derive one stable lowercase kebab-case resource
   stem from it and show the proposed value.
2. Do they already own a custom domain for this product? If yes, record the
   exact domain, registrar, current DNS provider, and whether production email
   already uses it. If no, ask for the desired domain and obtain explicit
   approval before any paid purchase.
3. Which surfaces and features do they want? If they want the complete product,
   use every module. Otherwise record explicit modules.
4. Which provider organizations/teams should own Cloudflare, Vercel, GitHub,
   Neon, Clerk, RevenueCat, Ably, Expo, Apple, Google Play, and Chrome Web Store
   resources that apply to the selected modules?
5. Is this development, preview, or production? Never point a preview at live
   users, billing, or production data without explicit direction.

Do not improvise names independently in provider dashboards. Maintain a small
resource ledger containing the project stem, display name, domain, selected
modules, provider team, resource name, hostname, environment, status, and next
user action. Never put credential values in the ledger.

## 2. Discover agent capabilities

Inspect the environment before planning execution:

- If Computer Use or an authenticated browser-control tool is available, use it
  for provider dashboards after the user requests provisioning.
- If subagents are available, keep the lead agent in control and delegate only
  bounded, independent work. Good tasks are reading generated documentation,
  checking current DNS records without changing them, and producing a
  selection-specific environment-variable inventory.
- Do not give subagents passwords, session cookies, secret values, or concurrent
  control of the same browser/profile. Do not let two agents mutate DNS or the
  same provider resource.
- If neither capability exists, use generated CLI commands and give the user
  exact dashboard instructions for the remaining steps.

Recommended subagent sequence:

1. Lead: collect inputs, resolve modules, choose canonical names, and run init.
2. Documentation subagent: read the generated `README.md`, `PRODUCTION.md`, and
   package-local `.env.example` files; return the provider/resource checklist.
3. DNS subagent: perform read-only registrar, nameserver, DNS, and hostname
   collision checks; return existing records that must be preserved.
4. Verification subagent: after provisioning, run read-only domain, health,
   Worker, and configuration checks. The lead performs or approves mutations.

If subagents are unavailable, perform the same phases serially. Their absence is
not a blocker.

## 3. Generate the project

Prefer the skill-guided CLI path:

```sh
pnpm dlx anhedral@latest new <project-name> <explicit-modules...> --toolchain stable
cd <project-name>
```

Omit module arguments only when the user chose the complete stack. Examples:

```sh
pnpm dlx anhedral@latest new acme --web --api --db --auth --toolchain stable
pnpm dlx anhedral@latest new acme desktop electron-updater --toolchain stable
```

Then:

1. Read the generated `README.md` and `PRODUCTION.md` completely.
2. Read `anhedral.json` and confirm the resolved module closure with the user.
3. Copy only package-local environment examples that exist.
4. Run `pnpm dlx anhedral@latest doctor`, `pnpm verify`, and `pnpm build` before
   provisioning. Fix code-generation or build failures before creating cloud
   resources.

## 4. Authentication and secret boundaries

Computer Use may navigate dashboards, fill non-secret settings, create approved
resources, deploy, configure DNS, and verify results. Apply these hard stops:

- Stop at every sign-in, password, passkey, MFA, CAPTCHA, device-approval, or
  provider-consent boundary. Tell the user which provider is requesting access
  and wait for them to complete it. Resume only after they say it is complete.
- Stop immediately before a paid purchase, registrar transfer, destructive
  replacement, production release, store submission, or other consequential
  final confirmation. Show the exact action, target, and cost/impact and obtain
  approval.
- Stop at the final **Create**, **Generate**, **Reveal**, or **Rotate secret**
  action. Tell the user the exact button to click, exact variable name, and exact
  local uncommitted environment file to receive the value. The user must paste
  it directly into that file or the provider's secret field, never into chat.
- Never read a populated `.env` file back into tool output, screenshots, logs,
  the resource ledger, or a subagent message. Validate names and presence with a
  redacting parser or the generated application checks.
- Public identifiers such as publishable keys, project IDs, account IDs, bucket
  names, and hostnames may be recorded where their generated examples expect
  them. Treat any provider value marked secret as secret even if it appears in a
  browser page.

When the user finishes a secret step, ask only for confirmation such as
"`CLERK_SECRET_KEY` is saved in `apps/api/.env`". Do not ask them to repeat the
value. Mirror production secrets into Vercel or another deployment provider by
having the user paste into that provider's protected environment-variable UI,
or by using an approved secret-input flow that never prints the value.

## 5. Domain foundation

Use Cloudflare as authoritative DNS and Vercel as the web/API runtime. A domain
can remain registered at GoDaddy; changing nameservers is not a registrar
transfer.

1. If the user has no domain, use Computer Use to search the approved registrar
   (usually GoDaddy), select the exact domain, and fill registration settings.
   Stop before the paid purchase confirmation. Ask the user to review price,
   renewal terms, registrant, and organization ownership and submit it.
2. Inventory existing DNS before changing nameservers. Preserve MX, TXT, SPF,
   DKIM, DMARC, verification, CAA, and application records. A domain with active
   email requires an explicit preservation review.
3. Add the domain as a Cloudflare zone. Stop for Cloudflare authentication. Copy
   the two assigned authoritative nameservers.
4. At the registrar, replace the authoritative nameservers with Cloudflare's
   exact values. Disable conflicting registrar DNSSEC/DS records first when
   required; wait until Cloudflare reports the zone **Active**, then enable
   DNSSEC in Cloudflare and publish the requested DS record at the registrar.
5. Do not transfer registration unless the user separately requests it. A
   transfer changes billing/registrar ownership and may be subject to locks.

Use distinct hostnames:

```text
app.example.com      Vercel web/API custom domain
assets.example.com   assets-private-proxy Worker Custom Domain
updates.example.com  desktop-updater Worker Custom Domain
```

`app.example.com` is a Vercel project domain whose A/CNAME/TXT records are
managed in Cloudflare DNS. Add the domain to Vercel first, inspect the exact
records Vercel requests, then add those records in Cloudflare. Keep the Vercel
origin record DNS-only unless current Vercel guidance and the user's architecture
explicitly require another topology.

Worker hostnames are Cloudflare **Worker Custom Domains**, not CNAMEs to Vercel
or R2. Configure `custom_domain: true` in the generated Wrangler file and deploy;
Cloudflare creates the DNS record and certificate. Remove any conflicting A,
AAAA, or CNAME record before attaching the Worker hostname.

## 6. Provision selected providers

Follow the generated `PRODUCTION.md`; it is the selection-specific authority.
Use this dependency order so downstream configuration receives real URLs and
public identifiers:

1. **GitHub**: create or select the organization repository, review the initial
   diff, and push. Stop before changing repository visibility or overwriting an
   existing remote.
2. **Neon (`db`)**: create separate development/preview/production projects or
   branches. At connection-string generation, stop and have the user save the
   pooled URL as `DATABASE_URL` in `packages/db/.env`, `apps/api/.env` when
   required, and the protected Vercel API environment.
3. **Clerk (`auth`)**: create development and production instances and configure
   allowed origins, redirect URLs, and native/extension identifiers. Stop at key
   generation/reveal. Put the secret key only in server environments and the
   publishable key in each selected client's documented public variable.
4. **RevenueCat and Ably (`billing`)**: create projects/apps, entitlement,
   products, webhook URL/secret, and Ably API key. Stop at every secret creation.
   Keep RevenueCat secret and Ably API keys server-only; clients receive only
   documented public SDK keys or scoped Ably tokens.
5. **Cloudflare R2 (`storage`)**: run the generated login, bucket, CORS, Worker
   check, and Worker deploy commands. Keep R2 private and `r2.dev` disabled.
   Stop when Cloudflare requests authentication or before creating S3/API token
   secrets; have the user save them under the exact `R2_*` names. Attach
   `assets.<domain>` as the generated Worker Custom Domain.
6. **Vercel (`web`/`api`)**: link/import the root repository, select the generated
   Services configuration, populate Development/Preview/Production variables,
   deploy, then add `app.<domain>`. Inspect Vercel's exact DNS requirements and
   create them in Cloudflare DNS. Verify domain status and TLS after propagation.
7. **Electron updater (`electron-updater`)**: edit both generated
   `updates.example.com` values, set the matching HTTPS origin in
   `apps/desktop/electron-builder.env`, run
   `pnpm desktop:updates:first-provision` exactly once, and verify the private R2 binding plus
   Worker Custom Domain. Build/sign on each native OS and upload artifacts
   before channel metadata with the generated publish command.
8. **Expo/EAS and stores (`mobile`)**: create/link the EAS project, configure
   public build variables and signing credentials, and build internal releases.
   Stop at Apple/Google sign-in, credential, paid membership, agreement, and
   store-submission boundaries.
9. **Chrome Web Store (`extension`)**: configure a stable extension ID, test the
   generated ZIP as trusted/unlisted, and complete listing/privacy fields. Stop
   before developer registration payment and final store submission.

Create strong `CRON_SECRET` and webhook secrets through a password manager or a
local non-logging generator. The user places them directly into server and
deployment environments.

## 7. Verify and hand off

After configuration:

1. Run `pnpm verify`, `pnpm build`, and `anhedral doctor`.
2. Verify Vercel deployment health, custom-domain status, DNS answers, and TLS.
3. Verify every selected Worker accepts its intended GET/HEAD behavior, rejects
   forbidden methods/hosts, and cannot expose or list the private bucket.
4. Verify database migration status, auth redirect/sign-out, billing webhook and
   entitlement refresh, storage upload/read policy, and scheduled jobs as
   selected.
5. Record resource names, URLs, provider teams, and remaining manual approvals.
   Record no secrets.
6. Stop before production/store release and give the user a concise checklist of
   the exact final buttons or approvals still required.

Do not claim completion while a dashboard is merely open, DNS is still pending,
TLS is unissued, an environment value is absent, or verification has not run.

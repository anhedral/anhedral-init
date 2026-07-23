# Agent-run Anhedral provisioning

Use this checklist after the user asks a coding agent to create or provision an
Anhedral project. Keep one lead agent responsible for the plan, names, secrets,
and final verification.

## Contents

1. Start with user inputs
2. Bootstrap a workstation from zero
3. Resolve accounts, CLIs, and unavoidable browser work
4. Discover agent capabilities
5. Generate and verify the local project
6. Authentication and secret boundaries
7. Domain foundation
8. Provision selected providers
9. Verify and hand off

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

## 2. Bootstrap a workstation from zero

Inspect before installing anything:

```sh
node --version
npm --version
pnpm --version
git --version
```

Use the current Node.js 24 LTS release for a new Anhedral workstation. It
satisfies the generator and the stricter Expo/mobile engine range. If Node.js is
missing, open `https://nodejs.org/en/download` with Computer Use, choose Node.js
24 LTS for the user's OS and architecture, and stop while the user runs the
installer and approves administrator or operating-system prompts.

npm arrives with Node.js. It can bootstrap pnpm, but it must not replace pnpm
inside the generated workspace. Install the exact package-manager version
declared by the Anhedral package:

```sh
npm install --global pnpm@10.34.5
```

Ask before global installation. If Git is absent, install it with the official
installer or applicable OS package manager. Common interactive boundaries are:

- macOS: `xcode-select --install` opens the Command Line Tools installer.
- Windows: `winget install --id Git.Git -e` may raise UAC and installer prompts.
- Debian/Ubuntu: `sudo apt-get install git` requires the user's administrator
  approval.

Ask which real name and email the user wants before configuring Git identity.
Do not invent or copy an account identity:

```sh
git config --global user.name "<confirmed name>"
git config --global user.email "<confirmed email>"
```

Re-run the four version checks. A browser is also required for OAuth device
flows, passkeys, MFA, CAPTCHA, terms, payments, dashboards, and store consoles.

The generated project uses transient, pinned CLIs through `pnpm dlx`; do not
globally install Anhedral, Vercel CLI, Neon CLI, Wrangler, EAS CLI, shadcn, or
WXT. npm can launch Anhedral with `npx`, but the resulting monorepo and all
documented lifecycle commands still require pnpm. Downloading the public
Anhedral package requires no npm account or `npm login`. No Anhedral module
requires Docker or a local Postgres installation.

Conditional local tools:

- GitHub CLI (`gh`) is recommended for repository creation and Git credential
  setup, but Git plus the GitHub website also works.
- Clerk CLI and Ably CLI are optional management clients. They are not generated
  dependencies. Record the exact version if using them and never run
  `clerk init` over Anhedral's existing integration source.
- EAS cloud builds need no local Xcode, Android Studio, Ruby, CocoaPods, or JDK.
  Install Xcode only for local iOS builds/manual Apple upload; install Android
  Studio and a JDK only for local Android builds or emulator work.
- Build Electron artifacts on their target OS. macOS signing/notarization needs
  Xcode tooling; Windows signing needs a Windows runner and an
  organization-owned certificate.
- Use Chrome or another Chromium browser to load and test an unpacked extension.

## 3. Resolve accounts, CLIs, and unavoidable browser work

Create accounts only for selected modules. Prefer organization-owned teams,
enable MFA, name at least two recovery owners for production, and record billing
ownership without recording credentials.

| Provider/account | Required when | CLI-covered work | Browser, Computer Use, or user-only work |
| --- | --- | --- | --- |
| GitHub | Recommended for every production project; required for the normal Git-triggered Vercel flow | `gh auth login`, repository creation, remote setup, push, environment/repository APIs | Account/org creation, SSO authorization, billing, visibility policy, branch-protection review |
| Vercel | `web` or `api` deployment | Generated link, preview, production, inspect, domain-inspect commands; environment variables are also supported by Vercel CLI | Account/team creation, GitHub OAuth import, selecting the Services framework preset, plan/billing, some domain and environment review |
| Neon | `db` directly or through `auth`, `billing`, or `storage` | Generated OAuth login and project creation; Neon CLI/API can manage branches and projects | Account/org creation, plan/billing, one-time safe placement of pooled connection strings, backup/restore policy review |
| Clerk | `auth` directly or through dependent features | Supplemental Clerk CLI can log in, create/link apps, manage config, inspect deployment status, and call Clerk APIs | Workspace/team/billing, social-provider OAuth apps and consent, branding/security controls, DNS review, secret handling, physical-device verification |
| RevenueCat | `billing` or `native-subscriptions` | Developer API v2 can create projects, apps, products, entitlements, offerings, and webhooks after a secret key exists | Initial account/key bootstrap in the normal path, store credential connection, Test Store/dashboard setup, plan/billing, purchase/paywall review |
| Ably | `billing` | Supplemental Ably CLI can log in, create apps, configure rules, and create keys | Account/team/billing and safe one-time API-key handling |
| Stripe | Only if the user explicitly chooses web subscriptions through RevenueCat Billing or a manual Stripe integration | Stripe CLI can log in, test webhooks, and manage supported resources | Business activation, identity/KYC, bank/tax details, terms, live-mode review; generated Anhedral billing contains no Stripe checkout or webhook |
| Cloudflare | `storage`, `electron-updater`, or Cloudflare-authoritative DNS | Generated Wrangler login, R2 bucket/CORS commands, Worker checks/deploys, custom domains, and direct lifecycle commands | Account/zone creation, R2 purchase/enablement, domain purchase or registrar delegation, DNS/email preservation, one-time S3 key reveal, plan/billing |
| Expo/EAS | `mobile` cloud build or distribution | Generated login, project init, builds, credential flows, and submissions | Expo account/team/billing and user participation in Apple/Google credential prompts |
| Apple Developer + App Store Connect | iOS store release, iOS device signing, or signed/notarized macOS distribution | EAS can create/manage many signing assets and upload builds; Apple tools can notarize desktop builds | Paid membership, legal agreements, tax/banking, role grants, app record/metadata/privacy, TestFlight groups, final review/release decisions |
| Google Play Console | Android store release | EAS builds/submits after a service account is connected | Developer registration/payment, app creation, policy/data-safety/content declarations, service-account authorization, testing/release controls |
| Chrome Web Store | Public/trusted distribution of `extension` | Generated WXT verification and ZIP creation; Web Store APIs can automate later uploads after OAuth setup | Developer registration fee, contact verification, first listing, screenshots/privacy/permission declarations, reviewer instructions, final submission |
| Domain registrar | Custom production domain; mandatory for generated Worker custom domains | Registrar-specific APIs may exist but are not an Anhedral dependency | Search/purchase, registrant data, payment, renewal, transfer locks, nameserver/DNSSEC changes and destructive confirmations |
| Certificate authority | Public Windows desktop distribution | Signing can run in target-OS CI after credentials are installed | Organization validation, certificate purchase/issuance, hardware/cloud key custody, renewal |

RevenueCat's Test Store supports development purchases without Apple, Google, or
Stripe accounts. Native production purchases require the relevant app-store
accounts. The generated `billing` module supplies entitlement reconciliation,
webhook handling, Neon state, and Ably invalidation; it does not generate a web
checkout. Record that distinction in the project ledger before provisioning.

## 4. Discover agent capabilities

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

## 5. Generate and verify the local project

If the user wants the coding-agent workflow and the skill is not installed,
install it after pnpm is available:

```sh
pnpm dlx skills add https://github.com/anhedral/anhedral-init --skill anhedral-init
```

The user must install and authenticate their chosen compatible coding-agent
application separately. Anhedral also works without an agent. Prefer this
explicit CLI path for generation:

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

1. Read `anhedral.json`, the root `package.json`, the generated `SKILL.md`,
   `README.md`, `PRODUCTION.md`, and every selected package's `.env.example`.
   Confirm the resolved module closure, account matrix, generated CLI scripts,
   and environment inventory with the user.
2. If modules were added to an existing project, remember that user-owned
   `README.md` and `PRODUCTION.md` are not regenerated. Reconcile them against
   `anhedral.json`, root scripts, managed `SKILL.md`, and environment examples
   before treating them as current.
3. Run `pnpm first-run`; it creates only missing package-local environment
   files and never replaces existing configuration.
4. Run `pnpm ready` and record the missing variable names by provider. Failure
   is expected before provisioning; never fill placeholders merely to make it
   pass.
5. Run `pnpm typecheck` and `pnpm anhedral:doctor`. Run provider-independent
   package checks that can succeed without credentials. Fix generator,
   installation, or type failures before creating cloud resources.
6. Create the organization-owned Git remote before Vercel import. With GitHub
   CLI installed, authenticate with `gh auth login`, confirm the intended
   account with `gh auth status`, then use `gh repo create` only after the user
   chooses the owner and visibility. Review the initial commit and push.
7. Provision development resources first using the next sections. Put real
   values directly into uncommitted package-local environment files. Generate
   and review the initial database migration, run `pnpm ready`, `pnpm verify`,
   `pnpm build`, and only then start `pnpm dev`.
8. Deploy and validate a preview before creating or connecting production
   resources. Keep development, preview, and production identities, databases,
   webhooks, keys, and billing data isolated.

## 6. Authentication and secret boundaries

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

Use this control sequence whenever a CLI opens a browser:

1. Run the selected generated login command and state which account/team it must
   authorize.
2. Yield control at the browser's sign-in, passkey, MFA, CAPTCHA, SSO, consent,
   or device-code confirmation.
3. After the user confirms completion, resume in the terminal and run the
   provider's identity/status command or a read-only list operation.
4. If the CLI cannot configure the remaining setting, open the exact dashboard
   page with Computer Use, narrate the non-secret fields being changed, and
   stop at any consequential final button.
5. Return to the CLI or a read-only browser view to verify the saved state. A
   successful click is not verification.

Classify every remaining action accurately:

- **CLI-covered:** safe to automate after authentication and approval.
- **API-capable but not generated:** use only with explicit approval, a pinned
  client/version, and a redacting secret flow.
- **Computer Use:** dashboard setup with no suitable generated command.
- **User-only:** credentials, MFA, CAPTCHA, payments, legal agreements, secret
  reveal/copy, and final production/store decisions.

When the user finishes a secret step, ask only for confirmation such as
"`CLERK_SECRET_KEY` is saved in `apps/api/.env`". Do not ask them to repeat the
value. Mirror production secrets into Vercel or another deployment provider by
having the user paste into that provider's protected environment-variable UI,
or by using an approved secret-input flow that never prints the value.

## 7. Domain foundation

Use Cloudflare as authoritative DNS when `storage` or `electron-updater` is
selected because the generated Workers require custom domains in an active
Cloudflare zone. For web/API-only projects, retain the user's chosen DNS
provider and create only the records Vercel reports. A domain can remain with
its current registrar; changing nameservers is not a registrar transfer.

1. If the user has no domain, use Computer Use to search the approved registrar,
   select the exact domain, and fill registration settings.
   Stop before the paid purchase confirmation. Ask the user to review price,
   renewal terms, registrant, and organization ownership and submit it.
2. Inventory existing DNS before changing nameservers. Preserve MX, TXT, SPF,
   DKIM, DMARC, verification, CAA, and application records. A domain with active
   email requires an explicit preservation review.
3. When Cloudflare is required, add the domain as a Cloudflare zone. Stop for
   Cloudflare authentication, account selection, plan choice, and any purchase.
   Copy the two assigned authoritative nameservers.
4. At the registrar, use Computer Use to replace the authoritative nameservers
   with Cloudflare's exact values. Disable conflicting registrar DNSSEC/DS
   records first when required; wait until Cloudflare reports the zone
   **Active**, then enable DNSSEC in Cloudflare and publish the requested DS
   record at the registrar. Nameserver and DS changes are destructive DNS
   mutations: inventory and preserve email records first, obtain approval, and
   verify authoritative answers afterward.
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

## 8. Provision selected providers

For a newly generated project, use `PRODUCTION.md` together with
`anhedral.json`, root scripts, and package-local environment examples. After
`anhedral add`, the user-owned README and production guide may be stale; the
manifest, managed skill, scripts, and environment examples determine the actual
provider set.

Use this dependency order so downstream configuration receives real URLs and
public identifiers:

1. **GitHub and source control**

   - CLI: install GitHub CLI if selected, run `gh auth login`, stop at browser
     authorization, and verify the intended identity with `gh auth status`.
     Create the repository only after the user chooses the organization and
     visibility. Review the remote before pushing; never overwrite an existing
     remote or history.
   - Computer Use: create or select the organization, authorize SSO/GitHub App
     access, review repository visibility, configure protected environments and
     branch rules, and enable required checks.
   - User-only: organization billing, SSO/MFA, visibility policy, destructive
     repository replacement, and final access grants.

2. **Neon (`db`, including dependency-added database)**

   - CLI: run `pnpm neon:login`; Neon opens an OAuth flow. After the user
     authorizes it, run `pnpm neon:project:create --name <canonical-name>` for
     the first environment. Use the pinned Neon CLI recorded in
     `anhedral.json` for additional project/branch commands.
   - Create isolated development, preview, and production projects or branches.
     Prefer pooled connection strings for serverless Vercel traffic.
   - Computer Use/user-only: account and organization creation, plan/billing,
     backup/restore policy, IP restrictions, and the one-time safe placement of
     each connection string. The user saves `DATABASE_URL` directly in
     `packages/db/.env`, `apps/api/.env` when present, and protected deployment
     environments without pasting it into chat.
   - Local gate: run `pnpm db:generate`, inspect and commit the SQL and metadata,
     run `pnpm verify:db`, then run `pnpm db:migrate` against the intended
     development database. Never generate migrations in the deployment build.

3. **Clerk (`auth`)**

   - CLI/API-capable: the supplemental Clerk CLI can run `clerk auth login`,
     `clerk apps create`, `clerk link`, `clerk config pull/patch`,
     `clerk deploy`, `clerk deploy status`, and `clerk api`. Run it through a
     recorded version and do not run `clerk init`, because Anhedral already
     generated the SDK integration. Stop at its browser authorization.
   - Create development and production instances. Put `CLERK_SECRET_KEY` only
     in API/server environments. Put the publishable key into each selected
     client's exact public variable.
   - Computer Use: configure the root domain, DNS records, subdomain allowlist,
     authorized parties, production OAuth applications, redirect URLs,
     webhooks, email settings, native bundle/package identifiers, and extension
     sync host/CRX ID when selected. Clerk workspace membership, billing,
     analytics/logs, branding, and Protect settings remain dashboard work.
   - User-only: social-provider OAuth consent/credentials, passkeys/MFA, secret
     reveal/copy, and the final certificate/deployment confirmation. Verify the
     production instance with `clerk deploy status` or a read-only dashboard
     view and test on physical devices where applicable.

4. **RevenueCat and Ably (`billing`/`native-subscriptions`)**

   - Start development with RevenueCat's Test Store. It needs no Apple, Google,
     or Stripe account. Create the project, Test Store products, entitlement
     whose lookup key exactly matches `RC_ENTITLEMENT_ID`, current offering, and
     packages. Add platform apps only for selected purchase surfaces.
   - RevenueCat API v2 can automate projects, apps, products, entitlements,
     offerings, package/product attachments, and webhook integrations after a
     secret key exists. The normal blank-account path still requires dashboard
     signup and safe secret-key creation. Put `RC_SECRET_API_KEY` server-side and
     platform public keys only in their documented `EXPO_PUBLIC_RC_*` variables.
   - Configure the RevenueCat webhook only after an HTTPS preview API exists:
     `https://<preview-or-domain>/api/webhooks/revenuecat`. The user creates a
     high-entropy authorization value and places the same value in RevenueCat's
     Authorization header and the server's `RC_WEBHOOK_SECRET`; never expose it
     to the agent.
   - Supplemental Ably CLI: authenticate with `ably login`, verify the account,
     create/select an app with `ably apps create`/`ably apps switch`, and create
     the least-privilege server key with `ably auth keys create`. Because key
     creation can print a credential, the user must run or complete that step
     privately and save `ABLY_API_KEY` directly in server environments.
   - The generated API issues scoped per-user Ably tokens; do not put a root
     Ably key in clients. Set `CRON_SECRET` and verify the authenticated
     realtime outbox flush schedule.
   - Stripe is not required for Test Store or native store purchases. If the
     user chooses RevenueCat Billing or manual Stripe web subscriptions, stop
     and scope a separate implementation: account activation/KYC, products and
     prices, Checkout/Customer Portal, webhook verification, tax, refunds, and
     RevenueCat mapping are not generated by Anhedral.

5. **Cloudflare zone and R2 (`storage`)**

   - Computer Use/user-only prerequisite: create/select the Cloudflare account
     and active DNS zone, complete R2 purchase/enablement if requested, preserve
     existing DNS/email records, and finish nameserver/DNSSEC changes. Wrangler
     cannot replace registrar payment, registrant, or account-recovery work.
   - CLI: run `pnpm r2:login`, stop at OAuth, verify the account, then run
     `pnpm r2:bucket:create`, `pnpm r2:cors:list`, edit the complete user-owned
     CORS template, and run `pnpm r2:cors:set`. The set operation replaces the
     entire policy, so retain all approved origins.
   - Computer Use/user-only secret step: in R2, create an Object Read & Write S3
     token scoped to the selected bucket. The user clicks the final create
     button and privately stores the one-time Access Key ID and Secret Access
     Key under the exact `R2_*` variables. R2 must be enabled before these
     credentials can be generated.
   - Replace `assets.example.com` in the generated Wrangler file with the real
     hostname. Run `pnpm assets:proxy:check` and
     `pnpm assets:proxy:deploy`; Wrangler creates the Worker binding, managed
     DNS record, TLS certificate, and Worker Custom Domain.
   - Lifecycle rules are CLI-capable but currently have no generated root
     wrapper. Using the exact Wrangler version in `anhedral.json`, add and list
     a rule for `storage/staging/` whose expiration exceeds the application
     cleanup grace period. Treat any lifecycle replacement as destructive and
     preview/list existing rules first.

     ```sh
     pnpm dlx wrangler@<recorded-version> r2 bucket lifecycle list <bucket>
     pnpm dlx wrangler@<recorded-version> r2 bucket lifecycle add <bucket> staging-cleanup storage/staging/ --expire-days 1
     pnpm dlx wrangler@<recorded-version> r2 bucket lifecycle list <bucket>
     ```

6. **Vercel (`web`/`api`)**

   - CLI: run `pnpm deploy:vercel:link`; stop at OAuth/device authorization and
     explicitly confirm the team/project. Generated commands then cover preview,
     production, inspection, and domain inspection.
   - Computer Use: import/connect the GitHub repository for automatic preview
     deployments, keep the repository root, and select the **Services**
     framework preset. A `services` block in `vercel.json` is not sufficient
     unless the project setting is also Services.
   - Add Development, Preview, and Production environment values in protected
     fields. Vercel CLI supports environment management, but use an interactive
     secret-input flow or dashboard so values never appear in agent output.
     Keep server-only values out of public-prefixed variables.
   - Deploy Preview first. Verify `/api/health`, `/api/ready`, web routing,
     authentication, migrations, scheduled endpoints, and provider callbacks.
     Add `app.<domain>` only after preview is healthy, inspect the exact
     A/CNAME/TXT requirements, create those records at the authoritative DNS
     provider, and verify DNS plus TLS. Keep Vercel records DNS-only when
     Cloudflare is authoritative.
   - User-only: team billing, GitHub OAuth/SSO consent, production promotion,
     domain-conflict takeover, and destructive environment replacement.

7. **Complete URL-dependent provider configuration**

   After the preview URL and production hostname exist, return to Clerk,
   RevenueCat, CORS, OAuth providers, and store consoles. Replace temporary
   callback/origin values with exact HTTPS URLs, configure separate preview and
   production webhooks, redeploy public-key changes, and verify delivery logs.

8. **Electron updater (`electron-updater`)**

   - Replace both `updates.example.com` values, set the identical HTTPS origin
     in `apps/desktop/electron-builder.env`, run the generated Cloudflare login,
     and run `pnpm desktop:updates:first-provision` exactly once. Later deploys
     use `pnpm desktop:updates:worker:deploy`.
   - Wrangler covers the private bucket, Worker binding, custom domain, DNS, and
     TLS after the Cloudflare zone exists. Cloudflare account/R2 activation and
     registrar work retain the same Computer Use/user stops described above.
   - Build and sign on each target OS. Apple Developer enrollment, notarization
     agreements/credentials, Windows certificate purchase and organization
     validation, hardware/cloud key custody, and CI secret entry require the
     user or provider UI.
   - Upload signed immutable installers and blockmaps before mutable channel
     metadata with `pnpm desktop:updates:publish`. Test upgrade and rollback from
     a previously installed signed release.

9. **Expo/EAS and stores (`mobile`)**

   - CLI: run `pnpm mobile:eas:login`, stop for Expo authentication, verify the
     account/team, then run `pnpm mobile:eas:init`. Commit the EAS project ID and
     configuration. Build internal iOS/Android artifacts with the generated
     preview scripts before store builds.
   - EAS can generate/manage signing credentials and cloud builds. The user must
     participate in Apple/Google credential prompts; never relay passwords,
     MFA, private keys, service-account JSON, or signing certificates through
     chat.
   - Computer Use/user-only for Apple: enroll in the paid Developer Program,
     accept legal agreements, configure tax/banking and roles, create the App
     Store Connect app record and bundle ID, complete metadata/privacy/export
     compliance, manage TestFlight groups, and make final review/release choices.
   - Computer Use/user-only for Google: register/pay for Play Console, create the
     app/package, complete policy/data-safety/content declarations, create and
     authorize the service account, configure testers/tracks, and make final
     rollout choices. EAS CLI can upload the service-account key privately and
     submit builds; use the current Expo guidance for whether the first release
     still needs a console step.
   - Run generated production build and submit commands only after internal
     device testing. TestFlight processing/review and Play review/rollout are
     external asynchronous gates, not successful CLI completion.

10. **Chrome Web Store (`extension`)**

    - CLI: run `pnpm verify:extension` and `pnpm extension:zip`, then load the
      unpacked production output in Chrome and test permissions, auth, API calls,
      service-worker wakeup, and sign-out.
    - Computer Use/user-only: register the developer account, verify the contact
      email, accept the agreement, pay the fee, create the first item, upload the
      ZIP, fill listing/screenshots/category/regions, justify permissions,
      complete privacy/limited-use declarations, provide reviewer instructions,
      and submit.
    - Publish first to trusted testers or unlisted visibility. Capture the stable
      store-assigned CRX ID, reconcile Clerk and backend allowlists, rebuild if
      needed, and test the store-installed artifact before production review.

11. **Desktop distribution without updater**

    Build platform-specific artifacts on macOS, Windows, and Linux runners.
    Computer Use/user involvement remains necessary for Apple Developer and
    notarization enrollment, Windows certificate purchase/validation, OS
    trust prompts, and distribution-channel listing or final release. An
    unsigned local package is not equivalent to a production-ready desktop
    release.

Create strong `CRON_SECRET` and webhook secrets through a password manager or a
local non-logging generator. The user places them directly into server and
deployment environments.

## 9. Verify and hand off

Track these end-to-end completion gates:

1. **Workstation ready:** supported Node.js, exact pnpm, npm, Git, browser, and
   only the selected native tools are present; real Git identity is confirmed.
2. **Generated safely:** modules and dependency closure are confirmed,
   installation completed, `anhedral.json` is healthy, environment files are
   uncommitted, and no provider was created under the wrong personal/team
   account.
3. **Development ready:** development provider values are present, `pnpm ready`
   succeeds, reviewed database migrations are committed/applied,
   `pnpm verify`, `pnpm build`, and `pnpm anhedral:doctor` succeed, and the
   generated starter feature works end to end through a signed-in user.
4. **Preview ready:** Git-triggered or manual Vercel preview is healthy;
   `/api/health` and `/api/ready` pass; preview auth, database, webhooks,
   scheduled jobs, CORS, Workers, and selected client API URLs use isolated
   preview resources.
5. **Production infrastructure ready:** provider teams and billing owners are
   correct, production secrets are protected, migration state is current,
   custom-domain DNS resolves, TLS is issued, Clerk certificates/auth work,
   Workers have correct bindings/domains, and logs show successful health and
   callback probes.
6. **Distribution ready:** internal EAS/TestFlight/Play builds, trusted Chrome
   Web Store artifact, and signed desktop installers/updater are tested as
   selected. Store metadata, privacy declarations, reviewer credentials, tax
   and legal agreements, signing/notarization, rollback, and staged rollout are
   complete.
7. **Handoff ready:** record resource names, public IDs, URLs, teams, owners,
   renewal/recovery responsibilities, runbooks, and remaining external review
   statuses. Record no secrets. Give the user the exact final buttons or
   approvals still pending.

Do not claim completion while a dashboard is merely open, DNS is still pending,
TLS is unissued, an environment value is absent, or verification has not run.
Likewise, a successful CLI upload is not an approved store release, a Vercel
deployment URL is not a healthy application, and a generated project is not a
provisioned product.

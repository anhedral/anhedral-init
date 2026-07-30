# Anhedral CLI reference

This page is the complete command-line reference for the Anhedral generator.
It documents every public command, product selector, option, default,
compatibility rule, and CLI environment variable supported by this release.

Run Anhedral directly after installing it, or execute the published package
without a global installation:

```sh
pnpm dlx anhedral@latest <command>
```

## Commands at a glance

```text
anhedral new <directory> [products...|--all] [options]
anhedral init [products...|--all] [options]
anhedral add <product...|--all> [options]
anhedral ui add <component...> [options]
anhedral upgrade [options]
anhedral doctor [options]
anhedral setup-vps [options]
anhedral --version [--json]
anhedral --help [--json]
```

`-h` is an alias for `--help`, and `-v` is an alias for `--version`. A
recognized command followed by `--help` or `-h` prints the complete built-in
usage text without executing that command.

## Product selectors

`new`, `init`, and `add` accept a product as either a positional value or a
flag. These two commands are equivalent:

```sh
anhedral add r2 cloudflare-workflows
anhedral add --r2 --cloudflare-workflows
```

Application products:

| Product | Flag | What it selects | Dependencies added automatically |
| --- | --- | --- | --- |
| `next` | `--next` | Next.js App Router web application | None |
| `expo` | `--expo` | Expo Router application for iOS, Android, and web | None |
| `admin-page` | `--admin-page` | `(admin)` route group in the main Next.js application | Next.js, Auth.js, Fastify, and Neon/Drizzle |
| `admin-app` | `--admin-app` | Separately deployable Next.js admin application | Next.js, Auth.js, Fastify, and Neon/Drizzle |
| `fastify` | `--fastify` | Fastify HTTP API | None |
| `electron` | `--electron` | Electron desktop application | None |
| `wxt` | `--wxt` | WXT browser extension | None |

Service products:

| Product | Flag | What it selects | Dependencies added automatically |
| --- | --- | --- | --- |
| `neon` | `--neon` | Neon Postgres with Drizzle ORM | None |
| `clerk` | `--clerk` | Clerk identity and sessions | Fastify and Neon/Drizzle |
| `authjs` | `--authjs` | Database-backed Auth.js credentials and secure sessions | Fastify and the database module; `next` must also be selected |
| `ably` | `--ably` | Authenticated Ably Pub/Sub | Clerk, Fastify, and Neon/Drizzle |
| `revenuecat` | `--revenuecat` | RevenueCat subscription authority with Stripe checkout integration | Ably and its dependencies |
| `r2` | `--r2` | Private Cloudflare R2 object storage | Clerk and its dependencies |
| `cloudflare-workflows` | `--cloudflare-workflows` | Cloudflare durable workflows and authenticated control API | None |
| `revenuecat-native` | `--revenuecat-native` | RevenueCat native subscription client | Expo, RevenueCat, and their dependencies |
| `electron-updater` | `--electron-updater` | Private Electron update channel through R2 and a Worker | Electron |

Infrastructure products are always opt-in:

| Product | Flag | What it selects | Dependencies added automatically |
| --- | --- | --- | --- |
| `ubuntu` | `--ubuntu` | Ubuntu VPS review plan and idempotent host bootstrap | None |
| `docker` | `--docker` | Docker Engine and Compose on Ubuntu | Ubuntu |
| `postgres` | `--postgres` | Self-hosted PostgreSQL deployment | Drizzle database package, Docker, and Ubuntu |
| `nginx` | `--nginx` | Nginx reverse proxy deployed with Docker | Docker and Ubuntu |
| `certbot` | `--certbot` | Certbot and Let's Encrypt TLS lifecycle | Nginx, Docker, and Ubuntu |

Dependency additions are shown in interactive selection and structured plans.
Anhedral records the resolved modules in `anhedral.json`.

Pre-1.0 role names remain accepted as compatibility aliases in positional or
flag form, but new commands and documentation should use product names:

| Compatibility alias | Current product |
| --- | --- |
| `web` | `next` |
| `mobile` | `expo` |
| `admin` | `admin-page` |
| `api` | `fastify` |
| `desktop` | `electron` |
| `extension` | `wxt` |
| `db` | `neon` |
| `auth` | `clerk` |
| `realtime` | `ably` |
| `billing` | `revenuecat` |
| `storage` | `r2` |
| `workflows` | `cloudflare-workflows` |
| `native-subscriptions` | `revenuecat-native` |

The infrastructure role names and `electron-updater` are already identical to
their current product names.

### Selection defaults

- `--all` selects every default application and service product. It does not
  select admin or infrastructure products.
- The current `--all` set is `next`, `expo`, `fastify`, `electron`, `wxt`,
  `neon`, `clerk`, `ably`, `revenuecat`, `r2`, `cloudflare-workflows`,
  `revenuecat-native`, and `electron-updater`.
- In an interactive terminal, `new` and `init` with no product selectors open
  the categorized selection prompts.
- In a noninteractive environment, `new` and `init` with no product selectors
  retain the complete default stack for compatibility. Pass explicit products
  in automation so the intended topology is unambiguous.
- `add` always requires at least one product or `--all`.

### Compatibility and exclusivity

- `--clerk` and `--authjs` are mutually exclusive.
- `--admin-page` and `--admin-app` are mutually exclusive.
- Both admin modes currently require Auth.js. Selecting an admin mode without
  an explicit auth provider selects Auth.js automatically; combining an admin
  mode with Clerk is rejected.
- Auth.js requires Next.js, Fastify, and the database module.
- Auth.js currently cannot be combined with Expo, Electron, WXT, Ably,
  RevenueCat, R2, native subscriptions, or Electron updates. The CLI reports
  the incompatible resolved modules and recommends Clerk.
- Cloudflare Workflows can be selected with either authentication provider
  because it does not depend on the application auth module.
- TypeScript is required throughout every generated application and package;
  it is not a selectable language option.

## Options matrix

| Option | `new` | `init` | `add` | `ui add` | `upgrade` | `doctor` | `setup-vps` |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Product values or `--<product>` | Yes | Yes | Yes | No | No | No | No |
| `--all` | Yes | Yes | Yes | No | No | No | No |
| `--ui <components>` | Yes | Yes | No | No | No | No | No |
| `--native-styling <nativewind\|uniwind>` | Yes | Yes | No | No | No | No | No |
| `--toolchain <stable\|latest>` | Yes | Yes | Yes | No | No | No | No |
| `--skip-install` | Yes | Yes | Yes | Yes | Yes | No | No |
| `--git` | No | Yes | No | No | No | No | No |
| `--no-git` | Yes | No | No | No | No | No | No |
| `--target <client>` | No | No | No | Yes | No | No | No |
| `--check` | No | No | No | No | No | No | Yes |
| `--dry-run` | Yes | Yes | Yes | Yes | Yes | No | No |
| `--json` | Yes | Yes | Yes | Yes | Yes | Yes | No |
| `--verbose` | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `--help`, `-h` | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

Options that take a value accept both `--option value` and `--option=value`.
Repeatable selectors and component or target lists are deduplicated.

### Shared option behavior

`--dry-run`

: Builds and prints the structural plan without writing the destination.
  `ui add --dry-run` also prints the provider command that would run.

`--json`

: Emits stable machine-readable plans, reports, help, versions, and errors.
  Errors are written to standard error as an object with `error` and `code`
  fields. `setup-vps` does not support JSON output because it streams the host
  bootstrap directly.

`--verbose`

: Streams child-process diagnostics that are hidden during normal operation.

`--skip-install`

: Generates or updates files without running the package installation step.
  The generated workspace can be installed later with `pnpm install`.

`--toolchain stable`

: Uses the generator's reviewed dependency versions. This is the default.

`--toolchain latest`

: Resolves the latest supported package versions. This is useful for explicit
  compatibility testing and may produce a different dependency graph over
  time.

`--help`, `-h`

: Prints the full built-in usage page and exits without running the command.
  Use `--json` with help to receive `{ "usage": "..." }`.

## `anhedral new`

Creates a workspace in a new destination directory.

```text
anhedral new <directory> [products...|--all]
  [--ui <components>]
  [--native-styling <nativewind|uniwind>]
  [--toolchain <stable|latest>]
  [--skip-install] [--no-git] [--dry-run] [--json] [--verbose]
```

The destination must be the first argument. Anhedral derives the package name
and display name from that directory. Git is initialized when available unless
`--no-git` is passed.

Creation-only options:

- `--ui <components>` adds starter UI components while scaffolding. Supply a
  comma-separated value or a quoted space-separated value, such as
  `--ui button,dialog` or `--ui "button dialog"`.
- `--native-styling nativewind` selects NativeWind for Expo. This is the
  default.
- `--native-styling uniwind` selects Uniwind for Expo.
- `--no-git` prevents automatic Git initialization.

Examples:

```sh
anhedral new my-product --next --fastify --neon --clerk
anhedral new my-product --next --fastify --neon --authjs --admin-page
anhedral new my-product --next --fastify --neon --authjs --admin-app
anhedral new my-mobile-app --expo --native-styling uniwind
anhedral new my-product --next --ui button,dialog --skip-install
anhedral new my-vps-app --next --fastify --postgres --nginx --certbot
anhedral new my-product --all --toolchain latest --dry-run --json
```

## `anhedral init`

Creates the same workspace in the current empty directory.

```text
anhedral init [products...|--all]
  [--ui <components>]
  [--native-styling <nativewind|uniwind>]
  [--toolchain <stable|latest>]
  [--skip-install] [--git] [--dry-run] [--json] [--verbose]
```

`init` preserves the current directory's repository state by default. Pass
`--git` to initialize Git when the directory is not already a repository.
`--ui` and `--native-styling` behave exactly as they do for `new`.

```sh
mkdir my-product
cd my-product
anhedral init --next --fastify --neon --clerk --git
```

## `anhedral add`

Adds missing products and their dependencies to an existing Anhedral workspace
using the manifest's ownership records.

```text
anhedral add <product...|--all>
  [--toolchain <stable|latest>]
  [--skip-install] [--dry-run] [--json] [--verbose]
```

The operation is transactional and refuses to overwrite modified managed
files. It preserves user-owned extension seams. Run `doctor` first and inspect
a dry run before applying a structural addition.

`--git`, `--no-git`, `--ui`, and `--native-styling` are creation concerns and
are rejected by `add`. Use `anhedral ui add` for components.

```sh
anhedral doctor
anhedral add r2 --dry-run
anhedral add r2
anhedral add electron electron-updater
anhedral add postgres nginx certbot --toolchain stable
```

## `anhedral ui add`

Copies source-owned components into installed UI clients.

```text
anhedral ui add <component...>
  [--target <web|mobile|desktop|extension>]
  [--skip-install] [--dry-run] [--json] [--verbose]
```

At least one component is required. Components can be separate positional
arguments or comma-separated lists. Component names use lowercase kebab-case.

`--target` is repeatable. With no target, Anhedral adds the component to every
compatible installed UI client. The providers are:

| Target | Generated client | Component source |
| --- | --- | --- |
| `web` | Next.js | shadcn/ui |
| `mobile` | Expo | React Native Reusables in TypeScript |
| `desktop` | Electron renderer | shadcn/ui |
| `extension` | WXT UI | shadcn/ui |

```sh
anhedral ui add button dialog
anhedral ui add data-table --target web
anhedral ui add button --target desktop --target extension --dry-run
```

## `anhedral upgrade`

Transactionally upgrades a supported older Anhedral workspace.

```text
anhedral upgrade [--skip-install] [--dry-run] [--json] [--verbose]
```

Upgrade verifies manifest provenance and managed-file hashes before replacing
generator-owned substrate. It stops on unsafe drift instead of overwriting it.

```sh
anhedral upgrade --dry-run
anhedral upgrade
```

## `anhedral doctor`

Performs a read-only health inspection of an existing generated workspace.

```text
anhedral doctor [--json] [--verbose]
```

The report covers the project identity, selected modules, toolchain, ownership
counts, managed-file drift, interrupted transaction state, and recommended
actions. A project with drift produces a nonzero exit status.

```sh
anhedral doctor
anhedral doctor --json
```

## `anhedral setup-vps`

Validates or applies the generated Ubuntu host bootstrap.

```text
anhedral setup-vps [--check] [--verbose]
```

Run this command from a generated project checkout that includes `ubuntu`. The
CLI verifies that `anhedral.json` matches the installed generator, that
`deploy/vps/setup.sh` is a regular managed file, and that its content has not
drifted before invoking it.

- With no mode flag, the command validates and applies the idempotent bootstrap.
- `--check` performs validation and prints the plan without changing the host.
- The generated script may elevate with `sudo` during apply.

The bootstrap reads these environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `ANHEDRAL_DOMAIN` | Public application domain used by Nginx and optional TLS | No domain |
| `ANHEDRAL_EMAIL` | Certbot registration and expiry email | No email |
| `ANHEDRAL_ADMIN_USER` | Linux deployment administrator | `SUDO_USER`, otherwise `deploy` |
| `ANHEDRAL_AUTHORIZED_KEYS_FILE` | Authorized SSH public keys copied to the administrator account | Existing root or sudo-user keys when available |
| `ANHEDRAL_ENABLE_TLS` | Set to `1` to issue a certificate | TLS issuance disabled |

TLS issuance requires both `ANHEDRAL_DOMAIN` and `ANHEDRAL_EMAIL`. Review the
generated plan and keep a second SSH session open when applying SSH and
firewall changes.

```sh
anhedral setup-vps --check

ANHEDRAL_DOMAIN=app.example.com \
ANHEDRAL_EMAIL=ops@example.com \
ANHEDRAL_ENABLE_TLS=1 \
anhedral setup-vps
```

## Version and help

```text
anhedral --version [--json]
anhedral -v [--json]
anhedral --help [--json]
anhedral -h [--json]
```

Plain version output is the installed generator version. JSON version output
has the shape `{ "version": "x.y.z" }`.

## CLI environment variables

| Variable | Equivalent behavior |
| --- | --- |
| `ANHEDRAL_SKIP_INSTALL=1` | Default `--skip-install` for `new`, `init`, `add`, and `ui add` |
| `ANHEDRAL_TOOLCHAIN=stable` | Default stable toolchain for `new`, `init`, and `add` |
| `ANHEDRAL_TOOLCHAIN=latest` | Default latest toolchain for `new`, `init`, and `add` |
| `ANHEDRAL_VERBOSE=1` | Enable verbose child-process output |
| `ANHEDRAL_QUIET=1` | Suppress normal human-oriented progress output |
| `NO_COLOR=1` | Disable colored terminal output |

Explicit command-line values take precedence over the corresponding defaults.
`--json` enables quiet progress output automatically so standard output remains
machine-readable.

## Generated workspace aliases

Generated root `package.json` files expose these aliases for project lifecycle
commands:

| Generated script | CLI command |
| --- | --- |
| `pnpm anhedral:add` | `anhedral add` |
| `pnpm anhedral:ui` | `anhedral ui add` |
| `pnpm anhedral:upgrade` | `anhedral upgrade` |
| `pnpm anhedral:doctor` | `anhedral doctor` |

For example, `pnpm anhedral:add r2 --dry-run` uses the generator version pinned
by that workspace.

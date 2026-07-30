# Anhedral Init Builder

An interactive, in-page architecture composer for an Anhedral product stack.
The page translates the relationships in the repository's master stack model
into three responsive stages: product surfaces, backend services, and VPS
infrastructure. Every architecture card is a real UI control rather than an
embedded image or a separate zoomable canvas. Select products directly in the
flow, then copy the generated `anhedral init` command from the persistent live
command bar.

The builder exposes the complete public product catalog with official brand
marks:

- Apps: Next.js, Expo, Fastify, Electron, and WXT
- Services: Neon + Drizzle, Clerk, Ably, RevenueCat + Stripe, Cloudflare
  Workers + R2, RevenueCat Native, and Electron Updater + R2
- VPS infrastructure: Ubuntu, Docker, PostgreSQL + Drizzle, Nginx, and
  Certbot + Let's Encrypt

The **VPS production** preset generates a ready-to-run command such as:

```bash
pnpm dlx anhedral@latest init --next --fastify --ubuntu --docker --postgres --nginx --certbot
```

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify

```bash
pnpm lint
pnpm build
```

The module selector mirrors the dependency closure in the Anhedral CLI:

- `auth` adds `api` and `db`
- `billing` and `storage` add `auth`
- `native-subscriptions` adds `mobile` and `billing`
- `electron-updater` adds `desktop`
- `docker` adds `ubuntu`
- `postgres` adds `docker` and replaces managed Neon in the command
- `nginx` adds `docker`
- `certbot` adds `nginx`

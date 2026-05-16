# demo Production Guide

## Project Structure

The generated app is one pnpm monorepo:

```txt
.
├─ Frontend/        Expo + React Native Reusables app
├─ Backend/         Fastify API
├─ Extension/       WXT Chrome extension
├─ packages/
│  ├─ api-client/   shared typed API client
│  ├─ config/       shared config constants/helpers
│  ├─ db/           Drizzle schema, Neon client, migrations
│  └─ types/        shared TypeScript types
├─ PRODUCTION.md    development and deployment guide
├─ turbo.json       workspace build graph
└─ package.json     root scripts
```

## Frontend

`Frontend` is the single Expo source for:

- Web on Vercel
- iOS through EAS
- Android through EAS

Important files:

- `Frontend/package.json`: Expo scripts
- `Frontend/vercel.json`: Vercel web export config
- `Frontend/eas.json`: native build profiles
- `Frontend/app`: Expo Router screens

Build output goes to `Frontend/dist`.

## Backend

`Backend` is the Fastify API.

Important files:

- `Backend/src/index.ts`: Vercel Fastify entrypoint
- `Backend/src/app.ts`: Fastify app construction
- `Backend/vercel.json`: minimal Vercel config
- `Backend/src/routes`: health/auth/subscription routes

## Extension

`Extension` is the WXT Chrome extension using the Side Panel API.

Important files:

- `Extension/wxt.config.ts`: manifest, side panel, permissions
- `Extension/src/entrypoints/sidepanel`: side panel UI
- `Extension/src/entrypoints/background.ts`: side panel behavior

ZIP output goes to `Extension/.output`.

## Develop

From the repository root:

```sh
pnpm install
pnpm dev
```

Or run one surface at a time:

```sh
pnpm dev:frontend
pnpm dev:backend
pnpm dev:extension
```

Use these before deploy:

```sh
pnpm verify
pnpm verify:frontend
pnpm verify:backend
pnpm verify:extension
```

Database workflow:

```sh
pnpm db:generate
pnpm db:migrate
```

Local demo mode is enabled through generated `.env` files. Real provider behavior needs Clerk, RevenueCat/Stripe, Neon, and R2 credentials.

The generated placeholder values are intentionally non-production. They let you inspect files and run backend demo checks, but browser auth, paid subscriptions, uploads, and extension sign-in require the setup below.

## Environment Variables

- Root/local: `DATABASE_URL` for shared Drizzle commands.
- Frontend/Vercel Frontend: only `EXPO_PUBLIC_*` values.
- Backend/Vercel Backend: server secrets such as `DATABASE_URL`, `CLERK_SECRET_KEY`, `RC_SECRET_API_KEY`, `RC_WEBHOOK_SECRET`, and R2 credentials.
- Extension: `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, and optionally `VITE_CRX_PUBLIC_KEY`.
- EAS: add native app public keys with `eas secret:create` or the EAS dashboard.

## Provider Setup

### Neon + Drizzle

Docs:

- https://neon.com/docs/get-started-with-neon/connect-neon
- https://orm.drizzle.team/docs/tutorials/drizzle-with-neon

Steps:

1. Create a Neon project and Postgres database.
2. Copy the pooled connection string.
3. Set `DATABASE_URL` in the root `.env`, `Backend/.env`, and the Backend Vercel project.
4. Run:

```sh
pnpm db:generate
pnpm db:migrate
```

### Clerk

Docs:

- https://docs.expo.dev/guides/using-clerk/
- https://clerk.com/docs/quickstarts/get-started-with-expo

Steps:

1. Create a Clerk application.
2. Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `Frontend/.env`, the Frontend Vercel project, and EAS.
3. Set `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `Backend/.env` and the Backend Vercel project.
4. Set `VITE_CLERK_PUBLISHABLE_KEY` in `Extension/.env`.
5. Add allowed origins for local Expo web, the deployed Frontend Vercel domain, and the Chrome extension origin after the extension id is stable.
6. Configure native redirect/deep-link settings for the Expo scheme in `Frontend/app.json`.

### RevenueCat + Stripe

Docs:

- https://www.revenuecat.com/docs/web/overview
- https://www.revenuecat.com/docs/web/integrations/stripe
- https://docs.stripe.com/keys

Steps:

1. Create the RevenueCat project.
2. Create an entitlement named `pro`.
3. Create iOS, Android, and Web apps in RevenueCat.
4. Copy the public SDK keys into `EXPO_PUBLIC_RC_API_KEY_IOS`, `EXPO_PUBLIC_RC_API_KEY_ANDROID`, and `EXPO_PUBLIC_RC_WEB_API_KEY`.
5. Set `EXPO_PUBLIC_RC_ENTITLEMENT_ID=pro`.
6. Connect Stripe as the RevenueCat web billing source.
7. Set `RC_SECRET_API_KEY` and `RC_WEBHOOK_SECRET` only in Backend envs.
8. Configure the RevenueCat webhook URL as `https://<backend-domain>/webhooks/revenuecat`.

### Cloudflare R2/CDN

Docs:

- https://developers.cloudflare.com/r2/get-started/s3/
- https://developers.cloudflare.com/r2/api/tokens/

Steps:

1. Create an R2 bucket.
2. Create a least-privilege API token for that bucket.
3. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` only in Backend envs.
4. Configure a public bucket URL or custom domain if uploaded assets need public CDN delivery.

## Deploy

Vercel deployment is two Vercel projects from the same Git repo:

1. Frontend Vercel project
   - Root Directory: `Frontend`
   - Build command: `pnpm build:web`
   - Output directory: `dist`

2. Backend Vercel project
   - Root Directory: `Backend`
   - Build command: `pnpm build`
   - Fastify entrypoint: `src/index.ts`

Enable Vercel access to source files outside each project root so `packages/*` workspace packages resolve.

Native app deployment:

```sh
cd Frontend
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init
pnpm dlx eas-cli@latest build --platform all --profile production
pnpm dlx eas-cli@latest submit --platform all --latest --profile production
```

Chrome extension deployment:

```sh
pnpm extension:zip
```

Upload `Extension/.output/*-chrome.zip` to the Chrome Web Store Developer Dashboard.

## Production Checklist

- Replace every `*_placeholder` value before production deploy.
- Keep server secrets out of Frontend, Extension, and EAS public envs.
- Confirm Clerk works on local web, Vercel web, iOS, Android, and the Chrome extension.
- Confirm RevenueCat returns the `pro` entitlement after Stripe web purchase and native store purchase.
- Confirm `pnpm db:migrate` has run against the production Neon database.
- Confirm R2 upload and signed URL retrieval work from the deployed Backend domain if you expose storage routes.
- Confirm both Vercel projects can resolve `packages/*` workspace packages.
- Confirm the Chrome extension ZIP is tested locally with `chrome://extensions` before Chrome Web Store upload.

## Relevant Docs

- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vercel monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq)
- [Expo web publishing](https://docs.expo.dev/guides/publishing-websites/)
- [Expo EAS](https://docs.expo.dev/eas/)
- [Expo store submissions](https://docs.expo.dev/deploy/submit-to-app-stores/)
- [Clerk with Expo](https://docs.expo.dev/guides/using-clerk/)
- [Clerk Expo quickstart](https://clerk.com/docs/quickstarts/get-started-with-expo)
- [Neon connection strings](https://neon.com/docs/get-started-with-neon/connect-neon)
- [Drizzle with Neon](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon)
- [RevenueCat Web](https://www.revenuecat.com/docs/web/overview)
- [RevenueCat Stripe Billing](https://www.revenuecat.com/docs/web/integrations/stripe)
- [Stripe API keys](https://docs.stripe.com/keys)
- [Cloudflare R2 S3 API](https://developers.cloudflare.com/r2/get-started/s3/)
- [Cloudflare R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/)
- [WXT publishing](https://wxt.dev/guide/essentials/publishing.html)
- [Chrome Web Store publishing](https://developer.chrome.com/docs/webstore/publish)

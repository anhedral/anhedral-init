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

## Environment Variables

- Root/local: `DATABASE_URL` for shared Drizzle commands.
- Frontend/Vercel Frontend: only `EXPO_PUBLIC_*` values.
- Backend/Vercel Backend: server secrets such as `DATABASE_URL`, `CLERK_SECRET_KEY`, `RC_SECRET_API_KEY`, `RC_WEBHOOK_SECRET`, and R2 credentials.
- Extension: `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, and optionally `VITE_CRX_PUBLIC_KEY`.
- EAS: add native app public keys with `eas secret:create` or the EAS dashboard.

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

## Provider Checklist

- Clerk: configure allowed origins for the Expo web Vercel domain, native redirect/deep-link settings for the Expo scheme in `Frontend/app.json`, and the Chrome extension origin after publishing or after assigning a stable extension key.
- RevenueCat + Stripe: create a `pro` entitlement, configure iOS/Android/Web app API keys separately, connect Stripe as the web billing source, set the RevenueCat webhook URL to `https://<backend-domain>/webhooks/revenuecat`, and keep `RC_WEBHOOK_SECRET` only in Backend.
- Neon + Drizzle: create the Neon database, set `DATABASE_URL` locally and in the Backend Vercel project, then run `pnpm db:generate` and `pnpm db:migrate` before production traffic.
- Cloudflare R2: create an R2 bucket and least-privilege API token, then set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` in Backend only.

## Relevant Docs

- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Expo web publishing](https://docs.expo.dev/guides/publishing-websites/)
- [Expo EAS](https://docs.expo.dev/eas/)
- [WXT publishing](https://wxt.dev/guide/essentials/publishing.html)
- [Chrome Web Store publishing](https://developer.chrome.com/docs/webstore/publish)

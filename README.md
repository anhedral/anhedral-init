# anhedral

Opinionated init CLI for product teams shipping with Next.js, Expo, Fastify, Drizzle, Neon, Clerk, Stripe, RevenueCat, and Cloudflare R2.

## Requirements

- Node.js 20+
- `pnpm` available on your machine

## Usage

Run the CLI directly without installing it globally:

```sh
pnpm dlx anhedral init next
pnpm dlx anhedral init next-fullstack
pnpm dlx anhedral init expo-fullstack
pnpm dlx anhedral init backend
```

Global install also works:

```sh
pnpm add -g anhedral
anhedral init next
```

```sh
npm install -g anhedral
anhedral init next
```

## Stacks

- `next`: Next.js App Router for the fastest web-only SaaS path.
- `next-fullstack`: Next.js frontend plus Fastify backend for clearer service boundaries.
- `expo-fullstack`: Expo app plus Fastify backend for mobile-first or multi-client products.
- `backend`: Fastify-only API foundation for headless products and integrations.

Each scaffold writes a `stack.json` file with the selected architecture and generated outputs.

## Local Development

```sh
pnpm install
pnpm build
pnpm test:all
```

## Publishing

This package is published once to the npm registry. `pnpm`, `npm`, `yarn`, and `bun` users all install that same published package.

```sh
pnpm build
pnpm test:all
npm publish
```

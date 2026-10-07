import { GENERATOR_VERSION } from './version.js';
import type { StandardProduct } from './standard-products.js';
import type { StandardOptions } from './standard.js';
import { PACKAGE_MANAGER } from './dependencies.js';
import { SHADCN_BOOTSTRAP } from './foundation.js';

export interface Selection {
  app?: boolean;
  conflicts?: StandardProduct[];
  requiresAny?: StandardProduct[];
  requiresAll?: StandardProduct[];
  workerBinding?: boolean;
}

export interface Capability {
  purpose: string;
  delivery: 'starter' | 'sdk-factory' | 'integration-boundary';
  tools: string[];
  access: string[];
  credentials: string[];
  resources: string[];
  verify: string[];
  selection: Selection;
}

function capability(purpose: string, tools: string[], access: string[], credentials: string[], resources: string[], verify: string[], selection: Selection = {}, delivery: Capability['delivery'] = 'starter'): Capability {
  return { purpose, delivery, tools, access, credentials, resources, verify, selection };
}

/** Setup requirements describe unfinished starters; they never grant authority or claim readiness. */
export const CAPABILITIES: Record<StandardProduct, Capability> = {
  next: capability('Web application with Next.js rendering, routing and server integration', ['Browser testing where applicable'], [], [], ['Next.js app; configure the selected hosting provider'], ['Web flows, accessibility, production hosting build and deployed preview'], { app: true }),
  expo: capability('Mobile application starter with Expo and native platform adapters', ['Expo/EAS CLI', 'Xcode or Android SDK'], ['Client-owned Apple/Google developer accounts for store delivery'], ['Platform signing credentials; EAS access when used'], ['Expo app; native adapters, signing, store configuration'], ['Pass the installed-byte dependency gate; maintain reviewed backports until supported upstream replacements are available', 'Native simulator/device flows and signed native build; web export alone is insufficient'], { app: true }),
  electron: capability('Electron desktop starter for web UI reuse; assess memory, native integration, security and distribution', ['Electron tooling', 'Platform packaging tools'], ['Signing/notarization account for the target platform'], ['Signing credentials; notarization credentials when required'], ['Electron app; packaging and distribution configuration'], ['Packaged desktop app, permissions, update/recovery behavior'], { app: true }),
  wxt: capability('WXT Chrome extension starter; select sidepanel or popup for the task', ['Chrome', 'WXT'], ['Extension store publisher access for distribution'], ['Store publishing credentials when required'], ['Extension app; minimal browser permissions and store package'], ['Installed selected surface, relevant messaging and minimal permission behavior'], { app: true }),
  hono: capability('Shared OpenAPI backend', ['Wrangler'], ['Cloudflare Workers deployment access'], [], ['API Worker; application routes and authorization'], ['Contract validation, unauthenticated rejection and resource ownership'], { app: true }),
  neon: capability('PostgreSQL persistence through Drizzle and Hyperdrive', ['Neon integration or API', 'Wrangler'], ['Neon project/branch access; Cloudflare Hyperdrive configuration access'], ['DATABASE_URL for migrations; separate least-privilege Hyperdrive origin credentials'], ['Generated Drizzle + Hyperdrive recipe: schema/client factories, migration config and HYPERDRIVE binding; direct Neon serverless access is an existing-project adaptation'], ['Migration and runtime connectivity; disable query caching for correctness-sensitive reads'], { conflicts: ['d1'], workerBinding: true }),
  d1: capability('SQLite-compatible hosted persistence', ['Wrangler'], ['Cloudflare D1 access'], [], ['D1 database, DB binding and reviewed migrations'], ['Migration, constraints, transactional behavior and runtime queries'], { conflicts: ['neon'], workerBinding: true }),
  'local-data': capability('Device-local SQLite and files', ['Selected platform database/filesystem tooling'], [], [], ['Integration boundary; implement platform adapters and explicit synchronization if needed'], ['Persistence, offline writes and recovery on the selected device'], {}, 'integration-boundary'),
  clerk: capability('Managed identity', ['Clerk integration or dashboard'], ['Client-owned Clerk project access'], ['Clerk publishable key; server secret key; webhook secret when used'], ['Identity project, allowed URLs, SDK setup and protected routes'], ['Sign-in/out, session expiry, server-side authorization and selected native flows; route-group names do not authorize requests'], { conflicts: ['better-auth'], requiresAny: ['next', 'hono'] }),
  'better-auth': capability('Application-managed identity', ['Selected database tooling'], ['Selected database migration/runtime access'], ['BETTER_AUTH_SECRET; BETTER_AUTH_URL'], ['Selected Neon or D1 database, auth schema, trusted origins and application routes'], ['Sign-in/out, session expiry, sign-up policy and resource authorization'], { conflicts: ['clerk'], requiresAny: ['neon', 'd1'], workerBinding: true }),
  r2: capability('Private remote files', ['Wrangler'], ['Cloudflare R2 bucket/binding access'], [], ['Private R2 bucket and FILES binding; authorized upload/download endpoints'], ['Public bucket access disabled; file ownership enforced; clients receive no storage credentials'], { workerBinding: true }),
  kv: capability('Eventually consistent cache/configuration', ['Wrangler'], ['Cloudflare KV namespace access'], [], ['KV namespace and CONFIG binding'], ['TTL and propagation behavior; never use KV as transactional authority'], { workerBinding: true }),
  realtime: capability('Rooms and collaboration', ['Wrangler', 'Browser control'], ['Cloudflare Durable Objects deployment access'], [], ['Realtime Worker, Durable Object namespace/migration and WebSocket authorization'], ['Authorized room isolation, disconnect/reconnect and deployed WebSockets']),
  queues: capability('Deferred jobs', ['Wrangler'], ['Cloudflare Queues configuration access'], [], ['Queue, producer/consumer bindings and failure handling'], ['Retries, idempotency, concurrency and dead-letter recovery']),
  cron: capability('Scheduled work', ['Wrangler'], ['Cloudflare Worker deployment access'], [], ['Scheduled Worker and environment-specific Cron Triggers'], ['Schedule, idempotency, failure visibility and overlapping runs']),
  workflows: capability('Durable multi-step processing', ['Wrangler'], ['Cloudflare Workflows deployment access'], [], ['Workflow Worker/binding and resumable steps'], ['Retry/resume, idempotency, cancellation and failure recovery']),
  openai: capability('Direct OpenAI integration', ['OpenAI integration or API'], ['Client-owned OpenAI project and model access'], ['OPENAI_API_KEY'], ['Server SDK factory; implement application behavior and spending limits'], ['Selected model, failure handling, private inputs and cost controls'], { conflicts: ['ai-sdk'] }, 'sdk-factory'),
  'ai-sdk': capability('Streaming AI and provider abstraction', ['Selected AI provider integration or API'], ['Selected provider project/model access'], ['OPENAI_API_KEY for the generated default; selected provider credentials otherwise'], ['Server SDK factory; implement streaming, tools and application behavior'], ['Streaming, tool authorization, interruption and spending limits'], { conflicts: ['openai'] }, 'sdk-factory'),
  'workers-ai': capability('Cloudflare-hosted inference', ['Wrangler'], ['Cloudflare Workers AI model access'], [], ['AI binding and selected model invocation'], ['Supported model behavior, authorization and usage limits'], { workerBinding: true }),
  resend: capability('Outbound application email', ['Resend integration or API'], ['Client-owned Resend project; sending-domain DNS access'], ['RESEND_API_KEY; webhook secret when used'], ['Verified sending domain, sender and server integration'], ['Delivery, suppression/bounce handling and webhook verification; inbound routing is separate'], {}, 'sdk-factory'),
  stripe: capability('Web payments and subscriptions', ['Stripe integration or CLI'], ['Client-owned Stripe account; test/live access as required'], ['STRIPE_SECRET_KEY; STRIPE_WEBHOOK_SECRET'], ['Server SDK factory; implement products/prices, signed webhooks and entitlements'], ['Test purchase/cancellation, webhook replay and transactional idempotency'], {}, 'sdk-factory'),
  revenuecat: capability('Cross-store subscription entitlements alongside Stripe', ['RevenueCat integration or API', 'Selected mobile store tooling'], ['RevenueCat project; App Store/Play Store product access'], ['Platform public SDK keys; server API/webhook credentials as required'], ['Integration guidance only; install platform SDKs and configure offerings/store products'], ['Sandbox purchase/restore, verified webhooks and entitlement reconciliation'], { requiresAll: ['stripe'] }, 'integration-boundary'),
  sentry: capability('Additional runtime/crash diagnostics', ['Sentry integration or API'], ['Client-owned Sentry project access'], ['SENTRY_DSN; source-map upload token when required'], ['Integration boundary; install/init runtime SDKs and configure private source-map uploads'], ['Captured runtime errors, source maps, privacy filtering and alert delivery'], {}, 'integration-boundary'),
  basin: capability('Basin ingestion and analytical SQL; product analytics needs its own event model and reports', ['Wrangler', 'Cloudflare integration or API'], ['Cloudflare analytics/Pipelines access; plan supporting selected services; Pipelines Setup grant for managed R2 sink setup'], [], ['EventStream interface and ANALYTICS binding; provision Basin stream, pipeline/table, retention and reports separately; optional private R2 sink'], ['Private ingestion, event delivery, query results and archive retrieval when selected'], { workerBinding: true }, 'integration-boundary'),
  posthog: capability('Specialized product analytics', ['PostHog integration or API'], ['Client-owned PostHog project access'], ['POSTHOG_API_KEY; POSTHOG_HOST; separate privileged key if needed'], ['Analytics client factory; implement consent, event schema and privacy filtering'], ['Event receipt, consent behavior and redaction of private data'], {}, 'sdk-factory'),
  styling: capability('Shared styling definitions', [], [], [], ['Styling package; implement actual shared colors, typography, spacing and themes'], ['Consistency across selected interfaces; preserve platform-specific components'], {}, 'integration-boundary'),
};

export function resolveStandardProducts(selected: Set<StandardProduct>, hosting: StandardOptions['hosting'], hostingSpecified: boolean): void {
  if (![...selected].some((id) => CAPABILITIES[id].selection.app)) selected.add('next');
  for (const id of selected) validateSelection(id, selected);
  const needsWorker = [...selected].some((id) => CAPABILITIES[id].selection.workerBinding);
  if (needsWorker && !selected.has('hono') && (!selected.has('next') || hosting !== 'cloudflare')) {
    throw new Error('Selected server bindings need a Cloudflare Next.js app or an explicitly selected Hono Worker.');
  }
  if (hostingSpecified && !selected.has('next')) throw new Error('--hosting applies to the Next.js app.');
}

function validateSelection(id: StandardProduct, selected: ReadonlySet<StandardProduct>): void {
  const { conflicts = [], requiresAny = [], requiresAll = [] } = CAPABILITIES[id].selection;
  const conflict = conflicts.find((other) => selected.has(other));
  if (conflict) throw new Error(`Choose one of ${[id, conflict].join(' / ')}.`);
  if (requiresAny.length && !requiresAny.some((other) => selected.has(other))) {
    throw new Error(`${id} requires an explicitly selected ${requiresAny.join(' or ')} capability.`);
  }
  const missing = requiresAll.filter((other) => !selected.has(other));
  if (missing.length) throw new Error(`${id} requires ${missing.join(', ')}; select it explicitly.`);
}

export const CAPABILITY_REGISTRY = { schemaVersion: 1, cliVersion: GENERATOR_VERSION, capabilities: CAPABILITIES };

const HOSTING_SETUP = {
  cloudflare: {
    tools: ['Cloudflare integration or API', 'Wrangler'],
    access: ['Client-owned Cloudflare account; account ID; scoped OAuth/API access; service-compatible plan; DNS access only when needed'],
  },
  vercel: {
    tools: ['Vercel integration or CLI'],
    access: ['Client-owned Vercel project access'],
  },
};

export function createSetupPlan(options: StandardOptions) {
  const capabilities = options.products.map((id) => ({ id, ...CAPABILITIES[id], status: options.dryRun ? 'planned' as const : 'starter' as const }));
  const providers = [...new Set<StandardOptions['hosting']>([
    ...(options.products.includes('next') ? [options.hosting] : []),
    ...capabilities.flatMap(({ tools }) => tools.includes('Wrangler') ? ['cloudflare' as const] : []),
  ])].map((provider) => HOSTING_SETUP[provider]);
  return {
    schemaVersion: 1, cliVersion: GENERATOR_VERSION, registryVersion: CAPABILITY_REGISTRY.schemaVersion,
    standard: 'anhedral-application-stack', root: options.root, products: options.products, hosting: options.hosting,
    layout: options.layout ?? 'workspace',
    ...(options.products.includes('wxt') ? { extensionSurface: options.extensionSurface ?? 'sidepanel' } : {}),
    bootstrap: options.products.includes('next') ? [...SHADCN_BOOTSTRAP] : [], dryRun: options.dryRun,
    setup: {
      tools: [...new Set(['Git', 'Node.js 22.22+ for generated workspaces', PACKAGE_MANAGER.replace('@', ' '), 'GitHub integration or gh', 'Fallow',
        ...(providers.includes(HOSTING_SETUP.cloudflare) ? ['Cloudflare security audit skill'] : []),
        ...providers.flatMap((provider) => provider.tools), ...capabilities.flatMap((item) => item.tools)])],
      access: ['Client-owned repository and CI access', ...providers.flatMap((provider) => provider.access)],
      capabilities,
      completion: ['Discover available plugins and fallbacks; verify the selected account and scope', 'Configure separate environments, bindings and server-side secrets',
        'Implement starter behavior and meaningful tests', 'Run repeatable local gates and separately record time-sensitive advisory/provider checks; verify platform behavior', 'Verify deployed preview; obtain required production authorization; record rollback and operating ownership'],
      resourcesProvisioned: false,
    },
  };
}

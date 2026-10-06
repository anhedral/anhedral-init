import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { appendGitignore, execFile, writeFile } from './util.js';
import { packageNameFromText } from './render.js';
import { spawnSync } from 'node:child_process';
import { PACKAGE_MANAGER } from './dependencies.js';
import { runStagedTransaction } from './transaction.js';
import { scaffoldDesktop } from './platforms/desktop.js';
import { scaffoldMobile } from './platforms/mobile.js';
import { scaffoldExtension } from './platforms/extension.js';
import type { ProjectOptions } from './project.js';

import { STANDARD_PRODUCTS, type StandardProduct } from './standard-products.js';
export { STANDARD_PRODUCTS } from './standard-products.js';
export type { StandardProduct } from './standard-products.js';
export interface StandardOptions {
  root: string;
  name: string;
  products: StandardProduct[];
  hosting: 'cloudflare' | 'vercel';
  skipInstall: boolean;
  dryRun: boolean;
  json: boolean;
  initializeGit: boolean;
}
export const STANDARD_USAGE = `Anhedral Application Stack & Delivery Standard

anhedral new <directory> [products...] [--hosting cloudflare|vercel] [--skip-install] [--no-git] [--dry-run] [--json]
anhedral init [products...] [--hosting cloudflare|vercel] [--skip-install] [--git] [--dry-run] [--json]

Default: Next.js only, from the official shadcn pnpm/Turborepo monorepo.
Web hosting: Cloudflare Workers + OpenNext. Services are opt-in.
Products: ${STANDARD_PRODUCTS.join(', ')}
Examples:
  anhedral new client-app
  anhedral new mobile-app --expo
  anhedral new product --next --expo --hono --neon --clerk --r2
  anhedral new website --next --stripe --resend
  anhedral init --wxt

--skip-install skips the final workspace install; the official shadcn bootstrap
still requires network access and may install its own dependencies.
--all is intentionally unsupported: select only required capabilities.
Vercel is an explicit architecture exception requiring project approval.
`;

export function parseStandardOptions(command: 'new' | 'init', args: readonly string[]): StandardOptions {
  const remaining = [...args];
  const directory = command === 'new' ? remaining.shift() : process.cwd();
  if (!directory || directory.startsWith('-')) throw new Error('new requires a destination directory.');
  const root = path.resolve(directory);
  const products = new Set<StandardProduct>();
  let hosting: StandardOptions['hosting'] = 'cloudflare';
  let hostingSpecified = false;
  let gitSpecified: boolean | undefined;
  for (let index = 0; index < remaining.length; index++) {
    const token = remaining[index];
    if (['--skip-install', '--dry-run', '--json', '--verbose'].includes(token)) continue;
    if (token === '--git' || token === '--no-git') {
      const value = token === '--git';
      if (gitSpecified !== undefined && value !== gitSpecified) throw new Error('Conflicting Git options.');
      gitSpecified = value;
      continue;
    }
    if (token === '--hosting' || token.startsWith('--hosting=')) {
      const value = token === '--hosting' ? remaining[++index] : token.slice('--hosting='.length);
      if (value !== 'cloudflare' && value !== 'vercel') throw new Error('hosting must be cloudflare or vercel.');
      if (hostingSpecified && hosting !== value) throw new Error('Conflicting hosting options.');
      hosting = value;
      hostingSpecified = true;
      continue;
    }
    const value = token.replace(/^--/, '');
    if (!STANDARD_PRODUCTS.includes(value as StandardProduct)) {
      throw new Error(`Unknown standard product: ${token}. Select only required products.`);
    }
    products.add(value as StandardProduct);
  }
  if (![...products].some((value) => ['next', 'expo', 'electron', 'wxt', 'hono'].includes(value))) products.add('next');
  for (const pair of [['neon', 'd1'], ['clerk', 'better-auth'], ['openai', 'ai-sdk']] as const) {
    if (pair.every((value) => products.has(value))) throw new Error(`Choose one of ${pair.join(' / ')}.`);
  }
  if (products.has('better-auth') && !products.has('neon') && !products.has('d1')) throw new Error('Better Auth requires an explicitly selected neon or d1 database.');
  if (products.has('revenuecat') && !products.has('stripe')) throw new Error('RevenueCat is an addition to Stripe; select stripe explicitly.');
  const needsRuntime = ['neon', 'd1', 'better-auth', 'r2', 'kv', 'workers-ai', 'basin'].some((value) => products.has(value as StandardProduct));
  if (needsRuntime && !products.has('hono') && (!products.has('next') || hosting !== 'cloudflare')) {
    throw new Error('Selected server bindings need a Cloudflare Next.js app or an explicitly selected Hono Worker.');
  }
  if (products.has('clerk') && !products.has('next') && !products.has('hono')) throw new Error('Select next or hono for the Clerk server integration. Native client sign-in must be configured for the project.');
  if (hostingSpecified && !products.has('next')) throw new Error('--hosting applies to the Next.js app.');
  return { root, name: packageNameFromText(path.basename(root)), products: [...products].sort(), hosting,
    skipInstall: remaining.includes('--skip-install'), dryRun: remaining.includes('--dry-run'), json: remaining.includes('--json'),
    initializeGit: gitSpecified ?? command === 'new' };
}

type Json = Record<string, any>;
function readJson(root: string, file: string): Json { return JSON.parse(readFileSync(path.join(root, file), 'utf8')); }
function json(root: string, file: string, value: unknown): void { writeFile(path.join(root, file), JSON.stringify(value, null, 2) + '\n'); }
function put(root: string, file: string, value: string): void { writeFile(path.join(root, file), value); }
function patchPackage(root: string, file: string, patch: Json): void {
  const current = readJson(root, file);
  for (const key of ['scripts', 'dependencies', 'devDependencies']) {
    if (patch[key]) patch[key] = { ...current[key], ...patch[key] };
  }
  json(root, file, { ...current, ...patch });
}
function workerConfig(name: string): Json {
  return { $schema: 'node_modules/wrangler/config-schema.json', name, main: 'src/index.ts', compatibility_date: '2026-10-05',
    compatibility_flags: ['nodejs_compat'], observability: { enabled: true } };
}
function worker(root: string, app: string, config: Json, source: string, dependencies: Json = {}): void {
  json(root, `apps/${app}/package.json`, { name: `@workspace/${app}`, private: true, type: 'module', scripts: {
    dev: 'wrangler dev', build: 'wrangler deploy --dry-run --outdir dist', deploy: 'wrangler deploy',
    typecheck: 'wrangler types && tsc --noEmit', lint: 'eslint . --max-warnings 0',
  }, dependencies, devDependencies: { wrangler: '^4.0.0', typescript: '^5.9.3', '@types/node': '^22.0.0', eslint: '^9.0.0', '@workspace/eslint-config': 'workspace:*' } });
  json(root, `apps/${app}/wrangler.jsonc`, config);
  json(root, `apps/${app}/tsconfig.json`, { compilerOptions: { target: 'ES2022', lib: ['ES2022'], module: 'ESNext', moduleResolution: 'Bundler', strict: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true, noEmit: true, types: ['node'] }, include: ['src/**/*.ts', 'worker-configuration.d.ts'] });
  put(root, `apps/${app}/eslint.config.mjs`, 'import { config } from "@workspace/eslint-config/base";\nexport default [...config, { ignores: ["dist/**", ".wrangler/**", "worker-configuration.d.ts"] }, { files: ["**/*.ts"], rules: { "no-undef": "off", "no-unused-vars": "off" } }];\n');
  put(root, `apps/${app}/src/index.ts`, source);
}
function sharedPackage(root: string, name: string, source: string, dependencies: Json): void {
  json(root, `packages/${name}/package.json`, { name: `@workspace/${name}`, private: true, type: 'module', exports: { '.': './src/index.ts' },
    scripts: { typecheck: 'tsc --noEmit', lint: 'eslint . --max-warnings 0' }, dependencies,
    devDependencies: { typescript: '^5.9.3', '@types/node': '^22.0.0', eslint: '^9.0.0', '@workspace/eslint-config': 'workspace:*' } });
  json(root, `packages/${name}/tsconfig.json`, { compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM'], module: 'ESNext', moduleResolution: 'Bundler', strict: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true, noEmit: true, types: ['node'] }, include: ['src/**/*.ts'] });
  put(root, `packages/${name}/eslint.config.mjs`, 'import { config } from "@workspace/eslint-config/base";\nexport default [...config, { ignores: ["dist/**", ".wrangler/**", "worker-configuration.d.ts"] }, { files: ["**/*.ts"], rules: { "no-undef": "off", "no-unused-vars": "off" } }];\n');
  put(root, `packages/${name}/src/index.ts`, source);
}

function cleanShadcnStarter(root: string): void {
  for (const directory of ['apps/web', 'packages/ui']) {
    const manifestPath = `${directory}/package.json`;
    if (!existsSync(path.join(root, manifestPath))) continue;
    const manifest = readJson(root, manifestPath);
    const sources: string[] = [];
    const collect = (folder: string): void => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (['node_modules', '.next', '.open-next', '.git'].includes(entry.name)) continue;
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) collect(file);
        else if (/\.(tsx?|m?js|css)$/.test(entry.name)) sources.push(readFileSync(file, 'utf8'));
      }
    };
    collect(path.join(root, directory));
    for (const name of ['lucide-react', 'zod', 'next-themes']) {
      if (!sources.some((source) => source.includes(`"${name}`) || source.includes(`'${name}`))) delete manifest.dependencies?.[name];
    }
    if (directory === 'packages/ui') {
      if (!sources.some((source) => source.includes('@turbo/gen')) && !Object.values(manifest.scripts ?? {}).some((script) => String(script).includes('turbo gen'))) delete manifest.devDependencies?.['@turbo/gen'];
      manifest.devDependencies = { ...manifest.devDependencies, 'postcss-load-config': '^6.0.1' };
      if (manifest.dependencies?.shadcn) {
        manifest.devDependencies.shadcn = manifest.dependencies.shadcn;
        delete manifest.dependencies.shadcn;
      }
    }
    json(root, manifestPath, manifest);
  }
  const themePath = 'apps/web/components/theme-provider.tsx';
  if (existsSync(path.join(root, themePath))) {
    const source = readFileSync(path.join(root, themePath), 'utf8');
    // Preserve the upstream keyboard behavior while reducing branching in its guards.
    put(root, themePath, source.replace(/target.tagName === "INPUT" \|\|\s*target.tagName === "TEXTAREA" \|\|\s*target.tagName === "SELECT"/, '["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)')
      .replace(/if \(event.defaultPrevented \|\| event.repeat\) \{\s*return\s*\}\s*if \(event.metaKey \|\| event.ctrlKey \|\| event.altKey\) \{\s*return\s*\}\s*if \(event.key.toLowerCase\(\) !== "d"\) \{\s*return\s*\}\s*if \(isTypingTarget\(event.target\)\) \{\s*return\s*\}/, 'if ([event.defaultPrevented, event.repeat, event.metaKey, event.ctrlKey, event.altKey, event.key.toLowerCase() !== "d", isTypingTarget(event.target)].some(Boolean)) { return }'));
  }
}

export async function applyStandardOverlays(root: string, options: StandardOptions): Promise<void> {
  const has = (product: StandardProduct) => options.products.includes(product);
  // Preserve the upstream workspace and config packages, but remove its unused app.
  if (!has('next')) rmSync(path.join(root, 'apps/web'), { recursive: true, force: true });
  if (!has('next')) rmSync(path.join(root, 'packages/ui'), { recursive: true, force: true });
  const platformOptions: ProjectOptions = { projectName: options.name, displayName: options.name };
  if (has('expo')) await scaffoldMobile(root, platformOptions);
  if (has('electron')) await scaffoldDesktop(root, platformOptions);
  if (has('wxt')) await scaffoldExtension(root, platformOptions);
  const bindings: Json = {};
  if (has('neon')) bindings.hyperdrive = [{ binding: 'HYPERDRIVE', id: 'REPLACE_WITH_HYPERDRIVE_ID' }];
  if (has('d1')) bindings.d1_databases = [{ binding: 'DB', database_name: `${options.name}-db`, database_id: 'REPLACE_WITH_D1_ID', migrations_dir: '../../packages/db/migrations' }];
  if (has('r2')) bindings.r2_buckets = [{ binding: 'FILES', bucket_name: `${options.name}-private-files` }];
  if (has('kv')) bindings.kv_namespaces = [{ binding: 'CONFIG', id: 'REPLACE_WITH_KV_ID' }];
  if (has('workers-ai')) bindings.ai = { binding: 'AI' };
  if (has('queues')) bindings.queues = { producers: [{ binding: 'JOBS', queue: `${options.name}-jobs` }] };
  if (has('basin')) bindings.pipelines = [{ binding: 'ANALYTICS', stream: 'REPLACE_WITH_BASIN_STREAM_ID' }];
  const runtimeApp = has('hono') ? 'api' : 'web';
  if (has('next')) {
    cleanShadcnStarter(root);
    put(root, 'apps/web/eslint.config.js', 'import { nextJsConfig } from "@workspace/eslint-config/next-js";\nexport default [...nextJsConfig, { ignores: [".open-next/**", ".wrangler/**", "cloudflare-env.d.ts"] }];\n');
    patchPackage(root, 'apps/web/package.json', { scripts: { typecheck: 'tsc --noEmit', lint: 'eslint . --max-warnings 0' } });
    if (options.hosting === 'cloudflare') {
      patchPackage(root, 'apps/web/package.json', { dependencies: { '@opennextjs/cloudflare': '^1.0.0', next: '^16.3.8' }, devDependencies: { wrangler: '^4.0.0' }, scripts: {
        preview: 'opennextjs-cloudflare build && opennextjs-cloudflare preview', deploy: 'opennextjs-cloudflare build && opennextjs-cloudflare deploy',
        'build:worker': 'opennextjs-cloudflare build', 'cf:typegen': 'wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts',
      } });
      json(root, 'apps/web/wrangler.jsonc', { ...workerConfig(`${options.name}-web`), main: '.open-next/worker.js',
        assets: { directory: '.open-next/assets', binding: 'ASSETS' }, services: [{ binding: 'WORKER_SELF_REFERENCE', service: `${options.name}-web` }],
        ...(runtimeApp === 'web' ? bindings : {}) });
      put(root, 'apps/web/open-next.config.ts', 'import { defineCloudflareConfig } from "@opennextjs/cloudflare";\nexport default defineCloudflareConfig();\n');
      put(root, 'apps/web/public/_headers', '/_next/static/*\n  Cache-Control: public,max-age=31536000,immutable\n');
      put(root, 'apps/web/.dev.vars.example', 'NEXTJS_ENV=development\n');
    } else {
      json(root, 'apps/web/vercel.json', { framework: 'nextjs' });
    }
  }
  if (has('hono')) {
    worker(root, 'api', { ...workerConfig(`${options.name}-api`), ...bindings }, `import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
const app = new OpenAPIHono<{ Bindings: Env }>();
app.openapi(createRoute({ method: 'get', path: '/health', responses: { 200: { description: 'Healthy', content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } } } } }), (c) => c.json({ ok: true as const }, 200));
app.doc('/openapi.json', { openapi: '3.0.0', info: { title: '${options.name}', version: '1.0.0' } });
export default app;
`, { hono: '^4.0.0', '@hono/zod-openapi': '^1.0.0' });
  }
  if (has('neon') || has('d1')) {
    sharedPackage(root, 'db', has('neon') ? `import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
export function createDatabase(connectionString: string) {
  // Pass env.HYPERDRIVE.connectionString from the Worker. Disable caching for authoritative reads in Hyperdrive configuration.
  const client = postgres(connectionString, { prepare: false, max: 5 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
` : `import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.js';
export function createDatabase(binding: Parameters<typeof drizzle>[0]) { return drizzle(binding, { schema }); }
`, { 'drizzle-orm': '^0.45.3', ...(has('neon') ? { postgres: '^3.4.0' } : {}) });
    put(root, 'packages/db/src/schema.ts', '// Define product tables here; generate and review SQL before migration.\nexport {};\n');
    put(root, 'packages/db/drizzle.config.ts', has('neon') ? `import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'postgresql', schema: './src/schema.ts', out: './migrations', dbCredentials: { url: process.env.DATABASE_URL! } });
` : `import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'sqlite', schema: './src/schema.ts', out: './migrations' });
`);
    patchPackage(root, 'packages/db/package.json', { devDependencies: { 'drizzle-kit': '^0.31.0' }, scripts: { 'db:generate': 'drizzle-kit generate' } });
    patchPackage(root, `apps/${runtimeApp}/package.json`, { dependencies: { '@workspace/db': 'workspace:*' } });
  }
  if (has('better-auth')) {
    sharedPackage(root, 'auth', `import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { createDatabase } from '@workspace/db';
export function createAuth(db: ReturnType<typeof createDatabase>${has('neon') ? "['db']" : ''}, secret: string, baseURL: string) {
  return betterAuth({ database: drizzleAdapter(db, { provider: '${has('neon') ? 'pg' : 'sqlite'}' }), secret, baseURL, emailAndPassword: { enabled: true } });
}
`, { 'better-auth': '^1.0.0', '@workspace/db': 'workspace:*' });
    patchPackage(root, `apps/${runtimeApp}/package.json`, { dependencies: { '@workspace/auth': 'workspace:*' } });
    const dbInit = has('neon') ? 'database.db' : 'database';
    const connection = has('neon') ? 'createDatabase(env.HYPERDRIVE.connectionString)' : 'createDatabase(env.DB)';
    if (has('hono')) {
      const source = readFileSync(path.join(root, 'apps/api/src/index.ts'), 'utf8');
      put(root, 'apps/api/src/index.ts', `import { createAuth } from '@workspace/auth';\nimport { createDatabase } from '@workspace/db';\n` + source.replace('export default app;', `app.on(['GET', 'POST'], '/api/auth/*', async (c) => {\n  const env = c.env;\n  const database = ${connection};\n  try { return await createAuth(${dbInit}, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL).handler(c.req.raw); } finally { ${has('neon') ? 'await database.close();' : '/* D1 bindings need no connection cleanup. */'} }\n});\nexport default app;`));
      const config = readJson(root, 'apps/api/wrangler.jsonc');
      json(root, 'apps/api/wrangler.jsonc', { ...config, vars: { BETTER_AUTH_URL: 'http://localhost:8787' } });
    } else {
      put(root, 'apps/web/app/api/auth/[...all]/route.ts', `import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createAuth } from '@workspace/auth';
import { createDatabase } from '@workspace/db';
async function handler(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  const database = ${connection};
  try { return await createAuth(${dbInit}, process.env.BETTER_AUTH_SECRET!, process.env.BETTER_AUTH_URL!).handler(request); }
  finally { ${has('neon') ? 'await database.close();' : '/* D1 bindings need no connection cleanup. */'} }
}
export { handler as GET, handler as POST };
`);
      put(root, 'apps/web/cloudflare-env.d.ts', `interface CloudflareEnv { ${has('neon') ? 'HYPERDRIVE: { connectionString: string };' : "DB: Parameters<typeof import('drizzle-orm/d1').drizzle>[0];"} }\n`);
      patchPackage(root, 'apps/web/package.json', { dependencies: { 'drizzle-orm': '^0.45.3' } });
    }
    put(root, `apps/${runtimeApp}/.dev.vars.example`, 'BETTER_AUTH_SECRET=\nBETTER_AUTH_URL=http://localhost:8787\n');
    if (has('hono')) put(root, 'apps/api/src/secrets.d.ts', 'interface Env { BETTER_AUTH_SECRET: string }\n');
  }
  if (has('clerk')) {
    if (has('next')) {
      patchPackage(root, 'apps/web/package.json', { dependencies: { '@clerk/nextjs': '^7.0.0' } });
      const layoutPath = path.join(root, 'apps/web/app/layout.tsx');
      if (existsSync(layoutPath)) {
        const layout = readFileSync(layoutPath, 'utf8');
        if (!layout.includes('ClerkProvider')) put(root, 'apps/web/app/layout.tsx', 'import { ClerkProvider } from "@clerk/nextjs";\n' + layout.replace('<body>', '<body><ClerkProvider>').replace('</body>', '</ClerkProvider></body>'));
      }
      put(root, 'apps/web/app/sign-in/[[...sign-in]]/page.tsx', 'import { SignIn } from "@clerk/nextjs";\nexport default function SignInPage() { return <SignIn />; }\n');
      put(root, 'apps/web/app/sign-up/[[...sign-up]]/page.tsx', 'import { SignUp } from "@clerk/nextjs";\nexport default function SignUpPage() { return <SignUp />; }\n');
      put(root, 'apps/web/proxy.ts', `import { clerkMiddleware } from '@clerk/nextjs/server';
export default clerkMiddleware();
export const config = { matcher: ['/((?!_next|[^?]*\\\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)', '/(api|trpc)(.*)'] };
`);
      // Middleware makes auth available; product routes must explicitly require identity and authorization.
    }
    if (has('hono')) {
      patchPackage(root, 'apps/api/package.json', { dependencies: { '@clerk/backend': '^3.0.0' } });
      put(root, 'apps/api/src/identity.ts', `import { createClerkClient } from '@clerk/backend';
export async function authenticate(request: Request, secretKey: string, authorizedParties: string[]) {
  return createClerkClient({ secretKey }).authenticateRequest(request, { authorizedParties });
}
`);
    }
  }
  if (has('r2')) {
    put(root, `apps/${runtimeApp}/private-files.md`, '# Private files\n\nFILES is a private R2 Worker binding. Authenticate the request and enforce file-level product authorization before calling get/put/delete. No public buckets, R2 keys, generic download endpoints, or client credentials are generated. Use the binding directly in Hono or getCloudflareContext in Next.js.\n');
  }
  await addServiceWorkers(root, options);
  addProviderPackages(root, options);
  writeStandardRoot(root, options);
}

async function addServiceWorkers(root: string, options: StandardOptions): Promise<void> {
  const has = (value: StandardProduct) => options.products.includes(value);
  if (has('realtime')) {
    worker(root, 'realtime', { ...workerConfig(`${options.name}-realtime`), durable_objects: { bindings: [{ name: 'ROOMS', class_name: 'Room' }] },
      migrations: [{ tag: 'v1', new_sqlite_classes: ['Room'] }] }, `import { DurableObject } from 'cloudflare:workers';
export class Room extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(sender: WebSocket, message: string | ArrayBuffer) {
    if ((typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength) > 16384) { sender.close(1009, 'Message too large'); return; }
    this.ctx.getWebSockets().filter((socket) => socket !== sender).forEach((socket) => socket.send(message));
  }
}
export default {
  async fetch(): Promise<Response> {
    // Authenticate and authorize room membership, then forward to env.ROOMS.getByName(room).fetch(request).
    // Use short-lived single-use tickets for browser WebSockets. Never expose a long-lived service secret.
    return new Response('Configure room authorization before enabling connections', { status: 501 });
  },
};
`);
  }
  if (has('queues')) {
    worker(root, 'jobs', { ...workerConfig(`${options.name}-jobs`), queues: {
      producers: [{ binding: 'JOBS', queue: `${options.name}-jobs` }],
      consumers: [{ queue: `${options.name}-jobs`, max_batch_size: 10, max_retries: 3, dead_letter_queue: `${options.name}-jobs-dlq` }],
    } }, `export default {
  async queue(batch: MessageBatch<unknown>): Promise<void> {
    for (const message of batch.messages) {
      // Add transactional idempotency and product processing before acknowledging.
      console.error('Job handler requires product implementation', message.id);
      message.retry({ delaySeconds: 60 });
    }
  },
};
`);
  }
  if (has('cron')) {
    worker(root, 'scheduled', { ...workerConfig(`${options.name}-scheduled`), triggers: { crons: ['0 * * * *'] } }, `export default {
  async scheduled(controller: ScheduledController): Promise<void> {
    // Define a product schedule, idempotency key, overlap policy, and failure alerts before release.
    console.log('Scheduled trigger', controller.scheduledTime);
  },
};
`);
  }
  if (has('workflows')) {
    worker(root, 'workflows', { ...workerConfig(`${options.name}-workflows`), workflows: [{ name: `${options.name}-workflow`, binding: 'WORKFLOW', class_name: 'ApplicationWorkflow' }] }, `import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
export class ApplicationWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    return step.do('validate', { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' } }, async () => {
      if (!event.payload.operationId) throw new Error('operationId required');
      return { operationId: event.payload.operationId };
    });
  }
}
export default { async fetch() { return new Response('Use an authorized server binding to create workflows', { status: 403 }); } };
`);
  }
}

function addProviderPackages(root: string, options: StandardOptions): void {
  const has = (value: StandardProduct) => options.products.includes(value);
  const providers: Partial<Record<StandardProduct, [string, string, Json]>> = {
    openai: ['ai', "import OpenAI from 'openai';\nexport function createAI(apiKey: string) { return new OpenAI({ apiKey }); }\n", { openai: '^6.0.0' }],
    'ai-sdk': ['ai', "export { generateText, streamText } from 'ai';\nexport { createOpenAI } from '@ai-sdk/openai';\n", { ai: '^6.0.0', '@ai-sdk/openai': '^3.0.0' }],
    resend: ['email', "import { Resend } from 'resend';\nexport function createEmail(apiKey: string) { return new Resend(apiKey); }\n", { resend: '^6.0.0' }],
    stripe: ['billing', "import Stripe from 'stripe';\nexport function createBilling(apiKey: string) { return new Stripe(apiKey); }\n", { stripe: '^20.0.0' }],
    sentry: ['observability', "// Initialize the platform-specific Sentry SDK in each application's runtime entrypoint.\nexport const redactFields = ['authorization', 'cookie', 'password', 'token'];\n", {}],
    posthog: ['analytics', "import { PostHog } from 'posthog-node';\nexport function createAnalytics(apiKey: string, host: string) { return new PostHog(apiKey, { host }); }\n", { 'posthog-node': '^5.0.0' }],
    styling: ['styling', "export const styling = { colors: { foreground: '#171717', background: '#ffffff' }, spacing: { small: 4, medium: 8, large: 16 } } as const;\n", {}],
    'local-data': ['local-data', "// Device-local SQLite and filesystem need platform-specific adapters.\nexport interface LocalDataStore { read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void>; }\n", {}],
  };
  for (const value of options.products) {
    const provider = providers[value];
    if (provider) sharedPackage(root, ...provider);
  }
  if (has('basin')) {
    sharedPackage(root, has('posthog') ? 'basin' : 'analytics', `export interface EventStream { send(events: Record<string, unknown>[]): Promise<void> }
export async function recordEvents(stream: EventStream, events: Record<string, unknown>[]) { await stream.send(events); }
`, {});
  }
  if (has('revenuecat')) {
    put(root, 'packages/billing/revenuecat.md', '# RevenueCat + Stripe\n\nConfigure web/App Store/Play Store products and offerings in client-owned accounts. Add the platform SDK to each selected app. Verify signed provider webhooks, reconcile entitlement authority, and keep transactional idempotent credits/quotas separate from subscription status. No payment activation occurs during init.\n');
  }
}

function writeStandardRoot(root: string, options: StandardOptions): void {
  const has = (value: StandardProduct) => options.products.includes(value);
  const existing = readJson(root, 'package.json');
  const securityOverrides = {
    "sharp@<0.35.5": "0.35.5",
    "source-map-js@<1.2.2": "1.2.2",
    "baseline-browser-mapping@<2.11.0": "2.11.27",
    "browserslist@<4.28.7": "4.29.3",
    "esbuild@<0.25.0": "0.25.12",
    "brace-expansion@<2": "1.1.21",
    "brace-expansion@>=2 <3": "2.1.7",
    "brace-expansion@>=3 <4": "3.0.9",
    "brace-expansion@>=4 <5.0.12": "5.0.12"
  };
  patchPackage(root, 'package.json', { name: options.name, packageManager: PACKAGE_MANAGER, engines: { node: '>=22.13.0' },
    scripts: { dev: 'turbo dev', build: 'turbo build', lint: 'turbo lint', typecheck: 'turbo typecheck',
      test: 'turbo test', audit: 'node scripts/audit.mjs', 'audit:full': 'fallow --fail-on-issues', 'audit:deps': 'pnpm audit --prod --audit-level high', check: 'pnpm lint && pnpm typecheck && pnpm run audit && pnpm audit:deps && pnpm test && pnpm build' },
    devDependencies: { fallow: '^3.31.0' },
    // Upstream starter lockfiles can retain vulnerable transitive versions. Keep fixes within compatible majors.
    pnpm: { ...existing.pnpm, overrides: { ...existing.pnpm?.overrides, ...securityOverrides } } });
  put(root, 'scripts/audit.mjs', `import { spawnSync } from 'node:child_process';
const base = process.env.AUDIT_BASE;
const hasBase = base || ['origin/main', 'main'].find((ref) => spawnSync('git', ['rev-parse', '--verify', ref], { stdio: 'ignore' }).status === 0);
const args = hasBase ? ['exec', 'fallow', 'audit', '--base', hasBase] : ['exec', 'fallow', '--fail-on-issues'];
const result = spawnSync('pnpm', args, { stdio: 'inherit', shell: false });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
`);
  json(root, '.fallowrc.json', { ignorePatterns: ['**/next-env.d.ts', '**/.next/**', '**/.open-next/**', '**/.wrangler/**', '**/dist/**', '**/worker-configuration.d.ts', '**/cloudflare-env.d.ts'] });
  const turbo = readJson(root, 'turbo.json');
  turbo.globalEnv = ['DATABASE_URL', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'OPENAI_API_KEY', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'POSTHOG_API_KEY', 'POSTHOG_HOST', 'SENTRY_DSN'];
  turbo.tasks = { ...turbo.tasks, test: { dependsOn: ['^build'], outputs: ['coverage/**'] },
    build: { ...turbo.tasks.build, outputs: ['.next/**', '!.next/cache/**', '.open-next/**', 'dist/**', '.output/**'] } };
  json(root, 'turbo.json', turbo);
  const workspaceFile = path.join(root, 'pnpm-workspace.yaml');
  const workspace = readFileSync(workspaceFile, 'utf8');
  // Keep the upstream package globs and other policies; translate only the build approval section for pnpm 10.
  const policy = 'onlyBuiltDependencies:\n' + ['esbuild', 'sharp', 'unrs-resolver', 'workerd', ...(has('electron') ? ['electron'] : [])].map((name) => `  - ${name}\n`).join('');
  const section = /(?:allowBuilds|onlyBuiltDependencies):\n(?:[ \t]+[^\n]*\n|[ \t]*\n)*/;
  put(root, 'pnpm-workspace.yaml', section.test(workspace) ? workspace.replace(section, policy) : workspace + '\n' + policy);
  appendGitignore(root, ['node_modules/', '.open-next/', '.wrangler/', '.dev.vars', '.dev.vars.*', '!.dev.vars.example', '.env', '.env.*', '!.env.example', '.fallow/']);
  const environment = [
    has('neon') ? 'DATABASE_URL=' : '', has('clerk') ? 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\nCLERK_SECRET_KEY=' : '',
    has('better-auth') ? 'BETTER_AUTH_SECRET=\nBETTER_AUTH_URL=' : '',
    has('openai') || has('ai-sdk') ? 'OPENAI_API_KEY=' : '', has('resend') ? 'RESEND_API_KEY=' : '',
    has('stripe') ? 'STRIPE_SECRET_KEY=\nSTRIPE_WEBHOOK_SECRET=' : '',
    has('posthog') ? 'POSTHOG_API_KEY=\nPOSTHOG_HOST=' : '', has('sentry') ? 'SENTRY_DSN=' : '',
  ].filter(Boolean).join('\n');
  put(root, '.env.example', environment + '\n');
  json(root, 'anhedral.standard.json', { schemaVersion: 1, standard: 'anhedral-application-stack', products: options.products,
    hosting: has('next') ? options.hosting : null, bootstrap: { command: 'pnpm dlx shadcn@latest init --monorepo --template next', upstreamPackageManager: existing.packageManager },
    status: 'starter', resourcesProvisioned: false });
  const agentsFile = path.join(root, 'AGENTS.md');
  const existingAgents = existsSync(agentsFile) && has('next') ? readFileSync(agentsFile, 'utf8') + '\n' : '';
  put(root, 'AGENTS.md', existingAgents + `# Anhedral delivery standard

Keep accounts, source, infrastructure, billing, and recovery client-owned. Use macOS, OpenAI/Codex, Computer Use and Control Chrome during implementation and verification. Use provider plugins, APIs/MCP and CLIs for operations; Cloudflare plugin + cf where available, Wrangler for project commands.

Cloudflare-first, free-first where suitable. Human approval is required for paid activation, material spending, architecture exceptions, and production releases. Do not deploy or activate providers as part of initialization.

Add apps and shared packages only when needed. All services belong in apps/*, reusable code in packages/*. Shared styling is named styling. Keep secrets and privileged integrations out of client bundles. Use Clerk, Better Auth, or no auth according to project needs. Protect product routes explicitly and implement resource authorization.

Use private R2 Worker bindings. KV is eventually consistent configuration/cache, never transactional authority. Neon uses Drizzle + Hyperdrive; disable Hyperdrive query caching for auth, permissions, entitlements, balances, quotas, financial records and paid-unit consumption. Define job retries, concurrency, idempotency and failure handling. Review SQL migrations before applying them.

Developer tooling includes Cloudflare’s security-audit skill (https://github.com/cloudflare/security-audit-skill) for repository security reviews.

Run pnpm check. Use pnpm exec fallow during development and pnpm exec fallow audit for changes. Fix legitimate findings; use narrow documented exceptions. Verify real UI flows with Computer Use and Control Chrome, plus relevant integrations, native apps/simulators, and deployed previews. Keep production release approval separate from deterministic checks.
`);
  put(root, 'README.md', `# ${options.name}

Initialized from the official shadcn pnpm/Turborepo monorepo, with the Anhedral Application Stack & Delivery Standard.

Selected: ${options.products.join(', ')}. ${has('next') ? `Next.js hosting: ${options.hosting === 'cloudflare' ? 'Cloudflare Workers + OpenNext' : 'Vercel (explicit architecture exception)'}.` : ''}

Run pnpm install, commit pnpm-lock.yaml, then pnpm dev. Run pnpm check for lint, types, Fallow audit, tests and build. Without a Git comparison base, audit runs the full Fallow gate. Add meaningful product tests and integration checks as behavior is implemented. The tests task runs only workspaces that define tests; init does not claim product verification.

Cloudflare bindings contain REPLACE_WITH_* IDs. Create separate preview/production resources in client-owned accounts, replace IDs, and generate Worker types before development. Workers expose local dev and explicit deploy scripts. Next.js uses pnpm --filter web preview to exercise the Workers runtime (use the actual package name from apps/web/package.json). No infrastructure or production deployment is performed by init.

${has('next') && options.hosting === 'cloudflare' ? 'OpenNext is configured without a provisioned incremental-cache bucket. Choose and configure a cache adapter before using ISR or cache features that require shared persistence.\n' : ''}
${has('neon') ? 'Create Hyperdrive against Neon; disable query caching for correctness-sensitive reads. DATABASE_URL is for reviewed migration tooling, while Workers use the HYPERDRIVE binding. Close direct PostgreSQL clients after use.\n' : ''}
${has('better-auth') ? 'Generate Better Auth tables into the Drizzle schema, review and apply migrations before using /api/auth. Configure BETTER_AUTH_SECRET, BETTER_AUTH_URL and trusted origins for the correct environment.\n' : ''}
${has('clerk') ? 'Clerk middleware exposes server identity; protect selected routes explicitly. The web starter includes ClerkProvider and sign-in/sign-up pages. Configure the selected native SDKs when implementing account flows.\n' : ''}
${has('r2') ? 'FILES is a private R2 binding. Implement authentication and file-level authorization before exposing file routes. Clients never receive R2 credentials.\n' : ''}
${has('realtime') ? 'Durable Object rooms support hibernating WebSockets; the public entrypoint remains disabled until room authorization and short-lived tickets are implemented.\n' : ''}
${has('queues') ? 'Queue processing retries unimplemented jobs and uses a dead-letter queue. Add product processing and transactional idempotency before acknowledging messages.\n' : ''}
${has('basin') ? 'Basin uses a Pipelines stream binding. Configure its stream, sink, R2/catalog and SQL in client-owned infrastructure; it is distinct from operational logs.\n' : ''}
Provider packages are SDK factories or integration boundaries, not finished business features. Connect only needed packages to server entrypoints. Billing needs verified webhooks and idempotent consumption; RevenueCat adds cross-store entitlement configuration. Local data needs a platform-specific SQLite/filesystem adapter. Sentry needs a platform SDK and runtime initialization. Native auth and subscriptions need platform-specific setup.

Outbound application mail uses Resend. Inbound forwarding uses Cloudflare Email Routing. Keep the existing business mailbox provider. GitHub Actions runs PR checks and never deploys automatically. Human approval is required for paid activation, material spending, architecture exceptions and production releases.
`);
  put(root, '.github/workflows/check.yml', `name: Check
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
        with:
          node-version: '22'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm typecheck && pnpm audit:deps
      - name: Audit pull request
        if: github.event_name == 'pull_request'
        env:
          AUDIT_BASE: \${{ github.event.pull_request.base.sha }}
        run: pnpm exec fallow audit --base "$AUDIT_BASE"
      - name: Audit branch
        if: github.event_name != 'pull_request'
        run: pnpm audit:full
      - run: pnpm test && pnpm build
`);
}

export type StandardRunner = (command: string, args: string[], cwd: string) => void;
const defaultRunner: StandardRunner = (command, args, cwd) => execFile(command, args, cwd);
export async function scaffoldStandardProject(options: StandardOptions, run: StandardRunner = defaultRunner): Promise<void> {
  const plan = { standard: 'anhedral-application-stack', root: options.root, products: options.products, hosting: options.hosting,
    bootstrap: ['pnpm', 'dlx', 'shadcn@latest', 'init', '--monorepo', '--template', 'next'], dryRun: options.dryRun };
  if (options.dryRun) { console.log(options.json ? JSON.stringify(plan, null, 2) : JSON.stringify(plan)); return; }
  const root = options.root;
  const previousQuiet = process.env.ANHEDRAL_QUIET;
  if (options.json) process.env.ANHEDRAL_QUIET = '1';
  let created = false;
  if (!existsSync(root)) { mkdirSync(root, { recursive: true }); created = true; }
  try {
    if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error('Destination must be a real directory.');
    const unexpected = readdirSync(root).filter((name) => !['.git', '.gitignore'].includes(name));
    if (unexpected.length) throw new Error(`Destination must be empty (apart from .git/.gitignore): ${unexpected[0]}`);
    const commitPaths: string[] = [];
    await runStagedTransaction(root, { commitPaths, seedPaths: existsSync(path.join(root, '.gitignore')) ? ['.gitignore'] : [],
      prepare: () => {
        const entries = readdirSync(root).filter((name) => !['.git', '.gitignore', '.anhedral.lock', '.anhedral-txn'].includes(name));
        if (entries.length) throw new Error('Destination changed before generation.');
      },
      build: async (stageRoot) => {
        const bootstrap = path.join(stageRoot, '.bootstrap');
        mkdirSync(bootstrap);
        run('pnpm', ['dlx', 'shadcn@latest', 'init', '--monorepo', '--template', 'next', '--defaults', '--name', options.name, '--cwd', bootstrap], stageRoot);
        const generated = path.join(bootstrap, options.name);
        if (!existsSync(path.join(generated, 'pnpm-workspace.yaml')) || !existsSync(path.join(generated, 'apps/web/package.json'))) throw new Error('Official shadcn bootstrap did not produce the expected monorepo.');
        const seededIgnore = existsSync(path.join(stageRoot, '.gitignore')) ? readFileSync(path.join(stageRoot, '.gitignore'), 'utf8') : '';
        for (const entry of readdirSync(generated)) {
          if (['.git', 'node_modules', '.next', '.turbo'].includes(entry)) continue;
          cpSync(path.join(generated, entry), path.join(stageRoot, entry), { recursive: true, filter: (source) => !['node_modules', '.git', '.next', '.turbo'].includes(path.basename(source)) });
        }
        rmSync(bootstrap, { recursive: true, force: true });
        if (seededIgnore) appendGitignore(stageRoot, seededIgnore.split(/\r?\n/));
        await applyStandardOverlays(stageRoot, options);
        run('pnpm', ['install', '--lockfile-only', '--no-frozen-lockfile'], stageRoot);
        commitPaths.push(...readdirSync(stageRoot).filter((name) => name !== 'node_modules'));
      },
      afterCommit: () => {
        if (options.initializeGit && spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, stdio: 'ignore' }).status !== 0) run('git', ['init'], root);
        if (!options.skipInstall) run('pnpm', ['install', '--frozen-lockfile'], root);
      },
    });
    console.log(options.json ? JSON.stringify({ ...plan, generated: true }) : `Created ${root}. Follow README.md for resource setup, verification and delivery.`);
  } finally {
    if (created && existsSync(root) && readdirSync(root).length === 0) rmdirSync(root);
    if (previousQuiet === undefined) delete process.env.ANHEDRAL_QUIET;
    else process.env.ANHEDRAL_QUIET = previousQuiet;
  }
}

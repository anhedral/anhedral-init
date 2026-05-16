import path from 'node:path';
import { writeFile, execCommand } from '../util.js';
import { anhedralPrint } from '../print.js';
import { getBackendInstallCommands } from '../commands.js';
import { BACKEND_DEPENDENCIES } from '../dependencies.js';
import type { ProjectOptions } from '../scaffold.js';

export async function scaffoldBackend(root: string, { projectName, displayName, frontendUrl, skipInstall }: ProjectOptions): Promise<void> {
  const dir = path.join(root, 'Backend');

  anhedralPrint.section('Backend (Fastify)');
  anhedralPrint.step('Writing backend source files');
  writePackageJson(dir, projectName);
  writeTsConfig(dir);
  writeEslintConfig(dir);
  writeGitignore(dir);
  writeEnvExample(dir, frontendUrl);
  writeEnvFile(dir, frontendUrl);
  writeDrizzleConfig(dir);
  writeVitestConfig(dir);

  writeTypes(dir);
  writeDbFiles(dir);
  writeErrorFiles(dir);
  writeLibFiles(dir);
  writePlugins(dir);
  writeConfig(dir);
  writeRepositories(dir);
  writeRoutes(dir, displayName);
  writeAppAndIndex(dir, displayName);
  writeVercelConfig(dir);
  writeTestFiles(dir);
  anhedralPrint.done('Backend source files written');

  if (skipInstall) {
    anhedralPrint.info('Skipping backend dependency install (--skip-install)');
    anhedralPrint.info('Run after init: pnpm install');
    return;
  }

  anhedralPrint.step('Installing backend dependencies');
  for (const command of getBackendInstallCommands()) {
    execCommand(command.command, command.args, dir);
  }
  anhedralPrint.done('Backend dependencies installed');
}

// ═══════════════════════════════════════════════════════════════════════════
// Config files
// ═══════════════════════════════════════════════════════════════════════════

function writePackageJson(dir: string, projectName: string): void {
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: projectName + '-backend',
    version: '1.0.0',
    description: `${projectName} Backend`,
    type: 'module',
    scripts: {
      dev: 'tsx --env-file=.env --watch src/index.ts',
      build: 'pnpm typecheck',
      typecheck: 'tsc --noEmit',
      'db:generate': 'drizzle-kit generate',
      'db:migrate': 'pnpm --filter @shared/db db:migrate',
      'db:studio': 'drizzle-kit studio',
      'db:check': 'drizzle-kit check',
      'db:push': 'drizzle-kit push',
      lint: 'eslint . --ext .js,.ts',
      test: 'vitest run',
      'test:watch': 'vitest',
    },
    keywords: [],
    license: 'MIT',
    dependencies: BACKEND_DEPENDENCIES.dependencies,
    devDependencies: BACKEND_DEPENDENCIES.devDependencies,
  }, null, 2) + '\n');
}

function writeTsConfig(dir: string): void {
  writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      skipLibCheck: true,
      rootDir: '.',
      outDir: 'dist',
      lib: ['ESNext', 'DOM', 'DOM.Iterable'],
      types: ['node'],
      sourceMap: true,
      declaration: true,
      declarationMap: true,
      strict: true,
      noUncheckedIndexedAccess: true,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    include: ['src/**/*', 'api/**/*'],
    exclude: ['node_modules'],
  }, null, 2) + '\n');
}

function writeEslintConfig(dir: string): void {
  writeFile(path.join(dir, 'eslint.config.mjs'), `import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  { languageOptions: { globals: globals.node } },
  ...tseslint.configs.recommended,
);
`);
}

function writeGitignore(dir: string): void {
  writeFile(path.join(dir, '.gitignore'), `node_modules/
dist/
.env
.env.*
!.env.example
*.log
*.tsbuildinfo
`);
}

function writeEnvExample(dir: string, frontendUrl = 'http://localhost:8081'): void {
  writeFile(path.join(dir, '.env.example'), `# Server
PORT=8787
NODE_ENV=development
LOG_LEVEL=info
ANHEDRAL_DEMO=false

# Database (NeonDB)
DATABASE_URL="postgresql://neondb_owner:***@***.neon.tech/neondb?sslmode=require"

# Clerk
CLERK_PUBLISHABLE_KEY="pk_test_***"
CLERK_SECRET_KEY="sk_test_***"

# CORS
FRONTEND_URL=${frontendUrl}
EXTENSION_ORIGINS=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# RevenueCat
RC_SECRET_API_KEY=
RC_WEBHOOK_SECRET=
RC_ENTITLEMENT_ID=pro
RC_OFFERING_ID=default
`);
}

function writeEnvFile(dir: string, frontendUrl = 'http://localhost:8081'): void {
  writeFile(path.join(dir, '.env'), `# Server
PORT=8787
NODE_ENV=development
LOG_LEVEL=info
ANHEDRAL_DEMO=true

# Database (NeonDB)
DATABASE_URL="postgresql://user:pass@localhost:5432/app?sslmode=disable"

# Clerk
CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""

# CORS
FRONTEND_URL=${frontendUrl}
EXTENSION_ORIGINS=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# RevenueCat
RC_SECRET_API_KEY=
RC_WEBHOOK_SECRET=
RC_ENTITLEMENT_ID=pro
RC_OFFERING_ID=default
`);
}

function writeDrizzleConfig(dir: string): void {
  writeFile(path.join(dir, 'drizzle.config.ts'), `import type { Config } from 'drizzle-kit';
export default {
  schema: '../../packages/db/src/schema.ts',
  out: '../../packages/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! }
} satisfies Config;
`);
}

function writeVitestConfig(dir: string): void {
  writeFile(path.join(dir, 'vitest.config.ts'), `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
  },
});
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

function writeTypes(dir: string): void {
  writeFile(path.join(dir, 'src/types/index.ts'), `import type { SubscriptionTier, SubscriptionStatus } from '../db/schema.js';

export interface AppUser {
  id: string;
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
}

export interface AppEnv {
  PORT: number;
  NODE_ENV: string;
  LOG_LEVEL: string;
  ANHEDRAL_DEMO?: string | null;
  CLERK_PUBLISHABLE_KEY?: string | null;
  CLERK_SECRET_KEY?: string | null;
  FRONTEND_URL?: string | null;
  EXTENSION_ORIGINS?: string | null;
  DATABASE_URL?: string | null;
  R2_ACCOUNT_ID?: string | null;
  R2_ACCESS_KEY_ID?: string | null;
  R2_SECRET_ACCESS_KEY?: string | null;
  R2_BUCKET?: string | null;
  RC_SECRET_API_KEY: string;
  RC_WEBHOOK_SECRET: string;
  RC_ENTITLEMENT_ID: string;
  RC_OFFERING_ID: string;
}
`);

  writeFile(path.join(dir, 'src/types/fastify-env.d.ts'), `import 'fastify';
import type { AppEnv } from '../types/index.js';

type FastifyReplyType = import('fastify').FastifyReply;
type FastifyRequestType = import('fastify').FastifyRequest;

declare module 'fastify' {
  interface FastifyInstance {
    env: AppEnv;
    authenticate?: (req: FastifyRequestType, reply: FastifyReplyType) => Promise<void> | void;
  }

  interface FastifyRequest {
    _startedAt?: number;
  }
}
`);

  writeFile(path.join(dir, 'src/types/fastify.d.ts'), `import 'fastify';
import type { AppConfig } from '../config/index.js';
import type { Repositories } from '../repositories/index.js';
import type { AppUser } from '../types/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    config: AppConfig;
    repos: Repositories;
  }

  interface FastifyRequest {
    user?: AppUser;
    _startedAt?: number;
    waitUntil?: (promise: Promise<unknown>) => void;
  }
}

export {};
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Database
// ═══════════════════════════════════════════════════════════════════════════

function writeDbFiles(dir: string): void {
  writeFile(path.join(dir, 'src/db/index.ts'), `export { db } from '@shared/db';
export type { Database } from '@shared/db';
`);

  writeFile(path.join(dir, 'src/db/schema.ts'), `export * from '@shared/db/schema';
`);

  writeFile(path.join(dir, 'src/db/migrate.ts'), `import '@shared/db/migrate';
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Errors
// ═══════════════════════════════════════════════════════════════════════════

function writeErrorFiles(dir: string): void {
  writeFile(path.join(dir, 'src/errors/AppError.ts'), `export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    const json: { error: string; message: string; details?: unknown } = {
      error: this.code,
      message: this.message,
    };
    if (this.details !== undefined) json.details = this.details;
    return json;
  }
}
`);

  writeFile(path.join(dir, 'src/errors/AuthError.ts'), `import { AppError } from './AppError.js';

export class AuthError extends AppError {
  constructor(code: string, message: string, details?: unknown, statusCode: number = 401) {
    super(code, statusCode, message, details);
  }

  static missingAuthorization() {
    return new AuthError('missing_authorization', 'Authorization header is required');
  }

  static invalidAuthorization() {
    return new AuthError('invalid_authorization', 'Invalid authorization credentials');
  }

  static invalidToken() {
    return new AuthError('invalid_session_token', 'Invalid or malformed authentication token');
  }

  static tokenExpired() {
    return new AuthError('token_expired', 'Authentication token has expired');
  }

  static userRequired() {
    return new AuthError('user_authentication_required', 'This endpoint requires user authentication (JWT token)');
  }

  static unauthorized() {
    return new AuthError('unauthorized', 'Authentication required');
  }

  static forbidden() {
    return new AuthError('forbidden', 'Insufficient permissions', undefined, 403);
  }
}
`);

  writeFile(path.join(dir, 'src/errors/ValidationError.ts'), `import { AppError } from './AppError.js';

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('validation_error', 400, message, details);
  }

  static missingField(field: string) {
    return new ValidationError(\`Required field is missing: \${field}\`, { field });
  }

  static invalidFormat(field: string, expected: string) {
    return new ValidationError(\`Invalid format for \${field}. Expected: \${expected}\`, { field, expected });
  }
}
`);

  writeFile(path.join(dir, 'src/errors/NotFoundError.ts'), `import { AppError } from './AppError.js';

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('not_found', 404, \`\${resource} not found\`);
  }
}
`);

  writeFile(path.join(dir, 'src/errors/RateLimitError.ts'), `import { AppError } from './AppError.js';

export class RateLimitError extends AppError {
  constructor(message: string, details?: unknown) {
    super('rate_limited', 429, message, details);
  }

  static dailyLimit(resource: string, limit: number) {
    return new RateLimitError(
      \`Daily \${resource} limit reached (\${limit} requests per day)\`,
      { resource, limit, window: '24h' }
    );
  }

  static tooManyRequests(retryAfter?: number) {
    return new RateLimitError('Too many requests. Please try again later.', { retryAfter });
  }
}
`);

  writeFile(path.join(dir, 'src/errors/ServerError.ts'), `import { AppError } from './AppError.js';

export class ServerError extends AppError {
  constructor(message: string, details?: unknown) {
    super('server_error', 500, message, details);
  }

  static generic(details?: unknown) {
    return new ServerError('An internal server error occurred', details);
  }

  static missingConfiguration(key: string) {
    return new ServerError(\`Server misconfiguration: \${key} is not defined\`, { missingKey: key });
  }

  static databaseError(operation: string, error?: unknown) {
    return new ServerError(\`Database operation failed: \${operation}\`, { operation, error });
  }
}
`);

  writeFile(path.join(dir, 'src/errors/errorHandler.ts'), `import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './AppError.js';

export function errorHandler(
  error: Error | FastifyError,
  req: FastifyRequest,
  reply: FastifyReply
) {
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode =
    error instanceof AppError
      ? error.statusCode
      : ('statusCode' in error && typeof error.statusCode === 'number')
          ? error.statusCode
          : ('validation' in error && (error as FastifyError).validation)
              ? 400
              : 500;

  const logPayload = {
    msg: '[error_handler]',
    id: req.id,
    method: req.method,
    url: req.url,
    statusCode,
    errorName: error.name,
    errorMessage: error.message,
    errorCode: (error as AppError).code,
    ...(isProduction && statusCode < 500 ? {} : { stack: error.stack }),
  };

  if (statusCode < 500) {
    req.log.warn(logPayload);
  } else {
    req.log.error(logPayload);
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(error.toJSON());
  }

  if ('validation' in error && error.validation) {
    const validation = error.validation as Array<{ instancePath?: string; params?: { missingProperty?: string }; keyword?: string }>;
    const missingField = validation.find(v => v.keyword === 'required');
    if (missingField && missingField.params?.missingProperty) {
      return reply.status(400).send({
        error: 'missing_field',
        message: \`Required field is missing: \${missingField.params.missingProperty}\`,
        details: { field: missingField.params.missingProperty },
      });
    }
    return reply.status(400).send({
      error: 'validation_error',
      message: 'Invalid request',
      details: isProduction ? undefined : error.validation,
    });
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return reply.status(error.statusCode).send({
      error: error.name || 'error',
      message: error.message,
    });
  }

  return reply.status(500).send({ error: 'server_error', message: 'An unexpected error occurred' });
}
`);

  writeFile(path.join(dir, 'src/errors/index.ts'), `export { AppError } from './AppError.js';
export { AuthError } from './AuthError.js';
export { ValidationError } from './ValidationError.js';
export { NotFoundError } from './NotFoundError.js';
export { RateLimitError } from './RateLimitError.js';
export { ServerError } from './ServerError.js';
export { errorHandler } from './errorHandler.js';
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Lib
// ═══════════════════════════════════════════════════════════════════════════

function writeLibFiles(dir: string): void {
  writeFile(path.join(dir, 'src/lib/routeHelpers.ts'), `import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { AuthError } from '../errors/index.js';

export function createAuthHook(fastify: FastifyInstance) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (typeof fastify.authenticate === 'function') {
      await fastify.authenticate(req, reply);
    } else {
      throw AuthError.unauthorized();
    }
  };
}

export function runBackgroundTask(
  req: FastifyRequest,
  task: Promise<unknown>,
  label?: string
): void {
  const wrapped = task.catch((error) => {
    req.log.warn({
      msg: '[background_task_failed]',
      label,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  if (typeof req.waitUntil === 'function') {
    req.waitUntil(wrapped);
  } else {
    void wrapped;
  }
}
`);

  writeFile(path.join(dir, 'src/lib/lruCache.ts'), `interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttlMs: number;
  private pruneIntervalMs: number;
  private lastPruneAt = 0;

  constructor(opts: { maxSize: number; ttlMs: number; pruneIntervalMs?: number }) {
    this.maxSize = opts.maxSize;
    this.ttlMs = opts.ttlMs;
    this.pruneIntervalMs = opts.pruneIntervalMs ?? Math.max(opts.ttlMs * 2, 60_000);
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.delete(key);
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.evictIfNeeded();
    this.maybePrune();
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
      else break;
    }
  }

  private maybePrune(): void {
    const now = Date.now();
    if (now - this.lastPruneAt < this.pruneIntervalMs) return;
    this.lastPruneAt = now;
    const expired: string[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) expired.push(key);
    }
    for (const key of expired) this.cache.delete(key);
  }
}
`);

  writeFile(path.join(dir, 'src/lib/fetchWithTimeout.ts'), `export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = 60000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(\`Request timeout after \${timeout}ms: \${url}\`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchWithTimeoutAndRetry(
  url: string,
  options: FetchWithTimeoutOptions = {},
  retries = 0
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Request failed');
}
`);

  writeFile(path.join(dir, 'src/lib/constants.ts'), `export {
  SUBSCRIPTION_TIERS, SUBSCRIPTION_STATUSES, SUBSCRIPTION_METHODS, SUBSCRIPTION_ORIGINS,
  type SubscriptionTier, type SubscriptionStatus, type SubscriptionMethod, type SubscriptionOrigin,
} from '../db/schema.js';

export const TIER_LIMITS = {
  free: { tier: 'free' as const, dailyLimit: 0 },
  pro:  { tier: 'pro'  as const, dailyLimit: null },
} as const;

export const TIER_PRICING = {
  free: { tier: 'free' as const, priceMonthly: 0,  priceYearly: 0,  currency: 'USD', displayName: 'Free', description: 'Get started for free' },
  pro:  { tier: 'pro'  as const, priceMonthly: 5,  priceYearly: 54, currency: 'USD', displayName: 'Pro',  description: 'Unlimited access' },
} as const;

export const CACHE_SECONDS = {
  SUBSCRIPTIONS_PRICING: 60,
} as const;
`);

  writeFile(path.join(dir, 'src/lib/revenuecat.ts'), `import { createHmac } from 'node:crypto';
import { fetchWithTimeout } from './fetchWithTimeout.js';
import { LRUCache } from './lruCache.js';

export interface RevenueCatEntitlement {
  pro: boolean;
  expiresAt?: string;
  purchaseDate?: string;
  managementUrl?: string;
  cancelAtPeriodEnd?: boolean;
}

const RC_CACHE_TTL_MS = process.env.NODE_ENV === 'production' ? 60_000 : 10_000;
const rcEntitlementCache = new LRUCache<RevenueCatEntitlement>({ maxSize: 100_000, ttlMs: RC_CACHE_TTL_MS });
const inflightCached = new Map<string, Promise<RevenueCatEntitlement>>();
const inflightForced  = new Map<string, Promise<RevenueCatEntitlement>>();

export function invalidateRcEntitlementCache(appUserId: string, entitlementId: string): void {
  rcEntitlementCache.invalidate(\`\${entitlementId}:\${appUserId}\`);
}

interface RcSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string; purchase_date?: string; product_identifier?: string; will_renew?: boolean | null; unsubscribe_detected_at?: string | null }>;
    subscriptions?: Record<string, { expires_date?: string; management_url?: string; unsubscribe_detected_at?: string | null }>;
    management_url?: string;
  };
}

export async function getRcEntitlement(
  appUserId: string, entitlementId: string, apiKey: string, opts?: { bypassCache?: boolean }
): Promise<RevenueCatEntitlement> {
  const cacheKey = \`\${entitlementId}:\${appUserId}\`;
  const bypass = opts?.bypassCache === true;

  if (!bypass) {
    const cached = rcEntitlementCache.get(cacheKey);
    if (cached) return cached;
    const inflight = inflightCached.get(cacheKey);
    if (inflight) return inflight;
  } else {
    const inflight = inflightForced.get(cacheKey);
    if (inflight) return inflight;
  }

  const map = bypass ? inflightForced : inflightCached;
  const p = (async (): Promise<RevenueCatEntitlement> => {
    const res = await fetchWithTimeout(\`https://api.revenuecat.com/v1/subscribers/\${encodeURIComponent(appUserId)}\`, {
      headers: { Authorization: \`Bearer \${apiKey}\` }, timeout: 60_000,
    });
    if (res.status === 404) return { pro: false };
    if (!res.ok) throw new Error(\`RevenueCat API error: \${res.status}\`);

    const data = (await res.json()) as RcSubscriberResponse;
    const now  = new Date();
    const ent  = data.subscriber?.entitlements?.[entitlementId];
    const entExpires = ent?.expires_date ? new Date(ent.expires_date) : null;
    const entActive  = entExpires ? entExpires > now : false;

    const subs = data.subscriber?.subscriptions ?? {};
    let bestSub: { expires_date?: string; management_url?: string; unsubscribe_detected_at?: string | null } | undefined;
    let bestSubExpires: Date | null = null;
    for (const sub of Object.values(subs)) {
      const d = sub?.expires_date ? new Date(sub.expires_date) : null;
      if (!d || !Number.isFinite(d.getTime())) continue;
      if (!bestSubExpires || d > bestSubExpires) { bestSubExpires = d; bestSub = sub; }
    }

    const pro = entActive || (bestSubExpires ? bestSubExpires > now : false);
    const productId = ent?.product_identifier;
    const entSub    = productId ? data.subscriber?.subscriptions?.[productId] : undefined;
    const managementUrl = entSub?.management_url || bestSub?.management_url || data.subscriber?.management_url;
    const cancelAtPeriodEnd = ent?.will_renew === false || ent?.unsubscribe_detected_at != null
      || (entSub?.unsubscribe_detected_at ?? bestSub?.unsubscribe_detected_at) != null;

    const entMs = entExpires?.getTime() ?? 0;
    const subMs = bestSubExpires?.getTime() ?? 0;
    const bestMs = Math.max(entMs, subMs);
    const expiresAt = bestMs ? new Date(bestMs).toISOString() : undefined;

    return { pro, expiresAt, purchaseDate: ent?.purchase_date, managementUrl, cancelAtPeriodEnd };
  })();

  map.set(cacheKey, p);
  try {
    const value = await p;
    if (!bypass && value.pro) rcEntitlementCache.set(cacheKey, value);
    return value;
  } finally {
    map.delete(cacheKey);
  }
}

export function verifyRevenueCatWebhook(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  try {
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'v1' || !parts[1]) return false;
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const computed = hmac.digest('hex');
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(parts[1], 'hex');
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return result === 0;
  } catch { return false; }
}

export function verifyRevenueCatWebhookAuthorization(authHeader: string | undefined, secret: string): boolean {
  if (!authHeader) return false;
  const normalize = (v: string) => v.trim().replace(/^bearer\\s+/i, '');
  return normalize(authHeader) === normalize(secret);
}
`);

  writeFile(path.join(dir, 'src/lib/r2.ts'), `import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type UploadObjectInput = {
  objectKey: string;
  contentType: string;
};

function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET
  );
}

function getR2Client() {
  if (!hasR2Config()) {
    throw new Error('R2 is not configured');
  }

  return new S3Client({
    region: 'auto',
    endpoint: \`https://\${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com\`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
}

function getBucket() {
  if (!process.env.R2_BUCKET) {
    throw new Error('R2_BUCKET is not configured');
  }

  return process.env.R2_BUCKET;
}

export function isR2Configured() {
  return hasR2Config();
}

export async function createSignedUploadUrl(input: UploadObjectInput, expiresIn = 60 * 10) {
  const client = getR2Client();
  const bucket = getBucket();

  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: input.objectKey,
    ContentType: input.contentType,
  }), { expiresIn });

  return {
    bucket,
    objectKey: input.objectKey,
    uploadUrl,
    expiresIn,
  };
}

export async function createSignedDownloadUrl(objectKey: string, expiresIn = 60 * 10) {
  const client = getR2Client();
  const downloadUrl = await getSignedUrl(client, new GetObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  }), { expiresIn });

  return { objectKey, downloadUrl, expiresIn };
}

export async function deleteObjectFromR2(objectKey: string) {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  }));
}
`);

  writeFile(path.join(dir, 'src/services/SubscriptionService.ts'), `import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getRcEntitlement, invalidateRcEntitlementCache } from '../lib/revenuecat.js';
import { TIER_PRICING, TIER_LIMITS } from '../lib/constants.js';
import type { Subscriptions, SubscriptionEventType } from '../db/schema.js';
import type { RecordEventParams } from '../repositories/index.js';
import { runBackgroundTask } from '../lib/routeHelpers.js';

export interface EntitlementWithTrial {
  tier: 'free' | 'pro';
  pro: boolean;
  inTrial: boolean;
  trialEndsAt?: string;
  expiresAt?: string;
  periodStart?: string;
  periodEnd?: string;
  method?: 'trialing' | 'redeemed' | 'paid' | null;
  managementUrl?: string;
  cancelAtPeriodEnd?: boolean;
}

export class SubscriptionService {
  constructor(private fastify: FastifyInstance) {}

  private async recordEvent(req: FastifyRequest | undefined, params: RecordEventParams, label: string): Promise<void> {
    const task = this.fastify.repos.subscriptionEvents.recordEvent(params);
    if (req) { runBackgroundTask(req, task, label); return; }
    await task;
  }

  async getPricing() {
    return {
      tiers: [
        { tier: TIER_PRICING.free.tier, displayName: TIER_PRICING.free.displayName, description: TIER_PRICING.free.description, priceMonthly: TIER_PRICING.free.priceMonthly, priceYearly: TIER_PRICING.free.priceYearly, currency: TIER_PRICING.free.currency, limits: { dailyLimit: TIER_LIMITS.free.dailyLimit } },
        { tier: TIER_PRICING.pro.tier,  displayName: TIER_PRICING.pro.displayName,  description: TIER_PRICING.pro.description,  priceMonthly: TIER_PRICING.pro.priceMonthly,  priceYearly: TIER_PRICING.pro.priceYearly,  currency: TIER_PRICING.pro.currency,  limits: { dailyLimit: TIER_LIMITS.pro.dailyLimit }, paymentInfo: { revenueCatEntitlementId: this.fastify.env.RC_ENTITLEMENT_ID, revenueCatOfferingId: this.fastify.env.RC_OFFERING_ID } },
      ],
    };
  }

  private async getEntitlement(appUserId: string, opts?: { bypassCache?: boolean }) {
    const key = this.fastify.env.RC_SECRET_API_KEY;
    if (!key) throw new Error('RevenueCat not configured');
    return getRcEntitlement(appUserId, this.fastify.env.RC_ENTITLEMENT_ID || 'pro', key, { bypassCache: opts?.bypassCache });
  }

  async getEntitlementWithTrial(appUserId: string, opts?: { refreshRevenueCat?: boolean }, req?: FastifyRequest): Promise<EntitlementWithTrial> {
    const forceRefresh = opts?.refreshRevenueCat === true;
    let subscription = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    if (!subscription) {
      try { subscription = await this.fastify.repos.subscriptions.getOrCreate(appUserId, { allowTrial: true }); } catch {}
    }

    const now = new Date();
    const hasRC = Boolean(this.fastify.env.RC_SECRET_API_KEY);
    const periodEndMs = subscription?.currentPeriodEnd?.getTime();
    const nearPeriodEnd = typeof periodEndMs === 'number' && periodEndMs - now.getTime() <= 12 * 60 * 60 * 1000;
    const isPaidOrRedeemed = subscription?.method === 'paid' || subscription?.method === 'redeemed';

    const shouldSyncRC = hasRC && (forceRefresh || !subscription || subscription.status !== 'active' || subscription.method === 'trialing' || nearPeriodEnd);

    let rcEnt: Awaited<ReturnType<SubscriptionService['getEntitlement']>> | null = null;
    let rcFailed = false;
    if (shouldSyncRC) {
      try { rcEnt = await this.getEntitlement(appUserId, { bypassCache: forceRefresh }); }
      catch { rcFailed = true; }
    }

    // RC says pro → trust it, sync DB
    if (rcEnt?.pro) {
      const rcEnd   = rcEnt.expiresAt   ? new Date(rcEnt.expiresAt)   : null;
      const rcStart = rcEnt.purchaseDate ? new Date(rcEnt.purchaseDate) : null;
      const method: 'paid' | 'redeemed' = subscription?.method === 'redeemed' ? 'redeemed' : 'paid';
      const cancelAtPeriodEnd = rcEnt.cancelAtPeriodEnd ?? subscription?.cancelAtPeriodEnd ?? false;
      const needsUpdate = subscription?.method !== method || subscription?.status !== 'active' || subscription?.tier !== 'pro'
        || (rcEnd && subscription?.currentPeriodEnd?.getTime() !== rcEnd.getTime())
        || (subscription?.cancelAtPeriodEnd ?? false) !== cancelAtPeriodEnd;

      if (needsUpdate) {
        const wasNotPaid = subscription?.method !== method || subscription?.status !== 'active';
        await this.fastify.repos.subscriptions.upsert(appUserId, {
          tier: 'pro', status: 'active', method, cancelAtPeriodEnd, trialStart: null, trialEnd: null,
          ...(rcStart ? { currentPeriodStart: rcStart } : {}),
          ...(rcEnd   ? { currentPeriodEnd:   rcEnd   } : {}),
        });
        if (wasNotPaid) {
          const eventType: SubscriptionEventType = subscription?.method === 'trialing' ? 'trial_converted' : 'initial_purchase';
          await this.recordEvent(req, { userId: appUserId, subscriptionId: subscription?.id, eventType, previousState: { tier: subscription?.tier, status: subscription?.status, method: subscription?.method }, newState: { tier: 'pro', status: 'active', method }, periodStart: rcStart, periodEnd: rcEnd }, eventType);
        }
      }
      return { tier: 'pro', pro: true, inTrial: false, expiresAt: rcEnt.expiresAt, periodStart: rcStart?.toISOString() ?? subscription?.currentPeriodStart?.toISOString(), periodEnd: rcEnt.expiresAt ?? subscription?.currentPeriodEnd?.toISOString(), method, managementUrl: rcEnt.managementUrl, cancelAtPeriodEnd };
    }

    // Expire paid if RC confirmed not-pro on forced refresh
    if (forceRefresh && !rcFailed && rcEnt && !rcEnt.pro && subscription?.tier === 'pro' && subscription.status === 'active' && isPaidOrRedeemed) {
      await this.expirePaidSubscription(appUserId, rcEnt.expiresAt, req);
      subscription = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    }

    // Trial handling
    if (subscription?.method === 'trialing' && subscription.trialEnd) {
      if (subscription.trialEnd > now) {
        return { tier: 'pro', pro: true, inTrial: true, trialEndsAt: subscription.trialEnd.toISOString(), periodStart: subscription.trialStart?.toISOString(), periodEnd: subscription.trialEnd.toISOString(), method: 'trialing', cancelAtPeriodEnd: false };
      }
      if (subscription.status !== 'expired') {
        await this.expireTrial(appUserId, req);
        subscription = await this.fastify.repos.subscriptions.findByUserId(appUserId);
      }
    }

    // DB says active pro
    if (subscription?.tier === 'pro' && subscription.status === 'active') {
      return { tier: 'pro', pro: true, inTrial: false, expiresAt: subscription.currentPeriodEnd?.toISOString(), periodStart: subscription.currentPeriodStart?.toISOString(), periodEnd: subscription.currentPeriodEnd?.toISOString(), method: subscription.method, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd };
    }

    return { tier: 'free', pro: false, inTrial: false, periodStart: subscription?.currentPeriodStart?.toISOString() ?? subscription?.trialStart?.toISOString(), periodEnd: subscription?.currentPeriodEnd?.toISOString() ?? subscription?.trialEnd?.toISOString(), method: subscription?.method, cancelAtPeriodEnd: false };
  }

  async expireTrial(appUserId: string, req?: FastifyRequest): Promise<void> {
    const sub = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    await this.fastify.repos.subscriptions.updateByUserId(appUserId, { tier: 'free', status: 'expired' });
    await this.recordEvent(req, { userId: appUserId, subscriptionId: sub?.id, eventType: 'trial_expired', previousState: { tier: sub?.tier, status: sub?.status, method: sub?.method }, newState: { tier: 'free', status: 'expired', method: sub?.method }, periodStart: sub?.trialStart, periodEnd: sub?.trialEnd }, 'trial_expired');
  }

  async expirePaidSubscription(appUserId: string, expiresAt?: string, req?: FastifyRequest): Promise<void> {
    const sub = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    const expiresDate = expiresAt ? new Date(expiresAt) : sub?.currentPeriodEnd ?? null;
    await this.fastify.repos.subscriptions.updateByUserId(appUserId, { tier: 'free', status: 'expired', cancelAtPeriodEnd: false, ...(expiresDate ? { currentPeriodEnd: expiresDate } : {}) });
    await this.recordEvent(req, { userId: appUserId, subscriptionId: sub?.id, eventType: 'subscription_expired', previousState: { tier: sub?.tier, status: sub?.status, method: sub?.method }, newState: { tier: 'free', status: 'expired', method: sub?.method }, periodStart: sub?.currentPeriodStart, periodEnd: expiresDate }, 'subscription_expired');
  }

  async handleRevenueCatWebhook(event: Record<string, unknown>, req?: FastifyRequest): Promise<void> {
    const appUserId = event.app_user_id as string | undefined;
    if (!appUserId) return;

    const rcEventType   = event.type as string | undefined;
    const entitlementId = this.fastify.env.RC_ENTITLEMENT_ID || 'pro';
    const entIds        = event.entitlement_ids as unknown;
    const entIdSingle   = event.entitlement_id as string | null | undefined;
    const hasEnt = Array.isArray(entIds) ? entIds.some(x => x === entitlementId) : entIdSingle === entitlementId;

    const expirationMs = event.expiration_at_ms as number | undefined;
    const expiresAt    = typeof expirationMs === 'number' ? new Date(expirationMs) : null;
    if (expiresAt && isNaN(expiresAt.getTime())) return;

    const now      = new Date();
    const isActive = hasEnt && (expiresAt ? expiresAt > now : false);
    const tier     = isActive ? 'pro' : 'free';
    const status   = isActive ? 'active' : 'expired';
    const method   = isActive ? 'paid' : null;

    const purchasedMs  = event.purchased_at_ms as number | undefined;
    const periodStart  = typeof purchasedMs === 'number' ? new Date(purchasedMs) : null;
    const validStart   = periodStart && !isNaN(periodStart.getTime()) ? periodStart : null;
    const storeRaw     = event.store as string | undefined;
    const storeNorm    = storeRaw?.toLowerCase();
    const willRenew    = event.will_renew as boolean | undefined;
    const cancelReason = event.cancel_reason as string | undefined;
    const price        = event.price as number | undefined;
    const currency     = event.currency as string | undefined;
    const transactionId = event.transaction_id as string | undefined;
    const productId    = event.product_id as string | undefined;
    const origin       = storeNorm === 'app_store' ? 'apple' : storeNorm === 'play_store' ? 'google' : (storeNorm === 'stripe' || storeNorm === 'rc_billing') ? 'web' : undefined;

    const currentSub = await this.fastify.repos.subscriptions.findByUserId(appUserId);
    await this.fastify.repos.subscriptions.upsert(appUserId, {
      tier: tier as 'free' | 'pro', status: status as 'active' | 'expired', method,
      origin: origin as 'web' | 'apple' | 'google' | undefined,
      currentPeriodStart: validStart, currentPeriodEnd: expiresAt,
      billingPeriod: (event.period_type as string | undefined) ?? null,
      canceledAt: (rcEventType === 'CANCELLATION' || rcEventType === 'EXPIRATION') ? new Date() : null,
      cancelAtPeriodEnd: willRenew === false && isActive,
      trialStart: null, trialEnd: null,
      metadata: { ...(productId ? { revenueCatProductId: productId } : {}), ...(cancelReason ? { cancelReason } : {}), lastWebhookUpdate: new Date().toISOString() },
    });

    invalidateRcEntitlementCache(appUserId, entitlementId);

    const eventMap: Record<string, string> = {
      INITIAL_PURCHASE: 'initial_purchase', RENEWAL: 'renewal', PRODUCT_CHANGE: 'product_change',
      CANCELLATION: 'cancellation_scheduled', UNCANCELLATION: 'cancellation_unscheduled',
      EXPIRATION: 'subscription_expired', BILLING_ISSUE: 'billing_issue', BILLING_ISSUE_RESOLVED: 'billing_recovered',
    };
    const mappedType = rcEventType ? (eventMap[rcEventType] ?? (!isActive ? 'subscription_expired' : 'renewal')) : null;
    if (mappedType) {
      await this.recordEvent(req, {
        userId: appUserId, subscriptionId: currentSub?.id, eventType: mappedType as SubscriptionEventType,
        previousState: { tier: currentSub?.tier, status: currentSub?.status, method: currentSub?.method },
        newState: { tier: tier as 'free' | 'pro', status: status as 'active' | 'expired', method },
        revenueCatEventType: rcEventType, revenueCatProductId: productId,
        origin: origin as 'web' | 'apple' | 'google' | undefined,
        periodStart: validStart, periodEnd: expiresAt,
        metadata: { ...(rcEventType ? { revenueCatEventType: rcEventType } : {}), ...(productId ? { revenueCatProductId: productId } : {}), ...(storeRaw ? { store: storeRaw } : {}), ...(transactionId ? { transactionId } : {}), ...(price !== undefined && currency ? { price: { amount: price, currency } } : {}) },
      }, 'revenuecat_event');
    }
  }
}
`);

  writeFile(path.join(dir, 'src/lib/requestUtils.ts'), `import type { FastifyRequest } from 'fastify';

export function extractDeviceType(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile';
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet';
  if (ua.includes('chrome-extension') || ua.includes('firefox-extension')) return 'extension';
  return 'desktop';
}

export function extractIpAddress(req: FastifyRequest): string | null {
  const realIp = req.headers['x-real-ip'] as string | undefined;
  if (realIp) return realIp;
  const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.ip || null;
}

export function extractDeviceInfo(req: FastifyRequest) {
  const userAgent = req.headers['user-agent'] || null;
  const deviceType = extractDeviceType(userAgent);
  const rawIp = extractIpAddress(req);
  const ipAddress = anonymizeIp(rawIp);
  return { deviceType, userAgent, ipAddress };
}

export function sanitizeEmail(email: unknown): string {
  return String(email || '').toLowerCase().trim();
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const maskedLocal = local.length > 0 ? \`\${local[0]}***\` : '***';
  return \`\${maskedLocal}@\${domain}\`;
}

export function anonymizeIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length === 4) { parts[3] = '0'; return parts.join('.'); }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 3) return \`\${parts.slice(0, 3).join(':')}::\`;
  }
  return ip;
}
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Plugins
// ═══════════════════════════════════════════════════════════════════════════

function writePlugins(dir: string): void {
  writeFile(path.join(dir, 'src/plugins/env.ts'), `import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyEnv from '@fastify/env';
import fp from 'fastify-plugin';

const configPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const schema = {
    type: 'object',
    required: ['PORT', 'DATABASE_URL'],
    properties: {
      PORT: { type: 'number' },
      NODE_ENV: { type: 'string', default: 'development' },
      LOG_LEVEL: { type: 'string', default: 'info' },
      ANHEDRAL_DEMO: { type: 'string', default: 'false' },
      CLERK_PUBLISHABLE_KEY: { type: 'string', nullable: true },
      CLERK_SECRET_KEY: { type: 'string', nullable: true },
      FRONTEND_URL: { type: 'string', nullable: true },
      EXTENSION_ORIGINS: { type: 'string', nullable: true },
      DATABASE_URL: { type: 'string' },
      R2_ACCOUNT_ID: { type: 'string', nullable: true },
      R2_ACCESS_KEY_ID: { type: 'string', nullable: true },
      R2_SECRET_ACCESS_KEY: { type: 'string', nullable: true },
      R2_BUCKET: { type: 'string', nullable: true },
      RC_SECRET_API_KEY: { type: 'string', nullable: true, default: '' },
      RC_WEBHOOK_SECRET: { type: 'string', nullable: true, default: '' },
      RC_ENTITLEMENT_ID: { type: 'string', default: 'pro' },
      RC_OFFERING_ID: { type: 'string', default: 'default' },
    },
  } as const;

  await fastify.register(fastifyEnv as unknown as FastifyPluginAsync, {
    schema,
    dotenv: !process.env.VERCEL,
    confKey: 'env',
  } as unknown as Record<string, unknown>);

  if (fastify.env.NODE_ENV === 'production') {
    if (fastify.env.ANHEDRAL_DEMO === 'true') {
      throw new Error('ANHEDRAL_DEMO must be false in production');
    }

    const required = [
      'CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'RC_SECRET_API_KEY',
      'RC_WEBHOOK_SECRET',
    ] as const;
    const missing = required.filter((key) => !fastify.env[key]);
    if (missing.length > 0) {
      throw new Error(\`Missing production environment variables: \${missing.join(', ')}\`);
    }
  }
};

export default fp(configPlugin, { name: 'env-config', fastify: '5.x' });
`);

  writeFile(path.join(dir, 'src/plugins/clerkAuth.ts'), `import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { clerkPlugin, getAuth, clerkClient } from '@clerk/fastify';
import { AuthError } from '../errors/index.js';
import { runBackgroundTask } from '../lib/routeHelpers.js';
import type { AppUser } from '../types/index.js';
import crypto from 'node:crypto';
import { LRUCache } from '../lib/lruCache.js';

export const clerkAuthPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(clerkPlugin);

  const trackedSessions = new LRUCache<number>({ maxSize: 50_000, ttlMs: 24 * 60 * 60 * 1000 });

  type ClerkUser = Awaited<ReturnType<(typeof clerkClient.users)['getUser']>>;
  const CLERK_USER_CACHE = new LRUCache<ClerkUser>({
    maxSize: 50_000,
    ttlMs: fastify.env?.NODE_ENV === 'production' ? 300_000 : 60_000,
  });
  const INFLIGHT_CLERK_USER = new Map<string, Promise<ClerkUser>>();

  const getClerkUser = async (userId: string): Promise<ClerkUser> => {
    const cached = CLERK_USER_CACHE.get(userId);
    if (cached) return cached;
    const existing = INFLIGHT_CLERK_USER.get(userId);
    if (existing) return existing;
    const p = (async () => {
      try {
        const user = await clerkClient.users.getUser(userId);
        CLERK_USER_CACHE.set(userId, user);
        return user;
      } finally {
        INFLIGHT_CLERK_USER.delete(userId);
      }
    })();
    INFLIGHT_CLERK_USER.set(userId, p);
    return p;
  };

  fastify.addHook('onRequest', async (req) => { req._startedAt = Date.now(); });

  const authenticate = async (req: FastifyRequest, _reply: FastifyReply) => {
    if (req.method === 'OPTIONS' || req.url.startsWith('/health')) return;

    if (fastify.env?.ANHEDRAL_DEMO === 'true') {
      req.user = {
        id: 'user_demo',
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
      };
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw AuthError.unauthorized();

    const jwtToken = authHeader.slice('Bearer '.length).trim();
    if (!jwtToken) throw AuthError.unauthorized();

    try {
      const auth = getAuth(req);
      if (!auth.userId) throw AuthError.unauthorized();

      const userId = auth.userId as string;
      const clerkUser = await getClerkUser(userId);
      if (!clerkUser) throw AuthError.unauthorized();

      let userData = await fastify.repos.users.getAuthDataForPlugin(userId);

      if (!userData) {
        const primaryEmail = clerkUser.emailAddresses.find(
          (e: { id: string }) => e.id === clerkUser.primaryEmailAddressId
        );
        const displayName = [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean).join(' ').trim() || (primaryEmail?.emailAddress?.split('@')[0] ?? '');

        await fastify.repos.users.createIfMissing({
          id: userId,
          email: primaryEmail?.emailAddress || '',
          displayName,
          profileImageUrl: clerkUser.imageUrl || null,
        });

        await fastify.repos.subscriptions.createIfMissing({
          id: crypto.randomUUID(),
          userId,
          tier: 'free',
          status: 'active',
        });

        userData = await fastify.repos.users.getAuthDataForPlugin(userId);
      } else {
        const sessionKey = auth.sessionId ?? userId;
        if (trackedSessions.get(sessionKey) === undefined) {
          trackedSessions.set(sessionKey, Date.now());
          runBackgroundTask(req, fastify.repos.users.updateLastLogin(userId), 'session_sync');
        }
      }

      if (!userData) throw AuthError.unauthorized();

      const userObj: AppUser = { id: userId };
      if (userData.subscriptionTier) userObj.subscriptionTier = userData.subscriptionTier;
      if (userData.subscriptionStatus) userObj.subscriptionStatus = userData.subscriptionStatus;
      req.user = userObj;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      req.log.error({ msg: '[clerk-auth:error]', error: (err as Error).message });
      throw err;
    }
  };

  fastify.decorate('authenticate', authenticate);
};

export default fp(clerkAuthPlugin, { name: 'clerk-auth-plugin', fastify: '5.x' });
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════

function writeConfig(dir: string): void {
  writeFile(path.join(dir, 'src/config/index.ts'), `import type { AppEnv } from '../types/index.js';
import { ServerConfig } from './server.js';
import { DatabaseConfig } from './database.js';
import { CorsConfig } from './cors.js';

export class AppConfig {
  readonly server: ServerConfig;
  readonly database: DatabaseConfig;
  readonly cors: CorsConfig;

  constructor(env: AppEnv) {
    this.server = new ServerConfig(env);
    this.database = new DatabaseConfig(env);
    this.cors = new CorsConfig(env);
  }

  static fromEnv(env: AppEnv): AppConfig {
    return new AppConfig(env);
  }
}

export { ServerConfig } from './server.js';
export { DatabaseConfig } from './database.js';
export { CorsConfig } from './cors.js';
`);

  writeFile(path.join(dir, 'src/config/server.ts'), `import type { AppEnv } from '../types/index.js';

export class ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly nodeEnv: string;
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;

  constructor(env: AppEnv) {
    this.port = env.PORT;
    this.host = '0.0.0.0';
    this.nodeEnv = env.NODE_ENV;
    this.isDevelopment = env.NODE_ENV === 'development';
    this.isProduction = env.NODE_ENV === 'production';
  }
}
`);

  writeFile(path.join(dir, 'src/config/database.ts'), `import type { AppEnv } from '../types/index.js';

export class DatabaseConfig {
  readonly url: string;

  constructor(env: AppEnv) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    this.url = env.DATABASE_URL;
  }
}
`);

  writeFile(path.join(dir, 'src/config/cors.ts'), `import type { AppEnv } from '../types/index.js';

export class CorsConfig {
  readonly frontendUrl?: string;
  readonly extensionOrigins: string[];
  readonly restrictedOrigins: string[];

  constructor(env: AppEnv) {
    if (env.FRONTEND_URL) this.frontendUrl = env.FRONTEND_URL;
    this.extensionOrigins = String(env.EXTENSION_ORIGINS || '')
      .split(',').map(o => o.trim()).filter(o => o.length > 0);
    this.restrictedOrigins = [
      ...new Set([
        ...(this.frontendUrl ? [this.frontendUrl] : []),
        ...this.extensionOrigins,
      ]),
    ];
  }

  getRestrictedOrigins(): string[] | false {
    return this.restrictedOrigins.length > 0 ? this.restrictedOrigins : false;
  }
}
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Repositories
// ═══════════════════════════════════════════════════════════════════════════

function writeRepositories(dir: string): void {
  writeFile(path.join(dir, 'src/repositories/UserRepository.ts'), `import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { users } from '../db/schema.js';
import type { NewUsers, SubscriptionStatus, SubscriptionTier } from '../db/schema.js';
import { LRUCache } from '../lib/lruCache.js';
import { subscriptions, uploads } from '../db/schema.js';

export type UserAuthData = {
  id: string;
  email: string;
  subscriptionTier?: SubscriptionTier | null;
  subscriptionStatus?: SubscriptionStatus | null;
};

const authPluginCache = new LRUCache<UserAuthData>({
  maxSize: 50_000,
  ttlMs: 60_000,
});

export function invalidateAuthPluginCache(userId: string): void {
  authPluginCache.invalidate(\`auth:\${userId}\`);
}

export class UserRepository {
  constructor(private db: Database) {}

  async getAuthDataForPlugin(userId: string): Promise<UserAuthData | null> {
    const cached = authPluginCache.get(\`auth:\${userId}\`);
    if (cached) return cached;

    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        subscriptionTier: subscriptions.tier,
        subscriptionStatus: subscriptions.status,
      })
      .from(users)
      .leftJoin(subscriptions, eq(users.id, subscriptions.userId))
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0] ?? null;
    if (row) authPluginCache.set(\`auth:\${userId}\`, row);
    return row;
  }

  async findById(userId: string) {
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string) {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async createIfMissing(data: NewUsers): Promise<{ created: boolean }> {
    const existing = await this.findById(data.id);
    if (existing) return { created: false };
    await this.db.insert(users).values(data).onConflictDoNothing();
    return { created: true };
  }

  async getProfile(userId: string) {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        profileImageUrl: users.profileImageUrl,
        subscriptionTier: subscriptions.tier,
        subscriptionStatus: subscriptions.status,
      })
      .from(users)
      .leftJoin(subscriptions, eq(users.id, subscriptions.userId))
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
    authPluginCache.invalidate(\`auth:\${userId}\`);
  }

  async createUploadRecord(
    userId: string,
    input: { objectKey: string; bucket: string; contentType: string | null },
  ): Promise<void> {
    await this.db.insert(uploads).values({
      id: crypto.randomUUID(),
      userId,
      objectKey: input.objectKey,
      bucket: input.bucket,
      contentType: input.contentType,
    });
  }

  async deleteById(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId));
    authPluginCache.invalidate(\`auth:\${userId}\`);
  }
}
`);

  writeFile(path.join(dir, 'src/repositories/SubscriptionRepository.ts'), `import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { subscriptions } from '../db/schema.js';
import type { Subscriptions, NewSubscriptions } from '../db/schema.js';
import { LRUCache } from '../lib/lruCache.js';
import { invalidateAuthPluginCache } from './UserRepository.js';

const subscriptionCache = new LRUCache<Subscriptions>({ maxSize: 50_000, ttlMs: 30_000 });

export class SubscriptionRepository {
  constructor(private db: Database) {}

  async findByUserId(userId: string): Promise<Subscriptions | null> {
    const cached = subscriptionCache.get(\`sub:\${userId}\`);
    if (cached !== undefined) return cached;
    const [row] = await this.db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId)).limit(1);
    const result = row || null;
    if (result) subscriptionCache.set(\`sub:\${userId}\`, result);
    return result;
  }

  async createIfMissing(data: NewSubscriptions): Promise<{ subscription: Subscriptions; created: boolean }> {
    try {
      const [inserted] = await this.db.insert(subscriptions).values(data)
        .onConflictDoNothing({ target: subscriptions.userId }).returning();
      if (inserted) {
        subscriptionCache.set(\`sub:\${inserted.userId}\`, inserted);
        return { subscription: inserted, created: true };
      }
    } catch {}
    const existing = await this.findByUserId(data.userId);
    if (existing) return { subscription: existing, created: false };
    throw new Error(\`Failed to create subscription for user \${data.userId}\`);
  }

  async upsert(userId: string, data: Partial<Omit<NewSubscriptions, 'id' | 'userId'>>): Promise<Subscriptions> {
    const insertData: NewSubscriptions = {
      id: crypto.randomUUID(), userId,
      tier: data.tier ?? 'free',
      status: data.status ?? 'active',
      method: data.method ?? null,
      origin: data.origin ?? null,
      billingPeriod: data.billingPeriod ?? null,
      currentPeriodStart: data.currentPeriodStart ?? null,
      currentPeriodEnd: data.currentPeriodEnd ?? null,
      canceledAt: data.canceledAt ?? null,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      trialStart: data.trialStart ?? null,
      trialEnd: data.trialEnd ?? null,
      dailyLimit: data.dailyLimit ?? null,
      metadata: data.metadata ?? null,
    };
    const updateData = Object.fromEntries(
      Object.entries({ ...data, updatedAt: new Date() }).filter(([, v]) => v !== undefined)
    ) as Partial<Subscriptions>;
    const [row] = await this.db.insert(subscriptions).values(insertData)
      .onConflictDoUpdate({ target: subscriptions.userId, set: updateData }).returning();
    if (!row) throw new Error(\`Failed to upsert subscription for user \${userId}\`);
    subscriptionCache.set(\`sub:\${userId}\`, row);
    invalidateAuthPluginCache(userId);
    return row;
  }

  async updateByUserId(userId: string, data: Partial<Subscriptions>): Promise<Subscriptions | null> {
    const [updated] = await this.db.update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId)).returning();
    if (updated) subscriptionCache.set(\`sub:\${userId}\`, updated);
    else subscriptionCache.invalidate(\`sub:\${userId}\`);
    invalidateAuthPluginCache(userId);
    return updated || null;
  }

  async getOrCreate(userId: string, options?: { allowTrial?: boolean }): Promise<Subscriptions> {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;
    const allowTrial = options?.allowTrial ?? true;
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { subscription } = await this.createIfMissing(allowTrial
      ? { id: crypto.randomUUID(), userId, tier: 'pro', status: 'active', method: 'trialing', trialStart: now, trialEnd }
      : { id: crypto.randomUUID(), userId, tier: 'free', status: 'active', method: null, trialStart: null, trialEnd: null }
    );
    return subscription;
  }
}
`);

  writeFile(path.join(dir, 'src/repositories/SubscriptionEventRepository.ts'), `import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { Database } from '../db/index.js';
import {
  subscriptionEvents,
  type SubscriptionEvents, type NewSubscriptionEvents,
  type SubscriptionEventType, type SubscriptionTier, type SubscriptionStatus,
  type SubscriptionMethod, type SubscriptionOrigin, type SubscriptionEventMetadata,
} from '../db/schema.js';

export interface RecordEventParams {
  userId: string;
  subscriptionId?: string | null;
  eventType: SubscriptionEventType;
  previousState?: { tier?: SubscriptionTier | null; status?: SubscriptionStatus | null; method?: SubscriptionMethod | null };
  newState?: { tier?: SubscriptionTier | null; status?: SubscriptionStatus | null; method?: SubscriptionMethod | null };
  revenueCatEventType?: string;
  revenueCatProductId?: string;
  origin?: SubscriptionOrigin;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  metadata?: SubscriptionEventMetadata;
}

export class SubscriptionEventRepository {
  constructor(private db: Database) {}

  async recordEvent(params: RecordEventParams): Promise<SubscriptionEvents> {
    const data: NewSubscriptionEvents = {
      id: crypto.randomUUID(),
      userId: params.userId,
      subscriptionId: params.subscriptionId ?? null,
      eventType: params.eventType,
      previousTier: params.previousState?.tier ?? null,
      previousStatus: params.previousState?.status ?? null,
      previousMethod: params.previousState?.method ?? null,
      newTier: params.newState?.tier ?? null,
      newStatus: params.newState?.status ?? null,
      newMethod: params.newState?.method ?? null,
      revenueCatEventType: params.revenueCatEventType ?? null,
      revenueCatProductId: params.revenueCatProductId ?? null,
      origin: params.origin ?? null,
      periodStart: params.periodStart ?? null,
      periodEnd: params.periodEnd ?? null,
      metadata: params.metadata ?? null,
    };
    const [event] = await this.db.insert(subscriptionEvents).values(data).returning();
    return event!;
  }

  async getEventHistory(userId: string, opts: { limit?: number; offset?: number; eventTypes?: SubscriptionEventType[] } = {}): Promise<SubscriptionEvents[]> {
    const { limit = 50, offset = 0, eventTypes } = opts;
    const conditions = [eq(subscriptionEvents.userId, userId)];
    if (eventTypes?.length) conditions.push(inArray(subscriptionEvents.eventType, eventTypes));
    return this.db.select().from(subscriptionEvents)
      .where(and(...conditions))
      .orderBy(desc(subscriptionEvents.createdAt))
      .limit(limit).offset(offset);
  }

  async getEventCountByType(userId: string): Promise<Record<string, number>> {
    const results = await this.db
      .select({ eventType: subscriptionEvents.eventType, count: sql<number>\`count(*)::int\` })
      .from(subscriptionEvents).where(eq(subscriptionEvents.userId, userId))
      .groupBy(subscriptionEvents.eventType);
    return results.reduce((acc, r) => { acc[r.eventType] = r.count; return acc; }, {} as Record<string, number>);
  }
}
`);

  writeFile(path.join(dir, 'src/repositories/index.ts'), `import type { Database } from '../db/index.js';
import { UserRepository } from './UserRepository.js';
import { SubscriptionRepository } from './SubscriptionRepository.js';
import { SubscriptionEventRepository } from './SubscriptionEventRepository.js';

export class Repositories {
  public readonly users: UserRepository;
  public readonly subscriptions: SubscriptionRepository;
  public readonly subscriptionEvents: SubscriptionEventRepository;

  constructor(db: Database) {
    this.users = new UserRepository(db);
    this.subscriptions = new SubscriptionRepository(db);
    this.subscriptionEvents = new SubscriptionEventRepository(db);
  }
}

export { UserRepository } from './UserRepository.js';
export { SubscriptionRepository } from './SubscriptionRepository.js';
export { SubscriptionEventRepository } from './SubscriptionEventRepository.js';
export type { UserAuthData } from './UserRepository.js';
export type { RecordEventParams } from './SubscriptionEventRepository.js';
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════

function writeRoutes(dir: string, displayName: string): void {
  writeFile(path.join(dir, 'src/routes/health.ts'), `import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('', async (_req, reply) => {
    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  fastify.get('/ready', async (_req, reply) => {
    try {
      await fastify.repos.users.findByEmail('health-check@test.invalid');
      return reply.send({ ok: true, database: 'connected' });
    } catch {
      return reply.status(503).send({ ok: false, error: 'Database connection failed' });
    }
  });
};

export default healthRoutes;
`);

  writeFile(path.join(dir, 'src/routes/auth.ts'), `import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { clerkClient } from '@clerk/fastify';
import { AuthError } from '../errors/index.js';
import { createAuthHook } from '../lib/routeHelpers.js';

function getDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  fallback?: string | null;
}) {
  return [input.firstName, input.lastName].filter(Boolean).join(' ').trim()
    || input.fallback
    || (input.email ? input.email.split('@')[0] : 'Builder');
}

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/me', {
    preHandler: createAuthHook(fastify),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.id) throw AuthError.unauthorized();

    if (fastify.env.ANHEDRAL_DEMO === 'true') {
      return reply.send({
        user: {
          id: 'user_demo',
          email: 'demo@anhedral.dev',
          firstName: 'Demo',
          lastName: 'Builder',
          displayName: '${displayName} Demo',
          imageUrl: null,
        },
      });
    }

    const clerkUser = await clerkClient.users.getUser(req.user.id);
    const userData = await fastify.repos.users.getProfile(req.user.id);
    const primaryEmail = clerkUser.emailAddresses.find(
      (e: { id: string }) => e.id === clerkUser.primaryEmailAddressId
    );
    const email = primaryEmail?.emailAddress ?? '';
    const displayName = getDisplayName({
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      email,
      fallback: userData?.displayName ?? null,
    });

    return reply.send({
      user: {
        id: clerkUser.id,
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        displayName,
        imageUrl: userData?.profileImageUrl ?? clerkUser.imageUrl,
      },
    });
  });

  fastify.post('/signout', {
    preHandler: createAuthHook(fastify),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    return reply.send({ success: true });
  });

  fastify.delete('/account', {
    preHandler: createAuthHook(fastify),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    await clerkClient.users.deleteUser(req.user.id);
    await fastify.repos.users.deleteById(req.user.id);
    return reply.code(204).send();
  });
};

export default authRoutes;
`);

  writeFile(path.join(dir, 'src/routes/subscriptions.ts'), `import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import clerkAuthPlugin from '../plugins/clerkAuth.js';
import { SubscriptionService } from '../services/SubscriptionService.js';
import { AuthError } from '../errors/index.js';
import { verifyRevenueCatWebhook, verifyRevenueCatWebhookAuthorization } from '../lib/revenuecat.js';
import { createAuthHook } from '../lib/routeHelpers.js';
import { CACHE_SECONDS } from '../lib/constants.js';

const subscriptionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const service = new SubscriptionService(fastify);

  fastify.get('/pricing', async (_req, reply) => {
    const data = await service.getPricing();
    reply.header('Cache-Control', \`private, max-age=\${CACHE_SECONDS.SUBSCRIPTIONS_PRICING}\`);
    return reply.send(data);
  });

  await fastify.register(async (app) => {
    await app.register(clerkAuthPlugin);

    app.get<{ Querystring: { refresh?: boolean } }>('/entitlements/me', {
      preHandler: createAuthHook(app),
    }, async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) throw AuthError.unauthorized();
      if (app.env.ANHEDRAL_DEMO === 'true') {
        reply.header('Cache-Control', 'private, no-store');
        return reply.send({
          pro: true,
          inTrial: false,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          method: 'paid',
          managementUrl: 'https://app.revenuecat.com/',
          cancelAtPeriodEnd: false,
        });
      }
      const refreshRaw = (req.query as unknown as { refresh?: unknown }).refresh;
      const requestedRefresh = refreshRaw === true || refreshRaw === 'true' || refreshRaw === 1 || refreshRaw === '1';
      const forceRefresh = Boolean(app.env.RC_SECRET_API_KEY) && requestedRefresh;
      const data = await service.getEntitlementWithTrial(userId, { refreshRevenueCat: forceRefresh }, req);
      reply.header('Cache-Control', 'private, no-store');
      return reply.send(data);
    });
  });

  await fastify.register(async (app) => {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      try {
        const raw = typeof body === 'string' ? body : body.toString();
        (req as unknown as { rawBody?: string }).rawBody = raw;
        done(null, raw.trim().length === 0 ? {} : JSON.parse(raw));
      } catch (err) { done(err as Error, undefined); }
    });

    app.post('/webhooks/revenuecat', async (req: FastifyRequest, reply) => {
      const rawBody = (req as unknown as { rawBody?: string }).rawBody;
      const bodyString = rawBody ?? (typeof req.body === 'string' ? req.body : '');
      const signature = req.headers['x-revenuecat-signature'] as string | undefined;
      const authorization = req.headers.authorization as string | undefined;
      const webhookSecret = fastify.env.RC_WEBHOOK_SECRET;

      if (!webhookSecret && fastify.env.NODE_ENV === 'production') {
        return reply.code(500).send({ ok: false, error: 'webhook_not_configured' });
      }
      if (webhookSecret) {
        if (!bodyString) return reply.code(400).send({ ok: false, error: 'invalid_body' });
        const verifiedByAuth = verifyRevenueCatWebhookAuthorization(authorization, webhookSecret);
        const verifiedBySig  = signature ? verifyRevenueCatWebhook(bodyString, signature, webhookSecret) : false;
        if (!verifiedByAuth && !verifiedBySig) return reply.code(401).send({ ok: false, error: 'invalid_signature' });
      }

      const parsed = req.body as Record<string, unknown>;
      const event  = (parsed?.event && typeof parsed.event === 'object') ? (parsed.event as Record<string, unknown>) : parsed;
      try { await service.handleRevenueCatWebhook(event, req); } catch (err) {
        fastify.log.error({ msg: '[webhook:revenuecat_failed]', error: (err as Error).message });
      }
      return { ok: true };
    });
  });

};

export default subscriptionRoutes;
`);

  writeFile(path.join(dir, 'src/routes/storage.ts'), `import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateUploadRequestSchema } from '@shared/contracts';
import { AuthError, ServerError, ValidationError } from '../errors/index.js';
import { createAuthHook } from '../lib/routeHelpers.js';
import { createSignedDownloadUrl, createSignedUploadUrl, deleteObjectFromR2, isR2Configured } from '../lib/r2.js';

const SIGNED_URL_EXPIRES_IN = 60 * 10;

function sanitizeFileName(fileName: string | undefined) {
  const fallback = 'upload';
  const cleaned = (fileName ?? fallback)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

function objectKeyForUser(userId: string, fileName: string | undefined) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return \`\${safeUserId}--\${crypto.randomUUID()}--\${sanitizeFileName(fileName)}\`;
}

function assertUserOwnsObject(userId: string, objectKey: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]+/g, '_');
  if (!objectKey.startsWith(\`\${safeUserId}--\`)) {
    throw AuthError.forbidden();
  }
}

const storageRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/uploads', {
    preHandler: createAuthHook(fastify),
  }, async (req, reply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    if (!isR2Configured()) throw ServerError.missingConfiguration('R2');

    const parsed = CreateUploadRequestSchema.safeParse(req.body);
    if (!parsed.success) throw ValidationError.invalidFormat('body', 'CreateUploadRequest');
    const input = parsed.data;
    const objectKey = objectKeyForUser(req.user.id, input.fileName);
    const signed = await createSignedUploadUrl({
      objectKey,
      contentType: input.contentType,
    }, SIGNED_URL_EXPIRES_IN);

    await fastify.repos.users.createUploadRecord(req.user.id, {
      objectKey,
      bucket: signed.bucket,
      contentType: input.contentType,
    });

    return reply.send({
      objectKey,
      uploadUrl: signed.uploadUrl,
      expiresIn: signed.expiresIn,
      headers: { 'Content-Type': input.contentType },
    });
  });

  fastify.get<{ Params: { key: string } }>('/files/:key', {
    preHandler: createAuthHook(fastify),
  }, async (req, reply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    if (!isR2Configured()) throw ServerError.missingConfiguration('R2');

    const objectKey = decodeURIComponent(req.params.key);
    assertUserOwnsObject(req.user.id, objectKey);
    return reply.send(await createSignedDownloadUrl(objectKey, SIGNED_URL_EXPIRES_IN));
  });

  fastify.delete<{ Params: { key: string } }>('/files/:key', {
    preHandler: createAuthHook(fastify),
  }, async (req, reply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    if (!isR2Configured()) throw ServerError.missingConfiguration('R2');

    const objectKey = decodeURIComponent(req.params.key);
    assertUserOwnsObject(req.user.id, objectKey);
    await deleteObjectFromR2(objectKey);
    return reply.code(204).send();
  });
};

export default storageRoutes;
`);

  writeFile(path.join(dir, 'src/routes/index.ts'), `import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import clerkAuthPlugin from '../plugins/clerkAuth.js';
import health from './health.js';
import auth from './auth.js';
import subscriptions from './subscriptions.js';
import storage from './storage.js';
import cors from '@fastify/cors';

const routes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const FRONTEND_URL = fastify.env?.FRONTEND_URL;
  const extensionOrigins = String(fastify.env?.EXTENSION_ORIGINS ?? '')
    .split(',').map(o => o.trim()).filter(o => o.length > 0);
  const restrictedOrigins = [...new Set([
    ...(FRONTEND_URL ? [FRONTEND_URL] : []),
    ...extensionOrigins,
  ])];
  const restrictedCorsOrigin = restrictedOrigins.length > 0 ? restrictedOrigins : false;

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'OPTIONS'], allowedHeaders: ['Content-Type'] });
    await app.register(health);
  }, { prefix: '/health' });

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Platform'] });
    await app.register(clerkAuthPlugin);
    await app.register(auth);
  }, { prefix: '/auth' });

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Platform', 'X-RevenueCat-Signature'] });
    await app.register(subscriptions);
  }, { prefix: '/subscriptions' });

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Platform'] });
    await app.register(clerkAuthPlugin);
    await app.register(storage);
  }, { prefix: '/storage' });
};

export default routes;
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// App + Index + Vercel entry
// ═══════════════════════════════════════════════════════════════════════════

function writeAppAndIndex(dir: string, displayName: string): void {
  writeFile(path.join(dir, 'src/app.ts'), `import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import routes from './routes/index.js';
import envConfig from './plugins/env.js';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import { errorHandler } from './errors/index.js';
import { AppConfig } from './config/index.js';
import { Repositories } from './repositories/index.js';
import { db } from './db/index.js';

const isProduction = process.env.NODE_ENV === 'production';

function createBaseApp(): FastifyInstance {
  return Fastify({
    trustProxy: true,
    logger: {
      level: process.env.LOG_LEVEL ?? (isProduction ? 'warn' : 'info'),
      redact: ['req.headers.authorization'],
      ...(isProduction ? {} : {
        transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } },
      }),
    },
    bodyLimit: 12 * 1024 * 1024,
    disableRequestLogging: isProduction,
  });
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = createBaseApp();

  if (!isProduction && !process.env.VERCEL) {
    await import('dotenv/config');
  }

  await app.register(envConfig);

  const config = AppConfig.fromEnv(app.env!);
  app.decorate('config', config);

  const repos = new Repositories(db);
  app.decorate('repos', repos);

  await app.register(compress, { global: true, threshold: 512, encodings: ['br', 'gzip', 'deflate'] });
  app.setErrorHandler(errorHandler);

  const isDevelopment = app.env?.NODE_ENV === 'development';

  await app.register(helmet, {
    contentSecurityPolicy: isDevelopment ? false : undefined,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: isDevelopment ? ['127.0.0.1'] : [],
  });

  if (isDevelopment) {
    const [{ default: swagger }, { default: swaggerUI }] = await Promise.all([
      import('@fastify/swagger'),
      import('@fastify/swagger-ui'),
    ]);
    await app.register(swagger, {
      openapi: {
        info: { title: '${displayName} API', version: '1.0.0' },
        servers: [{ url: \`http://localhost:\${app.env?.PORT ?? 3000}\` }],
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      },
    });
    await app.register(swaggerUI, { routePrefix: '/docs' });
  }

  await app.register(routes);

  return app;
}
`);

  writeFile(path.join(dir, 'src/index.ts'), `import { buildApp } from './app.js';

async function main() {
  const fastify = await buildApp();
  const PORT = fastify.env?.PORT ?? 0;
  if (!Number.isFinite(PORT) || Number(PORT) <= 0) {
    throw new Error(\`PORT must be set and be a positive number. Got: \${PORT}\`);
  }
  await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
  fastify.log.info({ msg: '[startup]', addr: \`http://0.0.0.0:\${PORT}\` });
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
`);
}

function writeVercelConfig(dir: string): void {
  writeFile(path.join(dir, 'vercel.json'), JSON.stringify({
    $schema: 'https://openapi.vercel.sh/vercel.json',
    buildCommand: 'pnpm build',
    devCommand: 'vercel dev',
  }, null, 2) + '\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

function writeTestFiles(dir: string): void {
  writeFile(path.join(dir, 'test/setup.ts'), `import dotenv from 'dotenv';
dotenv.config();
`);

  writeFile(path.join(dir, 'test/health.test.ts'), `import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Health Routes', () => {
  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
  });
});
`);
}

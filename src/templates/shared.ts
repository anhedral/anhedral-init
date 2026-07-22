import path from 'node:path';
import { writeFile } from '../util.js';
import type { ProjectOptions } from '../scaffold.js';
import {
  API_CLIENT_DEPENDENCIES,
  CONTRACTS_DEPENDENCIES,
  REALTIME_DEPENDENCIES,
  SHARED_DB_DEPENDENCIES,
  SHARED_PACKAGE_DEPENDENCIES,
} from '../dependencies.js';

function writeTsConfig(root: string): void {
  writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noUncheckedIndexedAccess: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ['src/**/*'],
  }, null, 2) + '\n');
}

function writeSharedDatabase(root: string, options: ProjectOptions): void {
  if (!options.features.database) return;
  const dir = path.join(root, 'packages/db');
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: '@shared/db',
    version: '0.1.0',
    private: true,
    type: 'module',
    exports: { '.': './src/index.ts', './schema': './src/schema.ts' },
    scripts: {
      build: 'pnpm typecheck',
      typecheck: 'tsc --noEmit',
      'db:generate': 'drizzle-kit generate',
      'db:migrate': 'tsx --env-file=.env src/migrate.ts',
      'db:check': 'drizzle-kit check',
      'db:studio': 'drizzle-kit studio',
    },
    dependencies: SHARED_DB_DEPENDENCIES.dependencies,
    devDependencies: SHARED_DB_DEPENDENCIES.devDependencies,
  }, null, 2) + '\n');
  writeFile(path.join(dir, '.env.example'), 'DATABASE_URL=YOUR_NEON_POSTGRES_URL\n');
  writeFile(path.join(dir, 'drizzle.config.ts'), `import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL || '' },
});
`);

  const storageTables = options.features.storage ? `
export const uploads = pgTable('uploads', {
  id: text('id').primaryKey(),
  // Clerk IDs are authoritative until an application intentionally adds a user projection.
  userId: text('user_id').notNull(),
  stagingObjectKey: text('staging_object_key').notNull().unique(),
  objectKey: text('object_key').unique(),
  contentType: text('content_type').notNull(),
  expectedSize: integer('expected_size').notNull(),
  actualSize: integer('actual_size'),
  status: text('status').notNull().default('pending'),
  rejectionReason: text('rejection_reason'),
  uploadUrlExpiresAt: timestamp('upload_url_expires_at').notNull(),
  stagingDeletedAt: timestamp('staging_deleted_at'),
  confirmedAt: timestamp('confirmed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
` : '';
  const billingTables = options.features.billing ? `
export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  // RevenueCat App User IDs can be Clerk IDs before a local users row exists.
  userId: text('user_id').notNull().unique(),
  entitlement: text('entitlement').notNull().default('free'),
  status: text('status').notNull().default('active'),
  expiresAt: timestamp('expires_at'),
  eventTimestamp: timestamp('event_timestamp').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const webhookEvents = pgTable('webhook_events', {
  providerEventId: text('provider_event_id').primaryKey(),
  provider: text('provider').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  claimToken: text('claim_token'),
  claimedAt: timestamp('claimed_at'),
  processedAt: timestamp('processed_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const realtimeOutbox = pgTable('realtime_outbox', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  topic: text('topic').notNull(),
  revision: integer('revision').notNull(),
  attempts: integer('attempts').notNull().default(0),
  deliveredAt: timestamp('delivered_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
` : '';
  writeFile(path.join(dir, 'src/schema.ts'), `import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const items = pgTable('items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
${storageTables}${billingTables}`);
  writeFile(path.join(dir, 'src/index.ts'), `import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required when the db module is enabled');

export const sqlClient = neon(databaseUrl);
export const db = drizzle(sqlClient, { schema });
export type Database = typeof db;
export * from './schema';
`);
  writeFile(path.join(dir, 'src/migrate.ts'), `import { migrate } from 'drizzle-orm/neon-http/migrator';
import { db } from './index';

await migrate(db, { migrationsFolder: './migrations' });
console.log('Database migrations complete.');
`);
  writeFile(path.join(dir, 'migrations/.gitkeep'), '');
}

function contractSource(options: ProjectOptions): string {
  const declarations = [
    `export const HealthResponseSchema = z.object({ ok: z.literal(true), service: z.string() });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export const ReadinessResponseSchema = z.discriminatedUnion('status', [
  z.object({ ok: z.literal(true), service: z.string(), status: z.literal('ready') }),
  z.object({
    ok: z.literal(false),
    service: z.string(),
    status: z.enum(['unavailable', 'shutting_down']),
  }),
]);
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;`,
    options.features.auth ? `export const AuthMeResponseSchema = z.object({ user: z.object({ id: z.string() }) });
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;` : null,
    options.features.billing ? `export const EntitlementResponseSchema = z.object({
  entitlement: z.string(),
  status: z.enum(['active', 'expired', 'free']),
  expiresAt: z.string().datetime().nullable(),
  revision: z.number().int().nonnegative(),
});
export type EntitlementResponse = z.infer<typeof EntitlementResponseSchema>;

export const SubscriptionChangedEventSchema = z.object({
  type: z.literal('subscription.changed'),
  revision: z.number().int().nonnegative(),
});
export type SubscriptionChangedEvent = z.infer<typeof SubscriptionChangedEventSchema>;

export const RealtimeTokenRequestSchema = z.object({
  keyName: z.string().min(1),
  ttl: z.number().int().positive(),
  timestamp: z.number().int().nonnegative(),
  capability: z.string().min(1),
  clientId: z.string().min(1),
  nonce: z.string().min(1),
  mac: z.string().min(1),
});
export type RealtimeTokenRequest = z.infer<typeof RealtimeTokenRequestSchema>;` : null,
    options.features.storage ? `export const UPLOAD_ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export const CreateUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(UPLOAD_ALLOWED_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
}).strict();
export const CreateUploadResponseSchema = z.object({
  uploadId: z.string().uuid(),
  stagingObjectKey: z.string(),
  uploadUrl: z.string().url(),
  expiresIn: z.number().int().positive(),
  requiredHeaders: z.object({ 'content-type': z.enum(UPLOAD_ALLOWED_CONTENT_TYPES) }),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
  signedContentLength: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
  metadataValidationRequired: z.literal(true),
});
export const ConfirmUploadRequestSchema = z.object({ uploadId: z.string().uuid() }).strict();
export const UploadParamsSchema = z.object({ uploadId: z.string().uuid() }).strict();
export const UploadRecordSchema = z.object({
  id: z.string().uuid(),
  objectKey: z.string(),
  contentType: z.enum(UPLOAD_ALLOWED_CONTENT_TYPES),
  sizeBytes: z.number().int().nonnegative(),
  contentTrust: z.literal('untrusted'),
  status: z.enum(['pending', 'confirmed', 'rejected']),
  createdAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
  privateReadUrl: z.string().url(),
});
export const ConfirmUploadResponseSchema = z.object({ upload: UploadRecordSchema });
export const GetUploadResponseSchema = z.object({ upload: UploadRecordSchema });
export const GetUploadReadUrlResponseSchema = z.object({
  url: z.string().url(),
  expiresIn: z.number().int().min(60).max(604800),
});
export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;
export type CreateUploadResponse = z.infer<typeof CreateUploadResponseSchema>;
export type ConfirmUploadRequest = z.infer<typeof ConfirmUploadRequestSchema>;
export type UploadRecord = z.infer<typeof UploadRecordSchema>;` : null,
  ].filter((value): value is string => value !== null);
  return `import { z } from 'zod';\n\n${declarations.join('\n\n')}\n`;
}

function apiClientSource(options: ProjectOptions): string {
  const imports = [
    'HealthResponseSchema',
    'ReadinessResponseSchema',
    options.features.auth ? 'AuthMeResponseSchema' : null,
    options.features.billing ? 'EntitlementResponseSchema' : null,
    options.features.billing ? 'RealtimeTokenRequestSchema' : null,
    options.features.storage ? 'CreateUploadResponseSchema' : null,
    options.features.storage ? 'ConfirmUploadResponseSchema' : null,
    options.features.storage ? 'GetUploadResponseSchema' : null,
    options.features.storage ? 'GetUploadReadUrlResponseSchema' : null,
    options.features.storage ? 'type CreateUploadRequest' : null,
    options.features.storage ? 'type CreateUploadResponse' : null,
    options.features.storage ? 'type ConfirmUploadRequest' : null,
  ].filter((value): value is string => value !== null);
  const methods = [
    `health(init: RequestInit = {}) { return this.request('/health', init, HealthResponseSchema); }`,
    `readiness(init: RequestInit = {}) { return this.request('/ready', init, ReadinessResponseSchema); }`,
    options.features.auth ? `getMe(init: RequestInit = {}) { return this.request('/auth/me', init, AuthMeResponseSchema); }` : null,
    options.features.billing ? `getEntitlement(init: RequestInit = {}) { return this.request('/subscriptions/me', init, EntitlementResponseSchema); }

  refreshEntitlement(init: RequestInit = {}) {
    return this.request('/subscriptions/refresh', { ...init, method: 'POST' }, EntitlementResponseSchema);
  }

  getRealtimeToken(init: RequestInit = {}) {
    return this.request('/realtime/token', { ...init, method: 'POST' }, RealtimeTokenRequestSchema);
  }` : null,
  options.features.storage ? `createUpload(input: CreateUploadRequest, init: RequestInit = {}) {
    return this.request('/storage/uploads', { ...init, method: 'POST', body: JSON.stringify(input) }, CreateUploadResponseSchema);
  }

  async putUpload(upload: CreateUploadResponse, body: Blob, init: Omit<RequestInit, 'body' | 'method'> = {}) {
    if (body.size !== upload.signedContentLength) {
      throw new ApiError('Upload body size does not match the signed content length', {
        status: 0,
        code: 'UPLOAD_SIZE_MISMATCH',
        details: { expected: upload.signedContentLength, actual: body.size },
      });
    }
    const headers = new Headers(init.headers);
    headers.set('content-type', upload.requiredHeaders['content-type']);
    // Browsers forbid setting Content-Length directly. Blob/File bodies emit it automatically,
    // and R2 verifies that runtime header because it is part of the presigned URL signature.
    const response = await fetch(upload.uploadUrl, { ...init, method: 'PUT', body, headers });
    if (!response.ok) {
      throw new ApiError(\`Object upload failed with status \${response.status}\`, {
        status: response.status,
        code: 'OBJECT_UPLOAD_FAILED',
      });
    }
  }

  confirmUpload(input: ConfirmUploadRequest, init: RequestInit = {}) {
    return this.request('/storage/uploads/confirm', { ...init, method: 'POST', body: JSON.stringify(input) }, ConfirmUploadResponseSchema);
  }

  getUpload(uploadId: string, init: RequestInit = {}) {
    return this.request(\`/storage/uploads/\${encodeURIComponent(uploadId)}\`, init, GetUploadResponseSchema);
  }

  getUploadReadUrl(uploadId: string, init: RequestInit = {}) {
    return this.request(\`/storage/uploads/\${encodeURIComponent(uploadId)}/read-url\`, init, GetUploadReadUrlResponseSchema);
  }` : null,
  ].filter((value): value is string => value !== null);
  return `import type { ZodType } from 'zod';
import { ${imports.join(', ')} } from '@shared/contracts';

export function normalizeApiBaseUrl(value: string, label = 'API baseUrl'): string {
  const candidate = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(\`\${label} must be a valid absolute URL\`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(\`\${label} must use http: or https:\`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(\`\${label} must not include URL credentials\`);
  }
  if (parsed.search || candidate.includes('?')) {
    throw new Error(\`\${label} must not include a query string\`);
  }
  if (parsed.hash || candidate.includes('#')) {
    throw new Error(\`\${label} must not include a URL fragment\`);
  }
  let pathname = parsed.pathname;
  while (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  return parsed.origin + pathname;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options: { status: number; code: string; details?: unknown; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(private readonly options: {
    baseUrl: string;
    getToken?: () => Promise<string | null>;
    timeoutMs?: number;
  }) {
    this.baseUrl = normalizeApiBaseUrl(options.baseUrl);
  }

  async request<T>(path: string, init: RequestInit, schema: ZodType<T>): Promise<T> {
    const timeoutMs = this.options.timeoutMs ?? 15_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('API timeoutMs must be positive');
    const requestController = new AbortController();
    const callerSignal = init.signal;
    const abortFromCaller = () => requestController.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const timer = setTimeout(() => requestController.abort(new Error('API request timed out')), timeoutMs);
    let rejectTokenWait: (() => void) | null = null;
    const tokenWaitAborted = new Promise<never>((_resolve, reject) => {
      rejectTokenWait = () => reject(requestController.signal.reason ?? new Error('API request aborted'));
      if (requestController.signal.aborted) rejectTokenWait();
      else requestController.signal.addEventListener('abort', rejectTokenWait, { once: true });
    });

    try {
      const token = await Promise.race([
        Promise.resolve(this.options.getToken?.()),
        tokenWaitAborted,
      ]);
      const hasBody = init.body !== undefined && init.body !== null;
      const headers = new Headers(init.headers);
      if (hasBody && !headers.has('content-type')) headers.set('content-type', 'application/json');
      if (token && !headers.has('authorization')) headers.set('authorization', \`Bearer \${token}\`);
      const response = await fetch(this.baseUrl + path, {
        ...init,
        signal: requestController.signal,
        headers,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as {
          error?: unknown;
          message?: unknown;
          details?: unknown;
        } | null;
        const code = typeof payload?.error === 'string' ? payload.error : 'HTTP_ERROR';
        const message = typeof payload?.message === 'string'
          ? payload.message
          : \`API request failed with status \${response.status}\`;
        throw new ApiError(message, { status: response.status, code, details: payload?.details });
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        throw new ApiError('API returned invalid JSON', { status: response.status, code: 'INVALID_RESPONSE', cause });
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new ApiError('API response did not match its contract', {
          status: response.status,
          code: 'INVALID_RESPONSE',
          details: parsed.error.flatten(),
        });
      }
      return parsed.data;
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (requestController.signal.aborted) {
        const callerAborted = Boolean(callerSignal?.aborted);
        throw new ApiError(callerAborted ? 'API request was cancelled' : 'API request timed out', {
          status: 0,
          code: callerAborted ? 'REQUEST_ABORTED' : 'REQUEST_TIMEOUT',
          cause,
        });
      }
      throw new ApiError('Unable to reach the API', { status: 0, code: 'NETWORK_ERROR', cause });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', abortFromCaller);
      if (rejectTokenWait) requestController.signal.removeEventListener('abort', rejectTokenWait);
    }
  }

  ${methods.join('\n\n  ')}
}
`;
}

function writeApiPackages(root: string, options: ProjectOptions): void {
  if (!options.apps.api) return;
  const hasClientConsumer = options.apps.web || options.apps.mobile || options.apps.desktop || options.apps.extension;
  const packages = [
    ['contracts', { dependencies: CONTRACTS_DEPENDENCIES.dependencies }, contractSource(options)],
    ...(hasClientConsumer
      ? [['api-client', { dependencies: API_CLIENT_DEPENDENCIES.dependencies }, apiClientSource(options)] as const]
      : []),
  ] as const;

  for (const [name, fields, source] of packages) {
    const dir = path.join(root, `packages/${name}`);
    writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: `@shared/${name}`,
      version: '0.1.0',
      private: true,
      type: 'module',
      exports: { '.': './src/index.ts' },
      scripts: { build: 'pnpm typecheck', typecheck: 'tsc --noEmit' },
      devDependencies: SHARED_PACKAGE_DEPENDENCIES.devDependencies,
      ...fields,
    }, null, 2) + '\n');
    writeTsConfig(dir);
    writeFile(path.join(dir, 'src/index.ts'), source);
  }
}

function writeRealtimePackage(root: string, options: ProjectOptions): void {
  const hasClientConsumer = options.apps.web || options.apps.mobile || options.apps.desktop || options.apps.extension;
  if (!options.features.billing || !hasClientConsumer) return;
  const dir = path.join(root, 'packages/realtime');
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: '@shared/realtime',
    version: '0.1.0',
    private: true,
    type: 'module',
    exports: { '.': './src/index.ts' },
    scripts: { build: 'pnpm typecheck', typecheck: 'tsc --noEmit' },
    dependencies: REALTIME_DEPENDENCIES.dependencies,
    devDependencies: REALTIME_DEPENDENCIES.devDependencies,
  }, null, 2) + '\n');
  writeTsConfig(dir);
  writeFile(path.join(dir, 'src/index.ts'), `import * as Ably from 'ably';
import { SubscriptionChangedEventSchema, type RealtimeTokenRequest } from '@shared/contracts';

export type SubscriptionRealtimeOptions = {
  userId: string;
  getTokenRequest: () => Promise<RealtimeTokenRequest>;
  onChange: (revision: number) => void;
  onError?: (error: Error) => void;
};

export function subscriptionChannelName(userId: string): string {
  return 'private:users:' + userId + ':subscriptions';
}

export function subscribeToSubscriptionChanges(options: SubscriptionRealtimeOptions): () => void {
  const client = new Ably.Realtime({
    clientId: options.userId,
    authCallback: (_params, callback) => {
      void options.getTokenRequest().then(
        (tokenRequest) => callback(null, tokenRequest),
        (error: unknown) => callback(error instanceof Error ? error.message : 'Realtime authorization failed', null),
      );
    },
  });
  const channel = client.channels.get(subscriptionChannelName(options.userId));
  const listener = (message: Ably.Message) => {
    const parsed = SubscriptionChangedEventSchema.safeParse(message.data);
    if (parsed.success) options.onChange(parsed.data.revision);
  };
  const stateListener = (change: Ably.ConnectionStateChange) => {
    if (change.current === 'failed' && change.reason) options.onError?.(change.reason);
  };
  client.connection.on(stateListener);
  void channel.subscribe('subscription.changed', listener).catch((error: unknown) => {
    options.onError?.(error instanceof Error ? error : new Error('Realtime subscription failed'));
  });
  return () => {
    channel.unsubscribe('subscription.changed', listener);
    client.connection.off(stateListener);
    client.close();
  };
}
`);
}

export function scaffoldSharedPackages(root: string, options: ProjectOptions): void {
  writeSharedDatabase(root, options);
  writeApiPackages(root, options);
  writeRealtimePackage(root, options);
}

import path from 'node:path';
import { anhedralPrint } from '../print.js';
import { appendGitignore, writeFile } from '../util.js';
import { childPackageName, jsString } from '../render.js';
import { BACKEND_DEPENDENCIES } from '../dependencies.js';
import type { ProjectOptions } from '../project.js';

function pick(source: Record<string, string>, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, source[name]]).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function dependenciesFor(options: ProjectOptions): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const dependencies = BACKEND_DEPENDENCIES.dependencies ?? {};
  const devDependencies = BACKEND_DEPENDENCIES.devDependencies ?? {};
  const selected = pick(dependencies, [
    '@shared/contracts',
    'fastify',
    '@fastify/cors',
    '@fastify/compress',
    '@fastify/helmet',
    '@fastify/rate-limit',
    'zod',
    ...(options.features.database ? ['@shared/db', 'drizzle-orm'] : []),
    ...(options.features.auth ? ['@clerk/fastify'] : []),
    ...(options.features.billing ? ['ably'] : []),
    ...(options.features.storage ? ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'] : []),
  ]);
  return {
    dependencies: selected,
    devDependencies: pick(devDependencies, ['typescript', 'tsx', '@types/node', 'vitest', '@vitest/coverage-v8']),
  };
}

function corsOrigins(options: ProjectOptions): string[] {
  return [
    options.apps.web ? 'http://localhost:3000' : null,
    options.apps.mobile ? 'http://localhost:8081' : null,
    options.apps.desktop ? 'http://127.0.0.1:5173' : null,
    options.apps.desktop ? 'null' : null,
  ].filter((value): value is string => value !== null);
}

function envSource(options: ProjectOptions): string {
  const defaultCorsOrigins = corsOrigins(options);
  const hasSemanticProviderValidation = options.features.database || options.features.auth || options.features.storage;
  const fields = [
    "NODE_ENV: z.enum(['development', 'test', 'production']).default('development')",
    "PORT: z.coerce.number().int().positive().default(8787)",
    'TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(16).default(0)',
    'CORS_ORIGINS: CorsOriginsSchema',
    "ANHEDRAL_DEMO: z.enum(['true', 'false']).default('false')",
    options.features.database ? 'DATABASE_URL: z.string().min(1)' : null,
    options.features.auth ? 'CLERK_PUBLISHABLE_KEY: z.string().optional()' : null,
    options.features.auth ? 'CLERK_SECRET_KEY: z.string().optional()' : null,
    options.features.billing ? 'RC_WEBHOOK_SECRET: OptionalSecretSchema' : null,
    options.features.billing ? 'RC_SECRET_API_KEY: OptionalSecretSchema' : null,
    options.features.billing ? "RC_ENTITLEMENT_ID: z.string().default('pro')" : null,
    options.features.billing ? 'ABLY_API_KEY: OptionalSecretSchema' : null,
    options.features.storage ? 'R2_ACCOUNT_ID: z.string().optional()' : null,
    options.features.storage ? 'R2_ACCESS_KEY_ID: z.string().optional()' : null,
    options.features.storage ? 'R2_SECRET_ACCESS_KEY: z.string().optional()' : null,
    options.features.storage ? 'BASE_URL: OptionalUrlSchema' : null,
    options.features.storage ? 'R2_BUCKET_NAME: z.string().optional()' : null,
    options.features.storage ? "R2_PREFIX: z.string().trim().regex(/^[a-zA-Z0-9._-]+$/).default('storage')" : null,
    options.features.storage ? 'R2_PROXY_READ_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(604800).default(600)' : null,
    options.features.storage ? 'CLOUDFLARE_API_TOKEN: z.string().optional()' : null,
    options.features.billing || options.features.storage ? 'CRON_SECRET: OptionalSecretSchema' : null,
  ].filter((value): value is string => value !== null);
  const productionKeys = [...new Set([
    ...(options.features.auth ? ['CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'] : []),
    ...(options.features.billing ? ['RC_WEBHOOK_SECRET', 'RC_SECRET_API_KEY', 'ABLY_API_KEY', 'CRON_SECRET'] : []),
    ...(options.features.storage ? ['BASE_URL', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'CRON_SECRET'] : []),
  ])];
  return `import { z } from 'zod';

${hasSemanticProviderValidation ? `function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0
    || normalized.includes('***')
    || /^(?:x|\\*)+$/.test(normalized)
    || /^(?:(?:change|replace)(?:[-_ ]?me)?|your|example|placeholder|test|secret|password|pass|username|user)(?:[-_ ].*)?$/.test(normalized);
}
` : ''}
${options.features.billing || options.features.storage ? `function hasLowSecretDiversity(value: string): boolean {
  return new Set(value).size < 8 || /(.)\\1{15,}/.test(value);
}
` : ''}
${options.features.database ? `function assertProductionDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL in production');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the postgres: or postgresql: protocol in production');
  }
  let username = url.username;
  let password = url.password;
  try {
    username = decodeURIComponent(username);
    password = decodeURIComponent(password);
  } catch {
    throw new Error('DATABASE_URL credentials must be valid URL-encoded values in production');
  }
  if (!username || !password || isPlaceholder(username) || isPlaceholder(password)) {
    throw new Error('DATABASE_URL must contain non-placeholder username and password credentials in production');
  }
  const hostname = url.hostname.toLowerCase();
  const localOrExampleHost = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '127.0.0.1'
    || hostname.startsWith('127.')
    || hostname === '0.0.0.0'
    || hostname === '[::1]'
    || hostname === '::1'
    || hostname === 'example'
    || hostname === 'example.com'
    || hostname.startsWith('example.')
    || hostname.includes('.example.')
    || hostname.endsWith('.example')
    || hostname.endsWith('.example.com')
    || hostname.endsWith('.invalid')
    || hostname.endsWith('.test');
  if (!hostname || isPlaceholder(hostname) || localOrExampleHost) {
    throw new Error('DATABASE_URL must use a non-local, non-placeholder database host in production');
  }
}
` : ''}
${options.features.auth ? `function assertProductionClerkKey(
  key: 'CLERK_PUBLISHABLE_KEY' | 'CLERK_SECRET_KEY',
  value: string | undefined,
  prefix: 'pk_live_' | 'sk_live_',
): void {
  const suffix = value?.startsWith(prefix) ? value.slice(prefix.length) : '';
  if (!value || suffix.length < 20 || !/^[A-Za-z0-9_-]+={0,2}$/.test(suffix) || isPlaceholder(suffix)) {
    throw new Error(\`\${key} must be a well-formed \${prefix} production key\`);
  }
}
` : ''}
${options.features.storage ? `function assertProductionR2Configuration(env: AppEnv): void {
  if (!env.BASE_URL || new URL(env.BASE_URL).protocol !== 'https:' || isPlaceholder(new URL(env.BASE_URL).hostname)) {
    throw new Error('BASE_URL must be the canonical HTTPS application origin in production');
  }
  if (!env.R2_ACCOUNT_ID || !/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID) || isPlaceholder(env.R2_ACCOUNT_ID)) {
    throw new Error('R2_ACCOUNT_ID must be a 32-character Cloudflare account ID in production');
  }
  if (!env.R2_ACCESS_KEY_ID || !/^[a-f0-9]{32}$/i.test(env.R2_ACCESS_KEY_ID) || isPlaceholder(env.R2_ACCESS_KEY_ID)) {
    throw new Error('R2_ACCESS_KEY_ID must be a 32-character R2 access key ID in production');
  }
  if (!env.R2_SECRET_ACCESS_KEY || !/^[a-f0-9]{64}$/i.test(env.R2_SECRET_ACCESS_KEY) || isPlaceholder(env.R2_SECRET_ACCESS_KEY)) {
    throw new Error('R2_SECRET_ACCESS_KEY must be a 64-character R2 secret access key in production');
  }
  if (!env.R2_BUCKET_NAME || !/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(env.R2_BUCKET_NAME) || isPlaceholder(env.R2_BUCKET_NAME)) {
    throw new Error('R2_BUCKET_NAME must be 3-63 lowercase letters, numbers, or hyphens and start and end with an alphanumeric character');
  }
}
` : ''}
${options.features.billing ? `const OptionalSecretSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().optional(),
);

function assertStrongBillingSecret(key: 'RC_WEBHOOK_SECRET' | 'RC_SECRET_API_KEY' | 'ABLY_API_KEY' | 'CRON_SECRET', value: string | undefined): void {
  const normalized = value?.trim().toLowerCase() ?? '';
  const placeholder = normalized.includes('***')
    || /^(?:change[-_ ]?me|replace[-_ ]?me|your[-_ ]|example|placeholder|test|secret|webhook[-_ ]?secret)/.test(normalized)
    || /^(?:x|\\*)+$/.test(normalized);
  if (!value || value.length < 32 || placeholder || hasLowSecretDiversity(value)) {
    throw new Error(\`\${key} must be at least 32 characters, non-placeholder, and sufficiently diverse in production\`);
  }
}
` : ''}
${options.features.storage && !options.features.billing ? `const OptionalSecretSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().optional(),
);
` : ''}
${options.features.storage ? `const OptionalUrlSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
);
` : ''}
${options.features.billing || options.features.storage ? `function assertStrongCronSecret(value: string | undefined): void {
  if (!value || value.length < 32 || isPlaceholder(value) || hasLowSecretDiversity(value)) {
    throw new Error('CRON_SECRET must be at least 32 characters, non-placeholder, and sufficiently diverse in production');
  }
}
` : ''}

const CorsOriginsSchema = z.string().default(${JSON.stringify(defaultCorsOrigins.join(','))}).transform((value, context) => {
  const origins = [...new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean))];
  for (const origin of origins) {
    if (origin === 'null') continue;
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('not an HTTP(S) origin');
    } catch {
      context.addIssue({ code: 'custom', message: \`Invalid CORS origin: \${origin}\` });
      return z.NEVER;
    }
  }
  return origins;
});

const EnvSchema = z.object({
  ${fields.join(',\n  ')},
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const env = EnvSchema.parse(source);
  if (env.NODE_ENV === 'production' && env.ANHEDRAL_DEMO === 'true') {
    throw new Error('ANHEDRAL_DEMO must be false in production');
  }
  if (env.NODE_ENV === 'production') {
    ${defaultCorsOrigins.length > 0 ? `if (!source.CORS_ORIGINS?.trim() || env.CORS_ORIGINS.length === 0) {
      throw new Error('Missing production environment variable: CORS_ORIGINS');
    }` : ''}
    for (const origin of env.CORS_ORIGINS) {
      if (origin !== 'null' && new URL(origin).protocol !== 'https:') {
        throw new Error('CORS_ORIGINS must contain only explicit HTTPS origins in production (literal null is allowed for desktop applications)');
      }
    }
    ${productionKeys.length > 0 ? `const productionKeys = ${JSON.stringify(productionKeys)} as const;
    for (const key of productionKeys) {
      if (!env[key]?.trim()) throw new Error(\`Missing production environment variable: \${key}\`);
    }` : ''}
    ${options.features.database ? 'assertProductionDatabaseUrl(env.DATABASE_URL);' : ''}
    ${options.features.auth ? `assertProductionClerkKey('CLERK_PUBLISHABLE_KEY', env.CLERK_PUBLISHABLE_KEY, 'pk_live_');
    assertProductionClerkKey('CLERK_SECRET_KEY', env.CLERK_SECRET_KEY, 'sk_live_');` : ''}
    ${options.features.billing ? `assertStrongBillingSecret('RC_WEBHOOK_SECRET', env.RC_WEBHOOK_SECRET);
    assertStrongBillingSecret('RC_SECRET_API_KEY', env.RC_SECRET_API_KEY);
    assertStrongBillingSecret('ABLY_API_KEY', env.ABLY_API_KEY);` : ''}
    ${options.features.billing || options.features.storage ? 'assertStrongCronSecret(env.CRON_SECRET);' : ''}
    ${options.features.storage ? 'assertProductionR2Configuration(env);' : ''}
  }
  return env;
}
`;
}

function envTestSource(options: ProjectOptions): string {
  const defaultCorsOrigins = corsOrigins(options);
  const productionFields = [
    "NODE_ENV: 'production'",
    "ANHEDRAL_DEMO: 'false'",
    defaultCorsOrigins.length > 0 ? "CORS_ORIGINS: 'https://console.acme.dev,null'" : null,
    options.features.database
      ? "DATABASE_URL: syntheticDatabaseUrl('ep-bright-cloud-a1b2c3.us-east-2.aws.neon.tech')"
      : null,
    options.features.auth ? "CLERK_PUBLISHABLE_KEY: syntheticClerkKey('pk')" : null,
    options.features.auth ? "CLERK_SECRET_KEY: syntheticClerkKey('sk')" : null,
    options.features.billing ? "RC_WEBHOOK_SECRET: syntheticSecret('webhook')" : null,
    options.features.billing ? "RC_SECRET_API_KEY: syntheticSecret('revenuecat')" : null,
    options.features.billing ? "RC_ENTITLEMENT_ID: 'pro'" : null,
    options.features.billing ? "ABLY_API_KEY: syntheticSecret('ably')" : null,
    options.features.storage ? "R2_ACCOUNT_ID: 'a'.repeat(32)" : null,
    options.features.storage ? "R2_ACCESS_KEY_ID: 'b'.repeat(32)" : null,
    options.features.storage ? "R2_SECRET_ACCESS_KEY: 'c'.repeat(64)" : null,
    options.features.storage ? "BASE_URL: 'https://app.acme.dev'" : null,
    options.features.storage ? "R2_BUCKET_NAME: 'production-uploads'" : null,
    options.features.storage ? "R2_PREFIX: 'storage'" : null,
    options.features.storage ? "R2_PROXY_READ_URL_TTL_SECONDS: '600'" : null,
    options.features.storage ? 'CLOUDFLARE_API_TOKEN: undefined' : null,
    options.features.billing || options.features.storage ? "CRON_SECRET: syntheticSecret('cron')" : null,
  ].filter((value): value is string => value !== null);
  const cases = [
    `  it('rejects demo mode in production', () => {
    expect(() => loadEnv({ ...validProductionEnv, ANHEDRAL_DEMO: 'true' })).toThrow(/ANHEDRAL_DEMO must be false/);
  });`,
    defaultCorsOrigins.length > 0 ? `  it('requires explicit HTTPS browser origins while retaining the desktop null origin', () => {
    expect(() => loadEnv({ ...validProductionEnv, CORS_ORIGINS: undefined })).toThrow(/Missing production environment variable: CORS_ORIGINS/);
    expect(() => loadEnv({ ...validProductionEnv, CORS_ORIGINS: 'http://app.acme.dev' })).toThrow(/only explicit HTTPS origins/);
    expect(loadEnv({ ...validProductionEnv, CORS_ORIGINS: 'https://app.acme.dev,null' }).CORS_ORIGINS).toEqual([
      'https://app.acme.dev',
      'null',
    ]);
  });` : `  it('still rejects insecure origins when an API-only deployment opts into browser CORS', () => {
    expect(() => loadEnv({ ...validProductionEnv, CORS_ORIGINS: 'http://app.acme.dev' })).toThrow(/only explicit HTTPS origins/);
    expect(loadEnv({ ...validProductionEnv, CORS_ORIGINS: 'https://app.acme.dev' }).CORS_ORIGINS).toEqual(['https://app.acme.dev']);
  });`,
    options.features.database ? `  it('requires a real PostgreSQL URL with non-placeholder credentials and host', () => {
    expect(() => loadEnv({ ...validProductionEnv, DATABASE_URL: syntheticDatabaseUrl('db.acme.dev').replace('postgresql:', 'https:') })).toThrow(/postgres: or postgresql:/);
    expect(() => loadEnv({ ...validProductionEnv, DATABASE_URL: syntheticDatabaseUrl('db.acme.dev', 'user') })).toThrow(/non-placeholder username and password/);
    expect(() => loadEnv({ ...validProductionEnv, DATABASE_URL: syntheticDatabaseUrl('localhost') })).toThrow(/non-local, non-placeholder database host/);
    expect(() => loadEnv({ ...validProductionEnv, DATABASE_URL: syntheticDatabaseUrl('db.example.com') })).toThrow(/non-local, non-placeholder database host/);
  });` : null,
    options.features.auth ? `  it('requires well-formed Clerk live keys', () => {
    expect(() => loadEnv({ ...validProductionEnv, CLERK_PUBLISHABLE_KEY: syntheticClerkKey('pk', 'test') })).toThrow(/CLERK_PUBLISHABLE_KEY must be a well-formed pk_live_/);
    expect(() => loadEnv({ ...validProductionEnv, CLERK_PUBLISHABLE_KEY: 'pk_live_example-placeholder-value' })).toThrow(/CLERK_PUBLISHABLE_KEY must be a well-formed pk_live_/);
    expect(() => loadEnv({ ...validProductionEnv, CLERK_SECRET_KEY: syntheticClerkKey('sk', 'test') })).toThrow(/CLERK_SECRET_KEY must be a well-formed sk_live_/);
  });` : null,
    options.features.billing ? `  it('retains strong RevenueCat server-secret validation', () => {
    expect(() => loadEnv({ ...validProductionEnv, RC_WEBHOOK_SECRET: 'webhook-secret' })).toThrow(/RC_WEBHOOK_SECRET must be at least 32 characters/);
    expect(() => loadEnv({ ...validProductionEnv, RC_SECRET_API_KEY: '${'x'.repeat(40)}' })).toThrow(/RC_SECRET_API_KEY must be at least 32 characters/);
    expect(() => loadEnv({ ...validProductionEnv, RC_WEBHOOK_SECRET: 'a'.repeat(40) })).toThrow(/sufficiently diverse/);
  });` : null,
    options.features.storage ? `  it('validates R2 credential and bucket formats plus cron-secret entropy', () => {
    expect(() => loadEnv({ ...validProductionEnv, R2_ACCOUNT_ID: 'account' })).toThrow(/R2_ACCOUNT_ID must be a 32-character/);
    expect(() => loadEnv({ ...validProductionEnv, R2_ACCESS_KEY_ID: 'access' })).toThrow(/R2_ACCESS_KEY_ID must be a 32-character/);
    expect(() => loadEnv({ ...validProductionEnv, R2_SECRET_ACCESS_KEY: '${'c'.repeat(63)}' })).toThrow(/R2_SECRET_ACCESS_KEY must be a 64-character/);
    expect(() => loadEnv({ ...validProductionEnv, BASE_URL: 'http://app.acme.dev' })).toThrow(/BASE_URL must be the canonical HTTPS/);
    expect(() => loadEnv({ ...validProductionEnv, R2_BUCKET_NAME: 'Production_Uploads' })).toThrow(/R2_BUCKET_NAME must be 3-63/);
    expect(() => loadEnv({ ...validProductionEnv, R2_PREFIX: 'nested/storage' })).toThrow();
    expect(() => loadEnv({ ...validProductionEnv, R2_PROXY_READ_URL_TTL_SECONDS: '59' })).toThrow();
    expect(() => loadEnv({ ...validProductionEnv, CRON_SECRET: 'change-me-${'x'.repeat(32)}' })).toThrow(/CRON_SECRET must be at least 32 characters/);
    expect(() => loadEnv({ ...validProductionEnv, CRON_SECRET: 'a'.repeat(40) })).toThrow(/sufficiently diverse/);
  });` : null,
    options.features.storage ? `  it('treats a blank optional BASE_URL as unset outside production', () => {
    expect(loadEnv({ ...validProductionEnv, NODE_ENV: 'test', BASE_URL: '' }).BASE_URL).toBeUndefined();
  });` : null,
  ].filter((value): value is string => value !== null);
  return `import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env';

${options.features.database ? `function syntheticDatabaseUrl(host: string, username = 'app_owner'): string {
  return ['postgresql://', username, ':', 'S3cureRandomDatabaseCredential123', '@', host, '/app?sslmode=require'].join('');
}
` : ''}${options.features.auth ? `function syntheticClerkKey(kind: 'pk' | 'sk', environment: 'live' | 'test' = 'live'): string {
  return [kind, environment, 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4'].join('_');
}
` : ''}${options.features.billing || options.features.storage ? `function syntheticSecret(label: string): string {
  return [label, 'A1b2C3d4E5f6G7h8', 'I9j0K1l2M3n4O5p6'].join('_');
}
` : ''}
const validProductionEnv = {
  ${productionFields.join(',\n  ')},
} satisfies NodeJS.ProcessEnv;

describe('production environment validation', () => {
  it('accepts a complete, well-shaped provider configuration', () => {
    expect(() => loadEnv(validProductionEnv)).not.toThrow();
  });

${cases.join('\n\n')}
});
`;
}

function authSource(): string {
  return `import { clerkPlugin, getAuth } from '@clerk/fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppEnv } from './env';

export async function registerAuth(app: FastifyInstance, env: AppEnv) {
  if (env.ANHEDRAL_DEMO === 'true') return;
  await app.register(clerkPlugin, {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  });
}

export function authenticatedUserId(request: FastifyRequest, env: AppEnv): string {
  if (env.ANHEDRAL_DEMO === 'true') return 'demo-user';
  const userId = getAuth(request).userId;
  if (!userId) {
    const error = new Error('Authentication required') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }
  return userId;
}
`;
}

function storageSource(): string {
  return `import crypto from 'node:crypto';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, asc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { db, sqlClient, uploads } from '@shared/db';
import type { CreateUploadRequest, UploadRecord as PublicUploadRecord } from '@shared/contracts';
import type { AppEnv } from './env';

export const UPLOAD_URL_EXPIRES_IN_SECONDS = 120;
export const MAX_PENDING_UPLOADS_PER_USER = 10;
export const MAX_PENDING_UPLOAD_BYTES_PER_USER = 50 * 1024 * 1024;
export const MAX_UPLOAD_URL_ISSUANCES_PER_USER_PER_HOUR = 60;
export const MAX_UPLOAD_CLEANUP_BATCH_SIZE = 50;
export const MAX_UPLOAD_CLEANUP_ITEMS_PER_RUN = 250;
export const MAX_UPLOAD_CLEANUP_RUN_MS = 8_000;
export const UPLOAD_CLEANUP_GRACE_MS = 10 * 60 * 1000;

type UploadRow = typeof uploads.$inferSelect;

export class StorageError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export function objectKeyForUser(userId: string, fileName: string, prefix = 'storage'): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const safeFile = fileName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'upload';
  return \`\${prefix}/staging/\${safeUser}/\${crypto.randomUUID()}--\${safeFile}\`;
}

function confirmedObjectKeyForUpload(userId: string, uploadId: string, stagingObjectKey: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const prefix = stagingObjectKey.split('/')[0] ?? 'storage';
  const leaf = stagingObjectKey.split('/').at(-1) ?? 'upload';
  const separator = leaf.indexOf('--');
  const safeFile = separator >= 0 ? leaf.slice(separator + 2) : leaf;
  // Confirmation validates only provider-reported size/type metadata. The object bytes remain
  // untrusted application input and require content-specific validation before use.
  return \`\${prefix}/confirmed/\${safeUser}/\${uploadId}--\${safeFile}\`;
}

function publicUpload(row: UploadRow, baseUrl: string): PublicUploadRecord {
  const status = row.status === 'pending' || row.status === 'confirmed' || row.status === 'rejected'
    ? row.status
    : 'rejected';
  return {
    id: row.id,
    objectKey: row.objectKey ?? row.stagingObjectKey,
    contentType: row.contentType as PublicUploadRecord['contentType'],
    sizeBytes: row.actualSize ?? row.expectedSize,
    status,
    contentTrust: 'untrusted' as const,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    privateReadUrl: baseUrl.replace(/\\/+$/, '') + '/api/storage/uploads/' + encodeURIComponent(row.id) + '/read-url',
  };
}

export interface UploadStore {
  reserve(input: {
    id: string;
    userId: string;
    stagingObjectKey: string;
    contentType: string;
    expectedSize: number;
    uploadUrlExpiresAt: Date;
  }): Promise<void>;
  find(id: string, userId: string): Promise<UploadRow | null>;
  confirm(id: string, userId: string, finalObjectKey: string, actualSize: number): Promise<UploadRow>;
  reject(id: string, userId: string, actualSize: number | null, reason: string): Promise<void>;
  listCleanupCandidates(
    now: Date,
    limit: number,
    after?: { createdAt: Date; id: string },
  ): Promise<UploadRow[]>;
  completeStagingCleanup(upload: UploadRow, completedAt: Date): Promise<void>;
}

export const uploadStore: UploadStore = {
  async reserve(input) {
    // Neon HTTP supports a one-shot transaction. The per-user advisory transaction lock makes
    // expiration, issuance-rate enforcement, quota checks, and insertion atomic across API
    // instances without a long-lived database session.
    const transactionResults = await sqlClient.transaction((txn) => [
      txn\`SELECT pg_advisory_xact_lock(hashtextextended(\${input.userId}, 0))\`,
      txn\`UPDATE "uploads"
        SET "status" = 'rejected', "rejection_reason" = 'upload_expired'
        WHERE "user_id" = \${input.userId}
          AND "status" = 'pending'
          AND "upload_url_expires_at" <= now() - (\${UPLOAD_CLEANUP_GRACE_MS} * interval '1 millisecond')\`,
      txn\`SELECT count(*)::integer AS "recentIssuances" FROM "uploads"
        WHERE "user_id" = \${input.userId}
          AND "created_at" >= now() - interval '1 hour'\`,
      txn\`INSERT INTO "uploads" (
        "id", "user_id", "staging_object_key", "content_type", "expected_size", "status", "upload_url_expires_at"
      )
      SELECT
        \${input.id}, \${input.userId}, \${input.stagingObjectKey}, \${input.contentType},
        \${input.expectedSize}, 'pending', \${input.uploadUrlExpiresAt}
      WHERE (
        SELECT count(*) FROM "uploads"
        WHERE "user_id" = \${input.userId}
          AND "status" = 'pending'
      ) < \${MAX_PENDING_UPLOADS_PER_USER}
      AND (
        SELECT coalesce(sum("expected_size"), 0) FROM "uploads"
        WHERE "user_id" = \${input.userId}
          AND "status" = 'pending'
      ) + \${input.expectedSize} <= \${MAX_PENDING_UPLOAD_BYTES_PER_USER}
      AND (
        SELECT count(*) FROM "uploads"
        WHERE "user_id" = \${input.userId}
          AND "created_at" >= now() - interval '1 hour'
      ) < \${MAX_UPLOAD_URL_ISSUANCES_PER_USER_PER_HOUR}
      RETURNING "id"\`,
    ], { isolationLevel: 'ReadCommitted' });
    const recentIssuances = Number((transactionResults[2] as Array<{ recentIssuances: number }> | undefined)?.[0]?.recentIssuances ?? 0);
    const inserted = transactionResults[3] as Array<{ id: string }> | undefined;
    if (!inserted?.[0]) {
      if (recentIssuances >= MAX_UPLOAD_URL_ISSUANCES_PER_USER_PER_HOUR) {
        throw new StorageError('Upload URL issuance rate exceeded', 429, 'upload_rate_exceeded');
      }
      throw new StorageError('Pending upload quota exceeded', 429, 'upload_quota_exceeded');
    }
  },

  async find(id, userId) {
    const [upload] = await db.select().from(uploads)
      .where(and(eq(uploads.id, id), eq(uploads.userId, userId)))
      .limit(1);
    return upload ?? null;
  },

  async confirm(id, userId, finalObjectKey, actualSize) {
    const [upload] = await db.update(uploads).set({
      status: 'confirmed',
      objectKey: finalObjectKey,
      actualSize,
      confirmedAt: new Date(),
      rejectionReason: null,
    }).where(and(
      eq(uploads.id, id),
      eq(uploads.userId, userId),
      eq(uploads.status, 'pending'),
    )).returning();
    if (upload) return upload;
    const existing = await this.find(id, userId);
    if (existing?.status === 'confirmed' && existing.objectKey === finalObjectKey) return existing;
    throw new StorageError('Upload state changed while it was being finalized', 409, 'upload_state_changed');
  },

  async reject(id, userId, actualSize, reason) {
    await db.update(uploads).set({
      status: 'rejected',
      actualSize,
      rejectionReason: reason.slice(0, 200),
    }).where(and(
      eq(uploads.id, id),
      eq(uploads.userId, userId),
      eq(uploads.status, 'pending'),
    ));
  },

  async listCleanupCandidates(now, limit, after) {
    return db.select().from(uploads).where(and(
      isNull(uploads.stagingDeletedAt),
      lte(uploads.uploadUrlExpiresAt, now),
      or(
        eq(uploads.status, 'pending'),
        eq(uploads.status, 'confirmed'),
        eq(uploads.status, 'rejected'),
      ),
      after ? or(
        gt(uploads.createdAt, after.createdAt),
        and(eq(uploads.createdAt, after.createdAt), gt(uploads.id, after.id)),
      ) : undefined,
    )).orderBy(asc(uploads.createdAt), asc(uploads.id)).limit(limit);
  },

  async completeStagingCleanup(upload, completedAt) {
    if (upload.status === 'pending') {
      await db.update(uploads).set({
        status: 'rejected',
        rejectionReason: 'upload_expired',
        stagingDeletedAt: completedAt,
      }).where(and(
        eq(uploads.id, upload.id),
        eq(uploads.userId, upload.userId),
        eq(uploads.status, 'pending'),
        lte(uploads.uploadUrlExpiresAt, completedAt),
        isNull(uploads.stagingDeletedAt),
      ));
      return;
    }
    await db.update(uploads).set({ stagingDeletedAt: completedAt }).where(and(
      eq(uploads.id, upload.id),
      eq(uploads.userId, upload.userId),
      eq(uploads.status, upload.status),
      isNull(uploads.stagingDeletedAt),
    ));
  },
};

type ObjectMetadata = { sizeBytes: number; contentType: string | null; etag: string | null };

export interface ObjectGateway {
  signPut(objectKey: string, contentType: string, contentLength: number, expiresIn: number): Promise<string>;
  signGet?(objectKey: string, expiresIn: number): Promise<string>;
  head(objectKey: string): Promise<ObjectMetadata | null>;
  copy(sourceObjectKey: string, destinationObjectKey: string, sourceEtag: string): Promise<void>;
  delete(objectKey: string): Promise<void>;
}

let cachedClient: { key: string; client: S3Client } | null = null;

function storageConfiguration(env: AppEnv) {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    throw new StorageError('R2 is not configured', 503, 'storage_not_configured');
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET_NAME,
  };
}

function clientFor(env: AppEnv): { client: S3Client; bucket: string } {
  const config = storageConfiguration(env);
  const key = \`\${config.accountId}:\${config.accessKeyId}:\${config.bucket}\`;
  if (cachedClient?.key === key) return { client: cachedClient.client, bucket: config.bucket };
  const client = new S3Client({
    region: 'auto',
    endpoint: \`https://\${config.accountId}.r2.cloudflarestorage.com\`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  cachedClient = { key, client };
  return { client, bucket: config.bucket };
}

function isMissingObject(error: unknown): boolean {
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate?.name === 'NotFound'
    || candidate?.name === 'NoSuchKey'
    || candidate?.$metadata?.httpStatusCode === 404;
}

export function createObjectGateway(env: AppEnv): ObjectGateway {
  const { client, bucket } = clientFor(env);
  return {
    async signPut(objectKey, contentType, contentLength, expiresIn) {
      return getSignedUrl(client, new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ContentType: contentType,
        ContentLength: contentLength,
      }), {
        expiresIn,
        // The SDK intentionally treats content-type as unsignable unless it is opted back in.
        signableHeaders: new Set(['content-type', 'content-length']),
      });
    },
    async signGet(objectKey, expiresIn) {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }), { expiresIn });
    },
    async head(objectKey) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
        return {
          sizeBytes: result.ContentLength ?? -1,
          contentType: result.ContentType ?? null,
          etag: result.ETag ?? null,
        };
      } catch (error) {
        if (isMissingObject(error)) return null;
        throw error;
      }
    },
    async copy(sourceObjectKey, destinationObjectKey, sourceEtag) {
      await client.send(new CopyObjectCommand({
        Bucket: bucket,
        Key: destinationObjectKey,
        CopySource: \`\${bucket}/\${encodeURIComponent(sourceObjectKey)}\`,
        CopySourceIfMatch: sourceEtag,
        MetadataDirective: 'COPY',
      }));
    },
    async delete(objectKey) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    },
  };
}

export interface StorageService {
  createUpload(userId: string, input: CreateUploadRequest): Promise<{
    uploadId: string;
    stagingObjectKey: string;
    uploadUrl: string;
    expiresIn: number;
    requiredHeaders: { 'content-type': CreateUploadRequest['contentType'] };
    sizeBytes: number;
    signedContentLength: number;
    metadataValidationRequired: true;
  }>;
  confirmUpload(userId: string, uploadId: string): Promise<{ upload: PublicUploadRecord }>;
  getUpload(userId: string, uploadId: string): Promise<{ upload: PublicUploadRecord }>;
  createReadUrl(userId: string, uploadId: string): Promise<{ url: string; expiresIn: number }>;
  cleanupUploads(limit?: number): Promise<{
    processed: number;
    cleaned: number;
    failed: number;
    batches: number;
    backlogRemaining: boolean;
    oldestBacklogCreatedAt: string | null;
    itemLimitReached: boolean;
    timeLimitReached: boolean;
  }>;
}

class CleanupDeadlineExceeded extends Error {
  constructor() {
    super('Storage cleanup deadline exceeded');
    this.name = 'CleanupDeadlineExceeded';
  }
}

async function beforeCleanupDeadline<T>(deadline: number, operation: () => Promise<T>): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new CleanupDeadlineExceeded();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CleanupDeadlineExceeded()), remaining);
    timer.unref();
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createStorageService(
  env: AppEnv,
  dependencies: { store?: UploadStore; objects?: ObjectGateway } = {},
): StorageService {
  const store = dependencies.store ?? uploadStore;
  const baseUrl = env.BASE_URL ?? 'http://localhost:8787';
  const objectGateway = () => dependencies.objects ?? createObjectGateway(env);
  const finishConfirmedUpload = async (upload: UploadRow, objects: ObjectGateway) => {
    if (!upload.stagingDeletedAt) {
      try {
        await objects.delete(upload.stagingObjectKey);
        const now = new Date();
        if (now.getTime() >= upload.uploadUrlExpiresAt.getTime() + UPLOAD_CLEANUP_GRACE_MS) {
          await store.completeStagingCleanup(upload, now);
        }
      } catch {
        throw new StorageError('Upload is confirmed but staging cleanup must be retried', 503, 'upload_staging_cleanup_failed');
      }
    }
    return { upload: publicUpload(upload, baseUrl) };
  };

  return {
    async createUpload(userId, input) {
      const uploadId = crypto.randomUUID();
      const stagingObjectKey = objectKeyForUser(userId, input.fileName, env.R2_PREFIX);
      const uploadUrlExpiresAt = new Date(Date.now() + UPLOAD_URL_EXPIRES_IN_SECONDS * 1000);
      await store.reserve({
        id: uploadId,
        userId,
        stagingObjectKey,
        contentType: input.contentType,
        expectedSize: input.sizeBytes,
        uploadUrlExpiresAt,
      });
      try {
        // Content-Length is part of the SigV4 signed headers. A Blob/File client emits the header
        // automatically, so R2 rejects mismatched bodies before storing them. Confirmation checks
        // provider-reported size/type metadata; it does not make uploaded bytes trustworthy.
        const uploadUrl = await objectGateway().signPut(
          stagingObjectKey,
          input.contentType,
          input.sizeBytes,
          UPLOAD_URL_EXPIRES_IN_SECONDS,
        );
        return {
          uploadId,
          stagingObjectKey,
          uploadUrl,
          expiresIn: UPLOAD_URL_EXPIRES_IN_SECONDS,
          requiredHeaders: { 'content-type': input.contentType },
          sizeBytes: input.sizeBytes,
          signedContentLength: input.sizeBytes,
          metadataValidationRequired: true as const,
        };
      } catch (error) {
        await store.reject(uploadId, userId, null, 'url_signing_failed').catch(() => undefined);
        if (error instanceof StorageError) throw error;
        throw new StorageError('Unable to create upload URL', 503, 'upload_url_failed');
      }
    },

    async confirmUpload(userId, uploadId) {
      const upload = await store.find(uploadId, userId);
      if (!upload) throw new StorageError('Upload not found', 404, 'upload_not_found');
      const objects = objectGateway();
      if (upload.status === 'confirmed') {
        return finishConfirmedUpload(upload, objects);
      }
      if (upload.status === 'rejected') {
        throw new StorageError('Upload was rejected', 409, 'upload_rejected');
      }

      const metadata = await objects.head(upload.stagingObjectKey);
      if (!metadata) throw new StorageError('Uploaded object is not available yet', 409, 'upload_not_available');
      const actualContentType = metadata.contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? null;
      const expectedContentType = upload.contentType.toLowerCase();
      if (metadata.sizeBytes !== upload.expectedSize || actualContentType !== expectedContentType) {
        try {
          await objects.delete(upload.stagingObjectKey);
        } catch {
          // Keep the row pending so this confirmation (or the bounded cleanup job after expiry)
          // can retry deletion. A rejected row must never strand an undeletable staging object.
          throw new StorageError('Invalid uploaded object cleanup must be retried', 503, 'upload_cleanup_failed');
        }
        await store.reject(
          upload.id,
          userId,
          metadata.sizeBytes >= 0 ? metadata.sizeBytes : null,
          metadata.sizeBytes !== upload.expectedSize ? 'size_mismatch' : 'content_type_mismatch',
        );
        throw new StorageError('Uploaded object metadata did not match the declared size and content type', 422, 'upload_metadata_mismatch');
      }

      if (!metadata.etag) {
        throw new StorageError('Uploaded object did not provide an ETag for conditional promotion', 503, 'upload_etag_missing');
      }
      const finalObjectKey = confirmedObjectKeyForUpload(userId, upload.id, upload.stagingObjectKey);
      try {
        // Conditional copy closes the HEAD-to-copy race. The final key is never exposed by a PUT URL.
        await objects.copy(upload.stagingObjectKey, finalObjectKey, metadata.etag);
      } catch (error) {
        // Another confirmer may have committed and removed staging after this request's HEAD.
        // Re-reading the deterministic final key makes that race idempotent.
        const current = await store.find(upload.id, userId).catch(() => null);
        if (current?.status === 'confirmed' && current.objectKey === finalObjectKey) {
          return finishConfirmedUpload(current, objects);
        }
        const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
        if (candidate?.name === 'PreconditionFailed' || candidate?.$metadata?.httpStatusCode === 412) {
          throw new StorageError('Uploaded object metadata changed during confirmation; retry confirmation', 409, 'upload_changed_during_confirmation');
        }
        throw new StorageError('Unable to promote uploaded object', 503, 'upload_promotion_failed');
      }

      let confirmed: UploadRow;
      try {
        confirmed = await store.confirm(upload.id, userId, finalObjectKey, metadata.sizeBytes);
      } catch (error) {
        let current: UploadRow | null;
        try {
          current = await store.find(upload.id, userId);
        } catch {
          // A database transport failure has an indeterminate commit outcome. Never delete the
          // promoted object here: another confirmer may have committed the same immutable key.
          throw new StorageError('Upload metadata and promoted object require reconciliation', 503, 'upload_reconciliation_required');
        }

        if (current?.status === 'confirmed' && current.objectKey === finalObjectKey) {
          confirmed = current;
        } else if (
          current === null
          || current.status === 'rejected'
          || current.status === 'confirmed'
          || (error instanceof StorageError && error.code === 'upload_state_changed')
        ) {
          // A successful re-read makes these CAS outcomes deterministic. No database row points
          // at this promoted key, so remove it instead of turning an ordinary conflict into an orphan.
          try {
            await objects.delete(finalObjectKey);
          } catch {
            throw new StorageError('Conflicting upload state requires promoted-object cleanup', 503, 'upload_final_cleanup_failed');
          }
          if (current?.status === 'rejected') {
            throw new StorageError('Upload was rejected while it was being finalized', 409, 'upload_rejected');
          }
          if (error instanceof StorageError) throw error;
          throw new StorageError('Upload state changed while it was being finalized', 409, 'upload_state_changed');
        } else {
          // A successful read that still shows pending cannot prove that a failed write did not
          // commit (or that a concurrent confirmer will not commit next), so retain the final key.
          throw new StorageError('Upload metadata and promoted object require reconciliation', 503, 'upload_reconciliation_required');
        }
      }

      return finishConfirmedUpload(confirmed, objects);
    },

    async getUpload(userId, uploadId) {
      const upload = await store.find(uploadId, userId);
      if (!upload) throw new StorageError('Upload not found', 404, 'upload_not_found');
      return { upload: publicUpload(upload, baseUrl) };
    },

    async createReadUrl(userId, uploadId) {
      const upload = await store.find(uploadId, userId);
      if (!upload || upload.status !== 'confirmed' || !upload.objectKey) {
        throw new StorageError('Asset not found', 404, 'asset_not_found');
      }
      const expiresIn = env.R2_PROXY_READ_URL_TTL_SECONDS;
      const objects = objectGateway();
      if (!objects.signGet) throw new StorageError('Private asset reads are not configured', 503, 'storage_read_not_configured');
      return {
        url: await objects.signGet(upload.objectKey, expiresIn),
        expiresIn,
      };
    },

    async cleanupUploads(limit = MAX_UPLOAD_CLEANUP_ITEMS_PER_RUN) {
      const requestedLimit = Number.isFinite(limit) ? Math.trunc(limit) : MAX_UPLOAD_CLEANUP_ITEMS_PER_RUN;
      const itemLimit = Math.max(1, Math.min(requestedLimit, MAX_UPLOAD_CLEANUP_ITEMS_PER_RUN));
      const startedAt = Date.now();
      const deadline = startedAt + MAX_UPLOAD_CLEANUP_RUN_MS;
      const expiredBefore = new Date(startedAt - UPLOAD_CLEANUP_GRACE_MS);
      let cursor: { createdAt: Date; id: string } | undefined;
      let processed = 0;
      let cleaned = 0;
      let failed = 0;
      let batches = 0;
      let timeLimitReached = false;
      let oldestKnownBacklogCreatedAt: string | null = null;
      const objects = objectGateway();

      cleanup: while (processed < itemLimit) {
        const batchLimit = Math.min(MAX_UPLOAD_CLEANUP_BATCH_SIZE, itemLimit - processed);
        let candidates: UploadRow[];
        try {
          candidates = await beforeCleanupDeadline(
            deadline,
            () => store.listCleanupCandidates(expiredBefore, batchLimit, cursor),
          );
        } catch (error) {
          if (error instanceof CleanupDeadlineExceeded) {
            timeLimitReached = true;
            break;
          }
          throw error;
        }
        if (candidates.length === 0) break;
        batches += 1;

        for (const upload of candidates) {
          cursor = { createdAt: upload.createdAt, id: upload.id };
          processed += 1;
          try {
            let cleanupUpload = upload;
            if (upload.status === 'pending') {
              // Reject through the same pending-state CAS used by confirmation, then re-read.
              // Whichever operation wins determines whether the deterministic promoted key is live.
              await beforeCleanupDeadline(deadline, async () => {
                await store.reject(upload.id, upload.userId, upload.actualSize, 'upload_expired');
                const current = await store.find(upload.id, upload.userId);
                if (!current) throw new Error('Upload disappeared during cleanup reconciliation');
                cleanupUpload = current;
              });
            }
            // DeleteObject is idempotent. If database bookkeeping fails or the run times out
            // after deletion, a later bounded run safely repeats deletion and records completion.
            await beforeCleanupDeadline(deadline, async () => {
              await objects.delete(cleanupUpload.stagingObjectKey);
              if (cleanupUpload.status !== 'confirmed') {
                await objects.delete(confirmedObjectKeyForUpload(
                  cleanupUpload.userId,
                  cleanupUpload.id,
                  cleanupUpload.stagingObjectKey,
                ));
              }
              await store.completeStagingCleanup(cleanupUpload, new Date());
            });
            cleaned += 1;
          } catch (error) {
            failed += 1;
            oldestKnownBacklogCreatedAt ??= upload.createdAt.toISOString();
            if (error instanceof CleanupDeadlineExceeded) {
              timeLimitReached = true;
              break cleanup;
            }
          }
        }

        // A short keyset page proves that there were no later candidates at query time.
        if (candidates.length < batchLimit) break;
      }

      let backlogRemaining = failed > 0 || processed >= itemLimit || timeLimitReached;
      let oldestBacklogCreatedAt = oldestKnownBacklogCreatedAt;
      if (!timeLimitReached) {
        try {
          // One final bounded probe reports the actual oldest remaining candidate, including a
          // failed row skipped by the per-run cursor. It never expands object-store work.
          const [oldest] = await beforeCleanupDeadline(
            deadline,
            () => store.listCleanupCandidates(expiredBefore, 1),
          );
          backlogRemaining = Boolean(oldest);
          oldestBacklogCreatedAt = oldest?.createdAt.toISOString() ?? null;
        } catch (error) {
          if (error instanceof CleanupDeadlineExceeded) {
            timeLimitReached = true;
            backlogRemaining = true;
          } else {
            throw error;
          }
        }
      }

      return {
        processed,
        cleaned,
        failed,
        batches,
        backlogRemaining,
        oldestBacklogCreatedAt,
        itemLimitReached: processed >= itemLimit && backlogRemaining,
        timeLimitReached,
      };
    },
  };
}
`;
}

function realtimeSource(): string {
  return `import * as Ably from 'ably';
import type { RealtimeTokenRequest, SubscriptionChangedEvent } from '@shared/contracts';

export type SubscriptionMutation = { userId: string; revision: number };

export interface RealtimeService {
  createTokenRequest(userId: string): Promise<RealtimeTokenRequest>;
  publishSubscriptionChanged(change: SubscriptionMutation): Promise<void>;
}

export function subscriptionChannelName(userId: string): string {
  return 'private:users:' + userId + ':subscriptions';
}

export function createRealtimeService(apiKey: string | undefined): RealtimeService {
  if (!apiKey) {
    return {
      async createTokenRequest() { throw new Error('Realtime is not configured'); },
      async publishSubscriptionChanged() {},
    };
  }
  const client = new Ably.Rest({ key: apiKey });
  return {
    async createTokenRequest(userId) {
      return client.auth.createTokenRequest({
        clientId: userId,
        capability: JSON.stringify({ [subscriptionChannelName(userId)]: ['subscribe'] }),
        ttl: 60 * 60 * 1000,
      }) as Promise<RealtimeTokenRequest>;
    },
    async publishSubscriptionChanged(change) {
      const event: SubscriptionChangedEvent = {
        type: 'subscription.changed',
        revision: change.revision,
      };
      await client.channels.get(subscriptionChannelName(change.userId)).publish('subscription.changed', event);
    },
  };
}
`;
}

function billingSource(): string {
  return `import crypto from 'node:crypto';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db, realtimeOutbox, sqlClient, subscriptions, webhookEvents } from '@shared/db';
import type { SubscriptionMutation } from './realtime';

const CLAIM_LEASE_MS = 5 * 60 * 1000;
const REVENUECAT_REQUEST_TIMEOUT_MS = 5_000;

export type RevenueCatWebhookClaim =
  | { status: 'claimed'; token: string }
  | { status: 'processed' }
  | { status: 'in_progress' };

export interface RevenueCatSubscriptionUpdate {
  userId: string;
  entitlement: string;
  status: 'active' | 'expired';
  expiresAt: Date | null;
  eventTimestamp: Date;
}

export interface RevenueCatSubscriber {
  entitlements: Record<string, unknown>;
}

export interface RevenueCatClient {
  getSubscriber(appUserId: string): Promise<RevenueCatSubscriber>;
}

export interface RevenueCatWebhookStore {
  claim(providerEventId: string, payload: Record<string, unknown>): Promise<RevenueCatWebhookClaim>;
  reconcile(
    providerEventId: string,
    claimToken: string,
    updates: readonly RevenueCatSubscriptionUpdate[],
  ): Promise<readonly SubscriptionMutation[]>;
  refresh(update: RevenueCatSubscriptionUpdate): Promise<SubscriptionMutation | null>;
  getEntitlement(userId: string): Promise<{
    entitlement: string;
    status: 'active' | 'expired';
    expiresAt: Date | null;
    revision: number;
  } | null>;
  pendingRealtime(limit?: number): Promise<readonly SubscriptionMutation[]>;
  markRealtimeDelivered(change: SubscriptionMutation): Promise<void>;
  markRealtimeFailed(change: SubscriptionMutation, message: string): Promise<void>;
  fail(providerEventId: string, claimToken: string, message: string): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function revenueCatDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('Invalid RevenueCat ' + field);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid RevenueCat ' + field);
  return parsed;
}

export function projectRevenueCatSubscriber(
  subscriber: RevenueCatSubscriber,
  userId: string,
  entitlementId: string,
  eventTimestamp: Date,
  now = new Date(),
): RevenueCatSubscriptionUpdate {
  const rawEntitlement = subscriber.entitlements[entitlementId];
  if (rawEntitlement === undefined) {
    return { userId, entitlement: 'free', status: 'expired', expiresAt: null, eventTimestamp };
  }
  if (!isRecord(rawEntitlement) || !Object.hasOwn(rawEntitlement, 'expires_date')) {
    throw new Error('Invalid RevenueCat entitlement response');
  }

  const expiresAt = revenueCatDate(rawEntitlement.expires_date, 'expires_date');
  const gracePeriodExpiresAt = revenueCatDate(
    rawEntitlement.grace_period_expires_date,
    'grace_period_expires_date',
  );
  // RevenueCat represents non-consumable/promotional lifetime access with a null expiration.
  if (expiresAt === null) {
    return { userId, entitlement: entitlementId, status: 'active', expiresAt: null, eventTimestamp };
  }
  const accessUntil = gracePeriodExpiresAt && gracePeriodExpiresAt.getTime() > expiresAt.getTime()
    ? gracePeriodExpiresAt
    : expiresAt;
  const active = accessUntil.getTime() > now.getTime();
  return {
    userId,
    entitlement: active ? entitlementId : 'free',
    status: active ? 'active' : 'expired',
    expiresAt: accessUntil,
    eventTimestamp,
  };
}

export function createRevenueCatClient(
  secretApiKey: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): RevenueCatClient {
  return {
    async getSubscriber(appUserId) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REVENUECAT_REQUEST_TIMEOUT_MS);
      try {
        const response = await fetchImpl(
          'https://api.revenuecat.com/v1/subscribers/' + encodeURIComponent(appUserId),
          {
            method: 'GET',
            headers: {
              accept: 'application/json',
              authorization: 'Bearer ' + secretApiKey,
            },
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error('RevenueCat subscriber lookup failed with status ' + response.status);
        }
        const payload: unknown = await response.json();
        if (!isRecord(payload) || !isRecord(payload.subscriber) || !isRecord(payload.subscriber.entitlements)) {
          throw new Error('Invalid RevenueCat subscriber response');
        }
        return { entitlements: payload.subscriber.entitlements };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function effectiveEntitlementStatus(
  storedStatus: string,
  expiresAt: Date | null,
  now = new Date(),
): 'active' | 'expired' {
  return storedStatus === 'active' && (!expiresAt || expiresAt.getTime() > now.getTime())
    ? 'active'
    : 'expired';
}

export const revenueCatWebhookStore: RevenueCatWebhookStore = {
  async claim(providerEventId, payload) {
    await db.insert(webhookEvents).values({
      providerEventId,
      provider: 'revenuecat',
      payload,
      status: 'pending',
    }).onConflictDoNothing();

    const now = new Date();
    const token = crypto.randomUUID();
    const [claimed] = await db.update(webhookEvents).set({
      status: 'processing',
      attempts: sql\`\${webhookEvents.attempts} + 1\`,
      claimToken: token,
      claimedAt: now,
      processedAt: null,
      lastError: null,
    }).where(and(
      eq(webhookEvents.providerEventId, providerEventId),
      or(
        eq(webhookEvents.status, 'pending'),
        eq(webhookEvents.status, 'failed'),
        and(
          eq(webhookEvents.status, 'processing'),
          lt(webhookEvents.claimedAt, new Date(now.getTime() - CLAIM_LEASE_MS)),
        ),
      ),
    )).returning({ claimToken: webhookEvents.claimToken });

    if (claimed) return { status: 'claimed', token };
    const [existing] = await db.select({ status: webhookEvents.status })
      .from(webhookEvents)
      .where(eq(webhookEvents.providerEventId, providerEventId))
      .limit(1);
    return existing?.status === 'processed' ? { status: 'processed' } : { status: 'in_progress' };
  },

  async reconcile(providerEventId, claimToken, updates) {
    if (updates.length === 0) throw new Error('RevenueCat reconciliation requires at least one update');
    const subscriptionQueries = updates.map((input) => sqlClient\`
      WITH "owned_claim" AS (
        SELECT 1 FROM "webhook_events"
        WHERE "provider_event_id" = \${providerEventId}
          AND "claim_token" = \${claimToken}
          AND "status" = 'processing'
        FOR UPDATE
      )
      , "updated_subscription" AS (
        INSERT INTO "subscriptions" (
          "id", "user_id", "entitlement", "status", "expires_at", "event_timestamp", "revision", "updated_at"
        )
        SELECT
          \${input.userId}, \${input.userId}, \${input.entitlement}, \${input.status},
          \${input.expiresAt}, \${input.eventTimestamp}, 1, now()
        FROM "owned_claim"
        ON CONFLICT ("user_id") DO UPDATE SET
          "id" = excluded."id",
          "entitlement" = excluded."entitlement",
          "status" = excluded."status",
          "expires_at" = excluded."expires_at",
          "event_timestamp" = excluded."event_timestamp",
          "revision" = "subscriptions"."revision" + 1,
          "updated_at" = now()
        WHERE "subscriptions"."event_timestamp" <= excluded."event_timestamp"
        RETURNING "user_id", "revision"
      )
      INSERT INTO "realtime_outbox" ("id", "user_id", "topic", "revision", "created_at")
      SELECT \${crypto.randomUUID()}, "user_id", 'subscription.changed', "revision", now()
      FROM "updated_subscription"
      RETURNING "user_id" AS "userId", "revision"
    \`);
    const results = await sqlClient.transaction([
      ...subscriptionQueries,
      sqlClient\`
        UPDATE "webhook_events" SET
          "status" = 'processed',
          "claim_token" = NULL,
          "claimed_at" = NULL,
          "processed_at" = now(),
          "last_error" = NULL
        WHERE "provider_event_id" = \${providerEventId}
          AND "claim_token" = \${claimToken}
          AND "status" = 'processing'
        RETURNING "provider_event_id" AS "providerEventId"
      \`,
    ], { isolationLevel: 'ReadCommitted' });
    const completed = results.at(-1) as Array<{ providerEventId: string }> | undefined;
    if (!completed?.[0]) throw new Error('RevenueCat webhook claim lease was lost');
    return (results.slice(0, -1) as Array<Array<SubscriptionMutation>>).flat();
  },

  async refresh(input) {
    const rows = await sqlClient\`
      WITH "updated_subscription" AS (
        INSERT INTO "subscriptions" (
          "id", "user_id", "entitlement", "status", "expires_at", "event_timestamp", "revision", "updated_at"
        ) VALUES (
          \${input.userId}, \${input.userId}, \${input.entitlement}, \${input.status},
          \${input.expiresAt}, \${input.eventTimestamp}, 1, now()
        )
        ON CONFLICT ("user_id") DO UPDATE SET
          "entitlement" = excluded."entitlement",
          "status" = excluded."status",
          "expires_at" = excluded."expires_at",
          "event_timestamp" = excluded."event_timestamp",
          "revision" = "subscriptions"."revision" + 1,
          "updated_at" = now()
        WHERE "subscriptions"."event_timestamp" <= excluded."event_timestamp"
        RETURNING "user_id", "revision"
      )
      INSERT INTO "realtime_outbox" ("id", "user_id", "topic", "revision", "created_at")
      SELECT \${crypto.randomUUID()}, "user_id", 'subscription.changed', "revision", now()
      FROM "updated_subscription"
      RETURNING "user_id" AS "userId", "revision"
    \` as Array<SubscriptionMutation>;
    return rows[0] ?? null;
  },

  async getEntitlement(userId) {
    const [subscription] = await db.select({
      entitlement: subscriptions.entitlement,
      status: subscriptions.status,
      expiresAt: subscriptions.expiresAt,
      revision: subscriptions.revision,
    }).from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    if (!subscription) return null;
    return {
      entitlement: subscription.entitlement,
      status: effectiveEntitlementStatus(subscription.status, subscription.expiresAt),
      expiresAt: subscription.expiresAt,
      revision: subscription.revision,
    };
  },

  async pendingRealtime(limit = 100) {
    return db.select({ userId: realtimeOutbox.userId, revision: realtimeOutbox.revision })
      .from(realtimeOutbox)
      .where(isNull(realtimeOutbox.deliveredAt))
      .orderBy(asc(realtimeOutbox.createdAt))
      .limit(Math.max(1, Math.min(limit, 500)));
  },

  async markRealtimeDelivered(change) {
    await db.update(realtimeOutbox).set({ deliveredAt: new Date(), lastError: null })
      .where(and(
        eq(realtimeOutbox.userId, change.userId),
        eq(realtimeOutbox.revision, change.revision),
        isNull(realtimeOutbox.deliveredAt),
      ));
  },

  async markRealtimeFailed(change, message) {
    await db.update(realtimeOutbox).set({
      attempts: sql\`\${realtimeOutbox.attempts} + 1\`,
      lastError: message.slice(0, 1000),
    }).where(and(
      eq(realtimeOutbox.userId, change.userId),
      eq(realtimeOutbox.revision, change.revision),
      isNull(realtimeOutbox.deliveredAt),
    ));
  },

  async fail(providerEventId, claimToken, message) {
    await db.update(webhookEvents).set({
      status: 'failed',
      claimToken: null,
      claimedAt: null,
      lastError: message.slice(0, 1000),
    }).where(and(
      eq(webhookEvents.providerEventId, providerEventId),
      eq(webhookEvents.claimToken, claimToken),
      eq(webhookEvents.status, 'processing'),
    ));
  },
};
`;
}

function routesSource(options: ProjectOptions): string {
  const imports = [
    "import type { FastifyPluginAsync } from 'fastify';",
    "import { appRoutes } from './routes/app';",
    options.features.billing || options.features.storage ? "import { timingSafeEqual } from 'node:crypto';" : null,
    options.features.auth ? "import { authenticatedUserId } from './auth';" : null,
    options.features.storage ? "import { ConfirmUploadRequestSchema, CreateUploadRequestSchema, UploadParamsSchema } from '@shared/contracts';" : null,
    options.features.storage ? "import { createStorageService, type StorageService } from './storage';" : null,
    options.features.billing ? "import { createRevenueCatClient, projectRevenueCatSubscriber, revenueCatWebhookStore, type RevenueCatClient, type RevenueCatSubscriptionUpdate, type RevenueCatWebhookStore } from './billing';" : null,
    options.features.billing ? "import { createRealtimeService, type RealtimeService, type SubscriptionMutation } from './realtime';" : null,
  ].filter((value): value is string => value !== null);
  const routes = [
    `app.get('/health', async () => ({ ok: true as const, service: 'api' }));`,
    `app.get('/ready', async (_request, reply) => {
    const status = await serviceState.readiness();
    const ready = status === 'ready';
    return reply.code(ready ? 200 : 503).send({
      ok: ready,
      service: 'api',
      status,
    });
  });`,
    options.features.auth ? `app.get('/auth/me', async (request) => ({ user: { id: authenticatedUserId(request, env) } }));` : null,
    options.features.billing ? `app.get('/subscriptions/me', async (request) => {
    const subscription = await billingStore.getEntitlement(authenticatedUserId(request, env));
    return subscription
      ? {
          entitlement: subscription.entitlement,
          status: subscription.status,
          expiresAt: subscription.expiresAt?.toISOString() ?? null,
          revision: subscription.revision,
        }
      : { entitlement: 'free', status: 'free' as const, expiresAt: null, revision: 0 };
  });

  app.post('/subscriptions/refresh', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        keyGenerator: (request) => authenticatedUserId(request, env),
      },
    },
  }, async (request, reply) => {
    const userId = authenticatedUserId(request, env);
    if (!revenueCatClient) return reply.code(503).send({ error: 'billing_not_configured', message: 'Billing is not configured' });
    const now = new Date();
    const update = projectRevenueCatSubscriber(
      await revenueCatClient.getSubscriber(userId),
      userId,
      env.RC_ENTITLEMENT_ID,
      now,
      now,
    );
    const change = await billingStore.refresh(update);
    if (change) await publishSubscriptionChanges([change]);
    const subscription = await billingStore.getEntitlement(userId);
    return subscription
      ? {
          entitlement: subscription.entitlement,
          status: subscription.status,
          expiresAt: subscription.expiresAt?.toISOString() ?? null,
          revision: subscription.revision,
        }
      : { entitlement: 'free', status: 'free' as const, expiresAt: null, revision: 0 };
  });

  app.post('/realtime/token', async (request, reply) => {
    if (!env.ABLY_API_KEY) return reply.code(503).send({ error: 'realtime_not_configured', message: 'Realtime is not configured' });
    return realtimeService.createTokenRequest(authenticatedUserId(request, env));
  });

  app.post('/webhooks/revenuecat', {
    bodyLimit: 256 * 1024,
    config: {
      rateLimit: {
        max: 600,
        timeWindow: '1 minute',
        groupId: 'revenuecat-webhooks',
        keyGenerator: (request) => env.RC_WEBHOOK_SECRET
          && matchesBearerSecret(request.headers.authorization, env.RC_WEBHOOK_SECRET)
          ? 'revenuecat-provider'
          : request.ip,
      },
    },
  }, async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!env.RC_WEBHOOK_SECRET || !matchesBearerSecret(authorization, env.RC_WEBHOOK_SECRET)) {
      return reply.code(401).send({ ok: false, error: 'invalid_authorization' });
    }
    const payload = request.body as Record<string, unknown> | null;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }
    const event = payload.event && typeof payload.event === 'object'
      ? payload.event as Record<string, unknown>
      : null;
    const rawProviderEventId = event?.id;
    const providerEventId = validRevenueCatIdentifier(rawProviderEventId) ? rawProviderEventId : null;
    if (!providerEventId) return reply.code(400).send({ ok: false, error: 'missing_event_id' });
    const rawEventType = event?.type;
    const eventType = validRevenueCatIdentifier(rawEventType) ? rawEventType : null;
    if (!eventType) return reply.code(400).send({ ok: false, error: 'missing_event_type' });
    const eventTimestampMs = typeof event?.event_timestamp_ms === 'number'
      && Number.isSafeInteger(event.event_timestamp_ms)
      && event.event_timestamp_ms >= 0
      ? event.event_timestamp_ms
      : null;
    const eventTimestamp = eventTimestampMs === null ? null : new Date(eventTimestampMs);
    if (!eventTimestamp || Number.isNaN(eventTimestamp.getTime())) {
      return reply.code(400).send({ ok: false, error: 'invalid_event_timestamp' });
    }

    const rawUserId = event?.app_user_id;
    const userId = validRevenueCatIdentifier(rawUserId) ? rawUserId : null;
    const transferredFrom = eventType === 'TRANSFER' ? revenueCatIdentityList(event?.transferred_from) : null;
    const transferredTo = eventType === 'TRANSFER' ? revenueCatIdentityList(event?.transferred_to) : null;
    if (eventType === 'TRANSFER' && (!transferredFrom || !transferredTo)) {
      return reply.code(400).send({ ok: false, error: 'invalid_transfer_identities' });
    }
    if (eventType !== 'TRANSFER' && !userId) {
      return reply.code(400).send({ ok: false, error: 'missing_app_user_id' });
    }
    if (!revenueCatClient) return reply.code(503).send({ ok: false, error: 'billing_not_configured' });

    const claim = await billingStore.claim(providerEventId, payload);
    if (claim.status === 'processed') return reply.send({ ok: true, duplicate: true });
    if (claim.status === 'in_progress') {
      return reply.header('retry-after', '5').code(503).send({ ok: false, error: 'webhook_in_progress' });
    }
    try {
      const reconciliationNow = new Date();
      let subscriptionUpdates: RevenueCatSubscriptionUpdate[];
      if (eventType === 'TRANSFER' && transferredFrom && transferredTo) {
        // Finish every authoritative lookup before mutating local state. A provider failure
        // releases the claim without leaving a destination only partially reconciled.
        const destinationUpdates = await Promise.all(transferredTo.map(async (destinationUserId) => (
          projectRevenueCatSubscriber(
            await revenueCatClient.getSubscriber(destinationUserId),
            destinationUserId,
            env.RC_ENTITLEMENT_ID,
            eventTimestamp,
            reconciliationNow,
          )
        )));
        const destinationIds = new Set(transferredTo);
        const sourceUpdates = transferredFrom
          .filter((sourceUserId) => !destinationIds.has(sourceUserId))
          .map((sourceUserId): RevenueCatSubscriptionUpdate => ({
            userId: sourceUserId,
            entitlement: 'free',
            status: 'expired',
            expiresAt: null,
            eventTimestamp,
          }));
        subscriptionUpdates = [...sourceUpdates, ...destinationUpdates];
      } else if (userId) {
        subscriptionUpdates = [projectRevenueCatSubscriber(
          await revenueCatClient.getSubscriber(userId),
          userId,
          env.RC_ENTITLEMENT_ID,
          eventTimestamp,
          reconciliationNow,
        )];
      } else {
        throw new Error('RevenueCat reconciliation did not resolve a target identity');
      }
      const changes = await billingStore.reconcile(providerEventId, claim.token, subscriptionUpdates);
      await publishSubscriptionChanges(changes);
      return reply.send({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown RevenueCat webhook failure';
      try {
        await billingStore.fail(providerEventId, claim.token, message);
      } catch (releaseError) {
        request.log.error({
          msg: 'revenuecat_webhook_claim_release_failed',
          error: releaseError instanceof Error ? releaseError.message : 'Unknown claim release failure',
        });
      }
      request.log.error({ msg: 'revenuecat_webhook_failed', error: message });
      return reply.code(503).send({ ok: false, error: 'webhook_processing_failed' });
    }
  });` : null,
    options.features.billing ? `app.get('/internal/realtime/flush', async (request, reply) => {
    if (!env.CRON_SECRET || !matchesBearerSecret(request.headers.authorization, env.CRON_SECRET)) {
      return reply.code(401).send({ ok: false, error: 'invalid_authorization' });
    }
    const pending = await billingStore.pendingRealtime(100);
    await publishSubscriptionChanges(pending);
    return { ok: true, processed: pending.length };
  });` : null,
    options.features.storage ? `app.post('/storage/uploads', {
    bodyLimit: 16 * 1024,
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        keyGenerator: (request) => authenticatedUserId(request, env),
      },
    },
  }, async (request, reply) => {
    const userId = authenticatedUserId(request, env);
    const parsed = CreateUploadRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_upload_request',
        message: 'Use an allowed content type and a size no larger than 10 MiB',
        details: parsed.error.flatten(),
      });
    }
    return storageService.createUpload(userId, parsed.data);
  });

  app.post('/storage/uploads/confirm', { bodyLimit: 16 * 1024 }, async (request, reply) => {
    const parsed = ConfirmUploadRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_upload_confirmation', message: 'A valid uploadId is required' });
    }
    return storageService.confirmUpload(authenticatedUserId(request, env), parsed.data.uploadId);
  });

  app.get('/storage/uploads/:uploadId', async (request, reply) => {
    const parsed = UploadParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_upload_id', message: 'A valid uploadId is required' });
    return storageService.getUpload(authenticatedUserId(request, env), parsed.data.uploadId);
  });

  app.get('/storage/uploads/:uploadId/read-url', async (request, reply) => {
    const parsed = UploadParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_upload_id', message: 'A valid uploadId is required' });
    return storageService.createReadUrl(authenticatedUserId(request, env), parsed.data.uploadId);
  });

  app.get('/internal/storage/cleanup', async (request, reply) => {
    if (!env.CRON_SECRET || !matchesBearerSecret(request.headers.authorization, env.CRON_SECRET)) {
      return reply.code(401).send({ ok: false, error: 'invalid_authorization' });
    }
    const result = await storageService.cleanupUploads();
    const unsuccessful = result.failed > 0 || result.timeLimitReached;
    return reply.code(unsuccessful ? 503 : 200).send({ ok: !unsuccessful, ...result });
  });` : null,
  ].filter((value): value is string => value !== null);
  const dependencyFields = [
    options.features.billing ? '  revenueCatWebhookStore?: RevenueCatWebhookStore;' : null,
    options.features.billing ? '  revenueCatClient?: RevenueCatClient;' : null,
    options.features.billing ? '  realtimeService?: RealtimeService;' : null,
    options.features.storage ? '  storageService?: StorageService;' : null,
    "  serviceState?: { readiness(): Promise<'ready' | 'unavailable' | 'shutting_down'> };",
  ].filter((value): value is string => value !== null);
  const billingStore = options.features.billing
    ? `    const billingStore = dependencies.revenueCatWebhookStore ?? revenueCatWebhookStore;
    const revenueCatClient = dependencies.revenueCatClient ?? (env.RC_SECRET_API_KEY ? createRevenueCatClient(env.RC_SECRET_API_KEY) : null);
    const realtimeService = dependencies.realtimeService ?? createRealtimeService(env.ABLY_API_KEY);
    const publishSubscriptionChanges = async (changes: readonly SubscriptionMutation[]) => {
      for (const change of changes) {
        try {
          await realtimeService.publishSubscriptionChanged(change);
          await billingStore.markRealtimeDelivered(change);
        } catch (error) {
          await billingStore.markRealtimeFailed(
            change,
            error instanceof Error ? error.message : 'Realtime publish failed',
          );
        }
      }
    };
`
    : '';
  const storageService = options.features.storage
    ? '    const storageService = dependencies.storageService ?? createStorageService(env);\n'
    : '';
  const appRoutesRegistration = options.features.database && options.features.auth
    ? 'await app.register(appRoutes(env));'
    : 'await app.register(appRoutes);';
  return `${imports.join('\n')}
import type { AppEnv } from './env';

${options.features.billing ? `function validRevenueCatIdentifier(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 512
    && value.trim() === value;
}

function revenueCatIdentityList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20
    || !value.every(validRevenueCatIdentifier)) return null;
  return [...new Set(value)];
}
` : ''}
${options.features.billing || options.features.storage ? `function matchesBearerSecret(header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const provided = Buffer.from(header);
  const expected = Buffer.from(\`Bearer \${secret}\`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
` : ''}

export interface RouteDependencies {
${dependencyFields.join('\n')}
}

export function routes(env: AppEnv, dependencies: RouteDependencies = {}): FastifyPluginAsync {
  return async function registerRoutes(app) {
${billingStore}${storageService}    const serviceState = dependencies.serviceState ?? { readiness: async () => 'ready' as const };
  ${routes.join('\n\n  ')}

  ${appRoutesRegistration}
  };
}
`;
}

function billingRouteTestSource(options: ProjectOptions): string {
  return `import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../src/env';
import type {
  RevenueCatClient,
  RevenueCatSubscriber,
  RevenueCatSubscriptionUpdate,
  RevenueCatWebhookStore,
} from '../src/billing';

const syntheticClerkKey = (kind: 'pk' | 'sk') => [kind, 'live', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4'].join('_');
const syntheticSecret = (label: string) => [label, 'A1b2C3d4E5f6G7h8', 'I9j0K1l2M3n4O5p6'].join('_');
const syntheticDatabaseUrl = (host: string) => [
  'postgresql://', 'app_owner', ':', 'S3cureRandomDatabaseCredential123', '@', host, '/app?sslmode=require',
].join('');
const webhookSecret = ['whsec', '7f4c7e93d8f24a779fb1d1f42148b995'].join('_');

const env: AppEnv = {
  NODE_ENV: 'test',
  PORT: 8787,
  TRUST_PROXY_HOPS: 0,
  CORS_ORIGINS: [],
  ANHEDRAL_DEMO: 'true',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  RC_WEBHOOK_SECRET: webhookSecret,
  RC_SECRET_API_KEY: syntheticSecret('revenuecat'),
  RC_ENTITLEMENT_ID: 'pro',
  ABLY_API_KEY: undefined,
${options.features.storage ? "  R2_PREFIX: 'storage',\n  R2_PROXY_READ_URL_TTL_SECONDS: 600,\n" : ''}  CRON_SECRET: syntheticSecret('cron'),
};

const payload = {
  event: {
    id: 'event-1',
    type: 'INITIAL_PURCHASE',
    app_user_id: 'user_123',
    event_timestamp_ms: 4_102_444_800_000,
    entitlement_ids: ['pro'],
  },
};

const activeSubscriber: RevenueCatSubscriber = {
  entitlements: {
    pro: {
      expires_date: '2099-08-14T21:07:40Z',
      grace_period_expires_date: null,
      product_identifier: 'annual-pro',
    },
  },
};

beforeAll(() => {
  process.env.DATABASE_URL ||= env.DATABASE_URL;
});

function createStore(overrides: Partial<RevenueCatWebhookStore> = {}): RevenueCatWebhookStore {
  return {
    claim: vi.fn(async () => ({ status: 'claimed' as const, token: 'claim-token' })),
    reconcile: vi.fn(async () => []),
    refresh: vi.fn(async () => null),
    getEntitlement: vi.fn(async () => null),
    pendingRealtime: vi.fn(async () => []),
    markRealtimeDelivered: vi.fn(async () => undefined),
    markRealtimeFailed: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createClient(
  getSubscriber = vi.fn(async () => activeSubscriber),
): RevenueCatClient {
  return { getSubscriber };
}

async function webhookApp(
  store: RevenueCatWebhookStore,
  client: RevenueCatClient = createClient(),
  globalRateLimit = 120,
) {
  const { routes } = await import('../src/routes');
  const app = Fastify();
  await app.register(rateLimit, { max: globalRateLimit, timeWindow: '1 minute' });
  await app.register(routes(env, {
    revenueCatWebhookStore: store,
    revenueCatClient: client,
  }), { prefix: '/api' });
  return app;
}

async function postWebhook(
  store: RevenueCatWebhookStore,
  body: object = payload,
  authorization: string | null | undefined = 'Bearer ' + webhookSecret,
  client: RevenueCatClient = createClient(),
) {
  const app = await webhookApp(store, client);
  const response = await app.inject({
    method: 'POST',
    url: '/api/webhooks/revenuecat',
    headers: authorization ? { authorization } : {},
    payload: body,
  });
  await app.close();
  return response;
}

describe('RevenueCat webhook', () => {
  it('treats a persisted active entitlement as expired after its known expiration', async () => {
    const { effectiveEntitlementStatus } = await import('../src/billing');
    const now = new Date('2026-07-15T12:00:00.000Z');
    expect(effectiveEntitlementStatus('active', new Date('2026-07-15T11:59:59.000Z'), now)).toBe('expired');
    expect(effectiveEntitlementStatus('active', new Date('2026-07-15T12:00:01.000Z'), now)).toBe('active');
    expect(effectiveEntitlementStatus('active', null, now)).toBe('active');
  });

  it('requires strong non-placeholder RevenueCat server secrets in production', async () => {
    const { loadEnv } = await import('../src/env');
    const production = {
      NODE_ENV: 'production',
      ANHEDRAL_DEMO: 'false',
      CORS_ORIGINS: 'https://app.acme.dev,null',
      DATABASE_URL: syntheticDatabaseUrl('ep-bright-cloud-a1b2c3.us-east-2.aws.neon.tech'),
      CLERK_PUBLISHABLE_KEY: syntheticClerkKey('pk'),
      CLERK_SECRET_KEY: syntheticClerkKey('sk'),
      RC_ENTITLEMENT_ID: 'pro',
      ABLY_API_KEY: syntheticSecret('ably'),
      R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_ACCESS_KEY_ID: 'b'.repeat(32),
      R2_SECRET_ACCESS_KEY: 'c'.repeat(64),
      BASE_URL: 'https://app.acme.dev',
      R2_BUCKET_NAME: 'production-uploads',
      R2_PREFIX: 'storage',
      R2_PROXY_READ_URL_TTL_SECONDS: '600',
      CLOUDFLARE_API_TOKEN: undefined,
      CRON_SECRET: syntheticSecret('cron'),
    };
    expect(() => loadEnv({
      ...production,
      RC_WEBHOOK_SECRET: 'webhook-secret',
      RC_SECRET_API_KEY: env.RC_SECRET_API_KEY,
    })).toThrow(/RC_WEBHOOK_SECRET must be at least 32 characters/);
    expect(() => loadEnv({
      ...production,
      RC_WEBHOOK_SECRET: webhookSecret,
      RC_SECRET_API_KEY: 'x'.repeat(40),
    })).toThrow(/RC_SECRET_API_KEY must be at least 32 characters/);
    expect(() => loadEnv({
      ...production,
      RC_WEBHOOK_SECRET: webhookSecret,
      RC_SECRET_API_KEY: env.RC_SECRET_API_KEY,
    })).not.toThrow();
  });

  it('rejects missing and incorrect bearer secrets before comparing payloads', async () => {
    const store = createStore();
    const missing = await postWebhook(store, payload, null);
    const incorrect = await postWebhook(store, payload, 'Bearer wrong-secret-that-is-not-valid');

    expect(missing.statusCode).toBe(401);
    expect(incorrect.statusCode).toBe(401);
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('rejects non-object payloads before claiming an event', async () => {
    const store = createStore();
    const response = await postWebhook(store, []);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, error: 'invalid_payload' });
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('reconciles ordinary events even when entitlement_ids is absent', async () => {
    const store = createStore();
    const client = createClient();
    const response = await postWebhook(store, {
      event: { ...payload.event, entitlement_ids: undefined },
    }, undefined, client);

    expect(response.statusCode).toBe(200);
    expect(client.getSubscriber).toHaveBeenCalledWith('user_123');
    expect(store.reconcile).toHaveBeenCalledWith('event-1', 'claim-token', [expect.objectContaining({
      userId: 'user_123', entitlement: 'pro', status: 'active',
    })]);
    expect(store.fail).not.toHaveBeenCalled();
  });

  it('revokes transfer sources and authoritatively reconciles every destination', async () => {
    const store = createStore();
    const client = createClient(vi.fn(async () => activeSubscriber));
    const response = await postWebhook(store, {
      event: {
        id: 'event-transfer',
        type: 'TRANSFER',
        event_timestamp_ms: 1_800_000_000_000,
        transferred_from: ['source-user', 'shared-user'],
        transferred_to: ['destination-user', 'shared-user'],
      },
    }, undefined, client);

    expect(response.statusCode).toBe(200);
    expect(client.getSubscriber).toHaveBeenCalledTimes(2);
    expect(client.getSubscriber).toHaveBeenCalledWith('destination-user');
    expect(client.getSubscriber).toHaveBeenCalledWith('shared-user');
    const updates = vi.mocked(store.reconcile).mock.calls[0]?.[2] ?? [];
    expect(updates).toContainEqual(expect.objectContaining({
      userId: 'source-user', entitlement: 'free', status: 'expired',
    }));
    expect(updates).toContainEqual(expect.objectContaining({
      userId: 'destination-user', entitlement: 'pro', status: 'active',
    }));
    expect(updates).toContainEqual(expect.objectContaining({
      userId: 'shared-user', entitlement: 'pro', status: 'active',
    }));
    expect(updates.filter((update) => update.userId === 'shared-user')).toHaveLength(1);
  });

  it('rejects malformed transfer identities and timestamps before claiming', async () => {
    const store = createStore();
    const invalidIdentities = await postWebhook(store, {
      event: {
        id: 'event-transfer', type: 'TRANSFER', event_timestamp_ms: 1_800_000_000_000,
        transferred_from: ['source-user', ''], transferred_to: ['destination-user'],
      },
    });
    const invalidTimestamp = await postWebhook(store, {
      event: { ...payload.event, id: 'event-invalid-time', event_timestamp_ms: Number.NaN },
    });

    expect(invalidIdentities.statusCode).toBe(400);
    expect(invalidIdentities.json()).toEqual({ ok: false, error: 'invalid_transfer_identities' });
    expect(invalidTimestamp.statusCode).toBe(400);
    expect(invalidTimestamp.json()).toEqual({ ok: false, error: 'invalid_event_timestamp' });
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('uses the configured authoritative entitlement across overlapping products', async () => {
    const { projectRevenueCatSubscriber } = await import('../src/billing');
    const eventTimestamp = new Date('2027-01-01T00:00:00.000Z');
    const subscriber = {
      entitlements: {
        pro: { expires_date: '2028-01-01T00:00:00.000Z', grace_period_expires_date: null },
        team: { expires_date: '2029-01-01T00:00:00.000Z', grace_period_expires_date: null },
      },
      subscriptions: {
        'expired-monthly': { expires_date: '2025-01-01T00:00:00.000Z' },
        'active-annual': { expires_date: '2028-01-01T00:00:00.000Z' },
      },
    } as RevenueCatSubscriber;
    expect(projectRevenueCatSubscriber(
      subscriber, 'user_123', 'pro', eventTimestamp, new Date('2026-01-01T00:00:00.000Z'),
    )).toEqual({
      userId: 'user_123', entitlement: 'pro', status: 'active',
      expiresAt: new Date('2028-01-01T00:00:00.000Z'), eventTimestamp,
    });
  });

  it('honors grace-period and lifetime entitlement access', async () => {
    const { projectRevenueCatSubscriber } = await import('../src/billing');
    const eventTimestamp = new Date('2026-01-01T00:00:00.000Z');
    const duringGrace = projectRevenueCatSubscriber({ entitlements: { pro: {
      expires_date: '2026-07-01T00:00:00.000Z',
      grace_period_expires_date: '2026-07-20T00:00:00.000Z',
    } } }, 'user_123', 'pro', eventTimestamp, new Date('2026-07-15T00:00:00.000Z'));
    const lifetime = projectRevenueCatSubscriber({ entitlements: { pro: {
      expires_date: null, grace_period_expires_date: null,
    } } }, 'user_123', 'pro', eventTimestamp, new Date('2099-01-01T00:00:00.000Z'));
    expect(duringGrace).toEqual(expect.objectContaining({
      status: 'active', entitlement: 'pro', expiresAt: new Date('2026-07-20T00:00:00.000Z'),
    }));
    expect(lifetime).toEqual(expect.objectContaining({ status: 'active', entitlement: 'pro', expiresAt: null }));
  });

  it('does not let stale webhook delivery overwrite newer reconciled state', async () => {
    let current: RevenueCatSubscriptionUpdate | null = null;
    const store = createStore({
      reconcile: vi.fn(async (_providerEventId, _claimToken, updates) => {
        for (const update of updates) {
          if (!current || update.eventTimestamp.getTime() >= current.eventTimestamp.getTime()) current = update;
        }
        return [];
      }),
    });
    const client = createClient(vi.fn()
      .mockResolvedValueOnce(activeSubscriber)
      .mockResolvedValueOnce({ entitlements: {} }));
    await postWebhook(store, {
      event: { ...payload.event, id: 'newer-event', event_timestamp_ms: 1_800_000_001_000 },
    }, undefined, client);
    await postWebhook(store, {
      event: { ...payload.event, id: 'older-event', event_timestamp_ms: 1_800_000_000_000 },
    }, undefined, client);

    expect(current).toEqual(expect.objectContaining({ entitlement: 'pro', status: 'active' }));
  });

  it('returns a retryable response while another worker owns the claim', async () => {
    const store = createStore({ claim: vi.fn(async () => ({ status: 'in_progress' as const })) });
    const response = await postWebhook(store);

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    expect(response.json()).toEqual({ ok: false, error: 'webhook_in_progress' });
    expect(store.reconcile).not.toHaveBeenCalled();
  });

  it('acknowledges a processed duplicate without applying it again', async () => {
    const store = createStore({ claim: vi.fn(async () => ({ status: 'processed' as const })) });
    const response = await postWebhook(store);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, duplicate: true });
    expect(store.reconcile).not.toHaveBeenCalled();
  });

  it('releases a failed claim when the RevenueCat REST lookup fails', async () => {
    const store = createStore();
    const client = createClient(vi.fn(async () => { throw new Error('RevenueCat unavailable'); }));
    const response = await postWebhook(store, payload, undefined, client);

    expect(response.statusCode).toBe(503);
    expect(store.reconcile).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith('event-1', 'claim-token', 'RevenueCat unavailable');
  });

  it('retries the complete reconciliation after an atomic database write failure', async () => {
    const reconcile = vi.fn()
      .mockRejectedValueOnce(new Error('database transaction aborted'))
      .mockResolvedValueOnce([]);
    const store = createStore({ reconcile });
    const first = await postWebhook(store);
    const retry = await postWebhook(store);

    expect(first.statusCode).toBe(503);
    expect(retry.statusCode).toBe(200);
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(store.fail).toHaveBeenCalledWith('event-1', 'claim-token', 'database transaction aborted');
  });

  it('batches every entitlement mutation and claim completion in one database transaction', async () => {
    const { sqlClient } = await import('@shared/db');
    const { revenueCatWebhookStore } = await import('../src/billing');
    type TransactionOwner = {
      transaction(queries: readonly unknown[], options: { isolationLevel: string }): Promise<unknown[]>;
    };
    const transaction = vi.spyOn(sqlClient as unknown as TransactionOwner, 'transaction')
      .mockResolvedValue([
        [{ userId: 'source-user', revision: 2 }],
        [{ userId: 'destination-user', revision: 3 }],
        [{ providerEventId: 'event-transfer' }],
      ]);
    const eventTimestamp = new Date('2027-01-01T00:00:00.000Z');
    try {
      const completed = await revenueCatWebhookStore.reconcile('event-transfer', 'claim-token', [
        { userId: 'source-user', entitlement: 'free', status: 'expired', expiresAt: null, eventTimestamp },
        { userId: 'destination-user', entitlement: 'pro', status: 'active', expiresAt: null, eventTimestamp },
      ]);
      expect(completed).toEqual([
        { userId: 'source-user', revision: 2 },
        { userId: 'destination-user', revision: 3 },
      ]);
      expect(transaction).toHaveBeenCalledOnce();
      expect(transaction.mock.calls[0]?.[0]).toHaveLength(3);
      expect(transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: 'ReadCommitted' });
    } finally {
      transaction.mockRestore();
    }
  });

  it('uses a webhook-specific limiter instead of consuming the global IP bucket', async () => {
    const store = createStore({ claim: vi.fn(async () => ({ status: 'processed' as const })) });
    const app = await webhookApp(store, createClient(), 1);
    const first = await app.inject({
      method: 'POST', url: '/api/webhooks/revenuecat',
      headers: { authorization: 'Bearer ' + webhookSecret }, payload,
    });
    const second = await app.inject({
      method: 'POST', url: '/api/webhooks/revenuecat',
      headers: { authorization: 'Bearer ' + webhookSecret },
      payload: { event: { ...payload.event, id: 'event-2' } },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    await app.close();
  });

  it('URL-encodes subscriber IDs and authenticates the server-side REST request', async () => {
    const { createRevenueCatClient } = await import('../src/billing');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ subscriber: activeSubscriber }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const apiKey = syntheticSecret('revenuecat');
    const client = createRevenueCatClient(apiKey, fetchMock as typeof fetch);
    await client.getSubscriber('user/a b');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.revenuecat.com/v1/subscribers/user%2Fa%20b',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer ' + apiKey }),
      }),
    );
  });
});
`;
}

function storageRouteTestSource(options: ProjectOptions): string {
  return `import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../src/env';
import type { ObjectGateway, StorageService, UploadStore } from '../src/storage';

const env: AppEnv = {
  NODE_ENV: 'test',
  PORT: 8787,
  TRUST_PROXY_HOPS: 0,
  CORS_ORIGINS: [],
  ANHEDRAL_DEMO: 'true',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  CLERK_PUBLISHABLE_KEY: undefined,
  CLERK_SECRET_KEY: undefined,
${options.features.billing ? "  RC_WEBHOOK_SECRET: undefined,\n  RC_SECRET_API_KEY: undefined,\n  RC_ENTITLEMENT_ID: 'pro',\n  ABLY_API_KEY: undefined,\n" : ''}  R2_ACCOUNT_ID: 'account',
  R2_ACCESS_KEY_ID: 'access',
  R2_SECRET_ACCESS_KEY: 'secret',
  BASE_URL: 'http://localhost:8787',
  R2_BUCKET_NAME: 'bucket',
  R2_PREFIX: 'storage',
  R2_PROXY_READ_URL_TTL_SECONDS: 600,
  CLOUDFLARE_API_TOKEN: undefined,
  CRON_SECRET: 'test-cron-secret-1234',
};

beforeAll(() => {
  process.env.DATABASE_URL ||= env.DATABASE_URL;
});

async function routeApp(storageService: StorageService) {
  const { routes } = await import('../src/routes');
  const app = Fastify();
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(routes(env, { storageService }), { prefix: '/api' });
  return app;
}

describe('storage routes', () => {
  it('rejects disallowed MIME types and oversized declared uploads before minting a URL', async () => {
    const service: StorageService = {
      createUpload: vi.fn(),
      confirmUpload: vi.fn(),
      getUpload: vi.fn(),
      createReadUrl: vi.fn(),
      cleanupUploads: vi.fn(),
    };
    const app = await routeApp(service);
    const disallowed = await app.inject({
      method: 'POST',
      url: '/api/storage/uploads',
      payload: { fileName: 'payload.exe', contentType: 'application/octet-stream', sizeBytes: 1024 },
    });
    const oversized = await app.inject({
      method: 'POST',
      url: '/api/storage/uploads',
      payload: { fileName: 'large.pdf', contentType: 'application/pdf', sizeBytes: 10 * 1024 * 1024 + 1 },
    });
    expect(disallowed.statusCode).toBe(400);
    expect(oversized.statusCode).toBe(400);
    expect(service.createUpload).not.toHaveBeenCalled();
    await app.close();
  });

  it('applies a small route body limit and a per-user URL-mint rate limit', async () => {
    const uploadId = '11111111-1111-4111-8111-111111111111';
    const service: StorageService = {
      createUpload: vi.fn(async (_userId, input) => ({
        uploadId,
        stagingObjectKey: 'storage/staging/demo-object',
        uploadUrl: 'https://storage.example/upload',
        expiresIn: 120,
        requiredHeaders: { 'content-type': input.contentType },
        sizeBytes: input.sizeBytes,
        signedContentLength: input.sizeBytes,
        metadataValidationRequired: true as const,
      })),
      confirmUpload: vi.fn(),
      getUpload: vi.fn(),
      createReadUrl: vi.fn(),
      cleanupUploads: vi.fn(async () => ({
        processed: 0,
        cleaned: 0,
        failed: 0,
        batches: 0,
        backlogRemaining: false,
        oldestBacklogCreatedAt: null,
        itemLimitReached: false,
        timeLimitReached: false,
      })),
    };
    const app = await routeApp(service);
    const tooLarge = await app.inject({
      method: 'POST',
      url: '/api/storage/uploads',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ padding: 'x'.repeat(17 * 1024) }),
    });
    expect(tooLarge.statusCode).toBe(413);
    await app.close();

    const rateLimitedApp = await routeApp(service);
    const responses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(await rateLimitedApp.inject({
        method: 'POST',
        url: '/api/storage/uploads',
        payload: { fileName: \`photo-\${attempt}.jpg\`, contentType: 'image/jpeg', sizeBytes: 1024 },
      }));
    }
    expect(responses.slice(0, 10).every((response) => response.statusCode === 200)).toBe(true);
    expect(responses[10]?.statusCode).toBe(429);
    await rateLimitedApp.close();
  });

  it('protects bounded storage cleanup with the cron bearer secret', async () => {
    const service: StorageService = {
      createUpload: vi.fn(),
      confirmUpload: vi.fn(),
      getUpload: vi.fn(),
      createReadUrl: vi.fn(),
      cleanupUploads: vi.fn(async () => ({
        processed: 2,
        cleaned: 2,
        failed: 0,
        batches: 2,
        backlogRemaining: true,
        oldestBacklogCreatedAt: '2026-01-01T00:00:00.000Z',
        itemLimitReached: true,
        timeLimitReached: false,
      })),
    };
    const app = await routeApp(service);
    const denied = await app.inject({ method: 'GET', url: '/api/internal/storage/cleanup' });
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/internal/storage/cleanup',
      headers: { authorization: 'Bearer test-cron-secret-1234' },
    });
    expect(denied.statusCode).toBe(401);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual({
      ok: true,
      processed: 2,
      cleaned: 2,
      failed: 0,
      batches: 2,
      backlogRemaining: true,
      oldestBacklogCreatedAt: '2026-01-01T00:00:00.000Z',
      itemLimitReached: true,
      timeLimitReached: false,
    });
    vi.mocked(service.cleanupUploads).mockResolvedValueOnce({
      processed: 1,
      cleaned: 1,
      failed: 0,
      batches: 1,
      backlogRemaining: true,
      oldestBacklogCreatedAt: '2026-01-01T00:00:00.000Z',
      itemLimitReached: false,
      timeLimitReached: true,
    });
    const timedOut = await app.inject({
      method: 'GET',
      url: '/api/internal/storage/cleanup',
      headers: { authorization: 'Bearer test-cron-secret-1234' },
    });
    expect(timedOut.statusCode).toBe(503);
    expect(timedOut.json()).toEqual(expect.objectContaining({
      ok: false,
      failed: 0,
      timeLimitReached: true,
      backlogRemaining: true,
    }));
    expect(service.cleanupUploads).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('returns an authenticated short-lived private read URL for an owned upload', async () => {
    const uploadId = '11111111-1111-4111-8111-111111111111';
    const service: StorageService = {
      createUpload: vi.fn(),
      confirmUpload: vi.fn(),
      getUpload: vi.fn(),
      createReadUrl: vi.fn(async () => ({
        url: 'https://account.r2.cloudflarestorage.com/bucket/object?X-Amz-Signature=test',
        expiresIn: 600,
      })),
      cleanupUploads: vi.fn(),
    };
    const app = await routeApp(service);
    const response = await app.inject({
      method: 'GET',
      url: \`/api/storage/uploads/\${uploadId}/read-url\`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({ expiresIn: 600 }));
    expect(service.createReadUrl).toHaveBeenCalledWith('demo-user', uploadId);
    await app.close();
  });
});

describe('storage reservation policy', () => {
  it('expires stale pending rows under the user lock and distinguishes issuance-rate from quota limits', async () => {
    const { sqlClient } = await import('@shared/db');
    const {
      MAX_UPLOAD_URL_ISSUANCES_PER_USER_PER_HOUR,
      StorageError,
      UPLOAD_CLEANUP_GRACE_MS,
      uploadStore,
    } = await import('../src/storage');
    type QueryToken = { text: string; values: unknown[] };
    type TransactionOwner = {
      transaction(
        build: (txn: (strings: TemplateStringsArray, ...values: unknown[]) => QueryToken) => QueryToken[],
        options: { isolationLevel: string },
      ): Promise<unknown[]>;
    };
    const transactionOwner = sqlClient as unknown as TransactionOwner;
    const transaction = vi.spyOn(transactionOwner, 'transaction');
    const reservation = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'demo-user',
      stagingObjectKey: 'storage/staging/demo-user/new--photo.jpg',
      contentType: 'image/jpeg',
      expectedSize: 1024,
      uploadUrlExpiresAt: new Date(Date.now() + 120_000),
    };
    let statements: QueryToken[] = [];
    const respondWith = (results: unknown[]) => {
      transaction.mockImplementationOnce(async (build) => {
        statements = build((strings, ...values) => ({ text: strings.join('?'), values }));
        return results;
      });
    };

    try {
      respondWith([[], [], [{ recentIssuances: 4 }], [{ id: reservation.id }]]);
      await uploadStore.reserve(reservation);
      expect(statements).toHaveLength(4);
      expect(statements[0]?.text).toContain('pg_advisory_xact_lock');
      expect(statements[1]?.text).toContain('SET "status"');
      expect(statements[1]?.text).toContain('"rejection_reason"');
      expect(statements[1]?.text).toContain('"upload_url_expires_at" <= now()');
      expect(statements[1]?.values).toContain(UPLOAD_CLEANUP_GRACE_MS);
      expect(statements[2]?.text).toContain("interval '1 hour'");
      expect(statements[3]?.text).toContain('"status"');

      respondWith([[], [], [{ recentIssuances: MAX_UPLOAD_URL_ISSUANCES_PER_USER_PER_HOUR }], []]);
      await expect(uploadStore.reserve(reservation)).rejects.toMatchObject({
        code: 'upload_rate_exceeded',
        statusCode: 429,
      } satisfies Partial<InstanceType<typeof StorageError>>);

      respondWith([[], [], [{ recentIssuances: 2 }], []]);
      await expect(uploadStore.reserve(reservation)).rejects.toMatchObject({
        code: 'upload_quota_exceeded',
        statusCode: 429,
      } satisfies Partial<InstanceType<typeof StorageError>>);
    } finally {
      transaction.mockRestore();
    }
  });
});

describe('R2 upload confirmation', () => {
  it('cryptographically binds the declared Content-Length into the presigned PUT', async () => {
    const { createObjectGateway } = await import('../src/storage');
    const signedUrl = await createObjectGateway(env).signPut('storage/staging/demo-user/object', 'image/jpeg', 1024, 120);
    const signedHeaders = new URL(signedUrl).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
    expect(signedHeaders).toEqual(expect.arrayContaining(['content-length', 'content-type']));
  });

  it('authorizes private reads by upload owner and applies the configured TTL', async () => {
    const confirmed = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'demo-user',
      stagingObjectKey: 'storage/staging/demo-user/source--photo.jpg',
      objectKey: 'storage/confirmed/demo-user/11111111-1111-4111-8111-111111111111--photo.jpg',
      contentType: 'image/jpeg',
      expectedSize: 1024,
      actualSize: 1024,
      status: 'confirmed',
      rejectionReason: null,
      uploadUrlExpiresAt: new Date(),
      stagingDeletedAt: new Date(),
      confirmedAt: new Date(),
      createdAt: new Date(),
    } satisfies NonNullable<Awaited<ReturnType<UploadStore['find']>>>;
    const store: UploadStore = {
      reserve: vi.fn(),
      find: vi.fn(async (id, userId) => id === confirmed.id && userId === confirmed.userId ? confirmed : null),
      confirm: vi.fn(),
      reject: vi.fn(),
      listCleanupCandidates: vi.fn(async () => []),
      completeStagingCleanup: vi.fn(),
    };
    const signGet = vi.fn(async () => 'https://account.r2.cloudflarestorage.com/signed');
    const objects: ObjectGateway = {
      signPut: vi.fn(),
      signGet,
      head: vi.fn(),
      copy: vi.fn(),
      delete: vi.fn(),
    };
    const { createStorageService, StorageError } = await import('../src/storage');
    const service = createStorageService(env, { store, objects });
    await expect(service.createReadUrl('other-user', confirmed.id)).rejects.toMatchObject({
      code: 'asset_not_found',
      statusCode: 404,
    } satisfies Partial<InstanceType<typeof StorageError>>);
    await expect(service.createReadUrl(confirmed.userId, confirmed.id)).resolves.toEqual({
      url: 'https://account.r2.cloudflarestorage.com/signed',
      expiresIn: 600,
    });
    expect(signGet).toHaveBeenCalledWith(confirmed.objectKey, 600);
  });

  it('keeps invalid objects pending until deletion succeeds, then rejects the upload', async () => {
    let row: Awaited<ReturnType<UploadStore['find']>> = null;
    const store: UploadStore = {
      reserve: vi.fn(async (input) => {
        row = {
          ...input,
          objectKey: null,
          actualSize: null,
          status: 'pending',
          rejectionReason: null,
          stagingDeletedAt: null,
          confirmedAt: null,
          createdAt: new Date(),
        };
      }),
      find: vi.fn(async () => row),
      confirm: vi.fn(async () => { throw new Error('confirm should not be called'); }),
      reject: vi.fn(async () => undefined),
      listCleanupCandidates: vi.fn(async () => []),
      completeStagingCleanup: vi.fn(async () => undefined),
    };
    const objects: ObjectGateway = {
      signPut: vi.fn(async () => 'https://storage.example/upload'),
      head: vi.fn(async () => ({ sizeBytes: 2048, contentType: 'image/jpeg', etag: 'etag-1' })),
      copy: vi.fn(async () => undefined),
      delete: vi.fn()
        .mockRejectedValueOnce(new Error('temporary R2 delete failure'))
        .mockResolvedValue(undefined),
    };
    const { createStorageService, StorageError } = await import('../src/storage');
    const service = createStorageService(env, { store, objects });
    const created = await service.createUpload('demo-user', {
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    });
    expect(created.expiresIn).toBe(120);
    expect(created.requiredHeaders).toEqual({ 'content-type': 'image/jpeg' });
    expect(created.signedContentLength).toBe(1024);
    expect(created.metadataValidationRequired).toBe(true);
    expect(objects.signPut).toHaveBeenCalledWith(created.stagingObjectKey, 'image/jpeg', 1024, 120);

    await expect(service.confirmUpload('demo-user', created.uploadId)).rejects.toMatchObject({
      code: 'upload_cleanup_failed',
      statusCode: 503,
    } satisfies Partial<InstanceType<typeof StorageError>>);
    expect(store.reject).not.toHaveBeenCalled();

    await expect(service.confirmUpload('demo-user', created.uploadId)).rejects.toMatchObject({
      code: 'upload_metadata_mismatch',
      statusCode: 422,
    } satisfies Partial<InstanceType<typeof StorageError>>);
    expect(objects.delete).toHaveBeenCalledTimes(2);
    expect(objects.delete).toHaveBeenLastCalledWith(created.stagingObjectKey);
    expect(store.reject).toHaveBeenCalledWith(created.uploadId, 'demo-user', 2048, 'size_mismatch');
  });

  it('promotes the validated ETag to a distinct immutable key and deletes staging', async () => {
    let row: Awaited<ReturnType<UploadStore['find']>> = null;
    const store: UploadStore = {
      reserve: vi.fn(async (input) => {
        row = {
          ...input,
          objectKey: null,
          actualSize: null,
          status: 'pending',
          rejectionReason: null,
          stagingDeletedAt: null,
          confirmedAt: null,
          createdAt: new Date(),
        };
      }),
      find: vi.fn(async () => row),
      confirm: vi.fn(async (_id, _userId, finalObjectKey, actualSize) => {
        if (!row) throw new Error('missing upload');
        row = { ...row, objectKey: finalObjectKey, actualSize, status: 'confirmed', confirmedAt: new Date() };
        return row;
      }),
      reject: vi.fn(async () => undefined),
      listCleanupCandidates: vi.fn(async () => []),
      completeStagingCleanup: vi.fn(async () => undefined),
    };
    const objects: ObjectGateway = {
      signPut: vi.fn(async () => 'https://storage.example/upload'),
      head: vi.fn(async () => ({ sizeBytes: 1024, contentType: 'image/jpeg', etag: 'etag-confirmed' })),
      copy: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const { createStorageService } = await import('../src/storage');
    const service = createStorageService(env, { store, objects });
    const created = await service.createUpload('demo-user', {
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    });
    const result = await service.confirmUpload('demo-user', created.uploadId);
    const copyCall = vi.mocked(objects.copy).mock.calls[0];
    expect(copyCall?.[0]).toBe(created.stagingObjectKey);
    expect(copyCall?.[1]).not.toBe(created.stagingObjectKey);
    expect(copyCall?.[1]).toMatch(/^storage\\/confirmed\\//);
    expect(copyCall?.[2]).toBe('etag-confirmed');
    expect(result.upload.objectKey).toBe(copyCall?.[1]);
    expect(result.upload.contentTrust).toBe('untrusted');
    expect(objects.delete).toHaveBeenCalledWith(created.stagingObjectKey);
  });

  it('returns the committed upload when another confirmer removes staging first', async () => {
    let row: Awaited<ReturnType<UploadStore['find']>> = null;
    const store: UploadStore = {
      reserve: vi.fn(async (input) => {
        row = {
          ...input,
          objectKey: null,
          actualSize: null,
          status: 'pending',
          rejectionReason: null,
          stagingDeletedAt: null,
          confirmedAt: null,
          createdAt: new Date(),
        };
      }),
      find: vi.fn(async () => row),
      confirm: vi.fn(async () => { throw new Error('the other confirmer already committed'); }),
      reject: vi.fn(async () => undefined),
      listCleanupCandidates: vi.fn(async () => []),
      completeStagingCleanup: vi.fn(async () => undefined),
    };
    const objects: ObjectGateway = {
      signPut: vi.fn(async () => 'https://storage.example/upload'),
      head: vi.fn(async () => ({ sizeBytes: 1024, contentType: 'image/jpeg', etag: 'etag-concurrent' })),
      copy: vi.fn(async (_source, destination) => {
        if (!row) throw new Error('missing upload');
        row = { ...row, objectKey: destination, actualSize: 1024, status: 'confirmed', confirmedAt: new Date() };
        throw Object.assign(new Error('staging no longer exists'), { name: 'NoSuchKey' });
      }),
      delete: vi.fn(async () => undefined),
    };
    const { createStorageService } = await import('../src/storage');
    const service = createStorageService(env, { store, objects });
    const created = await service.createUpload('demo-user', {
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    });

    const result = await service.confirmUpload('demo-user', created.uploadId);
    expect(result.upload.status).toBe('confirmed');
    expect(result.upload.objectKey).toMatch(/^storage\\/confirmed\\//);
    expect(result.upload.contentTrust).toBe('untrusted');
    expect(store.confirm).not.toHaveBeenCalled();
    expect(objects.delete).toHaveBeenCalledWith(created.stagingObjectKey);
  });

  it('deletes an unreferenced promoted object when a concurrent rejection wins the database CAS', async () => {
    const { createStorageService, StorageError } = await import('../src/storage');
    let row: Awaited<ReturnType<UploadStore['find']>> = null;
    const store: UploadStore = {
      reserve: vi.fn(async (input) => {
        row = {
          ...input,
          objectKey: null,
          actualSize: null,
          status: 'pending',
          rejectionReason: null,
          stagingDeletedAt: null,
          confirmedAt: null,
          createdAt: new Date(),
        };
      }),
      find: vi.fn(async () => row),
      confirm: vi.fn(async () => {
        if (!row) throw new Error('missing upload');
        row = { ...row, status: 'rejected', rejectionReason: 'concurrent_rejection' };
        throw new StorageError('Upload state changed while it was being finalized', 409, 'upload_state_changed');
      }),
      reject: vi.fn(async () => undefined),
      listCleanupCandidates: vi.fn(async () => []),
      completeStagingCleanup: vi.fn(async () => undefined),
    };
    const objects: ObjectGateway = {
      signPut: vi.fn(async () => 'https://storage.example/upload'),
      head: vi.fn(async () => ({ sizeBytes: 1024, contentType: 'image/jpeg', etag: 'etag-race' })),
      copy: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const service = createStorageService(env, { store, objects });
    const created = await service.createUpload('demo-user', {
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    });

    await expect(service.confirmUpload('demo-user', created.uploadId)).rejects.toMatchObject({
      code: 'upload_rejected',
      statusCode: 409,
    });
    const promotedKey = vi.mocked(objects.copy).mock.calls[0]?.[1];
    expect(promotedKey).toMatch(/^storage\\/confirmed\\//);
    expect(objects.delete).toHaveBeenCalledWith(promotedKey);
  });

  it('retains the promoted object when a database failure has an indeterminate commit outcome', async () => {
    let row: Awaited<ReturnType<UploadStore['find']>> = null;
    const store: UploadStore = {
      reserve: vi.fn(async (input) => {
        row = {
          ...input,
          objectKey: null,
          actualSize: null,
          status: 'pending',
          rejectionReason: null,
          stagingDeletedAt: null,
          confirmedAt: null,
          createdAt: new Date(),
        };
      }),
      find: vi.fn(async () => row),
      confirm: vi.fn(async () => { throw new Error('database connection reset'); }),
      reject: vi.fn(async (_id, _userId, actualSize, reason) => {
        if (row?.status === 'pending') row = { ...row, status: 'rejected', actualSize, rejectionReason: reason };
      }),
      listCleanupCandidates: vi.fn(async (expiredBefore) => (
        row && !row.stagingDeletedAt && row.uploadUrlExpiresAt.getTime() <= expiredBefore.getTime() ? [row] : []
      )),
      completeStagingCleanup: vi.fn(async (_upload, completedAt) => {
        if (row) row = { ...row, stagingDeletedAt: completedAt };
      }),
    };
    const objects: ObjectGateway = {
      signPut: vi.fn(async () => 'https://storage.example/upload'),
      head: vi.fn(async () => ({ sizeBytes: 1024, contentType: 'image/jpeg', etag: 'etag-uncertain' })),
      copy: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const { createStorageService } = await import('../src/storage');
    const service = createStorageService(env, { store, objects });
    const created = await service.createUpload('demo-user', {
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    });

    await expect(service.confirmUpload('demo-user', created.uploadId)).rejects.toMatchObject({
      code: 'upload_reconciliation_required',
      statusCode: 503,
    });
    expect(objects.copy).toHaveBeenCalledOnce();
    expect(objects.delete).not.toHaveBeenCalled();

    const promotedKey = vi.mocked(objects.copy).mock.calls[0]?.[1];
    const reservedRow = await store.find(created.uploadId, 'demo-user');
    if (!reservedRow) throw new Error('expected reserved upload row');
    row = {
      ...reservedRow,
      uploadUrlExpiresAt: new Date(Date.now() - 20 * 60_000),
      createdAt: new Date(Date.now() - 30 * 60_000),
    };
    const cleanup = await service.cleanupUploads();
    expect(cleanup).toEqual(expect.objectContaining({ cleaned: 1, failed: 0, backlogRemaining: false }));
    expect(objects.delete).toHaveBeenCalledWith(created.stagingObjectKey);
    expect(objects.delete).toHaveBeenCalledWith(promotedKey);
    expect(store.reject).toHaveBeenCalledWith(created.uploadId, 'demo-user', null, 'upload_expired');
  });

  it('bounds scheduled cleanup and records deletion of expired pending staging objects', async () => {
    const expired = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'demo-user',
      stagingObjectKey: 'storage/staging/demo-user/expired--photo.jpg',
      objectKey: null,
      contentType: 'image/jpeg',
      expectedSize: 1024,
      actualSize: null,
      status: 'pending',
      rejectionReason: null,
      uploadUrlExpiresAt: new Date(Date.now() - 11 * 60_000),
      stagingDeletedAt: null,
      confirmedAt: null,
      createdAt: new Date(Date.now() - 120_000),
    } satisfies NonNullable<Awaited<ReturnType<UploadStore['find']>>>;
    let remaining = [expired];
    const store: UploadStore = {
      reserve: vi.fn(async () => undefined),
      find: vi.fn(async () => expired),
      confirm: vi.fn(async () => { throw new Error('confirm should not be called'); }),
      reject: vi.fn(async () => undefined),
      listCleanupCandidates: vi.fn(async (_now, limit, after) => remaining.filter((upload) => (
        !after
        || upload.createdAt.getTime() > after.createdAt.getTime()
        || (upload.createdAt.getTime() === after.createdAt.getTime() && upload.id > after.id)
      )).slice(0, limit)),
      completeStagingCleanup: vi.fn(async (upload) => {
        remaining = remaining.filter((candidate) => candidate.id !== upload.id);
      }),
    };
    const objects: ObjectGateway = {
      signPut: vi.fn(async () => 'https://storage.example/upload'),
      head: vi.fn(async () => null),
      copy: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const {
      createStorageService,
      MAX_UPLOAD_CLEANUP_BATCH_SIZE,
      UPLOAD_CLEANUP_GRACE_MS,
    } = await import('../src/storage');
    const service = createStorageService(env, { store, objects });
    const result = await service.cleanupUploads(500);

    expect(result).toEqual({
      processed: 1,
      cleaned: 1,
      failed: 0,
      batches: 1,
      backlogRemaining: false,
      oldestBacklogCreatedAt: null,
      itemLimitReached: false,
      timeLimitReached: false,
    });
    expect(store.listCleanupCandidates).toHaveBeenNthCalledWith(
      1,
      expect.any(Date),
      MAX_UPLOAD_CLEANUP_BATCH_SIZE,
      undefined,
    );
    expect(store.listCleanupCandidates).toHaveBeenLastCalledWith(expect.any(Date), 1);
    const cutoff = vi.mocked(store.listCleanupCandidates).mock.calls[0]?.[0];
    expect(Date.now() - (cutoff?.getTime() ?? Date.now())).toBeGreaterThanOrEqual(UPLOAD_CLEANUP_GRACE_MS);
    expect(objects.delete).toHaveBeenCalledWith(expired.stagingObjectKey);
    expect(store.completeStagingCleanup).toHaveBeenCalledWith(expired, expect.any(Date));
  });

  it('drains multiple keyset batches while reporting the oldest remaining backlog item', async () => {
    const baseCreatedAt = Date.parse('2026-01-01T00:00:00.000Z');
    const rows = Array.from({ length: 52 }, (_, index) => ({
      id: String(index).padStart(4, '0'),
      userId: 'demo-user',
      stagingObjectKey: \`storage/staging/demo-user/\${index}--photo.jpg\`,
      objectKey: null,
      contentType: 'image/jpeg',
      expectedSize: 1024,
      actualSize: null,
      status: 'rejected',
      rejectionReason: 'upload_expired',
      uploadUrlExpiresAt: new Date(baseCreatedAt - 20 * 60_000),
      stagingDeletedAt: null,
      confirmedAt: null,
      createdAt: new Date(baseCreatedAt + index * 1000),
    })) satisfies Array<NonNullable<Awaited<ReturnType<UploadStore['find']>>>>;
    let remaining = [...rows];
    const store: UploadStore = {
      reserve: vi.fn(async () => undefined),
      find: vi.fn(async () => null),
      confirm: vi.fn(async () => { throw new Error('confirm should not be called'); }),
      reject: vi.fn(async () => undefined),
      listCleanupCandidates: vi.fn(async (_now, limit, after) => remaining.filter((upload) => (
        !after
        || upload.createdAt.getTime() > after.createdAt.getTime()
        || (upload.createdAt.getTime() === after.createdAt.getTime() && upload.id > after.id)
      )).slice(0, limit)),
      completeStagingCleanup: vi.fn(async (upload) => {
        remaining = remaining.filter((candidate) => candidate.id !== upload.id);
      }),
    };
    const objects: ObjectGateway = {
      signPut: vi.fn(async () => 'https://storage.example/upload'),
      head: vi.fn(async () => null),
      copy: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const { createStorageService, MAX_UPLOAD_CLEANUP_BATCH_SIZE } = await import('../src/storage');
    const service = createStorageService(env, { store, objects });
    const result = await service.cleanupUploads(MAX_UPLOAD_CLEANUP_BATCH_SIZE + 1);

    expect(result).toEqual({
      processed: 51,
      cleaned: 51,
      failed: 0,
      batches: 2,
      backlogRemaining: true,
      oldestBacklogCreatedAt: rows[51]?.createdAt.toISOString(),
      itemLimitReached: true,
      timeLimitReached: false,
    });
    expect(vi.mocked(store.listCleanupCandidates).mock.calls.map((call) => call[1])).toEqual([
      MAX_UPLOAD_CLEANUP_BATCH_SIZE,
      1,
      1,
    ]);
    expect(objects.delete).toHaveBeenCalledTimes(102);
    expect(remaining).toEqual([rows[51]]);
  });
});
`;
}

function applicationSource(options: ProjectOptions, displayName: string): string {
  const authImport = options.features.auth ? "import { registerAuth } from './auth';\n" : '';
  const authRegistration = options.features.auth ? '  await registerAuth(app, env);\n' : '';
  const databaseImport = options.features.database ? "import { sqlClient } from '@shared/db';\n" : '';
  const readinessTimeout = options.features.database ? `
const CRITICAL_DEPENDENCY_TIMEOUT_MS = 2_000;

async function checkDatabaseReadiness(): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      sqlClient\`SELECT 1\`,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Database readiness check timed out')),
          CRITICAL_DEPENDENCY_TIMEOUT_MS,
        );
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
` : '';
  const defaultReadinessCheck = options.features.database ? 'checkDatabaseReadiness' : '(async () => undefined)';
  return `import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadEnv } from './env';
import { routes } from './routes';
${authImport}${databaseImport}${readinessTimeout}
export type Application = FastifyInstance & { beginShutdown(): void };
export interface ApplicationDependencies { checkReadiness?: () => Promise<void> }

export async function buildApp(dependencies: ApplicationDependencies = {}): Promise<Application> {
  const env = loadEnv();
  let ready = false;
  const app = Fastify({
    logger: env.NODE_ENV === 'test'
      ? false
      : { level: env.NODE_ENV === 'production' ? 'warn' : 'info', redact: ['req.headers.authorization'] },
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false,
    bodyLimit: 1024 * 1024,
  }) as unknown as Application;
  const checkReadiness = dependencies.checkReadiness ?? ${defaultReadinessCheck};
  const serviceState = {
    async readiness(): Promise<'ready' | 'unavailable' | 'shutting_down'> {
      if (!ready) return 'shutting_down';
      try {
        await checkReadiness();
        return 'ready';
      } catch (error) {
        const failure = error instanceof Error ? error : new Error('Unknown readiness failure');
        app.log.warn({ err: failure }, 'critical_dependency_readiness_failed');
        return 'unavailable';
      }
    },
  };
  app.beginShutdown = () => { ready = false; };
  await app.register(cors, { origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false });
  await app.register(compress, { global: true });
  await app.register(helmet, { crossOriginEmbedderPolicy: false });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
${authRegistration}  await app.register(routes(env, { serviceState }), { prefix: '/api' });
  app.addHook('onClose', async () => { app.beginShutdown(); });
  app.setErrorHandler((error, request, reply) => {
    const failure = error instanceof Error ? error : new Error('Unknown request failure');
    const candidate = error as { statusCode?: unknown; code?: unknown; details?: unknown };
    const statusCode = typeof candidate.statusCode === 'number'
      && Number.isInteger(candidate.statusCode)
      && candidate.statusCode >= 400
      && candidate.statusCode <= 599
      ? candidate.statusCode
      : 500;
    request.log[statusCode >= 500 ? 'error' : 'warn']({
      err: failure,
      statusCode,
      errorCode: typeof candidate.code === 'string' ? candidate.code : failure.name,
      requestId: request.id,
    }, 'request_failed');
    return reply.code(statusCode).send({
      error: statusCode >= 500
        ? 'server_error'
        : (typeof candidate.code === 'string' ? candidate.code : failure.name),
      message: statusCode >= 500 ? 'An unexpected error occurred' : failure.message,
      ...(statusCode < 500 && candidate.details !== undefined ? { details: candidate.details } : {}),
    });
  });
  ready = true;
  return app;
}

export const serviceName = ${jsString(`${displayName} API`)};
`;
}

export async function scaffoldApi(root: string, options: ProjectOptions): Promise<void> {
  const dir = path.join(root, 'apps/api');
  const selected = dependenciesFor(options);
  const coverageBranchThreshold = Object.values(options.features).some(Boolean) ? 55 : 45;
  anhedralPrint.section('API (Fastify)');
  anhedralPrint.step('Writing modular Fastify API');
  writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: childPackageName(options.projectName, 'api'),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx --env-file=.env --watch src/index.ts',
      build: 'pnpm typecheck',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
      'test:coverage': 'vitest run --coverage',
    },
    dependencies: selected.dependencies,
    devDependencies: selected.devDependencies,
  }, null, 2) + '\n');
  writeFile(path.join(dir, 'vitest.config.ts'), `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 68,
        statements: 65,
        functions: 60,
        branches: ${coverageBranchThreshold},
      },
    },
  },
});
`);
  writeFile(path.join(dir, 'src/env.ts'), envSource(options));
  if (options.features.auth) writeFile(path.join(dir, 'src/auth.ts'), authSource());
  if (options.features.billing) writeFile(path.join(dir, 'src/realtime.ts'), realtimeSource());
  if (options.features.storage) writeFile(path.join(dir, 'src/storage.ts'), storageSource());
  if (options.features.billing) writeFile(path.join(dir, 'src/billing.ts'), billingSource());
  const appRouteAuthImports = options.features.auth
    ? `import { authenticatedUserId } from '../auth';
import type { AppEnv } from '../env';
`
    : '';
  const appRouteRegistrationStart = options.features.auth
    ? `export function appRoutes(env: AppEnv): FastifyPluginAsync {
  return async function registerAppRoutes(app) {`
    : 'export const appRoutes: FastifyPluginAsync = async (app) => {';
  const appRouteRegistrationEnd = options.features.auth ? '  };\n}' : '};';
  const listOwner = options.features.auth
    ? `    const userId = authenticatedUserId(request, env);
    const rows = await db.select().from(items)
      .where(eq(items.userId, userId))
      .orderBy(desc(items.createdAt))
      .limit(50);`
    : `    const rows = await db.select().from(items)
      .orderBy(desc(items.createdAt))
      .limit(50);`;
  const createOwner = options.features.auth
    ? '      userId: authenticatedUserId(request, env),\n'
    : '';
  writeFile(path.join(dir, 'src/routes/app.ts'), options.features.database
    ? `import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { CreateItemRequestSchema, ItemListSchema, ItemSchema } from '@shared/contracts';
import { db } from '@shared/db';
import { items } from '@shared/db/schema';
import { desc${options.features.auth ? ', eq' : ''} } from 'drizzle-orm';
${appRouteAuthImports}

// A complete starter feature. Keep the boundary or replace it with your product model.
${appRouteRegistrationStart}
  app.get('/items', async (request) => {
${listOwner}
    return ItemListSchema.parse(rows.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })));
  });

  app.post('/items', async (request, reply) => {
    const parsed = CreateItemRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_item_request',
        message: 'Item name must contain 1 to 120 characters',
        details: parsed.error.flatten(),
      });
    }
    const [created] = await db.insert(items).values({
      id: randomUUID(),
${createOwner}      name: parsed.data.name,
    }).returning();
    if (!created) throw new Error('Database did not return the created item');
    return reply.code(201).send(ItemSchema.parse({
      ...created,
      createdAt: created.createdAt.toISOString(),
    }));
  });
${appRouteRegistrationEnd}
`
    : `import type { FastifyPluginAsync } from 'fastify';

// Register product-owned routes here. Anhedral never rewrites this file after creation.
export const appRoutes: FastifyPluginAsync = async (_app) => {};
`);
  writeFile(path.join(dir, 'src/routes.ts'), routesSource(options));
  writeFile(path.join(dir, 'src/application.ts'), applicationSource(options, options.displayName));
  writeFile(path.join(dir, 'src/index.ts'), `import { buildApp } from './application';

const app = await buildApp();
let shuttingDown = false;
const SHUTDOWN_DEADLINE_MS = 10_000;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.beginShutdown();
  app.log.info({ signal }, 'graceful_shutdown_started');
  const deadline = setTimeout(() => {
    app.log.fatal({ signal, timeoutMs: SHUTDOWN_DEADLINE_MS }, 'graceful_shutdown_deadline_exceeded');
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS);
  deadline.unref();
  try {
    await app.close();
  } catch (error) {
    const failure = error instanceof Error ? error : new Error('Unknown shutdown failure');
    app.log.error({ err: failure, signal }, 'graceful_shutdown_failed');
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void shutdown(signal); });
}

try {
  await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT || 8787) });
} catch (error) {
  const failure = error instanceof Error ? error : new Error('Unknown startup failure');
  app.log.error({ err: failure }, 'api_startup_failed');
  await app.close().catch(() => undefined);
  process.exitCode = 1;
}
`);
  writeFile(path.join(dir, 'tests/health.test.ts'), `import { beforeAll, describe, expect, it } from 'vitest';

const allowedOrigins: string[] = ${JSON.stringify(corsOrigins(options))};

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.ANHEDRAL_DEMO = 'true';
  process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
  ${options.features.storage ? "process.env.BASE_URL = 'http://localhost:8787';" : ''}
});

describe('health', () => {
  it('responds without provider credentials', async () => {
    const { buildApp } = await import('../src/application');
    const app = await buildApp({ checkReadiness: async () => undefined });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    const readiness = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: 'api' });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toEqual({ ok: true, service: 'api', status: 'ready' });
    app.beginShutdown();
    const draining = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(draining.statusCode).toBe(503);
    expect(draining.json()).toEqual({ ok: false, service: 'api', status: 'shutting_down' });
    await app.close();
  });

  it('reports critical dependency failures without claiming to be ready', async () => {
    const { buildApp } = await import('../src/application');
    const app = await buildApp({ checkReadiness: async () => {
      throw new Error('database unavailable');
    } });
    const readiness = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toEqual({ ok: false, service: 'api', status: 'unavailable' });
    await app.close();
  });

  it('keeps server failures private and preserves safe client-error details', async () => {
    const { buildApp } = await import('../src/application');
    const app = await buildApp({ checkReadiness: async () => undefined });
    app.get('/api/test-server-error', async () => {
      throw Object.assign(new Error('database connection included internal credentials'), {
        statusCode: 503,
        code: 'database_connection_failed',
        details: { connection: 'internal-only' },
      });
    });
    app.get('/api/test-invalid-status', async () => {
      throw Object.assign(new Error('invalid status must not become a success'), {
        statusCode: 200,
        details: { internal: true },
      });
    });
    app.get('/api/test-client-error', async () => {
      throw Object.assign(new Error('The submitted field is invalid'), {
        statusCode: 422,
        code: 'invalid_field',
        details: { field: 'name' },
      });
    });

    const serverFailure = await app.inject({ method: 'GET', url: '/api/test-server-error' });
    expect(serverFailure.statusCode).toBe(503);
    expect(serverFailure.json()).toEqual({
      error: 'server_error',
      message: 'An unexpected error occurred',
    });
    const invalidStatus = await app.inject({ method: 'GET', url: '/api/test-invalid-status' });
    expect(invalidStatus.statusCode).toBe(500);
    expect(invalidStatus.json()).toEqual({
      error: 'server_error',
      message: 'An unexpected error occurred',
    });
    const clientFailure = await app.inject({ method: 'GET', url: '/api/test-client-error' });
    expect(clientFailure.statusCode).toBe(422);
    expect(clientFailure.json()).toEqual({
      error: 'invalid_field',
      message: 'The submitted field is invalid',
      details: { field: 'name' },
    });
    await app.close();
  });

  it('allows only configured browser origins', async () => {
    const { buildApp } = await import('../src/application');
    const app = await buildApp();
    for (const origin of allowedOrigins) {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/health',
        headers: { origin, 'access-control-request-method': 'GET' },
      });
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    }
    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: { origin: 'https://untrusted.example', 'access-control-request-method': 'GET' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});
`);
  writeFile(path.join(dir, 'tests/env.test.ts'), envTestSource(options));
  if (options.features.billing) {
    writeFile(path.join(dir, 'tests/revenuecat-webhook.test.ts'), billingRouteTestSource(options));
  }
  if (options.features.storage) {
    writeFile(path.join(dir, 'tests/storage.test.ts'), storageRouteTestSource(options));
  }
  const envLines = [
    'NODE_ENV=development',
    'PORT=8787',
    'TRUST_PROXY_HOPS=0',
    `# In production, list every exact browser origin explicitly and use HTTPS; literal null remains valid for the desktop file origin.\nCORS_ORIGINS=${corsOrigins(options).join(',')}`,
    'ANHEDRAL_DEMO=false',
    options.features.database ? '# Production requires a postgres/postgresql URL: paste the exact pooled URL from managed Neon. Anhedral never starts local Postgres.\nDATABASE_URL=YOUR_NEON_POSTGRES_URL' : null,
    options.features.auth ? '# Production requires Clerk keys from the live instance (pk_live_ / sk_live_).\nCLERK_PUBLISHABLE_KEY=pk_test_***\nCLERK_SECRET_KEY=sk_test_***' : null,
    options.features.billing ? '# Generate a dedicated high-entropy webhook authorization value (32+ characters).\nRC_WEBHOOK_SECRET=\n# Server-only RevenueCat secret key used to reconcile GET /v1/subscribers/{app_user_id}.\nRC_SECRET_API_KEY=\nRC_ENTITLEMENT_ID=pro\n# Server-only Ably API key; clients receive scoped, short-lived token requests.\nABLY_API_KEY=' : null,
    options.features.storage ? '# Canonical application/API origin used when constructing protected storage links. Use HTTPS in production.\nBASE_URL=http://localhost:8787\n# R2 presigned PUTs bind exact Content-Length and require the declared Content-Type; configure bucket CORS for each client origin.\n# Production expects the 32-hex account ID, 32-hex access key ID, and 64-hex secret issued by Cloudflare.\nR2_ACCOUNT_ID=\nR2_ACCESS_KEY_ID=\nR2_SECRET_ACCESS_KEY=\n# Bucket names are 3-63 lowercase letters, numbers, or hyphens and cannot begin or end with a hyphen.\nR2_BUCKET_NAME=\n# Keep every application object inside one top-level namespace.\nR2_PREFIX=storage\n# Authenticated read URLs are clamped to 60-604800 seconds.\nR2_PROXY_READ_URL_TTL_SECONDS=600\n# Operations/CI only. Wrangler reads this automatically; do not expose it to clients or the Worker.\nCLOUDFLARE_API_TOKEN=' : null,
    options.features.billing || options.features.storage ? '# Vercel sends this as Authorization: Bearer <CRON_SECRET>; use a non-placeholder value of at least 32 characters.\nCRON_SECRET=' : null,
  ].filter((value): value is string => value !== null);
  writeFile(path.join(dir, '.env.example'), envLines.join('\n') + '\n');
  appendGitignore(dir, ['.env', '.env.*', '!.env.example', 'node_modules', 'coverage', 'dist', '*.tsbuildinfo']);
  anhedralPrint.done('Modular Fastify API written');
}

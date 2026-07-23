import type { CompositionModel } from '../architecture/contributions.js';

const ROOT_ENVIRONMENT_ORDER = [
  'ANHEDRAL_DEMO',
  'PORT',
  'TRUST_PROXY_HOPS',
  'CORS_ORIGINS',
  'BASE_URL',
  'DATABASE_URL',
  'CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'RC_WEBHOOK_SECRET',
  'RC_SECRET_API_KEY',
  'RC_ENTITLEMENT_ID',
  'ABLY_API_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PREFIX',
  'R2_PROXY_READ_URL_TTL_SECONDS',
  'DESKTOP_UPDATE_BASE_URL',
  'CLOUDFLARE_API_TOKEN',
  'CRON_SECRET',
] as const;

export type RootEnvironmentContext = {
  readonly corsOrigins: readonly string[];
};

export function composeRootEnvironment(
  model: CompositionModel,
  context: RootEnvironmentContext,
): readonly string[] {
  const environment = new Map(model.environment.map((entry) => [entry.name, entry.defaultValue]));
  return Object.freeze(ROOT_ENVIRONMENT_ORDER.flatMap((name) => {
    if (!environment.has(name)) return [];
    const value = name === 'CORS_ORIGINS' ? context.corsOrigins.join(',') : environment.get(name)!;
    return [`${name}=${value}`];
  }));
}

export function composeVercelCrons(model: CompositionModel): readonly Record<string, string>[] {
  return Object.freeze(model.crons.map(({ path, schedule }) => Object.freeze({ path, schedule })));
}

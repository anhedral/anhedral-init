import { resolveModules, type ModuleId } from './modules.js';

export type EnvironmentContribution = {
  readonly owner: ModuleId;
  readonly name: string;
  readonly defaultValue: string;
};

export type CronContribution = {
  readonly owner: ModuleId;
  readonly id: string;
  readonly path: string;
  readonly schedule: string;
};

export type ModuleCompositionContribution = {
  readonly module: ModuleId;
  readonly environment: readonly Omit<EnvironmentContribution, 'owner'>[];
  readonly crons: readonly Omit<CronContribution, 'owner'>[];
};

export type CompositionModel = {
  readonly modules: readonly ModuleId[];
  readonly environment: readonly EnvironmentContribution[];
  readonly crons: readonly CronContribution[];
};

export type CompositionErrorCode =
  | 'DUPLICATE_ENVIRONMENT_CONTRIBUTION'
  | 'DUPLICATE_CRON_CONTRIBUTION';

export class CompositionError extends Error {
  constructor(readonly code: CompositionErrorCode, message: string) {
    super(message);
    this.name = 'CompositionError';
  }
}

const EMPTY = Object.freeze([]) as readonly never[];

const MODULE_CONTRIBUTIONS: Readonly<Record<ModuleId, ModuleCompositionContribution>> = Object.freeze({
  web: Object.freeze({ module: 'web', environment: EMPTY, crons: EMPTY }),
  mobile: Object.freeze({ module: 'mobile', environment: EMPTY, crons: EMPTY }),
  api: Object.freeze({
    module: 'api',
    environment: Object.freeze([
      { name: 'ANHEDRAL_DEMO', defaultValue: 'false' },
      { name: 'PORT', defaultValue: '8787' },
      { name: 'TRUST_PROXY_HOPS', defaultValue: '0' },
      { name: 'CORS_ORIGINS', defaultValue: '' },
    ]),
    crons: EMPTY,
  }),
  desktop: Object.freeze({ module: 'desktop', environment: EMPTY, crons: EMPTY }),
  extension: Object.freeze({ module: 'extension', environment: EMPTY, crons: EMPTY }),
  db: Object.freeze({
    module: 'db',
    environment: Object.freeze([{ name: 'DATABASE_URL', defaultValue: 'YOUR_NEON_POSTGRES_URL' }]),
    crons: EMPTY,
  }),
  auth: Object.freeze({
    module: 'auth',
    environment: Object.freeze([
      { name: 'CLERK_PUBLISHABLE_KEY', defaultValue: 'pk_test_***' },
      { name: 'CLERK_SECRET_KEY', defaultValue: 'sk_test_***' },
    ]),
    crons: EMPTY,
  }),
  billing: Object.freeze({
    module: 'billing',
    environment: Object.freeze([
      { name: 'RC_WEBHOOK_SECRET', defaultValue: '' },
      { name: 'RC_SECRET_API_KEY', defaultValue: '' },
      { name: 'RC_ENTITLEMENT_ID', defaultValue: 'pro' },
      { name: 'ABLY_API_KEY', defaultValue: '' },
      { name: 'CRON_SECRET', defaultValue: '' },
    ]),
    crons: Object.freeze([
      { id: 'realtime-outbox', path: '/api/internal/realtime/flush', schedule: '*/5 * * * *' },
    ]),
  }),
  storage: Object.freeze({
    module: 'storage',
    environment: Object.freeze([
      { name: 'BASE_URL', defaultValue: 'http://localhost:8787' },
      { name: 'R2_ACCOUNT_ID', defaultValue: '' },
      { name: 'R2_ACCESS_KEY_ID', defaultValue: '' },
      { name: 'R2_SECRET_ACCESS_KEY', defaultValue: '' },
      { name: 'R2_BUCKET_NAME', defaultValue: '' },
      { name: 'R2_PREFIX', defaultValue: 'storage' },
      { name: 'R2_PROXY_READ_URL_TTL_SECONDS', defaultValue: '600' },
      { name: 'CLOUDFLARE_API_TOKEN', defaultValue: '' },
      { name: 'CRON_SECRET', defaultValue: '' },
    ]),
    crons: Object.freeze([
      { id: 'storage-cleanup', path: '/api/internal/storage/cleanup', schedule: '0 3 * * *' },
    ]),
  }),
  'native-subscriptions': Object.freeze({
    module: 'native-subscriptions',
    environment: EMPTY,
    crons: EMPTY,
  }),
});

function collectEnvironmentFromRegistry(
  modules: readonly ModuleId[],
  registry: Readonly<Record<ModuleId, ModuleCompositionContribution>>,
): readonly EnvironmentContribution[] {
  const byName = new Map<string, EnvironmentContribution>();
  for (const module of modules) {
    for (const contribution of registry[module].environment) {
      const candidate = Object.freeze({ owner: module, ...contribution });
      const previous = byName.get(candidate.name);
      if (previous && previous.defaultValue !== candidate.defaultValue) {
        throw new CompositionError(
          'DUPLICATE_ENVIRONMENT_CONTRIBUTION',
          `Environment variable ${candidate.name} has incompatible defaults from ${previous.owner} and ${module}.`,
        );
      }
      if (!previous) byName.set(candidate.name, candidate);
    }
  }
  return Object.freeze([...byName.values()]);
}

function collectCronsFromRegistry(
  modules: readonly ModuleId[],
  registry: Readonly<Record<ModuleId, ModuleCompositionContribution>>,
): readonly CronContribution[] {
  const byId = new Map<string, CronContribution>();
  for (const module of modules) {
    for (const contribution of registry[module].crons) {
      const candidate = Object.freeze({ owner: module, ...contribution });
      const previous = byId.get(candidate.id);
      if (previous && (previous.path !== candidate.path || previous.schedule !== candidate.schedule)) {
        throw new CompositionError(
          'DUPLICATE_CRON_CONTRIBUTION',
          `Cron ${candidate.id} has incompatible definitions from ${previous.owner} and ${module}.`,
        );
      }
      if (!previous) byId.set(candidate.id, candidate);
    }
  }
  return Object.freeze([...byId.values()]);
}

export function collectModuleContributions(
  requestedModules: readonly ModuleId[],
  overrides: Readonly<Partial<Record<ModuleId, ModuleCompositionContribution>>> = {},
): CompositionModel {
  const modules = resolveModules(requestedModules).resolvedModules;
  const contributions = Object.freeze({ ...MODULE_CONTRIBUTIONS, ...overrides });
  for (const module of modules) {
    if (contributions[module].module !== module) {
      throw new Error(`Composition contribution key ${module} must declare the same module ID.`);
    }
  }
  return Object.freeze({
    modules,
    environment: collectEnvironmentFromRegistry(modules, contributions),
    crons: collectCronsFromRegistry(modules, contributions),
  });
}

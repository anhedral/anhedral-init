import {
  APP_MODULES,
  FEATURE_MODULES,
  isModuleId,
  type ModuleId,
  type ModuleKind,
} from './modules.js';

/**
 * Public, product-oriented selectors for the role-based module graph.
 *
 * Module IDs remain stable in manifests and ownership records. Product IDs are
 * the CLI vocabulary and the extension point for offering alternative
 * technologies within the same stack category.
 */
export const STACK_PRODUCTS = [
  {
    id: 'next',
    category: 'web',
    module: 'web',
    kind: 'app',
    default: true,
    description: 'Next.js App Router web application',
  },
  {
    id: 'expo',
    category: 'mobile',
    module: 'mobile',
    kind: 'app',
    default: true,
    description: 'Expo Router application for iOS, Android, and web',
  },
  {
    id: 'fastify',
    category: 'api',
    module: 'api',
    kind: 'app',
    default: true,
    description: 'Fastify HTTP API',
  },
  {
    id: 'electron',
    category: 'desktop',
    module: 'desktop',
    kind: 'app',
    default: true,
    description: 'Electron desktop application',
  },
  {
    id: 'wxt',
    category: 'extension',
    module: 'extension',
    kind: 'app',
    default: true,
    description: 'WXT browser extension',
  },
  {
    id: 'neon',
    category: 'database',
    module: 'db',
    kind: 'feature',
    default: true,
    description: 'Neon Postgres with Drizzle ORM',
  },
  {
    id: 'clerk',
    category: 'auth',
    module: 'auth',
    kind: 'feature',
    default: true,
    description: 'Clerk identity and sessions; adds Fastify + Neon',
  },
  {
    id: 'ably',
    category: 'realtime',
    module: 'realtime',
    kind: 'feature',
    default: true,
    description: 'Ably authenticated Pub/Sub; adds Clerk',
  },
  {
    id: 'revenuecat',
    category: 'billing',
    module: 'billing',
    kind: 'feature',
    default: true,
    description: 'RevenueCat subscription authority with Stripe checkout; adds Ably',
  },
  {
    id: 'r2',
    category: 'storage',
    module: 'storage',
    kind: 'feature',
    default: true,
    description: 'Cloudflare R2 private object storage; adds Clerk',
  },
  {
    id: 'revenuecat-native',
    category: 'native-subscriptions',
    module: 'native-subscriptions',
    kind: 'feature',
    default: true,
    description: 'RevenueCat native subscription client; adds Expo + RevenueCat',
  },
  {
    id: 'electron-updater',
    category: 'desktop-updater',
    module: 'electron-updater',
    kind: 'feature',
    default: true,
    description: 'electron-updater private release channel; adds Electron',
  },
] as const satisfies readonly {
  readonly id: string;
  readonly category: string;
  readonly module: ModuleId;
  readonly kind: ModuleKind;
  readonly default: boolean;
  readonly description: string;
}[];

export type StackProduct = (typeof STACK_PRODUCTS)[number];
export type StackProductId = StackProduct['id'];
export type StackCategory = StackProduct['category'];
export type AppProductId = Extract<StackProduct, { kind: 'app' }>['id'];
export type FeatureProductId = Extract<StackProduct, { kind: 'feature' }>['id'];

export const APP_PRODUCTS = STACK_PRODUCTS
  .filter((product) => product.kind === 'app')
  .map((product) => product.id) as readonly AppProductId[];

export const FEATURE_PRODUCTS = STACK_PRODUCTS
  .filter((product) => product.kind === 'feature')
  .map((product) => product.id) as readonly FeatureProductId[];

export const DEFAULT_STACK_PRODUCTS = STACK_PRODUCTS
  .filter((product) => product.default);

const PRODUCT_BY_ID = new Map<string, StackProduct>(
  STACK_PRODUCTS.map((product) => [product.id, product]),
);
const DEFAULT_PRODUCT_BY_MODULE = new Map<ModuleId, StackProductId>(
  DEFAULT_STACK_PRODUCTS.map((product) => [product.module, product.id]),
);

export function isStackProductId(value: unknown): value is StackProductId {
  return typeof value === 'string' && PRODUCT_BY_ID.has(value);
}

export function moduleIdForStackSelection(value: string): ModuleId | null {
  const product = PRODUCT_BY_ID.get(value);
  if (product) return product.module;

  // Pre-1.0 compatibility: old role-oriented names still parse, but all
  // documentation and interactive flows emit product IDs.
  return isModuleId(value) ? value : null;
}

export function productIdForModule(moduleId: ModuleId): StackProductId {
  const productId = DEFAULT_PRODUCT_BY_MODULE.get(moduleId);
  if (!productId) throw new Error(`No default stack product is registered for module ${moduleId}`);
  return productId;
}

export function productIdsForModules(modules: readonly ModuleId[]): readonly StackProductId[] {
  return Object.freeze(modules.map(productIdForModule));
}

function assertProductCatalog(): void {
  const productIds = new Set<string>();
  for (const product of STACK_PRODUCTS) {
    if (productIds.has(product.id)) throw new Error(`Duplicate stack product: ${product.id}`);
    productIds.add(product.id);
  }

  const coveredModules = new Set(STACK_PRODUCTS.map((product) => product.module));
  const missing = [...APP_MODULES, ...FEATURE_MODULES].filter((moduleId) => !coveredModules.has(moduleId));
  if (missing.length > 0) throw new Error(`Stack products are missing modules: ${missing.join(', ')}`);

  const defaultCounts = new Map<ModuleId, number>();
  for (const product of DEFAULT_STACK_PRODUCTS) {
    defaultCounts.set(product.module, (defaultCounts.get(product.module) ?? 0) + 1);
  }
  const invalidDefaults = [...APP_MODULES, ...FEATURE_MODULES]
    .filter((moduleId) => defaultCounts.get(moduleId) !== 1);
  if (invalidDefaults.length > 0) {
    throw new Error(`Stack modules must have exactly one default product: ${invalidDefaults.join(', ')}`);
  }
}

assertProductCatalog();

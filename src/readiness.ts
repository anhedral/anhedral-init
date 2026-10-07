import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CAPABILITY_REGISTRY, resolveStandardProducts } from './capabilities.js';
import { STANDARD_PRODUCTS, type StandardProduct } from './standard-products.js';

export function inspectProject(root: string) {
  const checks: { id: string; ok: boolean; detail: string }[] = [];
  const record = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });
  const read = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  record('lockfile', existsSync(path.join(root, 'pnpm-lock.yaml')), 'Committed dependency resolution required');
  try {
    const plan = read('anhedral.setup.json');
    validateSetupPlan(plan);
    const standard = read('anhedral.standard.json');
    const layout = plan.layout ?? 'workspace';
    record('foundation', layout === 'single' ? existsSync(path.join(root, 'package.json')) && existsSync(path.join(root, 'src/index.ts')) : existsSync(path.join(root, 'pnpm-workspace.yaml')), layout === 'single' ? 'Standalone Hono application' : 'pnpm workspace manifest');
    record('setup-plan', true, `Requirements recorded by CLI ${plan.cliVersion}`);
    record('cli-compatibility', plan.cliVersion === CAPABILITY_REGISTRY.cliVersion, 'Use the project CLI version or review upgrade differences');
    record('selection', standard.schemaVersion === 1 && JSON.stringify(standard.products) === JSON.stringify(plan.products) && standard.hosting === (plan.products.includes('next') ? plan.hosting : null) && (standard.layout ?? 'workspace') === layout, 'Setup plan matches project selection');
  } catch {
    record('setup-plan', false, 'Missing, invalid or unsupported setup plan; inspect the project before changing it');
  }
  return { schemaVersion: 1, root, checks, localReady: checks.every((check) => check.ok), providerVerification: 'unverified', productionReady: false };
}

export function validateSetupPlan(plan: unknown): asserts plan is { schemaVersion: 1; cliVersion: string; registryVersion: 1; products: StandardProduct[]; hosting: 'cloudflare' | 'vercel'; layout?: 'workspace' | 'single' } {
  if (!plan || typeof plan !== 'object') throw new Error('Invalid setup plan.');
  const value = plan as Record<string, unknown>;
  if (value.schemaVersion !== 1 || value.registryVersion !== 1 || typeof value.cliVersion !== 'string') throw new Error('Unsupported setup plan version.');
  if (!Array.isArray(value.products) || !value.products.length || !value.products.every((id) => STANDARD_PRODUCTS.includes(id))) throw new Error('Unknown setup capabilities.');
  if (value.hosting !== 'cloudflare' && value.hosting !== 'vercel') throw new Error('Invalid hosting.');
  if (value.layout !== undefined && value.layout !== 'workspace' && value.layout !== 'single') throw new Error('Invalid layout.');
  if (value.layout === 'single' && (value.products.length !== 1 || value.products[0] !== 'hono')) throw new Error('Unsupported standalone recipe.');
  validateRequirements(value.setup, value.products);
  const selected = new Set<StandardProduct>(value.products);
  resolveStandardProducts(selected, value.hosting, false);
  if (selected.size !== value.products.length) throw new Error('Invalid or incomplete setup selection.');
}

function validateRequirements(setup: unknown, products: string[]): void {
  if (!setup || typeof setup !== 'object') throw new Error('Missing setup requirements.');
  const value = setup as Record<string, unknown>;
  if (value.resourcesProvisioned !== false || !Array.isArray(value.capabilities) || value.capabilities.length !== products.length) throw new Error('Invalid capability requirements.');
  const ids = value.capabilities.map((item) => validateCapability(item));
  if (new Set(ids).size !== products.length || !products.every((id) => ids.includes(id))) throw new Error('Capability selection mismatch.');
}

function validateCapability(item: unknown): string {
  if (!item || typeof item !== 'object') throw new Error('Invalid capability.');
  const value = item as Record<string, unknown>;
  if (typeof value.id !== 'string' || typeof value.purpose !== 'string' || !['planned', 'starter'].includes(String(value.status))) throw new Error('Invalid capability metadata.');
  for (const key of ['tools', 'access', 'credentials', 'resources', 'verify']) {
    if (!Array.isArray(value[key]) || !value[key].every((entry) => typeof entry === 'string')) throw new Error('Invalid requirement fields.');
  }
  return value.id;
}

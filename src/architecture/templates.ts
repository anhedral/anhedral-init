import type { ModuleId } from './modules.js';

export const TEMPLATE_IDS = [
  'web-next',
  'mobile-expo',
  'api-fastify',
  'desktop-electron',
  'extension-wxt',
  'db-drizzle',
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type TemplateProvenance = {
  readonly version: number;
  readonly sha256: string;
};

export type TemplateProvenanceMap = Readonly<Partial<Record<TemplateId, TemplateProvenance>>>;

const TEMPLATE_ID_SET = new Set<string>(TEMPLATE_IDS);

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && TEMPLATE_ID_SET.has(value);
}

export function templateIdsForModules(modules: readonly ModuleId[]): readonly TemplateId[] {
  const selected = new Set(modules);
  return Object.freeze([
    selected.has('web') ? 'web-next' : null,
    selected.has('mobile') ? 'mobile-expo' : null,
    selected.has('api') ? 'api-fastify' : null,
    selected.has('desktop') ? 'desktop-electron' : null,
    selected.has('extension') ? 'extension-wxt' : null,
    selected.has('db') ? 'db-drizzle' : null,
  ].filter((id): id is TemplateId => id !== null));
}

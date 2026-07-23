export const APP_MODULES = [
  'web',
  'mobile',
  'api',
  'desktop',
  'extension',
] as const;

export const FEATURE_MODULES = [
  'db',
  'auth',
  'billing',
  'storage',
  'native-subscriptions',
  'electron-updater',
] as const;

export const MODULE_IDS = [...APP_MODULES, ...FEATURE_MODULES] as const;

export type AppModule = (typeof APP_MODULES)[number];
export type FeatureModule = (typeof FEATURE_MODULES)[number];
export type ModuleId = (typeof MODULE_IDS)[number];
export type ModuleKind = 'app' | 'feature';

export type ModuleDefinition = {
  readonly id: ModuleId;
  readonly kind: ModuleKind;
  readonly requires: readonly ModuleId[];
  readonly conflicts: readonly ModuleId[];
};

export type ModuleRegistry = Readonly<Record<ModuleId, ModuleDefinition>>;

export type DependencyEdge = {
  readonly module: ModuleId;
  readonly requires: ModuleId;
};

export type ModuleResolution = {
  readonly requestedModules: readonly ModuleId[];
  readonly resolvedModules: readonly ModuleId[];
  readonly dependencyAddedModules: readonly ModuleId[];
  readonly dependencyEdges: readonly DependencyEdge[];
};

export type ModuleRegistryErrorCode =
  | 'DUPLICATE_MODULE_DEFINITION'
  | 'MISSING_MODULE_DEFINITION'
  | 'UNKNOWN_MODULE_REFERENCE'
  | 'SELF_DEPENDENCY'
  | 'SELF_CONFLICT'
  | 'DEPENDENCY_CYCLE';

export class ModuleRegistryError extends Error {
  constructor(
    readonly code: ModuleRegistryErrorCode,
    message: string,
    readonly modules: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ModuleRegistryError';
  }
}

export type ModuleResolutionErrorCode = 'UNKNOWN_MODULE' | 'MODULE_CONFLICT';

export class ModuleResolutionError extends Error {
  constructor(
    readonly code: ModuleResolutionErrorCode,
    message: string,
    readonly modules: readonly string[],
  ) {
    super(message);
    this.name = 'ModuleResolutionError';
  }
}

const MODULE_ID_SET = new Set<string>(MODULE_IDS);
const MODULE_ORDER = new Map<string, number>(MODULE_IDS.map((id, index) => [id, index]));

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && MODULE_ID_SET.has(value);
}

function compareModules(left: ModuleId, right: ModuleId): number {
  return (MODULE_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (MODULE_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER);
}

function normalizeModuleList(values: readonly ModuleId[]): readonly ModuleId[] {
  return Object.freeze([...new Set(values)].sort(compareModules));
}

function freezeDefinition(definition: ModuleDefinition): ModuleDefinition {
  return Object.freeze({
    id: definition.id,
    kind: definition.kind,
    requires: normalizeModuleList(definition.requires),
    conflicts: normalizeModuleList(definition.conflicts),
  });
}

function assertNoDependencyCycles(registry: ModuleRegistry): void {
  const visited = new Set<ModuleId>();
  const active = new Set<ModuleId>();
  const stack: ModuleId[] = [];

  const visit = (moduleId: ModuleId): void => {
    if (visited.has(moduleId)) return;

    if (active.has(moduleId)) {
      const cycleStart = stack.indexOf(moduleId);
      const cycle = [...stack.slice(cycleStart), moduleId];
      throw new ModuleRegistryError(
        'DEPENDENCY_CYCLE',
        `Module dependency cycle detected: ${cycle.join(' -> ')}`,
        Object.freeze(cycle),
      );
    }

    active.add(moduleId);
    stack.push(moduleId);
    for (const required of registry[moduleId].requires) visit(required);
    stack.pop();
    active.delete(moduleId);
    visited.add(moduleId);
  };

  for (const moduleId of MODULE_IDS) visit(moduleId);
}

export function createModuleRegistry(definitions: readonly ModuleDefinition[]): ModuleRegistry {
  const registry: Partial<Record<ModuleId, ModuleDefinition>> = {};

  for (const definition of definitions) {
    if (!isModuleId(definition.id)) {
      throw new ModuleRegistryError(
        'UNKNOWN_MODULE_REFERENCE',
        `Unknown module definition: ${String(definition.id)}`,
        Object.freeze([String(definition.id)]),
      );
    }

    if (registry[definition.id]) {
      throw new ModuleRegistryError(
        'DUPLICATE_MODULE_DEFINITION',
        `Duplicate module definition: ${definition.id}`,
        Object.freeze([definition.id]),
      );
    }

    for (const required of definition.requires) {
      if (!isModuleId(required)) {
        throw new ModuleRegistryError(
          'UNKNOWN_MODULE_REFERENCE',
          `Module ${definition.id} requires unknown module ${String(required)}`,
          Object.freeze([definition.id, String(required)]),
        );
      }
      if (required === definition.id) {
        throw new ModuleRegistryError(
          'SELF_DEPENDENCY',
          `Module ${definition.id} cannot require itself`,
          Object.freeze([definition.id]),
        );
      }
    }

    for (const conflict of definition.conflicts) {
      if (!isModuleId(conflict)) {
        throw new ModuleRegistryError(
          'UNKNOWN_MODULE_REFERENCE',
          `Module ${definition.id} conflicts with unknown module ${String(conflict)}`,
          Object.freeze([definition.id, String(conflict)]),
        );
      }
      if (conflict === definition.id) {
        throw new ModuleRegistryError(
          'SELF_CONFLICT',
          `Module ${definition.id} cannot conflict with itself`,
          Object.freeze([definition.id]),
        );
      }
    }

    registry[definition.id] = freezeDefinition(definition);
  }

  const missing = MODULE_IDS.filter((moduleId) => !registry[moduleId]);
  if (missing.length > 0) {
    throw new ModuleRegistryError(
      'MISSING_MODULE_DEFINITION',
      `Missing module definitions: ${missing.join(', ')}`,
      Object.freeze(missing),
    );
  }

  const completeRegistry = Object.freeze(registry) as ModuleRegistry;
  assertNoDependencyCycles(completeRegistry);
  return completeRegistry;
}

const DEFAULT_MODULE_DEFINITION_INPUTS: readonly ModuleDefinition[] = [
  { id: 'web', kind: 'app', requires: [], conflicts: [] },
  { id: 'mobile', kind: 'app', requires: [], conflicts: [] },
  { id: 'api', kind: 'app', requires: [], conflicts: [] },
  { id: 'desktop', kind: 'app', requires: [], conflicts: [] },
  { id: 'extension', kind: 'app', requires: [], conflicts: [] },
  { id: 'db', kind: 'feature', requires: [], conflicts: [] },
  { id: 'auth', kind: 'feature', requires: ['api', 'db'], conflicts: [] },
  { id: 'billing', kind: 'feature', requires: ['auth'], conflicts: [] },
  { id: 'storage', kind: 'feature', requires: ['auth'], conflicts: [] },
  { id: 'native-subscriptions', kind: 'feature', requires: ['mobile', 'billing'], conflicts: [] },
  { id: 'electron-updater', kind: 'feature', requires: ['desktop'], conflicts: [] },
];

export const DEFAULT_MODULE_DEFINITIONS: readonly ModuleDefinition[] = Object.freeze(
  DEFAULT_MODULE_DEFINITION_INPUTS.map(freezeDefinition),
);

export const DEFAULT_MODULE_REGISTRY = createModuleRegistry(DEFAULT_MODULE_DEFINITIONS);

export function resolveModules(
  requested: readonly string[],
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY,
): ModuleResolution {
  const unknown = [...new Set(requested.filter((moduleId) => !isModuleId(moduleId)))].sort();
  if (unknown.length > 0) {
    throw new ModuleResolutionError(
      'UNKNOWN_MODULE',
      `Unknown modules: ${unknown.join(', ')}`,
      Object.freeze(unknown),
    );
  }

  const requestedModules = normalizeModuleList(requested as readonly ModuleId[]);
  const resolved = new Set<ModuleId>();
  const visiting = new Set<ModuleId>();
  const ordered: ModuleId[] = [];

  const visit = (moduleId: ModuleId): void => {
    if (resolved.has(moduleId)) return;
    if (visiting.has(moduleId)) {
      throw new ModuleRegistryError(
        'DEPENDENCY_CYCLE',
        `Module dependency cycle reached while resolving ${moduleId}`,
        Object.freeze([moduleId]),
      );
    }

    visiting.add(moduleId);
    for (const required of registry[moduleId].requires) visit(required);
    visiting.delete(moduleId);
    resolved.add(moduleId);
    ordered.push(moduleId);
  };

  for (const moduleId of requestedModules) visit(moduleId);

  const conflictPairs = new Set<string>();
  for (const moduleId of ordered) {
    for (const conflict of registry[moduleId].conflicts) {
      if (!resolved.has(conflict)) continue;
      const pair = [moduleId, conflict].sort(compareModules) as [ModuleId, ModuleId];
      conflictPairs.add(`${pair[0]}\0${pair[1]}`);
    }
  }

  if (conflictPairs.size > 0) {
    const conflicts = [...conflictPairs]
      .map((pair) => pair.split('\0') as [ModuleId, ModuleId])
      .sort(([leftA, leftB], [rightA, rightB]) => compareModules(leftA, rightA) || compareModules(leftB, rightB));
    const modules = Object.freeze([...new Set(conflicts.flat())].sort(compareModules));
    throw new ModuleResolutionError(
      'MODULE_CONFLICT',
      `Conflicting modules: ${conflicts.map(([left, right]) => `${left} + ${right}`).join(', ')}`,
      modules,
    );
  }

  // Resolution must have one stable representation regardless of whether a
  // dependency was requested directly or discovered while walking another
  // module. Without this final normalization, adding a module to an existing
  // project could produce a different manifest order than creating the same
  // topology directly (for example, adding electron-updater after db/auth).
  const resolvedModules = normalizeModuleList(ordered);
  const requestedSet = new Set(requestedModules);
  const dependencyAddedModules = resolvedModules.filter((moduleId) => !requestedSet.has(moduleId));
  const dependencyEdges = resolvedModules.flatMap((moduleId) => registry[moduleId].requires
    .filter((required) => resolved.has(required))
    .map((required) => Object.freeze({ module: moduleId, requires: required })));

  return Object.freeze({
    requestedModules,
    resolvedModules,
    dependencyAddedModules: Object.freeze(dependencyAddedModules),
    dependencyEdges: Object.freeze(dependencyEdges),
  });
}

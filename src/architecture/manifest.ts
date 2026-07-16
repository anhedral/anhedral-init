import {
  DEFAULT_MODULE_REGISTRY,
  isModuleId,
  resolveModules,
  type ModuleId,
  type ModuleRegistry,
} from './modules.js';
import {
  isFileOwnershipClass,
  isSha256,
  normalizePlanPath,
  type FileOwner,
  type FileOwnershipClass,
  type GenerationPlan,
} from './plan.js';
import {
  isTemplateId,
  templateIdsForModules,
  type TemplateId,
  type TemplateProvenance,
  type TemplateProvenanceMap,
} from './templates.js';
import {
  isNativeStylingLibrary,
  isUiProvider,
  isUiTarget,
  normalizeUiComponentName,
  providerForTarget,
  uiInstallKey,
  type NativeStylingLibrary,
  type UiComponentInstall,
} from '../ui.js';

export const MANIFEST_SCHEMA_VERSION = 5 as const;

export type ManifestToolchain = 'stable' | 'latest';

export type ManifestFileRecord = {
  readonly owner: FileOwner;
  readonly ownership: FileOwnershipClass;
  readonly hash: string;
  /** Normalized Unix permission bits (0o000-0o777), or null on platforms without portable modes. */
  readonly mode: number | null;
};

export type ProjectManifest = {
  readonly schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  readonly generatorVersion: string;
  readonly project: {
    readonly name: string;
    readonly displayName: string;
  };
  /** The complete, canonically ordered module dependency closure. */
  readonly modules: readonly ModuleId[];
  readonly toolchain: ManifestToolchain;
  /** Immutable template catalog entries used to seed the generated workspace. */
  readonly templates: TemplateProvenanceMap;
  readonly ui: {
    readonly nativeStyling: NativeStylingLibrary;
    readonly components: readonly UiComponentInstall[];
  };
  readonly files: Readonly<Record<string, ManifestFileRecord>>;
};

export type CreateManifestInput = {
  readonly generatorVersion: string;
  readonly project: {
    readonly name: string;
    readonly displayName: string;
  };
  readonly plan: GenerationPlan;
  readonly toolchain: ManifestToolchain;
  readonly templates: TemplateProvenanceMap;
  readonly nativeStyling?: NativeStylingLibrary;
  readonly components?: readonly UiComponentInstall[];
  readonly registry?: ModuleRegistry;
};

export type ManifestValidationErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_MANIFEST'
  | 'INVALID_SCHEMA_VERSION'
  | 'FUTURE_SCHEMA_VERSION'
  | 'UNKNOWN_MODULE'
  | 'DUPLICATE_MODULE'
  | 'INVALID_MODULE_CLOSURE'
  | 'INVALID_FILE_RECORD';

export class ManifestValidationError extends Error {
  constructor(
    readonly code: ManifestValidationErrorCode,
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = 'ManifestValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ManifestValidationError('INVALID_MANIFEST', `${path} must be a non-empty string`, path);
  }
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
  code: ManifestValidationErrorCode = 'INVALID_MANIFEST',
): void {
  const expectedKeys = new Set(expected);
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  const unknown = actual.filter((key) => !expectedKeys.has(key));
  if (missing.length === 0 && unknown.length === 0) return;

  const details = [
    missing.length > 0 ? `missing ${missing.join(', ')}` : null,
    unknown.length > 0 ? `unknown ${unknown.join(', ')}` : null,
  ].filter((entry): entry is string => entry !== null).join('; ');
  throw new ManifestValidationError(code, `${path} has invalid fields (${details})`, path);
}

function parseModuleArray(value: unknown): readonly ModuleId[] {
  if (!Array.isArray(value)) {
    throw new ManifestValidationError('INVALID_MANIFEST', 'modules must be an array', 'modules');
  }

  const seen = new Set<ModuleId>();
  const modules: ModuleId[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isModuleId(entry)) {
      throw new ManifestValidationError(
        'UNKNOWN_MODULE',
        `modules[${index}] is not a supported module: ${String(entry)}`,
        `modules[${index}]`,
      );
    }
    if (seen.has(entry)) {
      throw new ManifestValidationError('DUPLICATE_MODULE', `modules contains duplicate module ${entry}`, 'modules');
    }
    seen.add(entry);
    modules.push(entry);
  }
  return Object.freeze(modules);
}

function assertExactModuleClosure(modules: readonly ModuleId[], registry: ModuleRegistry): void {
  let expected: readonly ModuleId[];
  try {
    expected = resolveModules(modules, registry).resolvedModules;
  } catch (error) {
    throw new ManifestValidationError(
      'INVALID_MANIFEST',
      error instanceof Error ? error.message : 'Manifest modules are invalid',
      'modules',
    );
  }

  if (expected.length !== modules.length || expected.some((moduleId, index) => modules[index] !== moduleId)) {
    throw new ManifestValidationError(
      'INVALID_MODULE_CLOSURE',
      `modules must be the complete, canonically ordered dependency closure: ${expected.join(', ')}`,
      'modules',
    );
  }
}

function readFileRecord(
  value: unknown,
  path: string,
  modules: ReadonlySet<ModuleId>,
): ManifestFileRecord {
  if (!isRecord(value)) {
    throw new ManifestValidationError('INVALID_FILE_RECORD', `${path} must be an object`, path);
  }
  assertExactKeys(value, ['owner', 'ownership', 'hash', 'mode'], path, 'INVALID_FILE_RECORD');

  const owner = value.owner;
  if (owner !== 'root' && !isModuleId(owner)) {
    throw new ManifestValidationError('INVALID_FILE_RECORD', `${path}.owner is invalid`, `${path}.owner`);
  }
  if (owner !== 'root' && !modules.has(owner)) {
    throw new ManifestValidationError(
      'INVALID_FILE_RECORD',
      `${path}.owner references an unselected module: ${owner}`,
      `${path}.owner`,
    );
  }

  if (!isFileOwnershipClass(value.ownership)) {
    throw new ManifestValidationError('INVALID_FILE_RECORD', `${path}.ownership is invalid`, `${path}.ownership`);
  }
  if (!isSha256(value.hash)) {
    throw new ManifestValidationError('INVALID_FILE_RECORD', `${path}.hash must be a SHA-256 hex digest`, `${path}.hash`);
  }

  const mode = value.mode;
  if (mode !== null && (!Number.isInteger(mode) || (mode as number) < 0 || (mode as number) > 0o777)) {
    throw new ManifestValidationError(
      'INVALID_FILE_RECORD',
      `${path}.mode must be null or normalized Unix permission bits between 0 and 511`,
      `${path}.mode`,
    );
  }

  return Object.freeze({
    owner,
    ownership: value.ownership as FileOwnershipClass,
    hash: value.hash,
    mode: mode as number | null,
  });
}

function readFiles(
  value: unknown,
  modules: readonly ModuleId[],
): Readonly<Record<string, ManifestFileRecord>> {
  if (!isRecord(value)) {
    throw new ManifestValidationError('INVALID_MANIFEST', 'files must be an object', 'files');
  }

  const moduleSet = new Set(modules);
  const entries: Array<[string, ManifestFileRecord]> = [];
  for (const rawPath of Object.keys(value).sort()) {
    let filePath: string;
    try {
      filePath = normalizePlanPath(rawPath);
    } catch {
      throw new ManifestValidationError('INVALID_FILE_RECORD', `Invalid manifest file path: ${rawPath}`, `files.${rawPath}`);
    }
    if (filePath !== rawPath) {
      throw new ManifestValidationError('INVALID_FILE_RECORD', `Manifest file path is not canonical: ${rawPath}`, `files.${rawPath}`);
    }
    entries.push([filePath, readFileRecord(value[rawPath], `files.${rawPath}`, moduleSet)]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function readTemplates(value: unknown, modules: readonly ModuleId[]): TemplateProvenanceMap {
  if (!isRecord(value)) {
    throw new ManifestValidationError('INVALID_MANIFEST', 'templates must be an object', 'templates');
  }
  const entries: Array<[TemplateId, TemplateProvenance]> = [];
  const expectedIds = [...templateIdsForModules(modules)].sort();
  const actualIds = Object.keys(value).sort();
  if (
    expectedIds.length !== actualIds.length
    || expectedIds.some((id, index) => id !== actualIds[index])
  ) {
    throw new ManifestValidationError(
      'INVALID_MANIFEST',
      `templates must exactly match selected modules: ${expectedIds.join(', ')}`,
      'templates',
    );
  }
  for (const id of Object.keys(value).sort()) {
    if (!isTemplateId(id)) {
      throw new ManifestValidationError('INVALID_MANIFEST', `Unknown template: ${id}`, `templates.${id}`);
    }
    const entry = value[id];
    if (!isRecord(entry)) {
      throw new ManifestValidationError('INVALID_MANIFEST', `templates.${id} must be an object`, `templates.${id}`);
    }
    assertExactKeys(entry, ['version', 'sha256'], `templates.${id}`);
    if (!Number.isInteger(entry.version) || (entry.version as number) < 1) {
      throw new ManifestValidationError(
        'INVALID_MANIFEST',
        `templates.${id}.version must be a positive integer`,
        `templates.${id}.version`,
      );
    }
    if (!isSha256(entry.sha256)) {
      throw new ManifestValidationError(
        'INVALID_MANIFEST',
        `templates.${id}.sha256 must be a SHA-256 hex digest`,
        `templates.${id}.sha256`,
      );
    }
    entries.push([id, Object.freeze({ version: entry.version as number, sha256: entry.sha256 })]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function readUi(value: unknown, modules: readonly ModuleId[]): ProjectManifest['ui'] {
  if (!isRecord(value)) {
    throw new ManifestValidationError('INVALID_MANIFEST', 'ui must be an object', 'ui');
  }
  assertExactKeys(value, ['nativeStyling', 'components'], 'ui');
  if (!isNativeStylingLibrary(value.nativeStyling)) {
    throw new ManifestValidationError('INVALID_MANIFEST', 'ui.nativeStyling must be nativewind or uniwind', 'ui.nativeStyling');
  }
  if (!Array.isArray(value.components)) {
    throw new ManifestValidationError('INVALID_MANIFEST', 'ui.components must be an array', 'ui.components');
  }

  const selectedModules = new Set(modules);
  const seen = new Set<string>();
  const components: UiComponentInstall[] = [];
  for (let index = 0; index < value.components.length; index += 1) {
    const itemPath = `ui.components[${index}]`;
    const item = value.components[index];
    if (!isRecord(item)) {
      throw new ManifestValidationError('INVALID_MANIFEST', `${itemPath} must be an object`, itemPath);
    }
    assertExactKeys(item, ['name', 'target', 'provider', 'source', 'variant'], itemPath);
    let name: string;
    try {
      name = normalizeUiComponentName(readNonEmptyString(item.name, `${itemPath}.name`));
    } catch (error) {
      throw new ManifestValidationError(
        'INVALID_MANIFEST',
        error instanceof Error ? error.message : `${itemPath}.name is invalid`,
        `${itemPath}.name`,
      );
    }
    if (!isUiTarget(item.target) || !selectedModules.has(item.target)) {
      throw new ManifestValidationError('INVALID_MANIFEST', `${itemPath}.target is not a selected UI client`, `${itemPath}.target`);
    }
    if (!isUiProvider(item.provider) || item.provider !== providerForTarget(item.target)) {
      throw new ManifestValidationError('INVALID_MANIFEST', `${itemPath}.provider does not match its target`, `${itemPath}.provider`);
    }
    const source = readNonEmptyString(item.source, `${itemPath}.source`);
    const variant = item.variant;
    if (item.target === 'mobile') {
      if (!isNativeStylingLibrary(variant) || variant !== value.nativeStyling) {
        throw new ManifestValidationError('INVALID_MANIFEST', `${itemPath}.variant must match ui.nativeStyling`, `${itemPath}.variant`);
      }
    } else if (variant !== null) {
      throw new ManifestValidationError('INVALID_MANIFEST', `${itemPath}.variant must be null for DOM clients`, `${itemPath}.variant`);
    }
    const install = Object.freeze({ name, target: item.target, provider: item.provider, source, variant }) as UiComponentInstall;
    const key = uiInstallKey(install);
    if (seen.has(key)) {
      throw new ManifestValidationError('INVALID_MANIFEST', `Duplicate UI component installation: ${key}`, itemPath);
    }
    seen.add(key);
    components.push(install);
  }

  const canonical = [...components].sort((left, right) => uiInstallKey(left).localeCompare(uiInstallKey(right)));
  if (canonical.some((component, index) => component !== components[index])) {
    throw new ManifestValidationError('INVALID_MANIFEST', 'ui.components must be canonically sorted', 'ui.components');
  }
  return Object.freeze({ nativeStyling: value.nativeStyling, components: Object.freeze(components) });
}

function parseInput(input: string | unknown): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input) as unknown;
  } catch (error) {
    throw new ManifestValidationError(
      'INVALID_JSON',
      `Manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      '$',
    );
  }
}

export function readManifest(
  input: string | unknown,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY,
): ProjectManifest {
  const value = parseInput(input);
  if (!isRecord(value)) {
    throw new ManifestValidationError('INVALID_MANIFEST', 'Manifest must be an object', '$');
  }

  const schemaVersion = value.schemaVersion;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new ManifestValidationError(
      'INVALID_SCHEMA_VERSION',
      `schemaVersion must be exactly ${MANIFEST_SCHEMA_VERSION}`,
      'schemaVersion',
    );
  }
  if (schemaVersion > MANIFEST_SCHEMA_VERSION) {
    throw new ManifestValidationError(
      'FUTURE_SCHEMA_VERSION',
      `Manifest schema ${schemaVersion} is newer than supported schema ${MANIFEST_SCHEMA_VERSION}`,
      'schemaVersion',
    );
  }
  if (schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new ManifestValidationError(
      'INVALID_SCHEMA_VERSION',
      `Unsupported manifest schema: ${schemaVersion}; expected ${MANIFEST_SCHEMA_VERSION}`,
      'schemaVersion',
    );
  }

  assertExactKeys(
    value,
    ['schemaVersion', 'generatorVersion', 'project', 'modules', 'toolchain', 'templates', 'ui', 'files'],
    '$',
  );
  if (!isRecord(value.project)) {
    throw new ManifestValidationError('INVALID_MANIFEST', 'project must be an object', 'project');
  }
  assertExactKeys(value.project, ['name', 'displayName'], 'project');
  const project = Object.freeze({
    name: readNonEmptyString(value.project.name, 'project.name'),
    displayName: readNonEmptyString(value.project.displayName, 'project.displayName'),
  });

  const modules = parseModuleArray(value.modules);
  assertExactModuleClosure(modules, registry);
  if (value.toolchain !== 'stable' && value.toolchain !== 'latest') {
    throw new ManifestValidationError(
      'INVALID_MANIFEST',
      'toolchain must be either stable or latest',
      'toolchain',
    );
  }

  return Object.freeze({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatorVersion: readNonEmptyString(value.generatorVersion, 'generatorVersion'),
    project,
    modules,
    toolchain: value.toolchain,
    templates: readTemplates(value.templates, modules),
    ui: readUi(value.ui, modules),
    files: readFiles(value.files, modules),
  });
}

export function createManifest(input: CreateManifestInput): ProjectManifest {
  const files = Object.fromEntries(input.plan.files.map((file) => [
    file.path,
    {
      owner: file.owner,
      ownership: file.ownership,
      hash: file.contentHash,
      mode: null,
    },
  ]));

  return readManifest({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatorVersion: input.generatorVersion,
    project: input.project,
    modules: input.plan.resolvedModules,
    toolchain: input.toolchain,
    templates: input.templates,
    ui: {
      nativeStyling: input.nativeStyling ?? 'nativewind',
      components: input.components ?? [],
    },
    files,
  }, input.registry ?? DEFAULT_MODULE_REGISTRY);
}

export function serializeManifest(manifest: ProjectManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

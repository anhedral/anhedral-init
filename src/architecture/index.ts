export {
  DEFAULT_MODULE_DEFINITIONS,
  DEFAULT_MODULE_REGISTRY,
  MODULE_IDS,
  ModuleRegistryError,
  ModuleResolutionError,
  createModuleRegistry,
  isModuleId,
  resolveModules,
} from './modules.js';
export type {
  DependencyEdge,
  ModuleDefinition,
  ModuleId,
  ModuleKind,
  ModuleRegistry,
  ModuleRegistryErrorCode,
  ModuleResolution,
  ModuleResolutionErrorCode,
} from './modules.js';

export {
  FILE_OWNERSHIP_CLASSES,
  PlanBuildError,
  buildGenerationPlan,
  hashContent,
  isFileOwnershipClass,
  isSha256,
  normalizePlanPath,
  writePolicyForOwnership,
} from './plan.js';
export type {
  BuildGenerationPlanInput,
  FileOwner,
  FileOwnershipClass,
  FileWritePolicy,
  GenerationOperation,
  GenerationPlan,
  ModulePlanContribution,
  PlanBuildErrorCode,
  PlanFileInput,
  PlannedFile,
} from './plan.js';

export {
  MANIFEST_SCHEMA_VERSION,
  ManifestValidationError,
  createManifest,
  readManifest,
  serializeManifest,
} from './manifest.js';
export type {
  CreateManifestInput,
  ManifestFileRecord,
  ManifestToolchain,
  ManifestValidationErrorCode,
  ProjectManifest,
} from './manifest.js';

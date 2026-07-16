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

export {
  TEMPLATE_IDS,
  isTemplateId,
  templateIdsForModules,
} from './templates.js';
export type {
  TemplateId,
  TemplateProvenance,
  TemplateProvenanceMap,
} from './templates.js';

export {
  CompositionError,
  collectModuleContributions,
} from './contributions.js';
export type {
  CompositionErrorCode,
  CompositionModel,
  CronContribution,
  EnvironmentContribution,
  ModuleCompositionContribution,
} from './contributions.js';
export type {
  CreateManifestInput,
  ManifestFileRecord,
  ManifestToolchain,
  ManifestValidationErrorCode,
  ProjectManifest,
} from './manifest.js';

export {
  NATIVE_STYLING_LIBRARIES,
  UI_PROVIDERS,
  UI_TARGETS,
  buildUiInstallCommands,
  isNativeStylingLibrary,
  isUiProvider,
  isUiTarget,
  mergeUiInstalls,
  normalizeUiComponentName,
  parseUiComponentList,
  providerForTarget,
  registrySourceFor,
  resolveUiInstalls,
  uiInstallKey,
} from '../ui.js';
export type {
  NativeStylingLibrary,
  UiComponentInstall,
  UiInstallCommand,
  UiProvider,
  UiTarget,
} from '../ui.js';

export {
  APP_MODULES,
  FEATURE_MODULES,
  USAGE,
  buildAddOptions,
  buildOptions,
  deriveDisplayName,
  deriveProjectName,
  normalizeModuleName,
  parseCli,
  parseNewProjectRequest,
  buildOptionsForRoot,
  parseUiAddOptions,
} from './cli.js';
export type { AppModule, FeatureModule, ParsedFlags, SupportedModule } from './cli.js';

export {
  doctorProject,
  isSupportedProjectUpgrade,
  scaffoldAddModules,
  scaffoldProject,
  scaffoldUiComponents,
  scaffoldUpgradeProject,
} from './scaffold.js';
export type {
  AddOptions,
  DoctorIssue,
  DoctorReport,
  InitOptions,
  ProjectOptions,
  UiAddOptions,
  UpgradeOptions,
} from './scaffold.js';

export * from './architecture/index.js';
export {
  BundledTemplateSource,
  assertTemplateProvenance,
  hashTemplateDirectory,
  materializeTemplates,
  templateIdsForModules,
} from './template-source.js';
export type {
  TemplateMaterializeRequest,
  TemplateSource,
} from './template-source.js';
export { GENERATOR_VERSION } from './version.js';

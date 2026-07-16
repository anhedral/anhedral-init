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
  parseUiAddOptions,
} from './cli.js';
export type { AppModule, FeatureModule, ParsedFlags, SupportedModule } from './cli.js';

export {
  doctorProject,
  scaffoldAddModules,
  scaffoldProject,
  scaffoldUiComponents,
} from './scaffold.js';
export type {
  AddOptions,
  DoctorIssue,
  DoctorReport,
  InitOptions,
  ProjectOptions,
  UiAddOptions,
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

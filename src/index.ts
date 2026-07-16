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
} from './cli.js';
export type { AppModule, FeatureModule, ParsedFlags, SupportedModule } from './cli.js';

export {
  doctorProject,
  scaffoldAddModules,
  scaffoldProject,
} from './scaffold.js';
export type {
  AddOptions,
  DoctorIssue,
  DoctorReport,
  InitOptions,
  ProjectOptions,
} from './scaffold.js';

export * from './architecture/index.js';
export { GENERATOR_VERSION } from './version.js';

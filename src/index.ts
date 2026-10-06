export {
  STANDARD_PRODUCTS,
  STANDARD_USAGE,
  parseStandardOptions,
  applyStandardOverlays,
  scaffoldStandardProject,
} from './standard.js';
export type { StandardOptions, StandardProduct, StandardRunner } from './standard.js';
export { GENERATOR_VERSION } from './version.js';
export { CAPABILITIES, CAPABILITY_REGISTRY, createSetupPlan } from './capabilities.js';
export type { Capability } from './capabilities.js';
export { inspectProject, validateSetupPlan } from './readiness.js';

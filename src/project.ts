import type { NativeStylingLibrary } from './ui.js';

export type AppSelections = {
  web: boolean;
  mobile: boolean;
  api: boolean;
  desktop: boolean;
  extension: boolean;
};

export type FeatureSelections = {
  database: boolean;
  auth: boolean;
  billing: boolean;
  storage: boolean;
  nativeSubscriptions: boolean;
  electronUpdater: boolean;
};

/**
 * The project shape consumed by every template.
 *
 * Keep this independent from the scaffold orchestrator so templates depend on
 * the project model, not on the command that happens to create it.
 */
export interface ProjectOptions {
  projectName: string;
  displayName: string;
  apps: AppSelections;
  features: FeatureSelections;
  skipInstall?: boolean;
  nativeStyling?: NativeStylingLibrary;
}

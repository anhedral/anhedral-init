import type { NativeStylingLibrary } from './ui.js';

export type AuthProvider = 'clerk' | 'authjs';
export type AdminMode = 'none' | 'page' | 'app';
export const AUTHJS_UNSUPPORTED_MODULES = [
  'mobile',
  'desktop',
  'extension',
  'realtime',
  'billing',
  'storage',
  'native-subscriptions',
  'electron-updater',
] as const;

export type AppSelections = {
  web: boolean;
  admin: boolean;
  mobile: boolean;
  api: boolean;
  desktop: boolean;
  extension: boolean;
};

export type FeatureSelections = {
  database: boolean;
  auth: boolean;
  realtime: boolean;
  billing: boolean;
  storage: boolean;
  workflows: boolean;
  nativeSubscriptions: boolean;
  electronUpdater: boolean;
};

export type InfrastructureSelections = {
  ubuntu: boolean;
  docker: boolean;
  postgres: boolean;
  nginx: boolean;
  certbot: boolean;
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
  infrastructure?: InfrastructureSelections;
  skipInstall?: boolean;
  nativeStyling?: NativeStylingLibrary;
  authProvider: AuthProvider;
  adminMode: AdminMode;
}

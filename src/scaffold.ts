import { chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import { anhedralPrint } from './print.js';
import { appendGitignore, execFile, writeFile } from './util.js';
import { MOBILE_NODE_ENGINE, NODE_ENGINE, PACKAGE_MANAGER, ROOT_DEPENDENCIES, TOOLCHAIN_DEPENDENCIES } from './dependencies.js';
import { resolveToolchainChannel, type ToolchainChannel } from './toolchain.js';
import { scaffoldApi } from './templates/api.js';
import { r2BucketName, scaffoldAssetsPrivateProxy } from './templates/assets-private-proxy.js';
import { scaffoldDesktop } from './templates/desktop.js';
import {
  desktopUpdatesBucketName,
  scaffoldElectronUpdater,
} from './templates/electron-updater.js';
import { scaffoldExtension } from './templates/extension.js';
import { scaffoldMobile } from './templates/mobile.js';
import { scaffoldSharedPackages } from './templates/shared.js';
import { scaffoldWeb } from './templates/web.js';
import { assertPackageName, markdownHeading } from './render.js';
import { runStagedTransaction } from './transaction.js';
import {
  buildGenerationPlan,
  createManifest,
  hashContent,
  readManifest,
  resolveModules,
  serializeManifest,
  type FileOwnershipClass,
  type ManifestFileRecord,
  type ProjectManifest,
  type ModuleId,
  type ModulePlanContribution,
} from './architecture/index.js';
import { GENERATOR_VERSION } from './version.js';
import { collectModuleContributions } from './architecture/contributions.js';
import { composeRootEnvironment, composeVercelCrons } from './composers/root.js';
import {
  assertTemplateProvenance,
  materializeTemplates,
  type TemplateProvenanceMap,
} from './template-source.js';
import {
  desiredWorkspacePolicy,
  mergeWorkspaceFile,
} from './workspace-config.js';
import {
  UI_TARGETS,
  installUiComponents,
  mergeUiInstalls,
  resolveUiInstalls,
  uiInstallKey,
  type NativeStylingLibrary,
  type UiComponentInstall,
  type UiTarget,
} from './ui.js';

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

export interface InitOptions {
  projectName: string;
  displayName: string;
  modules: ModuleId[];
  skipInstall: boolean;
  dryRun: boolean;
  json: boolean;
  toolchainChannel: ToolchainChannel;
  uiComponents?: string[];
  nativeStyling?: NativeStylingLibrary;
  /** Destination root. Omit to scaffold the current working directory. */
  rootDirectory?: string;
}

type ResolvedInitOptions = InitOptions & {
  apps: AppSelections;
  features: FeatureSelections;
  uiComponents: string[];
  nativeStyling: NativeStylingLibrary;
};

export interface AddOptions {
  modules: ModuleId[];
  skipInstall: boolean;
  dryRun: boolean;
  json: boolean;
  toolchainChannel?: ToolchainChannel;
}

export interface UiAddOptions {
  components: string[];
  targets: UiTarget[];
  skipInstall: boolean;
  dryRun: boolean;
  json: boolean;
}

export interface UpgradeOptions {
  skipInstall: boolean;
  dryRun: boolean;
  json: boolean;
}

export interface ProjectOptions {
  projectName: string;
  displayName: string;
  apps: AppSelections;
  features: FeatureSelections;
  skipInstall?: boolean;
  nativeStyling?: NativeStylingLibrary;
}

export function supportsMobileInstallNode(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major === 22) return minor >= 13;
  if (major === 24) return minor >= 3;
  return major >= 25;
}

function assertInstallNodeCompatibility(options: ResolvedInitOptions): void {
  if (
    options.apps.mobile
    && !options.skipInstall
    && !options.dryRun
    && !supportsMobileInstallNode(process.versions.node)
  ) {
    throw new Error(
      `Installing an Expo mobile workspace requires Node ${MOBILE_NODE_ENGINE}; current Node is ${process.versions.node}. `
      + 'Switch Node versions or rerun with --skip-install.',
    );
  }
}

export type DoctorIssue = {
  path: string;
  severity: 'error' | 'warning';
  message: string;
};

export type DoctorReport = {
  ok: boolean;
  schemaVersion: number;
  generatorVersion: string;
  issues: DoctorIssue[];
};

const ACTIONS = {
  checkout: 'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
  pnpm: 'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271',
  node: 'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
} as const;

const ROOT_MERGEABLE_FILES = new Set([
  '.env.example',
  '.gitignore',
  '.vercelignore',
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  'vercel.json',
]);

const GENERATED_CACHE_NAMES = new Set([
  '.git', '.next', '.output', '.turbo', '.wxt', 'dist', 'node_modules', 'release',
]);

function lstatIfPresent(target: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function pathEntryExists(target: string): boolean {
  return lstatIfPresent(target) !== null;
}

function normalizedFileMode(mode: number | bigint): number | null {
  // Windows exposes a synthetic subset of stat mode bits that cannot represent
  // Unix permissions reliably. Keep the manifest portable by treating those
  // permissions as unknown and disabling ownership checks on that platform.
  return process.platform === 'win32' ? null : Number(mode) & 0o777;
}

function displayFileMode(mode: number): string {
  return `0o${mode.toString(8).padStart(3, '0')}`;
}

function assertManagedFileMode(
  relativePath: string,
  record: ManifestFileRecord,
  actualStat: { readonly mode: number | bigint },
): void {
  if (record.ownership !== 'managed' || record.mode === null) return;
  const actualMode = normalizedFileMode(actualStat.mode);
  if (actualMode === null || actualMode === record.mode) return;
  throw new Error(
    `Managed file mode has user modifications: ${relativePath} `
    + `(expected ${displayFileMode(record.mode)}, found ${displayFileMode(actualMode)}).`,
  );
}

function assertManagedFileModes(root: string, manifest: ProjectManifest): void {
  for (const [relativePath, record] of Object.entries(manifest.files)) {
    if (record.ownership !== 'managed' || record.mode === null) continue;
    const actualStat = lstatIfPresent(path.join(root, relativePath));
    if (!actualStat || !actualStat.isFile() || actualStat.isSymbolicLink()) continue;
    assertManagedFileMode(relativePath, record, actualStat);
  }
}

function isTransactionMetadata(relativePath: string): boolean {
  if (relativePath.includes('/')) return false;
  return relativePath === '.anhedral-txn'
    || relativePath === '.anhedral.lock'
    || relativePath === '.anhedral.lock.reclaim'
    || /^\.anhedral\.lock\..+\.tmp$/.test(relativePath)
    || relativePath === '.anhedral-journal.json'
    || /^\.anhedral-journal\.json\.tmp-.+$/.test(relativePath);
}

function projectOptions(options: ResolvedInitOptions): ProjectOptions {
  return {
    projectName: options.projectName,
    displayName: options.displayName,
    apps: options.apps,
    features: options.features,
    skipInstall: options.skipInstall || options.dryRun,
    nativeStyling: options.nativeStyling,
  };
}

function selectionsFromModules(modules: readonly ModuleId[]): Pick<ResolvedInitOptions, 'apps' | 'features'> {
  const selected = new Set(modules);
  return {
    apps: {
      web: selected.has('web'),
      mobile: selected.has('mobile'),
      api: selected.has('api'),
      desktop: selected.has('desktop'),
      extension: selected.has('extension'),
    },
    features: {
      database: selected.has('db'),
      auth: selected.has('auth'),
      billing: selected.has('billing'),
      storage: selected.has('storage'),
      nativeSubscriptions: selected.has('native-subscriptions'),
      electronUpdater: selected.has('electron-updater'),
    },
  };
}

function canonicalInitOptions(options: InitOptions): ResolvedInitOptions {
  assertPackageName(options.projectName);
  const resolution = resolveModules(options.modules);
  return {
    ...options,
    uiComponents: options.uiComponents ?? [],
    nativeStyling: options.nativeStyling ?? 'nativewind',
    modules: [...resolution.requestedModules],
    ...selectionsFromModules(resolution.resolvedModules),
  };
}

function optionsFromManifest(
  manifest: ProjectManifest,
  addOptions: AddOptions,
  modules: readonly ModuleId[],
): ResolvedInitOptions {
  const resolution = resolveModules(modules);
  return {
    projectName: manifest.project.name,
    displayName: manifest.project.displayName,
    modules: [...resolution.requestedModules],
    ...selectionsFromModules(resolution.resolvedModules),
    skipInstall: addOptions.skipInstall,
    dryRun: addOptions.dryRun,
    json: addOptions.json,
    toolchainChannel: addOptions.toolchainChannel ?? toolchainChannelFromManifest(manifest),
    uiComponents: [],
    nativeStyling: manifest.ui.nativeStyling,
  };
}

function toolchainChannelFromManifest(manifest: ProjectManifest): ToolchainChannel {
  return resolveToolchainChannel(manifest.toolchain);
}

export function isSupportedProjectUpgrade(fromVersion: string, toVersion: string): boolean {
  const parseStableVersion = (version: string): readonly [number, number, number] | undefined => {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
    return match
      ? [Number(match[1]), Number(match[2]), Number(match[3])]
      : undefined;
  };
  const from = parseStableVersion(fromVersion);
  const to = parseStableVersion(toVersion);
  if (!from || !to) return false;

  const supportedOwnershipMigration = fromVersion === '0.3.0' && to[0] === 0 && to[1] === 4;
  const compatiblePatchUpgrade = from[0] === to[0]
    && from[1] === to[1]
    && from[2] < to[2];
  return supportedOwnershipMigration || compatiblePatchUpgrade;
}

function ensureScaffoldRoot(root: string): void {
  const rootStat = lstatIfPresent(root);
  if (!rootStat) throw new Error(`Scaffold destination is not a directory: ${root}`);
  if (rootStat.isSymbolicLink()) throw new Error(`Refusing scaffold destination that is a symbolic link: ${root}`);
  if (!rootStat.isDirectory()) throw new Error(`Scaffold destination is not a directory: ${root}`);
  const allowed = new Set(['.git', '.gitignore', '.DS_Store', '.anhedral.lock']);
  const unexpected = readdirSync(root).filter((entry) => !allowed.has(entry));
  if (unexpected.length > 0) {
    throw new Error(`Current directory is not empty. Found: ${unexpected.join(', ')}`);
  }
}

function selectedAppFilters(apps: AppSelections): string[] {
  return (Object.entries(apps) as Array<[keyof AppSelections, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([name]) => `./apps/${name}`);
}

function rootScripts(options: ResolvedInitOptions): Record<string, string> {
  const filters = selectedAppFilters(options.apps);
  const primaryClient = filters.find((entry) => entry !== './apps/api');
  const primaryFilters = primaryClient
    ? [primaryClient, ...(options.apps.api ? ['./apps/api'] : [])]
    : filters.slice(0, 1);
  const scripts: Record<string, string> = {
    dev: primaryFilters.length ? `turbo dev --parallel ${primaryFilters.map((entry) => `--filter=${entry}`).join(' ')}` : 'echo "No app surfaces selected."',
    ...(filters.length > primaryFilters.length
      ? { 'dev:all': `turbo dev --parallel ${filters.map((entry) => `--filter=${entry}`).join(' ')}` }
      : {}),
    build: 'turbo build',
    typecheck: 'turbo typecheck',
  };
  const verify: string[] = [];
  if (options.apps.web) {
    scripts['dev:web'] = 'pnpm --filter ./apps/web dev';
    scripts['verify:web'] = 'pnpm --filter ./apps/web typecheck && pnpm --filter ./apps/web build';
    verify.push('pnpm verify:web');
  }
  if (options.apps.web || options.apps.api) {
    scripts['deploy:vercel:link'] = `pnpm dlx vercel@${TOOLCHAIN_DEPENDENCIES.vercel} link`;
    scripts['deploy:vercel:preview'] = `pnpm dlx vercel@${TOOLCHAIN_DEPENDENCIES.vercel} deploy`;
    scripts['deploy:vercel:production'] = `pnpm dlx vercel@${TOOLCHAIN_DEPENDENCIES.vercel} deploy --prod`;
    scripts['deploy:vercel:inspect'] = `pnpm dlx vercel@${TOOLCHAIN_DEPENDENCIES.vercel} inspect`;
    scripts['deploy:vercel:domain:inspect'] = `pnpm dlx vercel@${TOOLCHAIN_DEPENDENCIES.vercel} domains inspect`;
  }
  if (options.apps.mobile) {
    scripts['dev:mobile'] = 'pnpm --filter ./apps/mobile dev';
    scripts['verify:mobile'] = 'pnpm --filter ./apps/mobile typecheck && pnpm --filter ./apps/mobile build:web';
    verify.push('pnpm verify:mobile');
    const eas = `pnpm --dir apps/mobile dlx eas-cli@${TOOLCHAIN_DEPENDENCIES['eas-cli']}`;
    scripts['mobile:eas:login'] = `${eas} login`;
    scripts['mobile:eas:init'] = `${eas} init`;
    scripts['mobile:build:internal:ios'] = `${eas} build --platform ios --profile preview`;
    scripts['mobile:build:internal:android'] = `${eas} build --platform android --profile preview`;
    scripts['mobile:build:production:ios'] = `${eas} build --platform ios --profile production`;
    scripts['mobile:build:production:android'] = `${eas} build --platform android --profile production`;
    scripts['mobile:submit:ios'] = `${eas} submit --platform ios --profile production --latest`;
    scripts['mobile:submit:android'] = `${eas} submit --platform android --profile production --latest`;
  }
  if (options.apps.api) {
    scripts['dev:api'] = 'pnpm --filter ./apps/api dev';
    scripts['verify:api'] = 'pnpm --filter ./apps/api test:coverage && pnpm --filter ./apps/api build';
    verify.push('pnpm verify:api');
  }
  if (options.apps.desktop) {
    scripts['dev:desktop'] = 'pnpm --filter ./apps/desktop dev';
    scripts['desktop:build'] = 'pnpm --filter ./apps/desktop package';
    scripts['verify:desktop'] = 'pnpm --filter ./apps/desktop typecheck && pnpm --filter ./apps/desktop build';
    verify.push('pnpm verify:desktop');
  }
  if (options.features.electronUpdater) {
    const bucketName = desktopUpdatesBucketName(options.projectName);
    const wrangler = `pnpm dlx wrangler@${TOOLCHAIN_DEPENDENCIES.wrangler}`;
    scripts['desktop:updates:cloudflare:login'] = `${wrangler} login`;
    scripts['desktop:updates:bucket:create'] = `${wrangler} r2 bucket create ${bucketName}`;
    scripts['desktop:updates:worker:check'] = 'pnpm --filter ./apps/desktop-updater-worker check';
    scripts['desktop:updates:worker:dev'] = 'pnpm --filter ./apps/desktop-updater-worker dev';
    scripts['desktop:updates:worker:deploy'] = 'pnpm --filter ./apps/desktop-updater-worker deploy';
    scripts['desktop:updates:first-provision'] = 'pnpm desktop:updates:bucket:create && pnpm desktop:updates:worker:deploy';
    scripts['desktop:updates:worker:types'] = 'pnpm --filter ./apps/desktop-updater-worker types';
    scripts['desktop:updates:build:mac'] = 'pnpm --filter ./apps/desktop updates:build:mac';
    scripts['desktop:updates:build:win'] = 'pnpm --filter ./apps/desktop updates:build:win';
    scripts['desktop:updates:build:linux'] = 'pnpm --filter ./apps/desktop updates:build:linux';
    scripts['desktop:updates:publish'] = 'node apps/desktop/scripts/publish-updates.mjs';
    scripts['verify:desktop-updates'] = 'pnpm desktop:updates:worker:check && node --check apps/desktop/scripts/publish-updates.mjs';
    verify.push('pnpm verify:desktop-updates');
  }
  if (options.apps.extension) {
    scripts['dev:extension'] = 'pnpm --filter ./apps/extension dev';
    scripts['extension:zip'] = 'pnpm --filter ./apps/extension zip';
    scripts['verify:extension'] = 'pnpm --filter ./apps/extension typecheck && pnpm --filter ./apps/extension zip';
    verify.push('pnpm verify:extension');
  }
  if (options.features.database) {
    scripts['neon:login'] = `pnpm dlx neonctl@${TOOLCHAIN_DEPENDENCIES.neonctl} auth`;
    scripts['neon:project:create'] = `pnpm dlx neonctl@${TOOLCHAIN_DEPENDENCIES.neonctl} projects create`;
    scripts['db:generate'] = 'pnpm --filter @shared/db db:generate';
    scripts['db:migrate'] = 'pnpm --filter @shared/db db:migrate';
    scripts['db:check'] = 'pnpm --filter @shared/db db:check';
    scripts['db:studio'] = 'pnpm --filter @shared/db db:studio';
    scripts['verify:db'] = 'node scripts/verify-db-migrations.mjs && pnpm db:check';
    verify.push('pnpm verify:db');
  }
  if (options.features.storage) {
    const bucketName = r2BucketName(options.projectName);
    scripts['r2:login'] = `pnpm dlx wrangler@${TOOLCHAIN_DEPENDENCIES.wrangler} login`;
    scripts['r2:bucket:create'] = `pnpm dlx wrangler@${TOOLCHAIN_DEPENDENCIES.wrangler} r2 bucket create ${bucketName}`;
    scripts['r2:cors:list'] = `pnpm dlx wrangler@${TOOLCHAIN_DEPENDENCIES.wrangler} r2 bucket cors list ${bucketName}`;
    scripts['r2:cors:set'] = `pnpm dlx wrangler@${TOOLCHAIN_DEPENDENCIES.wrangler} r2 bucket cors set ${bucketName} --file cloudflare/r2-cors.template.json`;
    scripts['assets:proxy:check'] = 'pnpm --filter ./apps/assets-private-proxy check';
    scripts['assets:proxy:dev'] = 'pnpm --filter ./apps/assets-private-proxy dev';
    scripts['assets:proxy:deploy'] = 'pnpm --filter ./apps/assets-private-proxy deploy';
    scripts['verify:assets-proxy'] = 'pnpm assets:proxy:check';
    verify.push('pnpm verify:assets-proxy');
  }
  if (!Object.values(options.apps).some(Boolean)) verify.unshift('pnpm typecheck');
  scripts.verify = verify.join(' && ');
  return scripts;
}

function desiredRootPackage(options: ResolvedInitOptions): Record<string, unknown> {
  const workspaces = [
    Object.values(options.apps).some(Boolean) ? 'apps/*' : null,
    options.apps.api || options.features.database ? 'packages/*' : null,
  ].filter((value): value is string => value !== null);
  return {
    name: options.projectName,
    private: true,
    version: '0.1.0',
    packageManager: PACKAGE_MANAGER,
    engines: { node: options.apps.mobile ? MOBILE_NODE_ENGINE : NODE_ENGINE },
    scripts: rootScripts(options),
    workspaces,
    devDependencies: ROOT_DEPENDENCIES.devDependencies,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => sameJson(entry, right[index]));
  }
  if (!isJsonRecord(left) || !isJsonRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]));
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const MISSING_JSON_VALUE = Symbol('missing-json-value');
type MaybeJsonValue = unknown | typeof MISSING_JSON_VALUE;

function includesJson(values: readonly unknown[], candidate: unknown): boolean {
  return values.some((value) => sameJson(value, candidate));
}

function mergeChangedArrays(
  current: readonly unknown[],
  desired: readonly unknown[],
  previous: readonly unknown[],
): unknown[] {
  const merged: unknown[] = [];
  for (const entry of desired) {
    if ((!includesJson(previous, entry) || includesJson(current, entry)) && !includesJson(merged, entry)) {
      merged.push(entry);
    }
  }
  for (const entry of current) {
    if (!includesJson(previous, entry) && !includesJson(merged, entry)) merged.push(entry);
  }
  return merged;
}

function mergeGeneratedThreeWay(
  current: MaybeJsonValue,
  desired: MaybeJsonValue,
  previous: MaybeJsonValue,
  fieldPath: string,
): MaybeJsonValue {
  if (current === MISSING_JSON_VALUE) {
    if (desired === MISSING_JSON_VALUE) return MISSING_JSON_VALUE;
    if (previous === MISSING_JSON_VALUE) return desired;
    if (sameJson(desired, previous)) return MISSING_JSON_VALUE;
    throw new Error(`Conflict in ${fieldPath}: a generated value changed after the user removed it.`);
  }
  if (desired === MISSING_JSON_VALUE) {
    if (previous === MISSING_JSON_VALUE) return current;
    if (sameJson(current, previous)) return MISSING_JSON_VALUE;
    return current;
  }
  if (previous === MISSING_JSON_VALUE) {
    if (sameJson(current, desired)) return desired;
    if (isJsonRecord(current) && isJsonRecord(desired)) {
      return mergeGeneratedRecords(current, desired, {}, fieldPath, true);
    }
    if (Array.isArray(current) && Array.isArray(desired)) {
      return [...desired, ...current.filter((entry) => !includesJson(desired, entry))];
    }
    throw new Error(`Conflict in ${fieldPath}: a newly generated value collides with a user-defined value.`);
  }
  if (sameJson(current, desired)) return current;
  if (sameJson(current, previous)) return desired;
  if (sameJson(desired, previous)) return current;
  if (isJsonRecord(current) && isJsonRecord(desired) && isJsonRecord(previous)) {
    return mergeGeneratedRecords(current, desired, previous, fieldPath, true);
  }
  if (Array.isArray(current) && Array.isArray(desired) && Array.isArray(previous)) {
    return mergeChangedArrays(current, desired, previous);
  }
  throw new Error(`Conflict in ${fieldPath}: both the generator and the user changed the value.`);
}

function mergeGeneratedOwned(current: MaybeJsonValue, desired: MaybeJsonValue, fieldPath: string): MaybeJsonValue {
  if (desired === MISSING_JSON_VALUE) return current;
  if (current === MISSING_JSON_VALUE) return desired;
  if (isJsonRecord(current) && isJsonRecord(desired)) {
    return mergeGeneratedRecords(current, desired, {}, fieldPath, false);
  }
  if (Array.isArray(current) && Array.isArray(desired)) {
    return [...desired, ...current.filter((entry) => !includesJson(desired, entry))];
  }
  if (
    isJsonRecord(current)
    || isJsonRecord(desired)
    || Array.isArray(current)
    || Array.isArray(desired)
  ) {
    throw new Error(`Conflict in ${fieldPath}: the generator version changed and the value shape is ambiguous.`);
  }
  // Without a trustworthy previous-generator snapshot, an existing scalar may
  // be user-authored. Preserve it instead of silently resetting it to today's
  // default. Newly introduced keys still take the desired value above.
  return current;
}

function mergeGeneratedRecords(
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
  previous: Record<string, unknown>,
  fieldPath: string,
  trustPrevious: boolean,
): Record<string, unknown> {
  const keys = [...new Set([...Object.keys(desired), ...Object.keys(current), ...Object.keys(previous)])];
  const entries: Array<[string, unknown]> = [];
  for (const key of keys) {
    const currentValue = Object.hasOwn(current, key) ? current[key] : MISSING_JSON_VALUE;
    const desiredValue = Object.hasOwn(desired, key) ? desired[key] : MISSING_JSON_VALUE;
    const previousValue = Object.hasOwn(previous, key) ? previous[key] : MISSING_JSON_VALUE;
    const value = trustPrevious
      ? mergeGeneratedThreeWay(currentValue, desiredValue, previousValue, `${fieldPath}.${key}`)
      : mergeGeneratedOwned(currentValue, desiredValue, `${fieldPath}.${key}`);
    if (value !== MISSING_JSON_VALUE) entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

function mergeGeneratedStructure(
  current: unknown,
  desired: unknown,
  previous: unknown,
  fieldPath: string,
  trustPrevious: boolean,
): unknown {
  if (isJsonRecord(current) && isJsonRecord(desired)) {
    return mergeGeneratedRecords(
      current,
      desired,
      isJsonRecord(previous) ? previous : {},
      fieldPath,
      trustPrevious,
    );
  }
  return trustPrevious
    ? mergeGeneratedThreeWay(current, desired, previous, fieldPath)
    : mergeGeneratedOwned(current, desired, fieldPath);
}

function mergeStringMap(
  current: unknown,
  desired: unknown,
  previousGenerated: unknown,
  filePath: string,
  allowGeneratedUpdates: boolean,
): Record<string, string> {
  const existing = current && typeof current === 'object' ? current as Record<string, string> : {};
  const generated = desired && typeof desired === 'object' ? desired as Record<string, string> : {};
  const previous = previousGenerated && typeof previousGenerated === 'object'
    ? previousGenerated as Record<string, string>
    : {};
  const merged = { ...existing };
  for (const [key, value] of Object.entries(generated)) {
    if (merged[key] === undefined || merged[key] === value || allowGeneratedUpdates || merged[key] === previous[key]) merged[key] = value;
    else throw new Error(`Conflict in ${filePath}: key ${key} has a user-defined value.`);
  }
  return Object.fromEntries(Object.entries(merged).sort(([left], [right]) => left.localeCompare(right)));
}

function writeRootPackage(
  root: string,
  options: ResolvedInitOptions,
  mode: 'init' | 'add',
  allowGeneratedUpdates: boolean,
  previousGenerated?: Record<string, unknown>,
): void {
  const filePath = path.join(root, 'package.json');
  const desired = desiredRootPackage(options);
  if (mode === 'init' || !pathEntryExists(filePath)) {
    writeFile(filePath, JSON.stringify(desired, null, 2) + '\n');
    return;
  }
  const current = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  const desiredWorkspaces = desired.workspaces as string[];
  const currentWorkspaces = Array.isArray(current.workspaces) ? current.workspaces.filter((value): value is string => typeof value === 'string') : [];
  const mergeMetadataField = (field: 'packageManager' | 'engines'): unknown => {
    const currentValue = current[field];
    const desiredValue = desired[field];
    const previousValue = previousGenerated?.[field];
    if (
      allowGeneratedUpdates
      || currentValue === undefined
      || (previousValue !== undefined && sameJson(currentValue, previousValue))
    ) {
      return desiredValue;
    }
    if (previousValue !== undefined && !sameJson(previousValue, desiredValue)) {
      throw new Error(`Conflict in package.json: ${field} was user-modified and must satisfy the newly selected modules.`);
    }
    return currentValue;
  };
  const merged: Record<string, unknown> = {
    ...desired,
    ...current,
    private: true,
    packageManager: mergeMetadataField('packageManager'),
    engines: mergeMetadataField('engines'),
    workspaces: [...new Set([...currentWorkspaces, ...desiredWorkspaces])].sort(),
    scripts: mergeStringMap(current.scripts, desired.scripts, previousGenerated?.scripts, 'package.json scripts', allowGeneratedUpdates),
    devDependencies: mergeStringMap(current.devDependencies, desired.devDependencies, previousGenerated?.devDependencies, 'package.json devDependencies', allowGeneratedUpdates),
  };
  writeFile(filePath, JSON.stringify(merged, null, 2) + '\n');
}

function mergeJsonConfig(
  root: string,
  relativePath: string,
  desired: Record<string, unknown>,
  previousGenerated: Record<string, unknown>,
  trustPreviousGenerated: boolean,
): void {
  const filePath = path.join(root, relativePath);
  if (!pathEntryExists(filePath)) {
    writeFile(filePath, JSON.stringify(desired, null, 2) + '\n');
    return;
  }
  const current = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  const merged = mergeGeneratedStructure(
    current,
    desired,
    previousGenerated,
    relativePath,
    trustPreviousGenerated,
  ) as Record<string, unknown>;
  writeFile(filePath, JSON.stringify(merged, null, 2) + '\n');
}

function writeRootEnv(root: string, options: ResolvedInitOptions): void {
  const corsOrigins = [
    options.apps.web ? 'http://localhost:3000' : null,
    options.apps.mobile ? 'http://localhost:8081' : null,
    options.apps.desktop ? 'http://127.0.0.1:5173' : null,
    options.apps.desktop ? 'null' : null,
  ].filter((value): value is string => value !== null);
  const lines = composeRootEnvironment(
    collectModuleContributions(options.modules),
    { corsOrigins },
  );
  const filePath = path.join(root, '.env.example');
  const current = pathEntryExists(filePath) ? readFileSync(filePath, 'utf8') : '';
  const existingKeys = new Set([...current.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]!));
  const additions = lines.filter((line) => !existingKeys.has(line.slice(0, line.indexOf('='))));
  const separator = current && additions.length ? (current.endsWith('\n') ? '\n' : '\n\n') : '';
  writeFile(filePath, `${current}${separator}${additions.join('\n')}${additions.length ? '\n' : ''}`);
}

function desiredTurboConfig(): Record<string, unknown> {
  return {
    $schema: 'https://turborepo.dev/schema.json',
    tasks: {
      build: {
        dependsOn: ['^build'],
        outputs: ['.next/**', '!.next/cache/**', '.output/**', 'dist/**'],
      },
      typecheck: { dependsOn: ['^build'] },
      dev: { cache: false, persistent: true },
    },
  };
}

function desiredVercelConfig(options: ResolvedInitOptions): Record<string, unknown> {
  const services: Record<string, Record<string, unknown>> = {};
  if (options.apps.api) {
    services.api = { root: 'apps/api' };
  }
  if (options.apps.web) {
    services.web = { root: 'apps/web', framework: 'nextjs' };
  }
  const rewrites = [
    options.apps.api ? { source: '/api/(.*)', destination: { service: 'api' } } : null,
    options.apps.web ? { source: '/(.*)', destination: { service: 'web' } } : null,
  ].filter((rewrite): rewrite is NonNullable<typeof rewrite> => rewrite !== null);
  const crons = composeVercelCrons(collectModuleContributions(options.modules));
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    ...(Object.keys(services).length > 0 ? { services } : {}),
    ...(rewrites.length > 0 ? { rewrites } : {}),
    ...(crons.length > 0 ? { crons } : {}),
  };
}

function generatedCi(options: ResolvedInitOptions): string {
  const nodeVersion = options.apps.mobile ? '22.13.0' : '20.19.0';
  const commands = [
    'pnpm typecheck',
    options.apps.api ? 'pnpm --filter ./apps/api test:coverage' : null,
    'pnpm build',
  ].filter((value): value is string => value !== null).join('\n          ');
  const databaseSteps = options.features.database ? `
      - name: Verify committed database migration history
        run: pnpm verify:db
      - name: Verify database schema and migration parity
        run: |
          pnpm db:generate
          git diff --exit-code -- packages/db/migrations
          if [[ -n "$(git status --porcelain --untracked-files=all -- packages/db/migrations)" ]]; then
            echo "drizzle-kit generated uncommitted migration artifacts:"
            git status --short --untracked-files=all -- packages/db/migrations
            exit 1
          fi
` : '';
  return `name: Anhedral CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: anhedral-ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: ${ACTIONS.checkout} # v6
        with:
          persist-credentials: false
      - uses: ${ACTIONS.pnpm} # v6
        with:
          version: ${PACKAGE_MANAGER.replace('pnpm@', '')}
      - uses: ${ACTIONS.node} # v6
        with:
          node-version: ${nodeVersion}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
${databaseSteps}      - name: Verify generated workspace
        run: |
          ${commands}
`;
}

function writeDatabaseVerificationScript(root: string, options: ResolvedInitOptions): void {
  if (!options.features.database) return;
  writeFile(path.join(root, 'scripts/verify-db-migrations.mjs'), `import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = process.cwd();
const migrationsRoot = path.join(projectRoot, 'packages/db/migrations');

function collectSqlFiles(directory, relativeDirectory = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...collectSqlFiles(path.join(directory, entry.name), relativePath));
    else if (entry.isFile() && entry.name.endsWith('.sql')) files.push(path.posix.join('packages/db/migrations', relativePath));
  }
  return files.sort();
}

const sqlFiles = collectSqlFiles(migrationsRoot);
if (sqlFiles.length === 0) {
  throw new Error('No database migration SQL is committed. Run \`pnpm db:generate\`, review packages/db/migrations, and commit the generated migration before verification.');
}

const gitRoot = spawnSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: projectRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});

if (gitRoot.status === 0) {
  const repositoryRoot = String(gitRoot.stdout).trim();
  const tracked = spawnSync('git', ['ls-files', '--full-name', '-z', '--', 'packages/db/migrations'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (tracked.status !== 0) {
    throw new Error('Unable to inspect committed database migrations: ' + String(tracked.stderr).trim());
  }
  const trackedFiles = new Set(String(tracked.stdout)
    .split('\\0')
    .filter(Boolean)
    .map((entry) => path.resolve(repositoryRoot, entry)));
  const untrackedSql = sqlFiles.filter((entry) => !trackedFiles.has(path.resolve(projectRoot, entry)));
  if (untrackedSql.length > 0) {
    throw new Error('Database migration SQL must be tracked by Git before verification: ' + untrackedSql.join(', '));
  }
} else if (process.env.CI) {
  throw new Error('CI must run database migration verification inside a Git worktree.');
}

console.log('Database migration baseline is present' + (gitRoot.status === 0 ? ' and tracked by Git.' : '.'));
`);
}

function isRecordedFileUnmodified(root: string, manifest: ProjectManifest | undefined, relativePath: string): boolean {
  if (!manifest) return true;
  const record = manifest.files[relativePath];
  if (!record?.hash) return false;
  const filePath = path.join(root, relativePath);
  return pathEntryExists(filePath) && hashContent(readFileSync(filePath)) === record.hash;
}

function writeRootFiles(root: string, options: ResolvedInitOptions, mode: 'init' | 'add', currentRoot: string, manifest?: ProjectManifest): void {
  const packageUnmodified = isRecordedFileUnmodified(currentRoot, manifest, 'package.json');
  const workspaceUnmodified = manifest !== undefined
    && isRecordedFileUnmodified(currentRoot, manifest, 'pnpm-workspace.yaml');
  const previousOptions = manifest
    ? { ...options, ...selectionsFromModules(manifest.modules), modules: [...manifest.modules] }
    : undefined;
  const previousPackage = previousOptions ? desiredRootPackage(previousOptions) : undefined;
  writeRootPackage(root, options, mode, packageUnmodified, previousPackage);
  const workspacePackages = [
    Object.values(options.apps).some(Boolean) ? 'apps/*' : null,
    options.apps.api || options.features.database ? 'packages/*' : null,
  ].filter((value): value is string => value !== null);
  mergeWorkspaceFile(root, workspacePackages, desiredWorkspacePolicy(), workspaceUnmodified);
  mergeJsonConfig(root, 'turbo.json', desiredTurboConfig(), desiredTurboConfig(), true);
  mergeJsonConfig(
    root,
    'vercel.json',
    desiredVercelConfig(options),
    previousOptions ? desiredVercelConfig(previousOptions) : {},
    true,
  );
  appendGitignore(root, [
    'node_modules',
    '.turbo',
    '.next',
    '.output',
    '.wxt',
    '.expo',
    'coverage',
    'dist',
    'release',
    '.env',
    '.env.*',
    '!.env.example',
    '*.tsbuildinfo',
    options.features.electronUpdater ? 'electron-builder.env' : null,
  ].filter((value): value is string => value !== null));
  writeRootEnv(root, options);
  writeDatabaseVerificationScript(root, options);
  const vercelIgnore = path.join(root, '.vercelignore');
  const currentIgnore = pathEntryExists(vercelIgnore) ? readFileSync(vercelIgnore, 'utf8') : '';
  const ignoreLines = [...new Set([
    ...currentIgnore.split('\n').filter(Boolean),
    'apps/extension/.output',
    'apps/mobile/dist',
    'apps/desktop/release',
    'apps/assets-private-proxy',
    'apps/desktop-updater-worker',
  ])];
  writeFile(vercelIgnore, ignoreLines.join('\n') + '\n');
  writeFile(path.join(root, '.github/workflows/anhedral-ci.yml'), generatedCi(options));
}

function enabledModuleNames(options: ResolvedInitOptions): readonly ModuleId[] {
  return resolveModules(options.modules).resolvedModules;
}

function writeProjectDocs(root: string, options: ResolvedInitOptions, includeUserDocs: boolean): void {
  const modules = enabledModuleNames(options);
  const storageBucketName = r2BucketName(options.projectName);
  const environmentSetupCommands = [
    'pnpm install',
    options.apps.api ? 'cp apps/api/.env.example apps/api/.env' : null,
    options.features.database ? 'cp packages/db/.env.example packages/db/.env' : null,
    options.apps.web ? 'cp apps/web/.env.example apps/web/.env.local' : null,
    options.apps.mobile ? 'cp apps/mobile/.env.example apps/mobile/.env' : null,
    options.apps.desktop ? 'cp apps/desktop/.env.example apps/desktop/.env' : null,
    options.features.electronUpdater ? 'cp apps/desktop/electron-builder.env.example apps/desktop/electron-builder.env' : null,
    options.apps.extension ? 'cp apps/extension/.env.example apps/extension/.env' : null,
  ].filter((value): value is string => value !== null).join('\n');
  const firstVerificationCommands = [
    options.features.database ? 'pnpm db:generate' : null,
    options.features.database ? 'git add packages/db/migrations' : null,
    'pnpm verify',
    options.features.database ? 'pnpm db:migrate' : null,
  ].filter((value): value is string => value !== null).join('\n');
  const deploymentRows = [
    options.apps.web || options.apps.api ? '| Web/API | Vercel Git integration | Import this repository once; branch pushes create previews and the production branch deploys automatically. |' : null,
    options.apps.mobile ? '| Mobile | EAS Build + App Store Connect + Google Play Console | EAS creates signed binaries; Apple TestFlight/App Review and Google testing tracks/store review control release. |' : null,
    options.features.database ? '| Database | Neon | Provision the project, set `DATABASE_URL`, review/apply Drizzle migrations, and use separate branches or projects for preview and production. |' : null,
    options.features.storage ? '| Object storage | Private Cloudflare R2 + `assets-private-proxy` Worker | Authenticated uploads use presigned R2 URLs; the Worker streams known-key GET/HEAD downloads through `assets.<domain>` while direct bucket access stays disabled. |' : null,
    options.features.electronUpdater ? '| Desktop updates | Private Cloudflare R2 + `desktop-updater` Worker | Signed native artifacts are uploaded to a private bucket; a custom-domain Worker supplies metadata, ranges, and downloads to `electron-updater`. |' : null,
    options.apps.extension ? '| Chrome extension | Chrome Web Store | Build the production ZIP, test it as an unpublished/trusted-tester item, complete privacy disclosures, and submit it for review. |' : null,
    options.apps.desktop ? `| Desktop | electron-builder artifacts${options.features.electronUpdater ? ' + automatic update channel' : ''} | Build and sign on each target OS, then publish through the release channel chosen for the product. |` : null,
  ].filter((value): value is string => value !== null).join('\n');
  const deploymentCommands = [
    options.apps.web || options.apps.api ? 'pnpm deploy:vercel:link' : null,
    options.apps.web || options.apps.api ? 'pnpm deploy:vercel:preview' : null,
    options.apps.web || options.apps.api ? 'pnpm deploy:vercel:production' : null,
    options.apps.mobile ? 'pnpm mobile:eas:login' : null,
    options.apps.mobile ? 'pnpm mobile:build:internal:ios' : null,
    options.apps.mobile ? 'pnpm mobile:build:internal:android' : null,
    options.features.database ? `pnpm neon:project:create -- --name ${options.projectName}` : null,
    options.features.storage ? 'pnpm r2:bucket:create' : null,
    options.features.storage ? 'pnpm assets:proxy:check' : null,
    options.features.storage ? 'pnpm assets:proxy:deploy' : null,
    options.features.electronUpdater ? 'pnpm desktop:updates:cloudflare:login' : null,
    options.features.electronUpdater ? 'pnpm desktop:updates:first-provision' : null,
    options.features.electronUpdater ? 'pnpm desktop:updates:build:mac' : null,
    options.features.electronUpdater ? 'pnpm desktop:updates:publish -- --platform mac --arch arm64' : null,
    options.apps.extension ? 'pnpm extension:zip' : null,
  ].filter((value): value is string => value !== null).join('\n');
  const sourceRows = [
    options.apps.web ? '| Web frontend | `apps/web/app/`, `apps/web/components/`, `apps/web/lib/` | Next.js App Router pages, layouts, components, and web utilities. |' : null,
    options.apps.mobile ? '| Mobile frontend | `apps/mobile/app/`, `apps/mobile/components/` | Expo Router screens, layouts, and native UI. |' : null,
    options.apps.api ? '| Backend API | `apps/api/src/routes/app.ts`, `apps/api/src/<feature>.ts` | User-owned Fastify routes and server-only product modules; Anhedral keeps provider routes in managed wiring. |' : null,
    options.apps.desktop ? '| Desktop app | `apps/desktop/src/renderer/`, `apps/desktop/src/main/` | React UI and privileged Electron main-process code. |' : null,
    options.features.electronUpdater ? '| Desktop update edge | `apps/desktop-updater-worker/`, `apps/desktop/scripts/publish-updates.mjs` | Private R2 delivery Worker, custom domain, and ordered release publisher. |' : null,
    options.apps.extension ? '| Browser extension | `apps/extension/src/entrypoints/`, `apps/extension/src/components/` | WXT entrypoints and extension UI. |' : null,
    options.apps.api ? '| Shared API contracts | `packages/contracts/src/app.ts` | User-owned Zod request and response schemas exported beside managed provider contracts. |' : null,
    options.apps.api ? '| Typed API client | `packages/api-client/src/app.ts` | User-owned client-safe methods exported beside the managed fetch client. |' : null,
    options.features.database ? '| Database | `packages/db/src/app-schema.ts`, `packages/db/migrations/` | User-owned Drizzle tables plus reviewed SQL migrations; provider tables remain generated. |' : null,
  ].filter((value): value is string => value !== null).join('\n');
  const moduleCommands = [
    options.apps.web ? '- Web: `pnpm dev:web`' : null,
    options.apps.mobile ? '- Mobile: `pnpm dev:mobile`' : null,
    options.apps.api ? '- API: `pnpm dev:api`' : null,
    options.apps.desktop ? '- Desktop: `pnpm dev:desktop`' : null,
    options.apps.extension ? '- Extension: `pnpm dev:extension`' : null,
  ].filter((value): value is string => value !== null).join('\n');
  const toolRows = [
    options.apps.web ? '| Next.js | Web routes and rendering | `apps/web` | https://nextjs.org/docs/app/getting-started |' : null,
    options.apps.mobile ? '| Expo Router | iOS and Android app | `apps/mobile` | https://docs.expo.dev/router/introduction/ |' : null,
    options.apps.api ? '| Fastify | HTTP API | `apps/api` | https://fastify.dev/docs/latest/ |' : null,
    options.features.database ? '| Neon | Managed Postgres; no local Postgres | `DATABASE_URL` | https://neon.com/docs/introduction |' : null,
    options.features.database ? '| Drizzle | SQL schema, queries, migrations | `packages/db` | https://orm.drizzle.team/docs/get-started |' : null,
    options.features.auth ? '| Clerk | Identity and sessions | generated auth files | https://clerk.com/docs/getting-started/quickstart/overview |' : null,
    options.features.storage ? '| Cloudflare R2 | Private object storage | upload API and `apps/assets-private-proxy` | https://developers.cloudflare.com/r2/ |' : null,
    options.features.billing ? '| RevenueCat | Subscription authority | API and native client | https://www.revenuecat.com/docs |' : null,
    options.features.billing ? '| Ably | Realtime invalidation | `packages/realtime` | https://ably.com/docs |' : null,
    options.apps.desktop ? '| Electron | Desktop runtime | `apps/desktop` | https://www.electronjs.org/docs/latest/ |' : null,
    options.features.electronUpdater ? '| electron-updater | Packaged-app update checks and installation | `apps/desktop/src/main/main.ts` | https://www.electron.build/auto-update.html |' : null,
    options.features.electronUpdater ? '| Cloudflare Workers + R2 | Private update storage and custom-domain delivery | `apps/desktop-updater-worker` | https://developers.cloudflare.com/r2/api/workers/workers-api-usage/ |' : null,
    options.apps.extension ? '| WXT | Browser extension tooling | `apps/extension` | https://wxt.dev/guide/installation.html |' : null,
    options.apps.web || options.apps.desktop || options.apps.extension ? '| shadcn/ui | Source-owned DOM UI | each DOM app\'s `components/ui` | https://ui.shadcn.com/docs |' : null,
    '| Turborepo | Workspace tasks | root `turbo.json` | https://turborepo.com/docs |',
  ].filter((value): value is string => value !== null).join('\n');
  const developmentSteps = [
    options.apps.api ? 'Define shared Zod schemas in user-owned `packages/contracts/src/app.ts` so the network boundary has one definition.' : null,
    options.features.database ? 'Define persistent product state in user-owned `packages/db/src/app-schema.ts`. Run `pnpm db:generate`, review the SQL, and commit it. This project uses managed Neon—do not add a local Postgres container.' : null,
    options.apps.api ? 'Add server-only behavior in a focused `apps/api/src/<feature>.ts` module and register its validated HTTP boundary in user-owned `apps/api/src/routes/app.ts`.' : null,
    options.apps.api ? 'Expose client-safe methods from user-owned `packages/api-client/src/app.ts`; never import API implementation files into a frontend.' : null,
    options.apps.web ? 'Add web routes in `apps/web/app/<route>/page.tsx` and reusable UI in `apps/web/components/`. Use a client component only for browser state, events, or hooks.' : null,
    options.apps.mobile ? 'Add mobile routes in `apps/mobile/app/` and reusable native UI in `apps/mobile/components/`. Keep platform-only APIs in platform-specific modules.' : null,
    'Test the smallest affected package first, then run `pnpm verify`.',
  ].filter((value): value is string => value !== null).map((value, index) => `${index + 1}. ${value}`).join('\n');
  const commonTaskSections = [
    options.apps.web ? `### Add a web page

Create \`apps/web/app/<route>/page.tsx\`. Follow Next.js App Router conventions directly. Put reusable components under \`apps/web/components/<feature>/\` and web-only helpers under \`apps/web/lib/\`.` : null,
    options.apps.api ? `### Add an API endpoint

Define its Zod contract in \`packages/contracts/src/app.ts\`, implement server-only behavior in \`apps/api/src/<feature>.ts\`, and register the Fastify route in \`apps/api/src/routes/app.ts\`. Authenticate on the server and derive the user ID from the verified session.` : null,
    options.features.database ? `### Change the database

Edit \`packages/db/src/app-schema.ts\`, then run:

\`\`\`sh
pnpm db:generate
pnpm verify:db
pnpm db:migrate
\`\`\`

Review generated SQL before applying it. \`DATABASE_URL\` points to a managed Neon branch or project; there is intentionally no local Postgres service.` : null,
    options.features.auth ? `### Use authentication

Frontend applications use their generated Clerk provider and hooks. The API verifies Clerk sessions. Public keys may use a framework public environment prefix; \`CLERK_SECRET_KEY\` remains in the API environment only.` : null,
    options.features.storage ? `### Upload a file

Use \`@shared/api-client\`. The API authorizes the user and creates a short-lived signed R2 upload; the client uploads directly and confirms through the API. Never put R2 credentials in a client or make the bucket public.` : null,
  ].filter((value): value is string => value !== null).join('\n\n');
  const verticalSliceExample = options.apps.api && options.features.database ? `## Copy-paste example: a projects feature

These files are user-owned extension seams. Anhedral preserves them during \`add\`, \`ui add\`, and \`upgrade\`.

\`packages/contracts/src/app.ts\`:

\`\`\`ts
import { z } from 'zod';

export const ProjectSchema = z.object({ id: z.string(), name: z.string() });
export const ProjectListSchema = z.array(ProjectSchema);
\`\`\`

\`packages/db/src/app-schema.ts\`:

\`\`\`ts
import { pgTable, text } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});
\`\`\`

\`apps/api/src/routes/app.ts\`:

\`\`\`ts
import type { FastifyPluginAsync } from 'fastify';
import { ProjectListSchema } from '@shared/contracts';
import { db } from '@shared/db';
import { projects } from '@shared/db/schema';

export const appRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects', async () => ProjectListSchema.parse(await db.select().from(projects)));
};
\`\`\`

${options.apps.web || options.apps.mobile || options.apps.desktop || options.apps.extension ? `\`packages/api-client/src/app.ts\`:

\`\`\`ts
import { ProjectListSchema } from '@shared/contracts';
import { ApiClient } from './generated';

export function listProjects(client: ApiClient) {
  return client.request('/projects', { method: 'GET' }, ProjectListSchema);
}
\`\`\`

Import \`listProjects\` and the generated client factory in the frontend surface you are building.` : ''}

Then run \`pnpm db:generate\`, review and commit the migration, run \`pnpm verify\`, apply it to the intended Neon branch with \`pnpm db:migrate\`, and start the relevant app surfaces.` : '';
  const dependencyLines = [
    options.apps.api ? 'frontend apps -> @shared/api-client -> HTTP -> apps/api' : null,
    options.apps.api ? 'frontend apps -> @shared/contracts <- apps/api' : null,
    options.apps.api && options.features.database ? 'apps/api      -> @shared/db -> managed Neon Postgres' : null,
    options.features.electronUpdater ? 'apps/desktop -> updates.<domain> Worker -> private R2 bucket' : null,
  ].filter((value): value is string => value !== null).join('\n');
  const uiTaskSection = Object.values(options.apps).some(Boolean) && (options.apps.web || options.apps.mobile || options.apps.desktop || options.apps.extension)
    ? `### Add UI primitives

\`\`\`sh
anhedral ui add dialog
${options.apps.web ? 'anhedral ui add data-table --target web\n' : ''}\`\`\`

DOM apps receive source-owned shadcn/ui files. Mobile receives React Native Reusables files. Customize those files normally.`
    : '';
  if (includeUserDocs) {
    writeFile(path.join(root, 'README.md'), `# ${markdownHeading(options.displayName)}

This is a complete, readable TypeScript product stack generated by Anhedral ${GENERATOR_VERSION}. Anhedral assembled and connected the tools; application code remains normal framework code.

## Start here

Anhedral installs workspace dependencies during generation unless you used \`--skip-install\`. On a fresh clone, install them and copy the selected environment examples:

\`\`\`sh
${environmentSetupCommands}
\`\`\`

Stop here and replace every required placeholder in those uncommitted files. In particular, \`DATABASE_URL\` must be the pooled connection string for the intended managed Neon branch when the database module is selected. Then generate the initial migration and verify the workspace:

\`\`\`sh
${firstVerificationCommands}
\`\`\`

After verification succeeds, run \`pnpm dev\`. In a full stack this starts the primary web + API development loop, so opening the project does not also launch Expo, Electron, and WXT. Use \`pnpm dev:all\` when you intentionally want every selected surface, or run one surface:

${moduleCommands}

There is no hidden Anhedral application runtime. Open the framework directory you want and write ordinary TypeScript there.

## Where to write code

| Concern | Location | What belongs there |
| --- | --- | --- |
${sourceRows}

${options.apps.api ? 'For an end-to-end feature, define shared contracts first, implement server and persistence behavior, expose it through the typed client, then build each frontend.' : 'Build product features directly inside each selected application using its native framework conventions.'} Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for concrete recipes and [docs/STACK.md](docs/STACK.md) for every selected tool and its official documentation.

## Selected modules

${modules.map((moduleName) => `- \`${moduleName}\``).join('\n')}

## UI and customization

DOM clients use source-owned shadcn/ui. Expo uses React Native Reusables with ${options.nativeStyling}. Add components with \`anhedral ui add <component>\`; use \`--target\` when a component belongs to one client. Customize the resulting source normally.

## Environment and first verification

The setup blocks above are the first-run checklist. Provider secrets stay in their package-local environment files; none belong in client code. This project uses managed Neon and intentionally does not generate or start local Postgres.

## Deployment

Only selected surfaces and providers contribute deployment scripts. Exact-version deployment CLIs run on demand instead of inflating the application lockfile.

| Selection | Delivery target | Strategy |
| --- | --- | --- |
${deploymentRows}

\`\`\`sh
${deploymentCommands}
\`\`\`

Read \`PRODUCTION.md\` before creating accounts or production resources. Generated ownership and tool versions are recorded in \`anhedral.json\`. Run \`anhedral doctor\` before structural changes and preview them with \`--dry-run\`.
`);
  }
    writeFile(path.join(root, 'docs/DEVELOPMENT.md'), `# Developing ${markdownHeading(options.displayName)}

Anhedral generated this stack; it does not replace the frameworks inside it. Use official framework APIs and keep product logic in ordinary source files.

## End-to-end feature loop

${developmentSteps}

${verticalSliceExample}

## Common tasks

${commonTaskSections}

${uiTaskSection}

### Add another app surface

\`\`\`sh
anhedral add mobile --dry-run
anhedral add mobile
\`\`\`

Anhedral refuses ownership conflicts instead of overwriting product changes. Run \`anhedral doctor\` when an add cannot proceed.

## Verification

- While iterating, run the affected package's typecheck or tests.
- Before handoff, run \`pnpm verify\`.
- Before generation, run \`anhedral doctor\` and use \`--dry-run\`.
- For schema changes, commit reviewed migration SQL and run \`pnpm verify:db\`.
`);
    writeFile(path.join(root, 'docs/STACK.md'), `# Stack guide

This maps generated source to upstream documentation. Anhedral owns initial integration and safe incremental generation. Each framework owns its runtime and programming model.

| Tool | Responsibility | Generated location | Official documentation |
| --- | --- | --- | --- |
${toolRows}

## Dependency direction

\`\`\`text
${dependencyLines || 'selected applications are independent framework projects'}
\`\`\`

Clients may import contracts and the API client. They must not import API services, database connections, or server environment modules. Provider secrets terminate at the API or provider-specific Worker.

\`anhedral add\` adds modules and integration files. \`anhedral ui add\` adds source-owned UI. \`anhedral doctor\` checks recorded ownership. Product features, models, pages, routes, and services remain developer-owned TypeScript.
`);
  if (includeUserDocs) {
    const productionItems = [
      options.apps.api ? '- Keep `ANHEDRAL_DEMO=false` in production.' : null,
      options.apps.api ? '- Set `TRUST_PROXY_HOPS` only to the number of trusted reverse-proxy hops.' : null,
      options.apps.api ? '- Store server secrets only in the API deployment environment.' : null,
      options.apps.api || options.apps.web ? '- Select the Vercel Services framework preset and deploy from the repository root.' : null,
      options.apps.api && options.apps.web ? '- Keep the top-level `/api/(.*)` service rewrite before the web catch-all rewrite.' : null,
      options.apps.api && options.apps.web ? '- The web client defaults to same-origin `/api` in production; override `NEXT_PUBLIC_API_URL` only when the API uses another origin.' : null,
      options.features.storage ? '- Set a strong `CRON_SECRET` and verify Vercel invokes `/api/internal/storage/cleanup` on schedule.' : null,
      options.features.billing ? '- Configure `ABLY_API_KEY`, set a strong `CRON_SECRET`, and verify Vercel invokes `/api/internal/realtime/flush` every five minutes to retry the transactional outbox.' : null,
      options.features.billing ? '- Use a dedicated RevenueCat secret REST API key with customer-read access; keep it server-only and rotate it independently from the 32+ character webhook authorization secret.' : null,
      options.features.storage ? '- List the live R2 CORS policy, merge every exact browser origin into `cloudflare/r2-cors.template.json`, then apply the complete replacement policy and verify preflight plus signed PUT.' : null,
      options.features.storage ? '- Configure an R2 lifecycle rule for the `storage/staging/` prefix as a backstop, with an age longer than the application cleanup grace period.' : null,
      options.features.database ? '- Commit every reviewed Drizzle SQL migration and its metadata with the schema change; `pnpm verify:db` rejects a missing or untracked SQL baseline and validates migration history.' : null,
      options.features.database ? '- Generated CI runs `pnpm db:generate` and fails when `packages/db/migrations` changes, preventing schema changes without a matching migration.' : null,
      '- Run `pnpm verify` before deployment.',
      '- Run `anhedral doctor` before incremental generation.',
    ].filter((item): item is string => item !== null);
    const productionSections = [
      options.apps.web || options.apps.api || options.features.storage ? `## Domain registration and Cloudflare control plane

Registration and DNS hosting are separate jobs. You can buy the domain at GoDaddy while Cloudflare becomes authoritative DNS immediately; transferring the registrar later is optional.

1. Buy the domain at GoDaddy under an organization-controlled account. Enable auto-renewal, MFA, accurate registrant contact details, and record renewal ownership.
2. Add the domain as a website/zone in Cloudflare. Before changing nameservers, copy every existing DNS record—especially MX, TXT, DKIM, SPF, DMARC, verification, and subdomain records—and disable DNSSEC/DS records at GoDaddy if enabled.
3. Cloudflare assigns two authoritative nameservers. Replace the GoDaddy nameservers with those exact values, then wait until Cloudflare marks the zone **Active**. Recreate and verify mail and other records before considering the migration complete. Re-enable DNSSEC in Cloudflare after activation.
4. Optional registrar transfer: after the domain is eligible (commonly not within 60 days of registration, a prior transfer, or certain registrant changes), unlock it at GoDaddy, request its EPP/authorization code, and start **Transfer Domains** in Cloudflare. Approve the transfer and payment. DNS can remain live throughout because Cloudflare was already authoritative.
5. Keep Cloudflare as the shared domain control plane: DNS and DNSSEC at the zone; Workers and R2 for the asset hostname; and optional Queues, Workflows, Durable Objects, WAF, Turnstile, or other compute/security products when the application actually needs them. Vercel remains the web/API runtime.

Use organization-owned Cloudflare and GoDaddy accounts with MFA and least-privilege member roles. Do not confuse changing nameservers (DNS delegation) with transferring the registration (registrar/billing ownership). Follow the current [GoDaddy nameserver instructions](https://help.dc-aws.godaddy.com/help/edit-my-domain-nameservers-664), [GoDaddy transfer-away sequence](https://www.godaddy.com/en-ca/help/transfer-my-domain-away-from-godaddy-3560), [Cloudflare nameserver guidance](https://developers.cloudflare.com/dns/nameservers/update-nameservers/), and [Cloudflare registrar-transfer sequence](https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/).` : null,
      options.apps.web || options.apps.api ? `## Vercel: web and API

1. Push the repository to GitHub and import it in Vercel. Choose the **Services** framework preset and keep the repository root as the project root; \`vercel.json\` maps the selected \`apps/web\` and \`apps/api\` services.
2. Add every required variable from the package-local \`.env.example\` files to Vercel's Development, Preview, and Production environments. Server secrets belong only to the API service. Never put a secret in a \`NEXT_PUBLIC_*\` variable.
3. Run \`pnpm deploy:vercel:link\` for local CLI access. The normal release path is Git: every non-production branch/PR receives a preview deployment, and merging to the configured production branch creates production automatically. The explicit \`deploy:vercel:preview\` and \`deploy:vercel:production\` scripts are escape hatches for manual releases.
4. Run \`pnpm deploy:vercel:inspect -- <deployment-url>\` when diagnosing a deployment. Verify health, authentication, scheduled jobs, and provider callbacks in Preview before merging.
5. Add \`app.example.com\` in Vercel **Project → Settings → Domains** before changing DNS. Inspect it with \`pnpm deploy:vercel:domain:inspect -- app.example.com\`, then create the exact A/CNAME/TXT records Vercel reports in Cloudflare DNS. Leave the Vercel A/CNAME record **DNS only** (gray cloud), because placing Cloudflare's reverse proxy in front of Vercel hides traffic signals, adds another CDN hop, and can interfere with Vercel caching/firewall behavior. Ownership-verification TXT records are also DNS only. Vercel provisions TLS after validation.

When web and API are both selected, keep the generated \`/api/(.*)\` route before the web catch-all. The browser uses same-origin \`/api\`; mobile, desktop, and extension builds need the absolute production API URL.` : null,
      options.features.auth ? `## Clerk: production identity

1. Create the Clerk application for development, then create its separate **Production** instance. Copy \`pk_live_*\` and \`sk_live_*\` keys into the production environments; keep \`CLERK_SECRET_KEY\` server-only.
2. Add the production root domain in Clerk and publish the DNS records shown on **Domains**. Configure a subdomain allowlist, production OAuth credentials, allowlisted redirect URLs, webhook URLs/signing secrets, and native application identifiers that apply to the selected clients.
3. Use development keys locally and production keys only for production builds. Vercel Preview deployments should use a separate Clerk application/domain when stable preview auth is required; do not point previews at live user data.
4. Redeploy every selected client after changing public Clerk keys. Test sign-in, sign-out, token refresh, deep links, and physical-device behavior before release.${options.apps.extension ? '\n5. For the extension, create a stable CRX ID, configure Clerk Chrome Extension deployment for that ID, and set `VITE_CLERK_FRONTEND_API_URL` plus `VITE_CLERK_SYNC_HOST` when using web-to-extension session sync. OAuth and email-link flows require Sync Host.' : ''}` : null,
      options.features.database ? `## Neon and Drizzle: database

1. Create a Neon account, then run \`pnpm neon:login\` and \`pnpm neon:project:create -- --name ${options.projectName}\`, or create the project in the Neon console.
2. Copy the pooled Postgres connection string to \`DATABASE_URL\` in \`packages/db/.env\` locally and the API's Vercel environment in production. Keep preview and production databases isolated with Neon branches or separate projects.
3. Change the Drizzle schema, run \`pnpm db:generate\`, review and commit the SQL and metadata, then run \`pnpm verify:db\`.
4. Apply \`pnpm db:migrate\` against the intended database as a controlled release step before sending production traffic to code that requires the new schema. Backward-compatible migrations make rollback safer; never run unreviewed migration generation during a Vercel build.
5. Enable Neon backups/restore controls appropriate to the plan, restrict credentials, and rotate a leaked connection string immediately.` : null,
      options.features.storage ? `## Cloudflare R2: private bucket and generated Worker

1. Run \`pnpm r2:login\` and \`pnpm r2:bucket:create\` to create \`${storageBucketName}\`, or create that bucket in **R2 → Overview**. Keep both the \`r2.dev\` development URL and R2 bucket custom-domain access disabled; the bucket itself remains private.
2. Create an Object Read & Write S3 API token scoped to this bucket. Put \`BASE_URL\`, \`R2_ACCOUNT_ID\`, \`R2_ACCESS_KEY_ID\`, \`R2_SECRET_ACCESS_KEY\`, \`R2_BUCKET_NAME=${storageBucketName}\`, \`R2_PREFIX=storage\`, and \`R2_PROXY_READ_URL_TTL_SECONDS=600\` in the API deployment. The Worker uses the in-process \`ASSETS\` binding instead of these S3 credentials. Keep \`CLOUDFLARE_API_TOKEN\` operations/CI-only for Wrangler.
3. Direct browser uploads continue to use short-lived presigned PUT URLs on \`<ACCOUNT_ID>.r2.cloudflarestorage.com\`. Presigned URLs do **not** work on custom domains. Run \`pnpm r2:cors:list\`, edit the user-owned \`cloudflare/r2-cors.template.json\`, then run \`pnpm r2:cors:set\`. The set command replaces the complete live policy, so retain every exact uploading origin.
4. Open \`apps/assets-private-proxy/wrangler.jsonc\`. Replace both \`assets.example.com\` values with \`assets.yourdomain.com\`. The generated config names the Worker \`assets-private-proxy\`, disables \`workers.dev\` and preview URLs, binds \`${storageBucketName}\` as \`ASSETS\`, sets \`R2_PREFIX=storage\`, enables logs, and declares the hostname as a Worker Custom Domain.
5. Run \`pnpm assets:proxy:check\`, then \`pnpm assets:proxy:deploy\`. Wrangler creates or updates the Worker, R2 binding, managed proxied DNS record, TLS certificate, and custom domain. The dashboard equivalent is **Workers & Pages → assets-private-proxy → Settings → Bindings** (R2, variable \`ASSETS\`, bucket \`${storageBucketName}\`) and **Domains & Routes → Add → Custom domain**.
6. The Worker streams GET/HEAD bodies, preserves metadata/ranges/conditionals, caches complete public responses, rejects other methods and unexpected hosts, and never lists the bucket. It exposes only \`storage/confirmed/\` by unguessable key; \`storage/staging/\` and \`generation-inputs\` return 404. Authenticated private reads use \`GET /api/storage/uploads/:uploadId/read-url\`, which verifies ownership before returning a short-lived S3 URL.
7. Add an R2 lifecycle rule for \`storage/staging/\` longer than the API cleanup grace period. Set a strong \`CRON_SECRET\` in Vercel and verify cleanup. Test missing keys, invalid encodings, GET, HEAD, range, conditional, cache HIT/MISS, forbidden methods, private-prefix rejection, authenticated read authorization, TTL bounds, and direct bucket inaccessibility.

\`app.yourdomain.com\` is a Cloudflare DNS-only record targeting Vercel. \`assets.yourdomain.com\` is a Cloudflare-managed Worker Custom Domain and stays proxied. Never connect the asset hostname directly to R2, never CNAME it to \`r2.dev\`, and never expose S3 credentials in a client bundle.` : null,
      options.apps.mobile ? `## Expo, TestFlight, and app stores

Accounts required: an Expo/EAS account, an Apple Developer Program membership with App Store Connect access for iOS, and a Google Play Console developer account for Android. Create unique iOS bundle and Android package identifiers before the first store build.

1. Run \`pnpm mobile:eas:login\`, then \`pnpm mobile:eas:init\` from the repository root to create/link the EAS project. Review and commit the project ID/configuration that EAS adds.
2. Put public build-time values in the matching EAS environment/profile; keep server secrets out of Expo. Configure Apple/Google credentials with EAS and test sign-in/deep links on physical devices.
3. Internal EAS distribution: run \`pnpm mobile:build:internal:ios\` and/or \`pnpm mobile:build:internal:android\`. iOS ad hoc distribution requires registered device UDIDs; Android internal builds can be installed from the EAS share URL. These builds do not require a development server.
4. TestFlight: run \`pnpm mobile:build:production:ios\`, then \`pnpm mobile:submit:ios\`. After App Store Connect processes the build, assign it to internal testers. External testers require TestFlight Beta App Review. TestFlight approval is not App Store production approval.
5. Google Play: create the app/listing and required policy declarations in Play Console. Run \`pnpm mobile:build:production:android\`, then \`pnpm mobile:submit:android\`. Start with the internal testing track, promote through closed/open testing as appropriate, and only then roll out production. A brand-new Play app may require its first binary to be uploaded manually before API-based submissions work.
6. Complete store metadata, screenshots, privacy/data-safety declarations, content ratings, export compliance, pricing/availability, review credentials, and release notes. Submit for store review and use staged/phased rollout where appropriate.` : null,
      options.apps.extension ? `## Chrome Web Store

1. Register a Chrome Web Store developer account, verify its contact email, accept the agreement, and pay Google's one-time registration fee.
2. Configure production extension environment values and a stable CRX public key/ID, then run \`pnpm verify:extension\` and \`pnpm extension:zip\`. Load the unpacked production build in Chrome first and test install, update, permissions, authentication, API calls, and sign-out.
3. In the Developer Dashboard, create an item and upload the ZIP from \`apps/extension/.output\`. Complete the listing (description, icons, screenshots, category, regions) and keep the manifest version higher for every update.
4. State one narrow purpose, justify every permission/host permission, disclose all handled data, certify limited use, and provide a public privacy-policy URL consistent with actual behavior. Clerk login counts as handling authentication data. Supply reviewer test instructions and credentials when features are gated.
5. Publish first to trusted testers/unlisted visibility, verify the store-installed CRX ID matches Clerk and backend allowlists, then submit the production listing for review. Store review and rollout are separate from GitHub/Vercel deployment.` : null,
      options.features.electronUpdater ? `## Electron desktop and automatic updates

The generated update path is \`electron-updater -> updates.<domain> Worker -> private ${desktopUpdatesBucketName(options.projectName)} R2 bucket\`. The application never receives Cloudflare credentials, the Worker exposes reads only, and direct bucket access stays disabled.

1. In \`apps/desktop-updater-worker/wrangler.jsonc\`, replace both \`updates.example.com\` values with a hostname in an active Cloudflare zone. Run \`pnpm desktop:updates:cloudflare:login\`, then run \`pnpm desktop:updates:first-provision\` exactly once to create the private bucket and deploy the bound Worker, managed DNS record, TLS certificate, logs, and custom domain. For repeat deployments use \`pnpm desktop:updates:worker:deploy\`; bucket creation is intentionally not repeated. Keep the bucket's \`r2.dev\` URL and R2 bucket custom-domain access disabled.
2. Copy \`apps/desktop/electron-builder.env.example\` to \`apps/desktop/electron-builder.env\` and set \`DESKTOP_UPDATE_BASE_URL\` to that exact HTTPS origin with no trailing slash. electron-builder writes the platform/architecture URL into the packaged app's update configuration; no update secret is embedded.
3. Increase \`apps/desktop/package.json\`'s version for every release. Build on each target OS using \`pnpm desktop:updates:build:mac\`, \`pnpm desktop:updates:build:win\`, or \`pnpm desktop:updates:build:linux\`. Configure macOS signing/notarization and Windows code-signing credentials in CI, never in the repository.
4. From the repository root, upload one architecture at a time, for example \`pnpm desktop:updates:publish -- --platform mac --arch arm64\`. The publisher accepts only known platform/architecture values, uploads immutable installers and blockmaps first, then uploads mutable \`latest*.yml\` metadata last. Run it only after signing succeeds.
5. Install the previous signed version, publish a newer version, and verify update discovery, range downloads, signature validation, restart/install, rollback behavior, and logs on macOS, Windows, and the supported Linux package path. Test clean install, deep links, Clerk return flow, and OS security warnings too.

The Worker accepts GET/HEAD only, validates the configured hostname and \`releases/\` prefix, supports conditionals and single-range downloads, serves metadata with \`no-store\`, and serves versioned artifacts as immutable. See \`cloudflare/desktop-updates.md\` for the generated resource contract.` : options.apps.desktop ? `## Electron desktop

Builds are platform-specific: produce macOS, Windows, and Linux artifacts on their matching CI runners with the package's \`build:mac\`, \`build:win\`, and \`build:linux\` scripts. Configure signing/notarization credentials in CI, never in the repository. Test clean install, upgrade, deep links, Clerk return flow, auto-update strategy, and OS security warnings before publishing artifacts to the chosen release channel.` : null,
    ].filter((section): section is string => section !== null);
    writeFile(path.join(root, 'PRODUCTION.md'), `# ${markdownHeading(options.displayName)} production guide

This guide includes only the surfaces and providers selected when the project was generated. Provision separate Preview and Production resources, use least-privilege credentials, and keep account ownership with the organization rather than an individual developer.

## Release gate

${productionItems.join('\n')}

${productionSections.join('\n\n')}

## Final release order

- Run \`pnpm verify\` and \`anhedral doctor\`; review the exact production diff.
${options.features.database ? '- Apply reviewed, backward-compatible database migrations.' : ''}
${options.apps.web || options.apps.api ? '- Deploy provider infrastructure and secrets, then deploy API/web.' : ''}
${options.apps.mobile || options.apps.extension || options.apps.desktop ? '- Build immutable client artifacts only after production URLs and public keys are final.\n- Release to internal testers, verify telemetry and rollback, then promote through each store review/rollout.' : ''}
`);
  }
  writeFile(path.join(root, 'ANHEDRAL.md'), `# Anhedral-managed project information

Generator: ${GENERATOR_VERSION}

Resolved modules: ${modules.join(', ')}

- \`anhedral add <module> --dry-run\` previews incremental changes.
- \`anhedral upgrade --dry-run\` previews a supported generator migration.
- \`anhedral ui add <component> --dry-run\` previews platform-routed component additions.
- \`anhedral doctor\` reports manifest and filesystem drift before incremental changes.
- README and existing user workflows are never rewritten by \`anhedral add\`.
`);
  const surfaceGuidance = [
    options.apps.web ? '- Web lives in `apps/web`: use Next.js App Router, server-first rendering, and shadcn/ui source components.' : null,
    options.apps.mobile ? `- Mobile lives in \`apps/mobile\`: use Expo Router and React Native Reusables with ${options.nativeStyling}. Keep native-only APIs behind platform-safe modules.` : null,
    options.apps.api ? '- HTTP and provider integration lives in `apps/api`: keep Fastify routes thin, validate boundaries, and put secrets only in server environment files.' : null,
    options.apps.desktop ? '- Desktop lives in `apps/desktop`: keep Electron main/preload privileges minimal and application UI in the sandboxed React renderer.' : null,
    options.features.electronUpdater ? '- Desktop update delivery lives in `apps/desktop-updater-worker`: keep the R2 bucket private, the Worker read-only, and the Worker Custom Domain aligned with `DESKTOP_UPDATE_BASE_URL`.' : null,
    options.apps.extension ? '- Browser extension code lives in `apps/extension`: use WXT entrypoints and request only permissions required by the feature.' : null,
    options.features.storage ? '- Private-bucket asset delivery lives in `apps/assets-private-proxy`: preserve the `ASSETS` R2 binding, streaming responses, method/host restrictions, and Cloudflare-managed custom domain.' : null,
  ].filter((value): value is string => value !== null).join('\n');
  const featureGuidance = [
    options.apps.api ? '- Reuse `@shared/contracts` at every network boundary and call the API through `@shared/api-client`; clients must not import server implementation modules.' : null,
    options.features.database ? '- Neon/Drizzle state is authoritative. Change user-owned `packages/db/src/app-schema.ts`, generate SQL with `pnpm db:generate`, review it, and Git-track the migration.' : null,
    options.features.auth ? '- Clerk owns identity and sessions. Never trust a client-supplied user ID; derive identity from verified server authentication.' : null,
    options.features.billing ? '- RevenueCat events reconcile into Neon before Ably publishes an invalidation. Clients refetch entitlements instead of treating realtime payloads as authority.' : null,
    options.features.storage ? '- R2 credentials and signed-upload policy stay in the API. The `assets-private-proxy` Worker uses its binding instead of S3 credentials and publicly serves GET/HEAD only by known unguessable key.' : null,
    options.features.electronUpdater ? '- Electron releases use `electron-updater` through the generated private R2 + Worker channel. Build signed native artifacts first and publish mutable channel metadata last.' : null,
  ].filter((value): value is string => value !== null).join('\n');
  const skillFeatureSteps = [
    options.apps.api ? 'Define shared network schemas in user-owned `packages/contracts/src/app.ts`.' : null,
    options.features.database ? 'Define persistent state in user-owned `packages/db/src/app-schema.ts`; generate, review, and commit Drizzle SQL. Use managed Neon, never a generated local Postgres service.' : null,
    options.apps.api ? 'Put backend behavior in focused `apps/api/src/<feature>.ts` modules and register product routes in user-owned `apps/api/src/routes/app.ts`.' : null,
    options.apps.api ? 'Add client-safe calls to user-owned `packages/api-client/src/app.ts`; frontends must not import server implementations.' : null,
    options.apps.web ? 'Write web product code with normal Next.js App Router conventions in `apps/web`.' : null,
    options.apps.mobile ? 'Write native product code with normal Expo Router conventions in `apps/mobile`.' : null,
    'Verify the affected package, then run the root verification before handoff.',
  ].filter((value): value is string => value !== null).map((value, index) => `${index + 1}. ${value}`).join('\n');
  writeFile(path.join(root, 'SKILL.md'), `---
name: anhedral-project
description: Build and extend this Anhedral-generated ${modules.join(', ')} TypeScript application while preserving its framework, ownership, security, and verification conventions.
---

# Anhedral project

Use this skill whenever you plan, implement, review, or diagnose work in this repository.

## Product model

This is a standard TypeScript monorepo assembled by Anhedral, not an application running inside an Anhedral framework. Write normal Next.js, Expo Router, Fastify, Drizzle, Electron, or WXT code in the generated workspace. Use Anhedral only for structural operations such as adding a module, adding source-owned UI, and checking generated-file ownership.

Before implementing a feature, read \`README.md\` for the source map, \`docs/DEVELOPMENT.md\` for task recipes, and \`docs/STACK.md\` when you need the selected tools' responsibility boundaries and official documentation.

## Start safely

1. Read \`anhedral.json\` for the selected modules, native styling provider, installed UI components, and file ownership.
2. Run \`pnpm dlx anhedral@${GENERATOR_VERSION} doctor\` before generator operations. If it reports a supported older generator, preview and apply \`anhedral upgrade\` before continuing.
3. Preview structural changes with \`anhedral upgrade --dry-run\`, \`anhedral add <module> --dry-run\`, or \`anhedral ui add <component> --dry-run\` as applicable.
4. Never hand-edit \`anhedral.json\`, ownership hashes, or bundled-template provenance.

Resolved modules: ${modules.map((moduleName) => `\`${moduleName}\``).join(', ')}.

## Repository boundaries

${surfaceGuidance}

- Shared source belongs in focused packages under \`packages/\`; do not create a second workspace, lockfile, or nested dependency island.
${featureGuidance}

## Feature workflow

${skillFeatureSteps}

## UI conventions

- Add source-owned components with \`pnpm dlx anhedral@${GENERATOR_VERSION} ui add <component>\`; use \`--target\` only when the component should not exist in every selected client.
- Web, desktop, and extension components come from shadcn/ui. Mobile components come from React Native Reusables using ${options.nativeStyling}.
- Compose application-specific UI around installed primitives. Preserve accessibility, keyboard behavior, focus handling, and platform conventions.
- Use lowercase kebab-case filenames, PascalCase component exports, and \`use-\` prefixes for hooks.

## Ownership rules

- \`README.md\`, \`PRODUCTION.md\`, product UI, and the backend \`app.ts\`/\`app-schema.ts\` extension seams are user-owned. Root JSON/YAML configuration is mergeable. Other recorded files are generator-managed unless \`anhedral.json\` says otherwise.
- Prefer new application files and narrow composition points over editing managed substrate files. If a managed file must change, understand that future \`anhedral add\` operations will stop until the project is reconciled.
- Never overwrite user changes, bypass a generator conflict, or replace a failed ownership check with fabricated hashes.

## Environment and security

- The root \`.env.example\` is an inventory, not a runtime environment file. Copy package-local examples and keep real environment files uncommitted.
- Keep server secrets out of browser, Expo, Electron renderer, and extension bundles. Only variables with the framework's explicit public prefix may enter client code.
- Validate external input at the API boundary, use parameterized Drizzle queries, and keep privileged Electron functionality behind a narrow context-isolated preload bridge.

## Deployment conventions

### Agent-assisted provisioning

When the user asks you to provision this project:

1. Ask for the exact environment and custom domain first. Record canonical resource names and selected provider teams without recording secrets.
2. Inspect whether Computer Use/browser control and subagents are available. With Computer Use, navigate provider dashboards and complete approved non-secret setup. Stop for the user at sign-in, password, passkey, MFA, CAPTCHA, paid purchase, destructive replacement, secret generation/reveal/rotation, and final release/store submission.
3. If subagents are available, keep one lead agent responsible for mutations. Delegate bounded independent tasks only: one subagent reads this project's docs and environment examples, one performs read-only DNS/hostname checks, and one performs final read-only verification. Never send credentials, cookies, or secret values to a subagent, and never let two agents mutate the same provider or DNS zone.
4. At every secret-generation screen, stop before the final button. Tell the user the exact button, variable name, and uncommitted package-local environment file. The user clicks and pastes the value directly into that file or the provider's protected field, never into chat. Validate presence without printing populated environment files.
5. Read \`PRODUCTION.md\` completely and follow its selection-specific order. Do not claim completion until cloud resources, environment names, DNS, TLS, application health, and the verification commands below pass.

Domain topology: Cloudflare is authoritative DNS; Vercel hosts web/API; the Vercel A/CNAME/TXT records are created in Cloudflare DNS and normally remain DNS-only. Generated Worker hostnames such as \`assets.<domain>\` or \`updates.<domain>\` are Cloudflare Worker Custom Domains created by Wrangler, not CNAMEs to Vercel or public R2 endpoints.

- Read \`PRODUCTION.md\` before provisioning or changing production resources. It is tailored to this project's selected surfaces and providers.
${options.apps.web || options.apps.api ? '- Prefer GitHub-triggered Vercel Preview and Production deployments. Keep the generated Services routing intact; use manual `deploy:vercel:*` scripts only when explicitly required.' : ''}
${options.features.database ? '- Treat reviewed, committed Drizzle SQL as the release artifact. Apply migrations as a controlled step against the intended Neon environment; never generate migrations during an application build.' : ''}
${options.features.storage ? '- Keep the R2 bucket private and deploy `assets-private-proxy` at the Cloudflare Worker custom domain. Expose only `storage/confirmed/` publicly; use the owner-authorized read-URL endpoint for private objects and keep `CLOUDFLARE_API_TOKEN` operations-only.' : ''}
${options.features.electronUpdater ? '- Provision the private desktop-update R2 bucket and deploy `desktop-updater` at `updates.<domain>`. Keep the update origin identical in Wrangler and `electron-builder.env`, then publish signed per-platform artifacts before channel metadata.' : ''}
${options.apps.mobile ? '- Promote mobile artifacts through EAS internal distribution, TestFlight/Google Play testing, then store review. Build-time public variables are not secrets.' : ''}
${options.apps.extension ? '- Publish the exact verified WXT ZIP through trusted/unlisted Chrome Web Store testing before production review; preserve a stable CRX ID and least-privilege permissions.' : ''}

## Verify changes

Run the strongest applicable checks before handing work back:

\`\`\`sh
pnpm typecheck
pnpm verify
pnpm build
pnpm dlx anhedral@${GENERATOR_VERSION} doctor
\`\`\`

Use the package-specific \`verify:*\` scripts while iterating. A database schema change is incomplete until its reviewed migration is Git-tracked. Report exact failing packages and commands; do not weaken checks to make a change pass.
`);
}

function collectFiles(root: string, relativeRoot = ''): string[] {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!pathEntryExists(absoluteRoot)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (GENERATED_CACHE_NAMES.has(entry.name)) continue;
    const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
    if (relativePath === 'anhedral.json' || isTransactionMetadata(relativePath)) continue;
    if (entry.isDirectory()) files.push(...collectFiles(root, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

function ownerForPath(relativePath: string): ModuleId | 'root' {
  if (relativePath.startsWith('apps/desktop-updater-worker/')) return 'electron-updater';
  if (relativePath === 'apps/desktop/scripts/publish-updates.mjs') return 'electron-updater';
  if (relativePath === 'apps/desktop/electron-builder.env.example') return 'electron-updater';
  if (relativePath === 'cloudflare/desktop-updates.md') return 'electron-updater';
  if (relativePath.startsWith('apps/assets-private-proxy/')) return 'storage';
  if (relativePath.startsWith('cloudflare/')) return 'storage';
  const app = /^apps\/(web|mobile|api|desktop|extension)(?:\/|$)/.exec(relativePath);
  if (app) return app[1] as ModuleId;
  if (relativePath.startsWith('packages/db/')) return 'db';
  return 'root';
}

function defaultOwnership(relativePath: string): FileOwnershipClass {
  if (relativePath === 'README.md' || relativePath === 'PRODUCTION.md') return 'user';
  if (relativePath === 'apps/assets-private-proxy/wrangler.jsonc') return 'user';
  if (relativePath === 'apps/desktop-updater-worker/wrangler.jsonc') return 'user';
  if (relativePath === 'cloudflare/r2-cors.template.json') return 'user';
  if (
    relativePath === 'apps/web/app/page.tsx'
    || /^apps\/web\/components\//.test(relativePath)
    || relativePath === 'apps/mobile/app/index.tsx'
    || /^apps\/mobile\/components\//.test(relativePath)
    || relativePath === 'apps/desktop/src/main/app-window.ts'
    || /^apps\/desktop\/src\/renderer\/components\//.test(relativePath)
    || /^apps\/extension\/src\/components\//.test(relativePath)
    || relativePath === 'apps/api/src/routes/app.ts'
    || /^apps\/api\/src\/services\//.test(relativePath)
    || relativePath === 'packages/contracts/src/app.ts'
    || relativePath === 'packages/api-client/src/app.ts'
    || relativePath === 'packages/db/src/app-schema.ts'
  ) return 'user';
  if (ROOT_MERGEABLE_FILES.has(relativePath)) return 'mergeable';
  return 'managed';
}

function applyCurrentOwnership(manifest: ProjectManifest): ProjectManifest {
  const files = Object.freeze(Object.fromEntries(Object.entries(manifest.files).map(([relativePath, record]) => [
    relativePath,
    record.ownership === 'managed' && defaultOwnership(relativePath) === 'user'
      ? Object.freeze({ ...record, ownership: 'user' as const })
      : record,
  ])));
  return Object.freeze({ ...manifest, files });
}

function preserveUserOwnedFiles(root: string, stageRoot: string, manifest: ProjectManifest): void {
  for (const [relativePath, record] of Object.entries(manifest.files)) {
    if (record.ownership !== 'user') continue;
    const current = path.join(root, relativePath);
    const staged = path.join(stageRoot, relativePath);
    const currentStat = lstatIfPresent(current);
    const stagedStat = lstatIfPresent(staged);
    if (!currentStat?.isFile()) continue;
    if (stagedStat?.isSymbolicLink() || (stagedStat && !stagedStat.isFile())) {
      throw new Error(`Refusing to replace user-owned path with a non-file: ${relativePath}`);
    }
    if (stagedStat?.isFile() && readFileSync(current).equals(readFileSync(staged))) continue;
    mkdirSync(path.dirname(staged), { recursive: true });
    copyFileSync(current, staged);
    chmodSync(staged, Number(currentStat.mode) & 0o777);
  }
}

function createProjectManifest(
  root: string,
  options: ResolvedInitOptions,
  operation: 'init' | 'add',
  templates: TemplateProvenanceMap,
  previous?: ProjectManifest,
  components: readonly UiComponentInstall[] = previous?.ui.components ?? [],
): ProjectManifest {
  const contributions = new Map<ModuleId | 'root', ModulePlanContribution['files'][number][]>();
  for (const relativePath of collectFiles(root)) {
    const previousRecord = previous?.files[relativePath];
    const ownership = previousRecord?.ownership ?? defaultOwnership(relativePath);
    const owner = previousRecord?.owner ?? ownerForPath(relativePath);
    const files = contributions.get(owner) ?? [];
    files.push({
      path: relativePath,
      ownership,
      content: readFileSync(path.join(root, relativePath), 'utf8'),
    });
    contributions.set(owner, files);
  }
  const plan = buildGenerationPlan({
    operation,
    requestedModules: options.modules,
    contributions: [...contributions].map(([module, files]) => ({ module, files })),
  });
  const manifest = createManifest({
    generatorVersion: GENERATOR_VERSION,
    project: { name: options.projectName, displayName: options.displayName },
    plan,
    toolchain: options.toolchainChannel,
    templates,
    nativeStyling: options.nativeStyling,
    components,
  });
  const files = Object.freeze(Object.fromEntries(Object.entries(manifest.files).map(([relativePath, record]) => [
    relativePath,
    Object.freeze({
      ...record,
      hash: hashContent(readFileSync(path.join(root, relativePath))),
      mode: normalizedFileMode(lstatSync(path.join(root, relativePath)).mode),
    }),
  ])));
  return Object.freeze({ ...manifest, files });
}

function writeManifest(root: string, manifest: ProjectManifest): void {
  writeFile(path.join(root, 'anhedral.json'), serializeManifest(manifest));
}

function readProjectManifest(
  root: string,
  options: { allowSupportedUpgrade?: boolean } = {},
): ProjectManifest {
  const filePath = path.join(root, 'anhedral.json');
  if (!pathEntryExists(filePath)) throw new Error('anhedral.json was not found. Run anhedral init first.');
  const manifest = readManifest(readFileSync(filePath, 'utf8'));
  if (manifest.generatorVersion !== GENERATOR_VERSION) {
    if (options.allowSupportedUpgrade && isSupportedProjectUpgrade(manifest.generatorVersion, GENERATOR_VERSION)) {
      return manifest;
    }
    const nextStep = isSupportedProjectUpgrade(manifest.generatorVersion, GENERATOR_VERSION)
      ? 'Run anhedral upgrade before adding modules.'
      : 'Regenerate the project with the current CLI before adding modules.';
    throw new Error(
      `This project was generated by Anhedral ${manifest.generatorVersion}; current CLI ${GENERATOR_VERSION} only supports exact-current projects. `
      + nextStep,
    );
  }
  assertTemplateProvenance(manifest.modules, manifest.templates);
  return manifest;
}

function cleanNestedArtifacts(root: string): void {
  rmSync(path.join(root, 'node_modules'), { recursive: true, force: true });
  const appsRoot = path.join(root, 'apps');
  if (!pathEntryExists(appsRoot)) return;
  for (const app of readdirSync(appsRoot, { withFileTypes: true })) {
    if (!app.isDirectory()) continue;
    for (const artifact of ['.git', 'node_modules', 'package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock']) {
      rmSync(path.join(appsRoot, app.name, artifact), { recursive: true, force: true });
    }
  }
}

function selectedUiTargets(options: Pick<ResolvedInitOptions, 'apps'>): UiTarget[] {
  return UI_TARGETS.filter((target) => options.apps[target]);
}

function installSelectedUiComponents(root: string, options: ResolvedInitOptions): readonly UiComponentInstall[] {
  const installs = resolveUiInstalls(options.uiComponents, selectedUiTargets(options), options.nativeStyling);
  if (installs.length > 0 && !options.dryRun) installUiComponents(root, installs);
  return installs;
}

function installWorkspaceDependencies(root: string): void {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  execFile(executable, ['install', '--no-frozen-lockfile'], root);
}

async function writeSelectedModules(
  root: string,
  options: ResolvedInitOptions,
): Promise<TemplateProvenanceMap> {
  const templates = materializeTemplates(root, resolveModules(options.modules).resolvedModules);
  const shared = projectOptions(options);
  scaffoldSharedPackages(root, shared);
  if (options.apps.api) await scaffoldApi(root, shared);
  if (options.apps.mobile) await scaffoldMobile(root, shared);
  if (options.apps.web) await scaffoldWeb(root, shared);
  if (options.apps.desktop) await scaffoldDesktop(root, shared);
  if (options.apps.extension) await scaffoldExtension(root, shared);
  if (options.features.storage) scaffoldAssetsPrivateProxy(root, shared);
  if (options.features.electronUpdater) scaffoldElectronUpdater(root, shared);
  return templates;
}

function printPlan(operation: 'init' | 'add' | 'upgrade', paths: readonly string[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ operation, paths }, null, 2));
    return;
  }
  anhedralPrint.info(`${operation} plan: ${paths.length} path${paths.length === 1 ? '' : 's'}`);
  for (const relativePath of paths) console.log(`  ${relativePath}`);
}

function assertSafeChangedPaths(
  root: string,
  stageRoot: string,
  manifest: ProjectManifest,
  paths: string[],
  deleting: ReadonlySet<string> = new Set(),
): void {
  for (const relativePath of paths) {
    if (relativePath === 'anhedral.json') continue;
    const target = path.join(root, relativePath);
    const record = manifest.files[relativePath];
    const targetStat = lstatIfPresent(target);
    if (targetStat?.isSymbolicLink()) throw new Error(`Refusing to modify symbolic-link path: ${relativePath}`);
    if (targetStat && !record) {
      throw new Error(`Refusing to overwrite unowned path: ${relativePath}`);
    }
    if (!record || !targetStat) continue;
    assertManagedFileMode(relativePath, record, targetStat);
    const actualHash = hashContent(readFileSync(target));
    if (record.ownership === 'user' && actualHash !== record.hash) {
      throw new Error(`Refusing to modify user-owned path: ${relativePath}`);
    }
    if (record.ownership === 'managed' && actualHash !== record.hash) {
      throw new Error(`Managed file has user modifications: ${relativePath}`);
    }
    if (!deleting.has(relativePath) && !pathEntryExists(path.join(stageRoot, relativePath))) {
      throw new Error(`Internal plan error: staged path is missing: ${relativePath}`);
    }
  }
}

function stagedFileDiff(root: string, stageRoot: string, manifest?: ProjectManifest): { changed: string[]; deleted: string[] } {
  const changed = [...collectFiles(stageRoot), 'anhedral.json'].filter((relativePath) => {
    const target = path.join(root, relativePath);
    const targetStat = lstatIfPresent(target);
    if (!targetStat) return true;
    if (targetStat.isSymbolicLink()) throw new Error(`Refusing to compare symbolic-link path: ${relativePath}`);
    const stagedTarget = path.join(stageRoot, relativePath);
    const stagedStat = lstatSync(stagedTarget);
    const targetMode = normalizedFileMode(targetStat.mode);
    const stagedMode = normalizedFileMode(stagedStat.mode);
    return !readFileSync(target).equals(readFileSync(stagedTarget))
      || (targetMode !== null && stagedMode !== null && targetMode !== stagedMode);
  });
  const deleted = Object.keys(manifest?.files ?? {}).filter((relativePath) =>
    pathEntryExists(path.join(root, relativePath)) && !pathEntryExists(path.join(stageRoot, relativePath)));
  return { changed, deleted };
}

export async function scaffoldProject(inputOptions: InitOptions): Promise<void> {
  const options = canonicalInitOptions(inputOptions);
  assertInstallNodeCompatibility(options);
  const root = path.resolve(options.rootDirectory ?? process.cwd());
  let createdRoot = false;
  if (!pathEntryExists(root)) {
    mkdirSync(root);
    createdRoot = true;
  }
  const previousChannel = env.ANHEDRAL_TOOLCHAIN;
  env.ANHEDRAL_TOOLCHAIN = options.toolchainChannel;
  const commitPaths: string[] = [];
  const seedPaths: string[] = [];
  try {
    anhedralPrint.banner(`Initializing ${options.displayName}`);
    const planned = await runStagedTransaction(root, {
      commitPaths,
      seedPaths,
      dryRun: options.dryRun,
      prepare: () => {
        ensureScaffoldRoot(root);
        if (pathEntryExists(path.join(root, '.gitignore'))) seedPaths.push('.gitignore');
      },
      build: async (stageRoot) => {
        writeRootFiles(stageRoot, options, 'init', root);
        const templates = await writeSelectedModules(stageRoot, options);
        const components = installSelectedUiComponents(stageRoot, options);
        writeProjectDocs(stageRoot, options, true);
        cleanNestedArtifacts(stageRoot);
        rmSync(path.join(stageRoot, 'pnpm-lock.yaml'), { force: true });
        writeManifest(stageRoot, createProjectManifest(stageRoot, options, 'init', templates, undefined, components));
        commitPaths.push(...readdirSync(stageRoot));
      },
      afterCommit: () => {
        if (!options.skipInstall) {
          anhedralPrint.section('Workspace install');
          installWorkspaceDependencies(root);
        }
      },
    });
    if (options.dryRun) printPlan('init', planned, options.json);
    if (!options.dryRun) anhedralPrint.done(`Committed ${planned.length} paths`);
    if (!options.dryRun && options.json) printPlan('init', planned, true);
  } finally {
    if (previousChannel == null) delete env.ANHEDRAL_TOOLCHAIN;
    else env.ANHEDRAL_TOOLCHAIN = previousChannel;
    if (createdRoot && pathEntryExists(root) && readdirSync(root).length === 0) rmdirSync(root);
  }
}

export async function scaffoldUiComponents(uiOptions: UiAddOptions): Promise<void> {
  const root = path.resolve(process.cwd());
  let manifest: ProjectManifest | undefined;
  let options: ResolvedInitOptions | undefined;
  let additions: readonly UiComponentInstall[] = [];
  let components: readonly UiComponentInstall[] = [];
  let noOp = false;
  const seedPaths: string[] = [];
  const commitPaths: string[] = [];
  const previousChannel = env.ANHEDRAL_TOOLCHAIN;
  try {
    const planned = await runStagedTransaction(root, {
      seedPaths,
      commitPaths,
      dryRun: uiOptions.dryRun,
      prepare: () => {
        manifest = applyCurrentOwnership(readProjectManifest(root));
        assertManagedFileModes(root, manifest);
        const installedTargets = UI_TARGETS.filter((target) => manifest!.modules.includes(target));
        const targets = uiOptions.targets.length > 0 ? uiOptions.targets : installedTargets;
        if (targets.length === 0) throw new Error('This project has no UI client. Add web, mobile, desktop, or extension first.');
        for (const target of targets) {
          if (!manifest.modules.includes(target)) throw new Error(`UI target is not installed: ${target}`);
        }
        const requested = resolveUiInstalls(uiOptions.components, targets, manifest.ui.nativeStyling);
        const installedKeys = new Set(manifest.ui.components.map(uiInstallKey));
        additions = requested.filter((entry) => !installedKeys.has(uiInstallKey(entry)));
        components = mergeUiInstalls(manifest.ui.components, additions);
        if (additions.length === 0) {
          noOp = true;
          return false;
        }
        options = {
          projectName: manifest.project.name,
          displayName: manifest.project.displayName,
          modules: [...manifest.modules],
          ...selectionsFromModules(manifest.modules),
          skipInstall: uiOptions.skipInstall,
          dryRun: uiOptions.dryRun,
          json: uiOptions.json,
          toolchainChannel: toolchainChannelFromManifest(manifest),
          uiComponents: [],
          nativeStyling: manifest.ui.nativeStyling,
        };
        env.ANHEDRAL_TOOLCHAIN = options.toolchainChannel;
        seedPaths.push(...new Set([
          ...Object.keys(manifest.files).filter((relativePath) => pathEntryExists(path.join(root, relativePath))),
          'anhedral.json',
        ]));
        anhedralPrint.banner(`Adding UI components`);
      },
      build: async (stageRoot) => {
        if (!manifest || !options) throw new Error('Internal UI plan was not prepared.');
        if (!uiOptions.dryRun) installUiComponents(stageRoot, additions);
        cleanNestedArtifacts(stageRoot);
        rmSync(path.join(stageRoot, 'pnpm-lock.yaml'), { force: true });
        preserveUserOwnedFiles(root, stageRoot, manifest);
        writeManifest(stageRoot, createProjectManifest(
          stageRoot,
          options,
          'add',
          manifest.templates,
          manifest,
          components,
        ));
        const diff = stagedFileDiff(root, stageRoot, manifest);
        assertSafeChangedPaths(root, stageRoot, manifest, [...diff.changed, ...diff.deleted], new Set(diff.deleted));
        commitPaths.push(...diff.changed);
      },
      afterCommit: () => {
        if (!uiOptions.skipInstall) installWorkspaceDependencies(root);
      },
    });
    if (noOp) {
      if (uiOptions.json) console.log(JSON.stringify({ operation: 'ui-add', paths: [], components: [] }, null, 2));
      else anhedralPrint.info('All requested UI components are already installed in the selected clients.');
      return;
    }
    const componentPlan = additions.map((entry) => ({
      component: entry.name,
      target: entry.target,
      provider: entry.provider,
      source: entry.source,
    }));
    if (uiOptions.json) {
      console.log(JSON.stringify({ operation: 'ui-add', paths: planned, components: componentPlan }, null, 2));
    } else {
      anhedralPrint.info(`ui-add plan: ${componentPlan.length} installation${componentPlan.length === 1 ? '' : 's'}`);
      for (const entry of componentPlan) console.log(`  ${entry.target}: ${entry.component} (${entry.provider})`);
      for (const relativePath of planned) console.log(`  ${relativePath}`);
    }
  } finally {
    if (previousChannel == null) delete env.ANHEDRAL_TOOLCHAIN;
    else env.ANHEDRAL_TOOLCHAIN = previousChannel;
  }
}

export async function scaffoldUpgradeProject(upgradeOptions: UpgradeOptions): Promise<void> {
  const root = path.resolve(process.cwd());
  let manifest: ProjectManifest | undefined;
  let options: ResolvedInitOptions | undefined;
  let noOp = false;
  const seedPaths: string[] = [];
  const commitPaths: string[] = [];
  const deletePaths: string[] = [];
  const previousChannel = env.ANHEDRAL_TOOLCHAIN;
  try {
    const planned = await runStagedTransaction(root, {
      commitPaths,
      deletePaths,
      seedPaths,
      dryRun: upgradeOptions.dryRun,
      prepare: () => {
        manifest = applyCurrentOwnership(readProjectManifest(root, { allowSupportedUpgrade: true }));
        if (manifest.generatorVersion === GENERATOR_VERSION) {
          noOp = true;
          return false;
        }
        assertManagedFileModes(root, manifest);
        options = optionsFromManifest(manifest, {
          modules: [],
          skipInstall: upgradeOptions.skipInstall,
          dryRun: upgradeOptions.dryRun,
          json: upgradeOptions.json,
        }, manifest.modules);
        assertInstallNodeCompatibility(options);
        env.ANHEDRAL_TOOLCHAIN = options.toolchainChannel;
        seedPaths.push(...new Set([
          ...Object.keys(manifest.files).filter((relativePath) => pathEntryExists(path.join(root, relativePath))),
          'anhedral.json',
        ]));
        anhedralPrint.banner(`Upgrading ${manifest.generatorVersion} to ${GENERATOR_VERSION}`);
      },
      build: async (stageRoot) => {
        if (!manifest || !options) throw new Error('Internal upgrade plan was not prepared.');
        writeRootFiles(stageRoot, options, 'add', root, manifest);
        const templates = await writeSelectedModules(stageRoot, options);
        writeProjectDocs(stageRoot, options, false);
        cleanNestedArtifacts(stageRoot);
        preserveUserOwnedFiles(root, stageRoot, manifest);
        writeManifest(stageRoot, createProjectManifest(
          stageRoot,
          options,
          'add',
          templates,
          manifest,
          manifest.ui.components,
        ));
        const diff = stagedFileDiff(root, stageRoot, manifest);
        assertSafeChangedPaths(root, stageRoot, manifest, [...diff.changed, ...diff.deleted], new Set(diff.deleted));
        commitPaths.push(...diff.changed);
        deletePaths.push(...diff.deleted);
      },
      afterCommit: () => {
        if (!upgradeOptions.skipInstall) installWorkspaceDependencies(root);
      },
    });
    if (noOp) {
      if (upgradeOptions.json) console.log(JSON.stringify({ operation: 'upgrade', paths: [] }, null, 2));
      else anhedralPrint.info(`Project is already on Anhedral ${GENERATOR_VERSION}.`);
      return;
    }
    printPlan('upgrade', planned, upgradeOptions.json);
  } finally {
    if (previousChannel == null) delete env.ANHEDRAL_TOOLCHAIN;
    else env.ANHEDRAL_TOOLCHAIN = previousChannel;
  }
}

export async function scaffoldAddModules(addOptions: AddOptions): Promise<void> {
  const root = path.resolve(process.cwd());
  let manifest: ProjectManifest | undefined;
  let options: ResolvedInitOptions | undefined;
  let missing: readonly ModuleId[] = [];
  let noOp = false;
  const seedPaths: string[] = [];
  const commitPaths: string[] = [];
  const deletePaths: string[] = [];
  const previousChannel = env.ANHEDRAL_TOOLCHAIN;
  try {
    const planned = await runStagedTransaction(root, {
      commitPaths,
      deletePaths,
      seedPaths,
      dryRun: addOptions.dryRun,
      prepare: () => {
        manifest = applyCurrentOwnership(readProjectManifest(root));
        assertManagedFileModes(root, manifest);
        const desiredRequested = [...new Set([...manifest.modules, ...addOptions.modules])] as ModuleId[];
        const resolution = resolveModules(desiredRequested);
        const installed = new Set(manifest.modules);
        missing = resolution.resolvedModules.filter((moduleId) => !installed.has(moduleId));
        if (!missing.length) {
          noOp = true;
          return false;
        }
        options = optionsFromManifest(manifest, addOptions, resolution.requestedModules);
        assertInstallNodeCompatibility(options);
        env.ANHEDRAL_TOOLCHAIN = options.toolchainChannel;
        seedPaths.push(...new Set([
          ...Object.keys(manifest.files).filter((relativePath) => pathEntryExists(path.join(root, relativePath))),
          'anhedral.json',
        ]));
        anhedralPrint.banner(`Adding ${missing.join(', ')}`);
      },
      build: async (stageRoot) => {
        if (!manifest || !options) throw new Error('Internal add plan was not prepared.');
        writeRootFiles(stageRoot, options, 'add', root, manifest);
        const templates = await writeSelectedModules(stageRoot, options);
        writeProjectDocs(stageRoot, options, false);
        cleanNestedArtifacts(stageRoot);
        preserveUserOwnedFiles(root, stageRoot, manifest);
        writeManifest(stageRoot, createProjectManifest(stageRoot, options, 'add', templates, manifest));
        const diff = stagedFileDiff(root, stageRoot, manifest);
        assertSafeChangedPaths(root, stageRoot, manifest, [...diff.changed, ...diff.deleted], new Set(diff.deleted));
        commitPaths.push(...diff.changed);
        deletePaths.push(...diff.deleted);
      },
      afterCommit: () => {
        if (!addOptions.skipInstall) installWorkspaceDependencies(root);
      },
    });
    if (noOp) {
      if (addOptions.json) console.log(JSON.stringify({ operation: 'add', paths: [] }, null, 2));
      else anhedralPrint.info('All requested modules are already installed.');
      return;
    }
    if (addOptions.dryRun || !addOptions.json) printPlan('add', planned, addOptions.json);
    if (!addOptions.dryRun && addOptions.json) printPlan('add', planned, true);
  } finally {
    if (previousChannel == null) delete env.ANHEDRAL_TOOLCHAIN;
    else env.ANHEDRAL_TOOLCHAIN = previousChannel;
  }
}

export function doctorProject(): DoctorReport {
  const root = path.resolve(process.cwd());
  const filePath = path.join(root, 'anhedral.json');
  if (!pathEntryExists(filePath)) throw new Error('anhedral.json was not found. Run anhedral init first.');
  const manifest = readManifest(readFileSync(filePath, 'utf8'));
  const issues: DoctorIssue[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!isTransactionMetadata(entry.name)) continue;
    if (entry.name === '.anhedral-journal.json') {
      issues.push({ path: entry.name, severity: 'error', message: 'An interrupted transaction requires recovery by init or add.' });
    } else if (entry.name.startsWith('.anhedral-journal.json.tmp-')) {
      issues.push({ path: entry.name, severity: 'error', message: 'An incomplete transaction journal artifact requires manual inspection.' });
    } else {
      issues.push({ path: entry.name, severity: 'error', message: 'An Anhedral operation is running or left a transaction-lock artifact.' });
    }
  }
  if (manifest.generatorVersion !== GENERATOR_VERSION) {
    issues.push({
      path: 'anhedral.json',
      severity: 'error',
      message: isSupportedProjectUpgrade(manifest.generatorVersion, GENERATOR_VERSION)
        ? `Project generator ${manifest.generatorVersion} differs from CLI ${GENERATOR_VERSION}; run anhedral upgrade.`
        : `Project generator ${manifest.generatorVersion} differs from CLI ${GENERATOR_VERSION}; regenerate with the current CLI.`,
    });
  }
  try {
    assertTemplateProvenance(manifest.modules, manifest.templates);
  } catch (error) {
    issues.push({
      path: 'anhedral.json',
      severity: 'error',
      message: error instanceof Error ? error.message : 'Template provenance is invalid.',
    });
  }
  for (const [relativePath, record] of Object.entries(manifest.files)) {
    const target = path.join(root, relativePath);
    const targetStat = lstatIfPresent(target);
    if (!targetStat) {
      issues.push({ path: relativePath, severity: 'error', message: 'Recorded file is missing.' });
      continue;
    }
    if (targetStat.isSymbolicLink()) {
      issues.push({ path: relativePath, severity: 'error', message: 'Recorded path is a symbolic link.' });
      continue;
    }
    if (!targetStat.isFile()) {
      issues.push({ path: relativePath, severity: 'error', message: 'Recorded path is not a regular file.' });
      continue;
    }
    const actual = hashContent(readFileSync(target));
    if (actual !== record.hash) {
      issues.push({
        path: relativePath,
        severity: record.ownership === 'managed' ? 'error' : 'warning',
        message: `${record.ownership} file differs from its recorded hash.`,
      });
    }
    if (record.mode !== null) {
      const actualMode = normalizedFileMode(targetStat.mode);
      if (actualMode !== null && actualMode !== record.mode) {
        issues.push({
          path: relativePath,
          severity: record.ownership === 'managed' ? 'error' : 'warning',
          message: `${record.ownership} file mode differs from its recorded mode `
            + `(${displayFileMode(record.mode)} expected, ${displayFileMode(actualMode)} found).`,
        });
      }
    }
  }
  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    schemaVersion: manifest.schemaVersion,
    generatorVersion: manifest.generatorVersion,
    issues,
  };
}

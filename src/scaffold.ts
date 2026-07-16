import { lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import { anhedralPrint } from './print.js';
import { appendGitignore, exec, writeFile } from './util.js';
import { MOBILE_NODE_ENGINE, NODE_ENGINE, PACKAGE_MANAGER, ROOT_DEPENDENCIES } from './dependencies.js';
import { resolveToolchainChannel, type ToolchainChannel } from './toolchain.js';
import { scaffoldApi } from './templates/api.js';
import { scaffoldDesktop } from './templates/desktop.js';
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

function ensureScaffoldRoot(root: string): void {
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
  const scripts: Record<string, string> = {
    dev: filters.length ? `turbo dev --parallel ${filters.map((entry) => `--filter=${entry}`).join(' ')}` : 'echo "No app surfaces selected."',
    build: 'turbo build',
    typecheck: 'turbo typecheck',
  };
  const verify: string[] = [];
  if (options.apps.web) {
    scripts['dev:web'] = 'pnpm --filter ./apps/web dev';
    scripts['verify:web'] = 'pnpm --filter ./apps/web typecheck && pnpm --filter ./apps/web build';
    verify.push('pnpm verify:web');
  }
  if (options.apps.mobile) {
    scripts['dev:mobile'] = 'pnpm --filter ./apps/mobile dev';
    scripts['verify:mobile'] = 'pnpm --filter ./apps/mobile typecheck && pnpm --filter ./apps/mobile build:web';
    verify.push('pnpm verify:mobile');
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
  if (options.apps.extension) {
    scripts['dev:extension'] = 'pnpm --filter ./apps/extension dev';
    scripts['extension:zip'] = 'pnpm --filter ./apps/extension zip';
    scripts['verify:extension'] = 'pnpm --filter ./apps/extension typecheck && pnpm --filter ./apps/extension zip';
    verify.push('pnpm verify:extension');
  }
  if (options.features.database) {
    scripts['db:generate'] = 'pnpm --filter @shared/db db:generate';
    scripts['db:migrate'] = 'pnpm --filter @shared/db db:migrate';
    scripts['db:check'] = 'pnpm --filter @shared/db db:check';
    scripts['db:studio'] = 'pnpm --filter @shared/db db:studio';
    scripts['verify:db'] = 'node scripts/verify-db-migrations.mjs && pnpm db:check';
    verify.push('pnpm verify:db');
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
  ]);
  writeRootEnv(root, options);
  writeDatabaseVerificationScript(root, options);
  const vercelIgnore = path.join(root, '.vercelignore');
  const currentIgnore = pathEntryExists(vercelIgnore) ? readFileSync(vercelIgnore, 'utf8') : '';
  const ignoreLines = [...new Set([...currentIgnore.split('\n').filter(Boolean), 'apps/extension/.output', 'apps/mobile/dist', 'apps/desktop/release'])];
  writeFile(vercelIgnore, ignoreLines.join('\n') + '\n');
  writeFile(path.join(root, '.github/workflows/anhedral-ci.yml'), generatedCi(options));
}

function enabledModuleNames(options: ResolvedInitOptions): readonly ModuleId[] {
  return resolveModules(options.modules).resolvedModules;
}

function writeProjectDocs(root: string, options: ResolvedInitOptions, includeUserDocs: boolean): void {
  const modules = enabledModuleNames(options);
  const commands = [
    'pnpm install',
    options.apps.api ? 'cp apps/api/.env.example apps/api/.env' : null,
    options.features.database ? 'cp packages/db/.env.example packages/db/.env' : null,
    options.apps.web ? 'cp apps/web/.env.example apps/web/.env.local' : null,
    options.apps.mobile ? 'cp apps/mobile/.env.example apps/mobile/.env' : null,
    options.apps.desktop ? 'cp apps/desktop/.env.example apps/desktop/.env' : null,
    options.apps.extension ? 'cp apps/extension/.env.example apps/extension/.env' : null,
    options.features.database ? 'pnpm db:generate' : null,
    options.features.database ? 'git add packages/db/migrations' : null,
    'pnpm verify',
    options.features.database ? 'pnpm db:migrate' : null,
  ].filter((value): value is string => value !== null).join('\n');
  if (includeUserDocs) {
    writeFile(path.join(root, 'README.md'), `# ${markdownHeading(options.displayName)}

Generated by Anhedral ${GENERATOR_VERSION}.

## Modules

${modules.map((moduleName) => `- \`${moduleName}\``).join('\n')}

## UI components

DOM clients use shadcn/ui. Expo uses React Native Reusables with ${options.nativeStyling}.

Add provider-specific source components with \`anhedral ui add <component>\`.

## First run

\`\`\`sh
${commands}
\`\`\`

Generated-file ownership and exact tool versions are recorded in \`anhedral.json\`.
`);
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
      options.features.storage ? '- Configure R2 CORS for every browser origin with `AllowedMethods: ["PUT"]`, `AllowedHeaders: ["Content-Type"]`, optional `ExposeHeaders: ["ETag"]` and `MaxAgeSeconds`, then verify both the preflight and a signed PUT in a browser.' : null,
      options.features.storage ? '- Configure an R2 lifecycle rule for the `staging/` prefix as a backstop, with an age longer than the application cleanup grace period.' : null,
      options.features.database ? '- Commit every reviewed Drizzle SQL migration and its metadata with the schema change; `pnpm verify:db` rejects a missing or untracked SQL baseline and validates migration history.' : null,
      options.features.database ? '- Generated CI runs `pnpm db:generate` and fails when `packages/db/migrations` changes, preventing schema changes without a matching migration.' : null,
      '- Run `pnpm verify` before deployment.',
      '- Run `anhedral doctor` before incremental generation.',
    ].filter((item): item is string => item !== null);
    writeFile(path.join(root, 'PRODUCTION.md'), `# ${markdownHeading(options.displayName)} production guide

${productionItems.join('\n')}
`);
  }
  writeFile(path.join(root, 'ANHEDRAL.md'), `# Anhedral-managed project information

Generator: ${GENERATOR_VERSION}

Resolved modules: ${modules.join(', ')}

- \`anhedral add <module> --dry-run\` previews incremental changes.
- \`anhedral ui add <component> --dry-run\` previews platform-routed component additions.
- \`anhedral doctor\` reports manifest and filesystem drift before incremental changes.
- README and existing user workflows are never rewritten by \`anhedral add\`.
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
  const app = /^apps\/(web|mobile|api|desktop|extension)(?:\/|$)/.exec(relativePath);
  if (app) return app[1] as ModuleId;
  if (relativePath.startsWith('packages/db/')) return 'db';
  return 'root';
}

function defaultOwnership(relativePath: string): FileOwnershipClass {
  if (relativePath === 'README.md' || relativePath === 'PRODUCTION.md') return 'user';
  if (ROOT_MERGEABLE_FILES.has(relativePath)) return 'mergeable';
  return 'managed';
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

function readProjectManifest(root: string): ProjectManifest {
  const filePath = path.join(root, 'anhedral.json');
  if (!pathEntryExists(filePath)) throw new Error('anhedral.json was not found. Run anhedral init first.');
  const manifest = readManifest(readFileSync(filePath, 'utf8'));
  if (manifest.generatorVersion !== GENERATOR_VERSION) {
    throw new Error(
      `This project was generated by Anhedral ${manifest.generatorVersion}; current CLI ${GENERATOR_VERSION} only supports exact-current projects. `
      + 'Regenerate the project with the current CLI before adding modules.',
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
  return templates;
}

function printPlan(operation: 'init' | 'add', paths: readonly string[], json: boolean): void {
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
    if (record.ownership === 'user') {
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
  const root = path.resolve(process.cwd());
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
          exec('pnpm install --no-frozen-lockfile', root);
        }
      },
    });
    if (options.dryRun) printPlan('init', planned, options.json);
    if (!options.dryRun) anhedralPrint.done(`Committed ${planned.length} paths`);
    if (!options.dryRun && options.json) printPlan('init', planned, true);
  } finally {
    if (previousChannel == null) delete env.ANHEDRAL_TOOLCHAIN;
    else env.ANHEDRAL_TOOLCHAIN = previousChannel;
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
        manifest = readProjectManifest(root);
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
        if (!uiOptions.skipInstall) exec('pnpm install --no-frozen-lockfile', root);
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
        manifest = readProjectManifest(root);
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
        writeManifest(stageRoot, createProjectManifest(stageRoot, options, 'add', templates, manifest));
        const diff = stagedFileDiff(root, stageRoot, manifest);
        assertSafeChangedPaths(root, stageRoot, manifest, [...diff.changed, ...diff.deleted], new Set(diff.deleted));
        commitPaths.push(...diff.changed);
        deletePaths.push(...diff.deleted);
      },
      afterCommit: () => {
        if (!addOptions.skipInstall) exec('pnpm install --no-frozen-lockfile', root);
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
      message: `Project generator ${manifest.generatorVersion} differs from CLI ${GENERATOR_VERSION}; regenerate with the current CLI.`,
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

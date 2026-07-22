import path from 'node:path';
import { env } from 'node:process';
import type { AddOptions, InitOptions } from './scaffold.js';
import { TOOLCHAIN_CHANNELS, resolveToolchainChannel } from './toolchain.js';
import { resolveModules } from './architecture/modules.js';
import { packageNameFromText } from './render.js';
import {
  isNativeStylingLibrary,
  isUiTarget,
  parseUiComponentList,
  type NativeStylingLibrary,
  type UiTarget,
} from './ui.js';
import type { UiAddOptions } from './scaffold.js';

export const USAGE = `
anhedral new <directory> [modules...] [--ui <components>] [--native-styling <nativewind|uniwind>] [--toolchain <latest|stable>] [--skip-install] [--dry-run] [--json] [--verbose]
anhedral init [modules...] [--ui <components>] [--native-styling <nativewind|uniwind>] [--toolchain <latest|stable>] [--skip-install] [--dry-run] [--json] [--verbose]
anhedral add <module...> [--skip-install] [--dry-run] [--json] [--verbose]
anhedral ui add <component...> [--target <client>] [--skip-install] [--dry-run] [--json] [--verbose]
anhedral doctor [--json] [--verbose]
anhedral --version

Commands:
  anhedral new my-app
    Generate the complete TypeScript stack in a new directory. With no module flags, every module is included.
  anhedral new my-app --web --api --db --auth
    Generate a web app, Fastify API, shared database package, and auth wiring.
  anhedral init --web --api --db --auth
    Generate the same readable workspace in the current empty directory.
  anhedral add mobile extension
    Add missing modules to an existing Anhedral project.
  anhedral ui add button dialog --target mobile
    Add React Native Reusables components to Expo. DOM clients use shadcn/ui.
`;

export type NewProjectRequest = {
  readonly directory: string;
  readonly moduleArgs: readonly string[];
};

export function parseNewProjectRequest(args: readonly string[]): NewProjectRequest {
  const [directory, ...moduleArgs] = args;
  if (!directory || directory.startsWith('--')) throw new Error('anhedral new requires a destination directory before module flags');
  return Object.freeze({ directory, moduleArgs: Object.freeze(moduleArgs) });
}

export const APP_MODULES = ['web', 'mobile', 'api', 'desktop', 'extension'] as const;
export const FEATURE_MODULES = ['db', 'auth', 'billing', 'storage', 'native-subscriptions'] as const;

export type AppModule = (typeof APP_MODULES)[number];
export type FeatureModule = (typeof FEATURE_MODULES)[number];
export type SupportedModule = AppModule | FeatureModule;

export type ParsedFlags = {
  toolchain?: string;
  skipInstall?: boolean;
  dryRun?: boolean;
  json?: boolean;
  verbose?: boolean;
  uiComponents: string[];
  nativeStyling?: NativeStylingLibrary;
  modules: Set<SupportedModule>;
};

export function parseCli(args: string[]): ParsedFlags {
  const flags: ParsedFlags = { modules: new Set(), uiComponents: [] };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      const moduleName = normalizeModuleName(token);
      if (moduleName) {
        flags.modules.add(moduleName);
        continue;
      }
      throw new Error(`Unexpected argument: ${token}. Use module names, module flags, --toolchain, or --skip-install`);
    }

    if (token === '--skip-install') {
      flags.skipInstall = true;
      continue;
    }

    if (token === '--dry-run') {
      flags.dryRun = true;
      continue;
    }

    if (token === '--json') {
      flags.json = true;
      continue;
    }

    if (token === '--verbose') {
      flags.verbose = true;
      continue;
    }

    if (token === '--ui') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --ui');
      flags.uiComponents.push(...parseUiComponentList(value));
      index += 1;
      continue;
    }

    if (token.startsWith('--ui=')) {
      flags.uiComponents.push(...parseUiComponentList(token.slice('--ui='.length)));
      continue;
    }

    if (token === '--native-styling') {
      const value = args[index + 1];
      if (!isNativeStylingLibrary(value)) throw new Error('--native-styling must be nativewind or uniwind');
      flags.nativeStyling = value;
      index += 1;
      continue;
    }

    if (token.startsWith('--native-styling=')) {
      const value = token.slice('--native-styling='.length);
      if (!isNativeStylingLibrary(value)) throw new Error('--native-styling must be nativewind or uniwind');
      flags.nativeStyling = value;
      continue;
    }

    if (token === '--toolchain') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --toolchain');
      }
      flags.toolchain = value;
      index += 1;
      continue;
    }

    if (token.startsWith('--toolchain=')) {
      const value = token.slice('--toolchain='.length);
      if (!value) {
        throw new Error('Missing value for --toolchain');
      }
      flags.toolchain = value;
      continue;
    }

    const moduleName = normalizeModuleName(token.slice(2));
    if (moduleName) {
      flags.modules.add(moduleName);
      continue;
    }

    throw new Error(`Unknown flag: ${token}`);
  }

  return flags;
}

export function normalizeModuleName(raw: string): SupportedModule | null {
  if ((APP_MODULES as readonly string[]).includes(raw)) return raw as AppModule;
  if ((FEATURE_MODULES as readonly string[]).includes(raw)) return raw as FeatureModule;
  return null;
}

export function deriveProjectName(cwd: string): string {
  return packageNameFromText(path.basename(cwd));
}

export function deriveDisplayName(cwd: string): string {
  const base = path.basename(cwd).trim();
  return base || 'Anhedral App';
}

export function buildOptions(flags: ParsedFlags): InitOptions {
  return buildOptionsForRoot(flags, process.cwd());
}

export function buildOptionsForRoot(flags: ParsedFlags, root: string): InitOptions {
  const resolvedRoot = path.resolve(root);
  const projectName = deriveProjectName(resolvedRoot);
  const displayName = deriveDisplayName(resolvedRoot);

  if (flags.toolchain != null && !TOOLCHAIN_CHANNELS.includes(flags.toolchain as (typeof TOOLCHAIN_CHANNELS)[number])) {
    throw new Error(`--toolchain must be one of: ${TOOLCHAIN_CHANNELS.join(', ')}`);
  }

  const requestedModules = flags.modules.size === 0
    ? [...APP_MODULES, ...FEATURE_MODULES]
    : [...flags.modules];
  const resolution = resolveModules(requestedModules);

  return {
    projectName,
    displayName,
    modules: [...resolution.requestedModules],
    uiComponents: Array.from(new Set(flags.uiComponents)),
    nativeStyling: flags.nativeStyling ?? 'nativewind',
    skipInstall: flags.skipInstall === true || env.ANHEDRAL_SKIP_INSTALL === '1',
    dryRun: flags.dryRun === true,
    json: flags.json === true,
    toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN),
    rootDirectory: resolvedRoot,
  };
}

export function parseUiAddOptions(args: readonly string[]): UiAddOptions {
  const components: string[] = [];
  const targets: UiTarget[] = [];
  let skipInstall = env.ANHEDRAL_SKIP_INSTALL === '1';
  let dryRun = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (!token.startsWith('--')) {
      components.push(...parseUiComponentList(token));
      continue;
    }
    if (token === '--target') {
      const value = args[index + 1];
      if (!isUiTarget(value)) throw new Error(`--target must be one of: web, mobile, desktop, extension`);
      targets.push(value);
      index += 1;
      continue;
    }
    if (token.startsWith('--target=')) {
      const value = token.slice('--target='.length);
      if (!isUiTarget(value)) throw new Error(`--target must be one of: web, mobile, desktop, extension`);
      targets.push(value);
      continue;
    }
    if (token === '--skip-install') { skipInstall = true; continue; }
    if (token === '--dry-run') { dryRun = true; continue; }
    if (token === '--json') { json = true; continue; }
    if (token === '--verbose') { continue; }
    throw new Error(`Unknown UI option: ${token}`);
  }
  if (components.length === 0) throw new Error('anhedral ui add requires at least one component');
  return {
    components: Array.from(new Set(components)),
    targets: Array.from(new Set(targets)),
    skipInstall,
    dryRun,
    json,
  };
}

export function buildAddOptions(modules: string[], flags: ParsedFlags): AddOptions {
  const requestedModules = [...modules, ...flags.modules];

  if (requestedModules.length === 0) {
    throw new Error('anhedral add requires at least one module');
  }

  const normalizedModules = requestedModules.map((moduleName) => {
    const normalized = normalizeModuleName(moduleName);
    if (!normalized) {
      throw new Error(`Unknown module: ${moduleName}`);
    }
    return normalized;
  });

  return {
    modules: Array.from(new Set(normalizedModules)),
    skipInstall: flags.skipInstall === true || env.ANHEDRAL_SKIP_INSTALL === '1',
    dryRun: flags.dryRun === true,
    json: flags.json === true,
    ...((flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN) != null
      ? { toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN) }
      : {}),
  };
}

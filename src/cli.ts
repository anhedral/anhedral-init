import path from 'node:path';
import { env } from 'node:process';
import type { AddOptions, InitOptions } from './scaffold.js';
import { TOOLCHAIN_CHANNELS, resolveToolchainChannel } from './toolchain.js';
import { resolveModules } from './architecture/modules.js';
import { packageNameFromText } from './render.js';

export const USAGE = `
anhedral init [modules...] [--toolchain <latest|stable>] [--skip-install] [--dry-run] [--json] [--verbose]
anhedral add <module...> [--skip-install] [--dry-run] [--json] [--verbose]
anhedral doctor [--json] [--verbose]
anhedral --version

Commands:
  anhedral init
    Choose app surfaces and backend features, then generate an anhedral.json manifest.
  anhedral init --web --api --db --auth
    Generate a web app, Fastify API, shared database package, and auth wiring.
  anhedral add mobile extension
    Add missing modules to an existing Anhedral project.
`;

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
  modules: Set<SupportedModule>;
};

export function parseCli(args: string[]): ParsedFlags {
  const flags: ParsedFlags = { modules: new Set() };

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
  const cwd = process.cwd();
  const projectName = deriveProjectName(cwd);
  const displayName = deriveDisplayName(cwd);

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
    skipInstall: flags.skipInstall === true || env.ANHEDRAL_SKIP_INSTALL === '1',
    dryRun: flags.dryRun === true,
    json: flags.json === true,
    toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN),
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

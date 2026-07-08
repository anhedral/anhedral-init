import path from 'node:path';
import { env } from 'node:process';
import type { AddOptions, AppSelections, FeatureSelections, InitOptions } from './scaffold.js';
import { TOOLCHAIN_CHANNELS, resolveToolchainChannel } from './toolchain.js';

export const USAGE = `
anhedral init [--web] [--mobile] [--api] [--desktop] [--extension] [--db] [--auth] [--billing] [--storage] [--native-subscriptions] [--toolchain <latest|stable>] [--skip-install]
anhedral add <module...> [--skip-install]

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
export const MODULE_ALIASES = {
  database: 'db',
  'chrome-extension': 'extension',
  'native-billing': 'native-subscriptions',
} as const;

export type AppModule = (typeof APP_MODULES)[number];
export type FeatureModule = (typeof FEATURE_MODULES)[number];
export type SupportedModule = AppModule | FeatureModule;

export type ParsedFlags = {
  toolchain?: string;
  skipInstall?: boolean;
  modules: Set<SupportedModule>;
};

export function parseCli(args: string[]): ParsedFlags {
  const flags: ParsedFlags = { modules: new Set() };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}. Use module flags, --toolchain, or --skip-install`);
    }

    if (token === '--skip-install') {
      flags.skipInstall = true;
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
  const normalized = raw.trim().toLowerCase();
  const aliased = (MODULE_ALIASES as Record<string, SupportedModule | undefined>)[normalized] ?? normalized;
  if ((APP_MODULES as readonly string[]).includes(aliased)) return aliased as AppModule;
  if ((FEATURE_MODULES as readonly string[]).includes(aliased)) return aliased as FeatureModule;
  return null;
}

function moduleSelections(modules: Set<SupportedModule>): { apps: AppSelections; features: FeatureSelections } {
  const defaultAll = modules.size === 0;
  const apps: AppSelections = {
    web: defaultAll || modules.has('web'),
    mobile: defaultAll || modules.has('mobile'),
    api: defaultAll || modules.has('api'),
    desktop: defaultAll || modules.has('desktop'),
    extension: defaultAll || modules.has('extension'),
  };
  const features: FeatureSelections = {
    database: defaultAll || modules.has('db'),
    auth: defaultAll || modules.has('auth'),
    billing: defaultAll || modules.has('billing'),
    storage: defaultAll || modules.has('storage'),
    nativeSubscriptions: defaultAll || modules.has('native-subscriptions'),
  };

  return { apps, features };
}

export function deriveProjectName(cwd: string): string {
  const base = path.basename(cwd);
  const sanitized = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'anhedral-app';
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

  const { apps, features } = moduleSelections(flags.modules);

  return {
    projectName,
    displayName,
    apps,
    features,
    auth: 'clerk',
    payments: 'revenuecat_stripe',
    db: 'neon',
    orm: 'drizzle',
    storage: 'r2',
    api: 'fastify',
    skipInstall: flags.skipInstall === true || env.ANHEDRAL_SKIP_INSTALL === '1',
    toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN),
  };
}

export function buildAddOptions(modules: string[], flags: ParsedFlags): AddOptions {
  if (modules.length === 0) {
    throw new Error('anhedral add requires at least one module');
  }

  const normalizedModules = modules.map((moduleName) => {
    const normalized = normalizeModuleName(moduleName);
    if (!normalized) {
      throw new Error(`Unknown module: ${moduleName}`);
    }
    return normalized;
  });

  return {
    modules: Array.from(new Set(normalizedModules)),
    skipInstall: flags.skipInstall === true || env.ANHEDRAL_SKIP_INSTALL === '1',
    toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN),
  };
}

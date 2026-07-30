import path from 'node:path';
import { env } from 'node:process';
import type { AddOptions, InitOptions } from './scaffold.js';
import { TOOLCHAIN_CHANNELS, resolveToolchainChannel } from './toolchain.js';
import {
  APP_MODULES,
  FEATURE_MODULES,
  INFRASTRUCTURE_MODULES,
  resolveModules,
  type AppModule,
  type FeatureModule,
  type InfrastructureModule,
  type ModuleId,
} from './architecture/modules.js';
import {
  APP_PRODUCTS,
  DEFAULT_STACK_PRODUCTS,
  FEATURE_PRODUCTS,
  INFRASTRUCTURE_PRODUCTS,
  STACK_PRODUCTS,
  moduleIdForStackSelection,
} from './architecture/products.js';
import { packageNameFromText } from './render.js';
import {
  isNativeStylingLibrary,
  isUiTarget,
  parseUiComponentList,
  type NativeStylingLibrary,
  type UiTarget,
} from './ui.js';
import type { UiAddOptions } from './scaffold.js';
import { AUTHJS_UNSUPPORTED_MODULES, type AdminMode, type AuthProvider } from './project.js';

function productUsage(kind: 'app' | 'feature' | 'infrastructure'): string {
  return STACK_PRODUCTS
    .filter((product) => product.kind === kind)
    .map((product) => `  ${product.id.padEnd(22)} ${product.description}`)
    .join('\n');
}

export const USAGE = `
anhedral new <directory> [products...|--all] [--ui <components>] [--native-styling <nativewind|uniwind>] [--toolchain <latest|stable>] [--skip-install] [--no-git] [--dry-run] [--json] [--verbose]
anhedral init [products...|--all] [--ui <components>] [--native-styling <nativewind|uniwind>] [--toolchain <latest|stable>] [--skip-install] [--git] [--dry-run] [--json] [--verbose]
anhedral add <product...|--all> [--toolchain <latest|stable>] [--skip-install] [--dry-run] [--json] [--verbose]
anhedral ui add <component...> [--target <client>] [--skip-install] [--dry-run] [--json] [--verbose]
anhedral upgrade [--skip-install] [--dry-run] [--json] [--verbose]
anhedral doctor [--json] [--verbose]
anhedral setup-vps [--check] [--verbose]
anhedral --version [--json]
anhedral --help [--json]

Commands:
  anhedral new my-app
    Interactively choose a focused stack in a terminal. In noninteractive use, pass product flags; no flags explicitly means the complete stack.
  anhedral new my-app --next --fastify --neon --clerk
    Generate a web app, Fastify API, shared database package, and auth wiring.
  anhedral new my-app --next --fastify --neon --authjs --admin-page
    Generate database-backed Auth.js with (auth) and (admin) route groups.
  anhedral new my-app --next --fastify --neon --authjs --admin-app
    Generate database-backed Auth.js plus a separately deployable Next.js admin app.
  anhedral init --next --fastify --neon --clerk
    Generate the same readable workspace in the current empty directory.
  anhedral add expo wxt
    Add missing modules to an existing Anhedral project.
  anhedral ui add button dialog --target mobile
    Add React Native Reusables components to Expo. DOM clients use shadcn/ui.
  anhedral upgrade
    Transactionally upgrade a supported older Anhedral project before adding modules.
  anhedral setup-vps
    From a generated project checkout on Ubuntu, validate and apply its idempotent VPS security and hosting bootstrap.

Application products:
${productUsage('app')}

Service products:
${productUsage('feature')}

Infrastructure products (opt-in):
${productUsage('infrastructure')}

Behavior:
  --all explicitly selects the default application and service products. Infrastructure remains opt-in.
  new initializes Git when Git is available; use --no-git to opt out.
  init preserves the current directory's repository state; use --git to initialize Git.
  --dry-run never writes the destination. --json emits stable machine-readable plans.
  Expo selections require Node ^22.13.0 or ^24.3.0. Other stacks support Node ^20.19.0 or newer supported releases.
`;

export type NewProjectRequest = {
  readonly directory: string;
  readonly moduleArgs: readonly string[];
};

export function parseNewProjectRequest(args: readonly string[]): NewProjectRequest {
  const [directory, ...moduleArgs] = args;
  if (!directory || directory.startsWith('--')) throw new Error('anhedral new requires a destination directory before product flags');
  return Object.freeze({ directory, moduleArgs: Object.freeze(moduleArgs) });
}

export {
  APP_MODULES,
  APP_PRODUCTS,
  FEATURE_MODULES,
  FEATURE_PRODUCTS,
  INFRASTRUCTURE_MODULES,
  INFRASTRUCTURE_PRODUCTS,
};
export type { AppModule, FeatureModule, InfrastructureModule };
export type SupportedModule = ModuleId;

export type ParsedFlags = {
  toolchain?: string;
  skipInstall?: boolean;
  dryRun?: boolean;
  json?: boolean;
  verbose?: boolean;
  initializeGit?: boolean;
  uiComponents: string[];
  nativeStyling?: NativeStylingLibrary;
  authProvider?: AuthProvider;
  adminMode?: Exclude<AdminMode, 'none'>;
  modules: Set<SupportedModule>;
};

function assignOption<T extends string | boolean>(
  option: string,
  current: T | undefined,
  next: T,
): T {
  if (current !== undefined && current !== next) {
    throw new Error(`Conflicting values for ${option}: ${String(current)} and ${String(next)}`);
  }
  return next;
}

export function parseCli(args: readonly string[]): ParsedFlags {
  const flags: ParsedFlags = { modules: new Set(), uiComponents: [] };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      if (token === 'clerk' || token === 'authjs') {
        flags.authProvider = assignOption('--clerk/--authjs', flags.authProvider, token);
      }
      if (token === 'admin-page' || token === 'admin-app') {
        flags.adminMode = assignOption(
          '--admin-page/--admin-app',
          flags.adminMode,
          token === 'admin-page' ? 'page' : 'app',
        );
      }
      const moduleName = normalizeModuleName(token);
      if (moduleName) {
        flags.modules.add(moduleName);
        continue;
      }
      throw new Error(`Unexpected argument: ${token}. Use product names, product flags, --toolchain, or --skip-install`);
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

    if (token === '--git') {
      flags.initializeGit = assignOption('--git/--no-git', flags.initializeGit, true);
      continue;
    }

    if (token === '--no-git') {
      flags.initializeGit = assignOption('--git/--no-git', flags.initializeGit, false);
      continue;
    }

    if (token === '--all') {
      for (const product of DEFAULT_STACK_PRODUCTS) flags.modules.add(product.module);
      continue;
    }

    if (token === '--clerk' || token === '--authjs') {
      flags.authProvider = assignOption(
        '--clerk/--authjs',
        flags.authProvider,
        token === '--clerk' ? 'clerk' : 'authjs',
      );
      flags.modules.add('auth');
      continue;
    }

    if (token === '--admin-page' || token === '--admin-app') {
      flags.adminMode = assignOption(
        '--admin-page/--admin-app',
        flags.adminMode,
        token === '--admin-page' ? 'page' : 'app',
      );
      flags.modules.add('admin');
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
      flags.nativeStyling = assignOption('--native-styling', flags.nativeStyling, value);
      index += 1;
      continue;
    }

    if (token.startsWith('--native-styling=')) {
      const value = token.slice('--native-styling='.length);
      if (!isNativeStylingLibrary(value)) throw new Error('--native-styling must be nativewind or uniwind');
      flags.nativeStyling = assignOption('--native-styling', flags.nativeStyling, value);
      continue;
    }

    if (token === '--toolchain') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --toolchain');
      }
      flags.toolchain = assignOption('--toolchain', flags.toolchain, value);
      index += 1;
      continue;
    }

    if (token.startsWith('--toolchain=')) {
      const value = token.slice('--toolchain='.length);
      if (!value) {
        throw new Error('Missing value for --toolchain');
      }
      flags.toolchain = assignOption('--toolchain', flags.toolchain, value);
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
  return moduleIdForStackSelection(raw);
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
    ? DEFAULT_STACK_PRODUCTS.map((product) => product.module)
    : [...flags.modules];
  const resolution = resolveModules(requestedModules);
  const adminMode = resolution.resolvedModules.includes('admin')
    ? flags.adminMode ?? 'page'
    : 'none';
  const authProvider = flags.authProvider ?? (adminMode === 'none' ? 'clerk' : 'authjs');
  if (authProvider === 'authjs' && !resolution.resolvedModules.includes('web')) {
    throw new Error('Auth.js requires the Next.js web application. Add --next or use --clerk.');
  }
  const incompatibleAuthJsModules = authProvider === 'authjs'
    ? AUTHJS_UNSUPPORTED_MODULES.filter((moduleId) => resolution.resolvedModules.includes(moduleId))
    : [];
  if (incompatibleAuthJsModules.length > 0) {
    throw new Error(
      `Auth.js does not yet support these selected surfaces or capabilities: ${incompatibleAuthJsModules.join(', ')}. Use --clerk.`,
    );
  }

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
    initializeGit: flags.initializeGit,
    authProvider,
    adminMode,
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
  if (flags.initializeGit !== undefined) {
    throw new Error('Git initialization options are only supported by anhedral new and anhedral init');
  }
  if (flags.uiComponents.length > 0) {
    throw new Error('Use anhedral ui add <component...> to add UI components');
  }
  if (flags.nativeStyling !== undefined) {
    throw new Error('--native-styling is only supported while creating a project');
  }
  const requestedModules = [...modules, ...flags.modules];

  if (requestedModules.length === 0) {
    throw new Error('anhedral add requires at least one product');
  }

  const normalizedModules = requestedModules.map((moduleName) => {
    const normalized = normalizeModuleName(moduleName);
    if (!normalized) {
      throw new Error(`Unknown product: ${moduleName}`);
    }
    return normalized;
  });

  return {
    modules: Array.from(new Set(normalizedModules)),
    skipInstall: flags.skipInstall === true || env.ANHEDRAL_SKIP_INSTALL === '1',
    dryRun: flags.dryRun === true,
    json: flags.json === true,
    ...(flags.authProvider ? { authProvider: flags.authProvider } : {}),
    ...(flags.adminMode ? { adminMode: flags.adminMode } : {}),
    ...((flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN) != null
      ? { toolchainChannel: resolveToolchainChannel(flags.toolchain ?? env.ANHEDRAL_TOOLCHAIN) }
      : {}),
  };
}

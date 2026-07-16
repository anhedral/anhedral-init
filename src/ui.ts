import path from 'node:path';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { TOOLCHAIN_DEPENDENCIES } from './dependencies.js';
import { execFile } from './util.js';

export const UI_TARGETS = ['web', 'mobile', 'desktop', 'extension'] as const;
export const NATIVE_STYLING_LIBRARIES = ['nativewind', 'uniwind'] as const;
export const UI_PROVIDERS = ['shadcn', 'react-native-reusables'] as const;

export type UiTarget = (typeof UI_TARGETS)[number];
export type NativeStylingLibrary = (typeof NATIVE_STYLING_LIBRARIES)[number];
export type UiProvider = (typeof UI_PROVIDERS)[number];

export type UiComponentInstall = {
  readonly name: string;
  readonly target: UiTarget;
  readonly provider: UiProvider;
  readonly source: string;
  readonly variant: NativeStylingLibrary | null;
};

export type UiInstallCommand = {
  readonly target: UiTarget;
  readonly cwd: string;
  readonly executable: 'pnpm';
  readonly args: readonly string[];
  readonly installs: readonly UiComponentInstall[];
};

const COMPONENT_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SOURCE_EXTENSION_PATTERN = /\.(?:[cm]?[jt]sx?)$/;
const IMPORT_SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

function collectSourcePackageImports(root: string): Set<string> {
  const packages = new Set<string>();
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.next')) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSION_PATTERN.test(entry.name)) continue;
      const source = readFileSync(absolutePath, 'utf8');
      for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
        const specifier = match[1]!;
        if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')
          || specifier.startsWith('@/') || specifier.startsWith('node:') || specifier.startsWith('virtual:')) continue;
        const segments = specifier.split('/');
        packages.add(specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]!);
      }
    }
  };
  visit(root);
  return packages;
}

function workspacePackageManifests(workspaceRoot: string): Array<Record<string, unknown>> {
  const manifests: Array<Record<string, unknown>> = [];
  for (const directory of [workspaceRoot, path.join(workspaceRoot, 'apps'), path.join(workspaceRoot, 'packages')]) {
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const packagePath = entry.isDirectory()
        ? path.join(directory, entry.name, 'package.json')
        : entry.name === 'package.json' ? path.join(directory, entry.name) : '';
      if (!packagePath) continue;
      try {
        manifests.push(JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  return manifests;
}

export function reconcileUiWorkspaceDependencies(workspaceRoot: string, targetDirectory: string): void {
  const packagePath = path.join(targetDirectory, 'package.json');
  const target = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const declared = new Set([
    ...Object.keys(target.dependencies ?? {}),
    ...Object.keys(target.devDependencies ?? {}),
    ...Object.keys(target.optionalDependencies ?? {}),
    ...Object.keys(target.peerDependencies ?? {}),
  ]);
  const manifests = workspacePackageManifests(workspaceRoot);
  const dependencies = { ...(target.dependencies ?? {}) };
  let changed = false;
  for (const packageName of collectSourcePackageImports(targetDirectory)) {
    if (declared.has(packageName)) continue;
    const version = manifests
      .map((manifest) => (manifest.dependencies as Record<string, string> | undefined)?.[packageName])
      .find((candidate): candidate is string => typeof candidate === 'string');
    if (!version) continue;
    dependencies[packageName] = version;
    declared.add(packageName);
    changed = true;
  }
  if (!changed) return;
  target.dependencies = Object.fromEntries(Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right)));
  writeFileSync(packagePath, JSON.stringify(target, null, 2) + '\n');
}

export function isUiTarget(value: unknown): value is UiTarget {
  return typeof value === 'string' && (UI_TARGETS as readonly string[]).includes(value);
}

export function isNativeStylingLibrary(value: unknown): value is NativeStylingLibrary {
  return typeof value === 'string' && (NATIVE_STYLING_LIBRARIES as readonly string[]).includes(value);
}

export function isUiProvider(value: unknown): value is UiProvider {
  return typeof value === 'string' && (UI_PROVIDERS as readonly string[]).includes(value);
}

export function normalizeUiComponentName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!COMPONENT_NAME_PATTERN.test(normalized)) {
    throw new Error(`Invalid UI component name: ${value}. Use lowercase letters, numbers, and hyphens.`);
  }
  return normalized;
}

export function parseUiComponentList(value: string): string[] {
  return Array.from(new Set(value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normalizeUiComponentName)));
}

export function providerForTarget(target: UiTarget): UiProvider {
  return target === 'mobile' ? 'react-native-reusables' : 'shadcn';
}

export function registrySourceFor(
  name: string,
  target: UiTarget,
  nativeStyling: NativeStylingLibrary,
): string {
  const component = normalizeUiComponentName(name);
  return target === 'mobile'
    ? `https://reactnativereusables.com/r/${nativeStyling}/${component}.json`
    : component;
}

export function resolveUiInstalls(
  componentNames: readonly string[],
  targets: readonly UiTarget[],
  nativeStyling: NativeStylingLibrary,
): readonly UiComponentInstall[] {
  const components = Array.from(new Set(componentNames.map(normalizeUiComponentName))).sort();
  const uniqueTargets = Array.from(new Set(targets)).sort();
  return Object.freeze(uniqueTargets.flatMap((target) => components.map((name) => Object.freeze({
    name,
    target,
    provider: providerForTarget(target),
    source: registrySourceFor(name, target, nativeStyling),
    variant: target === 'mobile' ? nativeStyling : null,
  }))));
}

export function uiInstallKey(install: Pick<UiComponentInstall, 'target' | 'name'>): string {
  return `${install.target}:${install.name}`;
}

export function mergeUiInstalls(
  current: readonly UiComponentInstall[],
  additions: readonly UiComponentInstall[],
): readonly UiComponentInstall[] {
  const byKey = new Map(current.map((entry) => [uiInstallKey(entry), entry]));
  for (const entry of additions) byKey.set(uiInstallKey(entry), entry);
  return Object.freeze([...byKey.values()].sort((left, right) => uiInstallKey(left).localeCompare(uiInstallKey(right))));
}

export function buildUiInstallCommands(
  root: string,
  installs: readonly UiComponentInstall[],
): readonly UiInstallCommand[] {
  const commands: UiInstallCommand[] = [];
  for (const target of UI_TARGETS) {
    const targetInstalls = installs.filter((entry) => entry.target === target);
    if (targetInstalls.length === 0) continue;
    commands.push(Object.freeze({
      target,
      cwd: path.join(root, 'apps', target),
      executable: 'pnpm' as const,
      args: Object.freeze([
        'dlx',
        `shadcn@${TOOLCHAIN_DEPENDENCIES.shadcn}`,
        'add',
        '--yes',
        '--overwrite',
        '--silent',
        ...targetInstalls.map((entry) => entry.source),
      ]),
      installs: Object.freeze(targetInstalls),
    }));
  }
  return Object.freeze(commands);
}

export function installUiComponents(root: string, installs: readonly UiComponentInstall[]): void {
  for (const command of buildUiInstallCommands(root, installs)) {
    if (command.target !== 'mobile') {
      execFile(command.executable, command.args, command.cwd);
      reconcileUiWorkspaceDependencies(root, command.cwd);
      continue;
    }

    // shadcn switches to `npx expo install` whenever it sees an Expo dependency.
    // Component generation runs in Anhedral's isolated stage before node_modules
    // exists, so Expo CLI cannot determine the SDK. Temporarily mask only that
    // detector field, let shadcn merge registry dependencies with pnpm, then
    // restore Anhedral's exact Expo pin before the staged diff is committed.
    const packagePath = path.join(command.cwd, 'package.json');
    const originalText = readFileSync(packagePath, 'utf8');
    const original = JSON.parse(originalText) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const expoVersion = original.dependencies?.expo;
    if (!expoVersion) throw new Error(`Expo dependency is missing from ${packagePath}`);
    const masked = structuredClone(original);
    delete masked.dependencies?.expo;
    writeFileSync(packagePath, JSON.stringify(masked, null, 2) + '\n');
    try {
      execFile(command.executable, command.args, command.cwd);
      const updated = JSON.parse(readFileSync(packagePath, 'utf8')) as typeof original;
      updated.dependencies = { ...(updated.dependencies ?? {}), expo: expoVersion };
      updated.dependencies = Object.fromEntries(Object.entries(updated.dependencies).sort(([left], [right]) => left.localeCompare(right)));
      writeFileSync(packagePath, JSON.stringify(updated, null, 2) + '\n');
      reconcileUiWorkspaceDependencies(root, command.cwd);
    } catch (error) {
      writeFileSync(packagePath, originalText);
      throw error;
    }
  }
}

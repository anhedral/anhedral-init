import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
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
    } catch (error) {
      writeFileSync(packagePath, originalText);
      throw error;
    }
  }
}

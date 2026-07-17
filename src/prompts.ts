import { APP_MODULES, FEATURE_MODULES, normalizeModuleName } from './cli.js';

function hasModuleSelection(args: readonly string[]): boolean {
  return args.some((arg) => normalizeModuleName(arg.startsWith('--') ? arg.slice(2) : arg) != null);
}

export function shouldPromptForInitModules(args: readonly string[], isTTY: boolean): boolean {
  return isTTY && !args.includes('--json') && !hasModuleSelection(args);
}

export function hasUiSelection(args: readonly string[]): boolean {
  return args.some((arg) => arg === '--ui' || arg.startsWith('--ui='));
}

export function parsePromptModules(input: string, fallback: readonly string[]): string[] {
  const tokens = input
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return tokens.length > 0 ? tokens : [...fallback];
}

export const DEFAULT_PROMPT_APP_MODULES = APP_MODULES;
export const DEFAULT_PROMPT_FEATURE_MODULES = FEATURE_MODULES;

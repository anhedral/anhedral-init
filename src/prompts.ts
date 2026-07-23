import { isModuleId } from './architecture/modules.js';

function hasModuleSelection(args: readonly string[]): boolean {
  return args.some((arg) =>
    arg === '--all' || isModuleId(arg.startsWith('--') ? arg.slice(2) : arg));
}

export function shouldPromptForInitModules(args: readonly string[], isTTY: boolean): boolean {
  return isTTY && !args.includes('--json') && !hasModuleSelection(args);
}

export function hasUiSelection(args: readonly string[]): boolean {
  return args.some((arg) => arg === '--ui' || arg.startsWith('--ui='));
}

export function parsePromptModuleSelection(
  input: string,
  fallback: readonly string[],
  all: readonly string[],
): string[] {
  const tokens = input
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const specialTokens = tokens.filter((token) => token === 'all' || token === 'none');
  if (specialTokens.length > 0 && tokens.length > 1) {
    throw new Error(`"${specialTokens[0]}" must be used by itself.`);
  }
  if (tokens[0] === 'none') return [];
  if (tokens[0] === 'all') return [...all];

  const selected = tokens.length > 0 ? tokens : [...fallback];
  const allowed = new Set(all);
  const unknown = selected.filter((token) => !allowed.has(token));
  if (unknown.length > 0) {
    throw new Error(`Unknown selection: ${unknown.join(', ')}. Choose from: ${all.join(', ')}, all, or none.`);
  }
  return [...new Set(selected)];
}

export function parsePromptConfirmation(input: string): boolean {
  const answer = input.trim().toLowerCase();
  if (answer === '' || answer === 'y' || answer === 'yes') return true;
  if (answer === 'n' || answer === 'no') return false;
  throw new Error('Enter yes or no.');
}

export const DEFAULT_PROMPT_APP_MODULES = ['web'] as const;
export const DEFAULT_PROMPT_FEATURE_MODULES = [] as const;

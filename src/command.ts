import { existsSync } from 'node:fs';
import path from 'node:path';

/** Windows batch shims cannot be spawned without a shell; invoke their Node entry instead. */
export function resolveCommand(command: string, args: readonly string[], platform = process.platform, searchPath = process.env.PATH ?? '') {
  if (platform !== 'win32' || !['pnpm', 'pnpm.cmd'].includes(command)) return { command, args: [...args] };
  const directories = searchPath.split(';').filter(Boolean);
  const executable = directories.map((directory) => path.join(directory, 'pnpm.exe')).find(existsSync);
  if (executable) return { command: executable, args: [...args] };
  const entries = ['node_modules/pnpm/bin/pnpm.cjs', 'node_modules/corepack/dist/pnpm.js', 'pnpm.cjs', '../pnpm/bin/pnpm.cjs'];
  const entry = directories.flatMap((directory) => entries.map((file) => path.join(directory, file))).find(existsSync);
  if (!entry) throw new Error('Cannot locate a direct pnpm entry point. Install pnpm or enable Corepack.');
  return { command: process.execPath, args: [entry, ...args] };
}

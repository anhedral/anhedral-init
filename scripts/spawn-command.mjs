import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveSpawnCommand(command, args, {
  platform = process.platform,
  searchPath = process.env.PATH ?? '',
} = {}) {
  if (platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(command)) return { command, args };

  let entry;
  if (path.basename(command).toLowerCase() === 'npm.cmd') {
    const directories = path.isAbsolute(command) ? [path.dirname(command)] : searchPath.split(';');
    entry = directories.map((directory) => path.join(directory, 'node_modules/npm/bin/npm-cli.js')).find(existsSync);
  } else if (path.basename(command).toLowerCase() === 'anhedral.cmd') {
    entry = path.resolve(path.dirname(command), '../anhedral/dist/bin.js');
  }
  if (!entry || !existsSync(entry)) throw new Error(`No direct Node entry point for ${command}`);
  return { command: process.execPath, args: [entry, ...args] };
}

export function spawnSyncPortable(command, args, options) {
  const invocation = resolveSpawnCommand(command, args);
  return spawnSync(invocation.command, invocation.args, options);
}

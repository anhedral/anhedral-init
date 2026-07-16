import { spawnSync } from 'node:child_process';

export function resolveSpawnCommand(command, args, {
  platform = process.platform,
  comSpec = process.env.ComSpec ?? 'cmd.exe',
} = {}) {
  if (platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(command)) {
    return { command, args };
  }

  return {
    command: comSpec,
    args: ['/d', '/s', '/c', 'call', command, ...args],
  };
}

export function spawnSyncPortable(command, args, options) {
  const invocation = resolveSpawnCommand(command, args);
  return spawnSync(invocation.command, invocation.args, options);
}

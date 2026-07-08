#!/usr/bin/env tsx

import { createInterface } from 'node:readline/promises';
import { argv, exit, stdin, stdout } from 'node:process';
import { buildAddOptions, buildOptions, normalizeModuleName, parseCli, USAGE } from './cli.js';
import { scaffoldAddModules, scaffoldProject } from './scaffold.js';

function splitAddArgs(args: string[]): { moduleNames: string[]; flagArgs: string[] } {
  const moduleNames: string[] = [];
  const flagArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--toolchain') {
      flagArgs.push(arg);
      if (args[index + 1] != null) {
        flagArgs.push(args[index + 1]);
        index += 1;
      }
      continue;
    }

    if (arg.startsWith('--')) {
      flagArgs.push(arg);
      continue;
    }

    moduleNames.push(arg);
  }

  return { moduleNames, flagArgs };
}

function hasModuleFlag(args: string[]): boolean {
  return args.some((arg) => arg.startsWith('--') && normalizeModuleName(arg.slice(2)) != null);
}

function parsePromptModules(input: string, fallback: string[]): string[] {
  const tokens = input
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return tokens.length > 0 ? tokens : fallback;
}

async function promptForInitModules(args: string[]): Promise<string[]> {
  if (hasModuleFlag(args) || !stdin.isTTY) {
    return args;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log('Select app surfaces: web, mobile, api, desktop, extension');
    const appAnswer = await rl.question('App surfaces [web,api]: ');
    console.log('Select backend features: db, auth, billing, storage, native-subscriptions');
    const featureAnswer = await rl.question('Backend features [db,auth]: ');
    const selected = [
      ...parsePromptModules(appAnswer, ['web', 'api']),
      ...parsePromptModules(featureAnswer, ['db', 'auth']),
    ];
    return [...args, ...selected.map((moduleName) => `--${moduleName}`)];
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    exit(0);
  }

  if (!['init', 'add'].includes(command)) {
    console.error(`Unknown command: ${command}`);
    console.log(USAGE);
    exit(1);
  }

  const rawArgs = args.slice(1);
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    console.log(USAGE);
    exit(0);
  }

  try {
    if (command === 'add') {
      const { moduleNames, flagArgs } = splitAddArgs(rawArgs);
      await scaffoldAddModules(buildAddOptions(moduleNames, parseCli(flagArgs)));
    } else {
      const options = buildOptions(parseCli(await promptForInitModules(rawArgs)));
      await scaffoldProject(options);
    }
  } catch (error) {
    console.error('Error:', (error as Error).message);
    exit(1);
  }
}

main();

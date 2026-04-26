#!/usr/bin/env tsx

import { argv, exit } from 'node:process';
import { buildOptions, parseCli, USAGE } from './cli.js';
import { scaffoldProject } from './scaffold.js';

async function main(): Promise<void> {
  const args = argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    exit(0);
  }

  if (command !== 'init') {
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
    const options = buildOptions(parseCli(rawArgs));
    await scaffoldProject(options);
  } catch (error) {
    console.error('Error:', (error as Error).message);
    exit(1);
  }
}

main();

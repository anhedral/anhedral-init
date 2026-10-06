#!/usr/bin/env node
import { argv } from 'node:process';
import { STANDARD_USAGE, parseStandardOptions, scaffoldStandardProject } from './standard.js';
import { GENERATOR_VERSION } from './version.js';
import { PostCommitError } from './transaction.js';

const [command, ...args] = argv.slice(2);
const json = args.includes('--json');

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    console.log(json ? JSON.stringify({ usage: STANDARD_USAGE }) : STANDARD_USAGE);
    return;
  }
  if (command === '--version' || command === '-v') {
    console.log(json ? JSON.stringify({ version: GENERATOR_VERSION }) : GENERATOR_VERSION);
    return;
  }
  if (command !== 'new' && command !== 'init') {
    throw new Error(`Unknown command: ${command}. Use new, init, --help, or --version.`);
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log(json ? JSON.stringify({ usage: STANDARD_USAGE }) : STANDARD_USAGE);
    return;
  }
  let options;
  try {
    options = parseStandardOptions(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(json ? JSON.stringify({ error: message, code: 'INVALID_ARGUMENT' }) : `Error: ${message}`);
    process.exitCode = 1;
    return;
  }
  await scaffoldStandardProject(options);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof PostCommitError ? 'POST_COMMIT_FAILED'
    : command === 'new' || command === 'init' ? 'GENERATION_FAILED' : 'UNKNOWN_COMMAND';
  console.error(json ? JSON.stringify({ error: message, code }) : `Error: ${message}`);
  process.exitCode = 1;
}

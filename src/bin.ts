#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { argv, stdin, stdout } from 'node:process';
import { buildAddOptions, buildOptions, buildOptionsForRoot, parseCli, parseNewProjectRequest, parseUiAddOptions, USAGE } from './cli.js';
import { doctorProject, scaffoldAddModules, scaffoldProject, scaffoldUiComponents } from './scaffold.js';
import {
  DEFAULT_PROMPT_APP_MODULES,
  DEFAULT_PROMPT_FEATURE_MODULES,
  hasUiSelection,
  parsePromptModules,
  shouldPromptForInitModules,
} from './prompts.js';
import { GENERATOR_VERSION } from './version.js';
import { PostCommitError } from './transaction.js';

type CliErrorCode =
  | 'UNKNOWN_COMMAND'
  | 'INVALID_ARGUMENT'
  | 'DOCTOR_FAILED'
  | 'GENERATION_FAILED'
  | 'POST_COMMIT_FAILED';

function writeCliError(error: unknown, code: CliErrorCode, json: boolean): void {
  const message = error instanceof Error ? error.message : String(error);
  if (json) console.error(JSON.stringify({ error: message, code }));
  else console.error('Error:', message);
}

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

async function promptForInitModules(args: string[]): Promise<string[]> {
  if (!shouldPromptForInitModules(args, stdin.isTTY === true)) return args;

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log('Select app surfaces: web, mobile, api, desktop, extension');
    const appAnswer = await rl.question('App surfaces [all]: ');
    console.log('Select backend features: db, auth, billing, storage, native-subscriptions');
    const featureAnswer = await rl.question('Backend features [all]: ');
    const selected = [
      ...parsePromptModules(appAnswer, DEFAULT_PROMPT_APP_MODULES),
      ...parsePromptModules(featureAnswer, DEFAULT_PROMPT_FEATURE_MODULES),
    ];
    const result = [...args, ...selected.map((moduleName) => `--${moduleName}`)];
    const hasUiClient = selected.some((moduleName) => ['web', 'mobile', 'desktop', 'extension'].includes(moduleName));
    if (hasUiClient && !hasUiSelection(args)) {
      console.log('Optionally add starter UI components to each selected client.');
      const componentAnswer = await rl.question('Starter components [none]: ');
      if (componentAnswer.trim()) result.push(`--ui=${componentAnswer}`);
    }
    if (selected.includes('mobile') && !args.some((arg) => arg.startsWith('--native-styling'))) {
      const stylingAnswer = (await rl.question('Expo styling [nativewind]: ')).trim();
      result.push(`--native-styling=${stylingAnswer || 'nativewind'}`);
    }
    return result;
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  const command = args[0];
  const rawArgs = args.slice(1);
  const json = rawArgs.includes('--json');
  const verbose = rawArgs.includes('--verbose');
  if (json) process.env.ANHEDRAL_QUIET = '1';
  if (verbose) process.env.ANHEDRAL_VERBOSE = '1';

  if (command === '--version' || command === '-v') {
    if (json) console.log(JSON.stringify({ version: GENERATOR_VERSION }));
    else console.log(GENERATOR_VERSION);
    return;
  }

  if (!command || command === '--help' || command === '-h') {
    if (json) console.log(JSON.stringify({ usage: USAGE }));
    else console.log(USAGE);
    return;
  }

  if (!['new', 'init', 'add', 'ui', 'doctor'].includes(command)) {
    if (json) writeCliError(new Error(`Unknown command: ${command}`), 'UNKNOWN_COMMAND', true);
    else {
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
    }
    process.exitCode = 1;
    return;
  }

  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    if (json) console.log(JSON.stringify({ usage: USAGE }));
    else console.log(USAGE);
    return;
  }

  let phase: 'arguments' | 'execute' = 'arguments';
  try {
    if (command === 'new') {
      const request = parseNewProjectRequest(rawArgs);
      const promptedArgs = await promptForInitModules([...request.moduleArgs]);
      const options = buildOptionsForRoot(parseCli(promptedArgs), request.directory);
      phase = 'execute';
      await scaffoldProject(options);
      if (!options.json && !options.dryRun) console.log(`\nCreated ${options.rootDirectory}\nRun: cd ${options.rootDirectory} && pnpm dev`);
    } else if (command === 'doctor') {
      const unknown = rawArgs.filter((arg) => !['--json', '--verbose'].includes(arg));
      if (unknown.length) throw new Error(`Unknown doctor option: ${unknown[0]}`);
      phase = 'execute';
      const report = doctorProject();
      if (json) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(report.ok ? 'Anhedral project is healthy.' : 'Anhedral project has drift.');
        for (const issue of report.issues) console.log(`  ${issue.severity}: ${issue.path}: ${issue.message}`);
      }
      if (!report.ok) process.exitCode = 1;
    } else if (command === 'add') {
      const { moduleNames, flagArgs } = splitAddArgs(rawArgs);
      const options = buildAddOptions(moduleNames, parseCli(flagArgs));
      phase = 'execute';
      await scaffoldAddModules(options);
    } else if (command === 'ui') {
      if (rawArgs[0] !== 'add') throw new Error('Unknown UI command. Use: anhedral ui add <component...>');
      const options = parseUiAddOptions(rawArgs.slice(1));
      phase = 'execute';
      await scaffoldUiComponents(options);
    } else {
      const options = buildOptions(parseCli(await promptForInitModules(rawArgs)));
      phase = 'execute';
      await scaffoldProject(options);
    }
  } catch (error) {
    const code: CliErrorCode = error instanceof PostCommitError
      ? 'POST_COMMIT_FAILED'
      : phase === 'arguments'
        ? 'INVALID_ARGUMENT'
        : command === 'doctor'
          ? 'DOCTOR_FAILED'
          : 'GENERATION_FAILED';
    writeCliError(error, code, json);
    process.exitCode = 1;
  }
}

void main();

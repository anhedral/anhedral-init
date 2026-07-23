#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { argv, stdin, stdout } from 'node:process';
import {
  APP_MODULES,
  FEATURE_MODULES,
  buildAddOptions,
  buildOptions,
  buildOptionsForRoot,
  parseCli,
  parseNewProjectRequest,
  parseUiAddOptions,
  USAGE,
} from './cli.js';
import { doctorProject, scaffoldAddModules, scaffoldProject, scaffoldUiComponents, scaffoldUpgradeProject } from './scaffold.js';
import {
  DEFAULT_PROMPT_APP_MODULES,
  DEFAULT_PROMPT_FEATURE_MODULES,
  hasUiSelection,
  parsePromptConfirmation,
  parsePromptModuleSelection,
  shouldPromptForInitModules,
} from './prompts.js';
import { GENERATOR_VERSION } from './version.js';
import { PostCommitError } from './transaction.js';
import { resolveModules } from './architecture/modules.js';
import { UI_TARGETS } from './ui.js';

type CliErrorCode =
  | 'UNKNOWN_COMMAND'
  | 'INVALID_ARGUMENT'
  | 'DOCTOR_FAILED'
  | 'GENERATION_FAILED'
  | 'POST_COMMIT_FAILED';

const COMMANDS = ['new', 'init', 'add', 'ui', 'upgrade', 'doctor'] as const;
type Command = (typeof COMMANDS)[number];
const COMMAND_SET = new Set<string>(COMMANDS);
const UI_TARGET_SET = new Set<string>(UI_TARGETS);

function isCommand(value: string): value is Command {
  return COMMAND_SET.has(value);
}

function writeCliError(error: unknown, code: CliErrorCode, json: boolean): void {
  const message = error instanceof Error ? error.message : String(error);
  if (json) console.error(JSON.stringify({ error: message, code }));
  else console.error('Error:', message);
}

async function promptForInitModules(args: string[]): Promise<string[]> {
  if (!shouldPromptForInitModules(args, stdin.isTTY === true)) return args;

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log('Select app surfaces: web, mobile, api, desktop, extension (or "all"/"none")');
    const appAnswer = await rl.question(`App surfaces [${DEFAULT_PROMPT_APP_MODULES.join(', ')}]: `);
    console.log('Select capabilities: db, auth, billing, storage, native-subscriptions, electron-updater (or "all"/"none")');
    const featureAnswer = await rl.question('Capabilities [none]: ');
    const selected = [
      ...parsePromptModuleSelection(appAnswer, DEFAULT_PROMPT_APP_MODULES, APP_MODULES),
      ...parsePromptModuleSelection(featureAnswer, DEFAULT_PROMPT_FEATURE_MODULES, FEATURE_MODULES),
    ];
    if (selected.length === 0) throw new Error('Select at least one app surface or capability.');
    const resolution = resolveModules(selected);
    const result = [...args, ...selected.map((moduleName) => `--${moduleName}`)];
    const hasUiClient = resolution.resolvedModules.some((moduleName) => UI_TARGET_SET.has(moduleName));
    if (hasUiClient && !hasUiSelection(args)) {
      console.log('Optionally add starter UI components to each selected client.');
      const componentAnswer = await rl.question('Starter components [none]: ');
      if (componentAnswer.trim()) result.push(`--ui=${componentAnswer}`);
    }
    if (resolution.resolvedModules.includes('mobile') && !args.some((arg) => arg.startsWith('--native-styling'))) {
      const stylingAnswer = (await rl.question('Expo styling [nativewind]: ')).trim();
      result.push(`--native-styling=${stylingAnswer || 'nativewind'}`);
    }
    console.log(`Requested: ${resolution.requestedModules.join(', ')}`);
    if (resolution.dependencyAddedModules.length > 0) {
      console.log(`Added by dependencies: ${resolution.dependencyAddedModules.join(', ')}`);
    }
    console.log(`Resolved stack: ${resolution.resolvedModules.join(', ')}`);
    const confirmation = await rl.question('Generate this stack? [Y/n]: ');
    if (!parsePromptConfirmation(confirmation)) throw new Error('Generation cancelled.');
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

  if (!isCommand(command)) {
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
    switch (command) {
      case 'new': {
        const request = parseNewProjectRequest(rawArgs);
        const promptedArgs = await promptForInitModules([...request.moduleArgs]);
        const parsed = parseCli(promptedArgs);
        const options = {
          ...buildOptionsForRoot(parsed, request.directory),
          initializeGit: parsed.initializeGit ?? true,
        };
        phase = 'execute';
        await scaffoldProject(options);
        if (!options.json && !options.dryRun) {
          console.log(`\nCreated ${options.rootDirectory}\n\nNext:`);
          console.log(`  cd ${options.rootDirectory}`);
          if (options.skipInstall) console.log('  pnpm install');
          console.log('  pnpm first-run');
          console.log('  pnpm ready');
          console.log('\nThen follow README.md for verification, development, and deployment.');
        }
        break;
      }
      case 'doctor': {
        const unknown = rawArgs.filter((arg) => !['--json', '--verbose'].includes(arg));
        if (unknown.length) throw new Error(`Unknown doctor option: ${unknown[0]}`);
        phase = 'execute';
        const report = doctorProject();
        if (json) console.log(JSON.stringify(report, null, 2));
        else {
          console.log(report.ok ? 'Anhedral project is healthy.' : 'Anhedral project has drift.');
          console.log(`  project: ${report.project.displayName} (${report.project.name})`);
          console.log(`  modules: ${report.modules.join(', ')}`);
          console.log(`  toolchain: ${report.toolchain}`);
          console.log(
            `  ownership: ${report.ownership.user} user, ${report.ownership.mergeable} mergeable, `
            + `${report.ownership.managed} managed`,
          );
          for (const issue of report.issues) console.log(`  ${issue.severity}: ${issue.path}: ${issue.message}`);
          if (report.recommendedActions.length > 0) {
            console.log('\nNext actions:');
            for (const action of report.recommendedActions) console.log(`  - ${action}`);
          }
        }
        if (!report.ok) process.exitCode = 1;
        break;
      }
      case 'add': {
        const options = buildAddOptions([], parseCli(rawArgs));
        phase = 'execute';
        await scaffoldAddModules(options);
        break;
      }
      case 'ui': {
        if (rawArgs[0] !== 'add') throw new Error('Unknown UI command. Use: anhedral ui add <component...>');
        const options = parseUiAddOptions(rawArgs.slice(1));
        phase = 'execute';
        await scaffoldUiComponents(options);
        break;
      }
      case 'upgrade': {
        const unknown = rawArgs.filter((arg) => !['--skip-install', '--dry-run', '--json', '--verbose'].includes(arg));
        if (unknown.length) throw new Error(`Unknown upgrade option: ${unknown[0]}`);
        phase = 'execute';
        await scaffoldUpgradeProject({
          skipInstall: rawArgs.includes('--skip-install'),
          dryRun: rawArgs.includes('--dry-run'),
          json,
        });
        break;
      }
      case 'init': {
        const parsed = parseCli(await promptForInitModules(rawArgs));
        const options = {
          ...buildOptions(parsed),
          initializeGit: parsed.initializeGit ?? false,
        };
        phase = 'execute';
        await scaffoldProject(options);
        break;
      }
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

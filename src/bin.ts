#!/usr/bin/env node
import path from 'node:path';
import { closeSync, openSync, readSync } from 'node:fs';
import { readProjectProgress, reportProjectProgress, validateProgressReport } from './progress.js';
import { inspectProject } from './readiness.js';
import { argv } from 'node:process';
import { STANDARD_USAGE, parseStandardOptions, scaffoldStandardProject } from './standard.js';
import { GENERATOR_VERSION } from './version.js';
import { PostCommitError } from './transaction.js';

const [command, ...args] = argv.slice(2);
const json = args.includes('--json');

async function main(): Promise<void> {
  if ([undefined, '--help', '-h'].includes(command)) {
    console.log(json ? JSON.stringify({ usage: STANDARD_USAGE }) : STANDARD_USAGE);
    return;
  }
  if (['--version', '-v'].includes(command)) {
    console.log(json ? JSON.stringify({ version: GENERATOR_VERSION }) : GENERATOR_VERSION);
    return;
  }
  if (command === 'progress') {
    runProgress(args);
    return;
  }
  if (command === 'doctor') {
    runDoctor(args);
    return;
  }
  if (command !== 'new' && command !== 'init') {
    throw new Error(`Unknown command: ${command}. Use new, init, doctor, progress, --help, or --version.`);
  }
  if (args.some((arg) => ['--help', '-h'].includes(arg))) {
    console.log(json ? JSON.stringify({ usage: STANDARD_USAGE }) : STANDARD_USAGE);
    return;
  }
  const options = readOptions(command, args);
  if (options) await scaffoldStandardProject(options);
}

function runProgress(args: string[]): void {
  const positional = args.filter(arg => arg !== '--json');
  const [operation, directory, input, ...extra] = positional;
  if (extra.length || !['show', 'report'].includes(operation) || !directory || (operation === 'show' && input) || (operation === 'report' && !input)) throw new Error('Usage: anhedral progress show <directory> | progress report <directory> <report.json|-> [--json]');
  const root = path.resolve(directory);
  const result = operation === 'show' ? readProjectProgress(root) : reportProjectProgress(root, validateProgressReport(JSON.parse(readProgressInput(input))));
  console.log(JSON.stringify(result, null, 2));
}

function readProgressInput(input: string): string {
  const fd = input === '-' ? 0 : openSync(path.resolve(input), 'r');
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = Buffer.alloc(8192);
      const length = readSync(fd, chunk, 0, chunk.length, null);
      if (!length) break;
      total += length;
      if (total > 262144) throw new Error('Progress report exceeds size limit.');
      chunks.push(chunk.subarray(0, length));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { if (fd !== 0) closeSync(fd); }
}

function runDoctor(args: string[]): void {
  const positional = args.filter((arg) => arg !== '--json');
  if (positional.length > 1 || positional.some((arg) => arg.startsWith('-'))) throw new Error('Usage: anhedral doctor [directory] [--json]');
  const report = inspectProject(path.resolve(positional[0] ?? process.cwd()));
  console.log(JSON.stringify(report, null, json ? 2 : undefined));
  if (!report.localReady) process.exitCode = 1;
}

function readOptions(command: 'new' | 'init', args: string[]) {
  try {
    return parseStandardOptions(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(json ? JSON.stringify({ error: message, code: 'INVALID_ARGUMENT' }) : `Error: ${message}`);
    process.exitCode = 1;
    return;
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof PostCommitError ? 'POST_COMMIT_FAILED'
    : command === 'doctor' || command === 'progress' ? 'INVALID_ARGUMENT'
    : command === 'new' || command === 'init' ? 'GENERATION_FAILED' : 'UNKNOWN_COMMAND';
  console.error(json ? JSON.stringify({ error: message, code }) : `Error: ${message}`);
  process.exitCode = 1;
}

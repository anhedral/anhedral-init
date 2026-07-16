import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function withSkipInstall(args) {
  return args.includes('--skip-install') ? [...args] : [...args, '--skip-install'];
}

export function scenarioArgs(scenario, { skipInstall = false } = {}) {
  return {
    initArgs: skipInstall ? withSkipInstall(scenario.initArgs) : [...scenario.initArgs],
    addArgs: skipInstall && scenario.addArgs.length > 0
      ? withSkipInstall(scenario.addArgs)
      : [...scenario.addArgs],
  };
}

export function runCommand(command, args, cwd, {
  env = {},
  log = true,
  toolchainChannel = 'stable',
} = {}) {
  if (log) {
    console.log(`Running in ${cwd}: ${command} ${args.join(' ')}`);
  }

  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ANHEDRAL_TOOLCHAIN: toolchainChannel,
      ...env,
    },
  });
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed in ${cwd}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );

  if (log) {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  }

  return { stdout, stderr };
}

export function runScenario({
  cliEntry,
  scenario,
  workspaceRoot,
  skipInstall = false,
  toolchainChannel = 'stable',
  log = true,
}) {
  const projectRoot = path.join(workspaceRoot, scenario.projectDirectory);
  mkdirSync(projectRoot, { recursive: true });
  const args = scenarioArgs(scenario, { skipInstall });

  runCommand('node', [cliEntry, 'init', ...args.initArgs], projectRoot, {
    log,
    toolchainChannel,
  });

  if (args.addArgs.length > 0) {
    runCommand('node', [cliEntry, 'add', ...args.addArgs], projectRoot, {
      log,
      toolchainChannel,
    });
  }

  return projectRoot;
}

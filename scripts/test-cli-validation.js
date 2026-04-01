import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'index.js');

function runCli(args) {
  return spawnSync('node', [cliEntry, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

const cases = [
  {
    name: 'prints usage on help',
    args: ['--help'],
    expectedExit: 0,
    stdoutIncludes: 'anhedral init <next|next-fullstack|expo-fullstack|backend> [--toolchain <latest|stable>]',
  },
  {
    name: 'fails unknown command',
    args: ['whoops'],
    expectedExit: 1,
    stderrIncludes: 'Unknown command: whoops',
  },
  {
    name: 'rejects unexpected positional arguments',
    args: ['init', 'demo'],
    expectedExit: 1,
    stderrIncludes: 'Unknown stack: demo. Choose one of: next, next-fullstack, expo-fullstack, backend',
  },
  {
    name: 'requires a stack target',
    args: ['init'],
    expectedExit: 1,
    stderrIncludes: 'Missing stack. Choose one of: next, next-fullstack, expo-fullstack, backend',
  },
  {
    name: 'rejects unknown flags',
    args: ['init', '--desktop'],
    expectedExit: 1,
    stderrIncludes: 'Unknown flag: --desktop',
  },
  {
    name: 'rejects unknown stacks',
    args: ['init', 'desktop'],
    expectedExit: 1,
    stderrIncludes: 'Unknown stack: desktop. Choose one of: next, next-fullstack, expo-fullstack, backend',
  },
  {
    name: 'rejects invalid toolchain values',
    args: ['init', 'next', '--toolchain', 'preview'],
    expectedExit: 1,
    stderrIncludes: '--toolchain must be one of: latest, stable',
  },
];

for (const testCase of cases) {
  const result = runCli(testCase.args);
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');

  assert.equal(result.status, testCase.expectedExit, `${testCase.name}: unexpected exit status\nstdout:\n${stdout}\nstderr:\n${stderr}`);

  if (testCase.stdoutIncludes) {
    assert.match(stdout, new RegExp(testCase.stdoutIncludes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${testCase.name}: stdout did not include expected text`);
  }

  if (testCase.stderrIncludes) {
    assert.match(stderr, new RegExp(testCase.stderrIncludes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${testCase.name}: stderr did not include expected text`);
  }
}

console.log(`Validation tests passed: ${cases.length}`);

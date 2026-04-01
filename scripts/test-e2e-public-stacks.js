import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'index.js');
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'anhedral-public-stacks-'));

function run(command, args, cwd) {
  console.log(`Running in ${cwd}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });

  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed in ${cwd}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
}

function assertGitignoreContains(projectRoot, relativePath, expectedLines) {
  const filePath = path.join(projectRoot, relativePath);
  const contents = readFileSync(filePath, 'utf8');

  for (const line of expectedLines) {
    assert.match(contents, new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `${relativePath} should include ${line}`);
  }
}

try {
  const scenarios = [
    {
      name: 'next',
      folderName: 'next-sample',
      gitignores: [
        ['.gitignore', ['.env', '.env.*', '!.env.example']],
      ],
      checks: [
        ['pnpm', ['typecheck']],
      ],
    },
    {
      name: 'next-fullstack',
      folderName: 'next-fullstack-sample',
      gitignores: [
        ['.gitignore', ['.env', '.env.*', '!.env.example']],
        ['frontend/.gitignore', ['.env', '.env.*', '!.env.example']],
        ['backend/.gitignore', ['.env', '.env.*', '!.env.example']],
      ],
      checks: [
        ['pnpm', ['--filter', './frontend', 'typecheck']],
        ['pnpm', ['--filter', './backend', 'typecheck']],
        ['pnpm', ['--filter', './backend', 'test']],
      ],
    },
    {
      name: 'expo-fullstack',
      folderName: 'mobile-sample',
      gitignores: [
        ['.gitignore', ['.env', '.env.*', '!.env.example']],
        ['frontend/.gitignore', ['.env', '.env.*', '!.env.example']],
        ['backend/.gitignore', ['.env', '.env.*', '!.env.example']],
      ],
      checks: [
        ['pnpm', ['--filter', './frontend', 'typecheck']],
        ['pnpm', ['--filter', './backend', 'typecheck']],
        ['pnpm', ['--filter', './backend', 'test']],
      ],
    },
    {
      name: 'backend',
      folderName: 'backend-sample',
      gitignores: [
        ['.gitignore', ['.env', '.env.*', '!.env.example']],
      ],
      checks: [
        ['pnpm', ['typecheck']],
        ['pnpm', ['build']],
      ],
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n=== Verifying ${scenario.name} ===`);
    const projectRoot = path.join(tempRoot, scenario.folderName);
    mkdirSync(projectRoot, { recursive: true });
    run('node', [cliEntry, 'init', scenario.name], projectRoot);

    for (const [relativePath, expectedLines] of scenario.gitignores) {
      assertGitignoreContains(projectRoot, relativePath, expectedLines);
    }

    for (const [command, args] of scenario.checks) {
      run(command, args, projectRoot);
    }
  }

  console.log(`Public stack e2e verification passed: ${scenarios.length} stacks`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

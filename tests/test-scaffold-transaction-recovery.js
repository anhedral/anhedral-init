import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');

function transactionFileFingerprint(filePath) {
  const contents = readFileSync(filePath);
  const mode = lstatSync(filePath).mode & 0o7777;
  return createHash('sha256')
    .update(`file\0.\0${mode}\0${contents.length}\0`)
    .update(contents)
    .digest('hex');
}

function run(args, cwd) {
  const result = spawnSync('node', [cliEntry, ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function pendingRoots(root) {
  const transactionDirectory = path.join(root, '.anhedral-txn');
  const token = '2147483647-33333333-3333-4333-8333-333333333333';
  return {
    backupRoot: path.join(transactionDirectory, `backup-${token}`),
    stageRoot: path.join(transactionDirectory, `stage-${token}`),
  };
}

const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'anhedral-scaffold-recovery-')));
try {
  const interruptedInit = path.join(workspace, 'interrupted-init');
  mkdirSync(interruptedInit);
  const initRoots = pendingRoots(interruptedInit);
  mkdirSync(initRoots.backupRoot, { recursive: true });
  mkdirSync(initRoots.stageRoot, { recursive: true });
  writeFileSync(path.join(interruptedInit, 'partial.txt'), 'partially installed\n');
  writeFileSync(path.join(interruptedInit, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    ...initRoots,
    entries: [{
      relativePath: 'partial.txt',
      backupPath: null,
      installed: true,
      installedFingerprint: transactionFileFingerprint(path.join(interruptedInit, 'partial.txt')),
    }],
    createdDirectories: [],
  }) + '\n');

  run(['init', '--api', '--skip-install'], interruptedInit);
  assert.throws(() => readFileSync(path.join(interruptedInit, 'partial.txt')));
  assert.throws(() => readFileSync(path.join(interruptedInit, '.anhedral-journal.json')));
  assert.equal(JSON.parse(readFileSync(path.join(interruptedInit, 'anhedral.json'), 'utf8')).modules.includes('api'), true);

  const interruptedNoOp = path.join(workspace, 'interrupted-no-op');
  mkdirSync(interruptedNoOp);
  run(['init', '--api', '--skip-install'], interruptedNoOp);
  const manifestPath = path.join(interruptedNoOp, 'anhedral.json');
  const originalManifest = readFileSync(manifestPath, 'utf8');
  const replacement = JSON.parse(originalManifest);
  replacement.project.displayName = 'Interrupted replacement';
  writeFileSync(manifestPath, JSON.stringify(replacement, null, 2) + '\n');

  const addRoots = pendingRoots(interruptedNoOp);
  mkdirSync(addRoots.backupRoot, { recursive: true });
  mkdirSync(addRoots.stageRoot, { recursive: true });
  const backupPath = path.join(addRoots.backupRoot, 'anhedral.json');
  writeFileSync(backupPath, originalManifest);
  writeFileSync(path.join(interruptedNoOp, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    ...addRoots,
    entries: [{
      relativePath: 'anhedral.json',
      backupPath,
      installed: true,
      installedFingerprint: transactionFileFingerprint(manifestPath),
    }],
    createdDirectories: [],
  }) + '\n');

  const noOp = run(['add', 'api', '--skip-install'], interruptedNoOp);
  assert.match(noOp.stdout, /already installed/);
  assert.equal(readFileSync(manifestPath, 'utf8'), originalManifest);
  assert.throws(() => readFileSync(path.join(interruptedNoOp, '.anhedral-journal.json')));

  if (process.platform !== 'win32') {
    const readOnlyParent = path.join(workspace, 'read-only-parent');
    const writableProject = path.join(readOnlyParent, 'writable-project');
    mkdirSync(writableProject, { recursive: true });
    chmodSync(readOnlyParent, 0o555);
    try {
      run(['init', '--api', '--skip-install'], writableProject);
      assert.equal(JSON.parse(readFileSync(path.join(writableProject, 'anhedral.json'), 'utf8')).modules.includes('api'), true);
      assert.equal(existsSync(path.join(writableProject, '.anhedral-txn')), false);
    } finally {
      chmodSync(readOnlyParent, 0o755);
    }
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log('Scaffold transaction recovery tests passed');

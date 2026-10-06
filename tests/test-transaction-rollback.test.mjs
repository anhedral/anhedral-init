import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { PostCommitError, recoverInterruptedTransaction, runStagedTransaction } from '../dist/transaction.js';

const JOURNAL_TOKEN = ['2147483647', '22222222', '2222', '4222', '8222', '222222222222'].join('-');

function transactionFileFingerprint(filePath) {
  const contents = readFileSync(filePath);
  const mode = lstatSync(filePath).mode & 0o7777;
  return createHash('sha256')
    .update(`file\0.\0${mode}\0${contents.length}\0`)
    .update(contents)
    .digest('hex');
}

function transactionRoots(root, token = JOURNAL_TOKEN) {
  const transactionDirectory = path.join(root, '.anhedral-txn');
  return {
    transactionDirectory,
    backupRoot: path.join(transactionDirectory, `backup-${token}`),
    stageRoot: path.join(transactionDirectory, `stage-${token}`),
  };
}

const root = mkdtempSync(path.join(tmpdir(), 'anhedral-rollback-'));
try {
  writeFileSync(path.join(root, 'a.txt'), 'original\n');
  await assert.rejects(
    runStagedTransaction(root, {
      commitPaths: ['a.txt', 'nested/created.txt', 'z-missing.txt'],
      build: async (stageRoot) => {
        mkdirSync(stageRoot, { recursive: true });
        writeFileSync(path.join(stageRoot, 'a.txt'), 'replacement\n');
        mkdirSync(path.join(stageRoot, 'nested'));
        writeFileSync(path.join(stageRoot, 'nested/created.txt'), 'temporary\n');
      },
    }),
    /missing declared path/,
  );
  assert.equal(readFileSync(path.join(root, 'a.txt'), 'utf8'), 'original\n');
  assert.equal(existsSync(path.join(root, 'nested')), false, 'rollback must prune transaction-created empty parents');
} finally {
  rmSync(root, { recursive: true, force: true });
}

const deletionRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-delete-'));
try {
  writeFileSync(path.join(deletionRoot, 'obsolete.txt'), 'obsolete\n');
  const changed = await runStagedTransaction(deletionRoot, {
    commitPaths: [],
    deletePaths: ['obsolete.txt'],
    build: async () => {},
  });
  assert.deepEqual(changed, ['obsolete.txt']);
  assert.equal(existsSync(path.join(deletionRoot, 'obsolete.txt')), false);
  assert.equal(existsSync(path.join(deletionRoot, '.anhedral-journal.json')), false);
} finally {
  rmSync(deletionRoot, { recursive: true, force: true });
}

const deletionRollbackRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-delete-rollback-'));
try {
  writeFileSync(path.join(deletionRollbackRoot, 'a-obsolete.txt'), 'restore me\n');
  await assert.rejects(
    runStagedTransaction(deletionRollbackRoot, {
      commitPaths: ['z-missing.txt'],
      deletePaths: ['a-obsolete.txt'],
      build: async () => {},
    }),
    /missing declared path/,
  );
  assert.equal(readFileSync(path.join(deletionRollbackRoot, 'a-obsolete.txt'), 'utf8'), 'restore me\n');
  assert.equal(existsSync(path.join(deletionRollbackRoot, '.anhedral-journal.json')), false);
} finally {
  rmSync(deletionRollbackRoot, { recursive: true, force: true });
}

const redundantDeletionRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-delete-topology-'));
try {
  mkdirSync(path.join(redundantDeletionRoot, 'obsolete/nested'), { recursive: true });
  writeFileSync(path.join(redundantDeletionRoot, 'obsolete/nested/file.txt'), 'obsolete\n');
  const changed = await runStagedTransaction(redundantDeletionRoot, {
    commitPaths: [],
    deletePaths: ['obsolete/nested/file.txt', 'obsolete', 'obsolete/nested'],
    build: async () => {},
  });
  assert.deepEqual(changed, ['obsolete'], 'an ancestor delete must subsume all descendant deletes');
  assert.equal(existsSync(path.join(redundantDeletionRoot, 'obsolete')), false);
} finally {
  rmSync(redundantDeletionRoot, { recursive: true, force: true });
}

for (const topology of [
  { commitPaths: ['tree', 'tree/child.txt'], deletePaths: [], message: /Ambiguous transaction write paths/ },
  { commitPaths: ['tree/child.txt'], deletePaths: ['tree'], message: /Ambiguous transaction write\/delete paths/ },
  { commitPaths: ['tree'], deletePaths: ['tree/child.txt'], message: /Ambiguous transaction write\/delete paths/ },
]) {
  const topologyRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-ambiguous-topology-'));
  try {
    await assert.rejects(
      runStagedTransaction(topologyRoot, {
        commitPaths: topology.commitPaths,
        deletePaths: topology.deletePaths,
        build: async (stageRoot) => {
          mkdirSync(path.join(stageRoot, 'tree'), { recursive: true });
          writeFileSync(path.join(stageRoot, 'tree/child.txt'), 'candidate\n');
        },
      }),
      topology.message,
    );
    assert.equal(existsSync(path.join(topologyRoot, 'tree')), false);
  } finally {
    rmSync(topologyRoot, { recursive: true, force: true });
  }
}

const dryRunRecoveryRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-dry-run-recovery-'));
try {
  const { backupRoot, stageRoot } = transactionRoots(dryRunRecoveryRoot);
  const backupPath = path.join(backupRoot, 'state.txt');
  const journalPath = path.join(dryRunRecoveryRoot, '.anhedral-journal.json');
  mkdirSync(backupRoot, { recursive: true });
  mkdirSync(stageRoot, { recursive: true });
  writeFileSync(path.join(dryRunRecoveryRoot, 'state.txt'), 'interrupted replacement\n');
  const installedFingerprint = transactionFileFingerprint(path.join(dryRunRecoveryRoot, 'state.txt'));
  writeFileSync(backupPath, 'original\n');
  writeFileSync(path.join(stageRoot, 'uncommitted.txt'), 'uncommitted\n');
  writeFileSync(journalPath, JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    entries: [{ relativePath: 'state.txt', backupPath, installed: true, installedFingerprint }],
    createdDirectories: [],
  }) + '\n');
  const before = {
    target: readFileSync(path.join(dryRunRecoveryRoot, 'state.txt')),
    backup: readFileSync(backupPath),
    staged: readFileSync(path.join(stageRoot, 'uncommitted.txt')),
    journal: readFileSync(journalPath),
  };
  let built = false;
  await assert.rejects(
    runStagedTransaction(dryRunRecoveryRoot, {
      commitPaths: ['state.txt'],
      dryRun: true,
      build: async () => { built = true; },
    }),
    /Dry-run cannot recover an interrupted transaction/,
  );
  assert.equal(built, false);
  assert.deepEqual(readFileSync(path.join(dryRunRecoveryRoot, 'state.txt')), before.target);
  assert.deepEqual(readFileSync(backupPath), before.backup);
  assert.deepEqual(readFileSync(path.join(stageRoot, 'uncommitted.txt')), before.staged);
  assert.deepEqual(readFileSync(journalPath), before.journal);
} finally {
  rmSync(dryRunRecoveryRoot, { recursive: true, force: true });
}

const localStageParent = mkdtempSync(path.join(tmpdir(), 'anhedral-local-stage-parent-'));
const localStageRoot = path.join(localStageParent, 'project');
mkdirSync(localStageRoot);
if (process.platform !== 'win32') chmodSync(localStageParent, 0o555);
try {
  let observedStageRoot = '';
  await runStagedTransaction(localStageRoot, {
    commitPaths: ['created.txt'],
    build: async (stageRoot) => {
      observedStageRoot = stageRoot;
      writeFileSync(path.join(stageRoot, 'created.txt'), 'created locally\n');
    },
  });
  assert.ok(
    observedStageRoot.startsWith(`${path.join(localStageRoot, '.anhedral-txn')}${path.sep}`),
    'staging must stay inside the writable project instead of requiring a writable parent',
  );
  assert.equal(readFileSync(path.join(localStageRoot, 'created.txt'), 'utf8'), 'created locally\n');
  assert.equal(existsSync(path.join(localStageRoot, '.anhedral-txn')), false);
} finally {
  if (process.platform !== 'win32') chmodSync(localStageParent, 0o755);
  rmSync(localStageParent, { recursive: true, force: true });
}

const localRecoveryRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-local-recovery-'));
try {
  const transactionDirectory = path.join(localRecoveryRoot, '.anhedral-txn');
  const backupRoot = path.join(transactionDirectory, `backup-${JOURNAL_TOKEN}`);
  const stageRoot = path.join(transactionDirectory, `stage-${JOURNAL_TOKEN}`);
  const backupPath = path.join(backupRoot, 'state.txt');
  mkdirSync(backupRoot, { recursive: true });
  mkdirSync(stageRoot, { recursive: true });
  writeFileSync(path.join(localRecoveryRoot, 'state.txt'), 'interrupted replacement\n');
  const installedFingerprint = transactionFileFingerprint(path.join(localRecoveryRoot, 'state.txt'));
  writeFileSync(backupPath, 'original\n');
  writeFileSync(path.join(localRecoveryRoot, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    entries: [{ relativePath: 'state.txt', backupPath, installed: true, installedFingerprint }],
    createdDirectories: [],
  }) + '\n');
  assert.equal(recoverInterruptedTransaction(localRecoveryRoot), true);
  assert.equal(readFileSync(path.join(localRecoveryRoot, 'state.txt'), 'utf8'), 'original\n');
  assert.equal(existsSync(transactionDirectory), false, 'successful recovery must remove the local transaction namespace');
} finally {
  rmSync(localRecoveryRoot, { recursive: true, force: true });
}

const changedRecoveryRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-changed-recovery-'));
try {
  const transactionDirectory = path.join(changedRecoveryRoot, '.anhedral-txn');
  const backupRoot = path.join(transactionDirectory, `backup-${JOURNAL_TOKEN}`);
  const stageRoot = path.join(transactionDirectory, `stage-${JOURNAL_TOKEN}`);
  const targetPath = path.join(changedRecoveryRoot, 'state.txt');
  const backupPath = path.join(backupRoot, 'state.txt');
  mkdirSync(backupRoot, { recursive: true });
  mkdirSync(stageRoot, { recursive: true });
  writeFileSync(targetPath, 'installed by interrupted transaction\n');
  const installedFingerprint = transactionFileFingerprint(targetPath);
  writeFileSync(backupPath, 'original\n');
  writeFileSync(path.join(changedRecoveryRoot, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    entries: [{
      relativePath: 'state.txt',
      backupPath,
      installed: true,
      installedFingerprint,
    }],
    createdDirectories: [],
  }) + '\n');
  writeFileSync(targetPath, 'user edit after the crash\n');

  assert.throws(
    () => recoverInterruptedTransaction(changedRecoveryRoot),
    /changed after an interrupted commit/,
  );
  assert.equal(readFileSync(targetPath, 'utf8'), 'user edit after the crash\n');
  assert.equal(readFileSync(backupPath, 'utf8'), 'original\n');
  assert.equal(existsSync(path.join(changedRecoveryRoot, '.anhedral-journal.json')), true);
} finally {
  rmSync(changedRecoveryRoot, { recursive: true, force: true });
}

const preInstallRecoveryRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-pre-install-recovery-'));
try {
  const transactionDirectory = path.join(preInstallRecoveryRoot, '.anhedral-txn');
  const backupRoot = path.join(transactionDirectory, `backup-${JOURNAL_TOKEN}`);
  const stageRoot = path.join(transactionDirectory, `stage-${JOURNAL_TOKEN}`);
  mkdirSync(backupRoot, { recursive: true });
  mkdirSync(stageRoot, { recursive: true });
  const stagedPath = path.join(stageRoot, 'nested/state.txt');
  mkdirSync(path.dirname(stagedPath), { recursive: true });
  writeFileSync(stagedPath, 'staged replacement\n');
  writeFileSync(path.join(preInstallRecoveryRoot, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    createdDirectories: ['nested'],
    entries: [{
      relativePath: 'nested/state.txt',
      backupPath: null,
      installed: true,
      installedFingerprint: transactionFileFingerprint(stagedPath),
    }],
  }) + '\n');
  assert.equal(recoverInterruptedTransaction(preInstallRecoveryRoot), true);
  assert.equal(
    existsSync(path.join(preInstallRecoveryRoot, 'nested')),
    false,
    'recovery must tolerate a durable journal whose not-yet-renamed target parent was lost',
  );
  assert.equal(existsSync(transactionDirectory), false);
} finally {
  rmSync(preInstallRecoveryRoot, { recursive: true, force: true });
}

const postCommitRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-post-commit-'));
try {
  await assert.rejects(
    runStagedTransaction(postCommitRoot, {
      commitPaths: ['committed.txt'],
      build: async (stageRoot) => writeFileSync(path.join(stageRoot, 'committed.txt'), 'committed\n'),
      afterCommit: async () => { throw new Error('install failed'); },
    }),
    (error) => {
      assert.equal(error instanceof PostCommitError, true);
      assert.deepEqual(error.committedPaths, ['committed.txt']);
      assert.match(error.message, /Changes were committed successfully/);
      assert.match(error.message, /install failed/);
      return true;
    },
  );
  assert.equal(readFileSync(path.join(postCommitRoot, 'committed.txt'), 'utf8'), 'committed\n');
} finally {
  rmSync(postCommitRoot, { recursive: true, force: true });
}

for (const noncanonicalPath of ['a/./b.txt', 'a//b.txt', '.anhedral-txn/escape.txt']) {
  const aliasRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-path-alias-'));
  try {
    await assert.rejects(
      runStagedTransaction(aliasRoot, {
        commitPaths: [noncanonicalPath],
        build: async (stageRoot) => {
          mkdirSync(path.join(stageRoot, 'a'), { recursive: true });
          writeFileSync(path.join(stageRoot, 'a', 'b.txt'), 'unsafe alias\n');
        },
      }),
      /Unsafe transaction path/,
    );
    assert.equal(existsSync(path.join(aliasRoot, 'a', 'b.txt')), false);
    assert.equal(existsSync(path.join(aliasRoot, '.anhedral-journal.json')), false);
  } finally {
    rmSync(aliasRoot, { recursive: true, force: true });
  }
}

const recoveryRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-recovery-'));
const sentinel = path.join(path.dirname(recoveryRoot), `${path.basename(recoveryRoot)}-sentinel.txt`);
try {
  writeFileSync(sentinel, 'safe\n');
  const { backupRoot, stageRoot } = transactionRoots(recoveryRoot);
  writeFileSync(path.join(recoveryRoot, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    entries: [{
      relativePath: `safe/../../${path.basename(sentinel)}`,
      backupPath: null,
      installed: true,
      installedFingerprint: '0'.repeat(64),
    }],
    createdDirectories: [],
  }));
  assert.throws(() => recoverInterruptedTransaction(recoveryRoot), /Unsafe transaction path/);
  assert.equal(readFileSync(sentinel, 'utf8'), 'safe\n');
  assert.equal(readFileSync(path.join(recoveryRoot, '.anhedral-journal.json'), 'utf8').length > 0, true);
  assert.throws(() => readFileSync(path.join(recoveryRoot, '.anhedral.lock')));
} finally {
  rmSync(recoveryRoot, { recursive: true, force: true });
  rmSync(sentinel, { force: true });
}

const mismatchedRootsRecovery = mkdtempSync(path.join(tmpdir(), 'anhedral-mismatched-roots-'));
try {
  const backupRoot = transactionRoots(mismatchedRootsRecovery).backupRoot;
  const stageRoot = transactionRoots(
    mismatchedRootsRecovery,
    '2147483647-33333333-3333-4333-8333-333333333333',
  ).stageRoot;
  writeFileSync(path.join(mismatchedRootsRecovery, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    entries: [],
    createdDirectories: [],
  }));
  assert.throws(
    () => recoverInterruptedTransaction(mismatchedRootsRecovery),
    /do not share one token/,
  );
  assert.equal(existsSync(path.join(mismatchedRootsRecovery, '.anhedral-journal.json')), true);
} finally {
  rmSync(mismatchedRootsRecovery, { recursive: true, force: true });
}

const ambiguousJournalRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-ambiguous-journal-'));
try {
  const { backupRoot, stageRoot } = transactionRoots(ambiguousJournalRoot);
  writeFileSync(path.join(ambiguousJournalRoot, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    entries: [
      { relativePath: 'tree', backupPath: null, installed: false, installedFingerprint: null },
      { relativePath: 'tree/file.txt', backupPath: null, installed: false, installedFingerprint: null },
    ],
    createdDirectories: [],
  }));
  assert.throws(
    () => recoverInterruptedTransaction(ambiguousJournalRoot),
    /Ambiguous transaction journal paths/,
  );
  assert.equal(existsSync(path.join(ambiguousJournalRoot, '.anhedral-journal.json')), true);
} finally {
  rmSync(ambiguousJournalRoot, { recursive: true, force: true });
}

const invalidCreatedDirectoryRecovery = mkdtempSync(path.join(tmpdir(), 'anhedral-created-directory-inventory-'));
try {
  const { backupRoot, stageRoot } = transactionRoots(invalidCreatedDirectoryRecovery);
  const protectedDirectory = path.join(invalidCreatedDirectoryRecovery, 'protected');
  mkdirSync(protectedDirectory);
  writeFileSync(path.join(protectedDirectory, 'sentinel.txt'), 'must remain\n');
  writeFileSync(path.join(invalidCreatedDirectoryRecovery, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    entries: [{ relativePath: 'state.txt', backupPath: null, installed: false, installedFingerprint: null }],
    createdDirectories: ['protected'],
  }));
  assert.throws(
    () => recoverInterruptedTransaction(invalidCreatedDirectoryRecovery),
    /not a parent of any journal entry/,
  );
  assert.equal(readFileSync(path.join(protectedDirectory, 'sentinel.txt'), 'utf8'), 'must remain\n');
  assert.equal(existsSync(path.join(invalidCreatedDirectoryRecovery, '.anhedral-journal.json')), true);
} finally {
  rmSync(invalidCreatedDirectoryRecovery, { recursive: true, force: true });
}

const symlinkRecoveryRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-symlink-recovery-'));
const symlinkOutsideRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-symlink-outside-'));
try {
  const { backupRoot, stageRoot } = transactionRoots(symlinkRecoveryRoot);
  mkdirSync(backupRoot, { recursive: true });
  mkdirSync(stageRoot, { recursive: true });
  writeFileSync(path.join(symlinkOutsideRoot, 'sentinel.txt'), 'outside is safe\n');
  symlinkSync(symlinkOutsideRoot, path.join(backupRoot, 'linked'));
  const backupPath = path.join(backupRoot, 'linked', 'sentinel.txt');
  const journalPath = path.join(symlinkRecoveryRoot, '.anhedral-journal.json');
  writeFileSync(journalPath, JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    entries: [{ relativePath: 'linked/sentinel.txt', backupPath, installed: false, installedFingerprint: null }],
    createdDirectories: [],
  }) + '\n');
  assert.throws(
    () => recoverInterruptedTransaction(symlinkRecoveryRoot),
    /Refusing transaction path containing a symbolic link/,
  );
  assert.equal(readFileSync(path.join(symlinkOutsideRoot, 'sentinel.txt'), 'utf8'), 'outside is safe\n');
  assert.equal(existsSync(path.join(symlinkRecoveryRoot, 'linked', 'sentinel.txt')), false);
  assert.equal(existsSync(journalPath), true);
} finally {
  rmSync(symlinkRecoveryRoot, { recursive: true, force: true });
  rmSync(symlinkOutsideRoot, { recursive: true, force: true });
}

const concurrentRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-concurrent-'));
try {
  writeFileSync(path.join(concurrentRoot, 'state.txt'), '0\n');
  let markStarted;
  let unblock;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const blocked = new Promise((resolve) => { unblock = resolve; });
  let firstValue;
  const first = runStagedTransaction(concurrentRoot, {
    commitPaths: ['state.txt'],
    prepare: async () => {
      firstValue = Number.parseInt(readFileSync(path.join(concurrentRoot, 'state.txt'), 'utf8'), 10) + 1;
    },
    build: async (stageRoot) => {
      writeFileSync(path.join(stageRoot, 'state.txt'), `${firstValue}\n`);
      markStarted();
      await blocked;
    },
  });
  await started;
  let blockedPrepareCalls = 0;
  await assert.rejects(
    runStagedTransaction(concurrentRoot, {
      commitPaths: ['state.txt'],
      prepare: async () => { blockedPrepareCalls += 1; },
      build: async (stageRoot) => writeFileSync(path.join(stageRoot, 'state.txt'), 'stale\n'),
    }),
    /Another Anhedral operation is already running/,
  );
  assert.equal(blockedPrepareCalls, 0);
  unblock();
  await first;
  assert.equal(readFileSync(path.join(concurrentRoot, 'state.txt'), 'utf8'), '1\n');

  let secondValue;
  await runStagedTransaction(concurrentRoot, {
    commitPaths: ['state.txt'],
    prepare: async () => {
      secondValue = Number.parseInt(readFileSync(path.join(concurrentRoot, 'state.txt'), 'utf8'), 10) + 1;
    },
    build: async (stageRoot) => writeFileSync(path.join(stageRoot, 'state.txt'), `${secondValue}\n`),
  });
  assert.equal(readFileSync(path.join(concurrentRoot, 'state.txt'), 'utf8'), '2\n');
} finally {
  rmSync(concurrentRoot, { recursive: true, force: true });
}

const activeRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-active-lock-'));
try {
  const { backupRoot, stageRoot } = transactionRoots(activeRoot);
  writeFileSync(path.join(activeRoot, '.anhedral.lock'), JSON.stringify({
    version: 1,
    pid: process.pid,
    hostname: hostname(),
    token: 'active-test',
    createdAt: new Date().toISOString(),
  }) + '\n');
  writeFileSync(path.join(activeRoot, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    entries: [],
    createdDirectories: [],
  }));
  assert.throws(() => recoverInterruptedTransaction(activeRoot), /Another Anhedral operation is already running/);
  assert.equal(readFileSync(path.join(activeRoot, '.anhedral-journal.json'), 'utf8').length > 0, true);
} finally {
  rmSync(activeRoot, { recursive: true, force: true });
}

const resumableRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-resumable-recovery-'));
try {
  const { backupRoot, stageRoot } = transactionRoots(resumableRoot);
  mkdirSync(backupRoot, { recursive: true });
  mkdirSync(stageRoot, { recursive: true });
  const backupPath = path.join(backupRoot, 'restored.txt');
  writeFileSync(path.join(resumableRoot, '.anhedral-journal.json'), JSON.stringify({
    version: 2,
    backupRoot,
    stageRoot,
    entries: [{ relativePath: 'restored.txt', backupPath, installed: false, installedFingerprint: null }],
    createdDirectories: [],
  }));
  writeFileSync(path.join(resumableRoot, '.anhedral.lock'), JSON.stringify({
    version: 1,
    pid: 2147483647,
    hostname: hostname(),
    token: 'stale-test',
    createdAt: new Date(0).toISOString(),
  }) + '\n');
  assert.throws(() => recoverInterruptedTransaction(resumableRoot), /missing transaction backup/);
  assert.equal(readFileSync(path.join(resumableRoot, '.anhedral-journal.json'), 'utf8').length > 0, true);
  assert.throws(() => readFileSync(path.join(resumableRoot, '.anhedral.lock')));
  writeFileSync(backupPath, 'restored\n');
  assert.equal(recoverInterruptedTransaction(resumableRoot), true);
  assert.equal(readFileSync(path.join(resumableRoot, 'restored.txt'), 'utf8'), 'restored\n');
  assert.throws(() => readFileSync(path.join(resumableRoot, '.anhedral-journal.json')));
} finally {
  rmSync(resumableRoot, { recursive: true, force: true });
}

const staleReclaimerRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-stale-reclaimer-'));
try {
  const staleOwner = {
    version: 1,
    pid: 2147483647,
    hostname: hostname(),
    token: 'stale-owner',
    createdAt: new Date(0).toISOString(),
  };
  writeFileSync(path.join(staleReclaimerRoot, '.anhedral.lock'), JSON.stringify(staleOwner) + '\n');
  writeFileSync(path.join(staleReclaimerRoot, '.anhedral.lock.reclaim'), JSON.stringify({
    ...staleOwner,
    token: 'stale-reclaimer',
  }) + '\n');
  await runStagedTransaction(staleReclaimerRoot, {
    commitPaths: ['recovered.txt'],
    build: async (stageRoot) => writeFileSync(path.join(stageRoot, 'recovered.txt'), 'recovered\n'),
  });
  assert.equal(readFileSync(path.join(staleReclaimerRoot, 'recovered.txt'), 'utf8'), 'recovered\n');
  assert.throws(() => readFileSync(path.join(staleReclaimerRoot, '.anhedral.lock')));
  assert.throws(() => readFileSync(path.join(staleReclaimerRoot, '.anhedral.lock.reclaim')));
} finally {
  rmSync(staleReclaimerRoot, { recursive: true, force: true });
}

const staleTemporaryRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-stale-lock-temp-'));
try {
  const temporaryPath = path.join(staleTemporaryRoot, '.anhedral.lock.2147483647-stale.tmp');
  writeFileSync(temporaryPath, JSON.stringify({
    version: 1,
    pid: 2147483647,
    hostname: hostname(),
    token: 'stale-temporary-owner',
    createdAt: new Date(0).toISOString(),
  }) + '\n');
  await runStagedTransaction(staleTemporaryRoot, {
    commitPaths: ['created.txt'],
    build: async (stageRoot) => writeFileSync(path.join(stageRoot, 'created.txt'), 'created\n'),
  });
  assert.equal(readFileSync(path.join(staleTemporaryRoot, 'created.txt'), 'utf8'), 'created\n');
  assert.equal(existsSync(temporaryPath), false);
  assert.equal(existsSync(path.join(staleTemporaryRoot, '.anhedral.lock')), false);
} finally {
  rmSync(staleTemporaryRoot, { recursive: true, force: true });
}

const malformedArtifactRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-malformed-lock-temp-'));
try {
  const artifactPath = path.join(malformedArtifactRoot, '.anhedral.lock.unknown.tmp');
  writeFileSync(artifactPath, 'not a lock owner\n');
  await assert.rejects(
    runStagedTransaction(malformedArtifactRoot, {
      commitPaths: ['blocked.txt'],
      build: async (stageRoot) => writeFileSync(path.join(stageRoot, 'blocked.txt'), 'must not commit\n'),
    }),
    /Cannot safely classify transaction lock artifact/,
  );
  assert.equal(readFileSync(artifactPath, 'utf8'), 'not a lock owner\n');
  assert.equal(existsSync(path.join(malformedArtifactRoot, '.anhedral.lock')), false);
  assert.equal(existsSync(path.join(malformedArtifactRoot, 'blocked.txt')), false);
} finally {
  rmSync(malformedArtifactRoot, { recursive: true, force: true });
}

for (const relativePath of ['dangling.txt', 'dangling-parent/created.txt']) {
  const danglingRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-dangling-link-'));
  try {
    if (relativePath.includes('/')) {
      symlinkSync('/definitely/missing/anhedral-parent', path.join(danglingRoot, 'dangling-parent'));
    } else {
      symlinkSync('/definitely/missing/anhedral-file', path.join(danglingRoot, relativePath));
    }
    await assert.rejects(
      runStagedTransaction(danglingRoot, {
        commitPaths: [relativePath],
        build: async (stageRoot) => {
          mkdirSync(path.dirname(path.join(stageRoot, relativePath)), { recursive: true });
          writeFileSync(path.join(stageRoot, relativePath), 'must not replace link\n');
        },
      }),
      /symbolic link/,
    );
    const linkPath = path.join(danglingRoot, relativePath.includes('/') ? 'dangling-parent' : relativePath);
    assert.equal(lstatSync(linkPath).isSymbolicLink(), true);
  } finally {
    rmSync(danglingRoot, { recursive: true, force: true });
  }
}

const orphanRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-orphan-roots-'));
try {
  const token = '2147483647-00000000-0000-4000-8000-000000000000';
  const transactionDirectory = path.join(orphanRoot, '.anhedral-txn');
  const orphanStage = path.join(transactionDirectory, `stage-${token}`);
  const orphanBackup = path.join(transactionDirectory, `backup-${token}`);
  mkdirSync(orphanStage, { recursive: true });
  mkdirSync(orphanBackup, { recursive: true });
  writeFileSync(path.join(orphanStage, 'seed-copy.txt'), 'stale staged copy\n');
  writeFileSync(path.join(orphanBackup, 'seed-copy.txt'), 'stale backup copy\n');
  await runStagedTransaction(orphanRoot, {
    commitPaths: ['created.txt'],
    build: async (stageRoot) => writeFileSync(path.join(stageRoot, 'created.txt'), 'created\n'),
  });
  assert.equal(existsSync(orphanStage), false);
  assert.equal(existsSync(orphanBackup), false);

  mkdirSync(transactionDirectory);
  const unsafeOrphan = path.join(
    transactionDirectory,
    'stage-2147483647-11111111-1111-4111-8111-111111111111',
  );
  symlinkSync('/definitely/missing/orphan-root', unsafeOrphan);
  await assert.rejects(
    runStagedTransaction(orphanRoot, { commitPaths: [], build: async () => {} }),
    /Unsafe orphan transaction root/,
  );
  assert.equal(lstatSync(unsafeOrphan).isSymbolicLink(), true);
  assert.equal(existsSync(path.join(orphanRoot, '.anhedral.lock')), false);
  rmSync(unsafeOrphan);
} finally {
  rmSync(orphanRoot, { recursive: true, force: true });
}

console.log('Transaction rollback and recovery validation tests passed');

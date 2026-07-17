import {
  closeSync,
  cpSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const LOCK_FILE = '.anhedral.lock';
const JOURNAL_FILE = '.anhedral-journal.json';
const TRANSACTION_DIRECTORY = '.anhedral-txn';
const JOURNAL_VERSION = 2 as const;
const LOCAL_TRANSACTION_ROOT_PATTERN = /^(?:stage|backup)-\d+-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JournalEntry = {
  relativePath: string;
  backupPath: string | null;
  installed: boolean;
  installedFingerprint: string | null;
};

type TransactionJournal = {
  version: typeof JOURNAL_VERSION;
  backupRoot: string;
  stageRoot: string;
  entries: JournalEntry[];
  createdDirectories: string[];
};

type LockOwner = {
  version: 1;
  pid: number;
  hostname: string;
  token: string;
  createdAt: string;
};

type TransactionLock = {
  lockPath: string;
  owner: LockOwner;
};

function assertRelativePath(relativePath: string): void {
  const normalized = path.normalize(relativePath);
  const rawSegments = relativePath.split(/[\\/]/);
  if (
    !relativePath ||
    relativePath.includes('\0') ||
    relativePath.includes('\\') ||
    path.isAbsolute(relativePath) ||
    rawSegments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith(`..${path.sep}`) ||
    normalized.split(path.sep).includes('..')
    || rawSegments[0] === TRANSACTION_DIRECTORY
    || rawSegments[0] === LOCK_FILE
    || rawSegments[0] === JOURNAL_FILE
  ) {
    throw new Error(`Unsafe transaction path: ${relativePath}`);
  }
}

function resolveTransactionPath(root: string, relativePath: string): string {
  assertRelativePath(relativePath);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe transaction path: ${relativePath}`);
  }
  return resolved;
}

function ancestorInSet(relativePath: string, candidates: ReadonlySet<string>): string | null {
  const segments = relativePath.split('/');
  for (let index = 1; index < segments.length; index += 1) {
    const ancestor = segments.slice(0, index).join('/');
    if (candidates.has(ancestor)) return ancestor;
  }
  return null;
}

function assertNoPathAncestry(paths: readonly string[], context: string): void {
  const seen = new Set<string>();
  const ordered = [...paths].sort((left, right) =>
    left.split('/').length - right.split('/').length || left.localeCompare(right));
  for (const relativePath of ordered) {
    assertRelativePath(relativePath);
    const ancestor = ancestorInSet(relativePath, seen);
    if (ancestor) {
      throw new Error(`Ambiguous transaction ${context}: ${ancestor} is an ancestor of ${relativePath}.`);
    }
    seen.add(relativePath);
  }
}

function normalizeTransactionPaths(
  rawCommitPaths: readonly string[],
  rawDeletePaths: readonly string[],
): { commitPaths: string[]; deletePaths: string[]; uniquePaths: string[] } {
  const commitPaths = [...new Set(rawCommitPaths)];
  for (const relativePath of commitPaths) assertRelativePath(relativePath);
  assertNoPathAncestry(commitPaths, 'write paths');

  const deleteCandidates = [...new Set(rawDeletePaths)];
  for (const relativePath of deleteCandidates) assertRelativePath(relativePath);
  deleteCandidates.sort((left, right) =>
    left.split('/').length - right.split('/').length || left.localeCompare(right));
  const deleteSet = new Set<string>();
  const deletePaths = deleteCandidates.filter((candidate) => {
    if (ancestorInSet(candidate, deleteSet)) return false;
    deleteSet.add(candidate);
    return true;
  });

  const deleteAncestorPaths = new Set<string>();
  for (const deleted of deletePaths) {
    const segments = deleted.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      deleteAncestorPaths.add(segments.slice(0, index).join('/'));
    }
  }
  for (const written of commitPaths) {
    const deletedAncestor = ancestorInSet(written, deleteSet);
    if (deleteSet.has(written) || deletedAncestor || deleteAncestorPaths.has(written)) {
      throw new Error(
        `Ambiguous transaction write/delete paths include ${written}`
        + (deletedAncestor ? ` below ${deletedAncestor}` : ''),
      );
    }
  }

  const uniquePaths = [...commitPaths, ...deletePaths].sort();
  return { commitPaths, deletePaths, uniquePaths };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactObjectKeys(value: Record<string, unknown>, expected: readonly string[], context: string): void {
  const expectedKeys = new Set(expected);
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  const unknown = Object.keys(value).filter((key) => !expectedKeys.has(key));
  if (missing.length === 0 && unknown.length === 0) return;
  const details = [
    missing.length > 0 ? `missing ${missing.join(', ')}` : null,
    unknown.length > 0 ? `unknown ${unknown.join(', ')}` : null,
  ].filter((entry): entry is string => entry !== null).join('; ');
  throw new Error(`Invalid ${context} fields (${details}).`);
}

function lstatIfPresent(target: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function pathEntryExists(target: string): boolean {
  return lstatIfPresent(target) !== null;
}

function fingerprintEntry(target: string): string {
  const hash = createHash('sha256');
  const visit = (absolutePath: string, relativePath: string): void => {
    const stat = lstatSync(absolutePath);
    const mode = stat.mode & 0o7777;
    if (stat.isDirectory()) {
      hash.update(`directory\0${relativePath}\0${mode}\0`);
      for (const entry of readdirSync(absolutePath).sort()) {
        visit(path.join(absolutePath, entry), relativePath === '.' ? entry : `${relativePath}/${entry}`);
      }
      return;
    }
    if (stat.isFile()) {
      hash.update(`file\0${relativePath}\0${mode}\0${stat.size}\0`);
      hash.update(readFileSync(absolutePath));
      return;
    }
    throw new Error(`Cannot fingerprint unsupported transaction entry: ${absolutePath}`);
  };
  visit(target, '.');
  return hash.digest('hex');
}

type DirectorySyncOperation = 'open' | 'fsync';

function isUnsupportedDirectorySync(
  error: unknown,
  operation: DirectorySyncOperation,
): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOTSUP' || code === 'EOPNOTSUPP') return true;

  // Some filesystems expose directories as readable handles but reject fsync.
  // Windows may reject opening or syncing directory handles altogether. Keep
  // these narrowly scoped so permission and I/O failures remain actionable.
  if (operation === 'fsync' && code === 'EINVAL') return true;
  if (process.platform !== 'win32') return false;
  if (operation === 'open') return code === 'EISDIR' || code === 'EPERM';
  return code === 'EBADF' || code === 'EPERM';
}

function syncDirectory(directory: string): void {
  let descriptor: number;
  try {
    descriptor = openSync(directory, 'r');
  } catch (error) {
    if (isUnsupportedDirectorySync(error, 'open')) return;
    throw error;
  }

  try {
    try {
      fsyncSync(descriptor);
    } catch (error) {
      if (!isUnsupportedDirectorySync(error, 'fsync')) throw error;
    }
  } finally {
    closeSync(descriptor);
  }
}

function directoryChainToRoot(directory: string, root: string): string[] {
  const resolvedRoot = path.resolve(root);
  let cursor = path.resolve(directory);
  if (cursor !== resolvedRoot && !cursor.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Cannot sync transaction directory outside its root: ${directory}`);
  }

  const directories: string[] = [];
  while (true) {
    directories.push(cursor);
    if (cursor === resolvedRoot) return directories;
    cursor = path.dirname(cursor);
  }
}

function syncDirectories(directories: readonly string[]): void {
  const seen = new Set<string>();
  for (const directory of directories) {
    const resolved = path.resolve(directory);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    syncDirectory(resolved);
  }
}

function syncEntryRecursively(target: string): void {
  const stat = lstatSync(target);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(target)) syncEntryRecursively(path.join(target, entry));
    syncDirectory(target);
    return;
  }
  if (!stat.isFile()) return;

  const descriptor = openSync(target, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function renameDurably(source: string, target: string, root: string): void {
  renameSync(source, target);
  const targetDirectories = directoryChainToRoot(path.dirname(target), root);
  const sourceParent = path.dirname(source);
  syncDirectories([...targetDirectories, sourceParent]);
}

function removeEntryDurably(target: string): void {
  rmSync(target, { recursive: true, force: true });
  const parent = path.dirname(target);
  if (pathEntryExists(parent)) syncDirectory(parent);
}

function parseLockOwner(lockPath: string): LockOwner {
  if (lstatSync(lockPath).isSymbolicLink()) {
    throw new Error(`Refusing symbolic-link transaction lock at ${lockPath}.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read transaction lock owner at ${lockPath}; remove it only after confirming no Anhedral process is running.`, { cause: error });
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.pid) ||
    (value.pid as number) <= 0 ||
    typeof value.hostname !== 'string' ||
    typeof value.token !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    throw new Error(`Invalid transaction lock owner at ${lockPath}; remove it only after confirming no Anhedral process is running.`);
  }
  return value as LockOwner;
}

function readLockOwnerIfPresent(lockPath: string): LockOwner | null {
  try {
    return parseLockOwner(lockPath);
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
    if (candidate.code === 'ENOENT' || candidate.cause?.code === 'ENOENT') return null;
    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

function acquireTransactionLock(root: string): TransactionLock {
  const lockPath = path.join(root, LOCK_FILE);
  const reclaimPath = `${lockPath}.reclaim`;
  const owner: LockOwner = {
    version: 1,
    pid: process.pid,
    hostname: os.hostname(),
    token: `${process.pid}-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
  const temporaryPath = `${lockPath}.${owner.token}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(owner) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const activeReclaimer = readLockOwnerIfPresent(reclaimPath);
      if (activeReclaimer) {
        if (activeReclaimer.hostname === owner.hostname && !isProcessAlive(activeReclaimer.pid)) {
          try {
            unlinkSync(reclaimPath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          attempt -= 1;
          continue;
        }
        throw new Error(`An Anhedral lock is being recovered (${lockPath}, pid ${activeReclaimer.pid} on ${activeReclaimer.hostname}); retry the command.`);
      }

      try {
        linkSync(temporaryPath, lockPath);
        try {
          for (const entry of readdirSync(root)) {
            if (!entry.startsWith(`${LOCK_FILE}.`) || !entry.endsWith('.tmp')) continue;
            const staleTemporaryPath = path.join(root, entry);
            if (staleTemporaryPath === temporaryPath) continue;
            let temporaryOwner: LockOwner;
            try {
              temporaryOwner = parseLockOwner(staleTemporaryPath);
            } catch (error) {
              throw new Error(`Cannot safely classify transaction lock artifact at ${staleTemporaryPath}; inspect it manually before retrying.`, { cause: error });
            }
            if (temporaryOwner.hostname !== owner.hostname) {
              throw new Error(`Transaction lock artifact at ${staleTemporaryPath} belongs to another host; inspect it manually before retrying.`);
            }
            if (!isProcessAlive(temporaryOwner.pid)) {
              unlinkSync(staleTemporaryPath);
            }
          }
        } catch (error) {
          const current = readLockOwnerIfPresent(lockPath);
          if (current?.token === owner.token) unlinkSync(lockPath);
          throw error;
        }
        return { lockPath, owner };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }

      const existing = readLockOwnerIfPresent(lockPath);
      if (!existing) {
        attempt -= 1;
        continue;
      }
      if (existing.hostname !== owner.hostname || isProcessAlive(existing.pid)) {
        throw new Error(`Another Anhedral operation is already running (${lockPath}, pid ${existing.pid} on ${existing.hostname}).`);
      }

      try {
        linkSync(temporaryPath, reclaimPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          const reclaimer = readLockOwnerIfPresent(reclaimPath);
          if (!reclaimer) {
            attempt -= 1;
            continue;
          }
          if (reclaimer.hostname === owner.hostname && !isProcessAlive(reclaimer.pid)) {
            unlinkSync(reclaimPath);
            attempt -= 1;
            continue;
          }
          throw new Error(`A stale Anhedral lock is being recovered (${lockPath}, pid ${reclaimer.pid} on ${reclaimer.hostname}); retry the command.`);
        }
        throw error;
      }

      try {
        if (!pathEntryExists(lockPath)) continue;
        const current = parseLockOwner(lockPath);
        if (current.token !== existing.token) continue;
        if (current.hostname !== owner.hostname || isProcessAlive(current.pid)) {
          throw new Error(`Another Anhedral operation is already running (${lockPath}, pid ${current.pid} on ${current.hostname}).`);
        }
        unlinkSync(lockPath);
      } finally {
        if (pathEntryExists(reclaimPath)) {
          const reclaimer = parseLockOwner(reclaimPath);
          if (reclaimer.token === owner.token) unlinkSync(reclaimPath);
        }
      }
    }
  } finally {
    rmSync(temporaryPath, { force: true });
  }

  throw new Error(`Could not acquire Anhedral transaction lock (${lockPath}).`);
}

function releaseTransactionLock(lock: TransactionLock): void {
  if (!pathEntryExists(lock.lockPath)) return;
  const current = parseLockOwner(lock.lockPath);
  if (current.token === lock.owner.token) unlinkSync(lock.lockPath);
}

type TemporaryRootIdentity = {
  token: string;
};

function assertExpectedTempRoot(
  root: string,
  candidate: string,
  kind: 'stage' | 'backup',
): TemporaryRootIdentity {
  const resolved = path.resolve(candidate);
  const tokenPattern = '(\\d+-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})';
  const localParent = path.join(path.resolve(root), TRANSACTION_DIRECTORY);
  const localMatch = new RegExp(`^${kind}-${tokenPattern}$`, 'i').exec(path.basename(resolved));
  if (path.dirname(resolved) === localParent && localMatch) {
    const namespaceStat = lstatIfPresent(localParent);
    if (namespaceStat && (namespaceStat.isSymbolicLink() || !namespaceStat.isDirectory())) {
      throw new Error(`Unsafe reserved transaction namespace: ${localParent}`);
    }
    return { token: localMatch[1]! };
  }

  throw new Error(`Unsafe transaction ${kind} root: ${candidate}`);
}

function assertNoSymlinkComponents(root: string, relativePath: string): void {
  resolveTransactionPath(root, relativePath);
  let cursor = path.resolve(root);
  if (lstatIfPresent(cursor)?.isSymbolicLink()) {
    throw new Error(`Refusing transaction root that is a symbolic link: ${root}`);
  }
  for (const segment of relativePath.split('/')) {
    cursor = path.join(cursor, segment);
    if (lstatIfPresent(cursor)?.isSymbolicLink()) {
      throw new Error(`Refusing transaction path containing a symbolic link: ${relativePath}`);
    }
  }
}

function assertNoSymlinksRecursively(target: string): void {
  const stat = lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link in staged output: ${target}`);
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(target)) assertNoSymlinksRecursively(path.join(target, entry));
}

function validateJournal(root: string, value: unknown): TransactionJournal {
  if (!isRecord(value) || value.version !== JOURNAL_VERSION) {
    throw new Error(`Cannot recover unsupported transaction journal at ${path.join(root, JOURNAL_FILE)}`);
  }
  assertExactObjectKeys(
    value,
    ['version', 'backupRoot', 'stageRoot', 'entries', 'createdDirectories'],
    'transaction journal',
  );
  if (typeof value.backupRoot !== 'string' || typeof value.stageRoot !== 'string' || !Array.isArray(value.entries)) {
    throw new Error(`Invalid transaction journal at ${path.join(root, JOURNAL_FILE)}`);
  }
  const backupIdentity = assertExpectedTempRoot(root, value.backupRoot, 'backup');
  const stageIdentity = assertExpectedTempRoot(root, value.stageRoot, 'stage');
  if (backupIdentity.token !== stageIdentity.token) {
    throw new Error('Transaction stage and backup roots do not share one token.');
  }
  for (const temporaryRoot of [value.backupRoot, value.stageRoot]) {
    const stat = lstatIfPresent(temporaryRoot);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`Unsafe transaction temporary root: ${temporaryRoot}`);
      }
    }
  }
  const seen = new Set<string>();
  const entries = value.entries.map((entry, index): JournalEntry => {
    if (!isRecord(entry) || typeof entry.relativePath !== 'string' || typeof entry.installed !== 'boolean') {
      throw new Error(`Invalid transaction journal entry at index ${index}`);
    }
    assertExactObjectKeys(
      entry,
      ['relativePath', 'backupPath', 'installed', 'installedFingerprint'],
      `transaction journal entry at index ${index}`,
    );
    assertRelativePath(entry.relativePath);
    if (seen.has(entry.relativePath)) throw new Error(`Duplicate transaction journal path: ${entry.relativePath}`);
    seen.add(entry.relativePath);
    if (entry.backupPath !== null && typeof entry.backupPath !== 'string') {
      throw new Error(`Invalid transaction backup path at index ${index}`);
    }
    const installedFingerprint = entry.installedFingerprint;
    if (
      installedFingerprint !== null
      && (typeof installedFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(installedFingerprint))
    ) {
      throw new Error(`Invalid installed transaction fingerprint at index ${index}`);
    }
    if (entry.installed ? installedFingerprint === null : installedFingerprint !== null) {
      throw new Error(`Transaction journal entry fingerprint state is inconsistent at index ${index}`);
    }
    const expectedBackup = resolveTransactionPath(value.backupRoot as string, entry.relativePath);
    if (entry.backupPath !== null && path.resolve(entry.backupPath) !== path.resolve(expectedBackup)) {
      throw new Error(`Unsafe transaction backup path: ${entry.backupPath}`);
    }
    return {
      relativePath: entry.relativePath,
      backupPath: entry.backupPath,
      installed: entry.installed,
      installedFingerprint,
    };
  });
  assertNoPathAncestry(entries.map((entry) => entry.relativePath), 'journal paths');
  const rawCreatedDirectories = value.createdDirectories;
  if (!Array.isArray(rawCreatedDirectories)) {
    throw new Error(`Invalid transaction created-directory inventory at ${path.join(root, JOURNAL_FILE)}`);
  }
  const createdDirectories = rawCreatedDirectories.map((entry, index) => {
    if (typeof entry !== 'string') throw new Error(`Invalid transaction created directory at index ${index}`);
    assertRelativePath(entry);
    return entry;
  });
  if (new Set(createdDirectories).size !== createdDirectories.length) {
    throw new Error('Duplicate transaction created-directory path.');
  }
  for (const directory of createdDirectories) {
    if (!entries.some((entry) => entry.relativePath.startsWith(`${directory}/`))) {
      throw new Error(`Transaction created directory is not a parent of any journal entry: ${directory}`);
    }
  }
  return { version: JOURNAL_VERSION, backupRoot: value.backupRoot, stageRoot: value.stageRoot, entries, createdDirectories };
}

function writeJournal(root: string, journal: TransactionJournal): void {
  const journalPath = path.join(root, JOURNAL_FILE);
  const temporaryPath = `${journalPath}.tmp-${process.pid}-${randomUUID()}`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporaryPath, 'wx', 0o600);
    writeFileSync(descriptor, JSON.stringify(journal, null, 2) + '\n', { encoding: 'utf8' });
    fsyncSync(descriptor);
    const completedDescriptor = descriptor;
    descriptor = null;
    closeSync(completedDescriptor);
    renameSync(temporaryPath, journalPath);
    syncDirectory(path.dirname(journalPath));
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
  }
}

function removeJournal(root: string): void {
  const journalPath = path.join(root, JOURNAL_FILE);
  try {
    unlinkSync(journalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  syncDirectory(path.dirname(journalPath));
}

function removeEmptyTransactionDirectory(root: string): void {
  const transactionDirectory = path.join(path.resolve(root), TRANSACTION_DIRECTORY);
  try {
    rmdirSync(transactionDirectory);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(code ?? '')) throw error;
  }
}

function cleanupOrphanTransactionRoots(root: string): void {
  const transactionDirectory = path.join(path.resolve(root), TRANSACTION_DIRECTORY);
  const namespaceStat = lstatIfPresent(transactionDirectory);
  if (!namespaceStat) return;
  if (namespaceStat.isSymbolicLink() || !namespaceStat.isDirectory()) {
    throw new Error(`Unsafe reserved transaction namespace requires manual inspection: ${transactionDirectory}`);
  }
  for (const entry of readdirSync(transactionDirectory)) {
    if (!LOCAL_TRANSACTION_ROOT_PATTERN.test(entry)) {
      throw new Error(`Unknown artifact in reserved transaction namespace requires manual inspection: ${path.join(transactionDirectory, entry)}`);
    }
    const candidate = path.join(transactionDirectory, entry);
    const stat = lstatIfPresent(candidate);
    if (!stat) continue;
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Unsafe orphan transaction root requires manual inspection: ${candidate}`);
    }
    rmSync(candidate, { recursive: true });
  }
  removeEmptyTransactionDirectory(root);
}

function restoreJournal(root: string, journal: TransactionJournal): void {
  for (const entry of [...journal.entries].reverse()) {
    assertNoSymlinkComponents(root, entry.relativePath);
    const target = resolveTransactionPath(root, entry.relativePath);
    if (entry.installed) {
      if (pathEntryExists(target)) {
        if (entry.installedFingerprint === null) {
          throw new Error(
            `Installed transaction path has no trusted fingerprint: ${entry.relativePath}. `
            + 'Recovery stopped without modifying it; inspect the journal, target, and backup manually.',
          );
        }
        const actualFingerprint = fingerprintEntry(target);
        if (actualFingerprint !== entry.installedFingerprint) {
          throw new Error(
            `Installed transaction path changed after an interrupted commit: ${entry.relativePath}. `
            + 'Recovery stopped without modifying it; inspect the journal, target, and backup manually.',
          );
        }
      }
      removeEntryDurably(target);
      entry.installed = false;
      entry.installedFingerprint = null;
      writeJournal(root, journal);
    }
    if (entry.backupPath) {
      assertNoSymlinkComponents(journal.backupRoot, entry.relativePath);
      if (pathEntryExists(entry.backupPath)) {
        mkdirSync(path.dirname(target), { recursive: true });
        renameDurably(entry.backupPath, target, root);
      } else if (!pathEntryExists(target)) {
        throw new Error(`Cannot recover missing transaction backup: ${entry.backupPath}`);
      }
      entry.backupPath = null;
      writeJournal(root, journal);
    }
  }
  for (const relativePath of [...journal.createdDirectories]
    .sort((left, right) => right.split('/').length - left.split('/').length || right.localeCompare(left))) {
    assertNoSymlinkComponents(root, relativePath);
    const target = resolveTransactionPath(root, relativePath);
    try {
      rmdirSync(target);
      syncDirectory(path.dirname(target));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(code ?? '')) throw error;
    }
  }
  removeJournal(root);
  rmSync(journal.stageRoot, { recursive: true, force: true });
  rmSync(journal.backupRoot, { recursive: true, force: true });
  removeEmptyTransactionDirectory(root);
}

function recoverInterruptedTransactionUnlocked(root: string): boolean {
  const journalPath = path.join(root, JOURNAL_FILE);
  if (!pathEntryExists(journalPath)) return false;
  if (lstatSync(journalPath).isSymbolicLink()) {
    throw new Error(`Refusing symbolic-link transaction journal at ${journalPath}.`);
  }

  const journal = validateJournal(root, JSON.parse(readFileSync(journalPath, 'utf8')));
  restoreJournal(root, journal);
  return true;
}

/** Recover an interrupted commit while holding the same lock used by normal transactions. */
export function recoverInterruptedTransaction(root: string): boolean {
  const lock = acquireTransactionLock(root);
  try {
    const recovered = recoverInterruptedTransactionUnlocked(root);
    cleanupOrphanTransactionRoots(root);
    return recovered;
  } finally {
    releaseTransactionLock(lock);
  }
}

/** The filesystem commit succeeded, but a follow-up action such as install failed. */
export class PostCommitError extends Error {
  readonly committedPaths: readonly string[];

  constructor(committedPaths: readonly string[], cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(
      `Changes were committed successfully, but the post-commit action failed: ${causeMessage}. `
      + 'The generated files were kept; resolve the failure and rerun the post-commit command.',
      { cause },
    );
    this.name = 'PostCommitError';
    this.committedPaths = Object.freeze([...committedPaths]);
  }
}

/**
 * Build changes away from the destination and install only the declared paths.
 * Every replaced path is journaled first, so errors and later invocations can
 * restore the original workspace.
 */
export async function runStagedTransaction(
  root: string,
  options: {
    commitPaths: string[];
    deletePaths?: string[];
    seedPaths?: string[];
    dryRun?: boolean;
    prepare?: () => boolean | void | Promise<boolean | void>;
    afterCommit?: () => void | Promise<void>;
    onPlan?: (paths: readonly string[]) => void;
    build: (stageRoot: string) => Promise<void>;
  },
): Promise<readonly string[]> {
  const lock = acquireTransactionLock(root);
  const token = `${process.pid}-${randomUUID()}`;
  const transactionDirectory = path.join(path.resolve(root), TRANSACTION_DIRECTORY);
  const stageRoot = path.join(transactionDirectory, `stage-${token}`);
  const backupRoot = path.join(transactionDirectory, `backup-${token}`);

  try {
    if (options.dryRun && pathEntryExists(path.join(root, JOURNAL_FILE))) {
      throw new Error('Dry-run cannot recover an interrupted transaction. Re-run the original command without --dry-run first.');
    }
    recoverInterruptedTransactionUnlocked(root);
    if (!options.dryRun) cleanupOrphanTransactionRoots(root);
    if (await options.prepare?.() === false) return Object.freeze([]);

    const namespaceStat = lstatIfPresent(transactionDirectory);
    if (namespaceStat && (namespaceStat.isSymbolicLink() || !namespaceStat.isDirectory())) {
      throw new Error(`Unsafe reserved transaction namespace requires manual inspection: ${transactionDirectory}`);
    }
    if (namespaceStat) {
      for (const entry of readdirSync(transactionDirectory)) {
        const candidate = path.join(transactionDirectory, entry);
        const stat = lstatIfPresent(candidate);
        if (!LOCAL_TRANSACTION_ROOT_PATTERN.test(entry) || !stat || stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new Error(`Unknown or unsafe artifact in reserved transaction namespace requires manual inspection: ${candidate}`);
        }
      }
    }
    mkdirSync(stageRoot, { recursive: true, mode: 0o700 });
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 });

    for (const relativePath of options.seedPaths ?? []) {
      assertRelativePath(relativePath);
      assertNoSymlinkComponents(root, relativePath);
      const source = resolveTransactionPath(root, relativePath);
      if (!pathEntryExists(source)) continue;
      assertNoSymlinksRecursively(source);
      const target = resolveTransactionPath(stageRoot, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(source, target, { recursive: true, preserveTimestamps: true });
    }

    await options.build(stageRoot);

    const normalizedPaths = normalizeTransactionPaths(options.commitPaths, options.deletePaths ?? []);
    const deletePaths = new Set(normalizedPaths.deletePaths);
    const uniquePaths = normalizedPaths.uniquePaths;
    options.onPlan?.(Object.freeze([...uniquePaths]));
    if (options.dryRun) return Object.freeze(uniquePaths);
    const journal: TransactionJournal = {
      version: JOURNAL_VERSION,
      backupRoot,
      stageRoot,
      createdDirectories: [],
      entries: uniquePaths.map((relativePath) => {
        assertRelativePath(relativePath);
        return { relativePath, backupPath: null, installed: false, installedFingerprint: null };
      }),
    };
    const createdDirectorySet = new Set(journal.createdDirectories);
    writeJournal(root, journal);

    try {
      for (const entry of journal.entries) {
        const source = resolveTransactionPath(stageRoot, entry.relativePath);
        const deleting = deletePaths.has(entry.relativePath);
        if (!deleting && !pathEntryExists(source)) {
          throw new Error(`Staged output is missing declared path: ${entry.relativePath}`);
        }
        if (deleting && pathEntryExists(source)) throw new Error(`Deleted transaction path still exists in staging: ${entry.relativePath}`);
        assertNoSymlinkComponents(root, entry.relativePath);
        if (!deleting) {
          assertNoSymlinksRecursively(source);
          syncEntryRecursively(source);
        }

        const target = resolveTransactionPath(root, entry.relativePath);
        if (pathEntryExists(target)) {
          const backup = resolveTransactionPath(backupRoot, entry.relativePath);
          mkdirSync(path.dirname(backup), { recursive: true });
          entry.backupPath = backup;
          writeJournal(root, journal);
          renameDurably(target, backup, root);
        }

        if (!deleting) {
          const segments = entry.relativePath.split('/').slice(0, -1);
          let cursor = root;
          let relativeDirectory = '';
          const missingDirectories: string[] = [];
          for (const segment of segments) {
            cursor = path.join(cursor, segment);
            relativeDirectory = relativeDirectory ? `${relativeDirectory}/${segment}` : segment;
            if (!pathEntryExists(cursor)) missingDirectories.push(relativeDirectory);
            else if (!lstatSync(cursor).isDirectory()) {
              throw new Error(`Transaction parent is not a directory: ${relativeDirectory}`);
            }
          }
          const newDirectories = missingDirectories.filter((directory) => !createdDirectorySet.has(directory));
          if (newDirectories.length > 0) {
            journal.createdDirectories.push(...newDirectories);
            for (const directory of newDirectories) createdDirectorySet.add(directory);
            writeJournal(root, journal);
          }
          mkdirSync(path.dirname(target), { recursive: true });
          entry.installedFingerprint = fingerprintEntry(source);
          entry.installed = true;
          writeJournal(root, journal);
          renameDurably(source, target, root);
        }
      }
    } catch (error) {
      restoreJournal(root, journal);
      throw error;
    }

    removeJournal(root);
    rmSync(stageRoot, { recursive: true, force: true });
    rmSync(backupRoot, { recursive: true, force: true });
    removeEmptyTransactionDirectory(root);
    try {
      await options.afterCommit?.();
    } catch (error) {
      throw new PostCommitError(uniquePaths, error);
    }
    return Object.freeze(uniquePaths);
  } finally {
    try {
      if (!pathEntryExists(path.join(root, JOURNAL_FILE))) {
        rmSync(stageRoot, { recursive: true, force: true });
        rmSync(backupRoot, { recursive: true, force: true });
        removeEmptyTransactionDirectory(root);
      }
    } finally {
      releaseTransactionLock(lock);
    }
  }
}

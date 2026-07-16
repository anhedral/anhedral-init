import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FAILURE_TAIL_BYTES = 128 * 1024;

export function writeFile(filePath: string, content: string): void {
  const existed = existsSync(filePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o644 });
  // Defeat a restrictive caller umask for newly generated files. Existing seeded
  // files retain their user-selected mode across structural merges.
  if (!existed) chmodSync(filePath, 0o644);
}

export function appendGitignore(root: string, lines: string[]): void {
  const filePath = path.join(root, '.gitignore');
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
  const existingLines = new Set(existing.split(/\r\n|\n|\r/));
  const additions = [...new Set(lines)].filter((line) => !existingLines.has(line));
  if (additions.length === 0) return;

  const newline = existing.includes('\r\n') ? '\r\n' : existing.includes('\n') ? '\n' : existing.includes('\r') ? '\r' : '\n';
  const separator = existing.length > 0 && !/(?:\r\n|\n|\r)$/.test(existing) ? newline : '';
  writeFile(filePath, `${existing}${separator}${additions.join(newline)}${newline}`);
}

function readTail(filePath: string): string {
  const file = openSync(filePath, 'r');
  try {
    const size = fstatSync(file).size;
    const length = Math.min(size, FAILURE_TAIL_BYTES);
    if (length === 0) return '';
    const buffer = Buffer.allocUnsafe(length);
    readSync(file, buffer, 0, length, size - length);
    return buffer.toString();
  } finally {
    closeSync(file);
  }
}

function dumpFailure(
  cmd: string,
  status: number | null,
  stdoutPath: string,
  stderrPath: string,
  spawnError?: Error,
): never {
  const stdoutText = readTail(stdoutPath);
  const stderrText = readTail(stderrPath);
  if (process.env.ANHEDRAL_QUIET !== '1') {
    if (stdoutText) process.stderr.write(stdoutText);
    if (stderrText) process.stderr.write(stderrText);
  }
  throw new Error(`Command failed (exit ${status ?? '?'}): ${cmd}`, spawnError ? { cause: spawnError } : undefined);
}

export function exec(cmd: string, cwd: string): void {
  const quiet = process.env.ANHEDRAL_QUIET === '1';
  if (process.env.ANHEDRAL_VERBOSE === '1' && !quiet) {
    console.log(`  $ ${cmd}`);
    const result = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      throw new Error(`Command failed (exit ${result.status ?? '?'}): ${cmd}`, result.error ? { cause: result.error } : undefined);
    }
    return;
  }

  // Successful package-manager and build commands can easily exceed Node's
  // default execSync buffer. Spool both streams to disk and retain only a
  // bounded diagnostic tail on failure.
  const captureRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-exec-'));
  const stdoutPath = path.join(captureRoot, 'stdout.log');
  const stderrPath = path.join(captureRoot, 'stderr.log');
  const stdout = openSync(stdoutPath, 'w');
  const stderr = openSync(stderrPath, 'w');
  try {
    const result = spawnSync(cmd, {
      cwd,
      shell: true,
      stdio: ['ignore', stdout, stderr],
    });
    closeSync(stdout);
    closeSync(stderr);
    if (result.error || result.status !== 0) {
      dumpFailure(cmd, result.status, stdoutPath, stderrPath, result.error);
    }
  } finally {
    // closeSync throws for an already-closed descriptor, so close only when
    // spawnSync itself threw before the normal close path.
    try {
      closeSync(stdout);
    } catch {}
    try {
      closeSync(stderr);
    } catch {}
    rmSync(captureRoot, { recursive: true, force: true });
  }
}

export function execFile(executable: string, args: readonly string[], cwd: string): void {
  const quiet = process.env.ANHEDRAL_QUIET === '1';
  const display = [executable, ...args].join(' ');
  if (process.env.ANHEDRAL_VERBOSE === '1' && !quiet) {
    console.log(`  $ ${display}`);
    const result = spawnSync(executable, [...args], { cwd, stdio: 'inherit', shell: false });
    if (result.error || result.status !== 0) {
      throw new Error(`Command failed (exit ${result.status ?? '?'}): ${display}`, result.error ? { cause: result.error } : undefined);
    }
    return;
  }

  const captureRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-exec-'));
  const stdoutPath = path.join(captureRoot, 'stdout.log');
  const stderrPath = path.join(captureRoot, 'stderr.log');
  const stdout = openSync(stdoutPath, 'w');
  const stderr = openSync(stderrPath, 'w');
  try {
    const result = spawnSync(executable, [...args], {
      cwd,
      shell: false,
      stdio: ['ignore', stdout, stderr],
    });
    closeSync(stdout);
    closeSync(stderr);
    if (result.error || result.status !== 0) {
      dumpFailure(display, result.status, stdoutPath, stderrPath, result.error);
    }
  } finally {
    try { closeSync(stdout); } catch {}
    try { closeSync(stderr); } catch {}
    rmSync(captureRoot, { recursive: true, force: true });
  }
}

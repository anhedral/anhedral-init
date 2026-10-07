import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fsyncSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hostname } from 'node:os';
import { isNonSecretEvidence, isProgressEnvironment } from './evidence-validation.js';

export const PROGRESS_FILE = 'anhedral.progress.json';
export const MILESTONES = ['generated', 'provisioned', 'connected', 'tested', 'deployed'] as const;
export type Milestone = typeof MILESTONES[number];
type Outcome = 'passed' | 'failed' | 'blocked';
type Source = 'agent' | 'independent';
interface Evidence { outcome: Outcome; source: Source; observedAt: string; evidence: string; accountRef?: string }
export interface ProgressObservation extends Evidence {
  capability: string; milestone: Milestone; configurationFingerprint: string; resourceRef?: string; revisionRef?: string;
}
export interface DiscoveryObservation extends Evidence {
  provider: string; route: 'plugin' | 'api' | 'cli' | 'browser';
  check: 'installed' | 'callable' | 'local-working' | 'authorized' | 'integration-tested'; expiresAt: string;
}
export interface ProgressEnvironment {
  id: string; observations: ProgressObservation[]; discovery: DiscoveryObservation[]; blockers: string[];
  nextAction?: string; previewUrl?: string; liveUrl?: string;
}
export interface ProjectProgress { schemaVersion: 1; revision: number; updatedAt: string; environments: ProgressEnvironment[] }
export interface ProgressReport {
  revision: number; environment: string; observations?: ProgressObservation[]; discovery?: DiscoveryObservation[];
  blockers?: string[]; nextAction?: string | null; previewUrl?: string | null; liveUrl?: string | null;
}
const MAX_BYTES = 262144;
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a progress object.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) throw new Error('Unknown progress field.');
  return result;
}
function text(value: unknown, max = 600): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || !isNonSecretEvidence(value)) throw new Error('Progress requires bounded nonsecret text.');
  return value;
}
function id(value: unknown): string {
  const result = text(value, 80);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(result) || ['__proto__', 'constructor', 'prototype'].includes(result)) throw new Error('Invalid progress identifier.');
  return result;
}
function environment(value: unknown): string {
  const result = text(value, 80);
  if (!isProgressEnvironment(result)) throw new Error('Invalid progress environment.');
  return result;
}
function date(value: unknown): string {
  const result = text(value, 30);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error('Expected a UTC timestamp.');
  return result;
}
function member<T extends string>(value: unknown, options: readonly T[]): T {
  if (!options.includes(value as T)) throw new Error('Invalid progress category.');
  return value as T;
}
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('Invalid progress revision.');
  return value as number;
}
function list<T>(value: unknown, validate: (item: unknown) => T, max: number): T[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('Progress list exceeds its limit.');
  return value.map(validate);
}
function url(value: unknown): string {
  const result = text(value, 2048); const parsed = new URL(result);
  if (parsed.username || parsed.password || parsed.search || parsed.hash || !(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) throw new Error('Use a credential-free HTTPS or loopback preview URL without query or fragment.');
  return result;
}
function observation(value: unknown, discovery = false): ProgressObservation | DiscoveryObservation {
  const shared = ['outcome', 'source', 'observedAt', 'evidence', 'accountRef'];
  const item = object(value, [...shared, ...(discovery ? ['provider', 'route', 'check', 'expiresAt'] : ['capability', 'milestone', 'configurationFingerprint', 'resourceRef', 'revisionRef'])]);
  const evidence: Evidence = { outcome: member(item.outcome, ['passed', 'failed', 'blocked']), source: member(item.source, ['agent', 'independent']), observedAt: date(item.observedAt), evidence: text(item.evidence) };
  if (item.accountRef !== undefined) evidence.accountRef = text(item.accountRef, 160);
  if (discovery) {
    const expiresAt = date(item.expiresAt);
    if (Date.parse(expiresAt) <= Date.parse(evidence.observedAt) || Date.parse(expiresAt) - Date.parse(evidence.observedAt) > 86400000 * 30) throw new Error('Discovery expires within 30 days of observation.');
    if (evidence.outcome === 'passed' && ['authorized', 'integration-tested'].includes(String(item.check)) && !evidence.accountRef) throw new Error('Successful account authorization and integration checks require an account reference.');
    return { ...evidence, provider: id(item.provider), route: member(item.route, ['plugin', 'api', 'cli', 'browser']), check: member(item.check, ['installed', 'callable', 'local-working', 'authorized', 'integration-tested']), expiresAt };
  }
  const fingerprint = text(item.configurationFingerprint, 64);
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Invalid configuration fingerprint.');
  const result: ProgressObservation = { ...evidence, capability: id(item.capability), milestone: member(item.milestone, MILESTONES), configurationFingerprint: fingerprint };
  for (const key of ['resourceRef', 'revisionRef'] as const) if (item[key] !== undefined) result[key] = text(item[key], 160);
  return result;
}
export function validateProgressReport(value: unknown): ProgressReport {
  const item = object(value, ['revision', 'environment', 'observations', 'discovery', 'blockers', 'nextAction', 'previewUrl', 'liveUrl']);
  const result: ProgressReport = { revision: integer(item.revision), environment: environment(item.environment) };
  if (item.observations !== undefined) result.observations = list(item.observations, v => observation(v) as ProgressObservation, 100);
  if (item.discovery !== undefined) result.discovery = list(item.discovery, v => observation(v, true) as DiscoveryObservation, 100);
  if (item.blockers !== undefined) result.blockers = list(item.blockers, v => text(v), 20);
  if (item.nextAction !== undefined) result.nextAction = item.nextAction === null ? null : text(item.nextAction);
  for (const key of ['previewUrl', 'liveUrl'] as const) if (item[key] !== undefined) result[key] = item[key] === null ? null : url(item[key]);
  if (JSON.stringify(result).length > MAX_BYTES) throw new Error('Progress report too large.');
  return result;
}
export function validateProjectProgress(value: unknown): ProjectProgress {
  const item = object(value, ['schemaVersion', 'revision', 'updatedAt', 'environments']);
  if (item.schemaVersion !== 1) throw new Error('Unsupported progress schema.');
  const environments = list(item.environments, entry => {
    const env = object(entry, ['id', 'observations', 'discovery', 'blockers', 'nextAction', 'previewUrl', 'liveUrl']);
    for (const key of ['nextAction', 'previewUrl', 'liveUrl']) if (env[key] === null) throw new Error('Persisted progress fields must be strings or absent.');
    const { id: environment, ...fields } = env;
    const report = validateProgressReport({ ...fields, environment, revision: 0 });
    return { id: report.environment, observations: report.observations ?? [], discovery: report.discovery ?? [], blockers: report.blockers ?? [], ...Object.fromEntries(['nextAction', 'previewUrl', 'liveUrl'].filter(key => env[key] !== undefined).map(key => [key, env[key]])) } as ProgressEnvironment;
  }, 20);
  if (new Set(environments.map(env => env.id)).size !== environments.length) throw new Error('Duplicate progress environment.');
  return { schemaVersion: 1, revision: integer(item.revision), updatedAt: date(item.updatedAt), environments };
}
function filePath(root: string, file: string): string {
  const canonical = realpathSync(root);
  if (!lstatSync(canonical).isDirectory()) throw new Error('Project root must be a directory.');
  const target = path.join(canonical, file);
  try { const entry = lstatSync(target); if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Progress paths must be regular files.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return target;
}
function safeRead(file: string, limit = MAX_BYTES): Buffer {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { if (fstatSync(fd).size > limit) throw new Error('Progress/configuration file exceeds size limit.'); const data = readFileSync(fd); if (data.length > limit) throw new Error('Progress/configuration file exceeds size limit.'); return data; } finally { closeSync(fd); }
}
export function readProjectProgress(root: string): ProjectProgress | null {
  const file = filePath(root, PROGRESS_FILE);
  return existsSync(file) ? validateProjectProgress(JSON.parse(safeRead(file).toString('utf8'))) : null;
}
/** Bounded source/configuration digest; secrets, dependencies and generated output are excluded. */
export function projectFingerprint(root: string): string {
  const canonical = realpathSync(root);
  const files = new Set(['anhedral.setup.json', 'anhedral.standard.json', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'wrangler.json', 'wrangler.jsonc', 'wrangler.toml']);
  const ignored = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git', '.next', '.turbo', '.artifacts', '.anhedral', '.cache', '.wrangler', '.output', '.expo', '.venv']);
  const sourceFile = (name: string) => !['cloudflare-env.d.ts', 'worker-configuration.d.ts'].includes(name) && (/\.(?:[cm]?[jt]sx?|css|sql|prisma)$/.test(name) || /^(?:package|wrangler|tsconfig)(?:\.[\w-]+)?\.jsonc?$/.test(name) || name === 'wrangler.toml');
  let entries = 0;
  const visit = (directory: string, depth: number) => {
    if (depth > 12) throw new Error('Source fingerprint depth limit exceeded.');
    for (const name of readdirSync(path.join(canonical, directory)).sort()) {
      if (++entries > 4000) throw new Error('Source fingerprint entry limit exceeded.');
      if (name.startsWith('.') || ignored.has(name) || /(?:secret|credential|private[-_.]?key)/i.test(name)) continue;
      const relative = path.join(directory, name), entry = lstatSync(path.join(canonical, relative));
      if (entry.isSymbolicLink()) throw new Error('Source fingerprint paths cannot be symlinks.');
      if (entry.isDirectory()) visit(relative, depth + 1);
      else if (entry.isFile() && sourceFile(name)) files.add(relative);
    }
  };
  for (const directory of ['apps', 'packages', 'src', 'app', 'pages', 'components', 'lib']) {
    const target = path.join(canonical, directory);
    if (!existsSync(target)) continue;
    if (lstatSync(target).isSymbolicLink()) throw new Error('Source fingerprint paths cannot be symlinks.');
    if (lstatSync(target).isDirectory()) visit(directory, 0);
  }
  for (const name of readdirSync(canonical)) if (!name.startsWith('.') && !/(?:secret|credential|private[-_.]?key)/i.test(name) && sourceFile(name)) files.add(name);
  const hash = createHash('sha256'); let bytes = 0;
  for (const file of [...files].sort()) {
    const target = filePath(root, file); const content = existsSync(target) ? safeRead(target, file === 'pnpm-lock.yaml' ? 2097152 : MAX_BYTES) : Buffer.from('<absent>');
    bytes += content.length; if (bytes > 8388608) throw new Error('Source fingerprint byte limit exceeded.');
    hash.update(JSON.stringify(file)); hash.update(`:${content.length}:`); hash.update(content);
  }
  return hash.digest('hex');
}

function merge<T extends { observedAt: string }>(old: T[], added: T[], key: (item: T) => string): T[] {
  const entries = new Map(old.map(item => [key(item), item]));
  for (const item of added) { const previous = entries.get(key(item)); if (previous && Date.parse(previous.observedAt) > Date.parse(item.observedAt)) throw new Error('Older evidence cannot replace a newer observation.'); entries.set(key(item), item); }
  if (entries.size > 100) throw new Error('Too many progress observations.');
  return [...entries.values()];
}
function recoverDeadWriter(lock: string): boolean {
  const recovery = `${lock}.recovery`;
  let guard: number;
  try { guard = openSync(recovery, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); } catch { return false; }
  try {
    if (!existsSync(lock)) return true;
    const entry = lstatSync(lock);
    if (!entry.isFile() || entry.isSymbolicLink() || !process.getuid || entry.uid !== process.getuid()) return false;
    let owner: { pid?: unknown; hostname?: unknown };
    try { owner = JSON.parse(safeRead(lock, 1024).toString('utf8')); } catch { return false; }
    if (!owner || !Number.isSafeInteger(owner.pid) || (owner.pid as number) <= 0 || owner.hostname !== hostname()) return false;
    try { process.kill(owner.pid as number, 0); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return false; }
    const current = lstatSync(lock);
    if (current.ino !== entry.ino || current.dev !== entry.dev || current.uid !== entry.uid || !current.isFile() || current.isSymbolicLink()) return false;
    unlinkSync(lock); return true;
  } finally { closeSync(guard); unlinkSync(recovery); }
}
function acquireProgressLock(lock: string): number {
  const busy = () => new Error('Progress update busy or lock ownership unknown; retry after the writer finishes. Unknown/crashed recovery locks require confirming no writer is running before removal.');
  for (let attempt = 0; attempt < 2; attempt++) {
    if (existsSync(`${lock}.recovery`)) throw busy();
    try { return openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; if (attempt || !recoverDeadWriter(lock)) throw busy(); }
  }
  throw busy();
}
/** Reports are caller assertions. Only actual checking adapters should use source: independent. */
export function reportProjectProgress(root: string, input: ProgressReport): ProjectProgress {
  const report = validateProgressReport(input); const destination = filePath(root, PROGRESS_FILE); const temporary = `${destination}.${randomUUID()}.tmp`; const lock = filePath(root, '.anhedral-progress.lock');
  const fd = acquireProgressLock(lock);
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, hostname: hostname(), createdAt: new Date().toISOString() })); fsyncSync(fd);
    const current = readProjectProgress(root) ?? { schemaVersion: 1 as const, revision: 0, updatedAt: new Date().toISOString(), environments: [] };
    if (report.revision !== current.revision) throw new Error('Progress revision conflict; reload before reporting.');
    for (const item of [...(report.observations ?? []), ...(report.discovery ?? [])]) if (Date.parse(item.observedAt) > Date.now() + 300000) throw new Error('Observation timestamp is in the future.');
    const existing = current.environments.find(env => env.id === report.environment) ?? { id: report.environment, observations: [], discovery: [], blockers: [] };
    const next: ProgressEnvironment = { ...existing, observations: merge(existing.observations, report.observations ?? [], item => JSON.stringify([item.capability, item.milestone, item.source, item.accountRef, item.resourceRef])), discovery: merge(existing.discovery, report.discovery ?? [], item => JSON.stringify([item.provider, item.route, item.check, item.source, item.accountRef])) };
    if (report.blockers !== undefined) next.blockers = report.blockers;
    for (const key of ['nextAction', 'previewUrl', 'liveUrl'] as const) if (report[key] !== undefined) { if (report[key] === null) delete next[key]; else next[key] = report[key]; }
    const result = validateProjectProgress({ ...current, revision: current.revision + 1, updatedAt: new Date().toISOString(), environments: [...current.environments.filter(env => env.id !== next.id), next] });
    const serialized = JSON.stringify(result, null, 2) + '\n'; if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error('Progress record exceeds size limit.');
    const output = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(output, serialized); fsyncSync(output); } finally { closeSync(output); }
    renameSync(temporary, destination); return result;
  } finally { closeSync(fd); if (existsSync(temporary)) unlinkSync(temporary); unlinkSync(lock); }
}
export function evaluateProjectProgress(record: ProjectProgress, fingerprint: string, now = Date.now()) {
  return { ...record, environments: record.environments.map(env => ({ ...env, observations: env.observations.map(item => ({ ...item, stale: item.configurationFingerprint !== fingerprint })), discovery: env.discovery.map(item => ({ ...item, stale: Date.parse(item.expiresAt) <= now })) })) };
}

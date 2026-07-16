import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSha256, normalizePlanPath } from './architecture/plan.js';
import type { ModuleId } from './architecture/modules.js';
import {
  TEMPLATE_IDS,
  templateIdsForModules,
  type TemplateId,
  type TemplateProvenance,
  type TemplateProvenanceMap,
} from './architecture/templates.js';

export { TEMPLATE_IDS } from './architecture/templates.js';
export { templateIdsForModules } from './architecture/templates.js';
export type { TemplateId, TemplateProvenance, TemplateProvenanceMap } from './architecture/templates.js';

export type TemplateMaterializeRequest = {
  readonly ids: readonly TemplateId[];
  readonly destination: string;
};

export interface TemplateSource {
  materialize(request: TemplateMaterializeRequest): TemplateProvenanceMap;
}

type TemplateCatalog = {
  version: number;
  templates: Record<TemplateId, { sha256: string }>;
};

const TEMPLATE_ID_SET = new Set<string>(TEMPLATE_IDS);
const FORBIDDEN_ENTRY_NAMES = new Set([
  '.git',
  '.next',
  '.output',
  '.turbo',
  '.wxt',
  'dist',
  'node_modules',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
]);
const MAX_TEMPLATE_FILES = 1_000;
const MAX_TEMPLATE_BYTES = 8 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCatalog(root: string): TemplateCatalog {
  const raw = JSON.parse(readFileSync(path.join(root, 'catalog.json'), 'utf8')) as unknown;
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.templates)) {
    throw new Error('Invalid bundled template catalog.');
  }
  const actualIds = Object.keys(raw.templates).sort();
  const expectedIds = [...TEMPLATE_IDS].sort();
  if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) {
    throw new Error('Template catalog must define every supported template exactly once.');
  }
  const templates = {} as Record<TemplateId, { sha256: string }>;
  for (const id of TEMPLATE_IDS) {
    const entry = raw.templates[id];
    if (!isRecord(entry) || Object.keys(entry).length !== 1 || !isSha256(entry.sha256)) {
      throw new Error(`Invalid template catalog entry: ${id}.`);
    }
    templates[id] = { sha256: entry.sha256 };
  }
  return { version: 1, templates };
}

function collectTemplateFiles(root: string, relativeRoot = ''): string[] {
  const absoluteRoot = path.join(root, relativeRoot);
  const files: string[] = [];
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (FORBIDDEN_ENTRY_NAMES.has(entry.name)) {
      throw new Error(`Forbidden template entry: ${relativeRoot ? `${relativeRoot}/` : ''}${entry.name}`);
    }
    const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
    normalizePlanPath(relativePath);
    const absolutePath = path.join(root, relativePath);
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink()) throw new Error(`Template symbolic links are not supported: ${relativePath}`);
    if (stat.isDirectory()) files.push(...collectTemplateFiles(root, relativePath));
    else if (stat.isFile()) files.push(relativePath);
    else throw new Error(`Unsupported template entry: ${relativePath}`);
  }
  return files.sort();
}

export function hashTemplateDirectory(root: string): string {
  const files = collectTemplateFiles(root);
  if (files.length === 0 || files.length > MAX_TEMPLATE_FILES) {
    throw new Error(`Template file count is outside the supported range: ${files.length}.`);
  }
  const hash = createHash('sha256');
  let totalBytes = 0;
  for (const relativePath of files) {
    const contents = readFileSync(path.join(root, relativePath));
    totalBytes += contents.byteLength;
    if (totalBytes > MAX_TEMPLATE_BYTES) throw new Error('Template exceeds the maximum supported size.');
    hash.update(relativePath, 'utf8');
    hash.update('\0');
    hash.update(String(contents.byteLength), 'utf8');
    hash.update('\0');
    hash.update(contents);
  }
  return hash.digest('hex');
}

function copyTemplate(sourceRoot: string, destination: string): void {
  const resolvedDestination = path.resolve(destination);
  try {
    const destinationStat = lstatSync(resolvedDestination);
    if (destinationStat.isSymbolicLink() || !destinationStat.isDirectory()) {
      throw new Error('Template destination must be a regular directory.');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const relativePath of collectTemplateFiles(sourceRoot)) {
    const source = path.join(sourceRoot, relativePath);
    const target = path.resolve(resolvedDestination, relativePath);
    if (!target.startsWith(`${resolvedDestination}${path.sep}`)) {
      throw new Error(`Unsafe template destination: ${relativePath}`);
    }
    const segments = relativePath.split('/');
    let ancestor = resolvedDestination;
    for (const segment of segments.slice(0, -1)) {
      ancestor = path.join(ancestor, segment);
      try {
        const stat = lstatSync(ancestor);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new Error(`Unsafe template destination ancestor: ${relativePath}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        break;
      }
    }
    try {
      if (lstatSync(target).isSymbolicLink()) {
        throw new Error(`Refusing to overwrite template destination symbolic link: ${relativePath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    chmodSync(target, 0o644);
  }
}

export class BundledTemplateSource implements TemplateSource {
  readonly root: string;

  constructor(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates')) {
    this.root = root;
  }

  materialize(request: TemplateMaterializeRequest): TemplateProvenanceMap {
    const catalog = readCatalog(this.root);
    const result: Partial<Record<TemplateId, TemplateProvenance>> = {};
    for (const id of [...new Set(request.ids)].sort()) {
      if (!TEMPLATE_ID_SET.has(id)) throw new Error(`Unknown template: ${id}`);
      const sourceRoot = path.join(this.root, id);
      const actualDigest = hashTemplateDirectory(sourceRoot);
      const expectedDigest = catalog.templates[id].sha256;
      if (actualDigest !== expectedDigest) {
        throw new Error(`Template integrity check failed for ${id}.`);
      }
      copyTemplate(sourceRoot, request.destination);
      result[id] = Object.freeze({ version: catalog.version, sha256: actualDigest });
    }
    return Object.freeze(result);
  }
}

export function materializeTemplates(
  destination: string,
  modules: readonly ModuleId[],
  source: TemplateSource = new BundledTemplateSource(),
): TemplateProvenanceMap {
  return source.materialize({ ids: templateIdsForModules(modules), destination });
}

export function assertTemplateProvenance(
  modules: readonly ModuleId[],
  provenance: TemplateProvenanceMap,
  source = new BundledTemplateSource(),
): void {
  const expectedIds = [...templateIdsForModules(modules)].sort();
  const actualIds = Object.keys(provenance).sort();
  if (
    expectedIds.length !== actualIds.length
    || expectedIds.some((id, index) => id !== actualIds[index])
  ) {
    throw new Error(`Template provenance must exactly match selected modules: ${expectedIds.join(', ')}.`);
  }
  const catalog = readCatalog(source.root);
  for (const id of expectedIds) {
    const record = provenance[id];
    if (!record || record.version !== catalog.version || record.sha256 !== catalog.templates[id].sha256) {
      throw new Error(`Template provenance differs from the installed catalog: ${id}.`);
    }
    if (hashTemplateDirectory(path.join(source.root, id)) !== record.sha256) {
      throw new Error(`Installed template integrity check failed: ${id}.`);
    }
  }
}

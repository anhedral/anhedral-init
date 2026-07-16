import { createHash } from 'node:crypto';
import {
  DEFAULT_MODULE_REGISTRY,
  isModuleId,
  resolveModules,
  type DependencyEdge,
  type ModuleId,
  type ModuleRegistry,
} from './modules.js';

export const FILE_OWNERSHIP_CLASSES = [
  'managed',
  'mergeable',
  'user',
] as const;

export type FileOwnershipClass = (typeof FILE_OWNERSHIP_CLASSES)[number];
export type FileOwner = ModuleId | 'root';
export type GenerationOperation = 'init' | 'add';
export type FileWritePolicy =
  | 'replace-if-unmodified'
  | 'structural-merge'
  | 'create-only';

export type PlanFileInput = {
  readonly path: string;
  readonly ownership: FileOwnershipClass;
  readonly content: string;
};

export type ModulePlanContribution = {
  readonly module: FileOwner;
  readonly files: readonly PlanFileInput[];
};

export type PlannedFile = {
  readonly path: string;
  readonly owner: FileOwner;
  readonly ownership: FileOwnershipClass;
  readonly writePolicy: FileWritePolicy;
  readonly content: string;
  readonly contentHash: string;
};

export type GenerationPlan = {
  readonly planVersion: 1;
  readonly operation: GenerationOperation;
  readonly requestedModules: readonly ModuleId[];
  readonly resolvedModules: readonly ModuleId[];
  readonly dependencyAddedModules: readonly ModuleId[];
  readonly dependencyEdges: readonly DependencyEdge[];
  readonly files: readonly PlannedFile[];
  readonly fingerprint: string;
};

export type BuildGenerationPlanInput = {
  readonly operation: GenerationOperation;
  readonly requestedModules: readonly string[];
  readonly contributions?: readonly ModulePlanContribution[];
  readonly registry?: ModuleRegistry;
};

export type PlanBuildErrorCode =
  | 'INVALID_OPERATION'
  | 'INVALID_PLAN_PATH'
  | 'INVALID_FILE_OWNER'
  | 'INVALID_FILE_OWNERSHIP'
  | 'INVALID_FILE_CONTENT'
  | 'UNRESOLVED_CONTRIBUTION'
  | 'DUPLICATE_OUTPUT_PATH';

export class PlanBuildError extends Error {
  constructor(
    readonly code: PlanBuildErrorCode,
    message: string,
    readonly paths: readonly string[] = [],
  ) {
    super(message);
    this.name = 'PlanBuildError';
  }
}

const OWNERSHIP_SET = new Set<string>(FILE_OWNERSHIP_CLASSES);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function isFileOwnershipClass(value: unknown): value is FileOwnershipClass {
  return typeof value === 'string' && OWNERSHIP_SET.has(value);
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

/**
 * Hash rendered text or exact filesystem bytes.
 *
 * Strings are encoded as UTF-8 for deterministic generation-plan fingerprints.
 * Callers hashing an existing file must pass its Buffer/Uint8Array so malformed
 * byte sequences cannot collapse to the same Unicode replacement characters.
 */
export function hashContent(content: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof content === 'string') hash.update(content, 'utf8');
  else hash.update(content);
  return hash.digest('hex');
}

export function writePolicyForOwnership(ownership: FileOwnershipClass): FileWritePolicy {
  switch (ownership) {
    case 'managed': return 'replace-if-unmodified';
    case 'mergeable': return 'structural-merge';
    case 'user': return 'create-only';
  }
}

export function normalizePlanPath(value: string): string {
  if (typeof value !== 'string') {
    throw new PlanBuildError(
      'INVALID_PLAN_PATH',
      `Plan paths must be strings: ${String(value)}`,
      Object.freeze([String(value)]),
    );
  }
  const pathValue = value.trim();
  if (
    pathValue.length === 0
    || pathValue !== value
    || pathValue === '.'
    || pathValue.startsWith('/')
    || /^[a-zA-Z]:\//.test(pathValue)
    || pathValue.includes('\\')
    || pathValue.includes('\0')
  ) {
    throw new PlanBuildError(
      'INVALID_PLAN_PATH',
      `Plan paths must be non-empty relative POSIX paths: ${JSON.stringify(value)}`,
      Object.freeze([value]),
    );
  }

  const segments = pathValue.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new PlanBuildError(
      'INVALID_PLAN_PATH',
      `Plan paths cannot contain empty, current-directory, or parent-directory segments: ${JSON.stringify(value)}`,
      Object.freeze([value]),
    );
  }

  return segments.join('/');
}

function normalizeOwner(value: unknown): FileOwner {
  if (value === 'root' || isModuleId(value)) return value;
  throw new PlanBuildError(
    'INVALID_FILE_OWNER',
    `Unknown plan contribution owner: ${String(value)}`,
  );
}

function canonicalFingerprintPayload(
  operation: GenerationOperation,
  requestedModules: readonly ModuleId[],
  resolvedModules: readonly ModuleId[],
  dependencyAddedModules: readonly ModuleId[],
  dependencyEdges: readonly DependencyEdge[],
  files: readonly PlannedFile[],
): string {
  return JSON.stringify({
    planVersion: 1,
    operation,
    requestedModules,
    resolvedModules,
    dependencyAddedModules,
    dependencyEdges,
    files: files.map((file) => ({
      path: file.path,
      owner: file.owner,
      ownership: file.ownership,
      writePolicy: file.writePolicy,
      contentHash: file.contentHash,
    })),
  });
}

export function buildGenerationPlan(input: BuildGenerationPlanInput): GenerationPlan {
  if (!['init', 'add'].includes(input.operation)) {
    throw new PlanBuildError(
      'INVALID_OPERATION',
      `Unknown generation operation: ${String(input.operation)}`,
    );
  }

  const registry = input.registry ?? DEFAULT_MODULE_REGISTRY;
  const resolution = resolveModules(input.requestedModules, registry);
  const resolvedSet = new Set(resolution.resolvedModules);
  const plannedByPath = new Map<string, PlannedFile>();

  for (const contribution of input.contributions ?? []) {
    const owner = normalizeOwner(contribution.module);
    if (owner !== 'root' && !resolvedSet.has(owner)) {
      throw new PlanBuildError(
        'UNRESOLVED_CONTRIBUTION',
        `Module ${owner} contributed files but is not in the resolved module plan`,
      );
    }

    for (const file of contribution.files) {
      const filePath = normalizePlanPath(file.path);
      if (typeof file.content !== 'string') {
        throw new PlanBuildError(
          'INVALID_FILE_CONTENT',
          `Planned file content must be a string: ${filePath}`,
          Object.freeze([filePath]),
        );
      }
      if (!isFileOwnershipClass(file.ownership)) {
        throw new PlanBuildError(
          'INVALID_FILE_OWNERSHIP',
          `Unknown ownership class for ${filePath}: ${String(file.ownership)}`,
          Object.freeze([filePath]),
        );
      }

      const existing = plannedByPath.get(filePath);
      if (existing) {
        throw new PlanBuildError(
          'DUPLICATE_OUTPUT_PATH',
          `Output path ${filePath} is owned by both ${existing.owner} and ${owner}; compose it before planning`,
          Object.freeze([filePath]),
        );
      }

      const plannedFile: PlannedFile = Object.freeze({
        path: filePath,
        owner,
        ownership: file.ownership,
        writePolicy: writePolicyForOwnership(file.ownership),
        content: file.content,
        contentHash: hashContent(file.content),
      });
      plannedByPath.set(filePath, plannedFile);
    }
  }

  const files = Object.freeze([...plannedByPath.values()].sort((left, right) => compareStrings(left.path, right.path)));
  const fingerprint = hashContent(canonicalFingerprintPayload(
    input.operation,
    resolution.requestedModules,
    resolution.resolvedModules,
    resolution.dependencyAddedModules,
    resolution.dependencyEdges,
    files,
  ));

  return Object.freeze({
    planVersion: 1,
    operation: input.operation,
    requestedModules: resolution.requestedModules,
    resolvedModules: resolution.resolvedModules,
    dependencyAddedModules: resolution.dependencyAddedModules,
    dependencyEdges: resolution.dependencyEdges,
    files,
    fingerprint,
  });
}

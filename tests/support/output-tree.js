import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from 'node:fs';
import path from 'node:path';

export const OUTPUT_TREE_SCHEMA_VERSION = 1;

const PRUNED_WORKSPACE_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.output',
  '.turbo',
  '.wxt',
  '.expo',
  'dist',
]);

const FORBIDDEN_GOLDEN_SEGMENTS = new Set([
  '.git',
  '.next',
  '.output',
  '.turbo',
  '.wxt',
  '.expo',
  'dist',
  'node_modules',
]);

function toPosixPath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function modeString(mode) {
  return (mode & 0o777).toString(8).padStart(4, '0');
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function collectEntries(root, relativeDirectory, entries) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const children = readdirSync(absoluteDirectory, { withFileTypes: true })
    .sort((left, right) => compareText(left.name, right.name));

  for (const child of children) {
    const relativePath = path.join(relativeDirectory, child.name);
    const absolutePath = path.join(root, relativePath);
    const stats = lstatSync(absolutePath);
    const manifestPath = toPosixPath(relativePath);

    if (stats.isDirectory()) {
      collectEntries(root, relativePath, entries);
      continue;
    }

    if (stats.isSymbolicLink()) {
      const target = readlinkSync(absolutePath);
      entries.push({
        path: manifestPath,
        type: 'symlink',
        mode: modeString(stats.mode),
        bytes: Buffer.byteLength(target),
        sha256: sha256(target),
        target,
      });
      continue;
    }

    if (!stats.isFile()) {
      throw new Error(`Unsupported output-tree entry type: ${manifestPath}`);
    }

    const contents = readFileSync(absolutePath);
    entries.push({
      path: manifestPath,
      type: 'file',
      mode: modeString(stats.mode),
      bytes: contents.byteLength,
      sha256: sha256(contents),
    });
  }
}

export function createOutputTreeManifest(root, scenario) {
  const entries = [];
  collectEntries(root, '', entries);
  entries.sort((left, right) => compareText(left.path, right.path));

  const digestPayload = entries.map(({ path: entryPath, type, mode, bytes, sha256: hash, target }) => ({
    path: entryPath,
    type,
    mode,
    bytes,
    sha256: hash,
    ...(target == null ? {} : { target }),
  }));

  return {
    schemaVersion: OUTPUT_TREE_SCHEMA_VERSION,
    scenario: scenario.id,
    projectDirectory: scenario.projectDirectory,
    entries,
    digest: sha256(JSON.stringify(digestPayload)),
  };
}

export function findGoldenTreeViolations(manifest) {
  const violations = [];

  for (const entry of manifest.entries) {
    const segments = entry.path.split('/');
    const forbiddenSegment = segments.find((segment) => FORBIDDEN_GOLDEN_SEGMENTS.has(segment));

    if (forbiddenSegment) {
      violations.push(`${entry.path}: contains generated directory ${forbiddenSegment}`);
    }
    if (entry.path.endsWith('.tsbuildinfo')) {
      violations.push(`${entry.path}: TypeScript build metadata is not golden output`);
    }
    const basename = entry.path.split('/').at(-1);
    if (basename?.startsWith('.env') && basename !== '.env.example') {
      violations.push(`${entry.path}: generated environment files must be examples only`);
    }
  }

  return violations;
}

export function findNestedWorkspaceIslands(root) {
  const violations = [];

  function visit(relativeDirectory) {
    const absoluteDirectory = path.join(root, relativeDirectory);
    const children = readdirSync(absoluteDirectory, { withFileTypes: true });

    for (const child of children) {
      const relativePath = path.join(relativeDirectory, child.name);
      const manifestPath = toPosixPath(relativePath);

      if (child.isSymbolicLink()) continue;

      if (child.isDirectory()) {
        if (child.name === 'node_modules') {
          if (manifestPath !== 'node_modules' && existsSync(path.join(root, relativePath, '.pnpm'))) {
            violations.push(`${manifestPath}/.pnpm`);
          }
          continue;
        }
        if (PRUNED_WORKSPACE_DIRECTORIES.has(child.name)) continue;
        visit(relativePath);
        continue;
      }

      if (
        relativeDirectory !== ''
        && (child.name === 'pnpm-lock.yaml' || child.name === 'pnpm-workspace.yaml')
      ) {
        violations.push(manifestPath);
      }
    }
  }

  visit('');
  return violations.sort(compareText);
}

export function stableManifestJson(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

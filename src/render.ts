import { createHash } from 'node:crypto';

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const MAX_PACKAGE_NAME_LENGTH = 214;
const RESERVED_PACKAGE_NAMES = new Set(['node_modules', 'favicon.ico']);

/** Serialize an arbitrary value as a JavaScript/TypeScript string literal. */
export function jsString(value: string): string {
  return JSON.stringify(value);
}

/** Escape text placed directly in HTML rather than in a JS string. */
export function htmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Keep generated Markdown headings on one line and prevent heading/code injection. */
export function markdownHeading(value: string): string {
  const normalized = value.replace(/[\r\n]+/g, ' ').trim() || 'Anhedral App';
  return normalized.replace(/([\\`*_{}\[\]()<>#+.!|~-])/g, '\\$1');
}

export function assertPackageName(value: string): string {
  const leafName = value.slice(value.lastIndexOf('/') + 1);
  if (
    value.length > MAX_PACKAGE_NAME_LENGTH
    || !PACKAGE_NAME_PATTERN.test(value)
    || RESERVED_PACKAGE_NAMES.has(leafName)
  ) {
    throw new Error(`Invalid package name: ${value}`);
  }
  return value;
}

function compactPackageSegment(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  if (maximumLength <= 9) return value.slice(0, maximumLength).replace(/[._-]+$/g, '') || 'a';
  const digest = createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 8);
  const prefix = value.slice(0, maximumLength - digest.length - 1).replace(/[._-]+$/g, '') || 'app';
  return `${prefix}-${digest}`;
}

/** Derive a valid, deterministic unscoped npm package name from arbitrary text. */
export function packageNameFromText(value: string): string {
  let normalized = value
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (!normalized) normalized = 'anhedral-app';
  if (RESERVED_PACKAGE_NAMES.has(normalized)) normalized = `anhedral-${normalized}`;
  return assertPackageName(compactPackageSegment(normalized, MAX_PACKAGE_NAME_LENGTH));
}

export function childPackageName(projectName: string, suffix: string): string {
  assertPackageName(projectName);
  const normalizedSuffix = packageNameFromText(suffix);
  const separator = projectName.lastIndexOf('/');
  if (separator >= 0) {
    const scope = projectName.slice(0, separator + 1);
    const leaf = compactPackageSegment(
      `${projectName.slice(separator + 1)}-${normalizedSuffix}`,
      MAX_PACKAGE_NAME_LENGTH - scope.length,
    );
    return assertPackageName(`${scope}${leaf}`);
  }
  return assertPackageName(compactPackageSegment(
    `${projectName}-${normalizedSuffix}`,
    MAX_PACKAGE_NAME_LENGTH,
  ));
}

export function identifierSegment(value: string): string {
  const segment = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return segment || 'app';
}

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

// Keep this list intentionally high-confidence. Examples and tests construct tokens
// from fragments so the repository itself never has to allowlist a secret-shaped value.
const SECRET_PATTERNS = Object.freeze([
  {
    id: 'local-home-path',
    pattern: /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+(?:\/[^\s"'<>]*)?|[A-Za-z]:\\Users\\[A-Za-z0-9._-]+(?:\\[^\s"'<>]*)?/g,
  },
  {
    id: 'email-address',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { id: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g },
  { id: 'stripe-live-key', pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { id: 'clerk-secret-key', pattern: /\bsk_(?:test|live)_[A-Za-z0-9_-]{24,}\b/g },
  { id: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  {
    id: 'credentialed-database-uri',
    pattern: /\b(?:postgres(?:ql)?|rediss|mongodb(?:\+srv)?):\/\/[^:/\s"'<>]+:[^@/\s"'<>]{8,}@[^\s/"'<>]+/gi,
  },
  {
    id: 'credential-assignment',
    pattern: /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY)[A-Z0-9_]*\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{32,}["']?/g,
  },
]);

const PLACEHOLDER_VALUES = Object.freeze(new Set([
  '***',
  'change-me',
  'changeme',
  'example',
  'not-a-secret',
  'replace-me',
]));

const TEXT_EXTENSIONS = new Set([
  '', '.cjs', '.css', '.env', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.mts',
  '.sh', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

function looksLikeText(name, contents) {
  if (contents.length > MAX_TEXT_BYTES || contents.includes(0)) return false;
  const basename = path.basename(name);
  return TEXT_EXTENSIONS.has(path.extname(basename).toLowerCase())
    || basename.startsWith('.env')
    || basename === 'LICENSE';
}

export function scanText(relativePath, contents) {
  if (!looksLikeText(relativePath, contents)) return [];
  const text = contents.toString('utf8');
  const findings = [];

  for (const { id, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (
        id === 'email-address'
        && /@(?:users\.noreply\.github\.com|(?:[A-Z0-9-]+\.)*example\.(?:com|net|org))$/i.test(match[0])
      ) continue;
      const assignedValue = match[0].match(/[:=]\s*["']?([^"'\s]+)["']?$/)?.[1];
      if (assignedValue && PLACEHOLDER_VALUES.has(assignedValue.toLowerCase())) continue;
      const line = text.slice(0, match.index).split('\n').length;
      findings.push({ path: relativePath, line, pattern: id });
    }
  }

  return findings;
}

function trackedFiles(root) {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root });
  return output.toString('utf8').split('\0').filter(Boolean);
}

function workingTreeFiles(root) {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root },
  );
  return output.toString('utf8').split('\0').filter(Boolean);
}

function collectFiles(root, directory, prefix = '') {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(root, absolute, relative));
    else if (entry.isFile()) files.push({ path: relative, contents: readFileSync(absolute) });
  }
  return files;
}

export function scanTrackedTree(root) {
  return trackedFiles(root).flatMap((relative) => {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) return [];
    return scanText(relative, readFileSync(absolute));
  });
}

export function scanWorkingTree(root) {
  return workingTreeFiles(root).flatMap((relative) => {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) return [];
    return scanText(relative, readFileSync(absolute));
  });
}

export function scanDirectory(root, relativeDirectory) {
  const absolute = path.join(root, relativeDirectory);
  return collectFiles(root, absolute, relativeDirectory)
    .flatMap((file) => scanText(file.path, file.contents));
}

function readTarString(buffer, offset, length) {
  const end = buffer.indexOf(0, offset);
  return buffer.subarray(offset, end >= offset && end < offset + length ? end : offset + length).toString('utf8');
}

function parseTarSize(buffer, offset, length) {
  const value = readTarString(buffer, offset, length).trim();
  if (!/^[0-7]*$/.test(value)) throw new Error(`Unsupported tar size field: ${JSON.stringify(value)}`);
  return value === '' ? 0 : Number.parseInt(value, 8);
}

function tarballEntries(tarballPath) {
  const archive = gunzipSync(readFileSync(tarballPath));
  const entries = [];
  let offset = 0;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const entryPath = prefix ? `${prefix}/${name}` : name;
    const size = parseTarSize(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > archive.length) throw new Error(`Truncated tar entry: ${entryPath}`);
    if (type === '0' || type === '\0') {
      entries.push({ path: entryPath, contents: archive.subarray(dataStart, dataEnd) });
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

export function scanTarball(tarballPath) {
  return tarballEntries(tarballPath)
    .flatMap((entry) => scanText(entry.path, entry.contents));
}

export function formatFindings(findings) {
  return findings.map((finding) => `${finding.path}:${finding.line}: resembles ${finding.pattern}`).join('\n');
}

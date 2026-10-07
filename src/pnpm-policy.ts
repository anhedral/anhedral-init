import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFile } from './util.js';

function policyBlock(key: string): RegExp {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:${escaped}|"${escaped}"|'${escaped}')[ \\t]*:.*(?:\\r?\\n|$)(?:[ \\t]+[^\\n]*(?:\\n|$)|#[^\\n]*(?:\\n|$)|[ \\t]*\\n)*`, 'gm');
}

/** Preserve unrelated starter YAML while replacing the settings this initializer owns. */
export function setPnpmPolicy(root: string, policy: Record<string, unknown>): void {
  const file = path.join(root, 'pnpm-workspace.yaml');
  let source = existsSync(file) ? readFileSync(file, 'utf8') : '';
  for (const [key, value] of Object.entries(policy)) {
    source = source.replace(policyBlock(key), '');
    if (value === undefined) continue;
    source += `${source.endsWith('\n') || !source ? '' : '\n'}${key}: ${JSON.stringify(value)}\n`;
  }
  writeFile(file, source);
}

/** Only reads the JSON-compatible values written above, never arbitrary client YAML. */
export function generatedPnpmPolicy(root: string, key: string): Record<string, string> {
  const source = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  const value = source.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1];
  return value ? JSON.parse(value) : {};
}

/** Merge reviewed patches without deleting starter-maintained mappings. */
export function mergePnpmPatches(root: string, patches: Record<string, string>): void {
  const file = path.join(root, 'pnpm-workspace.yaml');
  const source = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const blocks = [...source.matchAll(policyBlock('patchedDependencies'))];
  if (blocks.length > 1) throw new Error('Duplicate patchedDependencies configuration');
  const block = blocks[0]?.[0] ?? '';
  const existing = patchRows(block, patches);
  const replacement = 'patchedDependencies:\n' + existing + Object.entries(patches)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}\n`).join('');
  const remaining = source.replace(policyBlock('patchedDependencies'), '');
  writeFile(file, remaining + `${remaining.endsWith('\n') || !remaining ? '' : '\n'}${replacement}`);
}

function patchRows(block: string, patches: Record<string, string>): string {
  if (!block) return '';
  const [header, ...rows] = block.split(/\r?\n/);
  const value = header!.slice(header!.indexOf(':') + 1).trim();
  if (value && !value.startsWith('#')) {
    const object: unknown = JSON.parse(value);
    if (!object || Array.isArray(object) || typeof object !== 'object' ||
      Object.values(object).some((entry) => typeof entry !== 'string')) throw new Error('Unsupported patchedDependencies mapping');
    return Object.entries(object).filter(([key]) => !Object.hasOwn(patches, key))
      .map(([key, entry]) => `  ${JSON.stringify(key)}: ${JSON.stringify(entry)}\n`).join('');
  }
  return rows.filter((row) => {
    if (!row.trim() || row.trimStart().startsWith('#')) return true;
    const match = row.match(/^  (?:"([^"\\]+)"|'([^']+)'|([^\s:'"]+)):\s*(?:"[^"\\]+"|'[^']+'|[^\s{}[\]&*!|>]+)(?:\s+#.*)?\s*$/);
    if (!match) throw new Error('Unsupported patchedDependencies mapping');
    return !Object.hasOwn(patches, match[1] ?? match[2] ?? match[3]!);
  }).filter((row, index, rows) => row || index < rows.length - 1).map((row) => `${row}\n`).join('');
}

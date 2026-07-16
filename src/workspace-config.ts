import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SECURITY_OVERRIDES } from './dependencies.js';
import { writeFile } from './util.js';

export type WorkspacePolicy = {
  overrides: Record<string, string>;
  onlyBuiltDependencies: string[];
  ignoredBuiltDependencies: string[];
  peerDependencyRules: {
    ignoreMissing: string[];
    allowedVersions: Record<string, string>;
  };
};

export type SourceLine = { readonly text: string; readonly start: number; readonly end: number };

type WorkspaceStringScalar = {
  readonly value: string;
  readonly tokenStart: number;
  readonly tokenEnd: number;
};

type WorkspaceMapLine = {
  readonly indent: string;
  readonly key: string;
  readonly rest: string;
  readonly restOffset: number;
};

type WorkspaceBlock = {
  readonly lines: SourceLine[];
  readonly keyLineIndex: number;
  readonly sectionEndIndex: number;
  readonly keyLine: SourceLine;
  readonly key: WorkspaceMapLine;
};

function pathEntryExists(target: string): boolean {
  try {
    lstatSync(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function desiredWorkspacePolicy(): WorkspacePolicy {
  return {
    overrides: { ...SECURITY_OVERRIDES },
    onlyBuiltDependencies: ['electron', 'esbuild', 'sharp'],
    ignoredBuiltDependencies: [
      'browser-tabs-lock',
      'bufferutil',
      'core-js',
      'electron-winstaller',
      'spawn-sync',
      'utf-8-validate',
    ],
    peerDependencyRules: {
      ignoreMissing: ['@solana/web3.js', 'bs58', 'react-native'],
      allowedVersions: {
        esbuild: '>=0.25.0',
        'utf-8-validate': '>=5.0.2',
      },
    },
  };
}

// Managed pnpm policy intentionally supports only scalar maps and string lists. More complex YAML
// is left untouched outside managed sections and rejected inside them instead of being guessed at.
function sourceLines(content: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  while (start < content.length) {
    let cursor = start;
    while (cursor < content.length && content[cursor] !== '\n' && content[cursor] !== '\r') cursor += 1;
    const text = content.slice(start, cursor);
    if (content[cursor] === '\r' && content[cursor + 1] === '\n') cursor += 2;
    else if (cursor < content.length) cursor += 1;
    lines.push({ text, start, end: cursor });
    start = cursor;
  }
  return lines;
}

function workspaceNewline(content: string): string {
  return content.includes('\r\n') ? '\r\n' : content.includes('\r') ? '\r' : '\n';
}

function parseWorkspaceStringScalar(raw: string): WorkspaceStringScalar | null {
  const leading = /^[ \t]*/.exec(raw)?.[0].length ?? 0;
  const valueAndComment = raw.slice(leading);
  if (!valueAndComment) return null;

  const singleQuoted = /^'((?:[^']|'')*)'([ \t]*(?:#.*)?)$/.exec(valueAndComment);
  if (singleQuoted) {
    return {
      value: singleQuoted[1]!.replaceAll("''", "'"),
      tokenStart: leading,
      tokenEnd: leading + singleQuoted[0].length - singleQuoted[2]!.length,
    };
  }
  if (valueAndComment.startsWith("'")) return null;

  const doubleQuoted = /^("(?:[^"\\]|\\.)*")([ \t]*(?:#.*)?)$/.exec(valueAndComment);
  if (doubleQuoted) {
    try {
      const value = JSON.parse(doubleQuoted[1]!) as unknown;
      return typeof value === 'string'
        ? { value, tokenStart: leading, tokenEnd: leading + doubleQuoted[1]!.length }
        : null;
    } catch {
      return null;
    }
  }
  if (valueAndComment.startsWith('"')) return null;

  const comment = /[ \t]+#/.exec(valueAndComment);
  const withoutComment = valueAndComment.slice(0, comment?.index ?? valueAndComment.length).trimEnd();
  if (!withoutComment || /^[\[{|>&*!]/.test(withoutComment)) return null;
  if (/^(?:null|~|true|false|[-+]?(?:\.inf|\.nan|0x[\da-f]+|0o[0-7]+|\d+(?:\.\d+)?(?:e[-+]?\d+)?))$/i.test(withoutComment)) {
    return null;
  }
  return { value: withoutComment, tokenStart: leading, tokenEnd: leading + withoutComment.length };
}

function parseWorkspaceMapLine(line: string): WorkspaceMapLine | null {
  const indent = /^([ \t]*)/.exec(line)?.[1] ?? '';
  const body = line.slice(indent.length);
  let match = /^'((?:[^']|'')*)'[ \t]*:/.exec(body);
  let key: string;
  if (match) key = match[1]!.replaceAll("''", "'");
  else {
    match = /^("(?:[^"\\]|\\.)*")[ \t]*:/.exec(body);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]!) as unknown;
        if (typeof parsed !== 'string') return null;
        key = parsed;
      } catch {
        return null;
      }
    } else {
      match = /^([^:#][^:]*?)[ \t]*:/.exec(body);
      if (!match) return null;
      key = match[1]!.trim();
      if (!key || key.includes('#')) return null;
    }
  }
  const restOffset = indent.length + match[0].length;
  return { indent, key, rest: line.slice(restOffset), restOffset };
}

function parseWorkspaceListLine(line: string): { indent: string; value: string } | null {
  const match = /^([ \t]+)-[ \t]+(.+)$/.exec(line);
  if (!match) return null;
  const scalar = parseWorkspaceStringScalar(match[2]!);
  return scalar ? { indent: match[1]!, value: scalar.value } : null;
}

function quoteWorkspaceString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function workspaceLineIndent(line: string): string | null {
  if (!line.trim() || line.trimStart().startsWith('#')) return null;
  return /^([ \t]*)/.exec(line)?.[1] ?? '';
}

function workspaceBlockAt(lines: SourceLine[], keyLineIndex: number): WorkspaceBlock {
  const keyLine = lines[keyLineIndex]!;
  const key = parseWorkspaceMapLine(keyLine.text);
  if (!key) throw new Error('pnpm-workspace.yaml contains an unsupported mapping key.');
  if (key.indent.includes('\t')) throw new Error('pnpm-workspace.yaml managed sections must use spaces for indentation.');
  let sectionEndIndex = lines.length;
  for (let index = keyLineIndex + 1; index < lines.length; index += 1) {
    const indent = workspaceLineIndent(lines[index]!.text);
    if (indent !== null && indent.length <= key.indent.length) {
      sectionEndIndex = index;
      break;
    }
  }
  return { lines, keyLineIndex, sectionEndIndex, keyLine, key };
}

function findTopLevelWorkspaceBlock(content: string, key: string): WorkspaceBlock | null {
  const lines = sourceLines(content);
  const matches = lines.flatMap((line, index) => {
    const parsed = parseWorkspaceMapLine(line.text);
    return parsed?.indent === '' && parsed.key === key ? [index] : [];
  });
  if (matches.length > 1) throw new Error(`pnpm-workspace.yaml contains duplicate top-level ${key} keys.`);
  return matches.length === 1 ? workspaceBlockAt(lines, matches[0]!) : null;
}

function appendWorkspaceLines(content: string, offset: number, additions: readonly string[]): string {
  if (additions.length === 0) return content;
  const newline = workspaceNewline(content);
  const leading = offset > 0 && !/(?:\r\n|\n|\r)$/.test(content.slice(0, offset)) ? newline : '';
  return `${content.slice(0, offset)}${leading}${additions.join(newline)}${newline}${content.slice(offset)}`;
}

function appendTopLevelWorkspaceKey(content: string, key: string): string {
  return appendWorkspaceLines(content, content.length, [`${key}:`]);
}

function requireWorkspaceBlockValue(block: WorkspaceBlock, fieldPath: string): void {
  if (!/^[ \t]*(?:#.*)?$/.test(block.key.rest)) {
    throw new Error(`Conflict in ${fieldPath}: expected a block value that can be merged safely.`);
  }
}

function mergeWorkspaceListBlock(
  content: string,
  block: WorkspaceBlock,
  desiredValues: readonly string[],
  fieldPath: string,
): string {
  requireWorkspaceBlockValue(block, fieldPath);
  const existing = new Set<string>();
  let indent = `${block.key.indent}  `;
  let insertionOffset = block.keyLine.end;
  let foundItem = false;
  for (let index = block.keyLineIndex + 1; index < block.sectionEndIndex; index += 1) {
    const line = block.lines[index]!;
    if (workspaceLineIndent(line.text) === null) continue;
    const parsed = parseWorkspaceListLine(line.text);
    if (!parsed || parsed.indent.includes('\t') || parsed.indent.length <= block.key.indent.length) {
      throw new Error(`Conflict in ${fieldPath}: expected a simple block list of strings.`);
    }
    if (foundItem && parsed.indent !== indent) {
      throw new Error(`Conflict in ${fieldPath}: list items must use consistent indentation.`);
    }
    foundItem = true;
    indent = parsed.indent;
    existing.add(parsed.value);
    insertionOffset = line.end;
  }
  const additions = [...new Set(desiredValues)].filter((value) => !existing.has(value));
  return appendWorkspaceLines(
    content,
    insertionOffset,
    additions.map((value) => `${indent}- ${quoteWorkspaceString(value)}`),
  );
}

function ensureTopLevelWorkspaceBlock(content: string, key: string): { content: string; block: WorkspaceBlock } {
  const existing = findTopLevelWorkspaceBlock(content, key);
  if (existing) return { content, block: existing };
  const appended = appendTopLevelWorkspaceKey(content, key);
  return { content: appended, block: findTopLevelWorkspaceBlock(appended, key)! };
}

function mergeTopLevelWorkspaceList(
  content: string,
  key: string,
  desiredValues: readonly string[],
): string {
  const ensured = ensureTopLevelWorkspaceBlock(content, key);
  return mergeWorkspaceListBlock(ensured.content, ensured.block, desiredValues, `pnpm-workspace.yaml ${key}`);
}

function mergeWorkspaceMapBlock(
  content: string,
  block: WorkspaceBlock,
  desiredValues: Readonly<Record<string, string>>,
  fieldPath: string,
  allowGeneratedUpdates: boolean,
): string {
  requireWorkspaceBlockValue(block, fieldPath);
  type Entry = { readonly line: SourceLine; readonly parsed: WorkspaceMapLine; readonly scalar: WorkspaceStringScalar };
  const entries = new Map<string, Entry>();
  let indent = `${block.key.indent}  `;
  let insertionOffset = block.keyLine.end;
  let foundEntry = false;
  for (let index = block.keyLineIndex + 1; index < block.sectionEndIndex; index += 1) {
    const line = block.lines[index]!;
    if (workspaceLineIndent(line.text) === null) continue;
    const parsed = parseWorkspaceMapLine(line.text);
    if (!parsed || parsed.indent.includes('\t') || parsed.indent.length <= block.key.indent.length) {
      throw new Error(`Conflict in ${fieldPath}: expected a simple string-to-string mapping.`);
    }
    if (foundEntry && parsed.indent !== indent) {
      throw new Error(`Conflict in ${fieldPath}: mapping entries must use consistent indentation.`);
    }
    const scalar = parseWorkspaceStringScalar(parsed.rest);
    if (!scalar) throw new Error(`Conflict in ${fieldPath}: mapping values must be strings.`);
    if (entries.has(parsed.key)) throw new Error(`Conflict in ${fieldPath}: duplicate mapping entry ${parsed.key}.`);
    foundEntry = true;
    indent = parsed.indent;
    insertionOffset = line.end;
    entries.set(parsed.key, { line, parsed, scalar });
  }

  const additions: string[] = [];
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const [key, desiredValue] of Object.entries(desiredValues)) {
    const existing = entries.get(key);
    if (!existing) {
      additions.push(`${indent}${quoteWorkspaceString(key)}: ${quoteWorkspaceString(desiredValue)}`);
      continue;
    }
    if (existing.scalar.value === desiredValue) continue;
    if (!allowGeneratedUpdates) {
      throw new Error(`Conflict in ${fieldPath}: mapping entry ${key} differs from the generated value.`);
    }
    replacements.push({
      start: existing.line.start + existing.parsed.restOffset + existing.scalar.tokenStart,
      end: existing.line.start + existing.parsed.restOffset + existing.scalar.tokenEnd,
      value: quoteWorkspaceString(desiredValue),
    });
  }

  let merged = appendWorkspaceLines(content, insertionOffset, additions);
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    merged = `${merged.slice(0, replacement.start)}${replacement.value}${merged.slice(replacement.end)}`;
  }
  return merged;
}

function mergeTopLevelWorkspaceMap(
  content: string,
  key: string,
  desiredValues: Readonly<Record<string, string>>,
  allowGeneratedUpdates: boolean,
): string {
  const ensured = ensureTopLevelWorkspaceBlock(content, key);
  return mergeWorkspaceMapBlock(
    ensured.content,
    ensured.block,
    desiredValues,
    `pnpm-workspace.yaml ${key}`,
    allowGeneratedUpdates,
  );
}

function directChildIndent(block: WorkspaceBlock, fieldPath: string): string {
  let childIndent: string | null = null;
  for (let index = block.keyLineIndex + 1; index < block.sectionEndIndex; index += 1) {
    const indent = workspaceLineIndent(block.lines[index]!.text);
    if (indent === null) continue;
    if (indent.includes('\t') || indent.length <= block.key.indent.length) {
      throw new Error(`Conflict in ${fieldPath}: expected an indented mapping.`);
    }
    if (childIndent === null || indent.length < childIndent.length) childIndent = indent;
  }
  return childIndent ?? `${block.key.indent}  `;
}

function findDirectWorkspaceBlock(parent: WorkspaceBlock, key: string, fieldPath: string): WorkspaceBlock | null {
  const childIndent = directChildIndent(parent, fieldPath);
  const matches: number[] = [];
  for (let index = parent.keyLineIndex + 1; index < parent.sectionEndIndex; index += 1) {
    const line = parent.lines[index]!;
    const indent = workspaceLineIndent(line.text);
    if (indent === null || indent.length !== childIndent.length) continue;
    const parsed = parseWorkspaceMapLine(line.text);
    if (!parsed || parsed.indent !== childIndent) {
      throw new Error(`Conflict in ${fieldPath}: expected a mapping of named policies.`);
    }
    if (parsed.key === key) matches.push(index);
  }
  if (matches.length > 1) throw new Error(`Conflict in ${fieldPath}: duplicate ${key} keys.`);
  return matches.length === 1 ? workspaceBlockAt(parent.lines, matches[0]!) : null;
}

function ensureDirectWorkspaceBlock(
  content: string,
  parentKey: string,
  key: string,
  fieldPath: string,
): { content: string; block: WorkspaceBlock } {
  let parent = findTopLevelWorkspaceBlock(content, parentKey);
  if (!parent) {
    content = appendTopLevelWorkspaceKey(content, parentKey);
    parent = findTopLevelWorkspaceBlock(content, parentKey)!;
  }
  requireWorkspaceBlockValue(parent, `pnpm-workspace.yaml ${parentKey}`);
  const existing = findDirectWorkspaceBlock(parent, key, fieldPath);
  if (existing) return { content, block: existing };

  const indent = directChildIndent(parent, fieldPath);
  let insertionOffset = parent.keyLine.end;
  for (let index = parent.keyLineIndex + 1; index < parent.sectionEndIndex; index += 1) {
    const line = parent.lines[index]!;
    if (workspaceLineIndent(line.text) !== null) insertionOffset = line.end;
  }
  content = appendWorkspaceLines(content, insertionOffset, [`${indent}${key}:`]);
  parent = findTopLevelWorkspaceBlock(content, parentKey)!;
  return { content, block: findDirectWorkspaceBlock(parent, key, fieldPath)! };
}

function applyWorkspaceAutoInstallPeers(content: string, allowGeneratedUpdates: boolean): string {
  const block = findTopLevelWorkspaceBlock(content, 'autoInstallPeers');
  if (!block) {
    const newline = workspaceNewline(content);
    const separator = content.length > 0 && !/(?:\r\n|\n|\r)$/.test(content) ? newline : '';
    return `${content}${separator}autoInstallPeers: false${newline}`;
  }
  const scalar = /^([ \t]*)(true|false)([ \t]*(?:#.*)?)$/i.exec(block.key.rest);
  if (!scalar) throw new Error('Conflict in pnpm-workspace.yaml: autoInstallPeers must be the boolean false.');
  for (let index = block.keyLineIndex + 1; index < block.sectionEndIndex; index += 1) {
    if (workspaceLineIndent(block.lines[index]!.text) !== null) {
      throw new Error('Conflict in pnpm-workspace.yaml: autoInstallPeers must be a scalar boolean.');
    }
  }
  if (scalar[2]!.toLowerCase() === 'false') return content;
  if (!allowGeneratedUpdates) {
    throw new Error('Conflict in pnpm-workspace.yaml: autoInstallPeers must be false to avoid unsafe optional peer resolution.');
  }
  const start = block.keyLine.start + block.key.restOffset + scalar[1]!.length;
  return `${content.slice(0, start)}false${content.slice(start + scalar[2]!.length)}`;
}

function applyWorkspacePolicy(
  content: string,
  policy: WorkspacePolicy,
  allowGeneratedUpdates: boolean,
): string {
  let merged = applyWorkspaceAutoInstallPeers(content, allowGeneratedUpdates);
  merged = mergeTopLevelWorkspaceMap(merged, 'overrides', policy.overrides, allowGeneratedUpdates);
  merged = mergeTopLevelWorkspaceList(merged, 'onlyBuiltDependencies', policy.onlyBuiltDependencies);
  merged = mergeTopLevelWorkspaceList(merged, 'ignoredBuiltDependencies', policy.ignoredBuiltDependencies);

  const ignoreMissing = ensureDirectWorkspaceBlock(
    merged,
    'peerDependencyRules',
    'ignoreMissing',
    'pnpm-workspace.yaml peerDependencyRules',
  );
  merged = mergeWorkspaceListBlock(
    ignoreMissing.content,
    ignoreMissing.block,
    policy.peerDependencyRules.ignoreMissing,
    'pnpm-workspace.yaml peerDependencyRules.ignoreMissing',
  );
  const allowedVersions = ensureDirectWorkspaceBlock(
    merged,
    'peerDependencyRules',
    'allowedVersions',
    'pnpm-workspace.yaml peerDependencyRules',
  );
  return mergeWorkspaceMapBlock(
    allowedVersions.content,
    allowedVersions.block,
    policy.peerDependencyRules.allowedVersions,
    'pnpm-workspace.yaml peerDependencyRules.allowedVersions',
    allowGeneratedUpdates,
  );
}

export function mergeWorkspaceFile(
  root: string,
  desiredPackages: string[],
  policy: WorkspacePolicy,
  allowGeneratedUpdates: boolean,
): void {
  const filePath = path.join(root, 'pnpm-workspace.yaml');
  const current = pathEntryExists(filePath) ? readFileSync(filePath, 'utf8') : '';
  let merged = mergeTopLevelWorkspaceList(current, 'packages', desiredPackages);
  merged = applyWorkspacePolicy(merged, policy, allowGeneratedUpdates);
  if (merged !== current || !pathEntryExists(filePath)) writeFile(filePath, merged);
}

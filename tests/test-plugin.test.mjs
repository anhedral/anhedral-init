import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPluginArchive } from '../scripts/package-plugin.mjs';
const root = path.resolve(import.meta.dirname, '..');
const result = buildPluginArchive(root);
assert.deepEqual(result.contents, buildPluginArchive(root).contents, 'Plugin ZIP must be reproducible');
let offset = 0;
const files = new Map();
while (result.contents.readUInt32LE(offset) === 0x04034b50) {
  const size = result.contents.readUInt32LE(offset + 18);
  const nameSize = result.contents.readUInt16LE(offset + 26);
  const name = result.contents.subarray(offset + 30, offset + 30 + nameSize).toString();
  const content = result.contents.subarray(offset + 30 + nameSize, offset + 30 + nameSize + size);
  assert.deepEqual(content, readFileSync(path.join(root, 'plugins/anhedral', name)));
  files.set(name, content);
  offset += 30 + nameSize + size;
}
assert.ok(files.has('plugin.json'));
assert.ok(files.has('skills/anhedral/SKILL.md'));
assert.ok(files.has('LICENSE'));
for (const [name, contents] of files) {
  if (!name.endsWith('.md')) continue;
  for (const match of contents.toString().matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(match[1])) continue;
    assert.ok(files.has(path.posix.normalize(path.posix.join(path.posix.dirname(name), match[1]))), `Missing bundled reference: ${match[1]}`);
  }
}
const temporary = mkdtempSync(path.join(tmpdir(), 'anhedral-plugin-contract-'));
try {
  cpSync(path.join(root, 'plugins'), path.join(temporary, 'plugins'), { recursive: true });
  writeFileSync(path.join(temporary, 'package.json'), JSON.stringify({ version: '0.0.0' }));
  assert.throws(() => buildPluginArchive(temporary), /versions must match/);
} finally { rmSync(temporary, { recursive: true, force: true }); }

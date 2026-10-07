import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setPnpmPolicy, mergePnpmPatches } from '../dist/pnpm-policy.js';
import { configureSecurityBackports } from '../dist/security-backports.js';

function fixture(t, source) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'anhedral-pnpm-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'pnpm-workspace.yaml');
  writeFileSync(file, source);
  return { root, file, read: () => readFileSync(file, 'utf8') };
}

test('owned policy keys replace quoted/multiline/JSON keys and preserve unrelated YAML', (t) => {
  for (const key of ['overrides', '"overrides"', "'overrides'"]) {
    const prefix = 'packages:\n  - apps/*\ncatalog:\n  react: 19.3.0\n';
    const f = fixture(t, `${prefix}${key}:\n  old: 1.0.0\nallowBuilds: {"esbuild":true}\n`);
    const policy = { overrides: { secure: '2.0.0' } };
    setPnpmPolicy(f.root, policy);
    assert.equal(f.read(), `${prefix}allowBuilds: {"esbuild":true}\noverrides: {"secure":"2.0.0"}\n`);
    const first = f.read();
    setPnpmPolicy(f.root, policy);
    assert.equal(f.read(), first);
  }
});

test('reviewed patches preserve unrelated patch rows and are idempotent', (t) => {
  const f = fixture(t, 'packages:\n  - apps/*\n"patchedDependencies":\n  # retained starter fix\n  "other-lib@1.0.0": patches/other.patch # keep this comment\n  braces@3.0.3: patches/obsolete.patch\n');
  writeFileSync(path.join(f.root, 'pnpm-lock.yaml'), 'packages:\n  braces@3.0.3:\n    resolution: {}\nsnapshots:\n  braces@3.0.3: {}\n');
  assert.equal(configureSecurityBackports(f.root), true);
  assert.match(f.read(), /  "other-lib@1.0.0": patches\/other.patch # keep this comment\n/);
  assert.match(f.read(), /# retained starter fix/);
  assert.match(f.read(), /"braces@3.0.3": "scripts\/security\/braces@3.0.3.patch"/);
  assert.doesNotMatch(f.read(), /obsolete/);
  const first = f.read();
  configureSecurityBackports(f.root);
  assert.equal(f.read(), first);
});

test('patch merging supports JSON maps and rejects unsupported or duplicate maps before writes', (t) => {
  const f = fixture(t, 'patchedDependencies: {"other-lib@1.0.0":"patches/other.patch"}\n');
  mergePnpmPatches(f.root, { 'braces@3.0.3': 'scripts/security/braces@3.0.3.patch' });
  assert.match(f.read(), /"other-lib@1.0.0": "patches\/other.patch"/);
  for (const source of [
    'patchedDependencies:\n  other-lib@1.0.0:\n    path: patches/other.patch\n',
    'patchedDependencies: &shared\n  other-lib@1.0.0: patches/other.patch\n',
    'patchedDependencies: {}\n"patchedDependencies": {}\n',
  ]) {
    writeFileSync(f.file, source);
    assert.throws(() => mergePnpmPatches(f.root, { 'braces@3.0.3': 'scripts/security/braces@3.0.3.patch' }));
    assert.equal(f.read(), source);
  }
});


test('standalone comments inside patch maps retain surrounding rows without orphaning YAML', (t) => {
  for (const key of ['patchedDependencies', '"patchedDependencies"']) {
    const f = fixture(t, `${key}:\n  old@1: old.patch\n# comment inside mapping\n  other@1: other.patch\ncatalog:\n  react: 19.3.0\n`);
    mergePnpmPatches(f.root, { 'braces@3.0.3': 'scripts/security/braces@3.0.3.patch' });
    assert.equal(f.read(), 'catalog:\n  react: 19.3.0\npatchedDependencies:\n  old@1: old.patch\n# comment inside mapping\n  other@1: other.patch\n  "braces@3.0.3": "scripts/security/braces@3.0.3.patch"\n');
    const first = f.read();
    mergePnpmPatches(f.root, { 'braces@3.0.3': 'scripts/security/braces@3.0.3.patch' });
    assert.equal(f.read(), first);
  }
});


test('patch merging treats prototype-named mappings as ordinary unrelated entries', (t) => {
  for (const source of ['patchedDependencies: {"constructor":"original.patch"}\n', 'patchedDependencies:\n  constructor: original.patch\n']) {
    const f = fixture(t, source);
    mergePnpmPatches(f.root, { 'braces@3.0.3': 'scripts/security/braces@3.0.3.patch' });
    assert.ok(f.read().includes('constructor'));
    assert.ok(f.read().includes('original.patch'));
  }
});

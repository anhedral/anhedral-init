import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'anhedral-lift-nested-project-'));

try {
  const { liftNestedProject } = await import(path.join(repoRoot, 'dist', 'util.js'));

  const root = path.join(tempRoot, 'app');
  const nestedRoot = path.join(root, 'app');
  mkdirSync(path.join(nestedRoot, 'app'), { recursive: true });
  mkdirSync(path.join(nestedRoot, 'lib'), { recursive: true });
  writeFileSync(path.join(root, 'README.md'), '# root\n');
  writeFileSync(path.join(nestedRoot, 'package.json'), '{"name":"nested"}\n');
  writeFileSync(path.join(nestedRoot, '.gitignore'), 'node_modules\n');
  writeFileSync(path.join(nestedRoot, 'app', 'page.tsx'), 'export default function Page() { return null; }\n');
  writeFileSync(path.join(nestedRoot, 'lib', 'utils.ts'), 'export const value = 1;\n');

  liftNestedProject(root, 'app');

  assert.equal(existsSync(path.join(root, 'package.json')), true, 'package.json should be moved to the root');
  assert.equal(existsSync(path.join(root, '.gitignore')), true, '.gitignore should be moved to the root');
  assert.equal(existsSync(path.join(root, 'app', 'page.tsx')), true, 'self-nested app directory should be merged into the root app directory');
  assert.equal(existsSync(path.join(root, 'lib', 'utils.ts')), true, 'sibling directories should be lifted into the root');
  assert.equal(existsSync(path.join(root, '.app.anhedral-tmp')), false, 'temporary merge directory should be cleaned up after lifting');
  assert.equal(readFileSync(path.join(root, 'package.json'), 'utf8'), '{"name":"nested"}\n');

  console.log('Nested project lifting regression test passed');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

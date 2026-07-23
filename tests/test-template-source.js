import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BundledTemplateSource,
  assertTemplateProvenance,
  materializeTemplates,
  templateIdsForModules,
} from '../dist/template-source.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const bundledRoot = path.join(repoRoot, 'templates');
const tempRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-template-source-'));

const gitAttributes = readFileSync(path.join(repoRoot, '.gitattributes'), 'utf8');
const templateAttributes = gitAttributes
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
assert.equal(
  templateAttributes.includes('/templates/** text eol=lf'),
  true,
  'Bundled templates must be checked out with LF endings so byte-level integrity hashes are portable.',
);

try {
  const destination = path.join(tempRoot, 'project');
  const modules = ['web', 'api', 'db'];
  const provenance = materializeTemplates(destination, modules);
  assert.deepEqual(templateIdsForModules(modules), ['web-next', 'api-fastify', 'db-drizzle']);
  assert.equal(existsSync(path.join(destination, 'apps/web/next-env.d.ts')), true);
  assert.equal(existsSync(path.join(destination, 'apps/api/tsconfig.json')), true);
  assert.equal(existsSync(path.join(destination, 'packages/db/tsconfig.json')), true);
  assertTemplateProvenance(modules, provenance);

  assert.throws(
    () => assertTemplateProvenance(modules, { 'web-next': provenance['web-next'] }),
    /exactly match selected modules/,
  );

  const corruptedRoot = path.join(tempRoot, 'corrupted');
  cpSync(bundledRoot, corruptedRoot, { recursive: true });
  writeFileSync(path.join(corruptedRoot, 'web-next/apps/web/next-env.d.ts'), 'corrupted\n');
  const corruptedSource = new BundledTemplateSource(corruptedRoot);
  assert.throws(
    () => corruptedSource.materialize({ ids: ['web-next'], destination: path.join(tempRoot, 'corrupted-output') }),
    /integrity check failed/,
  );

  const linkedRoot = path.join(tempRoot, 'linked');
  cpSync(bundledRoot, linkedRoot, { recursive: true });
  symlinkSync('next-env.d.ts', path.join(linkedRoot, 'web-next/apps/web/linked.d.ts'));
  const linkedSource = new BundledTemplateSource(linkedRoot);
  assert.throws(
    () => linkedSource.materialize({ ids: ['web-next'], destination: path.join(tempRoot, 'linked-output') }),
    /symbolic links are not supported/,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Bundled template source validation passed');

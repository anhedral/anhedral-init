import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSyncPortable } from '../scripts/spawn-command.mjs';
import { parseNpmPackJson } from './support/npm-pack.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const npmCache = mkdtempSync(path.join(tmpdir(), 'anhedral-packlist-'));
const requiredFiles = new Set([
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.md',
  'SKILL.md',
  'SECURITY.md',
  'anhedral.svg',
  'bin/anhedral.js',
  'dist/bin.js',
  'dist/index.d.ts',
  'dist/index.js',
  'favicon.ico',
  'package.json',
  'docs/conventions.md',
  'docs/master-stack-map.md',
  'docs/output-tree-contract.md',
  'docs/references/manual-scaffolding.md',
  'docs/references/provisioning.md',
  'templates/catalog.json',
  'templates/web-next/apps/web/next-env.d.ts',
]);
const allowedRootFiles = new Set([
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.md',
  'SKILL.md',
  'SECURITY.md',
  'anhedral.svg',
  'favicon.ico',
  'package.json',
]);

function assertPackedMarkdownLinks(sourcePath, markdown, packedFiles) {
  for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const pathTarget = target.split('#', 1)[0];
    if (!pathTarget) continue;
    const resolvedTarget = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), pathTarget));
    assert.ok(
      !resolvedTarget.startsWith('../') && packedFiles.includes(resolvedTarget),
      `packed ${sourcePath} link target must be published: ${target}`,
    );
  }
}

try {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const license = readFileSync(path.join(repoRoot, 'LICENSE'), 'utf8');
  assert.equal(packageJson.sideEffects, false);
  assert.equal(packageJson.homepage, 'https://github.com/anhedral/anhedral-init#readme');
  assert.deepEqual(packageJson.repository, {
    type: 'git',
    url: 'git+https://github.com/anhedral/anhedral-init.git',
  });
  assert.deepEqual(packageJson.bugs, { url: 'https://github.com/anhedral/anhedral-init/issues' });
  assert.equal(packageJson.license, 'Apache-2.0');
  assert.match(license, /Apache License\s+Version 2\.0, January 2004/i);
  assert.match(license, /Grant of Copyright License/i);
  assert.match(license, /Grant of Patent License/i);
  assert.match(license, /Copyright 2026 Anhedral, Inc\./i);
  assert.doesNotMatch(license, /proprietary and confidential/i);

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSyncPortable(npmCommand, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: npmCache,
    },
  });

  assert.equal(
    result.status,
    0,
    `npm pack --dry-run failed\nstdout:\n${result.stdout ?? ''}\nstderr:\n${result.stderr ?? ''}`,
  );

  const [packed] = parseNpmPackJson(String(result.stdout ?? ''));
  assert.ok(packed, 'npm pack should describe one package');
  const files = packed.files.map((file) => file.path);

  assert.equal(new Set(files).size, files.length, 'packlist should not contain duplicate paths');
  assert.equal(packed.entryCount, files.length, 'entryCount should match the packlist length');
  assert.ok(packed.size < 1_000_000, `packed artifact should remain below 1 MB; received ${packed.size}`);
  assert.ok(
    packed.unpackedSize < 2_000_000,
    `unpacked artifact should remain below 2 MB; received ${packed.unpackedSize}`,
  );

  for (const requiredFile of requiredFiles) {
    assert.ok(files.includes(requiredFile), `packlist should contain ${requiredFile}`);
  }

  const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  assert.match(readme, /open source under the \[Apache License 2\.0\]\(LICENSE\)/i);
  assert.match(readme, /Generated applications[\s\S]+developers can customize and license for their products/i);
  assert.doesNotMatch(readme, /does not grant permission to install|separate written agreement/i);
  assertPackedMarkdownLinks('README.md', readme, files);

  const skill = readFileSync(path.join(repoRoot, 'SKILL.md'), 'utf8');
  assert.match(skill, /docs\/master-stack-map\.md/);
  assert.match(skill, /1 select \+ plan -> 2 generate safely/);
  assertPackedMarkdownLinks('SKILL.md', skill, files);

  const masterMapDocument = readFileSync(path.join(repoRoot, 'docs/master-stack-map.md'), 'utf8');
  const [masterMap = ''] = masterMapDocument.split('```text').slice(1);
  const [masterMapAscii = ''] = masterMap.split('```');
  const masterMapLines = masterMapAscii.trim().split('\n');
  const framedLines = masterMapLines.filter((line) => line.startsWith('+') || line.startsWith('|'));
  assert.ok(framedLines.length > 100, 'master stack map must retain its complete fixed-width structure');
  assert.deepEqual(
    [...new Set(framedLines.map((line) => line.length))],
    [124],
    'every master stack map border and content line must be exactly aligned',
  );
  for (const requiredMapText of [
    'electron-updater -> desktop',
    'apps/desktop-updater-worker',
    'desktop:updates:worker:{check,dev,deploy,types}',
    'SUBAGENTS Lead owns mutations',
    'SECRET HANDOFF Stop before Generate/Reveal/Create',
    'app.<domain> points from Cloudflare DNS to Vercel and stays DNS-only',
  ]) {
    assert.match(masterMapAscii, new RegExp(requiredMapText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const file of packed.files) {
    const allowedBin = file.path === 'bin/anhedral.js';
    const allowedDist = file.path.startsWith('dist/') && /\.(?:d\.ts|js)$/.test(file.path);
    const allowedTemplate = file.path.startsWith('templates/')
      && /(?:\.json|\.d\.ts)$/.test(file.path);
    const allowedDocumentation = file.path === 'docs/conventions.md'
      || file.path === 'docs/master-stack-map.md'
      || file.path === 'docs/output-tree-contract.md'
      || file.path === 'docs/references/manual-scaffolding.md'
      || file.path === 'docs/references/provisioning.md';
    const allowed = allowedRootFiles.has(file.path) || allowedBin || allowedDist || allowedTemplate || allowedDocumentation;
    assert.ok(allowed, `unexpected published path: ${file.path}`);
    if (!allowedDocumentation) assert.doesNotMatch(file.path, /(^|\/)(?:\.env|src|tests?|scripts?|\.github|node_modules|\.git)(?:\/|$)/);
    assert.doesNotMatch(file.path, /\.(?:map|tgz|tsbuildinfo)$/);
  }

  const binEntry = packed.files.find((file) => file.path === 'bin/anhedral.js');
  assert.ok(binEntry, 'packlist should describe bin/anhedral.js');
  assert.notEqual(binEntry.mode & 0o111, 0, 'bin/anhedral.js should be executable');

  console.log(`Packlist policy passed: ${files.length} files, ${packed.size} packed bytes`);
} finally {
  rmSync(npmCache, { recursive: true, force: true });
}

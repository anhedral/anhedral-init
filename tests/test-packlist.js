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
  'LICENSE',
  'README.md',
  'anhedral.svg',
  'dist/bin.js',
  'dist/index.d.ts',
  'dist/index.js',
  'favicon.ico',
  'package.json',
  'assets/anhedral-cli-init.svg',
  'assets/anhedral-cli-init-technical.svg',
  'assets/images/svg/logo-white-subtract.svg',
  'docs/application-stack-standard.md',
]);
const allowedRootFiles = new Set([
  'LICENSE',
  'README.md',
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
  assertPackedMarkdownLinks('docs/application-stack-standard.md', readFileSync(path.join(repoRoot, 'docs/application-stack-standard.md'), 'utf8'), files);

  const renderedMapPath = path.join(npmCache, 'anhedral-cli-init.svg');
  const renderResult = spawnSyncPortable(
    process.execPath,
    [path.join(repoRoot, 'scripts/render-master-stack-map.mjs'), '--output', renderedMapPath],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(renderResult.status, 0, `stack map render failed: ${renderResult.stderr ?? ''}`);
  const checkedInSvg = readFileSync(path.join(repoRoot, 'assets/anhedral-cli-init.svg'), 'utf8');
  assert.equal(readFileSync(renderedMapPath, 'utf8'), checkedInSvg, 'generated stack map SVG must be current');
  for (const requiredSvgText of [
    'Anhedral Init Stack', 'CLIENT SURFACES', 'OpenNext', 'Hono + OpenAPI',
    'Workers', 'Hyperdrive', 'Neon + Drizzle',
    'Private R2', 'KV', 'Durable Objects', 'WebSockets', 'Queues',
    'Cron Triggers', 'Workflows', 'Observability', 'Basin', 'Pipelines',
    'Workers AI', 'D1 + Drizzle', 'Fallow audit',
  ]) assert.ok(checkedInSvg.includes(requiredSvgText), `stack diagram must include ${requiredSvgText}`);
  assert.doesNotMatch(checkedInSvg, /Ably|Fastify/);
  assert.match(checkedInSvg, /Vercel when explicitly selected/);

  const renderedTechnicalMapPath = path.join(npmCache, 'anhedral-cli-init-technical.svg');
  const technicalRenderResult = spawnSyncPortable(
    process.execPath,
    [path.join(repoRoot, 'scripts/render-master-stack-map.mjs'), '--technical', '--output', renderedTechnicalMapPath],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(
    technicalRenderResult.status,
    0,
    `technical stack map render failed: ${technicalRenderResult.stderr ?? ''}`,
  );
  const checkedInTechnicalSvg = readFileSync(
    path.join(repoRoot, 'assets/anhedral-cli-init-technical.svg'),
    'utf8',
  );
  assert.equal(
    readFileSync(renderedTechnicalMapPath, 'utf8'),
    checkedInTechnicalSvg,
    'generated technical stack map SVG must be current',
  );
  assert.match(checkedInTechnicalSvg, /Application service contracts/);
  assert.match(checkedInTechnicalSvg, /CLOUDFLARE SERVICE BINDINGS/);
  assert.doesNotMatch(checkedInTechnicalSvg, /Ably|Vercel|Fastify/);

  for (const file of packed.files) {
    const allowedDist = file.path.startsWith('dist/') && /\.(?:d\.ts|js)$/.test(file.path);
    const allowedDocumentation = file.path === 'assets/anhedral-cli-init.svg'
      || file.path === 'assets/anhedral-cli-init-technical.svg'
      || file.path === 'assets/images/svg/logo-white-subtract.svg'
      || file.path === 'docs/application-stack-standard.md';
    const allowed = allowedRootFiles.has(file.path) || allowedDist || allowedDocumentation;
    assert.ok(allowed, `unexpected published path: ${file.path}`);
    if (!allowedDocumentation) assert.doesNotMatch(file.path, /(^|\/)(?:\.env|src|tests?|scripts?|\.github|node_modules|\.git)(?:\/|$)/);
    assert.doesNotMatch(file.path, /\.(?:map|tgz|tsbuildinfo)$/);
  }

  const binEntry = packed.files.find((file) => file.path === 'dist/bin.js');
  assert.ok(binEntry, 'packlist should describe dist/bin.js');
  assert.notEqual(binEntry.mode & 0o111, 0, 'dist/bin.js should be executable');

  console.log(`Packlist policy passed: ${files.length} files, ${packed.size} packed bytes`);
} finally {
  rmSync(npmCache, { recursive: true, force: true });
}

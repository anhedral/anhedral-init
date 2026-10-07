import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseStandardOptions, scaffoldStandardProject } from '../dist/standard.js';
import { scaffoldDesktop } from '../dist/platforms/desktop.js';

const moduleUrl = pathToFileURL(path.resolve('dist/standard.js')).href;
const read = (root, file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const runner = (_command, args, cwd) => {
  if (args.includes('--lockfile-only')) writeFileSync(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');
};
const options = (root, ...flags) => parseStandardOptions('new', [root, '--no-git', '--skip-install', '--json', ...flags]);

function temporary(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'anhedral-generator-safety-'));
  return Promise.resolve().then(() => run(root)).finally(() => rmSync(root, { recursive: true, force: true }));
}

test('initializer rejects hostile library names before writes or tools; provider names remain bounded and consistent', async () => temporary(async (temporaryRoot) => {
  for (const name of ["demo', version:'1'} }); globalThis.compromised=true; //", '../escape', '@scope/app', 'a'.repeat(215)]) {
    const root = path.join(temporaryRoot, 'invalid');
    await assert.rejects(scaffoldStandardProject({ ...options(root, '--hono'), name }, () => assert.fail('Invalid names must not invoke tools')), /(?:package name|Project name)/);
    assert.equal(existsSync(root), false);
  }
  const manifests = [];
  for (const name of ['my.app', 'my_app', 'a'.repeat(180), 'a'.repeat(179) + 'b']) {
    const root = path.join(temporaryRoot, name);
    await scaffoldStandardProject(options(root, '--hono', '--d1', '--r2', '--queues', '--cron', '--workflows', '--realtime'), runner);
    assert.equal(read(root, 'package.json').name, name, 'Provider normalization must not change the npm name');
    const api = read(root, 'apps/api/wrangler.jsonc');
    const jobs = read(root, 'apps/jobs/wrangler.jsonc');
    const workflows = read(root, 'apps/workflows/wrangler.jsonc');
    const identifiers = [api.name, api.d1_databases[0].database_name, api.r2_buckets[0].bucket_name,
      jobs.name, jobs.queues.consumers[0].dead_letter_queue, workflows.name, workflows.workflows[0].name,
      read(root, 'apps/scheduled/wrangler.jsonc').name, read(root, 'apps/realtime/wrangler.jsonc').name];
    for (const identifier of identifiers) assert.match(identifier, /^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/, identifier);
    assert.equal(api.queues.producers[0].queue, jobs.queues.producers[0].queue);
    assert.equal(api.queues.producers[0].queue, jobs.queues.consumers[0].queue);
    assert.match(readFileSync(path.join(root, 'apps/api/src/index.ts'), 'utf8'), new RegExp(`title: ${JSON.stringify(name)}`));
    manifests.push(identifiers);
  }
  for (let i = 0; i < manifests.length; i++) for (let j = i + 1; j < manifests.length; j++) {
    assert.equal(manifests[i].some(identifier => manifests[j].includes(identifier)), false, 'Normalized/truncated project names must remain distinguishable');
  }
}));

test('initializer retries a dead staging process and recovers partial commit without losing client ignore rules', async () => temporary(async (temporaryRoot) => {
  const crashed = path.join(temporaryRoot, 'crashed');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { parseStandardOptions, scaffoldStandardProject } from ${JSON.stringify(moduleUrl)};
    await scaffoldStandardProject(parseStandardOptions('new', [${JSON.stringify(crashed)}, '--hono', '--no-git', '--skip-install']), () => process.exit(24));
  `], { encoding: 'utf8' });
  assert.equal(result.status, 24, result.stderr);
  assert.ok(existsSync(path.join(crashed, '.anhedral.lock')));
  await scaffoldStandardProject(options(crashed, '--hono'), runner);
  assert.ok(existsSync(path.join(crashed, 'apps/api/src/index.ts')));
  assert.equal(existsSync(path.join(crashed, '.anhedral.lock')), false);
  assert.equal(existsSync(path.join(crashed, '.anhedral-txn')), false);

  const partial = path.join(temporaryRoot, 'partial');
  const token = '2147483647-22222222-2222-4222-8222-222222222222';
  const stageRoot = path.join(partial, '.anhedral-txn', `stage-${token}`);
  const backupRoot = path.join(partial, '.anhedral-txn', `backup-${token}`);
  mkdirSync(stageRoot, { recursive: true }); mkdirSync(backupRoot, { recursive: true });
  const ignoreBackup = path.join(backupRoot, '.gitignore');
  writeFileSync(ignoreBackup, 'client-private-data/\n');
  const installed = path.join(partial, 'package.json');
  writeFileSync(installed, '{"name":"interrupted"}\n');
  const contents = readFileSync(installed);
  const fingerprint = createHash('sha256').update(`file\0.\0${lstatSync(installed).mode & 0o7777}\0${contents.length}\0`).update(contents).digest('hex');
  writeFileSync(path.join(partial, '.anhedral.lock'), JSON.stringify({ version: 1, pid: 2147483647, hostname: hostname(), token, createdAt: new Date().toISOString() }));
  writeFileSync(path.join(partial, '.anhedral-journal.json'), JSON.stringify({ version: 2, stageRoot, backupRoot, createdDirectories: [], entries: [
    { relativePath: '.gitignore', backupPath: ignoreBackup, installed: false, installedFingerprint: null },
    { relativePath: 'package.json', backupPath: null, installed: true, installedFingerprint: fingerprint },
  ] }));
  await scaffoldStandardProject(options(partial, '--hono'), runner);
  assert.match(readFileSync(path.join(partial, '.gitignore'), 'utf8'), /client-private-data\//);
  assert.equal(read(partial, 'package.json').name, 'partial');
  assert.equal(existsSync(path.join(partial, '.anhedral-journal.json')), false);

  const occupied = path.join(temporaryRoot, 'occupied'); mkdirSync(occupied);
  writeFileSync(path.join(occupied, 'keep.txt'), 'keep exactly\n');
  await assert.rejects(scaffoldStandardProject(options(occupied, '--hono'), () => assert.fail('Occupied destination must not invoke tools')), /must be empty/);
  assert.deepEqual(readdirSync(occupied), ['keep.txt']);
  assert.equal(readFileSync(path.join(occupied, 'keep.txt'), 'utf8'), 'keep exactly\n');
}));

test('desktop readiness bounds requests that never reply', async () => temporary(async root => {
  await scaffoldDesktop(root, { projectName: 'desktop', displayName: 'Desktop' });
  const source = readFileSync(path.join(root, 'apps/desktop/scripts/dev.mjs'), 'utf8');
  const probe = source.slice(source.indexOf('async function isServerReady'), source.indexOf('const vite ='));
  const sourceForTest = `import assert from 'node:assert/strict';
    globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    ${probe}
    const keeper = setInterval(() => {}, 1000);
    const before = Date.now();
    try { await assert.rejects(waitForServer({ exitCode: null }, 'http://127.0.0.1:1234', 50), /Timed out/); assert.ok(Date.now() - before < 1500); }
    finally { clearInterval(keeper); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', sourceForTest], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.status, 0, result.stderr);
}));

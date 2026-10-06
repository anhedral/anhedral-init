import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  checkReleasePolicy,
  isValidSemver,
  validateGeneratorVersion,
  validateReleaseDeclaration,
  validateWorkflowPolicy,
} from '../scripts/check-release-policy.mjs';
import {
  compareStableVersions,
  resolveReleaseVersion,
  prepareAutomaticRelease,
} from '../scripts/prepare-auto-release.mjs';
import { scanTarball, scanText } from '../scripts/secret-scanner.mjs';
import { resolveSpawnCommand } from '../scripts/spawn-command.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-release-tooling-'));

function runScript(script, args = [], env = {}) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function sha512Sri(contents) {
  return `sha512-${createHash('sha512').update(contents).digest('base64')}`;
}

function artifactMetadata(contents, overrides = {}) {
  return {
    schemaVersion: 1,
    name: 'anhedral',
    version: '1.2.3',
    filename: 'anhedral-1.2.3.tgz',
    integrity: sha512Sri(contents),
    shasum: createHash('sha1').update(contents).digest('hex'),
    size: contents.length,
    unpackedSize: contents.length,
    entryCount: 1,
    files: ['package.json'],
    ...overrides,
  };
}

function writeMetadata(directory, metadata) {
  mkdirSync(directory, { recursive: true });
  const metadataPath = path.join(directory, 'metadata.json');
  writeFileSync(metadataPath, `${JSON.stringify(metadata)}\n`);
  return metadataPath;
}

function makeTarEntry(name, contents) {
  const data = Buffer.from(contents);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

try {
  for (const extension of ['jsonc', 'toml', 'svg']) {
    const credential = `gh${'p_'}${'x'.repeat(36)}`;
    assert.equal(scanText(`config.${extension}`, Buffer.from(credential))[0]?.pattern, 'github-token');
  }
  assert.deepEqual(resolveSpawnCommand('npm', ['pack'], { platform: 'linux' }), {
    command: 'npm',
    args: ['pack'],
  });
  const nodeTools = mkdtempSync(path.join(tmpdir(), 'anhedral node & tools-'));
  try {
    const npmEntry = path.join(nodeTools, 'node_modules/npm/bin/npm-cli.js');
    mkdirSync(path.dirname(npmEntry), { recursive: true });
    writeFileSync(npmEntry, '');
    const args = ['pack', 'literal&argument'];
    assert.deepEqual(resolveSpawnCommand('npm.cmd', args, { platform: 'win32', searchPath: nodeTools }), {
      command: process.execPath,
      args: [npmEntry, ...args],
    });
    const cliEntry = path.join(nodeTools, 'node_modules/anhedral/dist/bin.js');
    mkdirSync(path.dirname(cliEntry), { recursive: true });
    writeFileSync(cliEntry, '');
    assert.deepEqual(resolveSpawnCommand(path.join(nodeTools, 'node_modules/.bin/anhedral.cmd'), args, { platform: 'win32' }), {
      command: process.execPath,
      args: [cliEntry, ...args],
    });
    assert.throws(() => resolveSpawnCommand('unknown.cmd', args, { platform: 'win32' }), /No direct Node entry/);
  } finally {
    rmSync(nodeTools, { recursive: true, force: true });
  }

  assert.equal(isValidSemver('0.2.0'), true);
  assert.equal(isValidSemver('1.0.0-rc.1'), true);
  assert.equal(isValidSemver('1.0'), false);
  assert.equal(isValidSemver('01.0.0'), false);
  assert.equal(isValidSemver('1.0.0-01'), false);
  assert.equal(compareStableVersions('0.4.1', '0.4.0') > 0, true);
  assert.equal(compareStableVersions('1.0.0', '0.99.99') > 0, true);
  assert.deepEqual(resolveReleaseVersion('0.4.0', '0.4.0'), {
    version: '0.4.1',
    automatic: true,
  });
  assert.deepEqual(resolveReleaseVersion('0.5.0', '0.4.0'), {
    version: '0.5.0',
    automatic: false,
  });
  assert.deepEqual(resolveReleaseVersion('0.4.0', '0.4.0', false), {
    version: '0.4.0',
    automatic: false,
  });
  assert.throws(
    () => resolveReleaseVersion('0.3.0', '0.4.0'),
    /behind npm version/,
  );
  assert.deepEqual(validateReleaseDeclaration({ version: '2.3.4' }), []);
  assert.match(validateReleaseDeclaration({ version: '2.3' }).join('\n'), /SemVer/);
  assert.deepEqual(validateGeneratorVersion(
    { version: '2.3.4' },
    "export const GENERATOR_VERSION = '2.3.4';\n",
  ), []);
  assert.match(validateGeneratorVersion(
    { version: '2.3.4' },
    "export const GENERATOR_VERSION = '2.3.3';\n",
  ).join('\n'), /does not match package\.json/);
  const preparationRoot = path.join(temporaryRoot, 'preparation');
  mkdirSync(path.join(preparationRoot, 'src'), { recursive: true });
  writeFileSync(path.join(preparationRoot, 'package.json'), JSON.stringify({ version: '0.4.0' }));
  writeFileSync(path.join(preparationRoot, 'src/version.ts'), "export const GENERATOR_VERSION = '0.4.0';\n");
  assert.deepEqual(prepareAutomaticRelease(preparationRoot, '0.4.0'), { version: '0.4.1', automatic: true });
  assert.equal(JSON.parse(readFileSync(path.join(preparationRoot, 'package.json'), 'utf8')).version, '0.4.1');
  assert.deepEqual(validateGeneratorVersion(
    { version: '0.4.1' }, readFileSync(path.join(preparationRoot, 'src/version.ts'), 'utf8'),
  ), []);
  assert.deepEqual(checkReleasePolicy(repoRoot), []);

  const workflowPolicyRoot = path.join(temporaryRoot, 'workflow-policy');
  const workflowPolicyDirectory = path.join(workflowPolicyRoot, '.github', 'workflows');
  mkdirSync(workflowPolicyDirectory, { recursive: true });
  const releaseWorkflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'release.yml'), 'utf8');
  const releaseOnMainWorkflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'release-on-main.yml'), 'utf8');
  writeFileSync(path.join(workflowPolicyDirectory, 'release-on-main.yml'), releaseOnMainWorkflow);
  writeFileSync(
    path.join(workflowPolicyDirectory, 'ci.yml'),
    readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8'),
  );
  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace('npm publish "./.artifacts/release/$TARBALL"', 'npm publish ".artifacts/release/$TARBALL"'),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /explicit local \.artifacts\/release tarball path/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace('      id-token: write\n', '      id-token: read\n'),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /publish job must grant id-token=write/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace('          registry-url: https://registry.npmjs.org\n', ''),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /configure the npm registry for OIDC/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace('          TARBALL: ${{ needs.verify.outputs.tarball }}', '          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n          TARBALL: ${{ needs.verify.outputs.tarball }}'),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /without long-lived npm credentials/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace('  workflow_call:\n', '  workflow_call:\n  workflow_dispatch:\n'),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /dispatched through release-on-main\.yml/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace("  RELEASE_NODE_VERSION: '24.18.0'", "  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true\n  RELEASE_NODE_VERSION: '24.18.0'"),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /temporary force override/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace(
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
    ),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /upload-artifact must use the reviewed Node\.js 24 pin/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace(
      'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
    ),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /download-artifact must use the reviewed Node\.js 24 pin/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace('          METADATA=".artifacts/release/metadata.json"\n', ''),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /attach \.artifacts\/release\/metadata\.json/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace('              --draft \\\n', ''),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /attach \.artifacts\/release\/metadata\.json/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replaceAll('gh release edit "$TAG" --draft=false', 'gh release edit "$TAG" --draft=true'),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /attach \.artifacts\/release\/metadata\.json/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release.yml'),
    releaseWorkflow.replace('          cmp "$ASSET" "$DOWNLOAD_DIR/$TARBALL"\n', ''),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /attach \.artifacts\/release\/metadata\.json/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release-on-main.yml'),
    releaseOnMainWorkflow.replaceAll('gh workflow run ci.yml --ref "$RELEASE_BRANCH"', 'printf "CI not dispatched"'),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /reviewed release PR with explicitly dispatched CI/);

  writeFileSync(
    path.join(workflowPolicyDirectory, 'release-on-main.yml'),
    releaseOnMainWorkflow.replaceAll('gh pr create', 'printf'),
  );
  assert.match(validateWorkflowPolicy(workflowPolicyRoot).join('\n'), /reviewed release PR with explicitly dispatched CI/);

  const token = ['ghp', '_', 'A'.repeat(32)].join('');
  const clerkSecret = ['sk', '_test_', 'B'.repeat(28)].join('');
  const r2Secret = ['C'.repeat(20), 'D'.repeat(20)].join('');
  const credentialedDatabaseUrl = [
    'postgresql', '://', 'app_owner', ':', 'LongSyntheticCredential123', '@', 'db.internal', '/app',
  ].join('');
  assert.deepEqual(scanText('safe.env.example', Buffer.from('TOKEN=replace-me\n')), []);
  assert.deepEqual(
    scanText('safe.env.example', Buffer.from('AUTH_SECRET=replace-with-at-least-32-random-characters\n')),
    [],
  );
  assert.deepEqual(
    scanText('safe.env.example', Buffer.from('ADMIN_AUTH_SECRET=replace-with-a-different-32-character-random-secret\n')),
    [],
  );
  const demoPlaceholder = 'local-demo-' + 'internal-token-for-development-only';
  assert.deepEqual(scanText('demo/.env.example', Buffer.from(`INTERNAL_TOKEN=${demoPlaceholder}\n`)), []);
  assert.ok(scanText('demo/.env', Buffer.from(`INTERNAL_TOKEN=${demoPlaceholder}\n`)).length > 0);
  const maintainerEmail = ['maintainer', 'package.invalid'].join('@');
  assert.deepEqual(scanText('pnpm-lock.yaml', Buffer.from(`    deprecated: Contact ${maintainerEmail}\n`)), []);
  assert.ok(scanText('pnpm-lock.yaml', Buffer.from(`secret: ${maintainerEmail}\n`)).length > 0);
  const localHomePath = ['', 'Users', 'local-developer', 'project', 'output.log'].join('/');
  const personalEmail = ['project-owner', 'private-domain.dev'].join('@');
  assert.equal(
    scanText('debug.txt', Buffer.from(`${localHomePath}\n`))[0].pattern,
    'local-home-path',
  );
  assert.equal(
    scanText('notes.md', Buffer.from(`Contact ${personalEmail}\n`))[0].pattern,
    'email-address',
  );
  assert.deepEqual(
    scanText('CONTRIBUTORS.md', Buffer.from('Contributor <12345+user@users.noreply.github.com>\n')),
    [],
  );
  assert.deepEqual(
    scanText('example.md', Buffer.from('Placeholder <developer@example.com>\n')),
    [],
  );
  assert.equal(scanText('fixture.txt', Buffer.from(`TOKEN=${token}\n`))[0].pattern, 'github-token');
  assert.ok(scanText('clerk.env', Buffer.from(`CLERK_SECRET_KEY=${clerkSecret}\n`)).some((finding) => finding.pattern === 'clerk-secret-key'));
  assert.ok(scanText('r2.env', Buffer.from(`R2_SECRET_ACCESS_KEY=${r2Secret}\n`)).some((finding) => finding.pattern === 'credential-assignment'));
  assert.ok(scanText('database.env', Buffer.from(`DATABASE_URL=${credentialedDatabaseUrl}\n`))
    .some((finding) => finding.pattern === 'credentialed-database-uri'));
  assert.deepEqual(scanText('database.env.example', Buffer.from('DATABASE_URL=postgresql://user:pass@localhost/app\n')), []);

  const tarball = path.join(temporaryRoot, 'secret.tgz');
  writeFileSync(tarball, gzipSync(Buffer.concat([
    makeTarEntry('package/README.md', `token=${token}\n`),
    Buffer.alloc(1024),
  ])));
  assert.equal(scanTarball(tarball)[0].path, 'package/README.md');

  const artifactRoot = path.join(temporaryRoot, 'artifact');
  const contents = Buffer.from('deterministic artifact');
  const metadata = artifactMetadata(contents);
  const metadataPath = writeMetadata(artifactRoot, metadata);
  writeFileSync(path.join(artifactRoot, metadata.filename), contents);
  assert.equal(runScript('verify-release-artifact.mjs', [metadataPath]).status, 0);

  writeFileSync(path.join(artifactRoot, metadata.filename), Buffer.from('tampered artifact'));
  assert.notEqual(runScript('verify-release-artifact.mjs', [metadataPath]).status, 0);
  writeFileSync(path.join(artifactRoot, metadata.filename), contents);

  writeMetadata(artifactRoot, artifactMetadata(contents, { filename: '../escape.tgz' }));
  assert.notEqual(runScript('verify-release-artifact.mjs', [metadataPath]).status, 0);
  writeMetadata(artifactRoot, artifactMetadata(contents, { version: '01.2.3' }));
  assert.notEqual(runScript('verify-release-artifact.mjs', [metadataPath]).status, 0);
  writeMetadata(artifactRoot, metadata);

  const fakeNpm = path.join(temporaryRoot, 'fake-npm.mjs');
  const fakeState = path.join(temporaryRoot, 'fake-state.txt');
  writeFileSync(fakeNpm, `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const responses = JSON.parse(process.env.FAKE_NPM_RESPONSES);
const statePath = process.env.FAKE_NPM_STATE;
const index = existsSync(statePath) ? Number(readFileSync(statePath, 'utf8')) : 0;
writeFileSync(statePath, String(index + 1));
const response = responses[Math.min(index, responses.length - 1)];
if (response.kind === 'found') { console.log(JSON.stringify(response.integrity)); process.exit(0); }
if (response.kind === 'missing') { console.error('npm ERR! code E404'); process.exit(1); }
console.error(response.message || 'registry unavailable'); process.exit(response.status || 2);
`);
  chmodSync(fakeNpm, 0o755);
  const registryMetadata = path.join(temporaryRoot, 'registry-metadata.json');
  writeFileSync(registryMetadata, `${JSON.stringify(metadata)}\n`);
  const registryEnv = (responses) => {
    writeFileSync(fakeState, '0');
    return {
      ANHEDRAL_NPM_COMMAND: process.execPath,
      ANHEDRAL_NPM_ARGS_PREFIX: JSON.stringify([fakeNpm]),
      ANHEDRAL_REGISTRY_VERIFY_ATTEMPTS: '3',
      ANHEDRAL_REGISTRY_VERIFY_DELAY_MS: '0',
      FAKE_NPM_RESPONSES: JSON.stringify(responses),
      FAKE_NPM_STATE: fakeState,
    };
  };

  let registry = runScript('check-release-registry.mjs', ['preflight', registryMetadata], registryEnv([{ kind: 'missing' }]));
  assert.equal(registry.status, 0);
  assert.equal(registry.stdout.trim(), 'missing');

  registry = runScript('check-release-registry.mjs', ['preflight', registryMetadata], registryEnv([{ kind: 'found', integrity: metadata.integrity }]));
  assert.equal(registry.status, 0);
  assert.equal(registry.stdout.trim(), 'matching');

  registry = runScript('check-release-registry.mjs', ['preflight', registryMetadata], registryEnv([{ kind: 'found', integrity: 'sha512-wrong' }]));
  assert.notEqual(registry.status, 0);
  assert.match(registry.stderr, /different integrity/);

  registry = runScript('check-release-registry.mjs', ['preflight', registryMetadata], registryEnv([{ kind: 'error', message: 'offline' }]));
  assert.notEqual(registry.status, 0);
  assert.match(registry.stderr, /registry query failed/);

  registry = runScript('check-release-registry.mjs', ['verify', registryMetadata], registryEnv([
    { kind: 'missing' },
    { kind: 'found', integrity: metadata.integrity },
  ]));
  assert.equal(registry.status, 0);
  assert.equal(registry.stdout.trim(), 'matching');

  registry = runScript('check-release-registry.mjs', ['verify', registryMetadata], {
    ...registryEnv([{ kind: 'missing' }]),
    ANHEDRAL_REGISTRY_VERIFY_ATTEMPTS: '2',
  });
  assert.notEqual(registry.status, 0);
  assert.match(registry.stderr, /was not visible after 2/);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log('Release tooling negative-path tests passed');

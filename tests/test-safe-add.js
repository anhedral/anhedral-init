import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const { writeFile: writeGeneratedFile } = await import(
  pathToFileURL(path.join(repoRoot, 'dist', 'util.js')).href
);

function run(args, cwd, expectedStatus = 0) {
  const result = spawnSync('node', [cliEntry, ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, expectedStatus, `${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function fileHash(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const workspace = mkdtempSync(path.join(tmpdir(), 'anhedral-safe-add-'));
const project = path.join(workspace, 'safe-project');
mkdirSync(project);

try {
  if (process.platform !== 'win32') {
    const modePath = path.join(workspace, 'portable-mode.txt');
    const previousUmask = process.umask(0o077);
    try {
      writeGeneratedFile(modePath, 'generated\n');
    } finally {
      process.umask(previousUmask);
    }
    assert.equal(statSync(modePath).mode & 0o777, 0o644, 'new generated files must have a deterministic portable mode');
    chmodSync(modePath, 0o600);
    writeGeneratedFile(modePath, 'merged\n');
    assert.equal(statSync(modePath).mode & 0o777, 0o600, 'existing files must retain their selected mode');
  }

  run(['init', '--api', '--skip-install'], project);

  const initialManifest = JSON.parse(readFileSync(path.join(project, 'anhedral.json'), 'utf8'));
  assert.equal(initialManifest.schemaVersion, 4);
  assert.deepEqual(Object.keys(initialManifest.templates), ['api-fastify']);
  const manifestPath = path.join(project, 'anhedral.json');
  const currentManifestText = readFileSync(manifestPath, 'utf8');
  const incompatibleManifestText = JSON.stringify({
    ...initialManifest,
    generatorVersion: '0.0.0',
  }, null, 2) + '\n';
  const packageBeforeIncompatibleAdd = readFileSync(path.join(project, 'package.json'));
  writeFileSync(manifestPath, incompatibleManifestText);
  const incompatibleAdd = run(['add', 'desktop', '--skip-install'], project, 1);
  assert.match(incompatibleAdd.stderr, /only supports exact-current projects/);
  assert.equal(readFileSync(manifestPath, 'utf8'), incompatibleManifestText);
  assert.deepEqual(readFileSync(path.join(project, 'package.json')), packageBeforeIncompatibleAdd);
  assert.equal(existsSync(path.join(project, 'apps/desktop')), false);
  writeFileSync(manifestPath, currentManifestText);
  const initialManagedRecord = initialManifest.files['apps/api/src/application.ts'];
  assert.equal(
    initialManagedRecord.mode,
    process.platform === 'win32' ? null : 0o644,
    'fresh manifests must record normalized generated-file permission bits where Unix modes are supported',
  );
  const initialVercel = JSON.parse(readFileSync(path.join(project, 'vercel.json'), 'utf8'));
  assert.deepEqual(initialVercel.services, { api: { root: 'apps/api' } });
  assert.deepEqual(initialVercel.rewrites, [
    { source: '/api/(.*)', destination: { service: 'api' } },
  ]);

  assert.deepEqual(
    JSON.parse(readFileSync(path.join(project, 'turbo.json'), 'utf8')).tasks.build.outputs,
    ['.next/**', '!.next/cache/**', '.output/**', 'dist/**'],
    'Turbo must restore every generated application build-artifact namespace from cache',
  );

  assert.equal(readFileSync(path.join(project, 'pnpm-workspace.yaml'), 'utf8'), [
    'packages:',
    "  - 'apps/*'",
    "  - 'packages/*'",
    'autoInstallPeers: false',
    'overrides:',
    "  '@vitejs/plugin-react': '5.2.0'",
    "  'postcss': '8.5.19'",
    "  'esbuild@<=0.24.2': '0.25.12'",
    "  'esbuild@>=0.27.3 <0.28.1': '0.28.1'",
    "  'shell-quote@<=1.8.3': '1.8.4'",
    "  'tmp@<0.2.6': '0.2.7'",
    "  'uuid@<11.1.1': '11.1.1'",
    'onlyBuiltDependencies:',
    "  - 'electron'",
    "  - 'esbuild'",
    "  - 'sharp'",
    'ignoredBuiltDependencies:',
    "  - 'browser-tabs-lock'",
    "  - 'bufferutil'",
    "  - 'core-js'",
    "  - 'electron-winstaller'",
    "  - 'spawn-sync'",
    "  - 'utf-8-validate'",
    'peerDependencyRules:',
    '  ignoreMissing:',
    "    - '@solana/web3.js'",
    "    - 'bs58'",
    "    - 'react-native'",
    '  allowedVersions:',
    "    'esbuild': '>=0.25.0'",
    "    'utf-8-validate': '>=5.0.2'",
    '',
  ].join('\n'), 'fresh workspaces must contain the complete pnpm policy');

  const apiPackagePath = path.join(project, 'apps/api/package.json');
  const generatedRootPackage = JSON.parse(readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.equal(generatedRootPackage.engines.node, '^20.19.0 || >=22.12.0');
  assert.equal(generatedRootPackage.pnpm, undefined, 'pnpm-only settings belong in pnpm-workspace.yaml');
  const apiPackage = JSON.parse(readFileSync(apiPackagePath, 'utf8'));
  assert.equal(apiPackage.dependencies['@shared/db'], undefined);
  assert.equal(apiPackage.dependencies['@clerk/fastify'], undefined);
  assert.equal(apiPackage.dependencies['@aws-sdk/client-s3'], undefined);
  assert.equal(apiPackage.dependencies['drizzle-orm'], undefined);
  assert.equal(readFileSync(path.join(project, '.env.example'), 'utf8').includes('DATABASE_URL'), false);
  assert.throws(() => readFileSync(path.join(project, 'packages/db/package.json')));

  const mobileStorageProject = path.join(workspace, 'mobile-storage-project');
  mkdirSync(mobileStorageProject);
  run(['init', 'mobile', 'storage', '--skip-install'], mobileStorageProject);
  const mobileStoragePackage = JSON.parse(readFileSync(path.join(mobileStorageProject, 'package.json'), 'utf8'));
  assert.equal(mobileStoragePackage.engines.node, '^22.13.0 || ^24.3.0 || >=25');
  assert.match(
    readFileSync(path.join(mobileStorageProject, '.github/workflows/anhedral-ci.yml'), 'utf8'),
    /node-version: 22\.13\.0/,
  );
  assert.match(readFileSync(path.join(mobileStorageProject, '.env.example'), 'utf8'), /^CRON_SECRET=$/m);
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(mobileStorageProject, 'vercel.json'), 'utf8')).crons,
    [{ path: '/api/internal/storage/cleanup', schedule: '0 3 * * *' }],
  );
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(mobileStorageProject, 'vercel.json'), 'utf8')).rewrites,
    [{ source: '/api/(.*)', destination: { service: 'api' } }],
  );
  const productionGuide = readFileSync(path.join(mobileStorageProject, 'PRODUCTION.md'), 'utf8');
  assert.match(productionGuide, /CRON_SECRET/);
  assert.match(productionGuide, /R2 CORS/);
  assert.match(productionGuide, /AllowedMethods/);
  assert.match(productionGuide, /R2 lifecycle rule/);
  const storageSource = readFileSync(path.join(mobileStorageProject, 'apps/api/src/storage.ts'), 'utf8');
  assert.match(storageSource, /ContentLength: contentLength/);
  assert.match(storageSource, /signableHeaders: new Set\(\['content-type', 'content-length'\]\)/);
  assert.match(storageSource, /UPLOAD_CLEANUP_GRACE_MS = 10 \* 60 \* 1000/);
  assert.match(storageSource, /pg_advisory_xact_lock/);
  assert.match(storageSource, /isolationLevel: 'ReadCommitted'/);
  const apiClientSource = readFileSync(path.join(mobileStorageProject, 'packages/api-client/src/index.ts'), 'utf8');
  assert.match(apiClientSource, /body\.size !== upload\.signedContentLength/);
  assert.match(apiClientSource, /method: 'PUT', body, headers/);

  const fieldMergeProject = path.join(workspace, 'field-merge-project');
  mkdirSync(fieldMergeProject);
  run(['init', 'api', '--skip-install'], fieldMergeProject);
  const fieldMergePackagePath = path.join(fieldMergeProject, 'package.json');
  const fieldMergePackage = JSON.parse(readFileSync(fieldMergePackagePath, 'utf8'));
  fieldMergePackage.scripts['user:check'] = 'node user-check.js';
  fieldMergePackage.dependencies = { 'user-owned-package': '1.0.0' };
  writeFileSync(fieldMergePackagePath, JSON.stringify(fieldMergePackage, null, 2) + '\n');
  run(['add', 'mobile', '--skip-install'], fieldMergeProject);
  const fieldMergedPackage = JSON.parse(readFileSync(fieldMergePackagePath, 'utf8'));
  assert.equal(fieldMergedPackage.engines.node, '^22.13.0 || ^24.3.0 || >=25');
  assert.equal(fieldMergedPackage.scripts['user:check'], 'node user-check.js');
  assert.equal(fieldMergedPackage.dependencies['user-owned-package'], '1.0.0');

  const conflictingEngineProject = path.join(workspace, 'conflicting-engine-project');
  mkdirSync(conflictingEngineProject);
  run(['init', 'api', '--skip-install'], conflictingEngineProject);
  const conflictingEnginePackagePath = path.join(conflictingEngineProject, 'package.json');
  const conflictingEnginePackage = JSON.parse(readFileSync(conflictingEnginePackagePath, 'utf8'));
  conflictingEnginePackage.engines = { node: '>=26' };
  writeFileSync(conflictingEnginePackagePath, JSON.stringify(conflictingEnginePackage, null, 2) + '\n');
  const engineConflict = run(['add', 'mobile', '--skip-install'], conflictingEngineProject, 1);
  assert.match(String(engineConflict.stderr), /engines was user-modified/);
  assert.equal(existsSync(path.join(conflictingEngineProject, 'apps/mobile')), false);

  const readmePath = path.join(project, 'README.md');
  const customReadme = '# User-owned README\n\nDo not replace this.\n';
  writeFileSync(readmePath, customReadme);
  const rootPackagePath = path.join(project, 'package.json');
  const rootPackage = JSON.parse(readFileSync(rootPackagePath, 'utf8'));
  rootPackage.scripts['custom:check'] = 'node custom-check.js';
  rootPackage.dependencies = { 'user-owned-package': '1.0.0' };
  rootPackage.packageManager = 'pnpm@10.99.0';
  rootPackage.engines = { node: '>=26' };
  writeFileSync(rootPackagePath, JSON.stringify(rootPackage, null, 2) + '\n');
  const customWorkflow = path.join(project, '.github/workflows/custom.yml');
  writeFileSync(customWorkflow, 'name: User workflow\non: workflow_dispatch\njobs: {}\n');

  run(['add', 'desktop', '--skip-install'], project);
  assert.equal(readFileSync(readmePath, 'utf8'), customReadme);
  assert.equal(readFileSync(customWorkflow, 'utf8'), 'name: User workflow\non: workflow_dispatch\njobs: {}\n');
  const mergedPackage = JSON.parse(readFileSync(rootPackagePath, 'utf8'));
  assert.equal(mergedPackage.scripts['custom:check'], 'node custom-check.js');
  assert.equal(mergedPackage.dependencies['user-owned-package'], '1.0.0');
  assert.equal(mergedPackage.packageManager, 'pnpm@10.99.0', 'user-modified package metadata must be preserved');
  assert.deepEqual(mergedPackage.engines, { node: '>=26' }, 'user-modified runtime policy must be preserved');
  assert.ok(
    JSON.parse(readFileSync(path.join(project, 'anhedral.json'), 'utf8')).modules.includes('desktop'),
  );

  const manifestHash = fileHash(path.join(project, 'anhedral.json'));
  run(['add', 'desktop', '--skip-install'], project);
  assert.equal(fileHash(path.join(project, 'anhedral.json')), manifestHash, 'repeated add should be a no-op');

  const beforeDryRun = fileHash(path.join(project, 'anhedral.json'));
  const dryRun = run(['add', 'storage', '--skip-install', '--dry-run'], project);
  assert.match(String(dryRun.stdout), /add plan:/);
  assert.equal(fileHash(path.join(project, 'anhedral.json')), beforeDryRun, 'dry-run must not mutate the project');

  const managedApp = path.join(project, 'apps/api/src/application.ts');
  writeFileSync(managedApp, readFileSync(managedApp, 'utf8') + '\n// user modification\n');
  const beforeConflict = fileHash(path.join(project, 'anhedral.json'));
  const conflict = run(['add', 'auth', '--skip-install'], project, 1);
  assert.match(String(conflict.stderr), /Managed file has user modifications/);
  assert.equal(fileHash(path.join(project, 'anhedral.json')), beforeConflict, 'conflict must leave the manifest unchanged');

  const latestProject = path.join(workspace, 'latest-project');
  mkdirSync(latestProject);
  run(['init', '--api', '--toolchain', 'latest', '--skip-install'], latestProject);
  run(['add', 'desktop', '--skip-install'], latestProject);
  const latestManifest = JSON.parse(readFileSync(path.join(latestProject, 'anhedral.json'), 'utf8'));
  assert.equal(latestManifest.toolchain, 'latest', 'add should preserve the manifest toolchain channel by default');

  const peerConflictProject = path.join(workspace, 'peer-conflict-project');
  mkdirSync(peerConflictProject);
  run(['init', '--api', '--skip-install'], peerConflictProject);
  const peerConflictWorkspacePath = path.join(peerConflictProject, 'pnpm-workspace.yaml');
  writeFileSync(
    peerConflictWorkspacePath,
    readFileSync(peerConflictWorkspacePath, 'utf8').replace('autoInstallPeers: false', "'autoInstallPeers': TRUE # user policy"),
  );
  const peerConflictManifestHash = fileHash(path.join(peerConflictProject, 'anhedral.json'));
  const peerConflict = run(['add', 'desktop', '--skip-install'], peerConflictProject, 1);
  assert.match(String(peerConflict.stderr), /autoInstallPeers must be false/);
  assert.match(readFileSync(peerConflictWorkspacePath, 'utf8'), /'autoInstallPeers': TRUE # user policy/);
  assert.equal(
    fileHash(path.join(peerConflictProject, 'anhedral.json')),
    peerConflictManifestHash,
    'a user-owned peer-policy conflict must leave the manifest unchanged',
  );

  const ownedPeerPolicyProject = path.join(workspace, 'owned-peer-policy-project');
  mkdirSync(ownedPeerPolicyProject);
  run(['init', '--api', '--skip-install'], ownedPeerPolicyProject);
  const ownedPeerWorkspacePath = path.join(ownedPeerPolicyProject, 'pnpm-workspace.yaml');
  writeFileSync(
    ownedPeerWorkspacePath,
    readFileSync(ownedPeerWorkspacePath, 'utf8').replace('autoInstallPeers: false', '"autoInstallPeers": TRUE # generated policy'),
  );
  const ownedPeerManifestPath = path.join(ownedPeerPolicyProject, 'anhedral.json');
  const ownedPeerManifest = JSON.parse(readFileSync(ownedPeerManifestPath, 'utf8'));
  ownedPeerManifest.files['pnpm-workspace.yaml'].hash = fileHash(ownedPeerWorkspacePath);
  writeFileSync(ownedPeerManifestPath, JSON.stringify(ownedPeerManifest, null, 2) + '\n');
  run(['add', 'desktop', '--skip-install'], ownedPeerPolicyProject);
  assert.doesNotMatch(readFileSync(ownedPeerWorkspacePath, 'utf8'), /TRUE/);
  assert.match(readFileSync(ownedPeerWorkspacePath, 'utf8'), /"autoInstallPeers": false # generated policy/);

  const ownedMappingProject = path.join(workspace, 'owned-mapping-project');
  mkdirSync(ownedMappingProject);
  run(['init', '--web', '--skip-install'], ownedMappingProject);
  const ownedMappingWorkspacePath = path.join(ownedMappingProject, 'pnpm-workspace.yaml');
  writeFileSync(
    ownedMappingWorkspacePath,
    readFileSync(ownedMappingWorkspacePath, 'utf8')
      .replace(
        "    'esbuild': '>=0.25.0'",
        "    'esbuild': '>=0.20.0' # generated policy",
      )
      .replace("    'utf-8-validate': '>=5.0.2'\n", ''),
  );
  const ownedMappingManifestPath = path.join(ownedMappingProject, 'anhedral.json');
  const ownedMappingManifest = JSON.parse(readFileSync(ownedMappingManifestPath, 'utf8'));
  ownedMappingManifest.files['pnpm-workspace.yaml'].hash = fileHash(ownedMappingWorkspacePath);
  writeFileSync(ownedMappingManifestPath, JSON.stringify(ownedMappingManifest, null, 2) + '\n');
  run(['add', 'desktop', '--skip-install'], ownedMappingProject);
  assert.match(
    readFileSync(ownedMappingWorkspacePath, 'utf8'),
    /'esbuild': '>=0\.25\.0' # generated policy/,
  );
  assert.match(readFileSync(ownedMappingWorkspacePath, 'utf8'), /'utf-8-validate': '>=5\.0\.2'/);

  const mappingConflictProject = path.join(workspace, 'mapping-conflict-project');
  mkdirSync(mappingConflictProject);
  run(['init', '--web', '--skip-install'], mappingConflictProject);
  const mappingConflictWorkspacePath = path.join(mappingConflictProject, 'pnpm-workspace.yaml');
  writeFileSync(
    mappingConflictWorkspacePath,
    readFileSync(mappingConflictWorkspacePath, 'utf8').replace(
      "    'esbuild': '>=0.25.0'",
      "    'esbuild': '>=0.20.0' # user policy",
    ),
  );
  const mappingConflictManifestHash = fileHash(path.join(mappingConflictProject, 'anhedral.json'));
  const mappingConflict = run(['add', 'desktop', '--skip-install'], mappingConflictProject, 1);
  assert.match(
    String(mappingConflict.stderr),
    /peerDependencyRules\.allowedVersions: mapping entry esbuild differs from the generated value/,
  );
  assert.match(readFileSync(mappingConflictWorkspacePath, 'utf8'), />=0\.20\.0' # user policy/);
  assert.equal(
    fileHash(path.join(mappingConflictProject, 'anhedral.json')),
    mappingConflictManifestHash,
    'a conflicting user-owned pnpm mapping must leave the manifest unchanged',
  );

  const healthyProject = path.join(workspace, 'doctor-project');
  mkdirSync(healthyProject);
  run(['init', '--web', '--skip-install'], healthyProject);
  run(['doctor', '--json'], healthyProject);
  const orphanLockTemp = path.join(healthyProject, '.anhedral.lock.orphan.tmp');
  writeFileSync(orphanLockTemp, 'incomplete lock owner\n');
  const artifactDoctor = run(['doctor', '--json'], healthyProject, 1);
  const artifactReport = JSON.parse(artifactDoctor.stdout);
  assert.equal(artifactReport.ok, false);
  assert.ok(artifactReport.issues.some((issue) => issue.path === '.anhedral.lock.orphan.tmp'));
  rmSync(orphanLockTemp);
  const recordedFileReplacedByDirectory = path.join(healthyProject, 'apps/web/app/page.tsx');
  rmSync(recordedFileReplacedByDirectory);
  mkdirSync(recordedFileReplacedByDirectory);
  const nonRegularDoctor = run(['doctor', '--json'], healthyProject, 1);
  const nonRegularReport = JSON.parse(nonRegularDoctor.stdout);
  assert.ok(nonRegularReport.issues.some((issue) => (
    issue.path === 'apps/web/app/page.tsx'
      && issue.message === 'Recorded path is not a regular file.'
  )));

  const binaryIntegrityProject = path.join(workspace, 'binary-integrity-project');
  mkdirSync(binaryIntegrityProject);
  run(['init', '--api', '--skip-install'], binaryIntegrityProject);
  const binaryRelativePath = 'apps/api/src/application.ts';
  const binaryTarget = path.join(binaryIntegrityProject, binaryRelativePath);
  const binaryManifestPath = path.join(binaryIntegrityProject, 'anhedral.json');
  const binaryManifest = JSON.parse(readFileSync(binaryManifestPath, 'utf8'));
  binaryManifest.files[binaryRelativePath].hash = createHash('sha256')
    .update(Buffer.from([0x80]).toString('utf8'), 'utf8')
    .digest('hex');
  writeFileSync(binaryManifestPath, JSON.stringify(binaryManifest, null, 2) + '\n');
  writeFileSync(binaryTarget, Buffer.from([0x81]));
  const binaryDoctor = JSON.parse(run(['doctor', '--json'], binaryIntegrityProject, 1).stdout);
  assert.ok(binaryDoctor.issues.some((issue) => (
    issue.path === binaryRelativePath && issue.severity === 'error'
  )), 'doctor must not collapse distinct malformed byte sequences through UTF-8 replacement');
  const binaryAdd = run(['add', 'desktop', '--skip-install'], binaryIntegrityProject, 1);
  assert.match(binaryAdd.stderr, /Managed file has user modifications/);
  assert.deepEqual(readFileSync(binaryTarget), Buffer.from([0x81]), 'byte-level conflicts must not be overwritten');

  const modeOwnershipProject = path.join(workspace, 'mode-ownership-project');
  mkdirSync(modeOwnershipProject);
  run(['init', '--api', '--skip-install'], modeOwnershipProject);
  const modeManifestPath = path.join(modeOwnershipProject, 'anhedral.json');
  const modeRelativePath = 'apps/api/src/application.ts';
  const modeTarget = path.join(modeOwnershipProject, modeRelativePath);
  if (process.platform !== 'win32') {
    const beforeModeConflict = fileHash(modeManifestPath);
    chmodSync(modeTarget, 0o600);
    const modeDoctor = JSON.parse(run(['doctor', '--json'], modeOwnershipProject, 1).stdout);
    assert.ok(modeDoctor.issues.some((issue) => (
      issue.path === modeRelativePath
        && issue.severity === 'error'
        && issue.message.includes('file mode differs from its recorded mode')
    )), 'doctor must report managed-file permission drift');
    const modeAdd = run(['add', 'desktop', '--skip-install'], modeOwnershipProject, 1);
    assert.match(modeAdd.stderr, /Managed file mode has user modifications/);
    assert.equal(statSync(modeTarget).mode & 0o777, 0o600, 'a rejected add must not reset a user-changed mode');
    assert.equal(fileHash(modeManifestPath), beforeModeConflict, 'a mode conflict must leave the manifest unchanged');
    chmodSync(modeTarget, 0o644);
  }

  const mergeProject = path.join(workspace, 'merge-project');
  mkdirSync(mergeProject);
  const originalGitignore = [
    '# User-owned ignore rules',
    '',
    'node_modules',
    'custom-output/',
    '# Preserve intentional whitespace',
    '  spaced-entry  ',
    '',
  ].join('\r\n');
  const mergeGitignorePath = path.join(mergeProject, '.gitignore');
  writeFileSync(mergeGitignorePath, originalGitignore);
  if (process.platform !== 'win32') chmodSync(mergeGitignorePath, 0o600);
  run(['init', '--web', '--skip-install'], mergeProject);
  const generatedGitignore = readFileSync(mergeGitignorePath, 'utf8');
  if (process.platform !== 'win32') {
    assert.equal(statSync(mergeGitignorePath).mode & 0o777, 0o600, 'a seeded mergeable file must retain its user-selected mode');
  }
  assert.ok(generatedGitignore.startsWith(originalGitignore), 'init must preserve gitignore comments, blanks, whitespace, and CRLF formatting');
  assert.ok(generatedGitignore.endsWith([
    '.turbo',
    '.next',
    '.output',
    '.wxt',
    '.expo',
    'coverage',
    'dist',
    'release',
    '.env',
    '.env.*',
    '!.env.example',
    '*.tsbuildinfo',
    '',
  ].join('\r\n')));
  assert.equal(generatedGitignore.split(/\r\n|\n|\r/).filter((line) => line === 'node_modules').length, 1);

  const workspacePath = path.join(mergeProject, 'pnpm-workspace.yaml');
  const customWorkspace = [
    '# Workspace header',
    "'packages':",
    '  # Application packages',
    "  - 'apps/*'",
    "  - 'custom/*' # user workspace",
    '# User catalog must remain byte-for-byte',
    'catalog:',
    "  react: '19.1.0'",
    "'autoInstallPeers': false # user formatting",
    "'overrides':",
    "  'custom-package': '1.2.3'",
    "'onlyBuiltDependencies':",
    "  - 'custom-native'",
    "'ignoredBuiltDependencies':",
    "  - 'custom-ignored'",
    "'peerDependencyRules':",
    "  'ignoreMissing':",
    "    - 'custom-peer'",
    "  'allowedVersions':",
    "    'react': '19'",
    '',
  ].join('\n');
  writeFileSync(workspacePath, customWorkspace);

  const turboPath = path.join(mergeProject, 'turbo.json');
  const customTurbo = JSON.parse(readFileSync(turboPath, 'utf8'));
  customTurbo.tasks.build.env = ['CUSTOM_BUILD_ENV'];
  customTurbo.tasks.dev.cache = true;
  customTurbo.tasks.lint = { outputs: ['reports/**'] };
  customTurbo.ui = 'stream';
  writeFileSync(turboPath, JSON.stringify(customTurbo, null, 2) + '\n');

  const vercelPath = path.join(mergeProject, 'vercel.json');
  const customVercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
  customVercel.services.web.root = 'apps/custom-web';
  customVercel.services.preview = { root: 'apps/preview' };
  customVercel.rewrites.push({ source: '/preview/(.*)', destination: { service: 'preview' } });
  customVercel.customTopLevel = { enabled: true };
  writeFileSync(vercelPath, JSON.stringify(customVercel, null, 2) + '\n');

  run(['add', 'auth', '--skip-install'], mergeProject);
  const mergedWorkspaceAfterAuth = readFileSync(workspacePath, 'utf8');
  assert.match(mergedWorkspaceAfterAuth, /# Workspace header/);
  assert.match(mergedWorkspaceAfterAuth, /# User catalog must remain byte-for-byte\ncatalog:\n  react: '19\.1\.0'/);
  assert.match(mergedWorkspaceAfterAuth, /  - 'custom\/\*' # user workspace/);
  assert.match(mergedWorkspaceAfterAuth, /  - 'packages\/\*'/);

  function assertCustomStructuredConfigSurvives(expectedGeneratedValues) {
    const mergedWorkspace = readFileSync(workspacePath, 'utf8');
    for (const preservedEntry of [
      "'custom-package': '1.2.3'",
      "- 'custom-native'",
      "- 'custom-ignored'",
      "- 'custom-peer'",
      "'react': '19'",
    ]) {
      assert.equal(
        mergedWorkspace.split(preservedEntry).length - 1,
        1,
        `custom workspace entry ${preservedEntry} must be preserved exactly once`,
      );
    }
    assert.match(mergedWorkspace, /'esbuild': '>=0\.25\.0'/);
    assert.match(mergedWorkspace, /'utf-8-validate': '>=5\.0\.2'/);

    const mergedTurbo = JSON.parse(readFileSync(turboPath, 'utf8'));
    assert.equal(mergedTurbo.tasks.dev.cache, expectedGeneratedValues.turboCache);
    assert.deepEqual(mergedTurbo.tasks.build.env, ['CUSTOM_BUILD_ENV']);
    assert.deepEqual(mergedTurbo.tasks.lint, { outputs: ['reports/**'] });
    assert.equal(mergedTurbo.ui, 'stream');

    const mergedVercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
    assert.equal(mergedVercel.services.web.root, expectedGeneratedValues.webRoot);
    assert.deepEqual(mergedVercel.services.preview, { root: 'apps/preview' });
    assert.deepEqual(mergedVercel.services.api, { root: 'apps/api' });
    assert.deepEqual(mergedVercel.rewrites, [
      { source: '/api/(.*)', destination: { service: 'api' } },
      { source: '/(.*)', destination: { service: 'web' } },
      { source: '/preview/(.*)', destination: { service: 'preview' } },
    ]);
    assert.deepEqual(mergedVercel.customTopLevel, { enabled: true });
  }

  assertCustomStructuredConfigSurvives({
    turboCache: true,
    webRoot: 'apps/custom-web',
  });

  run(['add', 'extension', '--skip-install'], mergeProject);
  assertCustomStructuredConfigSurvives({
    turboCache: true,
    webRoot: 'apps/custom-web',
  });
  run(['add', 'desktop', '--skip-install'], mergeProject);
  assertCustomStructuredConfigSurvives({
    turboCache: true,
    webRoot: 'apps/custom-web',
  });
  assert.equal(readFileSync(mergeGitignorePath, 'utf8'), generatedGitignore);
  if (process.platform !== 'win32') {
    assert.equal(statSync(mergeGitignorePath).mode & 0o777, 0o600, 'add must preserve a mergeable file mode');
  }
  assert.equal(readFileSync(workspacePath, 'utf8'), mergedWorkspaceAfterAuth);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log('Safe add and ownership regression tests passed');

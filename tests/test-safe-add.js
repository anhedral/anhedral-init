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
  assert.equal(initialManifest.schemaVersion, 5);
  assert.deepEqual(Object.keys(initialManifest.templates), ['api-fastify']);
  const initialSkill = readFileSync(path.join(project, 'SKILL.md'), 'utf8');
  assert.match(initialSkill, /^---\nname: anhedral-project\n/);
  assert.match(initialSkill, /Resolved modules: `api`\./);
  assert.doesNotMatch(initialSkill, /apps\/desktop/);
  assert.equal(initialManifest.files['SKILL.md'].ownership, 'managed');
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
    "  'adm-zip@<0.6.0': '0.6.0'",
    "  '@vitejs/plugin-react': '5.2.0'",
    "  'postcss': '8.5.19'",
    "  'esbuild@<=0.24.2': '0.25.12'",
    "  'esbuild@>=0.27.3 <0.28.1': '0.28.1'",
    "  'shell-quote@<=1.8.4': '1.10.0'",
    "  'sharp@<0.35.0': '0.35.3'",
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
  assert.equal(generatedRootPackage.devDependencies.vercel, undefined);
  assert.equal(generatedRootPackage.devDependencies.neonctl, undefined);
  assert.equal(generatedRootPackage.devDependencies.wrangler, undefined);
  assert.equal(generatedRootPackage.scripts['deploy:vercel:production'], 'pnpm dlx vercel@56.2.1 deploy --prod');
  assert.equal(generatedRootPackage.scripts['mobile:eas:login'], undefined);
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
  assert.equal(mobileStoragePackage.devDependencies.vercel, undefined);
  assert.equal(mobileStoragePackage.devDependencies.neonctl, undefined);
  assert.equal(mobileStoragePackage.devDependencies.wrangler, undefined);
  assert.equal(mobileStoragePackage.scripts['mobile:submit:ios'], 'pnpm --dir apps/mobile dlx eas-cli@21.0.1 submit --platform ios --profile production --latest');
  assert.equal(mobileStoragePackage.scripts['neon:project:create'], 'pnpm dlx neonctl@2.33.2 projects create');
  assert.equal(mobileStoragePackage.scripts['r2:bucket:create'], 'pnpm dlx wrangler@4.111.0 r2 bucket create mobile-storage-project-assets');
  assert.equal(mobileStoragePackage.scripts['r2:cors:list'], 'pnpm dlx wrangler@4.111.0 r2 bucket cors list mobile-storage-project-assets');
  assert.match(mobileStoragePackage.scripts['r2:cors:set'], /cloudflare\/r2-cors\.template\.json/);
  assert.equal(mobileStoragePackage.scripts['assets:proxy:deploy'], 'pnpm --filter ./apps/assets-private-proxy deploy');
  const generatedMobilePackage = JSON.parse(readFileSync(path.join(mobileStorageProject, 'apps/mobile/package.json'), 'utf8'));
  assert.equal(generatedMobilePackage.devDependencies['eas-cli'], undefined);
  assert.equal(generatedMobilePackage.scripts['submit:ios'], 'pnpm dlx eas-cli@21.0.1 submit --platform ios --profile production --latest');
  assert.match(
    readFileSync(path.join(mobileStorageProject, '.github/workflows/anhedral-ci.yml'), 'utf8'),
    /node-version: 22\.13\.0/,
  );
  assert.match(readFileSync(path.join(mobileStorageProject, '.env.example'), 'utf8'), /^CRON_SECRET=$/m);
  const rootEnvInventory = readFileSync(path.join(mobileStorageProject, '.env.example'), 'utf8');
  assert.match(rootEnvInventory, /^R2_BUCKET_NAME=$/m);
  assert.match(rootEnvInventory, /^R2_PREFIX=storage$/m);
  assert.doesNotMatch(rootEnvInventory, /^R2_BUCKET=/m);
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
  assert.match(productionGuide, /cloudflare\/r2-cors\.template\.json/);
  assert.match(productionGuide, /complete live policy/);
  assert.match(productionGuide, /R2 lifecycle rule/);
  assert.match(productionGuide, /Presigned URLs do \*\*not\*\* work on custom domains/);
  assert.match(productionGuide, /TestFlight Beta App Review/);
  assert.match(productionGuide, /Google Play Console/);
  assert.match(productionGuide, /GoDaddy/);
  assert.match(productionGuide, /DNS only/);
  assert.match(productionGuide, /assets-private-proxy/);
  assert.match(productionGuide, /storage\/confirmed\//);
  assert.match(productionGuide, /authenticated private reads/i);
  const proxyDirectory = path.join(mobileStorageProject, 'apps/assets-private-proxy');
  const proxyConfig = readFileSync(path.join(proxyDirectory, 'wrangler.jsonc'), 'utf8');
  const proxySource = readFileSync(path.join(proxyDirectory, 'src/index.js'), 'utf8');
  assert.match(proxyConfig, /"name": "assets-private-proxy"/);
  assert.match(proxyConfig, /"workers_dev": false/);
  assert.match(proxyConfig, /"binding": "ASSETS"/);
  assert.match(proxyConfig, /"bucket_name": "mobile-storage-project-assets"/);
  assert.match(proxyConfig, /"custom_domain": true/);
  assert.match(proxyConfig, /"R2_PREFIX": "storage"/);
  assert.match(proxySource, /private Anhedral R2 bucket/);
  assert.match(proxySource, /env\.ASSETS\.get/);
  assert.match(proxySource, /publicPrefix/);
  assert.match(proxySource, /generation-inputs/);
  const corsTemplatePath = path.join(mobileStorageProject, 'cloudflare/r2-cors.template.json');
  assert.deepEqual(JSON.parse(readFileSync(corsTemplatePath, 'utf8')).rules[0].allowed.methods, ['GET', 'HEAD', 'PUT']);
  const storageManifest = JSON.parse(readFileSync(path.join(mobileStorageProject, 'anhedral.json'), 'utf8'));
  assert.equal(storageManifest.files['apps/assets-private-proxy/wrangler.jsonc'].ownership, 'user');
  assert.equal(storageManifest.files['cloudflare/r2-cors.template.json'].ownership, 'user');
  const proxySyntax = spawnSync('node', ['--check', 'src/index.js'], { cwd: proxyDirectory, encoding: 'utf8' });
  assert.equal(proxySyntax.status, 0, proxySyntax.stderr);
  const storageSource = readFileSync(path.join(mobileStorageProject, 'apps/api/src/storage.ts'), 'utf8');
  assert.match(storageSource, /ContentLength: contentLength/);
  assert.match(storageSource, /signableHeaders: new Set\(\['content-type', 'content-length'\]\)/);
  assert.match(storageSource, /UPLOAD_CLEANUP_GRACE_MS = 10 \* 60 \* 1000/);
  assert.match(storageSource, /pg_advisory_xact_lock/);
  assert.match(storageSource, /isolationLevel: 'ReadCommitted'/);
  assert.match(storageSource, /env\.R2_PREFIX/);
  assert.match(storageSource, /R2_PROXY_READ_URL_TTL_SECONDS/);
  const apiEnvExample = readFileSync(path.join(mobileStorageProject, 'apps/api/.env.example'), 'utf8');
  for (const name of ['BASE_URL', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PREFIX', 'R2_PROXY_READ_URL_TTL_SECONDS', 'CLOUDFLARE_API_TOKEN']) {
    assert.match(apiEnvExample, new RegExp(`^${name}=`, 'm'));
  }
  const apiClientSource = readFileSync(path.join(mobileStorageProject, 'packages/api-client/src/generated.ts'), 'utf8');
  assert.match(apiClientSource, /body\.size !== upload\.signedContentLength/);
  assert.match(apiClientSource, /method: 'PUT', body, headers/);
  assert.match(apiClientSource, /getUploadReadUrl/);
  const mobileApiRootPackage = JSON.parse(readFileSync(path.join(mobileStorageProject, 'package.json'), 'utf8'));
  assert.equal(
    mobileApiRootPackage.scripts.dev,
    'turbo dev --parallel --filter=./apps/mobile --filter=./apps/api',
    'the primary loop must start the selected client and its API together',
  );
  assert.equal(mobileApiRootPackage.scripts['dev:all'], undefined);

  const extensionSeamProject = path.join(workspace, 'extension-seam-project');
  mkdirSync(extensionSeamProject);
  run(['init', 'web', 'api', 'db', '--skip-install'], extensionSeamProject);
  const seamManifest = JSON.parse(readFileSync(path.join(extensionSeamProject, 'anhedral.json'), 'utf8'));
  for (const relativePath of [
    'apps/web/app/page.tsx',
    'apps/api/src/routes/app.ts',
    'packages/contracts/src/app.ts',
    'packages/api-client/src/app.ts',
    'packages/db/src/app-schema.ts',
  ]) {
    assert.equal(seamManifest.files[relativePath].ownership, 'user', `${relativePath} must be an explicit extension seam`);
  }
  for (const relativePath of [
    'apps/api/src/routes.ts',
    'packages/contracts/src/generated.ts',
    'packages/api-client/src/generated.ts',
    'packages/db/src/generated-schema.ts',
  ]) {
    assert.equal(seamManifest.files[relativePath].ownership, 'managed', `${relativePath} must remain generated substrate`);
  }
  const seamFiles = [
    'apps/web/app/page.tsx',
    'apps/api/src/routes/app.ts',
    'packages/contracts/src/app.ts',
    'packages/api-client/src/app.ts',
    'packages/db/src/app-schema.ts',
  ];
  const seamContents = Object.fromEntries(seamFiles.map((relativePath) => {
    const target = path.join(extensionSeamProject, relativePath);
    const content = `${readFileSync(target, 'utf8')}\n// product-owned customization: ${relativePath}\n`;
    writeFileSync(target, content);
    return [relativePath, content];
  }));
  run(['add', 'billing', '--skip-install'], extensionSeamProject);
  for (const [relativePath, content] of Object.entries(seamContents)) {
    assert.equal(
      readFileSync(path.join(extensionSeamProject, relativePath), 'utf8'),
      content,
      `feature add must preserve product code at ${relativePath}`,
    );
  }
  assert.match(
    readFileSync(path.join(extensionSeamProject, 'packages/db/src/generated-schema.ts'), 'utf8'),
    /export const subscriptions/,
  );
  assert.match(
    readFileSync(path.join(extensionSeamProject, 'packages/contracts/src/generated.ts'), 'utf8'),
    /SubscriptionChangedEventSchema/,
  );
  assert.match(
    readFileSync(path.join(extensionSeamProject, 'apps/api/src/routes.ts'), 'utf8'),
    /\/subscriptions\/me/,
  );
  const seamDoctor = JSON.parse(run(['doctor', '--json'], extensionSeamProject).stdout);
  assert.equal(seamDoctor.ok, true);

  const upgradeProject = path.join(workspace, 'upgrade-project');
  mkdirSync(upgradeProject);
  run(['init', 'web', 'api', '--skip-install'], upgradeProject);
  const upgradeManifestPath = path.join(upgradeProject, 'anhedral.json');
  const upgradeManifest = JSON.parse(readFileSync(upgradeManifestPath, 'utf8'));
  upgradeManifest.generatorVersion = '0.3.0';
  writeFileSync(upgradeManifestPath, JSON.stringify(upgradeManifest, null, 2) + '\n');
  const upgradePage = path.join(upgradeProject, 'apps/web/app/page.tsx');
  const customUpgradePage = `${readFileSync(upgradePage, 'utf8')}\n// survives the 0.4 ownership migration\n`;
  writeFileSync(upgradePage, customUpgradePage);
  const beforeUpgradeDryRun = readFileSync(upgradeManifestPath, 'utf8');
  const upgradeDryRun = JSON.parse(run(['upgrade', '--skip-install', '--dry-run', '--json'], upgradeProject).stdout);
  assert.equal(upgradeDryRun.operation, 'upgrade');
  assert.ok(upgradeDryRun.paths.includes('anhedral.json'));
  assert.equal(readFileSync(upgradeManifestPath, 'utf8'), beforeUpgradeDryRun, 'upgrade dry-run must not mutate the project');
  run(['upgrade', '--skip-install'], upgradeProject);
  const upgradedManifest = JSON.parse(readFileSync(upgradeManifestPath, 'utf8'));
  assert.equal(upgradedManifest.generatorVersion, '0.4.0');
  assert.equal(upgradedManifest.files['apps/web/app/page.tsx'].ownership, 'user');
  assert.equal(readFileSync(upgradePage, 'utf8'), customUpgradePage);
  assert.match(readFileSync(path.join(upgradeProject, 'packages/contracts/src/index.ts'), 'utf8'), /\.\/generated/);
  const currentUpgrade = JSON.parse(run(['upgrade', '--skip-install', '--json'], upgradeProject).stdout);
  assert.deepEqual(currentUpgrade, { operation: 'upgrade', paths: [] });

  const updaterProject = path.join(workspace, 'updater-project');
  mkdirSync(updaterProject);
  run(['init', 'desktop', '--skip-install'], updaterProject);
  assert.equal(existsSync(path.join(updaterProject, 'apps/desktop-updater-worker')), false);
  const updaterWindowPath = path.join(updaterProject, 'apps/desktop/src/main/app-window.ts');
  const customUpdaterWindow = `${readFileSync(updaterWindowPath, 'utf8')}\n// product-specific desktop window customization\n`;
  writeFileSync(updaterWindowPath, customUpdaterWindow);
  run(['add', 'electron-updater', '--skip-install'], updaterProject);
  assert.equal(readFileSync(updaterWindowPath, 'utf8'), customUpdaterWindow);
  const updaterManifestPath = path.join(updaterProject, 'anhedral.json');
  const updaterManifest = JSON.parse(readFileSync(updaterManifestPath, 'utf8'));
  assert.deepEqual(updaterManifest.modules, ['desktop', 'electron-updater']);
  assert.equal(updaterManifest.files['apps/desktop-updater-worker/wrangler.jsonc'].ownership, 'user');
  assert.equal(updaterManifest.files['apps/desktop/src/main/app-window.ts'].ownership, 'user');
  assert.equal(updaterManifest.files['apps/desktop/src/main/main.ts'].ownership, 'managed');
  assert.equal(updaterManifest.files['apps/desktop/electron-builder.env.example'].ownership, 'managed');
  assert.match(
    readFileSync(path.join(updaterProject, 'apps/desktop/src/main/main.ts'), 'utf8'),
    /from '\.\/app-window\.js'/,
    'the NodeNext Electron entrypoint must import the emitted JavaScript extension',
  );
  const updaterRootPackage = JSON.parse(readFileSync(path.join(updaterProject, 'package.json'), 'utf8'));
  assert.equal(
    updaterRootPackage.scripts['desktop:updates:bucket:create'],
    'pnpm dlx wrangler@4.111.0 r2 bucket create updater-project-desktop-updates',
  );
  assert.equal(
    updaterRootPackage.scripts['desktop:updates:first-provision'],
    'pnpm desktop:updates:bucket:create && pnpm desktop:updates:worker:deploy',
  );
  assert.equal(
    updaterRootPackage.scripts['desktop:updates:publish'],
    'node apps/desktop/scripts/publish-updates.mjs',
  );
  const updaterDesktopPackage = JSON.parse(readFileSync(path.join(updaterProject, 'apps/desktop/package.json'), 'utf8'));
  assert.equal(updaterDesktopPackage.dependencies['electron-updater'], '6.8.9');
  assert.equal(updaterDesktopPackage.scripts['build:mac'], 'pnpm build && electron-builder --mac --publish never');
  assert.deepEqual(updaterDesktopPackage.build.publish, [{
    provider: 'generic',
    url: '${env.DESKTOP_UPDATE_BASE_URL}/releases/${os}/${arch}',
    useMultipleRangeRequest: false,
  }]);
  const updaterMain = readFileSync(path.join(updaterProject, 'apps/desktop/src/main/main.ts'), 'utf8');
  assert.match(updaterMain, /checkForUpdatesAndNotify/);
  assert.match(updaterMain, /app\.isPackaged/);
  const updaterWorkerConfig = readFileSync(path.join(updaterProject, 'apps/desktop-updater-worker/wrangler.jsonc'), 'utf8');
  assert.match(updaterWorkerConfig, /"bucket_name": "updater-project-desktop-updates"/);
  assert.match(updaterWorkerConfig, /"pattern": "updates\.example\.com", "custom_domain": true/);
  assert.match(updaterWorkerConfig, /"workers_dev": false/);
  const updaterWorkerSource = readFileSync(path.join(updaterProject, 'apps/desktop-updater-worker/src/index.js'), 'utf8');
  assert.match(updaterWorkerSource, /method !== "GET" && method !== "HEAD"/);
  assert.match(updaterWorkerSource, /env\.UPDATES\.get/);
  assert.match(updaterWorkerSource, /content-range/);
  const updaterPublisher = readFileSync(path.join(updaterProject, 'apps/desktop/scripts/publish-updates.mjs'), 'utf8');
  assert.match(updaterPublisher, /name\.includes\('-' \+ arch \+ '\.'\)/);
  assert.ok(
    updaterPublisher.indexOf("name === metadataName") < updaterPublisher.indexOf("Publish immutable artifacts first"),
  );
  const updaterGuide = readFileSync(path.join(updaterProject, 'cloudflare/desktop-updates.md'), 'utf8');
  assert.match(updaterGuide, /updater-project-desktop-updates/);
  assert.match(updaterGuide, /desktop:updates:first-provision/);
  const updaterWorkerSyntax = spawnSync('node', ['--check', 'src/index.js'], {
    cwd: path.join(updaterProject, 'apps/desktop-updater-worker'),
    encoding: 'utf8',
  });
  assert.equal(updaterWorkerSyntax.status, 0, updaterWorkerSyntax.stderr);
  const updaterWorkerBehavior = spawnSync('node', ['--test', 'tests/worker.test.js'], {
    cwd: path.join(updaterProject, 'apps/desktop-updater-worker'),
    encoding: 'utf8',
  });
  assert.equal(updaterWorkerBehavior.status, 0, updaterWorkerBehavior.stderr);
  const updaterPublisherSyntax = spawnSync('node', ['--check', 'apps/desktop/scripts/publish-updates.mjs'], {
    cwd: updaterProject,
    encoding: 'utf8',
  });
  assert.equal(updaterPublisherSyntax.status, 0, updaterPublisherSyntax.stderr);
  const updaterReleaseDirectory = path.join(updaterProject, 'apps/desktop/release');
  mkdirSync(updaterReleaseDirectory, { recursive: true });
  for (const name of [
    'updater-project-0.1.0-arm64.dmg',
    'updater-project-0.1.0-arm64.dmg.blockmap',
    'updater-project-0.1.0-x64.dmg',
    'latest-mac.yml',
  ]) {
    writeFileSync(path.join(updaterReleaseDirectory, name), name);
  }
  const uploadLog = path.join(workspace, 'desktop-update-uploads.jsonl');
  const fakeUploader = path.join(workspace, 'fake-desktop-update-uploader.mjs');
  writeFileSync(fakeUploader, `import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.UPLOAD_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');\n`);
  const updaterPublish = spawnSync('node', [
    'apps/desktop/scripts/publish-updates.mjs',
    '--platform',
    'mac',
    '--arch',
    'arm64',
  ], {
    cwd: updaterProject,
    encoding: 'utf8',
    env: {
      ...process.env,
      ANHEDRAL_DESKTOP_UPDATE_UPLOAD_COMMAND: process.execPath,
      ANHEDRAL_DESKTOP_UPDATE_UPLOAD_ARGS_PREFIX: JSON.stringify([fakeUploader]),
      UPLOAD_LOG: uploadLog,
    },
  });
  assert.equal(updaterPublish.status, 0, updaterPublish.stderr);
  const uploadArguments = readFileSync(uploadLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(uploadArguments.length, 3);
  assert.ok(uploadArguments.every((args) => args[5].includes('/releases/mac/arm64/')));
  assert.ok(uploadArguments.every((args) => !args[5].includes('-x64.')));
  assert.match(uploadArguments.at(-1)[5], /latest-mac\.yml$/);
  assert.equal(uploadArguments.at(-1).at(-1), '--cache-control=no-store');
  assert.ok(uploadArguments.slice(0, -1).every((args) => args.at(-1).includes('immutable')));
  const updaterManifestHash = fileHash(updaterManifestPath);
  run(['add', 'electron-updater', '--skip-install'], updaterProject);
  assert.equal(fileHash(updaterManifestPath), updaterManifestHash, 'repeated updater add should be a no-op');

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
  assert.match(readFileSync(path.join(project, 'SKILL.md'), 'utf8'), /Desktop lives in `apps\/desktop`/);

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

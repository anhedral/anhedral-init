import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { scaffoldAdmin } from '../dist/templates/admin.js';
import { scaffoldApi } from '../dist/templates/api.js';
import { generatedFirstRunScript } from '../dist/templates/first-run.js';
import { scaffoldSharedPackages } from '../dist/templates/shared.js';
import { scaffoldWeb } from '../dist/templates/web.js';

function options(adminMode) {
  return {
    projectName: 'authjs-admin',
    displayName: 'Auth.js Admin',
    apps: {
      web: true,
      admin: adminMode === 'app',
      mobile: false,
      api: true,
      desktop: false,
      extension: false,
    },
    features: {
      database: true,
      auth: true,
      realtime: false,
      billing: false,
      storage: false,
      workflows: false,
      nativeSubscriptions: false,
      electronUpdater: false,
    },
    infrastructure: {
      ubuntu: false,
      docker: false,
      postgres: false,
      nginx: false,
      certbot: false,
    },
    authProvider: 'authjs',
    adminMode,
    nativeStyling: 'nativewind',
    skipInstall: true,
  };
}

function read(root, relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function assertTypeScriptParses(root, relativePath) {
  const source = read(root, relativePath);
  const result = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors, [], `${relativePath} must be syntactically valid TypeScript`);
}

const pageRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-authjs-page-'));
const appRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-authjs-app-'));

try {
  for (const [root, mode] of [[pageRoot, 'page'], [appRoot, 'app']]) {
    const project = options(mode);
    scaffoldSharedPackages(root, project);
    await scaffoldApi(root, project);
    await scaffoldWeb(root, project);
    await scaffoldAdmin(root, project);
  }

  const webPackage = JSON.parse(read(pageRoot, 'apps/web/package.json'));
  assert.equal(webPackage.dependencies['next-auth'], '5.0.0-beta.32');
  assert.equal(webPackage.dependencies['@clerk/nextjs'], undefined);
  assert.equal(webPackage.dependencies['@shared/db'], 'workspace:*');
  assert.match(read(pageRoot, 'apps/web/app/(auth)/auth.ts'), /Credentials\(/);
  assert.doesNotMatch(read(pageRoot, 'apps/web/app/(auth)/auth.ts'), /^import \{ db, users \}/m);
  assert.match(read(pageRoot, 'apps/web/app/(auth)/auth.ts'), /import\('@shared\/db'\)/);
  assert.match(read(pageRoot, 'apps/web/app/(auth)/auth.ts'), /user\.status !== 'active'/);
  assert.match(read(pageRoot, 'apps/web/app/(auth)/auth.ts'), /consumeLoginRateLimit/);
  assert.match(read(pageRoot, 'apps/web/app/(auth)/auth.ts'), /authjs\.web\.session-token/);
  assert.match(read(pageRoot, 'apps/web/lib/auth-rate-limit.ts'), /onConflictDoUpdate/);
  assert.match(read(pageRoot, 'apps/web/app/api/backend/[...path]/route.ts'), /setExpirationTime\('60s'\)/);
  assert.match(read(pageRoot, 'apps/api/src/auth.ts'), /timingSafeEqual/);
  assert.match(read(pageRoot, 'packages/db/src/generated-schema.ts'), /isPlatformAdmin/);
  assert.match(read(pageRoot, 'packages/db/src/create-user.ts'), /--admin/);
  assert.equal(existsSync(path.join(pageRoot, 'apps/web/app/(admin)/admin/page.tsx')), true);
  assert.equal(existsSync(path.join(pageRoot, 'apps/admin')), false);

  const adminPackage = JSON.parse(read(appRoot, 'apps/admin/package.json'));
  assert.equal(adminPackage.dependencies['next-auth'], '5.0.0-beta.32');
  assert.equal(adminPackage.dependencies['@clerk/nextjs'], undefined);
  assert.match(read(appRoot, 'apps/admin/app/(auth)/auth.ts'), /!user\.isPlatformAdmin/);
  assert.match(read(appRoot, 'apps/admin/app/(auth)/auth.ts'), /admin-email:/);
  assert.match(read(appRoot, 'apps/admin/app/(auth)/auth.ts'), /ADMIN_AUTH_SECRET/);
  assert.doesNotMatch(read(appRoot, 'apps/admin/app/(auth)/auth.ts'), /^import \{ db, users \}/m);
  assert.match(read(appRoot, 'apps/admin/app/(auth)/auth.ts'), /import\('@shared\/db'\)/);
  assert.match(read(appRoot, 'apps/admin/app/(auth)/auth.ts'), /authjs\.admin\.session-token/);
  assert.match(read(appRoot, 'apps/admin/lib/authz.ts'), /requireAdmin/);
  assert.equal(existsSync(path.join(appRoot, 'apps/admin/app/(admin)/admin/page.tsx')), true);
  assert.equal(existsSync(path.join(appRoot, 'apps/web/app/(admin)/admin/page.tsx')), false);
  assert.match(generatedFirstRunScript(options('app')), /apps\/admin\/\.env\.local/);
  assert.match(read(appRoot, 'apps/api/tests/auth.test.ts'), /Auth\.js API bridge authentication/);

  for (const [root, files] of [
    [pageRoot, [
      'apps/web/app/(auth)/auth.ts',
      'apps/web/app/(auth)/sign-in/page.tsx',
      'apps/web/app/(admin)/admin/page.tsx',
      'apps/web/app/api/backend/[...path]/route.ts',
      'apps/api/src/auth.ts',
    ]],
    [appRoot, [
      'apps/admin/app/(auth)/auth.ts',
      'apps/admin/app/(auth)/sign-in/page.tsx',
      'apps/admin/app/(admin)/admin/page.tsx',
      'apps/admin/lib/authz.ts',
    ]],
  ]) {
    for (const file of files) assertTypeScriptParses(root, file);
  }
} finally {
  rmSync(pageRoot, { recursive: true, force: true });
  rmSync(appRoot, { recursive: true, force: true });
}

console.log('Auth.js and admin scaffold tests passed');

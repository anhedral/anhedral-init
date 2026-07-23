import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { scaffoldApi } from '../dist/templates/api.js';
import { scaffoldSharedPackages } from '../dist/templates/shared.js';

function options(database) {
  return {
    projectName: database ? 'operational-db-api' : 'operational-stateless-api',
    displayName: database ? 'Operational DB API' : 'Operational Stateless API',
    apps: { web: false, mobile: false, api: true, desktop: false, extension: false },
    features: {
      database,
      auth: false,
      billing: false,
      storage: false,
      nativeSubscriptions: false,
    },
    skipInstall: true,
  };
}

function read(root, relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function assertValidTypeScript(source, fileName) {
  const output = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  });
  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(errors, [], `generated syntax error in ${fileName}`);
}

const databaseRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-operational-db-'));
const statelessRoot = mkdtempSync(path.join(tmpdir(), 'anhedral-operational-stateless-'));

try {
  scaffoldSharedPackages(databaseRoot, options(true));
  await scaffoldApi(databaseRoot, options(true));
  await scaffoldApi(statelessRoot, options(false));

  const databaseApplication = read(databaseRoot, 'apps/api/src/application.ts');
  assert.match(databaseApplication, /import \{ sqlClient \} from '@shared\/db'/);
  assert.match(databaseApplication, /const CRITICAL_DEPENDENCY_TIMEOUT_MS = 2_000/);
  assert.match(databaseApplication, /await Promise\.race\(\[/);
  assert.match(databaseApplication, /timeout\.unref\(\)/);
  assert.match(databaseApplication, /if \(timeout\) clearTimeout\(timeout\)/);
  assert.match(databaseApplication, /return 'unavailable'/);
  assert.match(databaseApplication, /return 'shutting_down'/);
  assert.match(databaseApplication, /err: failure/);
  assert.match(databaseApplication, /requestId: request\.id/);
  assert.match(databaseApplication, /'critical_dependency_readiness_failed'/);

  const statelessApplication = read(statelessRoot, 'apps/api/src/application.ts');
  assert.doesNotMatch(statelessApplication, /sqlClient|CRITICAL_DEPENDENCY_TIMEOUT_MS/);
  assert.match(
    statelessApplication,
    /dependencies\.checkReadiness \?\? \(async \(\) => undefined\)/,
  );

  const databaseCoverage = read(databaseRoot, 'apps/api/vitest.config.ts');
  const statelessCoverage = read(statelessRoot, 'apps/api/vitest.config.ts');
  assert.match(databaseCoverage, /branches: 55/);
  assert.match(statelessCoverage, /branches: 45/);

  const entrypoint = read(databaseRoot, 'apps/api/src/index.ts');
  assert.match(entrypoint, /const SHUTDOWN_DEADLINE_MS = 10_000/);
  assert.match(entrypoint, /app\.beginShutdown\(\)/);
  assert.match(entrypoint, /graceful_shutdown_deadline_exceeded/);
  assert.match(entrypoint, /process\.exit\(1\)/);
  assert.match(entrypoint, /clearTimeout\(deadline\)/);

  const healthTests = read(databaseRoot, 'apps/api/tests/health.test.ts');
  assert.match(healthTests, /status: 'ready'/);
  assert.match(healthTests, /status: 'unavailable'/);
  assert.match(healthTests, /status: 'shutting_down'/);

  const contracts = read(databaseRoot, 'packages/contracts/src/generated.ts');
  assert.match(contracts, /ReadinessResponseSchema = z\.discriminatedUnion\('status'/);
  assert.match(contracts, /ok: z\.literal\(true\).*status: z\.literal\('ready'\)/s);
  assert.match(contracts, /ok: z\.literal\(false\).*'unavailable', 'shutting_down'/s);

  for (const [root, label] of [[databaseRoot, 'database'], [statelessRoot, 'stateless']]) {
    for (const relativePath of [
      'apps/api/src/application.ts',
      'apps/api/src/index.ts',
      'apps/api/src/routes.ts',
      'apps/api/tests/health.test.ts',
    ]) {
      assertValidTypeScript(read(root, relativePath), `${label}/${relativePath}`);
    }
  }
} finally {
  rmSync(databaseRoot, { recursive: true, force: true });
  rmSync(statelessRoot, { recursive: true, force: true });
}

console.log('Operational API template tests passed');

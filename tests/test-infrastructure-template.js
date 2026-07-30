import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const root = mkdtempSync(path.join(tmpdir(), 'anhedral-infrastructure-'));

try {
  const project = path.join(root, 'vps-app');
  const generated = spawnSync(process.execPath, [
    cliEntry,
    'new',
    project,
    '--next',
    '--fastify',
    '--postgres',
    '--ubuntu',
    '--docker',
    '--nginx',
    '--certbot',
    '--skip-install',
    '--no-git',
    '--json',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(generated.status, 0, generated.stderr);
  const report = JSON.parse(generated.stdout);
  assert.deepEqual(report.requestedModules, [
    'web',
    'api',
    'ubuntu',
    'docker',
    'postgres',
    'nginx',
    'certbot',
  ]);
  assert.deepEqual(report.dependencyAddedModules, ['db']);

  const manifest = JSON.parse(readFileSync(path.join(project, 'anhedral.json'), 'utf8'));
  assert.deepEqual(manifest.modules, [
    'web',
    'api',
    'db',
    'ubuntu',
    'docker',
    'postgres',
    'nginx',
    'certbot',
  ]);
  assert.equal(manifest.files['deploy/anhedral-provision.json'].owner, 'ubuntu');
  assert.equal(manifest.files['deploy/README.md'].ownership, 'user');
  assert.equal(manifest.files['deploy/vps/setup.sh'].owner, 'ubuntu');
  assert.equal(manifest.files['scripts/provision-plan.mjs'].owner, 'ubuntu');

  const planPath = path.join(project, 'deploy', 'anhedral-provision.json');
  assert.equal(existsSync(planPath), true);
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  assert.equal(plan.mode, 'plan-only');
  assert.equal(plan.safety.mutatesRemoteHost, false);
  assert.equal(plan.safety.commandHistoryReplayAllowed, false);
  assert.deepEqual(plan.products, ['ubuntu', 'docker', 'postgres', 'nginx', 'certbot']);
  assert.deepEqual(
    plan.phases.map((phase) => phase.id),
    ['host-baseline', 'container-runtime', 'postgres-runtime', 'reverse-proxy', 'tls-lifecycle'],
  );
  assert.match(
    plan.phases.find((phase) => phase.id === 'container-runtime').approvalGates.join('\n'),
    /DOCKER-USER/,
  );
  assert.match(
    plan.phases.find((phase) => phase.id === 'postgres-runtime').verification.join('\n'),
    /restore/i,
  );

  const packageJson = JSON.parse(readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['provision:plan'], 'node scripts/provision-plan.mjs');
  assert.equal(packageJson.scripts['vps:setup:check'], 'bash deploy/vps/setup.sh --check');
  assert.equal(packageJson.scripts['vps:setup'], 'bash deploy/vps/setup.sh --apply');
  assert.equal(packageJson.scripts['neon:project:create'], undefined);
  assert.match(
    readFileSync(path.join(project, 'packages/db/.env.example'), 'utf8'),
    /@postgres:5432\/app/,
  );
  const databasePackage = JSON.parse(readFileSync(path.join(project, 'packages/db/package.json'), 'utf8'));
  assert.equal(databasePackage.dependencies.postgres, '3.4.5');
  assert.equal(databasePackage.dependencies['@neondatabase/serverless'], undefined);
  assert.match(
    readFileSync(path.join(project, 'packages/db/src/index.ts'), 'utf8'),
    /drizzle-orm\/postgres-js/,
  );
  assert.match(
    readFileSync(path.join(project, 'packages/db/src/migrate.ts'), 'utf8'),
    /drizzle-orm\/postgres-js\/migrator/,
  );
  assert.doesNotMatch(
    readFileSync(path.join(project, 'README.md'), 'utf8'),
    /intentionally does not generate or start local Postgres/,
  );

  const printedPlan = spawnSync(process.execPath, ['scripts/provision-plan.mjs', '--json'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(printedPlan.status, 0, printedPlan.stderr);
  assert.deepEqual(JSON.parse(printedPlan.stdout), plan);

  const rejectedApply = spawnSync(process.execPath, ['scripts/provision-plan.mjs', '--apply'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.notEqual(rejectedApply.status, 0);
  assert.match(rejectedApply.stderr, /remote apply is not implemented/);

  const setupScript = readFileSync(path.join(project, 'deploy/vps/setup.sh'), 'utf8');
  assert.match(setupScript, /PermitRootLogin prohibit-password/);
  assert.match(setupScript, /ufw default deny incoming/);
  assert.match(setupScript, /fail2ban/);
  assert.match(setupScript, /DOCKER-USER/);
  assert.match(setupScript, /net\.ipv4\.conf\.all\.accept_redirects = 0/);
  assert.match(setupScript, /docker compose .* config --quiet/);
  assert.match(setupScript, /Refusing SSH changes without ANHEDRAL_AUTHORIZED_KEYS_FILE/);

  const checkedSetup = spawnSync('bash', ['deploy/vps/setup.sh', '--check'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(checkedSetup.status, 0, checkedSetup.stderr);
  assert.match(checkedSetup.stdout, /Preflight only/);

  const checkedViaCli = spawnSync(process.execPath, [cliEntry, 'setup-vps', '--check'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(checkedViaCli.status, 0, checkedViaCli.stderr);
  assert.match(checkedViaCli.stdout, /Anhedral VPS bootstrap/);
  assert.match(checkedViaCli.stdout, /Preflight only/);

  const syntaxCheck = spawnSync('bash', ['-n', 'deploy/vps/setup.sh'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Infrastructure template tests passed');

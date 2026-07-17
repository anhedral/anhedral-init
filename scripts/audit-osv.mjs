import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { collectOsvFindings } from './osv-audit-core.mjs';
import { collectPnpmLockPackages } from './osv-packages.mjs';

const defaultLockfile = path.resolve(import.meta.dirname, '..', 'pnpm-lock.yaml');
const packages = [];

function addPackage(name, version) {
  if (!name || !version || version === 'workspace:*' || version.includes('(')) return;
  packages.push({ name, version });
}

function overridePackageName(selector) {
  const rangeSeparator = selector.lastIndexOf('@');
  return rangeSeparator > 0 ? selector.slice(0, rangeSeparator) : selector;
}

function collectLockfilePackages(lockfilePath) {
  const lockfile = readFileSync(lockfilePath, 'utf8');
  for (const { name, version } of collectPnpmLockPackages(lockfile, lockfilePath)) addPackage(name, version);
}

async function collectGeneratorPackages() {
  const dependenciesModule = path.resolve(import.meta.dirname, '..', 'dist', 'dependencies.js');
  if (!existsSync(dependenciesModule)) {
    throw new Error('Generator dependency audit requires dist/dependencies.js; run pnpm build first');
  }

  const { dependencyManifest } = await import(dependenciesModule);
  const manifest = dependencyManifest();
  const packageManagerSeparator = manifest.packageManager.lastIndexOf('@');
  if (packageManagerSeparator <= 0) throw new Error('Generator package manager is not an exact name@version pin');
  addPackage(
    manifest.packageManager.slice(0, packageManagerSeparator),
    manifest.packageManager.slice(packageManagerSeparator + 1),
  );

  for (const [name, version] of Object.entries(manifest.toolchain)) addPackage(name, version);
  for (const [groupName, group] of Object.entries(manifest)) {
    if (['verifiedAt', 'packageManager', 'toolchain'].includes(groupName) || typeof group !== 'object' || group === null) continue;
    const dependencyMaps = 'dependencies' in group || 'devDependencies' in group
      ? [group.dependencies, group.devDependencies]
      : [group];
    for (const dependencyMap of dependencyMaps) {
      for (const [name, version] of Object.entries(dependencyMap ?? {})) {
        addPackage(groupName === 'securityOverrides' ? overridePackageName(name) : name, version);
      }
    }
  }
}

const includeGenerator = process.argv.includes('--generator');
const lockfileArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
collectLockfilePackages(lockfileArgument ? path.resolve(process.cwd(), lockfileArgument) : defaultLockfile);
if (includeGenerator) await collectGeneratorPackages();

const uniquePackages = [...new Map(packages.map((entry) => [`${entry.name}@${entry.version}`, entry])).values()];
const OSV_ENDPOINT = 'https://api.osv.dev/v1/querybatch';
const MAX_ATTEMPTS = 4;
const OSV_CONCURRENCY = 4;

class NonRetryableOsvError extends Error {}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchOsvJson(operation, url, init = undefined) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        const error = new Error(`OSV ${operation} request failed with HTTP ${response.status}: ${detail}`);
        if (response.status < 500 && response.status !== 429) throw new NonRetryableOsvError(error.message);
        lastError = error;
      } else {
        return await response.json();
      }
    } catch (error) {
      if (error instanceof NonRetryableOsvError) throw error;
      lastError = error;
    }

    if (attempt < MAX_ATTEMPTS) {
      const delayMilliseconds = 1_000 * (2 ** (attempt - 1));
      console.error(`OSV ${operation} request attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ${delayMilliseconds / 1_000}s`);
      await wait(delayMilliseconds);
    }
  }

  throw new Error(`OSV ${operation} request failed after ${MAX_ATTEMPTS} attempts`, { cause: lastError });
}

async function queryOsv(batch) {
  return fetchOsvJson('audit', OSV_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      queries: batch.map(({ name, version }) => ({
        package: { ecosystem: 'npm', name },
        version,
      })),
    }),
  });
}

async function queryOsvAdvisory(id) {
  return fetchOsvJson('advisory', `https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`);
}

const findings = await collectOsvFindings(uniquePackages, {
  queryBatch: queryOsv,
  queryAdvisory: queryOsvAdvisory,
  concurrency: OSV_CONCURRENCY,
  onExcluded(finding) {
    console.warn(`OSV batch result excluded by detailed advisory ranges: ${finding.id}: ${finding.name}@${finding.version}`);
  },
});

if (findings.length > 0) {
  for (const finding of findings) console.error(`${finding.id}: ${finding.name}@${finding.version}`);
  throw new Error(`OSV reported ${findings.length} vulnerability finding${findings.length === 1 ? '' : 's'}`);
}

const auditScope = includeGenerator ? 'locked and generator' : 'locked';
console.log(`OSV audit passed for ${uniquePackages.length} unique ${auditScope} package versions`);

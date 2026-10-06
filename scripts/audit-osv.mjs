import { readFileSync } from 'node:fs';
import path from 'node:path';
import { collectOsvFindings } from './osv-audit-core.mjs';
import { collectPnpmLockPackages } from './osv-packages.mjs';

const defaultLockfile = path.resolve(import.meta.dirname, '..', 'pnpm-lock.yaml');
const packages = [];

function addPackage(name, version) {
  if (!name || !version || version === 'workspace:*' || version.includes('(')) return;
  packages.push({ name, version });
}

function collectLockfilePackages(lockfilePath) {
  const lockfile = readFileSync(lockfilePath, 'utf8');
  for (const { name, version } of collectPnpmLockPackages(lockfile, lockfilePath)) addPackage(name, version);
}

const lockfileArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
collectLockfilePackages(lockfileArgument ? path.resolve(process.cwd(), lockfileArgument) : defaultLockfile);
if (!lockfileArgument) {
  const source = readFileSync(new URL('../src/dependencies.ts', import.meta.url), 'utf8');
  for (const [, name, version] of source.matchAll(/"([^"\n]+)":\s*'(\d+\.\d+\.\d+)'/g)) addPackage(name, version);
  const eas = source.match(/EAS_CLI_VERSION = '(\d+\.\d+\.\d+)'/)?.[1];
  if (eas) addPackage('eas-cli', eas);
}

const uniquePackages = [...new Map(packages.map((entry) => [`${entry.name}@${entry.version}`, entry])).values()];
const OSV_ENDPOINT = 'https://api.osv.dev/v1/querybatch';
const MAX_ATTEMPTS = 4;
const OSV_CONCURRENCY = 4;

class NonRetryableOsvError extends Error {}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestOsvJson(operation, url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    const error = new Error(`OSV ${operation} request failed with HTTP ${response.status}: ${detail}`);
    if (response.status < 500 && response.status !== 429) throw new NonRetryableOsvError(error.message);
    throw error;
  } else {
    return await response.json();
  }
}

async function fetchOsvJson(operation, url, init = undefined) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestOsvJson(operation, url, init);
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
  const coordinates = findings.map((finding) => `${finding.id}: ${finding.name}@${finding.version}`);
  for (const coordinate of coordinates) console.error(coordinate);
  throw new Error(
    `OSV reported ${findings.length} vulnerability finding${findings.length === 1 ? '' : 's'}: ${coordinates.join(', ')}`,
  );
}

const auditScope = 'locked';
console.log(`OSV audit passed for ${uniquePackages.length} unique ${auditScope} package versions`);

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSyncPortable } from './spawn-command.mjs';

const mode = process.argv[2];
const metadataPath = path.resolve(process.argv[3] ?? 'release-artifact/metadata.json');

if (mode !== 'preflight' && mode !== 'verify') {
  throw new Error('Usage: check-release-registry.mjs <preflight|verify> [metadata-path]');
}

const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
const npmCache = mkdtempSync(path.join(tmpdir(), 'anhedral-registry-check-'));
const npmCommand = process.env.ANHEDRAL_NPM_COMMAND || (process.platform === 'win32' ? 'npm.cmd' : 'npm');
let npmArgsPrefix = [];
if (process.env.ANHEDRAL_NPM_ARGS_PREFIX) {
  npmArgsPrefix = JSON.parse(process.env.ANHEDRAL_NPM_ARGS_PREFIX);
  if (!Array.isArray(npmArgsPrefix) || npmArgsPrefix.some((entry) => typeof entry !== 'string')) {
    throw new Error('ANHEDRAL_NPM_ARGS_PREFIX must be a JSON array of strings');
  }
}
const registry = 'https://registry.npmjs.org';

function queryIntegrity() {
  const result = spawnSyncPortable(
    npmCommand,
    [...npmArgsPrefix,
      'view',
      `${metadata.name}@${metadata.version}`,
      'dist.integrity',
      '--json',
      '--prefer-online',
      `--registry=${registry}`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: npmCache,
      },
    },
  );
  const stdout = String(result.stdout ?? '').trim();
  const stderr = String(result.stderr ?? '').trim();

  if (result.status === 0) {
    let integrity = stdout;
    try {
      integrity = JSON.parse(stdout);
    } catch {
      // npm may return an unquoted scalar depending on its version.
    }
    return { state: 'found', integrity: String(integrity).trim() };
  }

  const combined = `${stdout}\n${stderr}`;
  if (/\bE404\b|404 No match found|"code"\s*:\s*"E404"/.test(combined)) {
    return { state: 'missing' };
  }

  throw new Error(`npm registry query failed for ${metadata.name}@${metadata.version}:\n${combined}`);
}

function assertMatching(result) {
  if (result.integrity !== metadata.integrity) {
    throw new Error(
      `${metadata.name}@${metadata.version} already exists with different integrity\n` +
      `local:  ${metadata.integrity}\nremote: ${result.integrity}`,
    );
  }
}

async function main() {
  if (mode === 'preflight') {
    const result = queryIntegrity();
    if (result.state === 'missing') {
      console.log('missing');
      return;
    }
    assertMatching(result);
    console.log('matching');
    return;
  }

  const attempts = Number.parseInt(process.env.ANHEDRAL_REGISTRY_VERIFY_ATTEMPTS ?? '6', 10);
  const delayMs = Number.parseInt(process.env.ANHEDRAL_REGISTRY_VERIFY_DELAY_MS ?? '10000', 10);
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 30) {
    throw new Error('ANHEDRAL_REGISTRY_VERIFY_ATTEMPTS must be an integer from 1 to 30');
  }
  if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 60_000) {
    throw new Error('ANHEDRAL_REGISTRY_VERIFY_DELAY_MS must be an integer from 0 to 60000');
  }
  let lastResult = { state: 'missing' };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResult = queryIntegrity();
    if (lastResult.state === 'found') {
      assertMatching(lastResult);
      console.log('matching');
      return;
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    `${metadata.name}@${metadata.version} was not visible after ${attempts} registry verification attempts`,
  );
}

try {
  await main();
} finally {
  rmSync(npmCache, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getOutputTreeScenario } from './support/scenarios.js';
import { runScenario } from './support/scenario-runner.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = path.join(repoRoot, 'dist', 'bin.js');
const schemaUrl = 'https://openapi.vercel.sh/vercel.json';

async function fetchSchema() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(schemaUrl, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`official Vercel schema returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error('Unable to load the official Vercel schema after three attempts', { cause: lastError });
}

function containsServiceDestination(node, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return false;
  seen.add(node);
  if (node.properties?.service?.type === 'string') return true;
  return Object.values(node).some((value) => containsServiceDestination(value, seen));
}

function validateServicesSubset(config, schema) {
  assert.equal(config.$schema, schemaUrl);
  assert.equal(schema.additionalProperties, false);
  for (const key of Object.keys(config)) {
    assert.ok(schema.properties[key], `official Vercel schema does not allow top-level ${key}`);
  }

  const servicesSchema = schema.properties.services;
  assert.ok(servicesSchema, 'official Vercel schema is missing current services support');
  assert.deepEqual(servicesSchema.additionalProperties.required, ['root']);
  assert.equal(servicesSchema.additionalProperties.additionalProperties, false);
  const serviceNamePattern = new RegExp(servicesSchema.propertyNames.pattern);
  for (const [name, service] of Object.entries(config.services ?? {})) {
    assert.match(name, serviceNamePattern);
    for (const required of servicesSchema.additionalProperties.required) {
      assert.ok(Object.hasOwn(service, required), `service ${name} is missing ${required}`);
    }
    for (const key of Object.keys(service)) {
      assert.ok(
        servicesSchema.additionalProperties.properties[key],
        `official Vercel schema does not allow services.${name}.${key}`,
      );
    }
  }

  assert.ok(containsServiceDestination(schema.properties.rewrites), 'official rewrites schema lacks service destinations');
  for (const rewrite of config.rewrites ?? []) {
    assert.equal(typeof rewrite.source, 'string');
    assert.equal(typeof rewrite.destination?.service, 'string');
    assert.ok(config.services?.[rewrite.destination.service], `rewrite targets unknown service ${rewrite.destination.service}`);
  }
  if (config.crons) {
    assert.ok(schema.properties.crons);
    for (const cron of config.crons) {
      assert.equal(typeof cron.path, 'string');
      assert.equal(typeof cron.schedule, 'string');
    }
  }
}

const workspace = mkdtempSync(path.join(tmpdir(), 'anhedral-vercel-schema-'));
try {
  const projectRoot = runScenario({
    cliEntry,
    scenario: getOutputTreeScenario('web-api-minimal'),
    workspaceRoot: workspace,
    skipInstall: true,
    log: false,
  });
  const config = JSON.parse(readFileSync(path.join(projectRoot, 'vercel.json'), 'utf8'));
  const schema = await fetchSchema();
  validateServicesSubset(config, schema);
  assert.deepEqual(config.services, {
    api: { root: 'apps/api' },
    web: { root: 'apps/web', framework: 'nextjs' },
  });
  assert.deepEqual(config.rewrites, [
    { source: '/api/(.*)', destination: { service: 'api' } },
    { source: '/(.*)', destination: { service: 'web' } },
  ]);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log('Generated Vercel Services config matches the live official schema subset');

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from '../dist/util.js';
import { inspectProject } from '../dist/readiness.js';

const profiles = { web: [], api: ['--hono', '--d1', '--better-auth', '--r2'], desktop: ['--electron'] };
const selected = process.argv[2] ? [process.argv[2]] : Object.keys(profiles);
const cli = path.resolve(import.meta.dirname, '../dist/bin.js');
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.NEXT_TELEMETRY_DISABLED = '1';
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
for (const profile of selected) {
  assert.ok(Object.hasOwn(profiles, profile), `Unknown core profile: ${profile}`);
  const temporary = mkdtempSync(path.join(tmpdir(), 'anhedral-core-'));
  const root = path.join(temporary, profile);
  try {
    console.log(`Generating and validating real ${profile} project`);
    execFile(process.execPath, [cli, 'new', root, ...profiles[profile], '--no-git'], temporary);
    assert.equal(inspectProject(root).localReady, true);
    execFile('pnpm', ['check'], root);
    if (profile === 'web') assert.ok(existsSync(path.join(root, 'apps/web/.open-next/worker.js')));
    if (profile === 'api') assert.ok(existsSync(path.join(root, 'apps/api/dist/index.js')));
    if (profile === 'desktop') {
      execFile('pnpm', ['exec', 'electron-builder', '--dir', '--publish', 'never', '--config.mac.identity=null'], path.join(root, 'apps/desktop'));
      assert.ok(readdirSync(path.join(root, 'apps/desktop/release')).length > 0);
    }
    console.log(`Real ${profile} project passed`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

import assert from 'node:assert/strict';
import { GENERATED_PROFILES } from './recipe-profiles.mjs';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { execFile } from '../dist/util.js';
import { inspectProject } from '../dist/readiness.js';

const profiles = GENERATED_PROFILES;
const selected = process.argv[2] ? [process.argv[2]] : Object.keys(profiles);
const cli = path.resolve(import.meta.dirname, '../dist/bin.js');
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.NEXT_TELEMETRY_DISABLED = '1';
process.env.EXPO_NO_TELEMETRY = '1';
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.ANHEDRAL_VERBOSE = '1';
for (const profile of selected) {
  assert.ok(Object.hasOwn(profiles, profile), `Unknown core profile: ${profile}`);
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'anhedral-core-')));
  const root = path.join(temporary, profile);
  try {
    if (process.platform === 'win32' && profile === 'web') {
      const result = spawnSync(process.execPath, [cli, 'new', root, ...profiles[profile], '--no-git'], { cwd: temporary, encoding: 'utf8' });
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Native Windows initialization is blocked.*WSL/);
      assert.equal(existsSync(root), false, 'The Windows guard must run before project writes');
      console.log('Native Windows bootstrap guard passed');
      continue;
    }
    console.log(`Generating and validating real ${profile} project`);
    execFile(process.execPath, [cli, 'new', root, ...profiles[profile], '--no-git', '--verbose'], temporary);
    assert.equal(inspectProject(root).localReady, true);
    if (profile === 'mobile') {
      execFile('pnpm', ['--dir', 'apps/mobile', 'exec', 'expo', 'install', '--check'], root);
    }
    execFile('pnpm', ['check'], root);
    if (profile === 'web') assert.ok(existsSync(path.join(root, 'apps/web/.open-next/worker.js')));
    if (profile === 'web' || profile === 'api') {
      const types = path.join(root, profile === 'web' ? 'apps/web/cloudflare-env.d.ts' : 'apps/api/worker-configuration.d.ts');
      execFile('pnpm', ['typecheck'], root);
      unlinkSync(types);
      const cached = spawnSync('pnpm', ['typecheck', '--summarize'], { cwd: root, encoding: 'utf8' });
      assert.equal(cached.status, 0, cached.stdout + cached.stderr);
      const appName = JSON.parse(readFileSync(path.join(path.dirname(types), 'package.json'), 'utf8')).name;
      const runs = path.join(root, '.turbo/runs');
      const summaries = readdirSync(runs).filter((file) => file.endsWith('.json'));
      assert.equal(summaries.length, 1, 'Only the cached run should have a summary');
      const summary = JSON.parse(readFileSync(path.join(runs, summaries[0]), 'utf8'));
      assert.equal(summary.tasks.find((task) => task.taskId === `${appName}#typecheck`)?.cache.status, 'HIT', 'The binding-type restoration must exercise a cache hit');
      assert.ok(existsSync(types), 'A warm Turbo cache must restore generated binding types');
    }
    if (profile === 'api') assert.ok(existsSync(path.join(root, 'apps/api/dist/index.js')));
    if (profile === 'extension' || profile === 'popup') assert.ok(existsSync(path.join(root, 'apps/extension/.output/chrome-mv3/manifest.json')));
    if (profile === 'single') {
      assert.ok(existsSync(path.join(root, 'dist/index.js')));
      assert.equal(/packages:/.test(readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8')), false);
      assert.equal(existsSync(path.join(root, 'apps')), false);
    }
    if (profile === 'mobile') assert.ok(existsSync(path.join(root, 'apps/mobile/dist/index.html')));
    if (profile === 'desktop') {
      execFile('pnpm', ['exec', 'electron-builder', '--dir', '--publish', 'never', '--config.mac.identity=null'], path.join(root, 'apps/desktop'));
      assert.ok(readdirSync(path.join(root, 'apps/desktop/release')).length > 0);
    }
    console.log(`Real ${profile} project passed`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

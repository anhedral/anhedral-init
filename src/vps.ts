import { lstatSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readManifest, hashContent } from './architecture/index.js';
import { GENERATOR_VERSION } from './version.js';

export type SetupVpsOptions = {
  readonly check: boolean;
};

export function setupVpsProject(options: SetupVpsOptions): void {
  const root = path.resolve(process.cwd());
  const manifestPath = path.join(root, 'anhedral.json');
  let manifestSource: string;
  try {
    manifestSource = readFileSync(manifestPath, 'utf8');
  } catch {
    throw new Error('anhedral.json was not found. Run setup-vps from an Anhedral project checkout.');
  }

  const manifest = readManifest(JSON.parse(manifestSource));
  if (manifest.generatorVersion !== GENERATOR_VERSION) {
    throw new Error(
      `Project generator ${manifest.generatorVersion} differs from CLI ${GENERATOR_VERSION}; run anhedral upgrade before setup-vps.`,
    );
  }
  if (!manifest.modules.includes('ubuntu')) {
    throw new Error('This project does not include the ubuntu infrastructure product.');
  }

  const relativeScript = 'deploy/vps/setup.sh';
  const record = manifest.files[relativeScript];
  if (!record || record.owner !== 'ubuntu' || record.ownership !== 'managed') {
    throw new Error(`${relativeScript} is not recorded as managed Ubuntu infrastructure.`);
  }

  const scriptPath = path.join(root, relativeScript);
  let scriptStat;
  try {
    scriptStat = lstatSync(scriptPath);
  } catch {
    throw new Error(`${relativeScript} is missing. Run anhedral upgrade or restore it from source control.`);
  }
  if (scriptStat.isSymbolicLink() || !scriptStat.isFile()) {
    throw new Error(`${relativeScript} must be a regular file, not a symlink.`);
  }
  if (hashContent(readFileSync(scriptPath)) !== record.hash) {
    throw new Error(`${relativeScript} differs from its recorded managed content; restore it before setup-vps.`);
  }

  const result = spawnSync('bash', [scriptPath, options.check ? '--check' : '--apply'], {
    cwd: root,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) throw new Error(`Unable to start the VPS bootstrap: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`VPS bootstrap failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

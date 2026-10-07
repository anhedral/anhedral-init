import { cpSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergePnpmPatches } from './pnpm-policy.js';

const assets = fileURLToPath(new URL('../assets/security/', import.meta.url));
const manifest = () => JSON.parse(readFileSync(path.join(assets, 'manifest.json'), 'utf8')) as {
  packages: { name: string; version: string; patch: string }[];
};

export function writeSecurityBackports(root: string): void {
  cpSync(assets, path.join(root, 'scripts/security'), { recursive: true });
}

/** Resolve first, then patch only exact packages present in the selected recipe. */
export function configureSecurityBackports(root: string): boolean {
  const lockfile = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
  const entries = manifest().packages.filter(({ name, version }) => {
    const coordinate = `${name}@${version}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^  ['"]?${coordinate}['"]?:`, 'm').test(lockfile);
  });
  if (!entries.length) return false;
  mergePnpmPatches(root, Object.fromEntries(entries.map(({ name, version, patch }) =>
    [`${name}@${version}`, `scripts/security/${patch}`])));
  return true;
}

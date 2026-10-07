import { lstatSync } from 'node:fs';
import path from 'node:path';

// Packing replaces its output. Keep that destructive operation in a dedicated namespace.
export function releaseDirectory(repoRoot, output) {
  const directory = path.resolve(repoRoot, output);
  const relative = path.relative(repoRoot, directory);
  if (!/^\.artifacts[\\/]release(?:-[A-Za-z0-9_-]+)?$/.test(relative)) {
    throw new Error('Release output must be .artifacts/release or .artifacts/release-<name>');
  }
  for (const candidate of [path.join(repoRoot, '.artifacts'), directory]) {
    let stat;
    try { stat = lstatSync(candidate); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error('Release output and its parent must be real directories');
    }
  }
  return directory;
}

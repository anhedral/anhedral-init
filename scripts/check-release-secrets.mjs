import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  formatFindings,
  scanDirectory,
  scanTarball,
  scanTrackedTree,
} from './secret-scanner.mjs';

const root = path.resolve(import.meta.dirname, '..');
const metadataPath = path.resolve(process.argv[2] ?? 'release-artifact/metadata.json');
const findings = [
  ...scanTrackedTree(root),
  ...scanDirectory(root, 'dist'),
];

if (existsSync(metadataPath)) {
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  if (metadata.filename !== path.basename(metadata.filename)) {
    throw new Error(`Release tarball filename must be a basename: ${metadata.filename}`);
  }
  findings.push(...scanTarball(path.join(path.dirname(metadataPath), metadata.filename)));
} else if (process.argv[2]) {
  throw new Error(`Release metadata does not exist: ${metadataPath}`);
}

if (findings.length > 0) {
  console.error(formatFindings(findings));
  process.exit(1);
}

console.log(`Secret scan passed for tracked files, dist${existsSync(metadataPath) ? ', and release tarball' : ''}`);

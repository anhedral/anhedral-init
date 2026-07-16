import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

const metadataPath = path.resolve(process.argv[2] ?? 'release-artifact/metadata.json');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
const expectations = [
  ['name', process.env.ANHEDRAL_EXPECTED_NAME],
  ['version', process.env.ANHEDRAL_EXPECTED_VERSION],
  ['filename', process.env.ANHEDRAL_EXPECTED_FILENAME],
  ['integrity', process.env.ANHEDRAL_EXPECTED_INTEGRITY],
];

if (metadata.schemaVersion !== 1) {
  throw new Error(`Unsupported release metadata schema: ${metadata.schemaVersion}`);
}

if (metadata.name !== 'anhedral') {
  throw new Error(`Unexpected release package name: ${metadata.name}`);
}

if (typeof metadata.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(metadata.version)) {
  throw new Error(`Release version must be valid SemVer: ${metadata.version}`);
}

if (typeof metadata.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(metadata.integrity)) {
  throw new Error('Release integrity must be an sha512 SRI value');
}

if (typeof metadata.shasum !== 'string' || !/^[a-f0-9]{40}$/.test(metadata.shasum)) {
  throw new Error('Release shasum must be a SHA-1 hex digest');
}

if (!Number.isSafeInteger(metadata.size) || metadata.size < 1) {
  throw new Error(`Release size must be a positive safe integer: ${metadata.size}`);
}

if (metadata.filename !== path.basename(metadata.filename)) {
  throw new Error(`Release tarball filename must not contain a path: ${metadata.filename}`);
}

for (const [field, expected] of expectations) {
  if (expected && metadata[field] !== expected) {
    throw new Error(`Release metadata ${field} mismatch: expected ${expected}, received ${metadata[field]}`);
  }
}

const tarballPath = path.join(path.dirname(metadataPath), metadata.filename);
const tarballStat = lstatSync(tarballPath);
if (!tarballStat.isFile() || tarballStat.isSymbolicLink()) {
  throw new Error('Release tarball must be a regular non-symbolic-link file');
}
const tarball = readFileSync(tarballPath);
const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
const shasum = createHash('sha1').update(tarball).digest('hex');
const size = tarballStat.size;

if (integrity !== metadata.integrity) {
  throw new Error(`Tarball integrity mismatch: expected ${metadata.integrity}, received ${integrity}`);
}

if (shasum !== metadata.shasum) {
  throw new Error(`Tarball shasum mismatch: expected ${metadata.shasum}, received ${shasum}`);
}

if (size !== metadata.size) {
  throw new Error(`Tarball size mismatch: expected ${metadata.size}, received ${size}`);
}

console.log(`Verified ${metadata.name}@${metadata.version}: ${metadata.integrity}`);

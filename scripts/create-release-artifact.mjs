import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const artifactDirectoryName = process.argv[2] ?? 'release-artifact';
const artifactDirectory = path.resolve(repoRoot, artifactDirectoryName);
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

if (artifactDirectory === repoRoot || !artifactDirectory.startsWith(`${repoRoot}${path.sep}`)) {
  throw new Error('Release artifact directory must be inside the repository root');
}

const npmCache = mkdtempSync(path.join(tmpdir(), 'anhedral-release-pack-'));

function parsePackJson(output) {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start < 0 || end <= start) {
    throw new Error(`npm pack did not emit a JSON array:\n${output}`);
  }
  return JSON.parse(output.slice(start, end + 1));
}

function digest(contents, algorithm, encoding) {
  return createHash(algorithm).update(contents).digest(encoding);
}

try {
  rmSync(artifactDirectory, { recursive: true, force: true });
  mkdirSync(artifactDirectory, { recursive: true });

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    npmCommand,
    ['pack', '--json', '--ignore-scripts', '--pack-destination', artifactDirectory],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: npmCache,
      },
    },
  );

  if (result.status !== 0) {
    throw new Error(`npm pack failed\nstdout:\n${result.stdout ?? ''}\nstderr:\n${result.stderr ?? ''}`);
  }

  const packed = parsePackJson(String(result.stdout ?? ''));
  if (packed.length !== 1) {
    throw new Error(`Expected one packed artifact, received ${packed.length}`);
  }

  const packageResult = packed[0];
  if (packageResult.name !== packageJson.name || packageResult.version !== packageJson.version) {
    throw new Error(
      `Packed identity ${packageResult.name}@${packageResult.version} does not match package.json ` +
      `${packageJson.name}@${packageJson.version}`,
    );
  }

  const tarballPath = path.join(artifactDirectory, packageResult.filename);
  if (!existsSync(tarballPath)) {
    throw new Error(`npm pack reported a missing tarball: ${tarballPath}`);
  }

  const tarball = readFileSync(tarballPath);
  const integrity = `sha512-${digest(tarball, 'sha512', 'base64')}`;
  const shasum = digest(tarball, 'sha1', 'hex');

  if (integrity !== packageResult.integrity || shasum !== packageResult.shasum) {
    throw new Error('Packed tarball digest does not match npm pack metadata');
  }

  const metadata = {
    schemaVersion: 1,
    name: packageResult.name,
    version: packageResult.version,
    filename: packageResult.filename,
    integrity,
    shasum,
    size: statSync(tarballPath).size,
    unpackedSize: packageResult.unpackedSize,
    entryCount: packageResult.entryCount,
    files: packageResult.files.map((file) => file.path).sort(),
  };

  const metadataPath = path.join(artifactDirectory, 'metadata.json');
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  console.log(
    `Prepared ${path.relative(repoRoot, tarballPath)} (${metadata.integrity}, ${metadata.entryCount} files)`,
  );
} finally {
  rmSync(npmCache, { recursive: true, force: true });
}

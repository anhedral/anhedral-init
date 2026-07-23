import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STABLE_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseStableVersion(value) {
  const match = STABLE_SEMVER_PATTERN.exec(value);
  if (!match) throw new Error(`Expected a stable semantic version, received ${JSON.stringify(value)}`);
  return match.slice(1).map(Number);
}

export function compareStableVersions(left, right) {
  const leftParts = parseStableVersion(left);
  const rightParts = parseStableVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

export function resolveReleaseVersion(currentVersion, publishedVersion, automaticPatch = true) {
  const comparison = compareStableVersions(currentVersion, publishedVersion);
  if (comparison < 0) {
    throw new Error(
      `package.json version ${currentVersion} is behind npm version ${publishedVersion}`,
    );
  }
  if (comparison > 0 || !automaticPatch) {
    return { version: currentVersion, automatic: false };
  }
  const [major, minor, patch] = parseStableVersion(publishedVersion);
  return { version: `${major}.${minor}.${patch + 1}`, automatic: true };
}

export function updateChangelog(changelog, version, date, summaries) {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^## (?:\\[${escapedVersion}\\]|${escapedVersion})(?: - \\d{4}-\\d{2}-\\d{2})?$`, 'm')
    .test(changelog)) {
    return changelog;
  }

  const uniqueSummaries = [...new Set(summaries
    .map((summary) => summary.trim().replace(/\s*\[skip ci\]\s*/gi, ' ').trim())
    .filter((summary) => summary && !/^chore\(release\):/i.test(summary)))];
  const bullets = uniqueSummaries.length > 0
    ? uniqueSummaries.map((summary) => `- ${summary.replace(/[.]?$/, '.')}`).join('\n')
    : '- Release the latest changes from `main`.';

  const unreleasedPattern = /(^## (?:\[?Unreleased\]?)[^\n]*\n)([\s\S]*?)(?=^## )/m;
  if (!unreleasedPattern.test(changelog)) {
    throw new Error('CHANGELOG.md is missing an Unreleased section before its version entries');
  }

  return changelog.replace(unreleasedPattern, (section, heading, unreleasedBody) => {
    const existing = unreleasedBody.trim();
    const releaseBody = existing || `### Changed\n\n${bullets}`;
    return `${heading}\n## ${version} - ${date}\n\n${releaseBody}\n\n`;
  });
}

function gitSummaries(root, publishedVersion) {
  const result = spawnSync(
    'git',
    ['log', '--reverse', '--format=%s', `v${publishedVersion}..HEAD`],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`Unable to read changes since v${publishedVersion}: ${result.stderr.trim()}`);
  }
  return result.stdout.split('\n').filter(Boolean);
}

export function prepareAutomaticRelease(
  root,
  publishedVersion,
  date = new Date().toISOString().slice(0, 10),
  automaticPatch = true,
) {
  const packagePath = path.join(root, 'package.json');
  const versionSourcePath = path.join(root, 'src', 'version.ts');
  const changelogPath = path.join(root, 'CHANGELOG.md');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const resolution = resolveReleaseVersion(packageJson.version, publishedVersion, automaticPatch);

  if (!resolution.automatic) return resolution;

  packageJson.version = resolution.version;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const versionSource = readFileSync(versionSourcePath, 'utf8');
  const updatedVersionSource = versionSource.replace(
    /export const GENERATOR_VERSION = '[^']+';/,
    `export const GENERATOR_VERSION = '${resolution.version}';`,
  );
  if (updatedVersionSource === versionSource) {
    throw new Error('src/version.ts does not contain GENERATOR_VERSION');
  }
  writeFileSync(versionSourcePath, updatedVersionSource);

  const changelog = readFileSync(changelogPath, 'utf8');
  writeFileSync(
    changelogPath,
    updateChangelog(changelog, resolution.version, date, gitSummaries(root, publishedVersion)),
  );

  return resolution;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const publishedVersion = process.argv[2];
  if (!publishedVersion) {
    console.error('Usage: node scripts/prepare-auto-release.mjs <published-version> [--preserve-current]');
    process.exit(1);
  }
  const root = path.resolve(import.meta.dirname, '..');
  const automaticPatch = process.argv[3] !== '--preserve-current';
  const result = prepareAutomaticRelease(root, publishedVersion, undefined, automaticPatch);
  console.log(JSON.stringify(result));
}

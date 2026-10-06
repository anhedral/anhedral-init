import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RELEASE_ARTIFACT_ACTIONS = Object.freeze({
  upload: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', // actions/upload-artifact v7.0.1
  download: '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c', // actions/download-artifact v8.0.1
});

export function isValidSemver(value) {
  if (typeof value !== 'string' || !SEMVER_PATTERN.test(value)) return false;
  const prerelease = value.split('+', 1)[0].split('-').slice(1).join('-');
  return prerelease === '' || prerelease.split('.').every((part) => !/^\d+$/.test(part) || part === '0' || !part.startsWith('0'));
}

export function validateReleaseDeclaration(packageJson) {
  return isValidSemver(packageJson.version)
    ? []
    : [`package.json version is not valid SemVer: ${JSON.stringify(packageJson.version)}`];
}

export function validateGeneratorVersion(packageJson, versionSource) {
  const declared = versionSource.match(/export const GENERATOR_VERSION = '([^']+)'/)?.[1];
  if (!declared) return ['src/version.ts must declare GENERATOR_VERSION as a string literal'];
  return declared === packageJson.version
    ? []
    : [`src/version.ts generator version ${declared} does not match package.json ${packageJson.version}`];
}

function renovateRegex(value) {
  if (typeof value !== 'string') throw new Error('Renovate regex must be a string');
  if (value.startsWith('/') && value.lastIndexOf('/') > 0) {
    const lastSlash = value.lastIndexOf('/');
    return new RegExp(value.slice(1, lastSlash), value.slice(lastSlash + 1).replace('g', ''));
  }
  return new RegExp(value);
}

export function validateRenovateExtraction(root, renovate) {
  const failures = [];
  if (renovate.$schema !== 'https://docs.renovatebot.com/renovate-schema.json') {
    failures.push('renovate.json must declare the official Renovate schema');
  }
  if (!Array.isArray(renovate.customManagers) || renovate.customManagers.length === 0) {
    failures.push('renovate.json must define customManagers for non-package pins');
    return failures;
  }

  const candidateFiles = [
    'package.json',
    ...readdirSync(path.join(root, '.github', 'workflows')).map((name) => `.github/workflows/${name}`),
    ...readdirSync(path.join(root, 'src')).filter((name) => name.endsWith('.ts')).map((name) => `src/${name}`),
  ];

  renovate.customManagers.forEach((manager, managerIndex) => {
    if (manager.customType !== 'regex') {
      failures.push(`renovate.json customManagers[${managerIndex}] must use customType=regex`);
      return;
    }
    let filePatterns;
    let matchPatterns;
    try {
      filePatterns = (manager.managerFilePatterns ?? []).map(renovateRegex);
      matchPatterns = (manager.matchStrings ?? []).map((value) => new RegExp(value));
    } catch (error) {
      failures.push(`renovate.json customManagers[${managerIndex}] has invalid regex: ${error.message}`);
      return;
    }
    const matchingFiles = candidateFiles.filter((file) => filePatterns.some((pattern) => pattern.test(file)));
    if (matchingFiles.length === 0) {
      failures.push(`renovate.json customManagers[${managerIndex}] matches no maintained files`);
      return;
    }
    const sources = matchingFiles.map((file) => `${file}\n${readFileSync(path.join(root, file), 'utf8')}`);
    if (matchPatterns.length === 0) {
      failures.push(`renovate.json customManagers[${managerIndex}] defines no extraction patterns`);
    }
    matchPatterns.forEach((pattern, patternIndex) => {
      if (!sources.some((source) => pattern.test(source))) {
        failures.push(`renovate.json customManagers[${managerIndex}].matchStrings[${patternIndex}] extracts no current pins`);
      }
    });
  });
  return failures;
}

export function validateWorkflowPolicy(root) {
  const failures = [];
  const workflowsRoot = path.join(root, '.github', 'workflows');
  const names = new Map();
  for (const filename of readdirSync(workflowsRoot).filter((name) => /\.ya?ml$/.test(name))) {
    const relative = `.github/workflows/${filename}`;
    const source = readFileSync(path.join(root, relative), 'utf8');
    if (source.includes('\t')) failures.push(`${relative}: YAML must not contain tab indentation`);
    if (!/^name:\s*\S+/m.test(source)) failures.push(`${relative}: missing workflow name`);
    if (!/^on:\s*(?:$|\S+)/m.test(source)) failures.push(`${relative}: missing on trigger`);
    if (!/^jobs:\s*$/m.test(source)) failures.push(`${relative}: missing jobs mapping`);
    if (!/^permissions:\s*$/m.test(source)) failures.push(`${relative}: missing top-level least-privilege permissions`);
    if (/^\s*pull_request_target:/m.test(source)) failures.push(`${relative}: pull_request_target is not permitted`);
    if (/\b(?:curl|wget)\b[^\n]*\|\s*(?:ba)?sh\b/.test(source)) failures.push(`${relative}: remote shell pipelines are not permitted`);
    for (const match of source.matchAll(/^\s{2}([a-zA-Z0-9_-]+):\s*$/gm)) {
      if (['contents', 'actions', 'id-token', 'packages', 'pull-requests'].includes(match[1])) continue;
      const jobStart = match.index;
      const nextJob = source.slice(jobStart + 1).search(/^  [a-zA-Z0-9_-]+:\s*$/m);
      const jobSource = nextJob < 0 ? source.slice(jobStart) : source.slice(jobStart, jobStart + 1 + nextJob);
      if (/\b(?:runs-on|uses):/.test(jobSource) && !/timeout-minutes:/.test(jobSource) && !/^\s{4}uses:/m.test(jobSource)) {
        failures.push(`${relative}: job ${match[1]} must set timeout-minutes`);
      }
    }
    const name = source.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    if (name) {
      if (names.has(name)) failures.push(`${relative}: duplicates workflow name ${name} from ${names.get(name)}`);
      names.set(name, relative);
    }
  }
  const releaseWorkflow = readFileSync(path.join(workflowsRoot, 'release.yml'), 'utf8');
  if (/ref:\s*\$\{\{\s*inputs\./.test(releaseWorkflow)
    || (releaseWorkflow.match(/ref: main/g) ?? []).length !== 4
    || (releaseWorkflow.match(/name: Require the prepared main commit/g) ?? []).length !== 4) {
    failures.push('.github/workflows/release.yml: executable checkouts must use trusted main and verify the prepared commit before execution');
  }
  const releaseTrigger = releaseWorkflow.match(/^on:\s*$[\s\S]*?(?=^[a-zA-Z0-9_-]+:\s*(?:$|\S))/m)?.[0] ?? '';
  const portabilityJob = releaseWorkflow.split('\n  portability:')[1]?.split('\n  publish:')[0] ?? '';
  if (!/name: Require the prepared main commit\n\s+shell: bash/.test(portabilityJob)) {
    failures.push('.github/workflows/release.yml: the cross-platform commit guard must explicitly use Bash');
  }
  if (/^\s{2}workflow_dispatch:/m.test(releaseTrigger)) {
    failures.push('.github/workflows/release.yml: reusable release must be dispatched through release-on-main.yml for trusted publishing');
  }
  if (/\bFORCE_JAVASCRIPT_ACTIONS_TO_NODE24\b/.test(releaseWorkflow)) {
    failures.push('.github/workflows/release.yml: release actions must declare Node.js 24 instead of relying on the temporary force override');
  }
  const artifactActionCounts = { upload: 0, download: 0 };
  for (const match of releaseWorkflow.matchAll(/actions\/(upload|download)-artifact@([^#\s]+)/g)) {
    const kind = match[1];
    const reference = match[2];
    artifactActionCounts[kind] += 1;
    if (reference !== RELEASE_ARTIFACT_ACTIONS[kind]) {
      failures.push(`.github/workflows/release.yml: actions/${kind}-artifact must use the reviewed Node.js 24 pin ${RELEASE_ARTIFACT_ACTIONS[kind]}`);
    }
  }
  if (artifactActionCounts.upload === 0 || artifactActionCounts.download === 0) {
    failures.push('.github/workflows/release.yml: release must upload and download the exact verified artifact');
  }
  if (!/npm publish "\.\/\.artifacts\/release\/\$TARBALL" --ignore-scripts/.test(releaseWorkflow)) {
    failures.push('.github/workflows/release.yml: npm publish must use an explicit local .artifacts/release tarball path');
  }
  const tagJob = releaseWorkflow.match(/^  tag:[\s\S]*$/m)?.[0] ?? '';
  const releasePublishCount = [...tagJob.matchAll(/gh release edit "\$TAG" --draft=false/g)].length;
  if (!/METADATA="\.artifacts\/release\/metadata\.json"/.test(tagJob)
    || !/gh release upload[\s\S]*?"\$METADATA#release integrity metadata"/.test(tagJob)
    || !/gh release create "\$TAG" \\\n\s+--draft \\/.test(tagJob)
    || releasePublishCount !== 2
    || !/gh release download[\s\S]*?--pattern metadata\.json/.test(tagJob)
    || !/cmp "\$ASSET" "\$DOWNLOAD_DIR\/\$TARBALL"/.test(tagJob)
    || !/cmp "\$METADATA" "\$DOWNLOAD_DIR\/metadata\.json"/.test(tagJob)) {
    failures.push('.github/workflows/release.yml: GitHub releases must attach .artifacts/release/metadata.json with the tarball');
  }
  const releaseOnMainWorkflow = readFileSync(path.join(workflowsRoot, 'release-on-main.yml'), 'utf8');
  const ciWorkflow = readFileSync(path.join(workflowsRoot, 'ci.yml'), 'utf8');
  const reusableReleaseJob = releaseOnMainWorkflow.match(/^  release:[\s\S]*$/m)?.[0] ?? '';
  const releasePreparationJob = releaseOnMainWorkflow.match(
    /^  prepare:[\s\S]*?(?=^  [a-zA-Z0-9_-]+:\s*$)/m,
  )?.[0] ?? '';
  const publishJob = releaseWorkflow.match(
    /^  publish:[\s\S]*?(?=^  [a-zA-Z0-9_-]+:\s*$)/m,
  )?.[0] ?? '';
  const releasePrCreateCount = [...releasePreparationJob.matchAll(/gh pr create/g)].length;
  const releaseCiDispatchCount = [
    ...releasePreparationJob.matchAll(/gh workflow run ci\.yml --ref "\$RELEASE_BRANCH"/g),
  ].length;
  if (!/prepare-auto-release\.mjs/.test(releasePreparationJob)
    || !/git push origin "HEAD:refs\/heads\/\$RELEASE_BRANCH"/.test(releasePreparationJob)
    || releasePrCreateCount !== 2
    || releaseCiDispatchCount !== 2
    || /git push origin HEAD:main/.test(releasePreparationJob)) {
    failures.push('.github/workflows/release-on-main.yml: automatic versions must use a reviewed release PR with explicitly dispatched CI');
  }
  if (!/workflow_run:/.test(releaseOnMainWorkflow)
    || !/workflow_run\.conclusion == 'success'/.test(releasePreparationJob)) {
    failures.push('.github/workflows/release-on-main.yml: automatic releases must wait for successful main CI');
  }
  if (!/^\s{6}contents:\s*write\s*$/m.test(releasePreparationJob)) {
    failures.push('.github/workflows/release-on-main.yml: release preparation must grant contents=write');
  }
  if (!/^\s{6}actions:\s*write\s*$/m.test(releasePreparationJob)
    || !/^\s{6}pull-requests:\s*write\s*$/m.test(releasePreparationJob)) {
    failures.push('.github/workflows/release-on-main.yml: release PR preparation must grant actions=write and pull-requests=write');
  }
  if (!/^\s{2}workflow_dispatch:\s*$/m.test(ciWorkflow)) {
    failures.push('.github/workflows/ci.yml: CI must support explicit dispatch for automated release PR branches');
  }
  if (!/release_sha:\s*\$\{\{ needs\.prepare\.outputs\.release_sha \}\}/.test(reusableReleaseJob)
    || !/inputs\.release_sha/.test(releaseWorkflow)) {
    failures.push('release workflows must publish the exact prepared release commit');
  }
  if (!/^\s{6}id-token:\s*write\s*$/m.test(reusableReleaseJob)) {
    failures.push('.github/workflows/release-on-main.yml: reusable release caller must grant id-token=write');
  }
  if (!/^\s{6}id-token:\s*write\s*$/m.test(publishJob)) {
    failures.push('.github/workflows/release.yml: publish job must grant id-token=write');
  }
  if (!/^\s{10}registry-url:\s*https:\/\/registry\.npmjs\.org\s*$/m.test(publishJob)) {
    failures.push('.github/workflows/release.yml: publish job must configure the npm registry for OIDC');
  }
  if (!/Require OIDC-capable npm/.test(publishJob) || !/npm 11\.5\.1 or newer/.test(publishJob)) {
    failures.push('.github/workflows/release.yml: publish job must require an OIDC-capable npm CLI');
  }
  if (!/npm publish [^\n]*--provenance\b/.test(publishJob) || /--provenance=false/.test(publishJob)) {
    failures.push('.github/workflows/release.yml: public npm publication must attach provenance');
  }
  const releaseAuthentication = `${releaseOnMainWorkflow}\n${releaseWorkflow}`;
  if (/\b(?:NODE_AUTH_TOKEN|NPM_TOKEN|NPM_CONFIG_USERCONFIG)\b|:_authToken/.test(releaseAuthentication)) {
    failures.push('release workflows must use trusted publishing without long-lived npm credentials');
  }
  return failures;
}

export function checkReleasePolicy(root) {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const versionSource = readFileSync(path.join(root, 'src', 'version.ts'), 'utf8');
  const renovate = JSON.parse(readFileSync(path.join(root, 'renovate.json'), 'utf8'));
  return [
    ...validateReleaseDeclaration(packageJson),
    ...validateGeneratorVersion(packageJson, versionSource),
    ...validateWorkflowPolicy(root),
    ...validateRenovateExtraction(root, renovate),
  ];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(import.meta.dirname, '..');
  const failures = checkReleasePolicy(root);
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('Release, workflow, and Renovate policy passed');
}

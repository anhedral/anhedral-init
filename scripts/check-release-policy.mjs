import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function isValidSemver(value) {
  if (typeof value !== 'string' || !SEMVER_PATTERN.test(value)) return false;
  const prerelease = value.split('+', 1)[0].split('-').slice(1).join('-');
  return prerelease === '' || prerelease.split('.').every((part) => !/^\d+$/.test(part) || part === '0' || !part.startsWith('0'));
}

export function validateReleaseDeclaration(packageJson, changelog) {
  const failures = [];
  if (!isValidSemver(packageJson.version)) {
    failures.push(`package.json version is not valid SemVer: ${JSON.stringify(packageJson.version)}`);
  } else {
    const escaped = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`^## \\[${escaped}\\](?: - \\d{4}-\\d{2}-\\d{2})?$`, 'm').test(changelog)
      && !new RegExp(`^## ${escaped}(?: - \\d{4}-\\d{2}-\\d{2})?$`, 'm').test(changelog)) {
      failures.push(`CHANGELOG.md is missing a level-two entry for ${packageJson.version}`);
    }
  }
  if (!/^## (?:\[?Unreleased\]?)/m.test(changelog)) {
    failures.push('CHANGELOG.md is missing an Unreleased section');
  }
  return failures;
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
    'CONTRIBUTING.md',
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
  const runtimeAcceptance = releaseWorkflow.match(
    /^  runtime-acceptance:[\s\S]*?(?=^  [a-zA-Z0-9_-]+:\s*$)/m,
  )?.[0] ?? '';
  if (!/actions\/download-artifact@/.test(runtimeAcceptance)) {
    failures.push('.github/workflows/release.yml: runtime acceptance must download the verified release artifact');
  }
  if (!/test-runtime-acceptance\.js[^\n]*release-artifact\/metadata\.json/.test(runtimeAcceptance)) {
    failures.push('.github/workflows/release.yml: runtime acceptance must execute the exact release artifact metadata');
  }
  if (/Install generator dependencies|pnpm install --frozen-lockfile/.test(runtimeAcceptance)) {
    failures.push('.github/workflows/release.yml: runtime acceptance must not rebuild or execute the checkout generator');
  }
  if (!/npm publish "\.\/release-artifact\/\$TARBALL" --ignore-scripts/.test(releaseWorkflow)) {
    failures.push('.github/workflows/release.yml: npm publish must use an explicit local release-artifact tarball path');
  }
  return failures;
}

export function checkReleasePolicy(root) {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const renovate = JSON.parse(readFileSync(path.join(root, 'renovate.json'), 'utf8'));
  return [
    ...validateReleaseDeclaration(packageJson, changelog),
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

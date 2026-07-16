import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { formatFindings, scanDirectory, scanWorkingTree } from './secret-scanner.mjs';

const root = path.resolve(import.meta.dirname, '..');
const workflowsRoot = path.join(root, '.github', 'workflows');
const failures = [];

for (const filename of readdirSync(workflowsRoot).filter((entry) => /\.ya?ml$/.test(entry))) {
  const relative = path.join('.github', 'workflows', filename);
  const content = readFileSync(path.join(root, relative), 'utf8');
  for (const match of content.matchAll(/^\s*(?:-\s*)?uses:\s*([^#\s]+)/gm)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;
    if (!/@[a-f0-9]{40}$/.test(reference)) {
      failures.push(`${relative}: action is not pinned to a full commit SHA: ${reference}`);
    }
  }
}

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  for (const [name, version] of Object.entries(packageJson[group] ?? {})) {
    if (/^(?:\^|~|>|<|\*|latest$)/.test(version)) {
      failures.push(`package.json: ${group}.${name} must be exactly pinned (received ${version})`);
    }
  }
}

const dependencySource = readFileSync(path.join(root, 'src', 'dependencies.ts'), 'utf8');
if (/@latest\b/.test(dependencySource)) failures.push('src/dependencies.ts: generated dependencies must not use @latest');
const dependencyPinSource = dependencySource.replace(/^export const (?:MOBILE_)?NODE_ENGINE = .*$/gm, '');
if (/['"](?:\^|~)[^'"]+['"]/.test(dependencyPinSource)) failures.push('src/dependencies.ts: generated dependencies must use exact versions');

const templatesRoot = path.join(root, 'src', 'templates');
for (const filename of readdirSync(templatesRoot).filter((entry) => entry.endsWith('.ts'))) {
  const relative = path.join('src', 'templates', filename);
  const source = readFileSync(path.join(root, relative), 'utf8');
  for (const match of source.matchAll(/['"](@?[a-z0-9][a-z0-9._/-]*)['"]\s*:\s*['"](?:\^|~)?\d+\.\d+\.\d+/gi)) {
    failures.push(`${relative}: dependency-like pin ${match[1]} must come from src/dependencies.ts`);
  }
}

const secretFindings = [...scanWorkingTree(root), ...scanDirectory(root, 'dist')];
if (secretFindings.length > 0) failures.push(formatFindings(secretFindings));

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Static security policy passed');

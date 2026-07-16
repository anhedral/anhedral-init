import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const directories = ['.github', 'docs', 'scripts', 'src', 'tests'];
const rootFiles = [
  '.gitignore',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'SKILL.md',
  'package.json',
  'pnpm-lock.yaml',
  'renovate.json',
  'tsconfig.json',
];
const textExtensions = new Set(['.js', '.json', '.md', '.mjs', '.ts', '.txt', '.yaml', '.yml']);

function collect(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const absolute = path.join(directory, entry);
    const relative = path.relative(root, absolute);
    if (relative.includes('node_modules') || relative.startsWith('tests/fixtures/output-trees/')) continue;
    if (statSync(absolute).isDirectory()) files.push(...collect(absolute));
    else if (textExtensions.has(path.extname(entry))) files.push(absolute);
  }
  return files;
}

const files = [
  ...rootFiles.map((file) => path.join(root, file)).filter(existsSync),
  ...directories.flatMap((directory) => collect(path.join(root, directory))),
];
const failures = [];

for (const file of files) {
  const relative = path.relative(root, file);
  const content = readFileSync(file, 'utf8');
  if (content.includes('\r')) failures.push(`${relative}: CRLF line endings are not allowed`);
  if (content.length > 0 && !content.endsWith('\n')) failures.push(`${relative}: missing final newline`);
  content.split('\n').forEach((line, index) => {
    if (/[ \t]+$/.test(line)) failures.push(`${relative}:${index + 1}: trailing whitespace`);
  });
  if (path.extname(file) === '.json') {
    try {
      JSON.parse(content);
    } catch (error) {
      failures.push(`${relative}: invalid JSON (${error.message})`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Source hygiene passed for ${files.length} files`);

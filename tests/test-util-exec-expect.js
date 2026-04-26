import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'anhedral-exec-expect-'));

try {
  const { execExpect } = await import(path.join(repoRoot, 'dist', 'util.js'));

  const scriptPath = path.join(tempRoot, 'interactive-script.mjs');
  const outputPath = path.join(tempRoot, 'answers.json');
  mkdirSync(tempRoot, { recursive: true });

  writeFileSync(scriptPath, `import { writeFileSync } from 'node:fs';
import readline from 'node:readline/promises';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const projectName = await rl.question('What is the name of your project? ');
const install = await rl.question('Would you like to install dependencies? ');
const git = await rl.question('Would you like to initialize a Git repository? ');

writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({ projectName, install, git }) + '\\n');
rl.close();
`);

  await execExpect(`node ${JSON.stringify(scriptPath)}`, tempRoot, [
    ['What is the name of your project?', 'mobile-sample'],
    ['Would you like to install dependencies?', 'n'],
    ['Would you like to initialize a Git repository?', 'n'],
  ]);

  assert.equal(existsSync(outputPath), true, 'interactive script should write its captured answers');
  const answers = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.deepEqual(answers, {
    projectName: 'mobile-sample',
    install: 'n',
    git: 'n',
  });

  console.log('Interactive execExpect regression test passed');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

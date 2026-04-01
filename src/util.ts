import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

export function writeFile(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

export function appendGitignore(root: string, lines: string[]): void {
  const filePath = path.join(root, '.gitignore');
  const existing = existsSync(filePath)
    ? readFileSync(filePath, 'utf-8').split('\n').map((line) => line.trim()).filter(Boolean)
    : [];
  const merged = [...new Set([...existing, ...lines])];
  writeFile(filePath, merged.join('\n') + '\n');
}

export function exec(cmd: string, cwd: string): void {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

export function execWithInput(cmd: string, cwd: string, stdinInput: string): void {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: ['pipe', 'inherit', 'inherit'], input: stdinInput });
}

function moveDirectoryContents(sourceDir: string, targetDir: string): void {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (existsSync(targetPath)) {
      if (!entry.isDirectory() || !statSync(targetPath).isDirectory()) {
        throw new Error(`Cannot merge scaffold output because ${targetPath} already exists.`);
      }

      moveDirectoryContents(sourcePath, targetPath);
      rmSync(sourcePath, { recursive: true, force: true });
      continue;
    }

    renameSync(sourcePath, targetPath);
  }
}

export function liftNestedProject(root: string, nestedName: string): void {
  const nestedRoot = path.join(root, nestedName);
  if (!existsSync(nestedRoot)) {
    return;
  }

  const selfNamedChild = path.join(nestedRoot, nestedName);
  const tempSelfNamedChild = path.join(root, `.${nestedName}.anhedral-tmp`);
  const hasSelfNamedChild = existsSync(selfNamedChild);

  if (hasSelfNamedChild) {
    if (existsSync(tempSelfNamedChild)) {
      throw new Error(`Cannot lift scaffold output because ${tempSelfNamedChild} already exists.`);
    }

    renameSync(selfNamedChild, tempSelfNamedChild);
  }

  moveDirectoryContents(nestedRoot, root);
  rmSync(nestedRoot, { recursive: true, force: true });

  if (hasSelfNamedChild) {
    renameSync(tempSelfNamedChild, path.join(root, nestedName));
  }
}

function bashSingleQuoteEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function tclDoubleQuoteEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\$/g, '\\$')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

/**
 * Escape a string for use inside a Tcl double-quoted `send` argument.
 * Converts JS escape sequences to their Tcl equivalents.
 */
function tclSendEscape(s: string): string {
  return tclDoubleQuoteEscape(s).replace(/\x1b/g, '\\033');
}

export function execExpect(cmd: string, cwd: string, prompts: [waitFor: string, answer: string][]): void {
  console.log(`  $ ${cmd}`);
  const shellCommand = `cd ${bashSingleQuoteEscape(cwd)} && ${cmd}`;
  const sendLines = prompts
    .map(([wait, answer]) => `expect "${wait}"\nsend "${tclSendEscape(answer)}\\r"`)
    .join('\n');
  const expectScript = [
    `set timeout 120`,
    `set shell_command "${tclDoubleQuoteEscape(shellCommand)}"`,
    `spawn bash -lc $shell_command`,
    sendLines,
    `expect eof`,
    `catch wait result`,
    `exit [lindex $result 3]`,
  ].join('\n');
  execSync(`expect << 'EXPECT_EOF'\n${expectScript}\nEXPECT_EOF`, {
    cwd,
    stdio: 'inherit',
    shell: '/bin/bash',
  });
}

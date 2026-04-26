import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
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

const VERBOSE = process.env.ANHEDRAL_VERBOSE === '1';

function dumpFailure(error: unknown, cmd: string): never {
  const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number | null };
  const stdoutText = err.stdout ? err.stdout.toString() : '';
  const stderrText = err.stderr ? err.stderr.toString() : '';
  if (stdoutText) process.stderr.write(stdoutText);
  if (stderrText) process.stderr.write(stderrText);
  throw new Error(`Command failed (exit ${err.status ?? '?'}): ${cmd}`);
}

export function exec(cmd: string, cwd: string): void {
  if (VERBOSE) {
    console.log(`  $ ${cmd}`);
    execSync(cmd, { cwd, stdio: 'inherit' });
    return;
  }
  try {
    execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    dumpFailure(error, cmd);
  }
}

export function execWithInput(cmd: string, cwd: string, stdinInput: string): void {
  if (VERBOSE) {
    console.log(`  $ ${cmd}`);
    execSync(cmd, { cwd, stdio: ['pipe', 'inherit', 'inherit'], input: stdinInput });
    return;
  }
  try {
    execSync(cmd, { cwd, stdio: ['pipe', 'pipe', 'pipe'], input: stdinInput });
  } catch (error) {
    dumpFailure(error, cmd);
  }
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

function trimOutputTail(output: string, maxLength = 4000): string {
  if (output.length <= maxLength) {
    return output;
  }

  return output.slice(output.length - maxLength);
}

export async function execExpect(
  cmd: string,
  cwd: string,
  prompts: [waitFor: string, answer: string][],
  timeoutMs = 120_000,
): Promise<void> {
  if (VERBOSE) {
    console.log(`  $ ${cmd}`);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, {
      cwd,
      env: process.env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let combinedOutput = '';
    let promptIndex = 0;
    let settled = false;

    const finish = (handler: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      handler();
    };

    const maybeAnswerPrompt = () => {
      while (promptIndex < prompts.length && combinedOutput.includes(prompts[promptIndex][0])) {
        child.stdin.write(`${prompts[promptIndex][1]}\n`);
        promptIndex += 1;
      }
    };

    const handleChunk = (chunk: Buffer, target: NodeJS.WriteStream) => {
      const text = chunk.toString();
      combinedOutput += text;
      if (VERBOSE) target.write(text);
      maybeAnswerPrompt();
    };

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      finish(() => {
        reject(new Error(
          `Command timed out after ${timeoutMs}ms: ${cmd}\n` +
          `Answered ${promptIndex}/${prompts.length} prompts.\n` +
          `Recent output:\n${trimOutputTail(combinedOutput)}`,
        ));
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => handleChunk(chunk, process.stdout));
    child.stderr.on('data', (chunk: Buffer) => handleChunk(chunk, process.stderr));

    child.on('error', (error) => {
      finish(() => {
        reject(error);
      });
    });

    child.on('close', (code) => {
      finish(() => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(
          `Command failed with exit code ${code}: ${cmd}\n` +
          `Answered ${promptIndex}/${prompts.length} prompts.\n` +
          `Recent output:\n${trimOutputTail(combinedOutput)}`,
        ));
      });
    });
  });
}

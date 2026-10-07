import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(path.resolve('dist/transaction.js')).href;

test('transaction recovery rejects nonregular and oversized metadata without hanging or removing it', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'anhedral-transaction-metadata-'));
  try {
    for (const metadata of ['.anhedral.lock', '.anhedral-journal.json']) {
      for (const kind of ['directory', 'oversized', ...(process.platform === 'win32' ? [] : ['fifo'])]) {
        const root = path.join(temporary, `${metadata}-${kind}`);
        mkdirSync(root);
        const target = path.join(root, metadata);
        if (kind === 'directory') mkdirSync(target);
        if (kind === 'oversized') writeFileSync(target, ' '.repeat(metadata === '.anhedral.lock' ? 16 * 1024 + 1 : 16 * 1024 * 1024 + 1));
        if (kind === 'fifo') assert.equal(spawnSync('mkfifo', [target]).status, 0, 'POSIX FIFO fixture creation must succeed');
        writeFileSync(path.join(root, 'keep.txt'), 'preserve client data\n');
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
          import { recoverInterruptedTransaction } from ${JSON.stringify(moduleUrl)};
          try { recoverInterruptedTransaction(${JSON.stringify(root)}); process.exitCode = 2; }
          catch (error) { console.log(error.message, error.cause?.message ?? ''); }
        `], { encoding: 'utf8', timeout: 3000 });
        assert.equal(result.error, undefined, `${metadata} ${kind} must fail promptly`);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /(?:regular file|size limit)/);
        const remaining = statSync(target);
        assert.equal(kind === 'directory' ? remaining.isDirectory() : kind === 'fifo' ? remaining.isFIFO() : remaining.isFile(), true);
        assert.equal(readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'preserve client data\n');
      }
    }
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

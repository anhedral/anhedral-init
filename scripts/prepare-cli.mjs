import { chmodSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
if (!readFileSync(entry, 'utf8').startsWith('#!/usr/bin/env node\n')) {
  throw new Error('Compiled CLI must preserve its Node.js shebang');
}
chmodSync(entry, 0o755);

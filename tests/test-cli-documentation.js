import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STACK_PRODUCTS } from '../dist/architecture/products.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const reference = readFileSync(path.join(repoRoot, 'docs/cli-reference.md'), 'utf8');
const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const cliSource = readFileSync(path.join(repoRoot, 'src/cli.ts'), 'utf8');
const binSource = readFileSync(path.join(repoRoot, 'src/bin.ts'), 'utf8');

assert.match(readme, /\[complete CLI reference\]\(docs\/cli-reference\.md\)/);

for (const command of ['new', 'init', 'add', 'ui add', 'upgrade', 'doctor', 'setup-vps']) {
  assert.match(
    reference,
    new RegExp(`anhedral ${command.replace(' ', '\\s+')}`),
    `CLI reference must document the ${command} command`,
  );
}

for (const product of STACK_PRODUCTS) {
  assert.ok(
    reference.includes(`\`--${product.id}\``),
    `CLI reference must document the public product flag --${product.id}`,
  );
}

const implementedOptions = new Set(
  [...cliSource.matchAll(/['"](--[a-z][a-z-]*)['"]/g), ...binSource.matchAll(/['"](--[a-z][a-z-]*)['"]/g)]
    .map((match) => match[1]),
);
for (const option of implementedOptions) {
  assert.ok(reference.includes(option), `CLI reference must document ${option}`);
}

for (const variable of [
  'ANHEDRAL_SKIP_INSTALL',
  'ANHEDRAL_TOOLCHAIN',
  'ANHEDRAL_VERBOSE',
  'ANHEDRAL_QUIET',
  'NO_COLOR',
  'ANHEDRAL_DOMAIN',
  'ANHEDRAL_EMAIL',
  'ANHEDRAL_ADMIN_USER',
  'ANHEDRAL_AUTHORIZED_KEYS_FILE',
  'ANHEDRAL_ENABLE_TLS',
]) {
  assert.ok(reference.includes(variable), `CLI reference must document ${variable}`);
}

assert.match(
  cliSource,
  /anhedral add <product\.\.\.\|--all> \[--toolchain <latest\|stable>]/,
  'built-in add usage must expose its supported toolchain option',
);

console.log('CLI documentation tests passed');

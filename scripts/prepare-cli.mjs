import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAPABILITY_REGISTRY } from '../dist/capabilities.js';

const entry = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
if (!readFileSync(entry, 'utf8').startsWith('#!/usr/bin/env node\n')) {
  throw new Error('Compiled CLI must preserve its Node.js shebang');
}
chmodSync(entry, 0o755);
// Ship the same registry and standard with the independently installable plugin.
const references = new URL('../plugins/anhedral/skills/anhedral/references/', import.meta.url);
mkdirSync(references, { recursive: true });
writeFileSync(new URL('capabilities.json', references), JSON.stringify(CAPABILITY_REGISTRY, null, 2) + '\n');
writeFileSync(new URL('application-stack-standard.md', references), readFileSync(new URL('../docs/application-stack-standard.md', import.meta.url)));
writeFileSync(new URL('../plugins/anhedral/LICENSE', import.meta.url), readFileSync(new URL('../LICENSE', import.meta.url)));
const assets = new URL('../plugins/anhedral/assets/', import.meta.url);
mkdirSync(assets, { recursive: true });
writeFileSync(new URL('anhedral.svg', assets), readFileSync(new URL('../assets/anhedral.svg', import.meta.url)));
writeFileSync(new URL('anhedral-mark.svg', assets), readFileSync(new URL('../assets/images/svg/logo-white-subtract.svg', import.meta.url)));

const manifestUrl = new URL('../plugins/anhedral/plugin.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
manifest.version = CAPABILITY_REGISTRY.cliVersion;
writeFileSync(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');

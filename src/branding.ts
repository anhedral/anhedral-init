import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { writeFile } from './util.js';

export const ANHEDRAL_LOGO_FILE_NAME = 'anhedral.svg';
export const ANHEDRAL_LOGO_PUBLIC_PATH = `/${ANHEDRAL_LOGO_FILE_NAME}`;
export const ANHEDRAL_FAVICON_FILE_NAME = 'favicon.ico';

const ANHEDRAL_LOGO_SVG = readFileSync(new URL('../anhedral.svg', import.meta.url), 'utf8');
const ANHEDRAL_FAVICON = readFileSync(new URL(`../${ANHEDRAL_FAVICON_FILE_NAME}`, import.meta.url));

export function writeAnhedralLogo(root: string): void {
  writeFile(path.join(root, 'public', ANHEDRAL_LOGO_FILE_NAME), ANHEDRAL_LOGO_SVG);
}

export function writeAnhedralWebBranding(root: string): void {
  writeAnhedralLogo(root);

  const faviconPath = path.join(root, 'app', ANHEDRAL_FAVICON_FILE_NAME);
  mkdirSync(path.dirname(faviconPath), { recursive: true });
  writeFileSync(faviconPath, ANHEDRAL_FAVICON);
}

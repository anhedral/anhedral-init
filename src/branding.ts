import { readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFile } from './util.js';

export const ANHEDRAL_LOGO_FILE_NAME = 'anhedral.svg';
export const ANHEDRAL_LOGO_PUBLIC_PATH = `/${ANHEDRAL_LOGO_FILE_NAME}`;

const ANHEDRAL_LOGO_SVG = readFileSync(new URL('../anhedral.svg', import.meta.url), 'utf8');

export function writeAnhedralLogo(root: string): void {
  writeFile(path.join(root, 'public', ANHEDRAL_LOGO_FILE_NAME), ANHEDRAL_LOGO_SVG);
}

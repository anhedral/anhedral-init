import path from 'node:path';
import { writeFile } from '../util.js';

export function writeReactLintConfig(directory: string): void {
  writeFile(path.join(directory, 'eslint.config.mjs'), 'import { config } from "@workspace/eslint-config/react-internal";\nexport default [...config, { files: ["**/*.{ts,tsx,cts}"], languageOptions: { parserOptions: { babelOptions: { babelrc: false, configFile: false, parserOpts: { plugins: ["jsx", "typescript"] } } } }, rules: { "no-undef": "off", "no-unused-vars": "off" } }];\n');
}

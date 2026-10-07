import { cpSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { writeFile } from './util.js';
import { PACKAGE_MANAGER, TURBO_VERSION } from './dependencies.js';
import { generatedPnpmPolicy, setPnpmPolicy } from './pnpm-policy.js';

// Curated input version; upstream registry templates still require compatibility checks.
export const SHADCN_VERSION = '4.21.3';
export const SHADCN_BOOTSTRAP = ['pnpm', 'dlx', `shadcn@${SHADCN_VERSION}`, 'init', '--monorepo', '--template', 'next'];
const json = (root: string, file: string, value: unknown) => writeFile(path.join(root, file), JSON.stringify(value, null, 2) + '\n');

/** A shared JS workspace is independent of any UI framework bootstrap. */
export function scaffoldFoundation(root: string): void {
  json(root, 'package.json', { name: 'anhedral-workspace', private: true, packageManager: PACKAGE_MANAGER, devDependencies: { turbo: TURBO_VERSION } });
  writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n  - "packages/*"\n');
  json(root, 'turbo.json', { $schema: 'https://turbo.build/schema.json', tasks: { build: { dependsOn: ['^build'] }, lint: { dependsOn: ['^lint'] }, typecheck: { dependsOn: ['^typecheck'] }, dev: { cache: false, persistent: true } } });
  json(root, 'packages/eslint-config/package.json', { name: '@workspace/eslint-config', private: true, type: 'module', exports: { './base': './base.js', './react-internal': './react-internal.js' }, devDependencies: { eslint: '9.39.5', '@eslint/js': '9.39.5', 'typescript-eslint': '8.71.1', 'eslint-plugin-react-hooks': '7.1.1', typescript: '6.0.3' } });
  writeFile(path.join(root, 'packages/eslint-config/base.js'), `import js from '@eslint/js';
import ts from 'typescript-eslint';
export const config = [js.configs.recommended, ...ts.configs.recommended, { ignores: ['**/dist/**', '**/.output/**', '**/.wxt/**', '**/.expo/**', '**/node_modules/**'] }];
`);
  writeFile(path.join(root, 'packages/eslint-config/react-internal.js'), `import { config as base } from './base.js';
import hooks from 'eslint-plugin-react-hooks';
export const config = [...base, { files: ['**/*.{tsx,jsx}'], plugins: { 'react-hooks': hooks }, rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' } }];
`);
  json(root, 'packages/typescript-config/package.json', { name: '@workspace/typescript-config', private: true, exports: { './base.json': './base.json' } });
  json(root, 'packages/typescript-config/base.json', { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, noEmit: true } });
}

/** The intentionally small single-app recipe has no shared packages or task runner. */
export function flattenSingleApi(root: string, name: string): void {
  const read = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  const workspace = read('package.json');
  const app = read('apps/api/package.json');
  cpSync(path.join(root, 'apps/api'), root, { recursive: true });
  delete app.devDependencies['@workspace/eslint-config'];
  const config = read('packages/eslint-config/package.json');
  delete config.devDependencies['eslint-plugin-react-hooks'];
  // The standalone API has no React/Babel browser-target dependency chain.
  const overrides = generatedPnpmPolicy(root, 'overrides');
  for (const key of ['baseline-browser-mapping@<2.11.0', 'browserslist@<4.28.7']) delete overrides[key];
  const scripts = { ...workspace.scripts, ...app.scripts, test: 'node --test', 'audit:full': 'fallow --fail-on-issues' };
  json(root, 'package.json', { ...app, name, packageManager: PACKAGE_MANAGER, engines: workspace.engines, scripts, devDependencies: { ...config.devDependencies, ...app.devDependencies, eslint: '9.39.5', fallow: workspace.devDependencies.fallow } });
  writeFile(path.join(root, 'eslint.config.mjs'), `import js from '@eslint/js';
import ts from 'typescript-eslint';
export default [js.configs.recommended, ...ts.configs.recommended, { ignores: ['dist/**', '.wrangler/**', 'worker-configuration.d.ts'] }, { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly' } } }, { files: ['**/*.ts'], rules: { 'no-undef': 'off', 'no-unused-vars': 'off' } }];
`);
  for (const file of ['apps', 'packages', 'turbo.json', 'pnpm-workspace.yaml']) rmSync(path.join(root, file), { recursive: true, force: true });
  setPnpmPolicy(root, { allowBuilds: { esbuild: true, workerd: true }, overrides });
}

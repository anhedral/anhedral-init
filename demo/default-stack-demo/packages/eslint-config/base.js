import ts from 'typescript-eslint';
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import turboPlugin from 'eslint-plugin-turbo';
export const config = [
  js.configs.recommended, ...ts.configs.recommended, eslintConfigPrettier,
  { plugins: { turbo: turboPlugin }, rules: { 'turbo/no-undeclared-env-vars': 'warn' } },
  { ignores: ['**/dist/**', '**/node_modules/**'] },
];

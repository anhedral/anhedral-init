import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  { languageOptions: { globals: globals.node } },
  ...tseslint.configs.recommended,
);

import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import phi from '@rxledger/eslint-plugin-phi';

/**
 * Repo-wide flat config. The headline rule is the custom PHI guardrail
 * (`@rxledger/phi/require-phi-tag`): if a PHI-looking field lands in a Zod
 * schema without a phi() tag, the build fails. That is the JD's "PHI-tagged
 * fields enforced by ESLint rule" made real and enforced in CI.
 */
export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.config.*'] },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      '@rxledger/phi': phi,
    },
    rules: {
      '@rxledger/phi/require-phi-tag': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-floating-promises': 'off',
      'no-console': 'off',
    },
  },
];

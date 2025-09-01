// @ts-check

import eslint from '@eslint/js';
import mochaPlugin from "eslint-plugin-mocha";
import tseslint from 'typescript-eslint';
import stylisticTs from '@stylistic/eslint-plugin-ts'

export default tseslint.config(
  mochaPlugin.configs.flat.recommended,
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      '@stylistic/ts': stylisticTs
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      '@stylistic/ts/indent': ['error', 2],
    },
  },
);
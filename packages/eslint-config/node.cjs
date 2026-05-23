/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['./index.cjs'],
  env: { node: true, es2022: true },
  rules: {
    'no-process-exit': 'off',
  },
};

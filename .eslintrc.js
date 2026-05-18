module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2018: true,
  },
  rules: {
    'no-console': 'warn',
    'no-debugger': 'warn',
    'arrow-body-style': 'off',
    'prettier/prettier': 'warn',
    'prefer-arrow-callback': 'warn',
    'vue/no-mutating-props': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/no-useless-template-attributes': 'off',
    'vue/one-component-per-file': 'off',
    'vue/no-reserved-component-names': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/no-misused-promises': 'warn',
  },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    project: true,
    tsconfigRootDir: __dirname,
    sourceType: 'module',
    extraFileExtensions: ['.vue'],
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended',
  ],
  overrides: [
    {
      files: ['models/**/*.{ts,js}', 'src/**/*.{ts,js}', 'fyo/**/*.{ts,js}'],
      excludedFiles: [
        'fyo/model/doc.ts',
        'fyo/core/dbHandler.ts',
        '**/*.spec.ts',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "MemberExpression[property.name='knex'][object.type!='ThisExpression']",
            message:
              'Use Doc.sync() or DatabaseHandler — raw knex only in backend/database, backend/patches, or jobs with explicit modified meta.',
          },
          {
            selector:
              "CallExpression[callee.property.name='update'][callee.object.name='db']",
            message:
              'Avoid fyo.db.update in product code — use Doc.sync() or include modified meta explicitly.',
          },
        ],
      },
    },
    {
      files: ['*.vue'],
      rules: {
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
      },
    },
  ],
  ignorePatterns: [
    '*.mjs',
    'uitest',
    '.eslintrc.js',
    'tailwind.config.js',
    'node_modules',
    'dist_electron',
    '*.spec.ts',
    'vite.config.ts',
    'postcss.config.js',
    'src/components/**/*.vue', // Incrementally fix these
    'electron-builder.ts',
  ],
};

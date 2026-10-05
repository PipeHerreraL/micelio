import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-native',
      'android',
      'coverage',
      'node_modules',
      'test-results',
      'playwright-report',
      // Worktrees y prototipos de los agentes (ignorados por git; ESLint no lee .gitignore).
      '.claude',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // La lógica del núcleo, los sistemas y los socios debe ser determinista: todo el azar
    // pasa por el generador con semilla de src/core/rng.ts. La vista de un socio dibuja y puede
    // usar el reloj del navegador.
    files: ['src/core/**/*.ts', 'src/systems/**/*.ts', 'src/data/**/*.ts', 'src/partners/**/*.ts'],
    ignores: ['src/partners/**/view/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Usa el generador con semilla de src/core/rng.ts.' },
        { object: 'Date', property: 'now', message: 'El núcleo recibe el tiempo como parámetro.' },
      ],
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);

import { defineConfig } from 'vitest/config';

// La ruta base debe coincidir con el nombre del repositorio en GitHub Pages
// (https://<usuario>.github.io/micelio/); con dominio propio sería '/'.
export default defineConfig({
  base: '/micelio/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    // scripts/budget.ts atribuye cada trozo a su paquete con el manifiesto (fase 9).
    manifest: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

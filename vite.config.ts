import { defineConfig } from 'vitest/config';
import { serviceWorkerPlugin } from './scripts/service-worker.ts';

// Dos builds (ARCHITECTURE.md §4.31):
// - la web, en GitHub Pages: la ruta base es el nombre del repositorio
//   (https://<usuario>.github.io/micelio/; con dominio propio sería '/'), con el service worker
//   que deja jugar sin conexión;
// - `--mode native`, para la app de Android (Capacitor): rutas relativas, porque la app sirve los
//   archivos desde su propia raíz, y sin service worker, porque ya están en el teléfono.
export default defineConfig(({ mode }) => {
  const native = mode === 'native';
  return {
    base: native ? './' : '/micelio/',
    plugins: native ? [] : [serviceWorkerPlugin('public')],
    build: {
      target: 'es2022',
      outDir: native ? 'dist-native' : 'dist',
      assetsInlineLimit: 0,
      // scripts/budget.ts atribuye cada trozo a su paquete con el manifiesto (fase 9).
      manifest: true,
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});

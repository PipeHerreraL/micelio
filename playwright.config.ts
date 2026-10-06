import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de navegador (tests/e2e). Corren contra el build de producción servido con
 * `vite preview`, en tres motores (Chromium, Firefox y WebKit, que es el de Safari) y con
 * emulación de móvil. En local, Chromium es el Edge instalado en Windows para no descargar
 * otro navegador; en CI se usa el Chromium de Playwright.
 */
const CI = Boolean(process.env.CI);
const PORT = 4174;
/** Servidor de desarrollo: solo ahí existe `?pseudo` (tests/e2e/helpers.ts, DEV_URL). */
const DEV_PORT = 4175;
const chromiumChannel = CI ? {} : { channel: 'msedge' as const };

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  // La medición de fps solo corre con `npm run perf` (un trabajador, sin otras pruebas a la
  // vez): en paralelo con el resto, los tiempos de frame no significan nada.
  testIgnore: process.env.npm_lifecycle_event === 'perf' ? [] : ['**/perf.spec.ts'],
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}/micelio/`,
    // El juego detecta el idioma del navegador: las pruebas parten en español.
    locale: 'es-ES',
    // El service worker (app instalable) se bloquea salvo en tests/e2e/pwa.spec.ts: guardaría el
    // juego en caché entre recargas y lo que intercepta page.route no le llegaría.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/micelio/`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    // El pseudoidioma (textos un 40 % más largos) no llega al build: las pruebas que revisan con él
    // que nada se corta a 375 px (fase 10) abren el juego en el servidor de desarrollo.
    {
      command: `npx vite --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}/micelio/`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...chromiumChannel, viewport: { width: 1280, height: 760 } },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 760 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 760 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], ...chromiumChannel } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'] } },
  ],
});

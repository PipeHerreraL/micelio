import { expect, test, type Page } from '@playwright/test';
import { isMobile, seedSave, stateWith } from './helpers.ts';

/**
 * App instalable (ARCHITECTURE.md §4.31). El resto de pruebas bloquea el service worker
 * (playwright.config.ts): aquí se deja actuar.
 */
test.use({ serviceWorkers: 'allow' });

/** Espera a que el service worker controle la página (tras instalarse, una recarga). */
async function controlled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

test('Chromium la da por instalable: manifiesto, iconos y service worker sin errores', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'chromium',
    'Las comprobaciones de instalación son del protocolo de Chromium.',
  );
  await page.goto('./');
  await controlled(page);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  // Los contextos de Playwright son de incógnito, donde Chrome nunca instala: ese no cuenta.
  expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== 'in-incognito')).toEqual([]);
  const manifest = (await cdp.send('Page.getAppManifest')) as { errors: unknown[]; url: string };
  expect(manifest.url).toMatch(/manifest\.webmanifest$/);
  expect(manifest.errors).toEqual([]);
});

test('sin conexión el juego vuelve a cargar, con su partida y con lo que llega aparte', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== 'chromium' && info.project.name !== 'firefox', 'Dos motores bastan.');
  await seedSave(
    page,
    stateWith((s) => {
      s.owned.hypha = 12;
      s.nutrients = 4321;
    }),
  );
  await page.goto('./');
  await controlled(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.core__button')).toBeVisible();
  await expect(page.locator('.gen__name').first()).toHaveText('Hifa');
  // Un trozo que solo se pide más tarde (las noticias en inglés) también está guardado.
  const files = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys()).find((k) => k.startsWith('micelio-')) ?? '');
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(files.some((f) => /\/assets\/plasmodium-view-[\w-]+\.js$/.test(f))).toBe(true);
  expect(files).toContain('/micelio/index.html');
  await context.setOffline(false);
});

test('en Ajustes, el móvil dice cómo instalarla: el .apk en Android y Safari en el iPhone', async ({
  page,
}, info) => {
  test.skip(!isMobile(info.project.name), 'Solo en móvil.');
  await seedSave(
    page,
    stateWith((s) => {
      s.owned.hypha = 3;
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Ajustes/ }).tap();
  const section = page.locator('#panel-settings .settings__section', { hasText: 'Instalar la app' });
  await expect(section).toBeVisible();
  const apk = page.locator('#setting-install-apk');
  if (info.project.name === 'mobile-chromium') {
    await expect(apk).toBeVisible();
    await expect(apk).toHaveAttribute('href', /releases\/latest\/download\/micelio\.apk$/);
  } else {
    await expect(apk).toBeHidden();
    await expect(page.locator('#setting-install-text')).toContainText('Añadir a pantalla de inicio');
  }
});

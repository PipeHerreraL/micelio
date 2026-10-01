import { expect, test } from '@playwright/test';
import { randomRange } from '../../src/core/rng.ts';
import { SAVE_KEY } from '../../src/systems/save.ts';
import { isMobile, savedState, seedSave, stateWith } from './helpers.ts';

/**
 * Una prueba por cada bug del diario que necesitaba un navegador real (docs/BUG-JOURNAL.md,
 * tabla «sin nada que los sostenga»). Cada nombre dice el comportamiento que garantiza.
 */

const HOUR = 3600 * 1000;

/** Una semilla con la que la próxima gota cae en el centro (x e y entre 0.45 y 0.55). */
function centreSeed(): number {
  for (let seed = 1; seed < 100_000; seed += 1) {
    const holder = { rngSeed: seed };
    const x = randomRange(holder, 0.1, 0.9);
    const y = randomRange(holder, 0.1, 0.9);
    if (Math.abs(x - 0.5) < 0.05 && Math.abs(y - 0.5) < 0.05) return seed;
  }
  throw new Error('Sin semilla');
}

// BUG-JOURNAL #4
test('una pestaña que arranca oculta recibe el tiempo que estuvo oculta al mostrarse', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  // 10 Hifas: 10 · 0.1 = 1 N/s.
  await seedSave(
    page,
    stateWith((s) => {
      s.owned.hypha = 10;
    }),
  );
  // El reloj falso va primero: así el requestAnimationFrame que se retiene abajo es el suyo, y
  // adelantar 3 h no dispara frames mientras la página está oculta.
  await page.clock.install();
  // La página nace oculta: document.hidden es cierto y no hay frames hasta mostrarse, como en
  // una pestaña abierta en segundo plano.
  await page.addInitScript(() => {
    const w = window as unknown as { __hidden: boolean; __frames: FrameRequestCallback[] };
    w.__hidden = true;
    w.__frames = [];
    Object.defineProperty(Document.prototype, 'hidden', { get: () => w.__hidden });
    Object.defineProperty(Document.prototype, 'visibilityState', {
      get: () => (w.__hidden ? 'hidden' : 'visible'),
    });
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      if (w.__hidden) {
        w.__frames.push(cb);
        return 0;
      }
      return raf(cb);
    };
  });
  await page.goto('./');
  await page.clock.fastForward(3 * HOUR);
  await page.evaluate(() => {
    const w = window as unknown as { __hidden: boolean; __frames: FrameRequestCallback[] };
    w.__hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    for (const cb of w.__frames.splice(0)) window.requestAnimationFrame(cb);
  });
  // 3 h al 100 % con 1 N/s son 10 800 N (un poco más con el bono de los logros).
  await expect
    .poll(async () => (await savedState(page)).nutrients, { timeout: 5000 })
    .toBeGreaterThanOrEqual(10_700);
});

// BUG-JOURNAL #6
test('el número flotante del clic se ve sobre el núcleo, sin recortarse', async ({ page }) => {
  await page.goto('./');
  await page.locator('.core__button').click();
  const floater = page.locator('.floater.is-active').first();
  await expect(floater).toHaveText('+1');
  // La capa no vive dentro del escenario, que recorta lo que sale de él.
  await expect(page.locator('.stage .floaters')).toHaveCount(0);
  const box = await floater.boundingBox();
  const core = await page.locator('.core__button').boundingBox();
  const viewport = page.viewportSize();
  expect(box && core && viewport).toBeTruthy();
  if (!box || !core || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  // Aparece sobre el núcleo, no en otra columna.
  expect(Math.abs(box.x + box.width / 2 - (core.x + core.width / 2))).toBeLessThan(core.width);
});

// BUG-JOURNAL #7
test('en el móvil la gota que cae en el centro no queda debajo del núcleo y se puede atrapar', async ({
  page,
}, info) => {
  test.skip(!isMobile(info.project.name), 'El núcleo solo tapa el escenario en móvil y tableta.');
  // Al cargar, una gota guardada se evapora (no hay lluvia offline): se fuerza una gota en
  // vivo, con una semilla cuyo sorteo la pone en el centro del escenario.
  await seedSave(
    page,
    stateWith((s) => {
      s.owned.hypha = 5;
      s.nutrients = 50;
      s.rain.nextIn = 0.3;
      s.rngSeed = centreSeed();
    }),
  );
  await page.goto('./');
  const drop = page.getByRole('button', { name: 'Atrapar la gota de lluvia' });
  await expect(drop).toBeVisible();
  const d = await drop.boundingBox();
  const c = await page.locator('.core__button').boundingBox();
  expect(d && c).toBeTruthy();
  if (!d || !c) return;
  const overlaps = d.x < c.x + c.width && d.x + d.width > c.x && d.y < c.y + c.height && d.y + d.height > c.y;
  expect(overlaps).toBe(false);
  // La gota se encoge sin parar mientras se evapora: la comprobación de «estable» de
  // Playwright (misma caja en dos frames seguidos) falla a veces en WebKit. Un dedo no la
  // necesita; se toca su centro actual igual.
  await drop.tap({ force: true });
  expect((await savedState(page)).stats.drops).toBe(1);
});

// BUG-JOURNAL #9
test('los logros ganados offline se anuncian al cerrar el informe «Mientras no estabas…»', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  await seedSave(
    page,
    stateWith((s) => {
      s.owned.hypha = 10;
    }),
    Date.now() - 9 * HOUR,
  );
  await page.goto('./');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Mientras no estabas');
  const live = page.locator('[aria-live="polite"]');
  // Con el modal abierto la región es inerte: el anuncio espera.
  await page.waitForTimeout(300);
  await expect(live).not.toContainText('Sin prisa');
  await dialog.getByRole('button', { name: 'Seguir creciendo' }).click();
  await expect(live).toContainText('Logro: Sin prisa');
});

// BUG-JOURNAL #10
test('el aviso de otra pestaña sobrevive a cambiar de idioma', async ({ page, context }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  await seedSave(
    page,
    stateWith((s) => {
      s.nutrients = 50;
      s.owned.hypha = 2;
    }),
  );
  await page.goto('./');
  // Otra pestaña del mismo juego toma el guardado.
  const other = await context.newPage();
  await other.goto('./');
  const warning = page.locator('.toast--sticky');
  await expect(warning).toContainText('otra pestaña');
  await page.getByRole('tab', { name: /Ajustes/ }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.toast--sticky')).toContainText('another tab');
  await other.close();
});

// BUG-JOURNAL #11
test('borrar la partida tras un guardado dañado sin copia sí guarda la partida nueva', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  // Guardado dañado y sin sitio para la copia de respaldo.
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('micelio:e2e-seeded')) {
      localStorage.setItem(key, '{roto');
      sessionStorage.setItem('micelio:e2e-seeded', '1');
    }
    const { setItem } = Object.getOwnPropertyDescriptors(Storage.prototype);
    const original = setItem.value as (this: Storage, k: string, v: string) => void;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k === `${key}:backup`) throw new DOMException('Sin espacio', 'QuotaExceededError');
      original.call(this, k, v);
    };
  }, SAVE_KEY);
  await page.goto('./');
  await expect(page.locator('.toast--sticky')).toContainText('no había espacio');
  // Mientras tanto no se pisa el guardado dañado.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe('{roto');

  const core = page.locator('.core__button');
  for (let i = 0; i < 5; i += 1) await core.click();
  await page.getByRole('tab', { name: /Ajustes/ }).click();
  await page.locator('#setting-wipe-input').fill('BORRAR');
  await page.getByRole('button', { name: 'Borrar partida' }).click();
  // El aviso se ve en la pila de avisos (también se anuncia, por eso se busca ahí).
  await expect(page.locator('.toasts').getByText('Partida borrada')).toBeVisible();
  const raw = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  expect(raw?.startsWith('{"version"')).toBe(true);
});

// BUG-JOURNAL #12
test('en escritorio la página no se desplaza más allá de la ventana', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'En móvil la página se desplaza a propósito.');
  await seedSave(
    page,
    stateWith((s) => {
      s.nutrients = 5e6;
      s.owned.hypha = 30;
      s.owned.rhizomorph = 10;
      s.achievements = ['own.hypha.1', 'own.rhizomorph.1', 'lifetime.1'];
    }),
  );
  await page.goto('./');
  for (const tab of [/Generadores/, /Logros/, /Estadísticas/]) {
    await page.getByRole('tab', { name: tab }).click();
    const [scroll, height] = await page.evaluate(() => [
      document.documentElement.scrollHeight,
      window.innerHeight,
    ]);
    expect(scroll).toBeLessThanOrEqual(height + 1);
  }
});

// BUG-JOURNAL #13
test('tras borrar la partida, Ajustes sigue a mano para importar un respaldo', async ({ page }) => {
  await seedSave(
    page,
    stateWith((s) => {
      s.owned.hypha = 3;
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Ajustes/ }).click();
  await page.locator('#setting-wipe-input').fill('BORRAR');
  await page.getByRole('button', { name: 'Borrar partida' }).click();
  await expect(page.getByRole('tab', { name: /Ajustes/ })).toBeVisible();
  await expect(page.locator('#setting-import-text')).toBeVisible();
});

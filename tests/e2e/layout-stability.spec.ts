import { expect, test, type Locator, type Page } from '@playwright/test';
import { quoteGenerator } from '../../src/core/economy.ts';
import { isMobile, savedState, seedSave, stateWith } from './helpers.ts';

/**
 * Peticiones del usuario tras la versión 1.4.0 (BUG-JOURNAL #20 y #21): en el móvil, al bajar a
 * las pestañas no había con qué absorber; y al comprar un generador o una mejora la lista saltaba.
 */

/**
 * Cajas (y, alto) de todas las filas visibles de `selector`, en orden. La y es de la página, no
 * de la ventana: si la página se acorta y el navegador recoloca el desplazamiento, eso no es un
 * salto de la lista.
 */
async function boxes(page: Page, selector: string): Promise<{ y: number; height: number }[]> {
  return page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { y: r.top + window.scrollY, height: r.height };
      }),
  );
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('Sin caja');
  return b;
}

/** Una partida con cuatro generadores: la página da para bajar bastante por debajo del núcleo. */
function longGame(): ReturnType<typeof stateWith> {
  return stateWith((s) => {
    s.nutrients = 5e5;
    s.owned.hypha = 30;
    s.owned.rhizomorph = 10;
    s.owned.primordium = 5;
    s.owned.mushroom = 2;
  });
}

/** Desplaza la página para que el borde inferior del núcleo quede `below` px bajo la cabecera fija. */
async function scrollCoreUnderHud(page: Page, below: number): Promise<void> {
  await page.evaluate((gap) => {
    const core = document.querySelector('.core__button')?.getBoundingClientRect();
    const hud = document.querySelector('.layout__hud')?.getBoundingClientRect();
    if (!core || !hud) throw new Error('Falta el núcleo o la cabecera');
    window.scrollTo(0, core.bottom + window.scrollY - (hud.height + gap));
  }, below);
}

test('por debajo de 1024 px, al bajar a las pestañas aparece el núcleo de bolsillo, absorbe y se va al volver arriba', async ({
  page,
}, info) => {
  const mobile = isMobile(info.project.name);
  // En los perfiles de escritorio, la disposición de tableta (un móvil en horizontal): sin
  // cabecera fija ni barra de pestañas fija.
  if (!mobile) await page.setViewportSize({ width: 844, height: 390 });
  await seedSave(page, longGame());
  await page.goto('./');
  const dock = page.locator('.core-dock');
  await expect(page.locator('.core__button')).toBeVisible();
  await expect(dock).toHaveCount(1);
  await expect(dock).toBeHidden();

  if (mobile) {
    // Con la mitad del núcleo bajo la cabecera fija ya no se puede contar con él; con casi todo
    // a la vista, sí.
    await scrollCoreUnderHud(page, 100);
    await page.waitForTimeout(300);
    await expect(dock).toBeHidden();
    await scrollCoreUnderHud(page, 20);
    await expect(dock).toBeVisible();
  }

  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect(dock).toBeVisible();
  await expect(dock).toHaveAccessibleName(/Absorber nutrientes/);
  const d = await box(dock);
  const viewport = page.viewportSize();
  expect(d.width).toBeGreaterThanOrEqual(44);
  expect(d.height).toBeCloseTo(d.width, 0);
  expect(d.x + d.width).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect(d.y + d.height).toBeLessThanOrEqual(viewport?.height ?? 0);
  // En el móvil, encima de la barra de pestañas fija.
  if (mobile) expect(d.y + d.height).toBeLessThanOrEqual((await box(page.locator('.tabs__list'))).y);

  if (mobile) await dock.tap();
  else await dock.click();
  // El número flotante sale del núcleo de bolsillo, no del núcleo que quedó arriba, fuera de la vista.
  const floater = page.locator('.floater.is-active').first();
  await expect(floater).toBeVisible();
  const f = await box(floater);
  expect(Math.abs(f.x + f.width / 2 - (d.x + d.width / 2))).toBeLessThan(d.width);
  expect(f.y).toBeGreaterThan(0);
  // Y por encima de él, no detrás: con «Reducir movimiento» el número no se mueve y quedaba tapado.
  const [layer, button] = await page.evaluate(() =>
    ['.floaters', '.core-dock'].map((sel) =>
      Number(getComputedStyle(document.querySelector(sel) ?? document.body).zIndex),
    ),
  );
  expect(layer).toBeGreaterThan(button ?? Number.POSITIVE_INFINITY);
  expect((await savedState(page)).stats.clicks).toBe(1);

  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await expect(dock).toBeHidden();
});

test('en escritorio el núcleo de bolsillo no aparece: el núcleo no sale de su columna', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Solo en escritorio.');
  await seedSave(page, longGame());
  await page.goto('./');
  await page.evaluate(() => {
    document.querySelector('.tabs__panels')?.scrollTo(0, 1e6);
  });
  await page.waitForTimeout(300);
  await expect(page.locator('.core-dock')).toHaveCount(1);
  await expect(page.locator('.core-dock')).toBeHidden();
  await expect(page.locator('.core__button')).toBeInViewport();
});

for (const wide of [false, true]) {
  test(`comprar un generador hasta no llegar no cambia la altura de los botones ni mueve las filas${wide ? ' (a tres columnas)' : ''}`, async ({
    page,
  }, info) => {
    // A tres columnas: un escritorio ancho, o un móvil en horizontal (disposición de tableta).
    if (wide) {
      await page.setViewportSize(
        isMobile(info.project.name) ? { width: 844, height: 390 } : { width: 1440, height: 900 },
      );
    }
    const state = stateWith((s) => {
      s.owned.hypha = 22;
      s.owned.rhizomorph = 9;
      s.owned.primordium = 4;
      s.owned.mushroom = 1;
      s.seen.push('hint.generators', 'hint.milestone', 'hint.autobuy');
    });
    // Justo para un Primordio: tras comprarlo no llega para nada y todos los botones dicen la espera.
    state.nutrients = quoteGenerator(state, 'primordium', 1).cost + 1;
    await seedSave(page, state);
    await page.goto('./');
    const row = page.locator('.gen', { has: page.locator('.gen__name', { hasText: 'Primordio' }) });
    const buy = row.locator('.gen__buy');
    await expect(buy).toHaveAttribute('aria-disabled', 'false');
    // De verdad en la disposición que se quiere probar: botón a todo lo ancho o en su columna.
    const columns = await row.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(wide ? 3 : 2);
    await buy.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const rowsBefore = await boxes(page, '.gen');
    const buttonsBefore = await boxes(page, '.gen__buy');

    await buy.click();
    await expect(buy).toHaveAttribute('aria-disabled', 'true');
    await expect(row.locator('.buy__wait')).toHaveText(/\S/);
    const rowsAfter = await boxes(page, '.gen');
    const buttonsAfter = await boxes(page, '.gen__buy');

    expect(buttonsAfter).toHaveLength(buttonsBefore.length);
    for (const [i, before] of buttonsBefore.entries()) {
      expect(buttonsAfter[i]?.height).toBeCloseTo(before.height, 0);
    }
    for (const [i, before] of rowsBefore.entries()) {
      expect(Math.abs((rowsAfter[i]?.y ?? Number.NaN) - before.y)).toBeLessThanOrEqual(1);
      expect(Math.abs((rowsAfter[i]?.height ?? Number.NaN) - before.height)).toBeLessThanOrEqual(1);
    }
  });
}

test('una mejora recién comprada se queda en su sitio como «Comprada» y un segundo toque no compra la de abajo', async ({
  page,
}) => {
  // Reloj falso y parado: el tiempo solo avanza con runFor, así que el segundo toque cae seguro
  // dentro de los 0,9 s en que la comprada se queda. Con el reloj real (y con el falso en marcha),
  // Firefox con toda la batería en paralelo llegó tarde y compró la de abajo, que a esas alturas
  // ya está en ese sitio (y es lo que debe pasar).
  await page.clock.install();
  await seedSave(
    page,
    stateWith((s) => {
      // Con 25 Hifas aparecen las tres mejoras de la Hifa; con 1e6 N se pueden comprar todas.
      s.owned.hypha = 25;
      s.nutrients = 1e6;
      s.seen.push('hint.upgrades', 'hint.generators', 'hint.milestone');
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Mejoras/ }).click();
  const items = page.locator('.upg-item');
  await expect(items).toHaveCount(3);
  const first = items.nth(0);
  await first.scrollIntoViewIfNeeded();
  // 2 s por delante, de sobra para no pedir un instante ya pasado; el runFor deja un refresco
  // reciente para que la compra se vea como parte de la misma mirada (CONTINUOUS_MS).
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 2000);
  await page.clock.runFor(200);
  const [slot, second] = await boxes(page, '.upg');
  const target = await box(first.locator('.upg'));
  const tap = (): Promise<void> =>
    page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);

  await tap();
  await page.clock.runFor(300);
  await expect(first).toHaveClass(/is-bought/);
  await expect(first.locator('.upg__cost')).toHaveText('Comprada');
  // Nada se ha movido: la siguiente sigue donde estaba.
  expect(Math.abs(((await boxes(page, '.upg'))[1]?.y ?? Number.NaN) - (second?.y ?? 0))).toBeLessThanOrEqual(
    1,
  );
  // El segundo toque en el mismo sitio cae en la tarjeta comprada, que ya no hace nada.
  await tap();
  await page.clock.runFor(300);
  expect((await savedState(page)).upgrades).toHaveLength(1);

  // Después se pliega y la siguiente sube a su sitio.
  await page.clock.runFor(1000);
  await expect(items).toHaveCount(2);
  await expect(page.locator('.upg-item.is-bought')).toHaveCount(0);
  expect(Math.abs(((await boxes(page, '.upg'))[0]?.y ?? Number.NaN) - (slot?.y ?? 0))).toBeLessThanOrEqual(1);
  expect((await savedState(page)).upgrades).toHaveLength(1);
});

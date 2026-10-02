import { expect, test, type Locator, type Page } from '@playwright/test';
import { quoteGenerator } from '../../src/core/economy.ts';
import { isMobile, savedState, seedSave, stateWith } from './helpers.ts';

/**
 * Peticiones del usuario tras la versión 1.4.0 (BUG-JOURNAL #20 y #21): en el móvil, al bajar a
 * las pestañas no había con qué absorber; y al comprar un generador o una mejora la lista saltaba.
 * Desde la 1.4.2, la zona de arriba se queda fija (ARCHITECTURE.md §4.30).
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

/** Una partida con siete generadores a la vista: la página da para bajar también en tableta. */
function longGame(): ReturnType<typeof stateWith> {
  return stateWith((s) => {
    s.nutrients = 5e7;
    s.owned.hypha = 30;
    s.owned.rhizomorph = 10;
    s.owned.primordium = 5;
    s.owned.mushroom = 2;
    s.owned.fairyRing = 1;
    s.owned.mycorrhiza = 1;
  });
}

/** Sube la página hasta abajo del todo y devuelve cuánto bajó. */
async function scrollToEnd(page: Page): Promise<number> {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(250);
  return page.evaluate(() => window.scrollY);
}

/** Alto de lo que queda fijo arriba (franja, o solo la cabecera sin fijar). */
async function fixedBottom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--fixed-top');
    return Number.parseFloat(value) || 0;
  });
}

/** ¿Lo que hay en el centro de `selector` es el propio elemento (nada fijo lo tapa)? */
function hittable(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el?.getBoundingClientRect();
    if (!el || !r) return false;
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  }, selector);
}

// BUG-JOURNAL #20, como lo pidió el usuario tras la 1.4.1: la zona de arriba (contador y escenario
// con el núcleo) se queda fija y solo se desplaza el panel. Teléfonos en vertical (los perfiles
// móviles) y tableta (los de escritorio, a 820 × 1180 y 768 × 1024).
for (const size of [null, { width: 768, height: 1024 }] as const) {
  test(`al bajar hasta el final de la lista, la franja con el núcleo se queda arriba y se absorbe sin volver${size ? ' (768 × 1024)' : ''}`, async ({
    page,
  }, info) => {
    const mobile = isMobile(info.project.name);
    test.skip(mobile && size !== null, 'El segundo tamaño es de tableta.');
    if (!mobile) await page.setViewportSize(size ?? { width: 820, height: 1180 });
    await seedSave(page, longGame());
    await page.goto('./');
    const core = page.locator('.core__button');
    await expect(core).toBeInViewport();
    await expect(page.locator('main')).not.toHaveClass(/layout--unpinned/);
    const before = await box(core);
    const rowsBefore = await boxes(page, '.gen');

    // La página baja más que el borde inferior del núcleo: sin fijar la franja, habría salido de la vista.
    expect(await scrollToEnd(page)).toBeGreaterThan(before.y + before.height);
    const rowsAfter = await boxes(page, '.gen');
    expect(rowsAfter[0]?.y).toBeCloseTo(rowsBefore[0]?.y ?? Number.NaN, 0);
    const after = await box(core);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(await hittable(page, '.core__button')).toBe(true);
    // Lo último del panel no queda bajo la barra de pestañas del móvil.
    if (mobile) {
      const bar = await box(page.locator('.tabs__list'));
      const last = await box(page.locator('.gen >> visible=true').last());
      expect(last.y + last.height).toBeLessThanOrEqual(bar.y + 1);
    }

    if (mobile) await core.tap();
    else await core.click();
    const floater = page.locator('.floater.is-active').first();
    await expect(floater).toBeVisible();
    const f = await box(floater);
    expect(Math.abs(f.x + f.width / 2 - (after.x + after.width / 2))).toBeLessThan(after.width);
    // El número va por encima de la franja (z-index), o la franja lo taparía.
    const [layer, top] = await page.evaluate(() =>
      ['.floaters', '.layout__top'].map((sel) =>
        Number(getComputedStyle(document.querySelector(sel) ?? document.body).zIndex),
      ),
    );
    expect(layer).toBeGreaterThan(top ?? Number.POSITIVE_INFINITY);
    expect((await savedState(page)).stats.clicks).toBe(1);
  });
}

test('en horizontal, sin sitio para el panel, la franja no se fija: solo la cabecera, como antes', async ({
  page,
}, info) => {
  await page.setViewportSize(
    isMobile(info.project.name) ? { width: 740, height: 360 } : { width: 844, height: 390 },
  );
  await seedSave(page, longGame());
  await page.goto('./');
  await expect(page.locator('main')).toHaveClass(/layout--unpinned/);
  const stage = await box(page.locator('.stage'));
  await scrollToEnd(page);
  // El escenario se fue hacia arriba con la página; el panel tiene la ventana para él.
  expect((await box(page.locator('.stage'))).y).toBeLessThan(stage.y - stage.height);
  expect(await fixedBottom(page)).toBeLessThan(120);
});

test('en el móvil, al cambiar de pestaña con la lista abajo, la nueva empieza justo bajo la franja', async ({
  page,
}, info) => {
  test.skip(!isMobile(info.project.name), 'Solo en móvil.');
  const state = longGame();
  state.seen.push('hint.upgrades');
  await seedSave(page, state);
  await page.goto('./');
  expect(await scrollToEnd(page)).toBeGreaterThan(100);
  await page.getByRole('tab', { name: /Mejoras/ }).tap();
  await expect(page.locator('#panel-upgrades')).toBeVisible();
  const title = await box(page.locator('#panel-upgrades .tab__title'));
  const fixed = await fixedBottom(page);
  expect(title.y).toBeGreaterThanOrEqual(fixed - 1);
  expect(title.y).toBeLessThan(fixed + 80);
  expect(await hittable(page, '#panel-upgrades .tab__title')).toBe(true);
});

test('en tableta, con la lista abajo, la barra de pestañas sigue bajo la franja y se cambia con el teclado', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'La tableta, en los perfiles de escritorio.');
  await page.setViewportSize({ width: 820, height: 1180 });
  const state = longGame();
  state.seen.push('hint.upgrades');
  await seedSave(page, state);
  await page.goto('./');
  await scrollToEnd(page);
  expect(await hittable(page, '#tab-upgrades')).toBe(true);
  const strip = await box(page.locator('.layout__top'));
  expect((await box(page.locator('#tab-upgrades'))).y).toBeGreaterThanOrEqual(strip.y + strip.height - 1);
  await page.locator('#tab-generators').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-upgrades')).toBeFocused();
  // La pestaña nueva empieza a la vista, bajo la franja y la barra.
  expect(await hittable(page, '#panel-upgrades .tab__title')).toBe(true);
});

test('en el móvil, en la partida nueva la página no se desplaza hacia una franja vacía', async ({
  page,
}, info) => {
  test.skip(!isMobile(info.project.name), 'Solo en móvil.');
  await page.goto('./');
  await expect(page.locator('main')).toHaveClass(/layout--fresh/);
  const [scroll, height] = await page.evaluate(() => [
    document.documentElement.scrollHeight,
    window.innerHeight,
  ]);
  expect(scroll).toBeLessThanOrEqual(height + 1);
  expect((await box(page.locator('.stage'))).height).toBeGreaterThanOrEqual(320);
});

test('en el móvil, escribir en Ajustes suelta la franja: el campo no queda debajo', async ({
  page,
}, info) => {
  test.skip(!isMobile(info.project.name), 'Solo en móvil.');
  await seedSave(page, longGame());
  await page.goto('./');
  await page.getByRole('tab', { name: /Ajustes/ }).tap();
  const field = page.locator('#setting-import-text');
  await field.scrollIntoViewIfNeeded();
  await field.focus();
  await expect(page.locator('main')).toHaveClass(/layout--unpinned/);
  expect(await hittable(page, '#setting-import-text')).toBe(true);
  // Al dejar de escribir se vuelve a fijar.
  await field.blur();
  await expect(page.locator('main')).not.toHaveClass(/layout--unpinned/);
});

test('en el móvil, tras escribir en Ajustes, tocar «Revisar e importar» donde iría la franja funciona', async ({
  page,
}, info) => {
  test.skip(!isMobile(info.project.name), 'Solo en móvil.');
  await seedSave(page, longGame());
  await page.goto('./');
  await page.getByRole('tab', { name: /Ajustes/ }).tap();
  const field = page.locator('#setting-import-text');
  await field.scrollIntoViewIfNeeded();
  await field.fill('esto no es un guardado');
  await expect(page.locator('main')).toHaveClass(/layout--unpinned/);
  // El botón queda arriba, donde la franja fija lo taparía si volviera en mitad del toque.
  const button = page.getByRole('button', { name: 'Revisar e importar' });
  await button.evaluate((el) => {
    window.scrollBy(0, el.getBoundingClientRect().top - 150);
  });
  await button.tap();
  await expect(page.locator('#setting-import-error')).toBeVisible();
});

test('en el móvil, los efectos van sobre el escenario: se ven con la lista abajo y acabar no mueve la lista', async ({
  page,
}, info) => {
  test.skip(!isMobile(info.project.name), 'Solo en móvil.');
  // Reloj parado en cuanto carga y una Tormenta de 8 s: la carga tarda menos de 2 s. Más larga, avanzar
  // el reloj hasta su final cuesta demasiados fotogramas en WebKit.
  await page.clock.install();
  const state = longGame();
  state.effects = [
    { kind: 'storm', remaining: 8, duration: 12 },
    { kind: 'downpour', remaining: 60, duration: 60 },
  ];
  await seedSave(page, state);
  await page.goto('./');
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  await scrollToEnd(page);
  await page.clock.runFor(200);
  const effects = page.locator('.effect');
  await expect(effects).toHaveCount(2);
  // Dentro del escenario fijo y sin tocar el núcleo.
  const stage = await box(page.locator('.stage'));
  const core = await box(page.locator('.core__button'));
  for (const effect of await effects.all()) {
    const e = await box(effect);
    expect(e.y).toBeGreaterThanOrEqual(stage.y - 1);
    expect(e.y + e.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
    expect(e.x + e.width).toBeLessThanOrEqual(core.x);
    // Se ve cuánto le queda, entero: «45 s», no «termina en…» cortado.
    const clock = effect.locator('.effect__clock');
    await expect(clock).toBeVisible();
    expect(await clock.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  const rows = await boxes(page, '.gen');
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.clock.runFor(9000);
  await expect(effects).toHaveCount(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  const after = await boxes(page, '.gen');
  for (const [i, row] of rows.entries()) expect(after[i]?.y).toBeCloseTo(row.y, 0);
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

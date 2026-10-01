import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { MUTATION_IDS } from '../../src/data/mutations.ts';
import { seedSave, stateWith } from './helpers.ts';

/**
 * BUG-JOURNAL #14: en móvil, deslizar el dedo sobre el contenido de una pestaña (generadores,
 * mejoras, árbol, ajustes) no desplazaba la página. Se simula un deslizamiento táctil real con
 * el protocolo de Chromium, así que esta prueba solo corre en el perfil móvil de Chromium.
 */

/** Desliza el dedo `dy` píxeles hacia arriba desde (x, y), como al leer hacia abajo. */
async function swipeUp(cdp: CDPSession, x: number, y: number, dy: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - (dy * i) / steps }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Vuelve arriba, desliza sobre el primer elemento de `selector` y devuelve cuánto bajó la página. */
async function scrolledFrom(page: Page, cdp: CDPSession, selector: string): Promise<number> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(150);
  const box = await page.locator(`${selector} >> visible=true`).first().boundingBox();
  if (!box) throw new Error(`Sin caja para ${selector}`);
  const viewport = page.viewportSize();
  const y = Math.min(box.y + box.height / 2, (viewport?.height ?? 800) - 120);
  await swipeUp(cdp, box.x + Math.min(box.width / 2, 60), y, 200);
  await page.waitForTimeout(400);
  return page.evaluate(() => window.scrollY);
}

for (const size of [
  { name: 'móvil', viewport: null },
  { name: 'tableta', viewport: { width: 820, height: 1180 } },
] as const) {
  test(`en ${size.name}, deslizar sobre el contenido de cualquier pestaña desplaza la página`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile-chromium', 'El toque simulado usa el protocolo de Chromium.');
    if (size.viewport) await page.setViewportSize(size.viewport);
    await seedSave(
      page,
      stateWith((s) => {
        s.nutrients = 5e5;
        s.owned.hypha = 30;
        s.owned.rhizomorph = 10;
        s.owned.primordium = 5;
        s.mutations = [...MUTATION_IDS];
        s.stats.sporulations = 7;
        s.achievements = ['own.hypha.1'];
      }),
    );
    await page.goto('./');
    const cdp = await page.context().newCDPSession(page);

    expect(await scrolledFrom(page, cdp, '.gen__name')).toBeGreaterThan(50);
    expect(await scrolledFrom(page, cdp, '.segmented__option')).toBeGreaterThan(50);
    await page.getByRole('tab', { name: /Mejoras/ }).click();
    expect(await scrolledFrom(page, cdp, '.upg')).toBeGreaterThan(50);
    await page.getByRole('tab', { name: /Mutaciones/ }).click();
    expect(await scrolledFrom(page, cdp, '.mut')).toBeGreaterThan(50);
    await page.getByRole('tab', { name: /Ajustes/ }).click();
    expect(await scrolledFrom(page, cdp, '.settings__title')).toBeGreaterThan(50);
  });
}

import { expect, test } from '@playwright/test';
import { savedState, seedSave, stateWith } from './helpers.ts';

/** Prueba de humo en cada motor y tamaño: lo que un jugador hace en sus primeros minutos. */

test('al empezar solo se ven el núcleo, el contador y la indicación', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.core__button')).toBeVisible();
  await expect(page.locator('.counter__value')).toHaveText('0 N');
  await expect(page.getByText('Toca para absorber nutrientes')).toBeVisible();
  await expect(page.getByRole('tablist')).toBeHidden();
});

test('absorber suma nutrientes y comprar una Hifa la pone a producir', async ({ page }) => {
  await page.goto('./');
  const core = page.locator('.core__button');
  for (let i = 0; i < 10; i += 1) await core.click();
  await expect(page.locator('.counter__value')).toHaveText('10 N');
  // A los 5 N aparece la Hifa y con ella las pestañas.
  await expect(page.getByRole('tab', { name: /Generadores/ })).toBeVisible();
  await page.getByRole('button', { name: /Comprar 1 Hifa/ }).click();
  await expect(page.locator('.gen__owned').first()).toContainText('×1');
  await expect(page.locator('.counter__rate')).toHaveText('0,1 N/s');
});

test('la partida sigue donde estaba al recargar', async ({ page }) => {
  await page.goto('./');
  const core = page.locator('.core__button');
  for (let i = 0; i < 12; i += 1) await core.click();
  await page.getByRole('button', { name: /Comprar 1 Hifa/ }).click();
  await page.reload();
  await expect(page.locator('.gen__owned').first()).toContainText('×1');
  const state = await savedState(page);
  expect(state.owned.hypha).toBe(1);
  expect(state.stats.clicks).toBe(12);
});

test('el idioma cambia al instante, sin recargar y sin tocar la partida', async ({ page }) => {
  await seedSave(
    page,
    stateWith((s) => {
      s.nutrients = 50;
      s.owned.hypha = 3;
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Ajustes/ }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('tab', { name: /Settings/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'English' })).toBeFocused();
  const state = await savedState(page);
  expect(state.owned.hypha).toBe(3);
  expect(state.settings.locale).toBe('en');
});

test('exportar e importar devuelve la misma partida', async ({ page }) => {
  await seedSave(
    page,
    stateWith((s) => {
      s.nutrients = 1234;
      s.owned.hypha = 7;
      s.owned.rhizomorph = 2;
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Ajustes/ }).click();
  await page.getByRole('button', { name: 'Exportar partida' }).click();
  const exported = await page.locator('#setting-export-text').inputValue();
  expect(exported.length).toBeGreaterThan(100);

  // Borrar la partida y volver a traerla con el texto exportado.
  await page.locator('#setting-wipe-input').fill('BORRAR');
  await page.getByRole('button', { name: 'Borrar partida' }).click();
  expect((await savedState(page)).owned.hypha).toBe(0);

  await page.getByRole('tab', { name: /Ajustes/ }).click();
  await page.locator('#setting-import-text').fill(exported);
  await page.getByRole('button', { name: 'Revisar e importar' }).click();
  await page.getByRole('button', { name: 'Reemplazar partida' }).click();
  const state = await savedState(page);
  expect(state.owned.hypha).toBe(7);
  expect(state.owned.rhizomorph).toBe(2);
});

test('un texto inválido al importar muestra un error y no toca la partida', async ({ page }) => {
  await seedSave(
    page,
    stateWith((s) => {
      s.owned.hypha = 4;
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Ajustes/ }).click();
  await page.locator('#setting-import-text').fill('esto no es una partida');
  await page.getByRole('button', { name: 'Revisar e importar' }).click();
  await expect(page.locator('#setting-import-error')).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect((await savedState(page)).owned.hypha).toBe(4);
});

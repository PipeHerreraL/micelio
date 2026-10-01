import { expect, test } from '@playwright/test';
import { MUTATION_IDS } from '../../src/data/mutations.ts';
import { savedState, seedSave, stateWith } from './helpers.ts';

/** Fase 7 de la hoja de ruta: madurez de la red y adaptaciones, vistas en el navegador. */

test('con el árbol completo aparecen las adaptaciones y se compra un rango de Cuerpo apical', async ({
  page,
}) => {
  await seedSave(
    page,
    stateWith((s) => {
      s.nutrients = 1000;
      s.owned.hypha = 5;
      s.mutations = [...MUTATION_IDS];
      s.stats.sporulations = 7;
      s.spores = { level: 900, available: 500 };
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Mutaciones/ }).click();
  await expect(page.getByRole('heading', { name: 'Adaptaciones' })).toBeVisible();
  const buy = page.getByRole('button', { name: 'Adaptar: Cuerpo apical' });
  await expect(buy).toHaveAttribute('aria-disabled', 'false');
  await buy.click();
  await expect(page.getByText('rango 1', { exact: true })).toBeVisible();
  // 300 esporas el primer rango: quedan 200, y el nivel no baja.
  const state = await savedState(page);
  expect(state.adaptations.apicalBody).toBe(1);
  expect(state.spores).toEqual({ level: 900, available: 200 });
});

test('por encima del umbral, Esporular explica la madurez de la red con texto', async ({ page }) => {
  await seedSave(
    page,
    stateWith((s) => {
      s.nutrients = 1000;
      s.owned.hypha = 5;
      s.runEarned = 5e7;
      s.stats.sporulations = 9;
      s.spores = { level: 4000, available: 0 };
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Esporular/ }).click();
  // Nivel 4000 con umbral 1000: 1 + 0.01 · 1000 · √4 = 21 → +2000 %. En español las cifras
  // de cuatro dígitos no se agrupan (4000, no 4.000).
  await expect(page.getByText(/Nivel de esporas: 4000 \(\+2000\s?% de producción\)/)).toBeVisible();
  await expect(page.getByText(/Madurez de la red: hasta el nivel 1000 /)).toBeVisible();
});

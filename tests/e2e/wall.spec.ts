import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../../src/core/state.ts';
import { PHONES, collectErrors, cutOff, isMobile, savedState, seedRawSave } from './helpers.ts';

/**
 * El muro de la 1.5 en el navegador (fase 10): un guardado real, escrito por la v1.5.0 con la taiga y
 * el Chocó colonizados y el plasmodio en su segunda placa (tests/fixtures/save-v6-wall.json, de
 * scripts/fixtures-1.5.ts). Quien está ahí debe ver la lámina del anillo 2 y poder dispersar a la
 * pradera, también en el móvil.
 */

const dialog = (page: Page) => page.getByRole('dialog');

/**
 * El guardado del muro tal como lo escribió la 1.5, con la hora de guardado en ahora (sin informe
 * «Mientras no estabas…») y, si se pide, algún cambio en el estado.
 */
function wallSave(mutate: (state: GameState) => void = () => undefined): string {
  const save = JSON.parse(
    readFileSync(new URL('../fixtures/save-v6-wall.json', import.meta.url), 'utf8'),
  ) as { savedAt: number; state: GameState };
  save.savedAt = Date.now();
  mutate(save.state);
  return JSON.stringify(save);
}

for (const phone of PHONES) {
  test(`a ${phone.width} px, el guardado real del muro abre la lámina del anillo 2, lleva al viento y dispersa a la pradera`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    const errors = collectErrors(page);
    await seedRawSave(page, wallSave());
    await page.goto('./');
    // La lámina sale del estado, sin marca de la migración, y cabe en la pantalla.
    await expect(dialog(page).getByText('Acto III · Donde acaban los árboles')).toBeVisible();
    await expect(dialog(page).getByRole('heading', { name: 'Hierba y hielo' })).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Seguir creciendo' })).toBeFocused();
    expect(await cutOff(page, 'dialog')).toEqual([]);
    await dialog(page).getByRole('button', { name: 'Ver el viento' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole('tab', { name: /Esporular/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#wind-title')).toBeFocused();
    // Donde la 1.5 no ofrecía ningún destino, dos filas compactas.
    await expect(page.locator('.wind__go:visible')).toHaveText([
      'Dispersar hacia la pradera',
      'Dispersar hacia la tundra',
    ]);
    const heights = await page
      .locator('.wind__dest:visible')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    for (const height of heights) expect(height).toBeLessThanOrEqual(150);
    expect(await cutOff(page, '.wind')).toEqual([]);

    const go = page.getByRole('button', { name: 'Dispersar hacia la pradera' });
    await go.focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page).getByRole('button', { name: 'Quedarme aquí' })).toBeFocused();
    await expect(dialog(page).getByText('Destino: Pradera, chernozem.')).toBeVisible();
    await expect(dialog(page).getByText('El Anillo de hadas rinde ×6.')).toBeVisible();
    expect(await cutOff(page, 'dialog')).toEqual([]);
    await dialog(page).getByRole('button', { name: 'Dispersar', exact: true }).click();
    await expect(page.locator('#wind-title')).toBeFocused();
    await expect(page.locator('.stage')).toHaveAttribute('data-biome', 'prairie');
    await expect(page.locator('.caption__progress')).toHaveText('Colonización: nivel 0 de 500');
    // La llegada: Acto III, sus reglas, la meta y sus adaptaciones.
    await expect(dialog(page).getByRole('heading', { name: 'La pradera' })).toBeVisible({ timeout: 10_000 });
    await expect(dialog(page).getByText('Acto III · Donde acaban los árboles')).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Ver las adaptaciones' })).toHaveCount(1);
    await dialog(page).getByRole('button', { name: 'Empezar a crecer' }).click();
    await expect(page.locator('.core__button')).toBeFocused();
    const saved = await savedState(page);
    expect(saved.forest).toMatchObject({ biome: 'prairie', leg: 3 });
    expect(saved.chronicle).toHaveLength(3);
    expect(saved.chronicle[2]?.leftAt).not.toBeNull();
    expect(saved.seen).toContain('chapter.ring2');
    // El plasmodio sigue en su placa: dispersar no toca a los socios.
    expect(saved.partners.plasmodium?.plate).toBe(2);
    await page.getByRole('tab', { name: /Crónica/ }).click();
    await expect(page.locator('.chronicle__title')).toHaveText([
      'Bosque natal · Acto I',
      'Taiga · colonizado',
      'Selva del Chocó · colonizado',
      'Pradera · en curso',
    ]);
    expect(errors).toEqual([]);
  });
}

test('la colonización que cierra el primer anillo no lleva al viento: lo hace la lámina siguiente', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  await seedRawSave(
    page,
    wallSave((s) => {
      s.seen = s.seen.filter((key) => key !== 'chapter.colonize.choco');
    }),
  );
  await page.goto('./');
  await expect(dialog(page).getByText('Bioma colonizado')).toBeVisible();
  // Dos «Ver el viento» seguidos sobrarían: aquí solo se sigue creciendo.
  await expect(dialog(page).getByRole('button', { name: 'Ver el viento' })).toHaveCount(0);
  await expect(dialog(page).getByRole('button', { name: 'Seguir creciendo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading', { name: 'Hierba y hielo' })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Ver el viento' })).toHaveCount(1);
});

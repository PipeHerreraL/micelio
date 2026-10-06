import { expect, test, type Page } from '@playwright/test';
import { disperse } from '../../src/core/actions.ts';
import { drain } from '../../src/core/events.ts';
import type { GameState } from '../../src/core/state.ts';
import { checkColonization } from '../../src/systems/journey.ts';
import { PHONES, collectErrors, cutOff, gotoPseudo, savedState, seedSave, windState } from './helpers.ts';

/**
 * El regreso (fase 10) en el navegador: la lámina que manda a casa, la fila y la confirmación de
 * Viento, la llegada, el aviso de la esporulación que lo cumple, «La red planetaria» con su lienzo
 * y la entrada de la Crónica. En los cinco perfiles con los tamaños de dos teléfonos, y a 375 px con
 * el pseudoidioma. Los estados se construyen con las acciones del juego.
 */

const MINUTE = 60 * 1000;
const dialog = (page: Page) => page.getByRole('dialog');

/** Láminas ya vistas del viaje entero (taiga → Chocó → pradera → tundra). */
const JOURNEY_SEEN = ['taiga', 'choco', 'prairie', 'tundra'].flatMap((b) => [
  `chapter.arrive.${b}`,
  `chapter.colonize.${b}`,
]);

/** Del Acto I a la tundra colonizada, cuarto destino, por el camino del juego. */
function fourthColonized(now: number): GameState {
  return windState((s) => {
    const legs = ['taiga', 'choco', 'prairie', 'tundra'] as const;
    legs.forEach((to, i) => {
      disperse(s, { to, now: now - (60 - i * 10) * MINUTE });
      s.spores.level = 520;
      checkColonization(s, now - (55 - i * 10) * MINUTE);
    });
    drain();
    s.seen.push(...JOURNEY_SEEN, 'chapter.ring2');
  }, now);
}

/**
 * De vuelta en el natal hace 15 min, con el nivel en 368 y los nutrientes del bosque para E = 508
 * (R 4,8e13, k 18,75): esporular gana 140 y cierra El regreso.
 */
function returnAlmostDone(now: number): GameState {
  const state = fourthColonized(now);
  disperse(state, { to: 'natal', now: now - 15 * MINUTE });
  drain();
  state.spores.level = 368;
  state.forest.earned = 4.8e13 * (508 / 18.75) ** 2 * 1.0001;
  state.lifetimeEarned = 1e17;
  state.runEarned = 3e14;
  state.seen.push('chapter.return.arrive');
  return state;
}

for (const phone of PHONES) {
  test(`a ${phone.width} px, tras el cuarto bioma la lámina manda a casa, Viento ofrece volver y El regreso empieza en el natal`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    const errors = collectErrors(page);
    const now = Date.now();
    const state = fourthColonized(now);
    state.seen = state.seen.filter((k) => k !== 'chapter.colonize.tundra');
    await seedSave(page, state, now);
    await page.goto('./');
    await expect(dialog(page).getByRole('heading', { name: 'Bajo la nieve' })).toBeVisible();
    await expect(dialog(page).getByText('El viento cambia de dirección: sopla hacia casa.')).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Seguir creciendo' })).toBeFocused();
    await dialog(page).getByRole('button', { name: 'Ver el viento' }).click();
    await expect(page.locator('#wind-title')).toBeFocused();
    await expect(page.locator('.wind__go:visible')).toHaveText(['Volver al bosque natal']);
    expect(await cutOff(page, '.wind')).toEqual([]);
    const home = page.getByRole('button', { name: 'Volver al bosque natal' });
    await home.focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page).getByRole('heading', { name: '¿Volver al bosque natal?' })).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Quedarme aquí' })).toBeFocused();
    await expect(dialog(page).getByText('Destino: Bosque natal, suelo pardo.')).toBeVisible();
    // De camino a casa no vale «no se puede volver a un bioma que dejaste».
    await expect(dialog(page).getByText('no se puede volver', { exact: false })).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Volver', exact: true }).click();
    // La fila desaparece: el foco no puede caer en <body>.
    await expect(page.locator('#wind-title')).toBeFocused();
    await expect(page.locator('.stage')).toHaveAttribute('data-biome', 'natal');
    await expect(page.locator('.caption')).toContainText('El regreso: nivel 0 de 500');
    await expect(page.locator('.wind__end')).toHaveText(
      'Llega al nivel 500 en el bosque natal para cerrar el viaje.',
    );
    await expect(dialog(page).getByRole('heading', { name: 'El regreso' })).toBeVisible({ timeout: 10_000 });
    await expect(dialog(page).getByText('Epílogo')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Empezar a crecer' }).click();
    await expect(page.locator('.core__button')).toBeFocused();
    const saved = await savedState(page);
    expect(saved.forest).toMatchObject({ biome: 'natal', leg: 5 });
    expect(saved.chronicle).toHaveLength(5);
    expect(saved.chronicle[4]?.leftAt).not.toBeNull();
    expect(errors).toEqual([]);
  });

  test(`a ${phone.width} px, la esporulación que llega a 500 cierra El regreso: «La red planetaria», con su lienzo, y la Crónica la relee`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    const errors = collectErrors(page);
    const now = Date.now();
    await seedSave(page, returnAlmostDone(now), now);
    await page.goto('./');
    await page.getByRole('tab', { name: /Esporular/ }).click();
    const button = page.locator('.spore__button');
    await expect(page.locator('.spore__goal')).toBeVisible();
    await expect(page.locator('.spore__goal')).toHaveText('Esta esporulación cierra El regreso.');
    await expect(button).toHaveAttribute('aria-describedby', 'spore-goal');
    await button.click();
    await expect(dialog(page).getByText('Esta esporulación cierra El regreso.')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Esporular', exact: true }).click();
    await expect(dialog(page).getByRole('heading', { name: 'La red planetaria' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog(page).getByRole('button', { name: 'Seguir creciendo' })).toBeFocused();
    await expect(dialog(page).getByRole('button', { name: 'Ver el ciclo libre' })).toHaveCount(1);
    const band = dialog(page).locator('canvas.modal__band');
    await expect(band).toHaveAttribute('aria-hidden', 'true');
    const box = await band.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(200);
    expect(box?.height).toBe(96);
    expect(await cutOff(page, 'dialog[open]')).toEqual([]);
    // Dibujado una vez, al tamaño del lienzo (con el devicePixelRatio).
    expect(await band.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0);
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator('.caption')).toContainText('El regreso cumplido · nivel 508');
    await page.getByRole('tab', { name: /Crónica/ }).click();
    await expect(page.locator('.chronicle__title').last()).toContainText('Bosque natal · El regreso');
    await page.getByRole('button', { name: 'Releer «La red planetaria»' }).click();
    await expect(dialog(page).getByRole('heading', { name: 'La red planetaria' })).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Ver el ciclo libre' })).toHaveCount(0);
    expect((await dialog(page).locator('canvas.modal__band').boundingBox())?.width ?? 0).toBeGreaterThan(200);
    await page.keyboard.press('Escape');
    const saved = await savedState(page);
    expect(saved.chronicle).toHaveLength(6);
    expect(saved.chronicle[5]).toMatchObject({ biome: 'natal', leg: 5, leftAt: null });
    expect(saved.seen).toContain('chapter.return.close');
    expect(saved.achievements).toContain('return.1');
    expect(errors).toEqual([]);
  });
}

test('a 375 px y con textos un 40 % más largos, «La red planetaria» y la Crónica caben enteras', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[0]);
  const errors = collectErrors(page);
  const now = Date.now();
  await seedSave(page, returnAlmostDone(now), now);
  await gotoPseudo(page);
  // Con el pseudoidioma los nombres cambian: se va por los ids y las clases.
  await page.locator('#tab-sporulate').click();
  await expect(page.locator('#wind-title')).toContainText('[');
  await expect(page.locator('.spore__goal')).toBeVisible();
  expect(await cutOff(page, '.wind')).toEqual([]);
  await page.locator('.spore__button').click();
  await dialog(page).locator('.button--primary').click();
  const band = dialog(page).locator('canvas.modal__band');
  await expect(band).toBeVisible({ timeout: 10_000 });
  expect((await band.boundingBox())?.width ?? 0).toBeGreaterThan(200);
  expect(await band.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0);
  expect(await cutOff(page, 'dialog[open]')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await page.locator('#tab-chronicle').click();
  await expect(page.locator('.chronicle__cycle')).toBeVisible();
  expect(await cutOff(page, '.tab--chronicle')).toEqual([]);
  expect(errors).toEqual([]);
});

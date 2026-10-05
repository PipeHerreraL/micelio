import { expect, test, type Page } from '@playwright/test';
import { disperse, sporulate } from '../../src/core/actions.ts';
import { drain } from '../../src/core/events.ts';
import { sporeScale, sporulateRequirement } from '../../src/core/forest.ts';
import type { GameState } from '../../src/core/state.ts';
import { checkColonization } from '../../src/systems/journey.ts';
import { isMobile, savedState, seedSave, windState } from './helpers.ts';

/**
 * El ciclo libre (fase 10) en el navegador: cumplir un ciclo desde Esporular (aviso, anuncio y
 * récord en la Crónica) y sembrar con el teclado sin dejar el foco en <body>. Los estados se
 * construyen con las acciones del juego, con las fechas relativas a ahora.
 */

const MINUTE = 60 * 1000;
const dialog = (page: Page) => page.getByRole('dialog');

/** Láminas ya vistas del viaje entero, del anillo 2 y de El regreso. */
const SEEN = [
  ...['taiga', 'choco', 'prairie', 'tundra'].flatMap((b) => [`chapter.arrive.${b}`, `chapter.colonize.${b}`]),
  'chapter.ring2',
  'chapter.return.arrive',
  'chapter.return.close',
];

/** Nutrientes del bosque y de la partida para que esporular lleve el nivel local a `level`. */
function prime(s: GameState, level: number): void {
  // E = ⌊18,75 · √(L / R)⌋ con k = 18,75 (Esporas aladas).
  const earned = sporeScale(s) * (level / 18.75) ** 2 * 1.0001;
  s.lifetimeEarned = s.lifetimeEarned + earned - s.forest.earned;
  s.forest.earned = earned;
  s.runEarned = sporulateRequirement(s) * 1.01;
}

/**
 * En la taiga sembrada hace 30 min (ciclo 1), con el nivel en 368 y la partida lista para que
 * esporular gane 140 y cumpla el ciclo: el viaje entero y El regreso, por el camino del juego.
 */
function taigaCycleAlmostDone(now: number): GameState {
  return windState((s) => {
    const legs = ['taiga', 'choco', 'prairie', 'tundra'] as const;
    legs.forEach((to, i) => {
      disperse(s, { to, now: now - (300 - i * 50) * MINUTE });
      s.spores.level = 520;
      checkColonization(s, now - (290 - i * 50) * MINUTE);
    });
    disperse(s, { to: 'natal', now: now - 90 * MINUTE });
    prime(s, 520);
    sporulate(s, { now: now - 60 * MINUTE });
    disperse(s, { to: 'taiga', now: now - 30 * MINUTE });
    prime(s, 368);
    sporulate(s, { now: now - 20 * MINUTE });
    prime(s, 508);
    drain();
    s.seen.push(...SEEN);
  }, now);
}

test('la esporulación que llega a 500 cumple el ciclo: aviso, anuncio y récord en la Crónica; sembrar con el teclado deja el foco arriba', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const now = Date.now();
  await seedSave(page, taigaCycleAlmostDone(now), now);
  await page.goto('./');
  await expect(page.locator('.caption')).toContainText('Ciclo 1: nivel 368 de 500');
  await page.getByRole('tab', { name: /Esporular/ }).click();
  await expect(page.locator('.spore__goal')).toHaveText('Esta esporulación cumple el ciclo.');
  await page.locator('.spore__button').click();
  await expect(dialog(page).getByText('Esta esporulación cumple el ciclo.')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Esporular', exact: true }).click();
  await expect(page.locator('[aria-live="polite"]')).toContainText('Taiga: nuevo récord, 30 min');
  await expect(page.locator('.caption')).toContainText('Ciclo 1 cumplido · nivel 508');

  await page.getByRole('tab', { name: /Crónica/ }).click();
  const record = page.locator('ul.chronicle__records > li');
  await expect(record).toHaveCount(1);
  await expect(record.locator('p').first()).toHaveText('Taiga');
  await expect(record.locator('p').last()).toContainText('30 min');
  await expect(page.locator('.chronicle__cycle')).toContainText('1 ciclo cumplido');

  await page.getByRole('tab', { name: /Esporular/ }).click();
  const sow = page.getByRole('button', { name: 'Sembrar en la pradera' });
  await sow.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading', { name: '¿Sembrar un ciclo nuevo?' })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Quedarme aquí' })).toBeFocused();
  await expect(dialog(page).getByText('no se puede volver', { exact: false })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Sembrar', exact: true }).click();
  await expect(page.locator('#wind-title')).toBeFocused();
  await expect(page.locator('.caption')).toContainText('Ciclo 2: nivel 0 de 500');
  const saved = await savedState(page);
  expect(saved.forest).toMatchObject({ biome: 'prairie', leg: 5 });
  expect(saved.cycle).toMatchObject({ stays: 2, done: 1 });
  expect(saved.records).toHaveLength(1);
  expect(saved.chronicle).toHaveLength(6);
  expect(saved.achievements).toContain('cycle.1');
  expect(errors).toEqual([]);
});

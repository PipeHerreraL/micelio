import { expect, test, type Page } from '@playwright/test';
import { disperse, sporulate } from '../../src/core/actions.ts';
import type * as Actions from '../../src/core/actions.ts';
import { drain } from '../../src/core/events.ts';
import type * as Events from '../../src/core/events.ts';
import { sporeScale, sporulateRequirement } from '../../src/core/forest.ts';
import type { GameState } from '../../src/core/state.ts';
import type * as Network from '../../src/render/network.ts';
import { checkColonization } from '../../src/systems/journey.ts';
import {
  DEV_URL,
  PHONES,
  collectErrors,
  cutOff,
  gotoPseudo,
  isMobile,
  savedState,
  seedSave,
  windState,
} from './helpers.ts';

/**
 * El ciclo libre (fase 10) en el navegador: cumplir un ciclo desde Esporular (aviso, anuncio y
 * récord en la Crónica), sembrar con el teclado sin dejar el foco en <body>, Estadísticas a 375 px
 * (también con el pseudoidioma) y la transición del suelo al sembrar el mismo bioma. Los estados se
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

for (const phone of PHONES) {
  test(`a ${phone.width} px, la esporulación que llega a 500 cumple el ciclo: aviso, anuncio y récord en la Crónica; sembrar con el teclado deja el foco arriba`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    const errors = collectErrors(page);
    const now = Date.now();
    await seedSave(page, taigaCycleAlmostDone(now), now);
    await page.goto('./');
    await expect(page.locator('.caption__progress')).toHaveText('Ciclo 1: nivel 368 de 500');
    await page.getByRole('tab', { name: /Esporular/ }).click();
    // Cinco filas compactas, sin nada cortado.
    const heights = await page
      .locator('.wind__dest:visible')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(heights).toHaveLength(5);
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(110);
      expect(height).toBeLessThanOrEqual(150);
    }
    expect(await cutOff(page, '.tab--sporulate')).toEqual([]);
    await expect(page.locator('.spore__goal')).toBeVisible();
    await expect(page.locator('.spore__goal')).toHaveText('Esta esporulación cumple el ciclo.');
    await page.locator('.spore__button').click();
    await expect(dialog(page).getByText('Esta esporulación cumple el ciclo.')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Esporular', exact: true }).click();
    await expect(page.locator('[aria-live="polite"]')).toContainText('Taiga: nuevo récord, 30 min');
    await expect(page.locator('.caption__progress')).toHaveText('Ciclo 1 cumplido · nivel 508');
    // Cumplido, la línea del aviso ya no guarda su sitio.
    await expect(page.locator('.spore__goal')).toBeHidden();

    await page.getByRole('tab', { name: /Crónica/ }).click();
    const record = page.locator('ul.chronicle__records > li');
    await expect(record).toHaveCount(1);
    await expect(record.locator('p').first()).toHaveText('Taiga');
    await expect(record.locator('p').last()).toContainText('30 min');
    await expect(page.locator('.chronicle__cycle')).toContainText('1 ciclo cumplido');
    expect(await cutOff(page, '.tab--chronicle')).toEqual([]);

    await page.getByRole('tab', { name: /Esporular/ }).click();
    const sow = page.getByRole('button', { name: 'Sembrar en la pradera' });
    await sow.focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page).getByRole('heading', { name: '¿Sembrar un ciclo nuevo?' })).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Quedarme aquí' })).toBeFocused();
    await expect(dialog(page).getByText('no se puede volver', { exact: false })).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Sembrar', exact: true }).click();
    await expect(page.locator('#wind-title')).toBeFocused();
    await expect(page.locator('.caption__progress')).toHaveText('Ciclo 2: nivel 0 de 500');
    const saved = await savedState(page);
    expect(saved.forest).toMatchObject({ biome: 'prairie', leg: 5 });
    expect(saved.cycle).toMatchObject({ stays: 2, done: 1 });
    expect(saved.records).toHaveLength(1);
    expect(saved.chronicle).toHaveLength(6);
    expect(saved.achievements).toContain('cycle.1');
    expect(errors).toEqual([]);
  });
}

/**
 * El mismo ciclo, ya cumplido y con unos nutrientes de vida como los de cientos de ciclos (unos
 * 444 mil trillones): la cifra más larga de Estadísticas.
 */
function statsState(now: number): GameState {
  const s = taigaCycleAlmostDone(now);
  sporulate(s, { now: now - 5 * MINUTE });
  drain();
  s.lifetimeEarned = 4.44e20;
  s.stats.maxNps = 3.3e15;
  s.stats.clicks = 123_456;
  return s;
}

/** Ancho de cada etiqueta visible de Estadísticas, en px. */
function labelWidths(page: Page): Promise<number[]> {
  return page
    .locator('.stats dt:visible')
    .evaluateAll((labels) => labels.map((dt) => Math.round(dt.getBoundingClientRect().width)));
}

for (const phone of PHONES) {
  test(`a ${phone.width} px, ninguna etiqueta de Estadísticas baja de 96 px y nada se corta`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    const now = Date.now();
    await seedSave(page, statsState(now), now);
    await page.goto('./');
    await page.getByRole('tab', { name: /Estadísticas/ }).click();
    await expect(page.locator('.stats dt', { hasText: 'Ciclos cumplidos' })).toBeVisible();
    const widths = await labelWidths(page);
    expect(widths.length).toBeGreaterThan(10);
    for (const width of widths) expect(width).toBeGreaterThanOrEqual(96);
    expect(await cutOff(page, '.tab--stats')).toEqual([]);
  });
}

test('a 375 px y con textos un 40 % más largos, ninguna etiqueta de Estadísticas baja de 96 px', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[0]);
  const now = Date.now();
  await seedSave(page, statsState(now), now);
  await gotoPseudo(page);
  await page.locator('#tab-stats').click();
  await expect(page.locator('.tab--stats .tab__title')).toContainText('[');
  await expect(page.locator('.stats dt:visible').first()).toBeVisible();
  for (const width of await labelWidths(page)) expect(width).toBeGreaterThanOrEqual(96);
  expect(await cutOff(page, '.tab--stats')).toEqual([]);
  // Viento y la Crónica, con los mismos textos largos.
  await page.locator('#tab-sporulate').click();
  await expect(page.locator('.wind__dest:visible')).toHaveCount(5);
  expect(await cutOff(page, '.tab--sporulate')).toEqual([]);
  await page.locator('#tab-chronicle').click();
  await expect(page.locator('ul.chronicle__records > li')).toHaveCount(1);
  expect(await cutOff(page, '.tab--chronicle')).toEqual([]);
});

/**
 * Sembrado el Chocó tras cumplir la taiga, con la partida lista para el nivel 508: con su R
 * (5,4e14) faltan unos 1,56 mil billones para la siguiente espora, la cifra con el nombre más largo
 * de un ciclo.
 */
function chocoSown(now: number): GameState {
  const s = taigaCycleAlmostDone(now);
  sporulate(s, { now: now - 15 * MINUTE });
  disperse(s, { to: 'choco', now: now - 10 * MINUTE });
  prime(s, 508);
  drain();
  return s;
}

for (const phone of PHONES) {
  test(`a ${phone.width} px, la franja fija de arriba no cambia de alto con el nombre de la cifra de la siguiente espora`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    const now = Date.now();
    await seedSave(page, chocoSown(now), now);
    await page.goto('./');
    const next = page.locator('.counter__spores-next');
    await expect(next).toContainText('mil billones');
    // Una línea, como con «945 billones»: con dos, toda la franja (fija en el móvil) bajaba 19 px a
    // mitad de partida al cambiar el nombre de la cifra.
    const lines = await next.evaluate((el) => {
      // Un rectángulo por línea del texto.
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top))).size;
    });
    expect(lines).toBe(1);
  });
}

test('sembrar el mismo bioma lanza la transición del suelo y una red nueva', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  // La vista de la red con un lienzo de verdad: en el servidor de desarrollo se importan sus módulos.
  await page.goto(DEV_URL);
  const now = Date.now();
  const state = statsState(now);
  const result = await page.evaluate(
    async ({ raw, base }) => {
      const network = (await import(/* @vite-ignore */ `${base}src/render/network.ts`)) as typeof Network;
      const actions = (await import(/* @vite-ignore */ `${base}src/core/actions.ts`)) as typeof Actions;
      const events = (await import(/* @vite-ignore */ `${base}src/core/events.ts`)) as typeof Events;
      const s = JSON.parse(raw) as GameState;
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position: fixed; top: 0; left: 0; width: 320px; height: 200px;';
      document.body.append(canvas);
      const view = network.createNetworkView(canvas, { seed: 7, biome: s.forest.biome });
      view.resize();
      view.sync(s);
      const before = view.isTransitioning();
      actions.disperse(s, { to: s.forest.biome, now: Date.now() });
      // Los avisos de esta partida de prueba no deben llegar a la del juego, que corre en la página.
      events.drain();
      // Sin el aviso 'disperse': basta la lectura del estado, como tras una recarga a mitad de viaje.
      view.sync(s);
      const after = view.isTransitioning();
      view.destroy();
      canvas.remove();
      return { before, after, biome: s.forest.biome, stays: s.cycle.stays };
    },
    { raw: JSON.stringify(state), base: DEV_URL },
  );
  expect(result).toEqual({ before: false, after: true, biome: 'taiga', stays: 2 });
});

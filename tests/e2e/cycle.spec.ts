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
 * (5e14) faltan unos 1,4 mil billones para la siguiente espora, la cifra con el nombre más largo de
 * un ciclo.
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

/** La taiga del ciclo 1 cumplida (30 min de reloj), con la partida nueva por delante. */
function taigaCycleDone(now: number): GameState {
  const s = taigaCycleAlmostDone(now);
  sporulate(s, { now: now - 5 * MINUTE });
  drain();
  return s;
}

for (const phone of PHONES) {
  test(`a ${phone.width} px, los votos se eligen y se rompen con el teclado sin dejar el foco en <body>`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    const errors = collectErrors(page);
    const now = Date.now();
    await seedSave(page, taigaCycleDone(now), now);
    await page.goto('./');
    await page.getByRole('tab', { name: /Esporular/ }).click();
    const group = page.getByRole('group', { name: 'Votos para el próximo ciclo' });
    const noRain = group.getByRole('button', { name: 'Sin lluvia' });
    const noMutations = group.getByRole('button', { name: 'Sin mutaciones' });
    await expect(noRain).toHaveAttribute('aria-pressed', 'false');
    await noRain.focus();
    await page.keyboard.press('Space');
    await expect(noRain).toHaveAttribute('aria-pressed', 'true');
    await expect(noRain).toBeFocused();
    // El Chocó no ofrece «sin lluvia»: lo dice en su fila y su botón no siembra.
    await expect(
      page.getByText('En la selva del Chocó no se jura «sin lluvia»', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sembrar en la selva del Chocó' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await noMutations.focus();
    await page.keyboard.press('Enter');
    await expect(noMutations).toHaveAttribute('aria-pressed', 'true');
    expect(await cutOff(page, '.tab--sporulate')).toEqual([]);

    await page.getByRole('button', { name: 'Sembrar en la pradera' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page).getByText('Votos: sin lluvia y sin mutaciones.')).toBeVisible();
    // Pradera: 0,35 · 0,59 = 0,2065 de la R del ciclo.
    await expect(dialog(page).getByText(/pide el 21\s%/)).toBeVisible();
    await expect(
      dialog(page).getByText('mutaciones (dormidas hasta que las despiertes)', { exact: false }),
    ).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Quedarme aquí' })).toBeFocused();
    await dialog(page).getByRole('button', { name: 'Sembrar', exact: true }).click();
    await expect(page.locator('#wind-title')).toBeFocused();
    expect((await savedState(page)).cycle).toMatchObject({
      stays: 2,
      vows: ['noRain', 'noMutations'],
      woken: [],
    });
    // Jurados, ya no son una elección: el grupo vuelve sin marcar.
    await expect(noRain).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.wind__vowsnow')).toHaveText(
      'Votos de este ciclo: sin lluvia y sin mutaciones.',
    );

    // Romper el primero: el foco empieza en mantenerlo y luego pasa a romper el siguiente.
    await page.getByRole('button', { name: 'Romper el voto «sin lluvia»' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page).getByRole('heading', { name: '¿Romper el voto «sin lluvia»?' })).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Mantener el voto' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog(page).getByRole('button', { name: 'Romper', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Romper el voto «sin mutaciones»' })).toBeFocused();
    await expect(page.locator('[aria-live="polite"]')).toContainText(
      'Rompiste el voto «sin lluvia»: la meta sube.',
    );
    // Romper el último: el foco va al estado del ciclo, que sigue ahí.
    await page.keyboard.press('Enter');
    await expect(dialog(page).getByText('Tus mutaciones despiertan todas.')).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('#wind-status')).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    expect((await savedState(page)).cycle.vows).toEqual([]);
    expect(errors).toEqual([]);
  });
}

/**
 * Tras el ciclo de la taiga, la pradera cumplida con «solo autocompra» en 1 h 12 min: un récord con
 * un voto y un tiempo con horas y minutos, la línea más larga que suele tener una fila. Con un voto
 * que el Chocó ofrece, para que ninguna fila sume su motivo.
 */
function autoOnlyPrairie(now: number): GameState {
  const s = taigaCycleDone(now - 80 * MINUTE);
  disperse(s, { to: 'prairie', now: now - 84 * MINUTE, vows: ['autoOnly'] });
  prime(s, 520);
  sporulate(s, { now: now - 12 * MINUTE });
  drain();
  return s;
}

for (const phone of PHONES) {
  test(`a ${phone.width} px, cada fila de sembrar dice el récord de los votos marcados y sigue compacta`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    const errors = collectErrors(page);
    const now = Date.now();
    await seedSave(page, autoOnlyPrairie(now), now);
    await page.goto('./');
    await page.getByRole('tab', { name: /Esporular/ }).click();
    const recordOf = (name: string) =>
      page
        .locator('.wind__dest')
        .filter({ has: page.getByRole('button', { name, exact: true }) })
        .locator('.wind__record');
    const prairie = recordOf('Sembrar en la pradera');
    const taiga = recordOf('Sembrar en la taiga');
    // Sin votos marcados, la pradera no tiene récord: el de «solo autocompra» es de otra meta.
    await expect(prairie).toHaveText('Aún sin récord');
    await expect(taiga).toContainText('Récord: ');
    const group = page.getByRole('group', { name: 'Votos para el próximo ciclo' });
    await group.getByRole('button', { name: 'Solo autocompra' }).click();
    await expect(prairie).toHaveText('Récord con estos votos: 1 h 12 min, en 1 partida');
    await expect(taiga).toHaveText('Aún sin récord con estos votos');
    const heights = await page
      .locator('.wind__dest:visible')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(heights).toHaveLength(5);
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(110);
      expect(height).toBeLessThanOrEqual(150);
    }
    expect(await cutOff(page, '.tab--sporulate')).toEqual([]);
    expect(errors).toEqual([]);
  });
}

/**
 * En el natal del ciclo 2 con «solo autocompra» y «sin mutaciones» y unas esporas del ciclo para
 * despertar. La Red planetaria ya se conocía: el Acto I la pide.
 */
function vowCycle(now: number): GameState {
  const s = taigaCycleDone(now);
  disperse(s, { to: 'natal', now: now - 4 * MINUTE, vows: ['autoOnly', 'noMutations'] });
  // Con las Esporas aladas dormidas, k = 15: preparado para 25 con k = 18,75, el nivel llega a 20.
  prime(s, 25);
  sporulate(s, { now: now - 2 * MINUTE });
  drain();
  s.seen.push('gen.planetary.full');
  return s;
}

for (const phone of PHONES) {
  test(`a ${phone.width} px, con «sin mutaciones» el árbol se despierta con el teclado y la Red planetaria sigue en su sitio; con «solo autocompra», comprar está bloqueado`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    const errors = collectErrors(page);
    const now = Date.now();
    await seedSave(page, vowCycle(now), now);
    await page.goto('./');
    await page.getByRole('tab', { name: /Mutaciones/ }).click();
    await expect(page.locator('.mut__budget')).toHaveText(/Esporas de este ciclo para despertar: 20/);
    await expect(page.getByRole('button', { name: 'Quitina ligera, dormida' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const soil = page.getByRole('button', { name: 'Despertar: Memoria del suelo' });
    await soil.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[aria-live="polite"]')).toContainText('Despierta: Memoria del suelo.');
    await expect(page.locator('.mut__budget')).toHaveText(/despertar: 19/);
    // El nodo sigue ahí, ya despierto, con el foco: el siguiente Espacio no absorbe.
    await expect(page.getByRole('button', { name: 'Memoria del suelo, adquirida' })).toBeFocused();
    // El árbol se desplaza en horizontal dentro de su caja en el móvil (a propósito); la página, no.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);

    await page.getByRole('tab', { name: /Generadores/ }).click();
    await expect(page.locator('#gen-vow-locked')).toHaveText('Voto «solo autocompra»: la red compra sola.');
    const planetary = page.locator('.gen').last();
    await expect(planetary).toBeVisible();
    await expect(
      planetary.getByText('Duerme con «Más allá del bosque»: despiértala en Mutaciones.'),
    ).toBeVisible();
    for (const buy of await page.locator('.gen:visible .gen__buy').all()) {
      await expect(buy).toHaveAttribute('aria-disabled', 'true');
    }
    expect(await cutOff(page, '.tab--generators')).toEqual([]);
    expect((await savedState(page)).cycle.woken).toEqual(['soilMemory']);
    expect(errors).toEqual([]);
  });
}

/**
 * Cumplido un ciclo en la pradera con «sin lluvia» tras el de la taiga: el récord con el voto abre
 * la Esporada. Con esporas para comprarla.
 */
function noRainRecord(now: number): GameState {
  const s = taigaCycleDone(now);
  disperse(s, { to: 'prairie', now: now - 4 * MINUTE, vows: ['noRain'] });
  prime(s, 520);
  sporulate(s, { now: now - 2 * MINUTE });
  drain();
  s.spores.available = 2000;
  return s;
}

for (const phone of PHONES) {
  test(`a ${phone.width} px, las cosméticas de los votos salen bajo Adaptaciones, cerradas con su motivo, y la Esporada se compra con el teclado sin perder el foco`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    const errors = collectErrors(page);
    const now = Date.now();
    await seedSave(page, noRainRecord(now), now);
    await page.goto('./');
    await page.getByRole('tab', { name: /Mutaciones/ }).click();
    await expect(page.getByRole('heading', { name: 'De los votos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adaptar: Cordones negros' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(
      page.getByText('Se abre al cumplir un ciclo sin romper el voto «solo autocompra».'),
    ).toBeVisible();
    const buy = page.getByRole('button', { name: 'Adaptar: Esporada' });
    await expect(buy).toHaveAttribute('aria-disabled', 'false');
    await buy.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Esporada rosa.')).toBeVisible();
    // El botón sigue en su sitio y con el foco: el siguiente Espacio no absorbe.
    await expect(buy).toBeFocused();
    expect(await cutOff(page, '.adapt')).toEqual([]);
    const saved = await savedState(page);
    expect(saved.adaptations).toMatchObject({ sporePrint: 1, blackCords: 0, waxcaps: 0 });
    expect(saved.spores.available).toBe(1700);
    expect(errors).toEqual([]);
  });
}

test('las cosméticas se ven en el lienzo: Cordones negros, Higróforos y el color de la Esporada; sin ellas, nada cambia', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  // La vista de la red con un lienzo de verdad: en el servidor de desarrollo se importan sus módulos.
  await page.goto(DEV_URL);
  const errors = collectErrors(page);
  const state = windState((s) => {
    s.owned.rhizomorph = 40;
    s.owned.mushroom = 2;
  });
  const result = await page.evaluate(
    async ({ raw, base }) => {
      const network = (await import(/* @vite-ignore */ `${base}src/render/network.ts`)) as typeof Network;
      const random = Math.random;
      /**
       * Dibuja la red con estos rangos y devuelve sus píxeles; con `sporulate`, a media
       * esporulación, con las esporas en el aire. El azar del dibujo (esporas, pulsos, lluvia) sale
       * de la misma semilla en cada dibujo: dos dibujos solo difieren por los rangos.
       */
      const pixels = (
        ranks: { blackCords: number; waxcaps: number; sporePrint: number },
        sporulate = false,
      ): Uint8ClampedArray => {
        let seed = 42;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        const s = JSON.parse(raw) as GameState;
        Object.assign(s.adaptations, ranks);
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position: fixed; top: 0; left: 0; width: 480px; height: 300px;';
        document.body.append(canvas);
        const view = network.createNetworkView(canvas, { seed: 7, biome: s.forest.biome });
        view.setReducedMotion(!sporulate);
        view.resize();
        view.sync(s);
        view.frame(1000);
        if (sporulate) {
          // El brillo dura 1 s; después salen las esporas y la red se disuelve.
          view.onEvent({ type: 'sporulate', gained: 10, level: 10 });
          for (let t = 16; t <= 1300; t += 16) view.frame(1000 + t);
        }
        const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
        view.destroy();
        canvas.remove();
        Math.random = random;
        return data ?? new Uint8ClampedArray();
      };
      const differ = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
        let n = 0;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
        return a.length > 0 && a.length === b.length ? n : -1;
      };
      /** Píxeles cerca de un color: los de los higróforos no salen en ningún otro sitio del lienzo. */
      const near = (data: Uint8ClampedArray, [r, g, b]: [number, number, number]): number => {
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const d =
            Math.abs((data[i] ?? 0) - r) +
            Math.abs((data[i + 1] ?? 0) - g) +
            Math.abs((data[i + 2] ?? 0) - b);
          if (d < 30) n++;
        }
        return n;
      };
      const none = { blackCords: 0, waxcaps: 0, sporePrint: 0 };
      const plain = pixels(none);
      const waxcaps = pixels({ ...none, waxcaps: 3 });
      const carmine: [number, number, number] = [0xd0, 0x34, 0x4a];
      const lemon: [number, number, number] = [0xe0, 0xce, 0x45];
      const spores = pixels(none, true);
      return {
        again: differ(plain, pixels(none)),
        cords: differ(plain, pixels({ ...none, blackCords: 3 })),
        plainWax: near(plain, carmine) + near(plain, lemon),
        carmine: near(waxcaps, carmine),
        lemon: near(waxcaps, lemon),
        sporesAgain: differ(spores, pixels(none, true)),
        sporePrint: differ(spores, pixels({ ...none, sporePrint: 2 }, true)),
        // La Esporada solo tiñe las esporas: sin esporular, el lienzo es el mismo.
        sporePrintStill: differ(plain, pixels({ ...none, sporePrint: 2 })),
      };
    },
    { raw: JSON.stringify(state), base: DEV_URL },
  );
  expect(result).toMatchObject({ again: 0, plainWax: 0, sporesAgain: 0, sporePrintStill: 0 });
  expect(result.cords).toBeGreaterThan(0);
  expect(result.carmine).toBeGreaterThan(0);
  expect(result.lemon).toBeGreaterThan(0);
  expect(result.sporePrint).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

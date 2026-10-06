import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { disperse } from '../../src/core/actions.ts';
import { drain } from '../../src/core/events.ts';
import { createState, type GameState } from '../../src/core/state.ts';
import { MUTATION_IDS } from '../../src/data/mutations.ts';
import { checkColonization } from '../../src/systems/journey.ts';
import {
  PHONES,
  cutOff,
  isMobile,
  renderedLines,
  savedState,
  seedRawSave,
  seedSave,
  windState,
} from './helpers.ts';

/**
 * Viento de esporas (docs/ROADMAP.md, fases 8 y 10) en el navegador. Lo que depende del ancho (las
 * filas compactas, la cartela) corre en los cinco perfiles con los tamaños de dos teléfonos; los
 * recorridos que no dependen de él, en un perfil por motor. El muro de la 1.5, con un guardado real,
 * vive en wall.spec.ts.
 */

const HOUR = 3600 * 1000;

const dialog = (page: Page) => page.getByRole('dialog');

test('tras el informe offline sale la lámina del Acto I; cerrada no vuelve y se relee en la Crónica', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const state = windState((s) => {
    s.seen = s.seen.filter((k) => k !== 'chapter.act1');
  });
  await seedSave(page, state, Date.now() - 2 * HOUR);
  await page.goto('./');
  // Primero el informe de lo que pasó mientras no estaba; la lámina espera.
  await expect(dialog(page).getByRole('heading', { name: 'Mientras no estabas…' })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Seguir creciendo' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'El bosque completo' })).toBeVisible();
  await expect(dialog(page).getByText('Fin del Acto I')).toBeVisible();
  // El foco empieza en «Seguir creciendo», no en ir a otra pestaña.
  await expect(dialog(page).getByRole('button', { name: 'Seguir creciendo' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await savedState(page);
  await page.reload();
  await expect(page.getByRole('tab', { name: /Crónica/ })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toBeHidden();
  await page.getByRole('tab', { name: /Crónica/ }).click();
  await page.getByRole('button', { name: 'Releer: Fin del Acto I' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'El bosque completo' })).toBeVisible();
});

test('«Ver el viento» lleva a Esporular con el foco en Viento de esporas', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const state = windState((s) => {
    s.seen = s.seen.filter((k) => k !== 'chapter.act1');
  });
  await seedSave(page, state);
  await page.goto('./');
  await dialog(page).getByRole('button', { name: 'Ver el viento' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole('tab', { name: /Esporular/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#wind-title')).toBeFocused();
});

/** Altos de las filas de destino a la vista, en px. */
function rowHeights(page: Page): Promise<number[]> {
  return page
    .locator('.wind__dest:visible')
    .evaluateAll((rows) => rows.map((row) => Math.round(row.getBoundingClientRect().height)));
}

for (const phone of PHONES) {
  test(`a ${phone.width} px, las filas del viaje son compactas, sus reglas se abren con el teclado y dispersar a la taiga deja el foco arriba`, async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    await seedSave(page, windState());
    await page.goto('./');
    await page.getByRole('tab', { name: /Esporular/ }).click();
    // Fase 10: unos 110–150 px por fila, para que en el móvil quepan dos a la vista; nada se corta.
    const heights = await rowHeights(page);
    expect(heights).toHaveLength(2);
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(110);
      expect(height).toBeLessThanOrEqual(150);
    }
    expect(await cutOff(page, '.wind')).toEqual([]);
    const row = page.locator('.wind__dest:visible').first();
    const go = row.getByRole('button', { name: 'Dispersar hacia la taiga' });
    // El botón, a todo el ancho de la fila y con su objetivo de toque.
    const [rowBox, goBox] = [await row.boundingBox(), await go.boundingBox()];
    expect(goBox?.width ?? 0).toBeGreaterThanOrEqual((rowBox?.width ?? 0) - 1);
    expect(goBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    // Las reglas, plegadas: la cabecera de la fila las abre y las cierra con el teclado.
    const rules = row.locator('.wind__rules');
    await expect(rules).toBeHidden();
    const summary = row.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(rules).toBeVisible();
    await expect(rules).toContainText('Llueve la mitad');
    await page.keyboard.press('Enter');
    await expect(rules).toBeHidden();

    await go.focus();
    await page.keyboard.press('Enter');
    // Dispersar no se deshace: el foco empieza en quedarse.
    await expect(dialog(page).getByRole('button', { name: 'Quedarme aquí' })).toBeFocused();
    await expect(dialog(page).getByText('Destino: Taiga, podzol.')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Dispersar', exact: true }).click();
    // El botón del destino desaparece (ya visitado): el foco no puede caer en <body>.
    await expect(page.locator('#wind-title')).toBeFocused();
    await expect(page.locator('.stage')).toHaveAttribute('data-biome', 'taiga');
    await expect(page.locator('.caption__progress')).toHaveText('Colonización: nivel 0 de 500');
    // Tras la animación, la lámina de llegada.
    await expect(dialog(page).getByRole('heading', { name: 'La taiga' })).toBeVisible({ timeout: 10_000 });
    await dialog(page).getByRole('button', { name: 'Empezar a crecer' }).click();
    await expect(page.locator('.core__button')).toBeFocused();
    const saved = await savedState(page);
    expect(saved.forest.biome).toBe('taiga');
    expect(saved.forest.leg).toBe(1);
    expect(saved.spores).toEqual({ level: 0, available: 1725 });
    expect(saved.chronicle[0]?.leftAt).not.toBeNull();
  });
}

/** Rectángulos que se cruzan (con un píxel de margen por el redondeo). */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x + a.width > b.x + 1 && b.x + b.width > a.x + 1 && a.y + a.height > b.y + 1 && b.y + b.height > a.y + 1
  );
}

for (const viewport of [
  { name: 'móvil', size: { width: 375, height: 667 } },
  { name: 'tableta', size: { width: 820, height: 1180 } },
]) {
  test(`en ${viewport.name}, la cartela del bioma no tapa el núcleo`, async ({ page }, info) => {
    test.skip(
      info.project.name !== 'chromium' && info.project.name !== 'mobile-webkit',
      'Dos motores bastan.',
    );
    await page.setViewportSize(viewport.size);
    await seedSave(
      page,
      windState((s) => {
        s.forest = {
          ...s.forest,
          biome: 'choco',
          leg: 1,
          earned: 0,
          arrivalSporulations: 9,
          arrivalPlayTime: 12_000,
        };
        const natal = s.chronicle[0];
        if (natal) Object.assign(natal, { leftAt: Date.now() - 1000, levelReached: 1941 });
        s.seen.push('chapter.arrive.choco');
        s.spores.level = 120;
      }),
    );
    await page.goto('./');
    const caption = page.locator('.caption');
    await expect(caption).toBeVisible();
    await expect(caption).toContainText('Selva del Chocó');
    const core = await page.locator('.core__button').boundingBox();
    const box = await caption.boundingBox();
    if (!core || !box) throw new Error('Sin cajas');
    expect(overlaps(core, box)).toBe(false);
  });
}

for (const phone of PHONES) {
  test(`a ${phone.width} px, la línea compacta de la cartela no se parte en su separador ni deja «nivel» sin su cifra`, async ({
    context,
  }) => {
    // El Chocó en el viaje (nombre largo y cifra) y el natal tras el Acto I (nombre, «nivel» y cifra),
    // en los dos idiomas: «Chocó rainforest» es aún más largo. Una pestaña por caso, cada una con su
    // guardado sembrado.
    const cases = [
      { biome: 'choco', locale: 'es', text: 'Selva del Chocó · 312/500' },
      { biome: 'choco', locale: 'en', text: 'Chocó rainforest · 312/500' },
      { biome: 'natal', locale: 'es', text: 'Bosque natal · nivel 1941' },
    ] as const;
    for (const c of cases) {
      const page = await context.newPage();
      await page.setViewportSize(phone);
      await seedSave(
        page,
        windState((s) => {
          s.settings.locale = c.locale;
          if (c.biome === 'natal') return;
          s.forest = {
            ...s.forest,
            biome: 'choco',
            leg: 1,
            earned: 0,
            arrivalSporulations: 9,
            arrivalPlayTime: 12_000,
          };
          const natal = s.chronicle[0];
          if (natal) Object.assign(natal, { leftAt: Date.now() - 1000, levelReached: 1941 });
          s.seen.push('chapter.arrive.choco');
          s.spores.level = 312;
        }),
      );
      await page.goto('./');
      const compact = page.locator('.caption__compact');
      await expect(compact).toHaveText(c.text);
      const { lines, overflow } = await renderedLines(page, '.caption__compact', '.caption');
      const words = lines.map((line) => line.replace(/\u00a0/g, ' ').trim());
      expect(
        words.filter((line, i) => (i > 0 && line.startsWith('·')) || /\b(nivel|level)$/.test(line)),
        `${c.locale} ${c.biome}: ${JSON.stringify(words)}`,
      ).toEqual([]);
      expect(overflow, `${c.locale} ${c.biome}: ${JSON.stringify(words)}`).toBeLessThanOrEqual(1);
      await page.close();
    }
  });
}

test('al volver tras 24 h a la tundra, el informe dice cuánto rindió entera la red bajo la nieve', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const now = Date.now();
  // Taiga y Chocó colonizados y la tundra, tercer destino, hace 25 h, por el camino del juego.
  const state = windState((s) => {
    for (const [i, to] of (['taiga', 'choco'] as const).entries()) {
      disperse(s, { to, now: now - (40 - i * 5) * HOUR });
      s.spores.level = 520;
      checkColonization(s, now - (38 - i * 5) * HOUR);
    }
    disperse(s, { to: 'tundra', now: now - 25 * HOUR });
    drain();
    s.seen.push(
      ...['taiga', 'choco'].flatMap((b) => [`chapter.arrive.${b}`, `chapter.colonize.${b}`]),
      'chapter.ring2',
      'chapter.arrive.tundra',
    );
  }, now);
  await seedSave(page, state, now - 24 * HOUR);
  await page.goto('./');
  await expect(dialog(page).getByRole('heading', { name: 'Mientras no estabas…' })).toBeVisible();
  // Tope de 48 h (Sueño invernal y la tundra): cuentan las 24, y lo que pasa de 8 h rinde entero.
  await expect(dialog(page).getByText('Bajo la nieve, la red rindió entera durante 16 h.')).toBeVisible();
});

test('una partida de la 1.2 avanzada carga sin perder esporas por ganar ni historial', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const state: GameState = createState(77, Date.now());
  state.spores = { level: 4037, available: 812 };
  state.sporeFloor = 4037;
  state.lifetimeEarned = 1.6e13;
  state.runEarned = 2e8;
  state.nutrients = 1e8;
  state.mutations = [...MUTATION_IDS];
  state.owned.hypha = 10;
  state.stats.sporulations = 50;
  state.history = Array.from({ length: 50 }, (_, i) => ({
    sporulation: i + 1,
    duration: 600,
    spores: 10,
    endedAt: Date.now() - (50 - i) * 1000,
    biome: 'natal' as const,
  }));
  // Un guardado de la versión 4: sin bosque, Crónica ni adaptaciones de bioma.
  const { forest: _f, chronicle: _c, biomeAdaptations: _b, ...rest } = state;
  const v4 = { ...rest, history: state.history.map(({ biome: _biome, ...run }) => run) };
  await seedRawSave(page, JSON.stringify({ version: 4, savedAt: Date.now(), state: v4 }));
  await page.goto('./');
  await page.getByRole('tab', { name: /Esporular/ }).click();
  // E = ⌊18,75 · √(1,6e13 / 1e8)⌋ = 7500; menos el nivel 4037 = 3463, como en la 1.2.
  await expect(page.locator('.spore__gain')).toHaveText('Esporularías ahora: 3463 esporas');
  const saved = await savedState(page);
  expect(saved.history).toHaveLength(50);
  expect(saved.forest.biome).toBe('natal');
  expect(saved.forest.earned).toBeGreaterThanOrEqual(1.6e13);
  expect(saved.spores.available).toBe(812);
});

/** Archivo del trozo con las noticias de los biomas en español, según el manifiesto del build. */
function biomeNewsChunk(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../../dist/.vite/manifest.json', import.meta.url), 'utf8'),
  ) as Record<string, { file: string }>;
  const file = manifest['src/i18n/news/biomes/es.ts']?.file;
  if (!file) throw new Error('El build no trae el trozo de las noticias de los biomas.');
  return file;
}

test('quien no ha salido del natal no descarga las noticias de los biomas', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const chunk = biomeNewsChunk();
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await seedSave(page, windState());
  await page.goto('./');
  // Con una noticia en pantalla, el teletipo ya decidió qué catálogos necesita.
  await expect(page.locator('.news__text')).not.toHaveText('');
  expect(requested.some((url) => url.endsWith(chunk))).toBe(false);
});

test('en la taiga, el teletipo descarga las noticias de los biomas y dice una', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const now = Date.now();
  const state = windState((s) => {
    disperse(s, { to: 'taiga', now: now - HOUR });
    s.seen.push('chapter.arrive.taiga');
    // Unas compras en la taiga: sin generadores a la vista, la interfaz es la de partida nueva.
    s.owned.hypha = 10;
  }, now);
  const download = page.waitForRequest((request) => request.url().endsWith(biomeNewsChunk()));
  await seedSave(page, state);
  await page.goto('./');
  await download;
  await expect(page.locator('.news__text')).not.toHaveText('');
});

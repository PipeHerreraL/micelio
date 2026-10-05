import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { disperse } from '../../src/core/actions.ts';
import { createState, type GameState } from '../../src/core/state.ts';
import { MUTATION_IDS } from '../../src/data/mutations.ts';
import { isMobile, savedState, seedRawSave, seedSave, windState } from './helpers.ts';

/** Viento de esporas (docs/ROADMAP.md, fase 8) en el navegador. */

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

test('dispersar a la taiga cambia el suelo, abre la llegada y guarda el viaje', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  await seedSave(page, windState());
  await page.goto('./');
  await page.getByRole('tab', { name: /Esporular/ }).click();
  const go = page.getByRole('button', { name: 'Dispersar hacia la taiga' });
  await go.focus();
  await page.keyboard.press('Enter');
  // Dispersar no se deshace: el foco empieza en quedarse.
  await expect(dialog(page).getByRole('button', { name: 'Quedarme aquí' })).toBeFocused();
  await expect(dialog(page).getByText('Destino: Taiga, podzol.')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Dispersar', exact: true }).click();
  // El botón del destino desaparece (ya visitado): el foco no puede caer en <body>.
  await expect(page.locator('#wind-title')).toBeFocused();
  await expect(page.locator('.stage')).toHaveAttribute('data-biome', 'taiga');
  const caption = page.locator('.caption');
  await expect(caption).toContainText('Taiga · podzol');
  await expect(caption).toContainText('Colonización: nivel 0 de 500');
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

/**
 * En el Chocó, segundo destino, colonizado tras la taiga: el muro de la 1.5. `seen` lleva las
 * láminas de la 1.5 que se dan por vistas.
 */
function wallState(seen: readonly string[]): GameState {
  const now = Date.now();
  return windState((s) => {
    s.stats.sporulations = 24;
    s.stats.totalTime = 40_000;
    s.lifetimeEarned = 1e16;
    s.forest = {
      biome: 'choco',
      leg: 2,
      earned: 1e15,
      arrivedAt: now - 2 * HOUR,
      arrivalSporulations: 18,
      arrivalPlayTime: 30_000,
    };
    const natal = s.chronicle[0];
    if (natal) Object.assign(natal, { leftAt: now - 6 * HOUR, levelReached: 1941 });
    s.chronicle.push(
      {
        biome: 'taiga',
        leg: 1,
        arrivedAt: now - 6 * HOUR,
        colonizedAt: now - 3 * HOUR,
        sporulations: 6,
        playTime: 11_000,
        leftAt: now - 2 * HOUR,
        levelReached: 580,
      },
      {
        biome: 'choco',
        leg: 2,
        arrivedAt: now - 2 * HOUR,
        colonizedAt: now - HOUR,
        sporulations: 6,
        playTime: 8000,
        leftAt: null,
        levelReached: null,
      },
    );
    s.spores.level = 640;
    s.seen.push(...seen);
  });
}

test('en el muro sale la lámina del anillo 2, lleva al viento y se dispersa a la pradera', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  await seedSave(
    page,
    wallState([
      'chapter.arrive.taiga',
      'chapter.colonize.taiga',
      'chapter.arrive.choco',
      'chapter.colonize.choco',
    ]),
  );
  await page.goto('./');
  // El muro de la 1.5 (fase 10): la lámina sale del estado, sin marca de la migración.
  await expect(dialog(page).getByText('Acto III · Donde acaban los árboles')).toBeVisible();
  await expect(dialog(page).getByRole('heading', { name: 'Hierba y hielo' })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Seguir creciendo' })).toBeFocused();
  await dialog(page).getByRole('button', { name: 'Ver el viento' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole('tab', { name: /Esporular/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#wind-title')).toBeFocused();
  // Donde no quedaba ningún destino, ahora hay dos.
  await expect(page.locator('.wind__go:visible')).toHaveText([
    'Dispersar hacia la pradera',
    'Dispersar hacia la tundra',
  ]);
  await expect(page.getByText('No quedan biomas nuevos', { exact: false })).toBeHidden();
  const go = page.getByRole('button', { name: 'Dispersar hacia la pradera' });
  await go.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('button', { name: 'Quedarme aquí' })).toBeFocused();
  await expect(dialog(page).getByText('Destino: Pradera, chernozem.')).toBeVisible();
  await expect(dialog(page).getByText('El Anillo de hadas rinde ×6.')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Dispersar', exact: true }).click();
  await expect(page.locator('#wind-title')).toBeFocused();
  await expect(page.locator('.stage')).toHaveAttribute('data-biome', 'prairie');
  const caption = page.locator('.caption');
  await expect(caption).toContainText('Pradera · chernozem');
  await expect(caption).toContainText('Colonización: nivel 0 de 500');
  // La llegada: Acto III, sus reglas, la meta y sus adaptaciones.
  await expect(dialog(page).getByRole('heading', { name: 'La pradera' })).toBeVisible({ timeout: 10_000 });
  await expect(dialog(page).getByText('Acto III · Donde acaban los árboles')).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Ver las adaptaciones' })).toHaveCount(1);
  await dialog(page).getByRole('button', { name: 'Empezar a crecer' }).click();
  await expect(page.locator('.core__button')).toBeFocused();
  const saved = await savedState(page);
  expect(saved.forest).toMatchObject({ biome: 'prairie', leg: 3 });
  expect(saved.spores).toEqual({ level: 0, available: 1725 });
  expect(saved.chronicle[2]?.leftAt).not.toBeNull();
  expect(saved.seen).toContain('chapter.ring2');
  await page.getByRole('tab', { name: /Crónica/ }).click();
  await expect(page.locator('.chronicle__title')).toHaveText([
    'Bosque natal · Acto I',
    'Taiga · colonizado',
    'Selva del Chocó · colonizado',
    'Pradera · en curso',
  ]);
});

test('la colonización que cierra el primer anillo no lleva al viento: lo hace la lámina siguiente', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  await seedSave(page, wallState(['chapter.arrive.taiga', 'chapter.colonize.taiga', 'chapter.arrive.choco']));
  await page.goto('./');
  await expect(dialog(page).getByText('Bioma colonizado')).toBeVisible();
  // Dos «Ver el viento» seguidos sobrarían: aquí solo se sigue creciendo.
  await expect(dialog(page).getByRole('button', { name: 'Ver el viento' })).toHaveCount(0);
  await expect(dialog(page).getByRole('button', { name: 'Seguir creciendo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading', { name: 'Hierba y hielo' })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Ver el viento' })).toHaveCount(1);
});

test('al volver tras 24 h a la tundra, el informe dice cuánto rindió entera la red bajo la nieve', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const now = Date.now();
  const state = wallState([
    'chapter.arrive.taiga',
    'chapter.colonize.taiga',
    'chapter.arrive.choco',
    'chapter.colonize.choco',
    'chapter.ring2',
    'chapter.arrive.tundra',
  ]);
  // Del Chocó colonizado a la tundra, tercer destino, hace 25 h.
  const choco = state.chronicle[2];
  if (choco) Object.assign(choco, { leftAt: now - 25 * HOUR, levelReached: 640 });
  state.forest = {
    biome: 'tundra',
    leg: 3,
    earned: 0,
    arrivedAt: now - 25 * HOUR,
    arrivalSporulations: 24,
    arrivalPlayTime: 40_000,
  };
  state.spores.level = 0;
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

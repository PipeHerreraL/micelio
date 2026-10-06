import { expect, test, type Page } from '@playwright/test';
import { buyAdaptation, disperse } from '../../src/core/actions.ts';
import { drain } from '../../src/core/events.ts';
import { VOW_IDS } from '../../src/data/cycle.ts';
import { MUTATION_IDS } from '../../src/data/mutations.ts';
import {
  createPlasmodium,
  spreadConductivity,
  startHabituation,
} from '../../src/partners/plasmodium/state.ts';
import { checkActOne, checkColonization } from '../../src/systems/journey.ts';
import { reachLevel } from '../cycle-states.ts';
import { savedState, seedSave, stateWith, windState } from './helpers.ts';

/**
 * Medición de fluidez (PROMPT.md §16: 60 fps estables). Una partida avanzada (red grande,
 * pulsos, setas, árboles) y 4 s de frames medidos con requestAnimationFrame. En Chromium se
 * repite con la CPU frenada 4×, que es la aproximación habitual a un móvil de gama media.
 *
 * No corre en CI: los runners compartidos dan tiempos ruidosos. Los resultados se anotan en
 * el informe y en docs/STATUS.md.
 */

interface FrameStats {
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  over20: number;
}

async function measure(page: Page, ms: number): Promise<FrameStats> {
  return page.evaluate(async (duration) => {
    const times: number[] = [];
    await new Promise<void>((resolve) => {
      const start = performance.now();
      const step = (now: number): void => {
        times.push(now);
        if (now - start < duration) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    const gaps = times.slice(1).map((t, i) => t - (times[i] ?? t));
    const sorted = [...gaps].sort((a, b) => a - b);
    const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    const total = (times[times.length - 1] ?? 0) - (times[0] ?? 0);
    return {
      frames: gaps.length,
      fps: Math.round((gaps.length / total) * 1000 * 10) / 10,
      p50: Math.round(at(0.5) * 10) / 10,
      p95: Math.round(at(0.95) * 10) / 10,
      over20: gaps.filter((g) => g > 20).length,
    };
  }, ms);
}

/**
 * Partida avanzada. En la taiga es la misma partida un tramo después de dispersar: el bosque en
 * el tramo 1 y la entrada natal de la Crónica cerrada al irse, para que el guardado valide. El
 * suelo de la taiga lleva matas de musgo y liquen que el natal no tiene.
 */
async function advancedGame(page: Page, biome: 'natal' | 'taiga' = 'natal'): Promise<void> {
  const now = Date.now();
  await seedSave(
    page,
    stateWith((s) => {
      s.nutrients = 3e10;
      s.lifetimeEarned = 5e11;
      s.runEarned = 2e10;
      s.spores = { level: 120, available: 0 };
      s.stats.sporulations = 3;
      s.owned = {
        hypha: 120,
        rhizomorph: 100,
        primordium: 90,
        mushroom: 80,
        fairyRing: 60,
        mycorrhiza: 50,
        motherTree: 40,
        ancientForest: 30,
        malheur: 12,
        planetary: 0,
      };
      s.effects = [{ kind: 'downpour', remaining: 50, duration: 60 }];
      if (biome === 'taiga') {
        const leftAt = now - 60_000;
        s.chronicle = [
          {
            biome: 'natal',
            leg: 0,
            arrivedAt: s.stats.startedAt,
            colonizedAt: null,
            // Las tres esporulaciones de la partida cuentan como de la taiga (arrivalSporulations 0).
            sporulations: 0,
            playTime: 0,
            leftAt,
            levelReached: 120,
          },
        ];
        s.forest = {
          biome: 'taiga',
          leg: 1,
          earned: 2e10,
          arrivedAt: leftAt,
          arrivalSporulations: 0,
          arrivalPlayTime: 0,
        };
        // Las láminas del Acto I y de la llegada ya vistas: la medición no debe quedar detrás
        // de un modal.
        s.seen.push('chapter.act1', 'chapter.arrive.taiga');
      }
    }, now),
  );
  await page.goto('./');
  // Deja que la red termine de crecer y que el informe offline no tape nada.
  await page.waitForTimeout(1500);
}

test('la partida avanzada corre a 60 fps', async ({ page }, info) => {
  test.skip(Boolean(process.env.CI), 'Medición local: los runners de CI son ruidosos.');
  await advancedGame(page);
  const stats = await measure(page, 4000);
  info.annotations.push({ type: 'fps', description: JSON.stringify(stats) });
  console.log(`[${info.project.name}] ${JSON.stringify(stats)}`);
  // Mediana de frame dentro de 60 fps (16,7 ms con margen de reloj).
  expect(stats.p50).toBeLessThanOrEqual(17.5);
});

test('la misma partida avanzada en la taiga corre a 60 fps', async ({ page }, info) => {
  test.skip(Boolean(process.env.CI), 'Medición local: los runners de CI son ruidosos.');
  await advancedGame(page, 'taiga');
  const stats = await measure(page, 4000);
  info.annotations.push({ type: 'fps-taiga', description: JSON.stringify(stats) });
  console.log(`[${info.project.name} taiga] ${JSON.stringify(stats)}`);
  expect(stats.p50).toBeLessThanOrEqual(17.5);
});

test('con la CPU frenada 4× (móvil de gama media) la mediana sigue en 60 fps', async ({
  page,
  browserName,
}, info) => {
  test.skip(Boolean(process.env.CI), 'Medición local: los runners de CI son ruidosos.');
  test.skip(browserName !== 'chromium', 'El freno de CPU solo existe en el protocolo de Chromium.');
  await advancedGame(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const stats = await measure(page, 4000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  info.annotations.push({ type: 'fps-throttled', description: JSON.stringify(stats) });
  console.log(`[${info.project.name} ×4] ${JSON.stringify(stats)}`);
  expect(stats.p50).toBeLessThanOrEqual(17.5);
});

/**
 * El plasmodio (fase 9): Socios abierta en el Puente amargo (28 sitios, 59 aristas, la placa más
 * cargada de dibujo con la quinina) con su red adaptándose, y la red natal avanzada detrás.
 */
async function plasmodiumGame(page: Page): Promise<void> {
  await seedSave(
    page,
    stateWith((s) => {
      s.mutations = [...MUTATION_IDS];
      s.achievements = ['own.planetary.1'];
      s.stats.sporulations = 9;
      s.stats.totalTime = 12_000;
      s.spores = { level: 1941, available: 0 };
      s.owned = { ...s.owned, hypha: 120, rhizomorph: 100, primordium: 90, mushroom: 80, fairyRing: 60 };
      checkActOne(s);
      const p = createPlasmodium(9);
      for (let i = 0; i < 3; i += 1) {
        Object.assign(p.plates[i] ?? {}, {
          map: { score: 2, quality: 0.7, cost: 1.2, tolerance: 0.8, alive: 9, joined: 3 },
        });
      }
      p.plate = 3;
      p.conductivity = spreadConductivity(p, 3);
      p.habituation = startHabituation(3);
      Object.assign(p.plates[3] ?? {}, { foods: [4, 24, 9] });
      s.partners.plasmodium = p;
      s.seen.push('chapter.act1', 'chapter.partner.plasmodium', 'hint.partners');
      s.seen.push('chapter.plate.log', 'chapter.plate.maze', 'chapter.plate.archipelago');
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Socios/ }).click();
  await page.locator('.plate__frame').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
}

test('con la placa del plasmodio a la vista corre a 60 fps, también con la CPU frenada 4×', async ({
  page,
  browserName,
}, info) => {
  test.skip(Boolean(process.env.CI), 'Medición local: los runners de CI son ruidosos.');
  await plasmodiumGame(page);
  const stats = await measure(page, 4000);
  info.annotations.push({ type: 'fps-plasmodio', description: JSON.stringify(stats) });
  console.log(`[${info.project.name} plasmodio] ${JSON.stringify(stats)}`);
  expect(stats.p50).toBeLessThanOrEqual(17.5);
  if (browserName !== 'chromium') return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const slow = await measure(page, 4000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  info.annotations.push({ type: 'fps-plasmodio-throttled', description: JSON.stringify(slow) });
  console.log(`[${info.project.name} plasmodio ×4] ${JSON.stringify(slow)}`);
  expect(slow.p50).toBeLessThanOrEqual(17.5);
});

/**
 * Fase 10: la misma red avanzada en la tundra (permafrost con lentes de hielo, matas de liquen y
 * arbustos enanos) y en El regreso, con tres enlaces de la Red planetaria encendidos (la banda va en
 * el escenario en lugar del bosque lejano). El viaje se hace con las acciones del juego.
 */
async function phaseTenGame(page: Page, where: 'tundra' | 'return'): Promise<void> {
  const now = Date.now();
  const legs =
    where === 'tundra' ? (['taiga', 'choco'] as const) : (['taiga', 'choco', 'prairie', 'tundra'] as const);
  await seedSave(
    page,
    windState((s) => {
      legs.forEach((to, i) => {
        disperse(s, { to, now: now - (300 - i * 60) * 60_000 });
        s.spores.level = 520;
        checkColonization(s, now - (290 - i * 60) * 60_000);
      });
      disperse(s, { to: where === 'tundra' ? 'tundra' : 'natal', now: now - 30 * 60_000 });
      drain();
      s.spores.level = where === 'tundra' ? 120 : 380;
      s.nutrients = 3e10;
      s.owned = {
        hypha: 120,
        rhizomorph: 100,
        primordium: 90,
        mushroom: 80,
        fairyRing: 60,
        mycorrhiza: 50,
        motherTree: 40,
        ancientForest: 30,
        malheur: 12,
        planetary: 1,
      };
      s.effects = [{ kind: 'downpour', remaining: 50, duration: 60 }];
      s.seen.push(
        ...['taiga', 'choco', 'prairie', 'tundra'].flatMap((b) => [
          `chapter.arrive.${b}`,
          `chapter.colonize.${b}`,
        ]),
        'chapter.ring2',
        'chapter.return.arrive',
      );
    }, now),
    now,
  );
  await page.goto('./');
  await page.waitForTimeout(1500);
}

for (const where of ['tundra', 'return'] as const) {
  test(`${where === 'tundra' ? 'en la tundra' : 'en El regreso'} corre a 60 fps, también con la CPU frenada 4×`, async ({
    page,
    browserName,
  }, info) => {
    test.skip(Boolean(process.env.CI), 'Medición local: los runners de CI son ruidosos.');
    await phaseTenGame(page, where);
    await expect(page.locator('.stage')).toHaveAttribute(
      'data-biome',
      where === 'tundra' ? 'tundra' : 'natal',
    );
    const stats = await measure(page, 4000);
    info.annotations.push({ type: `fps-${where}`, description: JSON.stringify(stats) });
    console.log(`[${info.project.name} ${where}] ${JSON.stringify(stats)}`);
    expect(stats.p50).toBeLessThanOrEqual(17.5);
    if (browserName !== 'chromium') return;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const slow = await measure(page, 4000);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    info.annotations.push({ type: `fps-${where}-throttled`, description: JSON.stringify(slow) });
    console.log(`[${info.project.name} ${where} ×4] ${JSON.stringify(slow)}`);
    expect(slow.p50).toBeLessThanOrEqual(17.5);
  });
}

/**
 * Fase 10, bloque B: la misma red avanzada en un ciclo en la pradera con las tres cosméticas al
 * tercer rango (esporas púrpura, cordones con filo y núcleo grueso, nueve higróforos). Los rangos se
 * compran con la acción tras un ciclo cumplido con los tres votos; las esporas para pagarlos se
 * inyectan, como en el simulador.
 */
async function cosmeticsGame(page: Page): Promise<void> {
  const now = Date.now();
  await seedSave(
    page,
    windState((s) => {
      (['taiga', 'choco', 'prairie', 'tundra'] as const).forEach((to, i) => {
        disperse(s, { to, now: now - (400 - i * 60) * 60_000 });
        reachLevel(s, 520, now - (390 - i * 60) * 60_000);
      });
      disperse(s, { to: 'natal', now: now - 150 * 60_000 });
      reachLevel(s, 520, now - 140 * 60_000);
      disperse(s, { to: 'natal', now: now - 130 * 60_000, vows: [...VOW_IDS] });
      reachLevel(s, 520, now - 60 * 60_000);
      s.spores.available = 10_000;
      for (const id of ['sporePrint', 'blackCords', 'waxcaps'] as const) {
        for (let rank = 0; rank < 3; rank += 1) buyAdaptation(s, { id });
      }
      disperse(s, { to: 'prairie', now: now - 30 * 60_000 });
      drain();
      s.nutrients = 3e10;
      s.owned = {
        hypha: 120,
        rhizomorph: 100,
        primordium: 90,
        mushroom: 80,
        fairyRing: 60,
        mycorrhiza: 50,
        motherTree: 40,
        ancientForest: 30,
        malheur: 12,
        planetary: 1,
      };
      s.effects = [{ kind: 'downpour', remaining: 50, duration: 60 }];
      s.seen.push(
        ...['taiga', 'choco', 'prairie', 'tundra'].flatMap((b) => [
          `chapter.arrive.${b}`,
          `chapter.colonize.${b}`,
        ]),
        'chapter.ring2',
        'chapter.return.arrive',
        'chapter.return.close',
      );
    }, now),
    now,
  );
  await page.goto('./');
  await page.waitForTimeout(1500);
}

test('con las tres cosméticas al máximo corre a 60 fps, también con la CPU frenada 4×', async ({
  page,
  browserName,
}, info) => {
  test.skip(Boolean(process.env.CI), 'Medición local: los runners de CI son ruidosos.');
  await cosmeticsGame(page);
  await expect(page.locator('.stage')).toHaveAttribute('data-biome', 'prairie');
  const saved = await savedState(page);
  expect([saved.adaptations.sporePrint, saved.adaptations.blackCords, saved.adaptations.waxcaps]).toEqual([
    3, 3, 3,
  ]);
  const stats = await measure(page, 4000);
  info.annotations.push({ type: 'fps-cosmetics', description: JSON.stringify(stats) });
  console.log(`[${info.project.name} cosméticas] ${JSON.stringify(stats)}`);
  expect(stats.p50).toBeLessThanOrEqual(17.5);
  if (browserName !== 'chromium') return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const slow = await measure(page, 4000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  info.annotations.push({ type: 'fps-cosmetics-throttled', description: JSON.stringify(slow) });
  console.log(`[${info.project.name} cosméticas ×4] ${JSON.stringify(slow)}`);
  expect(slow.p50).toBeLessThanOrEqual(17.5);
});

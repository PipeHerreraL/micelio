import { expect, test, type Page } from '@playwright/test';
import { seedSave, stateWith } from './helpers.ts';

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

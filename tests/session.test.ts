import { describe, expect, it } from 'vitest';
import { buyGenerator, click } from '../src/core/actions.ts';
import { quoteGenerator } from '../src/core/economy.ts';
import { drain } from '../src/core/events.ts';
import * as num from '../src/core/num.ts';
import { computeDerived, derived } from '../src/core/selectors.ts';
import { createState } from '../src/core/state.ts';
import { tick, TICK_SECONDS } from '../src/core/tick.ts';
import { GENERATORS } from '../src/data/generators.ts';
import { loadGame, saveGame, type StorageLike } from '../src/systems/save.ts';

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

describe('sesión de juego', () => {
  it('diez minutos de juego a 20 Hz con clics y compras no producen valores imposibles y la recarga sigue donde estaba', () => {
    const start = Date.UTC(2026, 9, 1);
    const state = createState(42, start);
    const storage = memoryStorage();
    const ticks = (10 * 60) / TICK_SECONDS; // 12 000 pasos de 50 ms

    for (let i = 0; i < ticks; i += 1) {
      // 5 clics por segundo: uno cada 4 pasos.
      if (i % 4 === 0) click(state, {});
      // Una vez por segundo, compra el generador más caro que alcance.
      if (i % 20 === 0) {
        for (let g = GENERATORS.length - 1; g >= 0; g -= 1) {
          const def = GENERATORS[g];
          if (def && quoteGenerator(state, def.id, 1).affordable) {
            buyGenerator(state, { id: def.id, amount: 1 });
            break;
          }
        }
      }
      tick(state, { dt: TICK_SECONDS });
      // Guardado cada 15 s, como en el juego.
      if (i % 300 === 0) expect(saveGame(storage, state, start + i * 50)).toBe(true);
      drain();
      expect(num.isValid(state.nutrients)).toBe(true);
    }

    // El tiempo se mide con el paso fijo: 12 000 × 0.05 s = 600 s.
    expect(state.stats.totalTime).toBeCloseTo(600, 6);
    expect(state.owned.hypha).toBeGreaterThan(0);
    expect(state.owned.rhizomorph).toBeGreaterThan(0);
    // La caché no se quedó atrás en ningún momento: al final coincide con un cálculo fresco.
    expect(derived(state).production).toBeCloseTo(computeDerived(state).production, 9);

    expect(saveGame(storage, state, start + 600_000)).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.kind).toBe('loaded');
    if (loaded.kind === 'loaded') expect(loaded.save.state).toEqual(state);
  });
});

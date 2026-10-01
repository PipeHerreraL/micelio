import { describe, expect, it } from 'vitest';
import { sporulate } from '../src/core/actions.ts';
import { gain } from '../src/core/economy.ts';
import * as num from '../src/core/num.ts';
import { SPORULATE_RESET } from '../src/core/resets.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { HISTORY_LIMIT } from '../src/data/prestige.ts';
import { parseSave, saveGame, SAVE_KEY, type StorageLike } from '../src/systems/save.ts';

const NOW = Date.UTC(2026, 9, 1);

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

/** Partida lista para esporular: 1e8 N en la partida y en la vida dan 15 esporas. */
function readyToSporulate(): GameState {
  const state = createState(3, NOW);
  state.nutrients = 5e7;
  state.runEarned = 1e8;
  state.lifetimeEarned = 1e8;
  state.forest.earned = 1e8;
  state.owned.hypha = 40;
  state.owned.rhizomorph = 12;
  state.upgrades = ['hypha.u1'];
  state.effects = [{ kind: 'storm', remaining: 5, duration: 12 }];
  state.stats.runTime = 1800;
  return state;
}

describe('techo numérico', () => {
  it('sumar nutrientes cerca del máximo de number no produce Infinity y deja la cantidad en el techo', () => {
    const state = createState(1, NOW);
    // 1e308 + 1e308 = Infinity en coma flotante; con el techo queda en 1e300.
    state.nutrients = 1e308;
    gain(state, 1e308);
    expect(Number.isFinite(state.nutrients)).toBe(true);
    expect(state.nutrients).toBe(num.CEILING);
    expect(num.isValid(state.lifetimeEarned)).toBe(true);
  });

  it('guardar un estado con un valor imposible no pisa el último guardado bueno', () => {
    const storage = memoryStorage();
    const state = createState(2, NOW);
    state.nutrients = 1234;
    expect(saveGame(storage, state, NOW)).toBe('saved');
    const good = storage.data.get(SAVE_KEY);

    state.nutrients = Number.POSITIVE_INFINITY;
    expect(saveGame(storage, state, NOW + 1000)).toBe('invalid');
    expect(storage.data.get(SAVE_KEY)).toBe(good);
  });
});

describe('reinicios declarativos', () => {
  it('esporular deja cada campo «run» igual que en una partida nueva', () => {
    const state = readyToSporulate();
    sporulate(state, { now: NOW + 60_000 });
    const fresh = createState(9, NOW + 60_000);
    for (const key of Object.keys(SPORULATE_RESET) as (keyof GameState)[]) {
      if (SPORULATE_RESET[key] === 'run') expect(state[key], key).toEqual(fresh[key]);
    }
  });

  it('esporular conserva tal cual cada campo «life»', () => {
    const state = readyToSporulate();
    state.achievements = ['own.hypha.1'];
    state.seen = ['tab.generators'];
    state.settings.volume = 0.8;
    const before = structuredClone(state);
    sporulate(state, { now: NOW + 60_000 });
    for (const key of Object.keys(SPORULATE_RESET) as (keyof GameState)[]) {
      if (SPORULATE_RESET[key] !== 'life') continue;
      // Los logros pueden crecer (la propia esporulación otorga uno); lo previo se conserva.
      if (key === 'achievements')
        expect(state.achievements).toEqual(expect.arrayContaining(before.achievements));
      else expect(state[key], key).toEqual(before[key]);
    }
  });

  it('cada clave de una partida nueva está clasificada en la tabla de reinicio', () => {
    expect(Object.keys(SPORULATE_RESET).sort()).toEqual(Object.keys(createState(1, NOW)).sort());
  });
});

describe('historial de partidas', () => {
  it('esporular anota la partida que termina con su duración y sus esporas', () => {
    const state = readyToSporulate();
    sporulate(state, { now: NOW + 60_000 });
    // E(1e8) = ⌊15 · √1⌋ = 15 esporas; la partida duró 1800 s.
    expect(state.history).toEqual([
      { sporulation: 1, duration: 1800, spores: 15, endedAt: NOW + 60_000, biome: 'natal' },
    ]);
  });

  it('el historial no pasa de su tope y conserva las partidas más recientes', () => {
    const state = createState(4, NOW);
    for (let i = 1; i <= HISTORY_LIMIT + 5; i += 1) {
      // Cada esporulación necesita 1e8 N en la partida y más vida que la anterior.
      state.runEarned = 1e8;
      state.lifetimeEarned = 1e8 * i * i * 4;
      state.forest.earned = 1e8 * i * i * 4;
      state.stats.runTime = i;
      sporulate(state, { now: NOW + i });
    }
    expect(state.history).toHaveLength(HISTORY_LIMIT);
    expect(state.history[0]?.sporulation).toBe(6);
    expect(state.history.at(-1)?.sporulation).toBe(HISTORY_LIMIT + 5);
  });

  it('un guardado de la versión 2 se carga con el historial vacío', () => {
    const { history: _gone, ...older } = createState(5, NOW);
    const result = parseSave(JSON.stringify({ version: 2, savedAt: NOW, state: older }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.save.state.history).toEqual([]);
  });
});

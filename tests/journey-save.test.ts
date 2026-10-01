import { describe, expect, it } from 'vitest';
import { canSporulate, sporeGain } from '../src/core/actions.ts';
import { sporulateRequirement } from '../src/core/forest.ts';
import { derived } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { parseSave, serializeSave, SAVE_VERSION } from '../src/systems/save.ts';

/**
 * Guardado del viaje (docs/ROADMAP.md, fase 8): la migración 4 → 5 y la validación del bosque,
 * la Crónica y las adaptaciones de bioma.
 */

const NOW = Date.UTC(2026, 9, 1);
const SAVED_AT = NOW + 15_000;

/** Texto de un guardado de la versión 4 hecho a partir de un estado actual. */
function v4Text(state: GameState): string {
  const { forest: _f, chronicle: _c, biomeAdaptations: _b, ...rest } = state;
  const history = state.history.map(({ biome: _biome, ...run }) => run);
  return JSON.stringify({ version: 4, savedAt: SAVED_AT, state: { ...rest, history } });
}

/** Una partida en la taiga, primer destino, con el Acto I cerrado: un viaje válido. */
function inTaiga(): GameState {
  const s = createState(5, NOW);
  s.mutations = [...MUTATION_IDS];
  s.lifetimeEarned = 2e13;
  s.stats.sporulations = 12;
  s.stats.totalTime = 15_000;
  s.spores = { level: 120, available: 400 };
  s.forest = {
    biome: 'taiga',
    leg: 1,
    earned: 5e11,
    arrivedAt: NOW + 1000,
    arrivalSporulations: 9,
    arrivalPlayTime: 12_000,
  };
  s.chronicle = [
    {
      biome: 'natal',
      leg: 0,
      arrivedAt: NOW,
      colonizedAt: null,
      sporulations: 9,
      playTime: 11_000,
      leftAt: NOW + 1000,
      levelReached: 1941,
    },
  ];
  s.biomeAdaptations.rockEating = 1;
  s.history = [{ sporulation: 12, duration: 900, spores: 30, endedAt: NOW + 2000, biome: 'taiga' }];
  return s;
}

function textOf(state: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: SAVED_AT, state });
}

function loads(mutate: (s: GameState) => void): boolean {
  const s = inTaiga();
  mutate(s);
  return parseSave(textOf(s)).ok;
}

describe('migración 4 → 5', () => {
  it('deja la partida en el natal con los nutrientes del bosque iguales a los de vida', () => {
    const state = createState(7, NOW);
    state.lifetimeEarned = 3.5e9;
    state.stats.startedAt = NOW - 86_400_000;
    state.history = [{ sporulation: 1, duration: 2400, spores: 15, endedAt: NOW - 1000, biome: 'natal' }];
    const result = parseSave(v4Text(state));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    const loaded = result.save.state;
    expect(loaded.forest).toEqual({
      biome: 'natal',
      leg: 0,
      earned: 3.5e9,
      arrivedAt: NOW - 86_400_000,
      arrivalSporulations: 0,
      arrivalPlayTime: 0,
    });
    expect(loaded.chronicle).toEqual([]);
    expect(Object.values(loaded.biomeAdaptations)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(loaded.history).toEqual([
      { sporulation: 1, duration: 2400, spores: 15, endedAt: NOW - 1000, biome: 'natal' },
    ]);
  });

  it('una partida 1.x avanzada no pierde esporas por ganar, requisito ni producción', () => {
    const state = createState(8, NOW);
    state.spores = { level: 4037, available: 812 };
    state.sporeFloor = 4037;
    state.lifetimeEarned = 1.6e13;
    state.runEarned = 2e8;
    state.mutations = [...MUTATION_IDS];
    state.owned.hypha = 10;
    state.adaptations.apicalBody = 3;
    state.history = Array.from({ length: 50 }, (_, i) => ({
      sporulation: i + 1,
      duration: 600,
      spores: 10,
      endedAt: NOW - (50 - i) * 1000,
      biome: 'natal' as const,
    }));
    const result = parseSave(v4Text(state));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    const loaded = result.save.state;
    // E = ⌊18,75 · √(1,6e13 / 1e8)⌋ = ⌊18,75 · 400⌋ = 7500; menos el nivel 4037 = 3463.
    expect(sporeGain(loaded)).toBe(3463);
    expect(sporulateRequirement(loaded)).toBe(1e8);
    expect(canSporulate(loaded)).toBe(true);
    // 10 Hifas · 0,1 · (1 + 0,01 · 4037): el suelo de la 1.x mantiene el bono lineal.
    expect(derived(loaded).production).toBeCloseTo(41.37, 9);
    expect(loaded.history).toHaveLength(50);
    expect(loaded.adaptations.apicalBody).toBe(3);
    expect(loaded.spores).toEqual({ level: 4037, available: 812 });
  });

  it('un guardado de la versión 4 sin historial válido sigue rechazándose', () => {
    const state = createState(9, NOW);
    const raw = JSON.parse(v4Text(state)) as { state: Record<string, unknown> };
    raw.state.history = 'nada';
    expect(parseSave(JSON.stringify(raw))).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('validación del viaje', () => {
  it('una partida en la taiga con su Crónica y sus adaptaciones va y vuelve idéntica', () => {
    const state = inTaiga();
    const result = parseSave(serializeSave(state, SAVED_AT));
    expect(result).toEqual({ ok: true, save: { version: SAVE_VERSION, savedAt: SAVED_AT, state } });
  });

  it('rechaza un bioma desconocido, un tramo fuera de rango o que no casa con el bioma', () => {
    expect(loads((s) => Object.assign(s.forest, { biome: 'tundra' }))).toBe(false);
    expect(loads((s) => (s.forest.leg = 3))).toBe(false);
    expect(loads((s) => (s.forest.leg = 0))).toBe(false);
    expect(loads((s) => (s.forest.leg = 1.5))).toBe(false);
  });

  it('rechaza nutrientes del bosque negativos, no finitos o mayores que los de vida', () => {
    expect(loads((s) => (s.forest.earned = -1))).toBe(false);
    expect(loads((s) => (s.forest.earned = Number.NaN))).toBe(false);
    expect(loads((s) => (s.forest.earned = 3e13))).toBe(false);
  });

  it('rechaza marcas de llegada posteriores a las estadísticas', () => {
    expect(loads((s) => (s.forest.arrivalSporulations = 13))).toBe(false);
    expect(loads((s) => (s.forest.arrivalPlayTime = 15_001))).toBe(false);
  });

  it('rechaza una Crónica sin la entrada del bosque que se dejó, desordenada o repetida', () => {
    expect(loads((s) => (s.chronicle = []))).toBe(false);
    expect(
      loads((s) => {
        const natal = s.chronicle[0];
        if (natal) s.chronicle = [natal, { ...natal, leg: 1 }];
      }),
    ).toBe(false);
    expect(
      loads((s) => {
        const natal = s.chronicle[0];
        if (natal) s.chronicle = [{ ...natal, biome: 'taiga' }];
      }),
    ).toBe(false);
  });

  it('rechaza que el bosque que se dejó no tenga fecha de partida o nivel alcanzado', () => {
    expect(loads((s) => Object.assign(s.chronicle[0] ?? {}, { leftAt: null }))).toBe(false);
    expect(loads((s) => Object.assign(s.chronicle[0] ?? {}, { levelReached: null }))).toBe(false);
    expect(loads((s) => Object.assign(s.chronicle[0] ?? {}, { levelReached: -4 }))).toBe(false);
  });

  it('rechaza un destino colonizado sin fecha o un tramo actual con fecha de partida', () => {
    const colonized = {
      biome: 'taiga' as const,
      leg: 1,
      arrivedAt: NOW + 1000,
      colonizedAt: NOW + 9000,
      sporulations: 6,
      playTime: 3000,
      leftAt: null,
      levelReached: null,
    };
    expect(loads((s) => s.chronicle.push({ ...colonized }))).toBe(true);
    expect(loads((s) => s.chronicle.push({ ...colonized, colonizedAt: null }))).toBe(false);
    expect(loads((s) => s.chronicle.push({ ...colonized, leftAt: NOW + 9500, levelReached: 600 }))).toBe(
      false,
    );
    expect(loads((s) => s.chronicle.push({ ...colonized, biome: 'choco' }))).toBe(false);
  });

  it('rechaza conteos negativos o con decimales en la Crónica', () => {
    expect(loads((s) => Object.assign(s.chronicle[0] ?? {}, { sporulations: -1 }))).toBe(false);
    expect(loads((s) => Object.assign(s.chronicle[0] ?? {}, { sporulations: 2.5 }))).toBe(false);
  });

  it('rechaza un rango de bioma por encima del máximo o de un bioma no visitado', () => {
    expect(loads((s) => (s.biomeAdaptations.trehalose = 3))).toBe(false);
    expect(loads((s) => (s.biomeAdaptations.gongylidia = 1))).toBe(false);
  });

  it('rechaza un historial con un bioma desconocido', () => {
    expect(
      loads((s) => {
        const run = s.history[0];
        if (run) Object.assign(run, { biome: 'luna' });
      }),
    ).toBe(false);
  });

  it('cada campo nuevo que falta hace el guardado inválido', () => {
    for (const field of ['forest', 'chronicle', 'biomeAdaptations'] as const) {
      const ok = loads((s) => {
        Reflect.deleteProperty(s, field);
      });
      expect({ field, ok }).toEqual({ field, ok: false });
    }
  });
});

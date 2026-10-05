import { describe, expect, it } from 'vitest';
import { buyBiomeAdaptation, canSporulate, disperse, sporeGain, sporulate } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import { sporeScale, sporulateRequirement } from '../src/core/forest.ts';
import { derived } from '../src/core/selectors.ts';
import { createState, type ChronicleEntry, type GameState } from '../src/core/state.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { checkActOne, checkColonization } from '../src/systems/journey.ts';
import { parseSave, saveGame, serializeSave, SAVE_VERSION, type StorageLike } from '../src/systems/save.ts';

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
    // Las seis de la taiga y el Chocó (4 → 5) y las seis de la pradera y la tundra (6 → 7).
    expect(Object.values(loaded.biomeAdaptations)).toEqual(Array.from({ length: 12 }, () => 0));
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
    expect(result).toEqual({
      ok: true,
      save: { version: SAVE_VERSION, savedAt: SAVED_AT, state },
      partnersReset: [],
    });
  });

  it('rechaza un bioma desconocido, un tramo fuera de rango o que no casa con el bioma', () => {
    expect(loads((s) => Object.assign(s.forest, { biome: 'luna' }))).toBe(false);
    expect(loads((s) => (s.forest.leg = 3))).toBe(false);
    expect(loads((s) => (s.forest.leg = 5))).toBe(false);
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

describe('fechas imposibles', () => {
  it('rechaza fechas del viaje que Date no puede representar', () => {
    expect(loads((s) => Object.assign(s.chronicle[0] ?? {}, { arrivedAt: 1e16 }))).toBe(false);
    expect(loads((s) => Object.assign(s.chronicle[0] ?? {}, { leftAt: 9e15 }))).toBe(false);
    expect(loads((s) => (s.forest.arrivedAt = 1e300))).toBe(false);
    expect(loads((s) => (s.stats.startedAt = 1e16))).toBe(false);
    // El último día que Date sabe escribir sigue valiendo.
    expect(loads((s) => Object.assign(s.chronicle[0] ?? {}, { leftAt: 8.64e15 }))).toBe(true);
  });
});

describe('validación de los anillos del viaje (fase 10)', () => {
  /**
   * En la tundra, tercer destino, con la taiga y el Chocó colonizados: construido solo con
   * acciones, por el camino que el juego permite.
   */
  function inTundra(): GameState {
    const s = createState(8, NOW);
    s.mutations = [...MUTATION_IDS];
    s.achievements = ['own.planetary.1'];
    s.stats.sporulations = 9;
    s.stats.totalTime = 11_000;
    s.spores = { level: 1941, available: 2025 };
    checkActOne(s);
    const legs = [
      ['taiga', NOW + 1000],
      ['choco', NOW + 9000],
      ['tundra', NOW + 17_000],
    ] as const;
    for (const [to, at] of legs) {
      if (s.forest.leg > 0) {
        s.spores.level = 500;
        checkColonization(s, at - 1000);
      }
      disperse(s, { to, now: at });
    }
    drain();
    return s;
  }

  function loadsTundra(mutate: (s: GameState) => void): boolean {
    const s = inTundra();
    mutate(s);
    return parseSave(textOf(s)).ok;
  }

  it('una partida en la tundra, tercer destino, va y vuelve idéntica', () => {
    const state = inTundra();
    expect(state.forest).toMatchObject({ biome: 'tundra', leg: 3 });
    expect(state.chronicle.map((e) => e.biome)).toEqual(['natal', 'taiga', 'choco']);
    expect(parseSave(serializeSave(state, SAVED_AT))).toEqual({
      ok: true,
      save: { version: SAVE_VERSION, savedAt: SAVED_AT, state },
      partnersReset: [],
    });
  });

  it('rechaza la pradera o la tundra de primer o segundo destino', () => {
    expect(loads((s) => Object.assign(s.forest, { biome: 'prairie' }))).toBe(false);
    expect(loads((s) => Object.assign(s.forest, { biome: 'tundra' }))).toBe(false);
    // Una Crónica con la pradera en el tramo 1, aunque el bosque actual sea del anillo 2.
    expect(
      loadsTundra((s) => {
        const taiga = s.chronicle[1];
        if (taiga) taiga.biome = 'prairie';
      }),
    ).toBe(false);
  });

  it('las adaptaciones de la tundra compradas allí van y vuelven; por encima del máximo o de la pradera sin visitar, no', () => {
    const state = inTundra();
    buyBiomeAdaptation(state, { id: 'lichen' });
    buyBiomeAdaptation(state, { id: 'dwarfBirch' });
    expect(state.biomeAdaptations).toMatchObject({ lichen: 1, dwarfBirch: 1 });
    expect(parseSave(serializeSave(state, SAVED_AT))).toMatchObject({ ok: true, save: { state } });
    expect(loadsTundra((s) => (s.biomeAdaptations.lichen = 3))).toBe(false);
    expect(loadsTundra((s) => (s.biomeAdaptations.ringFront = 1))).toBe(false);
  });

  it('acepta el otro bioma del anillo 2 de tercer destino y rechaza un bosque', () => {
    expect(loadsTundra((s) => (s.forest.biome = 'prairie'))).toBe(true);
    expect(loadsTundra((s) => (s.forest.biome = 'choco'))).toBe(false);
  });
});

describe('validación del tramo 5: El regreso (fase 10)', () => {
  /**
   * En la tundra, cuarto destino y colonizada, construido solo con acciones: el Acto I, los cuatro
   * viajes y cada colonización por la esporulación que llega al nivel 500 (inyectando los
   * nutrientes del bosque antes de esporular, como el simulador).
   */
  function fourthColonized(): GameState {
    const s = createState(9, NOW);
    s.mutations = [...MUTATION_IDS];
    s.achievements = ['own.planetary.1'];
    s.stats.sporulations = 9;
    s.stats.totalTime = 11_000;
    s.spores = { level: 1941, available: 2025 };
    checkActOne(s);
    const legs = [
      ['taiga', NOW + 1000],
      ['choco', NOW + 9000],
      ['prairie', NOW + 17_000],
      ['tundra', NOW + 25_000],
    ] as const;
    for (const [to, at] of legs) {
      disperse(s, { to, now: at });
      reachLevel(s, 520, at + 4000);
    }
    drain();
    return s;
  }

  /**
   * Esporula hasta el nivel local `level` (que debe ser mayor que el actual) con los nutrientes
   * justos del bosque: E = ⌊18,75 · √(L / R)⌋ con k = 18,75 (Esporas aladas).
   */
  function reachLevel(s: GameState, level: number, now: number): void {
    const scale = sporeScale(s);
    const earned = scale * (level / 18.75) ** 2 * 1.000001;
    s.lifetimeEarned = s.lifetimeEarned + earned - s.forest.earned;
    s.forest.earned = earned;
    s.runEarned = sporulateRequirement(s);
    s.stats.totalTime += 1800;
    sporulate(s, { now });
    expect(s.spores.level).toBe(level);
  }

  /** De vuelta en el natal: El regreso en curso, cinco entradas. */
  function inReturn(): GameState {
    const s = fourthColonized();
    disperse(s, { to: 'natal', now: NOW + 40_000 });
    drain();
    return s;
  }

  /** El regreso cumplido: seis entradas, todavía en el natal y sin ciclos. */
  function returnClosed(): GameState {
    const s = inReturn();
    reachLevel(s, 520, NOW + 50_000);
    drain();
    return s;
  }

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

  function loadsAfter(build: () => GameState, mutate: (s: GameState) => void): boolean {
    const s = build();
    mutate(s);
    return parseSave(textOf(s)).ok;
  }

  it('El regreso en curso (cinco entradas, en el natal) se guarda y vuelve idéntico', () => {
    const state = inReturn();
    expect(state.forest).toMatchObject({ biome: 'natal', leg: 5 });
    expect(state.chronicle.map((e) => [e.biome, e.leg])).toEqual([
      ['natal', 0],
      ['taiga', 1],
      ['choco', 2],
      ['prairie', 3],
      ['tundra', 4],
    ]);
    expect(saveGame(memoryStorage(), state, SAVED_AT)).toBe('saved');
    expect(parseSave(serializeSave(state, SAVED_AT))).toEqual({
      ok: true,
      save: { version: SAVE_VERSION, savedAt: SAVED_AT, state },
      partnersReset: [],
    });
  });

  it('El regreso cumplido (seis entradas) se guarda y vuelve idéntico', () => {
    const state = returnClosed();
    expect(state.chronicle).toHaveLength(6);
    expect(state.chronicle[5]).toMatchObject({ biome: 'natal', leg: 5, leftAt: null, levelReached: null });
    expect(saveGame(memoryStorage(), state, SAVED_AT)).toBe('saved');
    expect(parseSave(serializeSave(state, SAVED_AT))).toEqual({
      ok: true,
      save: { version: SAVE_VERSION, savedAt: SAVED_AT, state },
      partnersReset: [],
    });
  });

  it('rechaza El regreso fuera del natal, con cinco o con seis entradas, mientras no haya ciclos', () => {
    expect(loadsAfter(inReturn, (s) => (s.forest.biome = 'taiga'))).toBe(false);
    expect(loadsAfter(inReturn, (s) => (s.forest.biome = 'tundra'))).toBe(false);
    expect(loadsAfter(returnClosed, (s) => (s.forest.biome = 'taiga'))).toBe(false);
    expect(loadsAfter(returnClosed, (s) => (s.forest.biome = 'prairie'))).toBe(false);
  });

  it('rechaza un ciclo empezado durante El regreso', () => {
    expect(loadsAfter(inReturn, (s) => (s.cycle.stays = 1))).toBe(false);
  });

  it('rechaza el natal en un tramo del viaje', () => {
    // El mismo cambio con un bioma del anillo 2 sí carga: lo único que falla es el natal.
    expect(
      loadsAfter(fourthColonized, (s) => {
        s.forest.biome = 'prairie';
        s.forest.leg = 3;
        s.chronicle = s.chronicle.slice(0, 3);
      }),
    ).toBe(true);
    expect(
      loadsAfter(fourthColonized, (s) => {
        s.forest.biome = 'natal';
        s.forest.leg = 3;
        s.chronicle = s.chronicle.slice(0, 3);
      }),
    ).toBe(false);
    expect(
      loadsAfter(fourthColonized, (s) => {
        const prairie = s.chronicle[3];
        if (prairie) prairie.biome = 'natal';
      }),
    ).toBe(false);
  });

  it('rechaza un tramo más allá del 5, una Crónica de siete entradas o un tramo 5 sin el cuarto bioma', () => {
    expect(loadsAfter(returnClosed, (s) => (s.forest.leg = 6))).toBe(false);
    expect(
      loadsAfter(returnClosed, (s) => {
        const last = s.chronicle[5];
        if (last) s.chronicle.push({ ...last, leg: 6 });
      }),
    ).toBe(false);
    expect(loadsAfter(inReturn, (s) => (s.chronicle = s.chronicle.slice(0, 4)))).toBe(false);
  });

  it('la sexta entrada es el natal, con fecha de cierre y sin fecha de partida', () => {
    const sixth = (mutate: (e: ChronicleEntry) => void) =>
      loadsAfter(returnClosed, (s) => {
        const entry = s.chronicle[5];
        if (entry) mutate(entry);
      });
    expect(sixth(() => undefined)).toBe(true);
    expect(sixth((e) => (e.biome = 'taiga'))).toBe(false);
    expect(sixth((e) => (e.colonizedAt = null))).toBe(false);
    expect(sixth((e) => (e.leftAt = NOW + 60_000))).toBe(false);
    expect(sixth((e) => (e.levelReached = 520))).toBe(false);
  });

  it('la entrada del cuarto bioma, que se dejó para volver, guarda su fecha de partida y su nivel', () => {
    const state = inReturn();
    expect(state.chronicle[4]).toMatchObject({ biome: 'tundra', leftAt: NOW + 40_000, levelReached: 520 });
    expect(loadsAfter(inReturn, (s) => Object.assign(s.chronicle[4] ?? {}, { leftAt: null }))).toBe(false);
    expect(loadsAfter(inReturn, (s) => Object.assign(s.chronicle[4] ?? {}, { levelReached: null }))).toBe(
      false,
    );
  });
});

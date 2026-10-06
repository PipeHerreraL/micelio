import { beforeEach, describe, expect, it } from 'vitest';
import { completesGoal, disperse, disperseBlock, sporeGain, wakeMutation } from '../src/core/actions.ts';
import { drain, type GameEvent } from '../src/core/events.ts';
import {
  dispersalCount,
  forestGoal,
  isFreeStay,
  lineageFactor,
  offeredVows,
  recordFor,
  sporeScale,
  sporulateRequirement,
  windTargets,
} from '../src/core/forest.ts';
import { DISPERSE_RESET } from '../src/core/resets.ts';
import { derived, invalidate } from '../src/core/selectors.ts';
import { emptyOwned, type GameState } from '../src/core/state.ts';
import { BIOME_IDS } from '../src/data/biomes.ts';
import { MAX_RECORDS } from '../src/data/cycle.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { HISTORY_LIMIT } from '../src/data/prestige.ts';
import { parseSave, saveGame, serializeSave, SAVE_VERSION, type StorageLike } from '../src/systems/save.ts';
import {
  CYCLE_NOW,
  HOUR,
  actOneClosed,
  fourthColonized,
  inReturn,
  primeLevel,
  reachLevel,
  returnClosed,
  sownIn,
} from './cycle-states.ts';

/**
 * El ciclo libre en el núcleo y en el guardado (docs/ROADMAP.md, fase 10): tras El regreso, sembrar
 * cualquier bioma por 300 esporas, cumplir el ciclo en el nivel 500 y su récord. Los estados se
 * construyen solo con acciones (tests/cycle-states.ts) y las cifras van calculadas a mano. La
 * validación del tramo 5 es la zona del BUG-JOURNAL: cada invariante tiene su prueba.
 */

const NOW = CYCLE_NOW;
const SAVED_AT = NOW + 1000 * HOUR;

beforeEach(() => {
  drain();
});

describe('el ciclo libre: sembrar (fase 10)', () => {
  it('cumplido El regreso, el viento ofrece los cinco biomas, también el natal en el que se está', () => {
    const s = returnClosed();
    expect(isFreeStay(s)).toBe(true);
    expect(windTargets(s)).toEqual(BIOME_IDS.map((biome) => ({ biome, kind: 'cycle' })));
    expect(disperseBlock(s)).toBeNull();
    // Sin las 300 esporas (y sin una partida que esporular), no.
    s.spores.available = 299;
    expect(disperseBlock(s)).toBe('spores');
  });

  it('sembrar la taiga cuesta 300 esporas, deja el nivel en 0 y empieza el ciclo 1 en el tramo 5, con la Crónica intacta', () => {
    const s = returnClosed();
    const available = s.spores.available;
    const chronicle = structuredClone(s.chronicle);
    const sporulations = s.stats.sporulations;
    const totalTime = s.stats.totalTime;
    disperse(s, { to: 'taiga', now: NOW + 60 * HOUR });
    expect(s.forest).toEqual({
      biome: 'taiga',
      leg: 5,
      earned: 0,
      arrivedAt: NOW + 60 * HOUR,
      arrivalSporulations: sporulations,
      arrivalPlayTime: totalTime,
    });
    expect(s.spores).toEqual({ level: 0, available: available - 300 });
    expect(s.cycle).toEqual({ stays: 1, done: 0, vows: [], woken: [] });
    // La sexta entrada (El regreso) no se «deja»: sembrar no le pone fecha de partida.
    expect(s.chronicle).toEqual(chronicle);
    const events = drain();
    expect(events.find((e) => e.type === 'disperse')).toEqual({
      type: 'disperse',
      from: 'natal',
      to: 'taiga',
      leg: 5,
      gained: 0,
    });
  });

  it('sembrar el mismo bioma también cuenta como viaje: la red y el suelo cambian con cada siembra', () => {
    const s = returnClosed();
    expect(dispersalCount(s)).toBe(5);
    disperse(s, { to: 'natal', now: NOW + 60 * HOUR });
    expect(s.forest).toMatchObject({ biome: 'natal', leg: 5 });
    expect(dispersalCount(s)).toBe(6);
    s.spores.available = 1000;
    disperse(s, { to: 'natal', now: NOW + 61 * HOUR });
    expect(dispersalCount(s)).toBe(7);
  });

  it('en un ciclo rigen la R y el requisito fijos del bioma sembrado, sus reglas y el linaje ×16', () => {
    const taiga = sownIn('taiga');
    expect(sporeScale(taiga)).toBe(4.6e13);
    // 5 · 4,6e13.
    expect(sporulateRequirement(taiga)).toBe(2.3e14);
    const tundra = sownIn('tundra');
    expect(sporeScale(tundra)).toBe(4.6e12);
    // 6 · 4,6e12.
    expect(sporulateRequirement(tundra)).toBe(2.76e13);
    expect(lineageFactor(tundra)).toBe(16);
    tundra.achievements = [];
    tundra.owned = emptyOwned();
    tundra.owned.mycorrhiza = 10;
    invalidate(tundra);
    // 1800 · 10 · 0,5 (la tundra) · 16 (linaje).
    expect(derived(tundra).generatorProduction.mycorrhiza).toBe(144_000);
  });

  it('se puede partir en cualquier momento: salir sin cumplir no deja récord ni cuenta como cumplido', () => {
    const s = sownIn('prairie');
    reachLevel(s, 200, NOW + 62 * HOUR);
    expect(disperseBlock(s)).toBeNull();
    disperse(s, { to: 'choco', now: NOW + 63 * HOUR });
    expect(s.forest.biome).toBe('choco');
    expect(s.cycle).toEqual({ stays: 2, done: 0, vows: [], woken: [] });
    expect(s.records).toEqual([]);
    expect(drain().some((e) => e.type === 'cycleDone')).toBe(false);
  });

  it('un viaje no lleva votos: con votos, dispersar a un destino no hace nada (se juran al sembrar, tests/vows.test.ts)', () => {
    const s = actOneClosed();
    const before = structuredClone(s);
    disperse(s, { to: 'taiga', now: NOW + HOUR, vows: ['noRain'] });
    expect(s).toEqual(before);
    disperse(s, { to: 'taiga', now: NOW + HOUR });
    expect(s.forest.biome).toBe('taiga');
  });
});

describe('cumplir un ciclo y su récord (fase 10)', () => {
  it('el bosque persigue el nivel 500 del ciclo n y, cumplido, nada más', () => {
    const s = sownIn('taiga');
    expect(forestGoal(s)).toEqual({ kind: 'cycle', n: 1, level: 0, goal: 500 });
    reachLevel(s, 312, NOW + 61 * HOUR);
    expect(forestGoal(s)).toEqual({ kind: 'cycle', n: 1, level: 312, goal: 500 });
    reachLevel(s, 520, NOW + 62 * HOUR);
    expect(forestGoal(s)).toEqual({ kind: 'cycleDone', n: 1, level: 520 });
  });

  it('la esporulación que lleva el nivel a 500 cumple el ciclo: récord con el tiempo de reloj desde la llegada, logro y aviso', () => {
    const s = sownIn('taiga', NOW + 60 * HOUR);
    const arrival = s.stats.sporulations;
    reachLevel(s, 120, NOW + 61 * HOUR);
    reachLevel(s, 368, NOW + 62 * HOUR);
    expect(s.cycle.done).toBe(0);
    reachLevel(s, 520, NOW + 62 * HOUR + 30 * 60_000);
    expect(s.cycle).toEqual({ stays: 1, done: 1, vows: [], woken: [] });
    // 2,5 h de reloj desde la llegada, en tres esporulaciones.
    expect(s.records).toEqual([
      { biome: 'taiga', vows: [], time: 2.5 * HOUR, runs: 3, at: NOW + 62 * HOUR + 30 * 60_000 },
    ]);
    expect(s.stats.sporulations - arrival).toBe(3);
    expect(s.achievements).toContain('cycle.1');
    const events = drain();
    const done = events.filter((e): e is Extract<GameEvent, { type: 'cycleDone' }> => e.type === 'cycleDone');
    expect(done).toEqual([{ type: 'cycleDone', biome: 'taiga', vows: [], time: 2.5 * HOUR, record: true }]);
    expect(events.some((e) => e.type === 'achievement' && e.id === 'cycle.1')).toBe(true);
  });

  it('seguir esporulando tras cumplir no vuelve a cumplir ni toca el récord', () => {
    const s = sownIn('taiga');
    reachLevel(s, 520, NOW + 63 * HOUR);
    const records = structuredClone(s.records);
    drain();
    reachLevel(s, 900, NOW + 64 * HOUR);
    expect(s.cycle.done).toBe(1);
    expect(s.records).toEqual(records);
    expect(drain().some((e) => e.type === 'cycleDone')).toBe(false);
  });

  it('un ciclo más rápido en el mismo bioma mejora su récord en su sitio; uno más lento o igual lo deja', () => {
    const s = sownIn('taiga', NOW + 60 * HOUR);
    reachLevel(s, 520, NOW + 63 * HOUR);
    disperse(s, { to: 'choco', now: NOW + 64 * HOUR });
    reachLevel(s, 520, NOW + 66 * HOUR);
    // Taiga otra vez, en 1 h: mejora el récord de 3 h y se queda en su posición.
    disperse(s, { to: 'taiga', now: NOW + 70 * HOUR });
    reachLevel(s, 520, NOW + 71 * HOUR);
    expect(s.records.map((r) => [r.biome, r.time])).toEqual([
      ['taiga', HOUR],
      ['choco', 2 * HOUR],
    ]);
    expect(drain().filter((e) => e.type === 'cycleDone')).toContainEqual(
      expect.objectContaining({ biome: 'taiga', time: HOUR, record: true }),
    );
    // Y otra vez en 1 h justa: empata y se queda el viejo (con su fecha).
    const best = structuredClone(s.records[0]);
    disperse(s, { to: 'taiga', now: NOW + 80 * HOUR });
    reachLevel(s, 520, NOW + 81 * HOUR);
    expect(s.records[0]).toEqual(best);
    expect(drain().find((e) => e.type === 'cycleDone')).toMatchObject({ record: false });
    expect(s.cycle).toMatchObject({ stays: 4, done: 4 });
    expect(recordFor(s.records, 'taiga', [])).toEqual(best);
    expect(recordFor(s.records, 'tundra', [])).toBeNull();
    // Los récords son por combinación: el de la taiga sin votos no es el de la taiga sin lluvia.
    expect(recordFor(s.records, 'taiga', ['noRain'])).toBeNull();
  });

  it('si la esporulación de sembrar llega a 500, el ciclo se cumple antes de irse y el récord es del bioma que se deja', () => {
    const s = sownIn('prairie', NOW + 60 * HOUR);
    reachLevel(s, 480, NOW + 62 * HOUR);
    primeLevel(s, 520);
    expect(sporeGain(s)).toBe(40);
    disperse(s, { to: 'tundra', now: NOW + 63 * HOUR });
    expect(s.records).toEqual([{ biome: 'prairie', vows: [], time: 3 * HOUR, runs: 2, at: NOW + 63 * HOUR }]);
    expect(s.cycle).toEqual({ stays: 2, done: 1, vows: [], woken: [] });
    expect(s.forest).toMatchObject({ biome: 'tundra', leg: 5, arrivedAt: NOW + 63 * HOUR });
    expect(s.spores.level).toBe(0);
    expect(s.achievements).toContain('cycle.1');
  });

  it('con el reloj hacia atrás el tiempo del récord es 0, no negativo, y la partida se guarda', () => {
    const s = sownIn('choco', NOW + 60 * HOUR);
    reachLevel(s, 520, NOW + 59 * HOUR);
    expect(s.records[0]).toMatchObject({ biome: 'choco', time: 0 });
    expect(saveGame(memoryStorage(), s, SAVED_AT)).toBe('saved');
  });

  it('esporular cumple la meta del ciclo cuando la ganancia lleva el nivel de 368 a 508; cumplido, ya no', () => {
    const s = sownIn('natal');
    reachLevel(s, 368, NOW + 61 * HOUR);
    primeLevel(s, 508);
    expect(sporeGain(s)).toBe(140);
    expect(completesGoal(s)).toBe(true);
    // Una ganancia que deja el nivel en 499 no la cumple.
    primeLevel(s, 499);
    expect(completesGoal(s)).toBe(false);
    reachLevel(s, 508, NOW + 62 * HOUR);
    primeLevel(s, 1100);
    expect(completesGoal(s)).toBe(false);
    // Tras El regreso, sin ciclo empezado, no hay meta: el natal libre no la tiene.
    const free = returnClosed();
    primeLevel(free, 1100);
    expect(completesGoal(free)).toBe(false);
  });
});

describe('reinicios al sembrar (fase 10)', () => {
  it('sembrar conserva tal cual cada campo «life», también si la esporulación de partir cumple el ciclo', () => {
    const s = sownIn('taiga');
    reachLevel(s, 480, NOW + 62 * HOUR);
    primeLevel(s, 520);
    s.seen = ['tab.generators', 'chapter.return.close'];
    s.settings.volume = 0.8;
    s.autobuy.generators.hypha = true;
    const before = structuredClone(s);
    disperse(s, { to: 'taiga', now: NOW + 63 * HOUR });
    expect(s.cycle.done).toBe(1);
    for (const key of Object.keys(DISPERSE_RESET) as (keyof GameState)[]) {
      // La semilla del azar avanza al sortear la lluvia del destino, como al dispersar.
      if (DISPERSE_RESET[key] !== 'life' || key === 'rngSeed') continue;
      if (key === 'achievements') expect(s.achievements).toEqual(expect.arrayContaining(before.achievements));
      else expect(s[key], key).toEqual(before[key]);
    }
  });
});

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

function textOf(state: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: SAVED_AT, state });
}

function loadsAfter(build: () => GameState, mutate: (s: GameState) => void): boolean {
  const s = build();
  mutate(s);
  return parseSave(textOf(s)).ok;
}

/** En la taiga, ciclo 2: el primero (la pradera) cumplido con su récord. */
function secondCycle(): GameState {
  const s = sownIn('prairie', NOW + 60 * HOUR);
  reachLevel(s, 520, NOW + 62 * HOUR);
  disperse(s, { to: 'taiga', now: NOW + 63 * HOUR });
  reachLevel(s, 200, NOW + 64 * HOUR);
  drain();
  return s;
}

/** El mismo, con la taiga también cumplida: dos ciclos empezados y dos cumplidos. */
function secondCycleDone(): GameState {
  const s = secondCycle();
  reachLevel(s, 520, NOW + 65 * HOUR);
  drain();
  return s;
}

describe('guardado del ciclo libre (fase 10)', () => {
  it('un ciclo empezado y uno cumplido con su récord se guardan y vuelven idénticos', () => {
    for (const state of [sownIn('tundra'), secondCycle()]) {
      expect(saveGame(memoryStorage(), state, SAVED_AT)).toBe('saved');
      expect(parseSave(serializeSave(state, SAVED_AT))).toEqual({
        ok: true,
        save: { version: SAVE_VERSION, savedAt: SAVED_AT, state },
        partnersReset: [],
      });
    }
  });

  it('un ciclo en el natal carga: con ciclos empezados el linaje puede vivir en cualquier bioma', () => {
    expect(
      loadsAfter(
        () => sownIn('natal'),
        () => undefined,
      ),
    ).toBe(true);
    expect(loadsAfter(secondCycle, (s) => (s.forest.biome = 'choco'))).toBe(true);
  });

  it('rechaza ciclos fuera del ciclo libre: en el viaje o durante El regreso, con cinco entradas', () => {
    // Los mismos estados sin ciclos cargan: lo único que falla es el ciclo.
    for (const build of [fourthColonized, inReturn, returnClosed]) {
      expect(loadsAfter(build, () => undefined)).toBe(true);
    }
    expect(loadsAfter(fourthColonized, (s) => (s.cycle.stays = 1))).toBe(false);
    expect(loadsAfter(inReturn, (s) => (s.cycle.stays = 1))).toBe(false);
    expect(loadsAfter(returnClosed, (s) => (s.cycle.stays = 1))).toBe(true);
  });

  it('los ciclos son enteros y nunca hay más cumplidos que empezados', () => {
    // Con el ciclo en curso cumplido hay tantos cumplidos como empezados; uno más, nunca.
    expect(loadsAfter(secondCycleDone, () => undefined)).toBe(true);
    expect(loadsAfter(secondCycleDone, (s) => (s.cycle.done = 3))).toBe(false);
    expect(loadsAfter(secondCycle, (s) => (s.cycle.done = 3))).toBe(false);
    expect(loadsAfter(secondCycle, (s) => (s.cycle.stays = 1.5))).toBe(false);
    expect(loadsAfter(secondCycle, (s) => (s.cycle.done = -1))).toBe(false);
    expect(loadsAfter(secondCycle, (s) => Object.assign(s.cycle, { stays: '2' }))).toBe(false);
  });

  it('un guardado con tantos cumplidos como empezados y el ciclo en curso sin cumplir carga con uno menos y, al cumplirlo, se sigue guardando', () => {
    // Solo sale de un guardado editado: en la taiga, nivel 200, dos ciclos empezados y dos cumplidos.
    const edited = secondCycle();
    edited.cycle.done = 2;
    const result = parseSave(textOf(edited));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    const s = result.save.state;
    expect(s.cycle).toEqual({ stays: 2, done: 1, vows: [], woken: [] });
    // Cumplir la taiga: dos de dos, y el guardado sigue escribiéndose (antes, tres de dos y 'invalid').
    reachLevel(s, 520, NOW + 65 * HOUR);
    drain();
    expect(s.cycle).toMatchObject({ stays: 2, done: 2 });
    expect(saveGame(memoryStorage(), s, SAVED_AT)).toBe('saved');
    expect(saveGame(memoryStorage(), s, SAVED_AT + HOUR)).toBe('saved');
  });

  it('el primer ciclo sin cumplir con uno cumplido y un récord no carga: el récord pide un ciclo cumplido', () => {
    // Repararlo a 0 cumplidos dejaría el récord sin ciclo, y ese estado tampoco se podría guardar.
    expect(
      loadsAfter(
        () => sownIn('taiga'),
        (s) => {
          s.cycle.done = 1;
          s.records = [{ biome: 'prairie', vows: [], time: HOUR, runs: 1, at: NOW }];
        },
      ),
    ).toBe(false);
  });

  it('un ciclo empezado admite votos; las mutaciones despiertas, solo con «sin mutaciones» (las reglas, en tests/vows.test.ts)', () => {
    expect(loadsAfter(secondCycle, (s) => (s.cycle.vows = ['noRain']))).toBe(true);
    expect(loadsAfter(secondCycle, (s) => (s.cycle.woken = ['soilMemory']))).toBe(false);
    expect(
      loadsAfter(secondCycle, (s) => {
        const record = s.records[0];
        if (record) record.vows = ['autoOnly'];
      }),
    ).toBe(true);
  });

  it('un récord pide un ciclo cumplido, un bioma conocido, partidas entre 1 y las esporulaciones y una fecha', () => {
    const record = (mutate: (r: Record<string, unknown>) => void) =>
      loadsAfter(secondCycle, (s) => {
        const r = s.records[0];
        if (r) mutate(r as unknown as Record<string, unknown>);
      });
    expect(record(() => undefined)).toBe(true);
    expect(loadsAfter(secondCycle, (s) => (s.cycle.done = 0))).toBe(false);
    expect(record((r) => (r.biome = 'atlantis'))).toBe(false);
    expect(record((r) => (r.runs = 0))).toBe(false);
    expect(record((r) => (r.runs = 2.5))).toBe(false);
    expect(
      loadsAfter(secondCycle, (s) => {
        const r = s.records[0];
        if (r) r.runs = s.stats.sporulations + 1;
      }),
    ).toBe(false);
    expect(record((r) => (r.at = -1))).toBe(false);
    expect(record((r) => (r.at = 9e15))).toBe(false);
    // Un tiempo que no es un número no se puede reparar (JSON escribe NaN e Infinity como null).
    expect(record((r) => (r.time = null))).toBe(false);
    expect(record((r) => (r.time = '3600000'))).toBe(false);
    expect(record((r) => Reflect.deleteProperty(r, 'vows'))).toBe(false);
  });

  it('un récord con tiempo negativo carga con tiempo 0, sin rechazar el guardado', () => {
    const s = secondCycle();
    const record = s.records[0];
    if (!record) throw new Error('Falta el récord de la pradera');
    record.time = -5;
    const result = parseSave(textOf(s));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.save.state.records[0]).toEqual({ ...record, time: 0 });
  });

  it('las claves (bioma, votos) son únicas y los récords no pasan de 36', () => {
    expect(
      loadsAfter(secondCycle, (s) => {
        const r = s.records[0];
        if (r) s.records.push({ ...r, time: r.time + 1 });
      }),
    ).toBe(false);
    // Uno por bioma sí: los cinco sin votos.
    expect(
      loadsAfter(secondCycle, (s) => {
        const r = s.records[0];
        s.cycle.done = 2;
        if (r) s.records = BIOME_IDS.map((biome) => ({ ...r, biome }));
      }),
    ).toBe(true);
    expect(
      loadsAfter(secondCycle, (s) => {
        const r = s.records[0];
        if (r) s.records = Array.from({ length: MAX_RECORDS + 1 }, () => ({ ...r }));
      }),
    ).toBe(false);
    expect(loadsAfter(secondCycle, (s) => Object.assign(s, { records: {} }))).toBe(false);
  });
});

describe('el guardado no crece con los ciclos (fase 10)', () => {
  /**
   * Un ciclo entero por acciones: sembrar el bioma que toca y cumplirlo en cinco partidas de 30 min
   * de reloj, con los niveles del ciclo medido (46 → 92 → 184 → 368 → 500 y algo). Con cinco
   * partidas por ciclo el historial ya está lleno tras 10 ciclos, como en una partida de verdad. Los
   * ciclos impares llevan todos los votos que ofrece su bioma y despiertan entre partidas lo que
   * alcanza; en 10 ciclos ya salen las diez combinaciones de bioma y votos que se repiten después.
   */
  function playCycle(s: GameState, i: number): void {
    const biome = BIOME_IDS[i % BIOME_IDS.length] ?? 'natal';
    const start = NOW + (100 + i * 3) * HOUR;
    disperse(s, { to: biome, now: start, vows: i % 2 === 1 ? offeredVows(biome) : [] });
    [46, 92, 184, 368, 520].forEach((level, run) => {
      reachLevel(s, level, start + (run + 1) * 30 * 60_000);
      for (const id of MUTATION_IDS) wakeMutation(s, { id });
      maxVows = Math.max(maxVows, s.cycle.vows.length);
      maxWoken = Math.max(maxWoken, s.cycle.woken.length);
    });
    drain();
  }
  let maxVows = 0;
  let maxWoken = 0;

  it('tras 100 ciclos: Crónica de seis, historial, récords y votos acotados, sin marcas nuevas y unos bytes más que tras 10', () => {
    const s = returnClosed();
    s.seen = ['tab.generators', 'chapter.return.close'];
    const seen = [...s.seen];
    for (let i = 0; i < 10; i += 1) playCycle(s, i);
    const after10 = serializeSave(s, SAVED_AT).length;
    for (let i = 10; i < 100; i += 1) playCycle(s, i);
    expect(s.cycle).toEqual({ stays: 100, done: 100, vows: [], woken: [] });
    expect(s.chronicle).toHaveLength(6);
    expect(s.history.length).toBeLessThanOrEqual(HISTORY_LIMIT);
    // Cinco biomas sin votos y cinco con todos los que ofrecen.
    expect(s.records).toHaveLength(2 * BIOME_IDS.length);
    expect(s.records.length).toBeLessThanOrEqual(MAX_RECORDS);
    expect(maxVows).toBe(3);
    // Las doce despiertan en los ciclos con «sin mutaciones»: el árbol cuesta 287 esporas y el ciclo da 520.
    expect(maxWoken).toBe(12);
    expect(s.seen).toEqual(seen);
    const after100 = serializeSave(s, SAVED_AT).length;
    expect(after100).toBeLessThanOrEqual(after10 + 300);
    expect(saveGame(memoryStorage(), s, SAVED_AT)).toBe('saved');
  });
});

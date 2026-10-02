import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drain, type GameEvent } from '../src/core/events.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { PLATES } from '../src/data/plasmodium-plates.ts';
import {
  advancePlasmodium,
  openPlateInternal,
  stepSecond,
  trailRate,
} from '../src/partners/plasmodium/advance.ts';
import { measure } from '../src/partners/plasmodium/metrics.ts';
import { plasmodiumRuntime } from '../src/partners/plasmodium/plasmodium-runtime.ts';
import {
  createPlasmodium,
  cultureRate,
  spreadConductivity,
  startHabituation,
  type PlasmodiumState,
  type PlateMap,
} from '../src/partners/plasmodium/state.ts';
import { registerPartnerRuntime, unregisterPartnerRuntime } from '../src/partners/registry.ts';
import { applyPartnersElapsed } from '../src/systems/partners.ts';

/**
 * El reloj del plasmodio sobre las placas reales (ARCHITECTURE.md §4.29): segundos de modelo,
 * Rastro, estabilidad, fructificar y el tiempo aplicado de golpe.
 */

const NOW = Date.UTC(2026, 9, 1);
const GAME: GameState = createState(1, NOW);

/** Colocaciones de referencia: cumplen el objetivo de cada placa (medidas con el prototipo). */
const REFERENCE: Record<string, number[]> = {
  log: [7, 1, 16, 18],
  maze: [],
  archipelago: [15, 2, 16, 21, 3],
  bitterBridge: [4, 24, 9],
  fusion: [2, 23, 11, 0],
};

const MAP: PlateMap = { score: 2, quality: 0.7, cost: 1.2, tolerance: 0.8, alive: 9, joined: 3 };

beforeEach(() => {
  drain();
});

afterEach(() => {
  unregisterPartnerRuntime('plasmodium');
});

/** Un plasmodio con la placa `index` abierta, las anteriores cartografiadas y la referencia puesta. */
function atPlate(index: number, foods = REFERENCE[PLATES[index]?.id ?? ''] ?? []): PlasmodiumState {
  const p = createPlasmodium(7);
  for (let i = 0; i < index; i += 1) Object.assign(p.plates[i] ?? {}, { map: { ...MAP } });
  p.plate = index;
  p.conductivity = spreadConductivity(p, index);
  p.habituation = startHabituation(index);
  Object.assign(p.plates[index] ?? {}, { foods: [...foods] });
  return p;
}

function seconds(p: PlasmodiumState, count: number): void {
  for (let i = 0; i < count; i += 1) stepSecond(p);
}

function plasmodiumEvents(): Extract<GameEvent, { type: 'plasmodium' }>[] {
  return drain().filter((e): e is Extract<GameEvent, { type: 'plasmodium' }> => e.type === 'plasmodium');
}

describe('las cinco placas', () => {
  PLATES.forEach((def, index) => {
    it(`${def.id}: la colocación de referencia cumple el objetivo 60 s seguidos antes de 1.200 s`, () => {
      const p = atPlate(index);
      let first = -1;
      for (let t = 1; t <= 1200 && first < 0; t += 1) {
        stepSecond(p);
        if (p.stableFor >= 60) first = t;
      }
      expect(first).toBeGreaterThan(0);
    });
  });

  it('el Laberinto llega al camino más corto en 10 min de modelo sin poner nada', () => {
    const p = atPlate(1);
    seconds(p, 600);
    const s = measure(p);
    expect(s.connected).toBe(true);
    expect(s.cost).toBeLessThanOrEqual(1.1);
  });

  it('en la Fusión los dos plasmodios se separan al principio y se funden al aprender', () => {
    const p = atPlate(4);
    seconds(p, 5);
    expect(measure(p).fused).toBe(false);
    seconds(p, 600);
    expect(measure(p).fused).toBe(true);
    expect(measure(p).habituation).toBeGreaterThan(0.1);
  });
});

describe('reloj y tiempo aplicado de golpe', () => {
  it('37 s apuntados de golpe dan lo mismo, bit a bit, que 740 avances de 50 ms', () => {
    const a = atPlate(0);
    const b = atPlate(0);
    advancePlasmodium(GAME, a, 37_000);
    for (let i = 0; i < 740; i += 1) advancePlasmodium(GAME, b, 50);
    expect(a).toEqual(b);
    expect(a.stats.modelSeconds).toBe(37);
  });

  it('1.200 s de golpe dan lo mismo, bit a bit, que en vivo', () => {
    const a = atPlate(3);
    const b = atPlate(3);
    a.moistFor = 20;
    b.moistFor = 20;
    advancePlasmodium(GAME, a, 1_200_000);
    for (let i = 0; i < 1200; i += 1) advancePlasmodium(GAME, b, 1000);
    expect(a).toEqual(b);
  });

  it('8 h de golpe dan un Rastro a ±2 % del de 8 h en vivo (placa con mapa, sin fruto en medio)', () => {
    const golpe = atPlate(0);
    Object.assign(golpe.plates[0] ?? {}, { map: { ...MAP } });
    const vivo = structuredClone(golpe);
    advancePlasmodium(GAME, golpe, 8 * 3600 * 1000);
    for (let i = 0; i < 8 * 3600; i += 1) advancePlasmodium(GAME, vivo, 1000);
    expect(golpe.trailEarned / vivo.trailEarned).toBeGreaterThan(0.98);
    expect(golpe.trailEarned / vivo.trailEarned).toBeLessThan(1.02);
    expect(golpe.stats.modelSeconds).toBe(8 * 3600);
  });

  it('un mes apuntado se aplica con su tope y como mucho 1.200 segundos paso a paso', () => {
    const state = createState(3, NOW);
    const p = atPlate(0);
    state.partners.plasmodium = p;
    registerPartnerRuntime(plasmodiumRuntime);
    applyPartnersElapsed(state, 30 * 24 * 3600, 'offline');
    // Tope de 8 h al 50 %: 4 h de modelo; 1.200 con pasos (un paso por segundo sin agar húmedo).
    expect(p.stats.modelSeconds).toBe(4 * 3600);
    expect(p.step).toBe(1200);
    expect(p.pendingMs).toBe(0);
  });

  it('la parte cobrada al ritmo final nunca fructifica ni cambia la estabilidad', () => {
    const p = atPlate(0);
    seconds(p, 600);
    expect(p.stableFor).toBe(60);
    const rate = trailRate(p, measure(p));
    // La meta se alcanzaría en el segundo 1.250: dentro de la parte sin pasos.
    p.mapping = (PLATES[0]?.trailGoal ?? 0) - rate * 1250;
    advancePlasmodium(GAME, p, 1_300_000);
    expect(p.plates[0]?.map).toBeNull();
    expect(p.mapping).toBeGreaterThanOrEqual(PLATES[0]?.trailGoal ?? 0);
    expect(p.stableFor).toBe(60);
    // El primer segundo en vivo, ya con la meta, fructifica.
    advancePlasmodium(GAME, p, 1000);
    expect(p.plates[0]?.map).not.toBeNull();
  });

  it('ms no enteros o no positivos no avanzan el reloj', () => {
    const p = atPlate(0);
    advancePlasmodium(GAME, p, 10.5);
    advancePlasmodium(GAME, p, -1000);
    expect(p.clockMs).toBe(0);
    expect(p.stats.modelSeconds).toBe(0);
  });

  it('de golpe, los avisos se agrupan: un solo cambio de objetivo y el aviso de lo dejado', () => {
    const p = atPlate(0);
    advancePlasmodium(GAME, p, 900_000);
    const events = plasmodiumEvents();
    expect(events.filter((e) => e.kind === 'goal')).toEqual([
      { type: 'plasmodium', kind: 'goal', met: true },
    ]);
    expect(events.filter((e) => e.kind === 'caughtUp')).toHaveLength(1);
  });
});

describe('Rastro, estabilidad y fructificar', () => {
  it('la estabilidad sube 1 por segundo y baja 2 si algo falla', () => {
    const p = atPlate(0);
    seconds(p, 600);
    expect(p.stableFor).toBe(60);
    // Sin copos del jugador el objetivo falla.
    Object.assign(p.plates[0] ?? {}, { foods: [7] });
    stepSecond(p);
    expect(p.stableFor).toBe(58);
    stepSecond(p);
    expect(p.stableFor).toBe(56);
  });

  it('fructificar exige la meta y la estabilidad llena, guarda el mapa y avisa una sola vez', () => {
    const p = atPlate(0);
    seconds(p, 600);
    expect(p.plates[0]?.map).toBeNull();
    plasmodiumEvents();
    p.mapping = PLATES[0]?.trailGoal ?? 0;
    stepSecond(p);
    const map = p.plates[0]?.map;
    expect(map?.score).toBeGreaterThan(0);
    expect(map?.joined).toBe(4);
    expect(p.mapping).toBe(0);
    expect(p.lingerFor).toBe(60);
    stepSecond(p);
    const events = plasmodiumEvents();
    expect(events.filter((e) => e.kind === 'fruited')).toEqual([
      { type: 'plasmodium', kind: 'fruited', plate: 0 },
    ]);
    expect(p.achievements).toEqual(['log', 'noPulse']);
  });

  it('sin la estabilidad llena no fructifica aunque llegue a la meta', () => {
    const p = atPlate(0);
    p.mapping = PLATES[0]?.trailGoal ?? 0;
    seconds(p, 30);
    expect(p.plates[0]?.map).toBeNull();
  });

  it('la placa siguiente se abre sola 60 s después de fructificar', () => {
    const p = atPlate(0);
    seconds(p, 600);
    p.mapping = PLATES[0]?.trailGoal ?? 0;
    stepSecond(p);
    seconds(p, 59);
    expect(p.plate).toBe(0);
    plasmodiumEvents();
    stepSecond(p);
    expect(p.plate).toBe(1);
    expect(p.lingerFor).toBe(0);
    expect(p.conductivity).toHaveLength(PLATES[1]?.edges.length ?? 0);
    expect(plasmodiumEvents()).toContainEqual({
      type: 'plasmodium',
      kind: 'plateOpened',
      plate: 1,
      auto: true,
    });
  });

  it('una placa con mapa suma en cultivo el Rastro de su mapa; la abierta con mapa, el mayor de los dos', () => {
    const p = atPlate(1);
    p.upgrades.agar = 2;
    // Tronco en cultivo: ritmo 1 · puntuación 2 · 1,5².
    expect(cultureRate(p)).toBeCloseTo(4.5, 12);
    const open = atPlate(0);
    Object.assign(open.plates[0] ?? {}, { map: { ...MAP, score: 50 } });
    expect(trailRate(open, measure(open))).toBe(50);
    expect(cultureRate(open)).toBe(0);
  });

  it('con agar húmedo el modelo da dos pasos por segundo y el Rastro por segundo es el de la red', () => {
    const p = atPlate(0);
    p.moistFor = 3;
    stepSecond(p);
    expect(p.step).toBe(2);
    expect(p.moistFor).toBe(2);
    const before = p.trailEarned;
    const snap = stepSecond(p);
    expect(p.trailEarned - before).toBeCloseTo(trailRate(p, snap), 9);
  });

  it('A prueba de cortes no se gana al poner tres copos en una placa recién abierta', () => {
    const p = atPlate(2);
    seconds(p, 3);
    expect(measure(p).tolerance).toBe(1);
    expect(p.achievements).not.toContain('cutProof');
  });

  it('abrir una placa a mano cancela la espera de la apertura sola', () => {
    const p = atPlate(0);
    p.lingerFor = 30;
    Object.assign(p.plates[0] ?? {}, { map: { ...MAP } });
    openPlateInternal(p, 1, false);
    expect(p.lingerFor).toBe(0);
    expect(p.plate).toBe(1);
  });

  it('la espera de la apertura sola no abre una placa sin la anterior cartografiada', () => {
    // Solo la trae un guardado editado (el validador ya la deja en 0); el modelo se defiende igual.
    const p = atPlate(0);
    p.lingerFor = 5;
    seconds(p, 6);
    expect(p.plate).toBe(0);
    expect(p.lingerFor).toBe(0);
  });

  it('con un contador de pasos enorme la fuente sigue rotando y la referencia del Tronco cumple', () => {
    // Desde 2^53, step + 1 ya no cambia: sin tope, la fuente quedaba fija y no cumplía nunca.
    const p = atPlate(0);
    p.step = 2 ** 53;
    seconds(p, 600);
    expect(p.stableFor).toBe(60);
    expect(p.step).toBeLessThan(1000);
  });

  it('con las cinco placas cartografiadas, mejorar un mapa sin pulsar otorga Paciencia de protista', () => {
    const p = atPlate(0);
    for (const record of p.plates) record.map = { ...MAP, score: 0.1 };
    p.pulsedHere = true;
    seconds(p, 600);
    expect(p.plates[0]?.map?.score).toBeGreaterThan(0.1);
    expect(p.achievements).not.toContain('noPulse');

    const q = atPlate(0);
    for (const record of q.plates) record.map = { ...MAP, score: 0.1 };
    seconds(q, 600);
    expect(q.plates[0]?.map?.score).toBeGreaterThan(0.1);
    expect(q.achievements).toContain('noPulse');
  });

  it('un valor no finito en la red la vuelve a cubrir y avisa una vez', () => {
    const p = atPlate(0);
    p.conductivity[3] = Number.NaN;
    stepSecond(p);
    for (const d of p.conductivity) expect(Number.isFinite(d)).toBe(true);
    expect(plasmodiumEvents().filter((e) => e.kind === 'reset')).toHaveLength(1);
  });
});

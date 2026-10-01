import { describe, expect, it } from 'vitest';
import type { PlateDef } from '../src/data/plasmodium-plates.ts';
import { modelStep, solverFailures } from '../src/partners/plasmodium/flow.ts';
import { buildPlateGraph, type PlateGraph } from '../src/partners/plasmodium/graph.ts';
import { measureOn } from '../src/partners/plasmodium/metrics.ts';
import { createPlasmodium, type PlasmodiumState } from '../src/partners/plasmodium/state.ts';

/**
 * El modelo de flujo y sus medidas sobre grafos hechos a mano, con los valores calculados a mano
 * (ARCHITECTURE.md §4.29): un paso de Tero con fuente por turno e integrador exponencial.
 */

/** Una placa de prueba: coordenadas en celdas, todo lo demás vacío salvo lo que se pida. */
function plate(over: Partial<PlateDef> & Pick<PlateDef, 'x' | 'y' | 'edges'>): PlateDef {
  return {
    id: 'log',
    cols: 4,
    rows: 4,
    grid: false,
    fixedFoods: [],
    blocked: [],
    substance: 'none',
    substanceEdges: [],
    habituated: [],
    foods: 0,
    extraFoods: false,
    lamps: 0,
    objective: 'quality',
    threshold: 0.5,
    trailGoal: 1,
    trailRate: 1,
    habRate: 0,
    spreadRate: 0,
    cellMin: 1,
    ...over,
  };
}

/** Un plasmodio en la placa 0 de `g`, con la red cubierta (D = 1) y sin habituar. */
function on(g: PlateGraph, foods: number[] = [], lamps: number[] = []): PlasmodiumState {
  const p = createPlasmodium(1);
  p.conductivity = new Array<number>(g.m).fill(1);
  p.habituation = g.def.x.map((_, i) => (g.def.habituated.includes(i) ? 1 : 0));
  Object.assign(p.plates[0] ?? {}, { foods, lamps });
  return p;
}

const H = Math.sqrt(3) / 2;
/** Triángulo equilátero de lado 1: aristas 0–1, 1–2 y 0–2 (la directa). */
const TRIANGLE = plate({
  x: [0.5, 1.5, 1],
  y: [1, 1, 1 + H],
  edges: [
    [0, 1],
    [1, 2],
    [0, 2],
  ],
  fixedFoods: [0, 2],
});

describe('un paso del modelo', () => {
  it('en un triángulo con copos en 0 y 2 (I0 = 1,5) el flujo directo es 1 y el del rodeo 0,5', () => {
    const g = buildPlateGraph(TRIANGLE, 0);
    const p = on(g);
    expect(modelStep(p, g)).toBe(true);
    expect(Math.abs(g.work.flow[2] ?? 0)).toBeCloseTo(1, 12);
    expect(Math.abs(g.work.flow[0] ?? 0)).toBeCloseTo(0.5, 12);
    expect(Math.abs(g.work.flow[1] ?? 0)).toBeCloseTo(0.5, 12);
  });

  it('con D = 1 deja 0,952419 en la directa y 0,926069 en el rodeo', () => {
    // f(1) = 0,5 y D = 0,5 + 0,5·e^(−0,1); f(0,5) = 0,5^1,8 / (1 + 0,5^1,8) = 0,223098.
    const g = buildPlateGraph(TRIANGLE, 0);
    const p = on(g);
    modelStep(p, g);
    expect(p.conductivity[2]).toBeCloseTo(0.952419, 6);
    expect(p.conductivity[0]).toBeCloseTo(0.926069, 6);
    expect(p.conductivity[1]).toBeCloseTo(0.926069, 6);
    expect(p.step).toBe(1);
  });

  it('con menos de dos copos la red no cambia y el paso no avanza', () => {
    const g = buildPlateGraph({ ...TRIANGLE, fixedFoods: [0] }, 0);
    const p = on(g);
    expect(modelStep(p, g)).toBe(false);
    expect(p.conductivity).toEqual([1, 1, 1]);
    expect(p.step).toBe(0);
  });

  it('miles de pasos dejan la conductividad entre 1e-4 y 1 sin que el solver falle', () => {
    const g = buildPlateGraph(TRIANGLE, 0);
    const p = on(g);
    p.conductivity = [1e-4, 1e-4, 1e-4];
    const failures = solverFailures();
    for (let i = 0; i < 3000; i += 1) modelStep(p, g);
    for (const d of p.conductivity) {
      expect(d).toBeGreaterThanOrEqual(1e-4);
      expect(d).toBeLessThanOrEqual(1);
    }
    expect(solverFailures()).toBe(failures);
  });

  it('una lámpara seca antes las aristas que alumbra', () => {
    // Copos en 0, 1 y 2: las tres aristas llevan flujo. La lámpara del sitio 3 alumbra la 2–3.
    const square = plate({
      x: [0.5, 1.5, 1.5, 0.5],
      y: [0.5, 0.5, 1.5, 1.5],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
      fixedFoods: [0, 2],
    });
    const g = buildPlateGraph(square, 0);
    const dark = on(g);
    const lit = on(g, [], [3]);
    modelStep(dark, g);
    modelStep(lit, g);
    expect(lit.conductivity[2] ?? 1).toBeLessThan(dark.conductivity[2] ?? 0);
    expect(lit.conductivity[3] ?? 1).toBeLessThan(dark.conductivity[3] ?? 0);
    expect(lit.conductivity[0]).toBe(dark.conductivity[0]);
  });

  it('la quinina frena un tubo y el flujo que la cruza habitúa a los dos extremos', () => {
    const bitter = { ...TRIANGLE, substance: 'quinine' as const, substanceEdges: [2], habRate: 0.02 };
    const g = buildPlateGraph(bitter, 0);
    const p = on(g);
    const plain = on(buildPlateGraph(TRIANGLE, 0));
    modelStep(p, g);
    modelStep(plain, buildPlateGraph(TRIANGLE, 0));
    expect(p.conductivity[2] ?? 1).toBeLessThan(plain.conductivity[2] ?? 0);
    // Δ·η·f(1) = 0,1 · 0,02 · 0,5 = 0,001 en cada extremo de la arista amarga; nada en el 1.
    expect(p.habituation[0]).toBeCloseTo(0.001, 12);
    expect(p.habituation[2]).toBeCloseTo(0.001, 12);
    expect(p.habituation[1]).toBe(0);
  });

  it('el secado de un tubo con sustancia usa la habituación de antes del paso', () => {
    const bitter = { ...TRIANGLE, substance: 'quinine' as const, substanceEdges: [2], habRate: 0.02 };
    const g = buildPlateGraph(bitter, 0);
    const p = on(g);
    modelStep(p, g);
    // a = 1 + 60·(1 − 0) = 61 (h = 0 antes del paso), f = 0,5 → D = 0,5/61 + (1 − 0,5/61)·e^(−6,1).
    const target = 0.5 / 61;
    expect(p.conductivity[2]).toBeCloseTo(target + (1 - target) * Math.exp(-6.1), 12);
  });

  it('en la Fusión la habituación pasa del lado habituado al otro y nunca baja', () => {
    const fusion = {
      ...TRIANGLE,
      substance: 'salt' as const,
      substanceEdges: [0, 1, 2],
      habituated: [0],
      spreadRate: 0.3,
    };
    const g = buildPlateGraph(fusion, 0);
    const p = on(g);
    let previous = [...p.habituation];
    for (let i = 0; i < 200; i += 1) {
      modelStep(p, g);
      p.habituation.forEach((h, k) => {
        expect(h).toBeGreaterThanOrEqual(previous[k] ?? 0);
      });
      previous = [...p.habituation];
    }
    expect(p.habituation[0]).toBe(1);
    expect(p.habituation[2] ?? 0).toBeGreaterThan(0.05);
  });

  it('con Memoria externa, un tubo sin flujo se seca el doble de rápido', () => {
    // Copos en 0 y 1; la arista 1–2 cuelga y no lleva flujo.
    const tail = plate({
      x: [0.5, 1.5, 2.5],
      y: [0.5, 0.5, 0.5],
      edges: [
        [0, 1],
        [1, 2],
      ],
      fixedFoods: [0, 1],
    });
    const g = buildPlateGraph(tail, 0);
    const plain = on(g);
    const memory = on(g);
    memory.upgrades.memory = 1;
    modelStep(plain, g);
    modelStep(memory, g);
    expect(plain.conductivity[1]).toBeCloseTo(Math.exp(-0.1), 12);
    expect(memory.conductivity[1]).toBeCloseTo(Math.exp(-0.2), 12);
  });
});

describe('medidas de la red', () => {
  const SQUARE = plate({
    x: [0.5, 1.5, 1.5, 0.5],
    y: [0.5, 0.5, 1.5, 1.5],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
    fixedFoods: [0, 1, 2, 3],
  });

  it('un ciclo de cuatro copos de lado 1: árbol 3, coste 4/3, tolerancia 1 y calidad 0,75', () => {
    const g = buildPlateGraph(SQUARE, 0);
    const s = measureOn(on(g), g);
    expect(s.joined).toBe(4);
    expect(s.connected).toBe(true);
    expect(s.cost).toBeCloseTo(4 / 3, 12);
    expect(s.tolerance).toBe(1);
    expect(s.quality).toBeCloseTo(0.75, 12);
    expect(s.score).toBeCloseTo(3, 12);
  });

  it('un camino entre dos copos no tolera cortes: calidad 0,5 ÷ coste', () => {
    const path = plate({
      x: [0.5, 1.5, 2.5],
      y: [0.5, 0.5, 0.5],
      edges: [
        [0, 1],
        [1, 2],
      ],
      fixedFoods: [0, 2],
    });
    const g = buildPlateGraph(path, 0);
    const s = measureOn(on(g), g);
    expect(s.cost).toBeCloseTo(1, 12);
    expect(s.tolerance).toBe(0);
    expect(s.quality).toBeCloseTo(0.5, 12);
  });

  it('un tubo colgante cuenta en el coste pero no separa a nadie', () => {
    const path = plate({
      x: [0.5, 1.5, 2.5, 1.5],
      y: [0.5, 0.5, 0.5, 1.5],
      edges: [
        [0, 1],
        [1, 2],
        [1, 3],
      ],
      fixedFoods: [0, 2],
    });
    const g = buildPlateGraph(path, 0);
    const s = measureOn(on(g), g);
    expect(s.cost).toBeCloseTo(1.5, 12);
    expect(s.tolerance).toBeCloseTo(1 / 3, 12);
  });

  it('con copos sueltos la calidad sale de la componente con más copos; con menos de dos, 0', () => {
    const g = buildPlateGraph(SQUARE, 0);
    const p = on(g);
    // Solo vive 0–1: dos copos unidos de cuatro.
    p.conductivity = [1, 1e-4, 1e-4, 1e-4];
    const s = measureOn(p, g);
    expect(s.joined).toBe(2);
    expect(s.connected).toBe(false);
    expect(s.quality).toBeCloseTo(0.5, 12);
    p.conductivity = [1e-4, 1e-4, 1e-4, 1e-4];
    const none = measureOn(p, g);
    expect(none.joined).toBe(1);
    expect(none.quality).toBe(0);
    expect(none.cost).toBe(Number.POSITIVE_INFINITY);
  });

  it('cuenta los tubos vivos y los que se están secando', () => {
    const g = buildPlateGraph(SQUARE, 0);
    const p = on(g);
    p.conductivity = [1, 0.05, 0.03, 0.005];
    const s = measureOn(p, g);
    expect(s.alive).toBe(1);
    expect(s.drying).toBe(2);
  });
});

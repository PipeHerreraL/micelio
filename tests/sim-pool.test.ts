import { afterEach, describe, expect, it } from 'vitest';
import { journeyPlan, startJourney, type SimTask } from '../scripts/sim-play.ts';
import { createPool, poolSize, type SimPool } from '../scripts/sim-pool.ts';

/**
 * Simulador de la red repartido entre hilos (fase 10): lo que juega no puede depender de cuántos
 * hilos haya ni de cuál juegue cada tarea, y un orden del viaje jugado en trozos (prefijo y rama,
 * sobre copias) debe dar lo mismo que de un tirón. Si no, `npm run sim` daría otras cifras en
 * otro ordenador y las filas de docs/BALANCE.md no se podrían comparar entre commits.
 */

const pools: SimPool[] = [];
function pool(size: number): SimPool {
  const created = createPool(size);
  pools.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((p) => p.close()));
});

/** Tareas cortas (unos segundos en total), de todas las clases que no necesitan un natal. */
const TASKS: SimTask[] = [
  { kind: 'firstRun', seed: 11, profile: 'active' },
  { kind: 'firstRun', seed: 23, profile: 'active' },
  { kind: 'firstRun', seed: 37, profile: 'passive' },
  { kind: 'firstRun', seed: 41, profile: 'passive' },
  { kind: 'campaign', seed: 53, sporulations: 2, policy: 'doubling' },
  { kind: 'campaign', seed: 67, sporulations: 2, policy: 'rate' },
];

describe('reparto del simulador entre hilos', () => {
  it('1 hilo, 4 hilos y el hilo principal juegan exactamente lo mismo', async () => {
    const playAll = (size: number) => {
      const shared = pool(size);
      return Promise.all(TASKS.map((task) => shared.run(task)));
    };
    const [one, four, inline] = await Promise.all([playAll(1), playAll(4), playAll(0)]);
    expect(four).toEqual(one);
    expect(inline).toEqual(one);
  }, 60_000);

  it('SIM_WORKERS fija los hilos (0 = el hilo principal) y rechaza lo que no es un entero ≥ 0', () => {
    expect(poolSize({ SIM_WORKERS: '4' })).toBe(4);
    expect(poolSize({ SIM_WORKERS: '0' })).toBe(0);
    expect(poolSize({})).toBeGreaterThanOrEqual(1);
    expect(() => poolSize({ SIM_WORKERS: '-1' })).toThrow();
    expect(() => poolSize({ SIM_WORKERS: '2.5' })).toThrow();
    expect(() => poolSize({ SIM_WORKERS: 'muchos' })).toThrow();
  });
});

describe('órdenes del viaje en el simulador', () => {
  it('con un solo anillo (taiga y Chocó) salen los dos órdenes de la 1.5 y ninguna rama', () => {
    expect(journeyPlan()).toEqual({
      prefixes: [
        ['taiga', 'choco'],
        ['choco', 'taiga'],
      ],
      branches: [[]],
    });
  });

  it('un viaje jugado en dos trozos, sobre copias, da lo mismo que de un tirón', async () => {
    // En el hilo principal, que copia como postMessage: si no copiara, el prefijo jugado una vez
    // no podría servir a dos ramas.
    const inline = pool(0);
    const natal = await inline.run({ kind: 'natal', seed: 11, policy: 'doubling' });
    const start = startJourney(natal, 'doubling', false);
    const untouched = structuredClone(start);
    const straight = await inline.run({
      kind: 'journey',
      journey: start,
      path: ['taiga', 'choco'],
      finish: false,
    });
    expect(start).toEqual(untouched);
    const prefix = await inline.run({
      kind: 'journey',
      journey: startJourney(natal, 'doubling', false),
      path: ['taiga'],
      finish: false,
    });
    const split = await inline.run({ kind: 'journey', journey: prefix, path: ['choco'], finish: false });
    // El viaje llega entero: si no, la comparación no diría nada del segundo tramo.
    expect(straight.legs.map((leg) => [leg.biome, leg.colonizeTime !== null])).toEqual([
      ['taiga', true],
      ['choco', true],
    ]);
    expect(split).toEqual(straight);
  }, 60_000);
});

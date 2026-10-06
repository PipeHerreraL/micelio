import { describe, expect, it } from 'vitest';
import { cycleRunMedians, longestCycleRun, waitRunMedian } from '../scripts/sim-report.ts';

/**
 * Las medianas por partida del ciclo libre en el informe del simulador (BUG-JOURNAL #28): la
 * partida de espera para pagar la siembra no puede desplazar las demás. Cifras en minutos, para
 * leerlas; las medianas de un número par de valores son la media de los dos del centro.
 */

const MIN = 60;

/**
 * Cuatro ciclos de cinco partidas tras sembrar, con la cuarta como la más larga. Los dos primeros
 * esperan antes una partida de 15 min, como el bioma que abre la vuelta tras El regreso.
 */
const CYCLES = [
  { runs: [15, 18, 22, 36, 65, 30].map((m) => m * MIN), waits: 1 },
  { runs: [15, 19, 23, 37, 66, 31].map((m) => m * MIN), waits: 1 },
  { runs: [17, 21, 35, 64, 32].map((m) => m * MIN), waits: 0 },
  { runs: [18, 22, 34, 63, 33].map((m) => m * MIN), waits: 0 },
];

describe('medianas por partida del ciclo libre (simulador)', () => {
  it('la partida de espera no desplaza las demás: la cuarta de cada ciclo se compara con la cuarta', () => {
    // Antes, la cuarta mediana mezclaba dos cuartas (64 y 63) con dos terceras (36 y 37): 50 min.
    expect(cycleRunMedians(CYCLES)).toEqual([18, 22, 35.5, 64.5, 31.5].map((m) => m * MIN));
    expect(longestCycleRun(CYCLES)).toBe(64.5 * MIN);
  });

  it('sin la que cumple la meta, para la más corta del régimen estable', () => {
    expect(cycleRunMedians(CYCLES, true)).toEqual([18, 22, 35.5, 64.5].map((m) => m * MIN));
  });

  it('la espera va aparte, con la mediana de los ciclos que la tuvieron, y cuenta en la más larga', () => {
    expect(waitRunMedian(CYCLES)).toBe(15 * MIN);
    expect(waitRunMedian(CYCLES.slice(2))).toBeNull();
    // Una espera más larga que todas las demás partidas es la más larga.
    const longWait = [
      { runs: [70, 10, 20].map((m) => m * MIN), waits: 1 },
      { runs: [10, 20].map((m) => m * MIN), waits: 0 },
    ];
    expect(longestCycleRun(longWait)).toBe(70 * MIN);
  });

  it('un ciclo que no llegó (null) no cuenta, y sin ninguno no hay partida más larga', () => {
    expect(cycleRunMedians([...CYCLES.slice(2), null])).toEqual(
      [17.5, 21.5, 34.5, 63.5, 32.5].map((m) => m * MIN),
    );
    expect(longestCycleRun([null, null])).toBeNull();
  });
});

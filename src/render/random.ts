/**
 * Azar con semilla para el dibujo.
 *
 * Usa el mismo mulberry32 de src/core/rng.ts (una sola copia del algoritmo), pero con su
 * propio portador de semilla: si el dibujo avanzara `state.rngSeed`, mirar la red cambiaría
 * la partida y el simulador dejaría de repetir corridas. Con una semilla aparte, el mismo
 * estado vuelve a dibujar la misma red al recargar.
 */
import { nextRandom, toSeed, type RngHolder } from '../core/rng.ts';

export interface SeededRandom {
  /** Vuelve a empezar la secuencia desde `seed` (sin crear objetos). */
  reset(seed: number): void;
  /** Número en [0, 1). */
  next(): number;
}

export function createSeededRandom(seed: number): SeededRandom {
  const holder: RngHolder = { rngSeed: toSeed(seed) };
  return {
    reset(value: number): void {
      holder.rngSeed = toSeed(value);
    },
    next(): number {
      return nextRandom(holder);
    },
  };
}

/**
 * Mezcla dos enteros en una semilla de 32 bits (finalizador de murmur3). Sirve para sacar
 * secuencias independientes de una misma semilla: fondo, adornos y una red por partida.
 */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

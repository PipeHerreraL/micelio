/**
 * Azar con semilla para el dibujo.
 *
 * Usa el mismo mulberry32 de src/core/rng.ts (una sola copia del algoritmo), pero con su
 * propio portador de semilla: si el dibujo avanzara `state.rngSeed`, mirar la red cambiaría
 * la partida y el simulador dejaría de repetir corridas. Con una semilla aparte, el mismo
 * estado vuelve a dibujar la misma red al recargar.
 */
import { nextRandom, toSeed, type RngHolder } from '../core/rng.ts';

/** Vive en el núcleo (el socio deriva su semilla sin importar de render/); se reexporta aquí. */
export { mixSeed } from '../core/rng.ts';

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

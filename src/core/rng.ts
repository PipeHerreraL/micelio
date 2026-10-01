/**
 * Generador pseudoaleatorio con semilla (mulberry32).
 *
 * Todo el azar de la lógica pasa por aquí y su estado vive en el propio GameState
 * (`rngSeed`), así que una partida guardada y recargada sigue la misma secuencia y el
 * simulador puede repetir una corrida exacta a partir de su semilla.
 */
export interface RngHolder {
  rngSeed: number;
}

/** Devuelve un número en [0, 1) y avanza la semilla. */
export function nextRandom(holder: RngHolder): number {
  holder.rngSeed = (holder.rngSeed + 0x6d2b79f5) >>> 0;
  let t = holder.rngSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Número uniforme en [min, max). */
export function randomRange(holder: RngHolder, min: number, max: number): number {
  return min + (max - min) * nextRandom(holder);
}

/** Normaliza cualquier número a una semilla entera sin signo de 32 bits. */
export function toSeed(value: number): number {
  return Math.floor(Math.abs(value)) >>> 0;
}

/**
 * Mezcla dos enteros en una semilla de 32 bits (finalizador de murmur3). Sirve para sacar
 * secuencias independientes de una misma semilla: fondo, adornos, una red por partida y el azar
 * propio de cada socio, que se deriva de `rngSeed` sin avanzarla.
 */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

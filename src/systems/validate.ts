/**
 * Validadores de datos no confiables (ARCHITECTURE.md §6), compartidos por el guardado y por
 * el estado de cada socio (src/partners/): la regla de qué es un conteo o una fecha válida vive
 * una sola vez.
 */

export type RawObject = Record<string, unknown>;

export function isObject(value: unknown): value is RawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonNegative(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

export function isCount(value: unknown): value is number {
  return isNonNegative(value) && Number.isInteger(value);
}

/**
 * Mayor marca de tiempo que admite Date (8,64e15 ms, el año 275760). Date.now() nunca llega,
 * así que solo un guardado editado la pasa; sin este tope, la Crónica fallaba al formatear la
 * fecha (Intl lanza RangeError) y una pestaña quedaba vacía o el bucle se paraba.
 */
export const MAX_TIMESTAMP = 8.64e15;

export function isTimestamp(value: unknown): value is number {
  return isNonNegative(value) && value <= MAX_TIMESTAMP;
}

/** Lista de valores válidos sin repetir (los repetidos se descartan); null si alguno no vale. */
export function uniqueList<T extends string>(value: unknown, isValid: (v: unknown) => v is T): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const item of value) {
    if (!isValid(item)) return null;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

export function oneOf<T>(value: unknown, options: readonly T[]): value is T {
  return options.includes(value as T);
}

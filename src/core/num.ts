/**
 * Todas las operaciones sobre cantidades de balance (nutrientes, costes, producción).
 *
 * Hoy `Num` es el `number` nativo: el simulador muestra que el balance no pasa de 1e300 en
 * las primeras 10 esporulaciones (ver docs/BALANCE.md). Si algún día hiciera falta
 * `break_eternity.js`, este es el único archivo que debería cambiar: el resto del código
 * no usa aritmética suelta sobre cantidades de balance.
 */
export type Num = number;

export const ZERO: Num = 0;
export const ONE: Num = 1;

export const from = (value: number): Num => value;
export const toNumber = (value: Num): number => value;

export const add = (a: Num, b: Num): Num => a + b;
export const sub = (a: Num, b: Num): Num => a - b;
export const mul = (a: Num, b: Num): Num => a * b;
export const div = (a: Num, b: Num): Num => a / b;
export const pow = (base: Num, exponent: number): Num => base ** exponent;
export const sqrt = (a: Num): Num => Math.sqrt(a);
export const floor = (a: Num): Num => Math.floor(a);
export const ceil = (a: Num): Num => Math.ceil(a);
export const log10 = (a: Num): number => Math.log10(a);
/** Logaritmo en base `base`. */
export const logBase = (a: Num, base: number): number => Math.log(a) / Math.log(base);

export const max = (a: Num, b: Num): Num => (a > b ? a : b);
export const min = (a: Num, b: Num): Num => (a < b ? a : b);

export const gt = (a: Num, b: Num): boolean => a > b;
export const gte = (a: Num, b: Num): boolean => a >= b;
export const lt = (a: Num, b: Num): boolean => a < b;
export const lte = (a: Num, b: Num): boolean => a <= b;
export const eq = (a: Num, b: Num): boolean => a === b;

/**
 * Techo de cualquier cantidad de balance. Por encima de ~1.8e308 un `number` se vuelve
 * `Infinity`, que JSON escribe como `null` y haría pasar la partida por dañada al cargar.
 * El balance no llega ni a 1e14 en 10 esporulaciones (docs/BALANCE.md); el techo solo
 * protege el guardado de las campañas muy largas. Si algún día se roza, toca migrar a
 * break_eternity.js (ARCHITECTURE.md §4.3).
 */
export const CEILING: Num = 1e300;

/** Lleva una cantidad al rango válido: lo no finito o por encima del techo queda en el techo. */
export const clamp = (a: Num): Num => {
  if (Number.isNaN(a)) return 0;
  return a > CEILING ? CEILING : a < 0 ? 0 : a;
};

/** Un número de balance válido es finito y no negativo. */
export const isValid = (a: unknown): a is Num => typeof a === 'number' && Number.isFinite(a) && a >= 0;

/** Forma en que una cantidad viaja dentro del guardado. */
export const serialize = (a: Num): number => a;
export const parse = (raw: unknown): Num | null => (isValid(raw) ? raw : null);

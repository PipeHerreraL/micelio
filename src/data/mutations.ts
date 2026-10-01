/**
 * Árbol de mutaciones (PROMPT.md §10). Permanentes; se pagan con esporas disponibles.
 * El texto vive en src/i18n con las claves `mut.<id>.name` y `mut.<id>.desc`.
 */

export const MUTATION_IDS = [
  'soilMemory',
  'lightChitin',
  'deepAbsorption',
  'rainScent',
  'winterSleep',
  'instinct',
  'perfectStorm',
  'ancientSymbiosis',
  'beyondForest',
  'wingedSpores',
  'higherInstinct',
  'inheritance',
] as const;

export type MutationId = (typeof MUTATION_IDS)[number];

export interface MutationDef {
  id: MutationId;
  cost: number;
  requires: readonly MutationId[];
  /** Posición en el dibujo del árbol: columna (0–4) y fila (0–4). */
  col: number;
  row: number;
}

/** En el orden de la tabla de PROMPT.md §10: es también el orden de compra del simulador. */
export const MUTATIONS: readonly MutationDef[] = [
  { id: 'soilMemory', cost: 1, requires: [], col: 2, row: 0 },
  { id: 'lightChitin', cost: 3, requires: ['soilMemory'], col: 0, row: 1 },
  { id: 'deepAbsorption', cost: 3, requires: ['soilMemory'], col: 3, row: 1 },
  { id: 'rainScent', cost: 5, requires: ['deepAbsorption'], col: 4, row: 2 },
  { id: 'winterSleep', cost: 5, requires: ['soilMemory'], col: 2, row: 1 },
  { id: 'instinct', cost: 10, requires: ['lightChitin'], col: 0, row: 2 },
  { id: 'perfectStorm', cost: 15, requires: ['rainScent'], col: 4, row: 3 },
  { id: 'ancientSymbiosis', cost: 20, requires: ['deepAbsorption'], col: 3, row: 2 },
  { id: 'beyondForest', cost: 25, requires: ['instinct'], col: 1, row: 3 },
  { id: 'wingedSpores', cost: 40, requires: ['ancientSymbiosis'], col: 3, row: 3 },
  { id: 'higherInstinct', cost: 60, requires: ['instinct'], col: 0, row: 3 },
  { id: 'inheritance', cost: 100, requires: ['beyondForest', 'wingedSpores'], col: 2, row: 4 },
];

// Efectos. Cada valor sale de la tabla de PROMPT.md §10 o §11.

/** Memoria del suelo: cada partida empieza con estos nutrientes y Hifas. */
export const SOIL_MEMORY_NUTRIENTS = 100;
export const SOIL_MEMORY_HYPHAE = 10;
/** Quitina ligera: descuento d sobre el coste de los generadores. */
export const LIGHT_CHITIN_DISCOUNT = 0.1;
/** Absorción profunda: porcentaje de N/s que suma cada clic. */
export const DEEP_ABSORPTION_CLICK_PERCENT = 0.03;
/** Olfato de lluvia: la lluvia aparece un 30 % más seguido (el intervalo se divide por esto). */
export const RAIN_SCENT_FREQUENCY = 1.3;
/** Tormenta perfecta: los efectos de la lluvia duran un 50 % más. */
export const PERFECT_STORM_DURATION = 1.5;
/** Bono de producción por logro: base y con Simbiosis antigua. */
export const ACHIEVEMENT_BONUS_BASE = 0.01;
export const ACHIEVEMENT_BONUS_SYMBIOSIS = 0.02;
/** Constante k de la fórmula de esporas: base y con Esporas aladas (+25 %). */
export const SPORE_K_BASE = 15;
export const SPORE_K_WINGED = 18.75;
/** Herencia: unidades de cada uno de los cuatro primeros generadores al empezar. */
export const INHERITANCE_UNITS = 10;
export const INHERITANCE_GENERATORS = ['hypha', 'rhizomorph', 'primordium', 'mushroom'] as const;
/** Progreso offline: eficiencia y límite, base y con Sueño invernal. */
export const OFFLINE_EFFICIENCY_BASE = 0.5;
export const OFFLINE_EFFICIENCY_WINTER = 1;
export const OFFLINE_CAP_BASE_SECONDS = 8 * 3600;
export const OFFLINE_CAP_WINTER_SECONDS = 24 * 3600;

const BY_ID = new Map(MUTATIONS.map((m) => [m.id, m]));

export function getMutation(id: MutationId): MutationDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Mutación desconocida: ${id}`);
  return def;
}

export function isMutationId(value: unknown): value is MutationId {
  return typeof value === 'string' && BY_ID.has(value as MutationId);
}

/**
 * Adaptaciones (docs/ROADMAP.md, fase 7): mejoras repetibles que se pagan con esporas
 * disponibles cuando el árbol de mutaciones está completo. Son el sumidero de las esporas
 * que antes se acumulaban sin uso. El texto vive en src/i18n con las claves
 * `adapt.<id>.name` y `adapt.<id>.desc`.
 *
 * Cada coste crece ×2 o más por rango, al ritmo al que crece el ingreso de esporas, para que
 * salga cerca de un rango por partida (prototipo de la exploración de diseño; los valores
 * definitivos los fija `npm run sim`, ver docs/BALANCE.md).
 */

export const ADAPTATION_IDS = ['apicalBody', 'sclerotium', 'hydraulicLift', 'deepTorpor', 'foxfire'] as const;

export type AdaptationId = (typeof ADAPTATION_IDS)[number];

export interface AdaptationDef {
  id: AdaptationId;
  /** Coste del primer rango, en esporas. */
  baseCost: number;
  /** Factor del coste por rango ya comprado. */
  growth: number;
  /** Rango máximo (null = sin tope). */
  max: number | null;
}

export const ADAPTATIONS: readonly AdaptationDef[] = [
  // Cuerpo apical: sube el umbral de madurez. El único sin tope: es el sumidero de fondo.
  { id: 'apicalBody', baseCost: 300, growth: 2, max: null },
  { id: 'sclerotium', baseCost: 200, growth: 3, max: 4 },
  { id: 'hydraulicLift', baseCost: 150, growth: 2.5, max: 4 },
  { id: 'deepTorpor', baseCost: 300, growth: 2, max: 4 },
  { id: 'foxfire', baseCost: 1000, growth: 4, max: 3 },
];

/** Cuerpo apical: cada rango multiplica el umbral de madurez por esto. */
export const APICAL_THRESHOLD_GROWTH = 1.1;
/** Esclerocio: la partida empieza con 10^(3 + rango) N (1e4 con el primer rango). */
export const SCLEROTIUM_BASE_EXPONENT = 3;
/** Redistribución hidráulica: segundos extra de vida de la gota por rango. */
export const HYDRAULIC_DROP_SECONDS = 2;
/** Letargo profundo: horas extra de tope offline por rango. */
export const TORPOR_OFFLINE_HOURS = 6;

const BY_ID = new Map(ADAPTATIONS.map((a) => [a.id, a]));

export function getAdaptation(id: AdaptationId): AdaptationDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Adaptación desconocida: ${id}`);
  return def;
}

export function isAdaptationId(value: unknown): value is AdaptationId {
  return typeof value === 'string' && BY_ID.has(value as AdaptationId);
}

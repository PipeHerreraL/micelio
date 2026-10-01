/**
 * Evento aleatorio: Lluvia (PROMPT.md §9). Solo datos.
 */

/** Intervalo entre gotas, en segundos, sorteado uniforme entre estos dos valores. */
export const RAIN_INTERVAL_MIN = 120;
export const RAIN_INTERVAL_MAX = 300;
/** Segundos que la gota permanece antes de evaporarse. */
export const DROP_LIFETIME = 12;

export type RainEffectKind = 'downpour' | 'dew' | 'storm';

export interface RainEffectDef {
  kind: RainEffectKind;
  /** Probabilidad de salir al atrapar una gota. Suman 1. */
  chance: number;
  /** Duración base en segundos (0 = instantáneo). */
  duration: number;
}

export const RAIN_EFFECTS: readonly RainEffectDef[] = [
  { kind: 'downpour', chance: 0.55, duration: 60 },
  { kind: 'dew', chance: 0.35, duration: 0 },
  { kind: 'storm', chance: 0.1, duration: 12 },
];

/** Aguacero: multiplicador E de la producción mientras dura. */
export const DOWNPOUR_MULTIPLIER = 5;
/** Rocío: fracción de los nutrientes actuales y minutos de producción; se gana el menor. */
export const DEW_FRACTION = 0.12;
export const DEW_PRODUCTION_SECONDS = 12 * 60;
/** Tormenta eléctrica: multiplicador del valor del clic (ARCHITECTURE.md §4.8). */
export const STORM_CLICK_MULTIPLIER = 500;

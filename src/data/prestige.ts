/**
 * Esporular (PROMPT.md §10). Solo datos.
 */

/** Nutrientes ganados en la partida necesarios para poder esporular. */
export const SPORULATE_REQUIREMENT = 1e8;
/** Nutrientes de vida que dan la unidad base de la fórmula E(L) = ⌊k √(L / 1e8)⌋. */
export const SPORE_SCALE = 1e8;
/**
 * Bono de producción global por nivel de esporas. El prototipo en Python probó +2 % y las
 * partidas 6 a 8 de la campaña bajaban de 10 min (PROMPT.md §17); por eso +1 %.
 */
export const SPORE_LEVEL_BONUS = 0.01;
/** La pestaña Esporular aparece al llegar a esta fracción del requisito (PROMPT.md §12). */
export const SPORULATE_TAB_REVEAL = 0.25;

/** Partidas que guarda el historial: bastan para la Crónica y no hinchan el guardado. */
export const HISTORY_LIMIT = 50;

/**
 * Madurez de la red (docs/ROADMAP.md, fase 7): hasta este nivel, cada nivel de esporas da +1 %;
 * por encima, cada nivel aporta menos. 1000 y no 200 (lo que midió el prototipo) para no
 * recortar las partidas avanzadas de la 1.0: es decisión del usuario.
 */
export const SPORE_SOFTCAP_BASE = 1000;
/**
 * Exponente por encima del umbral: factor = 1 + 0.01·S0·(S/S0)^β. Lo fija la campaña larga del
 * simulador (docs/BALANCE.md).
 */
export const SPORE_SOFTCAP_EXPONENT = 0.5;

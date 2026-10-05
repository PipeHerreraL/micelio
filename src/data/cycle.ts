/**
 * Ciclo libre y votos (docs/ROADMAP.md, fase 10): tras El regreso, sembrar cualquier bioma por
 * esporas fijas y, si se quiere, jurar votos que quitan algo y rebajan la meta. Solo datos; el
 * texto vive en src/i18n.
 *
 * El guardado v7 trae ya sus claves (`cycle`, `records`): así ninguna v7 escrita antes de que
 * lleguen sus reglas deja de cargar después (ARCHITECTURE.md §5).
 */

/** En el orden en que se guardan y se comparan los votos de un récord. */
export const VOW_IDS = ['noRain', 'autoOnly', 'noMutations'] as const;
export type VowId = (typeof VOW_IDS)[number];

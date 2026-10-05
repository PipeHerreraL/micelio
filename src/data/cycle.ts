/**
 * Ciclo libre y votos (docs/ROADMAP.md, fase 10): tras El regreso, sembrar cualquier bioma por
 * esporas fijas y, si se quiere, jurar votos que quitan algo y rebajan la meta. Solo datos; el
 * texto vive en src/i18n.
 *
 * El guardado v7 trae ya sus claves (`cycle`, `records`): así ninguna v7 escrita antes de que
 * lleguen sus reglas deja de cargar después (ARCHITECTURE.md §5).
 */
import { COLONIZE_LEVEL, DISPERSE_COST } from './biomes.ts';

/** En el orden en que se guardan y se comparan los votos de un récord. */
export const VOW_IDS = ['noRain', 'autoOnly', 'noMutations'] as const;
export type VowId = (typeof VOW_IDS)[number];

/**
 * Meta de El regreso y de cada ciclo: el nivel de esporas local que coloniza un bioma. Es el mismo
 * número a propósito: bajar la meta del ciclo cambiaría el sentido de «nivel 500», que ya usa la
 * colonización.
 */
export const CYCLE_GOAL_LEVEL = COLONIZE_LEVEL;

/**
 * Esporas que cuesta sembrar: las mismas que un viaje, fijas como él (la excepción medida de
 * Dispersar). Con R y linaje fijos el ingreso de un ciclo también es plano (unas 500 esporas
 * brutas), así que un coste que creciera acabaría por no poder pagarse.
 */
export const SOW_COST = DISPERSE_COST;

/**
 * Tope de récords, uno por bioma y combinación de votos mantenidos: cuatro biomas × 8
 * combinaciones y el Chocó × 4 (allí no se ofrece «sin lluvia»). Sin votos, cinco.
 */
export const MAX_RECORDS = 36;

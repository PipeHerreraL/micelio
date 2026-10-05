/**
 * El viaje en el núcleo (docs/ROADMAP.md, fases 8 y 10): cerrar el Acto I, colonizar un bioma y
 * cumplir El regreso. Lo hace el núcleo y no la interfaz para que el simulador y las partidas 1.x
 * lo vean igual, sin pantalla (ARCHITECTURE.md §4.28). Son las tres únicas funciones que escriben
 * en la Crónica, cada una en sus tramos (0, 1–4 y 5) y como mucho una entrada por tramo: así se
 * acota donde se construye (seis entradas como mucho).
 */
import {
  ACT_ONE_ACHIEVEMENT,
  COLONIZE_LEVEL,
  HOME_BIOME,
  RETURN_LEG,
  isDestinationId,
} from '../data/biomes.ts';
import { CYCLE_GOAL_LEVEL } from '../data/cycle.ts';
import { emit } from '../core/events.ts';
import { isActOneClosed, isForestColonized, isReturnClosed, lineageFactor } from '../core/forest.ts';
import { invalidate } from '../core/selectors.ts';
import { isTreeComplete, type ChronicleEntry, type GameState } from '../core/state.ts';

/** Entrada de la Crónica del bosque actual, con lo hecho en él hasta ahora. */
function entryNow(state: GameState, colonizedAt: number | null): ChronicleEntry {
  const forest = state.forest;
  return {
    biome: forest.biome,
    leg: forest.leg,
    arrivedAt: forest.arrivedAt,
    colonizedAt,
    sporulations: state.stats.sporulations - forest.arrivalSporulations,
    playTime: Math.max(0, state.stats.totalTime - forest.arrivalPlayTime),
    leftAt: null,
    levelReached: null,
  };
}

/**
 * Cierra el Acto I cuando el árbol de mutaciones está completo y alguna vez hubo una Red
 * planetaria. No toca multiplicadores ni consume azar: el natal sigue idéntico. Lo llaman el
 * tick (una vez por segundo de juego) y el tiempo aplicado de forma analítica; una partida 1.x
 * que ya lo cumplía lo cierra en su primer segundo. Devuelve si lo cerró ahora.
 */
export function checkActOne(state: GameState): boolean {
  if (state.forest.leg !== 0 || state.forest.biome !== HOME_BIOME || isActOneClosed(state)) return false;
  if (!isTreeComplete(state) || !state.achievements.includes(ACT_ONE_ACHIEVEMENT)) return false;
  // Sin reloj en el tick: el Acto I no guarda fecha (la Crónica muestra la de llegada).
  state.chronicle.push(entryNow(state, null));
  emit({ type: 'actOneClosed' });
  return true;
}

/**
 * Coloniza el bioma actual si el nivel local llega a 500. Lo llama `sporulate` justo después
 * de subir el nivel, que es el único momento en que el nivel cambia. Cambia el linaje, así que
 * invalida. Devuelve si colonizó ahora.
 */
export function checkColonization(state: GameState, now: number): boolean {
  const biome = state.forest.biome;
  if (state.forest.leg < 1 || !isDestinationId(biome) || isForestColonized(state)) return false;
  if (state.spores.level < COLONIZE_LEVEL || !Number.isFinite(now) || now < 0) return false;
  state.chronicle.push(entryNow(state, now));
  invalidate(state);
  emit({ type: 'colonized', biome, leg: state.forest.leg, factor: lineageFactor(state) });
  return true;
}

/**
 * Cumple El regreso (fase 10) si el nivel local del natal, en el tramo 5, llega a 500: escribe la
 * sexta y última entrada de la Crónica, una sola vez. Como al colonizar, lo llama `sporulate` justo
 * después de subir el nivel; la entrada se escribe al cumplir y no al llegar, para que el epílogo se
 * «cumpla». El linaje no cambia (solo cuentan los destinos), así que no invalida. Devuelve si lo
 * cumplió ahora.
 */
export function checkReturn(state: GameState, now: number): boolean {
  const forest = state.forest;
  if (forest.leg !== RETURN_LEG || forest.biome !== HOME_BIOME || isReturnClosed(state)) return false;
  // Solo con las cinco entradas de antes: la de El regreso es la sexta.
  if (state.chronicle.length !== RETURN_LEG) return false;
  if (state.spores.level < CYCLE_GOAL_LEVEL || !Number.isFinite(now) || now < 0) return false;
  state.chronicle.push(entryNow(state, now));
  emit({ type: 'returned' });
  return true;
}

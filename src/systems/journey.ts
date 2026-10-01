/**
 * El viaje en el núcleo (docs/ROADMAP.md, fase 8): cerrar el Acto I y colonizar un bioma. Lo
 * hace el núcleo y no la interfaz para que el simulador y las partidas 1.x lo vean igual, sin
 * pantalla (ARCHITECTURE.md §4.28). Son las dos únicas funciones que escriben en la Crónica, y
 * cada una añade como mucho una entrada por tramo: así se acota donde se construye.
 */
import { ACT_ONE_ACHIEVEMENT, COLONIZE_LEVEL, HOME_BIOME, isDestinationId } from '../data/biomes.ts';
import { emit } from '../core/events.ts';
import { isActOneClosed, isForestColonized, lineageFactor } from '../core/forest.ts';
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

/**
 * El ciclo libre en el núcleo (docs/ROADMAP.md, fase 10): cumplir un ciclo y escribir su récord.
 * Lo hace el núcleo y no la interfaz, como colonizar (systems/journey.ts), para que el simulador y
 * una partida que vuelve de offline lo vean igual. No escribe en la Crónica: el ciclo libre vive
 * entero en el tramo 5 y la Crónica se queda en seis entradas.
 */
import { CYCLE_GOAL_LEVEL, MAX_RECORDS } from '../data/cycle.ts';
import { emit } from '../core/events.ts';
import { recordFor } from '../core/forest.ts';
import { invalidate } from '../core/selectors.ts';
import type { CycleRecord, GameState } from '../core/state.ts';

/**
 * Escribe el récord de su bioma y sus votos si no lo había o si mejora el tiempo; un empate deja el
 * viejo. Se reemplaza en su sitio, así que la lista nunca pasa de una entrada por combinación.
 * Devuelve si escribió.
 */
function writeRecord(state: GameState, record: CycleRecord): boolean {
  const old = recordFor(state.records, record.biome, record.vows);
  if (old) {
    if (record.time >= old.time) return false;
    state.records[state.records.indexOf(old)] = record;
    return true;
  }
  // Inalcanzable: hay MAX_RECORDS combinaciones de bioma y votos. Si llegara a pasar, se pierde el
  // récord y no el guardado, que con más de MAX_RECORDS no validaría.
  if (state.records.length >= MAX_RECORDS) return false;
  state.records.push(record);
  return true;
}

/**
 * Cumple el ciclo si la esporulación que acaba de sumar `gained` lleva el nivel de por debajo de
 * 500 a 500 o más en un ciclo empezado. La llaman `sporulate` y, cuando sembrar esporula antes de
 * irse, `disperse`: así el ciclo queda cumplido aunque la esporulación que llega a la meta sea la de
 * partir. El tiempo es de reloj, desde la llegada: medido en tiempo jugado, cerrar el juego (offline
 * al 100 %) daría récords que no se jugaron. Un reloj que retrocede da 0, no un tiempo negativo,
 * que sería el mejor para siempre y que el guardado repara al cargar. Levanta los votos del ciclo
 * (cambian los derivados, así que invalida). Devuelve si lo cumplió ahora.
 */
export function checkCycleDone(state: GameState, gained: number, now: number): boolean {
  const { forest, cycle } = state;
  if (cycle.stays === 0 || !Number.isFinite(now) || now < 0) return false;
  const level = state.spores.level;
  if (level < CYCLE_GOAL_LEVEL || level - gained >= CYCLE_GOAL_LEVEL) return false;
  const vows = [...cycle.vows];
  const time = Math.max(0, now - forest.arrivedAt);
  const record = writeRecord(state, {
    biome: forest.biome,
    vows,
    time,
    runs: state.stats.sporulations - forest.arrivalSporulations,
    at: now,
  });
  cycle.done += 1;
  cycle.vows = [];
  cycle.woken = [];
  invalidate(state);
  emit({ type: 'cycleDone', biome: forest.biome, vows: [...vows], time, record });
  return true;
}

/**
 * Estados del final del viaje y del ciclo libre (fase 10), construidos solo con acciones: cerrar el
 * Acto I, dispersar y esporular, inyectando antes de esporular los nutrientes del bosque y de la
 * partida, como el simulador. Los comparten las pruebas del núcleo, del guardado, del simulador y
 * de la interfaz: la validación del tramo 5 es la zona del BUG-JOURNAL, y un estado escrito a mano
 * podría pasar por uno que el juego nunca produce.
 */
import { disperse, sporulate } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import { sporeScale, sporulateRequirement } from '../src/core/forest.ts';
import { derived } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import type { BiomeId } from '../src/data/biomes.ts';
import type { VowId } from '../src/data/cycle.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { checkActOne } from '../src/systems/journey.ts';

export const CYCLE_NOW = Date.UTC(2026, 9, 5);
export const HOUR = 3_600_000;

/** Deja la partida lista para que esporular (o partir) lleve el nivel local a `level`. */
export function primeLevel(s: GameState, level: number): void {
  // E = ⌊k · √(L / R)⌋: L = R · (level / k)² y un poco más. k es 18,75 con Esporas aladas y 15 si
  // duermen (el voto «sin mutaciones»).
  const k = derived(s).sporeK;
  const earned = sporeScale(s) * (level / k) ** 2 * 1.000001;
  s.lifetimeEarned = s.lifetimeEarned + earned - s.forest.earned;
  s.forest.earned = earned;
  s.runEarned = sporulateRequirement(s);
  s.stats.totalTime += 1800;
}

/** Esporula hasta el nivel local `level`, que debe ser mayor que el actual. */
export function reachLevel(s: GameState, level: number, now: number): void {
  primeLevel(s, level);
  sporulate(s, { now });
  if (s.spores.level !== level) throw new Error(`nivel ${s.spores.level} y no ${level}`);
}

/** El Acto I cerrado en el natal, con esporas para el viaje. */
export function actOneClosed(): GameState {
  const s = createState(17, CYCLE_NOW);
  s.mutations = [...MUTATION_IDS];
  s.achievements = ['own.planetary.1'];
  s.stats.sporulations = 9;
  s.stats.totalTime = 11_000;
  s.spores = { level: 1941, available: 2025 };
  checkActOne(s);
  return s;
}

/**
 * La tundra colonizada, cuarto destino: el Acto I, los cuatro viajes (taiga → Chocó → pradera →
 * tundra) y cada colonización por la esporulación que llega al nivel 520.
 */
export function fourthColonized(): GameState {
  const s = actOneClosed();
  const legs = ['taiga', 'choco', 'prairie', 'tundra'] as const;
  legs.forEach((to, i) => {
    disperse(s, { to, now: CYCLE_NOW + (i * 10 + 1) * HOUR });
    reachLevel(s, 520, CYCLE_NOW + (i * 10 + 5) * HOUR);
  });
  drain();
  return s;
}

/** De vuelta en el natal: El regreso en curso, cinco entradas. */
export function inReturn(): GameState {
  const s = fourthColonized();
  disperse(s, { to: 'natal', now: CYCLE_NOW + 41 * HOUR });
  drain();
  return s;
}

/** El regreso cumplido: seis entradas en la Crónica, linaje ×16, en el natal y sin ciclos. */
export function returnClosed(): GameState {
  const s = inReturn();
  reachLevel(s, 520, CYCLE_NOW + 45 * HOUR);
  drain();
  return s;
}

/** Recién sembrado `biome` a la hora `at` (tras El regreso, en el ciclo 1), con `vows` jurados. */
export function sownIn(biome: BiomeId, at = CYCLE_NOW + 60 * HOUR, vows: readonly VowId[] = []): GameState {
  const s = returnClosed();
  disperse(s, { to: biome, now: at, vows });
  if (s.forest.biome !== biome || s.cycle.stays !== 1) throw new Error(`no se sembró ${biome}`);
  drain();
  return s;
}

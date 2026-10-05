/**
 * Qué hace cada capa de reinicio con cada campo del estado. Escrito como tabla para que un
 * campo nuevo no se pueda olvidar: el tipo exige clasificar todas las claves de GameState, y
 * una prueba comprueba que esporular deja los campos «run» como en una partida nueva. Así se
 * evita la familia del BUG-JOURNAL #2 (un campo que un reinicio dejaba a medias).
 *
 * - run: vuelve al valor de una partida nueva.
 * - life: se conserva tal cual.
 * - custom: la acción lo trata a mano, con su motivo al lado.
 */
import type { GameState } from './state.ts';

export type ResetScope = 'run' | 'life' | 'custom';

export const SPORULATE_RESET: Readonly<Record<keyof GameState, ResetScope>> = {
  nutrients: 'run',
  runEarned: 'run',
  lifetimeEarned: 'life',
  owned: 'run',
  upgrades: 'run',
  // El nivel y las disponibles suben con las esporas ganadas.
  spores: 'custom',
  mutations: 'life',
  achievements: 'life',
  effects: 'run',
  // La gota visible se evapora y se sortea un intervalo nuevo (BUG-JOURNAL #2).
  rain: 'custom',
  autobuy: 'life',
  // Las de vida se conservan; el tiempo y el inicio de la partida vuelven a cero.
  stats: 'custom',
  settings: 'life',
  seen: 'life',
  rngSeed: 'life',
  // Se añade la partida que termina.
  history: 'custom',
  adaptations: 'life',
  sporeFloor: 'life',
  // Esporular no cambia de bosque; `earned` sigue sumando en gain().
  forest: 'life',
  // La esporulación que llega al nivel de colonizar añade una entrada (systems/journey.ts).
  chronicle: 'custom',
  biomeAdaptations: 'life',
  // El socio es otro organismo en su propia placa: ni la partida que termina ni el bosque que se
  // deja lo tocan. Reiniciarlo sería un impuesto a esporular (fase 9).
  partners: 'life',
  // La esporulación que cumple un ciclo (fase 10) suma `done` y levanta sus votos (systems/cycle.ts).
  cycle: 'custom',
  // La misma esporulación escribe o mejora su récord, en su sitio.
  records: 'custom',
};

/**
 * Dispersar (docs/ROADMAP.md, fase 8): la partida termina como al esporular y además el linaje
 * cambia de bosque. Lo que viaja «en las esporas» (mutaciones, adaptaciones, logros) es `life`.
 */
export const DISPERSE_RESET: Readonly<Record<keyof GameState, ResetScope>> = {
  nutrients: 'run',
  runEarned: 'run',
  lifetimeEarned: 'life',
  owned: 'run',
  upgrades: 'run',
  // El nivel vuelve a 0 (el territorio no viaja); las disponibles suben con la esporulación,
  // si la hubo, y pagan el viaje.
  spores: 'custom',
  mutations: 'life',
  achievements: 'life',
  effects: 'run',
  // Sin gota, y la espera se sortea con la lluvia del destino.
  rain: 'custom',
  autobuy: 'life',
  // runTime a 0 y runStartedAt a la llegada; las de vida se conservan (Malheur sigue abierto).
  stats: 'custom',
  settings: 'life',
  seen: 'life',
  rngSeed: 'life',
  // Anota la partida si terminó esporulando.
  history: 'custom',
  adaptations: 'life',
  // Se conserva: los selectores solo lo usan en el natal (tramo 0).
  sporeFloor: 'life',
  // Bioma nuevo, tramo + 1, nutrientes del bosque a 0 y marcas de llegada.
  forest: 'custom',
  // La entrada del bosque que se deja guarda la fecha de partida y el nivel alcanzado.
  chronicle: 'custom',
  biomeAdaptations: 'life',
  // Como al esporular: el plasmodio no viaja con las esporas ni se queda atrás; vive en su placa.
  partners: 'life',
  // Sembrar (fase 10) suma un ciclo empezado con sus votos y sin mutaciones despiertas; en el viaje
  // y en El regreso no cambia. Si la esporulación de partir cumple el ciclo, antes suma `done`.
  cycle: 'custom',
  // La esporulación de sembrar que llega al nivel 500 escribe o mejora el récord antes de irse.
  records: 'custom',
};

/** Copia de `fresh` (una partida nueva recién creada) los campos marcados como «run». */
export function resetFields(
  state: GameState,
  fresh: GameState,
  table: Readonly<Record<keyof GameState, ResetScope>>,
): void {
  for (const key of Object.keys(table) as (keyof GameState)[]) {
    // Misma clave en los dos lados: el valor nuevo siempre tiene el tipo del campo.
    if (table[key] === 'run') Object.assign(state, { [key]: fresh[key] });
  }
}

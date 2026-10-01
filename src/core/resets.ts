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

/**
 * Un paso de lógica en vivo. El bucle de main.ts lo llama a paso fijo de 50 ms; el
 * simulador, a pasos de 1 s. Todo lo que depende del tiempo usa `dt` en segundos.
 */
import { runAutobuy } from '../systems/autobuy.ts';
import { checkAchievements } from '../systems/achievements.ts';
import { updateRain } from '../systems/rain.ts';
import { gain } from './economy.ts';
import { emit } from './events.ts';
import * as num from './num.ts';
import { derived, invalidate } from './selectors.ts';
import type { GameState } from './state.ts';

/** Paso fijo del bucle de lógica en vivo (20 Hz). */
export const TICK_SECONDS = 0.05;

/** Descuenta `dt` a los efectos activos y quita los que terminaron. */
export function updateEffects(state: GameState, dt: number): void {
  if (state.effects.length === 0) return;
  const alive = [];
  for (const effect of state.effects) {
    effect.remaining -= dt;
    if (effect.remaining > 0) alive.push(effect);
    else emit({ type: 'effectEnd', kind: effect.kind });
  }
  if (alive.length !== state.effects.length) {
    state.effects = alive;
    invalidate(state);
  }
}

/** Avanza `dt` segundos de juego en vivo. */
export function tick(state: GameState, payload: { dt: number }): void {
  const dt = payload.dt;
  if (!(dt > 0)) return;
  const before = derived(state);
  // Si un efecto termina a mitad de paso, se cobra el paso entero con el multiplicador
  // con que empezó: a 50 ms la diferencia es invisible y el simulador (1 s) la acota.
  gain(state, num.mul(before.production, dt));
  if (num.gt(before.production, state.stats.maxNps)) state.stats.maxNps = before.production;

  updateEffects(state, dt);
  updateRain(state, dt);

  const previousSecond = Math.floor(state.stats.totalTime);
  state.stats.runTime += dt;
  state.stats.totalTime += dt;
  state.stats.idleClickTime += dt;

  // Una vez por segundo de juego: autocompra y logros.
  if (Math.floor(state.stats.totalTime) !== previousSecond) {
    runAutobuy(state);
    checkAchievements(state);
  }
}

/**
 * Tiempo aplicado de forma analítica (PROMPT.md §11, ARCHITECTURE.md §4.10): progreso
 * offline al cargar y puesta al día al volver de segundo plano. Nunca se repiten ticks.
 */
import { TORPOR_OFFLINE_HOURS } from '../data/adaptations.ts';
import { AWAY_ACHIEVEMENT_SECONDS } from '../data/achievements.ts';
import {
  OFFLINE_CAP_BASE_SECONDS,
  OFFLINE_CAP_WINTER_SECONDS,
  OFFLINE_EFFICIENCY_BASE,
  OFFLINE_EFFICIENCY_WINTER,
} from '../data/mutations.ts';
import { gain } from '../core/economy.ts';
import * as num from '../core/num.ts';
import type { Num } from '../core/num.ts';
import { derived, invalidate } from '../core/selectors.ts';
import { hasMutation, type GameState } from '../core/state.ts';
import { checkAchievements, grantAchievement } from './achievements.ts';
import { checkActOne } from './journey.ts';
import { checkPartnerUnlocks } from './partners.ts';
import { runAutobuy } from './autobuy.ts';
import { evaporateDrop } from './rain.ts';

/** Segundos ausentes a partir de los cuales se muestra «Mientras no estabas…». */
export const OFFLINE_REPORT_THRESHOLD = 60;

export function offlineEfficiency(state: GameState): number {
  return hasMutation(state, 'winterSleep') ? OFFLINE_EFFICIENCY_WINTER : OFFLINE_EFFICIENCY_BASE;
}

export function offlineCapSeconds(state: GameState): number {
  const base = hasMutation(state, 'winterSleep') ? OFFLINE_CAP_WINTER_SECONDS : OFFLINE_CAP_BASE_SECONDS;
  // Letargo profundo: +6 h de tope por rango.
  return base + TORPOR_OFFLINE_HOURS * 3600 * state.adaptations.deepTorpor;
}

export interface ElapsedOptions {
  /** Fracción de la producción que se cobra (0.5 offline base, 1 en segundo plano). */
  efficiency: number;
  /** Si el intervalo cuenta como tiempo jugado (sí en segundo plano, no offline). */
  countsAsPlayTime: boolean;
}

/**
 * Aplica `seconds` de producción de golpe. Reparte el intervalo en tramos: mientras dura
 * un Aguacero activo se cobra con su multiplicador y el resto sin él. La lluvia no avanza
 * y la gota visible se evapora. Al final corre la autocompra una vez y revisa logros.
 * Devuelve los nutrientes ganados.
 */
export function applyElapsed(state: GameState, seconds: number, options: ElapsedOptions): Num {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return num.ZERO;

  const withEvent = derived(state).production;
  // Del selector y no dividiendo: los clics automáticos no se multiplican igual que los
  // generadores (ARCHITECTURE.md §4.10).
  const withoutEvent = derived(state).productionWithoutEvent;
  const downpour = state.effects.find((e) => e.kind === 'downpour');
  const boosted = downpour ? Math.min(downpour.remaining, seconds) : 0;

  let produced = num.add(num.mul(withEvent, boosted), num.mul(withoutEvent, seconds - boosted));
  produced = num.mul(produced, options.efficiency);

  for (const effect of state.effects) effect.remaining -= seconds;
  state.effects = state.effects.filter((e) => e.remaining > 0);
  invalidate(state);
  evaporateDrop(state);

  gain(state, produced);
  if (options.countsAsPlayTime) {
    state.stats.runTime += seconds;
    state.stats.totalTime += seconds;
  }

  runAutobuy(state);
  checkAchievements(state);
  checkActOne(state);
  checkPartnerUnlocks(state);
  return produced;
}

export interface OfflineReport {
  /** Segundos reales entre el último guardado y ahora (0 si el reloj retrocedió). */
  elapsed: number;
  /** Segundos efectivos tras el límite (8 h o 24 h). */
  effective: number;
  efficiency: number;
  gained: Num;
  /** Si el intervalo superó el límite y se recortó. */
  capped: boolean;
}

/**
 * Progreso offline al cargar: aplica el tiempo desde `savedAt` hasta `now` con la
 * eficiencia y el límite de offline. Un reloj que retrocede da un intervalo de cero.
 */
export function applyOffline(state: GameState, savedAt: number, now: number): OfflineReport {
  const elapsed = Math.max(0, (now - savedAt) / 1000);
  const cap = offlineCapSeconds(state);
  const effective = Math.min(elapsed, cap);
  const efficiency = offlineEfficiency(state);
  const gained = applyElapsed(state, effective, { efficiency, countsAsPlayTime: false });
  if (elapsed >= AWAY_ACHIEVEMENT_SECONDS) grantAchievement(state, 'secret.noRush');
  return { elapsed, effective, efficiency, gained, capped: elapsed > cap };
}

/**
 * Vuelta de una pestaña en segundo plano: el juego seguía abierto, así que se aplica al
 * 100 % y cuenta como tiempo jugado, con el mismo límite que offline.
 */
export function applyBackground(state: GameState, seconds: number): Num {
  const real = Math.max(0, seconds);
  const effective = Math.min(real, offlineCapSeconds(state));
  const gained = applyElapsed(state, effective, { efficiency: 1, countsAsPlayTime: true });
  // «Sin prisa» también cuenta al volver a una pestaña que pasó la noche en segundo plano.
  if (real >= AWAY_ACHIEVEMENT_SECONDS) grantAchievement(state, 'secret.noRush');
  return gained;
}

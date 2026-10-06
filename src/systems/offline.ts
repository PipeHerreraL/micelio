/**
 * Tiempo aplicado de forma analítica (PROMPT.md §11, ARCHITECTURE.md §4.10): progreso
 * offline al cargar y puesta al día al volver de segundo plano. Nunca se repiten ticks.
 */
import { TORPOR_OFFLINE_HOURS } from '../data/adaptations.ts';
import { AWAY_ACHIEVEMENT_SECONDS } from '../data/achievements.ts';
import { getBiome } from '../data/biomes.ts';
import {
  OFFLINE_CAP_BASE_SECONDS,
  OFFLINE_CAP_WINTER_SECONDS,
  OFFLINE_EFFICIENCY_BASE,
  OFFLINE_EFFICIENCY_WINTER,
} from '../data/mutations.ts';
import { gain } from '../core/economy.ts';
import { offlineHoursBonus } from '../core/forest.ts';
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

/**
 * Tope de lo que se cobra fuera del juego. Vive aquí y no en los derivados: solo se lee al cobrar
 * una ausencia. Las horas del bioma (tundra, +24 h) y las del Liquen se suman, no fijan el tope:
 * así le dan algo también a quien tiene Letargo profundo.
 */
export function offlineCapSeconds(state: GameState): number {
  const base = hasMutation(state, 'winterSleep') ? OFFLINE_CAP_WINTER_SECONDS : OFFLINE_CAP_BASE_SECONDS;
  // Letargo profundo: +6 h de tope por rango.
  const torpor = TORPOR_OFFLINE_HOURS * 3600 * state.adaptations.deepTorpor;
  return base + torpor + offlineHoursBonus(state) * 3600;
}

/**
 * Deshielo (tundra, fase 10): de una ausencia ya recortada al tope, los segundos que pasan de las
 * horas de deshielo del bioma; esos rinden sin su factor de todos los generadores. Bajo la nieve
 * el suelo apenas se congela y los hongos siguen trabajando cerca de 0 °C todo el invierno: en la
 * tundra alpina de Niwot Ridge (Colorado), la biomasa microbiana del suelo llega a su máximo del año
 * bajo la nieve, y casi toda es de hongos (Schadt y colegas, 2003, Science 301: 1359–1361). Se
 * aplica al cobrar la ausencia, como el tope, y no en los derivados: mirar rinde lo de siempre, y
 * una ausencia corta (cambiar de app, cerrar y abrir) también.
 */
export function thawSeconds(state: GameState, effective: number): number {
  const after = getBiome(state.forest.biome).thawAfterHours;
  return after === null ? 0 : Math.max(0, effective - after * 3600);
}

export interface ElapsedOptions {
  /** Fracción de la producción que se cobra (0.5 offline base, 1 en segundo plano). */
  efficiency: number;
  /** Si el intervalo cuenta como tiempo jugado (sí en segundo plano, no offline). */
  countsAsPlayTime: boolean;
  /** Segundos del intervalo que rinden sin el factor del bioma (`thawSeconds`); 0 si no se dice. */
  thawSeconds?: number;
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
  const thaw = options.thawSeconds ?? 0;
  if (thaw > 0) {
    // Lo deshelado se cobra otra vez lo que le quitaba el factor del bioma (con ×0,5, una vez más
    // la producción de esos segundos), sin evento: un Aguacero dura segundos y el deshielo empieza
    // a las 8 h. El tiempo jugado y los efectos avanzan solo lo que duró la ausencia.
    const factor = getBiome(state.forest.biome).productionFactor;
    produced = num.add(produced, num.mul(withoutEvent, thaw * (1 / factor - 1)));
  }
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
  /** Segundos que rindieron sin el factor del bioma (deshielo de la tundra; 0 si ninguno). */
  thawed: number;
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
  const thawed = thawSeconds(state, effective);
  const gained = applyElapsed(state, effective, { efficiency, countsAsPlayTime: false, thawSeconds: thawed });
  if (elapsed >= AWAY_ACHIEVEMENT_SECONDS) grantAchievement(state, 'secret.noRush');
  return { elapsed, effective, efficiency, gained, capped: elapsed > cap, thawed };
}

/**
 * Vuelta de una pestaña en segundo plano: el juego seguía abierto, así que se aplica al
 * 100 % y cuenta como tiempo jugado, con el mismo límite y el mismo deshielo que offline (en el
 * móvil, el sistema cierra o congela la app sin preguntar: las dos vías deben rendir igual).
 */
export function applyBackground(state: GameState, seconds: number): Num {
  const real = Math.max(0, seconds);
  const effective = Math.min(real, offlineCapSeconds(state));
  const gained = applyElapsed(state, effective, {
    efficiency: 1,
    countsAsPlayTime: true,
    thawSeconds: thawSeconds(state, effective),
  });
  // «Sin prisa» también cuenta al volver a una pestaña que pasó la noche en segundo plano.
  if (real >= AWAY_ACHIEVEMENT_SECONDS) grantAchievement(state, 'secret.noRush');
  return gained;
}

/**
 * Evento aleatorio: Lluvia (PROMPT.md §9, ARCHITECTURE.md §4.8).
 *
 * La cuenta atrás solo avanza con ticks en vivo: el tiempo aplicado de forma analítica
 * (offline o pestaña oculta) no hace llover ni acumula gotas.
 */
import {
  DEW_FRACTION,
  DEW_PRODUCTION_SECONDS,
  DROP_LIFETIME,
  RAIN_INTERVAL_MAX,
  RAIN_INTERVAL_MIN,
  type RainEffectKind,
} from '../data/rain.ts';
import { HYDRAULIC_DROP_SECONDS } from '../data/adaptations.ts';
import { PERFECT_STORM_DURATION, RAIN_SCENT_FREQUENCY } from '../data/mutations.ts';
import { gain } from '../core/economy.ts';
import { emit } from '../core/events.ts';
import {
  dewFloorSeconds,
  dewMultiplier,
  downpourBonusSeconds,
  dropFallsAlone,
  rainEffectsFor,
  rainIntervalFactor,
} from '../core/forest.ts';
import * as num from '../core/num.ts';
import { nextRandom, randomRange } from '../core/rng.ts';
import { derived, invalidate } from '../core/selectors.ts';
import type { Num } from '../core/num.ts';
import { hasMutation, type GameState } from '../core/state.ts';

/** Margen para que la gota no aparezca pegada al borde de la zona de juego. */
const DROP_MARGIN = 0.1;

/** Segundos que dura la gota, con Redistribución hidráulica (+2 s por rango). */
export function dropLifetime(state: GameState): number {
  return DROP_LIFETIME + HYDRAULIC_DROP_SECONDS * state.adaptations.hydraulicLift;
}

/**
 * Sortea los segundos hasta la próxima gota: ×2 en la taiga, ×0,5 en el Chocó y ÷1,3 con
 * Olfato de lluvia. En el natal el factor es 1 y la cuenta queda idéntica a la de antes.
 */
export function rollRainInterval(state: GameState): number {
  const frequency = hasMutation(state, 'rainScent') ? RAIN_SCENT_FREQUENCY : 1;
  return (randomRange(state, RAIN_INTERVAL_MIN, RAIN_INTERVAL_MAX) * rainIntervalFactor(state)) / frequency;
}

/**
 * Duración de un efecto de lluvia, con Tormenta perfecta (+50 %) si se tiene y, en el
 * Aguacero, los segundos de Trehalosa.
 */
export function effectDuration(state: GameState, base: number, kind: RainEffectKind = 'storm'): number {
  const scaled = hasMutation(state, 'perfectStorm') ? base * PERFECT_STORM_DURATION : base;
  return kind === 'downpour' ? scaled + downpourBonusSeconds(state) : scaled;
}

/** Sortea qué efecto sale de una gota, con la tabla del bioma. */
export function rollRainEffect(state: GameState): RainEffectKind {
  const roll = nextRandom(state);
  let acc = 0;
  for (const def of rainEffectsFor(state)) {
    acc += def.chance;
    if (roll < acc) return def.kind;
  }
  return 'downpour';
}

/**
 * Nutrientes del Rocío: el menor entre el 12 % de las reservas y 12 min de producción, con el
 * mínimo de producción del bioma (300 s en el Chocó) y × la Estera de raíces. En el natal el
 * mínimo es 0 y el factor 1, así que da lo de siempre. La producción es la del momento, con el
 * Aguacero si está activo: así se midió el Chocó (ARCHITECTURE.md §4.8).
 */
export function dewAmount(state: GameState): Num {
  const production = derived(state).production;
  const fromStock = num.mul(state.nutrients, DEW_FRACTION);
  const fromProduction = num.mul(production, DEW_PRODUCTION_SECONDS);
  const floor = num.mul(production, dewFloorSeconds(state));
  return num.mul(num.max(num.min(fromStock, fromProduction), floor), dewMultiplier(state));
}

/** Avanza la lluvia `dt` segundos de juego en vivo. */
export function updateRain(state: GameState, dt: number): void {
  const rain = state.rain;
  if (rain.drop) {
    rain.drop.remaining -= dt;
    if (rain.drop.remaining <= 0) {
      rain.drop = null;
      rain.nextIn = rollRainInterval(state);
      // En el Chocó la gota que nadie atrapa cae sola y su efecto llega igual. Solo aquí, con el
      // juego abierto: evaporateDrop (offline, segundo plano, esporular) no aplica nada, o una
      // partida nueva empezaría con un Aguacero heredado.
      if (dropFallsAlone(state)) {
        const outcome = applyDropEffect(state);
        emit({ type: 'rainFell', ...outcome });
      } else {
        emit({ type: 'rainExpired' });
      }
    }
    return;
  }
  rain.nextIn -= dt;
  if (rain.nextIn <= 0) {
    rain.drop = {
      x: randomRange(state, DROP_MARGIN, 1 - DROP_MARGIN),
      y: randomRange(state, DROP_MARGIN, 1 - DROP_MARGIN),
      remaining: dropLifetime(state),
    };
    rain.nextIn = 0;
    emit({ type: 'rainSpawn' });
  }
}

/** La gota se evapora sin efecto (al aplicar tiempo de forma analítica). */
export function evaporateDrop(state: GameState): void {
  if (!state.rain.drop) return;
  state.rain.drop = null;
  state.rain.nextIn = rollRainInterval(state);
}

export interface DropOutcome {
  effect: RainEffectKind;
  /** Nutrientes ganados (solo el Rocío). */
  amount: Num;
  /** Duración del efecto (0 en el Rocío). */
  duration: number;
}

/** Sortea y aplica el efecto de una gota, atrapada o caída sola. */
export function applyDropEffect(state: GameState): DropOutcome {
  const kind = rollRainEffect(state);
  if (kind === 'dew') {
    const amount = dewAmount(state);
    gain(state, amount);
    return { effect: kind, amount, duration: 0 };
  }
  const def = rainEffectsFor(state).find((e) => e.kind === kind);
  const duration = effectDuration(state, def ? def.duration : 0, kind);
  // Un efecto igual activo se renueva en lugar de apilarse.
  const existing = state.effects.find((e) => e.kind === kind);
  if (existing) {
    existing.remaining = duration;
    existing.duration = duration;
  } else {
    state.effects.push({ kind, remaining: duration, duration });
  }
  invalidate(state);
  return { effect: kind, amount: num.ZERO, duration };
}

/** Acción: atrapar la gota visible. */
export function catchDrop(state: GameState, _payload: Record<string, never> = {}): void {
  if (!state.rain.drop) return;
  state.rain.drop = null;
  state.rain.nextIn = rollRainInterval(state);
  state.stats.drops += 1;
  const outcome = applyDropEffect(state);
  emit({ type: 'rainCaught', ...outcome });
}

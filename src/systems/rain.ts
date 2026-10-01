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
  RAIN_EFFECTS,
  RAIN_INTERVAL_MAX,
  RAIN_INTERVAL_MIN,
  type RainEffectKind,
} from '../data/rain.ts';
import { HYDRAULIC_DROP_SECONDS } from '../data/adaptations.ts';
import { PERFECT_STORM_DURATION, RAIN_SCENT_FREQUENCY } from '../data/mutations.ts';
import { gain } from '../core/economy.ts';
import { emit } from '../core/events.ts';
import * as num from '../core/num.ts';
import { nextRandom, randomRange } from '../core/rng.ts';
import { derived, invalidate } from '../core/selectors.ts';
import { hasMutation, type GameState } from '../core/state.ts';

/** Margen para que la gota no aparezca pegada al borde de la zona de juego. */
const DROP_MARGIN = 0.1;

/** Segundos que dura la gota, con Redistribución hidráulica (+2 s por rango). */
export function dropLifetime(state: GameState): number {
  return DROP_LIFETIME + HYDRAULIC_DROP_SECONDS * state.adaptations.hydraulicLift;
}

/** Sortea los segundos hasta la próxima gota (÷1.3 con Olfato de lluvia). */
export function rollRainInterval(state: GameState): number {
  const frequency = hasMutation(state, 'rainScent') ? RAIN_SCENT_FREQUENCY : 1;
  return randomRange(state, RAIN_INTERVAL_MIN, RAIN_INTERVAL_MAX) / frequency;
}

/** Duración de un efecto de lluvia, con Tormenta perfecta (+50 %) si se tiene. */
export function effectDuration(state: GameState, base: number): number {
  return hasMutation(state, 'perfectStorm') ? base * PERFECT_STORM_DURATION : base;
}

/** Sortea qué efecto sale al atrapar una gota. */
export function rollRainEffect(state: GameState): RainEffectKind {
  const roll = nextRandom(state);
  let acc = 0;
  for (const def of RAIN_EFFECTS) {
    acc += def.chance;
    if (roll < acc) return def.kind;
  }
  return 'downpour';
}

/** Avanza la lluvia `dt` segundos de juego en vivo. */
export function updateRain(state: GameState, dt: number): void {
  const rain = state.rain;
  if (rain.drop) {
    rain.drop.remaining -= dt;
    if (rain.drop.remaining <= 0) {
      rain.drop = null;
      rain.nextIn = rollRainInterval(state);
      emit({ type: 'rainExpired' });
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

/** Acción: atrapar la gota visible. */
export function catchDrop(state: GameState, _payload: Record<string, never> = {}): void {
  if (!state.rain.drop) return;
  state.rain.drop = null;
  state.rain.nextIn = rollRainInterval(state);
  state.stats.drops += 1;

  const kind = rollRainEffect(state);
  const def = RAIN_EFFECTS.find((e) => e.kind === kind);
  const baseDuration = def ? def.duration : 0;

  if (kind === 'dew') {
    const fromStock = num.mul(state.nutrients, DEW_FRACTION);
    const fromProduction = num.mul(derived(state).production, DEW_PRODUCTION_SECONDS);
    const amount = num.min(fromStock, fromProduction);
    gain(state, amount);
    emit({ type: 'rainCaught', effect: kind, amount, duration: 0 });
    return;
  }

  const duration = effectDuration(state, baseDuration);
  // Un efecto igual activo se renueva en lugar de apilarse.
  const existing = state.effects.find((e) => e.kind === kind);
  if (existing) {
    existing.remaining = duration;
    existing.duration = duration;
  } else {
    state.effects.push({ kind, remaining: duration, duration });
  }
  invalidate(state);
  emit({ type: 'rainCaught', effect: kind, amount: num.ZERO, duration });
}

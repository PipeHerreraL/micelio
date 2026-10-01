/**
 * Valores derivados del estado: producción por generador, N/s total, valor del clic y
 * multiplicadores. Se calculan una vez y se guardan en caché por objeto de estado hasta
 * que una acción llama a `invalidate(state)` (compra, evento, logro, esporulación, carga).
 *
 * Ver ARCHITECTURE.md §4.6 para por qué la caché vive fuera del estado.
 */
import { CLICK_BASE } from '../data/click.ts';
import { GENERATORS, type GeneratorId } from '../data/generators.ts';
import {
  ACHIEVEMENT_BONUS_BASE,
  ACHIEVEMENT_BONUS_SYMBIOSIS,
  DEEP_ABSORPTION_CLICK_PERCENT,
  LIGHT_CHITIN_DISCOUNT,
  SPORE_K_BASE,
  SPORE_K_WINGED,
} from '../data/mutations.ts';
import { DOWNPOUR_MULTIPLIER, STORM_CLICK_MULTIPLIER } from '../data/rain.ts';
import { getUpgrade } from '../data/upgrades.ts';
import { clickValue, globalMultiplier, milestonesReached } from './formulas.ts';
import * as num from './num.ts';
import type { Num } from './num.ts';
import { hasMutation, type GameState } from './state.ts';

export interface Derived {
  /** Producción de una unidad de cada generador, con todos los multiplicadores (N/s). */
  unitProduction: Record<GeneratorId, Num>;
  /** Producción total de cada generador (N/s). */
  generatorProduction: Record<GeneratorId, Num>;
  /** Mejoras ×2 compradas por generador (u_i). */
  upgradeDoublings: Record<GeneratorId, number>;
  /** Hitos alcanzados por generador (h_i). */
  milestoneDoublings: Record<GeneratorId, number>;
  /** Multiplicador de sinergia por generador (s_i). */
  synergy: Record<GeneratorId, number>;
  /** P: producción total en N/s, con el evento activo. */
  production: Num;
  /** P sin el multiplicador del evento (E = 1). */
  productionWithoutEvent: Num;
  /** G: multiplicador global, con el evento. */
  globalMultiplier: Num;
  /** E: multiplicador del evento activo. */
  eventMultiplier: number;
  /** M: producto de los multiplicadores de clic. */
  clickMultiplier: Num;
  /** q: fracción de N/s que suma cada clic. */
  clickPercent: number;
  /** Multiplicador del clic por la Tormenta eléctrica (1 sin tormenta). */
  stormMultiplier: number;
  /** V: nutrientes por clic, con la tormenta incluida. */
  clickValue: Num;
  /** d: descuento sobre el coste de los generadores. */
  costDiscount: number;
  /** a: bono por logro. */
  achievementBonus: number;
  /** k de la fórmula de esporas. */
  sporeK: number;
}

const cache = new WeakMap<GameState, Derived>();

/** Olvida los derivados en caché de este estado. Toda acción que cambie un multiplicador la llama. */
export function invalidate(state: GameState): void {
  cache.delete(state);
}

/** Derivados del estado, desde la caché si están al día. */
export function derived(state: GameState): Derived {
  let value = cache.get(state);
  if (!value) {
    value = computeDerived(state);
    cache.set(state, value);
  }
  return value;
}

function recordOf<T>(make: (id: GeneratorId) => T): Record<GeneratorId, T> {
  const out = {} as Record<GeneratorId, T>;
  for (const g of GENERATORS) out[g.id] = make(g.id);
  return out;
}

/** Cálculo completo sin caché. Lo usan `derived` y las vistas previas de compras. */
export function computeDerived(state: GameState): Derived {
  const upgradeDoublings = recordOf(() => 0);
  const synergyBonus = recordOf(() => 0);
  const globalUpgrades: number[] = [];
  let clickMultiplier = num.from(CLICK_BASE);
  let clickPercent = 0;

  for (const id of state.upgrades) {
    const def = getUpgrade(id);
    if (!def) continue;
    const effect = def.effect;
    switch (effect.kind) {
      case 'generator':
        // Cada mejora de generador es ×2: se cuenta como una duplicación más (u_i).
        upgradeDoublings[effect.target] += Math.round(Math.log2(effect.multiplier));
        break;
      case 'click':
        clickMultiplier = num.mul(clickMultiplier, effect.multiplier);
        break;
      case 'clickPercent':
        clickPercent += effect.percent;
        break;
      case 'global':
        globalUpgrades.push(effect.multiplier);
        break;
      case 'synergy':
        synergyBonus[effect.target] += effect.perUnit * state.owned[effect.source];
        break;
    }
  }

  if (hasMutation(state, 'deepAbsorption')) clickPercent += DEEP_ABSORPTION_CLICK_PERCENT;

  const achievementBonus = hasMutation(state, 'ancientSymbiosis')
    ? ACHIEVEMENT_BONUS_SYMBIOSIS
    : ACHIEVEMENT_BONUS_BASE;

  let eventMultiplier = 1;
  let stormMultiplier = 1;
  for (const effect of state.effects) {
    if (effect.remaining <= 0) continue;
    if (effect.kind === 'downpour') eventMultiplier *= DOWNPOUR_MULTIPLIER;
    if (effect.kind === 'storm') stormMultiplier *= STORM_CLICK_MULTIPLIER;
  }

  const baseGlobal = globalMultiplier(
    state.spores.level,
    state.achievements.length,
    achievementBonus,
    globalUpgrades,
    1,
  );
  const fullGlobal = num.mul(baseGlobal, eventMultiplier);

  const milestoneDoublings = recordOf((id) => milestonesReached(state.owned[id]));
  const synergy = recordOf((id) => 1 + synergyBonus[id]);

  const unitProduction = recordOf((id) => {
    const def = GENERATORS.find((g) => g.id === id);
    const base = def ? def.baseProduction : 0;
    const doublings = upgradeDoublings[id] + milestoneDoublings[id];
    return num.mul(num.mul(num.mul(base, num.pow(2, doublings)), synergy[id]), fullGlobal);
  });
  const generatorProduction = recordOf((id) => num.mul(unitProduction[id], state.owned[id]));

  let production = num.ZERO;
  for (const g of GENERATORS) production = num.add(production, generatorProduction[g.id]);
  const productionWithoutEvent = num.div(production, eventMultiplier);

  const value = num.mul(clickValue(clickMultiplier, clickPercent, production), stormMultiplier);

  return {
    unitProduction,
    generatorProduction,
    upgradeDoublings,
    milestoneDoublings,
    synergy,
    production,
    productionWithoutEvent,
    globalMultiplier: fullGlobal,
    eventMultiplier,
    clickMultiplier,
    clickPercent,
    stormMultiplier,
    clickValue: value,
    costDiscount: hasMutation(state, 'lightChitin') ? LIGHT_CHITIN_DISCOUNT : 0,
    achievementBonus,
    sporeK: hasMutation(state, 'wingedSpores') ? SPORE_K_WINGED : SPORE_K_BASE,
  };
}

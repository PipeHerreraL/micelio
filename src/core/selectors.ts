/**
 * Valores derivados del estado: producción por generador, N/s total, valor del clic y
 * multiplicadores. Se calculan una vez y se guardan en caché por objeto de estado hasta
 * que una acción llama a `invalidate(state)` (compra, evento, logro, esporulación, carga).
 *
 * Ver ARCHITECTURE.md §4.6 para por qué la caché vive fuera del estado.
 */
import { APICAL_THRESHOLD_GROWTH } from '../data/adaptations.ts';
import { CLICK_BASE } from '../data/click.ts';
import { SPORE_SOFTCAP_BASE, SPORE_SOFTCAP_EXPONENT } from '../data/prestige.ts';
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
import { autoClicksPerSecond, generatorBiomeFactor, lineageFactor } from './forest.ts';
import { clickValue, globalMultiplier, milestonesReached, sporeFactor } from './formulas.ts';
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
  /** Factor del bioma y de las adaptaciones de bioma por generador (β_i; 1 en el natal). */
  biomeFactor: Record<GeneratorId, number>;
  /** Linaje: ×2 por bioma colonizado fuera del natal (ρ). */
  lineage: number;
  /** Clics automáticos por segundo de las Hormigas cortadoras (n). */
  autoClicks: number;
  /** N/s de esos clics automáticos (n · V₀, sin Tormenta); ya incluido en `production`. */
  workerProduction: Num;
  /** P: producción total en N/s, con el evento activo y los clics automáticos. */
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
  /** Factor de producción del nivel de esporas, con madurez (1 + 0.01·S hasta el umbral). */
  sporeFactor: number;
  /** Umbral de madurez: nivel hasta el que cada nivel da +1 %. */
  sporeThreshold: number;
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

  // El suelo lineal de las partidas 1.x protege el nivel que tenían en el natal; en un bioma
  // nuevo el nivel empieza en 0 y rige el umbral de siempre (el suelo se conserva en el estado).
  const sporeThreshold = Math.max(
    SPORE_SOFTCAP_BASE * APICAL_THRESHOLD_GROWTH ** state.adaptations.apicalBody,
    state.forest.leg === 0 ? state.sporeFloor : 0,
  );
  const sporeBonus = sporeFactor(state.spores.level, sporeThreshold, SPORE_SOFTCAP_EXPONENT);
  const baseGlobal = globalMultiplier(
    sporeBonus,
    state.achievements.length,
    achievementBonus,
    globalUpgrades,
    1,
  );
  const fullGlobal = num.mul(baseGlobal, eventMultiplier);

  const milestoneDoublings = recordOf((id) => milestonesReached(state.owned[id]));
  const synergy = recordOf((id) => 1 + synergyBonus[id]);
  // Bioma, adaptaciones de bioma y linaje cambian solo al dispersar, comprar o colonizar, que
  // invalidan (ROADMAP, reglas comunes). En el natal todos valen 1 y el producto es exacto.
  const biomeFactor = recordOf((id) => generatorBiomeFactor(state, id));
  const lineage = lineageFactor(state);

  const unitProduction = recordOf((id) => {
    const def = GENERATORS.find((g) => g.id === id);
    const base = def ? def.baseProduction : 0;
    const doublings = upgradeDoublings[id] + milestoneDoublings[id];
    const local = num.mul(num.mul(base, num.pow(2, doublings)), synergy[id]);
    return num.mul(num.mul(local, biomeFactor[id] * lineage), fullGlobal);
  });
  const generatorProduction = recordOf((id) => num.mul(unitProduction[id], state.owned[id]));

  let generatorsTotal = num.ZERO;
  for (const g of GENERATORS) generatorsTotal = num.add(generatorsTotal, generatorProduction[g.id]);

  // Clic sin Tormenta (V₀). Los clics automáticos de las Hormigas cortadoras suman n · V₀ a la
  // producción, así el N/s visible, el offline y el segundo plano los cobran sin código aparte;
  // el clic del jugador solo ve a los generadores, para que las obreras no se realimenten.
  const baseClick = clickValue(clickMultiplier, clickPercent, generatorsTotal);
  const autoClicks = autoClicksPerSecond(state);
  const workerProduction = num.mul(baseClick, autoClicks);
  const production = num.add(generatorsTotal, workerProduction);
  const generatorsWithoutEvent = num.div(generatorsTotal, eventMultiplier);
  const productionWithoutEvent =
    autoClicks > 0
      ? num.add(
          generatorsWithoutEvent,
          num.mul(clickValue(clickMultiplier, clickPercent, generatorsWithoutEvent), autoClicks),
        )
      : generatorsWithoutEvent;

  const value = num.mul(baseClick, stormMultiplier);

  return {
    unitProduction,
    generatorProduction,
    upgradeDoublings,
    milestoneDoublings,
    synergy,
    biomeFactor,
    lineage,
    autoClicks,
    workerProduction,
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
    sporeFactor: sporeBonus,
    sporeThreshold,
  };
}

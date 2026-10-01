/**
 * Fórmulas puras del balance (PROMPT.md §7, §8 y §10). Sin estado: reciben números y
 * devuelven números, así que se prueban contra valores calculados a mano.
 */
import { COST_GROWTH, MILESTONES } from '../data/generators.ts';
import { SPORE_LEVEL_BONUS, SPORE_SCALE } from '../data/prestige.ts';
import * as num from './num.ts';
import type { Num } from './num.ts';

/** C(n) = C0 (1 − d) r^n: coste de la siguiente unidad con n poseídas. */
export function unitCost(baseCost: Num, owned: number, discount: number, r = COST_GROWTH): Num {
  return num.mul(num.mul(baseCost, 1 - discount), num.pow(r, owned));
}

/** C(n, k) = C0 (1 − d) r^n (r^k − 1) / (r − 1): coste de k unidades de golpe. */
export function bulkCost(
  baseCost: Num,
  owned: number,
  count: number,
  discount: number,
  r = COST_GROWTH,
): Num {
  if (count <= 0) return num.ZERO;
  const first = unitCost(baseCost, owned, discount, r);
  return num.mul(first, num.div(num.sub(num.pow(r, count), 1), r - 1));
}

/**
 * Máximo de unidades comprables con `funds` nutrientes:
 * k = ⌊log_r(F (r − 1) / (C0 (1 − d) r^n) + 1)⌋.
 *
 * El logaritmo en coma flotante puede quedar una unidad por encima o por debajo justo en
 * los bordes, así que se verifica contra C(n, k) y se corrige.
 */
export function maxAffordable(
  baseCost: Num,
  owned: number,
  discount: number,
  funds: Num,
  r = COST_GROWTH,
): number {
  const first = unitCost(baseCost, owned, discount, r);
  if (num.lt(funds, first)) return 0;
  const ratio = num.add(num.div(num.mul(funds, r - 1), first), 1);
  let k = Math.max(0, Math.floor(num.logBase(ratio, r)));
  while (k > 0 && num.gt(bulkCost(baseCost, owned, k, discount, r), funds)) k -= 1;
  while (num.lte(bulkCost(baseCost, owned, k + 1, discount, r), funds)) k += 1;
  return k;
}

/** Hitos alcanzados con `owned` unidades: cada uno duplica la producción del generador. */
export function milestonesReached(owned: number, thresholds: readonly number[] = MILESTONES): number {
  let count = 0;
  for (const t of thresholds) if (owned >= t) count += 1;
  return count;
}

/** Siguiente hito por alcanzar, o null si ya se pasaron todos. */
export function nextMilestone(owned: number, thresholds: readonly number[] = MILESTONES): number | null {
  for (const t of thresholds) if (owned < t) return t;
  return null;
}

/** Hito anterior (0 si aún no hay ninguno): sirve para dibujar la barra de progreso. */
export function previousMilestone(owned: number, thresholds: readonly number[] = MILESTONES): number {
  let prev = 0;
  for (const t of thresholds) if (owned >= t) prev = t;
  return prev;
}

/**
 * E(L) = ⌊k √(L / 1e8)⌋: esporas totales que corresponden a L nutrientes de vida.
 * El épsilon evita que 30.999999 quede en 30 cuando L sale de nutrientsForSpores(31).
 */
export function sporesFor(lifetime: Num, k: number): number {
  if (!num.gt(lifetime, 0)) return 0;
  return Math.floor(k * Math.sqrt(num.toNumber(num.div(lifetime, SPORE_SCALE))) + 1e-9);
}

/** Inversa de sporesFor: nutrientes de vida necesarios para llegar a `spores` esporas. */
export function nutrientsForSpores(spores: number, k: number): Num {
  return num.mul(SPORE_SCALE, (spores / k) ** 2);
}

/**
 * Factor del nivel de esporas S con madurez (docs/ROADMAP.md, fase 7):
 * S ≤ S0: 1 + 0.01·S, como siempre; S > S0: 1 + 0.01·S0·(S/S0)^β, continuo en S0.
 */
export function sporeFactor(level: number, threshold: number, exponent: number): number {
  if (level <= threshold) return 1 + SPORE_LEVEL_BONUS * level;
  return 1 + SPORE_LEVEL_BONUS * threshold * (level / threshold) ** exponent;
}

/** G = (1 + 0.01 S)(1 + a L) Π g_j · E, con el factor de esporas ya calculado (sporeFactor). */
export function globalMultiplier(
  sporeBonus: number,
  achievements: number,
  achievementBonus: number,
  globalUpgrades: readonly number[],
  eventMultiplier: number,
): Num {
  let g = sporeBonus * (1 + achievementBonus * achievements);
  for (const m of globalUpgrades) g *= m;
  return num.from(g * eventMultiplier);
}

/** Coste del siguiente rango de una adaptación: ⌈base · growth^rango⌉ esporas. */
export function adaptationCost(baseCost: number, growth: number, rank: number): number {
  return Math.ceil(baseCost * growth ** rank);
}

/** V = M + q P: nutrientes por clic. */
export function clickValue(clickMultiplier: Num, clickPercent: number, production: Num): Num {
  return num.add(clickMultiplier, num.mul(production, clickPercent));
}

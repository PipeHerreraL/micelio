/**
 * Consultas y ayudas de economía sobre el estado: costes según la cantidad elegida,
 * qué está desbloqueado o visible y cuánto subiría la producción con una compra.
 * Nada de esto muta el estado salvo `gain` y `spend`.
 */
import { GENERATORS, getGenerator, type GeneratorDef, type GeneratorId } from '../data/generators.ts';
import { UPGRADES, getUpgrade, type UpgradeDef } from '../data/upgrades.ts';
import { bulkCost, maxAffordable } from './formulas.ts';
import * as num from './num.ts';
import type { Num } from './num.ts';
import { computeDerived, derived } from './selectors.ts';
import { hasMutation, hasUpgrade, type BuyAmount, type GameState } from './state.ts';

/** Suma nutrientes a los tres totales: actuales, de la partida y de la vida. */
export function gain(state: GameState, amount: Num): void {
  if (!num.gt(amount, 0) || !Number.isFinite(amount)) return;
  state.nutrients = num.add(state.nutrients, amount);
  state.runEarned = num.add(state.runEarned, amount);
  state.lifetimeEarned = num.add(state.lifetimeEarned, amount);
}

/** Resta nutrientes si alcanzan. Devuelve si se pudo pagar. */
export function spend(state: GameState, amount: Num): boolean {
  if (num.lt(state.nutrients, amount)) return false;
  state.nutrients = num.max(num.ZERO, num.sub(state.nutrients, amount));
  return true;
}

export function isGeneratorUnlocked(state: GameState, def: GeneratorDef): boolean {
  const unlock = def.unlock;
  switch (unlock.kind) {
    case 'always':
      return true;
    case 'sporulations':
      return state.stats.sporulations >= unlock.count;
    case 'mutation':
      return state.mutations.some((m) => m === unlock.id);
  }
}

export interface GeneratorQuote {
  /** Unidades que se comprarían (0 si con Máx no alcanza ni para una). */
  count: number;
  /** Coste de esas unidades; con Máx y count = 0, el coste de una. */
  cost: Num;
  affordable: boolean;
}

/** Cuánto cuesta comprar `amount` unidades (o el máximo) del generador ahora mismo. */
export function quoteGenerator(state: GameState, id: GeneratorId, amount: BuyAmount): GeneratorQuote {
  const def = getGenerator(id);
  const owned = state.owned[id];
  const discount = derived(state).costDiscount;
  if (amount === 'max') {
    const count = maxAffordable(def.baseCost, owned, discount, state.nutrients);
    const cost = bulkCost(def.baseCost, owned, Math.max(1, count), discount);
    return { count, cost, affordable: count > 0 };
  }
  const cost = bulkCost(def.baseCost, owned, amount, discount);
  return { count: amount, cost, affordable: num.gte(state.nutrients, cost) };
}

export function isUpgradeAppeared(state: GameState, def: UpgradeDef): boolean {
  const c = def.appears;
  if (c.kind === 'owned') return state.owned[c.id] >= c.count;
  return num.gte(state.runEarned, c.amount);
}

/** Mejoras disponibles (aparecidas y sin comprar), ordenadas por coste. */
export function availableUpgrades(state: GameState): UpgradeDef[] {
  return UPGRADES.filter((u) => !hasUpgrade(state, u.id) && isUpgradeAppeared(state, u)).sort(
    (a, b) => a.cost - b.cost,
  );
}

export interface PurchasePreview {
  /** Aumento de N/s. */
  production: Num;
  /** Aumento del valor del clic. */
  click: Num;
}

function previewWith(state: GameState, changed: GameState): PurchasePreview {
  const before = derived(state);
  const after = computeDerived(changed);
  return {
    production: num.max(num.ZERO, num.sub(after.production, before.production)),
    click: num.max(num.ZERO, num.sub(after.clickValue, before.clickValue)),
  };
}

/** Cuánto subirían N/s y el clic si se compraran `count` unidades del generador. */
export function previewGenerator(state: GameState, id: GeneratorId, count: number): PurchasePreview {
  const changed: GameState = { ...state, owned: { ...state.owned, [id]: state.owned[id] + count } };
  return previewWith(state, changed);
}

/** Cuánto subirían N/s y el clic si se comprara la mejora. */
export function previewUpgrade(state: GameState, id: string): PurchasePreview {
  if (!getUpgrade(id) || hasUpgrade(state, id)) return { production: num.ZERO, click: num.ZERO };
  const changed: GameState = { ...state, upgrades: [...state.upgrades, id] };
  return previewWith(state, changed);
}

/** Generadores desbloqueados, en orden. */
export function unlockedGenerators(state: GameState): GeneratorDef[] {
  return GENERATORS.filter((g) => isGeneratorUnlocked(state, g));
}

/** Segundos hasta poder pagar `cost` al ritmo actual (Infinity si no hay producción). */
export function secondsUntil(state: GameState, cost: Num): number {
  const missing = num.sub(cost, state.nutrients);
  if (!num.gt(missing, 0)) return 0;
  const rate = derived(state).production;
  if (!num.gt(rate, 0)) return Number.POSITIVE_INFINITY;
  return num.toNumber(num.div(missing, rate));
}

export function hasAutobuyGenerators(state: GameState): boolean {
  return hasMutation(state, 'instinct');
}

export function hasAutobuyUpgrades(state: GameState): boolean {
  return hasMutation(state, 'higherInstinct');
}

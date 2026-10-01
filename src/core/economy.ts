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

/** Suma nutrientes a los cuatro totales: actuales, de la partida, del bosque y de la vida. */
export function gain(state: GameState, amount: Num): void {
  if (!num.gt(amount, 0)) return;
  // Con el techo, ninguna suma puede volverse Infinity y estropear el guardado.
  const safe = num.clamp(amount);
  state.nutrients = num.clamp(num.add(state.nutrients, safe));
  state.runEarned = num.clamp(num.add(state.runEarned, safe));
  // Mismos sumandos que lifetimeEarned: en el natal los dos valen lo mismo, bit a bit.
  state.forest.earned = num.clamp(num.add(state.forest.earned, safe));
  state.lifetimeEarned = num.clamp(num.add(state.lifetimeEarned, safe));
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

/** Una compra posible de la red, con su coste en nutrientes. */
export type PurchaseCandidate =
  { kind: 'generator'; id: GeneratorId; cost: number } | { kind: 'upgrade'; id: string; cost: number };

/** Qué compras se consideran (p. ej. solo los generadores activados en la autocompra). */
export type PurchaseFilter = (candidate: PurchaseCandidate) => boolean;

/**
 * La compra con menor suma de espera hasta poder pagarla y amortización (coste ÷ aumento de
 * ingresos por segundo, con `cps` clics por segundo). Es la regla del bot del simulador
 * (scripts/simulate.ts) y la de la Poda en la autocompra (fase 9): vive una sola vez.
 */
export function bestPurchase(
  state: GameState,
  cps: number,
  filter?: PurchaseFilter,
): PurchaseCandidate | null {
  const d = derived(state);
  const income = num.toNumber(d.production) + cps * num.toNumber(d.clickValue);
  let best: PurchaseCandidate | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const consider = (candidate: PurchaseCandidate, gainProduction: number, gainClick: number): void => {
    const gain = gainProduction + cps * gainClick;
    if (!(gain > 0)) return;
    const missing = Math.max(0, candidate.cost - num.toNumber(state.nutrients));
    const wait = missing === 0 ? 0 : income > 0 ? missing / income : Number.POSITIVE_INFINITY;
    const score = wait + candidate.cost / gain;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  };
  for (const def of GENERATORS) {
    if (!isGeneratorUnlocked(state, def)) continue;
    const candidate: PurchaseCandidate = {
      kind: 'generator',
      id: def.id,
      cost: num.toNumber(quoteGenerator(state, def.id, 1).cost),
    };
    if (filter && !filter(candidate)) continue;
    const gain = previewGenerator(state, def.id, 1);
    consider(candidate, num.toNumber(gain.production), num.toNumber(gain.click));
  }
  for (const upgrade of availableUpgrades(state)) {
    const candidate: PurchaseCandidate = { kind: 'upgrade', id: upgrade.id, cost: upgrade.cost };
    if (filter && !filter(candidate)) continue;
    const gain = previewUpgrade(state, upgrade.id);
    consider(candidate, num.toNumber(gain.production), num.toNumber(gain.click));
  }
  return best;
}

export function hasAutobuyGenerators(state: GameState): boolean {
  return hasMutation(state, 'instinct');
}

export function hasAutobuyUpgrades(state: GameState): boolean {
  return hasMutation(state, 'higherInstinct');
}

/**
 * Autocompra (mutaciones Instinto e Instinto superior, PROMPT.md §11). Cada segundo de
 * juego compra una unidad de cada generador activado si cuesta menos del umbral elegido
 * (10 %, 50 % o 100 %) de los nutrientes, y con Instinto superior una mejora.
 *
 * Poda (fase 9, un regalo del plasmodio con una placa cartografiada): en el modo «lo que antes
 * se amortiza» compra, entre lo activado, la mejor compra según `bestPurchase` (la regla del bot
 * del simulador, que vive una sola vez en core/economy.ts). Sin la ventaja, ese modo guardado se
 * comporta como el umbral: la ventaja se pierde si se borra el socio y el guardado no cambia.
 */
import { GENERATORS } from '../data/generators.ts';
import { PAYBACK_MAX_PER_SECOND } from '../data/plasmodium.ts';
import { purchaseGenerator, purchaseUpgrade } from '../core/actions.ts';
import {
  availableUpgrades,
  bestPurchase,
  hasAutobuyGenerators,
  hasAutobuyUpgrades,
  isGeneratorUnlocked,
  quoteGenerator,
  type PurchaseCandidate,
  type PurchaseFilter,
} from '../core/economy.ts';
import * as num from '../core/num.ts';
import type { GameState } from '../core/state.ts';
import { partnerPerks } from './partners.ts';

export function runAutobuy(state: GameState): void {
  if (isPaybackActive(state)) {
    runPaybackAutobuy(state);
    return;
  }
  if (hasAutobuyGenerators(state)) {
    // Del más caro al más barato: el umbral se calcula sobre los nutrientes de cada momento,
    // así que empezar por arriba evita que las Hifas se coman el presupuesto del resto.
    for (let i = GENERATORS.length - 1; i >= 0; i -= 1) {
      const def = GENERATORS[i];
      if (!def || !state.autobuy.generators[def.id] || !isGeneratorUnlocked(state, def)) continue;
      const quote = quoteGenerator(state, def.id, 1);
      if (num.lt(quote.cost, num.mul(state.nutrients, state.autobuy.threshold))) {
        purchaseGenerator(state, { id: def.id, amount: 1 });
      }
    }
  }
  if (hasAutobuyUpgrades(state) && state.autobuy.upgrades) {
    const limit = num.mul(state.nutrients, state.autobuy.threshold);
    const cheapest = availableUpgrades(state)[0];
    if (cheapest && num.lt(cheapest.cost, limit)) purchaseUpgrade(state, { id: cheapest.id });
  }
}

/** Si la autocompra elige por amortización: el modo guardado y la ventaja de la Poda a la vez. */
export function isPaybackActive(state: GameState): boolean {
  return state.autobuy.mode === 'payback' && partnerPerks(state).autobuyByPayback;
}

/**
 * Lo que la autocompra puede elegir: los generadores activados (con Instinto) y las mejoras si
 * su interruptor está activo (con Instinto superior). Las mismas puertas que el modo de umbral.
 */
function paybackFilter(state: GameState): PurchaseFilter {
  const generators = hasAutobuyGenerators(state);
  const upgrades = state.autobuy.upgrades && hasAutobuyUpgrades(state);
  return (candidate) =>
    candidate.kind === 'generator' ? generators && state.autobuy.generators[candidate.id] : upgrades;
}

/**
 * La compra que la Poda haría ahora, aunque aún no se pueda pagar (la interfaz dice para qué
 * ahorra). Con 0 clics por segundo: la autocompra no cuenta con que alguien absorba. Null si no
 * hay nada que comprar entre lo activado.
 */
export function paybackTarget(state: GameState): PurchaseCandidate | null {
  return bestPurchase(state, 0, paybackFilter(state));
}

/**
 * Hasta PAYBACK_MAX_PER_SECOND compras por segundo, siempre la mejor. Si la mejor aún no
 * alcanza, para: comprar la segunda mejor retrasaría la que más rinde (espera a poder pagarla).
 */
function runPaybackAutobuy(state: GameState): void {
  for (let i = 0; i < PAYBACK_MAX_PER_SECOND; i += 1) {
    const best = paybackTarget(state);
    if (!best || num.lt(state.nutrients, best.cost)) return;
    const owned = best.kind === 'generator' ? state.owned[best.id] : state.upgrades.length;
    if (best.kind === 'generator') purchaseGenerator(state, { id: best.id, amount: 1 });
    else purchaseUpgrade(state, { id: best.id });
    // Defensa: si la acción rechazó la compra (no debería: el coste es el mismo), no se insiste.
    const after = best.kind === 'generator' ? state.owned[best.id] : state.upgrades.length;
    if (after === owned) return;
  }
}

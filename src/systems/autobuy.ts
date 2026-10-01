/**
 * Autocompra (mutaciones Instinto e Instinto superior, PROMPT.md §11). Cada segundo de
 * juego compra una unidad de cada generador activado si cuesta menos del umbral elegido
 * (10 %, 50 % o 100 %) de los nutrientes, y con Instinto superior una mejora.
 */
import { GENERATORS } from '../data/generators.ts';
import { buyGenerator, buyUpgrade } from '../core/actions.ts';
import {
  availableUpgrades,
  hasAutobuyGenerators,
  hasAutobuyUpgrades,
  isGeneratorUnlocked,
  quoteGenerator,
} from '../core/economy.ts';
import * as num from '../core/num.ts';
import type { GameState } from '../core/state.ts';

export function runAutobuy(state: GameState): void {
  if (hasAutobuyGenerators(state)) {
    // Del más caro al más barato: el umbral se calcula sobre los nutrientes de cada momento,
    // así que empezar por arriba evita que las Hifas se coman el presupuesto del resto.
    for (let i = GENERATORS.length - 1; i >= 0; i -= 1) {
      const def = GENERATORS[i];
      if (!def || !state.autobuy.generators[def.id] || !isGeneratorUnlocked(state, def)) continue;
      const quote = quoteGenerator(state, def.id, 1);
      if (num.lt(quote.cost, num.mul(state.nutrients, state.autobuy.threshold))) {
        buyGenerator(state, { id: def.id, amount: 1 });
      }
    }
  }
  if (hasAutobuyUpgrades(state) && state.autobuy.upgrades) {
    const limit = num.mul(state.nutrients, state.autobuy.threshold);
    const cheapest = availableUpgrades(state)[0];
    if (cheapest && num.lt(cheapest.cost, limit)) buyUpgrade(state, { id: cheapest.id });
  }
}

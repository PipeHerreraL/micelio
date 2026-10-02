import { describe, expect, it } from 'vitest';
import { setAutobuyMode } from '../src/core/actions.ts';
import { computeDerived, invalidate } from '../src/core/selectors.ts';
import { createState, type AutobuyMode, type GameState } from '../src/core/state.ts';
import type { MutationId } from '../src/data/mutations.ts';
import { createPlasmodium } from '../src/partners/plasmodium/state.ts';
import { paybackTarget, runAutobuy } from '../src/systems/autobuy.ts';

/**
 * Poda (fase 9): con una placa del plasmodio cartografiada, la autocompra puede elegir lo que
 * antes se amortiza. Solo cambia qué se compra; la red produce lo mismo con lo mismo comprado.
 */

const NOW = Date.UTC(2026, 9, 1);
const MAP = { score: 3, quality: 0.8, cost: 1, tolerance: 1, alive: 9, joined: 4 };

/** Partida nueva con Instinto: sin descuentos ni bonos, la producción es la de la tabla. */
function withInstinct(mutations: MutationId[] = ['instinct']): GameState {
  const s = createState(42, NOW);
  s.mutations = [...mutations];
  invalidate(s);
  return s;
}

/** Da al estado un plasmodio con `mapped` placas cartografiadas. */
function withPlasmodium(s: GameState, mapped: number): GameState {
  const p = createPlasmodium(1);
  for (let i = 0; i < mapped; i += 1) Object.assign(p.plates[i] ?? {}, { map: { ...MAP } });
  s.partners.plasmodium = p;
  return s;
}

/** Copia de las compras de un estado en una partida sin socio y con el umbral de siempre. */
function purchasesOnly(s: GameState): GameState {
  const out = withInstinct();
  out.owned = { ...s.owned };
  out.upgrades = [...s.upgrades];
  out.achievements = [...s.achievements];
  invalidate(out);
  return out;
}

describe('Poda: autocompra por amortización', () => {
  it('la Poda solo cambia qué compra la autocompra, nunca los derivados', () => {
    const plain = withInstinct();
    plain.owned.hypha = 3;
    const pruned = withPlasmodium(structuredClone(plain), 1);
    pruned.autobuy.mode = 'payback';
    invalidate(plain);
    invalidate(pruned);
    // Con lo mismo comprado, el modo y la ventaja no tocan la producción ni nada derivado.
    expect(computeDerived(pruned)).toEqual(computeDerived(plain));

    for (const s of [plain, pruned]) {
      s.nutrients = 1e6;
      s.autobuy.threshold = 1;
      s.autobuy.generators.hypha = true;
      s.autobuy.generators.rhizomorph = true;
      runAutobuy(s);
    }
    // Compran distinto (umbral: una de cada; Poda: hasta 10 de lo que antes se amortiza)…
    expect(pruned.owned).not.toEqual(plain.owned);
    // …pero lo comprado produce lo mismo que en una partida sin socio.
    expect(computeDerived(pruned)).toEqual(computeDerived(purchasesOnly(pruned)));
  });

  it('sin la ventaja, el modo amortización compra por umbral', () => {
    // Mismo caso que el umbral de siempre (tests/actions.test.ts): Primordio 1300 ≥ 500 no;
    // Rizomorfo 120 < 500 → quedan 880; Hifa 10 < 0,5 · 880 = 440 → quedan 870.
    for (const mapped of [null, 0]) {
      const s = withInstinct();
      if (mapped !== null) withPlasmodium(s, mapped);
      s.autobuy.mode = 'payback';
      s.nutrients = 1000;
      s.autobuy.threshold = 0.5;
      s.autobuy.generators.hypha = true;
      s.autobuy.generators.rhizomorph = true;
      s.autobuy.generators.primordium = true;
      runAutobuy(s);
      expect(s.owned.primordium).toBe(0);
      expect(s.owned.rhizomorph).toBe(1);
      expect(s.owned.hypha).toBe(1);
      expect(s.nutrients).toBeCloseTo(870, 10);
    }
  });

  it('en modo amortización compra hasta 10 por segundo lo que antes se amortiza entre lo activado, y si no alcanza, espera', () => {
    const s = withPlasmodium(withInstinct(), 1);
    s.autobuy.mode = 'payback';
    s.nutrients = 1e6;
    // El umbral no se aplica: con el 10 % y 1e6 N tampoco habría límite que importe aquí.
    s.autobuy.threshold = 0.1;
    s.autobuy.generators.hypha = true;
    s.autobuy.generators.rhizomorph = true;
    runAutobuy(s);
    // Con todo pagable, gana el menor coste ÷ producción (el bono global se cancela):
    // Hifa 10·1,15^k ÷ 0,1 = 100, 115, 132,25, 152,09, 174,90, 201,14…
    // Rizomorfo 120·1,15^k ÷ 1 = 120, 138, 158,70, 182,51, 209,88…
    // Las 10 primeras: 6 Hifas y 4 Rizomorfos; el Primordio (1300 ÷ 9 = 144,4) no está activado.
    expect(s.owned.hypha).toBe(6);
    expect(s.owned.rhizomorph).toBe(4);
    expect(s.owned.primordium).toBe(0);
    // 10·(1,15^6 − 1)/0,15 = 87,5374 y 120·(1,15^4 − 1)/0,15 = 599,205.
    expect(s.nutrients).toBeCloseTo(1e6 - 87.5373844 - 599.205, 4);

    // Si lo mejor no alcanza, espera aunque haya otra compra pagable.
    const w = withPlasmodium(withInstinct(), 1);
    w.autobuy.mode = 'payback';
    w.autobuy.generators.hypha = true;
    w.autobuy.generators.rhizomorph = true;
    w.owned.hypha = 10;
    w.nutrients = 100;
    invalidate(w);
    // 10 Hifas producen 1 N/s. Rizomorfo: espera 20 s + 120 ÷ 1 = 140; Hifa (40,46 N, pagable):
    // 0 + 404,56. Lo mejor es el Rizomorfo y aún no alcanza: no compra nada.
    expect(paybackTarget(w)).toEqual({ kind: 'generator', id: 'rhizomorph', cost: 120 });
    runAutobuy(w);
    expect(w.owned.hypha).toBe(10);
    expect(w.owned.rhizomorph).toBe(0);
    expect(w.nutrients).toBe(100);

    // Con 130 N compra el Rizomorfo; el siguiente (138 N, espera 128 ÷ 2 = 64 + 138 = 202) sigue
    // siendo mejor que la Hifa (404,56) y no alcanza con los 10 N que quedan: espera otra vez.
    w.nutrients = 130;
    runAutobuy(w);
    expect(w.owned.rhizomorph).toBe(1);
    expect(w.owned.hypha).toBe(10);
    expect(w.nutrients).toBeCloseTo(10, 10);
  });

  it('las mejoras solo entran con su interruptor y con Instinto superior', () => {
    // Con 1 Hifa aparece «Quitina flexible» (100 N); sin Instinto superior nunca se elige.
    const s = withPlasmodium(withInstinct(), 1);
    s.autobuy.mode = 'payback';
    s.autobuy.upgrades = true;
    s.owned.hypha = 1;
    invalidate(s);
    expect(paybackTarget(s)).toBeNull();

    const higher = withPlasmodium(withInstinct(['instinct', 'higherInstinct']), 1);
    higher.autobuy.mode = 'payback';
    higher.owned.hypha = 1;
    invalidate(higher);
    expect(paybackTarget(higher)).toBeNull();
    higher.autobuy.upgrades = true;
    expect(paybackTarget(higher)?.kind).toBe('upgrade');
  });

  it('setAutobuyMode rechaza un modo desconocido', () => {
    const s = withInstinct();
    setAutobuyMode(s, { mode: 'greedy' as AutobuyMode });
    expect(s.autobuy.mode).toBe('threshold');
    setAutobuyMode(s, { mode: 'payback' });
    expect(s.autobuy.mode).toBe('payback');
    setAutobuyMode(s, { mode: '' as AutobuyMode });
    expect(s.autobuy.mode).toBe('payback');
  });
});

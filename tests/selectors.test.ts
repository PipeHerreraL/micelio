import { beforeEach, describe, expect, it } from 'vitest';
import { buyGenerator, buyUpgrade } from '../src/core/actions.ts';
import {
  availableUpgrades,
  isGeneratorUnlocked,
  previewGenerator,
  previewUpgrade,
  quoteGenerator,
  secondsUntil,
  unlockedGenerators,
} from '../src/core/economy.ts';
import { drain } from '../src/core/events.ts';
import { computeDerived, derived, invalidate } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { getGenerator } from '../src/data/generators.ts';

// Partida nueva: sin generadores, sin mejoras, sin esporas, sin logros y sin eventos.
function newState(): GameState {
  return createState(1, 0);
}

// Logros de relleno: solo cuenta cuántos hay (L), no cuáles.
function fakeAchievements(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `prueba.${i}`);
}

beforeEach(() => {
  // La cola de eventos es del módulo: se vacía para que cada prueba empiece limpia.
  drain();
});

describe('producción: P = G Σ p_i n_i 2^(u_i + h_i) s_i', () => {
  it('una partida nueva no produce nada y el clic vale 1', () => {
    const d = computeDerived(newState());
    expect(d.production).toBe(0);
    expect(d.clickValue).toBeCloseTo(1, 10);
    expect(d.globalMultiplier).toBeCloseTo(1, 10);
    expect(d.eventMultiplier).toBe(1);
  });

  it('10 Hifas sin multiplicadores producen 1 N/s', () => {
    const state = newState();
    state.owned.hypha = 10;
    const d = computeDerived(state);
    // 0.1 N/s por Hifa
    expect(d.unitProduction.hypha).toBeCloseTo(0.1, 10);
    // 10 × 0.1 = 1
    expect(d.generatorProduction.hypha).toBeCloseTo(1, 10);
    expect(d.production).toBeCloseTo(1, 10);
  });

  it('cada mejora de generador duplica solo a su generador', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.owned.rhizomorph = 5;
    state.upgrades = ['hypha.u1', 'hypha.u2'];
    const d = computeDerived(state);
    expect(d.upgradeDoublings.hypha).toBe(2);
    expect(d.upgradeDoublings.rhizomorph).toBe(0);
    // Hifas: 10 × 0.1 × 2^2 = 4
    expect(d.generatorProduction.hypha).toBeCloseTo(4, 10);
    // Rizomorfos sin mejoras: 5 × 1 = 5
    expect(d.generatorProduction.rhizomorph).toBeCloseTo(5, 10);
    // 4 + 5 = 9
    expect(d.production).toBeCloseTo(9, 10);
  });

  it('las cuatro mejoras de la Hifa multiplican su producción por 16', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.upgrades = ['hypha.u1', 'hypha.u2', 'hypha.u3', 'hypha.u4'];
    // 10 × 0.1 × 2^4 = 16
    expect(computeDerived(state).production).toBeCloseTo(16, 10);
  });

  it('una mejora con id desconocido en el estado se ignora sin romper el cálculo', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.upgrades = ['no.existe'];
    // 10 × 0.1 = 1, como si la lista estuviera vacía
    expect(computeDerived(state).production).toBeCloseTo(1, 10);
  });

  it('el hito de 25 Hifas duplica su producción y 24 no lo alcanza', () => {
    const state = newState();
    state.owned.hypha = 24;
    // 24 × 0.1 = 2.4, sin hito
    expect(computeDerived(state).milestoneDoublings.hypha).toBe(0);
    expect(computeDerived(state).production).toBeCloseTo(2.4, 10);

    state.owned.hypha = 25;
    // 25 × 0.1 × 2 = 5
    expect(computeDerived(state).milestoneDoublings.hypha).toBe(1);
    expect(computeDerived(state).production).toBeCloseTo(5, 10);
  });

  it('los hitos se acumulan: 50 Hifas son ×4, 100 son ×8 y 400 son ×512', () => {
    const state = newState();
    state.owned.hypha = 49;
    // 49 × 0.1 × 2 = 9.8 (solo el hito de 25)
    expect(computeDerived(state).production).toBeCloseTo(9.8, 10);
    state.owned.hypha = 50;
    // 50 × 0.1 × 2^2 = 20
    expect(computeDerived(state).production).toBeCloseTo(20, 10);
    state.owned.hypha = 100;
    // 100 × 0.1 × 2^3 = 80
    expect(computeDerived(state).production).toBeCloseTo(80, 10);
    state.owned.hypha = 400;
    // Nueve hitos (25 … 400): 400 × 0.1 × 2^9 = 40 × 512 = 20480
    expect(computeDerived(state).milestoneDoublings.hypha).toBe(9);
    expect(computeDerived(state).production).toBeCloseTo(20480, 6);
  });

  it('mejoras e hitos suman exponentes: 25 Hifas con tres mejoras son ×16', () => {
    const state = newState();
    state.owned.hypha = 25;
    state.upgrades = ['hypha.u1', 'hypha.u2', 'hypha.u3'];
    // 25 × 0.1 × 2^(3 + 1) = 2.5 × 16 = 40
    expect(computeDerived(state).production).toBeCloseTo(40, 10);
  });

  it('Corro de brujas suma un 0.5 % a los Anillos de hadas por cada Seta', () => {
    const state = newState();
    state.owned.mushroom = 50;
    state.owned.fairyRing = 2;
    // Sin la mejora no hay sinergia: 2 × 320 = 640
    expect(computeDerived(state).synergy.fairyRing).toBe(1);
    expect(computeDerived(state).generatorProduction.fairyRing).toBeCloseTo(640, 8);

    state.upgrades = ['witchesRing'];
    const d = computeDerived(state);
    // s = 1 + 0.005 × 50 = 1.25
    expect(d.synergy.fairyRing).toBeCloseTo(1.25, 10);
    // Anillos: 2 × 320 × 1.25 = 800
    expect(d.generatorProduction.fairyRing).toBeCloseTo(800, 8);
    // Setas con dos hitos (25 y 50): 50 × 55 × 4 = 11000; la sinergia no las toca
    expect(d.synergy.mushroom).toBe(1);
    expect(d.generatorProduction.mushroom).toBeCloseTo(11000, 6);
    // 800 + 11000 = 11800
    expect(d.production).toBeCloseTo(11800, 6);
  });

  it('Corro de brujas sin Setas no cambia nada', () => {
    const state = newState();
    state.owned.fairyRing = 2;
    state.upgrades = ['witchesRing'];
    // s = 1 + 0.005 × 0 = 1 → 2 × 320 = 640
    expect(computeDerived(state).synergy.fairyRing).toBe(1);
    expect(computeDerived(state).production).toBeCloseTo(640, 8);
  });

  it('Intercambio de azúcares suma un 1 % a las Redes micorrícicas por cada Árbol madre', () => {
    const state = newState();
    state.owned.motherTree = 10;
    state.owned.mycorrhiza = 3;
    state.upgrades = ['sugarExchange'];
    const d = computeDerived(state);
    // s = 1 + 0.01 × 10 = 1.1
    expect(d.synergy.mycorrhiza).toBeCloseTo(1.1, 10);
    // Redes: 3 × 1800 × 1.1 = 5940
    expect(d.generatorProduction.mycorrhiza).toBeCloseTo(5940, 6);
    // Árboles madre: 10 × 10500 = 105000
    expect(d.generatorProduction.motherTree).toBeCloseTo(105000, 6);
    // 5940 + 105000 = 110940
    expect(d.production).toBeCloseTo(110940, 6);
  });

  it('Humus fértil multiplica toda la producción por 1.1', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.owned.rhizomorph = 2;
    state.upgrades = ['fertileHumus'];
    const d = computeDerived(state);
    expect(d.globalMultiplier).toBeCloseTo(1.1, 10);
    // (10 × 0.1 + 2 × 1) × 1.1 = 3 × 1.1 = 3.3
    expect(d.production).toBeCloseTo(3.3, 10);
    // Una Hifa: 0.1 × 1.1 = 0.11
    expect(d.unitProduction.hypha).toBeCloseTo(0.11, 10);
  });

  it('las cuatro mejoras globales se multiplican entre sí', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.upgrades = ['fertileHumus', 'autumnLitter', 'ancestralCompost', 'carbonCycle'];
    // 1.1 × 1.15 × 1.2 × 1.25 = 1.265 × 1.5 = 1.8975
    expect(computeDerived(state).globalMultiplier).toBeCloseTo(1.8975, 10);
    // 10 × 0.1 × 1.8975 = 1.8975
    expect(computeDerived(state).production).toBeCloseTo(1.8975, 10);
  });

  it('cada nivel de esporas suma un 1 % de producción', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.spores.level = 50;
    // G = 1 + 0.01 × 50 = 1.5 → 10 × 0.1 × 1.5 = 1.5
    expect(computeDerived(state).globalMultiplier).toBeCloseTo(1.5, 10);
    expect(computeDerived(state).production).toBeCloseTo(1.5, 10);
  });

  it('las esporas disponibles no cuentan: solo el nivel', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.spores.available = 100;
    // Nivel 0: G = 1 → 1 N/s
    expect(computeDerived(state).production).toBeCloseTo(1, 10);
  });

  it('cada logro suma un 1 % de producción con a = 0.01', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.achievements = fakeAchievements(10);
    const d = computeDerived(state);
    expect(d.achievementBonus).toBeCloseTo(0.01, 12);
    // G = 1 + 0.01 × 10 = 1.1 → 10 × 0.1 × 1.1 = 1.1
    expect(d.globalMultiplier).toBeCloseTo(1.1, 10);
    expect(d.production).toBeCloseTo(1.1, 10);
  });

  it('con Simbiosis antigua cada logro suma un 2 % (a = 0.02)', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.achievements = fakeAchievements(10);
    state.mutations = ['ancientSymbiosis'];
    const d = computeDerived(state);
    expect(d.achievementBonus).toBeCloseTo(0.02, 12);
    // G = 1 + 0.02 × 10 = 1.2 → 10 × 0.1 × 1.2 = 1.2
    expect(d.globalMultiplier).toBeCloseTo(1.2, 10);
    expect(d.production).toBeCloseTo(1.2, 10);
  });

  it('el Aguacero multiplica la producción por 5 y se puede leer sin él', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.effects.push({ kind: 'downpour', remaining: 60, duration: 60 });
    const d = computeDerived(state);
    expect(d.eventMultiplier).toBe(5);
    // 10 × 0.1 × 5 = 5
    expect(d.production).toBeCloseTo(5, 10);
    // Sin el evento: 5 / 5 = 1
    expect(d.productionWithoutEvent).toBeCloseTo(1, 10);
    expect(d.globalMultiplier).toBeCloseTo(5, 10);
  });

  it('un Aguacero ya agotado no multiplica nada', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.effects.push({ kind: 'downpour', remaining: 0, duration: 60 });
    expect(computeDerived(state).eventMultiplier).toBe(1);
    // 10 × 0.1 = 1
    expect(computeDerived(state).production).toBeCloseTo(1, 10);
  });

  it('G combina esporas, logros, mejoras globales y evento en un solo producto', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.spores.level = 20;
    state.achievements = fakeAchievements(5);
    state.mutations = ['ancientSymbiosis'];
    state.upgrades = ['fertileHumus'];
    state.effects.push({ kind: 'downpour', remaining: 30, duration: 60 });
    const d = computeDerived(state);
    // (1 + 0.01 × 20)(1 + 0.02 × 5) × 1.1 × 5 = 1.2 × 1.1 × 1.1 × 5 = 7.26
    expect(d.globalMultiplier).toBeCloseTo(7.26, 10);
    // 10 × 0.1 × 7.26 = 7.26
    expect(d.production).toBeCloseTo(7.26, 10);
    // Sin el Aguacero: 7.26 / 5 = 1.452
    expect(d.productionWithoutEvent).toBeCloseTo(1.452, 10);
  });

  it('la Tormenta no cambia la producción, solo el clic', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.effects.push({ kind: 'storm', remaining: 12, duration: 12 });
    const d = computeDerived(state);
    expect(d.eventMultiplier).toBe(1);
    // 10 × 0.1 = 1
    expect(d.production).toBeCloseTo(1, 10);
  });
});

describe('valor del clic: V = M + q P', () => {
  it('Tacto sensible duplica el clic y Absorción voraz lo vuelve a duplicar', () => {
    const state = newState();
    state.upgrades = ['sensitiveTouch'];
    // M = 1 × 2 = 2
    expect(computeDerived(state).clickMultiplier).toBeCloseTo(2, 10);
    expect(computeDerived(state).clickValue).toBeCloseTo(2, 10);
    state.upgrades = ['sensitiveTouch', 'voraciousAbsorption'];
    // M = 1 × 2 × 2 = 4
    expect(computeDerived(state).clickValue).toBeCloseTo(4, 10);
  });

  it('Quimiotropismo suma al clic el 1 % de la producción', () => {
    const state = newState();
    state.owned.primordium = 10;
    state.upgrades = ['chemotropism'];
    const d = computeDerived(state);
    // P = 10 × 9 = 90 N/s
    expect(d.production).toBeCloseTo(90, 10);
    expect(d.clickPercent).toBeCloseTo(0.01, 12);
    // V = 1 + 0.01 × 90 = 1.9
    expect(d.clickValue).toBeCloseTo(1.9, 10);
  });

  it('Absorción profunda suma al clic el 3 % de la producción', () => {
    const state = newState();
    state.owned.primordium = 10;
    state.mutations = ['deepAbsorption'];
    const d = computeDerived(state);
    expect(d.clickPercent).toBeCloseTo(0.03, 12);
    // V = 1 + 0.03 × 90 = 3.7
    expect(d.clickValue).toBeCloseTo(3.7, 10);
  });

  it('multiplicadores y porcentajes del clic se combinan como M + q P', () => {
    const state = newState();
    state.owned.primordium = 10;
    state.upgrades = ['sensitiveTouch', 'chemotropism'];
    state.mutations = ['deepAbsorption'];
    const d = computeDerived(state);
    // q = 0.01 + 0.03 = 0.04
    expect(d.clickPercent).toBeCloseTo(0.04, 12);
    // V = 2 + 0.04 × 90 = 2 + 3.6 = 5.6
    expect(d.clickValue).toBeCloseTo(5.6, 10);
  });

  it('el Aguacero sube el clic a través de la producción, no de M', () => {
    const state = newState();
    state.owned.primordium = 10;
    state.upgrades = ['chemotropism'];
    state.effects.push({ kind: 'downpour', remaining: 60, duration: 60 });
    const d = computeDerived(state);
    // P = 10 × 9 × 5 = 450 → V = 1 + 0.01 × 450 = 5.5
    expect(d.production).toBeCloseTo(450, 8);
    expect(d.clickMultiplier).toBeCloseTo(1, 10);
    expect(d.clickValue).toBeCloseTo(5.5, 10);
  });

  it('la Tormenta multiplica por 500 el clic entero, porcentaje incluido', () => {
    const state = newState();
    state.owned.primordium = 10;
    state.upgrades = ['sensitiveTouch', 'chemotropism'];
    state.effects.push({ kind: 'storm', remaining: 12, duration: 12 });
    const d = computeDerived(state);
    expect(d.stormMultiplier).toBe(500);
    // V = (2 + 0.01 × 90) × 500 = 2.9 × 500 = 1450
    expect(d.clickValue).toBeCloseTo(1450, 8);
  });

  it('una Tormenta ya agotada no multiplica el clic', () => {
    const state = newState();
    state.upgrades = ['sensitiveTouch'];
    state.effects.push({ kind: 'storm', remaining: 0, duration: 12 });
    expect(computeDerived(state).stormMultiplier).toBe(1);
    // V = 2
    expect(computeDerived(state).clickValue).toBeCloseTo(2, 10);
  });
});

describe('caché de derivados', () => {
  it('derived devuelve el mismo objeto hasta que se invalida', () => {
    const state = newState();
    state.owned.hypha = 10;
    const first = derived(state);
    // 10 × 0.1 = 1
    expect(first.production).toBeCloseTo(1, 10);

    // Una mutación directa sin invalidar deja la caché vieja: por eso toda acción invalida.
    state.owned.hypha = 20;
    expect(derived(state)).toBe(first);
    expect(derived(state).production).toBeCloseTo(1, 10);
    // computeDerived no pasa por la caché: ya ve las 20 Hifas (20 × 0.1 = 2)
    expect(computeDerived(state).production).toBeCloseTo(2, 10);

    invalidate(state);
    const second = derived(state);
    expect(second).not.toBe(first);
    expect(second.production).toBeCloseTo(2, 10);
  });

  it('la caché es por estado: dos partidas no comparten derivados', () => {
    const a = newState();
    const b = newState();
    a.owned.hypha = 10;
    b.owned.rhizomorph = 3;
    // a: 10 × 0.1 = 1; b: 3 × 1 = 3
    expect(derived(a).production).toBeCloseTo(1, 10);
    expect(derived(b).production).toBeCloseTo(3, 10);
    expect(derived(a)).not.toBe(derived(b));
  });

  it('tras comprar generadores la caché coincide con un cálculo fresco', () => {
    const state = newState();
    state.nutrients = 1000;
    // Se llena la caché antes de comprar.
    expect(derived(state).production).toBe(0);

    buyGenerator(state, { id: 'hypha', amount: 10 });
    expect(state.owned.hypha).toBe(10);
    // Coste: 10 × (1.15^10 − 1) / 0.15 = 203.0371823805…
    expect(state.nutrients).toBeCloseTo(1000 - 203.0371823805, 6);
    // La primera Hifa da el logro own.hypha.1: L = 1, G = 1.01
    expect(state.achievements).toEqual(['own.hypha.1']);
    // 10 × 0.1 × 1.01 = 1.01
    expect(derived(state).production).toBeCloseTo(1.01, 10);
    expect(derived(state)).toEqual(computeDerived(state));
  });

  it('un logro de producción otorgado durante la compra también entra en la caché', () => {
    const state = newState();
    state.nutrients = 2500;
    derived(state);

    buyGenerator(state, { id: 'rhizomorph', amount: 10 });
    // Coste: 120 × (1.15^10 − 1) / 0.15 = 12 × 203.0371823805… = 2436.4461885663…
    expect(state.nutrients).toBeCloseTo(2500 - 2436.4461885663, 6);
    // own.rhizomorph.1 → G = 1.01 → 10 × 1 × 1.01 = 10.1 ≥ 10 → production.1 → L = 2
    expect(state.achievements).toEqual(['own.rhizomorph.1', 'production.1']);
    // 10 × 1 × (1 + 0.01 × 2) = 10.2
    expect(derived(state).production).toBeCloseTo(10.2, 10);
    expect(derived(state)).toEqual(computeDerived(state));

    const events = drain();
    expect(events).toContainEqual({ type: 'buyGenerator', id: 'rhizomorph', count: 10 });
    expect(events).toContainEqual({ type: 'achievement', id: 'production.1' });
  });

  it('comprar el máximo que cruza un hito deja la caché al día', () => {
    const state = newState();
    state.nutrients = 10000;
    derived(state);

    buyGenerator(state, { id: 'hypha', amount: 'max' });
    // 10 × (1.15^35 − 1) / 0.15 ≈ 8812 ≤ 10000 < 10 × (1.15^36 − 1) / 0.15 ≈ 10143
    expect(state.owned.hypha).toBe(35);
    // Hito de 25 y logro own.hypha.1: 35 × 0.1 × 2 × 1.01 = 7.07
    expect(derived(state).production).toBeCloseTo(7.07, 10);
    expect(derived(state)).toEqual(computeDerived(state));
  });

  it('tras comprar una mejora la caché coincide con un cálculo fresco', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.achievements = ['own.hypha.1'];
    state.nutrients = 1000;
    // Antes: 10 × 0.1 × 1.01 = 1.01
    expect(derived(state).production).toBeCloseTo(1.01, 10);

    buyUpgrade(state, { id: 'hypha.u1' });
    expect(state.upgrades).toEqual(['hypha.u1']);
    // Cuesta 10 × 10 = 100: 1000 − 100 = 900
    expect(state.nutrients).toBeCloseTo(900, 10);
    // Después: 10 × 0.1 × 2 × 1.01 = 2.02
    expect(derived(state).production).toBeCloseTo(2.02, 10);
    expect(derived(state)).toEqual(computeDerived(state));
  });

  it('comprar una sinergia actualiza la caché del generador destino', () => {
    const state = newState();
    state.owned.mushroom = 50;
    state.owned.fairyRing = 2;
    // Los logros que ya se cumplen van de antemano para que la compra no otorgue ninguno.
    state.achievements = [
      'own.mushroom.1',
      'own.mushroom.50',
      'own.fairyRing.1',
      'production.1',
      'production.2',
    ];
    state.nutrients = 3e7;
    // L = 5 → G = 1.05; antes: (50 × 55 × 4 + 2 × 320) × 1.05 = 11640 × 1.05 = 12222
    expect(derived(state).production).toBeCloseTo(12222, 6);

    buyUpgrade(state, { id: 'witchesRing' });
    expect(state.upgrades).toEqual(['witchesRing']);
    expect(state.achievements).toHaveLength(5);
    // Después: (11000 + 2 × 320 × 1.25) × 1.05 = 11800 × 1.05 = 12390
    expect(derived(state).production).toBeCloseTo(12390, 6);
    expect(derived(state)).toEqual(computeDerived(state));
  });

  it('una compra que no se puede pagar no cambia nada', () => {
    const state = newState();
    state.nutrients = 5;
    const before = derived(state);
    buyGenerator(state, { id: 'hypha', amount: 1 });
    expect(state.owned.hypha).toBe(0);
    expect(state.nutrients).toBe(5);
    expect(derived(state)).toBe(before);
    expect(drain()).toEqual([]);
  });
});

describe('cotización de generadores', () => {
  it('la primera Hifa cuesta 10 y la sexta 10 × 1.15^5', () => {
    const state = newState();
    state.nutrients = 10;
    const first = quoteGenerator(state, 'hypha', 1);
    expect(first.count).toBe(1);
    expect(first.cost).toBeCloseTo(10, 10);
    expect(first.affordable).toBe(true);

    state.owned.hypha = 5;
    // 10 × 1.15^5 = 10 × 2.0113571875 = 20.113571875
    const sixth = quoteGenerator(state, 'hypha', 1);
    expect(sixth.cost).toBeCloseTo(20.113571875, 9);
    expect(sixth.affordable).toBe(false);
  });

  it('un lote de 10 cuesta la suma geométrica y solo se puede pagar si alcanza', () => {
    const state = newState();
    state.nutrients = 203;
    // 10 × (1.15^10 − 1) / 0.15 = 10 × 3.0455577357… / 0.15 = 203.0371823805…
    const quote = quoteGenerator(state, 'hypha', 10);
    expect(quote.count).toBe(10);
    expect(quote.cost).toBeCloseTo(203.0371823805, 8);
    expect(quote.affordable).toBe(false);
    state.nutrients = 204;
    expect(quoteGenerator(state, 'hypha', 10).affordable).toBe(true);
  });

  it('un lote de 10 Rizomorfos con 5 poseídos parte del coste de la sexta unidad', () => {
    const state = newState();
    state.owned.rhizomorph = 5;
    // 120 × 1.15^5 × (1.15^10 − 1) / 0.15 = 241.36286… × 20.30371823… = 4900.5635533…
    expect(quoteGenerator(state, 'rhizomorph', 10).cost).toBeCloseTo(4900.5635533, 6);
  });

  it('un lote de 100 Hifas cuesta 10 × (1.15^100 − 1) / 0.15', () => {
    const state = newState();
    // 1.15^100 = 1 174 313.4507… → 10 × 1 174 312.4507… / 0.15 = 78 287 496.7134…
    const quote = quoteGenerator(state, 'hypha', 100);
    expect(quote.count).toBe(100);
    expect(quote.cost).toBeCloseTo(78287496.7134, 2);
    expect(quote.affordable).toBe(false);
  });

  it('Máx con 100 nutrientes compra 6 Hifas y nunca supera los nutrientes', () => {
    const state = newState();
    state.nutrients = 100;
    // Sumas: 10, 21.5, 34.725, 49.93375, 67.4238125, 87.537384375, 110.66… → 6 caben
    const quote = quoteGenerator(state, 'hypha', 'max');
    expect(quote.count).toBe(6);
    expect(quote.cost).toBeCloseTo(87.537384375, 8);
    expect(quote.affordable).toBe(true);
    expect(quote.cost).toBeLessThanOrEqual(100);
  });

  it('Máx con el coste justo de una unidad compra una', () => {
    const state = newState();
    state.nutrients = 10;
    const quote = quoteGenerator(state, 'hypha', 'max');
    expect(quote.count).toBe(1);
    expect(quote.cost).toBeCloseTo(10, 10);
    expect(quote.affordable).toBe(true);
  });

  it('Máx sin nutrientes para una unidad cotiza 0 unidades con el precio de una', () => {
    const state = newState();
    state.nutrients = 5;
    const quote = quoteGenerator(state, 'hypha', 'max');
    expect(quote.count).toBe(0);
    expect(quote.cost).toBeCloseTo(10, 10);
    expect(quote.affordable).toBe(false);
  });

  it('la Quitina ligera abarata un 10 % y Máx compra más con los mismos nutrientes', () => {
    const state = newState();
    state.nutrients = 100;
    state.mutations = ['lightChitin'];
    invalidate(state);
    expect(derived(state).costDiscount).toBeCloseTo(0.1, 12);
    // 10 × 0.9 = 9
    expect(quoteGenerator(state, 'hypha', 1).cost).toBeCloseTo(9, 10);
    // 7 unidades: 110.66799203125 × 0.9 = 99.601192828125 ≤ 100; 8: 123.54… > 100
    const quote = quoteGenerator(state, 'hypha', 'max');
    expect(quote.count).toBe(7);
    expect(quote.cost).toBeCloseTo(99.601192828125, 8);
  });
});

describe('mejoras disponibles', () => {
  it('en una partida nueva no hay ninguna mejora a la vista', () => {
    expect(availableUpgrades(newState())).toEqual([]);
  });

  it('solo muestra las aparecidas y sin comprar, ordenadas por coste', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.owned.rhizomorph = 1;
    // 6000 N ganados: aparecen Tacto sensible (100) y Quimiotropismo (5e3), no Humus (1e4)
    state.runEarned = 6000;
    const ids = availableUpgrades(state).map((u) => u.id);
    // hypha.u1 = 100, sensitiveTouch = 500, hypha.u2 = 1000, rhizomorph.u1 = 1200, chemotropism = 2e4
    expect(ids).toEqual(['hypha.u1', 'sensitiveTouch', 'hypha.u2', 'rhizomorph.u1', 'chemotropism']);

    state.upgrades = ['sensitiveTouch', 'hypha.u1'];
    expect(availableUpgrades(state).map((u) => u.id)).toEqual(['hypha.u2', 'rhizomorph.u1', 'chemotropism']);
  });

  it('las mejoras por N ganados miran la partida, no los nutrientes actuales', () => {
    const state = newState();
    state.nutrients = 1e6;
    state.runEarned = 50;
    // 50 < 100: Tacto sensible aún no aparece aunque haya nutrientes de sobra
    expect(availableUpgrades(state)).toEqual([]);
  });
});

describe('vistas previas de compras', () => {
  it('previsualizar 15 Hifas más cuenta el hito de 25 sin tocar el estado', () => {
    const state = newState();
    state.owned.hypha = 10;
    const preview = previewGenerator(state, 'hypha', 15);
    // Antes: 10 × 0.1 = 1; después: 25 × 0.1 × 2 = 5 → +4
    expect(preview.production).toBeCloseTo(4, 10);
    expect(preview.click).toBeCloseTo(0, 12);
    expect(state.owned.hypha).toBe(10);
    expect(derived(state).production).toBeCloseTo(1, 10);
  });

  it('con Quimiotropismo la vista previa del generador también sube el clic', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.upgrades = ['chemotropism'];
    const preview = previewGenerator(state, 'hypha', 15);
    // +4 N/s → clic + 0.01 × 4 = 0.04
    expect(preview.production).toBeCloseTo(4, 10);
    expect(preview.click).toBeCloseTo(0.04, 10);
  });

  it('previsualizar Setas con Corro de brujas suma su producción y la sinergia', () => {
    const state = newState();
    state.owned.mushroom = 50;
    state.owned.fairyRing = 2;
    state.upgrades = ['witchesRing'];
    const preview = previewGenerator(state, 'mushroom', 10);
    // Setas: 10 × 55 × 4 = 2200; Anillos: 2 × 320 × (1.3 − 1.25) = 32 → 2232
    expect(preview.production).toBeCloseTo(2232, 6);
  });

  it('previsualizar una mejora de generador da la diferencia exacta', () => {
    const state = newState();
    state.owned.hypha = 10;
    const preview = previewUpgrade(state, 'hypha.u1');
    // 10 × 0.1 × 2 − 10 × 0.1 = 1
    expect(preview.production).toBeCloseTo(1, 10);
    expect(preview.click).toBeCloseTo(0, 12);
    expect(state.upgrades).toEqual([]);
  });

  it('previsualizar una mejora global y una de clic', () => {
    const state = newState();
    state.owned.hypha = 10;
    // Humus fértil: 1 × 1.1 − 1 = 0.1
    expect(previewUpgrade(state, 'fertileHumus').production).toBeCloseTo(0.1, 10);
    // Tacto sensible: no cambia N/s; clic 2 − 1 = 1
    const touch = previewUpgrade(state, 'sensitiveTouch');
    expect(touch.production).toBeCloseTo(0, 12);
    expect(touch.click).toBeCloseTo(1, 10);
  });

  it('previsualizar Corro de brujas da lo que suben los Anillos de hadas', () => {
    const state = newState();
    state.owned.mushroom = 50;
    state.owned.fairyRing = 2;
    // 2 × 320 × 0.25 = 160
    expect(previewUpgrade(state, 'witchesRing').production).toBeCloseTo(160, 8);
  });

  it('una mejora ya comprada o desconocida no previsualiza ningún aumento', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.upgrades = ['hypha.u1'];
    expect(previewUpgrade(state, 'hypha.u1')).toEqual({ production: 0, click: 0 });
    expect(previewUpgrade(state, 'no.existe')).toEqual({ production: 0, click: 0 });
  });
});

describe('tiempo hasta poder pagar', () => {
  it('es 0 si ya alcanzan los nutrientes', () => {
    const state = newState();
    state.nutrients = 10;
    expect(secondsUntil(state, 10)).toBe(0);
  });

  it('es infinito si falta dinero y no hay producción', () => {
    const state = newState();
    state.nutrients = 4;
    expect(secondsUntil(state, 10)).toBe(Number.POSITIVE_INFINITY);
  });

  it('divide lo que falta entre la producción actual, con el Aguacero incluido', () => {
    const state = newState();
    state.owned.hypha = 10;
    state.nutrients = 4;
    // (10 − 4) / 1 = 6 s
    expect(secondsUntil(state, 10)).toBeCloseTo(6, 10);

    state.effects.push({ kind: 'downpour', remaining: 60, duration: 60 });
    invalidate(state);
    // (10 − 4) / 5 = 1.2 s
    expect(secondsUntil(state, 10)).toBeCloseTo(1.2, 10);
  });
});

describe('desbloqueo de generadores', () => {
  it('el Gigante de Malheur se desbloquea con la primera esporulación', () => {
    const state = newState();
    const malheur = getGenerator('malheur');
    expect(isGeneratorUnlocked(state, malheur)).toBe(false);
    state.stats.sporulations = 1;
    expect(isGeneratorUnlocked(state, malheur)).toBe(true);
    state.stats.sporulations = 3;
    expect(isGeneratorUnlocked(state, malheur)).toBe(true);
  });

  it('la Red planetaria solo se desbloquea con Más allá del bosque', () => {
    const state = newState();
    const planetary = getGenerator('planetary');
    state.stats.sporulations = 10;
    expect(isGeneratorUnlocked(state, planetary)).toBe(false);
    state.mutations = ['beyondForest'];
    expect(isGeneratorUnlocked(state, planetary)).toBe(true);
  });

  it('una partida nueva tiene desbloqueados los ocho primeros generadores', () => {
    const ids = unlockedGenerators(newState()).map((g) => g.id);
    expect(ids).toEqual([
      'hypha',
      'rhizomorph',
      'primordium',
      'mushroom',
      'fairyRing',
      'mycorrhiza',
      'motherTree',
      'ancientForest',
    ]);
  });

  it('no se puede comprar un generador bloqueado aunque alcancen los nutrientes', () => {
    const state = newState();
    state.nutrients = 1e10;
    buyGenerator(state, { id: 'malheur', amount: 1 });
    expect(state.owned.malheur).toBe(0);
    // 1e10, intacto
    expect(state.nutrients).toBe(1e10);
  });
});

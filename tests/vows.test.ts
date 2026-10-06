import { beforeEach, describe, expect, it } from 'vitest';
import {
  adaptationsUnlocked,
  applyRunStartBonuses,
  buyAdaptation,
  buyGenerator,
  buyMutation,
  buyUpgrade,
  click,
  disperse,
  isMutationAsleep,
  isMutationAvailable,
  renounceVow,
  sporulate,
  wakeBudget,
  wakeMutation,
} from '../src/core/actions.ts';
import {
  availableUpgrades,
  hasAutobuyGenerators,
  hasAutobuyUpgrades,
  isGeneratorUnlocked,
} from '../src/core/economy.ts';
import { drain } from '../src/core/events.ts';
import {
  cycleGoalFactor,
  offeredVows,
  sporeScale,
  sporulateRequirement,
  vowGoalFactor,
} from '../src/core/forest.ts';
import { derived, invalidate } from '../src/core/selectors.ts';
import { emptyOwned, hasMutation, isTreeComplete, ownsMutation, type GameState } from '../src/core/state.ts';
import { tick } from '../src/core/tick.ts';
import { getGenerator } from '../src/data/generators.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { createPlasmodium } from '../src/partners/plasmodium/state.ts';
import { checkAchievements } from '../src/systems/achievements.ts';
import { isPaybackActive, runAutobuy } from '../src/systems/autobuy.ts';
import { checkActOne } from '../src/systems/journey.ts';
import { offlineCapSeconds, offlineEfficiency } from '../src/systems/offline.ts';
import { effectDuration, rollRainInterval } from '../src/systems/rain.ts';
import { parseSave, SAVE_VERSION } from '../src/systems/save.ts';
import {
  CYCLE_NOW,
  HOUR,
  fourthColonized,
  primeLevel,
  reachLevel,
  returnClosed,
  sownIn,
} from './cycle-states.ts';

/**
 * Los votos del ciclo libre en el núcleo y en el guardado (docs/ROADMAP.md, fase 10, bloque B): se
 * juran al sembrar, rebajan la R del ciclo, se rompen y nunca se añaden. «Sin mutaciones» cambia el
 * sentido de `hasMutation` («el efecto rige») frente a `ownsMutation` («comprada»): cada sitio que lo
 * lee tiene aquí su prueba, porque confundirlos dejaría recomprar una dormida o cerrar mal el Acto I.
 * Los estados se construyen con acciones (tests/cycle-states.ts).
 */

const NOW = CYCLE_NOW;
const SOWN_AT = NOW + 60 * HOUR;
const SAVED_AT = NOW + 1000 * HOUR;

beforeEach(() => {
  drain();
});

function textOf(state: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: SAVED_AT, state });
}

function loads(state: GameState): boolean {
  return parseSave(textOf(state)).ok;
}

function loadsAfter(build: () => GameState, mutate: (s: GameState) => void): boolean {
  const s = build();
  mutate(s);
  return loads(s);
}

/** En el natal con «sin mutaciones», todas dormidas, y una copia con el voto roto (todas despiertas). */
function asleepAndAwake(): { asleep: GameState; awake: GameState } {
  const asleep = sownIn('natal', SOWN_AT, ['noMutations']);
  const awake = structuredClone(asleep);
  renounceVow(awake, { vow: 'noMutations' });
  invalidate(asleep);
  drain();
  return { asleep, awake };
}

describe('jurar votos al sembrar (fase 10)', () => {
  it('sembrar jura los votos en el orden de VOW_IDS y empieza el ciclo sin mutaciones despiertas', () => {
    const s = returnClosed();
    disperse(s, { to: 'taiga', now: SOWN_AT, vows: ['noMutations', 'noRain'] });
    expect(s.forest.biome).toBe('taiga');
    expect(s.cycle).toEqual({ stays: 1, done: 0, vows: ['noRain', 'noMutations'], woken: [] });
  });

  it('el Chocó no ofrece «sin lluvia»: con ese voto, sembrarlo no hace nada; un voto repetido o desconocido, tampoco', () => {
    expect(offeredVows('choco')).toEqual(['autoOnly', 'noMutations']);
    expect(offeredVows('natal')).toEqual(['noRain', 'autoOnly', 'noMutations']);
    for (const vows of [['noRain'], ['autoOnly', 'autoOnly'], ['noSun']]) {
      const s = returnClosed();
      const before = structuredClone(s);
      disperse(s, { to: 'choco', now: SOWN_AT, vows: vows as never });
      expect(s, vows.join('+')).toEqual(before);
    }
    const s = returnClosed();
    disperse(s, { to: 'choco', now: SOWN_AT, vows: ['autoOnly', 'noMutations'] });
    expect(s.cycle.vows).toEqual(['autoOnly', 'noMutations']);
  });

  it('cada voto rebaja la R y el requisito del ciclo por su factor del bioma, y los factores se multiplican', () => {
    // Natal: R 4,8e13 y requisito 6 R; sin lluvia ×0,15, solo autocompra ×0,38, sin mutaciones ×0,53.
    const one = sownIn('natal', SOWN_AT, ['noRain']);
    expect(cycleGoalFactor(one)).toBe(0.15);
    expect(sporeScale(one) / 7.2e12).toBeCloseTo(1, 12);
    expect(sporulateRequirement(one) / 4.32e13).toBeCloseTo(1, 12);
    const three = sownIn('natal', SOWN_AT, ['noRain', 'autoOnly', 'noMutations']);
    // 0,15 · 0,38 · 0,53 = 0,03021.
    expect(cycleGoalFactor(three)).toBeCloseTo(0.03021, 12);
    expect(sporeScale(three) / 1.45008e12).toBeCloseTo(1, 12);
    // Sin votos, la R de siempre, bit a bit.
    const none = sownIn('natal', SOWN_AT);
    expect(sporeScale(none)).toBe(4.8e13);
    expect(sporulateRequirement(none)).toBe(2.88e14);
    expect(vowGoalFactor('choco', [])).toBe(1);
  });

  it('romper un voto quita solo ese y sube la R; no hay manera de añadir otro a mitad de ciclo', () => {
    const s = sownIn('tundra', SOWN_AT, ['noRain', 'autoOnly']);
    reachLevel(s, 120, NOW + 61 * HOUR);
    drain();
    const r = sporeScale(s);
    renounceVow(s, { vow: 'noRain' });
    expect(s.cycle.vows).toEqual(['autoOnly']);
    // Tundra: R 4,6e12 × 0,36 (solo autocompra) frente a × 0,44 · 0,36 antes.
    expect(sporeScale(s) / 1.656e12).toBeCloseTo(1, 12);
    expect(sporeScale(s) / r).toBeCloseTo(1 / 0.44, 12);
    // El nivel alcanzado se conserva aunque E(L) con la R nueva dé menos.
    expect(s.spores.level).toBe(120);
    expect(drain()).toEqual([{ type: 'vowRenounced', vow: 'noRain' }]);
    // Romper uno que no rige no hace nada; sembrar es la única forma de jurar.
    const before = structuredClone(s);
    renounceVow(s, { vow: 'noMutations' });
    renounceVow(s, { vow: 'noRain' });
    expect(s).toEqual(before);
  });

  it('cumplir el ciclo levanta los votos y escribe el récord con los mantenidos, no con los jurados', () => {
    const s = sownIn('natal', SOWN_AT, ['noRain', 'autoOnly', 'noMutations']);
    reachLevel(s, 200, NOW + 61 * HOUR);
    renounceVow(s, { vow: 'autoOnly' });
    reachLevel(s, 520, NOW + 62 * HOUR);
    expect(s.cycle).toEqual({ stays: 1, done: 1, vows: [], woken: [] });
    expect(s.records).toEqual([
      { biome: 'natal', vows: ['noRain', 'noMutations'], time: 2 * HOUR, runs: 2, at: NOW + 62 * HOUR },
    ]);
    expect(drain().find((e) => e.type === 'cycleDone')).toEqual({
      type: 'cycleDone',
      biome: 'natal',
      vows: ['noRain', 'noMutations'],
      time: 2 * HOUR,
      record: true,
    });
  });

  it('cada récord con un voto da su logro y uno con los tres, «Ayuno de hongo»; un voto roto no cuenta', () => {
    const s = sownIn('natal', SOWN_AT, ['noRain', 'autoOnly', 'noMutations']);
    renounceVow(s, { vow: 'autoOnly' });
    reachLevel(s, 520, NOW + 62 * HOUR);
    expect(s.achievements).toEqual(expect.arrayContaining(['vow.noRain', 'vow.noMutations']));
    expect(s.achievements).not.toContain('vow.autoOnly');
    expect(s.achievements).not.toContain('vow.all');
    disperse(s, { to: 'taiga', now: NOW + 63 * HOUR, vows: ['noRain', 'autoOnly', 'noMutations'] });
    reachLevel(s, 520, NOW + 66 * HOUR);
    expect(s.achievements).toEqual(expect.arrayContaining(['vow.autoOnly', 'vow.all']));
  });

  it('El regreso no lleva votos: con votos, volver a casa no hace nada', () => {
    const s = fourthColonized();
    const before = structuredClone(s);
    disperse(s, { to: 'natal', now: NOW + 41 * HOUR, vows: ['noRain'] });
    expect(s).toEqual(before);
  });
});

describe('«sin lluvia» (fase 10)', () => {
  it('una hora de ticks con el voto: ninguna gota y la semilla del azar sin tocar; roto, vuelve a llover', () => {
    const s = sownIn('taiga', SOWN_AT, ['noRain']);
    const seed = s.rngSeed;
    const awake = structuredClone(s);
    renounceVow(awake, { vow: 'noRain' });
    for (let i = 0; i < 3600; i += 1) {
      tick(s, { dt: 1 });
      tick(awake, { dt: 1 });
    }
    drain();
    expect(s.rain.drop).toBeNull();
    expect(s.rngSeed).toBe(seed);
    // Sin el voto, en una hora (la espera es de 4 a 10 min en la taiga) la lluvia sí consume azar.
    expect(awake.rngSeed).not.toBe(seed);
  });
});

describe('«solo autocompra» (fase 10)', () => {
  it('las compras del jugador se niegan; absorber y gastar esporas sigue permitido', () => {
    const s = sownIn('taiga', SOWN_AT, ['autoOnly']);
    s.nutrients = 1e9;
    s.owned.hypha = 10;
    const upgrade = availableUpgrades(s)[0];
    if (!upgrade) throw new Error('Falta una mejora disponible');
    buyGenerator(s, { id: 'hypha', amount: 1 });
    buyUpgrade(s, { id: upgrade.id });
    expect(s.owned.hypha).toBe(10);
    expect(s.upgrades).toEqual([]);
    expect(s.nutrients).toBe(1e9);
    click(s, {});
    expect(s.nutrients).toBeGreaterThan(1e9);
    const available = s.spores.available;
    buyAdaptation(s, { id: 'sclerotium' });
    expect(s.adaptations.sclerotium).toBe(1);
    expect(s.spores.available).toBeLessThan(available);
  });

  it('la autocompra compra generadores y mejoras con el umbral del jugador, sin Instinto ni interruptores', () => {
    // Con «sin mutaciones» también, Instinto e Instinto superior duermen: aun así la red compra.
    const s = sownIn('taiga', SOWN_AT, ['autoOnly', 'noMutations']);
    expect(hasMutation(s, 'instinct')).toBe(false);
    expect(Object.values(s.autobuy.generators).some(Boolean)).toBe(false);
    expect(s.autobuy.upgrades).toBe(false);
    expect(hasAutobuyGenerators(s)).toBe(true);
    expect(hasAutobuyUpgrades(s)).toBe(true);
    // Umbral 10 % de 1000 N: la Hifa (10 N) sí, el Rizomorfo (120 N) no.
    s.autobuy.threshold = 0.1;
    s.nutrients = 1000;
    runAutobuy(s);
    expect(s.owned.hypha).toBe(1);
    expect(s.owned.rhizomorph).toBe(0);
    // Umbral 50 %: el Rizomorfo también, y la mejora más barata en cuanto aparece.
    s.autobuy.threshold = 0.5;
    runAutobuy(s);
    expect(s.owned.rhizomorph).toBe(1);
    s.owned.hypha = 10;
    s.nutrients = 1e6;
    const cheapest = availableUpgrades(s)[0];
    if (!cheapest) throw new Error('Falta una mejora disponible');
    runAutobuy(s);
    expect(s.upgrades).toContain(cheapest.id);
  });

  it('con el voto la Poda no rige, aunque el modo guardado sea «lo que antes se amortiza» y haya una placa cartografiada', () => {
    const s = sownIn('taiga', SOWN_AT, ['autoOnly']);
    const plasmodium = createPlasmodium(1);
    Object.assign(plasmodium.plates[0] ?? {}, {
      map: { score: 3, quality: 0.8, cost: 1, tolerance: 1, alive: 9, joined: 4 },
    });
    s.partners.plasmodium = plasmodium;
    s.autobuy.mode = 'payback';
    expect(isPaybackActive(s)).toBe(false);
    renounceVow(s, { vow: 'autoOnly' });
    expect(isPaybackActive(s)).toBe(true);
  });
});

describe('«sin mutaciones»: dormidas y despiertas (fase 10)', () => {
  it('las compradas duermen: no rigen, pero siguen compradas, el árbol completo y las Adaptaciones abiertas', () => {
    const { asleep } = asleepAndAwake();
    for (const id of MUTATION_IDS) {
      expect(hasMutation(asleep, id), id).toBe(false);
      expect(ownsMutation(asleep, id), id).toBe(true);
      expect(isMutationAsleep(asleep, id), id).toBe(true);
    }
    expect(isTreeComplete(asleep)).toBe(true);
    expect(adaptationsUnlocked(asleep)).toBe(true);
    // El Acto I no se vuelve a cerrar ni se pierde: la Crónica sigue con sus seis entradas.
    expect(checkActOne(asleep)).toBe(false);
    expect(asleep.chronicle).toHaveLength(6);
  });

  it('una dormida no se puede volver a comprar', () => {
    const { asleep } = asleepAndAwake();
    const before = structuredClone(asleep);
    for (const id of MUTATION_IDS) {
      expect(isMutationAvailable(asleep, id), id).toBe(false);
      buyMutation(asleep, { id });
    }
    expect(asleep).toEqual(before);
  });

  it('despertar cuesta lo de siempre, pide sus requisitos despiertos y solo gasta las esporas de este ciclo', () => {
    const s = sownIn('natal', SOWN_AT, ['noMutations']);
    expect(wakeBudget(s)).toBe(0);
    wakeMutation(s, { id: 'soilMemory' });
    expect(s.cycle.woken).toEqual([]);
    reachLevel(s, 10, NOW + 61 * HOUR);
    const available = s.spores.available;
    // Quitina ligera pide Memoria del suelo despierta.
    wakeMutation(s, { id: 'lightChitin' });
    expect(s.cycle.woken).toEqual([]);
    wakeMutation(s, { id: 'soilMemory' });
    wakeMutation(s, { id: 'lightChitin' });
    wakeMutation(s, { id: 'deepAbsorption' });
    expect(s.cycle.woken).toEqual(['soilMemory', 'lightChitin', 'deepAbsorption']);
    expect(s.spores.available).toBe(available - 7);
    expect(wakeBudget(s)).toBe(3);
    expect(drain().filter((e) => e.type === 'mutationWoken')).toHaveLength(3);
    // Sueño invernal cuesta 5: hay esporas de sobra, pero el ciclo solo dio 10 y quedan 3.
    wakeMutation(s, { id: 'winterSleep' });
    expect(s.cycle.woken).not.toContain('winterSleep');
    reachLevel(s, 12, NOW + 62 * HOUR);
    wakeMutation(s, { id: 'winterSleep' });
    expect(s.cycle.woken).toContain('winterSleep');
    expect(hasMutation(s, 'winterSleep')).toBe(true);
    // Despertar una despierta no hace nada; sin el voto no hay nada que despertar.
    const before = structuredClone(s);
    wakeMutation(s, { id: 'soilMemory' });
    expect(s).toEqual(before);
    const free = sownIn('natal', SOWN_AT);
    reachLevel(free, 50, NOW + 61 * HOUR);
    const freeBefore = structuredClone(free);
    wakeMutation(free, { id: 'soilMemory' });
    expect(free).toEqual(freeBefore);
  });

  it('romper «sin mutaciones» las despierta todas', () => {
    const s = sownIn('natal', SOWN_AT, ['noRain', 'noMutations']);
    reachLevel(s, 10, NOW + 61 * HOUR);
    wakeMutation(s, { id: 'soilMemory' });
    renounceVow(s, { vow: 'noMutations' });
    expect(s.cycle).toEqual({ stays: 1, done: 0, vows: ['noRain'], woken: [] });
    for (const id of MUTATION_IDS) expect(hasMutation(s, id), id).toBe(true);
  });
});

/**
 * Los sitios que leen `hasMutation` (el efecto): cada uno, con la mutación dormida y con el voto roto.
 * Los que leen `ownsMutation` (comprada) están arriba: el árbol, el Acto I y la compra.
 */
describe('cada efecto de una mutación dormida (fase 10)', () => {
  it('Memoria del suelo y Herencia dormidas: la partida empieza sin sus nutrientes ni sus unidades', () => {
    const { asleep, awake } = asleepAndAwake();
    // Sembrar ya empezó la partida con el voto: sin regalos.
    expect(asleep.nutrients).toBe(0);
    expect(asleep.owned).toEqual(emptyOwned());
    awake.nutrients = 0;
    awake.owned = emptyOwned();
    applyRunStartBonuses(awake);
    expect(awake.nutrients).toBe(100);
    expect(awake.owned.hypha).toBe(20);
    expect(awake.owned.rhizomorph).toBe(10);
    expect(awake.owned.mushroom).toBe(10);
  });

  it('Más allá del bosque dormida: la Red planetaria no se desbloquea', () => {
    const { asleep, awake } = asleepAndAwake();
    expect(isGeneratorUnlocked(asleep, getGenerator('planetary'))).toBe(false);
    expect(isGeneratorUnlocked(awake, getGenerator('planetary'))).toBe(true);
  });

  it('Instinto e Instinto superior dormidos: sin autocompra', () => {
    const { asleep, awake } = asleepAndAwake();
    expect(hasAutobuyGenerators(asleep)).toBe(false);
    expect(hasAutobuyUpgrades(asleep)).toBe(false);
    expect(hasAutobuyGenerators(awake)).toBe(true);
    expect(hasAutobuyUpgrades(awake)).toBe(true);
    asleep.autobuy.generators.hypha = true;
    asleep.nutrients = 1000;
    runAutobuy(asleep);
    expect(asleep.owned.hypha).toBe(0);
  });

  it('Absorción profunda, Simbiosis antigua, Quitina ligera y Esporas aladas dormidas: sus multiplicadores no rigen', () => {
    const { asleep, awake } = asleepAndAwake();
    const a = derived(asleep);
    const b = derived(awake);
    expect(a.clickPercent).toBe(0);
    expect(b.clickPercent).toBe(0.03);
    expect(a.achievementBonus).toBe(0.01);
    expect(b.achievementBonus).toBe(0.02);
    expect(a.costDiscount).toBe(0);
    expect(b.costDiscount).toBe(0.1);
    expect(a.sporeK).toBe(15);
    expect(b.sporeK).toBe(18.75);
  });

  it('Sueño invernal dormido: sin conexión al 50 % y hasta 8 h', () => {
    const { asleep, awake } = asleepAndAwake();
    expect(offlineEfficiency(asleep)).toBe(0.5);
    expect(offlineCapSeconds(asleep)).toBe(8 * 3600);
    expect(offlineEfficiency(awake)).toBe(1);
    expect(offlineCapSeconds(awake)).toBe(24 * 3600);
  });

  it('Olfato de lluvia y Tormenta perfecta dormidos: la gota no llega antes y los efectos no duran más', () => {
    const { asleep, awake } = asleepAndAwake();
    // Misma semilla: el mismo sorteo, sin el ÷1,3 de Olfato de lluvia.
    expect(rollRainInterval(asleep) / rollRainInterval(awake)).toBeCloseTo(1.3, 12);
    expect(effectDuration(asleep, 12)).toBe(12);
    expect(effectDuration(awake, 12)).toBe(18);
  });
});

describe('los votos y los derivados (fase 10)', () => {
  it('sembrar, romper, despertar y cumplir recalculan los derivados', () => {
    const s = returnClosed();
    expect(derived(s).sporeK).toBe(18.75);
    disperse(s, { to: 'natal', now: SOWN_AT, vows: ['noMutations'] });
    expect(derived(s).sporeK).toBe(15);
    reachLevel(s, 100, NOW + 61 * HOUR);
    for (const id of ['soilMemory', 'deepAbsorption', 'ancientSymbiosis', 'wingedSpores'] as const) {
      wakeMutation(s, { id });
    }
    expect(derived(s).sporeK).toBe(18.75);
    renounceVow(s, { vow: 'noMutations' });
    expect(derived(s).costDiscount).toBe(0.1);
    // Otro ciclo con el voto, cumplido: al cumplir, todas despiertan.
    disperse(s, { to: 'natal', now: NOW + 62 * HOUR, vows: ['noMutations'] });
    expect(derived(s).costDiscount).toBe(0);
    primeLevel(s, 520);
    sporulate(s, { now: NOW + 64 * HOUR });
    expect(s.cycle.vows).toEqual([]);
    expect(derived(s).costDiscount).toBe(0.1);
  });

  it('sin acciones, los derivados son el mismo objeto tras 60 ticks en la tundra con votos', () => {
    const s = sownIn('tundra', SOWN_AT, ['noRain', 'noMutations']);
    s.owned.hypha = 30;
    s.owned.rhizomorph = 10;
    s.stats.idleClickTime = 0;
    invalidate(s);
    checkAchievements(s);
    const before = derived(s);
    for (let i = 0; i < 60; i += 1) tick(s, { dt: 1 });
    expect(derived(s)).toBe(before);
  });
});

describe('guardado de los votos (fase 10)', () => {
  /** En la pradera, ciclo 1, con «sin lluvia» y «sin mutaciones» y tres mutaciones despiertas. */
  function vowCycle(): GameState {
    const s = sownIn('prairie', SOWN_AT, ['noRain', 'noMutations']);
    reachLevel(s, 40, NOW + 61 * HOUR);
    for (const id of ['soilMemory', 'lightChitin', 'deepAbsorption'] as const) wakeMutation(s, { id });
    drain();
    return s;
  }

  /** Ciclo 2 en la taiga sin votos; el primero, en la pradera con «sin lluvia», cumplido con su récord. */
  function afterVowRecord(): GameState {
    const s = sownIn('prairie', SOWN_AT, ['noRain']);
    reachLevel(s, 520, NOW + 62 * HOUR);
    disperse(s, { to: 'taiga', now: NOW + 63 * HOUR });
    reachLevel(s, 200, NOW + 64 * HOUR);
    drain();
    return s;
  }

  it('un ciclo con votos y mutaciones despiertas, y un récord con votos, se guardan y vuelven idénticos', () => {
    for (const state of [vowCycle(), afterVowRecord()]) {
      expect(parseSave(textOf(state))).toEqual({
        ok: true,
        save: { version: SAVE_VERSION, savedAt: SAVED_AT, state },
        partnersReset: [],
      });
    }
  });

  it('votos solo en un ciclo empezado y sin cumplir', () => {
    expect(loadsAfter(returnClosed, (s) => (s.cycle.vows = ['noRain']))).toBe(false);
    expect(loadsAfter(fourthColonized, (s) => (s.cycle.vows = ['noRain']))).toBe(false);
    // Cumplido (nivel 500 o más), los votos ya se levantaron.
    expect(
      loadsAfter(vowCycle, (s) => {
        s.spores.level = 520;
      }),
    ).toBe(false);
    expect(
      loadsAfter(vowCycle, (s) => {
        s.spores.level = 499;
      }),
    ).toBe(true);
  });

  it('los votos son los que el bioma ofrece, sin repetir y en el orden de VOW_IDS', () => {
    expect(loadsAfter(vowCycle, (s) => (s.cycle.vows = ['noRain', 'autoOnly', 'noMutations']))).toBe(true);
    expect(loadsAfter(vowCycle, (s) => (s.cycle.vows = ['noMutations', 'noRain']))).toBe(false);
    expect(loadsAfter(vowCycle, (s) => (s.cycle.vows = ['noRain', 'noRain', 'noMutations']))).toBe(false);
    expect(
      loadsAfter(vowCycle, (s) => Object.assign(s.cycle, { vows: ['noRain', 'noSun', 'noMutations'] })),
    ).toBe(false);
    expect(loadsAfter(vowCycle, (s) => Object.assign(s.cycle, { vows: 'noRain' }))).toBe(false);
    // En el Chocó, «sin lluvia» no se ofrece.
    const choco = () => sownIn('choco', SOWN_AT, ['autoOnly']);
    expect(loadsAfter(choco, () => undefined)).toBe(true);
    expect(loadsAfter(choco, (s) => (s.cycle.vows = ['noRain', 'autoOnly']))).toBe(false);
  });

  it('mutaciones despiertas: con «sin mutaciones», compradas, con sus requisitos despiertos y sin pasar de las esporas del ciclo', () => {
    expect(loadsAfter(vowCycle, (s) => (s.cycle.vows = ['noRain']))).toBe(false);
    expect(loadsAfter(vowCycle, (s) => (s.cycle.woken = ['soilMemory', 'deepAbsorption']))).toBe(true);
    expect(loadsAfter(vowCycle, (s) => (s.cycle.woken = ['lightChitin']))).toBe(false);
    expect(loadsAfter(vowCycle, (s) => Object.assign(s.cycle, { woken: ['soilMemory', 'telepathy'] }))).toBe(
      false,
    );
    expect(
      loadsAfter(vowCycle, (s) => {
        s.mutations = s.mutations.filter((id) => id !== 'lightChitin');
      }),
    ).toBe(false);
    // 1 + 3 + 3 + 5 (Sueño invernal) = 12 esporas con el nivel en 11.
    expect(
      loadsAfter(vowCycle, (s) => {
        s.cycle.woken.push('winterSleep');
        s.spores.level = 11;
      }),
    ).toBe(false);
    expect(
      loadsAfter(vowCycle, (s) => {
        s.cycle.woken.push('winterSleep');
        s.spores.level = 12;
      }),
    ).toBe(true);
  });

  it('con «sin lluvia» una gota guardada se repara a null sin rechazar el guardado', () => {
    const s = vowCycle();
    s.rain.drop = { x: 0.5, y: 0.5, remaining: 6 };
    const result = parseSave(textOf(s));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.save.state.rain.drop).toBeNull();
    expect(result.save.state.cycle).toEqual(s.cycle);
  });

  it('los récords llevan votos que su bioma ofrece, y la clave (bioma, votos) es única', () => {
    const record = (mutate: (s: GameState) => void) => loadsAfter(afterVowRecord, mutate);
    expect(
      record((s) => {
        const r = s.records[0];
        if (r) s.records.push({ ...r, vows: ['noRain', 'autoOnly'] });
      }),
    ).toBe(true);
    expect(
      record((s) => {
        const r = s.records[0];
        if (r) s.records.push({ ...r, time: r.time + 1 });
      }),
    ).toBe(false);
    expect(
      record((s) => {
        const r = s.records[0];
        if (r) r.vows = ['noMutations', 'noRain'];
      }),
    ).toBe(false);
    expect(
      record((s) => {
        const r = s.records[0];
        if (r) Object.assign(r, { biome: 'choco' });
      }),
    ).toBe(false);
  });
});

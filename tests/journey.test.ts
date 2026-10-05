import { beforeEach, describe, expect, it } from 'vitest';
import {
  buyBiomeAdaptation,
  canSporulate,
  completesGoal,
  disperse,
  disperseBlock,
  nutrientsToNextSpore,
  sporeGain,
  sporulate,
} from '../src/core/actions.ts';
import { drain, type GameEvent } from '../src/core/events.ts';
import {
  autoClicksPerSecond,
  biomeAdaptationGate,
  colonizedCount,
  destinations,
  dispersalCount,
  forestGoal,
  isActOneClosed,
  isFreeStay,
  isReturnClosed,
  lineageFactor,
  nextBiomeAdaptationCost,
  sporeScale,
  sporulateRequirement,
  windTargets,
} from '../src/core/forest.ts';
import { DISPERSE_RESET, SPORULATE_RESET } from '../src/core/resets.ts';
import { computeDerived, derived, invalidate } from '../src/core/selectors.ts';
import { createState, emptyOwned, type GameState } from '../src/core/state.ts';
import { tick } from '../src/core/tick.ts';
import {
  BIOME_ADAPTATION_IDS,
  BIOME_ADAPTATIONS,
  BIOMES,
  DESTINATION_IDS,
  LEG_SCALE,
  getBiome,
  getBiomeAdaptation,
} from '../src/data/biomes.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { RAIN_EFFECTS } from '../src/data/rain.ts';
import { checkAchievements } from '../src/systems/achievements.ts';
import { checkActOne, checkColonization, checkReturn } from '../src/systems/journey.ts';
import { applyBackground, applyOffline, offlineCapSeconds } from '../src/systems/offline.ts';
import { dewAmount, effectDuration, rollRainInterval, updateRain } from '../src/systems/rain.ts';

/**
 * Viento de esporas en el núcleo (docs/ROADMAP.md, fase 8): Acto I, colonizar, dispersar,
 * adaptaciones de bioma y reglas de cada bioma. Los estados se construyen por el camino que el
 * juego permite (cerrar el Acto I y dispersar), con valores calculados a mano.
 */

const NOW = Date.UTC(2026, 9, 1);

beforeEach(() => {
  drain();
});

/** Natal con el Acto I cerrado: árbol completo, una Red planetaria y 2025 esporas disponibles. */
function actOneState(): GameState {
  const s = createState(21, NOW);
  s.mutations = [...MUTATION_IDS];
  s.achievements = ['own.planetary.1'];
  s.stats.sporulations = 9;
  s.stats.totalTime = 11_940;
  s.spores = { level: 1941, available: 2025 };
  checkActOne(s);
  drain();
  return s;
}

/**
 * Recién llegado a un bioma (primer destino), sin logros ni generadores de regalo para que los
 * N/s de cada prueba salgan limpios.
 */
function arrivedIn(to: 'taiga' | 'choco', now = NOW + 1000): GameState {
  const s = actOneState();
  disperse(s, { to, now });
  s.achievements = [];
  s.owned = emptyOwned();
  s.nutrients = 0;
  invalidate(s);
  drain();
  return s;
}

/** Coloniza el bioma actual por la vía del núcleo. */
function colonize(s: GameState, now = NOW + 5000): void {
  s.spores.level = Math.max(s.spores.level, 500);
  checkColonization(s, now);
  invalidate(s);
}

/**
 * Recién llegado a un bioma del segundo anillo como tercer destino, tras colonizar la taiga y el
 * Chocó por el camino del juego; limpio como `arrivedIn` (linaje ×4).
 */
function arrivedInRingTwo(to: 'prairie' | 'tundra', now = NOW + 20_000): GameState {
  const s = arrivedIn('taiga');
  colonize(s);
  disperse(s, { to: 'choco', now: NOW + 9000 });
  colonize(s, NOW + 15_000);
  disperse(s, { to, now });
  s.achievements = [];
  s.owned = emptyOwned();
  s.nutrients = 0;
  invalidate(s);
  drain();
  return s;
}

describe('consultas del viaje', () => {
  it('el requisito para esporular es 1e8 en el natal, 1e11 en la taiga y 2e11 en el Chocó como primer destino', () => {
    expect(sporulateRequirement(actOneState())).toBe(1e8);
    expect(sporulateRequirement(arrivedIn('taiga'))).toBe(1e11);
    expect(sporulateRequirement(arrivedIn('choco'))).toBe(2e11);
  });

  it('como segundo destino el requisito crece ×3,5: taiga 3,5e11 y Chocó 7e11', () => {
    const viaChoco = arrivedIn('choco');
    colonize(viaChoco);
    disperse(viaChoco, { to: 'taiga', now: NOW + 9000 });
    expect(sporulateRequirement(viaChoco)).toBe(3.5e11);

    const viaTaiga = arrivedIn('taiga');
    colonize(viaTaiga);
    disperse(viaTaiga, { to: 'choco', now: NOW + 9000 });
    expect(sporulateRequirement(viaTaiga)).toBe(7e11);
  });

  it('hay un factor de R por tramo del viaje, y los de los tramos 1 y 2 son los de la 1.3–1.5', () => {
    expect(LEG_SCALE).toHaveLength(DESTINATION_IDS.length + 1);
    expect(LEG_SCALE[1]).toBe(1);
    expect(LEG_SCALE[2]).toBe(3.5);
  });

  it('el linaje cuenta destinos colonizados: una entrada del natal en un tramo posterior no lo multiplica', () => {
    const s = arrivedIn('taiga');
    colonize(s);
    expect(colonizedCount(s)).toBe(1);
    expect(lineageFactor(s)).toBe(2);
    // Una entrada del natal fuera del tramo 0, como la de El regreso (fase 10): la consulta cuenta
    // destinos y la ignora. El camino del juego está en «El regreso», más abajo.
    s.chronicle.push({
      biome: 'natal',
      leg: 2,
      arrivedAt: NOW + 9000,
      colonizedAt: NOW + 20_000,
      sporulations: 4,
      playTime: 3600,
      leftAt: null,
      levelReached: null,
    });
    expect(colonizedCount(s)).toBe(1);
    expect(lineageFactor(s)).toBe(2);
  });

  it('los viajes cuentan cada dispersión: 0 en el natal, 1 y 2 tras dispersar dos veces', () => {
    const s = actOneState();
    expect(dispersalCount(s)).toBe(0);
    disperse(s, { to: 'taiga', now: NOW + 1000 });
    expect(dispersalCount(s)).toBe(1);
    colonize(s);
    disperse(s, { to: 'choco', now: NOW + 9000 });
    expect(dispersalCount(s)).toBe(2);
  });

  it('el bosque persigue el Acto I en el natal, colonizar hasta el nivel 500 en un destino y nada más al colonizarlo', () => {
    expect(forestGoal(actOneState())).toEqual({ kind: 'actOne', level: 1941 });
    const s = arrivedIn('taiga');
    s.spores.level = 312;
    expect(forestGoal(s)).toEqual({ kind: 'colonize', level: 312, goal: 500 });
    s.spores.level = 520;
    checkColonization(s, NOW + 5000);
    expect(forestGoal(s)).toEqual({ kind: 'colonized', level: 520 });
  });

  it('desde el natal quedan la taiga y el Chocó; desde la taiga, el Chocó; en el tramo 2, ninguno', () => {
    expect(destinations(actOneState())).toEqual(['taiga', 'choco']);
    const s = arrivedIn('taiga');
    expect(destinations(s)).toEqual(['choco']);
    colonize(s);
    disperse(s, { to: 'choco', now: NOW + 9000 });
    expect(destinations(s)).toEqual([]);
  });

  it('los textos escritos a mano siguen a los datos: la mitad, el doble, un tercio y un clic por rango', () => {
    // biome.taiga.rule.rain y biome.prairie.rule.rain dicen «llueve la mitad»,
    // biome.choco.rule.rain «el doble» y biome.tundra.rule.rain «un tercio».
    expect(getBiome('taiga').rainInterval).toBe(2);
    expect(getBiome('choco').rainInterval).toBe(0.5);
    expect(getBiome('prairie').rainInterval).toBe(2);
    expect(getBiome('tundra').rainInterval).toBe(3);
    // biome.tundra.rule.half dice «todo crece a la mitad»; ningún otro bioma cambia todos los
    // generadores a la vez.
    expect(BIOMES.filter((b) => b.productionFactor !== 1).map((b) => [b.id, b.productionFactor])).toEqual([
      ['tundra', 0.5],
    ]);
    // biome.choco.rule.storm dice «la mitad de veces».
    const stormNatal = RAIN_EFFECTS.find((e) => e.kind === 'storm')?.chance;
    const stormChoco = getBiome('choco').rainEffects?.find((e) => e.kind === 'storm')?.chance;
    expect(stormChoco).toBe((stormNatal ?? 0) / 2);
    // badapt.leafcutters y badapt.pilobolus dicen «un clic automático por segundo».
    for (const id of ['leafcutters', 'pilobolus'] as const) {
      const effect = getBiomeAdaptation(id).effect;
      expect(effect.kind === 'autoClicks' && effect.perRank, id).toBe(1);
    }
    // Solo la taiga y la pradera cambian la producción de un generador en concreto.
    expect(BIOMES.filter((b) => Object.keys(b.production).length > 0).map((b) => b.id)).toEqual([
      'taiga',
      'prairie',
    ]);
  });

  it('cada rango de una adaptación de bioma pide su nivel local, salvo que el bioma esté colonizado', () => {
    const s = arrivedIn('taiga');
    expect(biomeAdaptationGate(s, 'rockEating')).toBeNull();
    buyBiomeAdaptation(s, { id: 'rockEating' });
    s.spores.level = 74;
    expect(biomeAdaptationGate(s, 'rockEating')).toBe('level');
    s.spores.level = 75;
    expect(biomeAdaptationGate(s, 'rockEating')).toBeNull();
    // Del Chocó, sin haberlo visitado.
    expect(biomeAdaptationGate(s, 'gongylidia')).toBe('unvisited');
    // Con la taiga colonizada, en el Chocó y con nivel 0, se abren todos los rangos de la taiga.
    colonize(s);
    disperse(s, { to: 'choco', now: NOW + 9000 });
    expect(s.spores.level).toBe(0);
    expect(biomeAdaptationGate(s, 'rockEating')).toBeNull();
    s.biomeAdaptations.rockEating = 3;
    expect(biomeAdaptationGate(s, 'rockEating')).toBe('maxed');
  });
});

describe('esporas en un bioma', () => {
  it('las esporas por ganar miran los nutrientes del bosque, no los de toda la vida', () => {
    const s = arrivedIn('taiga');
    s.forest.earned = 4e11;
    s.lifetimeEarned = 1e15;
    // E = ⌊18,75 · √(4e11 / 1e11)⌋ = ⌊18,75 · 2⌋ = 37 (Esporas aladas: k = 18,75).
    expect(sporeGain(s)).toBe(37);
  });

  it('en la taiga como primer destino hacen falta 1e11 N ganados en la partida', () => {
    const s = arrivedIn('taiga');
    s.forest.earned = 4e11;
    s.runEarned = 9.99e10;
    expect(canSporulate(s)).toBe(false);
    s.runEarned = 1e11;
    expect(canSporulate(s)).toBe(true);
  });

  it('faltan 1e11 · (38 / 18,75)² − 4e11 N del bosque para la espora 38', () => {
    const s = arrivedIn('taiga');
    s.forest.earned = 4e11;
    expect(nutrientsToNextSpore(s)).toBeCloseTo(10_737_777_777.78, 1);
  });

  it('esporular en la taiga anota el bioma en el historial', () => {
    const s = arrivedIn('taiga');
    s.forest.earned = 4e11;
    s.runEarned = 1e11;
    sporulate(s, { now: NOW + 7000 });
    expect(s.history.at(-1)).toMatchObject({ spores: 37, biome: 'taiga' });
    expect(s.forest.biome).toBe('taiga');
  });

  it('Plántulas conectadas en rango 2 empieza cada partida con 6 Redes micorrícicas', () => {
    const s = arrivedIn('taiga');
    s.biomeAdaptations.seedlingNetwork = 2;
    s.forest.earned = 4e11;
    s.runEarned = 1e11;
    sporulate(s, { now: NOW + 7000 });
    expect(s.owned.mycorrhiza).toBe(6);
    // Con el árbol completo, además: Memoria del suelo (10 Hifas) y Herencia (10 de cada uno de
    // los cuatro primeros), y 100 N.
    expect(s.owned.hypha).toBe(20);
    expect(s.owned.mushroom).toBe(10);
    expect(s.nutrients).toBe(100);
  });
});

describe('adaptaciones de bioma', () => {
  it('se compran con esporas disponibles de un bioma visitado y no bajan el nivel', () => {
    const s = arrivedIn('taiga');
    s.spores = { level: 80, available: 1000 };
    buyBiomeAdaptation(s, { id: 'seedlingNetwork' });
    expect(s.biomeAdaptations.seedlingNetwork).toBe(1);
    expect(s.spores).toEqual({ level: 80, available: 850 });
    // El rango 2 cuesta 150 · 2 = 300 y pide nivel 75.
    expect(nextBiomeAdaptationCost(s, 'seedlingNetwork')).toBe(300);
    buyBiomeAdaptation(s, { id: 'seedlingNetwork' });
    expect(s.spores).toEqual({ level: 80, available: 550 });
    // Del Chocó, sin visitarlo: nada cambia.
    buyBiomeAdaptation(s, { id: 'gongylidia' });
    expect(s.biomeAdaptations.gongylidia).toBe(0);
    expect(s.spores.available).toBe(550);
  });

  it('sin esporas o con el rango cerrado por nivel no se compra', () => {
    const s = arrivedIn('taiga');
    s.spores = { level: 0, available: 99 };
    buyBiomeAdaptation(s, { id: 'rockEating' });
    expect(s.biomeAdaptations.rockEating).toBe(0);
    s.spores.available = 1000;
    buyBiomeAdaptation(s, { id: 'rockEating' });
    buyBiomeAdaptation(s, { id: 'rockEating' });
    // El rango 2 pide nivel 75 en la taiga.
    expect(s.biomeAdaptations.rockEating).toBe(1);
    expect(s.spores.available).toBe(900);
  });

  it('un id desconocido no hace nada', () => {
    const s = arrivedIn('taiga');
    const before = structuredClone(s);
    buyBiomeAdaptation(s, { id: 'wings' as 'rockEating' });
    expect(s).toEqual(before);
  });
});

describe('lluvia y producción por bioma', () => {
  it('en la taiga, con Olfato de lluvia, la espera entre gotas va de 184,62 a 461,54 s', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const s = arrivedIn('taiga');
      s.rngSeed = seed;
      const wait = rollRainInterval(s);
      expect(wait).toBeGreaterThanOrEqual((120 * 2) / 1.3);
      expect(wait).toBeLessThanOrEqual((300 * 2) / 1.3);
    }
  });

  it('en el Chocó, con Olfato de lluvia, la espera va de 46,15 a 115,38 s', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const s = arrivedIn('choco');
      s.rngSeed = seed;
      const wait = rollRainInterval(s);
      expect(wait).toBeGreaterThanOrEqual((120 * 0.5) / 1.3);
      expect(wait).toBeLessThanOrEqual((300 * 0.5) / 1.3);
    }
  });

  /** 11 Primordios y 1 Rizomorfo: 11 · 9 + 1 = 100 N/s sin multiplicadores. */
  function withHundredPerSecond(s: GameState): void {
    s.owned.primordium = 11;
    s.owned.rhizomorph = 1;
    invalidate(s);
  }

  it('el Rocío del Chocó da al menos 300 s de producción', () => {
    const s = arrivedIn('choco');
    withHundredPerSecond(s);
    expect(derived(s).production).toBe(100);
    // Con 1e6 N gana el Rocío normal: min(1,2e5, 7,2e4) = 7,2e4 > 3e4.
    s.nutrients = 1e6;
    expect(dewAmount(s)).toBe(7.2e4);
    // Con 1e5 N el normal da 1,2e4 y gana el mínimo: 300 · 100 = 3e4.
    s.nutrients = 1e5;
    expect(dewAmount(s)).toBe(3e4);
    // Estera de raíces en rango 2: × 2² = 1,2e5.
    s.biomeAdaptations.rootMat = 2;
    expect(dewAmount(s)).toBe(1.2e5);
  });

  it('en el natal el Rocío es el de siempre: 12 % de las reservas o 12 min de producción', () => {
    const s = actOneState();
    s.achievements = [];
    s.owned = emptyOwned();
    s.spores.level = 0;
    withHundredPerSecond(s);
    s.nutrients = 1e5;
    expect(dewAmount(s)).toBe(1.2e4);
  });

  it('con Tormenta perfecta y Trehalosa en rango 2 el Aguacero dura 60 · 1,5 + 20 = 110 s', () => {
    const s = arrivedIn('taiga');
    s.biomeAdaptations.trehalose = 2;
    expect(effectDuration(s, 60, 'downpour')).toBe(110);
    // La Tormenta no gana los segundos de la Trehalosa.
    expect(effectDuration(s, 12, 'storm')).toBe(18);
  });

  it('en el Chocó la gota que nadie atrapa cae sola, aplica su efecto y no cuenta como atrapada', () => {
    const s = arrivedIn('choco');
    withHundredPerSecond(s);
    s.nutrients = 1e5;
    s.rain = { nextIn: 0, drop: { x: 0.5, y: 0.5, remaining: 0.5 } };
    const drops = s.stats.drops;
    updateRain(s, 1);
    const events = drain();
    const fell = events.find((e): e is Extract<GameEvent, { type: 'rainFell' }> => e.type === 'rainFell');
    expect(fell).toBeDefined();
    expect(events.some((e) => e.type === 'rainExpired')).toBe(false);
    expect(s.stats.drops).toBe(drops);
    expect(s.rain.drop).toBeNull();
    expect(s.rain.nextIn).toBeGreaterThanOrEqual((120 * 0.5) / 1.3);
    expect(s.rain.nextIn).toBeLessThanOrEqual((300 * 0.5) / 1.3);
    // El efecto llegó: un Aguacero o una Tormenta activos, o el Rocío en los nutrientes.
    const landed = s.effects.length === 1 || s.nutrients > 1e5;
    expect(landed).toBe(true);
  });

  it('en el natal la gota que nadie atrapa se evapora sin efecto', () => {
    const s = actOneState();
    s.rain = { nextIn: 0, drop: { x: 0.5, y: 0.5, remaining: 0.5 } };
    const nutrients = s.nutrients;
    updateRain(s, 1);
    const events = drain();
    expect(events.map((e) => e.type)).toEqual(['rainExpired']);
    expect(s.effects).toEqual([]);
    expect(s.nutrients).toBe(nutrients);
  });

  it('en la taiga 10 Redes micorrícicas rinden ×5 (90 000 N/s) y 1 Primordio, lo de siempre', () => {
    const s = arrivedIn('taiga');
    s.owned.mycorrhiza = 10;
    s.owned.primordium = 1;
    invalidate(s);
    expect(derived(s).generatorProduction.mycorrhiza).toBe(90_000);
    expect(derived(s).generatorProduction.primordium).toBe(9);
  });

  it('el natal no cambia ninguna producción', () => {
    const s = actOneState();
    s.achievements = [];
    s.owned = emptyOwned();
    s.spores.level = 0;
    s.owned.mycorrhiza = 10;
    invalidate(s);
    expect(derived(s).generatorProduction.mycorrhiza).toBe(18_000);
    expect(derived(s).biomeFactor.mycorrhiza).toBe(1);
    expect(derived(s).lineage).toBe(1);
  });

  it('con la taiga colonizada, en el Chocó, Hongos que comen roca en rango 2 y el linaje dan 56 250 N/s', () => {
    const s = arrivedIn('taiga');
    colonize(s);
    disperse(s, { to: 'choco', now: NOW + 9000 });
    s.achievements = [];
    s.biomeAdaptations.rockEating = 2;
    s.owned.mycorrhiza = 10;
    s.owned.hypha = 10;
    invalidate(s);
    // 1800 · 10 · 1,25² · 2 (linaje) = 56 250; 10 Hifas · 0,1 · 2 = 2.
    expect(derived(s).generatorProduction.mycorrhiza).toBe(56_250);
    expect(derived(s).generatorProduction.hypha).toBe(2);
  });

  it('las Hormigas cortadoras suman clics automáticos a la producción sin realimentar el clic', () => {
    const s = arrivedIn('choco');
    s.biomeAdaptations.leafcutters = 2;
    s.owned.hypha = 10;
    invalidate(s);
    // P_gen = 1; V₀ = 1 + 0,03 · 1 = 1,03 (Absorción profunda); P = 1 + 2 · 1,03 = 3,06.
    expect(derived(s).production).toBeCloseTo(3.06, 12);
    expect(derived(s).clickValue).toBeCloseTo(1.03, 12);
    expect(derived(s).workerProduction).toBeCloseTo(2.06, 12);
  });

  it('el suelo lineal de la 1.x no sube el umbral fuera del natal', () => {
    const s = arrivedIn('taiga');
    s.sporeFloor = 4037;
    invalidate(s);
    expect(derived(s).sporeThreshold).toBe(1000);
  });

  it('una hora offline en la taiga cobra con los factores del bioma y suma a los nutrientes del bosque', () => {
    const s = arrivedIn('taiga');
    s.owned.mycorrhiza = 10;
    invalidate(s);
    const earned = s.forest.earned;
    // Sueño invernal (árbol completo): eficiencia 1. 90 000 N/s · 3600 s = 3,24e8.
    const report = applyOffline(s, NOW + 10_000, NOW + 10_000 + 3_600_000);
    expect(report.gained).toBe(3.24e8);
    expect(s.forest.earned - earned).toBe(3.24e8);
  });

  it('la caché queda al día tras dispersar, comprar una adaptación de bioma y colonizar', () => {
    const s = actOneState();
    s.owned.mycorrhiza = 10;
    expect(derived(s).production).toBeGreaterThan(0);
    disperse(s, { to: 'taiga', now: NOW + 1000 });
    expect(derived(s)).toEqual(computeDerived(s));
    // Una sola Red micorrícica (9000 N/s en la taiga) y sus logros ya otorgados: comprar no
    // otorga ningún logro nuevo, así que nada más invalida la caché por casualidad.
    s.owned = emptyOwned();
    s.owned.mycorrhiza = 1;
    invalidate(s);
    checkAchievements(s);
    derived(s);
    buyBiomeAdaptation(s, { id: 'rockEating' });
    expect(s.achievements).not.toContain('production.3');
    expect(s.biomeAdaptations.rockEating).toBe(1);
    expect(derived(s)).toEqual(computeDerived(s));
    // Colonizar por la vía real (esporular) cambia el linaje: la caché no puede quedar vieja.
    const fresh = arrivedIn('choco');
    fresh.spores.level = 499;
    fresh.forest.earned = 1e16;
    fresh.lifetimeEarned = 1e17;
    fresh.runEarned = 2e11;
    fresh.owned.hypha = 10;
    invalidate(fresh);
    const before = derived(fresh).lineage;
    sporulate(fresh, { now: NOW + 8000 });
    expect(before).toBe(1);
    expect(derived(fresh)).toEqual(computeDerived(fresh));
    expect(derived(fresh).lineage).toBe(2);
  });
});

describe('Acto I', () => {
  function readyForActOne(): GameState {
    const s = createState(31, NOW);
    s.mutations = [...MUTATION_IDS];
    s.achievements = ['own.planetary.1'];
    s.stats.sporulations = 9;
    s.stats.totalTime = 11_940;
    return s;
  }

  it('con el árbol completo y una Red planetaria, el primer segundo de juego lo cierra', () => {
    const s = readyForActOne();
    tick(s, { dt: 1 });
    expect(s.chronicle).toEqual([
      {
        biome: 'natal',
        leg: 0,
        arrivedAt: NOW,
        colonizedAt: null,
        sporulations: 9,
        playTime: 11_941,
        leftAt: null,
        levelReached: null,
      },
    ]);
    expect(drain().some((e) => e.type === 'actOneClosed')).toBe(true);
  });

  it('con 11 mutaciones o sin haber tenido una Red planetaria no se cierra', () => {
    const missing = readyForActOne();
    missing.mutations = missing.mutations.filter((m) => m !== 'inheritance');
    tick(missing, { dt: 1 });
    expect(isActOneClosed(missing)).toBe(false);
    const noPlanetary = readyForActOne();
    noPlanetary.achievements = [];
    tick(noPlanetary, { dt: 1 });
    expect(isActOneClosed(noPlanetary)).toBe(false);
  });

  it('comprobarlo dos veces no duplica la entrada', () => {
    const s = readyForActOne();
    expect(checkActOne(s)).toBe(true);
    expect(checkActOne(s)).toBe(false);
    expect(s.chronicle).toHaveLength(1);
  });

  it('una partida 1.x que vuelve de offline lo cierra al aplicar el tiempo', () => {
    const s = readyForActOne();
    applyOffline(s, NOW, NOW + 600_000);
    expect(isActOneClosed(s)).toBe(true);
  });

  it('el nivel 500 en el natal no coloniza nada', () => {
    const s = actOneState();
    s.spores.level = 600;
    expect(checkColonization(s, NOW)).toBe(false);
    expect(s.chronicle).toHaveLength(1);
  });
});

describe('colonizar', () => {
  /** En la taiga con 9 esporulaciones y 12 000 s a la llegada, nivel 290 y 14 partidas hechas. */
  function nearColony(earned: number): GameState {
    const s = arrivedIn('taiga');
    s.forest.arrivalSporulations = 9;
    s.forest.arrivalPlayTime = 12_000;
    s.stats.sporulations = 14;
    s.stats.totalTime = 20_000;
    s.spores = { level: 290, available: 50 };
    s.forest.earned = earned;
    s.lifetimeEarned = 1e15;
    s.runEarned = 1e11;
    return s;
  }

  it('la esporulación que lleva el nivel local a 525 coloniza la taiga', () => {
    const s = nearColony(7.84e13);
    // E = ⌊18,75 · √(7,84e13 / 1e11)⌋ = 18,75 · 28 = 525.
    sporulate(s, { now: NOW + 30_000 });
    expect(s.spores.level).toBe(525);
    expect(s.chronicle[1]).toEqual({
      biome: 'taiga',
      leg: 1,
      arrivedAt: NOW + 1000,
      colonizedAt: NOW + 30_000,
      sporulations: 6,
      playTime: 8000,
      leftAt: null,
      levelReached: null,
    });
    expect(s.achievements).toContain('colonize.taiga');
    const types = drain().map((e) => e.type);
    expect(types.indexOf('colonized')).toBeLessThan(types.indexOf('sporulate'));
  });

  it('con 7e13 N del bosque el nivel queda en 496 y no coloniza', () => {
    const s = nearColony(7e13);
    sporulate(s, { now: NOW + 30_000 });
    expect(s.spores.level).toBe(496);
    expect(s.chronicle).toHaveLength(1);
  });
});

describe('dispersar', () => {
  it('no se puede antes del Acto I, sin 300 esporas o sin colonizar; tras el cuarto bioma, el viento lleva de vuelta', () => {
    const early = createState(41, NOW);
    early.spores.available = 5000;
    expect(disperseBlock(early)).toBe('actOne');

    const poor = actOneState();
    poor.spores.available = 299;
    expect(disperseBlock(poor)).toBe('spores');

    const taiga = arrivedIn('taiga');
    expect(disperseBlock(taiga)).toBe('colonize');

    // Hasta el cuarto bioma siempre queda adónde ir; en él, falta colonizarlo, y luego el viento
    // sopla hacia casa (El regreso, fase 10).
    colonize(taiga);
    disperse(taiga, { to: 'choco', now: NOW + 9000 });
    colonize(taiga, NOW + 10_000);
    disperse(taiga, { to: 'prairie', now: NOW + 11_000 });
    colonize(taiga, NOW + 12_000);
    disperse(taiga, { to: 'tundra', now: NOW + 13_000 });
    expect(taiga.forest).toMatchObject({ biome: 'tundra', leg: 4 });
    expect(disperseBlock(taiga)).toBe('colonize');
    colonize(taiga, NOW + 14_000);
    expect(disperseBlock(taiga)).toBeNull();
  });

  it('no viaja al natal, al bosque actual, a uno visitado, a un id desconocido ni con una fecha imposible', () => {
    const s = arrivedIn('taiga');
    colonize(s);
    const before = structuredClone(s);
    for (const to of ['natal', 'taiga', 'luna']) {
      disperse(s, { to: to as 'choco', now: NOW + 9000 });
    }
    disperse(s, { to: 'choco', now: Number.NaN });
    disperse(s, { to: 'choco', now: -1 });
    expect(s).toEqual(before);
  });

  it('dispersar a la taiga sin esporular: nivel 0, 300 esporas menos y lo demás viaja', () => {
    const s = actOneState();
    s.adaptations.apicalBody = 2;
    s.sporeFloor = 4037;
    s.history = [{ sporulation: 9, duration: 600, spores: 900, endedAt: NOW - 1, biome: 'natal' }];
    s.stats.totalTime = 12_000;
    // Faltaban 5 s para la gota del natal: al llegar se sortea la espera de la taiga.
    s.rain.nextIn = 5;
    disperse(s, { to: 'taiga', now: NOW + 1000 });
    expect(s.spores).toEqual({ level: 0, available: 1725 });
    expect(s.forest).toEqual({
      biome: 'taiga',
      leg: 1,
      earned: 0,
      arrivedAt: NOW + 1000,
      arrivalSporulations: 9,
      arrivalPlayTime: 12_000,
    });
    expect(s.chronicle[0]).toMatchObject({ leftAt: NOW + 1000, levelReached: 1941 });
    expect(s.mutations).toEqual([...MUTATION_IDS]);
    expect(s.adaptations.apicalBody).toBe(2);
    expect(s.sporeFloor).toBe(4037);
    expect(s.history).toHaveLength(1);
    expect(s.achievements).toEqual(expect.arrayContaining(['own.planetary.1', 'disperse.1']));
    // La lluvia ya es la de la taiga: entre 184,62 y 461,54 s con Olfato de lluvia.
    expect(s.rain.drop).toBeNull();
    expect(s.rain.nextIn).toBeGreaterThanOrEqual((120 * 2) / 1.3);
    expect(s.rain.nextIn).toBeLessThanOrEqual((300 * 2) / 1.3);
  });

  it('si la partida puede esporular, termina esporulando y esas esporas pagan el viaje', () => {
    const s = actOneState();
    // E = ⌊18,75 · √(4,5e11 / 1e8)⌋ = 1257; con nivel 1007, gana 250.
    s.spores = { level: 1007, available: 100 };
    s.forest.earned = 4.5e11;
    s.lifetimeEarned = 4.5e11;
    s.runEarned = 2e8;
    s.stats.runTime = 1500;
    drain();
    disperse(s, { to: 'choco', now: NOW + 2000 });
    expect(s.spores).toEqual({ level: 0, available: 50 });
    expect(s.history.at(-1)).toEqual({
      sporulation: 10,
      duration: 1500,
      spores: 250,
      endedAt: NOW + 2000,
      biome: 'natal',
    });
    expect(s.chronicle[0]).toMatchObject({ levelReached: 1257 });
    const events = drain();
    expect(events.find((e) => e.type === 'disperse')).toEqual({
      type: 'disperse',
      from: 'natal',
      to: 'choco',
      leg: 1,
      gained: 250,
    });
    expect(events.some((e) => e.type === 'sporulate')).toBe(false);
  });
});

describe('tablas de reinicio', () => {
  it('cada clave del estado está clasificada para esporular y para dispersar', () => {
    const keys = Object.keys(createState(1, NOW)).sort();
    expect(Object.keys(SPORULATE_RESET).sort()).toEqual(keys);
    expect(Object.keys(DISPERSE_RESET).sort()).toEqual(keys);
  });

  it('dispersar deja cada campo «run» como en una partida nueva más los bonos de inicio', () => {
    const s = actOneState();
    s.nutrients = 5e9;
    s.runEarned = 7e9;
    s.owned.planetary = 2;
    s.upgrades = ['hypha.u1'];
    s.effects = [{ kind: 'downpour', remaining: 20, duration: 60 }];
    disperse(s, { to: 'taiga', now: NOW + 1000 });
    // Memoria del suelo: 100 N y 10 Hifas; Herencia: 10 de los cuatro primeros generadores.
    expect(s.nutrients).toBe(100);
    expect(s.runEarned).toBe(0);
    expect(s.owned).toEqual({
      hypha: 20,
      rhizomorph: 10,
      primordium: 10,
      mushroom: 10,
      fairyRing: 0,
      mycorrhiza: 0,
      motherTree: 0,
      ancientForest: 0,
      malheur: 0,
      planetary: 0,
    });
    expect(s.upgrades).toEqual([]);
    expect(s.effects).toEqual([]);
    expect(s.stats.runTime).toBe(0);
    expect(s.stats.runStartedAt).toBe(NOW + 1000);
  });

  it('dispersar conserva tal cual cada campo «life»', () => {
    const s = actOneState();
    s.seen = ['tab.generators'];
    s.settings.volume = 0.8;
    s.autobuy.generators.hypha = true;
    const before = structuredClone(s);
    disperse(s, { to: 'taiga', now: NOW + 1000 });
    for (const key of Object.keys(DISPERSE_RESET) as (keyof GameState)[]) {
      // La semilla del azar avanza al sortear la lluvia del destino, como al esporular con gota.
      if (DISPERSE_RESET[key] !== 'life' || key === 'rngSeed') continue;
      if (key === 'achievements') expect(s.achievements).toEqual(expect.arrayContaining(before.achievements));
      else expect(s[key], key).toEqual(before[key]);
    }
  });

  it('esporular en la taiga no cambia de bosque', () => {
    const s = arrivedIn('taiga');
    s.forest.earned = 4e11;
    s.runEarned = 1e11;
    const forest = { ...s.forest };
    sporulate(s, { now: NOW + 7000 });
    expect(s.forest).toEqual({ ...forest, earned: forest.earned });
  });
});

describe('el segundo anillo: la pradera y la tundra (fase 10)', () => {
  it('no se ofrecen hasta colonizar la taiga y el Chocó, y luego en cualquier orden', () => {
    const s = arrivedIn('taiga');
    colonize(s);
    expect(destinations(s)).toEqual(['choco']);
    const before = structuredClone(s);
    disperse(s, { to: 'prairie', now: NOW + 9000 });
    disperse(s, { to: 'tundra', now: NOW + 9000 });
    expect(s).toEqual(before);
    disperse(s, { to: 'choco', now: NOW + 9000 });
    expect(destinations(s)).toEqual([]);
    // En el Chocó sin colonizar no falta un destino: falta colonizarlo para abrir el anillo.
    expect(disperseBlock(s)).toBe('colonize');
    colonize(s, NOW + 15_000);
    expect(destinations(s)).toEqual(['prairie', 'tundra']);
    expect(disperseBlock(s)).toBeNull();
    disperse(s, { to: 'tundra', now: NOW + 20_000 });
    expect(s.forest).toMatchObject({ biome: 'tundra', leg: 3 });
    expect(destinations(s)).toEqual(['prairie']);
  });

  it('la R de los tramos 3 y 4: pradera 9,9225e11 y 4,96125e12; tundra 4,2875e10 y 2,14375e11', () => {
    // 8,1e10 · 12,25 y 8,1e10 · 61,25; 3,5e9 · 12,25 y 3,5e9 · 61,25 (×3,5 y luego ×5).
    expect(LEG_SCALE).toEqual([1, 1, 3.5, 12.25, 61.25]);
    const prairie = arrivedInRingTwo('prairie');
    expect(sporulateRequirement(prairie)).toBe(9.9225e11);
    expect(sporeScale(prairie)).toBe(9.9225e11);
    colonize(prairie, NOW + 30_000);
    disperse(prairie, { to: 'tundra', now: NOW + 40_000 });
    expect(sporulateRequirement(prairie)).toBe(2.14375e11);
    const tundra = arrivedInRingTwo('tundra');
    expect(sporulateRequirement(tundra)).toBe(4.2875e10);
    colonize(tundra, NOW + 30_000);
    disperse(tundra, { to: 'prairie', now: NOW + 40_000 });
    expect(sporeScale(tundra)).toBe(4.96125e12);
  });

  it('en la pradera 10 Anillos de hadas rinden 320 · 10 · 6 · 4 (linaje) = 76 800 N/s', () => {
    const s = arrivedInRingTwo('prairie');
    s.owned.fairyRing = 10;
    s.owned.mycorrhiza = 1;
    invalidate(s);
    expect(derived(s).lineage).toBe(4);
    expect(derived(s).generatorProduction.fairyRing).toBe(76_800);
    // Los demás, sin el factor del bioma: 1800 · 4.
    expect(derived(s).generatorProduction.mycorrhiza).toBe(7200);
  });

  it('en la tundra todo rinde la mitad: 10 Redes micorrícicas, 1800 · 10 · 0,5 · 4 = 36 000 N/s', () => {
    const s = arrivedInRingTwo('tundra');
    s.owned.mycorrhiza = 10;
    s.owned.hypha = 10;
    invalidate(s);
    expect(derived(s).biomeFactor.mycorrhiza).toBe(0.5);
    expect(derived(s).generatorProduction.mycorrhiza).toBe(36_000);
    // 10 Hifas · 0,1 · 0,5 · 4 = 2.
    expect(derived(s).generatorProduction.hypha).toBe(2);
  });

  it('en la tundra el tope sin conexión suma 24 h: 48 h con Sueño invernal y 72 h con Letargo profundo 4', () => {
    const s = arrivedInRingTwo('tundra');
    expect(offlineCapSeconds(s)).toBe(48 * 3600);
    s.adaptations.deepTorpor = 4;
    expect(offlineCapSeconds(s)).toBe(72 * 3600);
    // En la pradera, el de siempre.
    expect(offlineCapSeconds(arrivedInRingTwo('prairie'))).toBe(24 * 3600);
  });

  it('8 h fuera de la tundra cobran 8 h de su producción, sin clics ni lluvia', () => {
    const s = arrivedInRingTwo('tundra');
    s.owned.mycorrhiza = 10;
    invalidate(s);
    const nutrients = s.nutrients;
    const report = applyOffline(s, NOW + 30_000, NOW + 30_000 + 8 * 3_600_000);
    // Sueño invernal: eficiencia 1. 36 000 N/s · 28 800 s.
    expect(report.effective).toBe(28_800);
    expect(report.gained).toBe(1.0368e9);
    expect(s.nutrients - nutrients).toBe(1.0368e9);
  });

  it('en la tundra, con Olfato de lluvia, la espera entre gotas va de 276,92 a 692,31 s', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const s = arrivedInRingTwo('tundra');
      s.rngSeed = seed;
      const wait = rollRainInterval(s);
      expect(wait).toBeGreaterThanOrEqual((120 * 3) / 1.3);
      expect(wait).toBeLessThanOrEqual((300 * 3) / 1.3);
    }
  });

  it('colonizar la pradera y la tundra otorga sus logros, y el linaje llega a ×16', () => {
    const s = arrivedInRingTwo('prairie');
    colonize(s, NOW + 30_000);
    checkAchievements(s);
    expect(s.achievements).toContain('colonize.prairie');
    disperse(s, { to: 'tundra', now: NOW + 40_000 });
    colonize(s, NOW + 50_000);
    checkAchievements(s);
    expect(s.achievements).toContain('colonize.tundra');
    expect(colonizedCount(s)).toBe(4);
    expect(lineageFactor(s)).toBe(16);
  });

  it('cada destino tiene sus tres adaptaciones, y cada id del guardado su definición', () => {
    // La interfaz (un grupo por destino en Mutaciones, «n de 3» en la Crónica) y «Aclimatación»
    // cuentan con ello: un destino sin adaptaciones daría el logro en vacío.
    for (const biome of DESTINATION_IDS) {
      expect(BIOME_ADAPTATIONS.filter((a) => a.biome === biome).length, biome).toBe(3);
    }
    expect(BIOME_ADAPTATIONS.map((a) => a.id)).toEqual([...BIOME_ADAPTATION_IDS]);
  });

  it('«Aclimatación» no se da en vacío: una partida nueva no la cumple y las tres de la taiga al máximo sí', () => {
    const fresh = createState(61, NOW);
    checkAchievements(fresh);
    expect(fresh.achievements).not.toContain('adapt.biomeFull');
    // Las tres de la taiga al máximo sí lo cumplen.
    const s = arrivedIn('taiga');
    s.biomeAdaptations.rockEating = 3;
    s.biomeAdaptations.seedlingNetwork = 3;
    s.biomeAdaptations.trehalose = 2;
    checkAchievements(s);
    expect(s.achievements).toContain('adapt.biomeFull');
  });
});

describe('adaptaciones de la pradera y la tundra (fase 10)', () => {
  it('Frente del anillo en rango 2 y Glomalina en rango 1: Anillos 320 · 10 · 6 · 2,25 · 4 y Red 1800 · 1,25 · 4', () => {
    const s = arrivedInRingTwo('prairie');
    s.owned.fairyRing = 10;
    s.owned.mycorrhiza = 1;
    s.biomeAdaptations.ringFront = 2;
    s.biomeAdaptations.glomalin = 1;
    invalidate(s);
    expect(derived(s).generatorProduction.fairyRing).toBe(172_800);
    expect(derived(s).generatorProduction.mycorrhiza).toBe(9000);
  });

  it('Pilobolus en rango 2 suma dos clics automáticos a los de las Hormigas cortadoras', () => {
    const s = arrivedInRingTwo('prairie');
    s.biomeAdaptations.leafcutters = 1;
    s.biomeAdaptations.pilobolus = 2;
    s.owned.hypha = 10;
    invalidate(s);
    expect(autoClicksPerSecond(s)).toBe(3);
    expect(derived(s).workerProduction).toBeCloseTo(3 * derived(s).clickValue, 12);
  });

  it('Abedul enano en rango 1, en la tundra: Red 1800 · 10 · 0,5 · 1,25 · 4 y Bosque milenario 65 000 · 0,5 · 1,25 · 4', () => {
    const s = arrivedInRingTwo('tundra');
    s.owned.mycorrhiza = 10;
    s.owned.ancientForest = 1;
    s.biomeAdaptations.dwarfBirch = 1;
    invalidate(s);
    expect(derived(s).generatorProduction.mycorrhiza).toBe(45_000);
    expect(derived(s).generatorProduction.ancientForest).toBe(162_500);
  });

  it('Moho de nieve en rango 3 empieza cada partida con 6 Árboles madre', () => {
    const s = arrivedInRingTwo('tundra');
    s.biomeAdaptations.snowMold = 3;
    s.forest.earned = 4e11;
    s.runEarned = 1e11;
    sporulate(s, { now: NOW + 30_000 });
    expect(s.owned.motherTree).toBe(6);
  });

  it('el Liquen suma 12 h de tope por rango en todos los biomas: 72 h en la tundra y 48 h en la pradera con el rango 2', () => {
    const tundra = arrivedInRingTwo('tundra');
    tundra.biomeAdaptations.lichen = 2;
    // Sueño invernal 24 h + tundra 24 h + Liquen 24 h; con Letargo profundo 4, 24 h más.
    expect(offlineCapSeconds(tundra)).toBe(72 * 3600);
    tundra.adaptations.deepTorpor = 4;
    expect(offlineCapSeconds(tundra)).toBe(96 * 3600);
    const prairie = arrivedInRingTwo('prairie');
    prairie.biomeAdaptations.lichen = 2;
    expect(offlineCapSeconds(prairie)).toBe(48 * 3600);
  });
});

describe('el deshielo de la tundra (fase 10)', () => {
  /** En la tundra con 10 Redes micorrícicas: 36 000 N/s, sin clics ni lluvia. */
  function tundraWithNetworks(): GameState {
    const s = arrivedInRingTwo('tundra');
    s.owned.mycorrhiza = 10;
    invalidate(s);
    expect(derived(s).production).toBe(36_000);
    return s;
  }

  it('24 h fuera de la tundra cobran 40 h de su producción: lo que pasa de 8 h rinde sin el ×0,5', () => {
    const s = tundraWithNetworks();
    const nutrients = s.nutrients;
    const report = applyOffline(s, NOW + 30_000, NOW + 30_000 + 24 * 3_600_000);
    expect(report.effective).toBe(86_400);
    expect(report.thawed).toBe(16 * 3600);
    // 36 000 N/s · 40 h · 3600 s.
    expect(report.gained).toBe(5.184e9);
    expect(s.nutrients - nutrients).toBe(5.184e9);
  });

  it('4 h fuera de la tundra cobran 4 h, lo mismo que mirar', () => {
    const s = tundraWithNetworks();
    const report = applyOffline(s, NOW + 30_000, NOW + 30_000 + 4 * 3_600_000);
    expect(report.thawed).toBe(0);
    expect(report.gained).toBe(36_000 * 14_400);
  });

  it('60 h fuera se recortan al tope de 48 h antes de deshelar: 48 + 40 = 88 h de producción', () => {
    const s = tundraWithNetworks();
    const report = applyOffline(s, NOW + 30_000, NOW + 30_000 + 60 * 3_600_000);
    expect(report.capped).toBe(true);
    expect(report.thawed).toBe(40 * 3600);
    expect(report.gained).toBe(36_000 * 88 * 3600);
  });

  it('en segundo plano, igual que cerrado: 24 h dan 40 h de producción y cuentan 24 h de juego', () => {
    const s = tundraWithNetworks();
    const runTime = s.stats.runTime;
    expect(applyBackground(s, 24 * 3600)).toBe(5.184e9);
    expect(s.stats.runTime - runTime).toBe(86_400);
  });

  it('fuera de la tundra no hay deshielo: 24 h en la pradera cobran 24 h', () => {
    const s = arrivedInRingTwo('prairie');
    s.owned.mycorrhiza = 10;
    invalidate(s);
    // 1800 · 10 · 4 (linaje) = 72 000 N/s.
    const report = applyOffline(s, NOW + 30_000, NOW + 30_000 + 24 * 3_600_000);
    expect(report.thawed).toBe(0);
    expect(report.gained).toBe(72_000 * 86_400);
  });
});

describe('El regreso (fase 10)', () => {
  /** En la tundra, cuarto destino, recién colonizada por el camino del juego (linaje ×16). */
  function fourthColonized(): GameState {
    const s = arrivedInRingTwo('prairie');
    colonize(s, NOW + 30_000);
    disperse(s, { to: 'tundra', now: NOW + 40_000 });
    colonize(s, NOW + 50_000);
    drain();
    return s;
  }

  /** De vuelta en el natal, El regreso en curso, por el camino del juego. */
  function inReturn(now = NOW + 60_000): GameState {
    const s = fourthColonized();
    disperse(s, { to: 'natal', now });
    drain();
    return s;
  }

  /**
   * Partida lista para que esporular lleve el nivel local de 0 a 525 en El regreso:
   * E = ⌊18,75 · √(3,7632e16 / 4,8e13)⌋ = ⌊18,75 · 28⌋ = 525 (Esporas aladas: k = 18,75), con el
   * requisito de 6 · 4,8e13 = 2,88e14 N ganados en la partida.
   */
  function readyToClose(s: GameState): void {
    s.forest.earned = 3.7632e16;
    s.lifetimeEarned = 1e17;
    s.runEarned = 2.88e14;
  }

  it('el viento solo ofrece El regreso con el cuarto bioma colonizado, y antes pide colonizarlo', () => {
    const s = arrivedInRingTwo('prairie');
    colonize(s, NOW + 30_000);
    expect(windTargets(s)).toEqual([{ biome: 'tundra', kind: 'journey' }]);
    disperse(s, { to: 'tundra', now: NOW + 40_000 });
    expect(windTargets(s)).toEqual([]);
    expect(disperseBlock(s)).toBe('colonize');
    const before = structuredClone(s);
    disperse(s, { to: 'natal', now: NOW + 45_000 });
    expect(s).toEqual(before);
    colonize(s, NOW + 50_000);
    expect(windTargets(s)).toEqual([{ biome: 'natal', kind: 'return' }]);
    expect(disperseBlock(s)).toBeNull();
  });

  it('volver cuesta 300 esporas, deja el natal en el tramo 5 y cierra la entrada del cuarto bioma', () => {
    const s = fourthColonized();
    const available = s.spores.available;
    s.spores.level = 640;
    disperse(s, { to: 'natal', now: NOW + 60_000 });
    expect(s.forest).toMatchObject({ biome: 'natal', leg: 5, earned: 0, arrivedAt: NOW + 60_000 });
    expect(s.spores).toEqual({ level: 0, available: available - 300 });
    expect(s.chronicle).toHaveLength(5);
    expect(s.chronicle[4]).toMatchObject({
      biome: 'tundra',
      leg: 4,
      leftAt: NOW + 60_000,
      levelReached: 640,
    });
    const events = drain();
    expect(events.find((e) => e.type === 'disperse')).toMatchObject({ from: 'tundra', to: 'natal', leg: 5 });
  });

  it('no se jura ningún voto en el viaje ni en El regreso: con votos, dispersar no hace nada', () => {
    const s = fourthColonized();
    const before = structuredClone(s);
    disperse(s, { to: 'natal', now: NOW + 60_000, vows: ['noRain'] });
    expect(s).toEqual(before);
  });

  it('en El regreso el requisito es 6 · 4,8e13 y la escala 4,8e13, también con el suelo lineal de la 1.x', () => {
    const s = inReturn();
    s.sporeFloor = 4037;
    invalidate(s);
    expect(sporulateRequirement(s)).toBe(2.88e14);
    expect(sporeScale(s)).toBe(4.8e13);
    // El suelo lineal solo rige en el tramo 0: el umbral de madurez es el de siempre.
    expect(derived(s).sporeThreshold).toBe(1000);
  });

  it('el natal de El regreso rinde sin factores de bioma y con el linaje ×16, que cumplirlo no cambia', () => {
    const s = inReturn();
    s.achievements = [];
    s.owned = emptyOwned();
    s.owned.mycorrhiza = 10;
    invalidate(s);
    // 1800 · 10 · 16.
    expect(derived(s).generatorProduction.mycorrhiza).toBe(288_000);
    readyToClose(s);
    sporulate(s, { now: NOW + 90_000 });
    expect(isReturnClosed(s)).toBe(true);
    expect(colonizedCount(s)).toBe(4);
    expect(lineageFactor(s)).toBe(16);
    expect(derived(s).lineage).toBe(16);
  });

  it('el bosque persigue El regreso hasta el nivel 500 y después nada más', () => {
    const s = inReturn();
    s.spores.level = 312;
    expect(forestGoal(s)).toEqual({ kind: 'return', level: 312, goal: 500 });
    expect(isFreeStay(s)).toBe(false);
    s.spores.level = 0;
    readyToClose(s);
    sporulate(s, { now: NOW + 90_000 });
    expect(forestGoal(s)).toEqual({ kind: 'free', level: 525 });
    expect(isFreeStay(s)).toBe(true);
  });

  it('la esporulación que llega al nivel 500 escribe la sexta entrada, una sola vez, y avisa', () => {
    const s = inReturn();
    s.stats.sporulations += 7;
    s.stats.totalTime += 9000;
    readyToClose(s);
    sporulate(s, { now: NOW + 90_000 });
    expect(s.spores.level).toBe(525);
    expect(s.chronicle).toHaveLength(6);
    expect(s.chronicle[5]).toEqual({
      biome: 'natal',
      leg: 5,
      arrivedAt: NOW + 60_000,
      colonizedAt: NOW + 90_000,
      sporulations: 8,
      playTime: 9000,
      leftAt: null,
      levelReached: null,
    });
    const types = drain().map((e) => e.type);
    expect(types.filter((t) => t === 'returned')).toHaveLength(1);
    expect(types).not.toContain('colonized');
    expect(s.achievements).toContain('return.1');
    // Ni otra comprobación ni otra esporulación la repiten.
    expect(checkReturn(s, NOW + 95_000)).toBe(false);
    s.forest.earned = 1e17;
    s.lifetimeEarned = 2e17;
    s.runEarned = 2.88e14;
    sporulate(s, { now: NOW + 100_000 });
    expect(s.spores.level).toBeGreaterThan(525);
    expect(s.chronicle).toHaveLength(6);
  });

  it('por debajo del nivel 500, en un destino, en el natal del Acto I o sin fecha no se cumple El regreso', () => {
    const s = inReturn();
    s.spores.level = 499;
    expect(checkReturn(s, NOW + 90_000)).toBe(false);
    const fourth = fourthColonized();
    fourth.spores.level = 900;
    expect(checkReturn(fourth, NOW + 90_000)).toBe(false);
    const natal = actOneState();
    natal.spores.level = 2000;
    expect(checkReturn(natal, NOW + 90_000)).toBe(false);
    s.spores.level = 500;
    expect(checkReturn(s, Number.NaN)).toBe(false);
    expect(s.chronicle).toHaveLength(5);
    expect(fourth.chronicle).toHaveLength(5);
    expect(natal.chronicle).toHaveLength(1);
  });

  it('durante El regreso no se puede partir; cumplido, no queda adónde ir hasta el ciclo libre', () => {
    const s = inReturn();
    s.spores.available = 5000;
    expect(disperseBlock(s)).toBe('colonize');
    const before = structuredClone(s);
    for (const to of ['taiga', 'natal', 'tundra'] as const) disperse(s, { to, now: NOW + 70_000 });
    expect(s).toEqual(before);
    readyToClose(s);
    sporulate(s, { now: NOW + 90_000 });
    expect(windTargets(s)).toEqual([]);
    expect(disperseBlock(s)).toBe('noDestination');
  });

  it('esporular cumple la meta cuando la ganancia lleva el nivel de menos de 500 a 500 o más en El regreso', () => {
    const s = inReturn();
    // Con L = 4,8e13 · (508 / 18,75)², E = 508: desde el nivel 368 se ganan 140.
    s.spores.level = 368;
    s.forest.earned = 4.8e13 * (508 / 18.75) ** 2 + 1e10;
    s.lifetimeEarned = 1e17;
    s.runEarned = 2.88e14;
    expect(sporeGain(s)).toBe(140);
    expect(completesGoal(s)).toBe(true);
    // Sin el requisito de la partida no se puede esporular, y entonces no cumple nada.
    s.runEarned = 2.8e14;
    expect(completesGoal(s)).toBe(false);
    s.runEarned = 2.88e14;
    // Desde el nivel 377 se ganan 131 y se llega a 508: también cumple.
    s.spores.level = 377;
    expect(completesGoal(s)).toBe(true);
    // Una ganancia que deja el nivel en 499 no cumple.
    s.spores.level = 0;
    s.forest.earned = 4.8e13 * (499 / 18.75) ** 2 + 1e10;
    expect(sporeGain(s)).toBe(499);
    expect(completesGoal(s)).toBe(false);
    // Con el nivel ya en 500 no hay meta que cumplir.
    readyToClose(s);
    sporulate(s, { now: NOW + 90_000 });
    s.forest.earned = 1e17;
    s.runEarned = 2.88e14;
    expect(canSporulate(s)).toBe(true);
    expect(completesGoal(s)).toBe(false);
  });

  it('en un destino, llegar a 500 no es la meta del bot: completesGoal solo mira El regreso', () => {
    const s = arrivedIn('taiga');
    s.spores.level = 368;
    s.forest.earned = 1e11 * (508 / 18.75) ** 2 + 1e3;
    s.lifetimeEarned = 1e15;
    s.runEarned = 1e11;
    expect(sporeGain(s)).toBe(140);
    expect(completesGoal(s)).toBe(false);
  });

  it('«Echar raíces» no se otorga en el natal de El regreso, aunque el nivel pase de 1000', () => {
    const s = inReturn();
    s.spores.level = 1200;
    checkAchievements(s);
    expect(s.achievements).not.toContain('biomeLevel.1');
    const fourth = fourthColonized();
    fourth.spores.level = 1200;
    checkAchievements(fourth);
    expect(fourth.achievements).toContain('biomeLevel.1');
  });

  it('los viajes cuentan también El regreso: cinco dispersiones', () => {
    expect(dispersalCount(inReturn())).toBe(5);
  });
});

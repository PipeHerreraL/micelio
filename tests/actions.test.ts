import { beforeEach, describe, expect, it } from 'vitest';
import {
  buyGenerator,
  buyMutation,
  buyUpgrade,
  canSporulate,
  click,
  sporeGain,
  sporulate,
} from '../src/core/actions.ts';
import { drain, type GameEvent } from '../src/core/events.ts';
import { derived, invalidate } from '../src/core/selectors.ts';
import { createState, type GameState, type RainDrop } from '../src/core/state.ts';
import { tick } from '../src/core/tick.ts';
import type { MutationId } from '../src/data/mutations.ts';
import { checkAchievements, grantAchievement } from '../src/systems/achievements.ts';
import { runAutobuy } from '../src/systems/autobuy.ts';
import { catchDrop, rollRainInterval, updateRain } from '../src/systems/rain.ts';

/** Marca de tiempo fija: la lógica nunca lee el reloj. */
const NOW = 1_700_000_000_000;

/*
 * Semillas del azar que fuerzan cada efecto de la lluvia. Se encontraron probando semillas
 * con mulberry32: catchDrop consume primero un número para el siguiente intervalo y luego
 * otro para el efecto (Aguacero si < 0.55, Rocío si < 0.90, Tormenta en otro caso).
 * - 2: segundo número 0.325 (Aguacero); el cuarto, 0.538, vuelve a dar Aguacero.
 * - 5: segundo número 0.773 (Rocío).
 * - 10: segundo número 0.917 (Tormenta eléctrica).
 */
const SEED_DOWNPOUR = 2;
const SEED_DEW = 5;
const SEED_STORM = 10;

function fresh(): GameState {
  return createState(42, NOW);
}

function withMutations(state: GameState, ids: MutationId[]): void {
  state.mutations = [...ids];
  invalidate(state);
}

/** Lee la gota a través de una función para que TypeScript no la dé por estrechada. */
function currentDrop(state: GameState): RainDrop | null {
  return state.rain.drop;
}

function placeDrop(state: GameState): void {
  state.rain.drop = { x: 0.5, y: 0.5, remaining: 12 };
  state.rain.nextIn = 0;
}

function eventsOf<T extends GameEvent['type']>(type: T): Extract<GameEvent, { type: T }>[] {
  return drain().filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

beforeEach(() => {
  drain();
});

describe('absorber con clic', () => {
  it('cada clic suma V a los nutrientes, a lo ganado en la partida y a lo ganado en la vida', () => {
    const state = fresh();
    // Partida nueva: V = M + q P = 1 + 0 · 0 = 1.
    click(state);
    click(state);
    expect(state.nutrients).toBe(2);
    expect(state.runEarned).toBe(2);
    expect(state.lifetimeEarned).toBe(2);
    expect(state.stats.clicks).toBe(2);
  });

  it('con Absorción profunda el clic suma además el 3 % de la producción', () => {
    const state = fresh();
    state.owned.hypha = 10;
    state.nutrients = 5;
    withMutations(state, ['deepAbsorption']);
    // P = 10 · 0.1 = 1 N/s; V = 1 + 0.03 · 1 = 1.03; nutrientes 5 + 1.03 = 6.03.
    click(state);
    expect(state.nutrients).toBeCloseTo(6.03, 10);
    expect(state.runEarned).toBeCloseTo(1.03, 10);
    expect(state.lifetimeEarned).toBeCloseTo(1.03, 10);
  });

  it('hacer clic reinicia el tiempo sin clic', () => {
    const state = fresh();
    state.stats.idleClickTime = 42;
    click(state);
    expect(state.stats.idleClickTime).toBe(0);
  });

  it('el clic emite un evento con el valor ganado', () => {
    const state = fresh();
    click(state);
    expect(eventsOf('click')).toEqual([{ type: 'click', value: 1 }]);
  });
});

describe('comprar generadores', () => {
  it('comprar una Hifa cuesta exactamente su coste base y la segunda un 15 % más', () => {
    const state = fresh();
    state.nutrients = 100;
    buyGenerator(state, { id: 'hypha', amount: 1 });
    // 100 − 10 = 90.
    expect(state.nutrients).toBeCloseTo(90, 10);
    expect(state.owned.hypha).toBe(1);
    buyGenerator(state, { id: 'hypha', amount: 1 });
    // 90 − 10 · 1.15 = 90 − 11.5 = 78.5.
    expect(state.nutrients).toBeCloseTo(78.5, 10);
    expect(state.owned.hypha).toBe(2);
  });

  it('comprar 10 Hifas de golpe cobra la serie geométrica completa', () => {
    const state = fresh();
    state.nutrients = 250;
    buyGenerator(state, { id: 'hypha', amount: 10 });
    // 1.15^10 = 4.0455577357; coste = 10 · (4.0455577357 − 1) / 0.15 = 203.0371823805.
    // 250 − 203.0371823805 = 46.9628176195.
    expect(state.owned.hypha).toBe(10);
    expect(state.nutrients).toBeCloseTo(46.9628176195, 8);
  });

  it('con los nutrientes justos la compra deja cero y nunca un saldo negativo', () => {
    const state = fresh();
    state.nutrients = 10;
    buyGenerator(state, { id: 'hypha', amount: 1 });
    expect(state.owned.hypha).toBe(1);
    expect(state.nutrients).toBeGreaterThanOrEqual(0);
    expect(state.nutrients).toBeCloseTo(0, 10);
  });

  it('comprar el máximo con 25 nutrientes da 2 Hifas y deja 3.5', () => {
    const state = fresh();
    state.nutrients = 25;
    buyGenerator(state, { id: 'hypha', amount: 'max' });
    // 10 + 11.5 = 21.5 ≤ 25; la tercera sumaría 13.225 → 34.725 > 25. Quedan 25 − 21.5 = 3.5.
    expect(state.owned.hypha).toBe(2);
    expect(state.nutrients).toBeCloseTo(3.5, 10);
  });

  it('comprar el máximo nunca deja los nutrientes en negativo ni permite una unidad más', () => {
    // El borde exacto 34.725 (= 10 + 11.5 + 13.225) tiene su propia prueba más abajo.
    const funds = [10, 21.5, 99.99, 1234.5, 1e6, 3.3e9, 7.77e15];
    for (const amount of funds) {
      for (const id of ['hypha', 'primordium', 'motherTree'] as const) {
        const state = fresh();
        state.nutrients = amount;
        buyGenerator(state, { id, amount: 'max' });
        expect(state.nutrients).toBeGreaterThanOrEqual(0);
        const owned = state.owned[id];
        const left = state.nutrients;
        // Si el máximo fue de verdad el máximo, una unidad más no alcanza.
        buyGenerator(state, { id, amount: 1 });
        expect(state.owned[id]).toBe(owned);
        expect(state.nutrients).toBe(left);
      }
    }
  });

  // En el borde exacto, el juego cobra la forma cerrada C(n, k) (PROMPT.md §7), que en coma
  // flotante puede quedar un ulp por encima de la suma unidad a unidad; por eso se prueba a
  // ambos lados del coste y no justo encima.
  it('Máx compra 3 Hifas con un poco más de lo que cuestan y 2 con un poco menos', () => {
    // 10 + 10 · 1.15 + 10 · 1.15² = 10 + 11.5 + 13.225 = 34.725.
    const rich = fresh();
    rich.nutrients = 34.73;
    buyGenerator(rich, { id: 'hypha', amount: 'max' });
    expect(rich.owned.hypha).toBe(3);
    // 34.73 − 34.725 = 0.005
    expect(rich.nutrients).toBeCloseTo(0.005, 9);

    const poor = fresh();
    poor.nutrients = 34.72;
    buyGenerator(poor, { id: 'hypha', amount: 'max' });
    expect(poor.owned.hypha).toBe(2);
    // 34.72 − 21.5 = 13.22
    expect(poor.nutrients).toBeCloseTo(13.22, 9);
  });

  it('con 34.725 N se pueden comprar 3 Hifas una a una', () => {
    const state = fresh();
    state.nutrients = 34.725;
    buyGenerator(state, { id: 'hypha', amount: 1 });
    buyGenerator(state, { id: 'hypha', amount: 1 });
    buyGenerator(state, { id: 'hypha', amount: 1 });
    // 34.725 − 10 − 11.5 − 13.225 = 0.
    expect(state.owned.hypha).toBe(3);
    expect(state.nutrients).toBeGreaterThanOrEqual(0);
    expect(state.nutrients).toBeCloseTo(0, 10);
  });

  it('no compra si no alcanzan los nutrientes', () => {
    const state = fresh();
    state.nutrients = 9.99;
    buyGenerator(state, { id: 'hypha', amount: 1 });
    expect(state.owned.hypha).toBe(0);
    expect(state.nutrients).toBe(9.99);
    expect(eventsOf('buyGenerator')).toEqual([]);
  });

  it('con Máx y sin nutrientes para una unidad no compra nada', () => {
    const state = fresh();
    state.nutrients = 5;
    buyGenerator(state, { id: 'hypha', amount: 'max' });
    expect(state.owned.hypha).toBe(0);
    expect(state.nutrients).toBe(5);
  });

  it('no compra un lote parcial cuando el lote entero no alcanza', () => {
    const state = fresh();
    // 10 Hifas cuestan 203.04: con 100 no se compra ninguna, ni siquiera las que alcanzarían.
    state.nutrients = 100;
    buyGenerator(state, { id: 'hypha', amount: 10 });
    expect(state.owned.hypha).toBe(0);
    expect(state.nutrients).toBe(100);
  });

  it('no compra un generador bloqueado aunque alcancen los nutrientes', () => {
    const state = fresh();
    state.nutrients = 1e12;
    buyGenerator(state, { id: 'malheur', amount: 1 });
    buyGenerator(state, { id: 'planetary', amount: 1 });
    expect(state.owned.malheur).toBe(0);
    expect(state.owned.planetary).toBe(0);
    expect(state.nutrients).toBe(1e12);
  });

  it('el Gigante de Malheur se desbloquea tras esporular y la Red planetaria con Más allá del bosque', () => {
    const state = fresh();
    state.nutrients = 1e12;
    state.stats.sporulations = 1;
    buyGenerator(state, { id: 'malheur', amount: 1 });
    // 1e12 − 5e9 = 9.95e11.
    expect(state.owned.malheur).toBe(1);
    expect(state.nutrients).toBeCloseTo(9.95e11, 0);
    withMutations(state, ['beyondForest']);
    buyGenerator(state, { id: 'planetary', amount: 1 });
    // 9.95e11 − 9e10 = 9.05e11.
    expect(state.owned.planetary).toBe(1);
    expect(state.nutrients).toBeCloseTo(9.05e11, 0);
  });

  it('Quitina ligera abarata los generadores un 10 %', () => {
    const state = fresh();
    state.nutrients = 100;
    withMutations(state, ['lightChitin']);
    buyGenerator(state, { id: 'hypha', amount: 1 });
    // 10 · (1 − 0.1) = 9; 100 − 9 = 91.
    expect(state.nutrients).toBeCloseTo(91, 10);
  });

  it('la compra emite un evento con las unidades compradas', () => {
    const state = fresh();
    state.nutrients = 1000;
    buyGenerator(state, { id: 'hypha', amount: 10 });
    expect(eventsOf('buyGenerator')).toEqual([{ type: 'buyGenerator', id: 'hypha', count: 10 }]);
  });
});

describe('comprar mejoras', () => {
  it('no compra una mejora de generador que aún no apareció', () => {
    const state = fresh();
    state.nutrients = 1000;
    // Hifa I aparece al poseer 1 Hifa; aquí hay 0.
    buyUpgrade(state, { id: 'hypha.u1' });
    expect(state.upgrades).toEqual([]);
    expect(state.nutrients).toBe(1000);
  });

  it('no compra una mejora de clic antes de ganar lo necesario en la partida', () => {
    const state = fresh();
    state.nutrients = 1000;
    // Tacto sensible aparece con 100 N ganados; aquí van 99.
    state.runEarned = 99;
    buyUpgrade(state, { id: 'sensitiveTouch' });
    expect(state.upgrades).toEqual([]);
    expect(state.nutrients).toBe(1000);
  });

  it('una mejora aparecida se cobra por su coste y duplica su generador', () => {
    const state = fresh();
    state.owned.hypha = 1;
    state.nutrients = 1000;
    buyUpgrade(state, { id: 'hypha.u1' });
    // Coste 10 · 10 = 100; 1000 − 100 = 900.
    expect(state.upgrades).toEqual(['hypha.u1']);
    expect(state.nutrients).toBe(900);
    // La compra otorga el logro «1 Hifa», así que G = 1.01: P = 0.1 · 2 · 1.01 = 0.202.
    expect(derived(state).production).toBeCloseTo(0.202, 10);
  });

  it('no cobra dos veces una mejora ya comprada', () => {
    const state = fresh();
    state.owned.hypha = 1;
    state.nutrients = 1000;
    buyUpgrade(state, { id: 'hypha.u1' });
    buyUpgrade(state, { id: 'hypha.u1' });
    expect(state.upgrades).toEqual(['hypha.u1']);
    expect(state.nutrients).toBe(900);
  });

  it('no compra una mejora aparecida si no alcanzan los nutrientes', () => {
    const state = fresh();
    state.owned.hypha = 1;
    state.nutrients = 99;
    buyUpgrade(state, { id: 'hypha.u1' });
    expect(state.upgrades).toEqual([]);
    expect(state.nutrients).toBe(99);
  });

  it('una id de mejora desconocida no cambia nada', () => {
    const state = fresh();
    state.nutrients = 1e9;
    buyUpgrade(state, { id: 'noExiste' });
    expect(state.upgrades).toEqual([]);
    expect(state.nutrients).toBe(1e9);
  });
});

describe('paso de lógica (tick)', () => {
  it('un paso suma producción por dt a los tres totales', () => {
    const state = fresh();
    state.owned.rhizomorph = 3;
    // P = 3 · 1 = 3 N/s; en 0.5 s, 1.5 N.
    tick(state, { dt: 0.5 });
    expect(state.nutrients).toBeCloseTo(1.5, 10);
    expect(state.runEarned).toBeCloseTo(1.5, 10);
    expect(state.lifetimeEarned).toBeCloseTo(1.5, 10);
    expect(state.stats.runTime).toBe(0.5);
    expect(state.stats.totalTime).toBe(0.5);
    expect(state.stats.maxNps).toBe(3);
  });

  it('el tiempo sin clic crece con cada paso', () => {
    const state = fresh();
    tick(state, { dt: 0.5 });
    tick(state, { dt: 0.25 });
    expect(state.stats.idleClickTime).toBe(0.75);
  });

  it('un dt nulo, negativo o no numérico no cambia nada', () => {
    const state = fresh();
    state.owned.rhizomorph = 3;
    tick(state, { dt: 0 });
    tick(state, { dt: -1 });
    tick(state, { dt: Number.NaN });
    expect(state.nutrients).toBe(0);
    expect(state.stats.totalTime).toBe(0);
  });

  it('durante el Aguacero la producción se multiplica por 5', () => {
    const state = fresh();
    state.owned.hypha = 10;
    state.effects = [{ kind: 'downpour', remaining: 30, duration: 60 }];
    invalidate(state);
    // P = 10 · 0.1 · 5 = 5 N/s; en 0.5 s, 2.5 N.
    tick(state, { dt: 0.5 });
    expect(state.nutrients).toBeCloseTo(2.5, 10);
    expect(state.effects).toEqual([{ kind: 'downpour', remaining: 29.5, duration: 60 }]);
  });

  it('los efectos descuentan dt y se quitan al terminar', () => {
    const state = fresh();
    state.owned.hypha = 10;
    state.effects = [
      { kind: 'downpour', remaining: 0.3, duration: 60 },
      { kind: 'storm', remaining: 10, duration: 12 },
    ];
    invalidate(state);
    tick(state, { dt: 0.5 });
    // El Aguacero tenía 0.3 s: termina. La Tormenta queda con 10 − 0.5 = 9.5 s.
    expect(state.effects).toEqual([{ kind: 'storm', remaining: 9.5, duration: 12 }]);
    expect(eventsOf('effectEnd')).toEqual([{ type: 'effectEnd', kind: 'downpour' }]);
    // Sin Aguacero vuelve E = 1 y P = 10 · 0.1 = 1 N/s.
    expect(derived(state).eventMultiplier).toBe(1);
    expect(derived(state).production).toBeCloseTo(1, 10);
  });
});

describe('lluvia', () => {
  it('la gota aparece cuando la cuenta atrás llega a cero', () => {
    const state = fresh();
    state.rain.nextIn = 1;
    tick(state, { dt: 0.5 });
    expect(currentDrop(state)).toBeNull();
    expect(state.rain.nextIn).toBe(0.5);
    tick(state, { dt: 0.5 });
    const drop = currentDrop(state);
    expect(drop).not.toBeNull();
    expect(drop?.remaining).toBe(12);
    // Margen de 0.1 a cada lado de la zona de juego.
    expect(drop?.x).toBeGreaterThanOrEqual(0.1);
    expect(drop?.x).toBeLessThan(0.9);
    expect(drop?.y).toBeGreaterThanOrEqual(0.1);
    expect(drop?.y).toBeLessThan(0.9);
    expect(eventsOf('rainSpawn')).toHaveLength(1);
  });

  it('la gota se evapora a los 12 segundos si nadie la atrapa', () => {
    const state = fresh();
    state.rain.nextIn = 1;
    updateRain(state, 1);
    expect(currentDrop(state)).not.toBeNull();
    updateRain(state, 11);
    // 12 − 11 = 1 s le queda.
    expect(currentDrop(state)?.remaining).toBe(1);
    updateRain(state, 1);
    expect(currentDrop(state)).toBeNull();
    expect(eventsOf('rainExpired')).toHaveLength(1);
    // La siguiente gota se sortea entre 120 y 300 s.
    expect(state.rain.nextIn).toBeGreaterThanOrEqual(120);
    expect(state.rain.nextIn).toBeLessThan(300);
  });

  it('atrapar la gota la quita, cuenta una gota más y sortea la siguiente', () => {
    const state = fresh();
    placeDrop(state);
    catchDrop(state);
    expect(currentDrop(state)).toBeNull();
    expect(state.stats.drops).toBe(1);
    expect(state.rain.nextIn).toBeGreaterThanOrEqual(120);
    expect(state.rain.nextIn).toBeLessThan(300);
    expect(eventsOf('rainCaught')).toHaveLength(1);
  });

  it('sin gota visible, atrapar no hace nada ni consume azar', () => {
    const state = fresh();
    const seed = state.rngSeed;
    catchDrop(state);
    expect(state.stats.drops).toBe(0);
    expect(state.rngSeed).toBe(seed);
    expect(state.effects).toEqual([]);
  });

  it('el Aguacero dura 60 s y multiplica la producción por 5', () => {
    const state = fresh();
    state.owned.hypha = 10;
    state.rngSeed = SEED_DOWNPOUR;
    placeDrop(state);
    catchDrop(state);
    expect(state.effects).toEqual([{ kind: 'downpour', remaining: 60, duration: 60 }]);
    // P = 10 · 0.1 · 5 = 5 N/s.
    expect(derived(state).production).toBeCloseTo(5, 10);
  });

  it('un segundo Aguacero renueva la duración en lugar de apilarse', () => {
    const state = fresh();
    state.owned.hypha = 10;
    state.rngSeed = SEED_DOWNPOUR;
    placeDrop(state);
    catchDrop(state);
    tick(state, { dt: 20 });
    // 60 − 20 = 40 s le quedan antes de la segunda gota.
    expect(state.effects).toEqual([{ kind: 'downpour', remaining: 40, duration: 60 }]);
    placeDrop(state);
    catchDrop(state);
    expect(state.effects).toEqual([{ kind: 'downpour', remaining: 60, duration: 60 }]);
    // Al cruzar segundos el tick otorgó «1 Hifa» y «1 gota»: G = 1.02. Sigue siendo ×5 y
    // no ×25: P = 1 · 1.02 · 5 = 5.1 N/s (apilado sería 25.5).
    expect(state.achievements).toEqual(['own.hypha.1', 'drops.1']);
    expect(derived(state).production).toBeCloseTo(5.1, 10);
  });

  it('el Rocío da el 12 % de los nutrientes cuando es lo menor', () => {
    const state = fresh();
    state.owned.hypha = 10;
    state.nutrients = 1000;
    state.rngSeed = SEED_DEW;
    placeDrop(state);
    catchDrop(state);
    // P = 1 N/s: 12 % de 1000 = 120 frente a 720 s · 1 = 720. Gana 120: 1000 + 120 = 1120.
    expect(state.nutrients).toBeCloseTo(1120, 10);
    expect(state.effects).toEqual([]);
    const caught = eventsOf('rainCaught');
    expect(caught).toHaveLength(1);
    expect(caught[0]?.effect).toBe('dew');
    expect(caught[0]?.amount).toBeCloseTo(120, 10);
  });

  it('el Rocío da 12 minutos de producción cuando es lo menor', () => {
    const state = fresh();
    state.owned.hypha = 10;
    state.nutrients = 1e6;
    state.rngSeed = SEED_DEW;
    placeDrop(state);
    catchDrop(state);
    // 12 % de 1e6 = 120 000 frente a 720 s · 1 N/s = 720. Gana 720: 1 000 720.
    expect(state.nutrients).toBeCloseTo(1_000_720, 6);
    expect(state.runEarned).toBeCloseTo(720, 10);
  });

  it('la Tormenta eléctrica multiplica el clic por 500 durante 12 s', () => {
    const state = fresh();
    state.rngSeed = SEED_STORM;
    placeDrop(state);
    catchDrop(state);
    expect(state.effects).toEqual([{ kind: 'storm', remaining: 12, duration: 12 }]);
    // V = (1 + 0) · 500 = 500.
    click(state);
    expect(state.nutrients).toBe(500);
  });

  it('Olfato de lluvia divide el intervalo entre gotas por 1.3', () => {
    for (const seed of [1, 7, 123, 99_999, 4_000_000_000]) {
      const base = fresh();
      const scented = fresh();
      withMutations(scented, ['rainScent']);
      base.rngSeed = seed;
      scented.rngSeed = seed;
      const normal = rollRainInterval(base);
      const faster = rollRainInterval(scented);
      expect(normal / faster).toBeCloseTo(1.3, 10);
      // 120 / 1.3 = 92.3077 y 300 / 1.3 = 230.7692.
      expect(faster).toBeGreaterThanOrEqual(92.3076);
      expect(faster).toBeLessThan(230.7693);
    }
  });

  it('Tormenta perfecta hace que el Aguacero dure 90 s', () => {
    const state = fresh();
    withMutations(state, ['perfectStorm']);
    state.rngSeed = SEED_DOWNPOUR;
    placeDrop(state);
    catchDrop(state);
    // 60 · 1.5 = 90.
    expect(state.effects).toEqual([{ kind: 'downpour', remaining: 90, duration: 90 }]);
  });

  it('Tormenta perfecta hace que la Tormenta eléctrica dure 18 s', () => {
    const state = fresh();
    withMutations(state, ['perfectStorm']);
    state.rngSeed = SEED_STORM;
    placeDrop(state);
    catchDrop(state);
    // 12 · 1.5 = 18.
    expect(state.effects).toEqual([{ kind: 'storm', remaining: 18, duration: 18 }]);
  });
});

describe('esporular', () => {
  it('no se puede esporular con menos de 1e8 nutrientes ganados en la partida', () => {
    const state = fresh();
    state.nutrients = 5e7;
    state.runEarned = 99_999_999;
    // Aunque la vida dé muchas esporas, la partida no llega al requisito.
    state.lifetimeEarned = 1e10;
    expect(canSporulate(state)).toBe(false);
    sporulate(state, { now: NOW + 1000 });
    expect(state.spores).toEqual({ level: 0, available: 0 });
    expect(state.nutrients).toBe(5e7);
    expect(state.stats.sporulations).toBe(0);
  });

  it('con 1e8 en la partida y en la vida se ganan 15 esporas', () => {
    const state = fresh();
    state.runEarned = 1e8;
    state.lifetimeEarned = 1e8;
    // E = ⌊15 · √(1e8 / 1e8)⌋ = 15; S = 0 → gana 15.
    expect(sporeGain(state)).toBe(15);
    sporulate(state, { now: NOW });
    expect(state.spores).toEqual({ level: 15, available: 15 });
    expect(state.stats.sporulations).toBe(1);
  });

  it('se ganan E(L) − S esporas, que suman al nivel y a las disponibles', () => {
    const state = fresh();
    state.runEarned = 1e8;
    state.lifetimeEarned = 4e8;
    state.spores = { level: 10, available: 3 };
    // E = ⌊15 · √4⌋ = 30; gana 30 − 10 = 20. Nivel 30, disponibles 3 + 20 = 23.
    expect(sporeGain(state)).toBe(20);
    sporulate(state, { now: NOW });
    expect(state.spores).toEqual({ level: 30, available: 23 });
  });

  it('sin esporas que ganar no se puede esporular', () => {
    const state = fresh();
    state.runEarned = 1e8;
    state.lifetimeEarned = 1e8;
    // E = 15 y ya se tiene nivel 15: gana 0.
    state.spores = { level: 15, available: 0 };
    expect(canSporulate(state)).toBe(false);
    sporulate(state, { now: NOW });
    expect(state.stats.sporulations).toBe(0);
    expect(state.runEarned).toBe(1e8);
  });

  it('esporular reinicia nutrientes, generadores, mejoras, efectos y la gota', () => {
    const state = fresh();
    state.nutrients = 5e7;
    state.runEarned = 2e8;
    state.lifetimeEarned = 2.25e8;
    state.owned.hypha = 120;
    state.owned.mushroom = 30;
    state.upgrades = ['hypha.u1', 'sensitiveTouch'];
    state.effects = [{ kind: 'downpour', remaining: 30, duration: 60 }];
    state.rain.drop = { x: 0.3, y: 0.3, remaining: 5 };
    state.stats.runTime = 1234;
    invalidate(state);
    sporulate(state, { now: NOW + 5000 });
    expect(state.nutrients).toBe(0);
    expect(state.runEarned).toBe(0);
    expect(Object.values(state.owned).every((n) => n === 0)).toBe(true);
    expect(state.upgrades).toEqual([]);
    expect(state.effects).toEqual([]);
    expect(currentDrop(state)).toBeNull();
    expect(state.stats.runTime).toBe(0);
    expect(state.stats.runStartedAt).toBe(NOW + 5000);
    // Sin generadores ni mejoras la producción vuelve a 0 (los hitos también se pierden).
    expect(derived(state).production).toBe(0);
  });

  // BUG-JOURNAL #2: al esporular con una gota en pantalla, nextIn seguía en 0 y caía otra
  // gota en el siguiente tick, en mitad de la esporulación.
  it('esporular con una gota en pantalla no hace caer otra gota en el siguiente tick', () => {
    const state = fresh();
    state.runEarned = 2e8;
    state.lifetimeEarned = 2.25e8;
    // Así queda la lluvia cuando una gota acaba de aparecer (rain.ts pone nextIn a 0).
    state.rain.drop = { x: 0.5, y: 0.5, remaining: 10 };
    state.rain.nextIn = 0;
    sporulate(state, { now: NOW });
    // El siguiente intervalo es de al menos 120 s / 1.3 (con Olfato de lluvia) ≈ 92 s.
    expect(state.rain.nextIn).toBeGreaterThanOrEqual(120 / 1.3);
    tick(state, { dt: 0.05 });
    expect(currentDrop(state)).toBeNull();
  });

  it('esporular conserva nivel, disponibles, mutaciones, logros, estadísticas de vida y ajustes', () => {
    const state = fresh();
    state.runEarned = 2e8;
    state.lifetimeEarned = 2.25e8;
    state.spores = { level: 5, available: 2 };
    state.achievements = ['clicks.1', 'drops.1'];
    state.stats.clicks = 150;
    state.stats.drops = 3;
    state.stats.totalTime = 9999;
    state.stats.maxNps = 4e5;
    state.settings.notation = 'scientific';
    state.settings.volume = 0.8;
    state.settings.locale = 'en';
    state.autobuy.threshold = 0.1;
    state.autobuy.generators.hypha = true;
    withMutations(state, ['lightChitin', 'deepAbsorption']);
    sporulate(state, { now: NOW + 5000 });
    // E = ⌊15 · √2.25⌋ = ⌊22.5⌋ = 22; gana 22 − 5 = 17. Nivel 22, disponibles 2 + 17 = 19.
    expect(state.spores).toEqual({ level: 22, available: 19 });
    expect(state.mutations).toEqual(['lightChitin', 'deepAbsorption']);
    expect(state.achievements).toEqual(expect.arrayContaining(['clicks.1', 'drops.1', 'sporulations.1']));
    expect(state.lifetimeEarned).toBe(2.25e8);
    expect(state.stats.clicks).toBe(150);
    expect(state.stats.drops).toBe(3);
    expect(state.stats.totalTime).toBe(9999);
    expect(state.stats.startedAt).toBe(NOW);
    expect(state.stats.maxNps).toBe(4e5);
    expect(state.stats.sporulations).toBe(1);
    expect(state.settings).toMatchObject({ notation: 'scientific', volume: 0.8, locale: 'en' });
    expect(state.autobuy.threshold).toBe(0.1);
    expect(state.autobuy.generators.hypha).toBe(true);
  });

  it('Memoria del suelo empieza la partida con 100 N y 10 Hifas', () => {
    const state = fresh();
    state.runEarned = 1e8;
    state.lifetimeEarned = 1e8;
    withMutations(state, ['soilMemory']);
    sporulate(state, { now: NOW });
    expect(state.nutrients).toBe(100);
    expect(state.owned.hypha).toBe(10);
    expect(state.owned.rhizomorph).toBe(0);
  });

  it('Herencia empieza la partida con 10 unidades de los cuatro primeros generadores', () => {
    const state = fresh();
    state.runEarned = 1e8;
    state.lifetimeEarned = 1e8;
    withMutations(state, ['inheritance']);
    sporulate(state, { now: NOW });
    expect(state.owned.hypha).toBe(10);
    expect(state.owned.rhizomorph).toBe(10);
    expect(state.owned.primordium).toBe(10);
    expect(state.owned.mushroom).toBe(10);
    expect(state.owned.fairyRing).toBe(0);
    expect(state.nutrients).toBe(0);
  });

  it('Memoria del suelo y Herencia se suman en las Hifas', () => {
    const state = fresh();
    state.runEarned = 1e8;
    state.lifetimeEarned = 1e8;
    withMutations(state, ['soilMemory', 'inheritance']);
    sporulate(state, { now: NOW });
    // 10 de Memoria del suelo + 10 de Herencia = 20.
    expect(state.owned.hypha).toBe(20);
    expect(state.owned.rhizomorph).toBe(10);
    expect(state.nutrients).toBe(100);
  });
});

describe('mutaciones', () => {
  it('comprar una mutación descuenta su coste de las disponibles y no baja el nivel', () => {
    const state = fresh();
    state.spores = { level: 15, available: 15 };
    buyMutation(state, { id: 'soilMemory' });
    // 15 − 1 = 14 disponibles; el nivel sigue en 15.
    expect(state.spores).toEqual({ level: 15, available: 14 });
    expect(state.mutations).toEqual(['soilMemory']);
    expect(eventsOf('buyMutation')).toEqual([{ type: 'buyMutation', id: 'soilMemory' }]);
  });

  it('no compra una mutación sin su requisito', () => {
    const state = fresh();
    state.spores = { level: 100, available: 100 };
    // Quitina ligera requiere Memoria del suelo.
    buyMutation(state, { id: 'lightChitin' });
    expect(state.mutations).toEqual([]);
    expect(state.spores.available).toBe(100);
  });

  it('Herencia exige Más allá del bosque y Esporas aladas a la vez', () => {
    const state = fresh();
    state.spores = { level: 1000, available: 1000 };
    withMutations(state, ['soilMemory', 'lightChitin', 'instinct', 'beyondForest']);
    buyMutation(state, { id: 'inheritance' });
    expect(state.mutations).not.toContain('inheritance');
    expect(state.spores.available).toBe(1000);
    withMutations(state, [...state.mutations, 'deepAbsorption', 'ancientSymbiosis', 'wingedSpores']);
    buyMutation(state, { id: 'inheritance' });
    // 1000 − 100 = 900.
    expect(state.mutations).toContain('inheritance');
    expect(state.spores).toEqual({ level: 1000, available: 900 });
  });

  it('no compra una mutación si no alcanzan las esporas disponibles', () => {
    const state = fresh();
    state.spores = { level: 50, available: 2 };
    withMutations(state, ['soilMemory']);
    // Quitina ligera cuesta 3.
    buyMutation(state, { id: 'lightChitin' });
    expect(state.mutations).toEqual(['soilMemory']);
    expect(state.spores).toEqual({ level: 50, available: 2 });
  });

  it('no compra dos veces la misma mutación', () => {
    const state = fresh();
    state.spores = { level: 5, available: 5 };
    buyMutation(state, { id: 'soilMemory' });
    buyMutation(state, { id: 'soilMemory' });
    expect(state.mutations).toEqual(['soilMemory']);
    expect(state.spores.available).toBe(4);
  });

  it('una id de mutación desconocida no cambia nada', () => {
    const state = fresh();
    state.spores = { level: 5, available: 5 };
    buyMutation(state, { id: 'noExiste' as MutationId });
    expect(state.mutations).toEqual([]);
    expect(state.spores.available).toBe(5);
  });

  it('comprar Quitina ligera abarata al instante la siguiente Hifa', () => {
    const state = fresh();
    state.spores = { level: 10, available: 10 };
    state.nutrients = 100;
    buyMutation(state, { id: 'soilMemory' });
    // Se consulta antes para llenar la caché y comprobar que la compra la invalida.
    expect(derived(state).costDiscount).toBe(0);
    buyMutation(state, { id: 'lightChitin' });
    buyGenerator(state, { id: 'hypha', amount: 1 });
    // 10 · 0.9 = 9; 100 − 9 = 91.
    expect(state.nutrients).toBeCloseTo(91, 10);
  });
});

describe('autocompra', () => {
  it('sin Instinto no compra nada aunque el interruptor esté activo', () => {
    const state = fresh();
    state.nutrients = 1000;
    state.autobuy.generators.hypha = true;
    runAutobuy(state);
    expect(state.owned.hypha).toBe(0);
    expect(state.nutrients).toBe(1000);
  });

  it('con Instinto compra una unidad de cada generador activado que cueste menos del umbral', () => {
    const state = fresh();
    state.nutrients = 1000;
    state.autobuy.threshold = 0.5;
    state.autobuy.generators.hypha = true;
    state.autobuy.generators.rhizomorph = true;
    state.autobuy.generators.primordium = true;
    withMutations(state, ['instinct']);
    runAutobuy(state);
    // Del más caro al más barato: Primordio 1300 ≥ 500 no; Rizomorfo 120 < 500 → quedan 880;
    // Hifa 10 < 0.5 · 880 = 440 → quedan 870.
    expect(state.owned.primordium).toBe(0);
    expect(state.owned.rhizomorph).toBe(1);
    expect(state.owned.hypha).toBe(1);
    expect(state.nutrients).toBeCloseTo(870, 10);
  });

  it('compra como mucho una unidad por generador aunque sobren nutrientes', () => {
    const state = fresh();
    state.nutrients = 1e6;
    state.autobuy.threshold = 1;
    state.autobuy.generators.hypha = true;
    withMutations(state, ['instinct']);
    runAutobuy(state);
    // 1e6 − 10.
    expect(state.owned.hypha).toBe(1);
    expect(state.nutrients).toBeCloseTo(999_990, 6);
  });

  it('el coste debe ser estrictamente menor que el umbral', () => {
    const state = fresh();
    // Umbral 10 % de 100 = 10, y la Hifa cuesta justo 10: no se compra.
    state.nutrients = 100;
    state.autobuy.threshold = 0.1;
    state.autobuy.generators.hypha = true;
    withMutations(state, ['instinct']);
    runAutobuy(state);
    expect(state.owned.hypha).toBe(0);
    expect(state.nutrients).toBe(100);
  });

  it('no compra generadores con el interruptor apagado ni bloqueados', () => {
    const state = fresh();
    state.nutrients = 1e12;
    state.autobuy.threshold = 1;
    // Malheur está activado pero bloqueado (sin esporulaciones); el resto, apagado.
    state.autobuy.generators.malheur = true;
    withMutations(state, ['instinct']);
    runAutobuy(state);
    expect(Object.values(state.owned).every((n) => n === 0)).toBe(true);
    expect(state.nutrients).toBe(1e12);
  });

  it('la autocompra corre una sola vez por segundo de juego', () => {
    const state = fresh();
    state.nutrients = 1000;
    state.autobuy.threshold = 0.5;
    state.autobuy.generators.hypha = true;
    withMutations(state, ['instinct']);
    tick(state, { dt: 0.5 });
    expect(state.owned.hypha).toBe(0);
    tick(state, { dt: 0.5 });
    // Se cruzó el segundo 1.
    expect(state.owned.hypha).toBe(1);
    tick(state, { dt: 0.5 });
    expect(state.owned.hypha).toBe(1);
    tick(state, { dt: 0.5 });
    // Se cruzó el segundo 2.
    expect(state.owned.hypha).toBe(2);
  });

  it('Instinto superior compra la mejora disponible más barata, una por vez', () => {
    const state = fresh();
    state.owned.hypha = 1;
    state.nutrients = 1000;
    // Con 1000 ganados aparecen Hifa I (100) y Tacto sensible (500).
    state.runEarned = 1000;
    state.autobuy.threshold = 0.5;
    state.autobuy.upgrades = true;
    withMutations(state, ['instinct', 'higherInstinct']);
    runAutobuy(state);
    // Límite 0.5 · 1000 = 500; la más barata es Hifa I: 1000 − 100 = 900.
    expect(state.upgrades).toEqual(['hypha.u1']);
    expect(state.nutrients).toBe(900);
  });

  it('sin Instinto superior no se compran mejoras', () => {
    const state = fresh();
    state.owned.hypha = 1;
    state.nutrients = 1000;
    state.autobuy.threshold = 1;
    state.autobuy.upgrades = true;
    withMutations(state, ['instinct']);
    runAutobuy(state);
    expect(state.upgrades).toEqual([]);
    expect(state.nutrients).toBe(1000);
  });

  it('con el interruptor de mejoras apagado Instinto superior no compra', () => {
    const state = fresh();
    state.owned.hypha = 1;
    state.nutrients = 1000;
    state.autobuy.threshold = 1;
    state.autobuy.upgrades = false;
    withMutations(state, ['instinct', 'higherInstinct']);
    runAutobuy(state);
    expect(state.upgrades).toEqual([]);
  });

  it('Instinto superior no compra una mejora que no cueste menos del umbral', () => {
    const state = fresh();
    state.owned.hypha = 1;
    state.nutrients = 1000;
    // Límite 0.1 · 1000 = 100 y Hifa I cuesta justo 100.
    state.autobuy.threshold = 0.1;
    state.autobuy.upgrades = true;
    withMutations(state, ['instinct', 'higherInstinct']);
    runAutobuy(state);
    expect(state.upgrades).toEqual([]);
    expect(state.nutrients).toBe(1000);
  });
});

describe('logros', () => {
  it('un logro se otorga una sola vez', () => {
    const state = fresh();
    expect(grantAchievement(state, 'clicks.1')).toBe(true);
    expect(grantAchievement(state, 'clicks.1')).toBe(false);
    expect(state.achievements).toEqual(['clicks.1']);
    expect(eventsOf('achievement')).toEqual([{ type: 'achievement', id: 'clicks.1' }]);
  });

  it('cada logro suma un 1 % al multiplicador global', () => {
    const state = fresh();
    state.owned.hypha = 10;
    // Sin logros: P = 10 · 0.1 = 1 N/s (la consulta llena la caché).
    expect(derived(state).production).toBeCloseTo(1, 10);
    grantAchievement(state, 'clicks.1');
    // G = 1 + 0.01 · 1 = 1.01.
    expect(derived(state).production).toBeCloseTo(1.01, 10);
    grantAchievement(state, 'drops.1');
    // G = 1 + 0.01 · 2 = 1.02.
    expect(derived(state).production).toBeCloseTo(1.02, 10);
  });

  it('con Simbiosis antigua cada logro suma un 2 %', () => {
    const state = fresh();
    state.owned.hypha = 10;
    withMutations(state, ['ancientSymbiosis']);
    grantAchievement(state, 'clicks.1');
    // G = 1 + 0.02 · 1 = 1.02; P = 1 · 1.02.
    expect(derived(state).production).toBeCloseTo(1.02, 10);
  });

  it('la revisión periódica otorga los logros cumplidos sin repetirlos', () => {
    const state = fresh();
    state.stats.clicks = 100;
    checkAchievements(state);
    checkAchievements(state);
    expect(state.achievements).toEqual(['clicks.1']);
    expect(eventsOf('achievement')).toHaveLength(1);
  });

  it('Paciencia de hongo llega a los 10 minutos sin clic con el juego abierto', () => {
    const state = fresh();
    tick(state, { dt: 599.5 });
    expect(state.achievements).not.toContain('secret.patience');
    tick(state, { dt: 0.5 });
    // 599.5 + 0.5 = 600 s sin clic.
    expect(state.achievements).toContain('secret.patience');
  });

  it('Sin prisa nunca lo otorga la revisión periódica', () => {
    const state = fresh();
    state.stats.idleClickTime = 1e6;
    state.stats.totalTime = 1e6;
    checkAchievements(state);
    expect(state.achievements).not.toContain('secret.noRush');
  });
});

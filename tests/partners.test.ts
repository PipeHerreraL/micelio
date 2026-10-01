import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drain, type GameEvent } from '../src/core/events.ts';
import { computeDerived, invalidate } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { tick } from '../src/core/tick.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { MOIST_SECONDS } from '../src/data/plasmodium.ts';
import { registerPartnerRuntime, unregisterPartnerRuntime } from '../src/partners/registry.ts';
import { createPlasmodium } from '../src/partners/plasmodium/state.ts';
import type { PartnerRuntime } from '../src/partners/types.ts';
import { checkActOne } from '../src/systems/journey.ts';
import { applyOffline } from '../src/systems/offline.ts';
import {
  advancePartners,
  applyPartnersElapsed,
  checkPartnerUnlocks,
  noteFungalEvent,
  partnerPerks,
  setPartnerErrorHandler,
} from '../src/systems/partners.ts';

/**
 * Los socios en el núcleo (docs/ROADMAP.md, fase 9): cuándo llega el plasmodio, cómo recibe el
 * tiempo sin su modelo y con él, y que nada de eso toca la red.
 */

const NOW = Date.UTC(2026, 9, 1);

/** Un modelo de juguete: cada ms suma 1 de Rastro. Basta para ver cuánto tiempo recibe. */
const countingRuntime: PartnerRuntime = {
  id: 'plasmodium',
  advance(_state, p, ms) {
    p.trail += ms;
    p.trailEarned += ms;
  },
  notice: () => null,
};

beforeEach(() => {
  drain();
});

afterEach(() => {
  unregisterPartnerRuntime('plasmodium');
  setPartnerErrorHandler((_id, error) => {
    throw error;
  });
});

/** Natal con el Acto I cerrado tras 9 esporulaciones. */
function actOneState(): GameState {
  const s = createState(21, NOW);
  s.mutations = [...MUTATION_IDS];
  s.achievements = ['own.planetary.1'];
  s.stats.sporulations = 9;
  s.stats.totalTime = 11_940;
  checkActOne(s);
  drain();
  return s;
}

/** Avanza `seconds` segundos de juego en vivo a pasos de 1 s. */
function play(s: GameState, seconds: number): void {
  for (let i = 0; i < seconds; i += 1) tick(s, { dt: 1 });
}

function unlockedEvents(): GameEvent[] {
  return drain().filter((e) => e.type === 'partnerUnlocked');
}

describe('llegada del plasmodio', () => {
  it('una partida nueva tiene a todos los socios sin llegar', () => {
    expect(createState(1, NOW).partners).toEqual({ plasmodium: null });
  });

  it('llega a los 300 s de una partida posterior al Acto I, una sola vez, y no antes', () => {
    const s = actOneState();
    // La partida del Acto I no cuenta: aún no esporuló después.
    play(s, 400);
    expect(s.partners.plasmodium).toBeNull();
    s.stats.sporulations = 10;
    s.stats.runTime = 0;
    play(s, 299);
    expect(s.partners.plasmodium).toBeNull();
    play(s, 1);
    expect(s.partners.plasmodium).not.toBeNull();
    expect(unlockedEvents()).toEqual([{ type: 'partnerUnlocked', partner: 'plasmodium' }]);
    play(s, 60);
    expect(unlockedEvents()).toEqual([]);
  });

  it('sin el Acto I no llega aunque la partida dure horas', () => {
    const s = createState(4, NOW);
    s.stats.sporulations = 30;
    play(s, 2000);
    expect(s.partners.plasmodium).toBeNull();
  });

  it('en un bioma llega a los 300 s de la partida aunque no haya esporulado allí', () => {
    const s = actOneState();
    s.forest = {
      biome: 'taiga',
      leg: 1,
      earned: 0,
      arrivedAt: NOW,
      arrivalSporulations: 9,
      arrivalPlayTime: 11_940,
    };
    s.stats.runTime = 299;
    play(s, 1);
    expect(s.partners.plasmodium).not.toBeNull();
  });

  it('llegar no avanza la semilla común ni cambia los derivados de la red', () => {
    const s = actOneState();
    s.stats.sporulations = 10;
    s.stats.runTime = 300;
    const seed = s.rngSeed;
    const before = computeDerived(s);
    checkPartnerUnlocks(s);
    expect(s.partners.plasmodium).not.toBeNull();
    expect(s.rngSeed).toBe(seed);
    invalidate(s);
    expect(computeDerived(s)).toEqual(before);
  });

  it('la semilla propia sale de la común: dos partidas con la misma semilla traen el mismo plasmodio', () => {
    const a = actOneState();
    const b = actOneState();
    for (const s of [a, b]) {
      s.stats.sporulations = 10;
      s.stats.runTime = 300;
      checkPartnerUnlocks(s);
    }
    expect(a.partners.plasmodium).toEqual(b.partners.plasmodium);
  });

  it('una partida 1.x que vuelve de offline lo recibe al aplicar el tiempo si ya cumple', () => {
    const s = actOneState();
    s.stats.sporulations = 10;
    s.stats.runTime = 600;
    applyOffline(s, NOW, NOW + 3_600_000);
    expect(s.partners.plasmodium).not.toBeNull();
    // Llegó al final: no recibe el tiempo en que no existía.
    expect(s.partners.plasmodium?.pendingMs).toBe(0);
  });
});

describe('tiempo del socio', () => {
  function withPartner(): GameState {
    const s = createState(9, NOW);
    s.partners.plasmodium = createPlasmodium(1);
    return s;
  }

  it('sin el modelo cargado, el tiempo en vivo se apunta como pendiente, con su tope de 8 h', () => {
    const s = withPartner();
    for (let i = 0; i < 20; i += 1) advancePartners(s, 50);
    expect(s.partners.plasmodium?.pendingMs).toBe(1000);
    advancePartners(s, 9 * 3600 * 1000);
    expect(s.partners.plasmodium?.pendingMs).toBe(8 * 3600 * 1000);
  });

  it('al registrar el modelo, el pendiente se aplica y queda en 0', () => {
    const s = withPartner();
    advancePartners(s, 5000);
    registerPartnerRuntime(countingRuntime);
    advancePartners(s, 50);
    expect(s.partners.plasmodium?.pendingMs).toBe(0);
    expect(s.partners.plasmodium?.trail).toBe(5050);
  });

  it('el offline usa el tope y la eficiencia del socio con el hueco real; con Latencia, 100 % y 24 h', () => {
    const s = withPartner();
    const notes = applyPartnersElapsed(s, 10 * 3600, 'offline');
    expect(notes).toEqual([{ partner: 'plasmodium', seconds: 8 * 3600, efficiency: 0.5, capped: true }]);
    expect(s.partners.plasmodium?.pendingMs).toBe(4 * 3600 * 1000);

    const t = withPartner();
    if (t.partners.plasmodium) t.partners.plasmodium.upgrades.dormancy = 1;
    applyPartnersElapsed(t, 10 * 3600, 'offline');
    expect(t.partners.plasmodium?.pendingMs).toBe(10 * 3600 * 1000);
  });

  it('en segundo plano cuenta al 100 %', () => {
    const s = withPartner();
    applyPartnersElapsed(s, 120, 'background');
    expect(s.partners.plasmodium?.pendingMs).toBe(120_000);
  });

  it('un reloj que retrocede o un hueco no finito no apuntan nada', () => {
    const s = withPartner();
    expect(applyPartnersElapsed(s, -50, 'offline')).toEqual([]);
    expect(applyPartnersElapsed(s, Number.NaN, 'offline')).toEqual([]);
    advancePartners(s, -1000);
    expect(s.partners.plasmodium?.pendingMs).toBe(0);
  });

  it('si el modelo lanza a mitad, ni el Rastro ni el reloj cambian, el tiempo queda pendiente y el bucle sigue', () => {
    const s = withPartner();
    advancePartners(s, 3000);
    registerPartnerRuntime({
      id: 'plasmodium',
      advance(_state, p) {
        p.trail += 999;
        p.clockMs = 500;
        throw new Error('modelo roto');
      },
      notice: () => null,
    });
    const errors: unknown[] = [];
    setPartnerErrorHandler((_id, error) => errors.push(error));
    advancePartners(s, 50);
    expect(errors).toHaveLength(1);
    expect(s.partners.plasmodium?.trail).toBe(0);
    expect(s.partners.plasmodium?.clockMs).toBe(0);
    expect(s.partners.plasmodium?.pendingMs).toBe(3050);
  });
});

describe('el socio y la red', () => {
  it('computeDerived da lo mismo con el plasmodio en cualquier estado que con null', () => {
    const s = actOneState();
    const without = computeDerived(s);
    const p = createPlasmodium(3);
    p.trail = 1e15;
    p.trailEarned = 1e16;
    p.upgrades.agar = 40;
    p.plates[0] = {
      foods: [1, 2],
      lamps: [],
      flow: 2,
      map: { score: 3, quality: 0.8, cost: 1, tolerance: 1, alive: 9, joined: 4 },
    };
    s.partners.plasmodium = p;
    invalidate(s);
    expect(computeDerived(s)).toEqual(without);
  });

  it('una gota atrapada o caída sola humedece el agar 30 s; la red no cambia', () => {
    const s = createState(2, NOW);
    const p = createPlasmodium(1);
    s.partners.plasmodium = p;
    const before = structuredClone({ ...s, partners: null });
    noteFungalEvent(s, { event: { type: 'rainCaught', effect: 'dew', amount: 10, duration: 0 } });
    expect(p.moistFor).toBe(MOIST_SECONDS);
    p.moistFor = 0;
    noteFungalEvent(s, { event: { type: 'rainFell', effect: 'downpour', amount: 0, duration: 60 } });
    expect(p.moistFor).toBe(MOIST_SECONDS);
    noteFungalEvent(s, { event: { type: 'click', value: 1 } });
    expect({ ...s, partners: null }).toEqual(before);
  });

  it('las ventajas se abren al cartografiar: Poda con una placa, Camino corto con dos', () => {
    const s = createState(2, NOW);
    expect(partnerPerks(s)).toEqual({ autobuyByPayback: false, sporeRate: false });
    const p = createPlasmodium(1);
    s.partners.plasmodium = p;
    expect(partnerPerks(s)).toEqual({ autobuyByPayback: false, sporeRate: false });
    const map = { score: 3, quality: 0.8, cost: 1, tolerance: 1, alive: 9, joined: 4 };
    Object.assign(p.plates[0] ?? {}, { map });
    expect(partnerPerks(s)).toEqual({ autobuyByPayback: true, sporeRate: false });
    Object.assign(p.plates[1] ?? {}, { map });
    expect(partnerPerks(s)).toEqual({ autobuyByPayback: true, sporeRate: true });
  });
});

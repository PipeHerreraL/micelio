import { beforeEach, describe, expect, it } from 'vitest';
import { drain } from '../src/core/events.ts';
import { computeDerived, invalidate } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { PLASMODIUM_ACHIEVEMENT_IDS } from '../src/data/plasmodium.ts';
import {
  buyPlasmodiumUpgrade,
  openPlate,
  placeItem,
  pulse,
  respread,
  setFlow,
  siteAction,
} from '../src/partners/plasmodium/actions.ts';
import { openPlateRate, stepSecond } from '../src/partners/plasmodium/advance.ts';
import { measure } from '../src/partners/plasmodium/metrics.ts';
import { previewScore, MEETS_BONUS } from '../src/partners/plasmodium/preview.ts';
import { createPlasmodium, effectiveFlow, type PlasmodiumState } from '../src/partners/plasmodium/state.ts';

/** Acciones del jugador sobre el plasmodio (docs/ROADMAP.md, fase 9). */

const NOW = Date.UTC(2026, 9, 1);
const MAP = { score: 2, quality: 0.7, cost: 1.2, tolerance: 0.8, alive: 9, joined: 3 };

beforeEach(() => {
  drain();
});

function game(): { state: GameState; p: PlasmodiumState } {
  const state = createState(4, NOW);
  const p = createPlasmodium(9);
  state.partners.plasmodium = p;
  return { state, p };
}

describe('poner, cambiar y quitar', () => {
  it('pone copos hasta el límite, el primero da su logro y cada cambio vuelve a extender la red', () => {
    const { state, p } = game();
    p.conductivity = p.conductivity.map(() => 0.01);
    for (const site of [7, 1, 16, 18]) placeItem(state, { site, tool: 'food' });
    expect(p.plates[0]?.foods).toEqual([7, 1, 16, 18]);
    expect(p.achievements).toEqual(['firstOat']);
    expect(Math.min(...p.conductivity)).toBe(0.3);
    expect(siteAction(p, 3, 'food')).toBe('noFood');
    placeItem(state, { site: 3, tool: 'food' });
    expect(p.plates[0]?.foods).toHaveLength(4);
    expect(p.stats.placements).toBe(4);
  });

  it('con la herramienta del mismo tipo un sitio ocupado se vacía; con la otra, se cambia', () => {
    const { state, p } = game();
    p.upgrades.lamps = 1;
    placeItem(state, { site: 5, tool: 'food' });
    placeItem(state, { site: 5, tool: 'food' });
    expect(p.plates[0]?.foods).toEqual([]);
    placeItem(state, { site: 5, tool: 'lamp' });
    expect(siteAction(p, 5, 'food')).toBe('toFood');
    placeItem(state, { site: 5, tool: 'food' });
    expect(p.plates[0]).toMatchObject({ foods: [5], lamps: [] });
    placeItem(state, { site: 5, tool: 'remove' });
    expect(p.plates[0]).toMatchObject({ foods: [], lamps: [] });
  });

  it('un sitio fijo, bloqueado, fuera de rango o sin inventario no cambia nada', () => {
    const { state, p } = game();
    // Tronco sin lámparas.
    placeItem(state, { site: 2, tool: 'lamp' });
    placeItem(state, { site: -1, tool: 'food' });
    placeItem(state, { site: 20, tool: 'food' });
    placeItem(state, { site: 1.5, tool: 'food' });
    expect(p.plates[0]).toMatchObject({ foods: [], lamps: [] });
    expect(p.stats.placements).toBe(0);

    // Laberinto: la avena ya está puesta y sus copos son fijos.
    Object.assign(p.plates[0] ?? {}, { map: { ...MAP } });
    openPlate(state, { plate: 1 });
    expect(siteAction(p, 4, 'food')).toBe('foodLocked');
    expect(siteAction(p, 0, 'remove')).toBe('fixed');
    placeItem(state, { site: 4, tool: 'food' });
    placeItem(state, { site: 27, tool: 'lamp' });
    expect(p.plates[1]).toMatchObject({ foods: [], lamps: [] });
  });

  it('en el Archipiélago la luz fija no admite nada', () => {
    const { state, p } = game();
    Object.assign(p.plates[0] ?? {}, { map: { ...MAP } });
    Object.assign(p.plates[1] ?? {}, { map: { ...MAP } });
    openPlate(state, { plate: 2 });
    expect(siteAction(p, 4, 'food')).toBe('blocked');
    placeItem(state, { site: 4, tool: 'food' });
    expect(p.plates[2]?.foods).toEqual([]);
  });
});

describe('pulso', () => {
  it('da 3 pasos y 3 s del Rastro de la placa abierta y espera 3 s; sin estar listo no hace nada', () => {
    const { state, p } = game();
    for (const site of [7, 1, 16, 18]) placeItem(state, { site, tool: 'food' });
    pulse(state);
    expect(p.step).toBe(3);
    expect(p.trail).toBeCloseTo(3 * openPlateRate(p, measure(p)), 9);
    expect(p.pulseIn).toBe(3);
    expect(p.pulsedHere).toBe(true);
    const trail = p.trail;
    pulse(state);
    expect(p.step).toBe(3);
    expect(p.trail).toBe(trail);
    expect(drain().filter((e) => e.type === 'plasmodium' && e.kind === 'pulse')).toHaveLength(1);
    stepSecond(p);
    stepSecond(p);
    stepSecond(p);
    expect(p.pulseIn).toBe(0);
  });
});

describe('caudal, extender y abrir placa', () => {
  it('el caudal solo cambia en una placa cartografiada y con dos placas cartografiadas', () => {
    const { state, p } = game();
    setFlow(state, { flow: 2 });
    expect(p.plates[0]?.flow).toBe(1);
    Object.assign(p.plates[0] ?? {}, { map: { ...MAP } });
    setFlow(state, { flow: 2 });
    expect(p.plates[0]?.flow).toBe(1);
    Object.assign(p.plates[1] ?? {}, { map: { ...MAP } });
    setFlow(state, { flow: 2 });
    expect(p.plates[0]?.flow).toBe(2);
    expect(effectiveFlow(p, 0)).toBe(2);
    // La frontera siempre corre con el caudal Medio.
    Object.assign(p.plates[2] ?? {}, { flow: 0 });
    expect(effectiveFlow(p, 2)).toBe(1);
  });

  it('extender de nuevo cubre la placa con el azar propio y no toca colocación, habituación ni Rastro', () => {
    const { state, p } = game();
    placeItem(state, { site: 3, tool: 'food' });
    p.conductivity = p.conductivity.map(() => 0.02);
    p.trail = 77;
    const seed = state.rngSeed;
    const own = p.rngSeed;
    respread(state);
    expect(Math.min(...p.conductivity)).toBeGreaterThanOrEqual(0.98);
    expect(p.plates[0]?.foods).toEqual([3]);
    expect(p.trail).toBe(77);
    expect(state.rngSeed).toBe(seed);
    expect(p.rngSeed).not.toBe(own);
  });

  it('abrir una placa exige la anterior cartografiada y solo avanza la semilla propia', () => {
    const { state, p } = game();
    openPlate(state, { plate: 1 });
    expect(p.plate).toBe(0);
    Object.assign(p.plates[0] ?? {}, { map: { ...MAP } });
    const seed = state.rngSeed;
    openPlate(state, { plate: 1 });
    expect(p.plate).toBe(1);
    expect(state.rngSeed).toBe(seed);
    // Volver a una placa cartografiada recupera su colocación.
    Object.assign(p.plates[0] ?? {}, { foods: [7, 1] });
    openPlate(state, { plate: 0 });
    expect(p.plates[p.plate]?.foods).toEqual([7, 1]);
  });
});

describe('mejoras', () => {
  it('cuestan base × 2^nivel en Rastro y no se compran sin Rastro, sin aparecer o en el tope', () => {
    const { state, p } = game();
    p.trail = 1000;
    p.trailEarned = 1000;
    buyPlasmodiumUpgrade(state, { id: 'agar' });
    buyPlasmodiumUpgrade(state, { id: 'agar' });
    expect(p.upgrades.agar).toBe(2);
    expect(p.trail).toBe(1000 - 50 - 100);
    // Lámpara aparece con una placa cartografiada.
    p.trail = 1e9;
    buyPlasmodiumUpgrade(state, { id: 'lamps' });
    expect(p.upgrades.lamps).toBe(0);
    Object.assign(p.plates[0] ?? {}, { map: { ...MAP } });
    buyPlasmodiumUpgrade(state, { id: 'dormancy' });
    buyPlasmodiumUpgrade(state, { id: 'dormancy' });
    expect(p.upgrades.dormancy).toBe(1);
    p.trail = 10;
    buyPlasmodiumUpgrade(state, { id: 'agar' });
    expect(p.upgrades.agar).toBe(2);
    buyPlasmodiumUpgrade(state, { id: 'volar' as 'agar' });
    expect(p.trail).toBe(10);
  });

  it('los logros del plasmodio no cambian el multiplicador global de la red', () => {
    const { state, p } = game();
    const before = computeDerived(state);
    p.achievements = [...PLASMODIUM_ACHIEVEMENT_IDS];
    invalidate(state);
    expect(computeDerived(state)).toEqual(before);
  });
});

describe('previsualizar', () => {
  it('puntúa una colocación sin tocar el plasmodio: la de referencia cumple tras 600 pasos', () => {
    const { p } = game();
    const before = structuredClone(p);
    const good = previewScore(p, [7, 1, 16, 18], [], 600);
    expect(good).toBeGreaterThan(MEETS_BONUS);
    expect(p).toEqual(before);
    expect(previewScore(p, [7], [], 50)).toBeLessThan(MEETS_BONUS);
  });
});

import { describe, expect, it } from 'vitest';
import { adaptationsUnlocked, buyAdaptation, nextAdaptationCost, sporulate } from '../src/core/actions.ts';
import { derived, invalidate } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { offlineCapSeconds } from '../src/systems/offline.ts';
import { dropLifetime } from '../src/systems/rain.ts';
import { parseSave } from '../src/systems/save.ts';

const NOW = Date.UTC(2026, 9, 1);

function treeComplete(available = 10_000): GameState {
  const state = createState(8, NOW);
  state.mutations = [...MUTATION_IDS];
  state.spores = { level: 2000, available };
  invalidate(state);
  return state;
}

describe('madurez de la red', () => {
  it('hasta el nivel 1000 el bono de esporas sigue siendo de un 1 % por nivel', () => {
    const state = createState(1, NOW);
    state.spores.level = 1000;
    invalidate(state);
    // 1 + 0.01 · 1000 = 11
    expect(derived(state).sporeFactor).toBeCloseTo(11, 10);
  });

  it('por encima del umbral el nivel 4000 rinde ×21 y no ×41', () => {
    const state = createState(1, NOW);
    state.spores.level = 4000;
    invalidate(state);
    // 1 + 0.01 · 1000 · √(4000 / 1000) = 1 + 10 · 2 = 21
    expect(derived(state).sporeFactor).toBeCloseTo(21, 10);
  });

  it('cada rango de Cuerpo apical sube el umbral un 10 %', () => {
    const state = createState(1, NOW);
    state.adaptations.apicalBody = 2;
    invalidate(state);
    // 1000 · 1.1² = 1210
    expect(derived(state).sporeThreshold).toBeCloseTo(1210, 6);
  });

  it('una partida de la 1.x con nivel 4037 conserva su bono al migrar', () => {
    const state = createState(2, NOW);
    state.spores = { level: 4037, available: 300 };
    const { adaptations: _a, sporeFloor: _f, ...v3 } = state;
    const result = parseSave(JSON.stringify({ version: 3, savedAt: NOW, state: v3 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state.sporeFloor).toBe(4037);
    // El suelo deja el umbral en 4037: 1 + 0.01 · 4037 = 41.37, igual que antes de la madurez.
    expect(derived(result.save.state).sporeFactor).toBeCloseTo(41.37, 10);
  });

  it('una partida de la 1.x por debajo del umbral migra sin suelo', () => {
    const state = createState(3, NOW);
    state.spores = { level: 500, available: 0 };
    const { adaptations: _a, sporeFloor: _f, ...v3 } = state;
    const result = parseSave(JSON.stringify({ version: 3, savedAt: NOW, state: v3 }));
    expect(result.ok && result.save.state.sporeFloor).toBe(0);
  });
});

describe('adaptaciones', () => {
  it('no se pueden comprar hasta completar el árbol de mutaciones', () => {
    const state = createState(4, NOW);
    state.spores = { level: 50, available: 10_000 };
    expect(adaptationsUnlocked(state)).toBe(false);
    buyAdaptation(state, { id: 'apicalBody' });
    expect(state.adaptations.apicalBody).toBe(0);
    expect(state.spores.available).toBe(10_000);
  });

  it('comprar un rango gasta esporas disponibles pero no baja el nivel', () => {
    const state = treeComplete(1000);
    // Cuerpo apical: 300 · 2^0 = 300, luego 300 · 2^1 = 600.
    expect(nextAdaptationCost(state, 'apicalBody')).toBe(300);
    buyAdaptation(state, { id: 'apicalBody' });
    expect(state.adaptations.apicalBody).toBe(1);
    expect(state.spores).toEqual({ level: 2000, available: 700 });
    expect(nextAdaptationCost(state, 'apicalBody')).toBe(600);
    // Con 700 alcanza para el segundo rango (600) y no para el tercero (1200).
    buyAdaptation(state, { id: 'apicalBody' });
    buyAdaptation(state, { id: 'apicalBody' });
    expect(state.adaptations.apicalBody).toBe(2);
    expect(state.spores.available).toBe(100);
  });

  it('una adaptación con tope no pasa de su rango máximo', () => {
    const state = treeComplete(1e9);
    for (let i = 0; i < 10; i += 1) buyAdaptation(state, { id: 'hydraulicLift' });
    expect(state.adaptations.hydraulicLift).toBe(4);
    expect(nextAdaptationCost(state, 'hydraulicLift')).toBeNull();
  });

  it('el Esclerocio hace empezar cada partida con 10^(3 + rango) nutrientes', () => {
    const state = treeComplete();
    state.adaptations.sclerotium = 2;
    // Con Esporas aladas, E(1e14) = ⌊18.75 · √1e6⌋ = 18 750 > nivel 2000: se puede esporular.
    state.runEarned = 1e9;
    state.lifetimeEarned = 1e14;
    state.forest.earned = 1e14;
    sporulate(state, { now: NOW });
    expect(state.stats.sporulations).toBe(1);
    // 10^(3+2) = 1e5, más los 100 N de Memoria del suelo.
    expect(state.nutrients).toBeCloseTo(1e5 + 100, 6);
  });

  it('la Redistribución hidráulica alarga la gota 2 s por rango', () => {
    const state = treeComplete();
    state.adaptations.hydraulicLift = 3;
    // 12 + 2 · 3 = 18 s
    expect(dropLifetime(state)).toBe(18);
  });

  it('el Letargo profundo suma 6 h al tope offline por rango', () => {
    const state = treeComplete();
    state.adaptations.deepTorpor = 2;
    // Con Sueño invernal (en el árbol completo) el tope es 24 h; + 2 · 6 h = 36 h.
    expect(offlineCapSeconds(state)).toBe(36 * 3600);
  });
});

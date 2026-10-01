import { describe, expect, it } from 'vitest';
import { markSeen } from '../src/core/actions.ts';
import { createState } from '../src/core/state.ts';
import { isTabAvailable } from '../src/ui/app.ts';
import { revealState } from '../src/ui/tab-generators.ts';

const fresh = () => createState(7, Date.UTC(2026, 9, 1));

describe('revelación progresiva', () => {
  it('al empezar no se ve ningún generador ni ninguna pestaña', () => {
    const state = fresh();
    expect(revealState(state, 'hypha')).toBe('hidden');
    for (const tab of [
      'generators',
      'upgrades',
      'sporulate',
      'mutations',
      'achievements',
      'stats',
      'settings',
    ] as const) {
      expect(isTabAvailable(tab, state)).toBe(false);
    }
  });

  it('la Hifa aparece en silueta con la mitad de su coste y completa al poder comprarla', () => {
    const state = fresh();
    // Coste de la primera Hifa: 10 N; la mitad, 5 N.
    state.nutrients = 4.9;
    expect(revealState(state, 'hypha')).toBe('hidden');
    state.nutrients = 5;
    expect(revealState(state, 'hypha')).toBe('silhouette');
    state.nutrients = 10;
    expect(revealState(state, 'hypha')).toBe('full');
  });

  it('un generador revelado no vuelve a ocultarse al gastar los nutrientes', () => {
    const state = fresh();
    state.nutrients = 6;
    markSeen(state, { key: 'gen.hypha.silhouette' });
    state.nutrients = 0;
    expect(revealState(state, 'hypha')).toBe('silhouette');
  });

  it('el Gigante de Malheur no aparece antes de la primera esporulación aunque alcancen los nutrientes', () => {
    const state = fresh();
    state.nutrients = 1e12;
    expect(revealState(state, 'malheur')).toBe('hidden');
    state.stats.sporulations = 1;
    expect(revealState(state, 'malheur')).toBe('full');
  });

  it('Generadores, Estadísticas y Ajustes aparecen con el primer generador a la vista', () => {
    const state = fresh();
    state.nutrients = 5;
    expect(isTabAvailable('generators', state)).toBe(true);
    expect(isTabAvailable('stats', state)).toBe(true);
    expect(isTabAvailable('settings', state)).toBe(true);
  });

  it('Mejoras aparece con la primera mejora disponible', () => {
    const state = fresh();
    expect(isTabAvailable('upgrades', state)).toBe(false);
    // La primera mejora de la Hifa aparece al poseer 1 unidad.
    state.owned.hypha = 1;
    expect(isTabAvailable('upgrades', state)).toBe(true);
  });

  it('Esporular aparece al 25 % del requisito y Mutaciones tras la primera esporulación', () => {
    const state = fresh();
    // 25 % de 1e8 = 2.5e7 N ganados en la partida.
    state.runEarned = 2.49e7;
    expect(isTabAvailable('sporulate', state)).toBe(false);
    state.runEarned = 2.5e7;
    expect(isTabAvailable('sporulate', state)).toBe(true);
    expect(isTabAvailable('mutations', state)).toBe(false);
    state.stats.sporulations = 1;
    expect(isTabAvailable('mutations', state)).toBe(true);
  });

  it('Logros aparece con el primer logro', () => {
    const state = fresh();
    expect(isTabAvailable('achievements', state)).toBe(false);
    state.achievements.push('own.hypha.1');
    expect(isTabAvailable('achievements', state)).toBe(true);
  });
});

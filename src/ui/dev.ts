/**
 * Panel de desarrollo: acelerador de tiempo y atajos para probar la partida hasta la
 * tercera esporulación (PROMPT.md §22). main.ts lo importa solo con import.meta.env.DEV,
 * así que no llega al build de producción.
 */
import { gain } from '../core/economy.ts';
import { emit } from '../core/events.ts';
import * as num from '../core/num.ts';
import { mixSeed } from '../core/rng.ts';
import type { GameState } from '../core/state.ts';
import { t } from '../i18n/index.ts';
import { applyBackground } from '../systems/offline.ts';
import { checkAchievements } from '../systems/achievements.ts';
import { checkActOne, checkColonization } from '../systems/journey.ts';
import { invalidate } from '../core/selectors.ts';
import { COLONIZE_LEVEL } from '../data/biomes.ts';
import { MUTATION_IDS } from '../data/mutations.ts';
import { STABLE_SECONDS } from '../data/plasmodium.ts';
// Solo en desarrollo: este panel no llega al build, así que puede cargar el modelo del socio.
import { gainTrail } from '../partners/plasmodium/advance.ts';
import { frontier, plasmodiumCore, plateDef } from '../partners/plasmodium/state.ts';
import { h } from './dom.ts';
import type { Store } from './store.ts';

export interface DevControls {
  setSpeed(factor: number): void;
  getSpeed(): number;
}

const SPEEDS = [1, 10, 100, 1000];

export function createDevPanel(store: Store, controls: DevControls): HTMLElement {
  const speedButtons = SPEEDS.map((factor) => {
    const button = h('button', {
      class: 'dev__button',
      text: t('dev.speed', { factor }),
      attrs: { type: 'button' },
    });
    button.addEventListener('click', () => {
      controls.setSpeed(factor);
      for (const b of speedButtons) b.setAttribute('aria-pressed', String(b === button));
    });
    button.setAttribute('aria-pressed', String(factor === controls.getSpeed()));
    return button;
  });
  const act = (label: string, fn: (state: GameState) => void): HTMLButtonElement => {
    const button = h('button', { class: 'dev__button', text: label, attrs: { type: 'button' } });
    button.addEventListener('click', () => {
      store.dispatch(fn, undefined);
    });
    return button;
  };
  return h('aside', { class: 'dev' }, [
    h('p', { class: 'dev__title', text: t('dev.title') }),
    ...speedButtons,
    act(t('dev.skipHour'), (state) => {
      applyBackground(state, 3600);
    }),
    act(t('dev.give'), (state) => {
      gain(state, num.max(num.mul(state.nutrients, 9), 1000));
    }),
    act(t('dev.drop'), (state) => {
      state.rain.nextIn = 0;
    }),
    // Viento de esporas (fase 8): atajos para probar el viaje sin jugar horas.
    act(t('dev.actOne'), (state) => {
      state.mutations = [...MUTATION_IDS];
      state.owned.planetary = Math.max(1, state.owned.planetary);
      state.spores.available += 2000;
      invalidate(state);
      checkAchievements(state);
      checkActOne(state);
    }),
    act(t('dev.colonize'), (state) => {
      state.spores.level = Math.max(state.spores.level, COLONIZE_LEVEL);
      checkColonization(state, Date.now());
      invalidate(state);
    }),
    // Socios (fase 9): traer al plasmodio sin esperar a su regla de llegada, como
    // checkPartnerUnlocks (misma semilla y mismo evento, así sale la lámina).
    act(t('dev.partner'), (state) => {
      if (state.partners.plasmodium !== null) return;
      state.partners.plasmodium = plasmodiumCore.create(mixSeed(state.rngSeed, plasmodiumCore.seedSalt));
      emit({ type: 'partnerUnlocked', partner: 'plasmodium' });
    }),
    // Deja la frontera lista para fructificar con un guardado válido: el Rastro sube con gainTrail
    // (ganado ≥ disponible y cartografía, como exige el validador) y la estabilidad queda llena. El
    // siguiente segundo de modelo fructifica si la red cumple el objetivo.
    act(t('dev.plate'), (state) => {
      const p = state.partners.plasmodium;
      if (!p || frontier(p) !== p.plate) return;
      gainTrail(p, num.max(num.ZERO, num.sub(plateDef(p.plate).trailGoal, p.mapping)));
      p.stableFor = STABLE_SECONDS;
      p.goalMet = true;
    }),
  ]);
}

/**
 * Panel de desarrollo: acelerador de tiempo y atajos para probar la partida hasta la
 * tercera esporulación (PROMPT.md §22). main.ts lo importa solo con import.meta.env.DEV,
 * así que no llega al build de producción.
 */
import { gain } from '../core/economy.ts';
import * as num from '../core/num.ts';
import type { GameState } from '../core/state.ts';
import { t } from '../i18n/index.ts';
import { applyBackground } from '../systems/offline.ts';
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
  ]);
}

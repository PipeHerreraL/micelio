// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { drain } from '../src/core/events.ts';
import { invalidate } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { createPlasmodium } from '../src/partners/plasmodium/state.ts';
import { h } from '../src/ui/dom.ts';
import { createStore, type Store } from '../src/ui/store.ts';
import { createAchievementsTab } from '../src/ui/tab-achievements.ts';
import { createGeneratorsTab } from '../src/ui/tab-generators.ts';
import { createSporulateTab } from '../src/ui/tab-sporulate.ts';
import type { TabView } from '../src/ui/tabs.ts';

/**
 * Las correspondencias del plasmodio en las pestañas de la red (fase 9), sin navegador: la Poda
 * en Generadores, Camino corto en Esporular y el grupo «Del plasmodio» en Logros.
 */

const NOW = Date.UTC(2026, 9, 1);
const MAP = { score: 3, quality: 0.8, cost: 1, tolerance: 1, alive: 9, joined: 4 };

const mounted: TabView[] = [];

afterEach(() => {
  for (const tab of mounted.splice(0)) tab.destroy();
  document.body.replaceChildren();
  drain();
});

/** Monta una pestaña dentro de un panel enfocable, como tabs.ts, y la pinta una vez. */
function mount(tab: TabView): TabView {
  document.body.append(h('section', { attrs: { role: 'tabpanel', tabindex: 0 } }, [tab.root]));
  mounted.push(tab);
  tab.update();
  return tab;
}

function withPlasmodium(s: GameState, mapped: number): GameState {
  const p = createPlasmodium(1);
  for (let i = 0; i < mapped; i += 1) Object.assign(p.plates[i] ?? {}, { map: { ...MAP } });
  s.partners.plasmodium = p;
  return s;
}

/** Visible de verdad: ni él ni ningún antepasado lleva `hidden`. */
const isShown = (el: Element | null): boolean => el !== null && el.closest('[hidden]') === null;

describe('Poda en Generadores', () => {
  function autobuyState(): GameState {
    const s = createState(42, NOW);
    s.mutations = ['instinct'];
    s.owned.hypha = 10;
    s.autobuy.generators.hypha = true;
    invalidate(s);
    return s;
  }

  const modeGroup = (root: HTMLElement): HTMLElement | null =>
    root.querySelector<HTMLElement>('[role="group"][aria-label="Cómo elige la autocompra"]');
  const thresholdGroup = (root: HTMLElement): HTMLElement | null =>
    root.querySelector<HTMLElement>('[role="group"][aria-label="Umbral de autocompra"]');
  const button = (root: HTMLElement, text: string): HTMLButtonElement | undefined =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === text);

  it('el grupo de modo aparece solo con la ventaja', () => {
    for (const mapped of [null, 0]) {
      const s = autobuyState();
      if (mapped !== null) withPlasmodium(s, mapped);
      const tab = mount(createGeneratorsTab(createStore(s)));
      expect(isShown(thresholdGroup(tab.root))).toBe(true);
      expect(isShown(modeGroup(tab.root))).toBe(false);
    }
    const tab = mount(createGeneratorsTab(createStore(withPlasmodium(autobuyState(), 1))));
    expect(isShown(modeGroup(tab.root))).toBe(true);
  });

  it('sus botones llevan aria-pressed y en modo amortización ocultan el umbral y dicen para qué ahorra', () => {
    const store: Store = createStore(withPlasmodium(autobuyState(), 1));
    const tab = mount(createGeneratorsTab(store));
    const group = modeGroup(tab.root);
    const byThreshold = group ? button(group, 'Por umbral') : undefined;
    const byPayback = group ? button(group, 'Lo que antes se amortiza') : undefined;
    expect(byThreshold?.getAttribute('aria-pressed')).toBe('true');
    expect(byPayback?.getAttribute('aria-pressed')).toBe('false');

    byPayback?.click();
    tab.update();
    expect(store.state.autobuy.mode).toBe('payback');
    expect(byThreshold?.getAttribute('aria-pressed')).toBe('false');
    expect(byPayback?.getAttribute('aria-pressed')).toBe('true');
    expect(isShown(thresholdGroup(tab.root))).toBe(false);
    // 10 Hifas dan 1 N/s y la siguiente cuesta 10·1,15^10 = 40,46 N: 41 s con 0 N.
    const saving = tab.root.querySelector('.autobuy__saving');
    expect(isShown(saving)).toBe(true);
    expect(saving?.textContent).toBe('Ahorrando para: Hifa (41 s)');

    // Sin nada activado no hay para qué ahorrar.
    store.state.autobuy.generators.hypha = false;
    store.state.stats.totalTime += 1;
    tab.update();
    expect(saving?.textContent).toBe('Nada que comprar entre lo activado.');

    byThreshold?.click();
    tab.update();
    expect(store.state.autobuy.mode).toBe('threshold');
    expect(isShown(thresholdGroup(tab.root))).toBe(true);
    expect(isShown(saving)).toBe(false);
  });
});

describe('Camino corto en Esporular', () => {
  /** E = ⌊15·√(4e8 / 1e8)⌋ = 30 esporas; con nivel 0, esporularía 30. */
  function sporeState(mapped: number): GameState {
    const s = withPlasmodium(createState(42, NOW), mapped);
    s.forest.earned = 4e8;
    s.runEarned = 4e8;
    s.lifetimeEarned = 4e8;
    invalidate(s);
    return s;
  }

  const rateBox = (root: HTMLElement): HTMLElement | null => root.querySelector<HTMLElement>('.spore__rate');

  it('aparece solo con 2 placas cartografiadas', () => {
    for (const mapped of [0, 1]) {
      const tab = mount(createSporulateTab(createStore(sporeState(mapped))));
      expect(isShown(rateBox(tab.root))).toBe(false);
    }
    const tab = mount(createSporulateTab(createStore(sporeState(2))));
    expect(isShown(rateBox(tab.root))).toBe(true);
    expect(rateBox(tab.root)?.textContent).toContain('Camino corto, un regalo del plasmodio.');
  });

  it('da el ritmo de ahora y el de la siguiente espora con valores a mano', () => {
    const s = sporeState(2);
    s.stats.runTime = 600;
    // 10 Anillos de hadas: 3.200 N/s. La espora 31 pide 1e8·(31/15)² = 427.111.111 N: faltan
    // 27.111.111, es decir 8.472,2 s (2 h 21 min). Ritmo: 30 ÷ 10 min = 3; con la 31,
    // 31 · 60 ÷ (600 + 8.472,2) = 0,205.
    s.owned.fairyRing = 10;
    invalidate(s);
    const tab = mount(createSporulateTab(createStore(s)));
    expect(tab.root.querySelector('.spore__rate-now')?.textContent).toBe(
      'Ahora ganas 3 esporas por minuto de partida.',
    );
    expect(tab.root.querySelector('.spore__rate-next')?.textContent).toBe(
      'Con la siguiente espora, dentro de 2 h 21 min, serían 0,21 por minuto.',
    );
  });

  it('no muestra NaN ni Infinity con runTime 0, con o sin producción', () => {
    for (const fairyRing of [0, 10]) {
      const s = sporeState(2);
      s.stats.runTime = 0;
      s.owned.fairyRing = fairyRing;
      invalidate(s);
      const tab = mount(createSporulateTab(createStore(s)));
      const text = rateBox(tab.root)?.textContent ?? '';
      expect(text).not.toMatch(/NaN|Infinity|∞/);
      // Sin producción no hay «siguiente espora» que calcular: la línea se omite.
      expect(isShown(tab.root.querySelector('.spore__rate-next'))).toBe(fairyRing > 0);
    }
  });

  it('sin esporas ganadas lo dice en vez de dar un ritmo de 0', () => {
    const s = withPlasmodium(createState(42, NOW), 2);
    s.stats.runTime = 0;
    const tab = mount(createSporulateTab(createStore(s)));
    expect(tab.root.querySelector('.spore__rate-now')?.textContent).toBe(
      'Aún no ganas esporas en esta partida.',
    );
    expect(isShown(tab.root.querySelector('.spore__rate-next'))).toBe(false);
  });
});

describe('logros Del plasmodio', () => {
  const fungusLine = (root: HTMLElement): string =>
    root.querySelector('.tab--achievements > .tab__intro.tabular')?.textContent ?? '';

  it('no aparece sin el plasmodio', () => {
    mount(createAchievementsTab(createStore(createState(7, NOW))));
    expect(isShown(document.getElementById('achievements-plasmodium'))).toBe(false);
  });

  it('no cambia el contador de logros del hongo, lleva el suyo y oculta el secreto', () => {
    const without = createState(7, NOW);
    without.achievements = ['own.hypha.1'];
    const before = fungusLine(mount(createAchievementsTab(createStore(without))).root);
    document.body.replaceChildren();

    const s = withPlasmodium(structuredClone(without), 0);
    const p = s.partners.plasmodium;
    p?.achievements.push('firstOat');
    const store = createStore(s);
    const tab = mount(createAchievementsTab(store));
    expect(fungusLine(tab.root)).toBe(before);

    const title = document.getElementById('achievements-plasmodium');
    expect(isShown(title)).toBe(true);
    expect(title?.textContent).toBe('Del plasmodio');
    expect(title?.getAttribute('tabindex')).toBe('-1');
    const group = tab.root.querySelector<HTMLElement>('.ach-partner');
    expect(group?.textContent).toContain('1 de 8');
    expect(group?.querySelectorAll('.ach')).toHaveLength(8);
    expect(group?.querySelectorAll('.ach.is-done')).toHaveLength(1);
    // El secreto no dice su nombre ni su condición hasta conseguirlo.
    expect(group?.textContent).not.toContain('Paciencia de protista');
    expect(group?.querySelectorAll('.ach.is-secret')).toHaveLength(1);

    p?.achievements.push('noPulse');
    tab.update();
    expect(group?.textContent).toContain('Paciencia de protista');
    expect(group?.textContent).toContain('2 de 8');
    expect(group?.querySelectorAll('.ach.is-secret')).toHaveLength(0);
    expect(fungusLine(tab.root)).toBe(before);
  });
});

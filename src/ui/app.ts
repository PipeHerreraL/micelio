/**
 * Estructura de la pantalla (ARCHITECTURE.md §11): contador, núcleo y efectos; el corte del
 * suelo en el centro; las pestañas; y el ticker al pie. El CSS decide la disposición según
 * el ancho (escritorio, tableta, móvil); el DOM es el mismo.
 */
import { availableUpgrades } from '../core/economy.ts';
import { isActOneClosed } from '../core/forest.ts';
import { hasSeen, type GameState } from '../core/state.ts';
import { GENERATORS } from '../data/generators.ts';
import { SPORULATE_REQUIREMENT, SPORULATE_TAB_REVEAL } from '../data/prestige.ts';
import * as num from '../core/num.ts';
import { t } from '../i18n/index.ts';
import { h } from './dom.ts';
import { createHud, type Hud } from './hud.ts';
import { createNewsTicker } from './news.ts';
import { createRainDrop } from './rain-drop.ts';
import type { Store } from './store.ts';
import { createBiomeCaption } from './biome-caption.ts';
import type { ChapterNav } from './chapter.ts';
import { createAchievementsTab } from './tab-achievements.ts';
import { createChronicleTab } from './tab-chronicle.ts';
import { createGeneratorsTab, revealState } from './tab-generators.ts';
import { createMutationsTab } from './tab-mutations.ts';
import { createSporulateTab } from './tab-sporulate.ts';
import { createStatsTab } from './tab-stats.ts';
import { createUpgradesTab } from './tab-upgrades.ts';
import { createPartnersTab, type PartnersTabOptions } from './tab-partners.ts';
import { createTabs, type TabId, type TabView, type Tabs } from './tabs.ts';
import { PARTNER_IDS } from '../partners/ids.ts';
import type { GameEvent } from '../core/events.ts';

export interface App {
  root: HTMLElement;
  /** Capa del escenario sobre la que van el canvas y la gota. */
  stage: HTMLElement;
  /** Canvas decorativo de la red (aria-hidden). */
  canvas: HTMLCanvasElement;
  hud: Hud;
  tabs: Tabs;
  /** Refresco de la interfaz (como máximo 10 Hz). `now` en ms. */
  update(now: number): void;
  /** Cada frame (la placa del plasmodio con Socios a la vista). */
  frame(now: number): void;
  onEvent(event: GameEvent): void;
  setReducedMotion(on: boolean): void;
  destroy(): void;
}

export interface AppOptions {
  initialTab: TabId;
  onTabChange: (id: TabId) => void;
  onAbsorb: (button: HTMLButtonElement) => void;
  /** Vistas que se añaden en fases posteriores (esporular, mutaciones, ajustes). */
  extraViews?: (store: Store) => TabView[];
  /** Adónde llevan las láminas del viaje al cerrarse (también al releerlas en la Crónica). */
  nav: ChapterNav;
  /** Lo que la pestaña Socios necesita de fuera (fase 9). */
  partners: PartnersTabOptions;
}

function anyGeneratorVisible(state: GameState): boolean {
  return GENERATORS.some((g) => revealState(state, g.id) !== 'hidden');
}

/** Cuándo aparece cada pestaña (PROMPT.md §12, ARCHITECTURE.md §4.15). */
export function isTabAvailable(id: TabId, state: GameState): boolean {
  switch (id) {
    case 'generators':
    case 'stats':
    case 'settings':
      return anyGeneratorVisible(state);
    case 'upgrades':
      return availableUpgrades(state).length > 0;
    case 'achievements':
      return state.achievements.length > 0;
    case 'sporulate':
      return (
        state.stats.sporulations > 0 ||
        num.gte(state.runEarned, num.mul(SPORULATE_REQUIREMENT, SPORULATE_TAB_REVEAL))
      );
    case 'mutations':
      return state.stats.sporulations > 0;
    case 'chronicle':
      return isActOneClosed(state);
    case 'partners':
      return PARTNER_IDS.some((id) => state.partners[id] !== null);
  }
}

export function createApp(host: HTMLElement, store: Store, options: AppOptions): App {
  const hud = createHud(store, options.onAbsorb);
  const views: TabView[] = [
    createGeneratorsTab(store),
    createUpgradesTab(store),
    createSporulateTab(store),
    createMutationsTab(store),
    createChronicleTab(store, options.nav),
    createPartnersTab(store, options.partners),
    createAchievementsTab(store),
    createStatsTab(store),
    ...(options.extraViews?.(store) ?? []),
  ];
  const tabs = createTabs(store, views, isTabAvailable, options.initialTab, options.onTabChange);
  const news = createNewsTicker();
  const hudBox = h('div', { class: 'layout__hud' }, [hud.counter]);
  const coreBox = h('div', { class: 'layout__core' }, [hud.core]);
  const effectsBox = h('div', { class: 'layout__effects' }, [hud.effects]);
  const caption = createBiomeCaption(store);
  const drop = createRainDrop(
    store,
    () => stage,
    () => [
      ...[hudBox, coreBox, effectsBox].map((el) => el.getBoundingClientRect()),
      // La cartela del bioma tampoco: la gota caería debajo y no se podría atrapar (§4.22).
      ...(caption.root.hidden ? [] : [caption.root.getBoundingClientRect()]),
      // Los avisos se apilan sobre el escenario en escritorio: la gota tampoco cae debajo.
      ...Array.from(document.querySelectorAll('.toasts .toast'), (el) => el.getBoundingClientRect()),
    ],
  );

  // El canvas es decorativo: toda la información está también en el DOM (PROMPT.md §16).
  const canvas = h('canvas', { class: 'stage__canvas', attrs: { 'aria-hidden': 'true' } });
  const stage: HTMLElement = h('section', { class: 'stage', attrs: { 'aria-label': t('meta.title') } }, [
    h('div', { class: 'stage__soil', attrs: { 'aria-hidden': 'true' } }),
    canvas,
    caption.root,
    drop.root,
  ]);

  const main = h('main', { class: 'layout', id: 'game' }, [
    hudBox,
    stage,
    coreBox,
    effectsBox,
    h('div', { class: 'layout__panel' }, [tabs.root]),
    h('footer', { class: 'layout__footer' }, [news.root]),
  ]);
  const skip = h('a', { class: 'skip-link', text: t('app.skipToGame'), attrs: { href: '#game' } });
  // Los avisos y la región aria-live no van aquí: viven fuera de lo que se reconstruye
  // (main.ts) para que un cambio de idioma no borre los avisos fijos de guardado.
  const root = h('div', { class: 'app' }, [skip, main]);
  host.replaceChildren(root);

  return {
    root,
    stage,
    canvas,
    hud,
    tabs,
    update(now) {
      const state = store.state;
      hud.update();
      tabs.update();
      drop.update();
      caption.update();
      // El suelo de respaldo (CSS) cambia con el bioma antes de que el canvas lo pinte.
      if (stage.dataset.biome !== state.forest.biome) stage.dataset.biome = state.forest.biome;
      // Interfaz de partida nueva: sin pestañas hasta el primer generador, salvo que Ajustes
      // ya estuviera a mano (después de borrar la partida).
      const fresh = !anyGeneratorVisible(state) && !hasSeen(state, 'tab.settings');
      main.classList.toggle('layout--fresh', fresh);
      if (!fresh) news.update(state, now);
    },
    frame(now) {
      tabs.frame(now);
    },
    onEvent(event) {
      tabs.onEvent(event);
    },
    setReducedMotion(on) {
      tabs.setReducedMotion(on);
    },
    destroy() {
      hud.destroy();
      tabs.destroy();
      drop.destroy();
      root.remove();
    },
  };
}

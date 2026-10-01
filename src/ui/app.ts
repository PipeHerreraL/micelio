/**
 * Estructura de la pantalla (ARCHITECTURE.md §11): contador, núcleo y efectos; el corte del
 * suelo en el centro; las pestañas; y el ticker al pie. El CSS decide la disposición según
 * el ancho (escritorio, tableta, móvil); el DOM es el mismo.
 */
import type { GameState } from '../core/state.ts';
import { t } from '../i18n/index.ts';
import { h } from './dom.ts';
import { createHud, type Hud } from './hud.ts';
import { createLiveRegion } from './live.ts';
import { createGeneratorsTab } from './tab-generators.ts';
import { revealState } from './tab-generators.ts';
import { createTabs, type TabId, type TabView, type Tabs } from './tabs.ts';
import { createToastContainer } from './toasts.ts';
import type { Store } from './store.ts';
import { GENERATORS } from '../data/generators.ts';

export interface App {
  root: HTMLElement;
  /** Capa del escenario sobre la que van el canvas, la gota y los números flotantes. */
  stage: HTMLElement;
  hud: Hud;
  tabs: Tabs;
  /** Refresco de la interfaz (como máximo 10 Hz). */
  update(): void;
  destroy(): void;
}

export interface AppOptions {
  initialTab: TabId;
  onTabChange: (id: TabId) => void;
  onAbsorb: (button: HTMLButtonElement) => void;
  /** Vistas adicionales que se añaden por fases (mejoras, logros, ajustes…). */
  extraViews?: (store: Store) => TabView[];
  /** Contenido del pie (ticker de noticias). */
  footer?: HTMLElement;
}

function anyGeneratorVisible(state: GameState): boolean {
  return GENERATORS.some((g) => revealState(state, g.id) !== 'hidden');
}

/** Cuándo aparece cada pestaña (PROMPT.md §12). */
export function isTabAvailable(id: TabId, state: GameState): boolean {
  switch (id) {
    case 'generators':
    case 'stats':
    case 'settings':
      // Aparecen con el primer generador (a los pocos clics): al empezar solo se ven el
      // núcleo, el contador y la indicación (PROMPT.md §12). Ajustes no necesita antes: el
      // sonido está mudo hasta la primera interacción y prefers-reduced-motion se respeta solo.
      return anyGeneratorVisible(state);
    default:
      return false;
  }
}

export function createApp(host: HTMLElement, store: Store, options: AppOptions): App {
  const hud = createHud(store, options.onAbsorb);
  const views: TabView[] = [createGeneratorsTab(store), ...(options.extraViews?.(store) ?? [])];
  const tabs = createTabs(store, views, isTabAvailable, options.initialTab, options.onTabChange);

  const stage = h('section', { class: 'stage', attrs: { 'aria-label': t('meta.title') } }, [
    h('div', { class: 'stage__soil', attrs: { 'aria-hidden': 'true' } }),
  ]);

  const main = h('main', { class: 'layout', id: 'game' }, [
    h('div', { class: 'layout__hud' }, [hud.counter]),
    stage,
    h('div', { class: 'layout__core' }, [hud.core]),
    h('div', { class: 'layout__effects' }, [hud.effects]),
    h('div', { class: 'layout__panel' }, [tabs.root]),
    options.footer ? h('footer', { class: 'layout__footer' }, [options.footer]) : null,
  ]);
  const skip = h('a', { class: 'skip-link', text: t('app.skipToGame'), attrs: { href: '#game' } });
  const root = h('div', { class: 'app' }, [
    skip,
    main,
    createToastContainer(),
    createLiveRegion(t('live.region')),
  ]);
  host.replaceChildren(root);

  return {
    root,
    stage,
    hud,
    tabs,
    update() {
      hud.update();
      tabs.update();
      main.classList.toggle('layout--fresh', !anyGeneratorVisible(store.state));
    },
    destroy() {
      hud.destroy();
      tabs.destroy();
      root.remove();
    },
  };
}

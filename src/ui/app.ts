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
import { createPinning } from './pinning.ts';
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

/**
 * Escribe en `--hud-h` (en :root) la altura real de la cabecera. En el móvil es fija y crece con
 * «Esporularías ahora» y «Faltan…» (104–107 px medidos, no 64): la barra pegajosa de la placa del
 * plasmodio y el cálculo de su celda la leen para no quedar debajo. Solo escribe si cambia.
 * Devuelve la función que deja de observar.
 */
function trackHudHeight(hudBox: HTMLElement): () => void {
  let written = -1;
  const observer = new ResizeObserver(() => {
    // Hacia arriba: medio píxel de menos dejaría el borde de la barra bajo la cabecera.
    const height = Math.ceil(hudBox.getBoundingClientRect().height);
    if (height === written) return;
    written = height;
    document.documentElement.style.setProperty('--hud-h', `${height}px`);
  });
  observer.observe(hudBox);
  return () => {
    observer.disconnect();
  };
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
  // Lo que hace falta al cambiar de pestaña llega más abajo, cuando existen el panel y la franja.
  let onTabShown: ((byPlayer: boolean) => void) | null = null;
  const tabs = createTabs(store, views, isTabAvailable, options.initialTab, (id, byPlayer) => {
    options.onTabChange(id);
    onTabShown?.(byPlayer);
  });
  const news = createNewsTicker();
  const hudBox = h('div', { class: 'layout__hud' }, [hud.counter]);
  const stopHudHeight = trackHudHeight(hudBox);
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

  // La franja de arriba: por debajo de 1024 px se queda fija y solo se desplaza el panel
  // (petición del usuario, ARCHITECTURE.md §4.30). En escritorio es display: contents y sus
  // piezas siguen siendo celdas de la rejilla de siempre.
  const top = h('div', { class: 'layout__top' }, [hudBox, stage, coreBox, effectsBox]);
  const panelBox = h('div', { class: 'layout__panel' }, [tabs.root]);
  const main = h('main', { class: 'layout', id: 'game' }, [
    top,
    panelBox,
    h('footer', { class: 'layout__footer' }, [news.root]),
  ]);
  const probe = h('div', { class: 'layout__probe', attrs: { 'aria-hidden': 'true' } });
  const skip = h('a', { class: 'skip-link', text: t('app.skipToGame'), attrs: { href: '#game' } });
  // Los avisos y la región aria-live no van aquí: viven fuera de lo que se reconstruye
  // (main.ts) para que un cambio de idioma no borre los avisos fijos de guardado.
  const root = h('div', { class: 'app' }, [skip, main, probe]);
  host.replaceChildren(root);
  const pinning = createPinning({
    main,
    hud: hudBox,
    stage,
    panel: panelBox,
    bar: tabs.bar,
    probe,
    activeTab: () => tabs.current(),
  });
  pinning.refresh();
  onTabShown = (byPlayer) => {
    // Socios cambia lo que queda fijo; y solo un cambio del jugador mueve la página (no el de
    // reconstruir la interfaz al cambiar de idioma, ni el de las láminas, que enfocan su título).
    if (byPlayer) pinning.revealPanel();
    else pinning.refresh();
  };

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
      if (main.classList.contains('layout--fresh') !== fresh) {
        main.classList.toggle('layout--fresh', fresh);
        pinning.refresh();
      }
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
      stopHudHeight();
      pinning.destroy();
      hud.destroy();
      tabs.destroy();
      drop.destroy();
      root.remove();
    },
  };
}

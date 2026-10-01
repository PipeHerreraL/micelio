/**
 * Pestañas: lista de pestañas accesible (flechas, Inicio y Fin) y sus paneles. Una pestaña
 * aparece cuando tiene contenido y ya no se oculta (ARCHITECTURE.md §4.11). Solo el panel
 * visible se actualiza en cada refresco.
 */
import { markSeen } from '../core/actions.ts';
import { hasSeen, type GameState } from '../core/state.ts';
import { t, type MessageKey } from '../i18n/index.ts';
import { Disposer, h, setAttr, setHidden, toggleClass } from './dom.ts';
import { uiIcon } from './icons.ts';
import type { Store } from './store.ts';

export const TAB_IDS = [
  'generators',
  'upgrades',
  'sporulate',
  'mutations',
  'achievements',
  'stats',
  'settings',
] as const;
export type TabId = (typeof TAB_IDS)[number];

export interface TabView {
  id: TabId;
  root: HTMLElement;
  update(): void;
  destroy(): void;
}

export interface Tabs {
  root: HTMLElement;
  /** Barra de pestañas (en móvil se fija abajo). */
  bar: HTMLElement;
  update(): void;
  select(id: TabId, focus?: boolean): void;
  current(): TabId;
  destroy(): void;
}

export type TabAvailability = (id: TabId, state: GameState) => boolean;

export function createTabs(
  store: Store,
  views: readonly TabView[],
  isAvailable: TabAvailability,
  initial: TabId,
  onSelect: (id: TabId) => void,
): Tabs {
  const disposer = new Disposer();
  const buttons = new Map<TabId, HTMLButtonElement>();
  const panels = new Map<TabId, HTMLElement>();
  let active: TabId = initial;

  const list = h('div', { class: 'tabs__list', attrs: { role: 'tablist', 'aria-label': t('tabs.label') } });
  const panelHost = h('div', { class: 'tabs__panels' });

  // Mismo orden que TAB_IDS, venga en el orden que venga la lista de vistas.
  const ordered = [...views].sort((a, b) => TAB_IDS.indexOf(a.id) - TAB_IDS.indexOf(b.id));
  for (const view of ordered) {
    const tabId = `tab-${view.id}`;
    const panelId = `panel-${view.id}`;
    // El punto de «novedad» también se dice con texto para quien no lo ve.
    const badge = h('span', { class: 'tabs__badge' }, [
      h('span', { class: 'visually-hidden', text: t('tab.newBadge') }),
    ]);
    const label = t(`tab.${view.id}` as MessageKey);
    const button = h(
      'button',
      {
        class: 'tabs__tab',
        id: tabId,
        attrs: {
          type: 'button',
          role: 'tab',
          'aria-controls': panelId,
          'aria-selected': 'false',
          tabindex: -1,
          hidden: true,
        },
      },
      [uiIcon(view.id), h('span', { class: 'tabs__label', text: label }), badge],
    );
    disposer.listen(button, 'click', () => {
      select(view.id);
    });
    buttons.set(view.id, button);
    list.append(button);

    const panel = h(
      'section',
      {
        class: 'tabs__panel',
        id: panelId,
        attrs: { role: 'tabpanel', 'aria-labelledby': tabId, hidden: true, tabindex: 0 },
      },
      [view.root],
    );
    panels.set(view.id, panel);
    panelHost.append(panel);
  }

  disposer.listen(list, 'keydown', (e) => {
    const visible = TAB_IDS.filter((id) => !(buttons.get(id)?.hidden ?? true));
    const index = visible.indexOf(active);
    let next: TabId | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = visible[(index + 1) % visible.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = visible[(index - 1 + visible.length) % visible.length];
    else if (e.key === 'Home') next = visible[0];
    else if (e.key === 'End') next = visible[visible.length - 1];
    if (next) {
      e.preventDefault();
      select(next, true);
    }
  });

  function viewOf(id: TabId): TabView | undefined {
    return views.find((v) => v.id === id);
  }

  function select(id: TabId, focus = false): void {
    active = id;
    for (const [tab, button] of buttons) {
      const on = tab === id;
      setAttr(button, 'aria-selected', on ? 'true' : 'false');
      setAttr(button, 'tabindex', on ? '0' : '-1');
      toggleClass(button, 'is-active', on);
      const panel = panels.get(tab);
      if (panel) setHidden(panel, !on);
    }
    const button = buttons.get(id);
    // En la barra de móvil, que se desplaza en horizontal, la pestaña activa queda a la vista.
    if (focus) button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (button && !button.hidden && !hasSeen(store.state, `tabVisited.${id}`)) {
      store.dispatch(markSeen, { key: `tabVisited.${id}` });
    }
    viewOf(id)?.update();
    if (focus) button?.focus();
    onSelect(id);
  }

  function update(): void {
    const state = store.state;
    let anyVisible = false;
    for (const [id, button] of buttons) {
      const seenKey = `tab.${id}`;
      const available = hasSeen(state, seenKey) || isAvailable(id, state);
      if (available && !hasSeen(state, seenKey)) store.dispatch(markSeen, { key: seenKey });
      setHidden(button, !available);
      anyVisible ||= available && id !== 'settings';
      const badge = button.querySelector<HTMLElement>('.tabs__badge');
      if (badge) setHidden(badge, !available || hasSeen(state, `tabVisited.${id}`) || id === active);
    }
    // Si la pestaña activa aún no está disponible (partida nueva), se elige la primera visible.
    const activeButton = buttons.get(active);
    if (activeButton?.hidden) {
      const first = TAB_IDS.find((id) => !(buttons.get(id)?.hidden ?? true));
      if (first) select(first);
    }
    toggleClass(root, 'tabs--minimal', !anyVisible);
    viewOf(active)?.update();
  }

  const root = h('div', { class: 'tabs' }, [list, panelHost]);
  select(initial);

  return {
    root,
    bar: list,
    update,
    select,
    current: () => active,
    destroy: () => {
      disposer.dispose();
      for (const view of views) view.destroy();
    },
  };
}

/**
 * Pestaña Socios (docs/ROADMAP.md, fase 9). Aparece cuando llega el primer socio y no se oculta
 * (ARCHITECTURE.md §4.11). Cada socio tiene su sección; su vista llega aparte la primera vez que
 * se abre la pestaña (ui/partner-loader.ts). Mientras tanto, la sección dice que se está
 * preparando; si el código no llega, lo dice y ofrece recargar.
 *
 * El código de la vista corre dentro del bucle de la red (update, frame, onEvent) y usa el del
 * modelo (medir la red, la Quimiotaxis): cada llamada va protegida. Si lanza, el socio se da de
 * baja y la sección queda en el estado de fallo; el bucle sigue. Tras un fallo no se reintenta
 * solo: el panel ofrece recargar la página.
 */
import type { GameEvent } from '../core/events.ts';
import type { Locale } from '../core/state.ts';
import { getLocale, t } from '../i18n/index.ts';
import { isPartnerCatalogReady } from '../i18n/partners/index.ts';
import { PARTNER_IDS, type PartnerId } from '../partners/ids.ts';
import { Disposer, h, setHidden } from './dom.ts';
import { createHint } from './hint.ts';
import { isModalOpen } from './modal.ts';
import {
  loadPartner,
  loadPartnerView,
  onPartnerLoadChange,
  partnerLoadStatus,
  reportPartnerFailure,
} from './partner-loader.ts';
import type { PartnerView, PartnerViewModule, PartnerViewOptions } from './partner-view.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';

export interface PartnersTabOptions {
  reducedMotion: () => boolean;
  toAchievements(): void;
  rereadPlate(plate: number): void;
  /** Guarda antes de recargar la página (el trozo viejo ya no existe tras un despliegue). */
  saveAndReload(): void;
}

interface Section {
  id: PartnerId;
  root: HTMLElement;
  view: PartnerView | null;
  /** El módulo de la vista, para rehacerla cuando llega el catálogo del idioma activo. */
  module: PartnerViewModule | null;
  /** Idioma del catálogo con que nació la vista; null si nació con el de reserva. */
  viewLocale: Locale | null;
  viewFailed: boolean;
  requested: boolean;
  /** Estado que se pintó la última vez (para rehacer solo al cambiar). */
  shown: 'loading' | 'failed' | 'view' | null;
}

export function createPartnersTab(
  store: Store,
  options: PartnersTabOptions,
): TabView & {
  frame(now: number): void;
  onEvent(event: GameEvent): void;
  setReducedMotion(on: boolean): void;
} {
  const disposer = new Disposer();
  const hint = createHint(store, 'hint.partners', t('hint.partners'));
  const sectionsHost = h('div', { class: 'partners__list' });
  const root = h('div', { class: 'partners' }, [
    h('div', { class: 'tab__toolbar' }, [
      h('h2', { class: 'tab__title', id: 'partners-title', text: t('partners.title') }),
    ]),
    h('p', { class: 'tab__intro', text: t('partners.intro') }),
    hint.root,
    sectionsHost,
  ]);
  const sections = new Map<PartnerId, Section>();
  /** La pestaña se destruyó (cambio de idioma): una vista que llegue tarde ya no se monta. */
  let disposed = false;

  const viewOptions: PartnerViewOptions = {
    reducedMotion: options.reducedMotion(),
    toAchievements: () => {
      options.toAchievements();
    },
    rereadPlate: (plate) => {
      options.rereadPlate(plate);
    },
  };

  function titleFor(id: PartnerId): HTMLElement {
    // Mismo id que el título de la vista: «Ver la placa» puede enfocarlo aunque aún cargue.
    return h('h3', {
      class: 'partner__title',
      id: `partner-${id}-title`,
      text: t('partners.loadingTitle'),
      attrs: { tabindex: -1 },
    });
  }

  function paint(section: Section): void {
    const loadState = partnerLoadStatus(section.id);
    let next: Section['shown'];
    if (section.view && loadState === 'ready') next = 'view';
    else if (loadState === 'failed' || section.viewFailed) next = 'failed';
    else next = 'loading';
    if (next === section.shown) return;
    section.shown = next;
    // Si el foco estaba en la sección (p. ej. en el título del estado de carga, adonde lleva
    // «Ver la placa»), pasa al título nuevo: rehacer la sección no lo deja en <body>.
    const hadFocus = section.root.contains(document.activeElement);
    const refocus = (): void => {
      if (hadFocus) section.root.querySelector<HTMLElement>(`#partner-${section.id}-title`)?.focus();
    };
    if (next === 'view' && section.view) {
      section.root.replaceChildren(section.view.root);
      refocus();
      return;
    }
    if (next === 'failed') {
      const reload = h('button', {
        class: 'button button--primary',
        text: t('partners.reload'),
        attrs: { type: 'button' },
      });
      disposer.listen(reload, 'click', () => {
        options.saveAndReload();
      });
      section.root.replaceChildren(titleFor(section.id), h('p', { text: t('partners.loadFailed') }), reload);
      refocus();
      return;
    }
    section.root.replaceChildren(
      titleFor(section.id),
      h('p', {
        class: 'partner__loading',
        text: t('partners.loading'),
        attrs: { role: 'status', 'aria-busy': 'true' },
      }),
    );
    refocus();
  }

  /** Quita la vista sin dejar que un fallo al destruirla salga de aquí. */
  function dropView(section: Section): void {
    const view = section.view;
    section.view = null;
    try {
      view?.destroy();
    } catch {
      // Lo que no llegue a soltar (listeners sobre su propio DOM) se va con la sección.
    }
  }

  /** El código del socio lanzó: se da de baja (una vez en la consola) y la sección dice que falló. */
  function fail(section: Section, error: unknown): void {
    section.viewFailed = true;
    dropView(section);
    reportPartnerFailure(section.id, error);
    paint(section);
  }

  /** Crea la vista con el catálogo que haya y la pinta; un fallo deja la sección en error. */
  function mountView(section: Section, module: PartnerViewModule): void {
    section.module = module;
    const locale = getLocale();
    let view: PartnerView;
    try {
      view = module.createPartnerView(store, viewOptions);
    } catch (error) {
      fail(section, error);
      return;
    }
    section.view = view;
    section.viewLocale = isPartnerCatalogReady(section.id, locale) ? locale : null;
    paint(section);
    try {
      view.update();
    } catch (error) {
      fail(section, error);
    }
  }

  /**
   * Pide el modelo, el catálogo y la vista la primera vez que la pestaña se ve con el socio. La
   * vista espera al catálogo del idioma activo: sus rótulos fijos se escriben una vez y, si naciera
   * con el anterior, quedarían mezclados (loadPartner no rechaza; sin catálogo nuevo, nace con el
   * de reserva y se rehace cuando llegue).
   */
  function request(section: Section): void {
    if (section.requested) return;
    section.requested = true;
    Promise.all([loadPartnerView(section.id), loadPartner(section.id, getLocale())])
      .then(([module]) => {
        if (disposed || sections.get(section.id) !== section) return;
        mountView(section, module);
      })
      .catch((error: unknown) => {
        // Sin reintento automático: la sección dice que falló y ofrece recargar la página.
        console.error(`Micelio: no se pudo cargar la vista del socio ${section.id}.`, error);
        section.viewFailed = true;
        paint(section);
      });
  }

  disposer.add(
    onPartnerLoadChange(() => {
      for (const section of sections.values()) paint(section);
    }),
  );

  /**
   * Llegó el catálogo del idioma activo después que la vista (nació con el de reserva): se rehace
   * para que cambien sus rótulos fijos. Con un modal abierto espera: puede ser la placa ampliada de
   * esta misma vista.
   */
  function refreshCatalog(section: Section): void {
    const locale = getLocale();
    if (!section.view || !section.module || section.viewLocale === locale) return;
    if (!isPartnerCatalogReady(section.id, locale) || isModalOpen()) return;
    dropView(section);
    section.shown = null;
    mountView(section, section.module);
  }

  function update(): void {
    hint.update(sections.size > 0);
    for (const id of PARTNER_IDS) {
      if (store.state.partners[id] === null) {
        const existing = sections.get(id);
        if (existing) {
          dropView(existing);
          existing.root.remove();
          sections.delete(id);
        }
        continue;
      }
      let section = sections.get(id);
      if (!section) {
        section = {
          id,
          root: h('section', { class: 'partner', attrs: { 'aria-labelledby': `partner-${id}-title` } }),
          view: null,
          module: null,
          viewLocale: null,
          viewFailed: false,
          requested: false,
          shown: null,
        };
        sections.set(id, section);
        sectionsHost.append(section.root);
      }
      paint(section);
      // Una sola petición por sección: tras un fallo, pedir en cada refresco rehacía el panel a
      // 10 Hz y el foco del botón «Recargar» caía a <body>.
      request(section);
      refreshCatalog(section);
      if (section.shown === 'view' && section.view) {
        try {
          section.view.update();
        } catch (error) {
          fail(section, error);
        }
      }
    }
    setHidden(sectionsHost, sections.size === 0);
  }

  return {
    id: 'partners',
    root,
    update,
    frame(now) {
      for (const section of sections.values()) {
        if (section.shown !== 'view' || !section.view) continue;
        try {
          section.view.frame(now);
        } catch (error) {
          fail(section, error);
        }
      }
    },
    onEvent(event) {
      for (const section of sections.values()) {
        if (!section.view) continue;
        try {
          section.view.onEvent(event);
        } catch (error) {
          fail(section, error);
        }
      }
    },
    setReducedMotion(on) {
      viewOptions.reducedMotion = on;
      for (const section of sections.values()) section.view?.setReducedMotion(on);
    },
    destroy() {
      disposed = true;
      for (const section of sections.values()) dropView(section);
      hint.destroy();
      disposer.dispose();
    },
  };
}

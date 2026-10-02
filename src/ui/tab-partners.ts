/**
 * Pestaña Socios (docs/ROADMAP.md, fase 9). Aparece cuando llega el primer socio y no se oculta
 * (ARCHITECTURE.md §4.11). Cada socio tiene su sección; su vista llega aparte la primera vez que
 * se abre la pestaña (ui/partner-loader.ts). Mientras tanto, la sección dice que se está
 * preparando; si el código no llega, lo dice y ofrece recargar.
 */
import type { GameEvent } from '../core/events.ts';
import { getLocale, t } from '../i18n/index.ts';
import { PARTNER_IDS, type PartnerId } from '../partners/ids.ts';
import { Disposer, h, setHidden } from './dom.ts';
import { createHint } from './hint.ts';
import { loadPartner, loadPartnerView, onPartnerLoadChange, partnerLoadStatus } from './partner-loader.ts';
import type { PartnerView, PartnerViewOptions } from './partner-view.ts';
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
  }

  /** Pide el modelo, el catálogo y la vista la primera vez que la pestaña se ve con el socio. */
  function request(section: Section): void {
    if (section.requested) return;
    section.requested = true;
    void loadPartner(section.id, getLocale());
    loadPartnerView(section.id)
      .then((module) => {
        section.view = module.createPartnerView(store, viewOptions);
        paint(section);
        section.view.update();
      })
      .catch((error: unknown) => {
        console.error(`Micelio: no se pudo cargar la vista del socio ${section.id}.`, error);
        section.viewFailed = true;
        section.requested = false;
        paint(section);
      });
  }

  disposer.add(
    onPartnerLoadChange(() => {
      for (const section of sections.values()) {
        // Tras un fallo del modelo se puede volver a intentar al abrir la pestaña otra vez.
        if (partnerLoadStatus(section.id) === 'failed') section.requested = section.view !== null;
        paint(section);
      }
    }),
  );

  function update(): void {
    hint.update(sections.size > 0);
    for (const id of PARTNER_IDS) {
      if (store.state.partners[id] === null) {
        const existing = sections.get(id);
        if (existing) {
          existing.view?.destroy();
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
          viewFailed: false,
          requested: false,
          shown: null,
        };
        sections.set(id, section);
        sectionsHost.append(section.root);
      }
      paint(section);
      if (partnerLoadStatus(id) !== 'ready') void loadPartner(id, getLocale());
      request(section);
      if (section.shown === 'view') section.view?.update();
    }
    setHidden(sectionsHost, sections.size === 0);
  }

  return {
    id: 'partners',
    root,
    update,
    frame(now) {
      for (const section of sections.values()) if (section.shown === 'view') section.view?.frame(now);
    },
    onEvent(event) {
      for (const section of sections.values()) section.view?.onEvent(event);
    },
    setReducedMotion(on) {
      viewOptions.reducedMotion = on;
      for (const section of sections.values()) section.view?.setReducedMotion(on);
    },
    destroy() {
      for (const section of sections.values()) section.view?.destroy();
      hint.destroy();
      disposer.dispose();
    },
  };
}

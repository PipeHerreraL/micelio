/**
 * Adaptaciones (docs/ROADMAP.md, fase 7): aparecen debajo del árbol de mutaciones cuando está
 * completo. Cada fila dice su efecto actual, su rango y cuánto cuesta el siguiente, con un
 * <button> real que dice lo que hace («Adaptar: Cuerpo apical»).
 */
import { adaptationsUnlocked, buyAdaptation, nextAdaptationCost } from '../core/actions.ts';
import { derived } from '../core/selectors.ts';
import type { GameState } from '../core/state.ts';
import {
  ADAPTATIONS,
  HYDRAULIC_DROP_SECONDS,
  SCLEROTIUM_BASE_EXPONENT,
  TORPOR_OFFLINE_HOURS,
  type AdaptationDef,
  type AdaptationId,
} from '../data/adaptations.ts';
import { DROP_LIFETIME } from '../data/rain.ts';
import { formatDuration } from '../i18n/format.ts';
import { fmt, formatCount, getLocale, t, tp, type MessageKey } from '../i18n/index.ts';
import { offlineCapSeconds } from '../systems/offline.ts';
import { Disposer, h, setAttr, setHidden, setText, toggleClass } from './dom.ts';
import { createBiomeAdaptations } from './biome-adaptations.ts';
import { createHint } from './hint.ts';
import type { Store } from './store.ts';

const nameOf = (id: AdaptationId): string => t(`adapt.${id}.name` as MessageKey);

/** Efecto actual de una adaptación en el idioma activo. */
function effectText(state: GameState, def: AdaptationDef): string {
  const rank = state.adaptations[def.id];
  switch (def.id) {
    case 'apicalBody':
      return t('adapt.apicalBody.effect', {
        threshold: formatCount(Math.round(derived(state).sporeThreshold)),
      });
    case 'sclerotium':
      return rank === 0
        ? t('adapt.none')
        : t('adapt.sclerotium.effect', { value: fmt(10 ** (SCLEROTIUM_BASE_EXPONENT + rank)) });
    case 'hydraulicLift':
      return t('adapt.hydraulicLift.effect', {
        time: formatDuration(DROP_LIFETIME + HYDRAULIC_DROP_SECONDS * rank, getLocale()),
      });
    case 'deepTorpor':
      return rank === 0
        ? t('adapt.none')
        : t('adapt.deepTorpor.effect', {
            time: formatDuration(offlineCapSeconds(state), getLocale()),
            extra: formatDuration(TORPOR_OFFLINE_HOURS * 3600 * rank, getLocale()),
          });
    case 'foxfire':
      return rank === 0 ? t('adapt.none') : t('adapt.foxfire.effect');
  }
}

interface Row {
  def: AdaptationDef;
  button: HTMLButtonElement;
  rank: HTMLElement;
  effect: HTMLElement;
  cost: HTMLElement;
}

export interface AdaptationsView {
  root: HTMLElement;
  update(): void;
  destroy(): void;
}

export function createAdaptations(store: Store): AdaptationsView {
  const disposer = new Disposer();
  const hint = createHint(store, 'hint.adaptations', t('hint.adaptations'));
  const list = h('ul', { class: 'adapt-list' });
  // Las de bioma (fase 8) van antes que las de la red, con su propio encabezado por bioma.
  const biomeGroups = createBiomeAdaptations(store);
  const networkHeading = h('h4', {
    class: 'badapt__title',
    text: t('adapt.group.network'),
    attrs: { hidden: true },
  });
  const root = h('section', { class: 'adapt', attrs: { hidden: true, 'aria-labelledby': 'adapt-title' } }, [
    h('h3', { class: 'settings__title', id: 'adapt-title', text: t('adapt.title') }),
    h('p', { class: 'tab__intro', text: t('adapt.intro') }),
    hint.root,
    biomeGroups.root,
    networkHeading,
    list,
  ]);

  const rows: Row[] = ADAPTATIONS.map((def) => {
    const label = t('adapt.buy', { name: nameOf(def.id) });
    const rank = h('span', { class: 'adapt__rank tabular' });
    const effect = h('span', { class: 'adapt__effect', id: `adapt-${def.id}-effect` });
    const cost = h('span', { class: 'adapt__cost tabular', id: `adapt-${def.id}-cost` });
    const button = h(
      'button',
      {
        class: 'adapt__buy button',
        attrs: {
          type: 'button',
          'aria-label': label,
          'aria-describedby': `adapt-${def.id}-effect adapt-${def.id}-cost`,
        },
      },
      [h('span', { text: label }), cost],
    );
    disposer.listen(button, 'click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      store.dispatch(buyAdaptation, { id: def.id });
    });
    list.append(
      h('li', { class: 'adapt__row' }, [
        h('div', { class: 'adapt__body' }, [
          h('span', { class: 'adapt__name' }, [h('span', { text: nameOf(def.id) }), rank]),
          h('span', { class: 'adapt__desc', text: t(`adapt.${def.id}.desc` as MessageKey) }),
          effect,
        ]),
        button,
      ]),
    );
    return { def, button, rank, effect, cost };
  });

  return {
    root,
    update() {
      const state = store.state;
      const unlocked = adaptationsUnlocked(state);
      setHidden(root, !unlocked);
      hint.update(unlocked);
      if (!unlocked) return;
      setHidden(networkHeading, !biomeGroups.update());
      for (const row of rows) {
        const current = state.adaptations[row.def.id];
        const price = nextAdaptationCost(state, row.def.id);
        setText(
          row.rank,
          row.def.max === null
            ? t('adapt.rank', { rank: formatCount(current) })
            : t('adapt.rankOf', { rank: formatCount(current), max: formatCount(row.def.max) }),
        );
        setText(row.effect, effectText(state, row.def));
        setText(row.cost, price === null ? t('adapt.maxed') : tp('mut.cost', price));
        const affordable = price !== null && state.spores.available >= price;
        setAttr(row.button, 'aria-disabled', affordable ? 'false' : 'true');
        toggleClass(row.button, 'button--primary', affordable);
        toggleClass(row.button, 'is-unaffordable', !affordable);
      }
    },
    destroy: () => {
      disposer.dispose();
      hint.destroy();
      biomeGroups.destroy();
    },
  };
}

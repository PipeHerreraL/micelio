/**
 * Pestaña Mejoras: solo las disponibles, ordenadas por coste, con el efecto exacto y cuánto
 * subirá la producción («+12,4 N/s») a la vista y en el tooltip (PROMPT.md §8).
 */
import { buyUpgrade, setAutobuyUpgrades } from '../core/actions.ts';
import { availableUpgrades, hasAutobuyUpgrades, previewUpgrade, secondsUntil } from '../core/economy.ts';
import * as num from '../core/num.ts';
import type { GameState } from '../core/state.ts';
import type { UpgradeDef } from '../data/upgrades.ts';
import { formatDuration, formatPercent } from '../i18n/format.ts';
import { fmt, getLocale, numberDetails, t, type MessageKey } from '../i18n/index.ts';
import { Disposer, h, setAttr, setHidden, setText, toggleClass } from './dom.ts';
import { createHint } from './hint.ts';
import { generatorIcon, uiIcon } from './icons.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';
import { attachTooltip } from './tooltip.ts';

const nameKey = (id: string): MessageKey => `upg.${id}.name` as MessageKey;
const flavorKey = (id: string): MessageKey => `upg.${id}.flavor` as MessageKey;

/** Texto del efecto exacto de una mejora en el idioma activo. */
export function upgradeEffectText(def: UpgradeDef): string {
  const effect = def.effect;
  switch (effect.kind) {
    case 'generator':
      return t('upgEffect.generator', { name: t(`gen.${effect.target}.name` as MessageKey) });
    case 'click':
      return t('upgEffect.click', { multiplier: effect.multiplier });
    case 'clickPercent':
      return t('upgEffect.clickPercent', { percent: formatPercent(effect.percent, getLocale(), 1) });
    case 'global':
      return t('upgEffect.global', {
        multiplier: new Intl.NumberFormat(getLocale()).format(effect.multiplier),
      });
    case 'synergy':
      return t(`upg.${def.id}.effect` as MessageKey, {
        percent: formatPercent(effect.perUnit, getLocale(), 1),
      });
  }
}

/** Ganancia que se verá al comprarla: N/s, y además el clic si la mejora es de clic. */
function gainText(state: GameState, def: UpgradeDef): string {
  const gain = previewUpgrade(state, def.id);
  const parts: string[] = [];
  if (num.gt(gain.production, 0)) parts.push(t('upg.gainProduction', { value: fmt(gain.production) }));
  if (def.effect.kind === 'click' || def.effect.kind === 'clickPercent') {
    parts.push(t('upg.gainClick', { value: fmt(gain.click) }));
  }
  return parts.join(' · ');
}

function iconFor(def: UpgradeDef): SVGSVGElement {
  switch (def.effect.kind) {
    case 'generator':
      return generatorIcon(def.effect.target);
    case 'click':
    case 'clickPercent':
      return uiIcon('click');
    case 'global':
      return uiIcon('global');
    case 'synergy':
      return uiIcon('synergy');
  }
}

interface Card {
  def: UpgradeDef;
  button: HTMLButtonElement;
  gain: HTMLElement;
  cost: HTMLElement;
  wait: HTMLElement;
}

export function createUpgradesTab(store: Store): TabView {
  const disposer = new Disposer();
  // Las tarjetas se rehacen solo cuando cambia qué mejoras hay; cada una tiene sus bajas.
  let cardDisposer = new Disposer();
  const list = h('ul', { class: 'upg-list' });
  const empty = h('p', { class: 'tab__intro', text: t('upgrades.empty') });
  const hint = createHint(store, 'hint.upgrades', t('hint.upgrades'));
  // Instinto superior: un interruptor para la autocompra de mejoras.
  const autobuy = h('button', {
    class: 'toggle',
    text: t('autobuy.upgrades'),
    attrs: { type: 'button', 'aria-pressed': 'false', hidden: true },
  });
  disposer.listen(autobuy, 'click', () => {
    store.dispatch(setAutobuyUpgrades, { on: !store.state.autobuy.upgrades });
  });
  const root = h('div', { class: 'tab tab--upgrades' }, [
    h('div', { class: 'tab__toolbar' }, [
      h('h2', { class: 'tab__title', text: t('upgrades.title') }),
      autobuy,
    ]),
    hint.root,
    empty,
    list,
  ]);

  let signature = '';
  let cards: Card[] = [];

  function build(defs: readonly UpgradeDef[]): void {
    // Si el foco estaba en una tarjeta, se recupera tras rehacer la lista: comprar con el
    // teclado no debe dejar el foco en <body> (BUG-JOURNAL #5).
    const focusedIndex = cards.findIndex((c) => c.button === document.activeElement);
    const focusedId = focusedIndex >= 0 ? cards[focusedIndex]?.def.id : undefined;
    cardDisposer.dispose();
    cardDisposer = new Disposer();
    cards = defs.map((def) => {
      // El nombre accesible dice lo que hace el botón («Comprar Quitina flexible»); efecto,
      // ganancia y precio van como descripción.
      const base = `upg-${def.id.replace(/\W/g, '-')}`;
      const gain = h('span', { class: 'upg__gain tabular', id: `${base}-gain` });
      const cost = h('span', { class: 'upg__cost tabular' });
      const wait = h('span', { class: 'upg__wait tabular' });
      const button = h(
        'button',
        {
          class: 'upg',
          attrs: {
            type: 'button',
            'aria-label': t('upg.buy', { name: t(nameKey(def.id)) }),
            'aria-describedby': `${base}-effect ${base}-gain ${base}-price`,
          },
        },
        [
          h('span', { class: 'upg__icon', attrs: { 'aria-hidden': 'true' } }, [iconFor(def)]),
          h('span', { class: 'upg__body' }, [
            h('span', { class: 'upg__name', text: t(nameKey(def.id)) }),
            h('span', { class: 'upg__effect', id: `${base}-effect`, text: upgradeEffectText(def) }),
            gain,
          ]),
          h('span', { class: 'upg__price', id: `${base}-price` }, [cost, wait]),
        ],
      );
      cardDisposer.listen(button, 'click', () => {
        if (button.getAttribute('aria-disabled') === 'true') return;
        store.dispatch(buyUpgrade, { id: def.id });
      });
      attachTooltip(
        button,
        () => [
          t(nameKey(def.id)),
          upgradeEffectText(def),
          gainText(store.state, def),
          t(flavorKey(def.id)),
          ...numberDetails(def.cost, previewUpgrade(store.state, def.id).production),
        ],
        cardDisposer,
      );
      return { def, button, gain, cost, wait };
    });
    list.replaceChildren(...cards.map((c) => h('li', {}, [c.button])));
    if (focusedId !== undefined) {
      const target =
        cards.find((c) => c.def.id === focusedId)?.button ??
        cards[Math.min(focusedIndex, cards.length - 1)]?.button ??
        root.closest<HTMLElement>('[role="tabpanel"]');
      target?.focus();
    }
  }

  function update(): void {
    const state = store.state;
    const defs = availableUpgrades(state);
    const nextSignature = defs.map((d) => d.id).join('|');
    if (nextSignature !== signature) {
      signature = nextSignature;
      build(defs);
    }
    setHidden(empty, defs.length > 0);
    setHidden(autobuy, !hasAutobuyUpgrades(state));
    setAttr(autobuy, 'aria-pressed', state.autobuy.upgrades ? 'true' : 'false');
    hint.update(defs.length > 0);
    for (const card of cards) {
      const affordable = num.gte(state.nutrients, card.def.cost);
      setText(card.gain, gainText(state, card.def));
      setText(card.cost, t('gen.cost', { value: fmt(card.def.cost) }));
      if (affordable) {
        setText(card.wait, '');
      } else {
        const wait = secondsUntil(state, card.def.cost);
        setText(
          card.wait,
          Number.isFinite(wait)
            ? t('gen.wait', { time: formatDuration(wait, getLocale()) })
            : t('gen.waitNoIncome'),
        );
      }
      setAttr(card.button, 'aria-disabled', affordable ? 'false' : 'true');
      toggleClass(card.button, 'is-affordable', affordable);
    }
  }

  return {
    id: 'upgrades',
    root,
    update,
    destroy: () => {
      cardDisposer.dispose();
      disposer.dispose();
      hint.destroy();
    },
  };
}

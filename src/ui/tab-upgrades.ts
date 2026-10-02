/**
 * Pestaña Mejoras: solo las disponibles, ordenadas por coste, con el efecto exacto y cuánto
 * subirá la producción («+12,4 N/s») a la vista y en el tooltip (PROMPT.md §8).
 */
import { buyUpgrade, setAutobuyUpgrades } from '../core/actions.ts';
import { availableUpgrades, hasAutobuyUpgrades, previewUpgrade, secondsUntil } from '../core/economy.ts';
import * as num from '../core/num.ts';
import { hasUpgrade, type GameState } from '../core/state.ts';
import type { UpgradeDef } from '../data/upgrades.ts';
import { formatDuration, formatPercent } from '../i18n/format.ts';
import { fmt, getLocale, numberDetails, t, type MessageKey } from '../i18n/index.ts';
import { Disposer, h, setAttr, setHidden, setText, toggleClass } from './dom.ts';
import { createHint } from './hint.ts';
import { generatorIcon, uiIcon } from './icons.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';
import { attachTooltip } from './tooltip.ts';
import { biomeText } from './biome-text.ts';

const nameKey = (id: string): MessageKey => `upg.${id}.name` as MessageKey;
const flavorKey = (id: string): MessageKey => `upg.${id}.flavor` as MessageKey;

/** Cuánto se queda a la vista una mejora recién comprada, como «Comprada», antes de plegarse. */
const BOUGHT_HOLD_MS = 900;
/** Lo que tarda una tarjeta en plegarse o desplegarse (styles.css, .upg-item.is-moving). */
const MOVE_MS = 220;
/**
 * Refrescos más separados que esto no son la misma mirada (otra pestaña, la ventana oculta): la
 * lista se rehace sin animar y sin enseñar como «Comprada» lo que compró la autocompra entretanto.
 */
const CONTINUOUS_MS = 1000;

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
  item: HTMLLIElement;
  button: HTMLButtonElement;
  gain: HTMLElement;
  cost: HTMLElement;
  wait: HTMLElement;
  /** Bajas propias: una tarjeta puede irse sin que se rehaga la lista. */
  disposer: Disposer;
}

export function createUpgradesTab(store: Store): TabView {
  const disposer = new Disposer();
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
  /** Tarjetas vivas, en el orden de la lista. Las que se van ya no están aquí. */
  let cards: Card[] = [];
  const timers = new Set<number>();
  let lastUpdate = Number.NEGATIVE_INFINITY;

  function later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  function clearTimers(): void {
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
  }

  function createCard(def: UpgradeDef): Card {
    const cardDisposer = new Disposer();
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
          'aria-label': t('upg.buy', { name: biomeText(store.state, nameKey(def.id)) }),
          'aria-describedby': `${base}-effect ${base}-gain ${base}-price`,
        },
      },
      [
        h('span', { class: 'upg__icon', attrs: { 'aria-hidden': 'true' } }, [iconFor(def)]),
        h('span', { class: 'upg__body' }, [
          h('span', { class: 'upg__name', text: biomeText(store.state, nameKey(def.id)) }),
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
        biomeText(store.state, nameKey(def.id)),
        upgradeEffectText(def),
        gainText(store.state, def),
        biomeText(store.state, flavorKey(def.id)),
        ...numberDetails(def.cost, previewUpgrade(store.state, def.id).production),
      ],
      cardDisposer,
    );
    const item = h('li', { class: 'upg-item' }, [button]);
    return { def, item, button, gain, cost, wait, disposer: cardDisposer };
  }

  /** Rehace la lista entera, sin animar. */
  function build(defs: readonly UpgradeDef[]): void {
    // Si el foco estaba en una tarjeta, se recupera tras rehacer la lista: comprar con el
    // teclado no debe dejar el foco en <body> (BUG-JOURNAL #5).
    const focusedIndex = cards.findIndex((c) => c.button === document.activeElement);
    const focusedId = focusedIndex >= 0 ? cards[focusedIndex]?.def.id : undefined;
    // Las tarjetas que se estaban plegando se van con el resto.
    clearTimers();
    for (const card of cards) card.disposer.dispose();
    cards = defs.map(createCard);
    list.replaceChildren(...cards.map((c) => c.item));
    if (focusedId !== undefined) {
      const target =
        cards.find((c) => c.def.id === focusedId)?.button ??
        cards[Math.min(focusedIndex, cards.length - 1)]?.button ??
        root.closest<HTMLElement>('[role="tabpanel"]');
      target?.focus();
    }
  }

  /** Pliega una tarjeta hasta altura 0 y la quita: las de abajo suben sin saltar. */
  function collapse(item: HTMLLIElement): void {
    item.style.height = `${String(item.getBoundingClientRect().height)}px`;
    item.classList.add('is-moving');
    // Leer la geometría fija la altura de partida: sin el reflow no habría transición.
    item.getBoundingClientRect();
    item.classList.add('is-collapsed');
    item.style.height = '0px';
    later(() => {
      item.remove();
    }, MOVE_MS);
  }

  /** Despliega una tarjeta recién puesta desde altura 0: las de abajo bajan sin saltar. */
  function expand(item: HTMLLIElement): void {
    const full = item.getBoundingClientRect().height;
    item.classList.add('is-moving', 'is-collapsed');
    item.style.height = '0px';
    // Leer la geometría fija la altura de partida: sin el reflow no habría transición.
    item.getBoundingClientRect();
    item.classList.remove('is-collapsed');
    item.style.height = `${String(full)}px`;
    later(() => {
      item.classList.remove('is-moving');
      item.style.height = '';
    }, MOVE_MS);
  }

  /**
   * Cambia solo las tarjetas que entran o salen. La recién comprada se queda en su sitio un
   * momento como «Comprada», sin poder pulsarse, y después se pliega: antes desaparecía de golpe,
   * todo lo de abajo subía 96 px y un segundo toque compraba la mejora que llegaba bajo el dedo.
   * Devuelve las tarjetas nuevas: se despliegan ya pintadas, o se mediría su altura sin textos.
   */
  function reconcile(defs: readonly UpgradeDef[], state: GameState): Set<Card> {
    const wanted = new Set(defs.map((d) => d.id));
    const kept: Card[] = [];
    const gone: Card[] = [];
    let refocusAt: number | null = null;
    for (const card of cards) {
      if (wanted.has(card.def.id)) {
        kept.push(card);
      } else {
        if (card.button === document.activeElement) refocusAt = kept.length;
        gone.push(card);
      }
    }
    // El foco pasa a la tarjeta que venía detrás (o a la de delante) antes de volver inerte la
    // que se va: inerte con el foco encima, el foco caería en <body> (BUG-JOURNAL #5). Sin
    // desplazar: la de detrás queda una tarjeta más abajo hasta que la comprada se pliegue, y
    // Chrome enfoca el botón al tocarlo, así que comprar con el dedo movía la página.
    if (refocusAt !== null) {
      const target =
        kept[refocusAt]?.button ??
        kept[refocusAt - 1]?.button ??
        root.closest<HTMLElement>('[role="tabpanel"]');
      target?.focus({ preventScroll: true });
    }
    for (const card of gone) {
      card.disposer.dispose();
      card.item.inert = true;
      if (hasUpgrade(state, card.def.id)) {
        // Alto y ancho del precio fijados antes de cambiar el texto: «Comprada» no mide lo que el
        // coste, el cuerpo de la tarjeta se partía distinto y las de abajo saltaban en la pausa.
        const price = card.cost.parentElement;
        if (price) price.style.minWidth = `${String(price.getBoundingClientRect().width)}px`;
        card.item.style.height = `${String(card.item.getBoundingClientRect().height)}px`;
        card.item.classList.add('is-bought');
        setText(card.cost, t('upg.bought'));
        setText(card.wait, '');
        later(() => {
          collapse(card.item);
        }, BOUGHT_HOLD_MS);
      } else {
        collapse(card.item);
      }
    }

    const byId = new Map(kept.map((c) => [c.def.id, c]));
    const fresh = new Set<Card>();
    cards = defs.map((def) => {
      const existing = byId.get(def.id);
      if (existing) return existing;
      const card = createCard(def);
      fresh.add(card);
      return card;
    });
    // De atrás adelante: la tarjeta siguiente ya está en la lista cuando se inserta la anterior.
    for (let i = cards.length - 1; i >= 0; i -= 1) {
      const card = cards[i];
      if (!card || !fresh.has(card)) continue;
      const next = cards[i + 1];
      if (next) list.insertBefore(card.item, next.item);
      else list.append(card.item);
    }
    return fresh;
  }

  function update(): void {
    const state = store.state;
    const now = performance.now();
    const continuous = now - lastUpdate < CONTINUOUS_MS;
    lastUpdate = now;
    const defs = availableUpgrades(state);
    const nextSignature = defs.map((d) => d.id).join('|');
    let fresh: ReadonlySet<Card> = new Set();
    if (nextSignature !== signature) {
      signature = nextSignature;
      if (continuous) fresh = reconcile(defs, state);
      else build(defs);
    }
    // Mientras la última comprada sigue en la lista, ni «No hay mejoras» ni el aviso cambian:
    // aparecer encima (o irse) la empujaba en mitad de su pausa.
    const listed = defs.length > 0 || list.childElementCount > 0;
    setHidden(empty, listed);
    setHidden(autobuy, !hasAutobuyUpgrades(state));
    setAttr(autobuy, 'aria-pressed', state.autobuy.upgrades ? 'true' : 'false');
    hint.update(listed);
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
    for (const card of fresh) expand(card.item);
  }

  return {
    id: 'upgrades',
    root,
    update,
    destroy: () => {
      clearTimers();
      for (const card of cards) card.disposer.dispose();
      disposer.dispose();
      hint.destroy();
    },
  };
}

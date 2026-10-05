/**
 * Pestaña Generadores: selector de cantidad, autocompra y una fila por generador con
 * icono, cantidad, producción, porcentaje del total, barra al siguiente hito y compra.
 */
import {
  buyGenerator,
  markSeen,
  setAutobuyGenerator,
  setAutobuyMode,
  setAutobuyThreshold,
  setBuyAmount,
} from '../core/actions.ts';
import {
  hasAutobuyGenerators,
  isGeneratorUnlocked,
  previewGenerator,
  quoteGenerator,
  secondsUntil,
  type PurchaseCandidate,
} from '../core/economy.ts';
import { nextMilestone, previousMilestone } from '../core/formulas.ts';
import * as num from '../core/num.ts';
import { derived } from '../core/selectors.ts';
import {
  AUTOBUY_MODES,
  AUTOBUY_THRESHOLDS,
  BUY_AMOUNTS,
  hasSeen,
  type AutobuyMode,
  type BuyAmount,
  type GameState,
} from '../core/state.ts';
import { GENERATORS, getGenerator, type GeneratorId } from '../data/generators.ts';
import { isPaybackActive, paybackTarget } from '../systems/autobuy.ts';
import { partnerPerks } from '../systems/partners.ts';
import { formatDuration, formatPercent } from '../i18n/format.ts';
import {
  fmt,
  formatCount,
  getLocale,
  numberDetails,
  t,
  tp,
  type MessageKey,
  type PluralKey,
} from '../i18n/index.ts';
import { Disposer, h, setAttr, setHidden, setProgress, setText, toggleClass } from './dom.ts';
import { generatorIcon } from './icons.ts';
import { createHint } from './hint.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';
import { attachTooltip } from './tooltip.ts';
import { biomeTag, biomeText } from './biome-text.ts';

/** Fracción del coste a la que un generador aparece en silueta (PROMPT.md §12). */
const SILHOUETTE_AT = 0.5;

type RowState = 'hidden' | 'silhouette' | 'full';

const nameKey = (id: GeneratorId): MessageKey => `gen.${id}.name` as MessageKey;
const flavorKey = (id: GeneratorId): MessageKey => `gen.${id}.flavor` as MessageKey;
const unitKey = (id: GeneratorId): PluralKey => `gen.${id}.unit` as PluralKey;

const MODE_KEYS: Readonly<Record<AutobuyMode, MessageKey>> = {
  threshold: 'autobuy.mode.threshold',
  payback: 'autobuy.mode.payback',
};

/** Nombre de lo que la Poda compraría: un generador o una mejora. */
function candidateName(candidate: PurchaseCandidate): string {
  return candidate.kind === 'generator'
    ? t(nameKey(candidate.id))
    : t(`upg.${candidate.id}.name` as MessageKey);
}

/** Estado de revelación de un generador. Una vez revelado, no vuelve a ocultarse. */
export function revealState(state: GameState, id: GeneratorId): RowState {
  const def = getGenerator(id);
  if (!isGeneratorUnlocked(state, def)) return 'hidden';
  if (state.owned[id] > 0 || hasSeen(state, `gen.${id}.full`)) return 'full';
  const cost = quoteGenerator(state, id, 1).cost;
  if (num.gte(state.nutrients, cost)) return 'full';
  if (hasSeen(state, `gen.${id}.silhouette`)) return 'silhouette';
  if (num.gte(state.nutrients, num.mul(cost, SILHOUETTE_AT))) return 'silhouette';
  return 'hidden';
}

interface Row {
  id: GeneratorId;
  root: HTMLLIElement;
  name: HTMLElement;
  owned: HTMLElement;
  ownedVisible: HTMLElement;
  ownedSr: HTMLElement;
  stats: HTMLElement;
  milestoneFill: HTMLElement;
  milestoneLabel: HTMLElement;
  milestone: HTMLElement;
  buy: HTMLButtonElement;
  buyLabel: HTMLElement;
  buyCost: HTMLElement;
  buyWait: HTMLElement;
  auto: HTMLButtonElement;
  info: HTMLButtonElement;
  hint: HTMLElement;
  shown: RowState | null;
}

export function createGeneratorsTab(store: Store): TabView {
  const disposer = new Disposer();

  // Selector de cantidad
  const amountButtons = new Map<BuyAmount, HTMLButtonElement>();
  const amountGroup = h('div', {
    class: 'segmented',
    attrs: { role: 'group', 'aria-label': t('buy.amount.label') },
  });
  for (const amount of BUY_AMOUNTS) {
    const key = `buy.amount.${String(amount)}` as MessageKey;
    const button = h('button', { class: 'segmented__option', text: t(key), attrs: { type: 'button' } });
    disposer.listen(button, 'click', () => {
      store.dispatch(setBuyAmount, { amount });
    });
    amountButtons.set(amount, button);
    amountGroup.append(button);
  }

  // Autocompra (Instinto)
  const thresholdButtons = new Map<number, HTMLButtonElement>();
  const thresholdGroup = h('div', {
    class: 'segmented segmented--small',
    attrs: { role: 'group', 'aria-label': t('autobuy.threshold.label') },
  });
  for (const threshold of AUTOBUY_THRESHOLDS) {
    const button = h('button', {
      class: 'segmented__option',
      text: formatPercent(threshold, getLocale(), 0),
      attrs: { type: 'button' },
    });
    disposer.listen(button, 'click', () => {
      store.dispatch(setAutobuyThreshold, { threshold });
    });
    thresholdButtons.set(threshold, button);
    thresholdGroup.append(button);
  }
  const thresholdText = h('p', { class: 'autobuy__text' });

  // Poda (fase 9, con una placa del plasmodio cartografiada): cómo elige la autocompra.
  const modeButtons = new Map<AutobuyMode, HTMLButtonElement>();
  const modeGroup = h('div', {
    class: 'segmented segmented--small',
    attrs: {
      role: 'group',
      'aria-label': t('autobuy.mode.label'),
      'aria-describedby': 'autobuy-payback-desc',
    },
  });
  for (const mode of AUTOBUY_MODES) {
    const button = h('button', {
      class: 'segmented__option',
      text: t(MODE_KEYS[mode]),
      attrs: { type: 'button', 'aria-pressed': 'false' },
    });
    disposer.listen(button, 'click', () => {
      store.dispatch(setAutobuyMode, { mode });
    });
    modeButtons.set(mode, button);
    modeGroup.append(button);
  }
  const paybackStatus = h('p', { class: 'autobuy__saving tabular', attrs: { hidden: true } });
  const modeBox = h('div', { class: 'autobuy__mode', attrs: { hidden: true } }, [
    modeGroup,
    h('p', { class: 'autobuy__desc', id: 'autobuy-payback-desc', text: t('autobuy.payback.desc') }),
    paybackStatus,
  ]);
  /** Segundo de juego del último «Ahorrando para»: se recalcula como mucho una vez por segundo. */
  let paybackShownAt = Number.NaN;

  const autobuyBar = h('div', { class: 'autobuy', attrs: { hidden: true } }, [
    h('h3', { class: 'autobuy__title', text: t('autobuy.title') }),
    thresholdText,
    thresholdGroup,
    modeBox,
  ]);

  const list = h('ul', { class: 'gen-list' });
  const intro = createHint(store, 'hint.generators', t('hint.generators'));
  const autobuyHint = createHint(store, 'hint.autobuy', t('hint.autobuy'));
  const milestoneHint = createHint(store, 'hint.milestone', t('hint.milestone'));
  // En la pradera (fase 10) el motor es el Anillo de hadas, un generador barato: comprarlo de hito
  // en hito es lo que más rinde, y la cantidad «Hito» ya existe pero casi nadie la mira.
  const prairieHint = createHint(store, 'hint.prairieMilestone', t('hint.prairieMilestone'));
  const root = h('div', { class: 'tab tab--generators' }, [
    h('div', { class: 'tab__toolbar' }, [
      h('h2', { class: 'tab__title', text: t('generators.title') }),
      amountGroup,
    ]),
    intro.root,
    milestoneHint.root,
    prairieHint.root,
    autobuyHint.root,
    autobuyBar,
    list,
  ]);

  const rows: Row[] = GENERATORS.map((def) => {
    const id = def.id;
    const info = h('button', { class: 'gen__icon', attrs: { type: 'button' } }, [generatorIcon(id)]);
    const name = h('h3', { class: 'gen__name' });
    // «×12» a la vista y «Tienes 12» para el lector: un span genérico no admite aria-label.
    const ownedVisible = h('span', { attrs: { 'aria-hidden': 'true' } });
    const ownedSr = h('span', { class: 'visually-hidden' });
    const owned = h('span', { class: 'gen__owned tabular' }, [ownedVisible, ownedSr]);
    const stats = h('p', { class: 'gen__stats tabular' });
    const milestoneFill = h('span', { class: 'bar__fill' });
    const milestoneLabel = h('span', { class: 'gen__milestone-label tabular' });
    const milestone = h('div', { class: 'gen__milestone' }, [
      h('span', { class: 'bar', attrs: { 'aria-hidden': 'true' } }, [milestoneFill]),
      milestoneLabel,
    ]);
    const hint = h('p', { class: 'gen__hint', text: t('gen.hidden.hint') });
    const buyLabel = h('span', { class: 'buy__label' });
    const buyCost = h('span', { class: 'buy__cost tabular' });
    const buyWait = h('span', { class: 'buy__wait tabular' });
    // Coste y espera van juntos: con el botón a todo lo ancho comparten línea, y que aparezca la
    // espera al no llegar no cambia la altura del botón ni mueve las filas de abajo.
    const buy = h('button', { class: 'gen__buy button button--primary', attrs: { type: 'button' } }, [
      buyLabel,
      h('span', { class: 'buy__price' }, [buyCost, buyWait]),
    ]);
    const auto = h('button', {
      class: 'gen__auto toggle',
      text: t('gen.autobuy.on'),
      attrs: {
        type: 'button',
        'aria-pressed': 'false',
        'aria-label': t('gen.autobuy.label', { name: t(nameKey(id)) }),
      },
    });
    const root = h('li', { class: 'gen', attrs: { hidden: true } }, [
      info,
      h('div', { class: 'gen__main' }, [
        h('div', { class: 'gen__head' }, [name, owned]),
        stats,
        milestone,
        hint,
      ]),
      h('div', { class: 'gen__actions' }, [buy, auto]),
    ]);

    disposer.listen(buy, 'click', () => {
      if (buy.getAttribute('aria-disabled') === 'true') return;
      store.dispatch(buyGenerator, { id, amount: store.state.settings.buyAmount });
    });
    disposer.listen(auto, 'click', () => {
      store.dispatch(setAutobuyGenerator, { id, on: !store.state.autobuy.generators[id] });
    });
    attachTooltip(
      info,
      () => {
        if (revealState(store.state, id) !== 'full') return t('gen.hidden.hint');
        const d = derived(store.state);
        return [
          t(nameKey(id)),
          biomeText(store.state, flavorKey(id)),
          ...numberDetails(d.unitProduction[id], d.generatorProduction[id]),
        ];
      },
      disposer,
      { tapToggles: true },
    );
    attachTooltip(
      buy,
      () => {
        const state = store.state;
        const quote = quoteGenerator(state, id, state.settings.buyAmount);
        const count = Math.max(1, quote.count);
        const gain = previewGenerator(state, id, count);
        return [
          t('gen.buy', { count: formatCount(count), unit: tp(unitKey(id), count) }),
          t('upg.gainProduction', { value: fmt(gain.production) }),
          ...numberDetails(quote.cost, gain.production),
        ];
      },
      disposer,
    );

    list.append(root);
    return {
      id,
      root,
      name,
      owned,
      ownedVisible,
      ownedSr,
      stats,
      milestoneFill,
      milestoneLabel,
      milestone,
      buy,
      buyLabel,
      buyCost,
      buyWait,
      auto,
      info,
      hint,
      shown: null,
    };
  });

  function updateRow(row: Row, state: GameState): void {
    const id = row.id;
    const reveal = revealState(state, id);
    if (reveal === 'silhouette' && !hasSeen(state, `gen.${id}.silhouette`)) {
      store.dispatch(markSeen, { key: `gen.${id}.silhouette` });
    }
    if (reveal === 'full' && !hasSeen(state, `gen.${id}.full`)) {
      store.dispatch(markSeen, { key: `gen.${id}.full` });
    }
    setHidden(row.root, reveal === 'hidden');
    if (reveal === 'hidden') return;

    if (row.shown !== reveal) {
      row.shown = reveal;
      row.root.dataset.reveal = reveal;
      setText(row.name, reveal === 'full' ? t(nameKey(id)) : t('gen.hidden'));
      setAttr(
        row.info,
        'aria-label',
        // «???» se ve, pero leído en voz alta no dice qué hace el botón.
        reveal === 'full' ? t('common.more', { name: t(nameKey(id)) }) : t('gen.hidden.label'),
      );
    }
    const silhouette = reveal === 'silhouette';
    setHidden(row.hint, !silhouette);
    setHidden(row.stats, silhouette);
    setHidden(row.milestone, silhouette);
    setHidden(row.buy, silhouette);
    setHidden(row.owned, silhouette);
    if (silhouette) {
      setHidden(row.auto, true);
      return;
    }

    const d = derived(state);
    const owned = state.owned[id];
    setText(row.ownedVisible, t('gen.owned', { count: formatCount(owned) }));
    setText(row.ownedSr, t('gen.owned.label', { count: formatCount(owned) }));

    const unit = d.unitProduction[id];
    const total = d.generatorProduction[id];
    const share = num.gt(d.production, 0) ? num.toNumber(num.div(total, d.production)) : 0;
    const tag = biomeTag(state, id);
    setText(
      row.stats,
      [
        t('gen.unitProduction', { value: fmt(unit) }),
        t('gen.totalProduction', { value: fmt(total) }),
        t('gen.share', { percent: formatPercent(share, getLocale(), 1) }),
        // El factor del bioma, con texto: el número ya lo incluye y sin esto no se sabría por qué.
        ...(tag === null ? [] : [tag]),
      ].join(' · '),
    );

    const next = nextMilestone(owned);
    if (next === null) {
      setText(row.milestoneLabel, t('gen.milestone.done'));
      setProgress(row.milestoneFill, 1);
    } else {
      const prev = previousMilestone(owned);
      setText(row.milestoneLabel, t('gen.milestone', { next }));
      setProgress(row.milestoneFill, (owned - prev) / (next - prev));
    }

    const amount = state.settings.buyAmount;
    const quote = quoteGenerator(state, id, amount);
    const count = Math.max(1, quote.count);
    // {count} va agrupado con Intl («1.000»); la forma plural se elige con el número crudo.
    setText(row.buyLabel, t('gen.buy', { count: formatCount(count), unit: tp(unitKey(id), count) }));
    setText(row.buyCost, t('gen.cost', { value: fmt(quote.cost) }));
    setAttr(row.buy, 'aria-disabled', quote.affordable ? 'false' : 'true');
    toggleClass(row.buy, 'is-unaffordable', !quote.affordable);
    if (quote.affordable) {
      setText(row.buyWait, '');
    } else {
      const wait = secondsUntil(state, quote.cost);
      setText(
        row.buyWait,
        Number.isFinite(wait)
          ? t('gen.wait', { time: formatDuration(wait, getLocale()) })
          : t('gen.waitNoIncome'),
      );
    }

    const autobuy = hasAutobuyGenerators(state);
    setHidden(row.auto, !autobuy);
    if (autobuy) {
      const on = state.autobuy.generators[id];
      setAttr(row.auto, 'aria-pressed', on ? 'true' : 'false');
    }
  }

  function updateAutobuy(state: GameState): void {
    const perk = partnerPerks(state).autobuyByPayback;
    // Sin la ventaja, un modo «payback» guardado se comporta como el umbral: se ve el umbral.
    const payback = isPaybackActive(state);
    setHidden(modeBox, !perk);
    // En modo amortización el umbral no se aplica: su texto y su grupo se ocultan.
    setHidden(thresholdText, payback);
    setHidden(thresholdGroup, payback);
    setHidden(paybackStatus, !payback);
    if (perk) {
      for (const [mode, button] of modeButtons) {
        setAttr(button, 'aria-pressed', state.autobuy.mode === mode ? 'true' : 'false');
      }
    }
    if (payback) {
      // bestPurchase calcula los derivados de cada candidato: una vez por segundo basta (la
      // autocompra también decide una vez por segundo).
      const second = Math.floor(state.stats.totalTime);
      if (second !== paybackShownAt) {
        paybackShownAt = second;
        const target = paybackTarget(state);
        setText(
          paybackStatus,
          target === null
            ? t('autobuy.payback.idle')
            : t('autobuy.payback.saving', {
                name: candidateName(target),
                time: formatDuration(secondsUntil(state, target.cost), getLocale()),
              }),
        );
      }
    } else {
      // Al volver al modo amortización se recalcula en el acto, sin esperar al segundo siguiente.
      paybackShownAt = Number.NaN;
      setText(
        thresholdText,
        t('autobuy.threshold', { percent: formatPercent(state.autobuy.threshold, getLocale(), 0) }),
      );
      for (const [threshold, button] of thresholdButtons) {
        setAttr(button, 'aria-pressed', state.autobuy.threshold === threshold ? 'true' : 'false');
      }
    }
  }

  function update(): void {
    const state = store.state;
    for (const [amount, button] of amountButtons) {
      setAttr(button, 'aria-pressed', state.settings.buyAmount === amount ? 'true' : 'false');
    }
    const autobuy = hasAutobuyGenerators(state);
    setHidden(autobuyBar, !autobuy);
    if (autobuy) updateAutobuy(state);
    intro.update(
      GENERATORS.some((g) => revealState(state, g.id) === 'full') &&
        GENERATORS.every((g) => state.owned[g.id] === 0),
    );
    autobuyHint.update(autobuy);
    // Avisa del primer hito cuando ya se ve cerca: algún generador con 10 a 24 unidades.
    milestoneHint.update(GENERATORS.some((g) => state.owned[g.id] >= 10 && state.owned[g.id] < 25));
    prairieHint.update(state.forest.biome === 'prairie' && revealState(state, 'fairyRing') === 'full');
    for (const row of rows) updateRow(row, state);
  }

  return {
    id: 'generators',
    root,
    update,
    destroy: () => {
      disposer.dispose();
      intro.destroy();
      autobuyHint.destroy();
      milestoneHint.destroy();
      prairieHint.destroy();
    },
  };
}

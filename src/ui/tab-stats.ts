/**
 * Pestaña Estadísticas (PROMPT.md §13): nutrientes de la partida y de vida, N/s máximo,
 * clics, gotas, esporulaciones, tiempo jugado (partida y total) y fecha de inicio. Con el
 * plasmodio (fase 9), una sección suya: Rastro ganado, placas cartografiadas y pulsos dados.
 */
import { formatDate, formatDuration } from '../i18n/format.ts';
import { fmt, formatCount, getLocale, numberTooltip, t, tp, type MessageKey } from '../i18n/index.ts';
import type { GameState } from '../core/state.ts';
import { Disposer, h, setHidden, setText } from './dom.ts';
import { focusableWhileTooltip } from './hud.ts';
import { dispersalCount, isActOneClosed, isReturnClosed } from '../core/forest.ts';
import { PLATES } from '../data/plasmodium-plates.ts';
import { mappedCount, type PlasmodiumState } from '../partners/plasmodium/state.ts';
import { biomeName } from './biome-text.ts';
import { visibleAchievements } from './tab-achievements.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';
import { attachTooltip } from './tooltip.ts';

/** Partidas que se listan en Estadísticas, de la más reciente a la más vieja. */
const HISTORY_SHOWN = 10;

interface StatRow {
  label: MessageKey;
  value: (state: GameState) => string;
  /** Cantidad cruda para el tooltip de los números grandes. */
  raw?: (state: GameState) => number;
  /** Solo se muestra cuando se cumple (las del viaje esperan al Acto I). */
  when?: (state: GameState) => boolean;
}

const ROWS: readonly StatRow[] = [
  { label: 'stats.runEarned', value: (s) => fmt(s.runEarned), raw: (s) => s.runEarned },
  { label: 'stats.lifetimeEarned', value: (s) => fmt(s.lifetimeEarned), raw: (s) => s.lifetimeEarned },
  {
    label: 'stats.maxNps',
    value: (s) => t('hud.perSecond', { value: fmt(s.stats.maxNps) }),
    raw: (s) => s.stats.maxNps,
  },
  // Desde el millón las cuentas van abreviadas (formatCount): el tooltip da la cifra entera.
  { label: 'stats.clicks', value: (s) => formatCount(s.stats.clicks), raw: (s) => s.stats.clicks },
  { label: 'stats.drops', value: (s) => formatCount(s.stats.drops), raw: (s) => s.stats.drops },
  {
    label: 'stats.sporulations',
    value: (s) => formatCount(s.stats.sporulations),
    raw: (s) => s.stats.sporulations,
  },
  { label: 'stats.sporeLevel', value: (s) => formatCount(s.spores.level), raw: (s) => s.spores.level },
  { label: 'stats.biome', value: (s) => biomeName(s.forest.biome), when: isActOneClosed },
  { label: 'stats.dispersals', value: (s) => formatCount(dispersalCount(s)), when: isActOneClosed },
  // El ciclo libre (fase 10), desde El regreso. Un número: la lista de récords vive en la Crónica.
  {
    label: 'stats.cycles',
    value: (s) => formatCount(s.cycle.done),
    raw: (s) => s.cycle.done,
    when: isReturnClosed,
  },
  {
    label: 'stats.achievements',
    value: (s) => `${formatCount(s.achievements.length)} / ${formatCount(visibleAchievements(s).length)}`,
  },
  { label: 'stats.runTime', value: (s) => formatDuration(s.stats.runTime, getLocale()) },
  { label: 'stats.totalTime', value: (s) => formatDuration(s.stats.totalTime, getLocale()) },
  { label: 'stats.startedAt', value: (s) => formatDate(s.stats.startedAt, getLocale()) },
];

interface PartnerRow {
  label: MessageKey;
  value: (p: PlasmodiumState) => string;
  raw?: (p: PlasmodiumState) => number;
}

const PLASMODIUM_ROWS: readonly PartnerRow[] = [
  { label: 'stats.plasmodium.trailEarned', value: (p) => fmt(p.trailEarned), raw: (p) => p.trailEarned },
  {
    label: 'stats.plasmodium.plates',
    value: (p) => `${formatCount(mappedCount(p))} / ${formatCount(PLATES.length)}`,
  },
  { label: 'stats.plasmodium.pulses', value: (p) => formatCount(p.stats.pulses) },
];

export function createStatsTab(store: Store): TabView {
  const disposer = new Disposer();
  const values: HTMLElement[] = [];
  const labels: HTMLElement[] = [];
  const list = h(
    'dl',
    { class: 'stats' },
    ROWS.flatMap((row) => {
      const value = h('dd', { class: 'stats__value tabular' });
      const label = h('dt', { class: 'stats__label', text: t(row.label) });
      values.push(value);
      labels.push(label);
      if (row.raw) {
        const raw = row.raw;
        attachTooltip(value, () => numberTooltip(raw(store.state)), disposer);
      }
      return [label, value];
    }),
  );
  // Plasmodio: solo con el socio en la partida.
  const partnerValues: HTMLElement[] = [];
  const partnerTitle = h('h3', {
    class: 'settings__title history__title',
    text: t('stats.plasmodium'),
    attrs: { hidden: true },
  });
  const partnerList = h(
    'dl',
    { class: 'stats', attrs: { hidden: true } },
    PLASMODIUM_ROWS.flatMap((row) => {
      const value = h('dd', { class: 'stats__value tabular' });
      partnerValues.push(value);
      if (row.raw) {
        const raw = row.raw;
        attachTooltip(
          value,
          () => {
            const p = store.state.partners.plasmodium;
            return p ? numberTooltip(raw(p)) : null;
          },
          disposer,
        );
      }
      return [h('dt', { class: 'stats__label', text: t(row.label) }), value];
    }),
  );
  const updatePartner = (state: GameState): void => {
    const p = state.partners.plasmodium;
    setHidden(partnerTitle, p === null);
    setHidden(partnerList, p === null);
    if (p === null) return;
    PLASMODIUM_ROWS.forEach((row, i) => {
      const node = partnerValues[i];
      if (!node) return;
      setText(node, row.value(p));
      if (row.raw) focusableWhileTooltip(node, numberTooltip(row.raw(p)) !== null);
    });
  };

  // Últimas partidas: se rehace solo cuando termina una (cambia la longitud del historial).
  const historyList = h('ol', { class: 'history' });
  const historyEmpty = h('p', { class: 'tab__intro', text: t('stats.history.empty') });
  let historyBuiltFor = -1;
  const buildHistory = (state: GameState): void => {
    const recent = state.history.slice(-HISTORY_SHOWN).reverse();
    historyList.replaceChildren(
      ...recent.map((run) => {
        const params = { n: formatCount(run.sporulation), time: formatDuration(run.duration, getLocale()) };
        // Fuera del natal la fila dice en qué bioma se jugó.
        const text =
          run.biome === 'natal'
            ? tp('stats.history.row', run.spores, params)
            : tp('stats.history.rowIn', run.spores, { ...params, biome: biomeName(run.biome) });
        return h('li', { class: 'history__row tabular', text });
      }),
    );
    setHidden(historyEmpty, recent.length > 0);
  };

  const root = h('div', { class: 'tab tab--stats' }, [
    h('div', { class: 'tab__toolbar' }, [h('h2', { class: 'tab__title', text: t('stats.title') })]),
    list,
    partnerTitle,
    partnerList,
    h('h3', { class: 'settings__title history__title', text: t('stats.history.title') }),
    historyEmpty,
    historyList,
  ]);
  return {
    id: 'stats',
    root,
    update() {
      ROWS.forEach((row, i) => {
        const node = values[i];
        if (!node) return;
        const shown = row.when?.(store.state) ?? true;
        setHidden(node, !shown);
        const label = labels[i];
        if (label) setHidden(label, !shown);
        if (!shown) return;
        setText(node, row.value(store.state));
        if (row.raw) focusableWhileTooltip(node, numberTooltip(row.raw(store.state)) !== null);
      });
      updatePartner(store.state);
      if (store.state.history.length !== historyBuiltFor) {
        historyBuiltFor = store.state.history.length;
        buildHistory(store.state);
      }
    },
    destroy: () => {
      disposer.dispose();
    },
  };
}

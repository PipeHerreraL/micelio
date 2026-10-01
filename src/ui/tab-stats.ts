/**
 * Pestaña Estadísticas (PROMPT.md §13): nutrientes de la partida y de vida, N/s máximo,
 * clics, gotas, esporulaciones, tiempo jugado (partida y total) y fecha de inicio.
 */
import { formatDate, formatDuration } from '../i18n/format.ts';
import { fmt, formatCount, getLocale, numberTooltip, t, tp, type MessageKey } from '../i18n/index.ts';
import type { GameState } from '../core/state.ts';
import { Disposer, h, setHidden, setText } from './dom.ts';
import { focusableWhileTooltip } from './hud.ts';
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
}

const ROWS: readonly StatRow[] = [
  { label: 'stats.runEarned', value: (s) => fmt(s.runEarned), raw: (s) => s.runEarned },
  { label: 'stats.lifetimeEarned', value: (s) => fmt(s.lifetimeEarned), raw: (s) => s.lifetimeEarned },
  {
    label: 'stats.maxNps',
    value: (s) => t('hud.perSecond', { value: fmt(s.stats.maxNps) }),
    raw: (s) => s.stats.maxNps,
  },
  { label: 'stats.clicks', value: (s) => formatCount(s.stats.clicks) },
  { label: 'stats.drops', value: (s) => formatCount(s.stats.drops) },
  { label: 'stats.sporulations', value: (s) => formatCount(s.stats.sporulations) },
  { label: 'stats.sporeLevel', value: (s) => formatCount(s.spores.level) },
  {
    label: 'stats.achievements',
    value: (s) => `${formatCount(s.achievements.length)} / ${formatCount(visibleAchievements(s).length)}`,
  },
  { label: 'stats.runTime', value: (s) => formatDuration(s.stats.runTime, getLocale()) },
  { label: 'stats.totalTime', value: (s) => formatDuration(s.stats.totalTime, getLocale()) },
  { label: 'stats.startedAt', value: (s) => formatDate(s.stats.startedAt, getLocale()) },
];

export function createStatsTab(store: Store): TabView {
  const disposer = new Disposer();
  const values: HTMLElement[] = [];
  const list = h(
    'dl',
    { class: 'stats' },
    ROWS.flatMap((row) => {
      const value = h('dd', { class: 'stats__value tabular' });
      values.push(value);
      if (row.raw) {
        const raw = row.raw;
        attachTooltip(value, () => numberTooltip(raw(store.state)), disposer);
      }
      return [h('dt', { class: 'stats__label', text: t(row.label) }), value];
    }),
  );
  // Últimas partidas: se rehace solo cuando termina una (cambia la longitud del historial).
  const historyList = h('ol', { class: 'history' });
  const historyEmpty = h('p', { class: 'tab__intro', text: t('stats.history.empty') });
  let historyBuiltFor = -1;
  const buildHistory = (state: GameState): void => {
    const recent = state.history.slice(-HISTORY_SHOWN).reverse();
    historyList.replaceChildren(
      ...recent.map((run) =>
        h('li', {
          class: 'history__row tabular',
          text: tp('stats.history.row', run.spores, {
            n: formatCount(run.sporulation),
            time: formatDuration(run.duration, getLocale()),
          }),
        }),
      ),
    );
    setHidden(historyEmpty, recent.length > 0);
  };

  const root = h('div', { class: 'tab tab--stats' }, [
    h('div', { class: 'tab__toolbar' }, [h('h2', { class: 'tab__title', text: t('stats.title') })]),
    list,
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
        setText(node, row.value(store.state));
        if (row.raw) focusableWhileTooltip(node, numberTooltip(row.raw(store.state)) !== null);
      });
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

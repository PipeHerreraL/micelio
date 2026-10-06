/**
 * Pestaña Crónica (docs/ROADMAP.md, fases 8 y 10): una entrada por bosque del viaje, del natal al
 * actual y El regreso, con lo que costó cerrarlo y botones para releer sus láminas; tras El regreso,
 * el ciclo libre con sus récords. Aparece con el Acto I. La lista se rehace solo al cerrar un
 * bosque, al viajar o al sembrar o cumplir un ciclo; lo que cambia dentro de una partida (nivel,
 * progreso) se actualiza con setText. El Acto I se reconoce por el tramo 0 y El regreso por el 5,
 * no por el bioma: los dos son el natal.
 */
import { colonizedCount, forestGoal, isActOneClosed, isReturnClosed, lineageFactor } from '../core/forest.ts';
import type { ChronicleEntry, CycleRecord, GameState } from '../core/state.ts';
import { VOW_IDS } from '../data/cycle.ts';
import {
  BIOME_ADAPTATIONS,
  BIOME_IDS,
  HOME_BIOME,
  RETURN_LEG,
  type BiomeId,
  type DestinationId,
} from '../data/biomes.ts';
import { formatDay, formatDuration, formatFactor } from '../i18n/format.ts';
import { formatCount, getLocale, t, tp, type MessageKey } from '../i18n/index.ts';
import { biomeName, biomeRules } from './biome-text.ts';
import { openChapter, type ChapterNav } from './chapter.ts';
import { Disposer, h, setHidden, setProgress, setText } from './dom.ts';
import { createHint } from './hint.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';
import { forestGoalFill, forestProgressText, soilSwatch, vowList } from './wind.ts';

/** Partes vivas de la entrada del bosque actual. */
interface LiveParts {
  level: HTMLElement | null;
  progress: HTMLElement | null;
  bar: HTMLElement | null;
  here: HTMLElement | null;
}

/** Total de adaptaciones de un bioma (sale de los datos). */
function adaptationsOf(biome: BiomeId): number {
  return BIOME_ADAPTATIONS.filter((a) => a.biome === biome).length;
}

const day = (timestamp: number): string => formatDay(timestamp, getLocale());
const duration = (seconds: number): string => formatDuration(seconds, getLocale());

function learnedHere(state: GameState, biome: BiomeId): number {
  return BIOME_ADAPTATIONS.filter((a) => a.biome === biome && state.biomeAdaptations[a.id] > 0).length;
}

export function createChronicleTab(store: Store, nav: ChapterNav): TabView {
  const disposer = new Disposer();
  const hint = createHint(store, 'hint.chronicle', t('hint.chronicle'));
  const lineage = h('p', { class: 'chronicle__lineage', attrs: { hidden: true } });
  const list = h('ol', { class: 'chronicle' });
  // El ciclo libre (fase 10): ciclos cumplidos y un récord por elemento de lista, en dos líneas. Nada
  // de esto va en un `dl.stats`: a 375 px los valores largos aplastan la columna de las etiquetas.
  const cycleDone = h('p', { class: 'tabular' });
  const records = h('ul', { class: 'chronicle__records' });
  const recordsEmpty = h('p', { class: 'chronicle__records-empty', text: t('chronicle.cycle.empty') });
  const cycleSection = h(
    'section',
    { class: 'chronicle__cycle', attrs: { hidden: true, 'aria-labelledby': 'chronicle-cycle-title' } },
    [
      h('h3', { class: 'settings__title', id: 'chronicle-cycle-title', text: t('chronicle.cycle.title') }),
      cycleDone,
      records,
      recordsEmpty,
    ],
  );
  const root = h('div', { class: 'tab tab--chronicle' }, [
    h('div', { class: 'tab__toolbar' }, [h('h2', { class: 'tab__title', text: t('chronicle.title') })]),
    hint.root,
    h('p', { class: 'tab__intro', text: t('chronicle.intro') }),
    lineage,
    list,
    cycleSection,
  ]);
  let builtFor = '';
  let live: LiveParts = { level: null, progress: null, bar: null, here: null };
  // Una línea por bioma colonizado: se puede seguir aprendiendo después de colonizarlo, también
  // desde otro bioma, y la lista no se rehace al comprar.
  let learned: { biome: BiomeId; node: HTMLElement }[] = [];
  // Los listeners de los botones de releer se rehacen con la lista.
  let entryDisposer = new Disposer();

  function rereadButton(text: string, label: string | null, open: () => void): HTMLButtonElement {
    const button = h('button', {
      class: 'button button--quiet chronicle__reread',
      text,
      attrs: { type: 'button', ...(label ? { 'aria-label': label } : {}) },
    });
    entryDisposer.listen(button, 'click', open);
    return button;
  }

  function entryRoot(
    biome: BiomeId,
    status: MessageKey,
    current: boolean,
    lines: Node[],
    buttons: Node[],
  ): HTMLElement {
    return h(
      'li',
      {
        class: `chronicle__entry${current ? ' is-current' : ''}`,
        attrs: current ? { 'aria-current': 'location' } : {},
      },
      [
        h('h3', { class: 'chronicle__title' }, [
          soilSwatch(biome),
          h('span', { text: t('chronicle.entry', { name: biomeName(biome), status: t(status) }) }),
          // El borde de micelio marca el bosque actual; para el lector, con texto.
          ...(current && status !== 'chronicle.status.current'
            ? [h('span', { class: 'visually-hidden', text: ` ${t('chronicle.current')}` })]
            : []),
        ]),
        ...lines,
        ...(buttons.length > 0 ? [h('div', { class: 'chronicle__actions' }, buttons)] : []),
      ],
    );
  }

  function natalEntry(state: GameState, entry: ChronicleEntry): HTMLElement {
    const here = state.forest.leg === 0;
    const level = h('p', { class: 'tabular' });
    if (here) live.level = level;
    else setText(level, t('chronicle.level', { level: formatCount(entry.levelReached ?? 0) }));
    const lines: Node[] = [
      h('p', { text: t('chronicle.since', { date: day(entry.arrivedAt) }) }),
      h('p', {
        class: 'tabular',
        text: tp('chronicle.actOne', entry.sporulations, { time: duration(entry.playTime) }),
      }),
      level,
    ];
    if (entry.leftAt !== null) lines.push(h('p', { text: t('chronicle.left', { date: day(entry.leftAt) }) }));
    const buttons = [
      rereadButton(t('chronicle.reread.act1'), null, () => {
        openChapter(store, { kind: 'act1' }, nav, { reread: true });
      }),
    ];
    return entryRoot('natal', 'chronicle.status.actOne', here, lines, buttons);
  }

  function learnedLine(state: GameState, biome: DestinationId): HTMLElement {
    const node = h('p', {
      text: t('chronicle.adaptations', { count: learnedHere(state, biome), total: adaptationsOf(biome) }),
    });
    learned.push({ biome, node });
    return node;
  }

  function arriveButton(biome: DestinationId): HTMLButtonElement {
    return rereadButton(
      t('chronicle.reread.arrive'),
      t('chronicle.reread.arrive.label', { name: biomeName(biome) }),
      () => {
        openChapter(store, { kind: 'arrive', biome }, nav, { reread: true });
      },
    );
  }

  function colonizedEntry(state: GameState, entry: ChronicleEntry, biome: DestinationId): HTMLElement {
    // Actual solo en su tramo: un ciclo libre en el mismo bioma (fase 10) no pisa con su nivel en
    // vivo el que se alcanzó en el viaje.
    const here = entry.leg === state.forest.leg;
    const level = h('p', { class: 'tabular' });
    if (here) live.level = level;
    else setText(level, t('chronicle.level', { level: formatCount(entry.levelReached ?? 0) }));
    const lines: Node[] = [
      h('p', { text: t('chronicle.arrived', { date: day(entry.arrivedAt) }) }),
      h('p', {
        class: 'tabular',
        text: tp('chronicle.colonizedIn', entry.sporulations, {
          date: day(entry.colonizedAt ?? entry.arrivedAt),
          time: duration(entry.playTime),
        }),
      }),
      level,
      learnedLine(state, biome),
      h(
        'ul',
        { class: 'chronicle__rules' },
        biomeRules(biome).map((rule) => h('li', { text: rule })),
      ),
    ];
    if (entry.leftAt !== null) lines.push(h('p', { text: t('chronicle.left', { date: day(entry.leftAt) }) }));
    const buttons = [
      arriveButton(biome),
      rereadButton(
        t('chronicle.reread.colonize'),
        t('chronicle.reread.colonize.label', { name: biomeName(biome) }),
        () => {
          openChapter(store, { kind: 'colonize', biome }, nav, { reread: true });
        },
      ),
    ];
    return entryRoot(biome, 'chronicle.status.colonized', here, lines, buttons);
  }

  function currentEntry(state: GameState, biome: DestinationId): HTMLElement {
    const progress = h('span', { class: 'tabular' });
    const fill = h('span', { class: 'bar__fill' });
    const bar = h('span', { class: 'bar bar--thin', attrs: { 'aria-hidden': 'true' } }, [fill]);
    const here = h('p', { class: 'tabular' });
    live = { level: null, progress, bar: fill, here };
    const lines: Node[] = [
      h('p', { text: t('chronicle.arrived', { date: day(state.forest.arrivedAt) }) }),
      h('p', { class: 'chronicle__progress' }, [progress, bar]),
      here,
    ];
    return entryRoot(biome, 'chronicle.status.current', true, lines, [arriveButton(biome)]);
  }

  /** Releer las láminas de El regreso: la llegada siempre; «La red planetaria», ya cumplido. */
  function returnButtons(closed: boolean): HTMLButtonElement[] {
    const buttons = [
      rereadButton(t('chronicle.reread.return.arrive'), null, () => {
        openChapter(store, { kind: 'returnArrive' }, nav, { reread: true });
      }),
    ];
    if (closed) {
      buttons.push(
        rereadButton(t('chronicle.reread.return.close'), null, () => {
          openChapter(store, { kind: 'returnClose' }, nav, { reread: true });
        }),
      );
    }
    return buttons;
  }

  /** El regreso cumplido: la sexta entrada. Sin ciclos, el linaje sigue viviendo en ella. */
  function returnEntry(state: GameState, entry: ChronicleEntry): HTMLElement {
    const here = entry.leg === state.forest.leg && state.cycle.stays === 0;
    const lines: Node[] = [
      h('p', { text: t('chronicle.arrived', { date: day(entry.arrivedAt) }) }),
      h('p', {
        class: 'tabular',
        text: tp('chronicle.returnIn', entry.sporulations, {
          date: day(entry.colonizedAt ?? entry.arrivedAt),
          time: duration(entry.playTime),
        }),
      }),
    ];
    // El nivel en vivo, mientras se viva aquí; la entrada no guarda uno propio (no se deja).
    if (here) {
      const level = h('p', { class: 'tabular' });
      live.level = level;
      lines.push(level);
    }
    return entryRoot(HOME_BIOME, 'chronicle.status.return', here, lines, returnButtons(true));
  }

  /** El regreso en curso: aún sin entrada, con su progreso hasta el nivel 500. */
  function returnCurrentEntry(state: GameState): HTMLElement {
    const progress = h('span', { class: 'tabular' });
    const fill = h('span', { class: 'bar__fill' });
    const bar = h('span', { class: 'bar bar--thin', attrs: { 'aria-hidden': 'true' } }, [fill]);
    const here = h('p', { class: 'tabular' });
    live = { level: null, progress, bar: fill, here };
    const lines: Node[] = [
      h('p', { text: t('chronicle.arrived', { date: day(state.forest.arrivedAt) }) }),
      h('p', { class: 'chronicle__progress' }, [progress, bar]),
      here,
    ];
    return entryRoot(HOME_BIOME, 'chronicle.return.current', true, lines, returnButtons(false));
  }

  /** Un récord: el bioma y sus votos; y el tiempo de reloj, las partidas y la fecha. */
  function recordItem(record: CycleRecord): HTMLElement {
    const name = biomeName(record.biome);
    return h('li', { class: 'chronicle__record' }, [
      h('p', { class: 'chronicle__record-place' }, [
        soilSwatch(record.biome),
        h('span', {
          text:
            record.vows.length > 0
              ? t('chronicle.cycle.withVows', { name, vows: vowList(record.vows) })
              : name,
        }),
      ]),
      h('p', {
        class: 'tabular',
        text: tp('chronicle.cycle.record', record.runs, {
          time: duration(record.time / 1000),
          date: day(record.at),
        }),
      }),
    ]);
  }

  /** El ciclo libre, desde El regreso: los récords en el orden de los biomas. */
  function buildCycle(state: GameState): void {
    const open = isReturnClosed(state);
    setHidden(cycleSection, !open);
    if (!open) return;
    setText(cycleDone, tp('chronicle.cycle.done', state.cycle.done));
    // Por bioma y, dentro de cada uno, de menos votos a más, en el orden de VOW_IDS.
    const vowRank = (r: CycleRecord): number =>
      r.vows.reduce((sum, vow) => sum * 4 + VOW_IDS.indexOf(vow) + 1, 0);
    const sorted = [...state.records].sort(
      (a, b) =>
        BIOME_IDS.indexOf(a.biome) - BIOME_IDS.indexOf(b.biome) ||
        a.vows.length - b.vows.length ||
        vowRank(a) - vowRank(b),
    );
    records.replaceChildren(...sorted.map(recordItem));
    setHidden(records, sorted.length === 0);
    setHidden(recordsEmpty, sorted.length > 0);
  }

  function build(state: GameState): void {
    // Si el foco estaba en un botón de la lista, se va con ella: pasa al panel de la pestaña,
    // que es enfocable (familia de BUG-JOURNAL #5 y #8).
    const hadFocus = list.contains(document.activeElement);
    entryDisposer.dispose();
    entryDisposer = new Disposer();
    live = { level: null, progress: null, bar: null, here: null };
    learned = [];
    const items: HTMLElement[] = [];
    for (const entry of state.chronicle) {
      if (entry.leg === 0) items.push(natalEntry(state, entry));
      else if (entry.leg === RETURN_LEG) items.push(returnEntry(state, entry));
      else if (entry.biome !== HOME_BIOME) items.push(colonizedEntry(state, entry, entry.biome));
    }
    // El destino que aún se coloniza, y El regreso sin cumplir, no tienen entrada: se muestran en
    // curso, con su progreso.
    const biome = state.forest.biome;
    const goal = forestGoal(state).kind;
    if (goal === 'colonize' && biome !== HOME_BIOME) items.push(currentEntry(state, biome));
    else if (goal === 'return') items.push(returnCurrentEntry(state));
    list.replaceChildren(...items);
    buildCycle(state);
    if (hadFocus) root.closest<HTMLElement>('[role="tabpanel"]')?.focus();
  }

  return {
    id: 'chronicle',
    root,
    update() {
      const state = store.state;
      const open = isActOneClosed(state);
      hint.update(open);
      // Sembrar cambia de bosque sin cambiar de tramo, y un récord mejorado no alarga la lista: los
      // ciclos empezados y cumplidos también rehacen la Crónica.
      const { stays, done } = state.cycle;
      const key = `${state.chronicle.length}/${state.forest.leg}/${stays}/${done}/${state.records.length}`;
      if (key !== builtFor) {
        builtFor = key;
        build(state);
      }
      const count = colonizedCount(state);
      setHidden(lineage, count === 0);
      if (count > 0) {
        setText(
          lineage,
          tp('wind.lineage', count, { factor: formatFactor(lineageFactor(state), getLocale()) }),
        );
      }
      if (live.level) setText(live.level, t('chronicle.level', { level: formatCount(state.spores.level) }));
      for (const { biome, node } of learned) {
        setText(
          node,
          t('chronicle.adaptations', { count: learnedHere(state, biome), total: adaptationsOf(biome) }),
        );
      }
      if (live.progress && live.bar) {
        const goal = forestGoal(state);
        setText(live.progress, forestProgressText(goal));
        const fill = forestGoalFill(goal);
        if (fill !== null) setProgress(live.bar, fill);
      }
      if (live.here) {
        const runs = state.stats.sporulations - state.forest.arrivalSporulations;
        setText(
          live.here,
          tp('chronicle.here', runs, {
            time: duration(state.stats.totalTime - state.forest.arrivalPlayTime),
          }),
        );
      }
    },
    destroy: () => {
      disposer.dispose();
      entryDisposer.dispose();
      hint.destroy();
    },
  };
}

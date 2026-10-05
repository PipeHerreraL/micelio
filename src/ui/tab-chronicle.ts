/**
 * Pestaña Crónica (docs/ROADMAP.md, fase 8): una entrada por bosque del viaje, del natal al
 * actual, con lo que costó cerrarlo y botones para releer sus láminas. Aparece con el Acto I.
 * La lista se rehace solo al cerrar un bosque o al viajar; lo que cambia dentro de una partida
 * (nivel, progreso) se actualiza con setText.
 */
import { colonizedCount, forestGoal, isActOneClosed, lineageFactor } from '../core/forest.ts';
import type { ChronicleEntry, GameState } from '../core/state.ts';
import { BIOME_ADAPTATIONS, HOME_BIOME, type BiomeId, type DestinationId } from '../data/biomes.ts';
import { formatDay, formatDuration, formatFactor } from '../i18n/format.ts';
import { formatCount, getLocale, t, tp, type MessageKey } from '../i18n/index.ts';
import { biomeName, biomeRules } from './biome-text.ts';
import { openChapter, type ChapterNav } from './chapter.ts';
import { Disposer, h, setHidden, setProgress, setText } from './dom.ts';
import { createHint } from './hint.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';
import { forestGoalFill, forestProgressText, soilSwatch } from './wind.ts';

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
  const root = h('div', { class: 'tab tab--chronicle' }, [
    h('div', { class: 'tab__toolbar' }, [h('h2', { class: 'tab__title', text: t('chronicle.title') })]),
    hint.root,
    h('p', { class: 'tab__intro', text: t('chronicle.intro') }),
    lineage,
    list,
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
    const here = state.forest.biome === biome;
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
      if (entry.biome === 'natal') items.push(natalEntry(state, entry));
      else items.push(colonizedEntry(state, entry, entry.biome));
    }
    // El destino que aún se coloniza no tiene entrada: se muestra en curso, con su progreso.
    const biome = state.forest.biome;
    if (forestGoal(state).kind === 'colonize' && biome !== HOME_BIOME) items.push(currentEntry(state, biome));
    list.replaceChildren(...items);
    if (hadFocus) root.closest<HTMLElement>('[role="tabpanel"]')?.focus();
  }

  return {
    id: 'chronicle',
    root,
    update() {
      const state = store.state;
      const open = isActOneClosed(state);
      hint.update(open);
      const key = `${state.chronicle.length}/${state.forest.leg}`;
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

/**
 * Sección «Viento de esporas» de la pestaña Esporular (docs/ROADMAP.md, fases 8 y 10): dónde vive
 * el linaje, cuánto falta para colonizar, los destinos que quedan (tras el cuarto, El regreso y,
 * cumplido, sembrar cualquier bioma en el ciclo libre) y su confirmación. Aparece con el Acto I. Las
 * filas se crean una vez y se ocultan cuando el viento no las ofrece (`windTargets`); el foco nunca
 * se queda en un botón que desaparece (BUG-JOURNAL #5 y #8).
 */
import {
  canSporulate,
  departureCost,
  disperse,
  disperseBlock,
  disperseFunds,
  sporeGain,
} from '../core/actions.ts';
import {
  bestRecord,
  closedRingAhead,
  colonizedCount,
  forestGoal,
  isActOneClosed,
  lineageFactor,
  windTargets,
  type ForestGoal,
  type WindTargetKind,
} from '../core/forest.ts';
import { sporeFactor } from '../core/formulas.ts';
import { derived } from '../core/selectors.ts';
import type { GameState } from '../core/state.ts';
import {
  BIOME_IDS,
  COLONIZE_LEVEL,
  DESTINATION_IDS,
  DISPERSE_COST,
  HOME_BIOME,
  isDestinationId,
  type BiomeId,
} from '../data/biomes.ts';
import { CYCLE_GOAL_LEVEL } from '../data/cycle.ts';
import { SPORE_SOFTCAP_EXPONENT } from '../data/prestige.ts';
import { formatDuration, formatFactor } from '../i18n/format.ts';
import { formatBonus, formatCount, getLocale, t, tp, type MessageKey } from '../i18n/index.ts';
import { biomeName, biomeRules, biomeSoil } from './biome-text.ts';
import { Disposer, h, setAttr, setHidden, setProgress, setText, toggleClass } from './dom.ts';
import { createHint } from './hint.ts';
import { uiIcon } from './icons.ts';
import { openModal } from './modal.ts';
import type { Store } from './store.ts';

export interface WindSection {
  root: HTMLElement;
  update(): void;
  destroy(): void;
}

/** Muestra de suelo de tres franjas (decorativa): los colores salen de `[data-biome]` en CSS. */
export function soilSwatch(biome: string, extra = ''): HTMLElement {
  return h(
    'span',
    { class: `soil-swatch ${extra}`.trim(), attrs: { 'aria-hidden': 'true', 'data-biome': biome } },
    [h('span'), h('span'), h('span')],
  );
}

/**
 * Texto del progreso del bosque actual (`forestGoal`): Acto I, colonización, El regreso, el ciclo
 * libre o cumplido.
 */
export function forestProgressText(goal: ForestGoal): string {
  const level = formatCount(goal.level);
  switch (goal.kind) {
    case 'actOne':
      return t('biome.actOne', { level });
    case 'colonize':
      return t('biome.progress', { level, goal: formatCount(goal.goal) });
    case 'colonized':
      return t('biome.colonized', { level });
    case 'return':
      return t('biome.returnProgress', { level, goal: formatCount(goal.goal) });
    case 'free':
      return t('biome.free', { level });
    case 'cycle':
      return t('biome.cycleProgress', { n: formatCount(goal.n), level, goal: formatCount(goal.goal) });
    case 'cycleDone':
      return t('biome.cycleDone', { n: formatCount(goal.n), level });
  }
}

/** Lo que llena la barra de progreso: solo las metas con un nivel que alcanzar llevan barra. */
export function forestGoalFill(goal: ForestGoal): number | null {
  return 'goal' in goal ? goal.level / goal.goal : null;
}

/** Una fila de Viento: un destino del viaje, El regreso o un bioma que sembrar. */
interface TargetRow {
  biome: BiomeId;
  kind: WindTargetKind;
  root: HTMLElement;
  button: HTMLButtonElement;
  why: HTMLElement;
  /** El mejor ciclo del bioma, en las filas del ciclo libre. */
  record: HTMLElement | null;
}

/** La meta de El regreso: en su fila, en su confirmación y durante el tramo. */
function returnGoalText(): string {
  return t('wind.return.goal', { goal: formatCount(CYCLE_GOAL_LEVEL) });
}

function targetLabel(biome: BiomeId, kind: WindTargetKind): string {
  switch (kind) {
    case 'journey':
      return t(`biome.${biome}.go` as MessageKey);
    case 'return':
      return t('wind.return.go');
    case 'cycle':
      return t(`biome.${biome}.sow` as MessageKey);
  }
}

/** La línea de estilo de la fila; el natal no tiene reglas propias, así que tampoco estilo. */
function targetStyle(biome: BiomeId, kind: WindTargetKind): string | null {
  if (kind === 'return') return t('wind.return.style');
  return isDestinationId(biome) ? t(`biome.${biome}.style` as MessageKey) : null;
}

/** Bono del nivel de esporas (factor − 1), con el umbral de madurez del bosque actual. */
function bonusPercent(state: GameState, level: number): string {
  return formatBonus(sporeFactor(level, derived(state).sporeThreshold, SPORE_SOFTCAP_EXPONENT) - 1);
}

/** Lo que dice la confirmación de partir: título, reglas del destino, líneas y botón. */
export interface DepartureText {
  title: string;
  rules: string[];
  lines: string[];
  yes: string;
}

/**
 * La confirmación de partir hacia `to`, calculada del estado: viajar, volver a casa o sembrar. En
 * un ciclo sin cumplir dice si la esporulación de partir llega a la meta (queda el récord) o no
 * (este ciclo no dejará récord): salir sin cumplir está permitido, pero no debe pillar por sorpresa.
 */
export function departureText(state: GameState, to: BiomeId, kind: WindTargetKind): DepartureText {
  const gained = canSporulate(state) ? sporeGain(state) : 0;
  const cost = departureCost(state);
  const goal = forestGoal(state);
  const lines = [gained > 0 ? tp('wind.confirm.gain', gained) : t('wind.confirm.noGain')];
  if (goal.kind === 'cycle') {
    lines.push(
      goal.level + gained >= goal.goal
        ? t('wind.cycle.willComplete')
        : t('wind.cycle.noRecordWarning', { goal: formatCount(goal.goal) }),
    );
  }
  lines.push(
    tp('wind.confirm.cost', disperseFunds(state) - cost, { cost: formatCount(cost) }),
    t('wind.confirm.bonus', { current: bonusPercent(state, state.spores.level + gained) }),
    t('wind.confirm.lose'),
    t('wind.confirm.keep'),
  );
  // «No se puede volver a un bioma que dejaste» sería falso de camino a casa y en el ciclo libre.
  if (kind === 'journey') lines.push(t('wind.confirm.oneWay'));
  switch (kind) {
    case 'journey':
      return { title: t('wind.confirm.title'), rules: biomeRules(to), lines, yes: t('wind.confirm.yes') };
    case 'return':
      return {
        title: t('wind.return.confirmTitle'),
        rules: [returnGoalText()],
        lines,
        yes: t('wind.return.yes'),
      };
    case 'cycle':
      return { title: t('wind.sow.title'), rules: biomeRules(to), lines, yes: t('wind.sow.yes') };
  }
}

export function createWindSection(store: Store): WindSection {
  const disposer = new Disposer();
  const hint = createHint(store, 'hint.wind', t('hint.wind'));
  const title = h('h3', {
    class: 'settings__title wind__title',
    id: 'wind-title',
    text: t('wind.title'),
    attrs: { tabindex: -1 },
  });
  const here = h('p', { class: 'wind__here' });
  const progressText = h('span', { class: 'tabular' });
  const progressFill = h('span', { class: 'bar__fill' });
  const progressBar = h('span', { class: 'bar bar--thin', attrs: { 'aria-hidden': 'true' } }, [progressFill]);
  const progress = h('p', { class: 'wind__progress' }, [progressText, progressBar]);
  const lineage = h('p', { class: 'wind__lineage', attrs: { hidden: true } });
  const intro = h('p', { class: 'tab__intro' });
  const cost = h('p', { class: 'wind__cost tabular', text: tp('wind.cost', DISPERSE_COST) });
  const heading = h('h4', { class: 'wind__heading', text: t('wind.destinations') });
  const list = h('ul', { class: 'wind__list' });
  // Antes del anillo 2, una línea dice cuándo se abre, en vez de dos filas bloqueadas (fase 10).
  const ring2 = h('p', { class: 'wind__ring2', text: t('wind.ring2'), attrs: { hidden: true } });
  const end = h('p', { class: 'wind__end', attrs: { hidden: true } });

  /**
   * Una fila: el suelo y el nombre, una línea de estilo, sus reglas y el botón de partir. En el ciclo
   * libre, además, el récord del bioma, y las reglas plegadas en un <details>: ya se conocen del
   * viaje, y así las cinco filas caben en el móvil.
   */
  function targetRow(biome: BiomeId, kind: WindTargetKind): TargetRow {
    const style = targetStyle(biome, kind);
    const rules = kind === 'return' ? [returnGoalText()] : biomeRules(biome);
    const why = h('p', { class: 'wind__why', id: `wind-${kind}-${biome}-why`, attrs: { hidden: true } });
    const button = h('button', { class: 'button button--primary wind__go', attrs: { type: 'button' } }, [
      uiIcon('wind'),
      h('span', { text: targetLabel(biome, kind) }),
    ]);
    disposer.listen(button, 'click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      confirm(biome, kind);
    });
    const ruleList = h(
      'ul',
      { class: 'wind__rules' },
      rules.map((rule) => h('li', { text: rule })),
    );
    const record = kind === 'cycle' ? h('p', { class: 'wind__record tabular' }) : null;
    const parts: Node[] = [
      h('div', { class: 'wind__place' }, [
        soilSwatch(biome),
        h('span', {
          class: 'wind__name',
          text: t('caption.place', { name: biomeName(biome), soil: biomeSoil(biome) }),
        }),
      ]),
    ];
    if (style !== null) parts.push(h('p', { class: 'wind__style', text: style }));
    if (record === null) parts.push(ruleList);
    else {
      parts.push(record);
      if (rules.length > 0) {
        parts.push(
          h('details', { class: 'wind__details' }, [
            h('summary', { text: t('wind.rules.summary', { name: biomeName(biome) }) }),
            ruleList,
          ]),
        );
      }
    }
    const root = h('li', { class: 'wind__dest' }, [...parts, button, why]);
    list.append(root);
    return { biome, kind, root, button, why, record };
  }

  const rows: TargetRow[] = [
    ...DESTINATION_IDS.map((biome) => targetRow(biome, 'journey')),
    targetRow(HOME_BIOME, 'return'),
    ...BIOME_IDS.map((biome) => targetRow(biome, 'cycle')),
  ];

  const root = h('section', { class: 'wind', attrs: { hidden: true, 'aria-labelledby': 'wind-title' } }, [
    title,
    hint.root,
    here,
    progress,
    lineage,
    intro,
    cost,
    heading,
    list,
    ring2,
    end,
  ]);

  function confirm(to: BiomeId, kind: WindTargetKind): void {
    const text = departureText(store.state, to, kind);
    let dispersed = false;
    openModal({
      title: text.title,
      variant: 'modal--wind',
      biome: to,
      body: [
        h('p', {
          class: 'modal__lead',
          text: t('wind.confirm.destination', { name: biomeName(to), soil: biomeSoil(to) }),
        }),
        // El natal no tiene reglas propias: sin lista vacía.
        ...(text.rules.length > 0
          ? [
              h(
                'ul',
                { class: 'modal__rules' },
                text.rules.map((rule) => h('li', { text: rule })),
              ),
            ]
          : []),
        ...text.lines,
      ],
      actions: [
        // El foco empieza en quedarse: dispersar no se deshace.
        { label: t('wind.confirm.no'), kind: 'quiet', autofocus: true },
        {
          label: text.yes,
          kind: 'primary',
          onSelect: () => {
            store.dispatch(disperse, { to, now: Date.now() });
            dispersed = true;
            return undefined;
          },
        },
      ],
      onClose: () => {
        if (!dispersed) return;
        // El <dialog> devuelve el foco al botón del destino, que el siguiente refresco oculta (ya
        // está visitado): sin esto el foco caería en <body> y el siguiente Espacio absorbería. Al
        // sembrar la fila sigue, pero el foco va al mismo sitio: arriba, al bosque nuevo.
        requestAnimationFrame(() => {
          title.focus();
        });
      },
    });
  }

  return {
    root,
    update() {
      const state = store.state;
      const open = isActOneClosed(state);
      setHidden(root, !open);
      hint.update(open);
      if (!open) return;
      setText(here, t(`biome.${state.forest.biome}.here` as MessageKey));
      const goal = forestGoal(state);
      setText(progressText, forestProgressText(goal));
      const fill = forestGoalFill(goal);
      setHidden(progressBar, fill === null);
      if (fill !== null) setProgress(progressFill, fill);
      const count = colonizedCount(state);
      setHidden(lineage, count === 0);
      if (count > 0) {
        setText(
          lineage,
          tp('wind.lineage', count, { factor: formatFactor(lineageFactor(state), getLocale()) }),
        );
      }

      // Las filas son las de `windTargets`: los destinos que quedan (también antes de colonizar el
      // bosque actual, con su motivo), El regreso con el cuarto colonizado y, cumplido, los cinco
      // biomas del ciclo libre.
      const targets = windTargets(state);
      const sowing = targets.some((target) => target.kind === 'cycle');
      const none = targets.length === 0;
      for (const el of [intro, cost, heading, list]) setHidden(el, none);
      setText(
        intro,
        sowing ? t('wind.cycle.intro', { goal: formatCount(CYCLE_GOAL_LEVEL) }) : t('wind.intro'),
      );
      // Desde el primer bosque colonizado y hasta abrirse. Sin destinos y con el anillo cerrado,
      // el bosque actual no es el último: falta colonizarlo, y esta línea lo dice.
      const ringAhead = count > 0 && closedRingAhead(state);
      setHidden(ring2, !ringAhead);
      // Al pie: en el cuarto bioma sin colonizar, que es el último; durante El regreso, su meta; en
      // un ciclo sin cumplir, que se puede sembrar igual, sin récord.
      let endText: string | null = null;
      if (goal.kind === 'return') endText = returnGoalText();
      else if (goal.kind === 'cycle') endText = t('wind.cycle.leave');
      else if (none && !ringAhead && goal.kind === 'colonize') endText = t('wind.last');
      setHidden(end, endText === null);
      if (endText !== null) setText(end, endText);

      const block = disperseBlock(state);
      const missing = departureCost(state) - disperseFunds(state);
      for (const row of rows) {
        const offered = targets.some((target) => target.biome === row.biome && target.kind === row.kind);
        setHidden(row.root, !offered);
        if (row.record && offered) {
          const best = bestRecord(state, row.biome);
          setText(
            row.record,
            best
              ? tp('wind.cycle.best', best.runs, { time: formatDuration(best.time / 1000, getLocale()) })
              : t('wind.cycle.noRecord'),
          );
        }
        let reason: string | null = null;
        if (block === 'colonize') reason = t('wind.needColonize', { goal: formatCount(COLONIZE_LEVEL) });
        else if (block === 'spores') reason = tp('wind.needSpores', missing);
        setAttr(row.button, 'aria-disabled', reason === null ? 'false' : 'true');
        toggleClass(row.button, 'is-unaffordable', reason !== null);
        // Un motivo oculto citado por id se lee igual: sin motivo, no se cita (tab-mutations.ts).
        setAttr(row.button, 'aria-describedby', reason === null ? null : row.why.id);
        setHidden(row.why, reason === null);
        if (reason !== null) setText(row.why, reason);
      }
    },
    destroy: () => {
      disposer.dispose();
      hint.destroy();
    },
  };
}

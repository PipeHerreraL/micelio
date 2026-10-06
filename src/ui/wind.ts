/**
 * Sección «Viento de esporas» de la pestaña Esporular (docs/ROADMAP.md, fases 8 y 10): dónde vive
 * el linaje, cuánto falta para colonizar, los destinos que quedan (tras el cuarto, El regreso y,
 * cumplido, sembrar cualquier bioma en el ciclo libre, con sus votos) y su confirmación. Aparece con
 * el Acto I. Las filas se crean una vez y se ocultan cuando el viento no las ofrece (`windTargets`);
 * el foco nunca se queda en un botón que desaparece (BUG-JOURNAL #5, #8 y #15).
 */
import {
  canSporulate,
  departureCost,
  disperse,
  disperseBlock,
  disperseFunds,
  renounceVow,
  sporeGain,
} from '../core/actions.ts';
import {
  closedRingAhead,
  colonizedCount,
  forestGoal,
  isActOneClosed,
  lineageFactor,
  offeredVows,
  recordFor,
  vowGoalFactor,
  windTargets,
  type ForestGoal,
  type WindTargetKind,
} from '../core/forest.ts';
import { sporeFactor } from '../core/formulas.ts';
import { derived } from '../core/selectors.ts';
import type { CycleRecord, GameState } from '../core/state.ts';
import {
  BIOME_IDS,
  COLONIZE_LEVEL,
  DESTINATION_IDS,
  DISPERSE_COST,
  HOME_BIOME,
  isDestinationId,
  type BiomeId,
} from '../data/biomes.ts';
import { CYCLE_GOAL_LEVEL, VOW_IDS, type VowId } from '../data/cycle.ts';
import { SPORE_SOFTCAP_EXPONENT } from '../data/prestige.ts';
import { formatDuration, formatFactor, formatPercent } from '../i18n/format.ts';
import { formatBonus, formatCount, getLocale, t, tp, type MessageKey } from '../i18n/index.ts';
import { biomeName, biomeRules, biomeSoil } from './biome-text.ts';
import { Disposer, h, revealFocus, setAttr, setHidden, setProgress, setText, toggleClass } from './dom.ts';
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
  /** El récord del bioma con los votos marcados para el próximo ciclo, en las filas del ciclo libre. */
  record: HTMLElement | null;
  /** Por qué no se siembra con los votos elegidos (el Chocó con «sin lluvia»); null si los ofrece todos. */
  vowWhy: HTMLElement | null;
}

/** Un voto en minúscula, dentro de la frase («sin lluvia»). */
export function vowInline(vow: VowId): string {
  return t(`vow.${vow}.inline` as MessageKey);
}

/** Varios votos en una frase: «sin lluvia y sin mutaciones». */
export function vowList(vows: readonly VowId[]): string {
  return new Intl.ListFormat(getLocale(), { style: 'long', type: 'conjunction' }).format(vows.map(vowInline));
}

/** La parte de los nutrientes que pide esporular con unos votos: «14 %», sin decimales salvo por debajo del 1 %. */
function goalPercent(factor: number): string {
  return formatPercent(factor, getLocale(), factor < 0.01 ? 1 : 0);
}

/**
 * La línea del récord de una fila de sembrar: el de la combinación marcada para el próximo ciclo,
 * que es el que ese ciclo puede batir (los récords se comparan dentro de cada combinación, D12). El
 * mejor del bioma con cualquier combinación engañaba: con votos la meta baja, y su tiempo pasaba por
 * el del bioma sin votos. Con votos marcados la línea lo dice; sin votos, como siempre.
 */
function recordText(record: CycleRecord | null, vows: readonly VowId[]): string {
  if (record === null) return vows.length > 0 ? t('wind.cycle.noRecordVows') : t('wind.cycle.noRecord');
  const time = formatDuration(record.time / 1000, getLocale());
  return tp(vows.length > 0 ? 'wind.cycle.bestVows' : 'wind.cycle.best', record.runs, { time });
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
 * Al sembrar con votos, las reglas los dicen con la meta que dejan («pide el 14 % de los nutrientes»).
 */
export function departureText(
  state: GameState,
  to: BiomeId,
  kind: WindTargetKind,
  vows: readonly VowId[] = [],
): DepartureText {
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
    // Con «sin mutaciones» viajan, pero dormidas: «viajan contigo» a secas sería falso.
    vows.includes('noMutations') ? t('wind.confirm.keepAsleep') : t('wind.confirm.keep'),
  );
  // Solo en el viaje: de camino a casa y en el ciclo libre, no poder volver sería falso.
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
    case 'cycle': {
      const rules = biomeRules(to);
      if (vows.length > 0) {
        rules.push(
          t('wind.confirm.vows', { list: vowList(vows) }),
          t('wind.confirm.goal', { percent: goalPercent(vowGoalFactor(to, vows)) }),
        );
      }
      return { title: t('wind.sow.title'), rules, lines, yes: t('wind.sow.yes') };
    }
  }
}

/**
 * `repaint` repinta lo que contiene la sección (la pestaña Esporular, cuyo resumen de arriba también
 * cambia al sembrar o al romper un voto); sin él, solo la sección.
 */
export function createWindSection(store: Store, repaint?: () => void): WindSection {
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
  // Enfocable desde el código: romper el último voto deja el foco en el estado del ciclo.
  const progress = h('p', { class: 'wind__progress', id: 'wind-status', attrs: { tabindex: -1 } }, [
    progressText,
    progressBar,
  ]);
  // Votos del ciclo actual (fase 10): cuáles rigen y un botón para romper cada uno.
  const vowsNow = h('p', { class: 'wind__vowsnow', attrs: { hidden: true } });
  const breakButtons = new Map<VowId, HTMLButtonElement>();
  const breakList = h(
    'div',
    { class: 'wind__breaks', attrs: { hidden: true } },
    VOW_IDS.map((vow) => {
      const button = h('button', {
        class: 'button button--quiet wind__break',
        text: t('wind.renounce.button', { name: vowInline(vow) }),
        attrs: { type: 'button', hidden: true },
      });
      disposer.listen(button, 'click', () => {
        renounce(vow);
      });
      breakButtons.set(vow, button);
      return button;
    }),
  );
  // Votos para el próximo ciclo: la elección vive en la interfaz hasta sembrar y no se guarda.
  const chosen = new Set<VowId>();
  const vowToggles = new Map<VowId, HTMLButtonElement>();
  const vowGroup = h(
    'div',
    { class: 'wind__vows', attrs: { role: 'group', 'aria-labelledby': 'wind-vows-title', hidden: true } },
    [
      h('h4', { class: 'wind__heading', id: 'wind-vows-title', text: t('wind.vows.title') }),
      h('p', { class: 'wind__vowshint', text: t('wind.vows.hint') }),
      h(
        'ul',
        { class: 'wind__vowlist' },
        VOW_IDS.map((vow) => {
          const desc = `wind-vow-${vow}-desc`;
          const toggle = h('button', {
            class: 'toggle wind__toggle',
            text: t(`vow.${vow}.name` as MessageKey),
            attrs: { type: 'button', 'aria-pressed': 'false', 'aria-describedby': desc },
          });
          disposer.listen(toggle, 'click', () => {
            if (chosen.has(vow)) chosen.delete(vow);
            else chosen.add(vow);
            refresh();
          });
          vowToggles.set(vow, toggle);
          return h('li', { class: 'wind__vow' }, [
            toggle,
            h('p', { class: 'wind__vowdesc', id: desc, text: t(`vow.${vow}.desc` as MessageKey) }),
          ]);
        }),
      ),
    ],
  );
  /** Los votos elegidos, en el orden de VOW_IDS: como los guarda sembrar. */
  const chosenVows = (): VowId[] => VOW_IDS.filter((vow) => chosen.has(vow));
  const lineage = h('p', { class: 'wind__lineage', attrs: { hidden: true } });
  const intro = h('p', { class: 'tab__intro' });
  const cost = h('p', { class: 'wind__cost tabular', text: tp('wind.cost', DISPERSE_COST) });
  const heading = h('h4', { class: 'wind__heading', text: t('wind.destinations') });
  const list = h('ul', { class: 'wind__list' });
  // Por qué no se puede partir: el mismo motivo para todas las filas (colonizar el bosque actual o
  // juntar las esporas), así que se dice una vez, sobre la lista, y cada botón lo cita.
  const why = h('p', { class: 'wind__why', id: 'wind-why', attrs: { hidden: true } });
  // Antes del anillo 2, una línea dice cuándo se abre, en vez de dos filas bloqueadas (fase 10).
  const ring2 = h('p', { class: 'wind__ring2', text: t('wind.ring2'), attrs: { hidden: true } });
  const end = h('p', { class: 'wind__end', attrs: { hidden: true } });

  /**
   * Una fila compacta (fase 10; 110–150 px a 375 px, para que en el móvil quepan dos a la vista):
   * el suelo y el nombre, una línea (el estilo en el viaje, el récord en el ciclo libre) y el botón
   * de partir a todo el ancho. Las reglas van plegadas en un <details> cuyo <summary> es la cabecera
   * entera de la fila: con un <summary> aparte, de 44 px de toque, la fila pasaba de 160 px. En el
   * ciclo libre el estilo también se pliega: ya se conoce del viaje. El regreso dice su meta a la
   * vista, y el natal del ciclo no tiene reglas: sin <details>.
   */
  function targetRow(biome: BiomeId, kind: WindTargetKind): TargetRow {
    const style = targetStyle(biome, kind);
    const button = h('button', { class: 'button button--primary wind__go', attrs: { type: 'button' } }, [
      uiIcon('wind'),
      h('span', { text: targetLabel(biome, kind) }),
    ]);
    disposer.listen(button, 'click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      confirm(biome, kind);
    });
    const place = h('span', { class: 'wind__place' }, [
      soilSwatch(biome, 'soil-swatch--row'),
      h('span', {
        class: 'wind__name',
        text: t('caption.place', { name: biomeName(biome), soil: biomeSoil(biome) }),
      }),
    ]);
    const record = kind === 'cycle' ? h('span', { class: 'wind__record tabular' }) : null;
    const styleLine = (tag: 'span' | 'p'): HTMLElement | null =>
      style === null ? null : h(tag, { class: 'wind__style', text: style });
    const line = record ?? styleLine('span');
    // Los espacios entre las piezas no se ven (son celdas de una rejilla), pero separan las frases
    // en el nombre accesible del <summary>.
    const head: (Node | string)[] = line ? [place, ' ', line] : [place];
    const rules = kind === 'return' ? [] : biomeRules(biome);
    const folded: Node[] = [];
    if (record) {
      const known = styleLine('p');
      if (known) folded.push(known);
    }
    if (rules.length > 0) {
      folded.push(
        h(
          'ul',
          { class: 'wind__rules' },
          rules.map((rule) => h('li', { text: rule })),
        ),
      );
    }
    const top =
      folded.length > 0
        ? h('details', { class: 'wind__details' }, [
            // «Reglas» va al final: el nombre accesible empieza por el bioma, distinto en cada fila.
            h('summary', { class: 'wind__head wind__summary' }, [
              ...head,
              ' ',
              h('span', { class: 'wind__more', text: t('wind.rules.more') }),
            ]),
            ...folded,
          ])
        : h('div', { class: 'wind__head' }, head);
    const parts: Node[] = [top];
    if (kind === 'return') parts.push(h('p', { class: 'wind__goal', text: returnGoalText() }));
    // Solo el Chocó deja un voto fuera (el bioma más lluvioso no ofrece «sin lluvia»), y su texto lo
    // nombra: con los votos elegidos que no ofrece, su fila dice por qué no se siembra.
    const vowWhy =
      kind === 'cycle' && !offeredVows(biome).includes('noRain')
        ? h('p', {
            class: 'wind__why wind__vowwhy',
            id: `wind-vowwhy-${biome}`,
            text: t('wind.vows.choco'),
            attrs: { hidden: true },
          })
        : null;
    if (vowWhy) parts.push(vowWhy);
    const root = h('li', { class: 'wind__dest' }, [...parts, button]);
    list.append(root);
    return { biome, kind, root, button, record, vowWhy };
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
    vowsNow,
    breakList,
    lineage,
    intro,
    cost,
    vowGroup,
    why,
    heading,
    list,
    ring2,
    end,
  ]);

  function confirm(to: BiomeId, kind: WindTargetKind): void {
    const vows = kind === 'cycle' ? chosenVows() : [];
    const text = departureText(store.state, to, kind, vows);
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
            // Jurados, ya no son una elección: el próximo ciclo empieza otra vez sin votos marcados.
            // Despachar no repinta nada; la pestaña se repinta al cerrarse el diálogo.
            if (kind === 'cycle') chosen.clear();
            store.dispatch(disperse, { to, now: Date.now(), vows });
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
        settleThenFocus(() => title);
      },
    });
  }

  /**
   * Romper un voto: no se puede volver a jurar, así que el foco empieza en mantenerlo y «Romper» es
   * la acción peligrosa. Al romperlo su botón desaparece: el foco pasa al de romper el siguiente voto
   * vigente o, sin ninguno, al estado del ciclo (BUG-JOURNAL #5, #8 y #15).
   */
  function renounce(vow: VowId): void {
    const state = store.state;
    const remaining = state.cycle.vows.filter((v) => v !== vow);
    const body = [
      t('wind.renounce.body', { percent: goalPercent(vowGoalFactor(state.forest.biome, remaining)) }),
    ];
    if (vow === 'noMutations') body.push(t('wind.renounce.wakeAll'));
    let broken = false;
    openModal({
      title: t('wind.renounce.title', { name: vowInline(vow) }),
      body,
      actions: [
        { label: t('wind.renounce.no'), kind: 'quiet', autofocus: true },
        {
          label: t('wind.renounce.yes'),
          kind: 'danger',
          onSelect: () => {
            store.dispatch(renounceVow, { vow });
            broken = true;
            return undefined;
          },
        },
      ],
      onClose: () => {
        if (!broken) return;
        const after = VOW_IDS.indexOf(vow);
        const next =
          remaining.find((v) => VOW_IDS.indexOf(v) > after) ??
          (remaining.length > 0 ? remaining[0] : undefined);
        settleThenFocus(() => {
          const target = next === undefined ? undefined : breakButtons.get(next);
          return target && !target.hidden ? target : progress;
        });
      },
    });
  }

  /** La elección de votos no pasa por el estado: se pinta en el acto. */
  function refresh(): void {
    section.update();
  }

  /**
   * Tras sembrar o romper un voto, el foco va a `target` sobre la pestaña ya repintada. La interfaz
   * se refresca cada 100 ms (main.ts) y el foco llegaba antes: al ocultarse el botón roto o salir la
   * línea de los votos, el anclaje del desplazamiento de WebKit movía la página hasta 76 px (o más
   * al sembrar) y el foco quedaba bajo la franja fija o fuera de la vista (BUG-JOURNAL #30). En el
   * cuadro siguiente, para llegar después de que el <dialog> devuelva el suyo.
   */
  function settleThenFocus(target: () => HTMLElement): void {
    (repaint ?? refresh)();
    requestAnimationFrame(() => {
      revealFocus(target());
    });
  }
  /** Votos con que se escribió la línea de los vigentes: ListFormat en cada refresco sería basura. */
  let vowsShown = '';

  const section: WindSection = {
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
      let reason: string | null = null;
      if (block === 'colonize') reason = t('wind.needColonize', { goal: formatCount(COLONIZE_LEVEL) });
      else if (block === 'spores') reason = tp('wind.needSpores', missing);
      setHidden(why, none || reason === null);
      if (reason !== null) setText(why, reason);

      // Votos (fase 10): los vigentes con su botón de romper y, para sembrar, los del próximo ciclo.
      const vows = state.cycle.vows;
      setHidden(vowsNow, vows.length === 0);
      setHidden(breakList, vows.length === 0);
      const vowsKey = vows.join('|');
      if (vows.length > 0 && vowsKey !== vowsShown) {
        vowsShown = vowsKey;
        setText(vowsNow, t('wind.vows.current', { list: vowList(vows) }));
      }
      for (const [vow, button] of breakButtons) setHidden(button, !vows.includes(vow));
      setHidden(vowGroup, !sowing);
      for (const [vow, toggle] of vowToggles)
        setAttr(toggle, 'aria-pressed', chosen.has(vow) ? 'true' : 'false');
      const picked = chosenVows();

      for (const row of rows) {
        const offered = targets.some((target) => target.biome === row.biome && target.kind === row.kind);
        setHidden(row.root, !offered);
        if (row.record && offered) {
          setText(row.record, recordText(recordFor(state.records, row.biome, picked), picked));
        }
        const vowBlocked = row.vowWhy !== null && picked.some((vow) => !offeredVows(row.biome).includes(vow));
        if (row.vowWhy) setHidden(row.vowWhy, !vowBlocked);
        const blocked = reason !== null || vowBlocked;
        setAttr(row.button, 'aria-disabled', blocked ? 'true' : 'false');
        toggleClass(row.button, 'is-unaffordable', blocked);
        // Un motivo oculto citado por id se lee igual: sin motivo, no se cita (tab-mutations.ts).
        const cited = [reason === null ? null : why.id, vowBlocked ? (row.vowWhy?.id ?? null) : null].filter(
          (id): id is string => id !== null,
        );
        setAttr(row.button, 'aria-describedby', cited.length > 0 ? cited.join(' ') : null);
      }
    },
    destroy: () => {
      disposer.dispose();
      hint.destroy();
    },
  };
  return section;
}

/**
 * Sección «Viento de esporas» de la pestaña Esporular (docs/ROADMAP.md, fases 8 y 10): dónde vive
 * el linaje, cuánto falta para colonizar, los destinos que quedan y su confirmación. Aparece con
 * el Acto I. Las filas de destino se crean una vez y se ocultan al visitarlas o mientras su anillo
 * no se abre; el foco nunca se queda en un botón que desaparece (BUG-JOURNAL #5 y #8).
 */
import { canSporulate, disperse, disperseBlock, disperseFunds, sporeGain } from '../core/actions.ts';
import {
  closedRingAhead,
  colonizedCount,
  destinations,
  forestGoal,
  isActOneClosed,
  lineageFactor,
  type ForestGoal,
} from '../core/forest.ts';
import { sporeFactor } from '../core/formulas.ts';
import { derived } from '../core/selectors.ts';
import { COLONIZE_LEVEL, DESTINATION_IDS, DISPERSE_COST, type DestinationId } from '../data/biomes.ts';
import { SPORE_SOFTCAP_EXPONENT } from '../data/prestige.ts';
import { formatFactor } from '../i18n/format.ts';
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

/** Texto del progreso del bosque actual (`forestGoal`): Acto I, colonización o colonizado. */
export function forestProgressText(goal: ForestGoal): string {
  const level = formatCount(goal.level);
  switch (goal.kind) {
    case 'actOne':
      return t('biome.actOne', { level });
    case 'colonize':
      return t('biome.progress', { level, goal: formatCount(goal.goal) });
    case 'colonized':
      return t('biome.colonized', { level });
  }
}

/** Lo que llena la barra de progreso: solo las metas con un nivel que alcanzar llevan barra. */
export function forestGoalFill(goal: ForestGoal): number | null {
  return 'goal' in goal ? goal.level / goal.goal : null;
}

interface DestinationRow {
  biome: DestinationId;
  root: HTMLElement;
  button: HTMLButtonElement;
  why: HTMLElement;
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
  const intro = h('p', { class: 'tab__intro', text: t('wind.intro') });
  const cost = h('p', { class: 'wind__cost tabular', text: tp('wind.cost', DISPERSE_COST) });
  const heading = h('h4', { class: 'wind__heading', text: t('wind.destinations') });
  const list = h('ul', { class: 'wind__list' });
  // Antes del anillo 2, una línea dice cuándo se abre, en vez de dos filas bloqueadas (fase 10).
  const ring2 = h('p', { class: 'wind__ring2', text: t('wind.ring2'), attrs: { hidden: true } });
  const end = h('p', { class: 'wind__end', attrs: { hidden: true } });

  const rows: DestinationRow[] = DESTINATION_IDS.map((biome) => {
    const label = t(`biome.${biome}.go` as MessageKey);
    const whyId = `wind-${biome}-why`;
    const why = h('p', { class: 'wind__why', id: whyId, attrs: { hidden: true } });
    const button = h('button', { class: 'button button--primary wind__go', attrs: { type: 'button' } }, [
      uiIcon('wind'),
      h('span', { text: label }),
    ]);
    disposer.listen(button, 'click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      confirm(biome);
    });
    const root = h('li', { class: 'wind__dest' }, [
      h('div', { class: 'wind__place' }, [
        soilSwatch(biome),
        h('span', {
          class: 'wind__name',
          text: t('caption.place', { name: biomeName(biome), soil: biomeSoil(biome) }),
        }),
      ]),
      h('p', { class: 'wind__style', text: t(`biome.${biome}.style` as MessageKey) }),
      h(
        'ul',
        { class: 'wind__rules' },
        biomeRules(biome).map((rule) => h('li', { text: rule })),
      ),
      button,
      why,
    ]);
    list.append(root);
    return { biome, root, button, why };
  });

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

  /** Bono del nivel de esporas (factor − 1), con el umbral de madurez del bosque actual. */
  function bonusPercent(level: number): string {
    const threshold = derived(store.state).sporeThreshold;
    return formatBonus(sporeFactor(level, threshold, SPORE_SOFTCAP_EXPONENT) - 1);
  }

  function confirm(to: DestinationId): void {
    const state = store.state;
    const gained = canSporulate(state) ? sporeGain(state) : 0;
    const left = disperseFunds(state) - DISPERSE_COST;
    let dispersed = false;
    openModal({
      title: t('wind.confirm.title'),
      variant: 'modal--wind',
      biome: to,
      body: [
        h('p', {
          class: 'modal__lead',
          text: t('wind.confirm.destination', { name: biomeName(to), soil: biomeSoil(to) }),
        }),
        h(
          'ul',
          { class: 'modal__rules' },
          biomeRules(to).map((rule) => h('li', { text: rule })),
        ),
        gained > 0 ? tp('wind.confirm.gain', gained) : t('wind.confirm.noGain'),
        tp('wind.confirm.cost', left, { cost: formatCount(DISPERSE_COST) }),
        t('wind.confirm.bonus', { current: bonusPercent(state.spores.level + gained) }),
        t('wind.confirm.lose'),
        t('wind.confirm.keep'),
        t('wind.confirm.oneWay'),
      ],
      actions: [
        // El foco empieza en quedarse: dispersar no se deshace.
        { label: t('wind.confirm.no'), kind: 'quiet', autofocus: true },
        {
          label: t('wind.confirm.yes'),
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
        // está visitado): sin esto el foco caería en <body> y el siguiente Espacio absorbería.
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

      const remaining = destinations(state);
      const none = remaining.length === 0;
      for (const el of [intro, cost, heading, list]) setHidden(el, none);
      // Desde el primer bosque colonizado y hasta abrirse. Sin destinos y con el anillo cerrado,
      // el bosque actual no es el último: falta colonizarlo, y esta línea lo dice.
      const ringAhead = count > 0 && closedRingAhead(state);
      setHidden(ring2, !ringAhead);
      // Sin destinos ni anillo por abrir: o queda colonizar el último bioma, o ya no hay adónde ir.
      const last = none && !ringAhead;
      setHidden(end, !last);
      if (last) setText(end, goal.kind === 'colonized' ? t('wind.none') : t('wind.last'));

      const block = disperseBlock(state);
      const missing = DISPERSE_COST - disperseFunds(state);
      for (const row of rows) {
        setHidden(row.root, !remaining.includes(row.biome));
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

/**
 * Contador de nutrientes, N/s, núcleo para absorber y efectos activos.
 */
import { click, nutrientsToNextSpore, sporeGain } from '../core/actions.ts';
import { derived } from '../core/selectors.ts';
import { hasSeen, type ActiveEffect, type TimedEffectKind } from '../core/state.ts';
import { fmt, numberTooltip, t, tp } from '../i18n/index.ts';
import { formatDuration } from '../i18n/format.ts';
import { getLocale } from '../i18n/index.ts';
import { Disposer, h, setAttr, setHidden, setProgress, setText, svg } from './dom.ts';
import { uiIcon } from './icons.ts';
import type { Store } from './store.ts';
import { attachTooltip } from './tooltip.ts';

export interface Hud {
  counter: HTMLElement;
  core: HTMLElement;
  effects: HTMLElement;
  /** Botón del núcleo, para que main.ts lo use como origen de números flotantes. */
  coreButton: HTMLButtonElement;
  /** Núcleo de bolsillo: el mismo botón, fijo abajo, cuando el núcleo se pierde de vista. */
  dock: HTMLButtonElement;
  /** Muestra u oculta el núcleo de bolsillo; si tenía el foco al ocultarse, lo pasa al núcleo. */
  setDockShown(shown: boolean): void;
  /** De dónde salen los números del clic: el núcleo de bolsillo si se ve; si no, el núcleo. */
  absorbOrigin(): HTMLButtonElement;
  update(): void;
  destroy(): void;
}

/** Dibujo del núcleo: un nudo de hifas que irradia desde el centro. */
function coreArt(): SVGSVGElement {
  const strands: SVGElement[] = [];
  const count = 9;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const r1 = 9;
    const r2 = 30 + (i % 3) * 4;
    const bend = a + 0.35 * (i % 2 === 0 ? 1 : -1);
    const x1 = 40 + Math.cos(a) * r1;
    const y1 = 40 + Math.sin(a) * r1;
    const cx = 40 + Math.cos(bend) * (r2 * 0.6);
    const cy = 40 + Math.sin(bend) * (r2 * 0.6);
    const x2 = 40 + Math.cos(a) * r2;
    const y2 = 40 + Math.sin(a) * r2;
    strands.push(
      svg('path', {
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
        class: 'core__strand',
      }),
    );
  }
  return svg('svg', { class: 'core__art', viewBox: '0 0 80 80', 'aria-hidden': 'true', focusable: 'false' }, [
    svg('circle', { cx: 40, cy: 40, r: 36, class: 'core__halo' }),
    ...strands,
    svg('circle', { cx: 40, cy: 40, r: 10, class: 'core__heart' }),
  ]);
}

const EFFECT_NAME = {
  downpour: 'effect.downpour.name',
  storm: 'effect.storm.name',
} as const;
const EFFECT_DESC = {
  downpour: 'effect.downpour.desc',
  storm: 'effect.storm.desc',
} as const;

interface EffectRow {
  root: HTMLElement;
  time: HTMLElement;
  bar: HTMLElement;
}

/**
 * Un número es parada de tabulación solo si tiene tooltip (desde 1e6): por debajo sería una
 * parada que no hace nada (PROMPT.md §16). Con el foco encima no se le quita, aunque la cifra
 * baje (la autocompra gasta): sin tabindex, el foco caería a <body>.
 */
export function focusableWhileTooltip(el: HTMLElement, hasTooltip: boolean): void {
  setAttr(el, 'tabindex', hasTooltip || document.activeElement === el ? '0' : null);
}

export function createHud(store: Store, onAbsorb: (button: HTMLButtonElement) => void): Hud {
  const disposer = new Disposer();

  // Contador
  const value = h('span', { class: 'counter__value tabular' });
  const rate = h('span', { class: 'counter__rate tabular' });
  // Desde que aparece Esporular, el HUD dice siempre cuántas esporas darías ahora y cuántos
  // nutrientes faltan para la siguiente (PROMPT.md §10).
  const sporeNow = h('span', { class: 'counter__spores tabular' });
  const sporeNext = h('span', { class: 'counter__spores-next tabular' });
  const spores = h('p', { class: 'counter__line counter__line--spores', attrs: { hidden: true } }, [
    sporeNow,
    sporeNext,
  ]);
  const counter = h('section', { class: 'counter', attrs: { 'aria-label': t('hud.nutrients.label') } }, [
    h('p', { class: 'counter__line' }, [value]),
    h('p', { class: 'counter__line counter__line--rate' }, [rate]),
    spores,
  ]);
  // El tooltip del número grande también llega con el teclado: update() los hace enfocables
  // cuando hay tooltip que mostrar.
  attachTooltip(value, () => numberTooltip(store.state.nutrients), disposer);
  attachTooltip(rate, () => numberTooltip(derived(store.state).production), disposer);

  // Núcleo
  const coreButton = h('button', { class: 'core__button', attrs: { type: 'button' } }, [coreArt()]);
  const hint = h('p', { class: 'core__hint', text: t('core.hint') });
  const keyHint = h('p', { class: 'core__keyhint', text: t('core.keyHint') });
  const core = h('section', { class: 'core' }, [coreButton, hint, keyHint]);
  disposer.listen(coreButton, 'click', () => {
    store.dispatch(click, {});
    onAbsorb(coreButton);
  });
  // En el móvil el núcleo se va con el escenario al bajar a las pestañas: este botón lo sustituye
  // abajo, al alcance del pulgar, mientras no se vea (app.ts decide cuándo).
  const dock = h('button', { class: 'core-dock', attrs: { type: 'button', hidden: true } }, [coreArt()]);
  disposer.listen(dock, 'click', () => {
    store.dispatch(click, {});
    onAbsorb(dock);
  });

  function setDockShown(shown: boolean): void {
    if (dock.hidden !== shown) return;
    // Oculto con el foco encima, el foco caería en <body> (BUG-JOURNAL #5).
    if (!shown && document.activeElement === dock) coreButton.focus({ preventScroll: true });
    dock.hidden = !shown;
  }

  // Efectos activos
  const effectList = h('ul', { class: 'effects__list' });
  const effects = h(
    'section',
    { class: 'effects', attrs: { 'aria-label': t('effects.title'), hidden: true } },
    [h('h2', { class: 'visually-hidden', text: t('effects.title') }), effectList],
  );
  const rows = new Map<TimedEffectKind, EffectRow>();

  function effectRow(effect: ActiveEffect): EffectRow {
    const time = h('span', { class: 'effect__time tabular' });
    const bar = h('span', { class: 'effect__bar-fill' });
    const root = h('li', { class: `effect effect--${effect.kind}` }, [
      uiIcon(effect.kind === 'downpour' ? 'drop' : 'click'),
      h('span', { class: 'effect__text' }, [
        h('span', { class: 'effect__name', text: t(EFFECT_NAME[effect.kind]) }),
        h('span', { class: 'effect__desc', text: t(EFFECT_DESC[effect.kind]) }),
      ]),
      time,
      h('span', { class: 'effect__bar', attrs: { 'aria-hidden': 'true' } }, [bar]),
    ]);
    return { root, time, bar };
  }

  function update(): void {
    const state = store.state;
    const d = derived(state);
    setText(value, t('hud.nutrients', { value: fmt(state.nutrients) }));
    setText(rate, t('hud.perSecond', { value: fmt(d.production) }));
    focusableWhileTooltip(value, numberTooltip(state.nutrients) !== null);
    focusableWhileTooltip(rate, numberTooltip(d.production) !== null);
    const coreLabel = t('core.label', { value: fmt(d.clickValue) });
    setAttr(coreButton, 'aria-label', coreLabel);
    setAttr(dock, 'aria-label', coreLabel);
    const showSpores = hasSeen(state, 'tab.sporulate');
    setHidden(spores, !showSpores);
    if (showSpores) {
      setText(sporeNow, tp('sporulate.gain', sporeGain(state)));
      setText(sporeNext, t('sporulate.next', { value: fmt(nutrientsToNextSpore(state)) }));
    }
    const started = state.stats.clicks > 0 || state.owned.hypha > 0 || state.stats.sporulations > 0;
    setHidden(keyHint, started);
    setHidden(hint, state.owned.hypha > 0 || state.stats.sporulations > 0);

    // La lista de efectos solo se reconstruye cuando cambia qué efectos hay.
    const kinds = new Set(state.effects.map((e) => e.kind));
    for (const [kind, row] of rows) {
      if (!kinds.has(kind)) {
        row.root.remove();
        rows.delete(kind);
      }
    }
    for (const effect of state.effects) {
      let row = rows.get(effect.kind);
      if (!row) {
        row = effectRow(effect);
        rows.set(effect.kind, row);
        effectList.append(row.root);
      }
      setText(row.time, t('effect.remaining', { time: formatDuration(effect.remaining, getLocale()) }));
      setProgress(row.bar, effect.remaining / effect.duration);
    }
    setHidden(effects, state.effects.length === 0);
  }

  return {
    counter,
    core,
    effects,
    coreButton,
    dock,
    setDockShown,
    absorbOrigin: () => (dock.hidden ? coreButton : dock),
    update,
    destroy: () => {
      disposer.dispose();
    },
  };
}

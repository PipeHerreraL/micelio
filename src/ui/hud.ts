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
  /** Solo la duración («45 s»), para el formato compacto del móvil; el lector lee `time`. */
  clock: HTMLElement;
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
    const clock = h('span', { class: 'effect__clock tabular', attrs: { 'aria-hidden': 'true' } });
    const bar = h('span', { class: 'effect__bar-fill' });
    const root = h('li', { class: `effect effect--${effect.kind}` }, [
      uiIcon(effect.kind === 'downpour' ? 'drop' : 'click'),
      h('span', { class: 'effect__text' }, [
        h('span', { class: 'effect__name', text: t(EFFECT_NAME[effect.kind]) }),
        h('span', { class: 'effect__desc', text: t(EFFECT_DESC[effect.kind]) }),
      ]),
      time,
      clock,
      h('span', { class: 'effect__bar', attrs: { 'aria-hidden': 'true' } }, [bar]),
    ]);
    return { root, time, clock, bar };
  }

  function update(): void {
    const state = store.state;
    const d = derived(state);
    setText(value, t('hud.nutrients', { value: fmt(state.nutrients) }));
    setText(rate, t('hud.perSecond', { value: fmt(d.production) }));
    focusableWhileTooltip(value, numberTooltip(state.nutrients) !== null);
    focusableWhileTooltip(rate, numberTooltip(d.production) !== null);
    setAttr(coreButton, 'aria-label', t('core.label', { value: fmt(d.clickValue) }));
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
      const left = formatDuration(effect.remaining, getLocale());
      setText(row.time, t('effect.remaining', { time: left }));
      setText(row.clock, left);
      setProgress(row.bar, effect.remaining / effect.duration);
    }
    setHidden(effects, state.effects.length === 0);
  }

  return {
    counter,
    core,
    effects,
    coreButton,
    update,
    destroy: () => {
      disposer.dispose();
    },
  };
}

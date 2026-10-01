/**
 * Pestaña Esporular (PROMPT.md §10): cuántas esporas darías ahora, cuántos nutrientes
 * faltan para la siguiente, el progreso hacia el requisito y la confirmación con lo que se
 * gana, el bono actual frente al nuevo y lo que se pierde.
 */
import { canSporulate, nutrientsToNextSpore, sporeGain, sporulate } from '../core/actions.ts';
import * as num from '../core/num.ts';
import { SPORE_SOFTCAP_EXPONENT } from '../data/prestige.ts';
import { sporulateRequirement } from '../core/forest.ts';
import { sporeFactor } from '../core/formulas.ts';
import { derived } from '../core/selectors.ts';
import { formatPercent } from '../i18n/format.ts';
import { fmt, formatCount, getLocale, t, tp } from '../i18n/index.ts';
import { Disposer, h, setAttr, setHidden, setProgress, setText, toggleClass } from './dom.ts';
import { createHint } from './hint.ts';
import { createWindSection } from './wind.ts';
import { uiIcon } from './icons.ts';
import { openModal } from './modal.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';

/** Bono de producción del nivel de esporas, con la madurez de la red (factor − 1). */
function bonusPercent(level: number, threshold: number): string {
  return formatPercent(sporeFactor(level, threshold, SPORE_SOFTCAP_EXPONENT) - 1, getLocale(), 0);
}

export function createSporulateTab(store: Store): TabView {
  const disposer = new Disposer();
  const level = h('p', { class: 'spore__level tabular' });
  const available = h('p', { class: 'spore__available tabular' });
  const maturity = h('p', { class: 'spore__maturity', attrs: { hidden: true } });
  const gain = h('p', { class: 'spore__gain tabular' });
  const next = h('p', { class: 'spore__next tabular' });
  const requirement = h('p', { class: 'spore__requirement tabular' });
  const progressFill = h('span', { class: 'bar__fill' });
  const progressLabel = h('span', { class: 'tabular' });
  const button = h('button', { class: 'button button--primary spore__button', attrs: { type: 'button' } }, [
    uiIcon('sporulate'),
    h('span', { text: t('sporulate.button') }),
  ]);
  const hint = createHint(store, 'hint.sporulate', t('hint.sporulate'));
  const wind = createWindSection(store);

  const root = h('div', { class: 'tab tab--sporulate' }, [
    h('div', { class: 'tab__toolbar' }, [h('h2', { class: 'tab__title', text: t('sporulate.title') })]),
    hint.root,
    h('p', { class: 'tab__intro', text: t('sporulate.intro') }),
    h('div', { class: 'spore__summary' }, [level, maturity, available]),
    h('div', { class: 'spore__now' }, [gain, next]),
    h('div', { class: 'spore__progress' }, [
      requirement,
      h('div', { class: 'spore__bar-row' }, [
        h('span', { class: 'bar bar--wide', attrs: { 'aria-hidden': 'true' } }, [progressFill]),
        progressLabel,
      ]),
    ]),
    button,
    wind.root,
  ]);

  function confirm(): void {
    const state = store.state;
    const gained = sporeGain(state);
    openModal({
      title: t('sporulate.confirm.title'),
      variant: 'modal--spore',
      body: [
        h('p', { class: 'modal__lead', text: tp('sporulate.confirm.gain', gained) }),
        t('sporulate.confirm.bonus', {
          current: bonusPercent(state.spores.level, derived(state).sporeThreshold),
          next: bonusPercent(state.spores.level + gained, derived(state).sporeThreshold),
        }),
        t('sporulate.confirm.lose'),
        t('sporulate.confirm.keep'),
      ],
      actions: [
        // El foco empieza en cancelar: esporular reinicia la partida y no se deshace.
        { label: t('sporulate.confirm.no'), kind: 'quiet', autofocus: true },
        {
          label: t('sporulate.confirm.yes'),
          kind: 'primary',
          onSelect: () => {
            store.dispatch(sporulate, { now: Date.now() });
            return undefined;
          },
        },
      ],
    });
  }

  disposer.listen(button, 'click', () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    confirm();
  });

  function update(): void {
    const state = store.state;
    const ready = canSporulate(state);
    setText(
      level,
      t('sporulate.level', {
        level: formatCount(state.spores.level),
        percent: bonusPercent(state.spores.level, derived(state).sporeThreshold),
      }),
    );
    // Madurez de la red: por encima del umbral, cada nivel aporta menos (lo dice con texto).
    const threshold = derived(state).sporeThreshold;
    setHidden(maturity, state.spores.level <= threshold);
    setText(maturity, t('sporulate.maturity', { threshold: formatCount(Math.round(threshold)) }));
    setText(available, tp('sporulate.available', state.spores.available));
    setText(gain, tp('sporulate.gain', sporeGain(state)));
    setText(next, t('sporulate.next', { value: fmt(nutrientsToNextSpore(state)) }));
    const required = sporulateRequirement(state);
    const fraction = num.toNumber(num.div(state.runEarned, required));
    setText(requirement, t('sporulate.requirement', { value: fmt(required) }));
    setText(
      progressLabel,
      t('sporulate.progress', { percent: formatPercent(Math.min(1, fraction), getLocale(), 0) }),
    );
    setProgress(progressFill, fraction);
    setHidden(requirement, fraction >= 1);
    setAttr(button, 'aria-disabled', ready ? 'false' : 'true');
    toggleClass(button, 'is-unaffordable', !ready);
    hint.update(true);
    wind.update();
  }

  return {
    id: 'sporulate',
    root,
    update,
    destroy: () => {
      disposer.dispose();
      hint.destroy();
      wind.destroy();
    },
  };
}

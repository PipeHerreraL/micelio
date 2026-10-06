/**
 * Pestaña Esporular (PROMPT.md §10): cuántas esporas darías ahora, cuántos nutrientes
 * faltan para la siguiente, el progreso hacia el requisito y la confirmación con lo que se
 * gana, el bono actual frente al nuevo y lo que se pierde.
 *
 * Camino corto (fase 9, con dos placas del plasmodio cartografiadas): bajo «Esporularías ahora»,
 * el ritmo de esporas de la partida, ahora y con la siguiente espora. Solo informa: no recomienda
 * cuándo esporular, porque la regla del mejor ritmo no es la mejor para colonizar
 * (ARCHITECTURE.md §4.28).
 */
import { canSporulate, completesGoal, nutrientsToNextSpore, sporeGain, sporulate } from '../core/actions.ts';
import * as num from '../core/num.ts';
import { SPORE_SOFTCAP_EXPONENT } from '../data/prestige.ts';
import { forestGoal, sporulateRequirement } from '../core/forest.ts';
import { sporeFactor } from '../core/formulas.ts';
import { derived } from '../core/selectors.ts';
import type { GameState } from '../core/state.ts';
import { formatDuration, formatPercent } from '../i18n/format.ts';
import { fmt, formatBonus, formatCount, formatCountOf, getLocale, t, tp } from '../i18n/index.ts';
import { Disposer, h, setAttr, setHidden, setProgress, setText, toggleClass } from './dom.ts';
import { partnerPerks } from '../systems/partners.ts';
import { createHint } from './hint.ts';
import { createWindSection } from './wind.ts';
import { uiIcon } from './icons.ts';
import { openModal } from './modal.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';

/** Bono de producción del nivel de esporas, con la madurez de la red (factor − 1). */
function bonusPercent(level: number, threshold: number): string {
  return formatBonus(sporeFactor(level, threshold, SPORE_SOFTCAP_EXPONENT) - 1);
}

export interface SporeRates {
  /** Esporas por minuto de partida si se esporulara ahora; null si aún no se gana ninguna. */
  now: number | null;
  /** Cuándo llega la siguiente espora al ritmo actual y el ritmo entonces; null sin producción. */
  next: { seconds: number; perMinute: number } | null;
}

/**
 * Ritmo de esporas de la partida (Camino corto), puro del estado. El nivel de esporas es la suma
 * de lo esporulado en este bosque, así que E(L) ≥ nivel y la siguiente espora suma exactamente una
 * a la ganancia. Antes del primer segundo de partida se cuenta 1 s: nunca se divide por 0.
 */
export function sporeRates(state: GameState): SporeRates {
  const gained = sporeGain(state);
  const runTime = state.stats.runTime;
  const now = gained > 0 ? (gained / Math.max(1, runTime)) * 60 : null;
  const production = num.toNumber(derived(state).production);
  if (!(production > 0)) return { now, next: null };
  const seconds = num.toNumber(nutrientsToNextSpore(state)) / production;
  if (!Number.isFinite(seconds)) return { now, next: null };
  return { now, next: { seconds, perMinute: ((gained + 1) / Math.max(1, runTime + seconds)) * 60 } };
}

const rateFormats = new Map<string, Intl.NumberFormat>();

/**
 * Esporas por minuto con dos decimales por debajo de 10 y uno por encima, en el idioma activo; desde
 * el millón, con nombre, como las cuentas (con «de» si va delante de «esporas»).
 */
export function formatRate(value: number, beforeNoun = false): string {
  if (value >= 1e6) return beforeNoun ? formatCountOf(value) : formatCount(value);
  const digits = value < 10 ? 2 : 1;
  const key = `${getLocale()}|${digits}`;
  let f = rateFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: digits });
    rateFormats.set(key, f);
  }
  return f.format(value);
}

/** El aviso de la esporulación que cumple la meta: la de El regreso o la del ciclo libre. */
function completesText(state: GameState): string {
  return forestGoal(state).kind === 'cycle' ? t('sporulate.completesGoal') : t('sporulate.completesReturn');
}

export function createSporulateTab(store: Store): TabView {
  const disposer = new Disposer();
  const level = h('p', { class: 'spore__level tabular' });
  const available = h('p', { class: 'spore__available tabular' });
  const maturity = h('p', { class: 'spore__maturity', attrs: { hidden: true } });
  const gain = h('p', { class: 'spore__gain tabular' });
  const next = h('p', { class: 'spore__next tabular' });
  const rate = h('p', { class: 'spore__rate-now tabular' });
  const rateNext = h('p', { class: 'spore__rate-next tabular' });
  const rateBox = h('div', { class: 'spore__rate', attrs: { hidden: true } }, [
    rate,
    rateNext,
    h('p', { class: 'spore__rate-source', text: t('sporulate.rate.source') }),
  ]);
  const requirement = h('p', { class: 'spore__requirement tabular' });
  const progressFill = h('span', { class: 'bar__fill' });
  const progressLabel = h('span', { class: 'tabular' });
  const button = h('button', { class: 'button button--primary spore__button', attrs: { type: 'button' } }, [
    uiIcon('sporulate'),
    h('span', { text: t('sporulate.button') }),
  ]);
  // Cuando esta esporulación cumple la meta de El regreso o de un ciclo (fase 10), el botón lo dice:
  // quien esperara a duplicar el nivel cargaría la última partida con casi todo el tramo.
  const goalNote = h('p', { class: 'spore__goal', id: 'spore-goal', attrs: { hidden: true } });
  const hint = createHint(store, 'hint.sporulate', t('hint.sporulate'));
  const wind = createWindSection(store);

  const root = h('div', { class: 'tab tab--sporulate' }, [
    h('div', { class: 'tab__toolbar' }, [h('h2', { class: 'tab__title', text: t('sporulate.title') })]),
    hint.root,
    h('p', { class: 'tab__intro', text: t('sporulate.intro') }),
    h('div', { class: 'spore__summary' }, [level, maturity, available]),
    h('div', { class: 'spore__now' }, [gain, next, rateBox]),
    h('div', { class: 'spore__progress' }, [
      requirement,
      h('div', { class: 'spore__bar-row' }, [
        h('span', { class: 'bar bar--wide', attrs: { 'aria-hidden': 'true' } }, [progressFill]),
        progressLabel,
      ]),
    ]),
    button,
    goalNote,
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
        ...(completesGoal(state) ? [completesText(state)] : []),
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

  function updateRates(state: GameState): void {
    const shown = partnerPerks(state).sporeRate;
    setHidden(rateBox, !shown);
    if (!shown) return;
    const rates = sporeRates(state);
    setText(
      rate,
      rates.now === null
        ? t('sporulate.rate.none')
        : t('sporulate.rate', { value: formatRate(rates.now, true) }),
    );
    setHidden(rateNext, rates.next === null);
    if (rates.next) {
      setText(
        rateNext,
        t('sporulate.rate.next', {
          time: formatDuration(rates.next.seconds, getLocale()),
          value: formatRate(rates.next.perMinute),
        }),
      );
    }
  }

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
    updateRates(state);
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
    const completes = completesGoal(state);
    // En El regreso y en un ciclo la línea guarda su sitio aunque aún no toque decirla: aparece a
    // mitad de partida, al crecer la ganancia, y empujaría Viento, que va debajo.
    const goal = forestGoal(state).kind;
    const reserved = !completes && (goal === 'return' || goal === 'cycle');
    setHidden(goalNote, !completes && !reserved);
    toggleClass(goalNote, 'is-reserved', reserved);
    if (completes || reserved) setText(goalNote, completesText(state));
    // Un aviso oculto citado por id se lee igual: sin aviso, no se cita (tab-mutations.ts).
    setAttr(button, 'aria-describedby', completes ? goalNote.id : null);
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

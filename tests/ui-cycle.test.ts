// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { disperse } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import { invalidate } from '../src/core/selectors.ts';
import type { GameState } from '../src/core/state.ts';
import { createBiomeCaption } from '../src/ui/biome-caption.ts';
import type { ChapterNav } from '../src/ui/chapter.ts';
import { h } from '../src/ui/dom.ts';
import { createStore, type Store } from '../src/ui/store.ts';
import { createChronicleTab } from '../src/ui/tab-chronicle.ts';
import { createSporulateTab } from '../src/ui/tab-sporulate.ts';
import { createStatsTab } from '../src/ui/tab-stats.ts';
import { createWindSection, departureText } from '../src/ui/wind.ts';
import {
  CYCLE_NOW,
  HOUR,
  fourthColonized,
  inReturn,
  primeLevel,
  reachLevel,
  returnClosed,
  sownIn,
} from './cycle-states.ts';

/**
 * Interfaz del ciclo libre (fase 10) sin navegador: las filas de sembrar de Viento, la meta del
 * ciclo en la cartela, en Viento y en Esporular, la confirmación de partir, los récords de la
 * Crónica y la fila de Estadísticas. Los estados se construyen con acciones (tests/cycle-states.ts).
 * Los modales (<dialog>) y el foco se prueban en el navegador.
 */

const nav: ChapterNav = {
  toWind: () => undefined,
  toAdaptations: () => undefined,
  toCore: () => undefined,
  toPartner: () => undefined,
};

afterEach(() => {
  document.body.replaceChildren();
  drain();
});

function mount(root: HTMLElement): HTMLElement {
  const panel = h('section', { attrs: { role: 'tabpanel', tabindex: 0 } }, [root]);
  document.body.append(panel);
  return panel;
}

function windOf(store: Store): { root: HTMLElement; update(): void } {
  const wind = createWindSection(store);
  mount(wind.root);
  wind.update();
  return wind;
}

const visibleRows = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>('.wind__dest')).filter((row) => !row.closest('[hidden]'));

/** En la taiga, ciclo 1, cumplido en 2,5 h de reloj y tres esporulaciones. */
function taigaDone(): GameState {
  const s = sownIn('taiga', CYCLE_NOW + 60 * HOUR);
  reachLevel(s, 120, CYCLE_NOW + 61 * HOUR);
  reachLevel(s, 368, CYCLE_NOW + 62 * HOUR);
  reachLevel(s, 520, CYCLE_NOW + 62.5 * HOUR);
  drain();
  return s;
}

describe('Viento en el ciclo libre (fase 10)', () => {
  it('cumplido El regreso ofrece sembrar los cinco biomas, también el natal, cada uno con su récord', () => {
    const wind = windOf(createStore(returnClosed()));
    const rows = visibleRows(wind.root);
    expect(rows.map((row) => row.querySelector('.wind__go')?.textContent)).toEqual([
      'Sembrar en el bosque natal',
      'Sembrar en la taiga',
      'Sembrar en la selva del Chocó',
      'Sembrar en la pradera',
      'Sembrar en la tundra',
    ]);
    for (const row of rows) {
      expect(row.querySelector('.wind__record')?.textContent).toBe('Aún sin récord');
      expect(row.querySelector('.wind__go')?.getAttribute('aria-disabled')).toBe('false');
    }
    expect(wind.root.querySelector('.tab__intro')?.textContent).toBe(
      'El viaje está cerrado: ahora el viento lleva tu linaje a cualquier bioma, también al que habitas. Cada siembra es un ciclo con el nivel de esporas en 0 y la meta en el nivel 500; cumplirlo deja tu mejor tiempo como récord.',
    );
    // Las reglas y el estilo, que ya se conocen del viaje, plegados bajo una cabecera que nombra el
    // bioma y su récord (el <summary>); el natal no tiene reglas ni estilo propios.
    const [natal, taiga] = rows;
    expect(natal?.querySelector('details')).toBeNull();
    expect(natal?.querySelector('.wind__style')).toBeNull();
    const details = taiga?.querySelector('details');
    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toBe('Taiga · podzol Aún sin récord Reglas');
    expect(details?.querySelector(':scope > .wind__style')?.textContent).toBe(
      'Para quien deja crecer: los árboles trabajan solos.',
    );
    expect(details?.querySelector(':scope > .wind__rules')?.textContent).toContain('Llueve la mitad');
    // Tras El regreso no hay meta al pie: el natal libre no persigue nada.
    expect(wind.root.querySelector<HTMLElement>('.wind__end')?.hidden).toBe(true);
  });

  it('en un ciclo con el nivel en 312, la cartela y Viento dicen «Ciclo 1: nivel 312 de 500» y llenan la barra', () => {
    const state = sownIn('taiga');
    reachLevel(state, 312, CYCLE_NOW + 61 * HOUR);
    const store = createStore(state);
    const caption = createBiomeCaption(store);
    mount(caption.root);
    caption.update();
    const wind = windOf(store);
    expect(caption.root.querySelector('.caption__progress')?.textContent).toBe('Ciclo 1: nivel 312 de 500');
    expect(caption.root.querySelector('.caption__compact')?.textContent).toBe('Taiga · 312/500');
    expect(wind.root.querySelector('.wind__progress > .tabular')?.textContent).toBe(
      'Ciclo 1: nivel 312 de 500',
    );
    for (const bar of [
      caption.root.querySelector<HTMLElement>('.caption__bar'),
      wind.root.querySelector<HTMLElement>('.wind__progress > .bar'),
    ]) {
      expect(bar?.hidden).toBe(false);
      // 312 / 500 = 0,624.
      expect(bar?.querySelector<HTMLElement>('.bar__fill')?.style.transform).toBe('scaleX(0.624)');
    }
    // Se puede partir sin cumplir, y el pie lo dice.
    expect(wind.root.querySelector('.wind__end')?.textContent).toBe(
      'Puedes sembrar cuando quieras; un ciclo sin cumplir no deja récord.',
    );
    expect(visibleRows(wind.root)).toHaveLength(5);
  });

  it('con el ciclo cumplido no hay barra, la cartela dice el nivel y la fila de la taiga, su récord', () => {
    const store = createStore(taigaDone());
    const caption = createBiomeCaption(store);
    mount(caption.root);
    caption.update();
    const wind = windOf(store);
    expect(caption.root.querySelector('.caption__progress')?.textContent).toBe(
      'Ciclo 1 cumplido · nivel 520',
    );
    expect(caption.root.querySelector('.caption__compact')?.textContent).toBe('Taiga · nivel 520');
    expect(caption.root.querySelector<HTMLElement>('.caption__bar')?.hidden).toBe(true);
    expect(wind.root.querySelector<HTMLElement>('.wind__progress > .bar')?.hidden).toBe(true);
    const records = visibleRows(wind.root).map((row) => row.querySelector('.wind__record')?.textContent);
    expect(records).toEqual([
      'Aún sin récord',
      'Récord: 2 h 30 min, en 3 partidas',
      'Aún sin récord',
      'Aún sin récord',
      'Aún sin récord',
    ]);
    expect(wind.root.querySelector<HTMLElement>('.wind__end')?.hidden).toBe(true);
  });

  it('sin 300 esporas, cuántas faltan se dice una vez, sobre la lista, y lo cita cada botón', () => {
    const state = taigaDone();
    state.spores.available = 120;
    invalidate(state);
    const wind = windOf(createStore(state));
    const buttons = visibleRows(wind.root).map((row) => row.querySelector('.wind__go'));
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button?.getAttribute('aria-disabled')).toBe('true');
      expect(document.getElementById(button?.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
        'Faltan 180 esporas para el viaje.',
      );
    }
    // Cinco veces la misma línea alargaba cada fila sin decir nada nuevo.
    const reasons = Array.from(wind.root.querySelectorAll<HTMLElement>('.wind__why')).filter(
      (p) => !p.hidden,
    );
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.closest('.wind__dest')).toBeNull();
  });
});

describe('confirmación de partir (fase 10)', () => {
  it('sembrar se llama sembrar y no dice que no se pueda volver', () => {
    const text = departureText(returnClosed(), 'taiga', 'cycle');
    expect(text.title).toBe('¿Sembrar un ciclo nuevo?');
    expect(text.yes).toBe('Sembrar');
    expect(text.rules[0]).toContain('×5');
    expect(text.lines.join(' ')).not.toContain('no se puede volver');
    // Tras El regreso, sin ciclo empezado, no hay récord que ganar ni perder.
    expect(text.lines.join(' ')).not.toContain('récord');
  });

  it('en un ciclo sin cumplir avisa de que no dejará récord, y si la esporulación de partir llega a 500, de que sí', () => {
    const state = sownIn('prairie');
    reachLevel(state, 200, CYCLE_NOW + 61 * HOUR);
    expect(departureText(state, 'tundra', 'cycle').lines).toContain(
      'Este ciclo no dejará récord: aún no llega al nivel 500.',
    );
    reachLevel(state, 480, CYCLE_NOW + 62 * HOUR);
    primeLevel(state, 520);
    const lines = departureText(state, 'tundra', 'cycle').lines;
    expect(lines).toContain('Esta esporulación cumple el ciclo: su récord queda.');
    expect(lines).toContain('Esta partida termina esporulando: ganarás 40 esporas.');
    expect(lines.join(' ')).not.toContain('no dejará récord');
  });

  it('el viaje dice que no se puede volver; la vuelta a casa, no', () => {
    const fourth = fourthColonized();
    const home = departureText(fourth, 'natal', 'return');
    expect(home.title).toBe('¿Volver al bosque natal?');
    expect(home.rules).toEqual(['Llega al nivel 500 en el bosque natal para cerrar el viaje.']);
    expect(home.lines.join(' ')).not.toContain('no se puede volver');
    const journey = departureText(fourth, 'tundra', 'journey');
    expect(journey.lines.at(-1)).toContain('no se puede volver');
  });
});

describe('Esporular en un ciclo (fase 10)', () => {
  it('con el nivel en 368 y una ganancia de 140, el botón dice que la esporulación cumple el ciclo y lo cita', () => {
    const state = sownIn('natal');
    reachLevel(state, 368, CYCLE_NOW + 61 * HOUR);
    primeLevel(state, 508);
    const tab = createSporulateTab(createStore(state));
    mount(tab.root);
    tab.update();
    const note = tab.root.querySelector<HTMLElement>('.spore__goal');
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toBe('Esta esporulación cumple el ciclo.');
    expect(tab.root.querySelector('.spore__button')?.getAttribute('aria-describedby')).toBe('spore-goal');
  });

  it('en El regreso sigue diciendo que lo cierra', () => {
    const state = inReturn();
    reachLevel(state, 368, CYCLE_NOW + 42 * HOUR);
    primeLevel(state, 508);
    const tab = createSporulateTab(createStore(state));
    mount(tab.root);
    tab.update();
    expect(tab.root.querySelector('.spore__goal')?.textContent).toBe('Esta esporulación cierra El regreso.');
  });
});

describe('el ciclo libre en la Crónica y en Estadísticas (fase 10)', () => {
  function chronicleOf(state: GameState) {
    const tab = createChronicleTab(createStore(state), nav);
    mount(tab.root);
    tab.update();
    return tab;
  }

  it('antes de El regreso no hay sección del ciclo; cumplido, la hay, vacía', () => {
    expect(chronicleOf(inReturn()).root.querySelector<HTMLElement>('.chronicle__cycle')?.hidden).toBe(true);
    const section = chronicleOf(returnClosed()).root.querySelector<HTMLElement>('.chronicle__cycle');
    expect(section?.hidden).toBe(false);
    expect(section?.textContent).toContain('0 ciclos cumplidos');
    expect(section?.querySelector<HTMLElement>('.chronicle__records')?.hidden).toBe(true);
    expect(section?.querySelector('.chronicle__records-empty')?.textContent).toBe(
      'Aún no hay récords: cumple un ciclo para dejar el primero.',
    );
  });

  it('cada récord es un elemento de lista en dos líneas, en el orden de los biomas, y la lista se rehace al cumplir', () => {
    const state = taigaDone();
    const tab = chronicleOf(state);
    const records = (): HTMLElement[] =>
      Array.from(tab.root.querySelectorAll<HTMLElement>('ul.chronicle__records > li'));
    expect(tab.root.querySelector('.chronicle__cycle')?.textContent).toContain('1 ciclo cumplido');
    expect(records()).toHaveLength(1);
    const [place, line] = Array.from(records()[0]?.querySelectorAll('p') ?? []);
    expect(place?.textContent).toBe('Taiga');
    expect(line?.textContent).toMatch(/^2 h 30 min · 3 partidas · /);
    // Un ciclo cumplido en el natal entra antes que la taiga: el orden es el de los biomas. La lista
    // se rehace al cumplirlo, no solo al sembrar.
    disperse(state, { to: 'natal', now: CYCLE_NOW + 70 * HOUR });
    tab.update();
    reachLevel(state, 520, CYCLE_NOW + 72 * HOUR);
    tab.update();
    expect(records().map((li) => li.querySelector('p')?.textContent)).toEqual(['Bosque natal', 'Taiga']);
    expect(tab.root.querySelector('.chronicle__cycle')?.textContent).toContain('2 ciclos cumplidos');
  });

  it('cumplir otra vez la taiga, más rápido, rehace la Crónica aunque no haya un récord más', () => {
    const state = taigaDone();
    const tab = chronicleOf(state);
    disperse(state, { to: 'taiga', now: CYCLE_NOW + 70 * HOUR });
    tab.update();
    // Sembrar suma un ciclo empezado y rehace la lista; cumplir solo suma uno cumplido y mejora el
    // récord en su sitio: la lista de récords no crece.
    reachLevel(state, 520, CYCLE_NOW + 71 * HOUR);
    tab.update();
    const records = Array.from(tab.root.querySelectorAll<HTMLElement>('ul.chronicle__records > li'));
    expect(records).toHaveLength(1);
    expect(records[0]?.querySelectorAll('p')[1]?.textContent).toMatch(/^1 h · 1 partida · /);
    expect(tab.root.querySelector('.chronicle__cycle')?.textContent).toContain('2 ciclos cumplidos');
  });

  it('en un ciclo en la taiga, la entrada de la taiga del viaje guarda su nivel y nada es el bosque actual', () => {
    const state = sownIn('taiga');
    reachLevel(state, 312, CYCLE_NOW + 61 * HOUR);
    const tab = chronicleOf(state);
    const taiga = Array.from(tab.root.querySelectorAll<HTMLElement>('.chronicle__entry')).find((entry) =>
      entry.querySelector('.chronicle__title')?.textContent.startsWith('Taiga'),
    );
    expect(taiga?.textContent).toContain('Nivel de esporas alcanzado: 520');
    expect(taiga?.textContent).not.toContain('312');
    expect(tab.root.querySelector('[aria-current]')).toBeNull();
  });

  it('Estadísticas cuenta los ciclos cumplidos desde El regreso, con un número', () => {
    const rowOf = (state: GameState): { label: HTMLElement | undefined; value: HTMLElement | null } => {
      const tab = createStatsTab(createStore(state));
      mount(tab.root);
      tab.update();
      const label = Array.from(tab.root.querySelectorAll<HTMLElement>('dt')).find(
        (dt) => dt.textContent === 'Ciclos cumplidos',
      );
      return { label, value: label?.nextElementSibling as HTMLElement | null };
    };
    expect(rowOf(inReturn()).label?.hidden).toBe(true);
    const done = rowOf(taigaDone());
    expect(done.label?.hidden).toBe(false);
    expect(done.value?.textContent).toBe('1');
  });
});

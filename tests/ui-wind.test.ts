// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { buyBiomeAdaptation, disperse, markSeen } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import { invalidate } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { checkActOne, checkColonization } from '../src/systems/journey.ts';
import { createBiomeAdaptations } from '../src/ui/biome-adaptations.ts';
import { createBiomeCaption } from '../src/ui/biome-caption.ts';
import { pendingChapter, type ChapterNav } from '../src/ui/chapter.ts';
import { h } from '../src/ui/dom.ts';
import { createStore, type Store } from '../src/ui/store.ts';
import { createChronicleTab } from '../src/ui/tab-chronicle.ts';
import { createWindSection } from '../src/ui/wind.ts';

/**
 * Interfaz del viaje (fase 8) sin navegador: la sección Viento, la Crónica, las adaptaciones de
 * bioma y la cola de láminas. Los modales (<dialog>) se prueban en tests/e2e/wind.spec.ts.
 */

const NOW = Date.UTC(2026, 9, 1);
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

function actOneState(): GameState {
  const s = createState(51, NOW);
  s.mutations = [...MUTATION_IDS];
  s.achievements = ['own.planetary.1'];
  s.stats.sporulations = 9;
  s.spores = { level: 1941, available: 2025 };
  checkActOne(s);
  return s;
}

function inTaiga(): GameState {
  const s = actOneState();
  disperse(s, { to: 'taiga', now: NOW + 1000 });
  return s;
}

/** Monta un componente dentro de un panel de pestaña enfocable, como tabs.ts. */
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

const visibleButtons = (root: HTMLElement): HTMLButtonElement[] =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('.wind__go')).filter((b) => !b.closest('[hidden]'));

describe('sección Viento de esporas', () => {
  it('no aparece antes del Acto I', () => {
    const store = createStore(createState(1, NOW));
    const wind = windOf(store);
    expect(wind.root.hidden).toBe(true);
  });

  it('tras el Acto I ofrece la taiga y el Chocó, con su botón disponible', () => {
    const wind = windOf(createStore(actOneState()));
    expect(wind.root.hidden).toBe(false);
    const buttons = visibleButtons(wind.root);
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Dispersar hacia la taiga',
      'Dispersar hacia la selva del Chocó',
    ]);
    for (const b of buttons) {
      expect(b.getAttribute('aria-disabled')).toBe('false');
      // Sin motivo, no se cita un motivo oculto (se leería igual).
      expect(b.hasAttribute('aria-describedby')).toBe(false);
    }
  });

  it('en la taiga sin colonizar, el botón del Chocó dice por qué no y sigue enfocable', () => {
    const wind = windOf(createStore(inTaiga()));
    const [choco] = visibleButtons(wind.root);
    if (!choco) throw new Error('Falta el destino del Chocó');
    expect(choco.textContent).toBe('Dispersar hacia la selva del Chocó');
    expect(choco.getAttribute('aria-disabled')).toBe('true');
    expect(choco.disabled).toBe(false);
    const why = document.getElementById(choco.getAttribute('aria-describedby') ?? '');
    expect(why?.hidden).toBe(false);
    expect(why?.textContent).toBe('Antes hay que colonizar este bioma: nivel 500.');
    choco.focus();
    expect(document.activeElement).toBe(choco);
  });

  it('en el último bioma sin colonizar lo dice, y al colonizarlo ya no queda adónde ir', () => {
    const state = inTaiga();
    state.spores.level = 500;
    checkColonization(state, NOW + 5000);
    disperse(state, { to: 'choco', now: NOW + 9000 });
    const store = createStore(state);
    const wind = windOf(store);
    expect(visibleButtons(wind.root)).toEqual([]);
    const end = wind.root.querySelector<HTMLElement>('.wind__end');
    expect(end?.textContent).toContain('último bioma');
    state.spores.level = 500;
    checkColonization(state, NOW + 20_000);
    invalidate(state);
    wind.update();
    expect(end?.textContent).toContain('No quedan biomas nuevos');
  });
});

describe('progreso del bosque', () => {
  /** La cartela, la sección Viento y la Crónica montadas sobre el mismo estado. */
  function progressViews(state: GameState) {
    const store = createStore(state);
    const caption = createBiomeCaption(store);
    mount(caption.root);
    caption.update();
    const wind = windOf(store);
    const chronicle = createChronicleTab(store, nav);
    mount(chronicle.root);
    chronicle.update();
    const text = (root: HTMLElement, selector: string): string | null | undefined =>
      root.querySelector(selector)?.textContent;
    const bar = (root: HTMLElement, selector: string): HTMLElement | null => root.querySelector(selector);
    return {
      captionText: text(caption.root, '.caption__progress'),
      compact: text(caption.root, '.caption__compact'),
      windText: text(wind.root, '.wind__progress > .tabular'),
      chronicleText: text(chronicle.root, '.chronicle__progress > .tabular'),
      bars: [bar(caption.root, '.caption__bar'), bar(wind.root, '.wind__progress > .bar')],
      chronicleBar: bar(chronicle.root, '.chronicle__progress > .bar'),
    };
  }

  it('en un destino a medias, la cartela, Viento y la Crónica dicen el mismo nivel de 500 y llenan la barra', () => {
    const state = inTaiga();
    state.spores.level = 312;
    const views = progressViews(state);
    const progress = 'Colonización: nivel\u00a0312 de\u00a0500';
    expect(views.captionText).toBe(progress);
    expect(views.windText).toBe(progress);
    expect(views.chronicleText).toBe(progress);
    expect(views.compact).toBe('Taiga · 312/500');
    // 312 / 500 = 0,624.
    for (const bar of [...views.bars, views.chronicleBar]) {
      expect(bar?.hidden).toBe(false);
      expect(bar?.querySelector<HTMLElement>('.bar__fill')?.style.transform).toBe('scaleX(0.624)');
    }
  });

  it('al colonizar, la cartela y Viento dicen «colonizado», sin barra, y la Crónica cierra la entrada', () => {
    const state = inTaiga();
    state.spores.level = 520;
    checkColonization(state, NOW + 5000);
    const views = progressViews(state);
    expect(views.captionText).toBe('Bioma colonizado · nivel 520');
    expect(views.windText).toBe('Bioma colonizado · nivel 520');
    expect(views.compact).toBe('Taiga · nivel 520');
    for (const bar of views.bars) expect(bar?.hidden).toBe(true);
    expect(views.chronicleText).toBeUndefined();
  });

  it('en el natal con el Acto I cerrado no hay meta ni barra', () => {
    const views = progressViews(actOneState());
    expect(views.captionText).toBe('Acto I cumplido · nivel 1941');
    expect(views.windText).toBe('Acto I cumplido · nivel 1941');
    expect(views.compact).toBe('Bosque natal · nivel 1941');
    for (const bar of views.bars) expect(bar?.hidden).toBe(true);
  });
});

describe('Crónica', () => {
  it('lista el natal y el bioma en curso, en orden, con la colonización pendiente', () => {
    const store = createStore(inTaiga());
    const tab = createChronicleTab(store, nav);
    mount(tab.root);
    tab.update();
    const titles = Array.from(tab.root.querySelectorAll('.chronicle__title')).map((el) => el.textContent);
    expect(titles).toEqual(['Bosque natal · Acto I', 'Taiga · en curso']);
    expect(tab.root.textContent).toMatch(/Colonización: nivel\s0 de\s500/);
  });

  it('al colonizar, la entrada del bioma pasa a colonizado y el foco no se pierde al rehacerla', () => {
    const state = inTaiga();
    const store = createStore(state);
    const tab = createChronicleTab(store, nav);
    const panel = mount(tab.root);
    tab.update();
    const reread = tab.root.querySelector<HTMLButtonElement>('.chronicle__reread');
    reread?.focus();
    state.spores.level = 520;
    checkColonization(state, NOW + 5000);
    tab.update();
    const titles = Array.from(tab.root.querySelectorAll('.chronicle__title')).map((el) => el.textContent);
    // El bosque actual lo dice también con texto (oculto a la vista: el borde lo marca).
    expect(titles).toEqual(['Bosque natal · Acto I', 'Taiga · colonizado Aquí vive tu linaje.']);
    expect(tab.root.querySelector('[aria-current="location"]')?.textContent).toContain('Taiga');
    expect(document.activeElement).toBe(panel);
  });
});

describe('Crónica y adaptaciones aprendidas después de colonizar', () => {
  it('la línea de adaptaciones del bioma se actualiza al comprar una, sin rehacer la lista', () => {
    const state = inTaiga();
    state.spores.level = 520;
    checkColonization(state, NOW + 5000);
    const store = createStore(state);
    const tab = createChronicleTab(store, nav);
    mount(tab.root);
    tab.update();
    expect(tab.root.textContent).toContain('Adaptaciones de este bioma: 0 de 3');
    store.dispatch(buyBiomeAdaptation, { id: 'rockEating' });
    tab.update();
    expect(tab.root.textContent).toContain('Adaptaciones de este bioma: 1 de 3');
  });
});

describe('adaptaciones de bioma', () => {
  it('tras comprar una, el foco sigue en su botón y el grupo de la taiga va primero', () => {
    const state = inTaiga();
    const store = createStore(state);
    const view = createBiomeAdaptations(store);
    mount(view.root);
    expect(view.update()).toBe(true);
    const groups = Array.from(view.root.querySelectorAll<HTMLElement>('.badapt__group')).filter(
      (g) => !g.hidden,
    );
    expect(groups).toHaveLength(1);
    const button = view.root.querySelector<HTMLButtonElement>('#badapt-taiga-title ~ ul .adapt__buy');
    if (!button) throw new Error('Falta el botón de la primera adaptación de la taiga');
    expect(button.getAttribute('aria-disabled')).toBe('false');
    button.focus();
    button.click();
    view.update();
    expect(state.biomeAdaptations.rockEating).toBe(1);
    expect(document.activeElement).toBe(button);
    // El rango 2 pide nivel 75 en la taiga: lo dice con texto.
    expect(button.getAttribute('aria-disabled')).toBe('true');
    const why = document.getElementById('badapt-rockEating-why');
    expect(why?.textContent).toBe('El siguiente rango se abre en el nivel 75 de la taiga, o al colonizarla.');
    expect(button.getAttribute('aria-describedby')).toContain('badapt-rockEating-why');
  });
});

describe('cola de láminas', () => {
  it('va del Acto I a la llegada y luego a la colonización, sin repetir las vistas', () => {
    const state = inTaiga();
    const store = createStore(state);
    expect(pendingChapter(state)).toEqual({ kind: 'act1' });
    store.dispatch(markSeen, { key: 'chapter.act1' });
    expect(pendingChapter(state)).toEqual({ kind: 'arrive', biome: 'taiga' });
    store.dispatch(markSeen, { key: 'chapter.arrive.taiga' });
    expect(pendingChapter(state)).toBeNull();
    state.spores.level = 500;
    checkColonization(state, NOW + 5000);
    expect(pendingChapter(state)).toEqual({ kind: 'colonize', biome: 'taiga' });
  });

  it('antes del Acto I no hay ninguna lámina pendiente', () => {
    expect(pendingChapter(createState(2, NOW))).toBeNull();
  });
});

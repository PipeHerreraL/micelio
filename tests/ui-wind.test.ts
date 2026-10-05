// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { buyBiomeAdaptation, disperse, markSeen, sporulate } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import { invalidate } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { checkActOne, checkColonization } from '../src/systems/journey.ts';
import { createBiomeAdaptations } from '../src/ui/biome-adaptations.ts';
import { createBiomeCaption } from '../src/ui/biome-caption.ts';
import { createGeneratorsTab } from '../src/ui/tab-generators.ts';
import { chapterSeenKey, pendingChapter, type ChapterNav } from '../src/ui/chapter.ts';
import { h } from '../src/ui/dom.ts';
import { createStore, type Store } from '../src/ui/store.ts';
import { createChronicleTab } from '../src/ui/tab-chronicle.ts';
import { createSporulateTab } from '../src/ui/tab-sporulate.ts';
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

/** Coloniza el bosque actual por la vía del núcleo. */
function colonize(state: GameState, now: number): void {
  state.spores.level = Math.max(state.spores.level, 500);
  checkColonization(state, now);
  invalidate(state);
}

/** En el Chocó, segundo destino y aún sin colonizar: el anillo 2 sigue cerrado. */
function inChocoSecond(): GameState {
  const s = inTaiga();
  colonize(s, NOW + 5000);
  disperse(s, { to: 'choco', now: NOW + 9000 });
  return s;
}

/** En la tundra, cuarto destino y aún sin colonizar (taiga → Chocó → pradera → tundra). */
function inTundraFourth(): GameState {
  const s = inChocoSecond();
  colonize(s, NOW + 20_000);
  disperse(s, { to: 'prairie', now: NOW + 30_000 });
  colonize(s, NOW + 40_000);
  disperse(s, { to: 'tundra', now: NOW + 50_000 });
  return s;
}

/** De vuelta en el natal, El regreso en curso (tramo 5, cinco entradas en la Crónica). */
function inReturn(): GameState {
  const s = inTundraFourth();
  colonize(s, NOW + 60_000);
  disperse(s, { to: 'natal', now: NOW + 70_000 });
  return s;
}

/**
 * Cumple El regreso por la vía del núcleo: la esporulación que lleva el nivel a 525. Los nutrientes
 * del bosque se inyectan antes, como en journey.test: E = ⌊18,75 · √(3,7632e16 / 4,8e13)⌋ = 525.
 */
function closeReturn(s: GameState): void {
  s.forest.earned = 3.7632e16;
  s.lifetimeEarned = 1e17;
  s.runEarned = 2.88e14;
  sporulate(s, { now: NOW + 90_000 });
  invalidate(s);
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

  it('con el primer bosque colonizado, bajo el otro bosque dice cuándo se abren dos biomas más', () => {
    const state = inTaiga();
    const wind = windOf(createStore(state));
    const ring2 = wind.root.querySelector<HTMLElement>('.wind__ring2');
    // Antes de colonizar nada, no: el viaje acaba de empezar.
    expect(ring2?.hidden).toBe(true);
    colonize(state, NOW + 5000);
    wind.update();
    expect(visibleButtons(wind.root).map((b) => b.textContent)).toEqual([
      'Dispersar hacia la selva del Chocó',
    ]);
    expect(ring2?.hidden).toBe(false);
    expect(ring2?.textContent).toBe(
      'Donde acaban los árboles: dos biomas más se abren cuando tu linaje colonice la taiga y la selva del Chocó.',
    );
  });

  it('en el Chocó segundo sin colonizar no dice que sea el último bioma; al colonizarlo ofrece la pradera y la tundra', () => {
    const state = inChocoSecond();
    const wind = windOf(createStore(state));
    expect(visibleButtons(wind.root)).toEqual([]);
    const end = wind.root.querySelector<HTMLElement>('.wind__end');
    const ring2 = wind.root.querySelector<HTMLElement>('.wind__ring2');
    expect(end?.hidden).toBe(true);
    expect(ring2?.hidden).toBe(false);
    colonize(state, NOW + 20_000);
    wind.update();
    expect(ring2?.hidden).toBe(true);
    expect(end?.hidden).toBe(true);
    const buttons = visibleButtons(wind.root);
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Dispersar hacia la pradera',
      'Dispersar hacia la tundra',
    ]);
    for (const b of buttons) expect(b.getAttribute('aria-disabled')).toBe('false');
    // Cada fila con sus reglas, sacadas de los datos.
    expect(wind.root.textContent).toContain('El Anillo de hadas rinde ×6.');
    expect(wind.root.textContent).toContain('Con el frío todo crece a la mitad: la producción es ×0,5.');
    expect(wind.root.textContent).toContain('Mientras vives aquí, tu red aguanta 24 h más sin ti.');
    expect(wind.root.textContent).toContain(
      'Si te vas más de 8 h, lo que pase de ahí rinde entero: bajo la nieve, la red sigue trabajando.',
    );
  });

  it('en el cuarto bioma sin colonizar dice que es el último, y al colonizarlo ofrece volver al bosque natal', () => {
    const state = inTundraFourth();
    const wind = windOf(createStore(state));
    expect(visibleButtons(wind.root)).toEqual([]);
    const end = wind.root.querySelector<HTMLElement>('.wind__end');
    expect(end?.hidden).toBe(false);
    expect(end?.textContent).toBe(
      'Este es el último bioma del viaje: colonízalo y el viento soplará de vuelta a casa.',
    );
    expect(wind.root.querySelector<HTMLElement>('.wind__ring2')?.hidden).toBe(true);
    colonize(state, NOW + 60_000);
    wind.update();
    expect(end?.hidden).toBe(true);
    const [home, ...rest] = visibleButtons(wind.root);
    expect(rest).toEqual([]);
    expect(home?.textContent).toBe('Volver al bosque natal');
    expect(home?.getAttribute('aria-disabled')).toBe('false');
    const row = home?.closest('.wind__dest');
    expect(row?.querySelector('.wind__name')?.textContent).toBe('Bosque natal · suelo pardo');
    expect(row?.textContent).toContain('Mil años después: el viaje termina donde empezó.');
    expect(row?.textContent).toContain('Llega al nivel 500 en el bosque natal para cerrar el viaje.');
    // Sin las 300 esporas, dice cuántas faltan, como los destinos.
    state.spores.available = 100;
    wind.update();
    expect(home?.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(home?.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Faltan 200 esporas para el viaje.',
    );
  });

  it('durante El regreso no hay filas: la línea del pie dice su meta; cumplido, ni filas ni meta', () => {
    const state = inReturn();
    const wind = windOf(createStore(state));
    expect(visibleButtons(wind.root)).toEqual([]);
    expect(wind.root.querySelector<HTMLElement>('.tab__intro')?.hidden).toBe(true);
    const end = wind.root.querySelector<HTMLElement>('.wind__end');
    expect(end?.hidden).toBe(false);
    expect(end?.textContent).toBe('Llega al nivel 500 en el bosque natal para cerrar el viaje.');
    expect(wind.root.querySelector('.wind__here')?.textContent).toBe('Tu linaje vive en el bosque natal.');
    closeReturn(state);
    wind.update();
    expect(visibleButtons(wind.root)).toEqual([]);
    expect(end?.hidden).toBe(true);
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

  it('durante El regreso, la cartela, Viento y la Crónica dicen «El regreso: nivel X de 500» y llenan la barra', () => {
    const state = inReturn();
    state.spores.level = 312;
    const views = progressViews(state);
    const progress = 'El regreso: nivel 312 de 500';
    expect(views.captionText).toBe(progress);
    expect(views.windText).toBe(progress);
    expect(views.chronicleText).toBe(progress);
    expect(views.compact).toBe('Bosque natal · 312/500');
    for (const bar of [...views.bars, views.chronicleBar]) {
      expect(bar?.hidden).toBe(false);
      expect(bar?.querySelector<HTMLElement>('.bar__fill')?.style.transform).toBe('scaleX(0.624)');
    }
  });

  it('con El regreso cumplido no hay meta ni barra: «El regreso cumplido» y el nivel', () => {
    const state = inReturn();
    closeReturn(state);
    const views = progressViews(state);
    expect(views.captionText).toBe('El regreso cumplido · nivel 525');
    expect(views.windText).toBe('El regreso cumplido · nivel 525');
    expect(views.compact).toBe('Bosque natal · nivel 525');
    for (const bar of views.bars) expect(bar?.hidden).toBe(true);
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

describe('Esporular en El regreso (fase 10)', () => {
  /** Nivel 368 y una ganancia de 140 (E = 508 con L = 4,8e13 · (508 / 18,75)²), con el requisito. */
  function nearGoal(s: GameState): void {
    s.spores.level = 368;
    s.forest.earned = 4.8e13 * (508 / 18.75) ** 2 + 1e10;
    s.lifetimeEarned = 1e17;
    s.runEarned = 2.88e14;
    invalidate(s);
  }

  it('cuando la esporulación cierra El regreso, el botón lo dice y lo cita; si no llega a 500, no', () => {
    const state = inReturn();
    nearGoal(state);
    const tab = createSporulateTab(createStore(state));
    mount(tab.root);
    tab.update();
    const note = tab.root.querySelector<HTMLElement>('.spore__goal');
    const button = tab.root.querySelector<HTMLButtonElement>('.spore__button');
    expect(tab.root.querySelector('.spore__gain')?.textContent).toBe('Esporularías ahora: 140 esporas');
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toBe('Esta esporulación cierra El regreso.');
    expect(button?.getAttribute('aria-describedby')).toBe(note?.id);
    // Desde el nivel 0, la misma partida da 508 de golpe: también cumple. Con 499, no.
    state.spores.level = 0;
    state.forest.earned = 4.8e13 * (499 / 18.75) ** 2 + 1e10;
    invalidate(state);
    tab.update();
    expect(note?.hidden).toBe(true);
    expect(button?.hasAttribute('aria-describedby')).toBe(false);
    tab.destroy();
  });

  it('en un destino, llegar a 500 no muestra el aviso: colonizar ya tiene su lámina', () => {
    const state = inTaiga();
    state.spores.level = 368;
    state.forest.earned = 1e11 * (508 / 18.75) ** 2 + 1e3;
    state.lifetimeEarned = 1e15;
    state.runEarned = 1e11;
    invalidate(state);
    const tab = createSporulateTab(createStore(state));
    mount(tab.root);
    tab.update();
    expect(tab.root.querySelector('.spore__gain')?.textContent).toBe('Esporularías ahora: 140 esporas');
    expect(tab.root.querySelector<HTMLElement>('.spore__goal')?.hidden).toBe(true);
    tab.destroy();
  });
});

describe('Crónica de El regreso (fase 10)', () => {
  const titles = (root: HTMLElement): (string | null)[] =>
    Array.from(root.querySelectorAll('.chronicle__title')).map((el) => el.textContent);

  it('en curso, una entrada «El regreso, en curso» al final, actual, con su progreso y la llegada para releer', () => {
    const state = inReturn();
    state.spores.level = 120;
    const tab = createChronicleTab(createStore(state), nav);
    mount(tab.root);
    tab.update();
    expect(titles(tab.root)).toEqual([
      'Bosque natal · Acto I',
      'Taiga · colonizado',
      'Selva del Chocó · colonizado',
      'Pradera · colonizado',
      'Tundra · colonizado',
      'Bosque natal · El regreso, en curso Aquí vive tu linaje.',
    ]);
    const current = tab.root.querySelector('[aria-current="location"]');
    expect(current?.textContent).toMatch(/El regreso: nivel\s120 de\s500/);
    expect(
      Array.from(current?.querySelectorAll('.chronicle__reread') ?? []).map((b) => b.textContent),
    ).toEqual(['Releer «El regreso»']);
    // La tundra que se dejó no es la actual: guarda su nivel alcanzado.
    const tundra = Array.from(tab.root.querySelectorAll('.chronicle__entry'))[4];
    expect(tundra?.hasAttribute('aria-current')).toBe(false);
    expect(tundra?.textContent).toContain('Nivel de esporas alcanzado: 500');
  });

  it('cumplido, la entrada pasa a «El regreso» con su fecha y sus partidas y se releen sus dos láminas', () => {
    const state = inReturn();
    state.stats.sporulations += 4;
    state.stats.totalTime += 7200;
    const store = createStore(state);
    const tab = createChronicleTab(store, nav);
    mount(tab.root);
    tab.update();
    closeReturn(state);
    tab.update();
    expect(titles(tab.root).at(-1)).toBe('Bosque natal · El regreso Aquí vive tu linaje.');
    expect(tab.root.querySelectorAll('.chronicle__entry')).toHaveLength(6);
    const last = Array.from(tab.root.querySelectorAll('.chronicle__entry')).at(-1);
    expect(last?.textContent).toContain('Cumplido el');
    expect(last?.textContent).toContain('en 5 partidas y 2 h de juego');
    expect(last?.textContent).toContain('Nivel de esporas alcanzado: 525');
    expect(Array.from(last?.querySelectorAll('.chronicle__reread') ?? []).map((b) => b.textContent)).toEqual([
      'Releer «El regreso»',
      'Releer «La red planetaria»',
    ]);
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

describe('adaptaciones de la pradera y la tundra (fase 10)', () => {
  it('la tundra tiene su grupo en Mutaciones, primero, y su línea en la Crónica; el Liquen dice su tope', () => {
    const state = inChocoSecond();
    colonize(state, NOW + 20_000);
    disperse(state, { to: 'tundra', now: NOW + 30_000 });
    const store = createStore(state);
    const view = createBiomeAdaptations(store);
    mount(view.root);
    view.update();
    const visible = Array.from(view.root.querySelectorAll<HTMLElement>('.badapt__group')).filter(
      (g) => !g.hidden,
    );
    expect(visible.map((g) => g.querySelector('.badapt__title')?.textContent)).toEqual([
      'Aprendidas en la tundra',
      'Aprendidas en la taiga',
      'Aprendidas en la selva del Chocó',
    ]);
    // La pradera, sin visitar, no se ve.
    expect(view.root.querySelector<HTMLElement>('#badapt-prairie-title')?.closest('section')?.hidden).toBe(
      true,
    );
    const lichen = view.root.querySelector<HTMLButtonElement>('[aria-label="Adaptar: Liquen"]');
    if (!lichen) throw new Error('Falta el botón del Liquen');
    lichen.click();
    view.update();
    expect(state.biomeAdaptations.lichen).toBe(1);
    expect(document.getElementById('badapt-lichen-effect')?.textContent).toBe(
      'El tope sin conexión sube 12 h.',
    );
    // El rango 2 pide nivel 150 en la tundra.
    expect(document.getElementById('badapt-lichen-why')?.textContent).toBe(
      'El siguiente rango se abre en el nivel 150 de la tundra, o al colonizarla.',
    );
    colonize(state, NOW + 40_000);
    const tab = createChronicleTab(store, nav);
    mount(tab.root);
    tab.update();
    const tundra = Array.from(tab.root.querySelectorAll('.chronicle__entry')).at(-1);
    expect(tundra?.textContent).toContain('Tundra · colonizado');
    expect(tundra?.textContent).toContain('Adaptaciones de este bioma: 1 de 3');
  });

  it('en la pradera, la pista de la cantidad «Hito» sale una vez, con el Anillo de hadas a la vista', () => {
    const state = inChocoSecond();
    colonize(state, NOW + 20_000);
    // Un jugador del viaje ya vio el Anillo de hadas en el natal.
    state.seen.push('gen.fairyRing.full');
    const store = createStore(state);
    const tab = createGeneratorsTab(store);
    mount(tab.root);
    const hint = (): HTMLElement | undefined =>
      Array.from(tab.root.querySelectorAll<HTMLElement>('.hint')).find((el) =>
        el.textContent.includes('cantidad «Hito»'),
      );
    tab.update();
    // En el Chocó, no.
    expect(hint()?.hidden).toBe(true);
    disperse(state, { to: 'prairie', now: NOW + 30_000 });
    tab.update();
    expect(hint()?.hidden).toBe(false);
    expect(hint()?.querySelector('.hint__text')?.textContent).toBe(
      'En la pradera, prueba la cantidad «Hito» con el Anillo de hadas: cada hito duplica su producción.',
    );
    hint()?.querySelector<HTMLButtonElement>('.hint__dismiss')?.click();
    tab.update();
    expect(hint()?.hidden).toBe(true);
    tab.destroy();
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

  it('la colonización que cierra el primer anillo trae la lámina «Donde acaban los árboles», una sola vez', () => {
    const state = inTaiga();
    const store = createStore(state);
    for (const key of ['chapter.act1', 'chapter.arrive.taiga']) store.dispatch(markSeen, { key });
    colonize(state, NOW + 5000);
    expect(pendingChapter(state)).toEqual({ kind: 'colonize', biome: 'taiga' });
    store.dispatch(markSeen, { key: 'chapter.colonize.taiga' });
    // Con un solo bosque colonizado, el anillo 2 sigue cerrado: ninguna lámina.
    expect(pendingChapter(state)).toBeNull();
    disperse(state, { to: 'choco', now: NOW + 9000 });
    store.dispatch(markSeen, { key: 'chapter.arrive.choco' });
    colonize(state, NOW + 20_000);
    expect(pendingChapter(state)).toEqual({ kind: 'colonize', biome: 'choco' });
    store.dispatch(markSeen, { key: 'chapter.colonize.choco' });
    expect(pendingChapter(state)).toEqual({ kind: 'ring2' });
    store.dispatch(markSeen, { key: 'chapter.ring2' });
    expect(pendingChapter(state)).toBeNull();
    // En el anillo 2 la cola sigue con la llegada, sin volver a la del anillo.
    disperse(state, { to: 'prairie', now: NOW + 30_000 });
    expect(pendingChapter(state)).toEqual({ kind: 'arrive', biome: 'prairie' });
  });

  it('El regreso trae su llegada al volver al natal y «La red planetaria» al cumplirlo, una vez cada una', () => {
    const state = inTundraFourth();
    const store = createStore(state);
    const seenAll = (): void => {
      for (let chapter = pendingChapter(state); chapter; chapter = pendingChapter(state)) {
        store.dispatch(markSeen, { key: chapterSeenKey(chapter) });
      }
    };
    seenAll();
    colonize(state, NOW + 60_000);
    expect(pendingChapter(state)).toEqual({ kind: 'colonize', biome: 'tundra' });
    seenAll();
    disperse(state, { to: 'natal', now: NOW + 70_000 });
    expect(pendingChapter(state)).toEqual({ kind: 'returnArrive' });
    store.dispatch(markSeen, { key: 'chapter.return.arrive' });
    expect(pendingChapter(state)).toBeNull();
    closeReturn(state);
    expect(pendingChapter(state)).toEqual({ kind: 'returnClose' });
    store.dispatch(markSeen, { key: 'chapter.return.close' });
    expect(pendingChapter(state)).toBeNull();
    expect(state.seen.filter((k) => k.startsWith('chapter.return'))).toEqual([
      'chapter.return.arrive',
      'chapter.return.close',
    ]);
  });

  it('antes del Acto I no hay ninguna lámina pendiente', () => {
    expect(pendingChapter(createState(2, NOW))).toBeNull();
  });
});

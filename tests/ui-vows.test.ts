// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { disperse, renounceVow } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import { invalidate } from '../src/core/selectors.ts';
import type { GameState } from '../src/core/state.ts';
import { createPlasmodium } from '../src/partners/plasmodium/state.ts';
import { h } from '../src/ui/dom.ts';
import { createStore, type Store } from '../src/ui/store.ts';
import type { ChapterNav } from '../src/ui/chapter.ts';
import { createChronicleTab } from '../src/ui/tab-chronicle.ts';
import { createGeneratorsTab } from '../src/ui/tab-generators.ts';
import { createMutationsTab } from '../src/ui/tab-mutations.ts';
import { createStatsTab } from '../src/ui/tab-stats.ts';
import { createUpgradesTab } from '../src/ui/tab-upgrades.ts';
import { createWindSection, departureText } from '../src/ui/wind.ts';
import { CYCLE_NOW, HOUR, fourthColonized, reachLevel, returnClosed, sownIn } from './cycle-states.ts';

/**
 * La interfaz de los votos (fase 10, bloque B) sin navegador: elegirlos en Viento, lo que dice la
 * confirmación, los vigentes con su botón de romper, las compras bloqueadas con «solo autocompra»,
 * el árbol y la fila de la Red planetaria dormidos con «sin mutaciones» y la fila de Estadísticas.
 * Los modales (<dialog>) y el foco al romper un voto se prueban en el navegador
 * (tests/e2e/cycle.spec.ts).
 */

const SOWN_AT = CYCLE_NOW + 60 * HOUR;
const views: { destroy(): void }[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
  drain();
});

function mount<T extends { root: HTMLElement; update(): void; destroy(): void }>(view: T): T {
  document.body.append(h('section', { attrs: { role: 'tabpanel', tabindex: 0 } }, [view.root]));
  view.update();
  views.push(view);
  return view;
}

const visible = (el: Element | null): boolean => el !== null && !el.closest('[hidden]');

describe('elegir votos en Viento (fase 10)', () => {
  it('cumplido El regreso, el grupo «Votos para el próximo ciclo» ofrece tres interruptores con su descripción', () => {
    const wind = mount(createWindSection(createStore(returnClosed())));
    const group = wind.root.querySelector('[role="group"].wind__vows');
    expect(visible(group)).toBe(true);
    expect(group?.getAttribute('aria-labelledby')).toBe('wind-vows-title');
    expect(wind.root.querySelector('#wind-vows-title')?.textContent).toBe('Votos para el próximo ciclo');
    const toggles = Array.from(group?.querySelectorAll<HTMLButtonElement>('.toggle') ?? []);
    expect(toggles.map((b) => b.textContent)).toEqual(['Sin lluvia', 'Solo autocompra', 'Sin mutaciones']);
    for (const toggle of toggles) {
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      const desc = document.getElementById(toggle.getAttribute('aria-describedby') ?? '');
      expect(desc?.textContent).not.toBe('');
    }
    // De camino a casa no hay nada que jurar: El regreso va sin votos.
    const journey = mount(createWindSection(createStore(fourthColonized())));
    expect(visible(journey.root.querySelector('.wind__vows'))).toBe(false);
  });

  it('con «sin lluvia» marcado, el Chocó dice por qué no y su botón no siembra; los demás, sí', () => {
    const store = createStore(returnClosed());
    const wind = mount(createWindSection(store));
    const toggle = wind.root.querySelector<HTMLButtonElement>('.wind__toggle');
    toggle?.click();
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    const rows = Array.from(wind.root.querySelectorAll<HTMLElement>('.wind__dest')).filter((r) => visible(r));
    const choco = rows.find((row) => row.textContent.includes('Sembrar en la selva del Chocó'));
    const why = choco?.querySelector('.wind__vowwhy');
    expect(visible(why ?? null)).toBe(true);
    expect(why?.textContent).toBe('En la selva del Chocó no se jura «sin lluvia»: allí la lluvia no para.');
    const button = choco?.querySelector('.wind__go');
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(button?.getAttribute('aria-describedby')).toBe(why?.id);
    for (const row of rows.filter((r) => r !== choco)) {
      expect(row.querySelector('.wind__go')?.getAttribute('aria-disabled')).toBe('false');
    }
    // Desmarcado, el Chocó vuelve a sembrarse.
    toggle?.click();
    expect(visible(why ?? null)).toBe(false);
    expect(button?.getAttribute('aria-disabled')).toBe('false');
    expect(button?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('la confirmación de sembrar dice los votos y la meta que dejan; con «sin mutaciones», que viajan dormidas', () => {
    const s = returnClosed();
    const text = departureText(s, 'natal', 'cycle', ['noRain', 'autoOnly', 'noMutations']);
    // 0,15 · 0,38 · 0,53 = 0,0302.
    expect(text.rules).toEqual([
      'Votos: sin lluvia, solo autocompra y sin mutaciones.',
      // Intl separa la cifra del signo con un espacio duro.
      'Con estos votos, esporular aquí pide el 3 % de los nutrientes.',
    ]);
    expect(text.lines).toContain(
      'Viajan contigo: esporas disponibles, mutaciones (dormidas hasta que las despiertes), adaptaciones, linaje, logros, autocompra, estadísticas de vida y ajustes.',
    );
    const one = departureText(s, 'tundra', 'cycle', ['autoOnly']);
    expect(one.rules.slice(-2)).toEqual([
      'Votos: solo autocompra.',
      'Con estos votos, esporular aquí pide el 36 % de los nutrientes.',
    ]);
    expect(one.lines.some((line) => line.includes('dormidas'))).toBe(false);
    // Sin votos, lo de siempre.
    expect(departureText(s, 'natal', 'cycle').rules).toEqual([]);
  });

  it('cada fila de sembrar dice el récord de los votos marcados, no el mejor del bioma con otros votos', () => {
    // El natal cumplido en 1 h con «sin lluvia» (la meta baja) y luego en 3 h sin votos.
    const s = sownIn('natal', SOWN_AT, ['noRain']);
    reachLevel(s, 520, SOWN_AT + HOUR);
    disperse(s, { to: 'natal', now: SOWN_AT + 2 * HOUR });
    reachLevel(s, 120, SOWN_AT + 3 * HOUR);
    reachLevel(s, 520, SOWN_AT + 5 * HOUR);
    drain();
    const wind = mount(createWindSection(createStore(s)));
    const recordOf = (biome: string): string | null | undefined =>
      Array.from(wind.root.querySelectorAll<HTMLElement>('.wind__dest'))
        .find((row) => visible(row) && row.querySelector('.wind__go')?.textContent === `Sembrar en ${biome}`)
        ?.querySelector('.wind__record')?.textContent;
    const toggle = (name: string) =>
      Array.from(wind.root.querySelectorAll<HTMLButtonElement>('.wind__toggle'))
        .find((b) => b.textContent === name)
        ?.click();
    // Sin votos marcados, el récord sin votos: el de 1 h es de otra meta y no se puede batir así.
    expect(recordOf('el bosque natal')).toBe('Récord: 3 h, en 2 partidas');
    toggle('Sin lluvia');
    expect(recordOf('el bosque natal')).toBe('Récord con estos votos: 1 h, en 1 partida');
    expect(recordOf('la taiga')).toBe('Aún sin récord con estos votos');
    toggle('Sin mutaciones');
    expect(recordOf('el bosque natal')).toBe('Aún sin récord con estos votos');
    toggle('Sin lluvia');
    toggle('Sin mutaciones');
    expect(recordOf('el bosque natal')).toBe('Récord: 3 h, en 2 partidas');
    expect(recordOf('la taiga')).toBe('Aún sin récord');
  });

  it('los votos vigentes se dicen bajo el progreso, cada uno con su botón de romper', () => {
    const store = createStore(sownIn('prairie', SOWN_AT, ['noRain', 'noMutations']));
    const wind = mount(createWindSection(store));
    const now = wind.root.querySelector('.wind__vowsnow');
    expect(visible(now)).toBe(true);
    expect(now?.textContent).toBe('Votos de este ciclo: sin lluvia y sin mutaciones.');
    const breaks = () =>
      Array.from(wind.root.querySelectorAll<HTMLButtonElement>('.wind__break'))
        .filter((b) => visible(b))
        .map((b) => b.textContent);
    expect(breaks()).toEqual(['Romper el voto «sin lluvia»', 'Romper el voto «sin mutaciones»']);
    // El estado del ciclo recibe el foco cuando no queda ningún voto que romper.
    expect(wind.root.querySelector('#wind-status')?.getAttribute('tabindex')).toBe('-1');
    store.dispatch(renounceVow, { vow: 'noRain' });
    wind.update();
    expect(breaks()).toEqual(['Romper el voto «sin mutaciones»']);
    store.dispatch(renounceVow, { vow: 'noMutations' });
    wind.update();
    expect(breaks()).toEqual([]);
    expect(visible(wind.root.querySelector('.wind__vowsnow'))).toBe(false);
  });
});

describe('«solo autocompra» en las pestañas (fase 10)', () => {
  function autoOnly(): Store {
    const s = sownIn('taiga', SOWN_AT, ['autoOnly']);
    s.owned.hypha = 25;
    s.nutrients = 1e9;
    invalidate(s);
    return createStore(s);
  }

  it('Generadores: comprar queda bloqueado con su motivo y los interruptores, encendidos y bloqueados', () => {
    const store = autoOnly();
    const tab = mount(createGeneratorsTab(store));
    const reason = tab.root.querySelector('#gen-vow-locked');
    expect(visible(reason)).toBe(true);
    expect(reason?.textContent).toBe('Voto «solo autocompra»: la red compra sola.');
    const buy = tab.root.querySelector<HTMLButtonElement>('.gen__buy');
    expect(buy?.getAttribute('aria-disabled')).toBe('true');
    expect(buy?.getAttribute('aria-describedby')).toContain('gen-vow-locked');
    buy?.click();
    expect(store.state.owned.hypha).toBe(25);
    const auto = tab.root.querySelector<HTMLButtonElement>('.gen__auto');
    expect(visible(auto)).toBe(true);
    expect(auto?.getAttribute('aria-pressed')).toBe('true');
    expect(auto?.getAttribute('aria-disabled')).toBe('true');
    auto?.click();
    expect(store.state.autobuy.generators.hypha).toBe(false);
    expect(document.getElementById(auto?.getAttribute('aria-describedby') ?? '')?.textContent).toContain(
      'la red lo compra todo',
    );
  });

  it('Generadores: con la Poda, el modo «lo que antes se amortiza» queda bloqueado con su motivo', () => {
    const store = autoOnly();
    const plasmodium = createPlasmodium(1);
    Object.assign(plasmodium.plates[0] ?? {}, {
      map: { score: 3, quality: 0.8, cost: 1, tolerance: 1, alive: 9, joined: 4 },
    });
    store.state.partners.plasmodium = plasmodium;
    store.state.autobuy.mode = 'payback';
    const tab = mount(createGeneratorsTab(store));
    const [threshold, payback] = Array.from(
      tab.root.querySelectorAll<HTMLButtonElement>('.autobuy__mode button'),
    );
    expect(threshold?.getAttribute('aria-pressed')).toBe('true');
    expect(payback?.getAttribute('aria-pressed')).toBe('false');
    expect(payback?.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(payback?.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Con el voto «solo autocompra», la Poda no rige: la red compra por umbral.',
    );
    payback?.click();
    expect(store.state.autobuy.mode).toBe('payback');
    // El umbral rige, así que se ve y se puede cambiar.
    expect(visible(tab.root.querySelector('.autobuy__text'))).toBe(true);
  });

  it('Mejoras: las tarjetas no se compran y la autocompra de mejoras se ve encendida y bloqueada', () => {
    const store = autoOnly();
    const tab = mount(createUpgradesTab(store));
    const card = tab.root.querySelector<HTMLButtonElement>('.upg');
    expect(card?.getAttribute('aria-disabled')).toBe('true');
    expect(card?.getAttribute('aria-describedby')).toContain('upg-vow-locked');
    card?.click();
    expect(store.state.upgrades).toEqual([]);
    const toggle = tab.root.querySelector<HTMLButtonElement>('.tab__toolbar .toggle');
    expect(visible(toggle)).toBe(true);
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(toggle?.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('«sin mutaciones» en las pestañas (fase 10)', () => {
  function asleep(): GameState {
    const s = sownIn('natal', SOWN_AT, ['noMutations']);
    reachLevel(s, 4, CYCLE_NOW + 61 * HOUR);
    s.seen.push('gen.planetary.full');
    drain();
    return s;
  }

  it('la fila de la Red planetaria sigue en la lista, dormida, con su motivo y sin poder comprarse', () => {
    const store = createStore(asleep());
    const tab = mount(createGeneratorsTab(store));
    const rows = Array.from(tab.root.querySelectorAll<HTMLElement>('.gen'));
    const planetary = rows.at(-1);
    expect(visible(planetary ?? null)).toBe(true);
    const reason = planetary?.querySelector('.gen__asleep');
    expect(visible(reason ?? null)).toBe(true);
    expect(reason?.textContent).toBe('Duerme con «Más allá del bosque»: despiértala en Mutaciones.');
    const buy = planetary?.querySelector('.gen__buy');
    expect(buy?.getAttribute('aria-disabled')).toBe('true');
    expect(buy?.getAttribute('aria-describedby')).toContain(reason?.id ?? '-');
  });

  it('el árbol duerme: atenuado, «dormida» en su nombre, «Despertar» donde se puede y las esporas del ciclo encima', () => {
    const store = createStore(asleep());
    const tab = mount(createMutationsTab(store));
    expect(tab.root.querySelector('.mut__budget')?.textContent).toBe(
      'Esporas de este ciclo para despertar: 4',
    );
    const node = (name: string) =>
      Array.from(tab.root.querySelectorAll<HTMLButtonElement>('.mut')).find((b) =>
        b.querySelector('.mut__name')?.textContent.startsWith(name),
      );
    const soil = node('Memoria del suelo');
    expect(soil?.dataset.state).toBe('asleep');
    expect(soil?.getAttribute('aria-label')).toBe('Despertar: Memoria del suelo');
    expect(soil?.getAttribute('aria-disabled')).toBe('false');
    const chitin = node('Quitina ligera');
    expect(chitin?.dataset.state).toBe('asleep');
    expect(chitin?.getAttribute('aria-label')).toBe('Quitina ligera, dormida');
    expect(chitin?.getAttribute('aria-disabled')).toBe('true');
    expect(chitin?.querySelector('.mut__requires')?.textContent).toBe('Despierta antes: Memoria del suelo');
    expect(chitin?.querySelector('.mut__status')?.textContent).toBe('Dormida');
    // Despertar con el mismo nodo: la Quitina ya se puede despertar y quedan 3 esporas del ciclo.
    soil?.click();
    tab.update();
    expect(store.state.cycle.woken).toEqual(['soilMemory']);
    expect(soil?.dataset.state).toBe('owned');
    expect(chitin?.getAttribute('aria-label')).toBe('Despertar: Quitina ligera');
    expect(tab.root.querySelector('.mut__budget')?.textContent).toBe(
      'Esporas de este ciclo para despertar: 3',
    );
    // Sin el voto no hay nada que despertar ni línea de esporas del ciclo.
    store.dispatch(renounceVow, { vow: 'noMutations' });
    tab.update();
    expect(visible(tab.root.querySelector('.mut__budget'))).toBe(false);
    expect(chitin?.dataset.state).toBe('owned');
  });
});

describe('Estadísticas con votos (fase 10)', () => {
  it('«Votos de este ciclo» es un número, y solo con un ciclo empezado', () => {
    const value = (store: Store): string | null => {
      const tab = mount(createStatsTab(store));
      const label = Array.from(tab.root.querySelectorAll('dt')).find(
        (dt) => dt.textContent === 'Votos de este ciclo',
      );
      return label && visible(label) ? (label.nextElementSibling?.textContent ?? null) : null;
    };
    expect(value(createStore(returnClosed()))).toBeNull();
    expect(value(createStore(sownIn('taiga', SOWN_AT, ['noRain', 'autoOnly'])))).toBe('2');
  });
});

describe('récords con votos en la Crónica (fase 10)', () => {
  it('cada récord dice sus votos junto al bioma, tras el de sin votos del mismo bioma', () => {
    const nav: ChapterNav = {
      toWind: () => undefined,
      toAdaptations: () => undefined,
      toCore: () => undefined,
      toPartner: () => undefined,
    };
    const s = sownIn('natal', SOWN_AT, ['noRain', 'noMutations']);
    reachLevel(s, 520, CYCLE_NOW + 62 * HOUR);
    disperse(s, { to: 'natal', now: CYCLE_NOW + 63 * HOUR });
    reachLevel(s, 520, CYCLE_NOW + 65 * HOUR);
    drain();
    const tab = mount(createChronicleTab(createStore(s), nav));
    const places = Array.from(
      tab.root.querySelectorAll('ul.chronicle__records > li .chronicle__record-place'),
    );
    expect(places.map((p) => p.textContent)).toEqual([
      'Bosque natal',
      'Bosque natal · sin lluvia y sin mutaciones',
    ]);
  });
});

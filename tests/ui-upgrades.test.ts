// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState } from '../src/core/state.ts';
import { createStore, type Store } from '../src/ui/store.ts';
import { createUpgradesTab } from '../src/ui/tab-upgrades.ts';
import type { TabView } from '../src/ui/tabs.ts';

let tab: TabView | null = null;

afterEach(() => {
  tab?.destroy();
  tab = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Pestaña con las tres mejoras de la Hifa (con 25 Hifas) y nutrientes para todas. */
function mount(): { store: Store; view: TabView } {
  const state = createState(3, Date.UTC(2026, 9, 1));
  // Con 1 Hifa aparece «Quitina flexible» (100 N); con 25 Hifas, también las de 10 y 25.
  state.owned.hypha = 25;
  state.nutrients = 1e6;
  const store = createStore(state);
  const view = createUpgradesTab(store);
  document.body.append(view.root);
  view.update();
  tab = view;
  return { store, view };
}

const items = (view: TabView): HTMLLIElement[] => Array.from(view.root.querySelectorAll('.upg-item'));

describe('pestaña Mejoras con teclado', () => {
  // BUG-JOURNAL #5: al comprar con Enter, la lista se rehacía y el foco caía en <body>.
  it('tras comprar una mejora, el foco sigue en una tarjeta de la lista', () => {
    const { store, view } = mount();
    const first = view.root.querySelector<HTMLButtonElement>('.upg');
    expect(first).not.toBeNull();
    first?.focus();
    expect(document.activeElement).toBe(first);
    first?.click();
    view.update();

    expect(store.state.upgrades).toHaveLength(1);
    const active = document.activeElement;
    expect(active).not.toBe(document.body);
    expect(active instanceof HTMLButtonElement && active.classList.contains('upg')).toBe(true);
    // Es la que venía detrás, no la comprada, que ya no se puede pulsar.
    expect(active).toBe(items(view)[1]?.querySelector('.upg'));
  });
});

describe('comprar sin que la lista salte (BUG-JOURNAL #21)', () => {
  it('la recién comprada se queda en su sitio como «Comprada», sin poder pulsarse, y luego se pliega', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { store, view } = mount();
    const [first, second] = items(view);
    first?.querySelector<HTMLButtonElement>('.upg')?.click();
    view.update();

    expect(items(view)).toEqual([first, second, items(view)[2]]);
    expect(first?.classList.contains('is-bought')).toBe(true);
    expect(first?.inert).toBe(true);
    expect(first?.querySelector('.upg__cost')?.textContent).toBe('Comprada');
    // Alto de la tarjeta y ancho del precio fijados: «Comprada» no mide lo que el coste.
    expect(first?.style.height).not.toBe('');
    expect(first?.querySelector<HTMLElement>('.upg__price')?.style.minWidth).not.toBe('');
    // Un segundo toque en el mismo sitio no compra nada.
    first?.querySelector<HTMLButtonElement>('.upg')?.click();
    view.update();
    expect(store.state.upgrades).toHaveLength(1);

    vi.advanceTimersByTime(900);
    expect(first?.classList.contains('is-collapsed')).toBe(true);
    expect(first?.isConnected).toBe(true);
    vi.advanceTimersByTime(220);
    expect(first?.isConnected).toBe(false);
    expect(items(view)[0]).toBe(second);
  });

  it('las tarjetas que siguen no se rehacen y una mejora nueva entra en su orden de coste', () => {
    const { store, view } = mount();
    const before = items(view);
    // Con 100 N ganados en la partida aparece «Tacto sensible» (500 N), entre la de 100 y la de 1.000.
    store.state.runEarned = 500;
    view.update();
    const after = items(view);
    expect(after).toHaveLength(before.length + 1);
    for (const item of before) expect(after).toContain(item);
    const costs = after.map((li) => Number(li.querySelector('.upg__cost')?.textContent.replace(/\D/g, '')));
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });

  it('una tarjeta nueva se mide para desplegarse con sus textos ya puestos', () => {
    // Medida sin ganancia, coste ni espera, la tarjeta se desplegaba hasta una altura de menos y
    // al terminar daba un salto.
    const { store, view } = mount();
    const measured: string[] = [];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('upg-item'))
        measured.push(this.querySelector('.upg__cost')?.textContent ?? '');
      return new DOMRect(0, 0, 300, 96);
    });
    store.state.runEarned = 500;
    view.update();
    expect(measured.length).toBeGreaterThan(0);
    expect(measured.every((text) => text !== '')).toBe(true);
  });

  it('al comprar con el dedo, el foco pasa a la siguiente sin desplazar la página', () => {
    const { view } = mount();
    const button = items(view)[0]?.querySelector<HTMLButtonElement>('.upg');
    button?.focus();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    button?.click();
    view.update();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('al comprar la última, «No hay mejoras» no aparece encima de la comprada hasta que se pliega', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const state = createState(3, Date.UTC(2026, 9, 1));
    // Con 1 Hifa y 150 N la única mejora es «Quitina flexible» (100 N).
    state.owned.hypha = 1;
    state.nutrients = 150;
    const store = createStore(state);
    const view = createUpgradesTab(store);
    tab = view;
    document.body.append(view.root);
    view.update();
    const empty = view.root.querySelector<HTMLElement>('.tab__intro');
    view.root.querySelector<HTMLButtonElement>('.upg')?.click();
    view.update();
    expect(view.root.querySelector('.is-bought')).not.toBeNull();
    expect(empty?.hidden).toBe(true);
    vi.advanceTimersByTime(1120);
    view.update();
    expect(items(view)).toHaveLength(0);
    expect(empty?.hidden).toBe(false);
  });

  it('al volver a la pestaña, lo que se compró entretanto no aparece como «Comprada»', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { store, view } = mount();
    const first = items(view)[0]?.querySelector<HTMLButtonElement>('.upg');
    first?.click();
    // La pestaña no se refresca mientras no se ve: el siguiente refresco llega mucho después.
    now = 60_000;
    view.update();
    expect(store.state.upgrades).toHaveLength(1);
    expect(items(view)).toHaveLength(2);
    expect(view.root.querySelector('.is-bought')).toBeNull();
  });
});

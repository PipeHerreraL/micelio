// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { drain } from '../src/core/events.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { PLATES } from '../src/data/plasmodium-plates.ts';
import { setLocale } from '../src/i18n/index.ts';
import { providePartnerCatalog } from '../src/i18n/partners/index.ts';
import { plasmodiumEs } from '../src/i18n/partners/plasmodium.es.ts';
import { stepSecond } from '../src/partners/plasmodium/advance.ts';
import type { PlateSnapshot } from '../src/partners/plasmodium/metrics.ts';
import { plasmodiumRuntime } from '../src/partners/plasmodium/plasmodium-runtime.ts';
import {
  createPlasmodium,
  spreadConductivity,
  startHabituation,
  type PlasmodiumState,
} from '../src/partners/plasmodium/state.ts';
import { computeLayout } from '../src/partners/plasmodium/view/plate-layout.ts';
import { createPartnerView } from '../src/partners/plasmodium/view/plasmodium-view.ts';
import { createPlateSites } from '../src/partners/plasmodium/view/plate-sites.ts';
import { registerPartnerRuntime, unregisterPartnerRuntime } from '../src/partners/registry.ts';
import { isTabAvailable } from '../src/ui/app.ts';
import { h } from '../src/ui/dom.ts';
import { closeModal, isModalOpen } from '../src/ui/modal.ts';
import { markPartnerFailed } from '../src/ui/partner-loader.ts';
import type { PartnerView } from '../src/ui/partner-view.ts';
import { createStore, type Store } from '../src/ui/store.ts';
import { createPartnersTab } from '../src/ui/tab-partners.ts';

/**
 * Interfaz del plasmodio sin navegador (fase 9): la pestaña Socios, los sitios de la placa como
 * botones, el teclado, el objetivo en texto y la lista. El lienzo no tiene contexto en happy-dom:
 * todo lo que dice está también en el DOM.
 */

/**
 * La medida de la red pasa tal cual salvo cuando una prueba la retoca: así se ve lo que la vista
 * escribe con una calidad o una longitud concretas (0,6588, 1,104) sin depender de que el modelo
 * llegue justo ahí.
 */
const measureHook = vi.hoisted(() => ({
  patch: null as null | (() => Partial<PlateSnapshot>),
}));
vi.mock('../src/partners/plasmodium/metrics.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/partners/plasmodium/metrics.ts')>();
  return {
    ...real,
    measure: (p: Parameters<typeof real.measure>[0]): PlateSnapshot => {
      const snap = real.measure(p);
      return measureHook.patch ? { ...snap, ...measureHook.patch() } : snap;
    },
  };
});

const NOW = Date.UTC(2026, 9, 1);
const MAP = { score: 2, quality: 0.7, cost: 1.2, tolerance: 0.8, alive: 9, joined: 3 };

// happy-dom no mide: el panel «mide» 480 px de ancho para que la placa se disponga.
const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
let panelWidth = 480;
beforeAll(() => {
  setLocale('es');
  providePartnerCatalog('plasmodium', 'es', plasmodiumEs);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => panelWidth,
  });
});
afterAll(() => {
  if (widthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor);
});
beforeEach(() => {
  registerPartnerRuntime(plasmodiumRuntime);
  drain();
});
afterEach(() => {
  if (isModalOpen()) closeModal();
  document.body.replaceChildren();
  unregisterPartnerRuntime('plasmodium');
  // La vista recuerda «ver como lista» en localStorage: cada prueba empieza con la placa.
  localStorage.clear();
  drain();
  measureHook.patch = null;
  panelWidth = 480;
  document.documentElement.style.removeProperty('--hud-h');
  setViewport(1024, 768);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Tamaño de la ventana en happy-dom (por defecto, 1024 × 768). */
function setViewport(width: number, height: number): void {
  (
    window as unknown as { happyDOM: { setViewport(size: { width: number; height: number }): void } }
  ).happyDOM.setViewport({
    width,
    height,
  });
}

/**
 * happy-dom no avisa de cambios de tamaño: el observador de la vista se guarda y la prueba lo
 * dispara cuando «cambia» el ancho del panel.
 */
function captureResizeObserver(): { fire(): void } {
  const callbacks: (() => void)[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe(): void {
        // Nada: la prueba llama a fire().
      }
      disconnect(): void {
        // Nada que soltar.
      }
    },
  );
  return {
    fire() {
      for (const callback of callbacks) callback();
    },
  };
}

function withPlasmodium(plate = 0): { store: Store; p: PlasmodiumState } {
  const state: GameState = createState(3, NOW);
  const p = createPlasmodium(5);
  for (let i = 0; i < plate; i += 1) Object.assign(p.plates[i] ?? {}, { map: { ...MAP } });
  p.plate = plate;
  p.conductivity = spreadConductivity(p, plate);
  p.habituation = startHabituation(plate);
  state.partners.plasmodium = p;
  return { store: createStore(state), p };
}

/** Monta la vista en un panel de pestaña; `panelHeight` simula el alto de `.tabs__panels`. */
function mountView(store: Store, panelHeight?: number): PartnerView {
  const view = createPartnerView(store, {
    reducedMotion: true,
    toAchievements: () => undefined,
    rereadPlate: () => undefined,
  });
  const section = h('section', { attrs: { role: 'tabpanel', tabindex: 0 } }, [view.root]);
  if (panelHeight === undefined) document.body.append(section);
  else {
    const panels = h('div', { class: 'tabs__panels' }, [section]);
    Object.defineProperty(panels, 'clientHeight', { configurable: true, get: () => panelHeight });
    document.body.append(panels);
  }
  view.update();
  return view;
}

const siteButtons = (root: HTMLElement): HTMLButtonElement[] =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('.plate__sites .plate__site'));

const buttonByText = (root: HTMLElement, text: string): HTMLButtonElement | undefined =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === text);

/** Texto de cada línea del objetivo y de la información de debajo. */
const goalLines = (root: HTMLElement): string[] =>
  Array.from(
    root.querySelectorAll('.plasmodium__conditions li, .plasmodium__info li'),
    (li) => li.textContent,
  );

/** Un segundo de modelo para la vista, sin correr el modelo (la medida la fija la prueba). */
function tickModel(p: PlasmodiumState, view: PartnerView): void {
  p.step += 1;
  p.stats.modelSeconds += 1;
  view.update();
}

/** El foco no está en <body> ni en un elemento oculto (el navegador lo mandaría a <body>). */
function focusIsVisible(): boolean {
  const active = document.activeElement;
  return active !== null && active !== document.body && active.closest('[hidden]') === null;
}

function key(target: HTMLElement, name: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

describe('pestaña Socios', () => {
  it('aparece al llegar el plasmodio y no antes', () => {
    const state = createState(1, NOW);
    expect(isTabAvailable('partners', state)).toBe(false);
    state.partners.plasmodium = createPlasmodium(1);
    expect(isTabAvailable('partners', state)).toBe(true);
  });

  it('mientras el código no llega dice que está preparando la placa, con aria-busy', () => {
    const { store } = withPlasmodium();
    const tab = createPartnersTab(store, {
      reducedMotion: () => true,
      toAchievements: () => undefined,
      rereadPlate: () => undefined,
      saveAndReload: () => undefined,
    });
    document.body.append(tab.root);
    tab.update();
    const status = tab.root.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(status?.textContent).toBe('Preparando la placa…');
    expect(tab.root.querySelector('#partner-plasmodium-title')).not.toBeNull();
    expect(() => {
      tab.update();
    }).not.toThrow();
    tab.destroy();
  });

  it('si la carga falla, el panel lo dice y ofrece recargar con un botón real', () => {
    const { store } = withPlasmodium();
    let reloads = 0;
    const tab = createPartnersTab(store, {
      reducedMotion: () => true,
      toAchievements: () => undefined,
      rereadPlate: () => undefined,
      saveAndReload: () => {
        reloads += 1;
      },
    });
    document.body.append(tab.root);
    tab.update();
    markPartnerFailed('plasmodium');
    const button = Array.from(tab.root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Recargar la página',
    );
    expect(button).toBeDefined();
    button?.click();
    expect(reloads).toBe(1);
    tab.destroy();
  });
});

describe('placa del plasmodio', () => {
  it('cada sitio es un botón con su contenido y su acción en el nombre accesible', () => {
    const { store } = withPlasmodium();
    const view = mountView(store);
    const buttons = siteButtons(view.root);
    expect(buttons).toHaveLength(PLATES[0]?.x.length ?? 0);
    expect(buttons[6]?.getAttribute('aria-label')).toBe('Sitio 7, vacío: poner un copo de avena');
    view.destroy();
  });

  it('los copos de la placa llevan aria-disabled y siguen enfocables', () => {
    const { store } = withPlasmodium(1);
    const view = mountView(store);
    const first = siteButtons(view.root)[0];
    expect(first?.getAttribute('aria-label')).toBe(
      'Sitio 1, copo de la placa: es de la placa y no se puede cambiar',
    );
    expect(first?.getAttribute('aria-disabled')).toBe('true');
    expect(first?.disabled).toBe(false);
    view.destroy();
  });

  it('solo un sitio se alcanza con Tab y las flechas mueven el foco al vecino en esa dirección', () => {
    const { store } = withPlasmodium(1);
    const view = mountView(store);
    const buttons = siteButtons(view.root);
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    // Laberinto 7×4: el sitio 1 está a la izquierda del 2 y encima del 8.
    buttons[0]?.focus();
    key(buttons[0] as HTMLElement, 'ArrowRight');
    expect(document.activeElement).toBe(buttons[1]);
    key(buttons[1] as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(buttons[8]);
    expect(buttons.filter((b) => b.tabIndex === 0)).toEqual([buttons[8]]);
    view.destroy();
  });

  it('1, 2 y 3 cambian de herramienta solo con el foco en la placa', () => {
    const { store, p } = withPlasmodium();
    p.upgrades.lamps = 1;
    const view = mountView(store);
    const tools = Array.from(view.root.querySelectorAll<HTMLButtonElement>('.plasmodium__tool'));
    key(document.body, '2');
    expect(tools[0]?.getAttribute('aria-pressed')).toBe('true');
    const site = siteButtons(view.root)[0];
    site?.focus();
    key(site as HTMLElement, '2');
    expect(tools[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(site?.getAttribute('aria-label')).toBe('Sitio 1, vacío: poner una lámpara');
    view.destroy();
  });

  it('poner un copo actualiza el nombre sin recrear el botón: el foco se queda', () => {
    const { store, p } = withPlasmodium();
    const view = mountView(store);
    const button = siteButtons(view.root)[6];
    button?.focus();
    button?.click();
    view.update();
    expect(p.plates[0]?.foods).toEqual([6]);
    expect(siteButtons(view.root)[6]).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button?.getAttribute('aria-label')).toBe('Sitio 7, copo de avena: quitar');
    view.destroy();
  });

  it('el objetivo se lee en texto con «cumple» o «falta» en cada condición', () => {
    const { store, p } = withPlasmodium();
    Object.assign(p.plates[0] ?? {}, { foods: [7, 1, 16, 18] });
    for (let i = 0; i < 300; i += 1) stepSecond(p);
    drain();
    const view = mountView(store);
    const lines = Array.from(view.root.querySelectorAll('.plasmodium__condition'), (li) => li.textContent);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).toMatch(/ · (cumple|falta)$/);
    expect(lines[0]).toBe('Copos en la placa: 4 (objetivo: 4 o más) · cumple');
    view.destroy();
  });

  it('«Extender de nuevo» pide confirmación en el sitio y «Cancelar» la retira', () => {
    const { store, p } = withPlasmodium();
    const view = mountView(store);
    p.conductivity = p.conductivity.map(() => 0.02);
    const button = Array.from(view.root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === 'Extender de nuevo',
    );
    button?.click();
    expect(button?.textContent).toBe('Confirmar: extender de nuevo');
    expect(Math.max(...p.conductivity)).toBe(0.02);
    const cancel = Array.from(view.root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === 'Cancelar',
    );
    expect(cancel?.hidden).toBe(false);
    cancel?.click();
    expect(button?.textContent).toBe('Extender de nuevo');
    button?.click();
    button?.click();
    expect(Math.min(...p.conductivity)).toBeGreaterThan(0.9);
    view.destroy();
  });

  it('la lista tiene una fila por sitio y su botón hace lo mismo que el de la placa', () => {
    const { store, p } = withPlasmodium();
    const view = mountView(store);
    const listToggle = Array.from(view.root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === 'Ver como lista',
    );
    listToggle?.click();
    const rows = view.root.querySelectorAll('.plate__list .plate__row');
    expect(rows).toHaveLength(PLATES[0]?.x.length ?? 0);
    expect(rows[6]?.textContent).toContain('Sitio 7 · fila');
    rows[6]?.querySelector('button')?.click();
    expect(p.plates[0]?.foods).toEqual([6]);
    view.destroy();
  });

  it('la placa que se abre sola no deja el foco en body', () => {
    const { store, p } = withPlasmodium();
    Object.assign(p.plates[0] ?? {}, { map: { ...MAP } });
    p.lingerFor = 1;
    const view = mountView(store);
    siteButtons(view.root)[3]?.focus();
    stepSecond(p);
    expect(p.plate).toBe(1);
    view.update();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.classList.contains('plate__site')).toBe(true);
    view.destroy();
  });

  it('una mejora al máximo conserva su botón con aria-disabled', () => {
    const { store, p } = withPlasmodium();
    p.upgrades.oats = 3;
    const view = mountView(store);
    const row = Array.from(view.root.querySelectorAll('.plasmodium__upg')).find((li) =>
      li.textContent.includes('Avena'),
    );
    const button = row?.querySelector('button');
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(button?.textContent).toBe('Al máximo');
    view.destroy();
  });
});

describe('objetivo: lo que se ve no contradice a la decisión', () => {
  it('una calidad de 0,6588 se lee «0,65 … falta» y no «0,66 … falta»', () => {
    const { store } = withPlasmodium();
    measureHook.patch = () => ({ quality: 0.6588 });
    const view = mountView(store);
    expect(goalLines(view.root)).toContain('Calidad de la red: 0,65 (objetivo: 0,66 o más) · falta');
    view.destroy();
  });

  it('una calidad igual al umbral se lee igual al umbral y cumple, también con 0,58 (0,58 × 100 = 57,99…)', () => {
    const { store } = withPlasmodium();
    measureHook.patch = () => ({ quality: 0.66 });
    const view = mountView(store);
    expect(goalLines(view.root)).toContain('Calidad de la red: 0,66 (objetivo: 0,66 o más) · cumple');
    view.destroy();
    const bridge = withPlasmodium(3);
    measureHook.patch = () => ({ quality: 0.58 });
    const bridgeView = mountView(bridge.store);
    expect(goalLines(bridgeView.root)).toContain('Calidad de la red: 0,58 (objetivo: 0,58 o más) · cumple');
    bridgeView.destroy();
  });

  it('en el Laberinto una longitud de 1,104 se lee «1,11 … falta», con el objetivo a dos decimales', () => {
    const { store } = withPlasmodium(1);
    measureHook.patch = () => ({ cost: 1.104, joined: 2 });
    const view = mountView(store);
    const lines = goalLines(view.root);
    expect(lines).toContain('Longitud: 1,11 veces el camino más corto (objetivo: 1,10 o menos) · falta');
    // El coste es la misma cifra que la longitud: no puede leerse «1,10» dos líneas más abajo.
    expect(lines).toContain('Coste: 1,11 veces el árbol mínimo');
    view.destroy();
  });

  it('en la Fusión, «fundidos» solo aparece tras 10 s fundidos, también después de la primera vez', () => {
    const { store, p } = withPlasmodium(4);
    let fused = false;
    measureHook.patch = () => ({ fused });
    const view = mountView(store);
    for (let s = 0; s < 12; s += 1) tickModel(p, view);
    expect(goalLines(view.root)).toContain('Los dos plasmodios aún están separados');
    // Se funden 1 s y se separan 5 s, tres veces: el texto no se mueve.
    for (let cycle = 0; cycle < 3; cycle += 1) {
      fused = true;
      tickModel(p, view);
      expect(goalLines(view.root)).toContain('Los dos plasmodios aún están separados');
      fused = false;
      for (let s = 0; s < 5; s += 1) tickModel(p, view);
    }
    expect(goalLines(view.root)).toContain('Los dos plasmodios aún están separados');
    // Fundidos de verdad: 9 s después del cambio aún no; a los 10 s, sí.
    fused = true;
    for (let s = 0; s < 10; s += 1) tickModel(p, view);
    expect(goalLines(view.root)).toContain('Los dos plasmodios aún están separados');
    tickModel(p, view);
    expect(goalLines(view.root)).toContain('Los dos plasmodios están fundidos');
    view.destroy();
  });
});

describe('Atlas y logros del plasmodio', () => {
  it('«En cultivo» del Atlas sube al comprar Agar nutritivo', () => {
    const { store, p } = withPlasmodium(2);
    const view = mountView(store);
    const culture = (): string[] =>
      Array.from(
        view.root.querySelectorAll('.plasmodium__atlas .plasmodium__note'),
        (n) => n.textContent,
      ).filter((text) => text.startsWith('En cultivo'));
    // Tronco: 1 × 2 (puntuación del mapa); Laberinto: 10 × 2.
    expect(culture()).toEqual([
      'En cultivo: +2 de Rastro por segundo',
      'En cultivo: +20 de Rastro por segundo',
    ]);
    p.upgrades.agar = 2;
    view.update();
    // × 1,5² = × 2,25.
    expect(culture()).toEqual([
      'En cultivo: +4,5 de Rastro por segundo',
      'En cultivo: +45 de Rastro por segundo',
    ]);
    view.destroy();
  });

  it('Socios cuenta los 8 logros del plasmodio, también el secreto aún sin ganar, como Logros', () => {
    const { store } = withPlasmodium();
    const view = mountView(store);
    expect(view.root.querySelector('.plasmodium__achievements span')?.textContent).toBe(
      'Logros del plasmodio: 0 de 8',
    );
    view.destroy();
  });
});

describe('placa del plasmodio: el foco nunca cae en <body>', () => {
  it('«Cancelar» de «Extender de nuevo» se retira a los 8 s y el foco pasa al botón que queda', () => {
    vi.useFakeTimers();
    const { store } = withPlasmodium();
    const view = mountView(store);
    const respread = buttonByText(view.root, 'Extender de nuevo');
    respread?.focus();
    respread?.click();
    const cancel = buttonByText(view.root, 'Cancelar');
    cancel?.focus();
    expect(document.activeElement).toBe(cancel);
    vi.advanceTimersByTime(8000);
    expect(cancel?.hidden).toBe(true);
    expect(focusIsVisible()).toBe(true);
    expect(document.activeElement).toBe(respread);
    expect(respread?.textContent).toBe('Extender de nuevo');
    view.destroy();
  });

  it('si la placa se abre sola con el foco en «Preparar la placa», el foco pasa al título', () => {
    const { store, p } = withPlasmodium();
    Object.assign(p.plates[0] ?? {}, { map: { ...MAP } });
    p.lingerFor = 1;
    const view = mountView(store);
    const prepare = buttonByText(view.root, 'Preparar la placa: Laberinto');
    expect(prepare?.hidden).toBe(false);
    prepare?.focus();
    stepSecond(p);
    expect(p.plate).toBe(1);
    view.update();
    expect(prepare?.hidden).toBe(true);
    expect(focusIsVisible()).toBe(true);
    expect(document.activeElement?.id).toBe('partner-plasmodium-title');
    view.destroy();
  });

  it('al pasar a la lista con el foco en un sitio, el foco entra en la lista ya visible', () => {
    const resize = captureResizeObserver();
    const { store } = withPlasmodium(2);
    const view = mountView(store);
    const list = view.root.querySelector<HTMLElement>('.plate__list');
    expect(list?.hidden).toBe(true);
    siteButtons(view.root)[0]?.focus();
    // El navegador no deja enfocar dentro de un elemento oculto: se anota cómo estaba la lista.
    let listHiddenOnFocus: HTMLElement['hidden'] | null = null;
    list?.addEventListener('focusin', () => {
      listHiddenOnFocus = list.hidden;
    });
    // El Archipiélago pide celdas de 76 px: en 300 px no cabe en ninguna orientación.
    panelWidth = 300;
    resize.fire();
    expect(list?.hidden).toBe(false);
    expect(listHiddenOnFocus).toBe(false);
    expect(document.activeElement?.classList.contains('plate__row-button')).toBe(true);
    view.destroy();
  });

  it('al cerrar la placa ampliada, si «Ampliar» ya no sirve, el foco va al título', async () => {
    panelWidth = 394;
    const { store } = withPlasmodium();
    const view = mountView(store);
    const expand = buttonByText(view.root, 'Ampliar la placa');
    expect(expand?.hidden).toBe(false);
    expand?.click();
    expect(isModalOpen()).toBe(true);
    // Mientras está ampliada el panel se ensancha: el Tronco ya cabe a 96 px y ampliar no sirve.
    panelWidth = 480;
    closeModal();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(expand?.hidden).toBe(true);
    expect(focusIsVisible()).toBe(true);
    expect(document.activeElement?.id).toBe('partner-plasmodium-title');
    view.destroy();
  });
});

describe('placa del plasmodio: disposición', () => {
  it('«Ampliar» se ofrece si en el panel la placa va en lista y ampliada se juega', () => {
    // 1280 × 760 de verdad: panel de 394 px de ancho y 575 de alto. El Archipiélago no cabe con
    // sitios de 76 px (455 / 6 = 75,8) y ampliado sí (celda de 96 px).
    panelWidth = 394;
    const { store } = withPlasmodium(2);
    const view = mountView(store, 575);
    expect(view.root.querySelector<HTMLElement>('.plate__list')?.hidden).toBe(false);
    expect(buttonByText(view.root, 'Ampliar la placa')?.hidden).toBe(false);
    view.destroy();
  });

  it('la placa ampliada se dispone con el ancho que le deja el diálogo, no con el de la ventana', async () => {
    // En una ventana de 700 px el diálogo mide 700 − 2 × 16 = 668 y, sin 2 × 24 de relleno ni 2 de
    // borde, deja 618 a la placa. El Puente (7 × 4) cabe apaisado: celda 618 / 7.
    setViewport(700, 900);
    panelWidth = 300;
    const { store } = withPlasmodium(3);
    const view = mountView(store);
    const frame = view.root.querySelector<HTMLElement>('.plate__frame');
    buttonByText(view.root, 'Ampliar la placa')?.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(frame?.closest('dialog')).not.toBeNull();
    expect(frame?.style.width).toBe('618px');
    view.destroy();
  });

  it('en el móvil la placa se mide bajo la cabecera real (--hud-h), no bajo 64 px fijos', () => {
    setViewport(480, 500);
    document.documentElement.style.setProperty('--hud-h', '107px');
    const { store } = withPlasmodium();
    const view = mountView(store);
    // (500 − 107 de cabecera − 72 de pestañas − 24) / 4 filas = 74,25 px de celda; × 5 columnas.
    expect(view.root.querySelector<HTMLElement>('.plate__frame')?.style.width).toBe('371.25px');
    view.destroy();
  });

  it('si la cabecera del móvil cambia de alto con la placa ya dibujada, la celda se vuelve a medir', () => {
    setViewport(480, 500);
    const { store } = withPlasmodium();
    const view = mountView(store);
    const frame = view.root.querySelector<HTMLElement>('.plate__frame');
    // Sin --hud-h todavía: (500 − 64 − 72 − 24) / 4 = 85 px; × 5 columnas.
    expect(frame?.style.width).toBe('425px');
    document.documentElement.style.setProperty('--hud-h', '107px');
    view.update();
    expect(frame?.style.width).toBe('371.25px');
    view.destroy();
  });

  it('en la lista con el lienzo girado, «fila, columna» es la posición en la imagen que se ve', () => {
    const { p } = withPlasmodium(2);
    const sites = createPlateSites({
      activate: () => undefined,
      setTool: () => undefined,
      hover: () => undefined,
    });
    const layout = computeLayout(2, 300, 300);
    expect(layout).toMatchObject({ list: true, orientation: 'portrait' });
    sites.build(layout, 'ayuda');
    sites.update(p, 'food', null);
    const rows = Array.from(sites.list.querySelectorAll('.plate__row-text'), (r) => r.textContent);
    // Sitio 1 (x 0,603; y 0,671): girado, arriba a la derecha de una imagen de 4 columnas.
    expect(rows[0]).toMatch(/^Sitio 1 · fila 1, columna 4 · /);
    // Sitio 19 (x 0,475; y 3,32): girado, arriba a la izquierda.
    expect(rows[18]).toMatch(/^Sitio 19 · fila 1, columna 1 · /);
    // Sitio 24 (x 5,443; y 3,469): abajo a la izquierda, fila 6 de 6.
    expect(rows[23]).toMatch(/^Sitio 24 · fila 6, columna 1 · /);
    sites.destroy();
  });
});

describe('placa ampliada: avisos en su propia región', () => {
  it('cumplir y perder el objetivo se dicen dentro del diálogo, con el estado vigente y como mucho uno cada 10 s', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    panelWidth = 394;
    const { store, p } = withPlasmodium();
    const view = mountView(store);
    // La región va con la placa: al ampliar se muda al diálogo.
    const local = view.root.querySelector('.plate [aria-live="polite"]');
    buttonByText(view.root, 'Ampliar la placa')?.click();
    expect(isModalOpen()).toBe(true);
    expect(local?.closest('dialog')).not.toBeNull();
    expect(local?.textContent).toBe('');
    p.goalMet = true;
    view.onEvent({ type: 'plasmodium', kind: 'goal', met: true });
    expect(local?.textContent).toBe('El plasmodio cumple el objetivo.');
    // Se pierde a los 4 s: espera al tope y entonces dice el estado de ese momento.
    vi.advanceTimersByTime(4000);
    p.goalMet = false;
    view.onEvent({ type: 'plasmodium', kind: 'goal', met: false });
    expect(local?.textContent).toBe('El plasmodio cumple el objetivo.');
    vi.advanceTimersByTime(6000);
    expect(local?.textContent).toBe('La red dejó de cumplir el objetivo.');
    // Se cumple y se pierde otra vez dentro del tope: al llegar, ya no hay nada nuevo que decir.
    vi.advanceTimersByTime(2000);
    p.goalMet = true;
    view.onEvent({ type: 'plasmodium', kind: 'goal', met: true });
    p.goalMet = false;
    view.onEvent({ type: 'plasmodium', kind: 'goal', met: false });
    vi.advanceTimersByTime(10_000);
    expect(local?.textContent).toBe('La red dejó de cumplir el objetivo.');
    view.destroy();
  });
});

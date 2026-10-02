// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drain } from '../src/core/events.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { PLATES } from '../src/data/plasmodium-plates.ts';
import { setLocale } from '../src/i18n/index.ts';
import { providePartnerCatalog } from '../src/i18n/partners/index.ts';
import { plasmodiumEs } from '../src/i18n/partners/plasmodium.es.ts';
import { stepSecond } from '../src/partners/plasmodium/advance.ts';
import { plasmodiumRuntime } from '../src/partners/plasmodium/plasmodium-runtime.ts';
import {
  createPlasmodium,
  spreadConductivity,
  startHabituation,
  type PlasmodiumState,
} from '../src/partners/plasmodium/state.ts';
import { createPartnerView } from '../src/partners/plasmodium/view/plasmodium-view.ts';
import { registerPartnerRuntime, unregisterPartnerRuntime } from '../src/partners/registry.ts';
import { isTabAvailable } from '../src/ui/app.ts';
import { h } from '../src/ui/dom.ts';
import { markPartnerFailed } from '../src/ui/partner-loader.ts';
import type { PartnerView } from '../src/ui/partner-view.ts';
import { createStore, type Store } from '../src/ui/store.ts';
import { createPartnersTab } from '../src/ui/tab-partners.ts';

/**
 * Interfaz del plasmodio sin navegador (fase 9): la pestaña Socios, los sitios de la placa como
 * botones, el teclado, el objetivo en texto y la lista. El lienzo no tiene contexto en happy-dom:
 * todo lo que dice está también en el DOM.
 */

const NOW = Date.UTC(2026, 9, 1);
const MAP = { score: 2, quality: 0.7, cost: 1.2, tolerance: 0.8, alive: 9, joined: 3 };

// happy-dom no mide: el panel «mide» 480 px de ancho para que la placa se disponga.
const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeAll(() => {
  setLocale('es');
  providePartnerCatalog('plasmodium', 'es', plasmodiumEs);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 480 });
});
afterAll(() => {
  if (widthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor);
});
beforeEach(() => {
  registerPartnerRuntime(plasmodiumRuntime);
  drain();
});
afterEach(() => {
  document.body.replaceChildren();
  unregisterPartnerRuntime('plasmodium');
  // La vista recuerda «ver como lista» en localStorage: cada prueba empieza con la placa.
  localStorage.clear();
  drain();
});

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

function mountView(store: Store): PartnerView {
  const view = createPartnerView(store, {
    reducedMotion: true,
    toAchievements: () => undefined,
    rereadPlate: () => undefined,
  });
  document.body.append(h('section', { attrs: { role: 'tabpanel', tabindex: 0 } }, [view.root]));
  view.update();
  return view;
}

const siteButtons = (root: HTMLElement): HTMLButtonElement[] =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('.plate__sites .plate__site'));

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

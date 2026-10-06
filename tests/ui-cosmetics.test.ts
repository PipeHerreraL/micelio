// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { disperse } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import type { GameState } from '../src/core/state.ts';
import { createAdaptations } from '../src/ui/adaptations.ts';
import { h } from '../src/ui/dom.ts';
import { createStore } from '../src/ui/store.ts';
import { CYCLE_NOW, HOUR, fourthColonized, reachLevel, returnClosed, sownIn } from './cycle-states.ts';

/**
 * Las cosméticas de los votos en la pestaña Mutaciones (fase 10, bloque B), sin navegador: el grupo
 * «De los votos» bajo las Adaptaciones desde El regreso, cada fila cerrada con su motivo hasta tener
 * el récord de su voto, y la compra. Con el teclado y a 375 px se prueban en el navegador
 * (tests/e2e/cycle.spec.ts).
 */

const SOWN_AT = CYCLE_NOW + 60 * HOUR;
const views: { destroy(): void }[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
  drain();
});

function mount(state: GameState): ReturnType<typeof createAdaptations> {
  const view = createAdaptations(createStore(state));
  document.body.append(h('section', { attrs: { role: 'tabpanel', tabindex: 0 } }, [view.root]));
  view.update();
  views.push(view);
  return view;
}

const visible = (el: Element | null): boolean => el !== null && !el.closest('[hidden]');

/** La fila de una adaptación por su nombre visible. */
function row(view: ReturnType<typeof createAdaptations>, name: string): HTMLElement | null {
  const rows = Array.from(view.root.querySelectorAll<HTMLElement>('.adapt__row'));
  return rows.find((r) => r.querySelector('.adapt__name span')?.textContent === name) ?? null;
}

/** Ciclo 2 en la taiga; el primero, en la pradera con «sin lluvia», cumplido con su récord. */
function afterNoRainRecord(): GameState {
  const s = sownIn('prairie', SOWN_AT, ['noRain']);
  reachLevel(s, 520, CYCLE_NOW + 62 * HOUR);
  disperse(s, { to: 'taiga', now: CYCLE_NOW + 63 * HOUR });
  drain();
  s.spores.available = 5000;
  return s;
}

describe('las cosméticas de los votos bajo Adaptaciones (fase 10)', () => {
  it('antes de El regreso no aparecen; cumplido, salen en «De los votos», cerradas con lo que las abre', () => {
    const journey = mount(fourthColonized());
    expect(visible(journey.root)).toBe(true);
    expect(visible(row(journey, 'Esporada'))).toBe(false);
    expect(visible(row(journey, 'Fuego de zorro'))).toBe(true);

    const s = returnClosed();
    s.spores.available = 5000;
    const view = mount(s);
    const titles = Array.from(view.root.querySelectorAll('.badapt__title'))
      .filter((t) => visible(t))
      .map((t) => t.textContent);
    expect(titles).toContain('De los votos');
    const expected = [
      ['Esporada', 'sin lluvia'],
      ['Cordones negros', 'solo autocompra'],
      ['Higróforos', 'sin mutaciones'],
    ];
    for (const [name, vow] of expected) {
      const r = row(view, name ?? '');
      expect(visible(r), name).toBe(true);
      const why = r?.querySelector('.adapt__why');
      expect(visible(why ?? null), name).toBe(true);
      expect(why?.textContent).toBe(`Se abre al cumplir un ciclo sin romper el voto «${vow}».`);
      const button = r?.querySelector('.adapt__buy');
      // Aunque sobren esporas: cerrada no se compra, y el motivo se lee con el botón.
      expect(button?.getAttribute('aria-disabled'), name).toBe('true');
      expect(button?.getAttribute('aria-describedby')?.split(' ')).toContain(why?.id);
      expect(r?.querySelector('.adapt__effect')?.textContent).toBe('Aún sin rangos.');
    }
  });

  it('con el récord de «sin lluvia», la Esporada se compra con su botón, que se queda con el foco, y dice su color', () => {
    const s = afterNoRainRecord();
    const view = mount(s);
    const esporada = row(view, 'Esporada');
    const why = esporada?.querySelector('.adapt__why') ?? null;
    expect(visible(why)).toBe(false);
    const button = esporada?.querySelector<HTMLButtonElement>('.adapt__buy');
    expect(button?.getAttribute('aria-disabled')).toBe('false');
    expect(button?.getAttribute('aria-describedby')).toBe('adapt-sporePrint-effect adapt-sporePrint-cost');
    expect(button?.textContent).toBe('Adaptar: Esporada300 esporas');
    button?.focus();
    button?.click();
    view.update();
    expect(s.adaptations.sporePrint).toBe(1);
    expect(document.activeElement).toBe(button);
    expect(esporada?.querySelector('.adapt__effect')?.textContent).toBe('Esporada rosa.');
    expect(esporada?.querySelector('.adapt__rank')?.textContent).toBe('rango 1 de 3');
    // Las otras dos siguen cerradas: su voto no está en ningún récord.
    for (const name of ['Cordones negros', 'Higróforos']) {
      expect(row(view, name)?.querySelector('.adapt__buy')?.getAttribute('aria-disabled'), name).toBe('true');
    }
  });

  it('cada rango de Higróforos dice cuántos brotan, y Cordones negros, cómo se ven', () => {
    const s = sownIn('natal', SOWN_AT, ['noRain', 'autoOnly', 'noMutations']);
    reachLevel(s, 520, CYCLE_NOW + 62 * HOUR);
    drain();
    s.adaptations.waxcaps = 2;
    s.adaptations.blackCords = 3;
    s.adaptations.sporePrint = 3;
    const view = mount(s);
    expect(row(view, 'Higróforos')?.querySelector('.adapt__effect')?.textContent).toBe(
      '6 higróforos en la superficie.',
    );
    expect(row(view, 'Cordones negros')?.querySelector('.adapt__effect')?.textContent).toBe(
      'Rizomorfos negros con filo claro.',
    );
    // El nombre dice lo que se ve: el púrpura del lienzo está aclarado (render/cosmetics.ts).
    expect(row(view, 'Esporada')?.querySelector('.adapt__effect')?.textContent).toBe('Esporada púrpura.');
    expect(row(view, 'Cordones negros')?.querySelector('.adapt__cost')?.textContent).toBe('Al máximo');
  });
});

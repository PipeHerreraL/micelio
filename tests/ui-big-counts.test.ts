// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createState } from '../src/core/state.ts';
import { setLocale, t } from '../src/i18n/index.ts';
import { createBiomeCaption } from '../src/ui/biome-caption.ts';
import { createStore } from '../src/ui/store.ts';
import { formatRate } from '../src/ui/tab-sporulate.ts';
import { checkActOne } from '../src/systems/journey.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';

/** Cuentas enormes en la interfaz (BUG-JOURNAL #22): con nombre, sin todas sus cifras. */

afterEach(() => {
  setLocale('es');
  document.body.replaceChildren();
});

describe('cuentas enormes', () => {
  it('la línea compacta de la cartela escribe el nivel con nombre y se puede partir entre palabras', () => {
    const state = createState(3, Date.UTC(2026, 9, 1));
    state.mutations = [...MUTATION_IDS];
    state.achievements = ['own.planetary.1'];
    checkActOne(state);
    state.spores.level = 4.41e34;
    const caption = createBiomeCaption(createStore(state));
    caption.update();
    const compact = caption.root.querySelector('.caption__compact')?.textContent ?? '';
    expect(compact).not.toMatch(/\d{1,3}(\.\d{3}){2,}/);
    // La cifra, sin espacios duros: «44,1 mil quintillones» se parte si la cartela es estrecha
    // (móvil). Los del separador y de «nivel» sí lo son, a propósito (BUG-JOURNAL #26).
    const level = compact.slice(compact.indexOf('44,1'));
    expect(level.includes(String.fromCharCode(0xa0))).toBe(false);
    expect(level).toMatch(/^44,1 mil/);
  });

  it('el ritmo de esporas desde el millón va con nombre y, delante de «esporas», con «de»', () => {
    setLocale('es');
    const text = t('sporulate.rate', { value: formatRate(1.2e20, true) });
    expect(text).not.toMatch(/\d{1,3}(\.\d{3}){2,}/);
    expect(text).toMatch(/de esporas por minuto/);
    expect(formatRate(12.345)).toBe('12,3');
  });
});

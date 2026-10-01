// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createState } from '../src/core/state.ts';
import { h } from '../src/ui/dom.ts';
import { createHint, type Hint } from '../src/ui/hint.ts';
import { createStore } from '../src/ui/store.ts';

afterEach(() => {
  document.body.replaceChildren();
});

/** Un aviso dentro de un panel de pestaña enfocable, como lo monta tabs.ts. */
function mountHint(): { hint: Hint; panel: HTMLElement; dismiss: HTMLButtonElement } {
  const store = createStore(createState(3, Date.UTC(2026, 9, 1)));
  const hint = createHint(store, 'hint.upgrades', 'Las mejoras multiplican tu red.');
  const other = h('button', { class: 'other', text: 'Otra cosa', attrs: { type: 'button' } });
  const panel = h('section', { attrs: { role: 'tabpanel', tabindex: 0 } }, [hint.root, other]);
  document.body.append(panel);
  hint.update(true);
  const dismiss = hint.root.querySelector('button');
  if (!dismiss) throw new Error('El aviso no tiene botón para descartarlo');
  return { hint, panel, dismiss };
}

describe('aviso de primera vez con teclado', () => {
  it('al descartarlo con su botón, el foco pasa al panel de la pestaña y no cae en <body>', () => {
    const { hint, panel, dismiss } = mountHint();
    expect(hint.root.hidden).toBe(false);
    dismiss.focus();
    expect(document.activeElement).toBe(dismiss);

    dismiss.click();
    // El siguiente refresco de 10 Hz es el que lo oculta.
    hint.update(true);

    expect(hint.root.hidden).toBe(true);
    expect(document.activeElement).toBe(panel);
    hint.destroy();
  });

  it('si deja de ser relevante con el foco en su botón, el foco también se queda en el panel', () => {
    const { hint, panel, dismiss } = mountHint();
    dismiss.focus();

    hint.update(false);

    expect(hint.root.hidden).toBe(true);
    expect(document.activeElement).toBe(panel);
    hint.destroy();
  });

  it('ocultar el aviso no le roba el foco a otro control del panel', () => {
    const { hint, panel } = mountHint();
    const other = panel.querySelector<HTMLButtonElement>('.other');
    other?.focus();

    hint.update(false);

    expect(hint.root.hidden).toBe(true);
    expect(document.activeElement).toBe(other);
    hint.destroy();
  });
});

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state.ts';
import { createStore } from '../src/ui/store.ts';
import { createUpgradesTab } from '../src/ui/tab-upgrades.ts';

describe('pestaña Mejoras con teclado', () => {
  // BUG-JOURNAL #5: al comprar con Enter, la lista se rehacía y el foco caía en <body>.
  it('tras comprar una mejora, el foco sigue en una tarjeta de la lista', () => {
    const state = createState(3, Date.UTC(2026, 9, 1));
    // Con 1 Hifa aparece «Quitina flexible» (100 N); con 25 Hifas, también las de 10 y 25.
    state.owned.hypha = 25;
    state.nutrients = 1e6;
    const store = createStore(state);
    const tab = createUpgradesTab(store);
    document.body.append(tab.root);
    tab.update();

    const first = tab.root.querySelector<HTMLButtonElement>('.upg');
    expect(first).not.toBeNull();
    first?.focus();
    expect(document.activeElement).toBe(first);
    first?.click();
    tab.update();

    expect(store.state.upgrades).toHaveLength(1);
    const active = document.activeElement;
    expect(active).not.toBe(document.body);
    expect(active instanceof HTMLButtonElement && active.classList.contains('upg')).toBe(true);
    tab.destroy();
    tab.root.remove();
  });
});

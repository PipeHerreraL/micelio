// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { drain } from '../src/core/events.ts';
import { createState } from '../src/core/state.ts';
import { createHud, type Hud } from '../src/ui/hud.ts';
import { createStore } from '../src/ui/store.ts';

/** Núcleo de bolsillo del móvil (BUG-JOURNAL #20). Cuándo aparece lo mide tests/e2e. */

let hud: Hud | null = null;

afterEach(() => {
  hud?.destroy();
  hud = null;
  document.body.replaceChildren();
  drain();
});

function mount(onAbsorb: (button: HTMLButtonElement) => void = () => undefined): Hud {
  const store = createStore(createState(3, Date.UTC(2026, 9, 1)));
  const made = createHud(store, onAbsorb);
  document.body.append(made.counter, made.core, made.dock);
  made.update();
  hud = made;
  return made;
}

describe('núcleo de bolsillo', () => {
  it('absorbe como el núcleo, con su mismo nombre, y los números salen de él solo mientras se ve', () => {
    const pressed: HTMLButtonElement[] = [];
    const h = mount((button) => pressed.push(button));
    expect(h.dock.hidden).toBe(true);
    expect(h.dock.getAttribute('aria-label')).toBe(h.coreButton.getAttribute('aria-label'));
    expect(h.absorbOrigin()).toBe(h.coreButton);

    h.setDockShown(true);
    h.dock.click();
    expect(drain().filter((e) => e.type === 'click')).toHaveLength(1);
    expect(pressed).toEqual([h.dock]);
    expect(h.absorbOrigin()).toBe(h.dock);

    h.setDockShown(false);
    expect(h.dock.hidden).toBe(true);
    expect(h.absorbOrigin()).toBe(h.coreButton);
  });

  it('si se oculta con el foco encima, el foco pasa al núcleo y no cae en <body>', () => {
    const h = mount();
    h.setDockShown(true);
    h.dock.focus();
    expect(document.activeElement).toBe(h.dock);
    h.setDockShown(false);
    expect(document.activeElement).toBe(h.coreButton);
  });
});

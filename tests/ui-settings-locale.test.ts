// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '../src/core/state.ts';
import { createState } from '../src/core/state.ts';
import { setLocale } from '../src/i18n/index.ts';
import { createSettingsTab, type SettingsServices } from '../src/ui/tab-settings.ts';
import { createStore } from '../src/ui/store.ts';

/**
 * El selector de idioma de Ajustes con el inglés llegando aparte (fase 10): mientras llega el
 * catálogo espera, y main.ts (aquí, unos servicios falsos) decide cuándo cambiar.
 */

afterEach(() => {
  setLocale('es');
  document.body.replaceChildren();
});

function mount(saved: Locale | null) {
  const state = createState(3, Date.UTC(2026, 9, 1));
  state.settings.locale = saved;
  let finish = (): void => undefined;
  const changeLocale = vi.fn(
    (_locale: Locale, _focusId: string) =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const services: SettingsServices = {
    rebuild: () => undefined,
    changeLocale,
    replaceGame: () => undefined,
    wipeGame: () => undefined,
    applySound: () => undefined,
    applyMotion: () => undefined,
  };
  const tab = createSettingsTab(createStore(state), services);
  document.body.append(tab.root);
  tab.update();
  const button = (locale: Locale): HTMLButtonElement => {
    const el = document.getElementById(`setting-locale-${locale}`);
    if (!(el instanceof HTMLButtonElement)) throw new Error(`Falta el botón de ${locale}`);
    return el;
  };
  const group = (): HTMLElement => {
    const el = button('es').parentElement;
    if (!el) throw new Error('Falta el selector de idioma');
    return el;
  };
  const arrive = (): void => {
    finish();
  };
  return { tab, changeLocale, button, group, arrive };
}

describe('selector de idioma', () => {
  it('elegir English deja el selector esperando hasta que llega el catálogo, sin pedirlo dos veces', async () => {
    const { tab, changeLocale, button, group, arrive } = mount('es');
    button('en').click();
    expect(changeLocale).toHaveBeenCalledWith('en', 'setting-locale-en');
    expect(group().getAttribute('aria-busy')).toBe('true');
    // Otro toque mientras llega, en cualquiera de los dos, no pide nada más.
    button('en').click();
    button('es').click();
    expect(changeLocale).toHaveBeenCalledTimes(1);
    arrive();
    await vi.waitFor(() => {
      expect(group().hasAttribute('aria-busy')).toBe(false);
    });
    tab.destroy();
  });

  it('con el inglés guardado pero la interfaz en español porque no llegó, elegir English lo reintenta', () => {
    // El arranque no consiguió el catálogo inglés: la partida sigue diciendo «en», la interfaz, «es».
    const { tab, changeLocale, button } = mount('en');
    expect(button('es').getAttribute('aria-pressed')).toBe('true');
    button('en').click();
    expect(changeLocale).toHaveBeenCalledWith('en', 'setting-locale-en');
    tab.destroy();
  });

  it('elegir el idioma que ya está en uso y guardado no hace nada', () => {
    const { tab, changeLocale, button, group } = mount('es');
    button('es').click();
    expect(changeLocale).not.toHaveBeenCalled();
    expect(group().hasAttribute('aria-busy')).toBe(false);
    tab.destroy();
  });
});

/**
 * Ayudas de las pruebas de navegador: preparar una partida guardada antes de que cargue el
 * juego y leer lo que el juego guardó.
 */
import type { Page } from '@playwright/test';
import { createState, type GameState } from '../../src/core/state.ts';
import { SAVE_KEY, SAVE_VERSION } from '../../src/systems/save.ts';

/** Partida nueva con los cambios de `mutate`, lista para sembrarla en localStorage. */
export function stateWith(mutate: (state: GameState) => void, now = Date.now()): GameState {
  const state = createState(12345, now);
  mutate(state);
  return state;
}

/**
 * Siembra un guardado antes de que arranque el juego. Solo la primera carga: si el juego
 * guarda y la página se recarga, se lee lo que guardó el juego, no esta semilla.
 */
export async function seedSave(page: Page, state: GameState, savedAt = Date.now()): Promise<void> {
  const text = JSON.stringify({ version: SAVE_VERSION, savedAt, state });
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem('micelio:e2e-seeded')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('micelio:e2e-seeded', '1');
      }
    },
    [SAVE_KEY, text] as const,
  );
}

/** Pide al juego que guarde (como al salir) y devuelve el estado guardado. */
export async function savedState(page: Page): Promise<GameState> {
  return page.evaluate((key) => {
    window.dispatchEvent(new Event('pagehide'));
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('No hay guardado');
    return (JSON.parse(raw) as { state: GameState }).state;
  }, SAVE_KEY);
}

export function isMobile(projectName: string): boolean {
  return projectName.startsWith('mobile');
}

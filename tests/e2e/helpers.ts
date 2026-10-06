/**
 * Ayudas de las pruebas de navegador: preparar una partida guardada antes de que cargue el
 * juego y leer lo que el juego guardó.
 */
import type { Page } from '@playwright/test';
import { createState, type GameState } from '../../src/core/state.ts';
import { MUTATION_IDS } from '../../src/data/mutations.ts';
import { checkActOne } from '../../src/systems/journey.ts';
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

/**
 * Partida con el Acto I cerrado (árbol completo y una Red planetaria) y su lámina ya vista:
 * Viento de esporas y la Crónica a la vista desde el primer refresco.
 */
export function windState(mutate: (state: GameState) => void = () => undefined, now = Date.now()): GameState {
  return stateWith((s) => {
    s.mutations = [...MUTATION_IDS];
    s.achievements = ['own.planetary.1'];
    s.owned.hypha = 10;
    s.stats.sporulations = 9;
    s.stats.totalTime = 12_000;
    s.spores = { level: 1941, available: 2025 };
    checkActOne(s);
    s.seen.push('chapter.act1', 'hint.wind', 'hint.chronicle');
    mutate(s);
  }, now);
}

/** Siembra un texto de guardado tal cual (por ejemplo, de una versión anterior). */
export async function seedRawSave(page: Page, text: string): Promise<void> {
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

export function isMobile(projectName: string): boolean {
  return projectName.startsWith('mobile');
}

/**
 * Los dos teléfonos de la fase 10 (un iPhone SE y un Pixel 7). La interfaz del viaje y del ciclo se
 * prueba con estos tamaños en los cinco perfiles: en los de escritorio, a ese ancho, es la misma
 * maquetación del móvil con otro motor.
 */
export const PHONES = [
  { width: 375, height: 667 },
  { width: 412, height: 915 },
] as const;

/** El servidor de desarrollo (playwright.config.ts): solo ahí existe `?pseudo`. */
export const DEV_URL = 'http://localhost:4175/micelio/';

/**
 * Abre el juego en el pseudoidioma (textos un 40 % más largos), que solo existe en desarrollo. El
 * panel de desarrollo, fijo abajo a la derecha, tapa la barra de pestañas del móvil: se esconde.
 */
export async function gotoPseudo(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.dev { display: none !important; }';
      document.head.append(style);
    });
  });
  await page.goto(`${DEV_URL}?pseudo`);
}

/** Errores de la página y de la consola durante la prueba. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/**
 * Los renglones en que el navegador parte el texto de `selector` (un solo nodo de texto), tal como
 * se ven: cada carácter va al renglón de su caja; los que no tienen caja (el espacio donde se parte),
 * al renglón en curso. Además, cuánto se sale el texto por la derecha de `boxSelector` (0 si cabe).
 */
export function renderedLines(
  page: Page,
  selector: string,
  boxSelector: string,
): Promise<{ lines: string[]; overflow: number }> {
  return page.evaluate(
    ([sel, boxSel]) => {
      const el = document.querySelector(sel);
      const node = el?.firstChild;
      const box = document.querySelector(boxSel);
      if (!el || !(node instanceof Text) || !box) return { lines: [`no existe ${sel}`], overflow: 0 };
      const lines: string[] = [];
      let current = '';
      let top: number | null = null;
      for (let i = 0; i < node.data.length; i += 1) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getClientRects()[0];
        // Tres píxeles de margen: los acentos y las cifras no tienen todos la misma caja.
        if (rect && rect.width > 0 && top !== null && Math.abs(rect.top - top) > 3) {
          lines.push(current);
          current = '';
        }
        if (rect && rect.width > 0) top = rect.top;
        current += node.data.charAt(i);
      }
      lines.push(current);
      const all = document.createRange();
      all.selectNodeContents(el);
      const overflow = Math.max(0, all.getBoundingClientRect().right - box.getBoundingClientRect().right);
      return { lines, overflow };
    },
    [selector, boxSelector] as const,
  );
}

/**
 * Lo que se corta: los elementos visibles dentro de `selector` que se salen de su caja por los
 * lados, y el desplazamiento horizontal de la página. Vacío si todo cabe.
 */
export function cutOff(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    const root = document.querySelector(sel);
    if (!root) return [`no existe ${sel}`];
    const box = root.getBoundingClientRect();
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (el.getClientRects().length === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // Un píxel de margen por el redondeo; el galón de «Reglas» gira y asoma medio píxel.
      if (r.left < box.left - 1 || r.right > box.right + 1) {
        out.push(`${el.className || el.tagName}: ${Math.round(r.left)}–${Math.round(r.right)}`);
      }
    }
    const extra = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (extra > 0) out.push(`la página se desplaza ${extra} px en horizontal`);
    return out;
  }, selector);
}

/** Tres refrescos de la interfaz (uno cada 100 ms, src/main.ts): lo que tenga que moverse, ya se movió. */
export function settle(page: Page): Promise<void> {
  return page.waitForTimeout(350);
}

/**
 * Por qué no se ve el elemento con el foco, o null si se ve (BUG-JOURNAL #30): sus bordes de
 * arriba y de abajo, a media anchura, deben caer dentro de la ventana y ser suyos, no de lo fijo que
 * los tape (la franja de arriba, la barra de pestañas del móvil). Con el foco en <body>, 'body'.
 */
export function focusCover(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el === document.body) return 'body';
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    for (const y of [r.top + 2, r.bottom - 2]) {
      if (y < 0 || y > window.innerHeight)
        return `${el.id || el.className} fuera de la vista (${Math.round(r.top)}–${Math.round(r.bottom)})`;
      const hit = document.elementFromPoint(x, y);
      if (!hit || (hit !== el && !el.contains(hit))) {
        const by = hit instanceof HTMLElement ? hit.className || hit.tagName : 'nada';
        return `${el.id || el.className} tapado por ${by} (${Math.round(r.top)}–${Math.round(r.bottom)})`;
      }
    }
    return null;
  });
}

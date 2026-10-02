/**
 * Franja fija de arriba (ARCHITECTURE.md §4.30): por debajo de 1024 px el contador y el escenario
 * con el núcleo se quedan arriba y solo se desplaza el panel. Aquí se decide cuándo no se fija (la
 * clase `layout--unpinned` vuelve a la disposición de antes, con solo la cabecera fija en el
 * móvil) y cuánto tapa lo fijo arriba (`--pinned-h` y `--fixed-top` en :root).
 */
import type { TabId } from './tabs.ts';

/** Por debajo de este ancho se desplaza la página entera; en escritorio, solo el panel. */
export const NARROW_QUERY = '(max-width: 1023.98px)';
/** En el móvil la cabecera va encima del escenario; en tableta, sobre él. */
const PHONE_QUERY = '(max-width: 767.98px)';

/**
 * Lo mínimo que la franja fija tiene que dejar al panel, en px: una fila de generador (~180) con
 * margen. Con menos (un móvil en horizontal, zoom, pantalla partida) la franja no se fija.
 */
export const MIN_PANEL_PX = 200;

/** Campos donde se escribe: con el teclado abierto, la franja fija tapaba el campo (Ajustes). */
const TEXT_FIELDS =
  'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="number"]';

/** Espera para volver a fijar tras dejar un campo por otro control del panel: lo que dura un toque. */
const REPIN_DELAY_MS = 600;

export interface PinInputs {
  /** Por debajo de 1024 px. */
  narrow: boolean;
  /** Partida nueva: sin panel ni desplazamiento, la franja se queda como está. */
  fresh: boolean;
  /** Socios: la placa del plasmodio se dimensiona para llenar la pantalla bajo la cabecera. */
  partners: boolean;
  /** Hay un campo de texto del panel con el foco. */
  typing: boolean;
  /** Alto estable de la ventana (100svh: con la barra del navegador a la vista). */
  viewport: number;
  /** Alto de la franja: cabecera y escenario. */
  zone: number;
  /** Lo demás que queda fijo: la barra de pestañas (abajo en el móvil, bajo la franja en tableta). */
  bars: number;
}

/** ¿Vuelve la disposición de antes, sin la franja fija? */
export function shouldUnpin(input: PinInputs): boolean {
  if (!input.narrow || input.fresh) return false;
  return input.partners || input.typing || input.viewport - input.zone - input.bars < MIN_PANEL_PX;
}

export interface PinningParts {
  main: HTMLElement;
  hud: HTMLElement;
  stage: HTMLElement;
  panel: HTMLElement;
  /** Barra de pestañas. */
  bar: HTMLElement;
  /** Caja fija de 100svh: su alto no cambia cuando la barra del navegador aparece o se esconde. */
  probe: HTMLElement;
  activeTab: () => TabId;
}

export interface Pinning {
  /** Vuelve a decidir (al cambiar de pestaña o de partida nueva a partida). */
  refresh(): void;
  /** Tras un cambio de pestaña del jugador: si el principio del panel quedó tapado, lo trae justo bajo lo fijo. */
  revealPanel(): void;
  destroy(): void;
}

export function createPinning(parts: PinningParts): Pinning {
  const narrow = window.matchMedia(NARROW_QUERY);
  const phone = window.matchMedia(PHONE_QUERY);
  const root = document.documentElement;
  let typing = false;
  /** Lo que tapa lo fijo arriba del panel (la franja, la cabecera o nada), sin la barra de pestañas. */
  let pinned = 0;
  let written = '';

  const position = (el: HTMLElement): string => getComputedStyle(el).position;

  function refresh(): void {
    const hud = parts.hud.getBoundingClientRect();
    const stage = parts.stage.getBoundingClientRect();
    // Por alturas y no por posiciones: sin fijar y con la página bajada, la cabecera sigue arriba
    // y el escenario no, y la distancia entre los dos no es la franja.
    const zone = phone.matches ? hud.height + stage.height : stage.height;
    const barPosition = position(parts.bar);
    const bar =
      barPosition === 'fixed' || barPosition === 'sticky' ? parts.bar.getBoundingClientRect().height : 0;
    const unpinned = shouldUnpin({
      narrow: narrow.matches,
      fresh: parts.main.classList.contains('layout--fresh'),
      partners: parts.activeTab() === 'partners',
      typing,
      viewport: parts.probe.getBoundingClientRect().height,
      zone,
      bars: bar,
    });
    parts.main.classList.toggle('layout--unpinned', unpinned);
    if (!narrow.matches) pinned = 0;
    else if (!unpinned) pinned = zone;
    // Sin fijar, en el móvil la cabecera sigue pegada arriba; en tableta, nada.
    else pinned = position(parts.hud) === 'sticky' ? hud.height : 0;
    // La barra de tableta se pega bajo lo fijo: el foco tampoco debe quedar bajo ella.
    const fixedTop =
      pinned + (position(parts.bar) === 'sticky' ? parts.bar.getBoundingClientRect().height : 0);
    // Hacia abajo para la barra de tableta, que va debajo de la franja (z-index 9 frente a 10): con
    // ceil quedaba una rendija de menos de un píxel por la que se veía pasar la lista.
    const next = `${String(Math.floor(pinned))}|${String(Math.ceil(fixedTop))}`;
    if (next === written) return;
    written = next;
    root.style.setProperty('--pinned-h', `${String(Math.floor(pinned))}px`);
    root.style.setProperty('--fixed-top', `${String(Math.ceil(fixedTop))}px`);
  }

  function revealPanel(): void {
    if (!narrow.matches || !parts.main.isConnected) return;
    refresh();
    const top = parts.panel.getBoundingClientRect().top;
    // Al instante: con la lista de otra pestaña bajada, la nueva empezaría a medias o bajo la franja.
    if (top < pinned - 1) window.scrollTo(0, Math.max(0, window.scrollY + top - pinned));
  }

  const onFocusIn = (event: FocusEvent): void => {
    const next = event.target instanceof Element && event.target.matches(TEXT_FIELDS);
    if (next === typing) return;
    typing = next;
    refresh();
  };
  /** Vuelta a fijar pendiente tras dejar de escribir (ver onFocusOut). */
  let repinTimer = 0;
  const onFocusOut = (event: FocusEvent): void => {
    if (!typing) return;
    const to = event.relatedTarget;
    typing = to instanceof Element && parts.panel.contains(to) && to.matches(TEXT_FIELDS);
    if (typing) return;
    window.clearTimeout(repinTimer);
    // Si el foco pasa a otro control del panel («Revisar e importar»), es que se está tocando: el
    // foco llega en el pointerdown y, fijada ya, la franja taparía el botón antes del click.
    if (to instanceof Element && parts.panel.contains(to))
      repinTimer = window.setTimeout(refresh, REPIN_DELAY_MS);
    else refresh();
  };
  parts.panel.addEventListener('focusin', onFocusIn);
  parts.panel.addEventListener('focusout', onFocusOut);
  // Tamaños: cabecera (líneas de esporas), escenario, barra y la ventana (girar, zoom, pantalla
  // partida). Cambiar de modo no cambia ninguno de ellos, así que no hay vaivén.
  const observer = new ResizeObserver(() => {
    refresh();
  });
  for (const el of [parts.hud, parts.stage, parts.bar, parts.probe]) observer.observe(el);
  // También al cambiar la ventana: con la vista emulada, el observador no siempre avisaba.
  window.addEventListener('resize', refresh);
  narrow.addEventListener('change', refresh);

  return {
    refresh,
    revealPanel,
    destroy: () => {
      window.clearTimeout(repinTimer);
      observer.disconnect();
      window.removeEventListener('resize', refresh);
      narrow.removeEventListener('change', refresh);
      parts.panel.removeEventListener('focusin', onFocusIn);
      parts.panel.removeEventListener('focusout', onFocusOut);
    },
  };
}

/**
 * Tooltips accesibles: aparecen con el ratón encima, con el foco del teclado y con una
 * pulsación larga en pantallas táctiles. Nunca solo con hover (PROMPT.md §13).
 *
 * Hay un único nodo flotante para toda la app. El contenido se pide al mostrarlo, así que
 * siempre está al día (por ejemplo, «+12,4 N/s» tras una compra).
 */
import { Disposer, h } from './dom.ts';

export type TooltipContent = () => string | readonly string[] | null;

/** Milisegundos de pulsación para considerarla larga. */
const LONG_PRESS_MS = 450;
/** Si el dedo se mueve más que esto, es un desplazamiento, no una pulsación. */
const MOVE_TOLERANCE_PX = 10;

let tip: HTMLDivElement | null = null;
let owner: HTMLElement | null = null;
let currentContent: TooltipContent | null = null;

function ensureTip(): HTMLDivElement {
  if (!tip) {
    tip = h('div', { class: 'tooltip', id: 'tooltip', attrs: { role: 'tooltip', hidden: true } });
    document.body.append(tip);
  }
  return tip;
}

function render(content: TooltipContent): boolean {
  const node = ensureTip();
  const value = content();
  if (value === null) return false;
  const lines: readonly string[] = typeof value === 'string' ? [value] : value;
  if (lines.length === 0) return false;
  node.replaceChildren(
    ...lines.map((line, i) => h('p', { class: i === 0 ? 'tooltip__lead' : '', text: line })),
  );
  return true;
}

function position(target: HTMLElement): void {
  const node = ensureTip();
  const rect = target.getBoundingClientRect();
  const tipRect = node.getBoundingClientRect();
  const margin = 8;
  const viewportW = document.documentElement.clientWidth;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(left, viewportW - tipRect.width - margin));
  let top = rect.top - tipRect.height - margin;
  if (top < margin) top = rect.bottom + margin;
  node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

/** aria-describedby es una lista de ids: el tooltip añade y quita el suyo sin pisar otros. */
function addDescribedBy(el: HTMLElement, id: string): void {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  if (!ids.includes(id)) el.setAttribute('aria-describedby', [...ids, id].join(' '));
}

function removeDescribedBy(el: HTMLElement, id: string): void {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((x) => x && x !== id);
  if (ids.length > 0) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
}

export function showTooltip(target: HTMLElement, content: TooltipContent): void {
  const node = ensureTip();
  if (!render(content)) {
    hideTooltip();
    return;
  }
  owner = target;
  currentContent = content;
  node.hidden = false;
  addDescribedBy(target, node.id);
  position(target);
}

export function hideTooltip(): void {
  if (!tip) return;
  tip.hidden = true;
  if (owner) removeDescribedBy(owner, tip.id);
  owner = null;
  currentContent = null;
}

/** Repinta el tooltip abierto (lo llama la UI a 10 Hz para que las cifras sigan vivas). */
export function refreshTooltip(): void {
  if (!owner || !currentContent || !tip || tip.hidden) return;
  if (!owner.isConnected) {
    hideTooltip();
    return;
  }
  if (!render(currentContent)) hideTooltip();
  else position(owner);
}

export interface TooltipOptions {
  /** Si un toque corto también lo muestra (para botones que solo informan). */
  tapToggles?: boolean;
}

/**
 * Engancha un tooltip a un elemento. Devuelve la función que lo desengancha; también se
 * registra en `disposer` si se pasa.
 */
export function attachTooltip(
  target: HTMLElement,
  content: TooltipContent,
  disposer: Disposer,
  options: TooltipOptions = {},
): void {
  let pressTimer: number | undefined;
  let pressStart: { x: number; y: number } | null = null;
  let suppressClick = false;

  const clearPress = (): void => {
    if (pressTimer !== undefined) window.clearTimeout(pressTimer);
    pressTimer = undefined;
    pressStart = null;
  };

  disposer.listen(target, 'pointerenter', (e) => {
    if (e.pointerType === 'mouse') showTooltip(target, content);
  });
  disposer.listen(target, 'pointerleave', (e) => {
    if (e.pointerType === 'mouse' && owner === target) hideTooltip();
  });
  disposer.listen(target, 'focus', () => {
    if (target.matches(':focus-visible')) showTooltip(target, content);
  });
  disposer.listen(target, 'blur', () => {
    if (owner === target) hideTooltip();
  });
  disposer.listen(target, 'pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    suppressClick = false;
    pressStart = { x: e.clientX, y: e.clientY };
    pressTimer = window.setTimeout(() => {
      suppressClick = true;
      showTooltip(target, content);
    }, LONG_PRESS_MS);
  });
  disposer.listen(target, 'pointermove', (e) => {
    if (!pressStart) return;
    if (Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > MOVE_TOLERANCE_PX) clearPress();
  });
  disposer.listen(target, 'pointerup', clearPress);
  disposer.listen(target, 'pointercancel', clearPress);
  // Tras una pulsación larga, el clic que sigue no debe comprar nada.
  disposer.listen(
    target,
    'click',
    (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopImmediatePropagation();
        suppressClick = false;
        return;
      }
      if (options.tapToggles) {
        if (owner === target) hideTooltip();
        else showTooltip(target, content);
      }
    },
    { capture: true },
  );
  // Evita el menú contextual del navegador durante la pulsación larga.
  disposer.listen(target, 'contextmenu', (e) => {
    if (suppressClick || pressTimer !== undefined) e.preventDefault();
  });
  disposer.add(() => {
    clearPress();
    if (owner === target) hideTooltip();
  });
}

/** Cierra el tooltip con Escape o al desplazar. Se instala una vez desde main.ts. */
export function installTooltipGlobalHandlers(disposer: Disposer): void {
  disposer.listen(document, 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') hideTooltip();
  });
  disposer.listen(window, 'scroll', hideTooltip, { capture: true, passive: true });
  disposer.listen(document, 'pointerdown', (e) => {
    if (owner && e.target instanceof Node && !owner.contains(e.target)) hideTooltip();
  });
}

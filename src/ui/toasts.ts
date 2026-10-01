/**
 * Avisos breves (logros, lluvia, esporulación, guardado). Son visuales; lo que deba oír un
 * lector de pantalla se anuncia aparte por la región aria-live.
 */
import { h } from './dom.ts';

export type ToastKind = 'achievement' | 'rain' | 'spore' | 'info' | 'warning';

/** Avisos visibles a la vez: el más viejo se va si llega uno nuevo. */
const MAX_TOASTS = 3;
const DEFAULT_MS = 4200;

let container: HTMLDivElement | null = null;

export function createToastContainer(): HTMLDivElement {
  container = h('div', { class: 'toasts' });
  return container;
}

export interface ToastOptions {
  kind?: ToastKind;
  title?: string;
  /** Milisegundos visibles; 0 = hasta que se cierre a mano (avisos importantes). */
  duration?: number;
  action?: { label: string; onSelect: () => void };
}

export function toast(message: string, options: ToastOptions = {}): void {
  if (!container) return;
  const kind = options.kind ?? 'info';
  const node = h('div', { class: `toast toast--${kind}` }, [
    options.title ? h('p', { class: 'toast__title', text: options.title }) : null,
    h('p', { class: 'toast__text', text: message }),
  ]);
  if (options.action) {
    const { label, onSelect } = options.action;
    const button = h('button', {
      class: 'button button--primary toast__action',
      text: label,
      attrs: { type: 'button' },
    });
    button.addEventListener('click', onSelect, { once: true });
    node.append(button);
  }
  container.append(node);
  while (container.children.length > MAX_TOASTS) container.firstElementChild?.remove();
  const duration = options.duration ?? DEFAULT_MS;
  if (duration > 0) {
    window.setTimeout(() => {
      node.classList.add('toast--leaving');
      window.setTimeout(() => {
        node.remove();
      }, 300);
    }, duration);
  }
}

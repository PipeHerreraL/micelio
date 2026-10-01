/**
 * Avisos breves (logros, lluvia, esporulación, guardado). Son visuales; lo que deba oír un
 * lector de pantalla se anuncia aparte por la región aria-live.
 *
 * Los avisos fijos (duración 0: guardado imposible, otra pestaña) no cuentan para el tope
 * ni se desalojan con los nuevos, y siempre tienen un botón para cerrarlos.
 */
import { t } from '../i18n/index.ts';
import { h } from './dom.ts';
import { uiIcon } from './icons.ts';

export type ToastKind = 'achievement' | 'rain' | 'spore' | 'info' | 'warning';

/** Avisos pasajeros visibles a la vez: el más viejo se va si llega uno nuevo. */
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
  /** Milisegundos visibles; 0 = fijo hasta que se cierre a mano. */
  duration?: number;
  action?: { label: string; onSelect: () => void };
}

export function toast(message: string, options: ToastOptions = {}): void {
  if (!container) return;
  const host = container;
  const kind = options.kind ?? 'info';
  const duration = options.duration ?? DEFAULT_MS;
  const sticky = duration <= 0;
  const node = h('div', { class: `toast toast--${kind}${sticky ? ' toast--sticky' : ''}` }, [
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
    button.addEventListener(
      'click',
      () => {
        node.remove();
        onSelect();
      },
      { once: true },
    );
    node.append(button);
  }
  if (sticky) {
    const close = h(
      'button',
      { class: 'toast__close', attrs: { type: 'button', 'aria-label': t('common.close') } },
      [uiIcon('close')],
    );
    close.addEventListener(
      'click',
      () => {
        node.remove();
      },
      { once: true },
    );
    node.append(close);
  }
  host.append(node);
  let transient = host.querySelectorAll('.toast:not(.toast--sticky)');
  while (transient.length > MAX_TOASTS) {
    transient[0]?.remove();
    transient = host.querySelectorAll('.toast:not(.toast--sticky)');
  }
  if (!sticky) {
    window.setTimeout(() => {
      node.classList.add('toast--leaving');
      window.setTimeout(() => {
        node.remove();
      }, 300);
    }, duration);
  }
}

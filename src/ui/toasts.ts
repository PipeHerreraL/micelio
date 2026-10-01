/**
 * Avisos breves (logros, lluvia, esporulación, guardado). Son visuales; lo que deba oír un
 * lector de pantalla se anuncia aparte por la región aria-live.
 *
 * Los avisos fijos (duración 0: guardado imposible, otra pestaña) no cuentan para el tope
 * ni se desalojan con los nuevos, y siempre tienen un botón para cerrarlos.
 *
 * El contenedor se crea una vez y vive fuera de la interfaz que se reconstruye: si se
 * rehiciera con ella, un cambio de idioma borraría los avisos fijos y el único botón que
 * desbloquea el guardado.
 */
import { t } from '../i18n/index.ts';
import { h } from './dom.ts';
import { uiIcon } from './icons.ts';
import { isModalOpen, onModalClosed } from './modal.ts';

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
  /** Identifica un aviso: uno nuevo con el mismo id sustituye al anterior en su sitio. */
  id?: string;
  /** Se llama cuando el jugador cierra el aviso fijo con su botón. */
  onClose?: () => void;
}

/** Avisos pasajeros que llegaron con un modal abierto; se muestran al cerrarlo. */
const deferred: [message: string, options: ToastOptions][] = [];

onModalClosed(() => {
  for (const [message, options] of deferred.splice(0)) toast(message, options);
});

function findToast(id: string): HTMLElement | null {
  if (!container) return null;
  for (const node of container.querySelectorAll<HTMLElement>('.toast')) {
    if (node.dataset.id === id) return node;
  }
  return null;
}

/**
 * Quita un aviso sin perder el foco: si el foco estaba en uno de sus botones, quitar el nodo
 * lo dejaría en <body> y el siguiente Espacio absorbería (como en BUG-JOURNAL #5).
 */
function removeNode(node: HTMLElement): void {
  if (node.contains(document.activeElement)) {
    const others = container ? Array.from(container.querySelectorAll<HTMLElement>('.toast button')) : [];
    const next =
      others.find((button) => !node.contains(button)) ??
      document.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])');
    next?.focus();
  }
  node.remove();
}

/** Quita el aviso con ese id, si sigue a la vista. */
export function removeToast(id: string): void {
  const node = findToast(id);
  if (node) removeNode(node);
}

export function toast(message: string, options: ToastOptions = {}): void {
  if (!container) return;
  const host = container;
  const kind = options.kind ?? 'info';
  const duration = options.duration ?? DEFAULT_MS;
  const sticky = duration <= 0;
  // Con un modal abierto el resto de la página es inerte: un aviso pasajero caducaría detrás
  // del fondo sin que nadie lo viera. Los fijos no caducan y se quedan donde están.
  if (!sticky && isModalOpen()) {
    deferred.push([message, options]);
    if (deferred.length > MAX_TOASTS) deferred.shift();
    return;
  }
  const node = h('div', { class: `toast toast--${kind}${sticky ? ' toast--sticky' : ''}` }, [
    options.title ? h('p', { class: 'toast__title', text: options.title }) : null,
    h('p', { class: 'toast__text', text: message }),
  ]);
  if (options.id) node.dataset.id = options.id;
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
        removeNode(node);
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
    const onClose = options.onClose;
    close.addEventListener(
      'click',
      () => {
        removeNode(node);
        onClose?.();
      },
      { once: true },
    );
    node.append(close);
  }
  const previous = options.id ? findToast(options.id) : null;
  if (previous) {
    const hadFocus = previous.contains(document.activeElement);
    previous.replaceWith(node);
    if (hadFocus) node.querySelector<HTMLElement>('button')?.focus();
  } else {
    host.append(node);
  }
  let transient = host.querySelectorAll<HTMLElement>('.toast:not(.toast--sticky)');
  while (transient.length > MAX_TOASTS) {
    const oldest = transient[0];
    if (oldest) removeNode(oldest);
    transient = host.querySelectorAll<HTMLElement>('.toast:not(.toast--sticky)');
  }
  if (!sticky) {
    window.setTimeout(() => {
      node.classList.add('toast--leaving');
      window.setTimeout(() => {
        removeNode(node);
      }, 300);
    }, duration);
  }
}

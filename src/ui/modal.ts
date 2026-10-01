/**
 * Modales sobre `<dialog>` nativo (ARCHITECTURE.md §4.12): foco atrapado, Escape y fondo
 * inerte sin código propio. Solo hay un modal abierto a la vez.
 */
import { t } from '../i18n/index.ts';
import { Disposer, h } from './dom.ts';
import { uiIcon } from './icons.ts';

export interface ModalAction {
  label: string;
  /** primary = acento rebozuelo; danger = acción destructiva; quiet = cancelar. */
  kind: 'primary' | 'danger' | 'quiet';
  /** Devuelve false para dejar el modal abierto. */
  onSelect?: () => boolean | undefined;
  /**
   * Recibe el foco al abrir. Las confirmaciones irreversibles se lo dan a cancelar: un Enter
   * sostenido sobre el botón que abrió el modal no debe confirmar sin leer.
   */
  autofocus?: boolean;
}

export interface ModalOptions {
  title: string;
  body: readonly (Node | string)[];
  actions: readonly ModalAction[];
  /** Se llama al cerrarse por cualquier vía (botón, Escape). */
  onClose?: () => void;
  /** Clase extra para variar el aspecto (por ejemplo, el de esporular). */
  variant?: string;
  /** Antetítulo de las láminas («Fin del Acto I»). */
  kicker?: string;
  /** Bioma cuya franja de suelo se dibuja arriba (decorativa). */
  biome?: string;
}

let dialog: HTMLDialogElement | null = null;
let disposer = new Disposer();
let closeCallback: (() => void) | undefined;
/** Hay un modal cuyos listeners y `onClose` siguen pendientes de atender. */
let unsettled = false;
const closeListeners = new Set<() => void>();

/** Quita los listeners del modal actual y avisa a su `onClose`, una sola vez. */
function settle(): void {
  if (!unsettled) return;
  unsettled = false;
  disposer.dispose();
  const cb = closeCallback;
  closeCallback = undefined;
  cb?.();
}

function ensureDialog(): HTMLDialogElement {
  if (!dialog) {
    const node = h('dialog', { class: 'modal', attrs: { 'aria-labelledby': 'modal-title' } });
    dialog = node;
    document.body.append(node);
    node.addEventListener('close', () => {
      // El navegador dispara 'close' en una tarea aparte. Si entretanto openModal abrió otro
      // modal, este evento es del anterior, que openModal ya atendió: atenderlo aquí quitaría
      // los listeners del modal nuevo.
      if (node.open) return;
      settle();
      for (const listener of closeListeners) listener();
    });
  }
  return dialog;
}

export function isModalOpen(): boolean {
  return dialog?.open ?? false;
}

/**
 * Avisa cuando el último modal se cierra y el resto de la página deja de ser inerte. Los
 * avisos pasajeros esperan a este momento: detrás del fondo nadie los vería ni los oiría.
 */
export function onModalClosed(listener: () => void): void {
  closeListeners.add(listener);
}

export function closeModal(): void {
  if (dialog?.open) dialog.close();
}

/** Abre un modal. Si ya había uno abierto, lo reemplaza. */
export function openModal(options: ModalOptions): void {
  const node = ensureDialog();
  if (node.open) node.close();
  // Si el 'close' anterior aún no llegó, se atiende ya: luego lo ignorará el listener.
  settle();
  disposer = new Disposer();
  closeCallback = options.onClose;
  unsettled = true;
  node.className = options.variant ? `modal ${options.variant}` : 'modal';
  if (options.biome) node.dataset.biome = options.biome;
  else delete node.dataset.biome;

  // Un Enter sostenido repite keydown y cada repetición activaría el botón con foco: sin
  // este freno, mantener Enter sobre «Esporular» confirmaría el reinicio sin leer el resumen.
  disposer.listen(node, 'keydown', (event) => {
    if (event.repeat && event.key === 'Enter') event.preventDefault();
  });

  const buttons = options.actions.map((action) => {
    const button = h('button', {
      class: `button button--${action.kind}`,
      text: action.label,
      attrs: { type: 'button' },
    });
    disposer.listen(button, 'click', () => {
      const keepOpen = action.onSelect?.() === false;
      if (!keepOpen) node.close();
    });
    return button;
  });

  const closeButton = h(
    'button',
    { class: 'modal__close', attrs: { type: 'button', 'aria-label': t('common.close') } },
    [uiIcon('close')],
  );
  disposer.listen(closeButton, 'click', () => {
    node.close();
  });

  node.replaceChildren(
    h('div', { class: 'modal__frame' }, [
      closeButton,
      ...(options.biome
        ? [
            h('span', { class: 'soil-swatch modal__soil', attrs: { 'aria-hidden': 'true' } }, [
              h('span'),
              h('span'),
              h('span'),
            ]),
          ]
        : []),
      ...(options.kicker ? [h('p', { class: 'modal__kicker', text: options.kicker })] : []),
      h('h2', { class: 'modal__title', id: 'modal-title', text: options.title }),
      h(
        'div',
        { class: 'modal__body' },
        options.body.map((part) => (typeof part === 'string' ? h('p', { text: part }) : part)),
      ),
      h('div', { class: 'modal__actions' }, buttons),
    ]),
  );
  node.showModal();
  // El foco va a la acción marcada, si no a la principal (o a la primera); nunca al botón de
  // cerrar.
  const initial =
    buttons.find((_, i) => options.actions[i]?.autofocus) ??
    buttons.find((_, i) => options.actions[i]?.kind === 'primary') ??
    buttons[0];
  initial?.focus();
}

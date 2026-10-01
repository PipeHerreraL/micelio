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
}

export interface ModalOptions {
  title: string;
  body: readonly (Node | string)[];
  actions: readonly ModalAction[];
  /** Se llama al cerrarse por cualquier vía (botón, Escape). */
  onClose?: () => void;
  /** Clase extra para variar el aspecto (por ejemplo, el de esporular). */
  variant?: string;
}

let dialog: HTMLDialogElement | null = null;
let disposer = new Disposer();
let closeCallback: (() => void) | undefined;

function ensureDialog(): HTMLDialogElement {
  if (!dialog) {
    dialog = h('dialog', { class: 'modal', attrs: { 'aria-labelledby': 'modal-title' } });
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      disposer.dispose();
      const cb = closeCallback;
      closeCallback = undefined;
      cb?.();
    });
  }
  return dialog;
}

export function isModalOpen(): boolean {
  return dialog?.open ?? false;
}

export function closeModal(): void {
  if (dialog?.open) dialog.close();
}

/** Abre un modal. Si ya había uno abierto, lo reemplaza. */
export function openModal(options: ModalOptions): void {
  const node = ensureDialog();
  if (node.open) node.close();
  disposer = new Disposer();
  closeCallback = options.onClose;
  node.className = options.variant ? `modal ${options.variant}` : 'modal';

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
  // El foco va a la acción principal (o a la primera), no al botón de cerrar.
  const primary = buttons.find((_, i) => options.actions[i]?.kind === 'primary') ?? buttons[0];
  primary?.focus();
}

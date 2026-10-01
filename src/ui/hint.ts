/**
 * Aviso de primera vez: un mensaje breve en contexto, dentro de la pestaña del sistema que
 * acaba de aparecer. Se descarta con un botón y no vuelve (queda en `seen`).
 */
import { markSeen } from '../core/actions.ts';
import { hasSeen } from '../core/state.ts';
import { t } from '../i18n/index.ts';
import { Disposer, h, setHidden } from './dom.ts';
import type { Store } from './store.ts';

export interface Hint {
  root: HTMLElement;
  /** `relevant`: si el sistema ya está a la vista y el aviso tiene sentido ahora. */
  update(relevant: boolean): void;
  destroy(): void;
}

export function createHint(store: Store, key: string, text: string): Hint {
  const disposer = new Disposer();
  const dismiss = h('button', {
    class: 'hint__dismiss button button--quiet',
    text: t('hint.dismiss'),
    attrs: { type: 'button' },
  });
  const root = h('aside', { class: 'hint', attrs: { hidden: true } }, [
    h('p', { class: 'hint__text', text }),
    dismiss,
  ]);
  disposer.listen(dismiss, 'click', () => {
    store.dispatch(markSeen, { key });
  });
  return {
    root,
    update(relevant) {
      setHidden(root, !relevant || hasSeen(store.state, key));
    },
    destroy: () => {
      disposer.dispose();
    },
  };
}

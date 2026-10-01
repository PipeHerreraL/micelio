/**
 * El puente entre la interfaz y el estado: la UI lee `store.state` y cambia cosas solo con
 * `store.dispatch(acción, payload)`. Importar o borrar partida reemplaza el estado entero.
 */
import type { GameState } from '../core/state.ts';

export type Action<P> = (state: GameState, payload: P) => void;

export interface Store {
  readonly state: GameState;
  dispatch<P>(action: Action<P>, payload: P): void;
  /** Sustituye el estado (importar, borrar). Los componentes leen siempre `store.state`. */
  replace(next: GameState): void;
  /** Se avisa tras cada acción o reemplazo; la UI marca que hay que repintar. */
  onChange(listener: () => void): () => void;
}

export function createStore(initial: GameState): Store {
  let state = initial;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const fn of listeners) fn();
  };
  return {
    get state() {
      return state;
    },
    dispatch(action, payload) {
      action(state, payload);
      notify();
    },
    replace(next) {
      state = next;
      notify();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

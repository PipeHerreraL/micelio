/**
 * Números flotantes del clic («+1,2»). Un pool fijo de nodos que se reutilizan: el clic no
 * crea elementos nuevos, y con «Reducir movimiento» el número aparece y se desvanece sin
 * desplazarse (lo decide el CSS).
 */
import { h, restartAnimation } from './dom.ts';

const POOL_SIZE = 24;

export interface Floaters {
  root: HTMLElement;
  /** Muestra `text` centrado en `x`, `y` (px de viewport: la capa es fija). */
  show(text: string, x: number, y: number): void;
}

export function createFloaters(): Floaters {
  const root = h('div', { class: 'floaters', attrs: { 'aria-hidden': 'true' } });
  const pool: HTMLSpanElement[] = [];
  for (let i = 0; i < POOL_SIZE; i += 1) {
    const node = h('span', { class: 'floater tabular' });
    pool.push(node);
    root.append(node);
  }
  let next = 0;
  let jitter = 0;
  return {
    root,
    show(text, x, y) {
      const node = pool[next];
      next = (next + 1) % POOL_SIZE;
      if (!node) return;
      // Desvío horizontal alterno, para que los números seguidos no se tapen entre sí.
      jitter = (jitter + 7) % 29;
      node.textContent = text;
      node.style.left = `${Math.round(x + jitter - 14)}px`;
      node.style.top = `${Math.round(y)}px`;
      restartAnimation(node, 'is-active');
    },
  };
}

/**
 * La gota de lluvia: un botón real (PROMPT.md §16) colocado en un punto de la zona de
 * juego. Se encoge mientras se evapora; al tocarla se despacha `catchDrop`.
 */
import { catchDrop, dropLifetime } from '../systems/rain.ts';
import { t } from '../i18n/index.ts';
import { Disposer, h, setHidden } from './dom.ts';
import { uiIcon } from './icons.ts';
import type { Store } from './store.ts';

export interface RainDropView {
  root: HTMLButtonElement;
  update(): void;
  destroy(): void;
}

/** Radio de la gota y separación mínima (px) con lo que tapa el escenario. */
const DROP_RADIUS = 28;
const CLEARANCE = 16;

/** Posiciones candidatas, de la sorteada hacia fuera, si la sorteada queda tapada. */
const FALLBACKS: readonly [number, number][] = [
  [0.15, 0.85],
  [0.85, 0.85],
  [0.15, 0.5],
  [0.85, 0.5],
  [0.5, 0.88],
  [0.85, 0.15],
  [0.15, 0.15],
];

/**
 * `cover` devuelve lo que tapa el escenario (en móvil y tableta, el núcleo, su indicación,
 * el contador y los efectos están encima): si la gota cae debajo, se mueve a un hueco libre
 * para que tocarla nunca absorba en su lugar (ARCHITECTURE.md §4.22).
 */
export function createRainDrop(store: Store, stage: () => HTMLElement, cover: () => DOMRect[]): RainDropView {
  const disposer = new Disposer();
  const root = h('button', {
    class: 'drop',
    attrs: { type: 'button', 'aria-label': t('rain.drop.label'), hidden: true },
  });
  root.append(uiIcon('drop'));
  disposer.listen(root, 'click', () => {
    store.dispatch(catchDrop, {});
  });
  let shownAt: { x: number; y: number } | null = null;

  return {
    root,
    update() {
      const drop = store.state.rain.drop;
      setHidden(root, drop === null);
      if (!drop) {
        shownAt = null;
        return;
      }
      if (!shownAt || shownAt.x !== drop.x || shownAt.y !== drop.y) {
        shownAt = { x: drop.x, y: drop.y };
        const box = stage().getBoundingClientRect();
        const rects = cover().filter(
          (r) =>
            r.width > 0 &&
            r.right > box.left &&
            r.left < box.right &&
            r.bottom > box.top &&
            r.top < box.bottom,
        );
        const blocked = (fx: number, fy: number): boolean => {
          const px = box.left + fx * box.width;
          const py = box.top + fy * box.height;
          const m = DROP_RADIUS + CLEARANCE;
          return rects.some(
            (r) => px > r.left - m && px < r.right + m && py > r.top - m && py < r.bottom + m,
          );
        };
        // Entera dentro del escenario (overflow: hidden): con el escenario fijo del móvil, de 150 px,
        // las posiciones de arriba y abajo la recortaban por debajo de los 44 px táctiles.
        const fit = (f: number, size: number): number => {
          if (size <= 2 * DROP_RADIUS) return f;
          const edge = DROP_RADIUS / size;
          return Math.min(1 - edge, Math.max(edge, f));
        };
        const place = ([fx, fy]: readonly [number, number]): [number, number] => [
          fit(fx, box.width),
          fit(fy, box.height),
        ];
        let [x, y] = place([drop.x, drop.y]);
        if (box.width > 0 && blocked(x, y)) {
          const free = FALLBACKS.map(place).find(([fx, fy]) => !blocked(fx, fy));
          if (free) [x, y] = free;
        }
        root.style.left = `${(x * 100).toFixed(2)}%`;
        root.style.top = `${(y * 100).toFixed(2)}%`;
      }
      // Se evapora: el último tercio de su vida se va desvaneciendo.
      const life = Math.max(0, Math.min(1, drop.remaining / dropLifetime(store.state)));
      root.style.setProperty('--life', life.toFixed(3));
    },
    destroy: () => {
      disposer.dispose();
    },
  };
}

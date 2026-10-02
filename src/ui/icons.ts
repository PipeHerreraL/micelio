/**
 * Iconos SVG propios, dibujados a trazo sobre una cuadrícula de 24 × 24. Sin librerías
 * genéricas de iconos (PROMPT.md §14). Heredan el color con `currentColor`.
 */
import type { GeneratorId } from '../data/generators.ts';
import { svg } from './dom.ts';

type Shape =
  | { d: string; fill?: boolean }
  | { circle: [number, number, number]; fill?: boolean }
  | { ellipse: [number, number, number, number]; fill?: boolean };

const GENERATOR_SHAPES: Record<GeneratorId, readonly Shape[]> = {
  hypha: [
    { d: 'M4 20c3-3 4-6 6-9s5-6 10-7' },
    { d: 'M10 11c1.5 1 4 1.5 6 4' },
    { d: 'M7 16c-1-1.5-1.2-3-.8-4.5' },
  ],
  rhizomorph: [{ d: 'M3 17c4-6 7 4 11-2s5-6 7-5' }, { d: 'M3 13c4 6 7-4 11 2s5 4 7 3' }, { d: 'M3 15h2.5' }],
  primordium: [
    { d: 'M3 19h18' },
    { d: 'M12 19c-3 0-3.5-5-1.2-7.5.6-.7 1.8-.7 2.4 0C15.5 14 15 19 12 19z' },
    { d: 'M7 19c0-1 .6-1.8 1.4-2.2M17 19c0-1-.6-1.8-1.4-2.2' },
  ],
  mushroom: [
    { d: 'M3.5 12.5C4 6.5 8 4 12 4s8 2.5 8.5 8.5z' },
    { d: 'M10 12.5v6.5c0 1 4 1 4 0v-6.5' },
    { circle: [9, 9, 0.9], fill: true },
    { circle: [14.5, 8, 0.8], fill: true },
  ],
  fairyRing: [
    { ellipse: [12, 15, 8.5, 4] },
    { d: 'M5 11.5c0-1.6 2.4-1.6 2.4 0zM6.2 11.5v1.6' },
    { d: 'M10.8 9c0-1.6 2.4-1.6 2.4 0zM12 9v1.6' },
    { d: 'M16.6 11.5c0-1.6 2.4-1.6 2.4 0zM17.8 11.5v1.6' },
  ],
  mycorrhiza: [
    { d: 'M12 3v7c0 3-3 4-3 8M12 10c0 3 3 4 3 8' },
    { d: 'M9 18c-2 .5-4 0-5-1M15 18c2 .5 4 0 5-1' },
    { d: 'M6 13c2 0 3 1 4 2M18 13c-2 0-3 1-4 2', fill: false },
    { circle: [12, 3, 1], fill: true },
  ],
  motherTree: [
    { d: 'M12 2.5 6 10h3l-4 5h14l-4-5h3z' },
    { d: 'M12 15v4' },
    { d: 'M12 19c-2 0-4 1-6 2.5M12 19c2 0 4 1 6 2.5M12 19v2.5' },
  ],
  ancientForest: [
    { d: 'M7 4 3.5 10h2L3 14h8l-2.5-4h2z' },
    { d: 'M17 3l-4 7h2.3l-3 5h9.4l-3-5H21z' },
    { d: 'M7 14v4M17 15v4M2 19h20' },
  ],
  malheur: [
    { d: 'M2 20h20' },
    { d: 'M4 13c0-3 4-3 4 0zM6 13v4' },
    { d: 'M9 10c0-4 6-4 6 0zM12 10v7' },
    { d: 'M16 13c0-3 4-3 4 0zM18 13v4' },
    { d: 'M6 17c2 1 10 1 12 0' },
  ],
  planetary: [
    { circle: [12, 12, 8.5] },
    { d: 'M4 10c3 2 6-1 8 1s5 2 8-1' },
    { d: 'M5.5 16c3-1 5 1 7-1s4-1 6 .5' },
    { d: 'M12 3.5c-2 3-2 14 0 17' },
  ],
};

export type UiIcon =
  | 'generators'
  | 'upgrades'
  | 'sporulate'
  | 'mutations'
  | 'achievements'
  | 'stats'
  | 'settings'
  | 'chronicle'
  | 'partners'
  | 'info'
  | 'wind'
  | 'close'
  | 'drop'
  | 'spore'
  | 'lock'
  | 'click'
  | 'global'
  | 'synergy';

const UI_SHAPES: Record<UiIcon, readonly Shape[]> = {
  // Crónica: un perfil de suelo con dos horizontes, como las muestras de la Crónica.
  chronicle: [
    { d: 'M4 3h16v18H4z' },
    { d: 'M4 9c2.7-1.5 5.3 1.5 8 0s5.3-1.5 8 0' },
    { d: 'M4 15c2.7 1.5 5.3-1.5 8 0s5.3 1.5 8 0' },
  ],
  // Socios: un abanico de tres tubos que se ramifican desde un copo, como el plasmodio.
  partners: [
    { circle: [5.5, 18.5, 2] },
    { d: 'M7 17c3-2 5-6 6-11' },
    { d: 'M7.5 18c4-1 7-3 10-7' },
    { d: 'M7.5 19.5c4 .5 8 0 12.5-2' },
    { d: 'M13 6c1-1 2-1.5 3-1.5' },
  ],
  info: [{ circle: [12, 12, 8.5] }, { d: 'M12 11v6' }, { circle: [12, 7.6, 0.6], fill: true }],
  wind: [{ d: 'M3 8h11a3 3 0 1 0-3-3' }, { d: 'M3 12h15a3 3 0 1 1-3 3' }, { d: 'M3 16h7' }],
  generators: [{ d: 'M4 20c3-3 4-6 6-9s5-6 10-7' }, { d: 'M10 11c1.5 1 4 1.5 6 4' }],
  upgrades: [{ d: 'M12 20V9' }, { d: 'M12 9c0-3 2-5 5-5 0 3-2 5-5 5zM12 13c0-3-2-5-5-5 0 3 2 5 5 5z' }],
  sporulate: [
    { circle: [12, 12, 2.2], fill: true },
    { circle: [5, 7, 1.2], fill: true },
    { circle: [18.5, 6, 1], fill: true },
    { circle: [19, 16, 1.3], fill: true },
    { circle: [6, 17.5, 1], fill: true },
    { circle: [12, 4, 0.8], fill: true },
  ],
  mutations: [
    { d: 'M7 3c0 6 10 6 10 12s-10 3-10 6' },
    { d: 'M17 3c0 6-10 6-10 12' },
    { d: 'M9 6h6M8.5 18h7' },
  ],
  achievements: [
    { circle: [12, 10, 6] },
    { d: 'M9 15.5 8 21l4-2 4 2-1-5.5' },
    { circle: [12, 10, 2.2], fill: true },
  ],
  stats: [{ d: 'M4 20h16' }, { d: 'M7 20v-6M12 20V8M17 20v-9' }],
  settings: [{ d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }, { circle: [15, 7, 2] }, { circle: [9, 17, 2] }],
  close: [{ d: 'M6 6l12 12M18 6 6 18' }],
  drop: [{ d: 'M12 3c3 4.5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6.5 6-11z' }],
  spore: [{ circle: [12, 12, 3], fill: true }, { circle: [12, 12, 7] }],
  lock: [{ d: 'M7 11V8a5 5 0 0 1 10 0v3' }, { d: 'M5.5 11h13v9h-13z' }],
  click: [{ circle: [12, 12, 3], fill: true }, { d: 'M12 3v3M12 18v3M3 12h3M18 12h3' }],
  global: [{ d: 'M12 21c-5 0-8-4-8-8 4 0 8 3 8 8zM12 21c5 0 8-4 8-8-4 0-8 3-8 8z' }, { d: 'M12 21V5' }],
  synergy: [{ circle: [8.5, 12, 4.5] }, { circle: [15.5, 12, 4.5] }],
};

function draw(shapes: readonly Shape[], className: string): SVGSVGElement {
  const children = shapes.map((shape) => {
    const fill = shape.fill ? 'currentColor' : 'none';
    if ('d' in shape) return svg('path', { d: shape.d, fill });
    if ('circle' in shape) {
      const [cx, cy, r] = shape.circle;
      return svg('circle', { cx, cy, r, fill });
    }
    const [cx, cy, rx, ry] = shape.ellipse;
    return svg('ellipse', { cx, cy, rx, ry, fill });
  });
  return svg(
    'svg',
    {
      class: className,
      viewBox: '0 0 24 24',
      width: 24,
      height: 24,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    children,
  );
}

export function generatorIcon(id: GeneratorId): SVGSVGElement {
  return draw(GENERATOR_SHAPES[id], 'icon icon--generator');
}

export function uiIcon(name: UiIcon): SVGSVGElement {
  return draw(UI_SHAPES[name], `icon icon--${name}`);
}

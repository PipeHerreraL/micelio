/**
 * Los sitios de la placa como botones reales (docs/ROADMAP.md, fase 9; PROMPT.md §16): una capa
 * sobre el lienzo con un botón de 44 × 44 px por sitio, o una lista. El lienzo es decorativo
 * (aria-hidden); todo lo que dice está aquí con texto.
 *
 * - Un solo sitio en el orden de tabulación (foco itinerante). Flechas: al sitio más cercano en
 *   esa dirección dentro de un cono de ±50°; Inicio y Fin: primero y último. Enter o Espacio usan
 *   la herramienta (es un <button>). 1, 2 y 3 cambian de herramienta solo con el foco aquí dentro
 *   (WCAG 2.1.4).
 * - Los botones se crean una vez por placa y disposición; al cambiar el estado solo cambian su
 *   nombre accesible, aria-disabled y sus clases: el foco nunca se pierde.
 * - touch-action: manipulation, nunca none: deslizar sobre la placa desplaza la página
 *   (BUG-JOURNAL #14).
 */
import { formatCount } from '../../../i18n/index.ts';
import { partnerPlural, partnerText } from '../../../i18n/partners/index.ts';
import { Disposer, h, setAttr, setText, toggleClass } from '../../../ui/dom.ts';
import { D_ALIVE } from '../../../data/plasmodium.ts';
import { PLATES } from '../../../data/plasmodium-plates.ts';
import { siteAction, type PlateTool, type SiteAction } from '../actions.ts';
import { plateGraph } from '../graph.ts';
import type { PlasmodiumState } from '../state.ts';
import { sitePosition, type PlateLayout } from './plate-layout.ts';

const pt = (key: string, params?: Record<string, string | number>): string =>
  partnerText('plasmodium', key, params);

export const TOOLS: readonly PlateTool[] = ['food', 'lamp', 'remove'];

const ACTION_KEYS: Record<SiteAction, string> = {
  placeFood: 'site.action.placeFood',
  placeLamp: 'site.action.placeLamp',
  remove: 'site.action.remove',
  toFood: 'site.action.toFood',
  toLamp: 'site.action.toLamp',
  noFood: 'site.action.noFood',
  noLamp: 'site.action.noLamp',
  fixed: 'site.action.fixed',
  blocked: 'site.action.fixed',
  empty: 'site.action.empty',
  foodLocked: 'site.action.foodLocked',
};

/** Acciones que no cambian nada: el botón queda aria-disabled (sigue enfocable). */
const INERT: ReadonlySet<SiteAction> = new Set<SiteAction>([
  'noFood',
  'noLamp',
  'fixed',
  'blocked',
  'empty',
  'foodLocked',
]);

export type SiteContent = 'empty' | 'food' | 'foodFixed' | 'lamp' | 'lampFixed';

export function siteContent(p: Readonly<PlasmodiumState>, site: number): SiteContent {
  const def = PLATES[p.plate];
  const record = p.plates[p.plate];
  if (def?.fixedFoods.includes(site)) return 'foodFixed';
  if (def?.blocked.includes(site)) return 'lampFixed';
  if (record?.foods.includes(site)) return 'food';
  if (record?.lamps.includes(site)) return 'lamp';
  return 'empty';
}

export interface SiteHandlers {
  activate(site: number): void;
  setTool(tool: PlateTool): void;
  hover(site: number | null): void;
}

export interface PlateSites {
  /** Capa de botones (va encima del lienzo). */
  layer: HTMLElement;
  /** Vista de lista (alternativa a la capa). */
  list: HTMLElement;
  /** Rehace los botones para una placa y una disposición. */
  build(layout: PlateLayout, describedBy: string): void;
  /** Nombres accesibles, estados y clases según el estado, la herramienta y la sugerencia. */
  update(p: Readonly<PlasmodiumState>, tool: PlateTool, suggestion: number | null): void;
  containsFocus(): boolean;
  focusFirst(): void;
  destroy(): void;
}

/** Sitio vecino en la dirección (dx, dy) dentro de un cono de ±50°; -1 si no hay. */
function neighbor(points: readonly { x: number; y: number }[], from: number, dx: number, dy: number): number {
  const origin = points[from];
  if (!origin) return -1;
  const cone = Math.cos((50 * Math.PI) / 180);
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  points.forEach((pt2, i) => {
    if (i === from) return;
    const vx = pt2.x - origin.x;
    const vy = pt2.y - origin.y;
    const dist = Math.hypot(vx, vy);
    if (dist === 0) return;
    const cos = (vx * dx + vy * dy) / dist;
    if (cos < cone) return;
    const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    const score = dist * (1 + 2 * sin);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export function createPlateSites(handlers: SiteHandlers): PlateSites {
  const disposer = new Disposer();
  let buildDisposer = new Disposer();
  const layer = h('div', { class: 'plate__sites', attrs: { role: 'group' } });
  const list = h('ol', { class: 'plate__list' });
  let buttons: HTMLButtonElement[] = [];
  let rows: { text: HTMLElement; button: HTMLButtonElement }[] = [];
  let points: { x: number; y: number }[] = [];
  let plate = -1;
  let portrait = false;
  let current = 0;
  let lastLabels: string[] = [];

  function setCurrent(site: number, focus: boolean): void {
    if (site < 0 || site >= buttons.length) return;
    buttons[current]?.setAttribute('tabindex', '-1');
    current = site;
    const button = buttons[site];
    button?.setAttribute('tabindex', '0');
    if (focus) button?.focus();
  }

  function onKey(event: KeyboardEvent, site: number): void {
    const keyTool =
      event.key === '1' ? 'food' : event.key === '2' ? 'lamp' : event.key === '3' ? 'remove' : null;
    if (keyTool) {
      event.preventDefault();
      handlers.setTool(keyTool);
      return;
    }
    let next: number;
    if (event.key === 'ArrowRight') next = neighbor(points, site, 1, 0);
    else if (event.key === 'ArrowLeft') next = neighbor(points, site, -1, 0);
    else if (event.key === 'ArrowDown') next = neighbor(points, site, 0, 1);
    else if (event.key === 'ArrowUp') next = neighbor(points, site, 0, -1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    if (next >= 0) setCurrent(next, true);
  }

  return {
    layer,
    list,
    build(layout, describedBy) {
      const keepFocus = layer.contains(document.activeElement) || list.contains(document.activeElement);
      buildDisposer.dispose();
      buildDisposer = new Disposer();
      const def = PLATES[layout.plate];
      if (!def) return;
      if (layout.plate !== plate) current = 0;
      plate = layout.plate;
      portrait = layout.orientation === 'portrait';
      const n = def.x.length;
      points = Array.from({ length: n }, (_, i) => sitePosition(layout, i));
      setAttr(
        layer,
        'aria-label',
        pt('plate.label', { name: pt(`plate.${def.id}.name`), count: formatCount(n) }),
      );
      setAttr(layer, 'aria-describedby', describedBy);
      toggleClass(layer, 'is-inert', layout.list);
      buttons = points.map((point, site) => {
        const button = h('button', {
          class: 'plate__site',
          attrs: {
            type: 'button',
            tabindex: site === current ? 0 : -1,
            style: `left:${((point.x / layout.width) * 100).toFixed(3)}%;top:${((point.y / layout.height) * 100).toFixed(3)}%`,
          },
        });
        buildDisposer.listen(button, 'click', () => {
          setCurrent(site, false);
          handlers.activate(site);
        });
        buildDisposer.listen(button, 'keydown', (e) => {
          onKey(e, site);
        });
        buildDisposer.listen(button, 'focus', () => {
          if (current !== site) setCurrent(site, false);
        });
        buildDisposer.listen(button, 'pointerenter', () => {
          handlers.hover(site);
        });
        buildDisposer.listen(button, 'pointerleave', () => {
          handlers.hover(null);
        });
        return button;
      });
      // En la lista los sitios del lienzo no son interactivos: los botones viven en las filas.
      layer.replaceChildren(...(layout.list ? [] : buttons));
      rows = Array.from({ length: n }, (_, site) => {
        const text = h('span', { class: 'plate__row-text' });
        const button = h('button', {
          class: 'button button--quiet plate__row-button',
          attrs: { type: 'button' },
        });
        buildDisposer.listen(button, 'click', () => {
          handlers.activate(site);
        });
        return { text, button };
      });
      list.replaceChildren(...rows.map((row) => h('li', { class: 'plate__row' }, [row.text, row.button])));
      lastLabels = [];
      if (keepFocus) {
        if (layout.list) rows[0]?.button.focus();
        else setCurrent(current, true);
      }
    },
    update(p, tool, suggestion) {
      const def = PLATES[p.plate];
      if (!def || p.plate !== plate) return;
      const g = plateGraph(p.plate);
      buttons.forEach((button, site) => {
        const content = siteContent(p, site);
        const action = siteAction(p, site, tool);
        const contentText = pt(`site.content.${content}`);
        const actionText = pt(ACTION_KEYS[action]);
        const suggested = suggestion === site;
        const label = pt(suggested ? 'site.label.suggested' : 'site.label', {
          n: formatCount(site + 1),
          content: contentText,
          action: actionText,
        });
        // Fila de la lista: posición, contenido, tubos vivos que llegan y si toca la sustancia.
        let tubes = 0;
        let substance = false;
        for (let t = g.adjStart[site] ?? 0; t < (g.adjStart[site + 1] ?? 0); t += 1) {
          const e = g.adjEdge[t] ?? 0;
          if ((p.conductivity[e] ?? 0) > D_ALIVE) tubes += 1;
          if (g.substance[e]) substance = true;
        }
        const key = `${label}|${tubes}`;
        if (lastLabels[site] !== key) {
          lastLabels[site] = key;
          setAttr(button, 'aria-label', label);
          setAttr(button, 'aria-disabled', INERT.has(action) ? 'true' : null);
          button.dataset.content = content;
          toggleClass(button, 'is-suggested', suggested);
          const row = rows[site];
          if (row) {
            // «Fila, columna» de la imagen que se ve al lado. Girada (toScreen: x' = filas − y,
            // y' = x), la fila sale de la x de la placa y la columna de la y contada desde la
            // derecha; con las de los datos, «fila 1, columna 1» caía arriba a la derecha (UI-7).
            const x = Math.floor(def.x[site] ?? 0);
            const y = Math.floor(def.y[site] ?? 0);
            const parts = [
              pt('site.row', {
                n: formatCount(site + 1),
                position: pt('site.position', {
                  row: formatCount(portrait ? x + 1 : y + 1),
                  col: formatCount(portrait ? def.rows - y : x + 1),
                }),
                content: contentText,
                tubes: partnerPlural('plasmodium', 'site.tubes', tubes),
              }),
            ];
            if (substance) parts.push(pt(def.substance === 'salt' ? 'site.salt' : 'site.quinine'));
            if (suggested) parts.push(pt('site.suggested'));
            setText(row.text, parts.join(' · '));
            setText(row.button, actionText);
            setAttr(row.button, 'aria-label', label);
            setAttr(row.button, 'aria-disabled', INERT.has(action) ? 'true' : null);
          }
        }
      });
    },
    containsFocus() {
      return layer.contains(document.activeElement) || list.contains(document.activeElement);
    },
    focusFirst() {
      if (layer.childElementCount > 0) setCurrent(0, true);
      else rows[0]?.button.focus();
    },
    destroy() {
      buildDisposer.dispose();
      disposer.dispose();
    },
  };
}

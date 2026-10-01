/**
 * Ayudas mínimas de DOM. Los componentes crean sus nodos una vez y luego solo escriben
 * cuando el valor cambia: nunca se reconstruye el DOM con innerHTML en cada tick.
 */

type Child = Node | string | null | undefined | false;

export interface ElementProps {
  class?: string;
  id?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
}

/** Crea un elemento con clase, texto, atributos e hijos. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.id) el.id = props.id;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  children: readonly SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  for (const child of children) el.append(child);
  return el;
}

const lastText = new WeakMap<Node, string>();

/** Escribe textContent solo si cambió. */
export function setText(el: Node, value: string): void {
  if (lastText.get(el) === value) return;
  lastText.set(el, value);
  el.textContent = value;
}

/** Escribe un atributo solo si cambió; null lo quita. */
export function setAttr(el: Element, name: string, value: string | null): void {
  const current = el.getAttribute(name);
  if (value === null) {
    if (current !== null) el.removeAttribute(name);
    return;
  }
  if (current !== value) el.setAttribute(name, value);
}

export function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

export function setDisabled(el: HTMLButtonElement | HTMLInputElement, disabled: boolean): void {
  if (el.disabled !== disabled) el.disabled = disabled;
}

export function toggleClass(el: Element, name: string, on: boolean): void {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

const lastProgress = new WeakMap<HTMLElement, string>();

/**
 * Ancho de una barra de progreso (0–1) como transform, sin provocar reflow. El último valor
 * se guarda aparte: el navegador normaliza al leer («scaleX(0.500)» vuelve como
 * «scaleX(0.5)») y la comparación con el estilo nunca coincidiría.
 */
export function setProgress(el: HTMLElement, fraction: number): void {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const value = `scaleX(${clamped.toFixed(3)})`;
  if (lastProgress.get(el) === value) return;
  lastProgress.set(el, value);
  el.style.transform = value;
}

/** Reinicia una animación CSS quitando y volviendo a poner su clase en el mismo nodo. */
export function restartAnimation(el: HTMLElement, className: string): void {
  el.classList.remove(className);
  // Leer la geometría fuerza un reflow: sin él, quitar y poner la clase no reinicia nada.
  el.getBoundingClientRect();
  el.classList.add(className);
}

/** Bolsa de bajas: cada componente registra aquí sus listeners y los quita en destroy(). */
export class Disposer {
  private readonly items: (() => void)[] = [];

  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen(
    target: EventTarget,
    type: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen(
    target: EventTarget,
    type: string,
    handler: (event: never) => void,
    options?: AddEventListenerOptions,
  ): void {
    const fn = handler as EventListener;
    target.addEventListener(type, fn, options);
    this.items.push(() => {
      target.removeEventListener(type, fn, options);
    });
  }

  add(fn: () => void): void {
    this.items.push(fn);
  }

  dispose(): void {
    while (this.items.length > 0) this.items.pop()?.();
  }
}

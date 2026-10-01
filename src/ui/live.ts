/**
 * Región aria-live en modo polite. Solo anuncia logros, lluvia y esporulación
 * (PROMPT.md §16); nunca el contador, que cambia 10 veces por segundo.
 *
 * Los avisos que llegan en el mismo frame (tres logros de golpe al comprar ×100) se juntan
 * en un solo texto: si cada uno pisara al anterior, el lector solo leería el último.
 */
import { h } from './dom.ts';

/** Tope de avisos por lote: volver de offline puede otorgar muchos logros a la vez. */
const MAX_BATCH = 5;

let region: HTMLDivElement | null = null;
let clearTimer: number | undefined;
let pending: string[] = [];

export function createLiveRegion(label: string): HTMLDivElement {
  region = h('div', {
    class: 'visually-hidden',
    attrs: { 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status', 'aria-label': label },
  });
  return region;
}

export function announce(message: string): void {
  if (!region) return;
  pending.push(message);
  // Vaciar y volver a escribir hace que el lector repita un aviso idéntico.
  region.textContent = '';
  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => {
    if (!region) return;
    region.textContent = pending.slice(-MAX_BATCH).join(' ');
    pending = [];
  }, 50);
}

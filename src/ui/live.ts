/**
 * Región aria-live en modo polite. Solo anuncia logros, lluvia y esporulación
 * (PROMPT.md §16); nunca el contador, que cambia 10 veces por segundo.
 */
import { h } from './dom.ts';

let region: HTMLDivElement | null = null;
let clearTimer: number | undefined;

export function createLiveRegion(label: string): HTMLDivElement {
  region = h('div', {
    class: 'visually-hidden',
    attrs: { 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status', 'aria-label': label },
  });
  return region;
}

export function announce(message: string): void {
  if (!region) return;
  // Vaciar y volver a escribir hace que el lector repita un aviso idéntico.
  region.textContent = '';
  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => {
    if (region) region.textContent = message;
  }, 50);
}

/**
 * Región aria-live en modo polite. Solo anuncia logros, lluvia y esporulación
 * (PROMPT.md §16); nunca el contador, que cambia 10 veces por segundo.
 *
 * Los avisos que llegan en el mismo frame (tres logros de golpe al comprar ×100) se juntan
 * en un solo texto: si cada uno pisara al anterior, el lector solo leería el último.
 *
 * La región se crea una vez y vive fuera de la interfaz que se reconstruye (idioma,
 * notación, importar): una región recién insertada puede perder el aviso que llega justo
 * después.
 */
import { h } from './dom.ts';
import { isModalOpen, onModalClosed } from './modal.ts';

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

/** Escribe el lote pendiente. Vaciar y volver a escribir hace que el lector repita un aviso idéntico. */
function flush(): void {
  if (!region) return;
  region.textContent = '';
  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => {
    // Con un modal abierto la región es inerte y el lector no la oiría: el lote espera.
    if (!region || isModalOpen()) return;
    region.textContent = pending.slice(-MAX_BATCH).join(' ');
    pending = [];
  }, 50);
}

export function announce(message: string): void {
  if (!region) return;
  pending.push(message);
  if (pending.length > MAX_BATCH) pending.splice(0, pending.length - MAX_BATCH);
  // Detrás de un modal (el informe offline, una confirmación) todo es inerte: el aviso se
  // guarda y se lee al cerrarlo.
  if (isModalOpen()) return;
  flush();
}

onModalClosed(() => {
  if (pending.length > 0) flush();
});

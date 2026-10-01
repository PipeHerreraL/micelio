/**
 * Cola de eventos del núcleo (ARCHITECTURE.md §4.7). El núcleo emite; main.ts vacía la
 * cola en cada frame y la reparte a avisos, sonido y canvas. El simulador la descarta.
 */
import type { GeneratorId } from '../data/generators.ts';
import type { MutationId } from '../data/mutations.ts';
import type { RainEffectKind } from '../data/rain.ts';
import type { Num } from './num.ts';
import type { TimedEffectKind } from './state.ts';

export type GameEvent =
  | { type: 'click'; value: Num }
  | { type: 'buyGenerator'; id: GeneratorId; count: number }
  | { type: 'buyUpgrade'; id: string }
  | { type: 'buyMutation'; id: MutationId }
  | { type: 'achievement'; id: string }
  | { type: 'rainSpawn' }
  | { type: 'rainExpired' }
  | { type: 'rainCaught'; effect: RainEffectKind; amount: Num; duration: number }
  | { type: 'effectEnd'; kind: TimedEffectKind }
  | { type: 'sporulate'; gained: number; level: number }
  | { type: 'reveal'; key: string };

/**
 * Tope de la cola: si nadie la vacía (el simulador, una pestaña oculta), no crece sin
 * límite. Perder eventos viejos solo afecta a avisos y sonidos, nunca al estado.
 */
const MAX_QUEUE = 256;

let queue: GameEvent[] = [];

export function emit(event: GameEvent): void {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(event);
}

/** Devuelve los eventos pendientes y vacía la cola. */
export function drain(): GameEvent[] {
  const out = queue;
  queue = [];
  return out;
}

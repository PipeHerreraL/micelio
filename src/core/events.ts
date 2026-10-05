/**
 * Cola de eventos del núcleo (ARCHITECTURE.md §4.7). El núcleo emite; main.ts vacía la
 * cola en cada frame y la reparte a avisos, sonido y canvas. El simulador la descarta.
 */
import type { AdaptationId } from '../data/adaptations.ts';
import type { BiomeAdaptationId, BiomeId, DestinationId } from '../data/biomes.ts';
import type { GeneratorId } from '../data/generators.ts';
import type { MutationId } from '../data/mutations.ts';
import type { PartnerId } from '../partners/ids.ts';
import type { PartnerEvent } from '../partners/registry.ts';
import type { RainEffectKind } from '../data/rain.ts';
import type { Num } from './num.ts';
import type { TimedEffectKind } from './state.ts';

export type GameEvent =
  | { type: 'click'; value: Num }
  | { type: 'buyGenerator'; id: GeneratorId; count: number }
  | { type: 'buyUpgrade'; id: string }
  | { type: 'buyMutation'; id: MutationId }
  | { type: 'buyAdaptation'; id: AdaptationId; rank: number }
  | { type: 'achievement'; id: string }
  | { type: 'rainSpawn' }
  | { type: 'rainExpired' }
  | { type: 'rainCaught'; effect: RainEffectKind; amount: Num; duration: number }
  /** Una gota del Chocó que nadie atrapó cayó sola y aplicó su efecto. */
  | { type: 'rainFell'; effect: RainEffectKind; amount: Num; duration: number }
  | { type: 'effectEnd'; kind: TimedEffectKind }
  | { type: 'sporulate'; gained: number; level: number }
  /** Se cerró el Acto I (systems/journey.ts). */
  | { type: 'actOneClosed' }
  /** Se colonizó un bioma; `factor` es el linaje tras colonizarlo. */
  | { type: 'colonized'; biome: DestinationId; leg: number; factor: number }
  /** El linaje viajó; `gained` son las esporas de la partida que terminó (0 si no esporuló). */
  | { type: 'disperse'; from: BiomeId; to: BiomeId; leg: number; gained: number }
  /** Se cumplió El regreso (fase 10): nivel 500 en el natal del tramo 5. */
  | { type: 'returned' }
  | { type: 'buyBiomeAdaptation'; id: BiomeAdaptationId; rank: number }
  | { type: 'reveal'; key: string }
  /** Llegó un socio (systems/partners.ts). */
  | { type: 'partnerUnlocked'; partner: PartnerId }
  /** Eventos propios de cada socio (los emite su modelo). */
  | PartnerEvent;

/**
 * Tope de la cola: si nadie la vacía (el simulador, una pestaña oculta), no crece sin
 * límite. Perder eventos viejos solo afecta a avisos y sonidos, nunca al estado.
 */
const MAX_QUEUE = 256;

/**
 * Dos arreglos que se turnan: drain() entrega uno y la cola pasa a escribir en el otro, ya
 * vaciado. main.ts vacía la cola en cada frame y el bucle de render no debe crear objetos
 * (AGENTS.md, Rendimiento). Se descartó devolver un arreglo vacío compartido cuando no hay
 * eventos: los frames con eventos seguirían creando un arreglo nuevo.
 */
let queue: GameEvent[] = [];
let spare: GameEvent[] = [];

export function emit(event: GameEvent): void {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(event);
}

/**
 * Devuelve los eventos pendientes y vacía la cola. El arreglo devuelto se reutiliza: solo es
 * válido hasta la siguiente llamada a drain(), así que quien quiera guardarlo debe copiarlo.
 * Lo que se emita mientras se recorre va a la otra cola y llega en el siguiente drain().
 */
export function drain(): readonly GameEvent[] {
  const out = queue;
  spare.length = 0;
  queue = spare;
  spare = out;
  return out;
}

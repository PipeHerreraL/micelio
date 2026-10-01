/**
 * Contrato de un socio (docs/ROADMAP.md, fase 9; ARCHITECTURE.md §4.29). Cada socio tiene dos
 * mitades:
 *
 * - el núcleo (`PartnerCore`), en el paquete inicial: valida su estado, decide cuándo llega, apunta
 *   el tiempo y da ventajas de calidad de vida a la red;
 * - el modelo (`PartnerRuntime`), que llega aparte con import(): avanza el estado y redacta los
 *   avisos. Node y Vitest lo importan directamente.
 *
 * Reglas comunes: su propia moneda, su propio azar y sus propios logros; nada del socio entra en
 * computeDerived ni avanza en tick().
 */
import type { SoundCue } from '../audio/sound.ts';
import type { GameEvent } from '../core/events.ts';
import type { GameState } from '../core/state.ts';
import type { PartnerId } from './ids.ts';
import type { PartnerEvent, PartnerStates } from './registry.ts';

/** Cómo llegó el tiempo: en vivo, al volver de segundo plano o al abrir el juego (offline). */
export type ElapsedMode = 'live' | 'background' | 'offline';

export interface PartnerStateBase {
  /** Ms de reloj del socio apuntados mientras su modelo no estaba cargado. Entero, 0 ≤ pendingMs ≤ tope. */
  pendingMs: number;
}

/** Lo que va en el paquete inicial: validar, llegar, apuntar tiempo y dar ventajas a la red. */
export interface PartnerCore<S extends PartnerStateBase> {
  readonly id: PartnerId;
  /** Sal de la semilla propia: mixSeed(state.rngSeed, seedSalt), leyendo la común sin avanzarla. */
  readonly seedSalt: number;
  /** Regla de llegada sobre el estado de la red. Pura: no muta ni consume azar. */
  canUnlock(state: Readonly<GameState>): boolean;
  /** Estado al llegar. */
  create(seed: number): S;
  /** Reconstruye el estado desde datos no confiables, campo a campo; null si no es válido. */
  validate(raw: unknown): S | null;
  /** Tope (s) y eficiencia del tiempo aplicado sin estar en vivo. */
  elapsedRule(pstate: Readonly<S>, mode: ElapsedMode): { capSeconds: number; efficiency: number };
  /** Ventajas de calidad de vida para la red. Nunca se leen en computeDerived. */
  perks(pstate: Readonly<S>): Partial<FungalPerks>;
  /** Reacciona a un evento de la red (p. ej. la lluvia). Solo escribe en el estado del socio. */
  onFungalEvent?(pstate: S, event: GameEvent): void;
}

/** Lo que llega aparte. Puro: sin DOM ni reloj. */
export interface PartnerRuntime<K extends PartnerId = PartnerId> {
  readonly id: K;
  /**
   * Avanza `ms` (entero) del reloj del socio. Trocear un intervalo en llamadas más cortas da el
   * mismo resultado bit a bit mientras ninguna llamada junte más de los segundos que el socio
   * aplica paso a paso.
   */
  advance(state: GameState, pstate: PartnerStates[K], ms: number): void;
  /** Aviso de un evento propio, con su catálogo de textos. El simulador no lo llama. */
  notice(event: Extract<PartnerEvent, { type: K }>): PartnerNotice | null;
}

export interface PartnerNotice {
  text: string;
  title: string | null;
  /** Mismos nombres que ToastKind; null = sin aviso flotante (solo anuncio). */
  tone: 'achievement' | 'spore' | 'info' | null;
  cue: SoundCue | null;
  announce: boolean;
}

/** Calidad de vida que los socios dan a la red; se combina con OR entre socios. */
export interface FungalPerks {
  /** Poda: la autocompra puede elegir por amortización. */
  autobuyByPayback: boolean;
  /** Camino corto: Esporular muestra el ritmo de esporas. */
  sporeRate: boolean;
}

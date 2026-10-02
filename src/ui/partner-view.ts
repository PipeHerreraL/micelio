/**
 * Contrato de la vista de un socio (llega aparte; ver ui/partner-loader.ts). Solo tipos: el
 * paquete inicial no carga código de ninguna vista.
 */
import type { GameEvent } from '../core/events.ts';
import type { Store } from './store.ts';

export interface PartnerView {
  root: HTMLElement;
  /** Refresco a 10 Hz con la pestaña Socios a la vista. */
  update(): void;
  /** Cada frame, con la pestaña a la vista o la placa ampliada. */
  frame(now: number): void;
  onEvent(event: GameEvent): void;
  setReducedMotion(on: boolean): void;
  destroy(): void;
}

export interface PartnerViewOptions {
  reducedMotion: boolean;
  /** «Ver en Logros». */
  toAchievements(): void;
  /** «Releer la lámina» de una placa cartografiada. */
  rereadPlate(plate: number): void;
}

export interface PartnerViewModule {
  createPartnerView(store: Store, options: PartnerViewOptions): PartnerView;
}

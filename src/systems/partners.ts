/**
 * Los socios en el juego (docs/ROADMAP.md, fase 9; ARCHITECTURE.md §4.29): cuándo llegan, cómo
 * reciben el tiempo y qué ventajas dan a la red.
 *
 * Reparto: el núcleo de la red solo comprueba la llegada (tick y tiempo aplicado de golpe). El
 * tiempo del socio lo apunta main.ts (en vivo, al volver y al abrir) y lo avanza su modelo, que
 * llega aparte; mientras no llega, el tiempo queda pendiente y se guarda con la partida. El
 * simulador de la red nunca ejecuta un modelo de socio: sus 42 métricas no pueden moverse.
 */
import { emit, type GameEvent } from '../core/events.ts';
import { mixSeed } from '../core/rng.ts';
import type { GameState } from '../core/state.ts';
import { PARTNER_IDS, type PartnerId } from '../partners/ids.ts';
import { PARTNER_CORES, partnerRuntime } from '../partners/registry.ts';
import type { ElapsedMode, FungalPerks } from '../partners/types.ts';

/**
 * Trae a cada socio que cumpla su regla de llegada. Lee la semilla común sin avanzarla (mixSeed),
 * no invalida derivados (el socio no entra en ningún selector) ni toca nada de la red.
 */
export function checkPartnerUnlocks(state: GameState): void {
  for (const id of PARTNER_IDS) {
    if (state.partners[id] !== null) continue;
    const core = PARTNER_CORES[id];
    if (!core.canUnlock(state)) continue;
    state.partners[id] = core.create(mixSeed(state.rngSeed, core.seedSalt));
    emit({ type: 'partnerUnlocked', partner: id });
  }
}

// ---------------------------------------------------------------------------------------
// Errores del modelo

type ErrorHandler = (id: PartnerId, error: unknown) => void;

/** Por defecto se relanza: las pruebas y el simulador lo ven. main.ts instala el suyo. */
let onError: ErrorHandler = (_id, error) => {
  throw error;
};

export function setPartnerErrorHandler(handler: ErrorHandler): void {
  onError = handler;
}

/**
 * Avanza `ms` del socio con su modelo sobre una copia y la copia solo si termina: si el modelo
 * lanza a mitad, el estado del socio queda como estaba (con el tiempo pendiente apuntado) y nada
 * se cobra dos veces. La copia cuesta unos pocos kB (la red de una placa).
 */
function runModel(state: GameState, id: PartnerId, ms: number): void {
  const runtime = partnerRuntime(id);
  const p = state.partners[id];
  if (!runtime || !p) return;
  const draft = structuredClone(p);
  const total = draft.pendingMs + ms;
  draft.pendingMs = 0;
  try {
    if (total > 0) runtime.advance(state, draft, total);
  } catch (error) {
    // El tiempo no se pierde: queda apuntado con su tope, y el bucle de la red sigue.
    const rule = PARTNER_CORES[id].elapsedRule(p, 'live');
    p.pendingMs = Math.min(rule.capSeconds * 1000, p.pendingMs + ms);
    onError(id, error);
    return;
  }
  Object.assign(p, draft);
}

/** Apunta `ms` como pendiente, con el tope del socio. */
function addPending(state: GameState, id: PartnerId, ms: number, mode: ElapsedMode): void {
  const p = state.partners[id];
  if (!p || !(ms > 0)) return;
  const rule = PARTNER_CORES[id].elapsedRule(p, mode);
  p.pendingMs = Math.min(rule.capSeconds * 1000, p.pendingMs + ms);
}

/**
 * En vivo (main.ts tras cada tick; el simulador del socio cada segundo): con el modelo cargado
 * vacía el pendiente y avanza `ms`; sin él, los apunta. `ms` se redondea a ms enteros: el reloj
 * del socio no acumula deriva de coma flotante.
 */
export function advancePartners(state: GameState, ms: number): void {
  if (!(ms > 0) || !Number.isFinite(ms)) return;
  const whole = Math.round(ms);
  for (const id of PARTNER_IDS) {
    if (state.partners[id] === null) continue;
    if (partnerRuntime(id)) runModel(state, id, whole);
    else addPending(state, id, whole, 'live');
  }
}

export interface ElapsedNote {
  partner: PartnerId;
  /** Segundos que recibió el socio (tras su tope, antes de la eficiencia). */
  seconds: number;
  efficiency: number;
  capped: boolean;
}

/**
 * Tiempo aplicado de golpe (al abrir el juego o al volver de segundo plano), con el tope y la
 * eficiencia de cada socio. main.ts lo llama antes que el de la red: un socio que llega al final
 * del tiempo de la red no recibe el tiempo en que no existía. Devuelve lo apuntado (informe).
 */
export function applyPartnersElapsed(
  state: GameState,
  seconds: number,
  mode: 'offline' | 'background',
): ElapsedNote[] {
  const notes: ElapsedNote[] = [];
  if (!(seconds > 0) || !Number.isFinite(seconds)) return notes;
  for (const id of PARTNER_IDS) {
    const p = state.partners[id];
    if (p === null) continue;
    const rule = PARTNER_CORES[id].elapsedRule(p, mode);
    const applied = Math.min(seconds, rule.capSeconds);
    addPending(state, id, Math.round(applied * rule.efficiency * 1000), mode);
    notes.push({
      partner: id,
      seconds: applied,
      efficiency: rule.efficiency,
      capped: seconds > rule.capSeconds,
    });
    if (partnerRuntime(id)) runModel(state, id, 0);
  }
  return notes;
}

/**
 * Acción: un evento de la red llega a los socios (p. ej. la lluvia humedece el agar). main.ts la
 * despacha al vaciar la cola; systems/rain.ts no cambia, así el natal sale idéntico.
 */
export function noteFungalEvent(state: GameState, payload: { event: GameEvent }): void {
  for (const id of PARTNER_IDS) {
    const p = state.partners[id];
    if (p) PARTNER_CORES[id].onFungalEvent?.(p, payload.event);
  }
}

/** Ventajas de calidad de vida de todos los socios, combinadas con OR. Nunca en computeDerived. */
export function partnerPerks(state: Readonly<GameState>): FungalPerks {
  const out: FungalPerks = { autobuyByPayback: false, sporeRate: false };
  for (const id of PARTNER_IDS) {
    const p = state.partners[id];
    if (!p) continue;
    const perks = PARTNER_CORES[id].perks(p);
    out.autobuyByPayback ||= perks.autobuyByPayback ?? false;
    out.sporeRate ||= perks.sporeRate ?? false;
  }
  return out;
}

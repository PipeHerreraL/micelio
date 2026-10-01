/**
 * Registro de socios (docs/ROADMAP.md, fase 9; ARCHITECTURE.md §4.29). Un socio nuevo suma aquí
 * su estado, su núcleo, su modelo y su unión de eventos; nada del núcleo de la red cambia.
 */
import { PARTNER_IDS, type PartnerId } from './ids.ts';
import type { PlasmodiumEvent } from './plasmodium/events.ts';
import { plasmodiumCore, type PlasmodiumState } from './plasmodium/state.ts';
import type { PartnerCore, PartnerRuntime } from './types.ts';
import { isObject } from '../systems/validate.ts';

export interface PartnerStates {
  plasmodium: PlasmodiumState;
}

/** null = aún no ha llegado. */
export type PartnersState = { [K in PartnerId]: PartnerStates[K] | null };

export type PartnerEvent = PlasmodiumEvent;

export const PARTNER_CORES: { readonly [K in PartnerId]: PartnerCore<PartnerStates[K]> } = {
  plasmodium: plasmodiumCore,
};

/**
 * strict: un socio inválido invalida el guardado (guardar e importar comprueban así).
 * lenient: el socio inválido vuelve a null y se informa (cargar no pierde la red por un dato del
 * socio; quien llama deja copia de respaldo y avisa).
 */
export type ValidationMode = 'strict' | 'lenient';

export interface PartnersCheck {
  partners: PartnersState;
  /** Socios que no validaron y vuelven a null (solo en modo lenient). */
  reset: PartnerId[];
}

/** Valida el bloque de socios. Las claves desconocidas se descartan. */
export function validatePartners(raw: unknown, mode: ValidationMode): PartnersCheck | null {
  const partners = {} as PartnersState;
  const reset: PartnerId[] = [];
  if (!isObject(raw)) {
    if (mode === 'strict') return null;
    // Un bloque que no es objeto puede esconder un socio: se trata como socios inválidos (copia y
    // aviso), salvo que no exista (no hay nada que perder).
    for (const id of PARTNER_IDS) {
      partners[id] = null;
      if (raw !== undefined) reset.push(id);
    }
    return { partners, reset };
  }
  for (const id of PARTNER_IDS) {
    const value = raw[id];
    if (value === undefined || value === null) {
      partners[id] = null;
      continue;
    }
    const valid = PARTNER_CORES[id].validate(value);
    if (valid) {
      partners[id] = valid;
    } else {
      if (mode === 'strict') return null;
      partners[id] = null;
      reset.push(id);
    }
  }
  return { partners, reset };
}

// ---------------------------------------------------------------------------------------
// Modelos cargados (llegan aparte con import(); Node y Vitest los registran a mano)

/** Cada entrada guarda el modelo de su propio id (lo garantiza registerPartnerRuntime). */
const runtimes = new Map<PartnerId, unknown>();

export function registerPartnerRuntime<K extends PartnerId>(runtime: PartnerRuntime<K>): void {
  runtimes.set(runtime.id, runtime);
}

export function unregisterPartnerRuntime(id: PartnerId): void {
  runtimes.delete(id);
}

export function partnerRuntime<K extends PartnerId>(id: K): PartnerRuntime<K> | null {
  return (runtimes.get(id) as PartnerRuntime<K> | undefined) ?? null;
}

/**
 * Ids de los socios (docs/ROADMAP.md, fase 9). Hoja del grafo de módulos: core/state.ts importa
 * de aquí el valor `emptyPartners` y nada de este archivo importa valores de nadie, así que no hay
 * ciclos al cargar.
 */
import type { PartnersState } from './registry.ts';

export const PARTNER_IDS = ['plasmodium'] as const;
export type PartnerId = (typeof PARTNER_IDS)[number];

export function isPartnerId(value: unknown): value is PartnerId {
  return PARTNER_IDS.includes(value as PartnerId);
}

/** Todos los socios sin llegar (partida nueva y migración 5 → 6). Mismo patrón que emptyOwned(). */
export function emptyPartners(): PartnersState {
  const out = {} as PartnersState;
  for (const id of PARTNER_IDS) out[id] = null;
  return out;
}

/**
 * Los diez generadores. Solo datos: el texto visible vive en src/i18n con las claves
 * `gen.<id>.name` y `gen.<id>.flavor`.
 *
 * Costes y producciones base: tabla de PROMPT.md §7, que sale de un prototipo en Python.
 * Nuestro simulador (scripts/simulate.ts) los validó sin cambios; ver docs/BALANCE.md.
 */

import type { MutationId } from './mutations.ts';

export const GENERATOR_IDS = [
  'hypha',
  'rhizomorph',
  'primordium',
  'mushroom',
  'fairyRing',
  'mycorrhiza',
  'motherTree',
  'ancientForest',
  'malheur',
  'planetary',
] as const;

export type GeneratorId = (typeof GENERATOR_IDS)[number];

/** Cómo se desbloquea un generador más allá de poder pagarlo. */
export type GeneratorUnlock =
  { kind: 'always' } | { kind: 'sporulations'; count: number } | { kind: 'mutation'; id: MutationId };

export interface GeneratorDef {
  id: GeneratorId;
  /** Coste de la primera unidad (N), antes de descuentos. */
  baseCost: number;
  /** Producción de una unidad sin multiplicadores (N/s). */
  baseProduction: number;
  unlock: GeneratorUnlock;
}

/** Crecimiento del coste por unidad poseída (PROMPT.md §7). */
export const COST_GROWTH = 1.15;

export const GENERATORS: readonly GeneratorDef[] = [
  { id: 'hypha', baseCost: 10, baseProduction: 0.1, unlock: { kind: 'always' } },
  { id: 'rhizomorph', baseCost: 120, baseProduction: 1, unlock: { kind: 'always' } },
  { id: 'primordium', baseCost: 1300, baseProduction: 9, unlock: { kind: 'always' } },
  { id: 'mushroom', baseCost: 1.4e4, baseProduction: 55, unlock: { kind: 'always' } },
  { id: 'fairyRing', baseCost: 1.6e5, baseProduction: 320, unlock: { kind: 'always' } },
  { id: 'mycorrhiza', baseCost: 1.8e6, baseProduction: 1800, unlock: { kind: 'always' } },
  { id: 'motherTree', baseCost: 2.2e7, baseProduction: 1.05e4, unlock: { kind: 'always' } },
  { id: 'ancientForest', baseCost: 3e8, baseProduction: 6.5e4, unlock: { kind: 'always' } },
  { id: 'malheur', baseCost: 5e9, baseProduction: 4.2e5, unlock: { kind: 'sporulations', count: 1 } },
  {
    id: 'planetary',
    baseCost: 9e10,
    baseProduction: 2.9e6,
    unlock: { kind: 'mutation', id: 'beyondForest' },
  },
];

/** Unidades a las que la producción del generador se duplica (PROMPT.md §8). */
export const MILESTONES: readonly number[] = [25, 50, 100, 150, 200, 250, 300, 350, 400];

export function generatorIndex(id: GeneratorId): number {
  return GENERATOR_IDS.indexOf(id);
}

export function getGenerator(id: GeneratorId): GeneratorDef {
  const def = GENERATORS[generatorIndex(id)];
  if (!def) throw new Error(`Generador desconocido: ${id}`);
  return def;
}

export function isGeneratorId(value: unknown): value is GeneratorId {
  return typeof value === 'string' && (GENERATOR_IDS as readonly string[]).includes(value);
}

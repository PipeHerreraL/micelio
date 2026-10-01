/**
 * Mejoras: 40 de generador (cuatro por generador, ×2 cada una) y 10 de clic, globales y
 * sinergias. Solo datos; el texto vive en src/i18n con las claves `upg.<id>.name` y
 * `upg.<id>.flavor`.
 *
 * Umbrales y costes: PROMPT.md §8. Validados por el simulador; ver docs/BALANCE.md.
 */
import { GENERATORS, type GeneratorId } from './generators.ts';

export type UpgradeEffect =
  | { kind: 'generator'; target: GeneratorId; multiplier: number }
  | { kind: 'click'; multiplier: number }
  | { kind: 'clickPercent'; percent: number }
  | { kind: 'global'; multiplier: number }
  | { kind: 'synergy'; source: GeneratorId; target: GeneratorId; perUnit: number };

export type UpgradeCondition =
  { kind: 'owned'; id: GeneratorId; count: number } | { kind: 'runEarned'; amount: number };

export interface UpgradeDef {
  id: string;
  cost: number;
  appears: UpgradeCondition;
  effect: UpgradeEffect;
}

/** Unidades poseídas a las que aparece cada mejora de generador. */
export const GENERATOR_UPGRADE_OWNED: readonly number[] = [1, 10, 25, 50];
/** Coste de cada mejora de generador, en múltiplos del coste base del generador. */
export const GENERATOR_UPGRADE_COST_FACTOR: readonly number[] = [10, 100, 1000, 1e5];
/** Cada mejora de generador duplica su producción. */
export const GENERATOR_UPGRADE_MULTIPLIER = 2;

function generatorUpgrades(): UpgradeDef[] {
  const list: UpgradeDef[] = [];
  for (const gen of GENERATORS) {
    GENERATOR_UPGRADE_OWNED.forEach((owned, tier) => {
      list.push({
        id: `${gen.id}.u${tier + 1}`,
        cost: gen.baseCost * (GENERATOR_UPGRADE_COST_FACTOR[tier] ?? 1),
        appears: { kind: 'owned', id: gen.id, count: owned },
        effect: { kind: 'generator', target: gen.id, multiplier: GENERATOR_UPGRADE_MULTIPLIER },
      });
    });
  }
  return list;
}

const SPECIAL_UPGRADES: UpgradeDef[] = [
  {
    id: 'sensitiveTouch',
    cost: 500,
    appears: { kind: 'runEarned', amount: 100 },
    effect: { kind: 'click', multiplier: 2 },
  },
  {
    id: 'chemotropism',
    cost: 2e4,
    appears: { kind: 'runEarned', amount: 5e3 },
    effect: { kind: 'clickPercent', percent: 0.01 },
  },
  {
    id: 'fertileHumus',
    cost: 2.5e4,
    appears: { kind: 'runEarned', amount: 1e4 },
    effect: { kind: 'global', multiplier: 1.1 },
  },
  {
    id: 'electricImpulses',
    cost: 2e6,
    appears: { kind: 'runEarned', amount: 5e5 },
    effect: { kind: 'clickPercent', percent: 0.02 },
  },
  {
    id: 'autumnLitter',
    cost: 2.5e6,
    appears: { kind: 'runEarned', amount: 1e6 },
    effect: { kind: 'global', multiplier: 1.15 },
  },
  {
    id: 'witchesRing',
    cost: 2e7,
    appears: { kind: 'owned', id: 'mushroom', count: 50 },
    effect: { kind: 'synergy', source: 'mushroom', target: 'fairyRing', perUnit: 0.005 },
  },
  {
    id: 'voraciousAbsorption',
    cost: 2e8,
    appears: { kind: 'runEarned', amount: 5e7 },
    effect: { kind: 'click', multiplier: 2 },
  },
  {
    id: 'ancestralCompost',
    cost: 2.5e8,
    appears: { kind: 'runEarned', amount: 1e8 },
    effect: { kind: 'global', multiplier: 1.2 },
  },
  {
    id: 'sugarExchange',
    cost: 5e8,
    appears: { kind: 'owned', id: 'motherTree', count: 10 },
    effect: { kind: 'synergy', source: 'motherTree', target: 'mycorrhiza', perUnit: 0.01 },
  },
  {
    id: 'carbonCycle',
    cost: 2.5e10,
    appears: { kind: 'runEarned', amount: 1e10 },
    effect: { kind: 'global', multiplier: 1.25 },
  },
];

export const UPGRADES: readonly UpgradeDef[] = [...generatorUpgrades(), ...SPECIAL_UPGRADES];

const BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function getUpgrade(id: string): UpgradeDef | undefined {
  return BY_ID.get(id);
}

export function isUpgradeId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

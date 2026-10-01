/**
 * Noticias del sotobosque (PROMPT.md §12): una línea al pie que cambia cada 12 s. Cada
 * noticia se desbloquea con el progreso. El texto vive en src/i18n con la clave
 * `news.<id>`.
 */
import type { DestinationId } from './biomes.ts';
import type { GeneratorId } from './generators.ts';

export type NewsCondition =
  | { kind: 'always' }
  | { kind: 'lifetime'; amount: number }
  | { kind: 'owned'; id: GeneratorId; count: number }
  | { kind: 'sporulations'; count: number }
  | { kind: 'drops'; count: number }
  /** En un bioma (fase 8), con nivel local y unidades mínimos opcionales. */
  | { kind: 'biome'; biome: DestinationId; level?: number; owned?: { id: GeneratorId; count: number } }
  | { kind: 'dispersals'; count: number };

export interface NewsDef {
  id: string;
  when: NewsCondition;
}

/** Segundos entre noticias. */
export const NEWS_INTERVAL = 12;
/**
 * En un bioma con noticias propias sin ver, la mitad de las veces sale una de ellas: sin esto,
 * las 40 del natal ahogarían las 12 del bioma recién llegado.
 */
export const BIOME_NEWS_SHARE = 0.5;

export const NEWS: readonly NewsDef[] = [
  { id: 'worm', when: { kind: 'always' } },
  { id: 'fairyStep', when: { kind: 'always' } },
  { id: 'quietSoil', when: { kind: 'always' } },
  { id: 'firstThread', when: { kind: 'always' } },
  { id: 'beetle', when: { kind: 'lifetime', amount: 100 } },
  { id: 'hairWidth', when: { kind: 'owned', id: 'hypha', count: 5 } },
  { id: 'kilometers', when: { kind: 'owned', id: 'hypha', count: 25 } },
  { id: 'rhizoHighway', when: { kind: 'owned', id: 'rhizomorph', count: 1 } },
  { id: 'molePetition', when: { kind: 'lifetime', amount: 1e4 } },
  { id: 'button', when: { kind: 'owned', id: 'primordium', count: 1 } },
  { id: 'pickers', when: { kind: 'owned', id: 'mushroom', count: 1 } },
  { id: 'sporePrint', when: { kind: 'owned', id: 'mushroom', count: 10 } },
  { id: 'brainNotFound', when: { kind: 'lifetime', amount: 1e5 } },
  { id: 'fairyAdvice', when: { kind: 'owned', id: 'fairyRing', count: 1 } },
  { id: 'ringGrowth', when: { kind: 'owned', id: 'fairyRing', count: 10 } },
  { id: 'oakDeal', when: { kind: 'owned', id: 'mycorrhiza', count: 1 } },
  { id: 'ninetyPercent', when: { kind: 'owned', id: 'mycorrhiza', count: 5 } },
  { id: 'woodWideWeb', when: { kind: 'lifetime', amount: 1e7 } },
  { id: 'motherTree', when: { kind: 'owned', id: 'motherTree', count: 1 } },
  { id: 'debate', when: { kind: 'owned', id: 'motherTree', count: 5 } },
  { id: 'ancientForest', when: { kind: 'owned', id: 'ancientForest', count: 1 } },
  { id: 'squirrelLawyer', when: { kind: 'lifetime', amount: 1e8 } },
  { id: 'readyToSpore', when: { kind: 'lifetime', amount: 5e7 } },
  { id: 'firstRain', when: { kind: 'drops', count: 1 } },
  { id: 'petrichor', when: { kind: 'drops', count: 3 } },
  { id: 'lightning', when: { kind: 'drops', count: 5 } },
  { id: 'sporeCloud', when: { kind: 'sporulations', count: 1 } },
  { id: 'trillions', when: { kind: 'sporulations', count: 1 } },
  { id: 'deja', when: { kind: 'sporulations', count: 2 } },
  { id: 'malheur', when: { kind: 'owned', id: 'malheur', count: 1 } },
  { id: 'oldest', when: { kind: 'owned', id: 'malheur', count: 5 } },
  { id: 'planetary', when: { kind: 'owned', id: 'planetary', count: 1 } },
  { id: 'glow', when: { kind: 'lifetime', amount: 1e9 } },
  { id: 'kingdom', when: { kind: 'lifetime', amount: 1e10 } },
  { id: 'lichen', when: { kind: 'lifetime', amount: 1e11 } },
  { id: 'penicillin', when: { kind: 'lifetime', amount: 1e12 } },
  { id: 'cordyceps', when: { kind: 'lifetime', amount: 1e13 } },
  { id: 'truffle', when: { kind: 'sporulations', count: 3 } },
  { id: 'radiation', when: { kind: 'sporulations', count: 5 } },
  { id: 'patience', when: { kind: 'sporulations', count: 8 } },
  // Viento de esporas (fase 8).
  { id: 'taiga.arrival', when: { kind: 'biome', biome: 'taiga' } },
  { id: 'taiga.podzol', when: { kind: 'biome', biome: 'taiga' } },
  { id: 'taiga.circumpolar', when: { kind: 'biome', biome: 'taiga' } },
  { id: 'taiga.ecto', when: { kind: 'biome', biome: 'taiga', owned: { id: 'mycorrhiza', count: 1 } } },
  { id: 'taiga.carbon', when: { kind: 'biome', biome: 'taiga', owned: { id: 'mycorrhiza', count: 25 } } },
  { id: 'taiga.rockEating', when: { kind: 'biome', biome: 'taiga', owned: { id: 'motherTree', count: 1 } } },
  { id: 'taiga.amanita', when: { kind: 'biome', biome: 'taiga', owned: { id: 'mushroom', count: 25 } } },
  { id: 'taiga.snowMold', when: { kind: 'biome', biome: 'taiga', level: 50 } },
  { id: 'taiga.morels', when: { kind: 'biome', biome: 'taiga', level: 100 } },
  { id: 'taiga.lichen', when: { kind: 'biome', biome: 'taiga', level: 200 } },
  { id: 'taiga.chaga', when: { kind: 'biome', biome: 'taiga', owned: { id: 'ancientForest', count: 1 } } },
  { id: 'taiga.permafrost', when: { kind: 'biome', biome: 'taiga', level: 400 } },
  { id: 'choco.arrival', when: { kind: 'biome', biome: 'choco' } },
  { id: 'choco.forecast', when: { kind: 'biome', biome: 'choco' } },
  { id: 'choco.lloro', when: { kind: 'biome', biome: 'choco' } },
  { id: 'choco.endemic', when: { kind: 'biome', biome: 'choco' } },
  { id: 'choco.leafcutter', when: { kind: 'biome', biome: 'choco', owned: { id: 'fairyRing', count: 1 } } },
  { id: 'choco.farmers', when: { kind: 'biome', biome: 'choco', owned: { id: 'mushroom', count: 25 } } },
  { id: 'choco.arbuscular', when: { kind: 'biome', biome: 'choco', owned: { id: 'mycorrhiza', count: 1 } } },
  { id: 'choco.litter', when: { kind: 'biome', biome: 'choco', level: 50 } },
  { id: 'choco.rootMat', when: { kind: 'biome', biome: 'choco', level: 100 } },
  { id: 'choco.splash', when: { kind: 'biome', biome: 'choco', level: 200 } },
  { id: 'choco.plastic', when: { kind: 'biome', biome: 'choco', owned: { id: 'ancientForest', count: 1 } } },
  { id: 'choco.glow', when: { kind: 'biome', biome: 'choco', level: 400 } },
  { id: 'wind.rust', when: { kind: 'dispersals', count: 1 } },
  { id: 'wind.buller', when: { kind: 'dispersals', count: 1 } },
  { id: 'wind.altitude', when: { kind: 'dispersals', count: 1 } },
];

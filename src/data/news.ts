/**
 * Noticias del sotobosque (PROMPT.md §12): una línea al pie que cambia cada 12 s. Cada
 * noticia se desbloquea con el progreso. El texto vive en src/i18n con la clave
 * `news.<id>`.
 */
import type { GeneratorId } from './generators.ts';

export type NewsCondition =
  | { kind: 'always' }
  | { kind: 'lifetime'; amount: number }
  | { kind: 'owned'; id: GeneratorId; count: number }
  | { kind: 'sporulations'; count: number }
  | { kind: 'drops'; count: number };

export interface NewsDef {
  id: string;
  when: NewsCondition;
}

/** Segundos entre noticias. */
export const NEWS_INTERVAL = 12;

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
];

/**
 * Viento de esporas (docs/ROADMAP.md, fase 8): biomas, constantes del viaje y adaptaciones de
 * bioma. Solo datos; el texto vive en src/i18n (`biome.<id>.*`, `badapt.<id>.*`).
 *
 * Los valores salen del prototipo de balance de la fase 8 (9 semillas, perfil activo, regla de
 * PROMPT.md §17) y los confirma `npm run sim`; las cifras de cada comentario son de esa
 * medición (docs/BALANCE.md).
 */
import type { GeneratorId } from './generators.ts';
import { SPORE_SCALE } from './prestige.ts';
import type { RainEffectDef } from './rain.ts';

/** La fase 10 suma pradera y tundra. */
export const BIOME_IDS = ['natal', 'taiga', 'choco'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];
export type DestinationId = Exclude<BiomeId, 'natal'>;
export const HOME_BIOME = 'natal' satisfies BiomeId;
export const DESTINATION_IDS: readonly DestinationId[] = ['taiga', 'choco'];

export interface BiomeDef {
  id: BiomeId;
  /**
   * R del bioma cuando es el primer destino: requisito para esporular (N ganados en la partida)
   * y escala de la fórmula de esporas E = ⌊k √(L / R)⌋. El natal usa las constantes de
   * prestige.ts (hoy, ambas 1e8).
   */
  scale: number;
  /** Multiplicador de producción por generador; los que no aparecen rinden ×1. */
  production: Readonly<Partial<Record<GeneratorId, number>>>;
  /** Factor de la espera entre gotas: > 1 llueve menos, < 1 llueve más. */
  rainInterval: number;
  /** Probabilidades de los efectos de la gota; null = las de data/rain.ts. */
  rainEffects: readonly RainEffectDef[] | null;
  /** Segundos de producción que el Rocío da como mínimo (0 = sin mínimo). */
  dewFloorSeconds: number;
  /** La gota que no se atrapa cae sola al evaporarse (con el juego abierto) y aplica su efecto. */
  dropFallsAlone: boolean;
}

/**
 * Chocó: el doble de gotas con la mitad de probabilidad de Tormenta por gota, así que por hora
 * caen las mismas tormentas que en el natal. Sin este ajuste, las tormentas (×500 al clic)
 * dominaban: las partidas medianas bajaban a 22 min con el pasivo a 1,22× del activo.
 */
export const CHOCO_RAIN_EFFECTS: readonly RainEffectDef[] = [
  { kind: 'downpour', chance: 0.55, duration: 60 },
  { kind: 'dew', chance: 0.4, duration: 0 },
  { kind: 'storm', chance: 0.05, duration: 12 },
];

export const BIOMES: readonly BiomeDef[] = [
  {
    id: 'natal',
    scale: SPORE_SCALE,
    production: {},
    rainInterval: 1,
    rainEffects: null,
    dewFloorSeconds: 0,
    dropFallsAlone: false,
  },
  {
    // Red micorrícica y Árbol madre ×5: con ×3 las partidas medianas duraban 36:22 y colonizar,
    // 3,71 h (prototipo). Espera entre gotas ×2: con ×1,5 el pasivo tardaba 2,64 veces lo que el
    // activo. Escala: ver LEG_SCALE_GROWTH.
    id: 'taiga',
    scale: 7e10,
    production: { mycorrhiza: 5, motherTree: 5 },
    rainInterval: 2,
    rainEffects: null,
    dewFloorSeconds: 0,
    dropFallsAlone: false,
  },
  {
    // Escala mayor que la de la taiga: la bonificación de la taiga cae en generadores medios y la
    // del Chocó en la lluvia, que rinde más en cuanto hay producción. El Rocío normal casi no
    // pesa (depende de las reservas): con ×1, ×2,5 o ×6, las partidas quedaban en 31–35 min;
    // el mínimo de 300 s de producción es lo que lo hace notar. Sin la gota que cae sola, el
    // pasivo tardaba 5,88 veces lo que el activo.
    id: 'choco',
    scale: 1.2e11,
    production: {},
    rainInterval: 0.5,
    rainEffects: CHOCO_RAIN_EFFECTS,
    dewFloorSeconds: 300,
    dropFallsAlone: true,
  },
];

/**
 * R crece ×4,5 del primer destino al segundo: taiga 7e10 y luego 3,15e11; Chocó 1,2e11 y luego
 * 5,4e11. El prototipo usaba 1e11 y 2e11 con ×3; en el juego (con las obreras dentro de la
 * producción y la lluvia del destino desde la llegada) el primer destino quedaba largo:
 * partidas de 34 min de mediana y la taiga colonizada en 3,6 h. Con estos valores, 32–33 min
 * y 3,2 h en el primero y 22–27 min y 2,2–2,9 h en el segundo (npm run sim, docs/BALANCE.md).
 * Con ×10 y linaje ×2, la taiga segunda tardaba 4,74 h.
 */
export const LEG_SCALE_GROWTH = 4.5;
/** Nivel local de esporas que coloniza un bioma (ROADMAP). Con 300, el Chocó segundo bajaba de 2 h. */
export const COLONIZE_LEVEL = 500;
/**
 * Esporas disponibles que cuesta dispersar. Fijo, a diferencia de los demás sumideros (×2 por
 * nivel): el nivel vuelve a 0 en cada bioma, así que el ingreso de esporas por bioma es plano
 * (576–742 al colonizar). Con 300 y luego 600 hacía falta una partida más de espera.
 */
export const DISPERSE_COST = 300;
/**
 * Linaje: producción ×2 por cada bioma colonizado fuera del natal (ρ = 2^c). Sin él, con R ×3,
 * el segundo bioma tardaba 4,0–5,5 h en colonizarse.
 */
export const LINEAGE_FACTOR = 2;
/** Tramos posibles: 0 = natal y uno por destino de esta versión. */
export const MAX_LEG = DESTINATION_IDS.length;
/**
 * Mitad del Acto I: haber tenido alguna vez una Red planetaria. Es el logro y no `owned`
 * porque `owned` se reinicia al esporular y el logro no: una partida 1.x que ya tuvo una Red
 * planetaria cierra el Acto I al cargar sin repetir nada.
 */
export const ACT_ONE_ACHIEVEMENT = 'own.planetary.1';

export const BIOME_ADAPTATION_IDS = [
  'rockEating',
  'seedlingNetwork',
  'trehalose',
  'gongylidia',
  'leafcutters',
  'rootMat',
] as const;
export type BiomeAdaptationId = (typeof BIOME_ADAPTATION_IDS)[number];

export type BiomeAdaptationEffect =
  /** Producción de los generadores × perRank^rango. */
  | { kind: 'generators'; targets: readonly GeneratorId[]; perRank: number }
  /** Unidades de regalo al empezar cada partida: perRank · rango. */
  | { kind: 'startUnits'; target: GeneratorId; perRank: number }
  /** Segundos extra del Aguacero: perRank · rango. */
  | { kind: 'downpourSeconds'; perRank: number }
  /** Clics automáticos por segundo, sin Tormenta: perRank · rango. */
  | { kind: 'autoClicks'; perRank: number }
  /** Rocío × perRank^rango. */
  | { kind: 'dew'; perRank: number };

export interface BiomeAdaptationDef {
  id: BiomeAdaptationId;
  /** Bioma donde se aprende. Una vez aprendida vale en todos. */
  biome: DestinationId;
  /** Coste del primer rango, en esporas. */
  baseCost: number;
  /** ×2 por rango: la regla común de los sumideros de esporas. */
  growth: number;
  max: number;
  /**
   * Nivel local que pide cada rango en su bioma (posición 0 = rango 1). Colonizarlo los abre
   * todos. Así el bioma se aprende mientras se vive en él y no de golpe al llegar.
   */
  rankLevels: readonly number[];
  effect: BiomeAdaptationEffect;
}

/**
 * Lo que pesa cada una, medido quitándola (primer bioma; el bot compra las demás): sin ninguna,
 * las partidas medianas duran 41:13 en la taiga y 43:51 en el Chocó (colonizar, 4,71 y 4,07 h);
 * con todas, 25:33 y 31:02.
 */
export const BIOME_ADAPTATIONS: readonly BiomeAdaptationDef[] = [
  {
    // Sin ella, partidas de 36:07 y colonizar en 4,04 h.
    id: 'rockEating',
    biome: 'taiga',
    baseCost: 100,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'generators', targets: ['mycorrhiza', 'motherTree'], perRank: 1.25 },
  },
  {
    // Sin ella, 31:19 y 3,35 h.
    id: 'seedlingNetwork',
    biome: 'taiga',
    baseCost: 150,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'startUnits', target: 'mycorrhiza', perRank: 3 },
  },
  {
    // Sin ella, 29:19 y 3,29 h.
    id: 'trehalose',
    biome: 'taiga',
    baseCost: 200,
    growth: 2,
    max: 2,
    rankLevels: [0, 150],
    effect: { kind: 'downpourSeconds', perRank: 10 },
  },
  {
    // Sin ella, 32:49 y 3,23 h.
    id: 'gongylidia',
    biome: 'choco',
    baseCost: 100,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'generators', targets: ['fairyRing'], perRank: 1.5 },
  },
  {
    // Sin ella, 31:41 y 3,06 h.
    id: 'leafcutters',
    biome: 'choco',
    baseCost: 150,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'autoClicks', perRank: 1 },
  },
  {
    // Sin ella, 39:35 y 3,85 h: es la que hace notar el Rocío del Chocó.
    id: 'rootMat',
    biome: 'choco',
    baseCost: 200,
    growth: 2,
    max: 2,
    rankLevels: [0, 150],
    effect: { kind: 'dew', perRank: 2 },
  },
];

const BIOME_BY_ID = new Map(BIOMES.map((b) => [b.id, b]));
const ADAPTATION_BY_ID = new Map(BIOME_ADAPTATIONS.map((a) => [a.id, a]));

export function getBiome(id: BiomeId): BiomeDef {
  const def = BIOME_BY_ID.get(id);
  if (!def) throw new Error(`Bioma desconocido: ${id}`);
  return def;
}

export function isBiomeId(value: unknown): value is BiomeId {
  return typeof value === 'string' && BIOME_BY_ID.has(value as BiomeId);
}

export function isDestinationId(value: unknown): value is DestinationId {
  return isBiomeId(value) && value !== HOME_BIOME;
}

export function getBiomeAdaptation(id: BiomeAdaptationId): BiomeAdaptationDef {
  const def = ADAPTATION_BY_ID.get(id);
  if (!def) throw new Error(`Adaptación de bioma desconocida: ${id}`);
  return def;
}

export function isBiomeAdaptationId(value: unknown): value is BiomeAdaptationId {
  return typeof value === 'string' && ADAPTATION_BY_ID.has(value as BiomeAdaptationId);
}

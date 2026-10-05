/**
 * Consultas del viaje (docs/ROADMAP.md, fase 8): en qué bosque vive el linaje, qué está
 * colonizado, adónde puede ir y qué reglas del bioma rigen. Puras: no mutan ni emiten eventos.
 *
 * Lo colonizado y lo visitado no se guardan aparte: se deducen de la Crónica, así la regla vive
 * en un solo sitio (ARCHITECTURE.md §4.28).
 */
import {
  BIOME_ADAPTATIONS,
  DESTINATION_IDS,
  LEG_SCALE,
  LINEAGE_FACTOR,
  getBiome,
  getBiomeAdaptation,
  isDestinationId,
  type BiomeAdaptationId,
  type BiomeId,
  type DestinationId,
} from '../data/biomes.ts';
import type { GeneratorId } from '../data/generators.ts';
import { SPORE_SCALE, SPORULATE_REQUIREMENT } from '../data/prestige.ts';
import { RAIN_EFFECTS, type RainEffectDef } from '../data/rain.ts';
import { adaptationCost } from './formulas.ts';
import type { Num } from './num.ts';
import type { ChronicleEntry, GameState } from './state.ts';

/**
 * R del bosque actual: requisito y escala de esporas, la escala del bioma × el factor de su tramo.
 * Hay un factor por tramo (journey.test lo comprueba) y el validador del guardado acota el tramo;
 * si aun así faltara, rige el último y no ×1, que abarataría el bosque.
 */
function legScale(state: GameState): number {
  const { biome, leg } = state.forest;
  const factor = LEG_SCALE[Math.min(leg, LEG_SCALE.length - 1)] ?? 1;
  return getBiome(biome).scale * factor;
}

/** Nutrientes ganados en la partida que pide Esporular en este bosque. */
export function sporulateRequirement(state: GameState): Num {
  return state.forest.leg === 0 ? SPORULATE_REQUIREMENT : legScale(state);
}

/** Escala R de la fórmula de esporas E = ⌊k √(L / R)⌋ en este bosque. */
export function sporeScale(state: GameState): Num {
  return state.forest.leg === 0 ? SPORE_SCALE : legScale(state);
}

/** El Acto I es la entrada del tramo 0 de la Crónica (systems/journey.ts la escribe). */
export function actOneEntry(state: Readonly<GameState>): ChronicleEntry | null {
  return state.chronicle.find((e) => e.leg === 0) ?? null;
}

export function isActOneClosed(state: Readonly<GameState>): boolean {
  return actOneEntry(state) !== null;
}

/** El bosque actual está cerrado en la Crónica: Acto I en el natal, colonizado en los demás. */
export function isForestColonized(state: GameState): boolean {
  return state.chronicle.some((e) => e.leg === state.forest.leg);
}

export function isColonized(state: GameState, biome: DestinationId): boolean {
  return state.chronicle.some((e) => e.leg >= 1 && e.biome === biome);
}

/**
 * Destinos colonizados (c). Cuenta por bioma y no por tramo: la entrada del natal de El regreso
 * (fase 10) cierra un tramo posterior al 0 y no debe multiplicar el linaje.
 */
export function colonizedCount(state: GameState): number {
  let count = 0;
  for (const e of state.chronicle) if (isDestinationId(e.biome)) count += 1;
  return count;
}

/** Linaje: ×2 de producción por destino colonizado (ρ = 2^c). */
export function lineageFactor(state: GameState): number {
  return LINEAGE_FACTOR ** colonizedCount(state);
}

/**
 * Viajes del linaje: la semilla de la red y la transición del suelo cambian con cada uno. Hoy es
 * el tramo; el ciclo libre de la fase 10 sumará las siembras, que vuelven a un bioma sin cambiar de
 * tramo.
 */
export function dispersalCount(state: Readonly<GameState>): number {
  return state.forest.leg;
}

/** Biomas por los que pasó el linaje, incluido el actual. Solo se sale de un bosque cerrado. */
export function visitedBiomes(state: GameState): BiomeId[] {
  const out: BiomeId[] = state.chronicle.map((e) => e.biome);
  if (!out.includes(state.forest.biome)) out.push(state.forest.biome);
  return out;
}

/** Destinos que quedan, en el orden de DESTINATION_IDS. */
export function destinations(state: GameState): DestinationId[] {
  const visited = visitedBiomes(state);
  return DESTINATION_IDS.filter((id) => !visited.includes(id));
}

// ---------------------------------------------------------------------------------------
// Reglas del bioma y efectos de las adaptaciones de bioma

/** Multiplicador de un generador por el bioma y por las adaptaciones de bioma que lo nombran. */
export function generatorBiomeFactor(state: GameState, id: GeneratorId): number {
  let factor = getBiome(state.forest.biome).production[id] ?? 1;
  for (const def of BIOME_ADAPTATIONS) {
    const effect = def.effect;
    const rank = state.biomeAdaptations[def.id];
    if (rank > 0 && effect.kind === 'generators' && effect.targets.includes(id)) {
      factor *= effect.perRank ** rank;
    }
  }
  return factor;
}

/** Suma de `perRank · rango` de las adaptaciones de bioma con este tipo de efecto. */
function linearEffect(state: GameState, kind: 'startUnits' | 'downpourSeconds' | 'autoClicks'): number {
  let total = 0;
  for (const def of BIOME_ADAPTATIONS) {
    if (def.effect.kind === kind) total += def.effect.perRank * state.biomeAdaptations[def.id];
  }
  return total;
}

/** Factor de la espera entre gotas del bioma actual (> 1 llueve menos). */
export function rainIntervalFactor(state: GameState): number {
  return getBiome(state.forest.biome).rainInterval;
}

export function rainEffectsFor(state: GameState): readonly RainEffectDef[] {
  return getBiome(state.forest.biome).rainEffects ?? RAIN_EFFECTS;
}

/** Rocío × perRank^rango (Estera de raíces). */
export function dewMultiplier(state: GameState): number {
  let factor = 1;
  for (const def of BIOME_ADAPTATIONS) {
    const rank = state.biomeAdaptations[def.id];
    if (rank > 0 && def.effect.kind === 'dew') factor *= def.effect.perRank ** rank;
  }
  return factor;
}

/** Segundos de producción que el Rocío da como mínimo en el bioma actual. */
export function dewFloorSeconds(state: GameState): number {
  return getBiome(state.forest.biome).dewFloorSeconds;
}

export function dropFallsAlone(state: GameState): boolean {
  return getBiome(state.forest.biome).dropFallsAlone;
}

/** Segundos extra del Aguacero (Trehalosa). */
export function downpourBonusSeconds(state: GameState): number {
  return linearEffect(state, 'downpourSeconds');
}

/** Clics automáticos por segundo (Hormigas cortadoras). */
export function autoClicksPerSecond(state: GameState): number {
  return linearEffect(state, 'autoClicks');
}

/** Unidades de regalo al empezar partida (Plántulas conectadas), por generador. */
export function startUnits(state: GameState): readonly { id: GeneratorId; count: number }[] {
  const out: { id: GeneratorId; count: number }[] = [];
  for (const def of BIOME_ADAPTATIONS) {
    const rank = state.biomeAdaptations[def.id];
    if (rank > 0 && def.effect.kind === 'startUnits') {
      out.push({ id: def.effect.target, count: def.effect.perRank * rank });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Rangos de las adaptaciones de bioma

/** Por qué no se puede comprar el siguiente rango (null = se puede si alcanzan las esporas). */
export type BiomeAdaptationGate = 'unvisited' | 'maxed' | 'level';

/** Nivel local que pide el siguiente rango (0 si ya está al máximo). */
export function biomeAdaptationLevelNeeded(state: GameState, id: BiomeAdaptationId): number {
  const def = getBiomeAdaptation(id);
  return def.rankLevels[state.biomeAdaptations[id]] ?? 0;
}

/**
 * El siguiente rango se abre si el bioma de la adaptación está colonizado, o si es el bioma
 * actual y el nivel local llega al que pide ese rango. No hace falta guardar el máximo nivel
 * alcanzado en un bioma: solo se sale de él después de colonizarlo.
 */
export function biomeAdaptationGate(state: GameState, id: BiomeAdaptationId): BiomeAdaptationGate | null {
  const def = getBiomeAdaptation(id);
  if (state.biomeAdaptations[id] >= def.max) return 'maxed';
  if (isColonized(state, def.biome)) return null;
  if (state.forest.biome !== def.biome) return 'unvisited';
  return state.spores.level >= biomeAdaptationLevelNeeded(state, id) ? null : 'level';
}

/** Coste del siguiente rango, o null si está al máximo. */
export function nextBiomeAdaptationCost(state: GameState, id: BiomeAdaptationId): number | null {
  const def = getBiomeAdaptation(id);
  const rank = state.biomeAdaptations[id];
  if (rank >= def.max) return null;
  return adaptationCost(def.baseCost, def.growth, rank);
}

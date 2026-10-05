/**
 * Consultas del viaje (docs/ROADMAP.md, fase 8): en qué bosque vive el linaje, qué está
 * colonizado, adónde puede ir y qué reglas del bioma rigen. Puras: no mutan ni emiten eventos.
 *
 * Lo colonizado y lo visitado no se guardan aparte: se deducen de la Crónica, así la regla vive
 * en un solo sitio (ARCHITECTURE.md §4.28).
 */
import {
  BIOME_ADAPTATIONS,
  BIOME_IDS,
  COLONIZE_LEVEL,
  DESTINATION_IDS,
  HOME_BIOME,
  JOURNEY_LEGS,
  LEG_SCALE,
  LINEAGE_FACTOR,
  RETURN_LEG,
  getBiome,
  getBiomeAdaptation,
  isDestinationId,
  type BiomeAdaptationId,
  type BiomeId,
  type DestinationId,
} from '../data/biomes.ts';
import { CYCLE_GOAL_LEVEL } from '../data/cycle.ts';
import type { GeneratorId } from '../data/generators.ts';
import { SPORE_SCALE, SPORULATE_REQUIREMENT } from '../data/prestige.ts';
import { RAIN_EFFECTS, type RainEffectDef } from '../data/rain.ts';
import { adaptationCost } from './formulas.ts';
import type { Num } from './num.ts';
import type { ChronicleEntry, CycleRecord, GameState } from './state.ts';

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

/**
 * Nutrientes ganados en la partida que pide Esporular en este bosque. En el tramo 5 (El regreso y
 * el ciclo libre), unas 6 R del bioma: con 1 R el nivel se duplicaba hasta pasar de largo la meta
 * (256 → 512) y la última partida duraba 1:30 h.
 */
export function sporulateRequirement(state: GameState): Num {
  const leg = state.forest.leg;
  if (leg === 0) return SPORULATE_REQUIREMENT;
  if (leg === RETURN_LEG) {
    const biome = getBiome(state.forest.biome);
    return biome.cycleRequirement * biome.cycleScale;
  }
  return legScale(state);
}

/**
 * Escala R de la fórmula de esporas E = ⌊k √(L / R)⌋ en este bosque. En el tramo 5 es fija por
 * bioma (`cycleScale`): ni crece con los viajes ni encoge, y el suelo lineal de la 1.x, que solo
 * rige en el tramo 0, tampoco la toca.
 */
export function sporeScale(state: GameState): Num {
  const leg = state.forest.leg;
  if (leg === 0) return SPORE_SCALE;
  if (leg === RETURN_LEG) return getBiome(state.forest.biome).cycleScale;
  return legScale(state);
}

/** El Acto I es la entrada del tramo 0 de la Crónica (systems/journey.ts la escribe). */
export function actOneEntry(state: Readonly<GameState>): ChronicleEntry | null {
  return state.chronicle.find((e) => e.leg === 0) ?? null;
}

export function isActOneClosed(state: Readonly<GameState>): boolean {
  return actOneEntry(state) !== null;
}

/**
 * El bosque actual está cerrado en la Crónica: Acto I en el natal, colonizado en los tramos 1–4 y,
 * en el tramo 5, El regreso cumplido. La interfaz no lo lee: lee `forestGoal`.
 */
export function isForestColonized(state: GameState): boolean {
  return state.chronicle.some((e) => e.leg === state.forest.leg);
}

/** El regreso está cumplido: la Crónica tiene la entrada del tramo 5 (systems/journey.ts). */
export function isReturnClosed(state: Readonly<GameState>): boolean {
  return state.chronicle.some((e) => e.leg === RETURN_LEG);
}

/** El linaje vive en el ciclo libre: el tramo 5 con El regreso ya cumplido. */
export function isFreeStay(state: Readonly<GameState>): boolean {
  return state.forest.leg === RETURN_LEG && isReturnClosed(state);
}

/**
 * El ciclo actual está cumplido. No se guarda aparte: el nivel solo cambia al esporular y vuelve a
 * 0 al sembrar, así que un ciclo empezado con el nivel en 500 o más es uno que ya llegó a la meta.
 */
export function isCycleDone(state: Readonly<GameState>): boolean {
  return state.cycle.stays > 0 && state.spores.level >= CYCLE_GOAL_LEVEL;
}

/**
 * Qué persigue el bosque actual y cuánto lleva: el Acto I en el natal, colonizar (nivel 500) en
 * un destino abierto, nada más en uno colonizado, El regreso (nivel 500 en el natal), nada más
 * tras cumplirlo y, en el ciclo libre, el nivel 500 del ciclo n o, cumplido, nada más. Es la única
 * lectura del progreso de la cartela, la sección Viento y la Crónica: en el tramo 5, «la Crónica
 * tiene la entrada de este tramo» no significa «colonizado», y los casos se deciden aquí y no en
 * cada pantalla.
 */
export type ForestGoal =
  | { kind: 'actOne'; level: number }
  | { kind: 'colonize'; level: number; goal: number }
  | { kind: 'colonized'; level: number }
  | { kind: 'return'; level: number; goal: number }
  | { kind: 'free'; level: number }
  | { kind: 'cycle'; n: number; level: number; goal: number }
  | { kind: 'cycleDone'; n: number; level: number };

export function forestGoal(state: GameState): ForestGoal {
  const level = state.spores.level;
  const leg = state.forest.leg;
  if (leg === 0) return { kind: 'actOne', level };
  if (leg === RETURN_LEG) {
    if (!isReturnClosed(state)) return { kind: 'return', level, goal: CYCLE_GOAL_LEVEL };
    const n = state.cycle.stays;
    if (n === 0) return { kind: 'free', level };
    return isCycleDone(state)
      ? { kind: 'cycleDone', n, level }
      : { kind: 'cycle', n, level, goal: CYCLE_GOAL_LEVEL };
  }
  if (isForestColonized(state)) return { kind: 'colonized', level };
  return { kind: 'colonize', level, goal: COLONIZE_LEVEL };
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
 * Viajes del linaje: la semilla de la red y la transición del suelo cambian con cada uno. Son los
 * tramos y las siembras del ciclo libre, que vuelven a un bioma sin cambiar de tramo: sin ellas,
 * sembrar el mismo bioma no cambiaba de red ni pasaba por la transición.
 */
export function dispersalCount(state: Readonly<GameState>): number {
  return state.forest.leg + state.cycle.stays;
}

/** Biomas por los que pasó el linaje, incluido el actual. Solo se sale de un bosque cerrado. */
export function visitedBiomes(state: GameState): BiomeId[] {
  const out: BiomeId[] = state.chronicle.map((e) => e.biome);
  if (!out.includes(state.forest.biome)) out.push(state.forest.biome);
  return out;
}

/**
 * Anillo abierto (fase 10): el primero que aún tiene algún destino sin colonizar. Los de después
 * esperan a que se colonice entero; con todo colonizado no queda ninguno (Infinity).
 */
export function openRing(state: GameState): number {
  let open = Infinity;
  for (const id of DESTINATION_IDS) if (!isColonized(state, id)) open = Math.min(open, getBiome(id).ring);
  return open;
}

/**
 * Queda un anillo por abrir. Entonces que no haya destinos no es el final del viaje: falta
 * colonizar el bosque actual (en el Chocó segundo, sin colonizar, la pradera y la tundra esperan).
 */
export function closedRingAhead(state: GameState): boolean {
  const open = openRing(state);
  return DESTINATION_IDS.some((id) => getBiome(id).ring > open);
}

/** Destinos que quedan en los anillos abiertos, en el orden de DESTINATION_IDS. */
export function destinations(state: GameState): DestinationId[] {
  const visited = visitedBiomes(state);
  const open = openRing(state);
  return DESTINATION_IDS.filter((id) => !visited.includes(id) && getBiome(id).ring <= open);
}

/**
 * Adónde puede llevar el viento: un destino del viaje, tras el cuarto de vuelta al natal y, con El
 * regreso cumplido, sembrar cualquier bioma (el ciclo libre).
 */
export type WindTargetKind = 'journey' | 'return' | 'cycle';

export interface WindTarget {
  biome: BiomeId;
  kind: WindTargetKind;
}

/**
 * Lo que ofrece la sección Viento, en orden: los destinos que quedan, con el cuarto colonizado El
 * regreso y, cumplido, los cinco biomas en el orden de BIOME_IDS, también el actual (los récords
 * son por bioma: repetir uno es la forma de mejorarlo). Lo leen la interfaz, las láminas y
 * `disperse`, así que la regla vive en un solo sitio. Durante El regreso no hay ninguno.
 */
export function windTargets(state: GameState): WindTarget[] {
  const leg = state.forest.leg;
  if (leg < JOURNEY_LEGS) return destinations(state).map((biome) => ({ biome, kind: 'journey' }));
  if (leg === JOURNEY_LEGS && isForestColonized(state)) return [{ biome: HOME_BIOME, kind: 'return' }];
  if (isFreeStay(state)) return BIOME_IDS.map((biome) => ({ biome, kind: 'cycle' }));
  return [];
}

/** Los votos de dos récords son la misma combinación (los dos van en el orden de VOW_IDS). */
export function sameVows(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((vow, i) => vow === b[i]);
}

/** El mejor ciclo cumplido en un bioma, con cualquier combinación de votos; null si no hay. */
export function bestRecord(state: Readonly<GameState>, biome: BiomeId): CycleRecord | null {
  let best: CycleRecord | null = null;
  for (const record of state.records) {
    if (record.biome === biome && (best === null || record.time < best.time)) best = record;
  }
  return best;
}

// ---------------------------------------------------------------------------------------
// Reglas del bioma y efectos de las adaptaciones de bioma

/**
 * Multiplicador de un generador por el bioma (el de todos, `productionFactor`, y el suyo) y por
 * las adaptaciones de bioma que lo nombran. Fuera de la tundra el factor de todos es 1, y 1 · x
 * es x: las cifras de los demás biomas no cambian ni en el último bit.
 */
export function generatorBiomeFactor(state: GameState, id: GeneratorId): number {
  const biome = getBiome(state.forest.biome);
  let factor = biome.productionFactor * (biome.production[id] ?? 1);
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
function linearEffect(
  state: GameState,
  kind: 'startUnits' | 'downpourSeconds' | 'autoClicks' | 'offlineHours',
): number {
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

/** Clics automáticos por segundo (Hormigas cortadoras y Pilobolus). */
export function autoClicksPerSecond(state: GameState): number {
  return linearEffect(state, 'autoClicks');
}

/**
 * Horas que se suman al tope sin conexión: las del bioma actual (tundra, solo mientras se vive
 * allí) y las del Liquen (en todos los biomas). Sin ninguna de las dos, 0 + 0: el tope de los
 * demás biomas no cambia.
 */
export function offlineHoursBonus(state: GameState): number {
  return getBiome(state.forest.biome).offlineHours + linearEffect(state, 'offlineHours');
}

/** Unidades de regalo al empezar partida (Plántulas conectadas y Moho de nieve), por generador. */
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

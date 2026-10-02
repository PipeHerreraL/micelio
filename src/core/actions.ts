/**
 * Acciones: funciones `(state, payload) => void`. Son la única forma de cambiar el estado
 * desde la interfaz. Cada una valida antes de mutar, así que un payload imposible no deja
 * el estado a medias.
 */
import {
  SCLEROTIUM_BASE_EXPONENT,
  getAdaptation,
  isAdaptationId,
  type AdaptationId,
} from '../data/adaptations.ts';
import {
  DISPERSE_COST,
  isBiomeAdaptationId,
  isDestinationId,
  type BiomeAdaptationId,
  type DestinationId,
} from '../data/biomes.ts';
import { GENERATORS, getGenerator, isGeneratorId, type GeneratorId } from '../data/generators.ts';
import {
  INHERITANCE_GENERATORS,
  INHERITANCE_UNITS,
  MUTATIONS,
  SOIL_MEMORY_HYPHAE,
  SOIL_MEMORY_NUTRIENTS,
  getMutation,
  isMutationId,
  type MutationId,
} from '../data/mutations.ts';
import { HISTORY_LIMIT } from '../data/prestige.ts';
import { getUpgrade } from '../data/upgrades.ts';
import { checkAchievements } from '../systems/achievements.ts';
import { checkColonization } from '../systems/journey.ts';
import { evaporateDrop, rollRainInterval } from '../systems/rain.ts';
import { gain, isGeneratorUnlocked, isUpgradeAppeared, quoteGenerator, spend } from './economy.ts';
import { emit } from './events.ts';
import {
  biomeAdaptationGate,
  destinations,
  isActOneClosed,
  isForestColonized,
  nextBiomeAdaptationCost,
  sporeScale,
  sporulateRequirement,
  startUnits,
} from './forest.ts';
import { adaptationCost, nutrientsForSpores, sporesFor } from './formulas.ts';
import * as num from './num.ts';
import type { Num } from './num.ts';
import { DISPERSE_RESET, resetFields, SPORULATE_RESET } from './resets.ts';
import { derived, invalidate } from './selectors.ts';
import {
  AUTOBUY_MODES,
  createState,
  hasMutation,
  hasUpgrade,
  isTreeComplete,
  type AutobuyMode,
  type AutobuyThreshold,
  type BuyAmount,
  type GameState,
  type Settings,
} from './state.ts';

/** Absorber: un clic o toque sobre el núcleo. */
export function click(state: GameState, _payload: Record<string, never> = {}): void {
  const value = derived(state).clickValue;
  gain(state, value);
  state.stats.clicks += 1;
  state.stats.idleClickTime = 0;
  emit({ type: 'click', value });
}

/** Compra `amount` unidades (o el máximo) de un generador, si está desbloqueado y alcanza. */
export function buyGenerator(state: GameState, payload: { id: GeneratorId; amount: BuyAmount }): void {
  if (!isGeneratorId(payload.id)) return;
  if (!isGeneratorUnlocked(state, getGenerator(payload.id))) return;
  const quote = quoteGenerator(state, payload.id, payload.amount);
  if (quote.count <= 0 || !quote.affordable) return;
  if (!spend(state, quote.cost)) return;
  state.owned[payload.id] += quote.count;
  invalidate(state);
  emit({ type: 'buyGenerator', id: payload.id, count: quote.count });
  checkAchievements(state);
}

/** Compra una mejora disponible. */
export function buyUpgrade(state: GameState, payload: { id: string }): void {
  const def = getUpgrade(payload.id);
  if (!def || hasUpgrade(state, def.id) || !isUpgradeAppeared(state, def)) return;
  if (!spend(state, def.cost)) return;
  state.upgrades.push(def.id);
  invalidate(state);
  emit({ type: 'buyUpgrade', id: def.id });
  checkAchievements(state);
}

/**
 * Esporas que se ganarían al esporular ahora: E(L) − S, con L los nutrientes ganados en este
 * bosque (no los de toda la vida: al llegar a un bioma nuevo, la vida daría miles de esporas de
 * golpe) y la escala del bosque.
 */
export function sporeGain(state: GameState): number {
  const total = sporesFor(state.forest.earned, derived(state).sporeK, sporeScale(state));
  return Math.max(0, total - state.spores.level);
}

/** Nutrientes del bosque que faltan para que E(L) suba una espora más. */
export function nutrientsToNextSpore(state: GameState): Num {
  const k = derived(state).sporeK;
  const scale = sporeScale(state);
  const next = sporesFor(state.forest.earned, k, scale) + 1;
  return num.max(num.ZERO, num.sub(nutrientsForSpores(next, k, scale), state.forest.earned));
}

export function canSporulate(state: GameState): boolean {
  return num.gte(state.runEarned, sporulateRequirement(state)) && sporeGain(state) > 0;
}

function isValidTime(now: number): boolean {
  return Number.isFinite(now) && now >= 0;
}

/**
 * Suma las esporas de una partida que termina al nivel y a las disponibles y la anota en el
 * historial. La usan esporular y dispersar (que esporula si puede), así las cuentas son una.
 */
function recordSporulation(state: GameState, gained: number, now: number): void {
  state.spores.level += gained;
  state.spores.available += gained;
  state.stats.sporulations += 1;
  state.history.push({
    sporulation: state.stats.sporulations,
    duration: state.stats.runTime,
    spores: gained,
    endedAt: now,
    biome: state.forest.biome,
  });
  if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);
}

/**
 * Empieza una partida nueva: los campos «run» de la tabla y lo que la tabla marca a mano.
 * `newSky`: la espera de la lluvia se sortea siempre (al dispersar, con la lluvia del destino);
 * si no, solo se sortea si había gota, como al esporular desde la 1.0 (el azar del natal no cambia).
 */
function startRun(state: GameState, now: number, table: typeof SPORULATE_RESET, newSky: boolean): void {
  // Los campos «run» de la tabla vuelven al valor de una partida nueva (src/core/resets.ts).
  resetFields(state, createState(0, now), table);
  // La gota visible se evapora y la cuenta atrás vuelve a sortearse: con solo quitarla,
  // nextIn seguía en 0 y caía otra gota en el siguiente tick (BUG-JOURNAL #2).
  if (newSky) {
    state.rain.drop = null;
    state.rain.nextIn = rollRainInterval(state);
  } else {
    evaporateDrop(state);
  }
  state.stats.runTime = 0;
  state.stats.runStartedAt = now;
  applyRunStartBonuses(state);
}

/**
 * Esporular: suma esporas al nivel y a las disponibles y reinicia la partida. Se conservan
 * nivel, esporas, mutaciones, logros, estadísticas de vida, ajustes y autocompra. Si el nivel
 * local llega al de colonizar, el bioma queda colonizado (systems/journey.ts).
 */
export function sporulate(state: GameState, payload: { now: number }): void {
  if (!canSporulate(state) || !isValidTime(payload.now)) return;
  const gained = sporeGain(state);
  recordSporulation(state, gained, payload.now);
  checkColonization(state, payload.now);
  startRun(state, payload.now, SPORULATE_RESET, false);

  invalidate(state);
  emit({ type: 'sporulate', gained, level: state.spores.level });
  checkAchievements(state);
}

/** Por qué no se puede dispersar, en este orden de prioridad (null = se puede). */
export type DisperseBlock = 'actOne' | 'noDestination' | 'colonize' | 'spores';

/** Esporas con que se pagaría el viaje: las disponibles más lo que daría esporular ahora. */
export function disperseFunds(state: GameState): number {
  return state.spores.available + (canSporulate(state) ? sporeGain(state) : 0);
}

export function disperseBlock(state: GameState): DisperseBlock | null {
  if (!isActOneClosed(state)) return 'actOne';
  if (destinations(state).length === 0) return 'noDestination';
  if (!isForestColonized(state)) return 'colonize';
  if (disperseFunds(state) < DISPERSE_COST) return 'spores';
  return null;
}

/**
 * Dispersar: el linaje viaja a otro bioma. Si la partida puede esporular, termina esporulando
 * (mismas cuentas que `sporulate`) y esas esporas ayudan a pagar el viaje. El nivel vuelve a 0
 * (el territorio no viaja); las esporas que quedan, las mutaciones y las adaptaciones viajan en
 * las esporas. Todo se valida antes de mutar.
 */
export function disperse(state: GameState, payload: { to: DestinationId; now: number }): void {
  const to = payload.to;
  if (!isDestinationId(to) || !isValidTime(payload.now)) return;
  if (disperseBlock(state) !== null || !destinations(state).includes(to)) return;
  const now = payload.now;
  const from = state.forest.biome;
  const gained = canSporulate(state) ? sporeGain(state) : 0;
  if (gained > 0) recordSporulation(state, gained, now);

  // La entrada del bosque que se deja recuerda cuándo se fue y hasta dónde llegó.
  const entry = state.chronicle.find((e) => e.leg === state.forest.leg);
  if (entry) {
    entry.leftAt = now;
    entry.levelReached = state.spores.level;
  }
  state.spores.available -= DISPERSE_COST;
  state.spores.level = 0;
  state.forest = {
    biome: to,
    leg: state.forest.leg + 1,
    earned: 0,
    arrivedAt: now,
    arrivalSporulations: state.stats.sporulations,
    arrivalPlayTime: state.stats.totalTime,
  };
  // Con el bosque ya cambiado: la espera de la lluvia se sortea con la del destino.
  startRun(state, now, DISPERSE_RESET, true);

  invalidate(state);
  emit({ type: 'disperse', from, to, leg: state.forest.leg, gained });
  checkAchievements(state);
}

/** Compra un rango de una adaptación de bioma con esporas disponibles. No baja el nivel. */
export function buyBiomeAdaptation(state: GameState, payload: { id: BiomeAdaptationId }): void {
  const id = payload.id;
  if (!isBiomeAdaptationId(id) || biomeAdaptationGate(state, id) !== null) return;
  const cost = nextBiomeAdaptationCost(state, id);
  if (cost === null || state.spores.available < cost) return;
  state.spores.available -= cost;
  state.biomeAdaptations[id] += 1;
  invalidate(state);
  emit({ type: 'buyBiomeAdaptation', id, rank: state.biomeAdaptations[id] });
  checkAchievements(state);
}

/**
 * Bonos de inicio de partida: Esclerocio, Memoria del suelo, Herencia y, de las adaptaciones
 * de bioma, Plántulas conectadas.
 */
export function applyRunStartBonuses(state: GameState): void {
  const sclerotium = state.adaptations.sclerotium;
  if (sclerotium > 0) {
    // Un esclerocio guarda reservas para rebrotar: la partida arranca con 10^(3 + rango) N.
    state.nutrients = num.add(state.nutrients, 10 ** (SCLEROTIUM_BASE_EXPONENT + sclerotium));
  }
  if (hasMutation(state, 'soilMemory')) {
    state.nutrients = num.add(state.nutrients, SOIL_MEMORY_NUTRIENTS);
    state.owned.hypha += SOIL_MEMORY_HYPHAE;
  }
  if (hasMutation(state, 'inheritance')) {
    for (const id of INHERITANCE_GENERATORS) state.owned[id] += INHERITANCE_UNITS;
  }
  for (const gift of startUnits(state)) state.owned[gift.id] += gift.count;
}

export function isMutationAvailable(state: GameState, id: MutationId): boolean {
  if (hasMutation(state, id)) return false;
  return getMutation(id).requires.every((req) => hasMutation(state, req));
}

/** Compra una mutación con esporas disponibles, si se cumplen sus requisitos. */
export function buyMutation(state: GameState, payload: { id: MutationId }): void {
  if (!isMutationId(payload.id) || !isMutationAvailable(state, payload.id)) return;
  const def = getMutation(payload.id);
  if (state.spores.available < def.cost) return;
  state.spores.available -= def.cost;
  state.mutations.push(def.id);
  invalidate(state);
  emit({ type: 'buyMutation', id: def.id });
}

/** Las adaptaciones aparecen con el árbol de mutaciones completo. */
export function adaptationsUnlocked(state: GameState): boolean {
  return isTreeComplete(state);
}

/** Coste del siguiente rango, o null si ya está en su tope. */
export function nextAdaptationCost(state: GameState, id: AdaptationId): number | null {
  const def = getAdaptation(id);
  const rank = state.adaptations[id];
  if (def.max !== null && rank >= def.max) return null;
  return adaptationCost(def.baseCost, def.growth, rank);
}

/** Compra un rango de una adaptación con esporas disponibles. No baja el nivel. */
export function buyAdaptation(state: GameState, payload: { id: AdaptationId }): void {
  if (!isAdaptationId(payload.id) || !adaptationsUnlocked(state)) return;
  const cost = nextAdaptationCost(state, payload.id);
  if (cost === null || state.spores.available < cost) return;
  state.spores.available -= cost;
  state.adaptations[payload.id] += 1;
  invalidate(state);
  emit({ type: 'buyAdaptation', id: payload.id, rank: state.adaptations[payload.id] });
}

/** Siguiente mutación de la tabla que se podría comprar con sus requisitos cumplidos. */
export function nextMutationInOrder(state: GameState): MutationId | null {
  for (const m of MUTATIONS) if (isMutationAvailable(state, m.id)) return m.id;
  return null;
}

export function setBuyAmount(state: GameState, payload: { amount: BuyAmount }): void {
  state.settings.buyAmount = payload.amount;
}

/** Un ajuste y su valor, con el tipo de cada clave. */
export type SettingPayload = { [K in keyof Settings]: { key: K; value: Settings[K] } }[keyof Settings];

export function setSetting(state: GameState, payload: SettingPayload): void {
  Object.assign(state.settings, { [payload.key]: payload.value });
}

export function setAutobuyGenerator(state: GameState, payload: { id: GeneratorId; on: boolean }): void {
  if (!isGeneratorId(payload.id)) return;
  state.autobuy.generators[payload.id] = payload.on;
}

export function setAutobuyThreshold(state: GameState, payload: { threshold: AutobuyThreshold }): void {
  state.autobuy.threshold = payload.threshold;
}

export function setAutobuyUpgrades(state: GameState, payload: { on: boolean }): void {
  state.autobuy.upgrades = payload.on;
}

/**
 * Cómo elige la autocompra (Poda, fase 9). Se guarda aunque la ventaja falte: sin ella,
 * systems/autobuy.ts trata «payback» como el umbral. Un modo desconocido no cambia nada.
 */
export function setAutobuyMode(state: GameState, payload: { mode: AutobuyMode }): void {
  if (!AUTOBUY_MODES.includes(payload.mode)) return;
  state.autobuy.mode = payload.mode;
}

/** Marca algo como visto (revelación progresiva o aviso de primera vez). */
export function markSeen(state: GameState, payload: { key: string }): void {
  if (state.seen.includes(payload.key)) return;
  state.seen.push(payload.key);
  emit({ type: 'reveal', key: payload.key });
}

/** Todos los ids de generador, para recorrer sin importar data desde la UI. */
export const ALL_GENERATOR_IDS: readonly GeneratorId[] = GENERATORS.map((g) => g.id);

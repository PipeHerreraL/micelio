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
import { evaporateDrop } from '../systems/rain.ts';
import { gain, isGeneratorUnlocked, isUpgradeAppeared, quoteGenerator, spend } from './economy.ts';
import { emit } from './events.ts';
import { sporeScale, sporulateRequirement } from './forest.ts';
import { adaptationCost, nutrientsForSpores, sporesFor } from './formulas.ts';
import * as num from './num.ts';
import type { Num } from './num.ts';
import { resetFields, SPORULATE_RESET } from './resets.ts';
import { derived, invalidate } from './selectors.ts';
import {
  createState,
  hasMutation,
  hasUpgrade,
  isTreeComplete,
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

/**
 * Esporular: suma esporas al nivel y a las disponibles y reinicia la partida. Se conservan
 * nivel, esporas, mutaciones, logros, estadísticas de vida, ajustes y autocompra.
 */
export function sporulate(state: GameState, payload: { now: number }): void {
  if (!canSporulate(state)) return;
  const gained = sporeGain(state);
  state.spores.level += gained;
  state.spores.available += gained;
  state.stats.sporulations += 1;
  state.history.push({
    sporulation: state.stats.sporulations,
    duration: state.stats.runTime,
    spores: gained,
    endedAt: payload.now,
    biome: state.forest.biome,
  });
  if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);

  // Los campos «run» de la tabla vuelven al valor de una partida nueva (src/core/resets.ts).
  resetFields(state, createState(0, payload.now), SPORULATE_RESET);
  // La gota visible se evapora y la cuenta atrás vuelve a sortearse: con solo quitarla,
  // nextIn seguía en 0 y caía otra gota en el siguiente tick.
  evaporateDrop(state);
  state.stats.runTime = 0;
  state.stats.runStartedAt = payload.now;
  applyRunStartBonuses(state);

  invalidate(state);
  emit({ type: 'sporulate', gained, level: state.spores.level });
  checkAchievements(state);
}

/** Bonos de inicio de partida de las mutaciones (Memoria del suelo, Herencia) y del Esclerocio. */
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

/** Marca algo como visto (revelación progresiva o aviso de primera vez). */
export function markSeen(state: GameState, payload: { key: string }): void {
  if (state.seen.includes(payload.key)) return;
  state.seen.push(payload.key);
  emit({ type: 'reveal', key: payload.key });
}

/** Todos los ids de generador, para recorrer sin importar data desde la UI. */
export const ALL_GENERATOR_IDS: readonly GeneratorId[] = GENERATORS.map((g) => g.id);

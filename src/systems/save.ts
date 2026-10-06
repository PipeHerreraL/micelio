/**
 * Guardado y persistencia (PROMPT.md §15). Ningún error del juego debe hacer perder la
 * partida: toda escritura va en try/catch, toda lectura pasa por migraciones y por el
 * validador, y un guardado dañado se copia a una clave de respaldo antes de empezar de cero.
 *
 * Entradas no confiables (ARCHITECTURE.md §6): el contenido de localStorage y el texto de
 * importar partida. Ambos pasan por `validateState`, que reconstruye el estado campo a
 * campo y nunca copia propiedades desconocidas.
 */
import { GENERATOR_IDS, type GeneratorId } from '../data/generators.ts';
import { isAchievementId } from '../data/achievements.ts';
import { getMutation, isMutationId, type MutationId } from '../data/mutations.ts';
import { ADAPTATION_IDS, ADAPTATIONS, getAdaptation, type AdaptationId } from '../data/adaptations.ts';
import {
  BIOME_ADAPTATION_IDS,
  BIOME_ADAPTATIONS,
  HOME_BIOME,
  MAX_LEG,
  RETURN_LEG,
  getBiome,
  getBiomeAdaptation,
  isBiomeId,
  ringOfLeg,
  type BiomeAdaptationId,
  type BiomeId,
} from '../data/biomes.ts';
import { CYCLE_GOAL_LEVEL, MAX_RECORDS, VOW_IDS, type VowId } from '../data/cycle.ts';
import { HISTORY_LIMIT, SPORE_SOFTCAP_BASE } from '../data/prestige.ts';
import { isUpgradeId } from '../data/upgrades.ts';
import { isAdaptationOpen, offeredVows, sameVows } from '../core/forest.ts';
import * as num from '../core/num.ts';
import { PARTNER_IDS, emptyPartners, type PartnerId } from '../partners/ids.ts';
import { PARTNER_CORES, validatePartners, type ValidationMode } from '../partners/registry.ts';
import {
  AUTOBUY_MODES,
  AUTOBUY_THRESHOLDS,
  BUY_AMOUNTS,
  LOCALES,
  NOTATIONS,
  type ActiveEffect,
  type AutobuyMode,
  type AutobuyThreshold,
  type BuyAmount,
  type ChronicleEntry,
  type CycleRecord,
  type CycleState,
  type ForestState,
  type GameState,
  type Locale,
  type Notation,
  type RainDrop,
  type RunRecord,
} from '../core/state.ts';
import {
  isCount,
  isFiniteNumber,
  isNonNegative,
  isObject,
  isTimestamp,
  oneOf,
  uniqueList,
  type RawObject,
} from './validate.ts';
import { compareGameVersions, GAME_VERSION } from '../version.ts';

export const SAVE_KEY = 'micelio:save';
export const BACKUP_KEY = 'micelio:save:backup';
/** Copia del bloque de un socio que no validó al guardar (el guardado sigue con el último bueno). */
export const PARTNER_BACKUP_KEY = 'micelio:save:partner-backup';
export const TAB_KEY = 'micelio:tab';

/** Versión actual del formato. Cada cambio la sube y añade `MIGRATIONS[n]` (n → n + 1). */
export const SAVE_VERSION = 7;

export interface SaveFile {
  version: number;
  /** Marca de tiempo (ms) del guardado: la usa el progreso offline. */
  savedAt: number;
  state: GameState;
}

export type Migration = (raw: RawObject) => RawObject;

/**
 * Migraciones: `MIGRATIONS[n]` lleva un guardado de la versión n a la n + 1. Reciben el
 * objeto completo `{ version, savedAt, state }` y devuelven uno nuevo.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /**
   * 1 → 2: aparece la notación de nombres («1,5 millones») y pasa a ser la de por defecto.
   * Quien tenía «suffix» lo tenía por defecto (en la versión 1 no había otra cosa que
   * elegir de inicio), así que pasa a «names»; científica e ingeniería se respetan.
   */
  1: (raw) => {
    const state = isObject(raw.state) ? raw.state : null;
    const settings = state && isObject(state.settings) ? state.settings : null;
    if (!state || !settings) return raw;
    const notation = settings.notation === 'suffix' ? 'names' : settings.notation;
    return { ...raw, state: { ...state, settings: { ...settings, notation } } };
  },
  /** 2 → 3: aparece el historial de partidas, vacío para las partidas que ya existían. */
  2: (raw) => {
    const state = isObject(raw.state) ? raw.state : null;
    if (!state) return raw;
    return { ...raw, state: { ...state, history: [] } };
  },
  /**
   * 3 → 4: llegan la madurez de la red y las adaptaciones. Una partida que ya pasaba del
   * umbral conserva su bono: su nivel actual queda como suelo lineal (sporeFloor), así que la
   * actualización no le quita producción; solo los niveles nuevos rinden menos.
   */
  3: (raw) => {
    const state = isObject(raw.state) ? raw.state : null;
    if (!state) return raw;
    const spores = isObject(state.spores) ? state.spores : null;
    const level = spores && isCount(spores.level) ? spores.level : 0;
    const adaptations = Object.fromEntries(ADAPTATIONS.map((a) => [a.id, 0]));
    const sporeFloor = level > SPORE_SOFTCAP_BASE ? level : 0;
    return { ...raw, state: { ...state, adaptations, sporeFloor } };
  },
  /**
   * 4 → 5: llega el viaje (fase 8). La partida sigue en el bosque natal, tramo 0, y los
   * nutrientes del bosque son los de toda la vida: las esporas por ganar, el requisito y la
   * producción quedan idénticos (decisión del usuario: nadie pierde progreso ni bono al
   * actualizar). La Crónica empieza vacía: si la partida ya cumple el Acto I, el núcleo lo
   * cierra en su primer segundo (systems/journey.ts), así la regla no se escribe dos veces.
   * Todas las partidas del historial se jugaron en el natal.
   */
  4: (raw) => {
    const state = isObject(raw.state) ? raw.state : null;
    if (!state) return raw;
    const stats = isObject(state.stats) ? state.stats : null;
    const startedAt = stats && isNonNegative(stats.startedAt) ? stats.startedAt : 0;
    const history = Array.isArray(state.history)
      ? state.history.map((r: unknown) => (isObject(r) ? { ...r, biome: HOME_BIOME } : r))
      : state.history;
    // Si lifetimeEarned no es válido, el validador rechaza los dos: aquí no se inventa nada.
    const forest = {
      biome: HOME_BIOME,
      leg: 0,
      earned: state.lifetimeEarned,
      arrivedAt: startedAt,
      arrivalSporulations: 0,
      arrivalPlayTime: 0,
    };
    const biomeAdaptations = Object.fromEntries(BIOME_ADAPTATIONS.map((a) => [a.id, 0]));
    return { ...raw, state: { ...state, history, forest, chronicle: [], biomeAdaptations } };
  },
  /**
   * 5 → 6: llegan los socios (fase 9), todos sin llegar. Si la partida ya cumple la regla de
   * llegada, el núcleo trae al plasmodio en su primer segundo (systems/partners.ts), así la regla no
   * se escribe dos veces. La autocompra sigue eligiendo por umbral; la Poda abre el otro modo.
   */
  5: (raw) => {
    const state = isObject(raw.state) ? raw.state : null;
    if (!state) return raw;
    const autobuy = isObject(state.autobuy) ? { ...state.autobuy, mode: 'threshold' } : state.autobuy;
    return { ...raw, state: { ...state, autobuy, partners: emptyPartners() } };
  },
  /**
   * 6 → 7: llegan la pradera, la tundra, El regreso y el ciclo libre (fase 10). La v7 entra entera
   * de una vez, también las claves cuyas reglas llegan después: así ninguna v7 escrita por una
   * versión intermedia deja de cargar en la final. Solo se añaden claves (las adaptaciones nuevas a
   * 0, el ciclo sin empezar y ningún récord); el bosque, la Crónica, los niveles, las esporas,
   * `seen` y los socios no se tocan. Quien está en el muro carga con la pradera y la tundra
   * abiertas porque las abre la regla de los anillos, no una marca de aquí. Los ids van escritos a
   * mano y no salen de los datos: la migración describe la v7 aunque más adelante se sumen ids.
   */
  6: (raw) => {
    const state = isObject(raw.state) ? raw.state : null;
    if (!state || !isObject(state.biomeAdaptations) || !isObject(state.adaptations)) return raw;
    const biomeAdaptations = {
      ...state.biomeAdaptations,
      ringFront: 0,
      glomalin: 0,
      pilobolus: 0,
      dwarfBirch: 0,
      snowMold: 0,
      lichen: 0,
    };
    const adaptations = { ...state.adaptations, sporePrint: 0, blackCords: 0, waxcaps: 0 };
    const cycle = { stays: 0, done: 0, vows: [], woken: [] };
    return { ...raw, state: { ...state, biomeAdaptations, adaptations, cycle, records: [] } };
  },
};

/** Lo mínimo de `Storage` que usamos; permite probar sin navegador. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Tope del texto de importar antes de decodificar: un guardado real pesa pocos kB. */
export const IMPORT_MAX_CHARS = 200_000;
/** Tope de marcas de revelación: el juego usa unas decenas. */
const MAX_SEEN = 500;

// ---------------------------------------------------------------------------------------
// Validación (los validadores básicos están en ./validate.ts)

/**
 * Reconstruye un GameState a partir de datos no confiables. Devuelve null si cualquier
 * campo falta, tiene el tipo equivocado o no es un número finito y no negativo.
 */
export function validateState(raw: unknown, mode: ValidationMode = 'strict'): GameState | null {
  return checkState(raw, mode)?.state ?? null;
}

interface StateCheck {
  state: GameState;
  /** Socios que no validaron y vuelven a null (solo en modo lenient). */
  partnersReset: PartnerId[];
}

function checkState(raw: unknown, mode: ValidationMode): StateCheck | null {
  if (!isObject(raw)) return null;

  const nutrients = num.parse(raw.nutrients);
  const runEarned = num.parse(raw.runEarned);
  const lifetimeEarned = num.parse(raw.lifetimeEarned);
  if (nutrients === null || runEarned === null || lifetimeEarned === null) return null;

  if (!isObject(raw.owned)) return null;
  const owned = {} as Record<GeneratorId, number>;
  for (const id of GENERATOR_IDS) {
    const count = raw.owned[id];
    if (!isCount(count)) return null;
    owned[id] = count;
  }

  const upgrades = uniqueList(raw.upgrades, isUpgradeId);
  const mutations = uniqueList<MutationId>(raw.mutations, isMutationId);
  const achievements = uniqueList(raw.achievements, isAchievementId);
  if (!upgrades || !mutations || !achievements) return null;

  if (!isObject(raw.spores) || !isCount(raw.spores.level) || !isCount(raw.spores.available)) return null;
  const spores = { level: raw.spores.level, available: raw.spores.available };

  if (!Array.isArray(raw.effects)) return null;
  const effects: ActiveEffect[] = [];
  for (const e of raw.effects) {
    if (!isObject(e) || !oneOf(e.kind, ['downpour', 'storm'] as const)) return null;
    if (!isFiniteNumber(e.remaining) || !isNonNegative(e.duration)) return null;
    effects.push({ kind: e.kind, remaining: e.remaining, duration: e.duration });
  }

  if (!isObject(raw.rain) || !isFiniteNumber(raw.rain.nextIn)) return null;
  let drop: RainDrop | null = null;
  if (raw.rain.drop !== null) {
    const d = raw.rain.drop;
    if (!isObject(d) || !isFiniteNumber(d.x) || !isFiniteNumber(d.y) || !isFiniteNumber(d.remaining)) {
      return null;
    }
    if (d.x < 0 || d.x > 1 || d.y < 0 || d.y > 1) return null;
    drop = { x: d.x, y: d.y, remaining: d.remaining };
  }
  const rain = { nextIn: raw.rain.nextIn, drop };

  const ab = raw.autobuy;
  if (!isObject(ab) || !isObject(ab.generators) || typeof ab.upgrades !== 'boolean') return null;
  if (!oneOf<AutobuyThreshold>(ab.threshold, AUTOBUY_THRESHOLDS)) return null;
  if (!oneOf<AutobuyMode>(ab.mode, AUTOBUY_MODES)) return null;
  const autobuyGenerators = {} as Record<GeneratorId, boolean>;
  for (const id of GENERATOR_IDS) {
    const flag = ab.generators[id];
    if (typeof flag !== 'boolean') return null;
    autobuyGenerators[id] = flag;
  }
  const autobuy = {
    generators: autobuyGenerators,
    threshold: ab.threshold,
    upgrades: ab.upgrades,
    mode: ab.mode,
  };

  const s = raw.stats;
  if (!isObject(s)) return null;
  const statNumbers = ['runTime', 'totalTime', 'maxNps', 'idleClickTime'] as const;
  for (const key of statNumbers) if (!isNonNegative(s[key])) return null;
  if (!isTimestamp(s.startedAt) || !isTimestamp(s.runStartedAt)) return null;
  const statCounts = ['clicks', 'drops', 'sporulations'] as const;
  for (const key of statCounts) if (!isCount(s[key])) return null;
  const stats = {
    runTime: s.runTime as number,
    totalTime: s.totalTime as number,
    startedAt: s.startedAt,
    runStartedAt: s.runStartedAt,
    maxNps: s.maxNps as number,
    clicks: s.clicks as number,
    drops: s.drops as number,
    sporulations: s.sporulations as number,
    idleClickTime: s.idleClickTime as number,
  };

  const st = raw.settings;
  if (!isObject(st)) return null;
  if (st.locale !== null && !oneOf<Locale>(st.locale, LOCALES)) return null;
  if (!oneOf<Notation>(st.notation, NOTATIONS)) return null;
  if (!oneOf<BuyAmount>(st.buyAmount, BUY_AMOUNTS)) return null;
  if (typeof st.sound !== 'boolean' || typeof st.reducedMotion !== 'boolean') return null;
  if (!isFiniteNumber(st.volume) || st.volume < 0 || st.volume > 1) return null;
  const settings = {
    locale: st.locale,
    notation: st.notation,
    sound: st.sound,
    volume: st.volume,
    reducedMotion: st.reducedMotion,
    buyAmount: st.buyAmount,
  };

  if (!Array.isArray(raw.seen) || raw.seen.length > MAX_SEEN) return null;
  const seen: string[] = [];
  for (const key of raw.seen) {
    if (typeof key !== 'string' || key.length > 64) return null;
    if (!seen.includes(key)) seen.push(key);
  }

  if (!isCount(raw.rngSeed) || raw.rngSeed > 0xffffffff) return null;

  // El historial se acota donde se construye (AGENTS.md: guardar estructuras en el borde).
  if (!Array.isArray(raw.history) || raw.history.length > HISTORY_LIMIT) return null;
  const history: RunRecord[] = [];
  for (const r of raw.history) {
    if (!isObject(r) || !isCount(r.sporulation) || !isCount(r.spores)) return null;
    if (!isNonNegative(r.duration) || !isTimestamp(r.endedAt) || !isBiomeId(r.biome)) return null;
    history.push({
      sporulation: r.sporulation,
      duration: r.duration,
      spores: r.spores,
      endedAt: r.endedAt,
      biome: r.biome,
    });
  }

  if (!isObject(raw.adaptations)) return null;
  const adaptations = {} as Record<AdaptationId, number>;
  for (const id of ADAPTATION_IDS) {
    const rank = raw.adaptations[id];
    const max = getAdaptation(id).max;
    if (!isCount(rank) || (max !== null && rank > max)) return null;
    adaptations[id] = rank;
  }
  if (!isCount(raw.sporeFloor)) return null;

  const forest = validateForest(raw.forest, stats, lifetimeEarned);
  if (!forest) return null;
  const chronicle = validateChronicle(raw.chronicle, forest);
  if (!chronicle) return null;
  const visited = new Set<BiomeId>([...chronicle.map((e) => e.biome), forest.biome]);
  const biomeAdaptations = validateBiomeAdaptations(raw.biomeAdaptations, visited);
  if (!biomeAdaptations) return null;
  const cycle = validateCycle(raw.cycle, forest.biome, mutations, spores.level);
  if (!cycle || !isStayValid(forest, chronicle, cycle)) return null;
  const records = validateRecords(raw.records, cycle, stats.sporulations);
  if (!records) return null;
  // Una cosmética de voto con rangos sin el récord de su voto no sale del juego, que niega esa
  // compra con la misma regla, y los récords nunca se borran: solo de un guardado editado.
  if (ADAPTATION_IDS.some((id) => adaptations[id] > 0 && !isAdaptationOpen(records, id))) return null;
  // Con «sin lluvia» no cae ninguna gota (sembrar quita la que hubiera y el tick no las suelta): una
  // gota guardada solo sale de un guardado editado, y quitarla no cambia nada más.
  if (cycle.vows.includes('noRain')) rain.drop = null;

  // Al final: un socio inválido en modo lenient no debe ocultar un error de la red.
  const partners = validatePartners(raw.partners, mode);
  if (!partners) return null;

  const state: GameState = {
    nutrients,
    runEarned,
    lifetimeEarned,
    owned,
    upgrades,
    spores,
    mutations,
    achievements,
    effects,
    rain,
    autobuy,
    stats,
    settings,
    seen,
    rngSeed: raw.rngSeed,
    history,
    adaptations,
    sporeFloor: raw.sporeFloor,
    forest,
    chronicle,
    biomeAdaptations,
    partners: partners.partners,
    cycle,
    records,
  };
  return { state, partnersReset: partners.reset };
}

/**
 * El bioma de un tramo es del anillo que le toca (fase 10): los anillos se recorren enteros y en
 * orden, así que un bosque en el tramo 3 o la pradera en el tramo 1 solo salen de un guardado
 * manipulado, y cambiarían la R del bosque (LEG_SCALE es por tramo). El natal es el tramo 0 o el
 * 5; el tramo 5 (El regreso y el ciclo libre) admite cualquier bioma, y lo acotan la Crónica y
 * `cycle` (`isStayValid`).
 */
function inLegRing(biome: BiomeId, leg: number): boolean {
  if (leg === 0) return biome === HOME_BIOME;
  if (leg === RETURN_LEG) return true;
  return getBiome(biome).ring === ringOfLeg(leg);
}

/**
 * El bosque actual. `earned` no puede superar los nutrientes de vida: las dos sumas avanzan con
 * los mismos sumandos (economy.gain) y el natal empieza con los de vida, así que solo un
 * guardado manipulado los descuadra.
 */
function validateForest(
  raw: unknown,
  stats: { sporulations: number; totalTime: number },
  lifetimeEarned: number,
): ForestState | null {
  if (!isObject(raw) || !isBiomeId(raw.biome)) return null;
  if (!isCount(raw.leg) || raw.leg > MAX_LEG || !inLegRing(raw.biome, raw.leg)) return null;
  const earned = num.parse(raw.earned);
  if (earned === null || num.gt(earned, lifetimeEarned)) return null;
  if (!isTimestamp(raw.arrivedAt)) return null;
  if (!isCount(raw.arrivalSporulations) || raw.arrivalSporulations > stats.sporulations) return null;
  if (!isNonNegative(raw.arrivalPlayTime) || raw.arrivalPlayTime > stats.totalTime) return null;
  return {
    biome: raw.biome,
    leg: raw.leg,
    earned,
    arrivedAt: raw.arrivedAt,
    arrivalSporulations: raw.arrivalSporulations,
    arrivalPlayTime: raw.arrivalPlayTime,
  };
}

/**
 * La Crónica: una entrada por tramo cerrado, en orden y sin huecos. Las tres funciones que la
 * construyen (systems/journey.ts) añaden como mucho una entrada por tramo, así que el tope es
 * el número de tramos (seis) y se comprueba antes de recorrerla. Las entradas 1–4 son destinos
 * distintos de su anillo; el natal solo vuelve a aparecer en la sexta, la de El regreso.
 */
function validateChronicle(raw: unknown, forest: ForestState): ChronicleEntry[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_LEG + 1) return null;
  if (raw.length !== forest.leg && raw.length !== forest.leg + 1) return null;
  const out: ChronicleEntry[] = [];
  const seen = new Set<BiomeId>();
  for (let i = 0; i < raw.length; i += 1) {
    const e: unknown = raw[i];
    if (!isObject(e) || !isBiomeId(e.biome) || e.leg !== i) return null;
    if (i === RETURN_LEG ? e.biome !== HOME_BIOME : !inLegRing(e.biome, i) || seen.has(e.biome)) return null;
    seen.add(e.biome);
    if (!isTimestamp(e.arrivedAt) || !isCount(e.sporulations) || !isNonNegative(e.playTime)) return null;
    // El Acto I se cierra sin reloj (null); los demás bosques, con la fecha de la esporulación.
    let colonizedAt: number | null = null;
    if (i === 0) {
      if (e.colonizedAt !== null) return null;
    } else {
      if (!isTimestamp(e.colonizedAt)) return null;
      colonizedAt = e.colonizedAt;
    }
    // Solo los bosques que se dejaron tienen fecha de partida y nivel alcanzado.
    let leftAt: number | null = null;
    let levelReached: number | null = null;
    if (i < forest.leg) {
      if (!isTimestamp(e.leftAt) || !isCount(e.levelReached)) return null;
      leftAt = e.leftAt;
      levelReached = e.levelReached;
    } else if (e.leftAt !== null || e.levelReached !== null) {
      return null;
    }
    out.push({
      biome: e.biome,
      leg: i,
      arrivedAt: e.arrivedAt,
      colonizedAt,
      sporulations: e.sporulations,
      playTime: e.playTime,
      leftAt,
      levelReached,
    });
  }
  // Hasta el tramo 4: si el tramo actual ya está cerrado, su entrada es la del bioma actual; si
  // no, no aparece. En el tramo 5 el natal ya está en la entrada 0 y el ciclo libre puede volver a
  // cualquier bioma: lo comprueba `isStayValid`, que ya conoce `cycle`.
  if (forest.leg === RETURN_LEG) return out;
  const last = out[out.length - 1];
  if (out.length === forest.leg + 1 && last?.biome !== forest.biome) return null;
  if (out.length === forest.leg && seen.has(forest.biome)) return null;
  return out;
}

/**
 * El tramo 5 frente al ciclo libre: durante El regreso (cinco entradas) el linaje vive en el natal
 * y no hay ciclos; cumplido (seis), sin ciclos sigue en el natal y solo un ciclo empezado lo lleva
 * a otro bioma. Fuera del tramo 5 no hay ciclos.
 */
function isStayValid(forest: ForestState, chronicle: readonly ChronicleEntry[], cycle: CycleState): boolean {
  if (forest.leg !== RETURN_LEG) return cycle.stays === 0;
  if (chronicle.length === RETURN_LEG) return cycle.stays === 0 && forest.biome === HOME_BIOME;
  return cycle.stays > 0 || forest.biome === HOME_BIOME;
}

/** Rangos de bioma: dentro del tope y solo de biomas por los que el linaje ya pasó. */
function validateBiomeAdaptations(
  raw: unknown,
  visited: ReadonlySet<BiomeId>,
): Record<BiomeAdaptationId, number> | null {
  if (!isObject(raw)) return null;
  const ranks = {} as Record<BiomeAdaptationId, number>;
  for (const id of BIOME_ADAPTATION_IDS) {
    const rank = raw[id];
    if (!isCount(rank)) return null;
    const def = getBiomeAdaptation(id);
    if (rank > def.max || (rank > 0 && !visited.has(def.biome))) return null;
    ranks[id] = rank;
  }
  return ranks;
}

/**
 * Votos de un ciclo o de un récord en `biome`: ids que ese bioma ofrece (en el Chocó no hay «sin
 * lluvia»), sin repetir y en el orden de VOW_IDS, que es como los escriben sembrar y el récord. Null
 * si la lista no vale: el orden decide la clave de un récord, y uno desordenado duplicaría casillas.
 */
function validateVows(raw: unknown, biome: BiomeId): VowId[] | null {
  if (!Array.isArray(raw) || raw.length > VOW_IDS.length) return null;
  const offered = offeredVows(biome);
  const vows: VowId[] = [];
  for (const item of raw) {
    const vow = offered.find((id) => id === item);
    if (vow === undefined) return null;
    vows.push(vow);
  }
  const canonical = VOW_IDS.filter((id) => vows.includes(id));
  return sameVows(vows, canonical) ? vows : null;
}

/**
 * El ciclo libre (fase 10): ciclos empezados y cumplidos, enteros, y nunca más cumplidos que
 * empezados; dónde puede haber ciclos lo comprueba `isStayValid`. Los votos solo existen en un ciclo
 * empezado y sin cumplir: sembrar los jura con el nivel en 0 y la esporulación que llega a la meta
 * los levanta. Las mutaciones despiertas, solo con «sin mutaciones»: compradas, con sus requisitos
 * despiertos y sin costar más que las esporas del ciclo (el nivel, que empezó en 0).
 *
 * Con el ciclo en curso sin cumplir (nivel por debajo de la meta), como mucho uno menos cumplido que
 * empezados: sembrar pone el nivel en 0 y suma un empezado, y cumplir suma uno al cruzar la meta,
 * una vez por ciclo. Tantos como empezados solo sale de un guardado editado o importado, y se repara
 * al cargar en lugar de rechazarlo: `done` es solo presentación (el contador de la Crónica y de
 * Estadísticas, y el logro de un ciclo, que ya se ganó). Cargado tal cual, cumplir el ciclo dejaba
 * más cumplidos que empezados y este mismo validador rechazaba cada guardado siguiente hasta la
 * próxima siembra, y otra vez al cumplir cada ciclo después (BUG-JOURNAL #29; precedente, #18).
 */
function validateCycle(
  raw: unknown,
  biome: BiomeId,
  mutations: readonly MutationId[],
  level: number,
): CycleState | null {
  if (!isObject(raw) || !isCount(raw.stays) || !isCount(raw.done) || raw.done > raw.stays) return null;
  const vows = validateVows(raw.vows, biome);
  if (!vows || (vows.length > 0 && (raw.stays === 0 || level >= CYCLE_GOAL_LEVEL))) return null;
  const woken = uniqueList<MutationId>(raw.woken, isMutationId);
  if (!woken || (woken.length > 0 && !vows.includes('noMutations'))) return null;
  let spent = 0;
  for (const id of woken) {
    const def = getMutation(id);
    if (!mutations.includes(id) || !def.requires.every((req) => woken.includes(req))) return null;
    spent += def.cost;
  }
  if (spent > level) return null;
  const done = raw.stays > 0 && level < CYCLE_GOAL_LEVEL ? Math.min(raw.done, raw.stays - 1) : raw.done;
  return { stays: raw.stays, done, vows, woken };
}

/**
 * Los récords del ciclo libre: uno por bioma y votos (el tope se comprueba antes de recorrerlos),
 * con los votos que ese bioma ofrece, ninguno sin un ciclo cumplido y sin más partidas que las
 * esporulaciones de la vida. Un tiempo negativo se repara a 0 en lugar de rechazar el guardado: lo
 * dejan un reloj que retrocedió o un guardado importado de un dispositivo con otra hora, es solo
 * presentación, y rechazarlo bloquearía el guardado para siempre (el récord negativo sería el mejor
 * y nunca se reemplazaría). Precedente: BUG-JOURNAL #18.
 */
function validateRecords(raw: unknown, cycle: CycleState, sporulations: number): CycleRecord[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_RECORDS) return null;
  if (raw.length > 0 && cycle.done < 1) return null;
  const out: CycleRecord[] = [];
  for (const r of raw) {
    if (!isObject(r) || !isBiomeId(r.biome)) return null;
    const biome = r.biome;
    const vows = validateVows(r.vows, biome);
    if (!vows || out.some((o) => o.biome === biome && sameVows(o.vows, vows))) return null;
    if (!isFiniteNumber(r.time) || !isCount(r.runs) || r.runs < 1 || r.runs > sporulations) return null;
    if (!isTimestamp(r.at)) return null;
    out.push({ biome, vows, time: Math.max(0, r.time), runs: r.runs, at: r.at });
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Formato y migraciones

export type ParseError = 'json' | 'shape' | 'version' | 'migration' | 'invalid';
/** `partnersReset`: socios que no validaron y vuelven a null (solo en modo lenient). */
export type ParseResult =
  { ok: true; save: SaveFile; partnersReset: PartnerId[] } | { ok: false; error: ParseError };

/** Aplica en orden las migraciones desde la versión del guardado hasta la actual. */
export function migrate(
  raw: RawObject,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target = SAVE_VERSION,
): RawObject | null {
  let current = raw;
  let version = current.version;
  if (!isCount(version) || version < 1 || version > target) return null;
  while (version < target) {
    const step = migrations[version];
    if (!step) return null;
    current = step(current);
    version += 1;
    current = { ...current, version };
  }
  return current;
}

/**
 * Parsea el JSON de un guardado, lo migra y lo valida. Nunca lanza. En modo `lenient` un socio
 * inválido vuelve a null en lugar de invalidar el guardado (ARCHITECTURE.md §4.29).
 */
export function parseSave(
  text: string,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target = SAVE_VERSION,
  mode: ValidationMode = 'strict',
): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (!isObject(raw) || !isTimestamp(raw.savedAt) || !('state' in raw)) return { ok: false, error: 'shape' };
  if (!isCount(raw.version) || raw.version < 1 || raw.version > target)
    return { ok: false, error: 'version' };
  let migrated: RawObject | null;
  try {
    migrated = migrate(raw, migrations, target);
  } catch {
    return { ok: false, error: 'migration' };
  }
  if (!migrated || !isTimestamp(migrated.savedAt)) return { ok: false, error: 'migration' };
  const checked = checkState(migrated.state, mode);
  if (!checked) return { ok: false, error: 'invalid' };
  return {
    ok: true,
    save: { version: target, savedAt: migrated.savedAt, state: checked.state },
    partnersReset: checked.partnersReset,
  };
}

/**
 * `game` es la versión del juego que guardó: una versión anterior que no entienda el guardado
 * sabe así que no debe pisarlo (`isFromNewerGame`). Las anteriores a la 1.5.0 lo ignoran.
 */
export function serializeSave(state: GameState, now: number): string {
  const file: SaveFile & { game?: string } =
    GAME_VERSION === ''
      ? { version: SAVE_VERSION, savedAt: now, state }
      : { version: SAVE_VERSION, savedAt: now, game: GAME_VERSION, state };
  return JSON.stringify(file);
}

/**
 * El guardado lo escribió un juego más nuevo que este: con un formato posterior, o una versión
 * posterior del juego (con ids que esta no conoce). Pasa al abrir sin conexión la versión que el
 * service worker tenía guardada después de jugar a una más nueva (BUG-JOURNAL #24).
 */
export function isFromNewerGame(text: string, game = GAME_VERSION): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return false;
  }
  if (!isObject(raw)) return false;
  if (isCount(raw.version) && raw.version > SAVE_VERSION) return true;
  return typeof raw.game === 'string' && compareGameVersions(raw.game, game) > 0;
}

// ---------------------------------------------------------------------------------------
// Almacenamiento

export type LoadResult =
  | { kind: 'empty' }
  /** `partnersReset`: socios que no se pudieron recuperar (vuelven a empezar; hay copia y aviso). */
  | { kind: 'loaded'; save: SaveFile; partnersReset: PartnerId[] }
  | { kind: 'corrupt'; error: ParseError; backedUp: boolean }
  /** De un juego más nuevo: no se copia ni se pisa; quien llama no guarda nada y avisa. */
  | { kind: 'newer' }
  | { kind: 'unavailable' };

/**
 * Último bloque válido de cada socio (JSON), anotado tras cada carga y cada guardado buenos. Si
 * un socio deja de validar en memoria, el guardado sigue con este bloque: un desliz del socio no
 * impide guardar la red (decisión del usuario: ninguna partida pierde progreso).
 */
const lastValidPartners = new Map<PartnerId, string>();

function rememberPartners(state: GameState): void {
  for (const id of PARTNER_IDS) {
    const block = state.partners[id];
    if (block === null) lastValidPartners.delete(id);
    else lastValidPartners.set(id, JSON.stringify(block));
  }
}

/** Vuelve a poner en memoria el último bloque válido del socio, o null si no lo hay. */
function restorePartner(state: GameState, id: PartnerId): void {
  const text = lastValidPartners.get(id);
  let restored = null;
  if (text !== undefined) {
    try {
      restored = PARTNER_CORES[id].validate(JSON.parse(text));
    } catch {
      restored = null;
    }
  }
  state.partners[id] = restored;
}

/**
 * Lee el guardado. Si lo escribió un juego más nuevo, no lo toca y devuelve `newer`. Si está
 * dañado, lo copia a `micelio:save:backup` para no perderlo y devuelve `corrupt`: quien llama
 * empieza una partida nueva y avisa. Si solo falla un socio, la
 * partida carga con ese socio desde cero, el texto original va a la copia de respaldo y quien llama
 * avisa (`partnersReset`).
 */
export function loadGame(storage: StorageLike | null): LoadResult {
  if (!storage) return { kind: 'unavailable' };
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { kind: 'unavailable' };
  }
  if (text === null) return { kind: 'empty' };
  const parsed = parseSave(text, MIGRATIONS, SAVE_VERSION, 'lenient');
  if (parsed.ok) {
    if (parsed.partnersReset.length > 0) {
      try {
        storage.setItem(BACKUP_KEY, text);
      } catch {
        // Sin espacio: el aviso lo dice igual; la red se carga entera.
      }
    }
    rememberPartners(parsed.save.state);
    return { kind: 'loaded', save: parsed.save, partnersReset: parsed.partnersReset };
  }
  if (isFromNewerGame(text)) return { kind: 'newer' };
  let backedUp = false;
  try {
    storage.setItem(BACKUP_KEY, text);
    backedUp = true;
  } catch {
    // Sin espacio ni para la copia: el texto dañado se queda en SAVE_KEY hasta el próximo
    // guardado correcto, que lo sobrescribirá. No hay otro sitio donde ponerlo.
  }
  return { kind: 'corrupt', error: parsed.error, backedUp };
}

/**
 * Resultado de guardar: `saved`; `restored` si se guardó tras devolver un socio inválido a su
 * último estado válido (quien llama avisa); `failed` si el almacenamiento falla o está lleno;
 * `invalid` si la red tiene un valor imposible (un número no finito, un id desconocido). En ese
 * caso no se escribe nada: es mejor conservar el último guardado bueno que pisarlo con uno que la
 * próxima carga mandaría a la copia de respaldo.
 */
export type SaveOutcome = 'saved' | 'restored' | 'failed' | 'invalid';

/**
 * Guarda la partida. Un socio que no valida no impide guardar la red: su bloque malo se copia a
 * `micelio:save:partner-backup`, el estado en memoria vuelve a su último bloque válido (o a null)
 * y el guardado se escribe con él. Es el único sitio fuera de una acción que escribe en el estado;
 * los socios no entran en ningún selector, así que no hay caché que invalidar.
 */
export function saveGame(storage: StorageLike | null, state: GameState, now: number): SaveOutcome {
  if (!storage) return 'failed';
  let text = serializeSave(state, now);
  let outcome: SaveOutcome = 'saved';
  if (!parseSave(text).ok) {
    const lenient = parseSave(text, MIGRATIONS, SAVE_VERSION, 'lenient');
    if (!lenient.ok || lenient.partnersReset.length === 0) return 'invalid';
    const bad: Partial<Record<PartnerId, unknown>> = {};
    for (const id of lenient.partnersReset) bad[id] = state.partners[id];
    try {
      storage.setItem(PARTNER_BACKUP_KEY, JSON.stringify({ savedAt: now, partners: bad }));
    } catch {
      // Sin espacio para la copia: se sigue, la red importa más.
    }
    for (const id of lenient.partnersReset) restorePartner(state, id);
    text = serializeSave(state, now);
    if (!parseSave(text).ok) return 'invalid';
    outcome = 'restored';
  }
  rememberPartners(state);
  try {
    storage.setItem(SAVE_KEY, text);
    return outcome;
  } catch {
    return 'failed';
  }
}

/**
 * Preferencias de la interfaz que no son partida (p. ej. ver la placa como lista): se guardan
 * aparte y un fallo del almacenamiento no importa; todo acceso a localStorage pasa por este
 * archivo (AGENTS.md).
 */
export const PLATE_VIEW_KEY = 'micelio:plateView';

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la preferencia dura lo que la sesión.
  }
}

/** Borra la partida (Ajustes → Borrar partida). */
export function wipeGame(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // Si no se puede borrar, tampoco se pudo guardar: la partida nueva sigue en memoria.
  }
}

// ---------------------------------------------------------------------------------------
// Dos pestañas

/** Anuncia esta pestaña como la dueña del guardado. */
export function claimTab(storage: StorageLike | null, tabId: string): void {
  if (!storage) return;
  try {
    storage.setItem(TAB_KEY, tabId);
  } catch {
    // Sin almacenamiento tampoco hay guardado que proteger.
  }
}

/** Si un evento `storage` dice que otra pestaña tomó el guardado. */
export function isTakenByOtherTab(key: string | null, newValue: string | null, tabId: string): boolean {
  return key === TAB_KEY && newValue !== null && newValue !== tabId;
}

// ---------------------------------------------------------------------------------------
// Exportar e importar

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array | null {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Texto Base64 del guardado. Codifica con TextEncoder: `btoa` directo falla con tildes y
 * eñes, y aunque hoy el estado no tiene texto libre, mañana podría.
 */
export function exportSave(state: GameState, now: number): string {
  return bytesToBase64(new TextEncoder().encode(serializeSave(state, now)));
}

/** `newer`: la partida es de una versión más nueva del juego; hay que actualizar para importarla. */
export type ImportError = 'empty' | 'tooLarge' | 'base64' | 'encoding' | 'newer' | ParseError;
export type ImportResult =
  { ok: true; save: SaveFile; partnersReset: PartnerId[] } | { ok: false; error: ImportError };

/**
 * Decodifica y valida un texto exportado. No toca la partida actual. Indulgente con los socios
 * (como la carga): un socio inválido vuelve a empezar y la confirmación de importar lo dice, así la
 * copia de respaldo que deja la carga se puede importar.
 */
export function importSave(text: string): ImportResult {
  const trimmed = text.replace(/\s+/g, '');
  if (trimmed.length === 0) return { ok: false, error: 'empty' };
  if (trimmed.length > IMPORT_MAX_CHARS) return { ok: false, error: 'tooLarge' };
  const bytes = base64ToBytes(trimmed);
  if (!bytes) return { ok: false, error: 'base64' };
  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: 'encoding' };
  }
  const parsed = parseSave(json, MIGRATIONS, SAVE_VERSION, 'lenient');
  if (parsed.ok) return { ok: true, save: parsed.save, partnersReset: parsed.partnersReset };
  // Una partida exportada de una versión más nueva (por ejemplo, de la web en una app sin actualizar)
  // no está dañada: el aviso dice que hay que actualizar el juego.
  return { ok: false, error: isFromNewerGame(json) ? 'newer' : parsed.error };
}

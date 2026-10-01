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
import { isMutationId, type MutationId } from '../data/mutations.ts';
import { ADAPTATIONS, type AdaptationId } from '../data/adaptations.ts';
import {
  BIOME_ADAPTATIONS,
  HOME_BIOME,
  MAX_LEG,
  isBiomeId,
  type BiomeAdaptationId,
  type BiomeId,
} from '../data/biomes.ts';
import { HISTORY_LIMIT, SPORE_SOFTCAP_BASE } from '../data/prestige.ts';
import { isUpgradeId } from '../data/upgrades.ts';
import * as num from '../core/num.ts';
import {
  AUTOBUY_THRESHOLDS,
  BUY_AMOUNTS,
  LOCALES,
  NOTATIONS,
  type ActiveEffect,
  type AutobuyThreshold,
  type BuyAmount,
  type ChronicleEntry,
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

export const SAVE_KEY = 'micelio:save';
export const BACKUP_KEY = 'micelio:save:backup';
export const TAB_KEY = 'micelio:tab';

/** Versión actual del formato. Cada cambio la sube y añade `MIGRATIONS[n]` (n → n + 1). */
export const SAVE_VERSION = 5;

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
export function validateState(raw: unknown): GameState | null {
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
  const autobuyGenerators = {} as Record<GeneratorId, boolean>;
  for (const id of GENERATOR_IDS) {
    const flag = ab.generators[id];
    if (typeof flag !== 'boolean') return null;
    autobuyGenerators[id] = flag;
  }
  const autobuy = { generators: autobuyGenerators, threshold: ab.threshold, upgrades: ab.upgrades };

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
  for (const def of ADAPTATIONS) {
    const rank = raw.adaptations[def.id];
    if (!isCount(rank) || (def.max !== null && rank > def.max)) return null;
    adaptations[def.id] = rank;
  }
  if (!isCount(raw.sporeFloor)) return null;

  const forest = validateForest(raw.forest, stats, lifetimeEarned);
  if (!forest) return null;
  const chronicle = validateChronicle(raw.chronicle, forest);
  if (!chronicle) return null;
  const visited = new Set<BiomeId>([...chronicle.map((e) => e.biome), forest.biome]);
  const biomeAdaptations = validateBiomeAdaptations(raw.biomeAdaptations, visited);
  if (!biomeAdaptations) return null;

  return {
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
  };
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
  if (!isCount(raw.leg) || raw.leg > MAX_LEG) return null;
  if ((raw.leg === 0) !== (raw.biome === HOME_BIOME)) return null;
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
 * La Crónica: una entrada por tramo cerrado, en orden y sin huecos. Las dos funciones que la
 * construyen (systems/journey.ts) añaden como mucho una entrada por tramo, así que el tope es
 * el número de tramos y se comprueba antes de recorrerla.
 */
function validateChronicle(raw: unknown, forest: ForestState): ChronicleEntry[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_LEG + 1) return null;
  if (raw.length !== forest.leg && raw.length !== forest.leg + 1) return null;
  const out: ChronicleEntry[] = [];
  const seen = new Set<BiomeId>();
  for (let i = 0; i < raw.length; i += 1) {
    const e: unknown = raw[i];
    if (!isObject(e) || !isBiomeId(e.biome) || e.leg !== i) return null;
    if ((i === 0) !== (e.biome === HOME_BIOME) || seen.has(e.biome)) return null;
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
  // Si el tramo actual ya está cerrado, su entrada es la del bioma actual; si no, no aparece.
  const last = out[out.length - 1];
  if (out.length === forest.leg + 1 && last?.biome !== forest.biome) return null;
  if (out.length === forest.leg && seen.has(forest.biome)) return null;
  return out;
}

/** Rangos de bioma: dentro del tope y solo de biomas por los que el linaje ya pasó. */
function validateBiomeAdaptations(
  raw: unknown,
  visited: ReadonlySet<BiomeId>,
): Record<BiomeAdaptationId, number> | null {
  if (!isObject(raw)) return null;
  const ranks = {} as Record<BiomeAdaptationId, number>;
  for (const def of BIOME_ADAPTATIONS) {
    const rank = raw[def.id];
    if (!isCount(rank) || rank > def.max) return null;
    if (rank > 0 && !visited.has(def.biome)) return null;
    ranks[def.id] = rank;
  }
  return ranks;
}

// ---------------------------------------------------------------------------------------
// Formato y migraciones

export type ParseError = 'json' | 'shape' | 'version' | 'migration' | 'invalid';
export type ParseResult = { ok: true; save: SaveFile } | { ok: false; error: ParseError };

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

/** Parsea el JSON de un guardado, lo migra y lo valida. Nunca lanza. */
export function parseSave(
  text: string,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target = SAVE_VERSION,
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
  const state = validateState(migrated.state);
  if (!state) return { ok: false, error: 'invalid' };
  return { ok: true, save: { version: target, savedAt: migrated.savedAt, state } };
}

export function serializeSave(state: GameState, now: number): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now, state };
  return JSON.stringify(file);
}

// ---------------------------------------------------------------------------------------
// Almacenamiento

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; save: SaveFile }
  | { kind: 'corrupt'; error: ParseError; backedUp: boolean }
  | { kind: 'unavailable' };

/**
 * Lee el guardado. Si está dañado, lo copia a `micelio:save:backup` para no perderlo y
 * devuelve `corrupt`: quien llama empieza una partida nueva y avisa.
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
  const parsed = parseSave(text);
  if (parsed.ok) return { kind: 'loaded', save: parsed.save };
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
 * Resultado de guardar: `saved`; `failed` si el almacenamiento falla o está lleno; `invalid`
 * si el estado tiene un valor imposible (un número no finito, un id desconocido). En ese caso
 * no se escribe nada: es mejor conservar el último guardado bueno que pisarlo con uno que la
 * próxima carga mandaría a la copia de respaldo.
 */
export type SaveOutcome = 'saved' | 'failed' | 'invalid';

export function saveGame(storage: StorageLike | null, state: GameState, now: number): SaveOutcome {
  if (!storage) return 'failed';
  const text = serializeSave(state, now);
  if (!parseSave(text).ok) return 'invalid';
  try {
    storage.setItem(SAVE_KEY, text);
    return 'saved';
  } catch {
    return 'failed';
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

export type ImportError = 'empty' | 'tooLarge' | 'base64' | 'encoding' | ParseError;
export type ImportResult = { ok: true; save: SaveFile } | { ok: false; error: ImportError };

/** Decodifica y valida un texto exportado. No toca la partida actual. */
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
  const parsed = parseSave(json);
  return parsed.ok ? { ok: true, save: parsed.save } : { ok: false, error: parsed.error };
}

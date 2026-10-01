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
  type GameState,
  type Locale,
  type Notation,
  type RainDrop,
} from '../core/state.ts';

export const SAVE_KEY = 'micelio:save';
export const BACKUP_KEY = 'micelio:save:backup';
export const TAB_KEY = 'micelio:tab';

/** Versión actual del formato. Cada cambio la sube y añade `MIGRATIONS[n]` (n → n + 1). */
export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  /** Marca de tiempo (ms) del guardado: la usa el progreso offline. */
  savedAt: number;
  state: GameState;
}

type RawObject = Record<string, unknown>;
export type Migration = (raw: RawObject) => RawObject;

/**
 * Migraciones: `MIGRATIONS[n]` lleva un guardado de la versión n a la n + 1. Reciben el
 * objeto completo `{ version, savedAt, state }` y devuelven uno nuevo.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

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
// Validación

function isObject(value: unknown): value is RawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegative(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isCount(value: unknown): value is number {
  return isNonNegative(value) && Number.isInteger(value);
}

function uniqueList<T extends string>(value: unknown, isValid: (v: unknown) => v is T): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const item of value) {
    if (!isValid(item)) return null;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function oneOf<T>(value: unknown, options: readonly T[]): value is T {
  return options.includes(value as T);
}

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
  const statNumbers = [
    'runTime',
    'totalTime',
    'startedAt',
    'runStartedAt',
    'maxNps',
    'idleClickTime',
  ] as const;
  for (const key of statNumbers) if (!isNonNegative(s[key])) return null;
  const statCounts = ['clicks', 'drops', 'sporulations'] as const;
  for (const key of statCounts) if (!isCount(s[key])) return null;
  const stats = {
    runTime: s.runTime as number,
    totalTime: s.totalTime as number,
    startedAt: s.startedAt as number,
    runStartedAt: s.runStartedAt as number,
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
  };
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
  if (!isObject(raw) || !isNonNegative(raw.savedAt) || !('state' in raw))
    return { ok: false, error: 'shape' };
  if (!isCount(raw.version) || raw.version < 1 || raw.version > target)
    return { ok: false, error: 'version' };
  let migrated: RawObject | null;
  try {
    migrated = migrate(raw, migrations, target);
  } catch {
    return { ok: false, error: 'migration' };
  }
  if (!migrated || !isNonNegative(migrated.savedAt)) return { ok: false, error: 'migration' };
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

/** Escribe el guardado. Devuelve false si el almacenamiento falla o está lleno. */
export function saveGame(storage: StorageLike | null, state: GameState, now: number): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, serializeSave(state, now));
    return true;
  } catch {
    return false;
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

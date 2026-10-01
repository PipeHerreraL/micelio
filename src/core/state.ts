/**
 * El único estado del juego: un objeto plano, serializable con JSON, sin clases ni
 * funciones. Los valores derivados (N/s, valor del clic) no viven aquí: ver selectors.ts.
 */
import { GENERATOR_IDS, type GeneratorId } from '../data/generators.ts';
import type { MutationId } from '../data/mutations.ts';
import { RAIN_INTERVAL_MAX, RAIN_INTERVAL_MIN } from '../data/rain.ts';
import type { Num } from './num.ts';
import { toSeed } from './rng.ts';

export type { GeneratorId } from '../data/generators.ts';

export type BuyAmount = 1 | 10 | 100 | 'max';
export const BUY_AMOUNTS: readonly BuyAmount[] = [1, 10, 100, 'max'];

/**
 * names = «1,5 millones» (por defecto, estilo idle); suffix = «1,5 M»; scientific = «1,5e6»;
 * engineering = exponentes de 3 en 3.
 */
export type Notation = 'names' | 'suffix' | 'scientific' | 'engineering';
export const NOTATIONS: readonly Notation[] = ['names', 'suffix', 'scientific', 'engineering'];

export type Locale = 'es' | 'en';
export const LOCALES: readonly Locale[] = ['es', 'en'];

export type AutobuyThreshold = 0.1 | 0.5 | 1;
export const AUTOBUY_THRESHOLDS: readonly AutobuyThreshold[] = [0.1, 0.5, 1];

export type TimedEffectKind = 'downpour' | 'storm';

export interface ActiveEffect {
  kind: TimedEffectKind;
  /** Segundos que le quedan. */
  remaining: number;
  /** Duración total con la que empezó (para la barra de cuenta atrás). */
  duration: number;
}

export interface RainDrop {
  /** Posición relativa dentro de la zona de juego, en [0, 1]. */
  x: number;
  y: number;
  /** Segundos que le quedan antes de evaporarse. */
  remaining: number;
}

export interface Stats {
  /** Segundos jugados en la partida y en total (no cuenta el tiempo offline). */
  runTime: number;
  totalTime: number;
  /** Marcas de tiempo (ms desde la época) del inicio de la vida y de la partida. */
  startedAt: number;
  runStartedAt: number;
  maxNps: Num;
  clicks: number;
  drops: number;
  sporulations: number;
  /** Segundos con el juego abierto y en primer plano desde el último clic. */
  idleClickTime: number;
}

export interface Settings {
  /** null = detectar según el navegador. */
  locale: Locale | null;
  notation: Notation;
  sound: boolean;
  /** Volumen en [0, 1]. */
  volume: number;
  reducedMotion: boolean;
  buyAmount: BuyAmount;
}

export interface GameState {
  /** Nutrientes actuales, ganados en la partida y ganados en toda la vida. */
  nutrients: Num;
  runEarned: Num;
  lifetimeEarned: Num;
  owned: Record<GeneratorId, number>;
  /** Ids de mejoras compradas en la partida actual. */
  upgrades: string[];
  spores: {
    /** Nivel de esporas: +1 % de producción por nivel. Gastar esporas no lo baja. */
    level: number;
    /** Esporas disponibles para comprar mutaciones. */
    available: number;
  };
  mutations: MutationId[];
  achievements: string[];
  effects: ActiveEffect[];
  rain: {
    /** Segundos de juego en vivo hasta la próxima gota (solo avanza con ticks en vivo). */
    nextIn: number;
    drop: RainDrop | null;
  };
  autobuy: {
    generators: Record<GeneratorId, boolean>;
    threshold: AutobuyThreshold;
    upgrades: boolean;
  };
  stats: Stats;
  settings: Settings;
  /** Marcas de revelación progresiva y de avisos de primera vez ya mostrados. */
  seen: string[];
  /** Estado del generador pseudoaleatorio (ver rng.ts). */
  rngSeed: number;
  /** Partidas terminadas, la más reciente al final (tope en HISTORY_LIMIT). */
  history: RunRecord[];
}

/** Una partida terminada al esporular: lo que la Crónica y las estadísticas recuerdan. */
export interface RunRecord {
  /** Número de esporulación con que terminó (1 = la primera). */
  sporulation: number;
  /** Segundos jugados en la partida. */
  duration: number;
  /** Esporas ganadas al terminarla. */
  spores: number;
  /** Marca de tiempo (ms) del final. */
  endedAt: number;
}

export function emptyOwned(): Record<GeneratorId, number> {
  const owned = {} as Record<GeneratorId, number>;
  for (const id of GENERATOR_IDS) owned[id] = 0;
  return owned;
}

export function emptyAutobuy(): Record<GeneratorId, boolean> {
  const flags = {} as Record<GeneratorId, boolean>;
  for (const id of GENERATOR_IDS) flags[id] = false;
  return flags;
}

export function defaultSettings(): Settings {
  return {
    locale: null,
    notation: 'names',
    sound: true,
    // Volumen bajo por defecto (PROMPT.md §14).
    volume: 0.35,
    reducedMotion: false,
    buyAmount: 1,
  };
}

/** Partida nueva. `now` es una marca de tiempo en ms; `seed`, la semilla del azar. */
export function createState(seed: number, now: number): GameState {
  const rngSeed = toSeed(seed);
  return {
    nutrients: 0,
    runEarned: 0,
    lifetimeEarned: 0,
    owned: emptyOwned(),
    upgrades: [],
    spores: { level: 0, available: 0 },
    mutations: [],
    achievements: [],
    effects: [],
    // La primera gota cae a mitad del intervalo: a la vista, sin regalarla.
    rain: { nextIn: (RAIN_INTERVAL_MIN + RAIN_INTERVAL_MAX) / 2, drop: null },
    autobuy: { generators: emptyAutobuy(), threshold: 0.5, upgrades: false },
    stats: {
      runTime: 0,
      totalTime: 0,
      startedAt: now,
      runStartedAt: now,
      maxNps: 0,
      clicks: 0,
      drops: 0,
      sporulations: 0,
      idleClickTime: 0,
    },
    settings: defaultSettings(),
    seen: [],
    rngSeed,
    history: [],
  };
}

export function hasMutation(state: GameState, id: MutationId): boolean {
  return state.mutations.includes(id);
}

export function hasUpgrade(state: GameState, id: string): boolean {
  return state.upgrades.includes(id);
}

export function hasSeen(state: GameState, key: string): boolean {
  return state.seen.includes(key);
}

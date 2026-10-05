/**
 * El único estado del juego: un objeto plano, serializable con JSON, sin clases ni
 * funciones. Los valores derivados (N/s, valor del clic) no viven aquí: ver selectors.ts.
 */
import { ADAPTATION_IDS, type AdaptationId } from '../data/adaptations.ts';
import { BIOME_ADAPTATION_IDS, HOME_BIOME, type BiomeAdaptationId, type BiomeId } from '../data/biomes.ts';
import type { VowId } from '../data/cycle.ts';
import { GENERATOR_IDS, type GeneratorId } from '../data/generators.ts';
import { MUTATION_IDS, type MutationId } from '../data/mutations.ts';
import { RAIN_INTERVAL_MAX, RAIN_INTERVAL_MIN } from '../data/rain.ts';
import { emptyPartners } from '../partners/ids.ts';
import type { PartnersState } from '../partners/registry.ts';
import type { Num } from './num.ts';
import { toSeed } from './rng.ts';

export type { GeneratorId } from '../data/generators.ts';

/** 'milestone': las unidades que faltan para el siguiente hito del generador (25, 50, 100…). */
export type BuyAmount = 1 | 10 | 100 | 'milestone' | 'max';
export const BUY_AMOUNTS: readonly BuyAmount[] = [1, 10, 100, 'milestone', 'max'];

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

/**
 * threshold: compra lo que cueste menos del umbral (la de siempre). payback: lo que antes se
 * amortiza (Poda, un regalo del plasmodio, fase 9); sin la ventaja se comporta como threshold.
 */
export type AutobuyMode = 'threshold' | 'payback';
export const AUTOBUY_MODES: readonly AutobuyMode[] = ['threshold', 'payback'];

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
    mode: AutobuyMode;
  };
  stats: Stats;
  settings: Settings;
  /** Marcas de revelación progresiva y de avisos de primera vez ya mostrados. */
  seen: string[];
  /** Estado del generador pseudoaleatorio (ver rng.ts). */
  rngSeed: number;
  /** Partidas terminadas, la más reciente al final (tope en HISTORY_LIMIT). */
  history: RunRecord[];
  /** Rango de cada adaptación (docs/ROADMAP.md, fase 7). */
  adaptations: Record<AdaptationId, number>;
  /**
   * Nivel hasta el que el bono de esporas sigue siendo lineal aunque supere el umbral de
   * madurez. Lo fija la migración a las partidas que ya pasaban de ese umbral en la 1.x, para
   * que nadie pierda bono al actualizar (decisión del usuario); en partidas nuevas es 0.
   */
  sporeFloor: number;
  /** El bosque donde vive el linaje (docs/ROADMAP.md, fase 8). */
  forest: ForestState;
  /**
   * Una entrada por bosque cerrado (el Acto I en el natal, la colonización en los demás), en el
   * orden del viaje: la entrada i es la del tramo i. Tope: MAX_LEG + 1.
   */
  chronicle: ChronicleEntry[];
  /** Rango de cada adaptación de bioma: permanentes y válidas en todos los bosques. */
  biomeAdaptations: Record<BiomeAdaptationId, number>;
  /**
   * Socios (docs/ROADMAP.md, fase 9). null = aún no ha llegado. Cada uno tiene su moneda, su azar
   * y sus logros; nada de aquí entra en computeDerived ni avanza en tick() (ARCHITECTURE.md §4.29).
   */
  partners: PartnersState;
  /** El ciclo libre tras El regreso (fase 10): ciclos y votos del actual. */
  cycle: CycleState;
  /** El mejor ciclo cumplido de cada bioma y combinación de votos (fase 10). */
  records: CycleRecord[];
}

/** El bosque donde vive el linaje. Lo colonizado y lo visitado se deducen de la Crónica. */
export interface ForestState {
  biome: BiomeId;
  /** Tramo del viaje: 0 = natal, 1 = primer destino… Es también el número de dispersiones. */
  leg: number;
  /** Nutrientes ganados en este bosque, en todas sus partidas: la L de E = ⌊k √(L / R)⌋. */
  earned: Num;
  /** Fecha de llegada (ms); en el natal, el inicio de la vida. */
  arrivedAt: number;
  /** stats.sporulations y stats.totalTime al llegar: lo hecho aquí sale por diferencia. */
  arrivalSporulations: number;
  arrivalPlayTime: number;
}

/** Un bosque cerrado: lo que la Crónica recuerda de él. */
export interface ChronicleEntry {
  biome: BiomeId;
  leg: number;
  arrivedAt: number;
  /** Fecha de la esporulación que lo colonizó; null en el Acto I (el núcleo lo cierra sin reloj). */
  colonizedAt: number | null;
  /** Esporulaciones y segundos jugados en ese bosque hasta cerrarlo. */
  sporulations: number;
  playTime: number;
  /** Al irse con el viento: fecha y nivel de esporas alcanzado. null mientras siga aquí. */
  leftAt: number | null;
  levelReached: number | null;
}

/** El ciclo libre (fase 10): vacío en el viaje y en El regreso. */
export interface CycleState {
  /** Ciclos empezados (0 en el viaje y en El regreso). Es también el número del ciclo actual. */
  stays: number;
  /** Ciclos cumplidos (nivel 500 en un ciclo). */
  done: number;
  /** Votos vigentes del ciclo actual, en el orden de VOW_IDS. */
  vows: VowId[];
  /** Con «sin mutaciones»: las ya despertadas en este ciclo. */
  woken: MutationId[];
}

/** El mejor ciclo cumplido de un bioma con unos votos. */
export interface CycleRecord {
  biome: BiomeId;
  /** Votos mantenidos hasta cumplir, en el orden de VOW_IDS. */
  vows: VowId[];
  /** ms de reloj desde la llegada hasta la esporulación que llegó al nivel 500; ≥ 0. */
  time: number;
  /** Esporulaciones en ese ciclo. */
  runs: number;
  at: number;
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
  /** Bosque donde se jugó la partida. */
  biome: BiomeId;
}

export function emptyOwned(): Record<GeneratorId, number> {
  const owned = {} as Record<GeneratorId, number>;
  for (const id of GENERATOR_IDS) owned[id] = 0;
  return owned;
}

export function emptyAdaptations(): Record<AdaptationId, number> {
  const ranks = {} as Record<AdaptationId, number>;
  for (const id of ADAPTATION_IDS) ranks[id] = 0;
  return ranks;
}

export function emptyBiomeAdaptations(): Record<BiomeAdaptationId, number> {
  const ranks = {} as Record<BiomeAdaptationId, number>;
  for (const id of BIOME_ADAPTATION_IDS) ranks[id] = 0;
  return ranks;
}

export function emptyCycle(): CycleState {
  return { stays: 0, done: 0, vows: [], woken: [] };
}

/** El bosque natal de una vida que empieza en `now`. */
export function homeForest(now: number): ForestState {
  return { biome: HOME_BIOME, leg: 0, earned: 0, arrivedAt: now, arrivalSporulations: 0, arrivalPlayTime: 0 };
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
    autobuy: { generators: emptyAutobuy(), threshold: 0.5, upgrades: false, mode: 'threshold' },
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
    adaptations: emptyAdaptations(),
    sporeFloor: 0,
    forest: homeForest(now),
    chronicle: [],
    biomeAdaptations: emptyBiomeAdaptations(),
    partners: emptyPartners(),
    cycle: emptyCycle(),
    records: [],
  };
}

/** La mutación está comprada: cuenta para el árbol, el Acto I y lo que se puede comprar. */
export function ownsMutation(state: GameState, id: MutationId): boolean {
  return state.mutations.includes(id);
}

/**
 * El efecto de la mutación rige: es lo que leen la producción, la lluvia, el sin conexión, la
 * autocompra y los desbloqueos. Hoy coincide con tenerla comprada; el voto «sin mutaciones» de la
 * fase 10 dormirá mutaciones compradas, y por eso son dos preguntas y no una (confundirlas dejaría
 * recomprar una dormida o cerrar mal el Acto I).
 */
export function hasMutation(state: GameState, id: MutationId): boolean {
  return ownsMutation(state, id);
}

/** Árbol de mutaciones completo: abre las Adaptaciones y es la mitad del Acto I. */
export function isTreeComplete(state: GameState): boolean {
  return MUTATION_IDS.every((id) => ownsMutation(state, id));
}

export function hasUpgrade(state: GameState, id: string): boolean {
  return state.upgrades.includes(id);
}

export function hasSeen(state: GameState, key: string): boolean {
  return state.seen.includes(key);
}

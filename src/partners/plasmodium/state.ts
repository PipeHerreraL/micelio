/**
 * Estado del plasmodio y su núcleo (paquete inicial): crear, validar, cuándo llega, cuánto tiempo
 * aplica sin estar en vivo y qué ventajas da a la red. Más las consultas puras que usan el modelo,
 * la interfaz y el simulador: la regla vive una sola vez.
 *
 * Solo la red de la placa abierta se guarda (conductividad por arista y habituación por sitio);
 * el grafo sale de los datos fijos (src/data/plasmodium-plates.ts).
 */
import type { GameEvent } from '../../core/events.ts';
import { actOneEntry } from '../../core/forest.ts';
import * as num from '../../core/num.ts';
import type { Num } from '../../core/num.ts';
import { nextRandom, toSeed } from '../../core/rng.ts';
import type { GameState } from '../../core/state.ts';
import {
  AGAR_FACTOR,
  ARRIVAL_RUN_SECONDS,
  D0,
  D_FLOOR,
  DEFAULT_FLOW,
  DELTA_BASE,
  DELTA_MAX,
  DORMANCY_CAP_SECONDS,
  FLOW_FACTORS,
  FLOW_MAPPED,
  HUMIDITY_FACTOR,
  LINGER_SECONDS,
  MAX_PENDING_MS,
  MODEL_SECOND_MS,
  MOIST_SECONDS,
  OFFLINE_CAP_SECONDS,
  OFFLINE_EFFICIENCY,
  OPEN_JITTER,
  PLASMODIUM_SEED_SALT,
  PLASMODIUM_UPGRADES,
  PRUNING_MAPPED,
  PULSE_COOLDOWN,
  SHORT_PATH_MAPPED,
  STABLE_SECONDS,
  getPlasmodiumUpgrade,
  isPlasmodiumAchievementId,
  type PlasmodiumAchievementId,
  type PlasmodiumUpgradeId,
} from '../../data/plasmodium.ts';
import { PLATES, type PlateDef } from '../../data/plasmodium-plates.ts';
import { isCount, isNonNegative, isObject, uniqueList } from '../../systems/validate.ts';
import type { PartnerCore, PartnerStateBase } from '../types.ts';

export type SiteItem = 'food' | 'lamp';
/** Caudal Bajo, Medio (por defecto) y Alto: índice en FLOW_FACTORS. */
export type FlowLevel = 0 | 1 | 2;

export interface PlateMap {
  /** Copos unidos × calidad del mejor mapa: el Rastro en cultivo sale de aquí. */
  score: number;
  quality: number;
  cost: number;
  tolerance: number;
  alive: number;
  joined: number;
}

export interface PlateRecord {
  /** Última colocación del jugador en esta placa (sitios; sin los fijos ni los bloqueados). */
  foods: number[];
  lamps: number[];
  flow: FlowLevel;
  /** Mejor mapa; null mientras no esté cartografiada. */
  map: PlateMap | null;
}

export interface PlasmodiumState extends PartnerStateBase {
  /** Placa abierta: índice en PLATES. */
  plate: number;
  /** Una por placa. La colocación de la abierta es plates[plate]. */
  plates: PlateRecord[];
  /** D por arista de la placa abierta, en [D_FLOOR, 1]. */
  conductivity: number[];
  /** Habituación por sitio de la placa abierta, en [0, 1]. */
  habituation: number[];
  /** Rastro disponible, ganado en total y dejado hacia la meta de la frontera. */
  trail: Num;
  trailEarned: Num;
  mapping: Num;
  /** Barra de estabilidad del objetivo, en [0, STABLE_SECONDS]. */
  stableFor: number;
  /** Si el último segundo de modelo cumplió el objetivo (para avisar solo de los cambios). */
  goalMet: boolean;
  /** Segundos de modelo hasta poder dar otro pulso (0 = listo). */
  pulseIn: number;
  /** Segundos de agar húmedo que quedan (Lluvia en la placa). */
  moistFor: number;
  /** Segundos hasta que la placa siguiente se abra sola tras fructificar (0 = nada pendiente). */
  lingerFor: number;
  /** Si se dio algún pulso desde que se abrió la placa (logro secreto). */
  pulsedHere: boolean;
  upgrades: Record<PlasmodiumUpgradeId, number>;
  /** Logros propios: no suman al +1 % global. */
  achievements: PlasmodiumAchievementId[];
  /** Ms del reloj del socio por debajo del siguiente segundo de modelo. Entero, 0–999. */
  clockMs: number;
  /** Pasos del modelo en la placa abierta: elige la fuente por turno. */
  step: number;
  stats: { pulses: number; placements: number; modelSeconds: number };
  /** Azar propio: solo el temblor de D al abrir o extender la placa. */
  rngSeed: number;
}

// ---------------------------------------------------------------------------------------
// Consultas puras

export function plateDef(index: number): PlateDef {
  const def = PLATES[index];
  if (!def) throw new Error(`Placa desconocida: ${index}`);
  return def;
}

/** Placas cartografiadas (los mapas forman un prefijo). */
export function mappedCount(p: Readonly<PlasmodiumState>): number {
  let count = 0;
  while (count < p.plates.length && p.plates[count]?.map) count += 1;
  return count;
}

/** La 0, y cada placa cuya anterior esté cartografiada. */
export function isPlateAvailable(p: Readonly<PlasmodiumState>, plate: number): boolean {
  if (!Number.isInteger(plate) || plate < 0 || plate >= PLATES.length) return false;
  return plate <= mappedCount(p);
}

/** Primera placa sin mapa, o null con las cinco cartografiadas. */
export function frontier(p: Readonly<PlasmodiumState>): number | null {
  const count = mappedCount(p);
  return count < PLATES.length ? count : null;
}

export function foodLimit(p: Readonly<PlasmodiumState>, plate: number): number {
  const def = plateDef(plate);
  return def.foods + (def.extraFoods ? p.upgrades.oats : 0);
}

export function lampLimit(p: Readonly<PlasmodiumState>, plate: number): number {
  return plateDef(plate).lamps + p.upgrades.lamps;
}

/** Coste del siguiente nivel en Rastro, o null en el tope. */
export function upgradeCost(p: Readonly<PlasmodiumState>, id: PlasmodiumUpgradeId): Num | null {
  const def = getPlasmodiumUpgrade(id);
  const level = p.upgrades[id];
  if (level >= def.max) return null;
  return num.clamp(def.baseCost * 2 ** level);
}

export function isUpgradeAvailable(p: Readonly<PlasmodiumState>, id: PlasmodiumUpgradeId): boolean {
  return mappedCount(p) >= getPlasmodiumUpgrade(id).fromMapped;
}

export function agarFactor(p: Readonly<PlasmodiumState>): number {
  return AGAR_FACTOR ** p.upgrades.agar;
}

/** Δ por paso: Humedad × 1,5 por nivel, con tope. */
export function delta(p: Readonly<PlasmodiumState>): number {
  return Math.min(DELTA_MAX, DELTA_BASE * HUMIDITY_FACTOR ** p.upgrades.humidity);
}

/** Rastro/s de las placas cartografiadas que no son la abierta (en cultivo). */
export function cultureRate(p: Readonly<PlasmodiumState>): Num {
  let total = 0;
  const factor = agarFactor(p);
  for (let i = 0; i < p.plates.length; i += 1) {
    const map = p.plates[i]?.map;
    if (i !== p.plate && map) total += plateDef(i).trailRate * map.score * factor;
  }
  return num.clamp(total);
}

/** El caudal se abre con 2 placas cartografiadas. */
export function isFlowAvailable(p: Readonly<PlasmodiumState>): boolean {
  return mappedCount(p) >= FLOW_MAPPED;
}

/**
 * Caudal con el que corre una placa: el elegido solo en placas ya cartografiadas; la frontera
 * siempre con el Medio. Medido: el Alto no cumple el objetivo en el Tronco, el Laberinto, el Puente
 * ni la Fusión y el Bajo no lo cumple en el Puente; así nadie se encierra en una placa imposible.
 */
export function effectiveFlow(p: Readonly<PlasmodiumState>, plate: number): FlowLevel {
  const record = p.plates[plate];
  return record?.map && isFlowAvailable(p) ? record.flow : DEFAULT_FLOW;
}

export function flowFactor(p: Readonly<PlasmodiumState>, plate: number): number {
  return FLOW_FACTORS[effectiveFlow(p, plate)];
}

/** Habituación de partida de una placa: 1 en sus sitios habituados, 0 en el resto. */
export function startHabituation(plate: number): number[] {
  const def = plateDef(plate);
  const out = new Array<number>(def.x.length).fill(0);
  for (const i of def.habituated) out[i] = 1;
  return out;
}

/**
 * El plasmodio cubre la placa de nuevo: D = 1 − temblor en el orden de las aristas, con el azar
 * propio. El temblor rompe empates simétricos (con rutas empatadas sobreviven las dos).
 */
export function spreadConductivity(p: PlasmodiumState, plate: number): number[] {
  const edges = plateDef(plate).edges.length;
  const out = new Array<number>(edges);
  for (let e = 0; e < edges; e += 1) out[e] = D0 - OPEN_JITTER * nextRandom(p);
  return out;
}

export function emptyPlasmodiumUpgrades(): Record<PlasmodiumUpgradeId, number> {
  const out = {} as Record<PlasmodiumUpgradeId, number>;
  for (const def of PLASMODIUM_UPGRADES) out[def.id] = 0;
  return out;
}

/** Estado al llegar: el Tronco caído abierto y cubierto. */
export function createPlasmodium(seed: number): PlasmodiumState {
  const p: PlasmodiumState = {
    pendingMs: 0,
    plate: 0,
    plates: PLATES.map(() => ({ foods: [], lamps: [], flow: DEFAULT_FLOW, map: null })),
    conductivity: [],
    habituation: startHabituation(0),
    trail: 0,
    trailEarned: 0,
    mapping: 0,
    stableFor: 0,
    goalMet: false,
    pulseIn: 0,
    moistFor: 0,
    lingerFor: 0,
    pulsedHere: false,
    upgrades: emptyPlasmodiumUpgrades(),
    achievements: [],
    clockMs: 0,
    step: 0,
    stats: { pulses: 0, placements: 0, modelSeconds: 0 },
    rngSeed: toSeed(seed),
  };
  p.conductivity = spreadConductivity(p, 0);
  return p;
}

// ---------------------------------------------------------------------------------------
// Validación (entrada no confiable: localStorage e importar partida)

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return inRange(value, min, max) && Number.isInteger(value);
}

/** Sitios de una lista: enteros en rango, sin repetir. */
function siteList(raw: unknown, sites: number, max: number): number[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (!isIntIn(v, 0, sites - 1) || out.includes(v)) return null;
    out.push(v);
  }
  return out;
}

/** Tope de copos unidos en un mapa: copos fijos + base + Avena de la placa más grande. */
const MAX_JOINED = 12;
/** Tope de la puntuación de un mapa (copos unidos × calidad; la calidad no llega a 10). */
const MAX_MAP_SCORE = 100;

function validateMap(raw: unknown, def: PlateDef): PlateMap | null {
  if (!isObject(raw)) return null;
  const { score, quality, cost, tolerance, alive, joined } = raw;
  if (!inRange(score, 0, MAX_MAP_SCORE) || !isNonNegative(quality) || !isNonNegative(cost)) return null;
  if (!inRange(tolerance, 0, 1) || !isIntIn(alive, 0, def.edges.length) || !isIntIn(joined, 0, MAX_JOINED)) {
    return null;
  }
  return { score, quality, cost, tolerance, alive, joined };
}

function validateUpgrades(raw: unknown): Record<PlasmodiumUpgradeId, number> | null {
  if (!isObject(raw)) return null;
  const out = emptyPlasmodiumUpgrades();
  for (const def of PLASMODIUM_UPGRADES) {
    const level = raw[def.id];
    if (!isIntIn(level, 0, def.max)) return null;
    out[def.id] = level;
  }
  return out;
}

/**
 * Reconstruye el estado del plasmodio desde datos no confiables, campo a campo; null si algo no
 * vale. Las propiedades desconocidas se descartan. Los arreglos se miden antes de recorrerlos
 * (AGENTS.md: guardar estructuras en el borde).
 */
export function validatePlasmodium(raw: unknown): PlasmodiumState | null {
  if (!isObject(raw)) return null;

  const upgrades = validateUpgrades(raw.upgrades);
  if (!upgrades) return null;

  if (!Array.isArray(raw.plates) || raw.plates.length !== PLATES.length) return null;
  const plates: PlateRecord[] = [];
  for (let i = 0; i < PLATES.length; i += 1) {
    const def = plateDef(i);
    const r: unknown = raw.plates[i];
    if (!isObject(r)) return null;
    const sites = def.x.length;
    const foods = siteList(r.foods, sites, def.foods + (def.extraFoods ? upgrades.oats : 0));
    const lamps = siteList(r.lamps, sites, def.lamps + upgrades.lamps);
    if (!foods || !lamps) return null;
    for (const s of [...foods, ...lamps]) {
      if (def.fixedFoods.includes(s) || def.blocked.includes(s)) return null;
    }
    if (foods.some((s) => lamps.includes(s))) return null;
    if (!isIntIn(r.flow, 0, FLOW_FACTORS.length - 1)) return null;
    const map = r.map === null ? null : validateMap(r.map, def);
    if (r.map !== null && !map) return null;
    // Los mapas forman un prefijo: no se cartografía una placa sin la anterior.
    if (map && i > 0 && !plates[i - 1]?.map) return null;
    plates.push({ foods, lamps, flow: r.flow as FlowLevel, map });
  }

  if (!isIntIn(raw.plate, 0, PLATES.length - 1)) return null;
  const plate = raw.plate;
  let mapped = 0;
  while (mapped < plates.length && plates[mapped]?.map) mapped += 1;
  if (plate > mapped) return null;

  const trail = num.parse(raw.trail);
  const trailEarned = num.parse(raw.trailEarned);
  const mapping = num.parse(raw.mapping);
  if (trail === null || trailEarned === null || mapping === null) return null;
  if (num.gt(trail, trailEarned) || num.gt(mapping, trailEarned)) return null;

  if (!inRange(raw.stableFor, 0, STABLE_SECONDS) || typeof raw.goalMet !== 'boolean') return null;
  if (!isIntIn(raw.pulseIn, 0, PULSE_COOLDOWN)) return null;
  if (!inRange(raw.moistFor, 0, MOIST_SECONDS) || !inRange(raw.lingerFor, 0, LINGER_SECONDS)) return null;
  if (typeof raw.pulsedHere !== 'boolean') return null;
  const achievements = uniqueList(raw.achievements, isPlasmodiumAchievementId);
  if (!achievements) return null;
  if (!isIntIn(raw.clockMs, 0, MODEL_SECOND_MS - 1)) return null;
  if (!isIntIn(raw.pendingMs, 0, MAX_PENDING_MS)) return null;
  if (!isCount(raw.step)) return null;
  const s = raw.stats;
  if (!isObject(s) || !isCount(s.pulses) || !isCount(s.placements) || !isNonNegative(s.modelSeconds))
    return null;
  if (!isIntIn(raw.rngSeed, 0, 0xffffffff)) return null;

  const def = plateDef(plate);
  if (!Array.isArray(raw.conductivity) || raw.conductivity.length > def.edges.length) return null;
  if (!Array.isArray(raw.habituation) || raw.habituation.length > def.x.length) return null;
  const conductivity: number[] = [];
  for (const d of raw.conductivity) {
    if (!inRange(d, D_FLOOR, 1)) return null;
    conductivity.push(d);
  }
  const habituation: number[] = [];
  for (const h of raw.habituation) {
    if (!inRange(h, 0, 1)) return null;
    habituation.push(h);
  }

  const p: PlasmodiumState = {
    pendingMs: raw.pendingMs,
    plate,
    plates,
    conductivity,
    habituation,
    trail,
    trailEarned,
    mapping,
    stableFor: raw.stableFor,
    goalMet: raw.goalMet,
    pulseIn: raw.pulseIn,
    moistFor: raw.moistFor,
    lingerFor: raw.lingerFor,
    pulsedHere: raw.pulsedHere,
    upgrades,
    achievements,
    clockMs: raw.clockMs,
    step: raw.step,
    stats: { pulses: s.pulses, placements: s.placements, modelSeconds: s.modelSeconds },
    rngSeed: raw.rngSeed,
  };
  // Lo produce un guardado editado o un cambio de datos sin migración: se pierde solo la red de la
  // placa abierta (vuelve a cubrirla); el Rastro, las mejoras, los mapas y los logros se conservan.
  if (conductivity.length !== def.edges.length || habituation.length !== def.x.length) {
    p.conductivity = new Array<number>(def.edges.length).fill(D0);
    p.habituation = startHabituation(plate);
    p.stableFor = 0;
    p.goalMet = false;
    p.step = 0;
  }
  return p;
}

// ---------------------------------------------------------------------------------------
// Núcleo

export const plasmodiumCore: PartnerCore<PlasmodiumState> = {
  id: 'plasmodium',
  seedSalt: PLASMODIUM_SEED_SALT,

  /**
   * Llega en una partida posterior a la del Acto I (o ya en un bioma), a los 5 min de esa partida:
   * la primera calma tras la autocompra, sin juntar tres láminas seguidas (Acto I, bioma, socio).
   */
  canUnlock(state) {
    const act = actOneEntry(state);
    if (!act) return false;
    const afterActOne = state.forest.leg >= 1 || state.stats.sporulations > act.sporulations;
    return afterActOne && state.stats.runTime >= ARRIVAL_RUN_SECONDS;
  },

  create: createPlasmodium,

  validate: validatePlasmodium,

  elapsedRule(p, mode) {
    const dormant = p.upgrades.dormancy > 0;
    return {
      capSeconds: dormant ? DORMANCY_CAP_SECONDS : OFFLINE_CAP_SECONDS,
      efficiency: mode === 'offline' && !dormant ? OFFLINE_EFFICIENCY : 1,
    };
  },

  perks(p) {
    const mapped = mappedCount(p);
    return { autobuyByPayback: mapped >= PRUNING_MAPPED, sporeRate: mapped >= SHORT_PATH_MAPPED };
  },

  /** Lluvia en la placa: cada gota del bosque (atrapada o caída sola) humedece el agar. */
  onFungalEvent(p, event: GameEvent) {
    if (event.type === 'rainCaught' || event.type === 'rainFell') p.moistFor = MOIST_SECONDS;
  },
};

/** Lectura cómoda del plasmodio de una partida (null si aún no llegó). */
export function plasmodiumOf(state: Readonly<GameState>): PlasmodiumState | null {
  return state.partners.plasmodium;
}

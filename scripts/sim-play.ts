/**
 * Lo que juega el simulador de la red (scripts/simulate.ts): el bot, las partidas, las campañas y
 * el viaje de Viento de esporas, con las mismas fórmulas del juego (importa src/core, src/data y
 * src/systems; nada de copias). No escribe nada: scripts/simulate.ts reparte las tareas entre
 * hilos (scripts/sim-pool.ts) y escribe el informe.
 *
 * Cada tarea es una función pura de su entrada, y su entrada y su salida son JSON plano (el
 * estado del juego también): así los resultados no dependen de cuántos hilos haya ni de cuál
 * juegue cada tarea.
 */
import {
  adaptationsUnlocked,
  buyAdaptation,
  buyBiomeAdaptation,
  buyGenerator,
  buyMutation,
  buyUpgrade,
  click,
  canSporulate,
  completesGoal,
  disperse,
  disperseBlock,
  nextAdaptationCost,
  sporeGain,
  sporulate,
} from '../src/core/actions.ts';
import { bestPurchase } from '../src/core/economy.ts';
import { drain } from '../src/core/events.ts';
import * as num from '../src/core/num.ts';
import {
  biomeAdaptationGate,
  destinations,
  isActOneClosed,
  isForestColonized,
  nextBiomeAdaptationCost,
  sporulateRequirement,
  windTargets,
} from '../src/core/forest.ts';
import { createState, ownsMutation, type GameState } from '../src/core/state.ts';
import { tick } from '../src/core/tick.ts';
import { GENERATORS, type GeneratorId } from '../src/data/generators.ts';
import {
  BIOME_ADAPTATIONS,
  DESTINATION_IDS,
  DISPERSE_COST,
  HOME_BIOME,
  RETURN_LEG,
  type BiomeAdaptationId,
  type DestinationId,
} from '../src/data/biomes.ts';
import { MUTATIONS } from '../src/data/mutations.ts';
import { applyOffline } from '../src/systems/offline.ts';
import { catchDrop } from '../src/systems/rain.ts';
import { parseSave, serializeSave } from '../src/systems/save.ts';

// ---------------------------------------------------------------------------------------
// Perfiles y bot

export type ProfileName = 'active' | 'passive';

interface Profile {
  name: ProfileName;
  /** Clics por segundo en el segundo `t` de la partida. */
  clicksPerSecond(t: number): number;
  catchesDrops: boolean;
}

const PROFILES: Record<ProfileName, Profile> = {
  // 5 clics/s los primeros 15 min y luego 2 clics/s; atrapa todas las gotas.
  active: { name: 'active', clicksPerSecond: (t) => (t < 15 * 60 ? 5 : 2), catchesDrops: true },
  // 5 clics/s el primer minuto y después ninguno; no atrapa gotas.
  passive: { name: 'passive', clicksPerSecond: (t) => (t < 60 ? 5 : 0), catchesDrops: false },
};

/**
 * Compra mientras la mejor opción sea pagable ahora mismo. La elección (espera + amortización)
 * es `bestPurchase` de src/core/economy.ts, la misma que usa la Poda en la autocompra.
 */
function shop(state: GameState, cps: number): void {
  for (let guard = 0; guard < 500; guard += 1) {
    const best = bestPurchase(state, cps);
    if (!best || num.lt(state.nutrients, best.cost)) return;
    if (best.kind === 'generator') buyGenerator(state, { id: best.id, amount: 1 });
    else buyUpgrade(state, { id: best.id });
  }
}

/**
 * Con el árbol completo, gasta en adaptaciones: primero Cuerpo apical (el umbral de madurez),
 * luego la más barata de las demás que alcance. Fuego de zorro es cosmético y no se compra.
 * `reserve` son esporas que no se tocan (las del próximo viaje); las campañas del natal pasan
 * 0 y salen idénticas a las de la fase 7.
 */
function buyAdaptations(state: GameState, reserve = 0): void {
  if (!adaptationsUnlocked(state)) return;
  for (let guard = 0; guard < 200; guard += 1) {
    const funds = state.spores.available - reserve;
    const apical = nextAdaptationCost(state, 'apicalBody');
    if (apical !== null && funds >= apical) {
      buyAdaptation(state, { id: 'apicalBody' });
      continue;
    }
    const options = (['sclerotium', 'hydraulicLift', 'deepTorpor'] as const)
      .map((id) => ({ id, cost: nextAdaptationCost(state, id) }))
      .filter(
        (o): o is { id: 'sclerotium' | 'hydraulicLift' | 'deepTorpor'; cost: number } => o.cost !== null,
      )
      .sort((a, b) => a.cost - b.cost);
    const cheapest = options[0];
    if (!cheapest || funds < cheapest.cost) return;
    buyAdaptation(state, { id: cheapest.id });
  }
}

/**
 * Compra la adaptación de bioma más barata que esté abierta mientras alcance sin tocar la reserva.
 * Recorre las definidas: un id del guardado sin definición todavía no se puede comprar.
 */
function buyBiomeAdaptations(state: GameState, reserve: number): void {
  for (let guard = 0; guard < 50; guard += 1) {
    let best: { id: BiomeAdaptationId; cost: number } | null = null;
    for (const { id } of BIOME_ADAPTATIONS) {
      if (biomeAdaptationGate(state, id) !== null) continue;
      const cost = nextBiomeAdaptationCost(state, id);
      if (cost !== null && (best === null || cost < best.cost)) best = { id, cost };
    }
    if (!best || state.spores.available - reserve < best.cost) return;
    buyBiomeAdaptation(state, { id: best.id });
  }
}

/** Compra mutaciones en el orden de la tabla en cuanto alcanzan las esporas. */
function buyMutationsInOrder(state: GameState): void {
  for (const m of MUTATIONS) {
    if (ownsMutation(state, m.id)) continue;
    if (state.spores.available < m.cost) return;
    buyMutation(state, { id: m.id });
    if (!ownsMutation(state, m.id)) return;
  }
}

// ---------------------------------------------------------------------------------------
// Partidas

export interface RunRecord {
  /** Segundos de la partida en que se compró por primera vez cada generador. */
  firstOwned: Partial<Record<GeneratorId, number>>;
  /** Segundo en que la partida llegó a 1e8 N ganados (Esporular disponible). */
  sporulateAvailableAt: number | null;
  /** Segundos que duró la partida hasta esporular (o hasta el tope). */
  duration: number;
  sporesGained: number;
  mutationsAtStart: number;
  sporeLevelAtStart: number;
  maxValue: number;
}

export interface CampaignResult {
  runs: RunRecord[];
  /** Esporas disponibles sin gastar al terminar la campaña. */
  unspent: number;
  /** Esporas ganadas en toda la campaña. */
  earnedSpores: number;
  /** Tiempo acumulado (s) hasta el primer Gigante de Malheur. */
  firstMalheurAt: number | null;
  maxValue: number;
}

/**
 * Cuándo esporula la campaña:
 * - doubling: cuando la ganancia es al menos max(10, nivel actual) (PROMPT.md §17). Duplica el
 *   nivel en cada partida, así que es la regla más agresiva.
 * - rate: cuando las esporas por minuto de la partida dejan de subir, que es lo que haría un
 *   jugador que optimiza (docs/ROADMAP.md, fase 6).
 */
export type SporulatePolicy = 'doubling' | 'rate';

interface RunOptions {
  profile: Profile;
  /** Cuándo termina la partida: al poder esporular (partida suelta) o según la campaña. */
  stopWhen: 'available' | 'campaign';
  policy?: SporulatePolicy;
  maxSeconds: number;
  elapsedBefore: number;
  onMalheur?: (cumulative: number) => void;
  /** Se llama en cada segundo con el Acto I cerrado (quien llama se queda con el primero). */
  onActOne?: (cumulative: number) => void;
  /**
   * Se llama en cada segundo con el plasmodio (fase 9) en el estado; quien llama se queda con el
   * primero. El simulador de la red no avanza al socio: solo anota cuándo lo trae el núcleo.
   */
  onPartner?: (cumulative: number) => void;
}

const START_TIME = Date.UTC(2026, 0, 1);

function playRun(state: GameState, options: RunOptions): RunRecord {
  const record: RunRecord = {
    firstOwned: {},
    sporulateAvailableAt: null,
    duration: 0,
    sporesGained: 0,
    mutationsAtStart: state.mutations.length,
    sporeLevelAtStart: state.spores.level,
    maxValue: 0,
  };
  for (const def of GENERATORS) if (state.owned[def.id] > 0) record.firstOwned[def.id] = 0;
  // Política «rate»: el mejor ritmo de esporas por segundo visto en esta partida.
  let bestRate = 0;
  let bestAt = 0;

  for (let t = 0; t < options.maxSeconds; t += 1) {
    const cps = options.profile.clicksPerSecond(t);
    for (let c = 0; c < cps; c += 1) click(state, {});
    shop(state, cps);

    tick(state, { dt: 1 });
    if (options.profile.catchesDrops && state.rain.drop) catchDrop(state, {});
    drain();

    for (const def of GENERATORS) {
      if (record.firstOwned[def.id] === undefined && state.owned[def.id] > 0) {
        record.firstOwned[def.id] = t + 1;
        if (def.id === 'malheur') options.onMalheur?.(options.elapsedBefore + t + 1);
      }
    }
    record.maxValue = Math.max(record.maxValue, num.toNumber(state.lifetimeEarned));
    if (options.onActOne && isActOneClosed(state)) options.onActOne(options.elapsedBefore + t + 1);
    if (options.onPartner && state.partners.plasmodium) options.onPartner(options.elapsedBefore + t + 1);

    if (record.sporulateAvailableAt === null && num.gte(state.runEarned, sporulateRequirement(state))) {
      record.sporulateAvailableAt = t + 1;
      if (options.stopWhen === 'available') {
        record.duration = t + 1;
        record.sporesGained = sporeGain(state);
        return record;
      }
    }
    if (options.stopWhen === 'campaign' && canSporulate(state)) {
      const gain = sporeGain(state);
      let go: boolean;
      if (options.policy === 'rate') {
        // Esporula cuando el ritmo lleva 30 s por debajo de su máximo: ya pasó el pico.
        const rate = gain / (t + 1);
        if (rate > bestRate) {
          bestRate = rate;
          bestAt = t + 1;
        }
        go = gain >= 1 && rate < bestRate * 0.995 && t + 1 - bestAt >= 30;
      } else {
        // La campaña esporula cuando la ganancia es al menos max(10, nivel actual) (§17) y, en El
        // regreso, también cuando la esporulación cumple la meta (fase 10): es lo que haría una
        // persona que lee «esta esporulación cierra El regreso». Sin esa regla el nivel pasaba de
        // 256 a 512 en la última partida, que duraba 1:30 h. En los tramos 0–4 nunca cumple nada,
        // así que sus métricas no cambian.
        go = gain >= Math.max(10, state.spores.level) || completesGoal(state);
      }
      if (go) {
        record.duration = t + 1;
        record.sporesGained = gain;
        sporulate(state, { now: START_TIME + (options.elapsedBefore + t + 1) * 1000 });
        drain();
        return record;
      }
    }
  }
  record.duration = options.maxSeconds;
  return record;
}

function newGame(seed: number): GameState {
  const state = createState(seed, START_TIME);
  drain();
  return state;
}

/** Partida 1 suelta con un perfil, hasta poder esporular. */
function firstRun(seed: number, profile: Profile): RunRecord {
  return playRun(newGame(seed), { profile, stopWhen: 'available', maxSeconds: 6 * 3600, elapsedBefore: 0 });
}

/** Campaña: esporula según la regla y compra mutaciones en orden, hasta `sporulations`. */
function campaign(seed: number, sporulations: number, policy: SporulatePolicy): CampaignResult {
  const state = newGame(seed);
  const runs: RunRecord[] = [];
  let elapsed = 0;
  let firstMalheurAt: number | null = null;
  let maxValue = 0;
  for (let i = 0; i < sporulations; i += 1) {
    const run = playRun(state, {
      profile: PROFILES.active,
      stopWhen: 'campaign',
      policy,
      maxSeconds: 12 * 3600,
      elapsedBefore: elapsed,
      onMalheur: (at) => {
        firstMalheurAt ??= at;
      },
    });
    runs.push(run);
    elapsed += run.duration;
    maxValue = Math.max(maxValue, run.maxValue);
    if (run.sporesGained === 0) break;
    buyMutationsInOrder(state);
    buyAdaptations(state);
  }
  return {
    runs,
    firstMalheurAt,
    maxValue,
    unspent: state.spores.available,
    earnedSpores: runs.reduce((sum, r) => sum + r.sporesGained, 0),
  };
}

// ---------------------------------------------------------------------------------------
// Viento de esporas (docs/ROADMAP.md, fase 8)

/** Natal jugado hasta el Acto I, compartido por todos los órdenes del viaje. */
export interface NatalJourney {
  state: GameState;
  elapsed: number;
  /** Tiempo acumulado del primer segundo con el Acto I cerrado. */
  actOneAt: number | null;
  /** Partidas jugadas tras el Acto I solo para juntar las 300 esporas del viaje. */
  waitRuns: number;
  maxValue: number;
  earnedSpores: number;
  invalidSaves: number;
  /** Primer segundo con el plasmodio en el natal (null si aún no había llegado). */
  partnerAt: number | null;
}

export interface BiomeLeg {
  biome: DestinationId;
  /** Duración de cada partida desde la llegada hasta la que coloniza, incluida. */
  runs: number[];
  /** Tiempo de juego entre dispersar y el final de la partida que coloniza (null si no llegó). */
  colonizeTime: number | null;
  /** Lo mismo con el perfil pasivo, desde la misma llegada. */
  passiveTime: number | null;
  levelAtColonize: number;
  /** Tiempo acumulado al colonizar. */
  cumulative: number;
}

/**
 * Un viaje en curso y lo que lleva medido. Un orden del viaje se puede jugar en trozos (un prefijo
 * y luego cada rama, sobre copias): como el viaje lo lleva todo consigo, jugarlo en trozos da lo
 * mismo que de un tirón.
 */
export interface Journey {
  state: GameState;
  policy: SporulatePolicy;
  /** Juega cada tramo también con el perfil pasivo, desde la misma llegada. */
  withPassive: boolean;
  elapsed: number;
  maxValue: number;
  /** Esporas ganadas en toda la campaña hasta ahora. */
  earnedSpores: number;
  invalidSaves: number;
  legs: BiomeLeg[];
  /** Partidas jugadas tras colonizar un bioma solo para juntar las 300 esporas del viaje. */
  waits: number[];
  /** El regreso (fase 10), si el viaje llegó a jugarlo. */
  homecoming: ReturnLeg | null;
  /** Esporas sin gastar al colonizar el último bioma colonizado. */
  unspent: number;
  /** Esporas ganadas en toda la campaña al colonizar el último bioma colonizado. */
  earnedAtColonize: number;
  /** Primer segundo con el plasmodio, en el natal o en el viaje (informativo; null si no llegó). */
  partnerAt: number | null;
  /** Falso desde que un tramo no se pudo empezar o no se colonizó: el viaje se detiene ahí. */
  going: boolean;
}

/** El regreso (fase 10): de vuelta al natal tras el cuarto bioma, hasta el nivel 500. */
export interface ReturnLeg {
  /** Duración de cada partida desde la llegada hasta la que cumple El regreso, incluida. */
  runs: number[];
  /** Tiempo de juego entre partir y el final de la partida que lo cumple (null si no llegó). */
  closeTime: number | null;
  levelAtClose: number;
  /** Tiempo acumulado al cumplirlo. */
  cumulative: number;
}

/**
 * Tope de partidas por bioma con la regla de §17: si se alcanza, el bioma cuenta como no
 * colonizado. La regla del mejor ritmo hace partidas de pocos minutos y lleva su propio tope.
 */
const BIOME_RUN_CAP = 30;
const RATE_RUN_CAP = 200;

/** El guardado sigue siendo válido tras cada paso del viaje (ARCHITECTURE.md §4.26). */
function saveIsValid(state: GameState, now: number): boolean {
  return parseSave(serializeSave(state, now)).ok;
}

/**
 * Reserva para el próximo viaje: con el bosque cerrado y algo por delante (otro destino o, tras el
 * cuarto, El regreso). En el tramo 5, igual: nada mientras no se cumple la meta, como en el
 * prototipo que midió El regreso y el ciclo. Con la reserva durante todo El regreso el bot compraba
 * menos adaptaciones y lo cumplía en 2,96–3,20 h en vez de 2,94–3,12 h (simulador, con R 6,3e13).
 */
function journeyReserve(state: GameState): number {
  return isForestColonized(state) && windTargets(state).length > 0 ? DISPERSE_COST : 0;
}

/** Compras entre partidas del viaje: mutaciones, adaptaciones de bioma y de la red. */
function shopBetweenRuns(state: GameState): void {
  buyMutationsInOrder(state);
  const reserve = journeyReserve(state);
  buyBiomeAdaptations(state, reserve);
  buyAdaptations(state, reserve);
}

function natalToActOne(seed: number, policy: SporulatePolicy): NatalJourney {
  const state = newGame(seed);
  let elapsed = 0;
  let actOneAt: number | null = null;
  let maxValue = 0;
  let earnedSpores = 0;
  let invalidSaves = 0;
  let partnerAt: number | null = null;
  const play = (): RunRecord => {
    const run = playRun(state, {
      profile: PROFILES.active,
      stopWhen: 'campaign',
      policy,
      maxSeconds: 12 * 3600,
      elapsedBefore: elapsed,
      onActOne: (at) => {
        actOneAt ??= at;
      },
      onPartner: (at) => {
        partnerAt ??= at;
      },
    });
    elapsed += run.duration;
    earnedSpores += run.sporesGained;
    maxValue = Math.max(maxValue, run.maxValue);
    if (!saveIsValid(state, START_TIME + elapsed * 1000)) invalidSaves += 1;
    return run;
  };
  // Como la campaña de siempre hasta la partida en que se cierra el Acto I.
  for (let i = 0; i < 60 && !isActOneClosed(state); i += 1) {
    const run = play();
    if (run.sporesGained === 0) break;
    buyMutationsInOrder(state);
    // Tras la partida que cierra el Acto I, solo mutaciones: las esporas que sobran viajan y se
    // gastan al llegar en las adaptaciones del bioma (comprar Cuerpo apical aquí, que no sirve
    // en un bioma nuevo, dejaba al bot llegando sin esporas y falseaba el balance del viaje).
    if (!isActOneClosed(state)) buyAdaptations(state);
  }
  let waitRuns = 0;
  while (disperseBlock(state) === 'spores' && waitRuns < 10) {
    play();
    waitRuns += 1;
    buyMutationsInOrder(state);
    buyAdaptations(state, DISPERSE_COST);
  }
  return { state, elapsed, actOneAt, waitRuns, maxValue, earnedSpores, invalidSaves, partnerAt };
}

/**
 * Juega en el bioma actual hasta cerrarlo (o hasta el tope): colonizarlo o, en el natal del tramo 5,
 * cumplir El regreso. Devuelve las duraciones.
 */
function playBiome(
  state: GameState,
  profile: Profile,
  policy: SporulatePolicy,
  start: number,
  onRun?: (run: RunRecord, elapsed: number) => void,
  onPartner?: (cumulative: number) => void,
): { runs: number[]; elapsed: number; colonized: boolean } {
  const runs: number[] = [];
  let elapsed = start;
  const cap = policy === 'rate' ? RATE_RUN_CAP : BIOME_RUN_CAP;
  for (let i = 0; i < cap && !isForestColonized(state); i += 1) {
    const run = playRun(state, {
      profile,
      stopWhen: 'campaign',
      policy,
      maxSeconds: 12 * 3600,
      elapsedBefore: elapsed,
      onPartner,
    });
    runs.push(run.duration);
    elapsed += run.duration;
    onRun?.(run, elapsed);
    if (run.sporesGained === 0) break;
    shopBetweenRuns(state);
  }
  return { runs, elapsed, colonized: isForestColonized(state) };
}

/**
 * Anillos de destinos (fase 10): el primero es lo que el juego ofrece al empezar y el segundo, el
 * resto, que el juego abre al colonizar entero el primero. Salen de `destinations`, la regla del
 * juego, y no de una copia: si el juego no deja ir a un destino, `disperse` no hace nada y el
 * tramo sale vacío (sin cumplir). Hoy, la taiga y el Chocó; y la pradera y la tundra.
 */
function journeyRings(): DestinationId[][] {
  const first = destinations(createState(0, START_TIME));
  const rest = DESTINATION_IDS.filter((id) => !first.includes(id));
  return rest.length > 0 ? [first, rest] : [first];
}

/** Las permutaciones de `items`; la primera es la lista tal cual. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

/**
 * Órdenes del viaje: cada anillo en cualquier orden y entero antes del siguiente. Los órdenes del
 * primero (los prefijos) se juegan una vez por semilla y se ramifican, sobre copias, en los del
 * segundo (las ramas): da lo mismo que jugar cada orden de un tirón (`Journey`) y cada prefijo se
 * juega una vez y no una por rama. Sin segundo anillo, la única rama es la vacía.
 */
export function journeyPlan(): { prefixes: DestinationId[][]; branches: DestinationId[][] } {
  const [first = [], second = []] = journeyRings();
  return { prefixes: permutations(first), branches: permutations(second) };
}

/** Un viaje que empieza en el natal ya jugado, sobre una copia: el natal sirve a todos los órdenes. */
export function startJourney(natal: NatalJourney, policy: SporulatePolicy, withPassive: boolean): Journey {
  return {
    state: structuredClone(natal.state),
    policy,
    withPassive,
    elapsed: natal.elapsed,
    maxValue: natal.maxValue,
    earnedSpores: natal.earnedSpores,
    invalidSaves: natal.invalidSaves,
    legs: [],
    waits: [],
    homecoming: null,
    unspent: 0,
    earnedAtColonize: 0,
    partnerAt: natal.partnerAt,
    going: true,
  };
}

/** Partida del perfil activo en el viaje, con lo que cuentan el techo, las esporas y los guardados. */
function playJourneyRun(journey: Journey): RunRecord {
  const run = playRun(journey.state, {
    profile: PROFILES.active,
    stopWhen: 'campaign',
    policy: journey.policy,
    maxSeconds: 12 * 3600,
    elapsedBefore: journey.elapsed,
    onPartner: (at) => {
      journey.partnerAt ??= at;
    },
  });
  journey.elapsed += run.duration;
  trackRun(journey, run, journey.elapsed);
  return run;
}

function trackRun(journey: Journey, run: RunRecord, at: number): void {
  journey.maxValue = Math.max(journey.maxValue, run.maxValue);
  journey.earnedSpores += run.sporesGained;
  if (!saveIsValid(journey.state, START_TIME + at * 1000)) journey.invalidSaves += 1;
}

/**
 * Un tramo: dispersa a `to`, juega hasta colonizarlo (y, aparte, el perfil pasivo desde la misma
 * llegada) y, si queda destino por delante y no alcanza para el viaje, partidas de espera.
 */
export function travel(journey: Journey, to: DestinationId): void {
  if (!journey.going) return;
  const state = journey.state;
  // El bot dispersa al empezar partida: no hay esporas de la partida que dar.
  disperse(state, { to, now: START_TIME + journey.elapsed * 1000 });
  drain();
  if (state.forest.biome !== to) {
    journey.going = false;
    return;
  }
  if (!saveIsValid(state, START_TIME + journey.elapsed * 1000)) journey.invalidSaves += 1;
  buyBiomeAdaptations(state, 0);
  const arrival = journey.elapsed;
  let passiveTime: number | null = null;
  if (journey.withPassive) {
    // El pasivo compra igual que el activo entre partidas; solo cambia cómo juega.
    const passive = structuredClone(state);
    const p = playBiome(passive, PROFILES.passive, journey.policy, arrival);
    passiveTime = p.colonized ? p.elapsed - arrival : null;
  }
  const a = playBiome(
    state,
    PROFILES.active,
    journey.policy,
    arrival,
    (run, at) => {
      trackRun(journey, run, at);
    },
    (at) => {
      journey.partnerAt ??= at;
    },
  );
  journey.elapsed = a.elapsed;
  journey.legs.push({
    biome: to,
    runs: a.runs,
    colonizeTime: a.colonized ? journey.elapsed - arrival : null,
    passiveTime,
    levelAtColonize: state.spores.level,
    cumulative: journey.elapsed,
  });
  if (!a.colonized) {
    journey.going = false;
    return;
  }
  journey.unspent = state.spores.available;
  journey.earnedAtColonize = journey.earnedSpores;
  // Si no alcanza para el viaje (a otro destino o, tras el cuarto, a casa), partidas de espera:
  // las cuenta la métrica de espera.
  let wait = 0;
  for (; windTargets(state).length > 0 && disperseBlock(state) === 'spores' && wait < 10; wait += 1) {
    playJourneyRun(journey);
    shopBetweenRuns(state);
  }
  if (windTargets(state).length > 0) journey.waits.push(wait);
}

/**
 * Tras el cuarto bioma, si el viaje llegó entero: El regreso (fase 10). Vuelve al natal al empezar
 * partida y juega hasta cumplirlo, con la regla de la meta. Sin perfil pasivo: no tiene objetivo.
 */
export function finishJourney(journey: Journey): void {
  const state = journey.state;
  if (!journey.going || !windTargets(state).some((target) => target.kind === 'return')) return;
  disperse(state, { to: HOME_BIOME, now: START_TIME + journey.elapsed * 1000 });
  drain();
  if (state.forest.leg !== RETURN_LEG) {
    journey.going = false;
    return;
  }
  if (!saveIsValid(state, START_TIME + journey.elapsed * 1000)) journey.invalidSaves += 1;
  buyBiomeAdaptations(state, journeyReserve(state));
  const departure = journey.elapsed;
  const a = playBiome(
    state,
    PROFILES.active,
    journey.policy,
    departure,
    (run, at) => {
      trackRun(journey, run, at);
    },
    (at) => {
      journey.partnerAt ??= at;
    },
  );
  journey.elapsed = a.elapsed;
  journey.homecoming = {
    runs: a.runs,
    closeTime: a.colonized ? journey.elapsed - departure : null,
    levelAtClose: state.spores.level,
    cumulative: journey.elapsed,
  };
  if (!a.colonized) journey.going = false;
}

/**
 * Perfil ausente (fase 10): quien juega sesiones cortas y se va horas. Cuenta las sesiones hasta
 * colonizar `to`, incluida la que coloniza, o null si no llega en `ABSENT_SESSION_CAP`.
 */
export interface AbsentResult {
  sessions: number | null;
}

/** Tope de sesiones del perfil ausente: con sesiones de 20 min, 60 son más de 14 h de juego. */
const ABSENT_SESSION_CAP = 60;

/**
 * Dispersa a `to` y juega sesiones de `sessionMinutes` del perfil activo; entre una y otra,
 * `awayHours` fuera del juego, cobradas como al cargar (`applyOffline`: tope, eficiencia y el
 * deshielo de la tundra). Una partida que la sesión corta sigue en la siguiente, como al volver.
 */
function absentLeg(
  journey: Journey,
  to: DestinationId,
  sessionMinutes: number,
  awayHours: number,
): AbsentResult {
  const state = journey.state;
  let clockMs = START_TIME + journey.elapsed * 1000;
  disperse(state, { to, now: clockMs });
  drain();
  if (state.forest.biome !== to) return { sessions: null };
  buyBiomeAdaptations(state, 0);
  for (let session = 1; session <= ABSENT_SESSION_CAP; session += 1) {
    let left = sessionMinutes * 60;
    while (left > 0 && !isForestColonized(state)) {
      const run = playRun(state, {
        profile: PROFILES.active,
        stopWhen: 'campaign',
        policy: 'doubling',
        maxSeconds: left,
        elapsedBefore: (clockMs - START_TIME) / 1000,
      });
      left -= run.duration;
      clockMs += run.duration * 1000;
      if (run.sporesGained > 0) shopBetweenRuns(state);
    }
    if (isForestColonized(state)) return { sessions: session };
    const savedAt = clockMs;
    clockMs += awayHours * 3_600_000;
    applyOffline(state, savedAt, clockMs);
    drain();
  }
  return { sessions: null };
}

// ---------------------------------------------------------------------------------------
// Tareas (lo que se reparte entre hilos)

export type SimTask =
  | { kind: 'firstRun'; seed: number; profile: ProfileName }
  | { kind: 'campaign'; seed: number; sporulations: number; policy: SporulatePolicy }
  | { kind: 'natal'; seed: number; policy: SporulatePolicy }
  /** Sigue un viaje por `path` y, con `finish`, juega El regreso si el cuarto bioma quedó colonizado. */
  | { kind: 'journey'; journey: Journey; path: readonly DestinationId[]; finish: boolean }
  /** Desde un viaje, el perfil ausente hasta colonizar `to` (fase 10). */
  | { kind: 'absent'; journey: Journey; to: DestinationId; sessionMinutes: number; awayHours: number };

export interface SimTaskResults {
  firstRun: RunRecord;
  campaign: CampaignResult;
  natal: NatalJourney;
  journey: Journey;
  absent: AbsentResult;
}

export type SimTaskResult<T extends SimTask> = SimTaskResults[T['kind']];

/** Juega una tarea. Muta su entrada: quien llama le pasa una copia (scripts/sim-pool.ts). */
export function runTask(task: SimTask): SimTaskResults[SimTask['kind']] {
  switch (task.kind) {
    case 'firstRun':
      return firstRun(task.seed, PROFILES[task.profile]);
    case 'campaign':
      return campaign(task.seed, task.sporulations, task.policy);
    case 'natal':
      return natalToActOne(task.seed, task.policy);
    case 'journey': {
      for (const to of task.path) travel(task.journey, to);
      if (task.finish) finishJourney(task.journey);
      return task.journey;
    }
    case 'absent':
      return absentLeg(task.journey, task.to, task.sessionMinutes, task.awayHours);
  }
}

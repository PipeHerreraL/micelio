/**
 * Simulador de balance (PROMPT.md §17). Juega partidas completas sin interfaz con las
 * mismas fórmulas del juego (importa src/core, src/data y src/systems; nada de copias),
 * avanza el tiempo a pasos de 1 s y escribe los resultados en docs/BALANCE.md, entre las
 * marcas `<!-- sim:start -->` y `<!-- sim:end -->`. El resto del archivo (notas de cambios)
 * se conserva.
 *
 * Uso: npm run sim
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
} from '../src/core/forest.ts';
import { createState, hasMutation, type GameState } from '../src/core/state.ts';
import { tick } from '../src/core/tick.ts';
import { GENERATORS, type GeneratorId } from '../src/data/generators.ts';
import { BIOME_ADAPTATION_IDS, DISPERSE_COST, type DestinationId } from '../src/data/biomes.ts';
import { MUTATIONS } from '../src/data/mutations.ts';
import { UPGRADES } from '../src/data/upgrades.ts';
import { catchDrop } from '../src/systems/rain.ts';
import { parseSave, serializeSave } from '../src/systems/save.ts';
import { fmt, setLocale, setNotation } from '../src/i18n/index.ts';
import { SEEDS, clock, hours, median, row, writeBlock, type Metric } from './sim-report.ts';

// Las cifras del informe se escriben como en el juego: «1,8 millones», no «1.80e+06».
setLocale('es');
setNotation('names');

// ---------------------------------------------------------------------------------------
// Perfiles y bot

type ProfileName = 'active' | 'passive';

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

/** Compra la adaptación de bioma más barata que esté abierta mientras alcance sin tocar la reserva. */
function buyBiomeAdaptations(state: GameState, reserve: number): void {
  for (let guard = 0; guard < 50; guard += 1) {
    let best: { id: (typeof BIOME_ADAPTATION_IDS)[number]; cost: number } | null = null;
    for (const id of BIOME_ADAPTATION_IDS) {
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
    if (hasMutation(state, m.id)) continue;
    if (state.spores.available < m.cost) return;
    buyMutation(state, { id: m.id });
    if (!hasMutation(state, m.id)) return;
  }
}

// ---------------------------------------------------------------------------------------
// Partidas

interface RunRecord {
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

interface CampaignResult {
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
type SporulatePolicy = 'doubling' | 'rate';

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
}

const START_TIME = Date.UTC(2026, 0, 1);

/**
 * Segundo (acumulado) en que llegó el plasmodio a cada partida simulada (fase 9). El simulador de
 * la red no avanza al socio: solo anota cuándo lo trae el núcleo (línea informativa).
 */
const partnerArrivals = new WeakMap<GameState, number>();

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
    if (state.partners.plasmodium && !partnerArrivals.has(state)) {
      partnerArrivals.set(state, options.elapsedBefore + t + 1);
    }

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
        // La campaña esporula cuando la ganancia es al menos max(10, nivel actual).
        go = gain >= Math.max(10, state.spores.level);
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
function campaign(seed: number, sporulations: number, policy: SporulatePolicy = 'doubling'): CampaignResult {
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

/** Natal jugado hasta el Acto I, compartido por los dos órdenes del viaje. */
interface NatalJourney {
  state: GameState;
  elapsed: number;
  /** Tiempo acumulado del primer segundo con el Acto I cerrado. */
  actOneAt: number | null;
  /** Partidas jugadas tras el Acto I solo para juntar las 300 esporas del viaje. */
  waitRuns: number;
  maxValue: number;
  earnedSpores: number;
  invalidSaves: number;
}

interface BiomeLeg {
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

interface WindResult {
  legs: BiomeLeg[];
  /** Partidas jugadas tras colonizar un bioma solo para juntar las 300 esporas del viaje. */
  waits: number[];
  /** Partidas tras colonizar el último bioma (informativas: es el final de esta versión). */
  after: number[];
  /** Esporas sin gastar y ganadas en toda la campaña, al colonizar el último bioma. */
  unspent: number;
  /** Segundo en que llegó el plasmodio (informativo; null si no llegó). */
  partnerAt: number | null;
  earnedSpores: number;
  maxValue: number;
  invalidSaves: number;
}

/**
 * Tope de partidas por bioma con la regla de §17: si se alcanza, el bioma cuenta como no
 * colonizado. La regla del mejor ritmo hace partidas de pocos minutos y lleva su propio tope.
 */
const BIOME_RUN_CAP = 30;
const RATE_RUN_CAP = 200;
/**
 * Partidas que se juegan tras el último bioma (para el techo y la tabla informativa). Cuatro y
 * no ocho: sin destinos, la regla de §17 pide duplicar el nivel en cada partida y desde la
 * quinta cada una dura horas (en el orden Chocó→taiga, 2 h 15 min la quinta y 11 h 50 min la
 * octava, prototipo): el informe ya muestra que ahí empieza el muro.
 */
const AFTER_RUNS = 4;

/** El guardado sigue siendo válido tras cada paso del viaje (ARCHITECTURE.md §4.26). */
function saveIsValid(state: GameState, now: number): boolean {
  return parseSave(serializeSave(state, now)).ok;
}

/** Reserva para el próximo viaje: solo con el bosque cerrado y un destino por delante. */
function journeyReserve(state: GameState): number {
  return isForestColonized(state) && destinations(state).length > 0 ? DISPERSE_COST : 0;
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
  return { state, elapsed, actOneAt, waitRuns, maxValue, earnedSpores, invalidSaves };
}

/** Juega en el bioma actual hasta colonizarlo (o hasta el tope). Devuelve las duraciones. */
function playBiome(
  state: GameState,
  profile: Profile,
  policy: SporulatePolicy,
  start: number,
  onRun?: (run: RunRecord, elapsed: number) => void,
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
    });
    runs.push(run.duration);
    elapsed += run.duration;
    onRun?.(run, elapsed);
    if (run.sporesGained === 0) break;
    shopBetweenRuns(state);
  }
  return { runs, elapsed, colonized: isForestColonized(state) };
}

function windCampaign(
  natal: NatalJourney,
  order: readonly DestinationId[],
  policy: SporulatePolicy = 'doubling',
  withPassive = true,
): WindResult {
  const state = structuredClone(natal.state);
  let elapsed = natal.elapsed;
  let maxValue = natal.maxValue;
  let earnedSpores = natal.earnedSpores;
  let invalidSaves = natal.invalidSaves;
  let unspent = 0;
  let earnedAtEnd = 0;
  const legs: BiomeLeg[] = [];
  const waits: number[] = [];
  const track = (run: RunRecord, at: number): void => {
    maxValue = Math.max(maxValue, run.maxValue);
    earnedSpores += run.sporesGained;
    if (!saveIsValid(state, START_TIME + at * 1000)) invalidSaves += 1;
  };
  for (const to of order) {
    // El bot dispersa al empezar partida: no hay esporas de la partida que dar.
    disperse(state, { to, now: START_TIME + elapsed * 1000 });
    drain();
    if (state.forest.biome !== to) break;
    if (!saveIsValid(state, START_TIME + elapsed * 1000)) invalidSaves += 1;
    buyBiomeAdaptations(state, 0);
    const arrival = elapsed;
    let passiveTime: number | null = null;
    if (withPassive) {
      // El pasivo compra igual que el activo entre partidas; solo cambia cómo juega.
      const passive = structuredClone(state);
      const p = playBiome(passive, PROFILES.passive, policy, arrival);
      passiveTime = p.colonized ? p.elapsed - arrival : null;
    }
    const a = playBiome(state, PROFILES.active, policy, arrival, track);
    elapsed = a.elapsed;
    legs.push({
      biome: to,
      runs: a.runs,
      colonizeTime: a.colonized ? elapsed - arrival : null,
      passiveTime,
      levelAtColonize: state.spores.level,
      cumulative: elapsed,
    });
    if (!a.colonized) break;
    unspent = state.spores.available;
    earnedAtEnd = earnedSpores;
    // Si no alcanza para el viaje, partidas de espera (las cuenta la métrica de espera).
    let wait = 0;
    for (; destinations(state).length > 0 && disperseBlock(state) === 'spores' && wait < 10; wait += 1) {
      const run = playRun(state, {
        profile: PROFILES.active,
        stopWhen: 'campaign',
        policy,
        maxSeconds: 12 * 3600,
        elapsedBefore: elapsed,
      });
      elapsed += run.duration;
      track(run, elapsed);
      shopBetweenRuns(state);
    }
    if (destinations(state).length > 0) waits.push(wait);
  }
  const after: number[] = [];
  for (
    let i = 0;
    i < AFTER_RUNS && legs.length === order.length && legs.every((l) => l.colonizeTime !== null);
    i += 1
  ) {
    const run = playRun(state, {
      profile: PROFILES.active,
      stopWhen: 'campaign',
      policy,
      maxSeconds: 12 * 3600,
      elapsedBefore: elapsed,
    });
    after.push(run.duration);
    elapsed += run.duration;
    track(run, elapsed);
    if (run.sporesGained === 0) break;
    shopBetweenRuns(state);
  }
  const partnerAt = partnerArrivals.get(natal.state) ?? partnerArrivals.get(state) ?? null;
  return { legs, waits, after, unspent, earnedSpores: earnedAtEnd, maxValue, invalidSaves, partnerAt };
}

// ---------------------------------------------------------------------------------------
// Corridas

const started = performance.now();
const active = SEEDS.map((seed) => firstRun(seed, PROFILES.active));
const passive = SEEDS.map((seed) => firstRun(seed, PROFILES.passive));
const campaigns = SEEDS.map((seed) => campaign(seed, 10));
// Campañas largas: 20 esporulaciones con cada política, para ver el final del juego.
const LONG_RUNS = 20;
const longDoubling = SEEDS.map((seed) => campaign(seed, LONG_RUNS, 'doubling'));
const longRate = SEEDS.map((seed) => campaign(seed, LONG_RUNS, 'rate'));
// Viento de esporas: el natal hasta el Acto I se juega una vez por semilla y lo comparten los
// dos órdenes del viaje.
const ORDERS: readonly (readonly DestinationId[])[] = [
  ['taiga', 'choco'],
  ['choco', 'taiga'],
];
const natals = SEEDS.map((seed) => natalToActOne(seed, 'doubling'));
const winds = ORDERS.map((order) => natals.map((n) => windCampaign(n, order)));
// Regla del mejor ritmo, informativa: natal y primer bioma (taiga), sin perfil pasivo.
const rateJourneys = SEEDS.map((seed) => {
  const natal = natalToActOne(seed, 'rate');
  return { actOneAt: natal.actOneAt, wind: windCampaign(natal, ['taiga'], 'rate', false) };
});

const first = (id: GeneratorId) => active.map((r) => r.firstOwned[id] ?? null);
const run1Available = active.map((r) => r.sporulateAvailableAt);
const run2Speedup = campaigns.map((c, i) => {
  const r1 = run1Available[i];
  const r2 = c.runs[1]?.sporulateAvailableAt;
  return r1 && r2 ? 1 - r2 / r1 : null;
});
const passiveRatio = passive.map((p, i) => {
  const a = run1Available[i];
  return a && p.sporulateAvailableAt ? p.sporulateAvailableAt / a : null;
});

const metrics: Metric[] = [
  {
    name: 'Primer Rizomorfo',
    target: '< 1 min',
    values: first('rhizomorph'),
    format: clock,
    pass: (m) => m < 60,
  },
  {
    name: 'Primer Primordio',
    target: '3–5 min',
    values: first('primordium'),
    format: clock,
    pass: (m) => m >= 180 && m <= 300,
  },
  {
    name: 'Primera Seta',
    target: '7–10 min',
    values: first('mushroom'),
    format: clock,
    pass: (m) => m >= 420 && m <= 600,
  },
  {
    name: 'Primer Anillo de hadas',
    target: '14–20 min',
    values: first('fairyRing'),
    format: clock,
    pass: (m) => m >= 840 && m <= 1200,
  },
  {
    name: 'Primera Red micorrícica',
    target: '24–32 min',
    values: first('mycorrhiza'),
    format: clock,
    pass: (m) => m >= 1440 && m <= 1920,
  },
  {
    name: 'Esporular disponible en la partida 1',
    target: '30–45 min',
    values: run1Available,
    format: clock,
    pass: (m) => m >= 1800 && m <= 2700,
  },
  {
    name: 'Esporas de la primera esporulación',
    target: '12–18',
    values: campaigns.map((c) => c.runs[0]?.sporesGained ?? null),
    format: (v) => (v === null ? '—' : String(Math.round(v))),
    pass: (m) => m >= 12 && m <= 18,
  },
  {
    name: 'Partida 2 hasta Esporular disponible (15 esporas y 4 mutaciones)',
    target: '≥ 40 % más rápida que la 1',
    values: run2Speedup,
    format: (v) => (v === null ? '—' : `${Math.round(v * 100)} %`),
    pass: (m) => m >= 0.4,
  },
  {
    name: 'Perfil pasivo hasta Esporular disponible',
    target: '≤ 2.5 × el activo',
    values: passiveRatio,
    format: (v) => (v === null ? '—' : `${v.toFixed(2)} ×`),
    pass: (m) => m <= 2.5,
  },
  {
    name: 'Primer Gigante de Malheur (tiempo acumulado)',
    target: '2–3.5 h',
    values: campaigns.map((c) => c.firstMalheurAt),
    format: hours,
    pass: (m) => m >= 2 * 3600 && m <= 3.5 * 3600,
  },
];
for (let i = 0; i < 8; i += 1) {
  metrics.push({
    name: `Duración de la partida ${i + 1} de la campaña`,
    target: '≥ 10 min',
    values: campaigns.map((c) => c.runs[i]?.duration ?? null),
    format: clock,
    pass: (m) => m >= 600,
  });
}

// Objetivos de la madurez de la red (docs/ROADMAP.md, fase 7).
const shortestRun = (results: readonly CampaignResult[], upTo: number): number[] =>
  Array.from({ length: upTo }, (_, i) => median(results.map((c) => c.runs[i]?.duration ?? 0)));
metrics.push({
  name: 'Campaña larga, regla §17: partida más corta de la 1 a la 16 (mediana por partida)',
  target: '≥ 6 min',
  values: [Math.min(...shortestRun(longDoubling, 16))],
  format: clock,
  pass: (m) => m >= 360,
});
metrics.push({
  name: 'Campaña larga, regla del mejor ritmo: partida más corta de la 1 a la 20',
  target: '≥ 8 min',
  values: [Math.min(...shortestRun(longRate, 20))],
  format: clock,
  pass: (m) => m >= 480,
});
metrics.push({
  name: 'Campaña larga, regla §17: esporas sin gastar al final, sobre las ganadas',
  target: '< 50 %',
  values: longDoubling.map((c) => (c.earnedSpores > 0 ? c.unspent / c.earnedSpores : 0)),
  format: (v) => (v === null ? '—' : `${Math.round(v * 100)} %`),
  pass: (m) => m < 0.5,
});

// Objetivos de Viento de esporas (docs/ROADMAP.md, fase 8).
const BIOME_NAMES: Record<DestinationId, string> = { taiga: 'taiga', choco: 'Chocó' };
const orderName = (order: readonly DestinationId[]): string => order.map((b) => BIOME_NAMES[b]).join('→');
metrics.push({
  name: 'Viento: cierre del Acto I (tiempo acumulado)',
  target: '2,5–3,5 h',
  values: natals.map((n) => n.actOneAt),
  format: hours,
  pass: (m) => m >= 2.5 * 3600 && m <= 3.5 * 3600,
});
metrics.push({
  name: 'Viento: partidas de espera para pagar un viaje (tras el Acto I o tras colonizar)',
  target: '≤ 1',
  values: winds.flat().map((w, i) => Math.max(natals[i % natals.length]?.waitRuns ?? 0, ...w.waits)),
  format: (v) => (v === null ? '—' : String(v)),
  pass: (m) => m <= 1,
});
/** Mediana entre semillas de la partida i de un tramo (solo las semillas que la jugaron). */
const legRunMedians = (results: readonly WindResult[], leg: number): number[] => {
  const longest = Math.max(0, ...results.map((w) => w.legs[leg]?.runs.length ?? 0));
  const out: number[] = [];
  for (let i = 0; i < longest; i += 1) {
    const values = results.map((w) => w.legs[leg]?.runs[i]).filter((v): v is number => v !== undefined);
    // Una partida que solo jugaron una o dos semillas no dice nada de la mediana.
    if (values.length * 2 >= results.length) out.push(median(values));
  }
  return out;
};
ORDERS.forEach((order, o) => {
  const results = winds[o] ?? [];
  order.forEach((biome, leg) => {
    const label = `Viento ${orderName(order)}, ${BIOME_NAMES[biome]} (${leg === 0 ? 'primer' : 'segundo'} destino)`;
    metrics.push({
      name: `${label}: partidas hasta colonizar (todas)`,
      target: '20–33 min',
      values: results.flatMap((w) => w.legs[leg]?.runs ?? [null]),
      format: clock,
      pass: (m) => m >= 20 * 60 && m <= 33 * 60,
    });
    metrics.push({
      name: `${label}: partida más corta (mediana por partida)`,
      target: '≥ 10 min',
      values: [Math.min(...legRunMedians(results, leg))],
      format: clock,
      pass: (m) => m >= 600,
    });
    metrics.push({
      name: `${label}: tiempo para colonizar`,
      target: '2–3,5 h',
      values: results.map((w) => w.legs[leg]?.colonizeTime ?? null),
      format: hours,
      pass: (m) => m >= 2 * 3600 && m <= 3.5 * 3600,
    });
    metrics.push({
      name: `${label}: pasivo hasta colonizar`,
      target: '≤ 2,5 × el activo',
      values: results.map((w) => {
        const l = w.legs[leg];
        return l?.passiveTime && l.colonizeTime ? l.passiveTime / l.colonizeTime : null;
      }),
      format: (v) => (v === null ? '—' : `${v.toFixed(2)} ×`),
      pass: (m) => m <= 2.5,
    });
  });
});
metrics.push({
  name: 'Viento: esporas sin gastar al colonizar el último bioma, sobre las ganadas en toda la campaña',
  target: '< 50 %',
  values: winds.flat().map((w) => (w.earnedSpores > 0 ? w.unspent / w.earnedSpores : null)),
  format: (v) => (v === null ? '—' : `${Math.round(v * 100)} %`),
  pass: (m) => m < 0.5,
});
const windCeiling = Math.max(...winds.flat().map((w) => w.maxValue));
metrics.push({
  name: `Viento: techo numérico (campaña y ${AFTER_RUNS} partidas tras el último bioma)`,
  target: '< 1e63',
  values: [windCeiling],
  format: (v) => (v === null ? '—' : fmt(v)),
  pass: (m) => m < 1e63,
});
metrics.push({
  name: 'Viento: guardados inválidos tras esporular, dispersar o colonizar',
  target: '0',
  values: [
    natals.reduce((sum, n) => sum + n.invalidSaves, 0) +
      winds.flat().reduce((sum, w) => sum + w.invalidSaves, 0),
  ],
  format: (v) => (v === null ? '—' : String(v)),
  pass: (m) => m === 0,
});

const rows = metrics.map(row);
const maxValue = Math.max(...campaigns.map((c) => c.maxValue));
const ceilingOk = maxValue < 1e300;
const elapsedMs = Math.round(performance.now() - started);

const campaignTable = [
  '| Partida | Duración (mediana) | Esporas ganadas (mediana) | Nivel al empezar | Mutaciones al empezar |',
  '| ------- | ------------------ | ------------------------- | ---------------- | --------------------- |',
];
for (let i = 0; i < 10; i += 1) {
  const runs = campaigns.map((c) => c.runs[i]).filter((r): r is RunRecord => r !== undefined);
  if (runs.length === 0) break;
  campaignTable.push(
    `| ${i + 1} | ${clock(median(runs.map((r) => r.duration)))} | ${Math.round(median(runs.map((r) => r.sporesGained)))} | ${Math.round(median(runs.map((r) => r.sporeLevelAtStart)))} | ${Math.round(median(runs.map((r) => r.mutationsAtStart)))} |`,
  );
}

const windTable = [
  '| Orden | Bioma | Partidas hasta colonizar (mediana de cada una) | Todas (mediana) | Colonizar | Nivel al colonizar | Acumulado |',
  '| ----- | ----- | ---------------------------------------------- | --------------- | --------- | ------------------ | --------- |',
];
const afterTable = [
  '| Orden | Partidas tras el último bioma (mediana de cada una) |',
  '| ----- | --------------------------------------------------- |',
];
ORDERS.forEach((order, o) => {
  const results = winds[o] ?? [];
  order.forEach((biome, leg) => {
    const perRun = legRunMedians(results, leg).map(clock).join(', ');
    const all = results.flatMap((w) => w.legs[leg]?.runs ?? []);
    const colonize = results
      .map((w) => w.legs[leg]?.colonizeTime)
      .filter((v): v is number => typeof v === 'number');
    const levels = results
      .map((w) => w.legs[leg]?.levelAtColonize)
      .filter((v): v is number => v !== undefined);
    const cumulative = results
      .map((w) => w.legs[leg]?.cumulative)
      .filter((v): v is number => v !== undefined);
    windTable.push(
      `| ${orderName(order)} | ${BIOME_NAMES[biome]} | ${perRun} | ${clock(median(all))} | ${hours(median(colonize))} | ${Math.round(median(levels))} | ${hours(median(cumulative))} |`,
    );
  });
  const after: string[] = [];
  for (let i = 0; i < AFTER_RUNS; i += 1) {
    const values = results.map((w) => w.after[i]).filter((v): v is number => v !== undefined);
    if (values.length > 0) after.push(clock(median(values)));
  }
  afterTable.push(`| ${orderName(order)} | ${after.join(', ') || '—'} |`);
});
const partnerTimes = winds.flat().map((w) => w.partnerAt);
const partnerPresent = partnerTimes.filter((v): v is number => v !== null);
const partnerLine =
  partnerPresent.length === partnerTimes.length
    ? `El plasmodio (fase 9) llega a las ${hours(median(partnerPresent))} de mediana (${hours(Math.min(...partnerPresent))}–${hours(Math.max(...partnerPresent))}): a los 5 min de la primera partida tras el Acto I (informativo).`
    : `El plasmodio (fase 9) llega en ${partnerPresent.length} de ${partnerTimes.length} campañas del viento (informativo).`;
const rateTaiga = rateJourneys.map((r) => r.wind.legs[0]);
const rateLine =
  `Regla del mejor ritmo (informativa, sin objetivo): el Acto I se cierra a las ${hours(median(rateJourneys.map((r) => r.actOneAt ?? Number.NaN)))}` +
  ` y la taiga se coloniza en ${hours(median(rateTaiga.map((l) => l?.colonizeTime ?? Number.NaN)))}` +
  ` (${rateTaiga.filter((l) => l?.colonizeTime !== null && l !== undefined).length} de ${rateTaiga.length} semillas), con partidas de ${clock(median(rateTaiga.flatMap((l) => l?.runs ?? [])))} de mediana.` +
  ' En un bioma esa regla esporula muy a menudo y coloniza más tarde que la de §17: no es la mejor estrategia para el viaje, por eso no guía su balance (ARCHITECTURE.md §4.28).';

const generatorTable = [
  '| # | Generador | Coste base (N) | Producción base (N/s) | Desbloqueo |',
  '| - | --------- | -------------- | --------------------- | ---------- |',
  ...GENERATORS.map(
    (g, i) =>
      `| ${i + 1} | \`${g.id}\` | ${fmt(g.baseCost)} | ${fmt(g.baseProduction)} | ${g.unlock.kind === 'always' ? 'inicio' : g.unlock.kind === 'sporulations' ? `${g.unlock.count} esporulación` : `mutación \`${g.unlock.id}\``} |`,
  ),
];

const upgradeCount = UPGRADES.length;

/** Mediana de la duración de la partida i, de las horas acumuladas y del nivel al empezar. */
function longColumn(
  results: readonly CampaignResult[],
  i: number,
): { duration: string; hours: string; level: string } {
  const runs = results.map((c) => c.runs[i]).filter((r): r is RunRecord => r !== undefined);
  const cumulative = results
    .filter((c) => c.runs.length > i)
    .map((c) => c.runs.slice(0, i + 1).reduce((sum, r) => sum + r.duration, 0));
  return {
    duration: clock(median(runs.map((r) => r.duration))),
    hours: hours(median(cumulative)),
    level: String(Math.round(median(runs.map((r) => r.sporeLevelAtStart)))),
  };
}

const longTable = [
  '| Partida | Regla max(10, nivel): duración | Acumulado | Nivel al empezar | Regla del mejor ritmo: duración | Acumulado | Nivel al empezar |',
  '| ------- | ------------------------------ | --------- | ---------------- | ------------------------------- | --------- | ---------------- |',
];
for (let i = 0; i < LONG_RUNS; i += 1) {
  const a = longColumn(longDoubling, i);
  const b = longColumn(longRate, i);
  longTable.push(
    `| ${i + 1} | ${a.duration} | ${a.hours} | ${a.level} | ${b.duration} | ${b.hours} | ${b.level} |`,
  );
}
const unspentShare = (results: readonly CampaignResult[]): string => {
  const shares = results.map((c) => (c.earnedSpores > 0 ? c.unspent / c.earnedSpores : 0));
  return `${Math.round(median(shares) * 100)} %`;
};
const longCeiling = Math.max(...longDoubling.map((c) => c.maxValue), ...longRate.map((c) => c.maxValue));

const block = [
  '<!-- sim:start -->',
  '',
  `_Generado por \`npm run sim\` (${SEEDS.length} semillas por escenario, pasos de 1 s, ${(elapsedMs / 1000).toFixed(1)} s de cómputo). No editar a mano entre estas marcas._`,
  '',
  '### Objetivos de ritmo (PROMPT.md §17)',
  '',
  'Perfil activo salvo que se indique otro. Tiempos de juego en min:s; mediana de las semillas y rango.',
  '',
  '| Métrica | Objetivo | Mediana | Rango | Estado |',
  '| ------- | -------- | ------- | ----- | ------ |',
  ...rows.map((r) => r.line),
  '',
  `**Techo numérico:** el mayor valor visto en 10 esporulaciones fue ${fmt(maxValue)} N (${ceilingOk ? 'muy por debajo' : '**por encima**'} del límite de 1e300 de \`number\`).`,
  '',
  `**Resultado:** ${rows.filter((r) => r.ok).length} de ${rows.length} objetivos cumplidos.`,
  '',
  '### Campaña (perfil activo, 10 esporulaciones)',
  '',
  ...campaignTable,
  '',
  `### Campaña larga (perfil activo, ${LONG_RUNS} esporulaciones)`,
  '',
  'Mediana de 9 semillas por partida. La regla max(10, nivel) es la de PROMPT.md §17; la del mejor ritmo esporula cuando las esporas por minuto de la partida dejan de subir.',
  '',
  ...longTable,
  '',
  `Esporas sin gastar al final (mediana, sobre las ganadas): ${unspentShare(longDoubling)} con max(10, nivel) y ${unspentShare(longRate)} con el mejor ritmo. Techo de las campañas largas: ${fmt(longCeiling)} N.`,
  '',
  '### Viento de esporas (perfil activo, regla de §17)',
  '',
  `Natal hasta el Acto I y después los dos destinos, en los dos órdenes; mediana de ${SEEDS.length} semillas. El bot dispersa al empezar partida, compra al llegar las adaptaciones de bioma abiertas y, entre partidas, mutaciones y adaptaciones guardando 300 esporas para el viaje cuando hay destino por delante.`,
  '',
  ...windTable,
  '',
  `Tras colonizar el último bioma no quedan destinos en esta versión; las ${AFTER_RUNS} partidas siguientes son informativas:`,
  '',
  ...afterTable,
  '',
  rateLine,
  '',
  partnerLine,
  '',
  '### Generadores',
  '',
  ...generatorTable,
  '',
  `Mejoras: ${upgradeCount} (40 de generador y 10 de clic, globales y sinergias), ver \`src/data/upgrades.ts\`.`,
  '',
  '<!-- sim:end -->',
].join('\n');

writeBlock(new URL('../docs/BALANCE.md', import.meta.url), '<!-- sim:start -->', '<!-- sim:end -->', block);

console.log(rows.map((r) => r.line).join('\n'));
console.log(
  `Techo: ${fmt(maxValue)} · ${rows.filter((r) => r.ok).length}/${rows.length} objetivos · ${elapsedMs} ms`,
);

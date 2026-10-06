/**
 * Simulador de balance (PROMPT.md §17). Juega partidas completas sin interfaz con las
 * mismas fórmulas del juego (scripts/sim-play.ts importa src/core, src/data y src/systems; nada
 * de copias), avanza el tiempo a pasos de 1 s y escribe los resultados en docs/BALANCE.md, entre
 * las marcas `<!-- sim:start -->` y `<!-- sim:end -->`. El resto del archivo (notas de cambios)
 * se conserva.
 *
 * Las partidas se reparten entre hilos (scripts/sim-pool.ts); lo que sale no depende del reparto.
 *
 * Uso: npm run sim (con SIM_WORKERS=n, n hilos; con 0, todo en el hilo principal)
 */
import {
  BIOME_IDS,
  DESTINATION_IDS,
  DISPERSE_COST,
  HOME_BIOME,
  getBiome,
  type BiomeId,
  type DestinationId,
} from '../src/data/biomes.ts';
import { offeredVows, sameVows, vowGoalFactor } from '../src/core/forest.ts';
import { AUTOBUY_THRESHOLDS, createState, type AutobuyThreshold } from '../src/core/state.ts';
import { SOW_COST, VOW_IDS, type VowId } from '../src/data/cycle.ts';
import { GENERATORS, type GeneratorId } from '../src/data/generators.ts';
import { UPGRADES } from '../src/data/upgrades.ts';
import { fmt, setLocale, setNotation } from '../src/i18n/index.ts';
import {
  journeyPlan,
  startJourney,
  type CampaignResult,
  type CycleLeg,
  type Journey,
  type RunRecord,
  type VowCycle,
} from './sim-play.ts';
import { createPool, poolSize, type SimPool } from './sim-pool.ts';
import {
  SEEDS,
  clock,
  cycleRunMedians,
  hours,
  longestCycleRun,
  median,
  present,
  row,
  runMedians,
  waitRunMedian,
  writeBlock,
  type Metric,
} from './sim-report.ts';

// Las cifras del informe se escriben como en el juego: «1,8 millones», no «1.80e+06».
setLocale('es');
setNotation('names');

// Órdenes del viaje: cada orden del primer anillo (un prefijo) se ramifica en los del segundo.
const { prefixes: PREFIXES, branches: BRANCHES } = journeyPlan();
const ORDERS: readonly (readonly DestinationId[])[] = PREFIXES.flatMap((prefix) =>
  BRANCHES.map((branch) => [...prefix, ...branch]),
);
const HAS_BRANCHES = BRANCHES.some((branch) => branch.length > 0);
/** Tramos del primer anillo: los de cada prefijo, comunes a todas sus ramas. */
const PREFIX_LEGS = PREFIXES[0]?.length ?? 0;

/**
 * Perfil ausente (fase 10): sesiones de 20 min del perfil activo y luego H horas fuera, con el
 * tercer destino tras el primer prefijo (taiga→Chocó). Con el deshielo de la tundra, las de 24 y
 * 48 h son objetivo: para quien vuelve cada día o cada dos, la tundra no va más lenta que la
 * pradera. Las demás, informativas.
 */
const ABSENT_SESSION_MINUTES = 20;
const ABSENT_HOURS = [12, 24, 36, 48, 72];
/** Biomas del segundo anillo, los que el perfil ausente compara como tercer destino. */
const ABSENT_BIOMES: readonly DestinationId[] = BRANCHES[0] ?? [];

/**
 * Vueltas del ciclo libre (fase 10): tras El regreso, los cinco biomas seguidos y sin votos,
 * empezando en uno distinto en cada orden del viaje (T‑C‑P‑U por la taiga, T‑C‑U‑P por el Chocó…).
 * Así cada bioma sale en cuatro posiciones distintas y su métrica es la mediana de sus cuatro
 * apariciones por las semillas; el natal nunca abre la vuelta, porque acaba de cerrar El regreso.
 * El régimen estable juega la misma vuelta otra vez, sobre una copia y con las adaptaciones de bioma
 * al máximo.
 */
const LAP_BASE: readonly BiomeId[] = [...DESTINATION_IDS, HOME_BIOME];
const lapOf = (order: number): BiomeId[] =>
  LAP_BASE.map((_, i) => LAP_BASE[(i + order) % LAP_BASE.length] ?? HOME_BIOME);

/**
 * Matriz de votos (fase 10, bloque B): cada voto suelto en cada bioma que lo ofrece, junto al ciclo
 * sin votos del mismo bioma, desde el mismo estado, y los tres votos juntos. «Solo autocompra» se
 * juega con los tres umbrales: la Poda no rige con el voto y el umbral decide cuánto cuesta (con 0,1
 * es el más lento en casi todos los biomas). Los demás, con el umbral de partida, que con ellos no
 * compra nada: el bot no enciende los interruptores.
 */
interface VowCase {
  biome: BiomeId;
  vows: VowId[];
  threshold: AutobuyThreshold;
}
const DEFAULT_THRESHOLD = createState(0, 0).autobuy.threshold;
const thresholdsFor = (vows: readonly VowId[]): readonly AutobuyThreshold[] =>
  vows.includes('autoOnly') ? AUTOBUY_THRESHOLDS : [DEFAULT_THRESHOLD];
const SINGLE_VOW_CASES: readonly VowCase[] = BIOME_IDS.flatMap((biome) => [
  { biome, vows: [], threshold: DEFAULT_THRESHOLD },
  ...offeredVows(biome).flatMap((vow) =>
    thresholdsFor([vow]).map((threshold) => ({ biome, vows: [vow], threshold })),
  ),
]);
/** Los biomas que ofrecen los tres votos (todos menos el Chocó, sin «sin lluvia»). */
const ALL_VOWS_BIOMES: readonly BiomeId[] = BIOME_IDS.filter(
  (biome) => offeredVows(biome).length === VOW_IDS.length,
);
const ALL_VOWS_CASES: readonly VowCase[] = ALL_VOWS_BIOMES.flatMap((biome) =>
  thresholdsFor(VOW_IDS).map((threshold) => ({ biome, vows: [...VOW_IDS], threshold })),
);
/** Los tres votos se miden en el régimen estable, junto a los sueltos y sus ciclos sin votos. */
const STABLE_VOW_CASES: readonly VowCase[] = [...SINGLE_VOW_CASES, ...ALL_VOWS_CASES];
/** Tope de los tres votos: un ciclo así debe caber en una jornada larga (§6.2). */
const ALL_VOWS_MAX_SECONDS = 9 * 3600;

// ---------------------------------------------------------------------------------------
// Corridas

// Campañas largas: 20 esporulaciones con cada política, para ver el final del juego.
const LONG_RUNS = 20;

async function playAll(pool: SimPool) {
  const perSeed = <T>(play: (seed: number) => Promise<T>): Promise<T[]> => Promise.all(SEEDS.map(play));
  // Viento de esporas, lo primero porque encadena las tareas más largas. El natal hasta el Acto I
  // se juega una vez por semilla y sirve a todos los órdenes, y cada prefijo a todas sus ramas:
  // cada tarea juega sobre una copia (sim-pool.ts).
  const natalRuns = SEEDS.map((seed) => pool.run({ kind: 'natal', seed, policy: 'doubling' }));
  const prefixRuns = PREFIXES.map((path) =>
    natalRuns.map(async (natal) => {
      const journey = startJourney(await natal, 'doubling', true);
      return pool.run({ kind: 'journey', journey, path, finish: !HAS_BRANCHES });
    }),
  );
  const branchRuns = prefixRuns.flatMap((prefixes) =>
    BRANCHES.map((path) =>
      prefixes.map(async (prefix) =>
        HAS_BRANCHES ? pool.run({ kind: 'journey', journey: await prefix, path, finish: true }) : prefix,
      ),
    ),
  );
  // Tras El regreso, la primera vuelta del ciclo libre en cada semilla y, sobre una copia de su
  // final, el régimen estable: cada semilla sigue en cuanto termina su tramo anterior.
  const lapRuns = branchRuns.map((bySeed, o) =>
    bySeed.map(async (branch) =>
      pool.run({ kind: 'lap', journey: await branch, biomes: lapOf(o), stable: false }),
    ),
  );
  const stableRuns = lapRuns.map((bySeed, o) =>
    bySeed.map(async (lap) => pool.run({ kind: 'lap', journey: await lap, biomes: lapOf(o), stable: true })),
  );
  // La matriz de votos, sobre el primer orden: cada combinación es la primera siembra tras cerrar El
  // regreso (la «primera vuelta» de los votos, sin encadenar biomas) y, sobre el final de su primera
  // vuelta con las adaptaciones de bioma al máximo, el régimen estable. Cada ciclo es una tarea.
  const vowCycles = (journey: Promise<Journey>, cases: readonly VowCase[], stable: boolean) =>
    journey.then((j) =>
      Promise.all(cases.map((c) => pool.run({ kind: 'vowCycle', journey: j, ...c, stable }))),
    );
  const vowFirstRuns = (branchRuns[0] ?? []).map((branch) => vowCycles(branch, SINGLE_VOW_CASES, false));
  const vowStableRuns = (lapRuns[0] ?? []).map((lap) => vowCycles(lap, STABLE_VOW_CASES, true));
  // Regla del mejor ritmo, informativa: natal y primer bioma (taiga), sin perfil pasivo.
  const rateRuns = perSeed(async (seed) => {
    const natal = await pool.run({ kind: 'natal', seed, policy: 'rate' });
    const journey = startJourney(natal, 'rate', false);
    const wind = await pool.run({ kind: 'journey', journey, path: ['taiga'], finish: false });
    return { actOneAt: natal.actOneAt, wind };
  });
  // Perfil ausente: desde el primer prefijo, cada bioma del segundo anillo con cada ausencia.
  const firstPrefix = prefixRuns[0] ?? [];
  const absentRuns = ABSENT_BIOMES.map((to) =>
    ABSENT_HOURS.map((awayHours) =>
      Promise.all(
        firstPrefix.map(async (prefix) =>
          pool.run({
            kind: 'absent',
            journey: await prefix,
            to,
            sessionMinutes: ABSENT_SESSION_MINUTES,
            awayHours,
          }),
        ),
      ),
    ),
  );
  const longDoublingRuns = perSeed((seed) =>
    pool.run({ kind: 'campaign', seed, sporulations: LONG_RUNS, policy: 'doubling' }),
  );
  const longRateRuns = perSeed((seed) =>
    pool.run({ kind: 'campaign', seed, sporulations: LONG_RUNS, policy: 'rate' }),
  );
  const campaignRuns = perSeed((seed) =>
    pool.run({ kind: 'campaign', seed, sporulations: 10, policy: 'doubling' }),
  );
  const passiveRuns = perSeed((seed) => pool.run({ kind: 'firstRun', seed, profile: 'passive' }));
  const activeRuns = perSeed((seed) => pool.run({ kind: 'firstRun', seed, profile: 'active' }));
  // Todo en un solo Promise.all: si una tarea falla, la corrida termina con ese error.
  const [
    natals,
    prefixes,
    winds,
    stables,
    vowFirst,
    vowStable,
    absents,
    rateJourneys,
    longDoubling,
    longRate,
    campaigns,
    active,
    passive,
  ] = await Promise.all([
    Promise.all(natalRuns),
    Promise.all(prefixRuns.map((runs) => Promise.all(runs))),
    Promise.all(lapRuns.map((runs) => Promise.all(runs))),
    Promise.all(stableRuns.map((runs) => Promise.all(runs))),
    Promise.all(vowFirstRuns),
    Promise.all(vowStableRuns),
    Promise.all(absentRuns.map((byHours) => Promise.all(byHours))),
    rateRuns,
    longDoublingRuns,
    longRateRuns,
    campaignRuns,
    activeRuns,
    passiveRuns,
  ]);
  return {
    active,
    passive,
    campaigns,
    longDoubling,
    longRate,
    natals,
    prefixes,
    winds,
    stables,
    vowFirst,
    vowStable,
    absents,
    rateJourneys,
  };
}

const started = performance.now();
const workers = poolSize();
const pool = createPool(workers);
const {
  active,
  passive,
  campaigns,
  longDoubling,
  longRate,
  natals,
  prefixes,
  winds,
  stables,
  vowFirst,
  vowStable,
  absents,
  rateJourneys,
} = await playAll(pool).finally(() => pool.close());

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
const BIOME_NAMES: Record<DestinationId, string> = {
  taiga: 'taiga',
  choco: 'Chocó',
  prairie: 'pradera',
  tundra: 'tundra',
};
const orderName = (order: readonly DestinationId[]): string => order.map((b) => BIOME_NAMES[b]).join('→');
/** Posición de un tramo en el orden del viaje, en las etiquetas. */
const ORDINALS = ['primer', 'segundo', 'tercer', 'cuarto'];
const ordinal = (leg: number): string => ORDINALS[leg] ?? `${leg + 1}.º`;
metrics.push({
  name: 'Viento: cierre del Acto I (tiempo acumulado)',
  target: '2,5–3,5 h',
  values: natals.map((n) => n.actOneAt),
  format: hours,
  pass: (m) => m >= 2.5 * 3600 && m <= 3.5 * 3600,
});
// Con las siembras del ciclo libre (fase 10): el régimen estable es una copia del viaje entero, así
// que sus esperas son las del viaje, las de la primera vuelta y las suyas.
metrics.push({
  name: 'Viento: partidas de espera para pagar un viaje o una siembra (tras el Acto I, tras colonizar o tras cumplir)',
  target: '≤ 1',
  values: stables.flat().map((w, i) => Math.max(natals[i % natals.length]?.waitRuns ?? 0, ...w.waits)),
  format: (v) => (v === null ? '—' : String(v)),
  pass: (m) => m <= 1,
});
/** Lo mismo para la partida i de un tramo. */
const legRunMedians = (results: readonly Journey[], leg: number): number[] =>
  runMedians(results.map((w) => w.legs[leg]?.runs));
/**
 * Objetivos de un tramo del viaje. Los del segundo anillo (fase 10) suman la partida más larga:
 * en la pradera tercera, sin calibrar, la última partida pasaba de una hora (1:01–1:04), y una
 * partida de más de una hora es el muro que la fase resuelve.
 */
function legMetrics(order: readonly DestinationId[], results: readonly Journey[], leg: number): void {
  const biome = order[leg];
  if (biome === undefined) return;
  const label = `Viento ${orderName(order)}, ${BIOME_NAMES[biome]} (${ordinal(leg)} destino)`;
  const medians = legRunMedians(results, leg);
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
    values: [Math.min(...medians)],
    format: clock,
    pass: (m) => m >= 600,
  });
  if (leg >= PREFIX_LEGS) {
    metrics.push({
      name: `${label}: partida más larga (mediana por partida)`,
      target: '≤ 60 min',
      values: [Math.max(...medians)],
      format: clock,
      pass: (m) => m <= 3600,
    });
  }
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
}
// Tramos del primer anillo: los de cada prefijo, que se juegan una vez por semilla y sirven a todas
// sus ramas. Son los 16 objetivos de la 1.3–1.5, con sus mismos nombres.
PREFIXES.forEach((prefix, p) => {
  prefix.forEach((_, leg) => {
    legMetrics(prefix, prefixes[p] ?? [], leg);
  });
});
// Tramos del segundo anillo (fase 10), en cada orden.
ORDERS.forEach((order, o) => {
  order.forEach((_, leg) => {
    if (leg >= PREFIX_LEGS) legMetrics(order, winds[o] ?? [], leg);
  });
});
/**
 * El regreso (fase 10): tras el cuarto bioma, en cada orden. Cada objetivo vale para el peor de los
 * cuatro órdenes (`every`): la fila da la mediana y el rango de los cuatro. La partida más larga
 * entra como en los tramos del segundo anillo: sin la regla de la meta, la última partida de un
 * ciclo duraba 1:30 h (prototipo).
 */
const homecomings = (o: number): (number[] | undefined)[] => (winds[o] ?? []).map((w) => w.homecoming?.runs);
const returnPerOrder = (value: (o: number) => number | null): (number | null)[] =>
  ORDERS.map((_, o) => value(o));
metrics.push({
  name: 'Viento, El regreso (el peor de los órdenes): partidas hasta cumplirlo (todas, mediana)',
  target: '20–35 min',
  values: returnPerOrder((o) => {
    const all = homecomings(o).flatMap((runs) => runs ?? []);
    return all.length > 0 ? median(all) : null;
  }),
  format: clock,
  pass: (m) => m >= 20 * 60 && m <= 35 * 60,
  every: true,
});
metrics.push({
  name: 'Viento, El regreso (el peor de los órdenes): partida más corta (mediana por partida)',
  target: '≥ 10 min',
  values: returnPerOrder((o) => {
    const medians = runMedians(homecomings(o));
    return medians.length > 0 ? Math.min(...medians) : null;
  }),
  format: clock,
  pass: (m) => m >= 600,
  every: true,
});
metrics.push({
  name: 'Viento, El regreso (el peor de los órdenes): partida más larga (mediana por partida)',
  target: '≤ 60 min',
  values: returnPerOrder((o) => {
    const medians = runMedians(homecomings(o));
    return medians.length > 0 ? Math.max(...medians) : null;
  }),
  format: clock,
  pass: (m) => m <= 3600,
  every: true,
});
metrics.push({
  name: 'Viento, El regreso (el peor de los órdenes): tiempo para cumplirlo',
  target: '2–4 h',
  values: returnPerOrder((o) => {
    // Una semilla que no lo cumple deja la mediana de su orden sin valor: no cumple.
    const times = (winds[o] ?? []).map((w) => w.homecoming?.closeTime ?? null);
    return times.every((v) => v !== null) ? median(present(times)) : null;
  }),
  format: hours,
  pass: (m) => m >= 2 * 3600 && m <= 4 * 3600,
  every: true,
});
/**
 * Días del perfil ausente: las ausencias hasta colonizar por sus horas. Los minutos de juego no
 * cuentan: si no, con las mismas sesiones decidirían unos minutos de la última, no las ausencias.
 */
const absentDays = (sessions: number | null, awayHours: number): number | null =>
  sessions === null ? null : ((sessions - 1) * awayHours) / 24;
const absentOf = (biome: DestinationId, awayHours: number): (number | null)[] => {
  const byHours = absents[ABSENT_BIOMES.indexOf(biome)] ?? [];
  return (byHours[ABSENT_HOURS.indexOf(awayHours)] ?? []).map((r) => absentDays(r.sessions, awayHours));
};
const days = (v: number | null): string => (v === null ? '—' : `${v.toFixed(1)} d`);
const absentLabel = `perfil ausente (sesiones de ${ABSENT_SESSION_MINUTES} min, tercer destino tras ${orderName(PREFIXES[0] ?? [])})`;
// Sin el deshielo, la tundra tardaba 3,0 días frente a 2,0 de la pradera con 24 h fuera. Con 48 h
// empatan con él y sin él (4,0 y 4,0); la especificación pedía que la tundra ganara, y no se puede:
// las dos colonizan en la tercera sesión en casi todas las semillas, y colonizar en la segunda
// pediría de 5 a 190 veces los nutrientes del bosque que deja la primera ausencia (medido en tres
// semillas: nivel 36–217 al terminar la segunda sesión, de 500).
for (const awayHours of [24, 48]) {
  const prairie = median(present(absentOf('prairie', awayHours)));
  metrics.push({
    name: `Viento, ${absentLabel}: días para colonizar la tundra con ${awayHours} h fuera, frente a la pradera`,
    target: `≤ ${days(prairie)} (la pradera)`,
    values: absentOf('tundra', awayHours),
    format: days,
    pass: (m) => m <= prairie,
  });
}
metrics.push({
  name: 'Viento: esporas sin gastar al colonizar el último bioma, sobre las ganadas en toda la campaña',
  target: '< 50 %',
  values: winds.flat().map((w) => (w.earnedAtColonize > 0 ? w.unspent / w.earnedAtColonize : null)),
  format: (v) => (v === null ? '—' : `${Math.round(v * 100)} %`),
  pass: (m) => m < 0.5,
});
const windCeiling = Math.max(...stables.flat().map((w) => w.maxValue));
metrics.push({
  name: 'Viento: techo numérico (campaña, los cuatro destinos, El regreso y el ciclo libre)',
  target: '< 1e63',
  values: [windCeiling],
  format: (v) => (v === null ? '—' : fmt(v)),
  pass: (m) => m < 1e63,
});
metrics.push({
  name: 'Viento: guardados inválidos tras esporular, dispersar o colonizar',
  target: '0',
  // El régimen estable copia el viaje: su cuenta ya lleva la del viaje y la de la primera vuelta.
  // Los ciclos con votos juegan sobre copias y cuentan solo los suyos (tras sembrar y cada partida).
  values: [
    natals.reduce((sum, n) => sum + n.invalidSaves, 0) +
      stables.flat().reduce((sum, w) => sum + w.invalidSaves, 0) +
      [...vowFirst, ...vowStable].flat().reduce((sum, c) => sum + c.invalidSaves, 0),
  ],
  format: (v) => (v === null ? '—' : String(v)),
  pass: (m) => m === 0,
});

// Ciclo libre (fase 10): la primera vuelta tras El regreso y el régimen estable, sin votos.
const CYCLE_NAMES: Record<BiomeId, string> = { natal: 'natal', ...BIOME_NAMES };
/** El ciclo de `biome` en la vuelta `lap` de cada viaje (null si esa vuelta no llegó a él). */
const cyclesOf = (
  journeys: readonly (readonly Journey[])[],
  lap: number,
  biome: BiomeId,
): (CycleLeg | null)[] => journeys.flat().map((j) => j.laps[lap]?.find((c) => c.biome === biome) ?? null);
const cycleTime = (cycles: readonly (CycleLeg | null)[]): number | null => {
  const times = cycles.map((c) => c?.time ?? null);
  return times.every((t) => t !== null) ? median(present(times)) : null;
};
for (const biome of BIOME_IDS) {
  const cycles = cyclesOf(winds, 0, biome);
  const label = `Ciclo libre, primera vuelta, ${CYCLE_NAMES[biome]}`;
  const medians = cycleRunMedians(cycles);
  metrics.push({
    name: `${label}: partidas hasta cumplirlo (todas)`,
    target: '20–35 min',
    values: cycles.flatMap((c) => c?.runs ?? [null]),
    format: clock,
    pass: (m) => m >= 20 * 60 && m <= 35 * 60,
  });
  metrics.push({
    name: `${label}: partida más corta (mediana por partida)`,
    target: '≥ 10 min',
    values: [medians.length > 0 ? Math.min(...medians) : null],
    format: clock,
    pass: (m) => m >= 600,
  });
  metrics.push({
    name: `${label}: partida más larga (mediana por partida)`,
    target: '≤ 60 min',
    values: [longestCycleRun(cycles)],
    format: clock,
    pass: (m) => m <= 3600,
  });
  metrics.push({
    name: `${label}: ciclo`,
    target: '2–4 h',
    values: cycles.map((c) => c?.time ?? null),
    format: hours,
    pass: (m) => m >= 2 * 3600 && m <= 4 * 3600,
  });
}
for (const biome of BIOME_IDS) {
  metrics.push({
    name: `Ciclo libre, régimen estable, ${CYCLE_NAMES[biome]}: partidas hasta cumplirlo (todas)`,
    target: '15–35 min',
    values: cyclesOf(stables, 1, biome).flatMap((c) => c?.runs ?? [null]),
    format: clock,
    pass: (m) => m >= 15 * 60 && m <= 35 * 60,
  });
}
/**
 * Lo del régimen estable que vale para el peor bioma: una fila por métrica con un valor por bioma,
 * y cada uno debe cumplir (`every`). La partida más corta no cuenta la que cumple la meta: termina
 * al llegar a 500 y dura lo que falte, no lo que pide la regla de §17 (en el prototipo, de 5 a 40
 * min); las demás siguen el suelo de 10 min de los tramos.
 */
const perStableBiome = (value: (biome: BiomeId) => number | null): (number | null)[] =>
  BIOME_IDS.map((biome) => value(biome));
const stableLabel = 'Ciclo libre, régimen estable (el peor bioma)';
metrics.push({
  name: `${stableLabel}: partida más corta sin la que cumple la meta (mediana por partida)`,
  target: '≥ 10 min',
  values: perStableBiome((biome) => {
    const medians = cycleRunMedians(cyclesOf(stables, 1, biome), true);
    return medians.length > 0 ? Math.min(...medians) : null;
  }),
  format: clock,
  pass: (m) => m >= 600,
  every: true,
});
metrics.push({
  name: `${stableLabel}: partida más larga (mediana por partida)`,
  target: '≤ 60 min',
  values: perStableBiome((biome) => longestCycleRun(cyclesOf(stables, 1, biome))),
  format: clock,
  pass: (m) => m <= 3600,
  every: true,
});
metrics.push({
  name: `${stableLabel}: ciclo`,
  target: '≤ 3,5 h',
  values: perStableBiome((biome) => cycleTime(cyclesOf(stables, 1, biome))),
  format: hours,
  pass: (m) => m <= 3.5 * 3600,
  every: true,
});
// La deriva acota cuánto se acortan los ciclos al terminar las adaptaciones de bioma: no se fija a
// un valor medido sino a la mitad de la primera vuelta (en el prototipo, el Chocó quedaba en 0,52).
metrics.push({
  name: `${stableLabel}: deriva, ciclo estable ÷ ciclo de la primera vuelta`,
  target: '≥ 0,5',
  values: perStableBiome((biome) => {
    const first = cycleTime(cyclesOf(winds, 0, biome));
    const stable = cycleTime(cyclesOf(stables, 1, biome));
    return first !== null && stable !== null && first > 0 ? stable / first : null;
  }),
  format: (v) => (v === null ? '—' : v.toFixed(2)),
  pass: (m) => m >= 0.5,
  every: true,
});
metrics.push({
  name: `${stableLabel}: esporas netas por ciclo (las ganadas menos las ${SOW_COST} de sembrar)`,
  target: '> 0',
  values: perStableBiome((biome) => {
    const spores = present(cyclesOf(stables, 1, biome).map((c) => c?.spores ?? null));
    return spores.length > 0 ? median(spores) - SOW_COST : null;
  }),
  format: (v) => (v === null ? '—' : String(Math.round(v))),
  pass: (m) => m > 0,
  every: true,
});
metrics.push({
  name: 'Ciclo libre: esporas sin gastar tras El regreso y la primera vuelta, sobre las ganadas en toda la campaña',
  target: '< 50 %',
  values: winds
    .flat()
    .map((w) =>
      w.laps[0]?.length === LAP_BASE.length && w.earnedSpores > 0
        ? w.state.spores.available / w.earnedSpores
        : null,
    ),
  format: (v) => (v === null ? '—' : `${Math.round(v * 100)} %`),
  pass: (m) => m < 0.5,
});

// Votos (fase 10, bloque B). Cada combinación se compara con el ciclo sin votos del mismo bioma,
// semilla a semilla y desde el mismo estado; la fila da la mediana de esas razones.
const VOW_NAMES: Record<VowId, string> = {
  noRain: 'sin lluvia',
  autoOnly: 'solo autocompra',
  noMutations: 'sin mutaciones',
};
const vowNames = (vows: readonly VowId[]): string =>
  vows.length === 0 ? 'sin votos' : vows.map((v) => VOW_NAMES[v]).join(' + ');
const percent = (v: number): string => `${Math.round(v * 100)} %`;
/** Los ciclos de un caso en cada semilla; null si alguna semilla no lo cumplió (no se mide a medias). */
const vowCyclesOf = (
  results: readonly (readonly VowCycle[])[],
  cases: readonly VowCase[],
  c: VowCase,
): VowCycle[] | null => {
  const index = cases.indexOf(c);
  const cycles = results.map((bySeed) => bySeed[index]);
  return cycles.every((cycle): cycle is VowCycle => cycle !== undefined && cycle.time !== null)
    ? cycles
    : null;
};
const baseCase = (cases: readonly VowCase[], biome: BiomeId): VowCase | undefined =>
  cases.find((c) => c.biome === biome && c.vows.length === 0);
/** Mediana, entre semillas, del ciclo con votos ÷ el ciclo sin votos de la misma semilla. */
const vowRatio = (
  results: readonly (readonly VowCycle[])[],
  cases: readonly VowCase[],
  c: VowCase,
): number | null => {
  const base = baseCase(cases, c.biome);
  const withVows = vowCyclesOf(results, cases, c);
  const without = base ? vowCyclesOf(results, cases, base) : null;
  if (!withVows || !without) return null;
  return median(withVows.map((cycle, i) => (cycle.time ?? 0) / (without[i]?.time ?? Number.NaN)));
};
const vowRuns = (
  results: readonly (readonly VowCycle[])[],
  cases: readonly VowCase[],
  c: VowCase,
): number | null => {
  const cycles = vowCyclesOf(results, cases, c);
  return cycles ? median(cycles.flatMap((cycle) => cycle.runs)) : null;
};
/** Los casos de un voto suelto, agrupados por bioma y voto (los tres umbrales de «solo autocompra» juntos). */
const singleVowGroups = BIOME_IDS.flatMap((biome) =>
  offeredVows(biome).map((vow) => ({
    biome,
    vow,
    cases: SINGLE_VOW_CASES.filter((c) => c.biome === biome && sameVows(c.vows, [vow])),
  })),
);
/** El caso con el umbral de partida: el que tiene quien no lo ha cambiado. */
const atDefault = (cases: readonly VowCase[]): VowCase | undefined =>
  cases.find((c) => c.threshold === DEFAULT_THRESHOLD) ?? cases[0];
const worstOf = (
  values: readonly (number | null)[],
  pick: (a: number, b: number) => number,
): number | null =>
  values.some((v) => v === null) ? null : values.reduce<number>((a, v) => pick(a, v ?? 0), values[0] ?? 0);
const firstLabel = `Votos, primera siembra tras El regreso (un voto, ${singleVowGroups.length} combinaciones; «solo autocompra» con el umbral de partida, ${percent(DEFAULT_THRESHOLD)})`;
// La especificación pedía ≤ 45 min, sin medir. Desde El regreso recién cumplido, sin votos, las partidas
// de la pradera y la tundra ya duran 39–40 min (aún faltan casi todas las adaptaciones de bioma), y un
// voto que no acorte el régimen estable (≥ 1,0×) las alarga más de un 12 %: «solo autocompra» en la
// tundra llega a 48:46 con el estable en 1,04×, y con el factor que bajaba sus partidas a 43:21 el
// estable caía a 0,93× (el voto acortaba el ciclo). Manda que ningún voto acorte; el tope sigue lejos
// de la hora que marca el muro.
metrics.push({
  name: `${firstLabel}: partidas hasta cumplirlo (todas, mediana), la peor combinación`,
  target: '≤ 50 min',
  values: singleVowGroups.map((g) => {
    const c = atDefault(g.cases);
    return c ? vowRuns(vowFirst, SINGLE_VOW_CASES, c) : null;
  }),
  format: clock,
  pass: (m) => m <= 50 * 60,
  every: true,
});
metrics.push({
  name: `${firstLabel}: ciclo frente a sin votos, la peor combinación`,
  target: '≤ 2,5 ×',
  values: singleVowGroups.map((g) => {
    const c = atDefault(g.cases);
    return c ? vowRatio(vowFirst, SINGLE_VOW_CASES, c) : null;
  }),
  format: (v) => (v === null ? '—' : `${v.toFixed(2)} ×`),
  pass: (m) => m <= 2.5,
  every: true,
});
const stableVowLabel = `Votos, régimen estable (un voto, ${singleVowGroups.length} combinaciones)`;
metrics.push({
  name: `${stableVowLabel}: ciclo frente a sin votos, la peor; «solo autocompra» con el umbral más rápido de los tres (ningún voto acorta el ciclo)`,
  target: '≥ 1,0 ×',
  values: singleVowGroups.map((g) =>
    worstOf(
      g.cases.map((c) => vowRatio(vowStable, STABLE_VOW_CASES, c)),
      Math.min,
    ),
  ),
  format: (v) => (v === null ? '—' : `${v.toFixed(2)} ×`),
  pass: (m) => m >= 1,
  every: true,
});
metrics.push({
  name: `${stableVowLabel}: ciclo frente a sin votos, la peor; «solo autocompra» con el umbral más lento de los tres`,
  target: '≤ 2,25 ×',
  values: singleVowGroups.map((g) =>
    worstOf(
      g.cases.map((c) => vowRatio(vowStable, STABLE_VOW_CASES, c)),
      Math.max,
    ),
  ),
  format: (v) => (v === null ? '—' : `${v.toFixed(2)} ×`),
  pass: (m) => m <= 2.25,
  every: true,
});
const allVowsLabel = `Votos, los tres juntos, régimen estable (${ALL_VOWS_BIOMES.length} biomas; «solo autocompra» con el umbral más lento de los tres)`;
const allVowsCasesOf = (biome: BiomeId): VowCase[] => ALL_VOWS_CASES.filter((c) => c.biome === biome);
metrics.push({
  name: `${allVowsLabel}: ciclo frente a sin votos, el peor bioma`,
  target: '≤ 3 ×',
  values: ALL_VOWS_BIOMES.map((biome) =>
    worstOf(
      allVowsCasesOf(biome).map((c) => vowRatio(vowStable, STABLE_VOW_CASES, c)),
      Math.max,
    ),
  ),
  format: (v) => (v === null ? '—' : `${v.toFixed(2)} ×`),
  pass: (m) => m <= 3,
  every: true,
});
// Por semilla y bioma, el ciclo más largo de los tres umbrales; uno que no se cumplió no cuenta.
const allVowsTimes = ALL_VOWS_BIOMES.flatMap((biome) =>
  vowStable.map((bySeed) => {
    const times = allVowsCasesOf(biome).map((c) => bySeed[STABLE_VOW_CASES.indexOf(c)]?.time ?? null);
    return times.every((t) => t !== null) ? Math.max(...present(times)) : null;
  }),
);
metrics.push({
  name: `${allVowsLabel}: semillas que lo cumplen en ≤ ${ALL_VOWS_MAX_SECONDS / 3600} h`,
  target: `${allVowsTimes.length} de ${allVowsTimes.length}`,
  values: [allVowsTimes.filter((t) => t !== null && t <= ALL_VOWS_MAX_SECONDS).length],
  format: (v) => (v === null ? '—' : `${v} de ${allVowsTimes.length}`),
  pass: (m) => m === allVowsTimes.length,
});
metrics.push({
  name: `${allVowsLabel}: partidas hasta cumplirlo (todas, mediana), el peor bioma`,
  target: '≤ 60 min',
  values: ALL_VOWS_BIOMES.map((biome) =>
    worstOf(
      allVowsCasesOf(biome).map((c) => vowRuns(vowStable, STABLE_VOW_CASES, c)),
      Math.max,
    ),
  ),
  format: clock,
  pass: (m) => m <= 3600,
  every: true,
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
/** El regreso en cada orden (fase 10). */
const returnTable = [
  '| Orden | Partidas hasta cumplirlo (mediana de cada una) | Todas (mediana) | Cumplirlo | Nivel al cumplirlo | Acumulado |',
  '| ----- | ---------------------------------------------- | --------------- | --------- | ------------------ | --------- |',
];
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
/** Perfil ausente con cada ausencia (fase 10): sesiones y días hasta colonizar, mediana y rango. */
const absentTable = [
  `| Horas fuera | ${ABSENT_BIOMES.map((b) => `${capital(BIOME_NAMES[b])}: sesiones | ${capital(BIOME_NAMES[b])}: días`).join(' | ')} |`,
  `| ----------- | ${ABSENT_BIOMES.map(() => '--- | ---').join(' | ')} |`,
];
for (const awayHours of ABSENT_HOURS) {
  const cells = ABSENT_BIOMES.map((biome) => {
    const sessions = present(
      (absents[ABSENT_BIOMES.indexOf(biome)]?.[ABSENT_HOURS.indexOf(awayHours)] ?? []).map((r) => r.sessions),
    );
    const d = present(absentOf(biome, awayHours));
    const range = (v: number[], f: (x: number) => string): string =>
      v.length === 0 ? '—' : `${f(median(v))} (${f(Math.min(...v))}–${f(Math.max(...v))})`;
    return `${range(sessions, String)} | ${range(d, (x) => days(x))}`;
  });
  absentTable.push(`| ${awayHours} h | ${cells.join(' | ')} |`);
}
/** Una fila de la tabla del viaje: el tramo `leg` de los viajes `results`. */
function windRow(name: string, biome: DestinationId, results: readonly Journey[], leg: number): string {
  const perRun = legRunMedians(results, leg).map(clock).join(', ');
  const all = results.flatMap((w) => w.legs[leg]?.runs ?? []);
  const colonize = results
    .map((w) => w.legs[leg]?.colonizeTime)
    .filter((v): v is number => typeof v === 'number');
  const levels = results.map((w) => w.legs[leg]?.levelAtColonize).filter((v): v is number => v !== undefined);
  const cumulative = results.map((w) => w.legs[leg]?.cumulative).filter((v): v is number => v !== undefined);
  return `| ${name} | ${BIOME_NAMES[biome]} | ${perRun} | ${clock(median(all))} | ${hours(median(colonize))} | ${Math.round(median(levels))} | ${hours(median(cumulative))} |`;
}
PREFIXES.forEach((prefix, p) => {
  prefix.forEach((biome, leg) => windTable.push(windRow(orderName(prefix), biome, prefixes[p] ?? [], leg)));
});
ORDERS.forEach((order, o) => {
  const results = winds[o] ?? [];
  order.forEach((biome, leg) => {
    if (leg < PREFIX_LEGS) return;
    windTable.push(windRow(orderName(order), biome, results, leg));
  });
  const home = results.map((w) => w.homecoming).filter((h) => h !== null);
  const closed = present(home.map((h) => h.closeTime));
  returnTable.push(
    `| ${orderName(order)} | ${
      runMedians(home.map((h) => h.runs))
        .map(clock)
        .join(', ') || '—'
    } | ${clock(median(home.flatMap((h) => h.runs)))} | ${hours(median(closed))} | ${Math.round(median(home.map((h) => h.levelAtClose)))} | ${hours(median(home.map((h) => h.cumulative)))} |`,
  );
});
/** El ciclo libre por bioma (fase 10): la primera vuelta y el régimen estable. */
const cycleTable = [
  '| Bioma | R | Requisito | Vuelta | Espera para sembrar (mediana, ciclos) | Partidas desde la siembra (mediana de cada una) | Todas (mediana) | Ciclo | Esporas por ciclo |',
  '| ----- | - | --------- | ------ | ------------------------------------- | ----------------------------------------------- | --------------- | ----- | ----------------- |',
];
for (const biome of BIOME_IDS) {
  const def = getBiome(biome);
  (
    [
      ['primera', cyclesOf(winds, 0, biome)],
      ['estable', cyclesOf(stables, 1, biome)],
    ] as const
  ).forEach(([lap, cycles]) => {
    const played = cycles.filter((c): c is CycleLeg => c !== null);
    const wait = waitRunMedian(cycles);
    const waited = played.filter((c) => c.waits > 0).length;
    cycleTable.push(
      `| ${capital(CYCLE_NAMES[biome])} | ${fmt(def.cycleScale)} | ${def.cycleRequirement} R | ${lap} | ${
        wait === null ? '—' : `${clock(wait)} (${waited} de ${cycles.length})`
      } | ${cycleRunMedians(cycles).map(clock).join(', ') || '—'} | ${clock(median(played.flatMap((c) => c.runs)))} | ${hours(median(present(played.map((c) => c.time))))} | ${Math.round(median(played.map((c) => c.spores)))} |`,
    );
  });
}

/** La matriz de votos (fase 10, bloque B): cada combinación y umbral, en la primera siembra y en el estable. */
const vowTable = [
  '| Bioma | Votos | Umbral | Factor de R | Primera siembra: ciclo | Partidas (mediana) | Frente a sin votos | Estable: ciclo | Partidas (mediana) | Frente a sin votos | Esporas por ciclo |',
  '| ----- | ----- | ------ | ----------- | ---------------------- | ------------------ | ------------------ | -------------- | ------------------ | ------------------ | ----------------- |',
];
for (const c of STABLE_VOW_CASES) {
  const first = SINGLE_VOW_CASES.includes(c) ? vowCyclesOf(vowFirst, SINGLE_VOW_CASES, c) : null;
  const stable = vowCyclesOf(vowStable, STABLE_VOW_CASES, c);
  const ratio = (v: number | null): string => (v === null ? '—' : `${v.toFixed(2)} ×`);
  const cycleOf = (cycles: VowCycle[] | null): string =>
    cycles ? hours(median(present(cycles.map((cycle) => cycle.time)))) : '—';
  vowTable.push(
    `| ${capital(CYCLE_NAMES[c.biome])} | ${vowNames(c.vows)} | ${c.vows.includes('autoOnly') ? percent(c.threshold) : '—'} | ${vowGoalFactor(c.biome, c.vows).toFixed(3)} | ${cycleOf(first)} | ${clock(first ? vowRuns(vowFirst, SINGLE_VOW_CASES, c) : null)} | ${c.vows.length > 0 && first ? ratio(vowRatio(vowFirst, SINGLE_VOW_CASES, c)) : '—'} | ${cycleOf(stable)} | ${clock(vowRuns(vowStable, STABLE_VOW_CASES, c))} | ${c.vows.length > 0 ? ratio(vowRatio(vowStable, STABLE_VOW_CASES, c)) : '—'} | ${stable ? Math.round(median(stable.map((cycle) => cycle.spores))) : '—'} |`,
  );
}

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

/** Cuántos, en palabras, en las frases del informe. */
const COUNT_WORDS = ['ningún', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho'];
const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);
const journeyShape =
  `los ${countWord(DESTINATION_IDS.length)} destinos, El regreso y dos vueltas del ciclo libre, en los ${countWord(ORDERS.length)} órdenes` +
  (HAS_BRANCHES
    ? ' que permiten los anillos (el primero entero y en cualquier orden antes del segundo; cada orden del primero se juega una vez por semilla y se ramifica, sobre copias, en los del segundo)'
    : '');

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
  `_Generado por \`npm run sim\` (${SEEDS.length} semillas por escenario, pasos de 1 s, ${(elapsedMs / 1000).toFixed(1)} s de cómputo ${workers === 0 ? 'en el hilo principal' : `en ${workers} ${workers === 1 ? 'hilo' : 'hilos'}`}). No editar a mano entre estas marcas._`,
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
  `Natal hasta el Acto I y después ${journeyShape}; mediana de ${SEEDS.length} semillas. El bot dispersa al empezar partida, compra al llegar las adaptaciones de bioma abiertas y, entre partidas, mutaciones y adaptaciones guardando ${DISPERSE_COST} esporas para el viaje en cuanto el bosque está colonizado y hay algo por delante (otro destino o El regreso) y, en el ciclo libre, para la siembra siguiente. Durante El regreso no guarda nada: la primera siembra puede esperar una partida.`,
  '',
  ...windTable,
  '',
  `Perfil ausente (sesiones de ${ABSENT_SESSION_MINUTES} min del perfil activo y luego H horas fuera, cobradas como al cargar la partida; tercer destino tras ${orderName(PREFIXES[0] ?? [])}): sesiones y días hasta colonizar, mediana de ${SEEDS.length} semillas y rango. Los días son las ausencias por sus horas; las de 24 y 48 h son objetivo.`,
  '',
  ...absentTable,
  '',
  `El regreso (fase 10): tras el cuarto bioma, el bot vuelve al natal al empezar partida y juega hasta el nivel 500 con R ${fmt(getBiome('natal').cycleScale)} y un requisito de ${getBiome('natal').cycleRequirement} R. En el tramo 5 esporula también cuando la ganancia lleva el nivel a 500 (la regla de la meta). Mediana de ${SEEDS.length} semillas:`,
  '',
  ...returnTable,
  '',
  `Ciclo libre (fase 10): tras El regreso, el bot siembra al empezar partida los cinco biomas seguidos, sin votos, por ${SOW_COST} esporas, y juega cada uno hasta el nivel 500 con la R fija del bioma y su requisito (en múltiplos de R), con la regla de la meta. La vuelta empieza en un bioma distinto en cada orden del viaje (${ORDERS.map(
    (order, o) =>
      `${orderName(order)}: ${lapOf(o)
        .map((b) => CYCLE_NAMES[b])
        .join(', ')}`,
  ).join(
    '; ',
  )}); cada fila es la mediana de las cuatro apariciones del bioma por las ${SEEDS.length} semillas. El régimen estable vuelve a jugar la misma vuelta sobre una copia, con las adaptaciones de bioma al máximo. Una partida de espera para pagar la siembra, si la hay, cuenta en el ciclo siguiente y en su partida más larga, pero va en su columna: las medianas de cada partida se cuentan desde la siembra, para que la n-ésima de cada ciclo se compare con la n-ésima de los demás.`,
  '',
  ...cycleTable,
  '',
  `Votos (fase 10, bloque B): sobre el orden ${orderName(ORDERS[0] ?? [])}, el bot siembra cada combinación desde El regreso recién cumplido (la primera siembra, sin encadenar biomas) y, aparte, desde el final de su primera vuelta con las adaptaciones de bioma al máximo (el régimen estable), y la compara con el ciclo sin votos del mismo bioma desde el mismo estado, semilla a semilla. La R del ciclo es la del bioma por el factor de cada voto. Con «sin mutaciones» despierta las dormidas en el orden de la tabla en cuanto alcanzan las esporas del ciclo; con «solo autocompra» no compra él y la autocompra usa el umbral de la fila (la Poda no rige con el voto); con «sin lluvia» no cae ninguna gota. Mediana de ${SEEDS.length} semillas:`,
  '',
  ...vowTable,
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

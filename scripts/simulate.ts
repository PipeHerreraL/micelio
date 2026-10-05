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
import { DESTINATION_IDS, type DestinationId } from '../src/data/biomes.ts';
import { GENERATORS, type GeneratorId } from '../src/data/generators.ts';
import { UPGRADES } from '../src/data/upgrades.ts';
import { fmt, setLocale, setNotation } from '../src/i18n/index.ts';
import {
  AFTER_RUNS,
  journeyPlan,
  startJourney,
  type CampaignResult,
  type Journey,
  type RunRecord,
} from './sim-play.ts';
import { createPool, poolSize, type SimPool } from './sim-pool.ts';
import { SEEDS, clock, hours, median, present, row, writeBlock, type Metric } from './sim-report.ts';

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
  const windRuns = prefixRuns.flatMap((prefixes) =>
    BRANCHES.map((path) =>
      Promise.all(
        prefixes.map(async (prefix) =>
          HAS_BRANCHES ? pool.run({ kind: 'journey', journey: await prefix, path, finish: true }) : prefix,
        ),
      ),
    ),
  );
  // Regla del mejor ritmo, informativa: natal y primer bioma (taiga), sin perfil pasivo.
  const rateRuns = perSeed(async (seed) => {
    const natal = await pool.run({ kind: 'natal', seed, policy: 'rate' });
    const journey = startJourney(natal, 'rate', false);
    const wind = await pool.run({ kind: 'journey', journey, path: ['taiga'], finish: false });
    return { actOneAt: natal.actOneAt, wind };
  });
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
  const [natals, prefixes, winds, rateJourneys, longDoubling, longRate, campaigns, active, passive] =
    await Promise.all([
      Promise.all(natalRuns),
      Promise.all(prefixRuns.map((runs) => Promise.all(runs))),
      Promise.all(windRuns),
      rateRuns,
      longDoublingRuns,
      longRateRuns,
      campaignRuns,
      activeRuns,
      passiveRuns,
    ]);
  return { active, passive, campaigns, longDoubling, longRate, natals, prefixes, winds, rateJourneys };
}

const started = performance.now();
const workers = poolSize();
const pool = createPool(workers);
const { active, passive, campaigns, longDoubling, longRate, natals, prefixes, winds, rateJourneys } =
  await playAll(pool).finally(() => pool.close());

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
metrics.push({
  name: 'Viento: partidas de espera para pagar un viaje (tras el Acto I o tras colonizar)',
  target: '≤ 1',
  values: winds.flat().map((w, i) => Math.max(natals[i % natals.length]?.waitRuns ?? 0, ...w.waits)),
  format: (v) => (v === null ? '—' : String(v)),
  pass: (m) => m <= 1,
});
/** Mediana entre semillas de la partida i de un tramo (solo las semillas que la jugaron). */
const legRunMedians = (results: readonly Journey[], leg: number): number[] => {
  const longest = Math.max(0, ...results.map((w) => w.legs[leg]?.runs.length ?? 0));
  const out: number[] = [];
  for (let i = 0; i < longest; i += 1) {
    const values = results.map((w) => w.legs[leg]?.runs[i]).filter((v): v is number => v !== undefined);
    // Una partida que solo jugaron una o dos semillas no dice nada de la mediana.
    if (values.length * 2 >= results.length) out.push(median(values));
  }
  return out;
};
// Tramos del primer anillo: los de cada prefijo, que se juegan una vez por semilla y sirven a todas
// sus ramas. Son los 16 objetivos de la 1.3–1.5, con sus mismos nombres.
PREFIXES.forEach((prefix, p) => {
  const results = prefixes[p] ?? [];
  prefix.forEach((biome, leg) => {
    const label = `Viento ${orderName(prefix)}, ${BIOME_NAMES[biome]} (${ordinal(leg)} destino)`;
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
  values: winds.flat().map((w) => (w.earnedAtColonize > 0 ? w.unspent / w.earnedAtColonize : null)),
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
/**
 * Tramos del segundo anillo (fase 10), informativos hasta que lleguen las adaptaciones de la
 * pradera y la tundra: con ellas pasan a objetivo, con estas columnas.
 */
const ringTwoTable = [
  '| Orden | Bioma | Partidas (todas, mediana) | Más corta | Más larga | Colonizar | Pasivo |',
  '| ----- | ----- | ------------------------- | --------- | --------- | --------- | ------ |',
];
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
    const medians = legRunMedians(results, leg);
    const colonize = present(results.map((w) => w.legs[leg]?.colonizeTime ?? null));
    const passive = present(
      results.map((w) => {
        const l = w.legs[leg];
        return l?.passiveTime && l.colonizeTime ? l.passiveTime / l.colonizeTime : null;
      }),
    );
    const colonized = `${colonize.length} de ${results.length}`;
    ringTwoTable.push(
      `| ${orderName(order)} | ${BIOME_NAMES[biome]} (${ordinal(leg)} destino) | ${clock(median(results.flatMap((w) => w.legs[leg]?.runs ?? [])))} | ${clock(medians.length > 0 ? Math.min(...medians) : null)} | ${clock(medians.length > 0 ? Math.max(...medians) : null)} | ${hours(median(colonize))} (${colonized}) | ${passive.length > 0 ? `${median(passive).toFixed(2)} ×` : '—'} |`,
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

/** Cuántos, en palabras, en las frases del informe. */
const COUNT_WORDS = ['ningún', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho'];
const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);
const journeyShape =
  `los ${countWord(DESTINATION_IDS.length)} destinos, en los ${countWord(ORDERS.length)} órdenes` +
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
  `Natal hasta el Acto I y después ${journeyShape}; mediana de ${SEEDS.length} semillas. El bot dispersa al empezar partida, compra al llegar las adaptaciones de bioma abiertas y, entre partidas, mutaciones y adaptaciones guardando 300 esporas para el viaje cuando hay destino por delante.`,
  '',
  ...windTable,
  '',
  `Tramos del segundo anillo (informativos hasta que lleguen las adaptaciones de la pradera y la tundra; sus objetivos serán: partidas de 20–33 min, la más corta ≥ 10 min, la más larga ≤ 60 min, colonizar en 2–3,5 h y el pasivo ≤ 2,5 × el activo). «Más corta» y «más larga» son medianas por partida; entre paréntesis, las semillas que colonizaron.`,
  '',
  ...ringTwoTable,
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

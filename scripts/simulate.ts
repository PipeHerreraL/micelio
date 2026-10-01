/**
 * Simulador de balance (PROMPT.md §17). Juega partidas completas sin interfaz con las
 * mismas fórmulas del juego (importa src/core, src/data y src/systems; nada de copias),
 * avanza el tiempo a pasos de 1 s y escribe los resultados en docs/BALANCE.md, entre las
 * marcas `<!-- sim:start -->` y `<!-- sim:end -->`. El resto del archivo (notas de cambios)
 * se conserva.
 *
 * Uso: npm run sim
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  buyGenerator,
  buyMutation,
  buyUpgrade,
  click,
  canSporulate,
  sporeGain,
  sporulate,
} from '../src/core/actions.ts';
import {
  availableUpgrades,
  isGeneratorUnlocked,
  previewGenerator,
  previewUpgrade,
  quoteGenerator,
} from '../src/core/economy.ts';
import { drain } from '../src/core/events.ts';
import * as num from '../src/core/num.ts';
import { derived } from '../src/core/selectors.ts';
import { createState, hasMutation, type GameState } from '../src/core/state.ts';
import { tick } from '../src/core/tick.ts';
import { GENERATORS, type GeneratorId } from '../src/data/generators.ts';
import { MUTATIONS } from '../src/data/mutations.ts';
import { SPORULATE_REQUIREMENT } from '../src/data/prestige.ts';
import { UPGRADES } from '../src/data/upgrades.ts';
import { catchDrop } from '../src/systems/rain.ts';
import { fmt, setLocale, setNotation } from '../src/i18n/index.ts';

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

type Candidate =
  { kind: 'generator'; id: GeneratorId; cost: number } | { kind: 'upgrade'; id: string; cost: number };

/**
 * Elige la compra con menor suma de espera hasta poder pagarla y amortización
 * (coste ÷ aumento de ingresos por segundo, clic incluido).
 */
function bestCandidate(state: GameState, cps: number): Candidate | null {
  const d = derived(state);
  const income = num.toNumber(d.production) + cps * num.toNumber(d.clickValue);
  let best: Candidate | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const consider = (candidate: Candidate, gainProduction: number, gainClick: number): void => {
    const gain = gainProduction + cps * gainClick;
    if (!(gain > 0)) return;
    const missing = Math.max(0, candidate.cost - num.toNumber(state.nutrients));
    const wait = missing === 0 ? 0 : income > 0 ? missing / income : Number.POSITIVE_INFINITY;
    const score = wait + candidate.cost / gain;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  };
  for (const def of GENERATORS) {
    if (!isGeneratorUnlocked(state, def)) continue;
    const cost = num.toNumber(quoteGenerator(state, def.id, 1).cost);
    const gain = previewGenerator(state, def.id, 1);
    consider(
      { kind: 'generator', id: def.id, cost },
      num.toNumber(gain.production),
      num.toNumber(gain.click),
    );
  }
  for (const upgrade of availableUpgrades(state)) {
    const gain = previewUpgrade(state, upgrade.id);
    consider(
      { kind: 'upgrade', id: upgrade.id, cost: upgrade.cost },
      num.toNumber(gain.production),
      num.toNumber(gain.click),
    );
  }
  return best;
}

/** Compra mientras la mejor opción sea pagable ahora mismo. */
function shop(state: GameState, cps: number): void {
  for (let guard = 0; guard < 500; guard += 1) {
    const best = bestCandidate(state, cps);
    if (!best || num.lt(state.nutrients, best.cost)) return;
    if (best.kind === 'generator') buyGenerator(state, { id: best.id, amount: 1 });
    else buyUpgrade(state, { id: best.id });
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
  /** Tiempo acumulado (s) hasta el primer Gigante de Malheur. */
  firstMalheurAt: number | null;
  maxValue: number;
}

interface RunOptions {
  profile: Profile;
  /** Cuándo termina la partida: al poder esporular (partida suelta) o según la campaña. */
  stopWhen: 'available' | 'campaign';
  maxSeconds: number;
  elapsedBefore: number;
  onMalheur?: (cumulative: number) => void;
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

    if (record.sporulateAvailableAt === null && num.gte(state.runEarned, SPORULATE_REQUIREMENT)) {
      record.sporulateAvailableAt = t + 1;
      if (options.stopWhen === 'available') {
        record.duration = t + 1;
        record.sporesGained = sporeGain(state);
        return record;
      }
    }
    if (options.stopWhen === 'campaign' && canSporulate(state)) {
      const gain = sporeGain(state);
      // La campaña esporula cuando la ganancia es al menos max(10, nivel actual).
      if (gain >= Math.max(10, state.spores.level)) {
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
function campaign(seed: number, sporulations: number): CampaignResult {
  const state = newGame(seed);
  const runs: RunRecord[] = [];
  let elapsed = 0;
  let firstMalheurAt: number | null = null;
  let maxValue = 0;
  for (let i = 0; i < sporulations; i += 1) {
    const run = playRun(state, {
      profile: PROFILES.active,
      stopWhen: 'campaign',
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
  }
  return { runs, firstMalheurAt, maxValue };
}

// ---------------------------------------------------------------------------------------
// Estadística y formato

const SEEDS = [11, 23, 37, 41, 53, 67, 79, 83, 97];

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return Number.NaN;
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? Number.NaN)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function clock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
}

function hours(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  return `${(seconds / 3600).toFixed(2)} h`;
}

interface Metric {
  name: string;
  target: string;
  values: (number | null)[];
  format: (v: number | null) => string;
  pass: (median: number) => boolean;
}

function present(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null && Number.isFinite(v));
}

function row(metric: Metric): { line: string; ok: boolean } {
  const values = present(metric.values);
  const m = median(values);
  const ok = values.length === metric.values.length && metric.pass(m);
  const range =
    values.length > 0 ? `${metric.format(Math.min(...values))}–${metric.format(Math.max(...values))}` : '—';
  return {
    line: `| ${metric.name} | ${metric.target} | ${metric.format(m)} | ${range} | ${ok ? 'cumple' : '**no cumple**'} |`,
    ok,
  };
}

// ---------------------------------------------------------------------------------------
// Corridas

const started = performance.now();
const active = SEEDS.map((seed) => firstRun(seed, PROFILES.active));
const passive = SEEDS.map((seed) => firstRun(seed, PROFILES.passive));
const campaigns = SEEDS.map((seed) => campaign(seed, 10));

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

const generatorTable = [
  '| # | Generador | Coste base (N) | Producción base (N/s) | Desbloqueo |',
  '| - | --------- | -------------- | --------------------- | ---------- |',
  ...GENERATORS.map(
    (g, i) =>
      `| ${i + 1} | \`${g.id}\` | ${fmt(g.baseCost)} | ${fmt(g.baseProduction)} | ${g.unlock.kind === 'always' ? 'inicio' : g.unlock.kind === 'sporulations' ? `${g.unlock.count} esporulación` : `mutación \`${g.unlock.id}\``} |`,
  ),
];

const upgradeCount = UPGRADES.length;

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
  '### Generadores',
  '',
  ...generatorTable,
  '',
  `Mejoras: ${upgradeCount} (40 de generador y 10 de clic, globales y sinergias), ver \`src/data/upgrades.ts\`.`,
  '',
  '<!-- sim:end -->',
].join('\n');

const path = new URL('../docs/BALANCE.md', import.meta.url);
let doc: string;
try {
  doc = readFileSync(path, 'utf8');
} catch {
  doc = '# Balance\n\n<!-- sim:start -->\n<!-- sim:end -->\n';
}
const startMark = doc.indexOf('<!-- sim:start -->');
const endMark = doc.indexOf('<!-- sim:end -->');
const next =
  startMark >= 0 && endMark > startMark
    ? doc.slice(0, startMark) + block + doc.slice(endMark + '<!-- sim:end -->'.length)
    : `${doc.trimEnd()}\n\n${block}\n`;
writeFileSync(path, next);

console.log(rows.map((r) => r.line).join('\n'));
console.log(
  `Techo: ${fmt(maxValue)} · ${rows.filter((r) => r.ok).length}/${rows.length} objetivos · ${elapsedMs} ms`,
);

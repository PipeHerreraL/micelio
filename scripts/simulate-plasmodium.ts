/**
 * Simulador del plasmodio (docs/ROADMAP.md, fase 9). Juega las cinco placas con el código del
 * juego (el modelo de src/partners/plasmodium/ registrado a mano, el mismo pegamento que main.ts:
 * advancePartners cada segundo) y escribe los resultados en docs/BALANCE.md entre
 * `<!-- sim:plasmodio:start -->` y `<!-- sim:plasmodio:end -->`.
 *
 * Perfiles (todos compran igual; difieren en pulsos, en cómo colocan y en si abren la placa
 * siguiente al momento):
 * - activo: coloca con el bot (previsualiza cada sitio 150 pasos; elige entre los 3 mejores con el
 *   azar de la semilla), da un pulso cada 3 s y abre la placa siguiente al fructificar;
 * - pasivo: el mismo bot, pulsos solo el primer minuto, y deja que la placa siguiente se abra sola;
 * - ingenuo: coloca al azar y solo prueba otra colocación si en 10 min no cumple (un jugador sin
 *   Quimiotaxis que no estudia la red), con los pulsos del activo.
 *
 * Además comprueba que 8 h de golpe dan el Rastro de 8 h en vivo, que el guardado sigue siendo
 * válido tras cada fruto y cada compra, y que la red de hongos sale idéntica con y sin el socio.
 *
 * Uso: npm run sim:plasmodio (o npm run sim, que corre los dos simuladores)
 */
import { buyGenerator, buyUpgrade, canSporulate, click, sporeGain, sporulate } from '../src/core/actions.ts';
import { bestPurchase } from '../src/core/economy.ts';
import { drain, type GameEvent } from '../src/core/events.ts';
import * as num from '../src/core/num.ts';
import { mixSeed, nextRandom, type RngHolder } from '../src/core/rng.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { tick } from '../src/core/tick.ts';
import {
  PLASMODIUM_SEED_SALT,
  PLASMODIUM_UPGRADES,
  type PlasmodiumUpgradeId,
} from '../src/data/plasmodium.ts';
import { PLATES } from '../src/data/plasmodium-plates.ts';
import { buyPlasmodiumUpgrade, openPlate, pulse, respreadTubes } from '../src/partners/plasmodium/actions.ts';
import { openPlateRate, stepSecond } from '../src/partners/plasmodium/advance.ts';
import { solverFailures } from '../src/partners/plasmodium/flow.ts';
import { measure } from '../src/partners/plasmodium/metrics.ts';
import { plasmodiumRuntime } from '../src/partners/plasmodium/plasmodium-runtime.ts';
import { MEETS_BONUS, previewScore, suggestSite } from '../src/partners/plasmodium/preview.ts';
import {
  foodLimit,
  isUpgradeAvailable,
  lampLimit,
  mappedCount,
  plasmodiumCore,
  plateDef,
  spreadConductivity,
  startHabituation,
  upgradeCost,
  type PlasmodiumState,
} from '../src/partners/plasmodium/state.ts';
import { registerPartnerRuntime } from '../src/partners/registry.ts';
import { catchDrop } from '../src/systems/rain.ts';
import { advancePartners, noteFungalEvent } from '../src/systems/partners.ts';
import { parseSave, serializeSave } from '../src/systems/save.ts';
import { fmt, setLocale, setNotation } from '../src/i18n/index.ts';
import { SEEDS, clock, hours, median, row, writeBlock, type Metric } from './sim-report.ts';

setLocale('es');
setNotation('names');
registerPartnerRuntime(plasmodiumRuntime);

const START_TIME = Date.UTC(2026, 0, 1);
/** Tope de una partida del plasmodio. */
const MAX_SECONDS = 12 * 3600;
/** Pasos de la previsualización del bot (como el prototipo). */
const PREVIEW_STEPS = 150;
/** El bot recoloca cada 20 min de placa y tras comprar Avena o Lámpara. */
const REPLACE_EVERY = 1200;
/** El bot compra lo que no sube el Rastro (Humedad, Latencia…) si cuesta ≤ 120 s de ingreso. */
const QOL_SECONDS = 120;
/** El ingenuo prueba otra colocación al azar si en 10 min no cumple el objetivo. */
const NAIVE_RETRY = 600;

type ProfileName = 'active' | 'passive' | 'naive';

interface PlateLog {
  /** Segundos desde que se abrió hasta que fructificó. */
  seconds: number;
  /** Segundos desde que se abrió hasta la estabilidad llena por primera vez. */
  objective: number;
}

interface PlayResult {
  plates: PlateLog[];
  total: number | null;
  longestWait: number;
  maxTrail: number;
  invalidSaves: number;
  nonFinite: number;
  /** Primer segundo con A prueba de cortes (informativo). */
  cutProofAt: number | null;
}

// ---------------------------------------------------------------------------------------
// Bot de colocación

function freeSites(p: PlasmodiumState, used: readonly number[]): number[] {
  const def = plateDef(p.plate);
  const out: number[] = [];
  for (let i = 0; i < def.x.length; i += 1) {
    if (!def.blocked.includes(i) && !def.fixedFoods.includes(i) && !used.includes(i)) out.push(i);
  }
  return out;
}

/** El sitio más cercano al centro de la placa (primer copo sin copos fijos). */
function centerSite(p: PlasmodiumState): number {
  const def = plateDef(p.plate);
  const cx = def.x.reduce((s, v) => s + v, 0) / def.x.length;
  const cy = def.y.reduce((s, v) => s + v, 0) / def.y.length;
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (const s of freeSites(p, [])) {
    const d = Math.hypot((def.x[s] ?? 0) - cx, (def.y[s] ?? 0) - cy);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

interface Placement {
  foods: number[];
  lamps: number[];
  score: number;
}

/**
 * Coloca los copos y las lámparas disponibles partiendo de lo ya puesto: codicioso (con ruido: elige
 * entre los 3 mejores sitios) y pasadas de mejora que mueven cada copo al sitio que más sube la
 * puntuación; las lámparas, solo si suben la puntuación. Puntuación: previewScore.
 */
function optimize(p: PlasmodiumState, passes: number, noise: RngHolder | null): Placement {
  const record = p.plates[p.plate];
  const nFoods = foodLimit(p, p.plate);
  const nLamps = lampLimit(p, p.plate);
  const foods = (record?.foods ?? []).slice(0, nFoods);
  const lamps = (record?.lamps ?? []).slice(0, nLamps);
  const score = (f: readonly number[], l: readonly number[]): number => previewScore(p, f, l, PREVIEW_STEPS);
  if (plateDef(p.plate).fixedFoods.length + foods.length === 0 && nFoods > 0) foods.push(centerSite(p));
  while (foods.length < nFoods) {
    const ranked = freeSites(p, [...foods, ...lamps])
      .map((s) => ({ s, v: score([...foods, s], lamps) }))
      .sort((a, b) => b.v - a.v || a.s - b.s);
    if (ranked.length === 0) break;
    const pick = noise ? Math.floor(nextRandom(noise) * Math.min(3, ranked.length)) : 0;
    foods.push(ranked[pick]?.s ?? 0);
  }
  let current = score(foods, lamps);
  for (let pass = 0; pass < passes; pass += 1) {
    let improved = false;
    for (let i = 0; i < foods.length; i += 1) {
      for (const s of freeSites(p, [...foods, ...lamps])) {
        const trial = foods.slice();
        trial[i] = s;
        const v = score(trial, lamps);
        if (v > current + 1e-4) {
          current = v;
          foods.splice(0, foods.length, ...trial);
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  while (lamps.length < nLamps) {
    let best = current;
    let bestSite = -1;
    for (const s of freeSites(p, [...foods, ...lamps])) {
      const v = score(foods, [...lamps, s]);
      if (v > best + 1e-4) {
        best = v;
        bestSite = s;
      }
    }
    if (bestSite < 0) break;
    lamps.push(bestSite);
    current = best;
  }
  return { foods, lamps, score: current };
}

function place(p: PlasmodiumState, foods: number[], lamps: number[]): void {
  const record = p.plates[p.plate];
  if (!record) return;
  record.foods = foods;
  record.lamps = lamps;
  respreadTubes(p);
}

/** Recoloca si la previsualización mejora un 1 % o pone más copos (como el prototipo). */
function replace(p: PlasmodiumState, passes: number, noise: RngHolder | null): void {
  const record = p.plates[p.plate];
  if (!record) return;
  const best = optimize(p, passes, noise);
  const snap = measure(p);
  const current = (snap.meets ? MEETS_BONUS : 0) + snap.score;
  const changed = best.foods.join() !== record.foods.join() || best.lamps.join() !== record.lamps.join();
  if (!changed) return;
  if (record.foods.length === 0 || best.score > current * 1.01 || best.foods.length > record.foods.length) {
    place(p, best.foods, best.lamps);
  }
}

/**
 * El ingenuo: copos y lámparas al azar. Con la Quimiotaxis comprada, pone los copos uno a uno en el
 * sitio que sugiere (y las lámparas, al azar: la sugerencia es solo para la avena).
 */
function randomPlace(p: PlasmodiumState, r: RngHolder): void {
  const free = freeSites(p, []);
  const nFoods = foodLimit(p, p.plate);
  const total = Math.min(free.length, nFoods + lampLimit(p, p.plate));
  const pick: number[] = [];
  while (pick.length < total) {
    const s = free.splice(Math.floor(nextRandom(r) * free.length), 1)[0];
    if (s !== undefined) pick.push(s);
  }
  const lamps = pick.slice(nFoods);
  if (p.upgrades.chemotaxis === 0) {
    place(p, pick.slice(0, nFoods), lamps);
    return;
  }
  place(p, [], lamps);
  for (let site = suggestSite(p); site !== null; site = suggestSite(p)) {
    const record = p.plates[p.plate];
    if (record) record.foods = [...record.foods, site];
  }
  respreadTubes(p);
}

// ---------------------------------------------------------------------------------------
// Compras (como el prototipo: Agar y Avena por amortización; lo demás si es barato)

function shop(state: GameState, p: PlasmodiumState, pulsing: boolean): PlasmodiumUpgradeId | null {
  const snap = measure(p);
  const rate = num.toNumber(openPlateRate(p, snap));
  // Un pulso cada 3 s deja 3 s de Rastro: dobla el ingreso del activo.
  const income = rate * (pulsing ? 2 : 1);
  let bought: PlasmodiumUpgradeId | null = null;
  for (let guard = 0; guard < 20; guard += 1) {
    let best: PlasmodiumUpgradeId | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const def of PLASMODIUM_UPGRADES) {
      const cost = upgradeCost(p, def.id);
      if (cost === null || !isUpgradeAvailable(p, def.id)) continue;
      let gain: number;
      if (def.id === 'agar') gain = rate * 0.5;
      else if (def.id === 'oats') {
        if (!plateDef(p.plate).extraFoods) continue;
        gain = snap.joined > 0 ? rate / snap.joined : 0;
      } else {
        // Lo que no sube el Rastro se compra en cuanto es barato (y gana a lo demás).
        if (cost <= income * QOL_SECONDS && p.trail >= cost) {
          best = def.id;
          break;
        }
        continue;
      }
      if (!(gain > 0)) continue;
      const missing = Math.max(0, cost - p.trail);
      const wait = missing === 0 ? 0 : income > 0 ? missing / income : Number.POSITIVE_INFINITY;
      const score = wait + cost / (gain * (pulsing ? 2 : 1));
      if (score < bestScore) {
        bestScore = score;
        best = def.id;
      }
    }
    if (!best) break;
    const level = p.upgrades[best];
    buyPlasmodiumUpgrade(state, { id: best });
    if (p.upgrades[best] === level) break;
    bought = best;
    if (best === 'oats' || best === 'lamps') return best;
  }
  return bought;
}

// ---------------------------------------------------------------------------------------
// Partidas

function newPartner(seed: number): GameState {
  const state = createState(seed, START_TIME);
  state.partners.plasmodium = plasmodiumCore.create(mixSeed(seed, PLASMODIUM_SEED_SALT));
  drain();
  return state;
}

function saveIsValid(state: GameState, now: number): boolean {
  return parseSave(serializeSave(state, now)).ok;
}

function play(seed: number, profile: ProfileName): PlayResult {
  const state = newPartner(seed);
  const p = state.partners.plasmodium;
  if (!p) throw new Error('sin plasmodio');
  const noise: RngHolder | null = profile === 'active' ? { rngSeed: mixSeed(seed, 0x6e6f) } : null;
  const naive: RngHolder = { rngSeed: mixSeed(seed, 4242) };
  const result: PlayResult = {
    plates: [],
    total: null,
    longestWait: 0,
    maxTrail: 0,
    invalidSaves: 0,
    nonFinite: 0,
    cutProofAt: null,
  };
  let plateStart = 0;
  let firstStable = -1;
  let lastBuy = 0;
  let sinceTry = 0;
  let openPlateIndex = -1;
  const setUp = (t: number): void => {
    openPlateIndex = p.plate;
    plateStart = t;
    firstStable = -1;
    sinceTry = 0;
    if (profile === 'naive') randomPlace(p, naive);
    else replace(p, 2, noise);
  };
  setUp(0);
  for (let t = 0; t < MAX_SECONDS; t += 1) {
    const pulsing = profile !== 'passive' || t < 60;
    if (pulsing && p.pulseIn === 0 && p.lingerFor === 0) pulse(state);
    const mappedBefore = mappedCount(p);
    advancePartners(state, 1000);
    drain();
    const now = t + 1;
    result.maxTrail = Math.max(result.maxTrail, num.toNumber(p.trailEarned));
    if (!p.conductivity.every(Number.isFinite)) result.nonFinite += 1;
    if (firstStable < 0 && p.stableFor >= 60) firstStable = now - plateStart;
    if (result.cutProofAt === null && p.achievements.includes('cutProof')) result.cutProofAt = now;
    if (mappedCount(p) > mappedBefore) {
      result.plates.push({ seconds: now - plateStart, objective: firstStable });
      if (!saveIsValid(state, START_TIME + now * 1000)) result.invalidSaves += 1;
      if (mappedCount(p) >= PLATES.length) {
        result.total = now;
        break;
      }
      if (profile !== 'passive') openPlate(state, { plate: p.plate + 1 });
      drain();
    }
    if (p.plate !== openPlateIndex) setUp(now);

    const bought = shop(state, p, pulsing);
    if (bought) {
      result.longestWait = Math.max(result.longestWait, now - lastBuy);
      lastBuy = now;
      if (!saveIsValid(state, START_TIME + now * 1000)) result.invalidSaves += 1;
      if (bought === 'oats' || bought === 'lamps') {
        if (profile === 'naive') randomPlace(p, naive);
        else replace(p, 1, noise);
        sinceTry = 0;
      }
    }
    sinceTry += 1;
    if (profile === 'naive') {
      if (sinceTry >= NAIVE_RETRY && !measure(p).meets) {
        randomPlace(p, naive);
        sinceTry = 0;
      }
    } else if ((now - plateStart) % REPLACE_EVERY === 0) {
      replace(p, 1, noise);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------
// 8 h de golpe frente a 8 h en vivo (placa con mapa: dentro del intervalo no hay fruto)

function offlineRatio(seed: number, plate: number): number {
  const state = newPartner(seed);
  const p = state.partners.plasmodium;
  if (!p) return Number.NaN;
  for (let i = 0; i <= plate; i += 1) {
    Object.assign(p.plates[i] ?? {}, {
      map: { score: 2, quality: 0.7, cost: 1.2, tolerance: 0.8, alive: 9, joined: 3 },
    });
  }
  p.plate = plate;
  p.conductivity = spreadConductivity(p, plate);
  p.habituation = startHabituation(plate);
  replace(p, 1, null);
  const live = structuredClone(p);
  const SECONDS = 8 * 3600;
  plasmodiumRuntime.advance(state, p, SECONDS * 1000);
  for (let i = 0; i < SECONDS; i += 1) stepSecond(live);
  drain();
  return p.trailEarned / live.trailEarned;
}

// ---------------------------------------------------------------------------------------
// Aislamiento: la red de hongos con y sin el socio (con ventajas y lluvia en la placa)

function fungalFingerprint(seed: number, withPartner: boolean): string[] {
  const state = createState(seed, START_TIME);
  if (withPartner) {
    const p = plasmodiumCore.create(mixSeed(seed, PLASMODIUM_SEED_SALT));
    const map = { score: 3, quality: 0.75, cost: 1.2, tolerance: 1, alive: 10, joined: 4 };
    Object.assign(p.plates[0] ?? {}, { foods: [7, 1, 16, 18], map: { ...map } });
    Object.assign(p.plates[1] ?? {}, { map: { ...map } });
    p.plate = 2;
    p.conductivity = spreadConductivity(p, 2);
    p.habituation = startHabituation(2);
    state.partners.plasmodium = p;
  }
  drain();
  const prints: string[] = [];
  let sporulations = 0;
  for (let t = 0; t < 6 * 3600 && sporulations < 2; t += 1) {
    const cps = t < 900 ? 5 : 2;
    for (let c = 0; c < cps; c += 1) click(state, {});
    for (let guard = 0; guard < 500; guard += 1) {
      const best = bestPurchase(state, cps);
      if (!best || num.lt(state.nutrients, best.cost)) break;
      if (best.kind === 'generator') buyGenerator(state, { id: best.id, amount: 1 });
      else buyUpgrade(state, { id: best.id });
    }
    tick(state, { dt: 1 });
    if (state.rain.drop) catchDrop(state, {});
    const events: GameEvent[] = [...drain()];
    if (withPartner) {
      for (const event of events) {
        if (event.type === 'rainCaught' || event.type === 'rainFell') noteFungalEvent(state, { event });
      }
      advancePartners(state, 1000);
      drain();
    }
    if (canSporulate(state) && sporeGain(state) >= Math.max(10, state.spores.level)) {
      sporulate(state, { now: START_TIME + (t + 1) * 1000 });
      sporulations += 1;
      drain();
    }
    if ((t + 1) % 60 === 0) prints.push(JSON.stringify({ ...state, partners: null }));
  }
  return prints;
}

// ---------------------------------------------------------------------------------------
// Corridas y métricas

const started = performance.now();
const failuresBefore = solverFailures();
const active = SEEDS.map((seed) => play(seed, 'active'));
const passive = SEEDS.map((seed) => play(seed, 'passive'));
const naive = SEEDS.map((seed) => play(seed, 'naive'));
const OFFLINE_SEEDS = SEEDS.slice(0, 3);
const offline = PLATES.flatMap((_, plate) => OFFLINE_SEEDS.map((seed) => offlineRatio(seed, plate)));
const ISOLATION_SEEDS = SEEDS.slice(0, 2);
const isolation = ISOLATION_SEEDS.map((seed) => {
  const a = fungalFingerprint(seed, false);
  const b = fungalFingerprint(seed, true);
  return a.length > 0 && a.length === b.length && a.every((v, i) => v === b[i]) ? 1 : 0;
});
const failures = solverFailures() - failuresBefore;
const elapsedMs = Math.round(performance.now() - started);

const plateTimes = (results: readonly PlayResult[], plate: number): (number | null)[] =>
  results.map((r) => r.plates[plate]?.seconds ?? null);
const totals = (results: readonly PlayResult[]): (number | null)[] => results.map((r) => r.total);
const clockFormat = (v: number | null): string => clock(v);
const hoursFormat = (v: number | null): string => hours(v);
const plainFormat = (v: number | null): string => (v === null ? '—' : String(v));
const ratioFormat = (v: number | null): string => (v === null ? '—' : v.toFixed(2).replace('.', ','));
const PLATE_NAMES = ['Tronco caído', 'Laberinto', 'Archipiélago', 'Puente amargo', 'Fusión'];

const metrics: Metric[] = [
  {
    name: 'Plasmodio: Tronco caído cartografiado desde la llegada (activo)',
    target: '20–35 min',
    values: plateTimes(active, 0),
    format: clockFormat,
    pass: (m) => m >= 20 * 60 && m <= 35 * 60,
  },
  ...[1, 2, 3, 4].map((plate): Metric => ({
    name: `Plasmodio: ${PLATE_NAMES[plate] ?? ''} cartografiado desde que se abre (activo)`,
    target: '30–90 min',
    values: plateTimes(active, plate),
    format: clockFormat,
    pass: (m) => m >= 30 * 60 && m <= 90 * 60,
  })),
  {
    name: 'Plasmodio: las cinco placas (activo)',
    target: '4–6 h',
    values: totals(active),
    format: hoursFormat,
    pass: (m) => m >= 4 * 3600 && m <= 6 * 3600,
  },
  {
    name: 'Plasmodio: pasivo frente a activo, las cinco placas (cada semilla)',
    target: '≤ 2,5',
    values: SEEDS.map((_, i) => {
      const a = active[i]?.total ?? null;
      const b = passive[i]?.total ?? null;
      return a !== null && b !== null ? b / a : null;
    }),
    format: ratioFormat,
    pass: (v) => v <= 2.5,
    every: true,
  },
  {
    name: 'Plasmodio: objetivo sostenido tras abrir la placa (activo, la peor placa)',
    target: '≤ 10 min',
    values: active.map((r) => (r.plates.length > 0 ? Math.max(...r.plates.map((q) => q.objective)) : null)),
    format: clockFormat,
    pass: (v) => v <= 10 * 60,
    every: true,
  },
  {
    name: 'Plasmodio: espera más larga sin comprar (activo)',
    target: '≤ 22 min',
    values: active.map((r) => r.longestWait),
    format: clockFormat,
    pass: (v) => v <= 22 * 60,
    every: true,
  },
  {
    name: 'Plasmodio: jugador ingenuo (al azar, recoloca a los 10 min), Tronco caído',
    target: '≤ 45 min',
    values: plateTimes(naive, 0),
    format: clockFormat,
    pass: (m) => m <= 45 * 60,
  },
  {
    name: 'Plasmodio: jugador ingenuo frente al activo, las cinco placas',
    target: '≤ 1,75',
    values: SEEDS.map((_, i) => {
      const a = active[i]?.total ?? null;
      const b = naive[i]?.total ?? null;
      return a !== null && b !== null ? b / a : null;
    }),
    format: ratioFormat,
    pass: (m) => m <= 1.75,
  },
  {
    name: 'Plasmodio: semillas que terminan las cinco placas en 12 h (activo, pasivo e ingenuo)',
    target: '27 de 27',
    values: [[...active, ...passive, ...naive].filter((r) => r.total !== null).length],
    format: plainFormat,
    pass: (v) => v === 27,
  },
  {
    name: 'Plasmodio: Rastro máximo',
    target: '< 1e63',
    values: [Math.max(...[...active, ...passive, ...naive].map((r) => r.maxTrail))],
    format: (v) => (v === null ? '—' : fmt(v)),
    pass: (v) => v < 1e63,
  },
  {
    name: `Plasmodio: 8 h de golpe frente a 8 h en vivo (Rastro; ${PLATES.length} placas × ${OFFLINE_SEEDS.length} semillas)`,
    target: '0,98–1,02',
    values: offline,
    format: (v) => (v === null ? '—' : v.toFixed(3).replace('.', ',')),
    pass: (v) => v >= 0.98 && v <= 1.02,
    every: true,
  },
  {
    name: 'Plasmodio: guardados inválidos tras cada fruto y cada compra',
    target: '0',
    values: [[...active, ...passive, ...naive].reduce((s, r) => s + r.invalidSaves, 0)],
    format: plainFormat,
    pass: (v) => v === 0,
  },
  {
    name: 'Plasmodio: fallos del solver y valores no finitos',
    target: '0',
    values: [failures + [...active, ...passive, ...naive].reduce((s, r) => s + r.nonFinite, 0)],
    format: plainFormat,
    pass: (v) => v === 0,
  },
  {
    name: `Plasmodio: red de hongos idéntica con y sin el socio (${ISOLATION_SEEDS.length} semillas × 2 esporulaciones)`,
    target: 'sí',
    values: isolation,
    format: (v) => (v === 1 ? 'sí' : 'no'),
    pass: (v) => v === 1,
    every: true,
  },
];

const rows = metrics.map(row);

const plateTable = [
  '| Placa | Activo | Objetivo sostenido (activo) | Pasivo | Ingenuo |',
  '| ----- | ------ | --------------------------- | ------ | ------- |',
  ...PLATE_NAMES.map((name, plate) => {
    const med = (values: (number | null)[]): string => {
      const present = values.filter((v): v is number => v !== null);
      return present.length === values.length ? clock(median(present)) : '—';
    };
    return `| ${name} | ${med(plateTimes(active, plate))} | ${med(active.map((r) => r.plates[plate]?.objective ?? null))} | ${med(plateTimes(passive, plate))} | ${med(plateTimes(naive, plate))} |`;
  }),
];
const cutProof = active.map((r) => r.cutProofAt).filter((v): v is number => v !== null);

const block = [
  '<!-- sim:plasmodio:start -->',
  '',
  `_Generado por \`npm run sim:plasmodio\` (${SEEDS.length} semillas por perfil, pasos de 1 s, ${(elapsedMs / 1000).toFixed(1)} s de cómputo). No editar a mano entre estas marcas._`,
  '',
  '### El plasmodio (docs/ROADMAP.md, fase 9)',
  '',
  'Desde la llegada; mediana de las semillas y rango. El activo coloca con el bot (previsualiza cada sitio y elige entre los 3 mejores), da un pulso cada 3 s y abre la placa siguiente al momento; el pasivo da pulsos solo el primer minuto y deja que la siguiente se abra sola; el ingenuo coloca al azar, prueba otra colocación si en 10 min no cumple y, en cuanto compra la Quimiotaxis, pone los copos donde sugiere. Los tres compran igual.',
  '',
  '| Métrica | Objetivo | Mediana | Rango | Estado |',
  '| ------- | -------- | ------- | ----- | ------ |',
  ...rows.map((r) => r.line),
  '',
  `**Resultado:** ${rows.filter((r) => r.ok).length} de ${rows.length} objetivos cumplidos.`,
  '',
  'Mediana por placa, desde que se abre:',
  '',
  ...plateTable,
  '',
  `A prueba de cortes (informativo): ${cutProof.length} de ${active.length} partidas activas lo consiguen${cutProof.length > 0 ? `, la mediana a las ${hours(median(cutProof))}` : ''}.`,
  '',
  '<!-- sim:plasmodio:end -->',
].join('\n');

writeBlock(
  new URL('../docs/BALANCE.md', import.meta.url),
  '<!-- sim:plasmodio:start -->',
  '<!-- sim:plasmodio:end -->',
  block,
);

console.log(rows.map((r) => r.line).join('\n'));
console.log(plateTable.join('\n'));
console.log(`${rows.filter((r) => r.ok).length}/${rows.length} objetivos · ${elapsedMs} ms`);

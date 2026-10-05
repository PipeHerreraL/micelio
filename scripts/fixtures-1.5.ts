/**
 * Guardados reales de la 1.5 (fase 10). Seis partidas que la v1.5.0 escribe jugando solo con
 * acciones, como un jugador que lee cada lámina y cada aviso, y al lado lo que la 1.5 calculaba de
 * cada una (producción, clic, esporas, requisito, escala, tope sin conexión y viaje). Las pruebas
 * (tests/saves-1.5.test.ts) cargan estos guardados con el código de cada commit y comparan con esos
 * valores: así «ninguna cifra baja» se mide contra la versión publicada y no contra el código nuevo
 * consigo mismo.
 *
 * Corre con el código de la v1.5.0, en un worktree aparte (en cualquier otro código se niega):
 *
 *   git worktree add --detach <carpeta> v1.5.0
 *   cp scripts/fixtures-1.5.ts <carpeta>/scripts/
 *   node <carpeta>/scripts/fixtures-1.5.ts tests/fixtures
 *   npx prettier --write "tests/fixtures/save-v6-*.json"
 *   git worktree remove --force <carpeta>
 *
 * Es determinista: las mismas semillas dan los mismos archivos. Las importaciones nombran la API de
 * la 1.5; si un commit posterior la cambia y hay que tocar este guion para que compile, los
 * guardados se regeneran con la versión del commit que lo trajo (git log -- scripts/fixtures-1.5.ts).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  adaptationsUnlocked,
  buyAdaptation,
  buyBiomeAdaptation,
  buyGenerator,
  buyMutation,
  buyUpgrade,
  canSporulate,
  click,
  disperse,
  disperseBlock,
  disperseFunds,
  markSeen,
  nextAdaptationCost,
  setSetting,
  sporeGain,
  sporulate,
} from '../src/core/actions.ts';
import { availableUpgrades, bestPurchase, hasAutobuyGenerators } from '../src/core/economy.ts';
import { drain } from '../src/core/events.ts';
import {
  biomeAdaptationGate,
  destinations,
  isActOneClosed,
  isColonized,
  isForestColonized,
  nextBiomeAdaptationCost,
  sporeScale,
  sporulateRequirement,
  visitedBiomes,
} from '../src/core/forest.ts';
import * as num from '../src/core/num.ts';
import { derived } from '../src/core/selectors.ts';
import { createState, hasMutation, hasSeen, isTreeComplete, type GameState } from '../src/core/state.ts';
import { tick } from '../src/core/tick.ts';
import {
  ACT_ONE_ACHIEVEMENT,
  BIOME_ADAPTATION_IDS,
  DISPERSE_COST,
  HOME_BIOME,
  type DestinationId,
} from '../src/data/biomes.ts';
import { GENERATORS } from '../src/data/generators.ts';
import { MUTATIONS } from '../src/data/mutations.ts';
import { PLASMODIUM_UPGRADES, type PlasmodiumUpgradeId } from '../src/data/plasmodium.ts';
import { PLATES } from '../src/data/plasmodium-plates.ts';
import { SPORE_SOFTCAP_BASE } from '../src/data/prestige.ts';
import { buyPlasmodiumUpgrade, openPlate, placeItem, pulse } from '../src/partners/plasmodium/actions.ts';
import { openPlateRate } from '../src/partners/plasmodium/advance.ts';
import { measure } from '../src/partners/plasmodium/metrics.ts';
import { plasmodiumRuntime } from '../src/partners/plasmodium/plasmodium-runtime.ts';
import { MEETS_BONUS, previewScore } from '../src/partners/plasmodium/preview.ts';
import {
  foodLimit,
  isUpgradeAvailable,
  lampLimit,
  mappedCount,
  plateDef,
  upgradeCost,
  type PlasmodiumState,
} from '../src/partners/plasmodium/state.ts';
import { registerPartnerRuntime } from '../src/partners/registry.ts';
import { offlineCapSeconds, applyOffline } from '../src/systems/offline.ts';
import { advancePartners, noteFungalEvent } from '../src/systems/partners.ts';
import { catchDrop } from '../src/systems/rain.ts';
import { parseSave, serializeSave, type SaveFile } from '../src/systems/save.ts';
import { isTabAvailable } from '../src/ui/app.ts';
import { chapterSeenKey, pendingChapter } from '../src/ui/chapter.ts';
import { revealState } from '../src/ui/tab-generators.ts';
import { TAB_IDS, type TabId } from '../src/ui/tabs.ts';

// ---------------------------------------------------------------------------------------
// Solo con el código de la v1.5.0

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TAG = 'v1.5.0';

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

const COMMIT = git('rev-parse', 'HEAD');
if (COMMIT !== git('rev-parse', `${TAG}^{commit}`) || git('status', '--porcelain', '--', 'src') !== '') {
  throw new Error(`Este guion corre con el código de ${TAG} sin cambios (está en ${COMMIT}).`);
}
const GAME = (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
const OUT_ARG = process.argv[2];
if (OUT_ARG === undefined) throw new Error('Falta la carpeta de salida (tests/fixtures del repositorio).');
const OUT_DIR: string = OUT_ARG;

// El modelo del plasmodio, como lo registra main.ts al cargarlo.
registerPartnerRuntime(plasmodiumRuntime);

/** Las partidas de la 1.5 empiezan tras publicarse (el commit de la v1.5.0 es del 4 de octubre de 2026). */
const START = Date.UTC(2026, 9, 4, 18);
/** La partida de la 1.1 empieza el día en que salió la 1.1.0 (1 de octubre de 2026). */
const START_1_1 = Date.UTC(2026, 9, 1, 10);

// ---------------------------------------------------------------------------------------
// El jugador mira la pantalla: lo que la interfaz de la 1.5 marca en `seen`

/**
 * «1.1»: la partida de antes de la madurez de la red, sin Crónica, socios ni adaptaciones; su
 * interfaz no tenía esas pestañas, avisos ni láminas. «1.5»: la de hoy.
 */
type Era = '1.1' | '1.5';

const NEWER_TABS: readonly TabId[] = ['chronicle', 'partners'];

interface HintRule {
  key: string;
  tab: TabId;
  era: Era;
  /** Cuándo lo muestra la interfaz (el `update(relevant)` de cada pestaña). */
  relevant: (state: GameState) => boolean;
}

const HINTS: readonly HintRule[] = [
  {
    key: 'hint.generators',
    tab: 'generators',
    era: '1.1',
    relevant: (s) =>
      GENERATORS.some((g) => revealState(s, g.id) === 'full') && GENERATORS.every((g) => s.owned[g.id] === 0),
  },
  { key: 'hint.autobuy', tab: 'generators', era: '1.1', relevant: hasAutobuyGenerators },
  {
    key: 'hint.milestone',
    tab: 'generators',
    era: '1.1',
    relevant: (s) => GENERATORS.some((g) => s.owned[g.id] >= 10 && s.owned[g.id] < 25),
  },
  { key: 'hint.upgrades', tab: 'upgrades', era: '1.1', relevant: (s) => availableUpgrades(s).length > 0 },
  { key: 'hint.sporulate', tab: 'sporulate', era: '1.1', relevant: () => true },
  {
    key: 'hint.mutations',
    tab: 'mutations',
    era: '1.1',
    relevant: (s) => s.spores.available > 0 && s.mutations.length === 0,
  },
  { key: 'hint.achievements', tab: 'achievements', era: '1.1', relevant: (s) => s.achievements.length > 0 },
  { key: 'hint.wind', tab: 'sporulate', era: '1.5', relevant: isActOneClosed },
  { key: 'hint.adaptations', tab: 'mutations', era: '1.5', relevant: adaptationsUnlocked },
  {
    key: 'hint.biomeAdaptations',
    tab: 'mutations',
    era: '1.5',
    relevant: (s) => adaptationsUnlocked(s) && visitedBiomes(s).some((b) => b !== HOME_BIOME),
  },
  { key: 'hint.chronicle', tab: 'chronicle', era: '1.5', relevant: isActOneClosed },
  { key: 'hint.partners', tab: 'partners', era: '1.5', relevant: (s) => s.partners.plasmodium !== null },
];

function see(state: GameState, key: string): void {
  if (!hasSeen(state, key)) markSeen(state, { key });
}

/**
 * Lo que la interfaz marca como visto mientras el jugador mira: cada pestaña que aparece (y que
 * visita enseguida), cada generador que se revela, cada aviso que lee y cierra y cada lámina que
 * cierra. Con las funciones de la propia 1.5 (ui/app.ts, ui/tab-generators.ts, ui/chapter.ts).
 */
function lookAround(state: GameState, era: Era): void {
  for (const id of TAB_IDS) {
    if (era === '1.1' && NEWER_TABS.includes(id)) continue;
    if (hasSeen(state, `tab.${id}`) || isTabAvailable(id, state)) {
      see(state, `tab.${id}`);
      see(state, `tabVisited.${id}`);
    }
  }
  for (const g of GENERATORS) {
    const reveal = revealState(state, g.id);
    if (reveal === 'silhouette') see(state, `gen.${g.id}.silhouette`);
    if (reveal === 'full') see(state, `gen.${g.id}.full`);
  }
  for (const hint of HINTS) {
    if (era === '1.1' && hint.era === '1.5') continue;
    if (hasSeen(state, `tabVisited.${hint.tab}`) && hint.relevant(state)) see(state, hint.key);
  }
  if (era === '1.5') {
    for (let chapter = pendingChapter(state); chapter; chapter = pendingChapter(state)) {
      see(state, chapterSeenKey(chapter));
    }
  }
  drain();
}

// ---------------------------------------------------------------------------------------
// La red: el bot del simulador (scripts/simulate.ts), perfil activo y regla de §17

/** Compra mientras la mejor opción sea pagable ahora mismo (bestPurchase, como el simulador). */
function shop(state: GameState, cps: number): void {
  for (let guard = 0; guard < 500; guard += 1) {
    const best = bestPurchase(state, cps);
    if (!best || num.lt(state.nutrients, best.cost)) return;
    if (best.kind === 'generator') buyGenerator(state, { id: best.id, amount: 1 });
    else buyUpgrade(state, { id: best.id });
  }
}

function buyMutationsInOrder(state: GameState): void {
  for (const m of MUTATIONS) {
    if (hasMutation(state, m.id)) continue;
    if (state.spores.available < m.cost) return;
    buyMutation(state, { id: m.id });
    if (!hasMutation(state, m.id)) return;
  }
}

/** Cuerpo apical primero y luego la más barata; Fuego de zorro es cosmético y no se compra. */
function buyAdaptations(state: GameState, reserve: number): void {
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

/** Entre partidas del viaje: mutaciones y adaptaciones, guardando lo del próximo viaje. */
function shopBetweenRuns(state: GameState): void {
  buyMutationsInOrder(state);
  const reserve = isForestColonized(state) && destinations(state).length > 0 ? DISPERSE_COST : 0;
  buyBiomeAdaptations(state, reserve);
  buyAdaptations(state, reserve);
}

// ---------------------------------------------------------------------------------------
// El plasmodio: el bot activo de scripts/simulate-plasmodium.ts, con las acciones del jugador

/** Pasos de la previsualización (los del bot del simulador). */
const PREVIEW_STEPS = 150;
/** Recoloca cada 20 min de placa y tras comprar Avena o Lámpara. */
const REPLACE_EVERY = 1200;
/** Compra lo que no sube el Rastro si cuesta ≤ 120 s de ingreso. */
const QOL_SECONDS = 120;

function freeSites(p: PlasmodiumState, used: readonly number[]): number[] {
  const def = plateDef(p.plate);
  const out: number[] = [];
  for (let i = 0; i < def.x.length; i += 1) {
    if (!def.blocked.includes(i) && !def.fixedFoods.includes(i) && !used.includes(i)) out.push(i);
  }
  return out;
}

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

/** Copos codiciosos con una pasada de mejora y lámparas solo si suben la puntuación. */
function bestArrangement(p: PlasmodiumState): { foods: number[]; lamps: number[]; score: number } {
  const record = p.plates[p.plate];
  const foods = (record?.foods ?? []).slice(0, foodLimit(p, p.plate));
  const lamps = (record?.lamps ?? []).slice(0, lampLimit(p, p.plate));
  const score = (f: readonly number[], l: readonly number[]): number => previewScore(p, f, l, PREVIEW_STEPS);
  if (plateDef(p.plate).fixedFoods.length + foods.length === 0 && foodLimit(p, p.plate) > 0) {
    foods.push(centerSite(p));
  }
  while (foods.length < foodLimit(p, p.plate)) {
    const ranked = freeSites(p, [...foods, ...lamps])
      .map((s) => ({ s, v: score([...foods, s], lamps) }))
      .sort((a, b) => b.v - a.v || a.s - b.s);
    const top = ranked[0];
    if (!top) break;
    foods.push(top.s);
  }
  let current = score(foods, lamps);
  for (let i = 0; i < foods.length; i += 1) {
    for (const s of freeSites(p, [...foods, ...lamps])) {
      const trial = foods.slice();
      trial[i] = s;
      const v = score(trial, lamps);
      if (v > current + 1e-4) {
        current = v;
        foods.splice(0, foods.length, ...trial);
      }
    }
  }
  while (lamps.length < lampLimit(p, p.plate)) {
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

/** Recoloca con la herramienta de la placa si la previsualización mejora un 1 % o pone más copos. */
function arrange(state: GameState, p: PlasmodiumState): void {
  const record = p.plates[p.plate];
  if (!record) return;
  const best = bestArrangement(p);
  const snap = measure(p);
  const current = (snap.meets ? MEETS_BONUS : 0) + snap.score;
  if (best.foods.join() === record.foods.join() && best.lamps.join() === record.lamps.join()) return;
  if (record.foods.length > 0 && best.score <= current * 1.01 && best.foods.length <= record.foods.length) {
    return;
  }
  for (const site of [...record.foods, ...record.lamps]) {
    if (!best.foods.includes(site) && !best.lamps.includes(site)) placeItem(state, { site, tool: 'remove' });
  }
  for (const site of best.foods) if (!record.foods.includes(site)) placeItem(state, { site, tool: 'food' });
  for (const site of best.lamps) if (!record.lamps.includes(site)) placeItem(state, { site, tool: 'lamp' });
}

/** Agar y Avena por amortización; lo demás, en cuanto es barato. */
function shopPlasmodium(state: GameState, p: PlasmodiumState): PlasmodiumUpgradeId | null {
  const snap = measure(p);
  // Un pulso cada 3 s deja 3 s de Rastro: dobla el ingreso.
  const rate = num.toNumber(openPlateRate(p, snap));
  const income = rate * 2;
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
        if (cost <= income * QOL_SECONDS && p.trail >= cost) {
          best = def.id;
          break;
        }
        continue;
      }
      if (!(gain > 0)) continue;
      const missing = Math.max(0, cost - p.trail);
      const wait = missing === 0 ? 0 : income > 0 ? missing / income : Number.POSITIVE_INFINITY;
      const score = wait + cost / (gain * 2);
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
// Una partida

class Game {
  state: GameState;
  /** Reloj de pared (ms): avanza con cada segundo jugado y con las ausencias. */
  clock: number;
  era: Era = '1.5';
  /** Placas cartografiadas con las que el jugador deja de cuidar al plasmodio (null: nunca). */
  partnerStopsAt: number | null = null;
  private openedPlate = -1;
  private plateSeconds = 0;

  constructor(seed: number, start = START) {
    this.state = createState(seed, start);
    this.clock = start;
    drain();
  }

  private tendsPartner(p: PlasmodiumState | null): p is PlasmodiumState {
    if (!p || this.era === '1.1') return false;
    return this.partnerStopsAt === null || mappedCount(p) < this.partnerStopsAt;
  }

  /** Un segundo: mirar, absorber, comprar, el tick, la gota, el socio. Como main.ts a pasos de 1 s. */
  second(): void {
    const s = this.state;
    lookAround(s, this.era);
    const cps = s.stats.runTime < 15 * 60 ? 5 : 2;
    for (let c = 0; c < cps; c += 1) click(s, {});
    shop(s, cps);
    tick(s, { dt: 1 });
    if (s.rain.drop) catchDrop(s, {});
    for (const event of [...drain()]) {
      if (event.type === 'rainSpawn') see(s, 'hint.rain');
      if (event.type === 'rainCaught' || event.type === 'rainFell') noteFungalEvent(s, { event });
    }
    if (this.era === '1.5') this.partnerSecond();
    drain();
    this.clock += 1000;
  }

  private partnerSecond(): void {
    const s = this.state;
    const before = s.partners.plasmodium;
    if (this.tendsPartner(before) && before.pulseIn === 0 && before.lingerFor === 0) pulse(s);
    const mappedBefore = before ? mappedCount(before) : 0;
    advancePartners(s, 1000);
    const p = s.partners.plasmodium;
    if (!this.tendsPartner(p)) return;
    if (mappedCount(p) > mappedBefore && mappedCount(p) < PLATES.length) openPlate(s, { plate: p.plate + 1 });
    this.plateSeconds += 1;
    if (p.plate !== this.openedPlate) {
      this.openedPlate = p.plate;
      this.plateSeconds = 0;
      arrange(s, p);
    }
    const bought = shopPlasmodium(s, p);
    if (
      bought === 'oats' ||
      bought === 'lamps' ||
      (this.plateSeconds > 0 && this.plateSeconds % REPLACE_EVERY === 0)
    ) {
      arrange(s, p);
    }
  }

  /** Juega hasta esporular con la regla de §17 (ganancia ≥ max(10, nivel)). */
  playRun(): void {
    for (let t = 0; t < 12 * 3600; t += 1) {
      this.second();
      const s = this.state;
      if (canSporulate(s) && sporeGain(s) >= Math.max(10, s.spores.level)) {
        sporulate(s, { now: this.clock });
        drain();
        return;
      }
    }
    throw new Error('Una partida pasó de 12 h sin esporular.');
  }

  /** Juega `seconds` sin esporular: el guardado queda a mitad de partida, como casi siempre. */
  playFor(seconds: number): void {
    for (let t = 0; t < seconds; t += 1) this.second();
    lookAround(this.state, this.era);
  }

  /** Natal hasta el Acto I y las partidas de espera para pagar el viaje (como el simulador). */
  natalToActOne(): void {
    const s = this.state;
    for (let i = 0; i < 60 && !isActOneClosed(s); i += 1) {
      this.playRun();
      buyMutationsInOrder(s);
      if (!isActOneClosed(s)) buyAdaptations(s, 0);
    }
    if (!isActOneClosed(s)) throw new Error('El Acto I no se cerró.');
    for (let wait = 0; wait < 10 && disperseBlock(s) === 'spores'; wait += 1) {
      this.playRun();
      buyMutationsInOrder(s);
      buyAdaptations(s, DISPERSE_COST);
    }
  }

  /** Dispersa a `to` al empezar partida y compra las adaptaciones de bioma que alcancen. */
  travel(to: DestinationId): void {
    disperse(this.state, { to, now: this.clock });
    drain();
    if (this.state.forest.biome !== to) throw new Error(`No se pudo dispersar a ${to}.`);
    lookAround(this.state, this.era);
    buyBiomeAdaptations(this.state, 0);
  }

  colonize(): void {
    for (let i = 0; i < 30 && !isForestColonized(this.state); i += 1) {
      this.playRun();
      shopBetweenRuns(this.state);
    }
    if (!isForestColonized(this.state)) throw new Error('El bioma no se colonizó en 30 partidas.');
  }
}

// ---------------------------------------------------------------------------------------
// Las seis partidas

/** Antes del Acto I: cinco esporulaciones en el natal y diez minutos de la sexta partida. */
function beforeActOne(): Game {
  const game = new Game(11);
  for (let i = 0; i < 5; i += 1) {
    game.playRun();
    buyMutationsInOrder(game.state);
    buyAdaptations(game.state, 0);
  }
  game.playFor(600);
  if (isActOneClosed(game.state)) throw new Error('El Acto I ya estaba cerrado.');
  return game;
}

/**
 * Acto I cerrado sin dispersar, con el suelo de esporas de una partida de la 1.1: el único camino a
 * `sporeFloor` > 0 es un guardado de la versión 3 que ya pasaba del nivel 1000 (MIGRATIONS[3]).
 * Se juega el natal como en la 1.1 (solo mutaciones: las adaptaciones llegaron con la 1.2) hasta
 * pasar del nivel 1000 con lo que pide el Acto I, se guarda con la forma de la versión 3 y el
 * jugador vuelve días después con la 1.5: la carga migra, cobra la ausencia con su tope (que cierra
 * el Acto I, systems/journey.ts) y juega diez minutos. La madurez ya regía en esas partidas, pero
 * solo por encima del nivel 1000, que se pasa en la última.
 */
function actOneWithFloor(): Game {
  const game = new Game(23, START_1_1);
  game.era = '1.1';
  const s = game.state;
  for (let i = 0; i < 60; i += 1) {
    game.playRun();
    buyMutationsInOrder(s);
    const ready = isTreeComplete(s) && s.achievements.includes(ACT_ONE_ACHIEVEMENT);
    if (ready && s.spores.level > SPORE_SOFTCAP_BASE) break;
  }
  game.playFor(300);
  if (game.clock >= START) throw new Error('La partida de la 1.1 acabó después de volver.');
  game.state = loadAsVersion3(s, game.clock);
  game.era = '1.5';
  applyOffline(game.state, game.clock, START);
  drain();
  game.clock = START;
  game.playFor(600);
  if (!isActOneClosed(game.state) || game.state.sporeFloor <= SPORE_SOFTCAP_BASE) {
    throw new Error('La partida de la 1.1 no quedó con el Acto I cerrado y su suelo de esporas.');
  }
  return game;
}

/**
 * La partida de la 1.1 que guardó la versión 3 y carga la 1.5: el estado sin lo que trajeron las
 * versiones 4 a 6 (lo que MIGRATIONS[3..5] añade), migrado por parseSave.
 */
function loadAsVersion3(state: GameState, now: number): GameState {
  const {
    adaptations: _adaptations,
    sporeFloor: _sporeFloor,
    forest: _forest,
    chronicle: _chronicle,
    biomeAdaptations: _biomeAdaptations,
    partners: _partners,
    ...rest
  } = state;
  const { mode: _mode, ...autobuy } = state.autobuy;
  const history = state.history.map(({ biome: _biome, ...run }) => run);
  const text = JSON.stringify({ version: 3, savedAt: now, state: { ...rest, autobuy, history } });
  const loaded = parseSave(text);
  if (!loaded.ok) throw new Error(`La 1.5 no cargó la partida de la 1.1: ${loaded.error}.`);
  return loaded.save.state;
}

/** En la taiga, primer destino, sin colonizar: dos partidas y diez minutos de la tercera. */
function inTaiga(): Game {
  const game = new Game(37);
  game.natalToActOne();
  game.travel('taiga');
  for (let i = 0; i < 2; i += 1) {
    game.playRun();
    shopBetweenRuns(game.state);
  }
  game.playFor(600);
  if (isForestColonized(game.state)) throw new Error('La taiga ya estaba colonizada.');
  return game;
}

/** El Chocó primero, colonizado, con la taiga por delante (C‑T a medias). */
function chocoColonized(): Game {
  const game = new Game(41);
  game.natalToActOne();
  game.travel('choco');
  game.colonize();
  game.playFor(600);
  return game;
}

/**
 * En el muro: taiga y Chocó colonizados y sin destino. El jugador sigue esporulando en el Chocó
 * hasta pasar del nivel 1000 y, sin nada en que gastar, junta las esporas.
 */
function atTheWall(seed: number, partnerStopsAt: number | null, english: boolean): Game {
  const game = new Game(seed);
  if (english) setSetting(game.state, { key: 'locale', value: 'en' });
  game.partnerStopsAt = partnerStopsAt;
  game.natalToActOne();
  game.travel('taiga');
  game.colonize();
  for (let wait = 0; wait < 10 && disperseBlock(game.state) === 'spores'; wait += 1) {
    game.playRun();
    shopBetweenRuns(game.state);
  }
  game.travel('choco');
  game.colonize();
  while (game.state.spores.level <= SPORE_SOFTCAP_BASE) game.playRun();
  game.playFor(600);
  if (destinations(game.state).length > 0 || !isColonized(game.state, 'choco')) {
    throw new Error('La partida no llegó al muro.');
  }
  return game;
}

// ---------------------------------------------------------------------------------------
// Escribir

/** Lo que la 1.5 calcula del guardado tal como lo carga: lo comparan las pruebas de cada commit. */
function valuesOf(state: GameState): Record<string, unknown> {
  const d = derived(state);
  return {
    game: GAME,
    commit: COMMIT,
    production: d.production,
    clickValue: d.clickValue,
    sporeGain: sporeGain(state),
    sporulateRequirement: sporulateRequirement(state),
    sporeScale: sporeScale(state),
    offlineCapSeconds: offlineCapSeconds(state),
    disperseBlock: disperseBlock(state),
  };
}

function write(name: string, game: Game): void {
  // Fuera de Vite `serializeSave` no sabe la versión del juego: se pone la del build de la 1.5,
  // en el mismo orden de claves que escribe el juego publicado.
  const raw = JSON.parse(serializeSave(game.state, game.clock)) as SaveFile;
  const file = { version: raw.version, savedAt: raw.savedAt, game: GAME, state: raw.state };
  const loaded = parseSave(JSON.stringify(file));
  if (!loaded.ok) throw new Error(`${name}: la 1.5 no carga su propio guardado (${loaded.error}).`);
  if (!isDeepStrictEqual(loaded.save.state, game.state)) {
    throw new Error(`${name}: el guardado no devuelve la misma partida.`);
  }
  const base = resolve(OUT_DIR, `save-v6-${name}`);
  writeFileSync(`${base}.json`, `${JSON.stringify(file, null, 2)}\n`);
  writeFileSync(`${base}.values.json`, `${JSON.stringify(valuesOf(loaded.save.state), null, 2)}\n`);
  const s = loaded.save.state;
  const p = s.partners.plasmodium;
  console.log(
    `${name}: ${s.forest.biome} tramo ${s.forest.leg}, nivel ${s.spores.level}, ` +
      `esporas ${s.spores.available} (${disperseFunds(s)} para viajar), ` +
      `plasmodio ${p ? `placa ${p.plate}, ${mappedCount(p)} cartografiadas` : 'no'}, ` +
      `${s.seen.length} marcas vistas, ${(s.stats.totalTime / 3600).toFixed(1)} h jugadas`,
  );
}

write('before-act-one', beforeActOne());
write('act-one-floor', actOneWithFloor());
write('taiga', inTaiga());
write('choco-colonized', chocoColonized());
write('wall', atTheWall(53, 2, false));
write('wall-fusion', atTheWall(67, null, true));

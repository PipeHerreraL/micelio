/**
 * Medidas de la red de la placa abierta: qué copos une, cuánto cuesta, cuántos cortes aguanta y
 * la calidad que decide el Rastro y el objetivo. Sin reservar memoria: el espacio de trabajo y la
 * instantánea viven en el grafo de cada placa.
 *
 * - Tubo vivo: D > D_ALIVE. Componente principal: la componente viva con más copos.
 * - Coste: largo de todos los tubos vivos ÷ árbol mínimo de los copos de la componente principal
 *   sobre el cierre métrico (Tero et al. 2010 normalizan así). Puede bajar de 1 si la red
 *   aprovecha puntos de cruce.
 * - Tolerancia a cortes: fracción de los tubos vivos de la componente principal cuya pérdida deja
 *   unidos todos sus copos.
 * - Calidad = (1 / coste)·(0,5 + 0,5·tolerancia), 0 con menos de dos copos unidos.
 * - Puntuación = copos unidos × calidad: el Rastro de la placa sale de aquí.
 */
import { D_ALIVE, D_DRYING, STABLE_SECONDS } from '../../data/plasmodium.ts';
import { plateGraph, type PlateGraph } from './graph.ts';
import { loadFoods } from './flow.ts';
import type { PlasmodiumState } from './state.ts';

export interface PlateSnapshot {
  /** Copos en la placa (fijos y del jugador) y del jugador solo. */
  foods: number;
  playerFoods: number;
  /** Copos de la componente principal. */
  joined: number;
  /** Todos los copos unidos (y al menos dos). */
  connected: boolean;
  alive: number;
  drying: number;
  /** Largo vivo ÷ árbol mínimo; Infinity con menos de dos copos unidos. */
  cost: number;
  tolerance: number;
  quality: number;
  score: number;
  /** Fusión: los dos copos fijos en la misma componente viva. */
  fused: boolean;
  /**
   * Habituación que muestra la interfaz: en el Puente, la media de los extremos de las aristas con
   * quinina; en la Fusión, la de los extremos derechos (x ≥ 3,5) de los tubos vivos.
   */
  habituation: number;
  /** El objetivo de la placa se cumple ahora. */
  meets: boolean;
}

function find(parent: Int32Array, i: number): number {
  let r = i;
  while (parent[r] !== r) {
    const up = parent[r] ?? r;
    parent[r] = parent[up] ?? up;
    r = up;
  }
  return r;
}

function union(parent: Int32Array, a: number, b: number): void {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra !== rb) parent[ra] = rb;
}

/** Árbol mínimo de `count` copos (en work.compFoods) sobre el cierre métrico (Prim, O(k²)). */
function foodTree(g: PlateGraph, count: number): number {
  const { compFoods, primBest, primIn } = g.work;
  if (count < 2) return 0;
  for (let k = 0; k < count; k += 1) {
    primBest[k] = Number.POSITIVE_INFINITY;
    primIn[k] = 0;
  }
  primBest[0] = 0;
  let total = 0;
  for (let it = 0; it < count; it += 1) {
    let u = -1;
    for (let v = 0; v < count; v += 1)
      if (!primIn[v] && (u < 0 || (primBest[v] ?? 0) < (primBest[u] ?? 0))) u = v;
    primIn[u] = 1;
    total += primBest[u] ?? 0;
    const fu = compFoods[u] ?? 0;
    for (let v = 0; v < count; v += 1) {
      const d = g.dist[fu * g.n + (compFoods[v] ?? 0)] ?? 0;
      if (!primIn[v] && d < (primBest[v] ?? 0)) primBest[v] = d;
    }
  }
  return total;
}

const snapshots = new WeakMap<PlateGraph, PlateSnapshot>();

function snapshotFor(g: PlateGraph): PlateSnapshot {
  let s = snapshots.get(g);
  if (!s) {
    s = {
      foods: 0,
      playerFoods: 0,
      joined: 0,
      connected: false,
      alive: 0,
      drying: 0,
      cost: Number.POSITIVE_INFINITY,
      tolerance: 0,
      quality: 0,
      score: 0,
      fused: false,
      habituation: 0,
      meets: false,
    };
    snapshots.set(g, s);
  }
  return s;
}

/** El objetivo de la placa: los copos pedidos, todos unidos y la calidad (o la longitud) del umbral. */
function meetsObjective(g: PlateGraph, s: PlateSnapshot): boolean {
  if (!s.connected || s.playerFoods < g.def.foods) return false;
  return g.def.objective === 'length' ? s.cost <= g.def.threshold : s.quality >= g.def.threshold;
}

/**
 * Mide la red de la placa abierta. Devuelve la instantánea de esa placa, compartida: vale hasta la
 * siguiente medida de la misma placa.
 */
export function measure(p: Readonly<PlasmodiumState>): PlateSnapshot {
  return measureOn(p, plateGraph(p.plate));
}

/** Como measure, sobre un grafo dado (las pruebas usan grafos hechos a mano). */
export function measureOn(p: Readonly<PlasmodiumState>, g: PlateGraph): PlateSnapshot {
  const s = snapshotFor(g);
  const { parent, parent2, compEdges, compFoods, foods } = g.work;
  const D = p.conductivity;
  const F = loadFoods(p, g);
  s.foods = F;
  s.playerFoods = F - g.def.fixedFoods.length;

  for (let i = 0; i < g.n; i += 1) parent[i] = i;
  let alive = 0;
  let drying = 0;
  let aliveLength = 0;
  for (let e = 0; e < g.m; e += 1) {
    const d = D[e] ?? 0;
    if (d > D_ALIVE) {
      alive += 1;
      aliveLength += g.len[e] ?? 0;
      union(parent, g.ea[e] ?? 0, g.eb[e] ?? 0);
    } else if (d > D_DRYING) drying += 1;
  }
  s.alive = alive;
  s.drying = drying;

  // Componente con más copos (a igualdad, la del primer copo en el orden de la placa).
  let bestRoot = -1;
  let bestCount = 0;
  for (let k = 0; k < F; k += 1) {
    const root = find(parent, foods[k] ?? 0);
    let count = 0;
    for (let j = 0; j < F; j += 1) if (find(parent, foods[j] ?? 0) === root) count += 1;
    if (count > bestCount) {
      bestCount = count;
      bestRoot = root;
    }
  }
  let joined = 0;
  for (let k = 0; k < F; k += 1) {
    const food = foods[k] ?? 0;
    if (find(parent, food) === bestRoot) compFoods[joined++] = food;
  }
  s.joined = joined >= 2 ? joined : Math.min(joined, 1);
  s.connected = F >= 2 && joined === F;

  const fixed = g.def.fixedFoods;
  const [left, right] = fixed;
  s.fused = left !== undefined && right !== undefined && find(parent, left) === find(parent, right);

  if (joined < 2) {
    s.cost = Number.POSITIVE_INFINITY;
    s.tolerance = 0;
    s.quality = 0;
    s.score = 0;
  } else {
    // Tolerancia: quitar cada tubo vivo de la componente principal y ver si los copos siguen unidos.
    let edges = 0;
    for (let e = 0; e < g.m; e += 1) {
      if ((D[e] ?? 0) > D_ALIVE && find(parent, g.ea[e] ?? 0) === bestRoot) compEdges[edges++] = e;
    }
    let tolerant = 0;
    for (let k = 0; k < edges; k += 1) {
      for (let i = 0; i < g.n; i += 1) parent2[i] = i;
      for (let j = 0; j < edges; j += 1) {
        if (j === k) continue;
        const e = compEdges[j] ?? 0;
        union(parent2, g.ea[e] ?? 0, g.eb[e] ?? 0);
      }
      const r0 = find(parent2, compFoods[0] ?? 0);
      let ok = true;
      for (let j = 1; j < joined; j += 1) {
        if (find(parent2, compFoods[j] ?? 0) !== r0) {
          ok = false;
          break;
        }
      }
      if (ok) tolerant += 1;
    }
    // Coste: todo lo vivo cuenta (los islotes sueltos también son tubo que mantener).
    s.cost = aliveLength / foodTree(g, joined);
    s.tolerance = edges > 0 ? tolerant / edges : 0;
    s.quality = (1 / s.cost) * (0.5 + 0.5 * s.tolerance);
    s.score = joined * s.quality;
  }

  s.habituation = habituationShown(p, g);
  s.meets = meetsObjective(g, s);
  return s;
}

function habituationShown(p: Readonly<PlasmodiumState>, g: PlateGraph): number {
  if (g.def.substance === 'none') return 0;
  const hab = p.habituation;
  let sum = 0;
  let count = 0;
  for (let e = 0; e < g.m; e += 1) {
    if (!g.substance[e]) continue;
    if (g.def.substance === 'salt' && !((p.conductivity[e] ?? 0) > D_ALIVE)) continue;
    for (const v of [g.ea[e] ?? 0, g.eb[e] ?? 0]) {
      if (g.def.substance === 'salt' && (g.x[v] ?? 0) < 3.5) continue;
      sum += hab[v] ?? 0;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** Barra de estabilidad llena: el objetivo se cumple desde hace un minuto de modelo. */
export function isStable(p: Readonly<PlasmodiumState>): boolean {
  return p.stableFor >= STABLE_SECONDS;
}

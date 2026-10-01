/**
 * Procedencia de las cinco placas del plasmodio (src/data/plasmodium-plates.ts). El juego nunca
 * genera placas: lee esos datos literales. Este generador es el del prototipo del modelo con el que
 * se midieron los umbrales (fase 9), y está aquí para que cualquiera pueda comprobar de dónde salen.
 *
 * Uso: node scripts/plasmodium-plates.ts   (imprime si los datos coinciden con el generador)
 *
 * Sitios en una rejilla con temblor; aristas: los 4 vecinos más cercanos ∪ árbol mínimo euclídeo,
 * filtrado a grafo plano (de la más corta a la más larga, se descarta la que cruza a una ya
 * aceptada). El Laberinto: árbol por búsqueda en profundidad + 5 paredes abiertas. Coordenadas
 * redondeadas a 3 decimales. La Fusión lleva sal en todas sus aristas (decisión de diseño tras
 * medir que, con sal repartida al azar, el contagio por fusión no influía).
 */
import { nextRandom, type RngHolder } from '../src/core/rng.ts';
import { PLATES, type PlateId } from '../src/data/plasmodium-plates.ts';

/** mixSeed del prototipo: constantes distintas de las de src/core/rng.ts; con aquel no sale igual. */
function prototypeMixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function rng(seed: number): RngHolder {
  return { rngSeed: seed >>> 0 };
}

interface RawPlate {
  x: number[];
  y: number[];
  edges: [number, number][];
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsCross(x: number[], y: number[], a: number, b: number, c: number, d: number): boolean {
  if (a === c || a === d || b === c || b === d) return false;
  const at = (i: number): [number, number] => [x[i] ?? 0, y[i] ?? 0];
  const d1 = cross(...at(a), ...at(b), ...at(c));
  const d2 = cross(...at(a), ...at(b), ...at(d));
  const d3 = cross(...at(c), ...at(d), ...at(a));
  const d4 = cross(...at(c), ...at(d), ...at(b));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function find(parent: number[], i: number): number {
  let r = i;
  while (parent[r] !== r) r = parent[r] ?? r;
  return r;
}

function knnPlate(cols: number, rows: number, jitter: number, k: number, seed: number): RawPlate {
  const r = rng(seed);
  const n = cols * rows;
  const x: number[] = [];
  const y: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      x[j * cols + i] = i + 0.5 + (nextRandom(r) * 2 - 1) * jitter;
      y[j * cols + i] = j + 0.5 + (nextRandom(r) * 2 - 1) * jitter;
    }
  }
  const dist = (a: number, b: number): number =>
    Math.hypot((x[a] ?? 0) - (x[b] ?? 0), (y[a] ?? 0) - (y[b] ?? 0));
  const key = (a: number, b: number): number => (a < b ? a * n + b : b * n + a);
  const cand = new Map<number, [number, number]>();
  for (let a = 0; a < n; a += 1) {
    const order: number[] = [];
    for (let b = 0; b < n; b += 1) if (b !== a) order.push(b);
    order.sort((p, q) => dist(a, p) - dist(a, q));
    for (let t = 0; t < k; t += 1) {
      const b = order[t] ?? 0;
      cand.set(key(a, b), a < b ? [a, b] : [b, a]);
    }
  }
  // Árbol mínimo euclídeo (Prim).
  const inTree: boolean[] = new Array<boolean>(n).fill(false);
  const best: number[] = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
  const from: number[] = new Array<number>(n).fill(-1);
  best[0] = 0;
  for (let it = 0; it < n; it += 1) {
    let u = -1;
    for (let v = 0; v < n; v += 1) if (!inTree[v] && (u < 0 || (best[v] ?? 0) < (best[u] ?? 0))) u = v;
    inTree[u] = true;
    const f = from[u] ?? -1;
    if (f >= 0) cand.set(key(u, f), u < f ? [u, f] : [f, u]);
    for (let v = 0; v < n; v += 1) {
      if (!inTree[v] && dist(u, v) < (best[v] ?? 0)) {
        best[v] = dist(u, v);
        from[v] = u;
      }
    }
  }
  const sorted = [...cand.values()].sort(
    (p, q) => dist(p[0], p[1]) - dist(q[0], q[1]) || p[0] - q[0] || p[1] - q[1],
  );
  const accepted: [number, number][] = [];
  for (const [a, b] of sorted) {
    if (!accepted.some(([c, d]) => segmentsCross(x, y, a, b, c, d))) accepted.push([a, b]);
  }
  const parent = Array.from({ length: n }, (_, i) => i);
  for (const [a, b] of accepted) parent[find(parent, a)] = find(parent, b);
  for (const [a, b] of sorted) {
    if (find(parent, a) !== find(parent, b)) {
      accepted.push([a, b]);
      parent[find(parent, a)] = find(parent, b);
    }
  }
  return { x, y, edges: accepted };
}

function mazePlate(cols: number, rows: number, extra: number, seed: number): RawPlate {
  const r = rng(seed);
  const n = cols * rows;
  const x: number[] = [];
  const y: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      x[j * cols + i] = i + 0.5 + (nextRandom(r) * 2 - 1) * 0.1;
      y[j * cols + i] = j + 0.5 + (nextRandom(r) * 2 - 1) * 0.1;
    }
  }
  const neighbors = (id: number): number[] => {
    const i = id % cols;
    const j = Math.floor(id / cols);
    const out: number[] = [];
    if (i > 0) out.push(id - 1);
    if (i < cols - 1) out.push(id + 1);
    if (j > 0) out.push(id - cols);
    if (j < rows - 1) out.push(id + cols);
    return out;
  };
  const visited: boolean[] = new Array<boolean>(n).fill(false);
  const edges: [number, number][] = [];
  const has = new Set<number>();
  const stack = [0];
  visited[0] = true;
  while (stack.length > 0) {
    const cur = stack[stack.length - 1] ?? 0;
    const free = neighbors(cur).filter((v) => !visited[v]);
    if (free.length === 0) {
      stack.pop();
      continue;
    }
    const next = free[Math.floor(nextRandom(r) * free.length)] ?? 0;
    visited[next] = true;
    edges.push(cur < next ? [cur, next] : [next, cur]);
    has.add(Math.min(cur, next) * n + Math.max(cur, next));
    stack.push(next);
  }
  const walls: [number, number][] = [];
  for (let id = 0; id < n; id += 1) {
    for (const v of neighbors(id)) if (v > id && !has.has(id * n + v)) walls.push([id, v]);
  }
  for (let t = 0; t < extra && walls.length > 0; t += 1) {
    const w = Math.floor(nextRandom(r) * walls.length);
    const wall = walls.splice(w, 1)[0];
    if (wall) edges.push(wall);
  }
  return { x, y, edges };
}

function nearest(p: RawPlate, px: number, py: number): number {
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < p.x.length; i += 1) {
    const d = Math.hypot((p.x[i] ?? 0) - px, (p.y[i] ?? 0) - py);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

export interface GeneratedPlate {
  id: PlateId;
  x: number[];
  y: number[];
  edges: [number, number][];
  fixedFoods: number[];
  blocked: number[];
  substanceEdges: number[];
  habituated: number[];
}

/** Semilla del generador elegida para cada placa: la mediana de las 9 medidas. */
const SEEDS: Record<PlateId, number> = { log: 79, maze: 79, archipelago: 41, bitterBridge: 83, fusion: 41 };

export function generatePlate(id: PlateId, index: number): GeneratedPlate {
  const s = prototypeMixSeed(SEEDS[id], index + 1);
  const raw =
    id === 'maze'
      ? mazePlate(7, 4, 5, s)
      : knnPlate(id === 'log' ? 5 : id === 'archipelago' ? 6 : 7, 4, 0.22, 4, s);
  const fixedFoods: number[] = [];
  const blocked: number[] = [];
  const substanceEdges: number[] = [];
  const habituated: number[] = [];
  const xs = raw.x;
  if (id === 'maze') fixedFoods.push(0, xs.length - 1);
  if (id === 'archipelago') {
    // Mar: un disco iluminado en la mitad central (como la bahía de Tokio) y una sierra en un borde.
    const r = rng(prototypeMixSeed(s, 77));
    const cx = 2 + nextRandom(r) * 2;
    const cy = 1.2 + nextRandom(r) * 1.6;
    const top = nextRandom(r) < 0.5;
    for (let i = 0; i < xs.length; i += 1) {
      const x = xs[i] ?? 0;
      const y = raw.y[i] ?? 0;
      const sea = Math.hypot(x - cx, y - cy) < 1.0;
      const mountain = (top ? y < 1 : y > 3) && x > 4.6;
      if (sea || mountain) blocked.push(i);
    }
  }
  if (id === 'bitterBridge') {
    raw.edges.forEach(([a, b], e) => {
      if (((xs[a] ?? 0) - 3.5) * ((xs[b] ?? 0) - 3.5) < 0) substanceEdges.push(e);
    });
  }
  if (id === 'fusion') {
    raw.edges.forEach((_, e) => substanceEdges.push(e));
    for (let i = 0; i < xs.length; i += 1) if ((xs[i] ?? 0) < 3.5) habituated.push(i);
  }
  if (id === 'bitterBridge' || id === 'fusion') fixedFoods.push(nearest(raw, 0.5, 2), nearest(raw, 6.5, 2));
  const round = (v: number): number => Math.round(v * 1000) / 1000;
  return {
    id,
    x: raw.x.map(round),
    y: raw.y.map(round),
    edges: raw.edges,
    fixedFoods,
    blocked,
    substanceEdges,
    habituated,
  };
}

/** Diferencias entre el generador y los datos del juego (vacío = coinciden). */
export function compareWithData(): string[] {
  const diffs: string[] = [];
  PLATES.forEach((def, index) => {
    const g = generatePlate(def.id, index);
    const fields = ['x', 'y', 'edges', 'fixedFoods', 'blocked', 'substanceEdges', 'habituated'] as const;
    for (const field of fields) {
      if (JSON.stringify(g[field]) !== JSON.stringify(def[field])) diffs.push(`${def.id}.${field}`);
    }
  });
  return diffs;
}

if (process.argv[1]?.endsWith('plasmodium-plates.ts')) {
  const diffs = compareWithData();
  console.log(
    diffs.length === 0 ? 'Las placas coinciden con el generador.' : `Distintas: ${diffs.join(', ')}`,
  );
  if (diffs.length > 0) process.exitCode = 1;
}

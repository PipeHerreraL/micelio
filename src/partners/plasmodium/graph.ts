/**
 * Grafo de una placa, construido una vez a partir de los datos fijos y memorizado: largos
 * normalizados, adyacencia CSR, luz fija, sustancia, distancias entre sitios y el alcance de una
 * lámpara. Más el espacio de trabajo del modelo, reservado una vez por placa: un paso del modelo
 * no crea objetos (AGENTS.md, Rendimiento).
 */
import { LAMP_RADIUS } from '../../data/plasmodium.ts';
import { PLATES, type PlateDef } from '../../data/plasmodium-plates.ts';

export interface PlateGraph {
  index: number;
  def: PlateDef;
  n: number;
  m: number;
  x: Float64Array;
  y: Float64Array;
  ea: Int32Array;
  eb: Int32Array;
  /** Largo de cada arista dividido por la media de la placa: el flujo no depende del tamaño. */
  len: Float64Array;
  adjStart: Int32Array;
  adjEdge: Int32Array;
  /** 1 si la arista toca un sitio con luz fija. */
  baseLight: Uint8Array;
  /** 1 si la arista lleva quinina o sal. */
  substance: Uint8Array;
  blocked: Uint8Array;
  fixed: Uint8Array;
  /** Distancia mínima por el grafo entre cada par de sitios (n·n): el cierre métrico. */
  dist: Float64Array;
  /** 1 si una lámpara en el sitio j alumbra al sitio i (n·n, distancia euclídea ≤ LAMP_RADIUS). */
  lampReach: Uint8Array;
  /** Espacio de trabajo del modelo (ver flow.ts y metrics.ts). */
  work: PlateWork;
}

export interface PlateWork {
  mat: Float64Array;
  rhs: Float64Array;
  pressure: Float64Array;
  /** Flujo con signo de la última fuente (para dibujar el vaivén). */
  flow: Float64Array;
  /** f(|Q|) del último paso. */
  response: Float64Array;
  light: Uint8Array;
  habNext: Float64Array;
  foods: Int32Array;
  parent: Int32Array;
  parent2: Int32Array;
  compEdges: Int32Array;
  compFoods: Int32Array;
  primBest: Float64Array;
  primIn: Uint8Array;
}

function shortestFrom(g: PlateGraph, src: number, out: Float64Array, offset: number): void {
  const n = g.n;
  const done = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) out[offset + i] = Number.POSITIVE_INFINITY;
  out[offset + src] = 0;
  for (let it = 0; it < n; it += 1) {
    let u = -1;
    for (let v = 0; v < n; v += 1) {
      if (!done[v] && (u < 0 || (out[offset + v] ?? 0) < (out[offset + u] ?? 0))) u = v;
    }
    if (u < 0 || out[offset + u] === Number.POSITIVE_INFINITY) break;
    done[u] = 1;
    for (let t = g.adjStart[u] ?? 0; t < (g.adjStart[u + 1] ?? 0); t += 1) {
      const e = g.adjEdge[t] ?? 0;
      const v = g.ea[e] === u ? (g.eb[e] ?? 0) : (g.ea[e] ?? 0);
      const nd = (out[offset + u] ?? 0) + (g.len[e] ?? 0);
      if (nd < (out[offset + v] ?? 0)) out[offset + v] = nd;
    }
  }
}

/** Construye el grafo de una placa. Exportado para las pruebas (grafos hechos a mano). */
export function buildPlateGraph(def: PlateDef, index: number): PlateGraph {
  const n = def.x.length;
  const m = def.edges.length;
  const x = Float64Array.from(def.x);
  const y = Float64Array.from(def.y);
  const ea = new Int32Array(m);
  const eb = new Int32Array(m);
  const len = new Float64Array(m);
  let total = 0;
  def.edges.forEach(([a, b], e) => {
    ea[e] = a;
    eb[e] = b;
    len[e] = Math.hypot((x[a] ?? 0) - (x[b] ?? 0), (y[a] ?? 0) - (y[b] ?? 0));
    total += len[e] ?? 0;
  });
  const mean = total / m;
  for (let e = 0; e < m; e += 1) len[e] = (len[e] ?? 0) / mean;
  const deg = new Int32Array(n + 1);
  for (let e = 0; e < m; e += 1) {
    deg[(ea[e] ?? 0) + 1] = (deg[(ea[e] ?? 0) + 1] ?? 0) + 1;
    deg[(eb[e] ?? 0) + 1] = (deg[(eb[e] ?? 0) + 1] ?? 0) + 1;
  }
  for (let i = 0; i < n; i += 1) deg[i + 1] = (deg[i + 1] ?? 0) + (deg[i] ?? 0);
  const adjStart = deg.slice();
  const fill = deg.slice();
  const adjEdge = new Int32Array(2 * m);
  for (let e = 0; e < m; e += 1) {
    for (const v of [ea[e] ?? 0, eb[e] ?? 0]) {
      adjEdge[fill[v] ?? 0] = e;
      fill[v] = (fill[v] ?? 0) + 1;
    }
  }
  const blocked = new Uint8Array(n);
  for (const i of def.blocked) blocked[i] = 1;
  const fixed = new Uint8Array(n);
  for (const i of def.fixedFoods) fixed[i] = 1;
  const baseLight = new Uint8Array(m);
  for (let e = 0; e < m; e += 1) if (blocked[ea[e] ?? 0] || blocked[eb[e] ?? 0]) baseLight[e] = 1;
  const substance = new Uint8Array(m);
  for (const e of def.substanceEdges) substance[e] = 1;
  const lampReach = new Uint8Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (Math.hypot((x[i] ?? 0) - (x[j] ?? 0), (y[i] ?? 0) - (y[j] ?? 0)) <= LAMP_RADIUS)
        lampReach[i * n + j] = 1;
    }
  }
  const work: PlateWork = {
    mat: new Float64Array(n * n),
    rhs: new Float64Array(n),
    pressure: new Float64Array(n),
    flow: new Float64Array(m),
    response: new Float64Array(m),
    light: new Uint8Array(m),
    habNext: new Float64Array(n),
    foods: new Int32Array(n),
    parent: new Int32Array(n),
    parent2: new Int32Array(n),
    compEdges: new Int32Array(m),
    compFoods: new Int32Array(n),
    primBest: new Float64Array(n),
    primIn: new Uint8Array(n),
  };
  const g: PlateGraph = {
    index,
    def,
    n,
    m,
    x,
    y,
    ea,
    eb,
    len,
    adjStart,
    adjEdge,
    baseLight,
    substance,
    blocked,
    fixed,
    dist: new Float64Array(n * n),
    lampReach,
    work,
  };
  for (let s = 0; s < n; s += 1) shortestFrom(g, s, g.dist, s * n);
  return g;
}

const graphs: (PlateGraph | undefined)[] = [];
const previewGraphs: (PlateGraph | undefined)[] = [];

/** Grafo de la placa `index`, construido la primera vez y reutilizado después (los datos son fijos). */
export function plateGraph(index: number): PlateGraph {
  let g = graphs[index];
  if (!g) {
    const def = PLATES[index];
    if (!def) throw new Error(`Placa desconocida: ${index}`);
    g = buildPlateGraph(def, index);
    graphs[index] = g;
  }
  return g;
}

/**
 * Otra copia del grafo de la placa, con su propio espacio de trabajo y su propia instantánea: las
 * previsualizaciones (Quimiotaxis, bot) no pisan la medida de la red de verdad.
 */
export function previewGraph(index: number): PlateGraph {
  let g = previewGraphs[index];
  if (!g) {
    const def = PLATES[index];
    if (!def) throw new Error(`Placa desconocida: ${index}`);
    g = buildPlateGraph(def, index);
    previewGraphs[index] = g;
  }
  return g;
}

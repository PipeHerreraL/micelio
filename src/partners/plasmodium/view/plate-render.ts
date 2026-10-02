/**
 * Lienzo de la placa del plasmodio (especificación de la fase 9, §13). Es decorativo y va
 * `aria-hidden`: lo que muestra está también en los sitios, el resumen y el objetivo de la vista.
 *
 * Mismo patrón que src/render/network.ts, con tres capas para que un frame cueste dos copias de
 * imagen y unos pocos caminos:
 * - fondo (corteza o agar, paredes del Laberinto, sustancias, luces y sitios vacíos): fuera de
 *   pantalla; se pinta al cambiar el tamaño, la placa, la colocación o las lámparas;
 * - red (velo de las aristas muertas, tubos y copos): fuera de pantalla; se rehace al cambiar la
 *   conductividad (un paso del modelo) como mucho cuatro veces por segundo, y al instante si
 *   cambia la colocación, la placa o la fusión;
 * - encima, en cada frame: el vaivén, la ola del pulso, el agar húmedo, los esporangios, el
 *   fantasma de la herramienta y el aro de la sugerencia. Todo vive en arreglos tipados reservados
 *   al crear el lienzo, con el tamaño de la placa más grande: dibujar no crea objetos.
 *
 * El azar del dibujo (vetas, vaivén) usa sus propias semillas (render/random.ts): mirar la placa
 * nunca avanza el azar del socio, y la misma placa se pinta igual al recargar.
 */
import { D_ALIVE, D_DRYING, LAMP_RADIUS } from '../../../data/plasmodium.ts';
import { FUSION_SPLIT_X, PLATES } from '../../../data/plasmodium-plates.ts';
import { createSeededRandom, mixSeed } from '../../../render/random.ts';
import type { PlasmodiumEvent } from '../events.ts';
import { plateGraph, type PlateGraph } from '../graph.ts';
import type { PlateSnapshot } from '../metrics.ts';
import type { PlasmodiumState, PlateRecord } from '../state.ts';
import { sitePosition, toScreen, type PlateLayout } from './plate-layout.ts';

export interface PlateRender {
  /** Recalcula el tamaño del lienzo (ResizeObserver y cambio de densidad). */
  resize(): void;
  /** Disposición (orientación, celda, tamaño en px CSS) que calcula la vista con computeLayout. */
  setLayout(layout: PlateLayout): void;
  /**
   * Estado del plasmodio y su medida, a 10 Hz. Rehace las capas solo si cambió algo (p.step, placa,
   * colocación, lámparas, moistFor > 0, mapa, snapshot.fused).
   */
  sync(p: Readonly<PlasmodiumState>, snap: Readonly<PlateSnapshot>): void;
  onEvent(event: PlasmodiumEvent): void;
  /** Cada frame, solo con la placa a la vista. */
  frame(now: number): void;
  setReducedMotion(on: boolean): void;
  /** Aro del sitio sugerido por la Quimiotaxis (null = ninguno). */
  setSuggestion(site: number | null): void;
  /** Fantasma de la herramienta bajo el puntero (40 % de opacidad); null = ninguno. */
  setHover(site: number | null, tool: 'food' | 'lamp' | 'remove' | null): void;
  destroy(): void;
}

type HoverTool = 'food' | 'lamp' | 'remove';

// ---------------------------------------------------------------------------------------
// Paleta (spec §13; contrastes medidos sobre el agar en la especificación). Cadenas fijas: un
// frame no construye colores.

const BARK = '#2c211a';
/** Vetas: un tono más claro y otro más oscuro que la corteza, para que se lean sin brillar. */
const BARK_GRAIN_LIGHT = '#3d2f25';
const BARK_GRAIN_DARK = '#1c1511';
const AGAR = '#1d1b16';
const AGAR_RIM = '#3a352b';
const WALL = '#4a4337';
/** Sombra de las paredes del Laberinto: el relieve sale de ella, no de un segundo color vivo. */
const WALL_SHADOW = '#0f0d0a';
const QUININE = '#8fb8e0';
const SALT = '#d8d4cc';
const LIGHT = '#f4f1e8';
/** Halo de las luces al 20 %. */
const HALO_ALPHA = 0.2;
const LIGHT_HALO = `rgba(244, 241, 232, ${HALO_ALPHA})`;
const LIGHT_CLEAR = 'rgba(244, 241, 232, 0)';
const SITE_RING = '#8c857a';
const MUCILAGE = '#6e6650';
const PLASMODIUM = '#f2d16b';
const FLAKE = '#e6d8b4';
/** Contorno fino de los copos: los separa de un tubo grueso del mismo tono cálido. */
const FLAKE_EDGE = '#7d6f52';
const BEAD = '#fbf1cf';
const WAVE = '#fff4d2';
const MOIST = '#b8efc4';
const STALK = '#8c857a';
const SPORE_HEAD = '#b9b2a6';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const SITE_RING_ALPHA = 0.5;
/** Un tubo que se seca (0,01 < D ≤ 0,05) se ve al 35 %; uno vivo nunca baja del 50 % (3,9:1). */
const DRYING_ALPHA = 0.35;
const ALIVE_MIN_ALPHA = 0.5;
const MOIST_ALPHA = 0.08;
const GHOST_ALPHA = 0.4;
const BEAD_ALPHA = 0.85;
const WAVE_ALPHA = 0.85;
const QUININE_ALPHA = 0.9;
/**
 * La sal cubre las 61 aristas de la Fusión: al 70 % el rayado tapaba los tubos que se secan (visto
 * en el navegador con la placa en el paso 1); la quinina, en 5 aristas, puede ir más opaca.
 */
const SALT_ALPHA = 0.55;
const FUSION_DOTS_ALPHA = 0.85;

const NO_DASH: number[] = [];
/** Aro discontinuo de la luz fija: la distingue de una lámpara del jugador sin depender del color. */
const FIXED_LIGHT_DASH: number[] = [2.5, 2.5];
/** Punteado interior de la Fusión: trazos casi nulos con extremo redondo dibujan puntos. */
const FUSION_DOTS: number[] = [0.1, 4];

// ---------------------------------------------------------------------------------------
// Geometría y ritmo

const TAU = Math.PI * 2;
const MAX_DPR = 2;
/** Por debajo de esto (en píxeles) no se dibuja: drawImage falla con lienzos vacíos. */
const MIN_PIXELS = 2;
/** Grosor de un tubo en px CSS: clamp(1, 6·D^¼, 6). */
const TUBE_MIN_PX = 1;
const TUBE_MAX_PX = 6;
const MUCILAGE_PX = 1;
/** Rayado de las sustancias: separación entre marcas y medio largo de cada una (px CSS). */
const HATCH_GAP = 7;
const HATCH_HALF = 4.5;
/** Vetas por fila de la corteza y tramos de cada una. */
const GRAIN_PER_ROW = 4;
const GRAIN_STEPS = 28;
const BARK_KNOTS = 2;
/** Rayos del aro de una luz. */
const LIGHT_RAYS = 8;
/** La red se rehace como mucho 4 veces por segundo (con el tiempo acelerado hay muchos pasos). */
const NET_MIN_MS = 250;
/** Un frame tras otro largo (pestaña recuperada) no hace saltar las cuentas. */
const MAX_DT = 0.1;

/** Vaivén (streaming de lanzadera): 48 cuentas que avanzan 0,15 largos/s × (0,5 + D). */
const BEAD_CAP = 48;
const BEAD_SPEED = 0.15;
/** El sentido global se invierte cada 60–120 s: en Physarum el flujo cambia cada 1–2 min. */
const SHUTTLE_MIN_S = 60;
const SHUTTLE_RANGE_S = 60;

/** Ola del pulso: 1,2 s desde los copos; como mucho un destello cada 3 s. */
const WAVE_MS = 1200;
const FLASH_GAP_MS = 3000;

/** Esporangios: dos por copo unido, 24 como mucho (12 copos unidos es el tope de un mapa). */
const SPORANGIA_CAP = 24;
const SPORANGIA_PER_FLAKE = 2;
const SPORANGIA_GROW_MS = 2000;
/** El tallo crece primero y la cabezuela se hincha al final. */
const STALK_SHARE = 0.6;
const HEAD_FROM = 0.45;

const BARK_SALT = 0xba4c;
const SHUTTLE_SALT = 0x5a77;
const SPORANGIA_SALT = 0x5904;

const MAX_SITES = Math.max(...PLATES.map((d) => d.x.length));
const MAX_EDGES = Math.max(...PLATES.map((d) => d.edges.length));
const NO_SITES: readonly number[] = [];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function smooth(t: number): number {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
}

/** Hagen–Poiseuille: la conductividad crece con la cuarta potencia del radio del tubo. */
function tubeWidth(d: number): number {
  return clamp(TUBE_MAX_PX * Math.max(0, d) ** 0.25, TUBE_MIN_PX, TUBE_MAX_PX);
}

/** Giro de un copo, fijo por sitio: los copos no parecen sellos repetidos. */
function flakeTilt(site: number): number {
  return (((site * 7) % 5) - 2) * 0.18;
}

function noop(): void {
  // Sin contexto 2D no hay nada que dibujar; la placa se juega igual con sus sitios.
}

function createInertRender(): PlateRender {
  return {
    resize: noop,
    setLayout: noop,
    sync: noop,
    onEvent: noop,
    frame: noop,
    setReducedMotion: noop,
    setSuggestion: noop,
    setHover: noop,
    destroy: noop,
  };
}

export function createPlateRender(canvas: HTMLCanvasElement): PlateRender {
  canvas.setAttribute('aria-hidden', 'true');
  const maybeCtx = canvas.getContext('2d');
  const bgCanvas = document.createElement('canvas');
  const netCanvas = document.createElement('canvas');
  const maybeBg = bgCanvas.getContext('2d');
  const maybeNet = netCanvas.getContext('2d');
  if (!maybeCtx || !maybeBg || !maybeNet) return createInertRender();
  const ctx = maybeCtx;
  const bg = maybeBg;
  const net = maybeNet;

  let destroyed = false;
  let ready = false;
  let dpr = 1;
  /** Tamaño del lienzo en píxeles de dispositivo; -1 hasta el primer resize (que siempre aplica). */
  let W = -1;
  let H = -1;
  /** Píxeles de dispositivo por px CSS en cada eje. */
  let kx = 1;
  let ky = 1;
  let layout: PlateLayout | null = null;
  /** Grafo de la placa de la disposición (la que se dibuja). */
  let graph: PlateGraph | null = null;
  let reducedMotion = false;

  // Geometría de la disposición, en px CSS.
  const siteX = new Float32Array(MAX_SITES);
  const siteY = new Float32Array(MAX_SITES);
  let siteR = 6;
  let flakeRx = 8;
  let flakeRy = 5.5;
  let lampR = 5;

  // Copia de la última lectura (de la placa abierta del estado).
  let statePlate = -1;
  let lastStep = -1;
  const cond = new Float64Array(MAX_EDGES);
  /** Aristas copiadas: 0 si la red del estado no corresponde a su placa (guardado reparado). */
  let condCount = 0;
  /** Copos de la placa: los fijos primero y luego los del jugador (el orden de flow.ts). */
  const flakeSites = new Int16Array(MAX_SITES);
  let flakeCount = 0;
  const lampSites = new Int16Array(MAX_SITES);
  let lampCount = 0;
  const joinedSites = new Int16Array(MAX_SITES);
  let joinedCount = 0;
  let moist = false;
  let hasMap = false;
  let fused = false;

  // Derivados de la red y de la colocación.
  const edgeWidth = new Float32Array(MAX_EDGES);
  /** Suma acumulada de D sobre los tubos vivos: elige aristas con peso D sin crear nada. */
  const liveCum = new Float64Array(MAX_EDGES);
  let liveTotal = 0;
  let lastLive = -1;
  /** +1 si el sentido «hacia fuera» de la arista va de ea a eb (alejándose del primer copo). */
  const edgeSign = new Int8Array(MAX_EDGES);
  /** Distancia por el grafo de cada sitio al copo más cercano: el frente de la ola. */
  const flakeDist = new Float64Array(MAX_SITES);
  let waveReach = 0;
  const siteKind = new Uint8Array(MAX_SITES);

  // Capas y redibujado.
  let bgDirty = true;
  let netDirty = true;
  /** La red se rehace sin esperar al tope de ritmo (acción del jugador, placa o fusión). */
  let netForce = true;
  let netBuiltAt = Number.NEGATIVE_INFINITY;
  let needsDraw = true;
  let lastAnimated = false;
  let lastNow = -1;

  // Vaivén.
  const beadEdge = new Int16Array(BEAD_CAP).fill(-1);
  const beadT = new Float32Array(BEAD_CAP);
  const drawRng = createSeededRandom(SHUTTLE_SALT);
  const grainRng = createSeededRandom(BARK_SALT);
  let shuttleDir = 1;
  let shuttleClock = 0;
  let shuttlePeriod = SHUTTLE_MIN_S;

  // Ola del pulso.
  let wavePending = false;
  let waveStart = -1;
  let lastFlashAt = Number.NEGATIVE_INFINITY;

  // Esporangios.
  const spBaseX = new Float32Array(SPORANGIA_CAP);
  const spBaseY = new Float32Array(SPORANGIA_CAP);
  const spDx = new Float32Array(SPORANGIA_CAP);
  const spDy = new Float32Array(SPORANGIA_CAP);
  const spHeadR = new Float32Array(SPORANGIA_CAP);
  let spCount = 0;
  /** La fructificación se anima una vez por placa; al volver a una placa con mapa ya están. */
  let fruitedHere = false;
  let growPending = false;
  let growStart = -1;

  // Puntero y sugerencia.
  let suggestion = -1;
  let hoverSite = -1;
  let hoverTool: HoverTool | null = null;

  // -------------------------------------------------------------------------------------
  // Lectura del estado

  /** La red copiada es de la placa que se dibuja. */
  function samePlate(): boolean {
    return layout !== null && graph !== null && statePlate === layout.plate && condCount === graph.m;
  }

  function nextShuttlePeriod(): number {
    return SHUTTLE_MIN_S + SHUTTLE_RANGE_S * drawRng.next();
  }

  function resetPlate(plate: number): void {
    statePlate = plate;
    condCount = 0;
    lastStep = -1;
    joinedCount = 0;
    spCount = 0;
    hasMap = false;
    fruitedHere = false;
    growPending = false;
    growStart = -1;
    wavePending = false;
    waveStart = -1;
    beadEdge.fill(-1);
    drawRng.reset(mixSeed(SHUTTLE_SALT, plate));
    shuttleDir = 1;
    shuttleClock = 0;
    shuttlePeriod = nextShuttlePeriod();
    bgDirty = true;
    netDirty = true;
    netForce = true;
    needsDraw = true;
  }

  /** Posición siguiente a la última copia de copySites. */
  let copyEnd = 0;

  /** Copia una lista de sitios en `out` desde la posición `at`; true si cambió alguno. */
  function copySites(out: Int16Array, at: number, sites: readonly number[], n: number): boolean {
    let count = at;
    let changed = false;
    for (let k = 0; k < sites.length; k += 1) {
      const site = sites[k] ?? -1;
      if (site < 0 || site >= n) continue;
      if (out[count] !== site) {
        out[count] = site;
        changed = true;
      }
      count += 1;
    }
    copyEnd = count;
    return changed;
  }

  /** Copia copos y lámparas de la placa abierta; true si cambió la colocación. */
  function copyPlacement(g: PlateGraph, record: PlateRecord | undefined): boolean {
    let changed = copySites(flakeSites, 0, g.def.fixedFoods, g.n);
    changed = copySites(flakeSites, copyEnd, record?.foods ?? NO_SITES, g.n) || changed;
    const flakes = copyEnd;
    changed = copySites(lampSites, 0, record?.lamps ?? NO_SITES, g.n) || changed;
    const lamps = copyEnd;
    changed = changed || flakes !== flakeCount || lamps !== lampCount;
    flakeCount = flakes;
    lampCount = lamps;
    return changed;
  }

  function isFlake(site: number): boolean {
    for (let k = 0; k < flakeCount; k += 1) if (flakeSites[k] === site) return true;
    return false;
  }

  /**
   * Copos de la componente principal. `measure` los deja en `work.compFoods` (tantos como
   * `snap.joined`); leerlos de ahí evita escribir dos veces la regla de qué copos están unidos.
   * Se filtran contra la colocación copiada por si la medida llegara de otra lectura.
   */
  function copyJoined(g: PlateGraph, joined: number): boolean {
    const comp = g.work.compFoods;
    const count = Math.min(Math.max(0, joined), flakeCount, comp.length);
    let next = 0;
    let changed = false;
    for (let k = 0; k < count; k += 1) {
      const site = comp[k] ?? -1;
      if (!isFlake(site)) continue;
      if (joinedSites[next] !== site) {
        joinedSites[next] = site;
        changed = true;
      }
      next += 1;
    }
    if (next !== joinedCount) changed = true;
    joinedCount = next;
    return changed;
  }

  /** Grosores y pesos del vaivén: al cambiar la conductividad. */
  function refreshTubes(): void {
    liveTotal = 0;
    lastLive = -1;
    for (let e = 0; e < condCount; e += 1) {
      const d = cond[e] ?? 0;
      edgeWidth[e] = tubeWidth(d);
      if (d > D_ALIVE) {
        liveTotal += d;
        lastLive = e;
      }
      liveCum[e] = liveTotal;
    }
  }

  /**
   * Sentido global del vaivén: «hacia fuera» es alejarse del primer copo por el grafo. Así todas
   * las cuentas van a la vez hacia fuera o hacia dentro, como la lanzadera de un plasmodio real.
   */
  function orientEdges(g: PlateGraph): void {
    const ref = flakeCount > 0 ? (flakeSites[0] ?? 0) : 0;
    for (let e = 0; e < g.m; e += 1) {
      const da = g.dist[ref * g.n + (g.ea[e] ?? 0)] ?? 0;
      const db = g.dist[ref * g.n + (g.eb[e] ?? 0)] ?? 0;
      edgeSign[e] = da <= db ? 1 : -1;
    }
  }

  function measureFlakeDistances(g: PlateGraph): void {
    waveReach = 0;
    for (let i = 0; i < g.n; i += 1) {
      let best = Number.POSITIVE_INFINITY;
      for (let k = 0; k < flakeCount; k += 1) {
        const d = g.dist[(flakeSites[k] ?? 0) * g.n + i] ?? Number.POSITIVE_INFINITY;
        if (d < best) best = d;
      }
      flakeDist[i] = best;
      if (Number.isFinite(best) && best > waveReach) waveReach = best;
    }
  }

  function startGrowth(): void {
    if (fruitedHere) return;
    fruitedHere = true;
    growStart = -1;
    growPending = !reducedMotion;
    needsDraw = true;
  }

  // -------------------------------------------------------------------------------------
  // Geometría

  function updateScale(): void {
    const l = layout;
    kx = l && l.width > 0 ? W / l.width : dpr;
    ky = l && l.height > 0 ? H / l.height : dpr;
  }

  function layoutSporangia(): void {
    spCount = 0;
    const l = layout;
    if (!l) return;
    const height = clamp(l.cell * 0.3, 10, 26);
    const head = clamp(l.cell * 0.05, 2, 4.5);
    for (let k = 0; k < joinedCount && spCount < SPORANGIA_CAP; k += 1) {
      const site = joinedSites[k] ?? 0;
      const x = siteX[site] ?? 0;
      const y = siteY[site] ?? 0;
      for (let j = 0; j < SPORANGIA_PER_FLAKE && spCount < SPORANGIA_CAP; j += 1) {
        // Variación fija por sitio (sin azar con estado): el mismo copo da los mismos esporangios.
        const hash = mixSeed(SPORANGIA_SALT + site, j);
        const u1 = (hash & 0xffff) / 0xffff;
        const u2 = (hash >>> 16) / 0xffff;
        const side = j === 0 ? -1 : 1;
        const len = height * (0.75 + 0.35 * u2);
        const dx = side * len * (0.1 + 0.25 * u1);
        spBaseX[spCount] = x + side * flakeRx * (0.15 + 0.3 * u1);
        spBaseY[spCount] = y - flakeRy * 0.2;
        spDx[spCount] = dx;
        spDy[spCount] = -Math.sqrt(Math.max(0, len * len - dx * dx));
        spHeadR[spCount] = head * (0.85 + 0.3 * u2);
        spCount += 1;
      }
    }
  }

  // -------------------------------------------------------------------------------------
  // Fondo

  function paintBark(l: PlateLayout, g: PlateGraph): void {
    const def = g.def;
    bg.fillStyle = BARK;
    bg.fillRect(0, 0, l.width, l.height);
    grainRng.reset(mixSeed(l.plate, BARK_SALT));
    bg.lineCap = 'round';
    bg.lineJoin = 'round';
    const lines = def.rows * GRAIN_PER_ROW;
    for (let k = 0; k < lines; k += 1) {
      const v0 = ((k + 0.2 + 0.6 * grainRng.next()) / lines) * def.rows;
      const amp = 0.03 + 0.07 * grainRng.next();
      const freq = 0.6 + 1.6 * grainRng.next();
      const phase = grainRng.next() * TAU;
      const amp2 = 0.01 + 0.025 * grainRng.next();
      const phase2 = grainRng.next() * TAU;
      const u0 = grainRng.next() * def.cols * 0.25;
      const u1 = def.cols - grainRng.next() * def.cols * 0.25;
      bg.beginPath();
      for (let s = 0; s <= GRAIN_STEPS; s += 1) {
        const u = u0 + ((u1 - u0) * s) / GRAIN_STEPS;
        const v = clamp(
          v0 + amp * Math.sin(freq * u + phase) + amp2 * Math.sin(4.3 * freq * u + phase2),
          0.04,
          def.rows - 0.04,
        );
        const pt = toScreen(l, u, v);
        if (s === 0) bg.moveTo(pt.x, pt.y);
        else bg.lineTo(pt.x, pt.y);
      }
      bg.strokeStyle = k % 3 === 0 ? BARK_GRAIN_DARK : BARK_GRAIN_LIGHT;
      bg.lineWidth = 0.8 + 1.4 * grainRng.next();
      bg.stroke();
    }
    // Nudos: elipses a lo largo de la veta (en la vertical, la veta va de arriba abajo).
    const rotation = l.orientation === 'landscape' ? 0 : Math.PI / 2;
    bg.strokeStyle = BARK_GRAIN_DARK;
    bg.lineWidth = 1.5;
    for (let k = 0; k < BARK_KNOTS; k += 1) {
      const u = (0.15 + 0.7 * grainRng.next()) * def.cols;
      const v = (0.15 + 0.7 * grainRng.next()) * def.rows;
      const pt = toScreen(l, u, v);
      const rx = l.cell * (0.22 + 0.1 * grainRng.next());
      bg.beginPath();
      bg.ellipse(pt.x, pt.y, rx, rx * 0.42, rotation, 0, TAU);
      bg.moveTo(pt.x + rx * 0.5, pt.y);
      bg.ellipse(pt.x, pt.y, rx * 0.5, rx * 0.2, rotation, 0, TAU);
      bg.stroke();
    }
  }

  function paintAgar(l: PlateLayout): void {
    bg.fillStyle = AGAR;
    bg.fillRect(0, 0, l.width, l.height);
    bg.strokeStyle = AGAR_RIM;
    bg.lineWidth = 2;
    bg.strokeRect(1, 1, l.width - 2, l.height - 2);
  }

  function hasEdge(g: PlateGraph, a: number, b: number): boolean {
    for (let t = g.adjStart[a] ?? 0; t < (g.adjStart[a + 1] ?? 0); t += 1) {
      const e = g.adjEdge[t] ?? 0;
      const other = g.ea[e] === a ? g.eb[e] : g.ea[e];
      if (other === b) return true;
    }
    return false;
  }

  /** Laberinto: una pared en relieve entre cada par de celdas vecinas sin arista. */
  function paintWalls(l: PlateLayout, g: PlateGraph): void {
    const { cols, rows } = g.def;
    if (g.n !== cols * rows) return;
    bg.beginPath();
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = r * cols + c;
        if (c + 1 < cols && !hasEdge(g, i, i + 1)) {
          const p0 = toScreen(l, c + 1, r);
          const p1 = toScreen(l, c + 1, r + 1);
          bg.moveTo(p0.x, p0.y);
          bg.lineTo(p1.x, p1.y);
        }
        if (r + 1 < rows && !hasEdge(g, i, i + cols)) {
          const p0 = toScreen(l, c, r + 1);
          const p1 = toScreen(l, c + 1, r + 1);
          bg.moveTo(p0.x, p0.y);
          bg.lineTo(p1.x, p1.y);
        }
      }
    }
    bg.lineCap = 'round';
    bg.lineWidth = clamp(l.cell * 0.08, 3, 7);
    bg.strokeStyle = WALL;
    // La sombra va en píxeles de dispositivo: no la escala la transformación.
    bg.shadowColor = WALL_SHADOW;
    bg.shadowBlur = 0;
    bg.shadowOffsetX = 1.2 * kx;
    bg.shadowOffsetY = 1.8 * ky;
    bg.stroke();
    bg.shadowColor = TRANSPARENT;
    bg.shadowOffsetX = 0;
    bg.shadowOffsetY = 0;
  }

  /**
   * Rayado sobre las aristas con sustancia (rayado y no solo color): marcas perpendiculares para
   * la quinina y diagonales para la sal, lejos de los aros de los sitios.
   */
  function paintSubstance(g: PlateGraph, quinine: boolean): void {
    bg.beginPath();
    const margin = Math.max(siteR, flakeRx) + 3;
    for (let e = 0; e < g.m; e += 1) {
      if (!g.substance[e]) continue;
      const ax = siteX[g.ea[e] ?? 0] ?? 0;
      const ay = siteY[g.ea[e] ?? 0] ?? 0;
      const bx = siteX[g.eb[e] ?? 0] ?? 0;
      const by = siteY[g.eb[e] ?? 0] ?? 0;
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1) continue;
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      const hx = (quinine ? -uy : (-uy + ux) * Math.SQRT1_2) * HATCH_HALF;
      const hy = (quinine ? ux : (ux + uy) * Math.SQRT1_2) * HATCH_HALF;
      for (let s = margin; s <= len - margin; s += HATCH_GAP) {
        const px = ax + ux * s;
        const py = ay + uy * s;
        bg.moveTo(px - hx, py - hy);
        bg.lineTo(px + hx, py + hy);
      }
    }
    bg.lineCap = 'butt';
    bg.lineWidth = quinine ? 1.4 : 1.1;
    bg.strokeStyle = quinine ? QUININE : SALT;
    bg.globalAlpha = quinine ? QUININE_ALPHA : SALT_ALPHA;
    bg.stroke();
    bg.globalAlpha = 1;
  }

  /** Aro con rayos de una luz (lámpara o luz fija); sin halo, para el fantasma también. */
  function strokeLight(c: CanvasRenderingContext2D, x: number, y: number, fixedLight: boolean): void {
    c.lineWidth = 1.5;
    c.strokeStyle = LIGHT;
    c.setLineDash(fixedLight ? FIXED_LIGHT_DASH : NO_DASH);
    c.beginPath();
    c.arc(x, y, lampR, 0, TAU);
    c.stroke();
    c.setLineDash(NO_DASH);
    c.lineCap = 'round';
    c.beginPath();
    const inner = lampR + 2;
    const outer = inner + lampR * 0.9;
    const offset = fixedLight ? TAU / (LIGHT_RAYS * 2) : 0;
    for (let k = 0; k < LIGHT_RAYS; k += 1) {
      const angle = offset + (k * TAU) / LIGHT_RAYS;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      c.moveTo(x + cos * inner, y + sin * inner);
      c.lineTo(x + cos * outer, y + sin * outer);
    }
    c.stroke();
  }

  /** Halo al 20 % hasta el alcance de una lámpara (LAMP_RADIUS celdas). */
  function paintLight(l: PlateLayout, site: number, fixedLight: boolean): void {
    const x = siteX[site] ?? 0;
    const y = siteY[site] ?? 0;
    const reach = LAMP_RADIUS * l.cell;
    const halo = bg.createRadialGradient(x, y, 0, x, y, reach);
    halo.addColorStop(0, LIGHT_HALO);
    halo.addColorStop(1, LIGHT_CLEAR);
    bg.fillStyle = halo;
    bg.beginPath();
    bg.arc(x, y, reach, 0, TAU);
    bg.fill();
    strokeLight(bg, x, y, fixedLight);
  }

  function paintBackground(l: PlateLayout, g: PlateGraph): void {
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalAlpha = 1;
    bg.clearRect(0, 0, W, H);
    bg.setTransform(kx, 0, 0, ky, 0, 0);
    if (g.def.id === 'log') paintBark(l, g);
    else paintAgar(l);
    if (g.def.grid) paintWalls(l, g);
    if (g.def.substance !== 'none') paintSubstance(g, g.def.substance === 'quinine');

    // Qué hay en cada sitio: 0 vacío, 1 copo, 2 lámpara, 3 luz fija.
    siteKind.fill(0);
    for (const s of g.def.blocked) siteKind[s] = 3;
    for (const s of g.def.fixedFoods) siteKind[s] = 1;
    if (statePlate === l.plate) {
      for (let k = 0; k < flakeCount; k += 1) siteKind[flakeSites[k] ?? 0] = 1;
      for (let k = 0; k < lampCount; k += 1) siteKind[lampSites[k] ?? 0] = 2;
    }
    for (let i = 0; i < g.n; i += 1) {
      const kind = siteKind[i] ?? 0;
      if (kind === 2 || kind === 3) paintLight(l, i, kind === 3);
    }
    bg.beginPath();
    for (let i = 0; i < g.n; i += 1) {
      if (siteKind[i] !== 0) continue;
      const x = siteX[i] ?? 0;
      const y = siteY[i] ?? 0;
      bg.moveTo(x + siteR, y);
      bg.arc(x, y, siteR, 0, TAU);
    }
    bg.lineWidth = 1.25;
    bg.strokeStyle = SITE_RING;
    bg.globalAlpha = SITE_RING_ALPHA;
    bg.stroke();
    bg.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------------------
  // Red

  function drawFlake(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    tilt: number,
    fixedFlake: boolean,
    alpha: number,
  ): void {
    c.globalAlpha = alpha;
    c.beginPath();
    c.ellipse(x, y, flakeRx, flakeRy, tilt, 0, TAU);
    c.fillStyle = FLAKE;
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = FLAKE_EDGE;
    c.stroke();
    if (fixedFlake) {
      // Doble contorno: el copo es de la placa y no se puede quitar.
      c.beginPath();
      c.ellipse(x, y, flakeRx + 3, flakeRy + 3, tilt, 0, TAU);
      c.lineWidth = 1.25;
      c.strokeStyle = FLAKE;
      c.stroke();
    }
  }

  function segment(c: CanvasRenderingContext2D, g: PlateGraph, e: number): void {
    const a = g.ea[e] ?? 0;
    const b = g.eb[e] ?? 0;
    c.moveTo(siteX[a] ?? 0, siteY[a] ?? 0);
    c.lineTo(siteX[b] ?? 0, siteY[b] ?? 0);
  }

  function paintNetwork(l: PlateLayout, g: PlateGraph): void {
    net.setTransform(1, 0, 0, 1, 0, 0);
    net.globalAlpha = 1;
    net.clearRect(0, 0, W, H);
    net.setTransform(kx, 0, 0, ky, 0, 0);
    net.lineCap = 'round';
    const same = samePlate();
    if (same) {
      // Mucílago: todas las aristas empezaron vivas, así que una muerta es zona abandonada.
      net.beginPath();
      for (let e = 0; e < condCount; e += 1) if ((cond[e] ?? 0) <= D_DRYING) segment(net, g, e);
      net.lineWidth = MUCILAGE_PX;
      net.strokeStyle = MUCILAGE;
      net.stroke();

      net.strokeStyle = PLASMODIUM;
      for (let e = 0; e < condCount; e += 1) {
        const d = cond[e] ?? 0;
        if (d <= D_DRYING) continue;
        net.globalAlpha = d <= D_ALIVE ? DRYING_ALPHA : Math.min(1, ALIVE_MIN_ALPHA + d);
        net.lineWidth = edgeWidth[e] ?? TUBE_MIN_PX;
        net.beginPath();
        segment(net, g, e);
        net.stroke();
      }
      net.globalAlpha = 1;

      if (g.def.substance === 'salt' && !fused) {
        // Fusión: los tubos de la mitad derecha llevan un punteado hasta que los dos se funden.
        net.setLineDash(FUSION_DOTS);
        net.strokeStyle = AGAR;
        net.globalAlpha = FUSION_DOTS_ALPHA;
        for (let e = 0; e < condCount; e += 1) {
          if ((cond[e] ?? 0) <= D_DRYING) continue;
          const a = g.ea[e] ?? 0;
          const b = g.eb[e] ?? 0;
          if ((g.x[a] ?? 0) < FUSION_SPLIT_X && (g.x[b] ?? 0) < FUSION_SPLIT_X) continue;
          net.lineWidth = Math.max(1, (edgeWidth[e] ?? TUBE_MIN_PX) * 0.4);
          net.beginPath();
          segment(net, g, e);
          net.stroke();
        }
        net.setLineDash(NO_DASH);
        net.globalAlpha = 1;
      }
    }
    // Copos: los fijos siempre (son de la placa); los del jugador, si la colocación es de esta placa.
    for (const s of g.def.fixedFoods) drawFlake(net, siteX[s] ?? 0, siteY[s] ?? 0, flakeTilt(s), true, 1);
    if (statePlate === l.plate) {
      for (let k = g.def.fixedFoods.length; k < flakeCount; k += 1) {
        const s = flakeSites[k] ?? 0;
        drawFlake(net, siteX[s] ?? 0, siteY[s] ?? 0, flakeTilt(s), false, 1);
      }
    }
    net.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------------------
  // Cada frame

  function pickLiveEdge(): number {
    if (liveTotal <= 0) return -1;
    const u = drawRng.next() * liveTotal;
    for (let e = 0; e < condCount; e += 1) if ((liveCum[e] ?? 0) > u) return e;
    return lastLive;
  }

  function stepAndDrawBeads(g: PlateGraph, dt: number): void {
    shuttleClock += dt;
    if (shuttleClock >= shuttlePeriod) {
      shuttleClock = 0;
      shuttleDir = -shuttleDir;
      shuttlePeriod = nextShuttlePeriod();
    }
    ctx.beginPath();
    for (let i = 0; i < BEAD_CAP; i += 1) {
      let e = beadEdge[i] ?? -1;
      let t = beadT[i] ?? 0;
      if (e < 0 || (cond[e] ?? 0) <= D_ALIVE) {
        e = pickLiveEdge();
        t = drawRng.next();
      } else {
        t += shuttleDir * (edgeSign[e] ?? 1) * BEAD_SPEED * (0.5 + (cond[e] ?? 0)) * dt;
        if (t < 0 || t > 1) {
          // Sale por un extremo: entra por el extremo de origen de otro tubo elegido con peso D.
          e = pickLiveEdge();
          t = shuttleDir * (edgeSign[e] ?? 1) > 0 ? 0 : 1;
        }
      }
      beadEdge[i] = e;
      beadT[i] = t;
      if (e < 0) continue;
      const a = g.ea[e] ?? 0;
      const b = g.eb[e] ?? 0;
      const ax = siteX[a] ?? 0;
      const ay = siteY[a] ?? 0;
      const x = ax + ((siteX[b] ?? 0) - ax) * t;
      const y = ay + ((siteY[b] ?? 0) - ay) * t;
      const r = clamp((edgeWidth[e] ?? TUBE_MIN_PX) * 0.38, 1, 2.3);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.globalAlpha = BEAD_ALPHA;
    ctx.fillStyle = BEAD;
    ctx.fill();
  }

  /** Punto del frente a la fracción `s` de la arista `e`, contada desde `from`. */
  function addFront(e: number, from: number, to: number, s: number): void {
    if (s < 0 || s > 1) return;
    const fx = siteX[from] ?? 0;
    const fy = siteY[from] ?? 0;
    const x = fx + ((siteX[to] ?? 0) - fx) * s;
    const y = fy + ((siteY[to] ?? 0) - fy) * s;
    const r = (edgeWidth[e] ?? TUBE_MIN_PX) * 0.5 + 2;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }

  /** El frente avanza por distancia en el grafo desde el copo más cercano: llega a todo en 1,2 s. */
  function drawWave(g: PlateGraph, now: number): void {
    const t = (now - waveStart) / WAVE_MS;
    if (t >= 1) {
      waveStart = -1;
      return;
    }
    if (t < 0) return;
    const front = t * waveReach;
    ctx.beginPath();
    for (let e = 0; e < condCount; e += 1) {
      if ((cond[e] ?? 0) <= D_DRYING) continue;
      const a = g.ea[e] ?? 0;
      const b = g.eb[e] ?? 0;
      const len = g.len[e] ?? 1;
      if (len <= 0) continue;
      addFront(e, a, b, (front - (flakeDist[a] ?? 0)) / len);
      addFront(e, b, a, (front - (flakeDist[b] ?? 0)) / len);
    }
    ctx.globalAlpha = WAVE_ALPHA * (1 - t);
    ctx.fillStyle = WAVE;
    ctx.fill();
  }

  function sporangiaGrowth(now: number): number {
    if (growStart < 0) return 1;
    const t = (now - growStart) / SPORANGIA_GROW_MS;
    if (t >= 1) {
      growStart = -1;
      return 1;
    }
    return clamp(t, 0, 1);
  }

  function drawSporangia(growth: number): void {
    const stalk = smooth(growth / STALK_SHARE);
    const head = smooth((growth - HEAD_FROM) / (1 - HEAD_FROM));
    if (stalk <= 0) return;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let k = 0; k < spCount; k += 1) {
      const x = spBaseX[k] ?? 0;
      const y = spBaseY[k] ?? 0;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (spDx[k] ?? 0) * stalk, y + (spDy[k] ?? 0) * stalk);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = STALK;
    ctx.stroke();
    if (head <= 0) return;
    ctx.beginPath();
    for (let k = 0; k < spCount; k += 1) {
      const x = (spBaseX[k] ?? 0) + (spDx[k] ?? 0);
      const y = (spBaseY[k] ?? 0) + (spDy[k] ?? 0);
      const r = (spHeadR[k] ?? 2) * head;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fillStyle = SPORE_HEAD;
    ctx.fill();
  }

  function drawHover(l: PlateLayout, g: PlateGraph): void {
    if (hoverTool === null || hoverSite < 0 || hoverSite >= g.n) return;
    const x = siteX[hoverSite] ?? 0;
    const y = siteY[hoverSite] ?? 0;
    if (hoverTool === 'food') {
      drawFlake(ctx, x, y, flakeTilt(hoverSite), false, GHOST_ALPHA);
    } else if (hoverTool === 'lamp') {
      // Sin degradado (crearía un objeto por frame): un disco plano, más tenue que el halo porque
      // no se desvanece hacia el borde.
      ctx.globalAlpha = GHOST_ALPHA * HALO_ALPHA * 0.5;
      ctx.fillStyle = LIGHT;
      ctx.beginPath();
      ctx.arc(x, y, LAMP_RADIUS * l.cell, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = GHOST_ALPHA;
      strokeLight(ctx, x, y, false);
    } else {
      const r = Math.max(siteR, flakeRx * 0.8);
      ctx.globalAlpha = GHOST_ALPHA;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = LIGHT;
      ctx.beginPath();
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Aro doble de la sugerencia de la Quimiotaxis: forma, no solo color. */
  function drawSuggestion(g: PlateGraph): void {
    if (suggestion < 0 || suggestion >= g.n) return;
    const x = siteX[suggestion] ?? 0;
    const y = siteY[suggestion] ?? 0;
    const r1 = Math.max(siteR, flakeRx) + 4;
    const r2 = r1 + 4;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PLASMODIUM;
    ctx.beginPath();
    ctx.moveTo(x + r1, y);
    ctx.arc(x, y, r1, 0, TAU);
    ctx.moveTo(x + r2, y);
    ctx.arc(x, y, r2, 0, TAU);
    ctx.stroke();
  }

  // -------------------------------------------------------------------------------------
  // Interfaz pública

  const render: PlateRender = {
    resize() {
      if (destroyed) return;
      const l = layout;
      const nextDpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      // Un lienzo de 0 px (pestaña o panel ocultos) no dibuja nada hasta tener tamaño.
      const shown = l !== null && rect.width >= 1 && rect.height >= 1;
      const nextW = shown ? Math.max(0, Math.round(l.width * nextDpr)) : 0;
      const nextH = shown ? Math.max(0, Math.round(l.height * nextDpr)) : 0;
      if (nextW === W && nextH === H && nextDpr === dpr) return;
      W = nextW;
      H = nextH;
      dpr = nextDpr;
      canvas.width = W;
      canvas.height = H;
      ready = W >= MIN_PIXELS && H >= MIN_PIXELS;
      bgCanvas.width = ready ? W : 0;
      bgCanvas.height = ready ? H : 0;
      netCanvas.width = ready ? W : 0;
      netCanvas.height = ready ? H : 0;
      updateScale();
      bgDirty = true;
      netDirty = true;
      netForce = true;
      needsDraw = true;
    },

    setLayout(next) {
      if (destroyed) return;
      const prev = layout;
      if (
        prev &&
        prev.plate === next.plate &&
        prev.orientation === next.orientation &&
        prev.list === next.list &&
        prev.cell === next.cell &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        render.resize();
        return;
      }
      const l: PlateLayout = { ...next };
      layout = l;
      const g = plateGraph(l.plate);
      graph = g;
      for (let i = 0; i < g.n; i += 1) {
        const pos = sitePosition(l, i);
        siteX[i] = pos.x;
        siteY[i] = pos.y;
      }
      siteR = clamp(l.cell * 0.09, 3.5, 8);
      flakeRx = clamp(l.cell * 0.16, 5, 13);
      flakeRy = flakeRx * 0.68;
      lampR = clamp(l.cell * 0.085, 3.5, 7);
      // El lienzo mide lo mismo que la capa de sitios (posiciones en %): el dibujo y los botones
      // coinciden aunque la placa vaya girada.
      canvas.style.width = `${l.width}px`;
      canvas.style.height = `${l.height}px`;
      layoutSporangia();
      bgDirty = true;
      netDirty = true;
      netForce = true;
      needsDraw = true;
      render.resize();
      updateScale();
    },

    sync(p, snap) {
      if (destroyed) return;
      const g = plateGraph(p.plate);
      const plateChanged = p.plate !== statePlate;
      if (plateChanged) resetPlate(p.plate);
      const record = p.plates[p.plate];

      const D = p.conductivity;
      const m = D.length === g.m ? g.m : 0;
      let condChanged = m !== condCount;
      for (let e = 0; e < m; e += 1) {
        const d = D[e] ?? 0;
        if (cond[e] !== d) {
          cond[e] = d;
          condChanged = true;
        }
      }
      condCount = m;

      const placementChanged = copyPlacement(g, record);
      if (placementChanged || plateChanged) {
        orientEdges(g);
        measureFlakeDistances(g);
        bgDirty = true;
        netDirty = true;
        netForce = true;
      }
      if (condChanged) refreshTubes();
      if (condChanged || p.step !== lastStep) netDirty = true;
      lastStep = p.step;

      if (snap.fused !== fused) {
        fused = snap.fused;
        netDirty = true;
        netForce = true;
      }
      if (copyJoined(g, snap.joined)) {
        layoutSporangia();
        needsDraw = true;
      }

      const nextMap = (record?.map ?? null) !== null;
      if (nextMap !== hasMap) {
        hasMap = nextMap;
        // Placa recién abierta con mapa: los esporangios ya están. Mapa nuevo en esta placa: crecen.
        if (!nextMap) fruitedHere = false;
        else if (plateChanged) fruitedHere = true;
        else startGrowth();
        needsDraw = true;
      }
      const nextMoist = p.moistFor > 0;
      if (nextMoist !== moist) {
        moist = nextMoist;
        needsDraw = true;
      }
    },

    onEvent(event) {
      if (destroyed) return;
      switch (event.kind) {
        case 'pulse':
          if (!reducedMotion) wavePending = true;
          break;
        case 'fruited':
          if (event.plate === statePlate) startGrowth();
          break;
        case 'plateOpened':
        case 'reset':
          netDirty = true;
          netForce = true;
          break;
        default:
          break;
      }
    },

    frame(now) {
      if (destroyed) return;
      const dt = lastNow < 0 ? 0 : Math.min(MAX_DT, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      const l = layout;
      const g = graph;
      if (!ready || !l || !g) {
        // Sin lienzo no se ve: un pulso de ahora no debe estallar cuando vuelva a verse.
        wavePending = false;
        return;
      }
      if (bgDirty) {
        paintBackground(l, g);
        bgDirty = false;
        needsDraw = true;
      }
      if (netDirty && (netForce || now - netBuiltAt >= NET_MIN_MS)) {
        paintNetwork(l, g);
        netDirty = false;
        netForce = false;
        netBuiltAt = now;
        needsDraw = true;
      }
      const same = samePlate();
      if (wavePending) {
        wavePending = false;
        if (!reducedMotion && same && flakeCount > 0 && now - lastFlashAt >= FLASH_GAP_MS) {
          waveStart = now;
          lastFlashAt = now;
        }
      }
      if (growPending) {
        growPending = false;
        growStart = reducedMotion ? -1 : now;
      }
      if (!same) waveStart = -1;

      const beads = !reducedMotion && same && liveTotal > 0;
      const waving = waveStart >= 0;
      const growing = growStart >= 0 && hasMap && same;
      const animated = beads || waving || growing;
      // Un frame más tras la última animación borra su rastro; después, nada que redibujar.
      if (!animated && !needsDraw && !lastAnimated) return;
      lastAnimated = animated;
      needsDraw = false;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(bgCanvas, 0, 0);
      ctx.drawImage(netCanvas, 0, 0);
      ctx.setTransform(kx, 0, 0, ky, 0, 0);
      if (moist) {
        ctx.globalAlpha = MOIST_ALPHA;
        ctx.fillStyle = MOIST;
        ctx.fillRect(0, 0, l.width, l.height);
      }
      if (beads) stepAndDrawBeads(g, dt);
      if (waving) drawWave(g, now);
      if (hasMap && same && spCount > 0) drawSporangia(sporangiaGrowth(now));
      drawHover(l, g);
      drawSuggestion(g);
      ctx.globalAlpha = 1;
    },

    setReducedMotion(on) {
      if (destroyed) return;
      reducedMotion = on;
      if (on) {
        beadEdge.fill(-1);
        wavePending = false;
        waveStart = -1;
        growPending = false;
        growStart = -1;
      }
      needsDraw = true;
    },

    setSuggestion(site) {
      if (destroyed) return;
      const next = site !== null && Number.isInteger(site) && site >= 0 ? site : -1;
      if (next === suggestion) return;
      suggestion = next;
      needsDraw = true;
    },

    setHover(site, tool) {
      if (destroyed) return;
      const nextSite = site !== null && Number.isInteger(site) && site >= 0 ? site : -1;
      const nextTool = nextSite >= 0 ? tool : null;
      if (nextSite === hoverSite && nextTool === hoverTool) return;
      hoverSite = nextSite;
      hoverTool = nextTool;
      needsDraw = true;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      ready = false;
      // Liberar la memoria de los lienzos fuera de pantalla sin esperar al recolector.
      bgCanvas.width = 0;
      bgCanvas.height = 0;
      netCanvas.width = 0;
      netCanvas.height = 0;
    },
  };

  // Sin disposición todavía: el lienzo queda en 0 px (no los 300 × 150 por defecto) hasta tenerla.
  render.resize();
  return render;
}

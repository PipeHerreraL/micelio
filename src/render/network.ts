/**
 * Canvas de la red (PROMPT.md §14 y §16): un corte vertical del suelo con la red de micelio
 * creciendo en él. El canvas es decorativo; toda la información está también en la interfaz.
 *
 * Tres capas, para que un frame cueste dos copias de imagen y unos pocos puntos:
 * - fondo (hojarasca y horizontes): fuera de pantalla, se pinta solo al cambiar de tamaño;
 * - red acumulada (hifas, cordones, setas, anillos y árboles): fuera de pantalla. Un segmento
 *   se dibuja a trozos mientras crece y después no se vuelve a tocar, salvo al rehornear la
 *   capa entera (tamaño, profundidad, cordones o elementos de superficie distintos);
 * - encima, en cada frame: pulsos, partículas, lluvia y el brillo de la tormenta, todos en
 *   pools de tamaño fijo para no crear objetos en el bucle de render.
 *
 * La forma de la red solo depende de la semilla, del número de esporulaciones y de cuántos
 * segmentos tocan: los segmentos salen siempre en el mismo orden, así que la red que crece
 * compra a compra es la misma que se regenera de golpe al recargar. La profundidad y la
 * anchura no cambian esa secuencia: estiran el espacio normalizado donde vive la red. Se
 * descartó limitar la profundidad dentro de la caminata porque entonces la forma dependería
 * de en qué orden se compró y no se podría reconstruir desde el estado.
 *
 * Cada bioma tiene su suelo (render/palettes.ts). Al dispersar, la esporulación orquestada
 * gana una fase: con la red ya disuelta, el suelo nuevo se pinta en la capa acumulada (vacía
 * en ese momento) y se funde sobre el viejo. Se descartó un tercer lienzo para el suelo
 * anterior: costaba memoria todo el tiempo para un momento que pasa una vez por bioma.
 */
import type { GameEvent } from '../core/events.ts';
import * as num from '../core/num.ts';
import { derived } from '../core/selectors.ts';
import type { GameState } from '../core/state.ts';
import { BIOME_IDS, type BiomeId } from '../data/biomes.ts';
import { GENERATOR_IDS } from '../data/generators.ts';
import { BIRCH_ALPHA, BIRCH_TONE, LITTER_DEPTH, SOIL_PALETTES, type SoilPalette } from './palettes.ts';
import { createParticlePool, PARTICLE_CREAM, PARTICLE_GLOW } from './particles.ts';
import { createSeededRandom, mixSeed } from './random.ts';

export interface NetworkView {
  /** Ajusta el canvas a su tamaño CSS con devicePixelRatio limitado a 2 y redibuja la capa acumulada. */
  resize(): void;
  /** Lee el estado (lo llaman a 10 Hz) y hace crecer la red hasta lo que corresponde; idempotente. */
  sync(state: GameState): void;
  /** Reacciona a un evento del núcleo. */
  onEvent(event: GameEvent): void;
  /** Dibuja un frame (lo llaman con requestAnimationFrame; nunca con la pestaña oculta). now = performance.now(). */
  frame(now: number): void;
  setReducedMotion(on: boolean): void;
  /**
   * Si la esporulación o la dispersión orquestada sigue en marcha (incluida la que aún no
   * empezó). Falso sin lienzo: con 0 px no se anima nada y quien espere no debe esperar.
   */
  isTransitioning(): boolean;
  destroy(): void;
}

// ---------------------------------------------------------------------------------------
// Paleta (ARCHITECTURE.md §11). Los tonos del suelo, la hojarasca y las siluetas dependen
// del bioma y viven en render/palettes.ts; aquí quedan los de la red y las setas, iguales en
// todos los bosques. El rebozuelo no aparece: es el acento de compras de la interfaz, y en el
// canvas competiría con los botones.

const MICELIO = '#EFE6D2';
/** Solo pulsos de producción y lluvia. */
const FUEGO_FATUO = '#B8EFC4';
const MICELIO_RGB = '239, 230, 210';
const FUEGO_FATUO_RGB = '184, 239, 196';

/**
 * Raíces en el tono tierra del natal en todos los biomas: un pardo oscuro desaparecería sobre
 * el humus, y el de cada suelo nuevo es igual de oscuro o más.
 */
const ROOT_TONE = SOIL_PALETTES.natal.band;
const BARK_TONE = '#2C211A';
/** Luz de borde del tronco: separa la silueta de la hojarasca, igual de oscura. */
const RIM_ALPHA = 0.14;
const STEM_TONE = '#E2D5B9';
const GILL_TONE = '#BFA982';
const GILL_LINE_TONE = '#8C7556';
/** Sombreros en cremas y pardos cálidos; ninguno se acerca al naranja del rebozuelo. */
const CAP_TONES = ['#A57A52', '#8E6544', '#B99470', '#C9B08C', '#7C5838'] as const;
const RING_CAP_TONE = 3;

// ---------------------------------------------------------------------------------------
// Geometría del corte (fracciones de la altura del canvas)

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
/** Paso áureo: reparte los huecos de setas, anillos y troncos sin amontonarlos. */
const GOLDEN = 0.6180339887;
const MAX_DPR = 2;
/** Por debajo de esto (en píxeles) no se dibuja: drawImage falla con lienzos vacíos. */
const MIN_PIXELS = 2;

/**
 * Tres senos por frontera: amplitud y frecuencia (ciclos por ancho). La altura media de cada
 * frontera sale de la paleta del bioma; la ondulación es la misma en todos los suelos.
 */
const HORIZON_AMP = [0.007, 0.004, 0.0018, 0.016, 0.007, 0.003, 0.02, 0.009, 0.004] as const;
const HORIZON_FREQ = [1.3, 4.1, 11.3, 0.9, 2.7, 7.9, 0.7, 2.2, 6.1] as const;
/** La raíz de la red queda justo bajo la hojarasca, centrada. */
const ROOT_BELOW_LITTER = 0.016;
/** Fondo que puede alcanzar la red con la profundidad máxima. */
const NETWORK_BOTTOM = 0.985;

// ---------------------------------------------------------------------------------------
// Red

/** Tope de segmentos (PROMPT.md §14): acota memoria y el coste de rehornear la capa. */
const MAX_SEGMENTS = 2000;
/** Puntas que crecen a la vez: más puntas hacen la red más tupida y menos profunda. */
const MAX_TIPS = 40;
/** Ramas que salen de la raíz en abanico. */
const PRIMARY_BRANCHES = 5;
/** Probabilidad de bifurcar en vez de alargar una punta. */
const FORK_CHANCE = 0.22;
/** Fracción del giro hacia abajo en cada paso: las hifas bajan despacio, sin caer rectas. */
const GRAVITROPISM = 0.06;
const STEP_MIN = 0.016;
const STEP_RANGE = 0.02;
const U_X_MIN = 0.02;
const U_X_MAX = 0.98;
const U_Y_MIN = 0;
const U_Y_MAX = 1;
/** Segmentos con cero generadores: un brote mínimo para que el suelo no esté vacío. */
const SEED_SEGMENTS = 6;
const SEGMENTS_SCALE = 25;
const SEGMENTS_EXPONENT = 1.8;
/** Duración del brote de un segmento nuevo. */
const GROW_MS = 500;
/** Con lotes grandes (comprar «máx.») cada segmento brota más rápido para no eternizarse. */
const GROW_BATCH_SOFT_CAP = 120;
const GROW_MIN_MS = 220;
const GROW_STAGGER_MS = 18;
/** Índice del primer generador que lleva la red hasta el fondo y a lo ancho. */
const DEEPEST_TIER = GENERATOR_IDS.indexOf('malheur');

// ---------------------------------------------------------------------------------------
// Elementos de superficie

const MUSHROOM_CAP = 12;
const RING_CAP = 3;
const RING_MUSHROOMS = 9;
const TREE_CAP = 4;
const ROOTS_PER_TREE = 5;
const FOREST_CAP = 14;
/** Árboles madre a los lados de la raíz, donde la red ya llega cuando aparecen. */
const TREE_BASE_X = [0.25, 0.75, 0.37, 0.63] as const;
/**
 * Raíces tablares del Chocó (§4.5 de la fase 8): cada una sale 2,5 medios anchos del tronco
 * y sube hasta el 40 % de la hojarasca, la misma altura donde el tronco empieza a ensancharse.
 */
const BUTTRESS_SPAN = 2.5;
const BUTTRESS_RISE = 0.4;

// ---------------------------------------------------------------------------------------
// Pulsos, partículas y clima

const PULSE_CAP = 64;
/** Tope de pulsos por segundo: más allá la red parecería una alarma. */
const PULSE_RATE_MAX = 6;
/** Pulsos por segundo por cada orden de magnitud de N/s. */
const PULSE_RATE_PER_DECADE = 0.8;
/** Velocidad de un pulso en píxeles CSS por segundo. */
const PULSE_SPEED = 110;
const PULSE_FADE_S = 0.35;
const PULSE_RADIUS = 7;
/** Fuego de zorro: radio extra de los pulsos por rango (solo cosmético). */
const FOXFIRE_GLOW_PER_RANK = 0.35;
const PARTICLE_CAP = 200;
const MOTES_MAX = 10;
const SHIMMER_COUNT = 12;
const DROPLET_COUNT = 8;
const SPORE_PARTICLES = 180;
/** Lado del sprite de brillo en píxeles CSS. */
const SPRITE_CSS = 24;

const RAIN_CAP = 80;
/** Píxeles CSS cuadrados por gota: con lienzos pequeños hay menos trazos. */
const RAIN_AREA_PER_STREAK = 7000;
/** Inclinación de la lluvia: desplazamiento horizontal por unidad vertical. */
const RAIN_SLANT = 0.22;
const RAIN_ALPHA = 0.16;
const RAIN_FADE_S = 0.8;

/**
 * Tormenta: un resplandor suave como mucho cada 1.1 s y que dura 0.7 s, así nunca se
 * solapan y quedan muy por debajo de 3 destellos por segundo (PROMPT.md §16).
 */
const STORM_GLOW_MS = 700;
const STORM_MIN_GAP_MS = 1100;
const STORM_GAP_RANGE_MS = 900;
const STORM_ALPHA = 0.1;

/** Brillo del logro: una sola subida y bajada lenta, no un destello. */
const ACHIEVEMENT_MS = 1600;
const ACHIEVEMENT_LIFT = 0.35;

// Esporulación: el único momento orquestado (PROMPT.md §14).
const SPORE_GLOW_MS = 1000;
const SPORE_DISSOLVE_MS = 800;
const SPORE_FADE_IN_MS = 700;
const SPORE_LIFT = 0.9;
/**
 * Ráfaga al dispersar: las mismas esporas del pool, empujadas hacia la derecha y subiendo,
 * en vez de flotar hacia arriba como al esporular (velocidades en anchos y altos del lienzo por
 * segundo). Con 0,04–0,12 y la vida de siempre recorrían un 5–19 % del ancho y no se iban;
 * con estas y su vida de 1,4–2,2 s, casi todas salen por el borde derecho: el viento se las
 * lleva.
 */
const WIND_VX_MIN = 0.3;
const WIND_VX_RANGE = 0.35;
const WIND_VY_MIN = 0.08;
const WIND_VY_RANGE = 0.14;
const WIND_LIFE_MIN = 1.4;
const WIND_LIFE_RANGE = 0.8;
const REDUCED_FADE_MS = 200;
/**
 * El evento y el contador de esporulaciones llegan por caminos distintos; se cuentan una vez.
 * Un cambio de bioma no pasa por aquí: dispersar justo después de esporular debe cambiar el
 * suelo aunque caiga dentro de esta ventana.
 */
const SPORE_DEDUPE_MS = 3000;
/** Fundido del suelo viejo al nuevo al dispersar, entre la red que se va y la que brota. */
const SOIL_FADE_MS = 1000;

const PHASE_IDLE = 0;
const PHASE_GLOW = 1;
const PHASE_DISSOLVE = 2;
const PHASE_FADE_OUT = 3;
const PHASE_WAIT = 4;
const PHASE_FADE_IN = 5;
const PHASE_SOIL = 6;

const DECOR_SALT = 0x51ed;
/** Sal del grano del fondo; cada bioma suma su índice (el natal, 0: el mismo grano de la 1.2). */
const BACKGROUND_SALT = 0xb0b;
/**
 * Sal de la red desde el primer destino. El natal (tramo 0) sigue con mixSeed(semilla,
 * esporulaciones) para que la red de una partida 1.x no cambie al actualizar: mezclar el tramo
 * también allí la habría movido, porque mixSeed(x, 0) ≠ x.
 */
const LEG_SALT = 0x7a1d;
const HOP_LUT_SIZE = 256;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function wrapAngle(angle: number): number {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

/**
 * Segmentos que tocan según los generadores. Cada unidad pesa (nivel + 1)² y la curva es
 * logarítmica: las primeras compras se notan mucho y el tope de 2000 llega con Malheur o
 * Planetario en cantidad (peso ≈ 88 000).
 */
function segmentTarget(weighted: number): number {
  const target = SEED_SEGMENTS + SEGMENTS_SCALE * Math.log1p(Math.max(0, weighted)) ** SEGMENTS_EXPONENT;
  return Math.min(MAX_SEGMENTS, Math.round(target));
}

function mushroomsFor(n: number): number {
  return n <= 0 ? 0 : Math.min(MUSHROOM_CAP, Math.round(1 + 2.3 * Math.log2(n)));
}

function ringsFor(n: number): number {
  return n <= 0 ? 0 : Math.min(RING_CAP, 1 + Math.floor(Math.log2(n) / 1.5));
}

function treesFor(n: number): number {
  return n <= 0 ? 0 : Math.min(TREE_CAP, 1 + Math.floor(Math.log2(n) / 1.5));
}

function forestFor(n: number): number {
  return n <= 0 ? 0 : Math.min(FOREST_CAP, 5 + 2 * Math.floor(Math.log2(n)));
}

function noop(): void {
  // Sin contexto 2D no hay nada que dibujar; el juego sigue igual sin el canvas.
}

function never(): boolean {
  return false;
}

function createInertView(): NetworkView {
  return {
    resize: noop,
    sync: noop,
    onEvent: noop,
    frame: noop,
    setReducedMotion: noop,
    isTransitioning: never,
    destroy: noop,
  };
}

export function createNetworkView(
  canvas: HTMLCanvasElement,
  options: { seed: number; biome: BiomeId },
): NetworkView {
  const maybeCtx = canvas.getContext('2d');
  const bgCanvas = document.createElement('canvas');
  const layerCanvas = document.createElement('canvas');
  const creamSprite = document.createElement('canvas');
  const glowSprite = document.createElement('canvas');
  const maybeBg = bgCanvas.getContext('2d');
  const maybeLayer = layerCanvas.getContext('2d');
  if (!maybeCtx || !maybeBg || !maybeLayer) return createInertView();
  const ctx = maybeCtx;
  const bg = maybeBg;
  const layer = maybeLayer;
  canvas.setAttribute('aria-hidden', 'true');

  const seed = mixSeed(options.seed, 0);
  const rng = createSeededRandom(seed);
  const decor = createSeededRandom(mixSeed(seed, DECOR_SALT));
  const particles = createParticlePool(PARTICLE_CAP);

  // -------------------------------------------------------------------------------------
  // Fronteras de los horizontes: fases propias de la semilla, iguales en cada redibujado.

  const horizonPhase = new Float64Array(HORIZON_AMP.length);
  for (let k = 0; k < horizonPhase.length; k++) horizonPhase[k] = decor.next() * TAU;

  /** Frontera k a la altura media `base` (fracción de la altura) en la x normalizada. */
  function horizonY(k: number, base: number, x: number): number {
    let y = base;
    for (let j = 0; j < 3; j++) {
      const m = k * 3 + j;
      y += (HORIZON_AMP[m] ?? 0) * Math.sin(TAU * (HORIZON_FREQ[m] ?? 0) * x + (horizonPhase[m] ?? 0));
    }
    return y;
  }

  /** Borde inferior de la hojarasca: el mismo en todos los biomas (render/palettes.ts). */
  function surfaceY(x: number): number {
    return horizonY(0, LITTER_DEPTH, x);
  }

  const rootY = surfaceY(0.5) + ROOT_BELOW_LITTER;

  // -------------------------------------------------------------------------------------
  // Huecos fijos de los elementos de superficie: comprar más solo enciende el siguiente.

  const mushX = new Float32Array(MUSHROOM_CAP);
  const mushScale = new Float32Array(MUSHROOM_CAP);
  const mushTilt = new Float32Array(MUSHROOM_CAP);
  const mushTone = new Uint8Array(MUSHROOM_CAP);
  let g = decor.next();
  for (let k = 0; k < MUSHROOM_CAP; k++) {
    g = (g + GOLDEN) % 1;
    mushX[k] = 0.06 + 0.88 * g;
    mushScale[k] = 0.62 + 0.38 * decor.next();
    mushTilt[k] = (decor.next() - 0.5) * 0.5;
    mushTone[k] = Math.floor(decor.next() * CAP_TONES.length);
  }

  const ringX = new Float32Array(RING_CAP);
  const ringR = new Float32Array(RING_CAP);
  const ringPhase = new Float32Array(RING_CAP);
  g = decor.next();
  for (let k = 0; k < RING_CAP; k++) {
    g = (g + GOLDEN) % 1;
    ringX[k] = 0.14 + 0.72 * g;
    ringR[k] = 0.045 + 0.02 * decor.next();
    ringPhase[k] = decor.next() * TAU;
  }

  const treeX = new Float32Array(TREE_CAP);
  const treeScale = new Float32Array(TREE_CAP);
  const treeRootSeed = new Uint32Array(TREE_CAP);
  for (let k = 0; k < TREE_CAP; k++) {
    treeX[k] = (TREE_BASE_X[k] ?? 0.5) + (decor.next() - 0.5) * 0.05;
    treeScale[k] = 0.85 + 0.3 * decor.next();
    treeRootSeed[k] = Math.floor(decor.next() * 0xffffffff);
  }
  const rootTipX = new Float32Array(TREE_CAP * ROOTS_PER_TREE);
  const rootTipY = new Float32Array(TREE_CAP * ROOTS_PER_TREE);

  const forestX = new Float32Array(FOREST_CAP);
  const forestScale = new Float32Array(FOREST_CAP);
  g = decor.next();
  for (let k = 0; k < FOREST_CAP; k++) {
    g = (g + GOLDEN) % 1;
    forestX[k] = 0.03 + 0.94 * g;
    forestScale[k] = 0.6 + 0.6 * decor.next();
  }

  // Grosor y opacidad de una hifa según sus saltos desde la raíz: más fina cuanto más lejos.
  const hyphaWidth = new Float32Array(HOP_LUT_SIZE);
  const hyphaAlpha = new Float32Array(HOP_LUT_SIZE);
  for (let h = 0; h < HOP_LUT_SIZE; h++) {
    hyphaWidth[h] = 0.5 + 1.0 * Math.exp(-h / 12);
    hyphaAlpha[h] = 0.13 + 0.22 * Math.exp(-h / 20);
  }

  // -------------------------------------------------------------------------------------
  // Red: arreglos tipados con tope fijo. Coordenadas en un espacio normalizado [0, 1]
  // (x centrada en 0.5, y = 0 en la raíz) que el horneado estira según la profundidad.

  const segX1 = new Float32Array(MAX_SEGMENTS);
  const segY1 = new Float32Array(MAX_SEGMENTS);
  const segX2 = new Float32Array(MAX_SEGMENTS);
  const segY2 = new Float32Array(MAX_SEGMENTS);
  const segAngle = new Float32Array(MAX_SEGMENTS);
  const segParent = new Int16Array(MAX_SEGMENTS);
  const segHop = new Int16Array(MAX_SEGMENTS);
  const segOrder = new Uint8Array(MAX_SEGMENTS);
  const firstChild = new Int16Array(MAX_SEGMENTS).fill(-1);
  const nextSibling = new Int16Array(MAX_SEGMENTS).fill(-1);
  /** Fracción ya dibujada en la capa acumulada (1 = horneado). */
  const drawn = new Float32Array(MAX_SEGMENTS);
  const growStart = new Float64Array(MAX_SEGMENTS);
  const growEnd = new Float64Array(MAX_SEGMENTS);
  const tips = new Int16Array(MAX_TIPS);
  let count = 0;
  let rootHead = -1;
  let tipCount = 0;
  let growFrom = 0;
  let netSeed = -1;

  // Parámetros aplicados al horneado actual y los que pide el último estado leído.
  let reach = 0;
  let spread = 0;
  let cordTier = 0;
  let cordMaxOrder = 0;
  let cordMaxHop = 0;
  let mushCount = 0;
  let ringCount = 0;
  let treeCount = 0;
  let forestCount = 0;
  let wantTarget = 0;
  let wantReach = 0.26;
  let wantSpread = 0.28;
  let wantCordTier = 0;
  let wantMush = 0;
  let wantRings = 0;
  let wantTrees = 0;
  let wantForest = 0;
  let wantSeed = 0;
  // Bioma y tramo que pide el estado, y el bioma que está pintado en el fondo. Difieren solo
  // durante la dispersión: hasta que la red vieja se disuelve, sigue sobre su suelo.
  let wantBiome: BiomeId = options.biome;
  let wantLeg = 0;
  let bgBiome: BiomeId = options.biome;

  // Lienzo y estado de dibujo.
  let W = 0;
  let H = 0;
  let dpr = 1;
  let ready = false;
  let destroyed = false;
  let reducedMotion = false;
  let firstSync = true;
  let needsDraw = true;
  let lastFrameAnimated = false;
  let lastNow = -1;
  let stormGradient: CanvasGradient | null = null;

  // Esporulación.
  let phase = PHASE_IDLE;
  let phaseStart = 0;
  let sporePending = false;
  let sporeRequestedAt = -Infinity;
  let lastSporulations = -1;
  let lastLeg = -1;
  /** La esporulación en curso es una dispersión: las esporas se las lleva el viento. */
  let windy = false;
  /** Bioma que la fase del suelo está fundiendo encima del fondo. */
  let soilBiome: BiomeId = options.biome;
  let layerAlpha = 1;
  let sporeLift = 0;
  // Lo que había en pantalla al empezar el fundido reducido: se apaga desde ahí, sin saltos.
  let fadeFromAlpha = 1;
  let fadeFromLift = 0;

  // Pulsos.
  const pulseSeg = new Int16Array(PULSE_CAP);
  const pulseT = new Float32Array(PULSE_CAP);
  const pulseFade = new Float32Array(PULSE_CAP);
  const pulseOn = new Uint8Array(PULSE_CAP);
  let pulseActive = 0;
  let pulseGlow = 1;
  let pulseRate = 0;
  // Empieza a medias para que el primer pulso no tarde un ciclo entero.
  let pulseAcc = 0.5;

  // Lluvia, tormenta, logro y motas.
  const rainX = new Float32Array(RAIN_CAP);
  const rainY = new Float32Array(RAIN_CAP);
  const rainSpeed = new Float32Array(RAIN_CAP);
  const rainLen = new Float32Array(RAIN_CAP);
  let rainCount = 0;
  let rainOn = false;
  let rainFade = 0;
  let stormOn = false;
  let stormNextAt = 0;
  let stormStart = -Infinity;
  let achievementStart = -Infinity;
  let pendingMotes = 0;
  let lastDropX = 0.5;
  let lastDropY = 0.3;

  // -------------------------------------------------------------------------------------
  // Del espacio de la red a píxeles

  function nx(ux: number): number {
    return 0.5 + (ux - 0.5) * 2 * spread;
  }

  function ny(uy: number): number {
    return rootY + uy * reach * (NETWORK_BOTTOM - rootY);
  }

  function segLengthPx(i: number): number {
    const dx = ((segX2[i] ?? 0) - (segX1[i] ?? 0)) * 2 * spread * W;
    const dy = ((segY2[i] ?? 0) - (segY1[i] ?? 0)) * reach * (NETWORK_BOTTOM - rootY) * H;
    return Math.max(1, Math.sqrt(dx * dx + dy * dy));
  }

  // -------------------------------------------------------------------------------------
  // Crecimiento

  function resetNetworkData(nextSeed: number): void {
    rng.reset(nextSeed);
    netSeed = nextSeed;
    firstChild.fill(-1, 0, Math.max(count, 1));
    nextSibling.fill(-1, 0, Math.max(count, 1));
    drawn.fill(0, 0, Math.max(count, 1));
    count = 0;
    rootHead = -1;
    tipCount = 0;
    growFrom = 0;
  }

  function pushTip(i: number): void {
    // Con todas las puntas ocupadas, la bifurcación se queda en un espolón corto. Se descartó
    // relevar una punta al azar: cortaba linajes largos y la red apenas avanzaba hacia fuera.
    if (tipCount >= MAX_TIPS) return;
    tips[tipCount] = i;
    tipCount++;
  }

  function dropTip(i: number): void {
    for (let k = 0; k < tipCount; k++) {
      if (tips[k] !== i) continue;
      tipCount--;
      tips[k] = tips[tipCount] ?? -1;
      return;
    }
  }

  /** Añade el siguiente segmento de la secuencia determinista. */
  function addSegment(): boolean {
    if (count >= MAX_SEGMENTS) return false;
    const i = count;
    let parent = -1;
    let x1 = 0.5;
    let y1 = 0;
    let angle: number;
    let order = 0;
    let hop = 0;

    if (i < PRIMARY_BRANCHES) {
      // Abanico desde la raíz: de casi horizontal a la derecha a casi horizontal a la izquierda.
      angle = Math.PI * (0.1 + (0.8 * (i + 0.5)) / PRIMARY_BRANCHES) + (rng.next() - 0.5) * 0.3;
      pushTip(i);
    } else {
      if (tipCount === 0 || rng.next() < FORK_CHANCE) {
        // Sesgo hacia segmentos recientes (los del frente): bifurcar desde los viejos solo
        // espesa el centro. Con la raíz cuadrada, la mitad sale del 29 % más reciente.
        parent = Math.floor(i * Math.sqrt(rng.next()));
        const side = rng.next() < 0.5 ? -1 : 1;
        angle = (segAngle[parent] ?? HALF_PI) + side * (0.45 + rng.next() * 0.65);
        order = Math.min(255, (segOrder[parent] ?? 0) + 1);
        pushTip(i);
      } else {
        const k = Math.floor(rng.next() * tipCount);
        parent = tips[k] ?? 0;
        angle = (segAngle[parent] ?? HALF_PI) + (rng.next() - 0.5) * 0.8;
        order = segOrder[parent] ?? 0;
        tips[k] = i;
      }
      hop = Math.min(32767, (segHop[parent] ?? 0) + 1);
      x1 = segX2[parent] ?? 0.5;
      y1 = segY2[parent] ?? 0;
    }

    angle = wrapAngle(angle);
    angle += wrapAngle(HALF_PI - angle) * GRAVITROPISM;
    const len = STEP_MIN + rng.next() * STEP_RANGE;
    let cos = Math.cos(angle);
    let sin = Math.sin(angle);
    let x2 = x1 + cos * len;
    if (x2 < U_X_MIN || x2 > U_X_MAX) {
      angle = Math.PI - angle;
      cos = -cos;
      x2 = x1 + cos * len;
    }
    let y2 = y1 + sin * len;
    if (y2 < U_Y_MIN) {
      angle = -angle;
      sin = -sin;
      y2 = y1 + sin * len;
    }
    x2 = clamp(x2, U_X_MIN, U_X_MAX);
    y2 = clamp(y2, U_Y_MIN, U_Y_MAX);

    segX1[i] = x1;
    segY1[i] = y1;
    segX2[i] = x2;
    segY2[i] = y2;
    segAngle[i] = wrapAngle(angle);
    segParent[i] = parent;
    segHop[i] = hop;
    segOrder[i] = order;
    firstChild[i] = -1;
    drawn[i] = 0;
    if (parent >= 0) {
      nextSibling[i] = firstChild[parent] ?? -1;
      firstChild[parent] = i;
    } else {
      nextSibling[i] = rootHead;
      rootHead = i;
    }
    // Una punta que toca el fondo deja de crecer; las bifurcaciones siguen rellenando.
    if (y2 >= U_Y_MAX - 0.004) dropTip(i);
    count++;
    return true;
  }

  function isCord(i: number): boolean {
    return cordTier > 0 && (segOrder[i] ?? 255) <= cordMaxOrder && (segHop[i] ?? 0) <= cordMaxHop;
  }

  /** Dibuja el tramo [t0, t1] de una hifa. Extremos planos: los tramos encajan sin solaparse. */
  function strokeHypha(c: CanvasRenderingContext2D, i: number, t0: number, t1: number): void {
    const x1 = nx(segX1[i] ?? 0) * W;
    const y1 = ny(segY1[i] ?? 0) * H;
    const x2 = nx(segX2[i] ?? 0) * W;
    const y2 = ny(segY2[i] ?? 0) * H;
    const hop = Math.min(HOP_LUT_SIZE - 1, segHop[i] ?? 0);
    c.globalAlpha = hyphaAlpha[hop] ?? 0.2;
    c.lineWidth = (hyphaWidth[hop] ?? 0.6) * dpr;
    c.beginPath();
    c.moveTo(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0);
    c.lineTo(x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1);
    c.stroke();
  }

  /** Cordón (rizomorfo): se dibuja entero cuando el segmento termina de brotar. */
  function strokeCord(c: CanvasRenderingContext2D, i: number): void {
    const hop = segHop[i] ?? 0;
    const taper = 1 - (0.55 * hop) / Math.max(1, cordMaxHop);
    c.globalAlpha = 0.2;
    c.lineWidth = (1.5 + 0.2 * cordTier) * taper * dpr;
    c.beginPath();
    c.moveTo(nx(segX1[i] ?? 0) * W, ny(segY1[i] ?? 0) * H);
    c.lineTo(nx(segX2[i] ?? 0) * W, ny(segY2[i] ?? 0) * H);
    c.stroke();
  }

  function finishSegment(i: number): void {
    if (!isCord(i)) return;
    layer.lineCap = 'round';
    strokeCord(layer, i);
    layer.lineCap = 'butt';
  }

  /** Añade los segmentos que faltan; con animación, cada hijo brota cuando acaba su padre. */
  function grow(animate: boolean): void {
    const first = count;
    const batch = wantTarget - count;
    if (batch <= 0) return;
    const now = performance.now();
    const duration =
      batch > GROW_BATCH_SOFT_CAP ? Math.max(GROW_MIN_MS, (GROW_MS * GROW_BATCH_SOFT_CAP) / batch) : GROW_MS;
    const stagger = Math.min(GROW_STAGGER_MS, 600 / batch);
    layer.strokeStyle = MICELIO;
    layer.lineCap = 'butt';
    while (count < wantTarget && addSegment()) {
      const i = count - 1;
      if (animate) {
        const parent = segParent[i] ?? -1;
        const parentEnd = parent >= 0 && (drawn[parent] ?? 1) < 1 ? (growEnd[parent] ?? 0) : 0;
        const start = Math.max(now + (i - first) * stagger, parentEnd);
        growStart[i] = start;
        growEnd[i] = start + duration;
      } else {
        drawn[i] = 1;
        if (ready) {
          strokeHypha(layer, i, 0, 1);
          finishSegment(i);
        }
      }
    }
    layer.globalAlpha = 1;
    needsDraw = true;
  }

  /** Dibuja en la capa acumulada lo que cada segmento creció desde el último frame. */
  function advanceGrowth(now: number): boolean {
    if (growFrom >= count) return false;
    let drewAny = false;
    if (ready) {
      layer.strokeStyle = MICELIO;
      layer.lineCap = 'butt';
      for (let i = growFrom; i < count; i++) {
        const done = drawn[i] ?? 1;
        if (done >= 1) continue;
        const start = growStart[i] ?? 0;
        const end = growEnd[i] ?? 0;
        if (now <= start) continue;
        const p = end > start ? Math.min(1, (now - start) / (end - start)) : 1;
        if (p <= done) continue;
        strokeHypha(layer, i, done, p);
        drawn[i] = p;
        if (p >= 1) finishSegment(i);
        drewAny = true;
      }
      layer.globalAlpha = 1;
    }
    while (growFrom < count && (drawn[growFrom] ?? 1) >= 1) growFrom++;
    return drewAny || growFrom < count;
  }

  /** Termina de golpe lo que estaba brotando (movimiento reducido). */
  function finishGrowth(): void {
    layer.strokeStyle = MICELIO;
    layer.lineCap = 'butt';
    for (let i = growFrom; i < count; i++) {
      const done = drawn[i] ?? 1;
      if (done >= 1) continue;
      if (ready) {
        strokeHypha(layer, i, done, 1);
        finishSegment(i);
      }
      drawn[i] = 1;
    }
    layer.globalAlpha = 1;
    growFrom = count;
    needsDraw = true;
  }

  // -------------------------------------------------------------------------------------
  // Elementos de superficie (en la capa acumulada)

  function litterPx(): number {
    return LITTER_DEPTH * H;
  }

  function drawMushroom(x: number, base: number, h: number, tilt: number, tone: number, alpha: number): void {
    const c = layer;
    const stemHalf = h * 0.085;
    const capRx = h * 0.42;
    const capRy = h * 0.34;
    const topX = x + tilt * h * 0.3;
    const topY = base - h * 0.7;
    const midY = (base + topY) / 2;
    const rot = tilt * 0.35;

    c.globalAlpha = alpha;
    c.fillStyle = STEM_TONE;
    c.beginPath();
    c.moveTo(x - stemHalf * 1.25, base);
    c.quadraticCurveTo(x - stemHalf + tilt * h * 0.12, midY, topX - stemHalf * 0.8, topY);
    c.lineTo(topX + stemHalf * 0.8, topY);
    c.quadraticCurveTo(x + stemHalf + tilt * h * 0.12, midY, x + stemHalf * 1.25, base);
    c.closePath();
    c.fill();

    // Laminillas: media elipse bajo el sombrero con unas pocas rayas radiales.
    c.fillStyle = GILL_TONE;
    c.beginPath();
    c.ellipse(topX, topY, capRx * 0.96, capRy * 0.26, rot, 0, Math.PI);
    c.fill();
    c.strokeStyle = GILL_LINE_TONE;
    c.lineWidth = Math.max(0.5, h * 0.02);
    c.lineCap = 'round';
    c.globalAlpha = alpha * 0.7;
    c.beginPath();
    for (let j = -3; j <= 3; j++) {
      c.moveTo(topX + (j / 3.4) * capRx * 0.25, topY + capRy * 0.02);
      c.lineTo(topX + (j / 3.4) * capRx * 0.88, topY + capRy * 0.2);
    }
    c.stroke();

    c.globalAlpha = alpha;
    c.fillStyle = CAP_TONES[tone] ?? '#8E6544';
    c.beginPath();
    c.ellipse(topX, topY, capRx, capRy, rot, Math.PI, TAU);
    c.closePath();
    c.fill();

    c.fillStyle = MICELIO;
    c.globalAlpha = alpha * 0.16;
    c.beginPath();
    c.ellipse(topX - capRx * 0.3, topY - capRy * 0.55, capRx * 0.28, capRy * 0.2, rot - 0.3, 0, TAU);
    c.fill();
  }

  function drawMushrooms(): void {
    const band = litterPx();
    const maxH = clamp(band * 0.8, 8 * dpr, 44 * dpr);
    for (let k = 0; k < mushCount; k++) {
      const xN = mushX[k] ?? 0.5;
      drawMushroom(
        xN * W,
        surfaceY(xN) * H + dpr,
        maxH * (mushScale[k] ?? 1),
        mushTilt[k] ?? 0,
        mushTone[k] ?? 0,
        1,
      );
    }
  }

  /** Frente del anillo bajo tierra: el micelio crece en círculo y las setas brotan en su borde. */
  function drawRingFronts(): void {
    const band = litterPx();
    layer.strokeStyle = MICELIO;
    for (let k = 0; k < ringCount; k++) {
      const xN = ringX[k] ?? 0.5;
      const cx = xN * W;
      const cy = surfaceY(xN) * H + band * 0.6;
      const rx = (ringR[k] ?? 0.05) * W;
      const ry = band * 0.28;
      layer.globalAlpha = 0.07;
      layer.lineWidth = 3 * dpr;
      layer.beginPath();
      layer.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      layer.stroke();
      layer.globalAlpha = 0.14;
      layer.lineWidth = dpr;
      layer.beginPath();
      layer.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      layer.stroke();
    }
  }

  /** Setas del anillo vistas de lado: las de atrás más pequeñas, altas y tenues. */
  function drawRings(): void {
    const band = litterPx();
    const size = clamp(band * 0.42, 5 * dpr, 20 * dpr);
    for (let k = 0; k < ringCount; k++) {
      const cx = (ringX[k] ?? 0.5) * W;
      const rx = (ringR[k] ?? 0.05) * W;
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < RING_MUSHROOMS; j++) {
          const theta = (TAU * j) / RING_MUSHROOMS + (ringPhase[k] ?? 0);
          const depth = (Math.sin(theta) + 1) / 2;
          if ((pass === 0) !== depth < 0.5) continue;
          const x = cx + rx * Math.cos(theta);
          const base = surfaceY(x / W) * H - (1 - depth) * band * 0.22;
          drawMushroom(
            x,
            base,
            size * (0.7 + 0.3 * depth),
            0,
            j % 2 === 0 ? RING_CAP_TONE : RING_CAP_TONE - 1,
            0.7 + 0.3 * depth,
          );
        }
      }
    }
  }

  /** Bosque ancestral: troncos lejanos y tenues que se pierden en la hojarasca. */
  function drawForest(p: SoilPalette): void {
    layer.fillStyle = p.distantSilhouette;
    for (let k = 0; k < forestCount; k++) {
      const xN = forestX[k] ?? 0.5;
      const scale = forestScale[k] ?? 1;
      const x = xN * W;
      const base = surfaceY(xN) * H * 0.85;
      const half = clamp(W * 0.0035, 1.5 * dpr, 5 * dpr) * scale * p.distantWidth;
      // El abedul se decide por índice y no con azar: así no mueve la secuencia de adornos y
      // el mismo hueco es abedul en cada redibujado.
      const birch = p.birchEvery > 0 && k % p.birchEvery === p.birchEvery - 1;
      if (birch) layer.fillStyle = BIRCH_TONE;
      layer.globalAlpha = birch ? BIRCH_ALPHA : 0.3 + 0.15 * scale;
      layer.beginPath();
      layer.moveTo(x - half * 0.75, 0);
      layer.lineTo(x + half * 0.75, 0);
      layer.lineTo(x + half * 1.2, base);
      layer.lineTo(x - half * 1.2, base);
      layer.closePath();
      layer.fill();
      if (birch) layer.fillStyle = p.distantSilhouette;
    }
  }

  /** Árboles madre: tronco oscuro sobre la hojarasca y raíces que bajan hasta la red. */
  function drawTrees(p: SoilPalette): void {
    for (let k = 0; k < treeCount; k++) {
      const xN = treeX[k] ?? 0.5;
      const scale = treeScale[k] ?? 1;
      const cx = xN * W;
      const surface = surfaceY(xN) * H;
      const half = clamp(W * 0.016, 6 * dpr, 20 * dpr) * scale * p.treeWidth;
      const flare = surface * 0.4;

      // Raíces primero: el ensanche del tronco tapa su arranque. Curvas que se abren y bajan,
      // más finas hacia la punta.
      decor.reset(treeRootSeed[k] ?? 1);
      layer.strokeStyle = ROOT_TONE;
      layer.lineCap = 'round';
      layer.globalAlpha = 0.9;
      for (let r = 0; r < ROOTS_PER_TREE; r++) {
        const a = Math.PI * (0.16 + (0.68 * (r + 0.5)) / ROOTS_PER_TREE) + (decor.next() - 0.5) * 0.25;
        const len = H * (0.07 + decor.next() * 0.12) * scale;
        const sx = cx + Math.cos(a) * half;
        const sy = surface;
        const ex = cx + Math.cos(a) * len * 1.4;
        const ey = surface + Math.sin(a) * len;
        const mx = cx + Math.cos(a) * len * 0.6 + (decor.next() - 0.5) * len * 0.3;
        const my = surface + Math.sin(a) * len * 0.25;
        let prevX = sx;
        let prevY = sy;
        for (let q = 1; q <= 6; q++) {
          const t = q / 6;
          const u = 1 - t;
          const qx = u * u * sx + 2 * u * t * mx + t * t * ex;
          const qy = u * u * sy + 2 * u * t * my + t * t * ey;
          layer.lineWidth = Math.max(0.8 * dpr, half * 0.5 * (1 - (t - 1 / 6) * 0.85));
          layer.beginPath();
          layer.moveTo(prevX, prevY);
          layer.lineTo(qx, qy);
          layer.stroke();
          prevX = qx;
          prevY = qy;
        }
        rootTipX[k * ROOTS_PER_TREE + r] = ex;
        rootTipY[k * ROOTS_PER_TREE + r] = ey;
      }

      layer.globalAlpha = 1;
      layer.fillStyle = p.silhouette;
      layer.beginPath();
      layer.moveTo(cx - half * 0.92, 0);
      layer.lineTo(cx - half, surface - flare);
      layer.quadraticCurveTo(cx - half, surface, cx - half * 2.1, surface + 2 * dpr);
      layer.lineTo(cx + half * 2.1, surface + 2 * dpr);
      layer.quadraticCurveTo(cx + half, surface, cx + half, surface - flare);
      layer.lineTo(cx + half * 0.92, 0);
      layer.closePath();
      layer.fill();

      layer.strokeStyle = BARK_TONE;
      layer.lineWidth = dpr;
      layer.globalAlpha = 0.6;
      layer.beginPath();
      layer.moveTo(cx - half * 0.35, 0);
      layer.lineTo(cx - half * 0.4, surface - flare * 0.5);
      layer.moveTo(cx + half * 0.3, 0);
      layer.lineTo(cx + half * 0.38, surface - flare * 0.7);
      layer.stroke();

      layer.strokeStyle = MICELIO;
      layer.globalAlpha = RIM_ALPHA;
      layer.beginPath();
      layer.moveTo(cx - half * 0.92, 0);
      layer.lineTo(cx - half, surface - flare);
      layer.quadraticCurveTo(cx - half, surface, cx - half * 2.1, surface + 2 * dpr);
      layer.stroke();

      if (p.buttress) drawButtresses(p, cx, surface, half);
    }
  }

  /**
   * Raíces tablares (Chocó): dos aletas rectas a los lados del ensanche. Van después de la luz
   * de borde y la tapan donde se cruzan, así que la izquierda lleva la suya propia: sin ella,
   * la aleta se perdería sobre una hojarasca casi igual de oscura.
   */
  function drawButtresses(p: SoilPalette, cx: number, surface: number, half: number): void {
    const top = surface - surface * BUTTRESS_RISE;
    const outer = half * (1 + BUTTRESS_SPAN);
    const ground = surface + 2 * dpr;
    layer.globalAlpha = 1;
    layer.fillStyle = p.silhouette;
    layer.beginPath();
    layer.moveTo(cx - half, top);
    layer.lineTo(cx - outer, ground);
    layer.lineTo(cx - half, ground);
    layer.closePath();
    layer.moveTo(cx + half, top);
    layer.lineTo(cx + half, ground);
    layer.lineTo(cx + outer, ground);
    layer.closePath();
    layer.fill();
    layer.strokeStyle = MICELIO;
    layer.lineWidth = dpr;
    layer.globalAlpha = RIM_ALPHA;
    layer.beginPath();
    layer.moveTo(cx - half, top);
    layer.lineTo(cx - outer, ground);
    layer.stroke();
  }

  /** Micorriza: cada punta de raíz se une al nodo de la red más cercano, si lo hay a mano. */
  function drawTreeLinks(): void {
    if (treeCount === 0 || count === 0) return;
    const radius = 0.14 * Math.min(W, H);
    const limit = radius * radius;
    layer.strokeStyle = MICELIO;
    layer.fillStyle = MICELIO;
    layer.lineCap = 'round';
    for (let t = 0; t < treeCount * ROOTS_PER_TREE; t++) {
      const tx = rootTipX[t] ?? 0;
      const ty = rootTipY[t] ?? 0;
      let best = -1;
      let bestD = limit;
      for (let i = 0; i < count; i++) {
        if ((drawn[i] ?? 0) < 1) continue;
        const dx = nx(segX2[i] ?? 0) * W - tx;
        const dy = ny(segY2[i] ?? 0) * H - ty;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0) continue;
      layer.globalAlpha = 0.3;
      layer.lineWidth = 0.9 * dpr;
      layer.beginPath();
      layer.moveTo(tx, ty);
      layer.lineTo(nx(segX2[best] ?? 0) * W, ny(segY2[best] ?? 0) * H);
      layer.stroke();
      layer.globalAlpha = 0.5;
      layer.beginPath();
      layer.arc(tx, ty, 1.6 * dpr, 0, TAU);
      layer.fill();
    }
  }

  /** Vuelve a dibujar la capa acumulada entera. Solo con cambios raros, nunca por frame. */
  function rebake(): void {
    needsDraw = true;
    if (!ready) return;
    layer.globalCompositeOperation = 'source-over';
    layer.globalAlpha = 1;
    layer.clearRect(0, 0, W, H);
    // Las siluetas usan el suelo que se ve, no el que pide el estado: durante la dispersión
    // la red vieja se disuelve sobre su propio bosque.
    const p = SOIL_PALETTES[bgBiome];
    drawForest(p);
    drawRingFronts();
    drawTrees(p);

    layer.strokeStyle = MICELIO;
    layer.lineCap = 'butt';
    for (let i = 0; i < count; i++) {
      const d = drawn[i] ?? 0;
      if (d > 0) strokeHypha(layer, i, 0, d);
    }
    if (cordTier > 0) {
      layer.lineCap = 'round';
      for (let i = 0; i < count; i++) {
        if ((drawn[i] ?? 0) >= 1 && isCord(i)) strokeCord(layer, i);
      }
    }
    drawTreeLinks();
    drawRings();
    drawMushrooms();
    layer.globalAlpha = 1;
    layer.lineCap = 'butt';
  }

  // -------------------------------------------------------------------------------------
  // Fondo: hojarasca y horizontes, una vez por tamaño (y dos veces al dispersar)

  function fillBelow(c: CanvasRenderingContext2D, k: number, base: number, offset: number): void {
    const step = Math.max(4, 6 * dpr);
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W + step; x += step) c.lineTo(x, horizonY(k, base, x / W) * H + offset);
    c.lineTo(W, H);
    c.closePath();
    c.fill();
  }

  /** Frontera difusa: varias pasadas desplazadas y translúcidas en lugar de un borde neto. */
  function softHorizon(
    c: CanvasRenderingContext2D,
    k: number,
    base: number,
    style: string | CanvasGradient,
  ): void {
    const feather = Math.max(1.5 * dpr, H * 0.006);
    c.fillStyle = style;
    c.globalAlpha = 1;
    fillBelow(c, k, base, feather);
    c.globalAlpha = 0.45;
    fillBelow(c, k, base, 0);
    c.globalAlpha = 0.25;
    fillBelow(c, k, base, -feather);
    c.globalAlpha = 0.12;
    fillBelow(c, k, base, -2 * feather);
    c.globalAlpha = 1;
  }

  /**
   * Pinta el suelo de un bioma en `c` (el fondo, o la capa acumulada vacía durante la fase del
   * suelo). Con el natal, el orden de las llamadas y la secuencia de azar son los de la 1.2:
   * lo que solo tienen otros biomas (las matas) va al final, después de las hojas.
   */
  function paintBackground(c: CanvasRenderingContext2D, biome: BiomeId): void {
    const p = SOIL_PALETTES[biome];
    decor.reset(mixSeed(seed, BACKGROUND_SALT + BIOME_IDS.indexOf(biome)));
    c.globalCompositeOperation = 'source-over';
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;

    const humusGradient = c.createLinearGradient(0, 0, 0, H * 0.4);
    humusGradient.addColorStop(0, p.humusTop);
    humusGradient.addColorStop(1, p.humus);
    c.fillStyle = humusGradient;
    c.fillRect(0, 0, W, H);

    softHorizon(c, 1, p.horizons[1], p.band);
    const deep = c.createLinearGradient(0, H * p.deepStart, 0, H);
    deep.addColorStop(0, p.deepTop);
    deep.addColorStop(0.6, p.deepMid);
    deep.addColorStop(1, p.deepBottom);
    softHorizon(c, 2, p.horizons[2], deep);

    // Grano: motas oscuras y claras en dos pasadas (un estilo por pasada).
    const cssArea = (W * H) / (dpr * dpr);
    const dot = Math.max(1, Math.round(dpr));
    c.fillStyle = p.speckDark;
    c.globalAlpha = 0.18;
    const darkCount = Math.min(5000, Math.round(cssArea / 140));
    for (let n = 0; n < darkCount; n++) {
      const s = decor.next() < 0.25 ? dot * 2 : dot;
      c.fillRect(decor.next() * W, decor.next() * H, s, s);
    }
    c.fillStyle = p.speckLight;
    c.globalAlpha = 0.07;
    const lightCount = Math.min(2000, Math.round(cssArea / 400));
    for (let n = 0; n < lightCount; n++) c.fillRect(decor.next() * W, decor.next() * H, dot, dot);

    // Piedrecitas en los horizontes bajos.
    const pebbleCount = Math.min(160, Math.round(cssArea / 9000));
    for (let n = 0; n < pebbleCount; n++) {
      const y = H * (0.3 + 0.7 * decor.next());
      const r = (1.2 + decor.next() * 2.6) * dpr;
      c.fillStyle = p.pebbleTones[Math.floor(decor.next() * p.pebbleTones.length)] ?? p.band;
      c.globalAlpha = 0.25 + 0.2 * decor.next();
      c.beginPath();
      c.ellipse(decor.next() * W, y, r * 1.3, r, decor.next() * Math.PI, 0, TAU);
      c.fill();
    }

    // Sombra bajo la hojarasca: da profundidad a la primera franja de humus.
    const band = litterPx();
    const shade = c.createLinearGradient(0, band * 0.8, 0, band * 1.9);
    shade.addColorStop(0, 'rgba(10, 7, 5, 0.45)');
    shade.addColorStop(1, 'rgba(10, 7, 5, 0)');
    c.globalAlpha = 1;
    c.fillStyle = shade;
    c.fillRect(0, band * 0.8, W, band * 1.1);

    // Hojarasca: base irregular y hojas superpuestas.
    const step = Math.max(4, 6 * dpr);
    c.fillStyle = p.litter;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(W, 0);
    for (let x = W + step; x >= -step; x -= step) c.lineTo(x, horizonY(0, p.horizons[0], x / W) * H);
    c.closePath();
    c.fill();

    // La densidad multiplica después de acotar: con 1 (natal) el número de hojas es el de la 1.2.
    const leafCount = Math.round(clamp(Math.round(W / (2.2 * dpr)), 40, 900) * p.leafDensity);
    const leafBase = clamp(band * 0.36, 5 * dpr, 18 * dpr);
    for (let n = 0; n < leafCount; n++) {
      const xN = decor.next();
      const bottom = horizonY(0, p.horizons[0], xN) * H;
      // Más hojas abajo, donde la hojarasca se compacta.
      const y = bottom * Math.sqrt(decor.next()) + dpr;
      const len = leafBase * (p.leafLength[0] + decor.next() * p.leafLength[1]);
      const wid = len * (p.leafWidth[0] + decor.next() * p.leafWidth[1]);
      const rot = decor.next() * TAU;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const alpha = 0.7 + decor.next() * 0.3;
      c.setTransform(cos, sin, -sin, cos, xN * W, y);
      c.globalAlpha = alpha;
      c.fillStyle = p.leafTones[Math.floor(decor.next() * p.leafTones.length)] ?? p.band;
      c.beginPath();
      c.moveTo(-len / 2, 0);
      c.quadraticCurveTo(0, -wid, len / 2, 0);
      c.quadraticCurveTo(0, wid, -len / 2, 0);
      c.fill();
      // El azar del nervio se consume aunque el bioma no tenga nervios (acículas): así la
      // secuencia de cada hoja tiene siempre el mismo largo.
      if (decor.next() < p.veinChance) {
        c.globalAlpha = alpha * 0.4;
        c.strokeStyle = p.leafVein;
        c.lineWidth = 0.6 * dpr;
        c.beginPath();
        c.moveTo(-len / 2, 0);
        c.lineTo(len * 0.45, 0);
        c.stroke();
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);

    // Matas (musgo y liquen de la taiga): manchas sueltas sobre la hojarasca, en proporción a
    // las hojas y con su misma distribución.
    for (let t = 0; t < p.tufts.length; t++) {
      const tuft = p.tufts[t];
      if (!tuft) continue;
      const tuftCount = Math.round(leafCount * tuft.share);
      c.globalAlpha = tuft.alpha;
      for (let n = 0; n < tuftCount; n++) {
        const xN = decor.next();
        const y = horizonY(0, p.horizons[0], xN) * H * Math.sqrt(decor.next()) + dpr;
        const rx = leafBase * (0.3 + decor.next() * 0.4);
        const ry = rx * (0.45 + decor.next() * 0.25);
        c.fillStyle = tuft.tones[Math.floor(decor.next() * tuft.tones.length)] ?? p.litter;
        c.beginPath();
        c.ellipse(xN * W, y, rx, ry, (decor.next() - 0.5) * 0.6, 0, TAU);
        c.fill();
      }
    }

    // Viñeta suave en los laterales: centra la mirada en la raíz.
    const side = c.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(8, 5, 3, 0.22)');
    side.addColorStop(0.16, 'rgba(8, 5, 3, 0)');
    side.addColorStop(0.84, 'rgba(8, 5, 3, 0)');
    side.addColorStop(1, 'rgba(8, 5, 3, 0.22)');
    c.globalAlpha = 1;
    c.fillStyle = side;
    c.fillRect(0, 0, W, H);
  }

  function paintSprite(sprite: HTMLCanvasElement, rgb: string): void {
    const size = Math.max(2, Math.ceil(SPRITE_CSS * dpr));
    sprite.width = size;
    sprite.height = size;
    const c = sprite.getContext('2d');
    if (!c) return;
    const r = size / 2;
    const gradient = c.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, `rgba(${rgb}, 1)`);
    gradient.addColorStop(0.22, `rgba(${rgb}, 0.8)`);
    gradient.addColorStop(0.5, `rgba(${rgb}, 0.2)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    c.fillStyle = gradient;
    c.fillRect(0, 0, size, size);
  }

  function seedRain(): void {
    for (let k = 0; k < RAIN_CAP; k++) {
      rainX[k] = Math.random() * 1.3 - 0.25;
      rainY[k] = Math.random();
      rainSpeed[k] = 0.5 + Math.random() * 0.35;
      rainLen[k] = 0.025 + Math.random() * 0.03;
    }
  }

  // -------------------------------------------------------------------------------------
  // Pulsos

  /** Hijo al azar entre los ya horneados de la lista que empieza en `head` (-1 si no hay). */
  function pickChild(head: number): number {
    let n = 0;
    for (let c = head; c >= 0; c = nextSibling[c] ?? -1) {
      if ((drawn[c] ?? 0) >= 1) n++;
    }
    if (n === 0) return -1;
    let k = Math.floor(Math.random() * n);
    for (let c = head; c >= 0; c = nextSibling[c] ?? -1) {
      if ((drawn[c] ?? 0) < 1) continue;
      if (k === 0) return c;
      k--;
    }
    return -1;
  }

  function canPulse(): boolean {
    return ready && !reducedMotion && (phase === PHASE_IDLE || phase === PHASE_FADE_IN);
  }

  function spawnPulse(): void {
    if (!canPulse()) return;
    const start = pickChild(rootHead);
    if (start < 0) return;
    for (let p = 0; p < PULSE_CAP; p++) {
      if (pulseOn[p] === 1) continue;
      pulseOn[p] = 1;
      pulseSeg[p] = start;
      pulseT[p] = 0;
      pulseFade[p] = 1;
      pulseActive++;
      return;
    }
  }

  function clearPulses(): void {
    pulseOn.fill(0);
    pulseActive = 0;
  }

  function updateAndDrawPulses(dt: number): void {
    if (pulseActive === 0) return;
    const speed = PULSE_SPEED * dpr;
    // Fuego de zorro (adaptación cosmética): pulsos más grandes y luminosos.
    const r = PULSE_RADIUS * dpr * pulseGlow;
    ctx.globalCompositeOperation = 'lighter';
    for (let p = 0; p < PULSE_CAP; p++) {
      if (pulseOn[p] !== 1) continue;
      let i = pulseSeg[p] ?? 0;
      let t = pulseT[p] ?? 0;
      let fade = pulseFade[p] ?? 0;
      if (fade < 1) {
        // Llegó a una punta: se apaga allí en lugar de desaparecer de golpe.
        fade -= dt / PULSE_FADE_S;
        if (fade <= 0) {
          pulseOn[p] = 0;
          pulseActive--;
          continue;
        }
      } else {
        t += (dt * speed) / segLengthPx(i);
        while (t >= 1) {
          const next = pickChild(firstChild[i] ?? -1);
          if (next < 0) {
            t = 1;
            fade = 0.999;
            break;
          }
          t -= 1;
          i = next;
        }
      }
      pulseSeg[p] = i;
      pulseT[p] = t;
      pulseFade[p] = fade;
      const x1 = nx(segX1[i] ?? 0) * W;
      const y1 = ny(segY1[i] ?? 0) * H;
      const x = x1 + (nx(segX2[i] ?? 0) * W - x1) * t;
      const y = y1 + (ny(segY2[i] ?? 0) * H - y1) * t;
      ctx.globalAlpha = 0.9 * fade * layerAlpha;
      ctx.drawImage(glowSprite, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------------------
  // Partículas (ninguna con movimiento reducido)

  function spawnMotes(): void {
    const n = Math.min(pendingMotes, count);
    pendingMotes = 0;
    if (reducedMotion || !ready || n === 0) return;
    // Las puntas recién brotadas son los últimos segmentos de la secuencia.
    const newest = Math.min(count, n * 2);
    for (let m = 0; m < n; m++) {
      const i = count - 1 - Math.floor(Math.random() * newest);
      particles.spawn(
        nx(segX1[i] ?? 0.5),
        ny(segY1[i] ?? 0),
        (Math.random() - 0.5) * 0.02,
        -0.01 - Math.random() * 0.025,
        0,
        0.9 + Math.random() * 0.5,
        1.8 + Math.random() * 0.8,
        PARTICLE_CREAM,
      );
    }
  }

  function spawnShimmer(): void {
    if (count === 0) return;
    for (let m = 0; m < SHIMMER_COUNT; m++) {
      const i = Math.floor(Math.random() * count);
      if ((drawn[i] ?? 0) < 1) continue;
      particles.spawn(
        nx(segX2[i] ?? 0.5),
        ny(segY2[i] ?? 0),
        (Math.random() - 0.5) * 0.008,
        -0.004 - Math.random() * 0.006,
        0,
        1.2 + Math.random() * 0.7,
        2.4 + Math.random() * 0.8,
        PARTICLE_CREAM,
      );
    }
  }

  function spawnDroplets(): void {
    for (let m = 0; m < DROPLET_COUNT; m++) {
      particles.spawn(
        lastDropX,
        lastDropY,
        (Math.random() - 0.5) * 0.16,
        -0.06 - Math.random() * 0.12,
        0.9,
        0.7 + Math.random() * 0.4,
        1.6 + Math.random() * 0.6,
        PARTICLE_GLOW,
      );
    }
  }

  /** Esporas que salen de la red; con viento (al dispersar) se van hacia la derecha. */
  function spawnSpores(wind: boolean): void {
    if (count === 0) return;
    for (let m = 0; m < SPORE_PARTICLES; m++) {
      const i = Math.floor(Math.random() * count);
      if ((drawn[i] ?? 0) < 1) continue;
      particles.spawn(
        nx(((segX1[i] ?? 0.5) + (segX2[i] ?? 0.5)) / 2),
        ny(((segY1[i] ?? 0) + (segY2[i] ?? 0)) / 2),
        wind ? WIND_VX_MIN + Math.random() * WIND_VX_RANGE : (Math.random() - 0.5) * 0.03,
        wind ? -WIND_VY_MIN - Math.random() * WIND_VY_RANGE : -0.035 - Math.random() * 0.055,
        -0.02,
        wind ? WIND_LIFE_MIN + Math.random() * WIND_LIFE_RANGE : 1 + Math.random() * 0.6,
        1.3 + Math.random() * 0.8,
        PARTICLE_CREAM,
      );
    }
  }

  // -------------------------------------------------------------------------------------
  // Lluvia y tormenta

  function updateAndDrawRain(dt: number): void {
    const target = rainOn && !reducedMotion ? 1 : 0;
    const stepFade = dt / RAIN_FADE_S;
    rainFade = clamp(rainFade + clamp(target - rainFade, -stepFade, stepFade), 0, 1);
    if (rainFade <= 0 || rainCount === 0) return;
    // Desplazamiento horizontal normalizado por unidad vertical: mismo ángulo en cualquier aspecto.
    const slant = (RAIN_SLANT * H) / W;
    ctx.strokeStyle = FUEGO_FATUO;
    ctx.lineWidth = dpr;
    ctx.lineCap = 'butt';
    ctx.globalAlpha = RAIN_ALPHA * rainFade;
    ctx.beginPath();
    for (let k = 0; k < rainCount; k++) {
      const fall = (rainSpeed[k] ?? 0.6) * dt;
      let y = (rainY[k] ?? 0) + fall;
      let x = (rainX[k] ?? 0) + fall * slant;
      if (y > 1.08) {
        y = -0.08 * Math.random();
        x = Math.random() * 1.3 - 0.25;
      }
      rainX[k] = x;
      rainY[k] = y;
      const len = (rainLen[k] ?? 0.03) * H;
      const px = x * W;
      const py = y * H;
      ctx.moveTo(px, py);
      ctx.lineTo(px - RAIN_SLANT * len, py - len);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function stormIntensity(now: number): number {
    if (reducedMotion) return 0;
    if (stormOn && now >= stormNextAt) {
      stormStart = now;
      stormNextAt = now + STORM_MIN_GAP_MS + Math.random() * STORM_GAP_RANGE_MS;
    }
    const p = (now - stormStart) / STORM_GLOW_MS;
    return p >= 0 && p < 1 ? Math.sin(Math.PI * p) : 0;
  }

  function achievementLift(now: number): number {
    const p = (now - achievementStart) / ACHIEVEMENT_MS;
    return p >= 0 && p < 1 ? Math.sin(Math.PI * p) * ACHIEVEMENT_LIFT : 0;
  }

  function restartAchievementGlow(now: number): void {
    const p = (now - achievementStart) / ACHIEVEMENT_MS;
    // Reiniciar la campana en marcha hundiría el brillo a cero de golpe: un destello más sin
    // límite de ritmo. Si aún sube, ya llegará a su pico; si baja, salta al punto simétrico de
    // la subida (mismo valor) y vuelve a crecer sin escalón.
    if (p < 0.5) return;
    achievementStart = p < 1 ? now - (1 - p) * ACHIEVEMENT_MS : now;
  }

  // -------------------------------------------------------------------------------------
  // Esporulación

  /**
   * Pide la esporulación orquestada. Con `wind` es una dispersión: las esporas se van con el
   * viento y, con la red ya disuelta, cambia el suelo.
   */
  function requestSporulation(wind: boolean): void {
    // Si la animación en marcha descarta el aviso, la ráfaga queda pedida igual para cuando
    // suelte las esporas.
    if (wind) windy = true;
    if (phase !== PHASE_IDLE && phase !== PHASE_FADE_IN) return;
    const now = performance.now();
    // La ventana solo une el evento y el contador de una misma esporulación. Una dispersión
    // no se descarta nunca: justo después de esporular, la red nueva brotaría en el suelo viejo.
    if (!wind && now - sporeRequestedAt < SPORE_DEDUPE_MS) return;
    sporeRequestedAt = now;
    sporePending = true;
    pendingMotes = 0;
  }

  function clearNetwork(): void {
    resetNetworkData(netSeed);
    if (ready) layer.clearRect(0, 0, W, H);
    clearPulses();
    needsDraw = true;
  }

  /**
   * Con la red ya disuelta, cambia el suelo si el estado pide otro bioma. El nuevo se pinta en
   * la capa acumulada, vacía en este momento, y se funde encima del viejo: no hace falta otro
   * lienzo. Con movimiento reducido (o sin lienzo) el cambio es instantáneo. Devuelve si
   * empezó el fundido.
   */
  function beginSoilChange(now: number): boolean {
    if (bgBiome === wantBiome) return false;
    if (reducedMotion || !ready) {
      bgBiome = wantBiome;
      if (ready) paintBackground(bg, bgBiome);
      needsDraw = true;
      return false;
    }
    soilBiome = wantBiome;
    paintBackground(layer, soilBiome);
    phase = PHASE_SOIL;
    phaseStart = now;
    layerAlpha = 0;
    sporeLift = 0;
    return true;
  }

  /** Termina el fundido: el suelo nuevo pasa al fondo y la capa queda vacía para la red. */
  function finishSoilChange(): void {
    bgBiome = soilBiome;
    if (ready) {
      paintBackground(bg, bgBiome);
      layer.clearRect(0, 0, W, H);
    }
    phase = PHASE_WAIT;
    layerAlpha = 0;
    sporeLift = 0;
    needsDraw = true;
  }

  function startReducedFade(now: number): void {
    fadeFromAlpha = layerAlpha;
    fadeFromLift = sporeLift;
    phase = PHASE_FADE_OUT;
    phaseStart = now;
  }

  function updatePhase(now: number): void {
    if (sporePending) {
      sporePending = false;
      if (reducedMotion) {
        startReducedFade(now);
      } else {
        phase = PHASE_GLOW;
        phaseStart = now;
      }
    }
    const elapsed = now - phaseStart;
    switch (phase) {
      case PHASE_GLOW: {
        const p = clamp01(elapsed / SPORE_GLOW_MS);
        layerAlpha = 1;
        sporeLift = smooth(p) * SPORE_LIFT;
        if (p >= 1) {
          spawnSpores(windy);
          windy = false;
          phase = PHASE_DISSOLVE;
          phaseStart = now;
        }
        break;
      }
      case PHASE_DISSOLVE: {
        const p = clamp01(elapsed / SPORE_DISSOLVE_MS);
        layerAlpha = 1 - smooth(p);
        sporeLift = (1 - p) * SPORE_LIFT;
        if (p >= 1) {
          // La red se va: la siguiente lectura del estado la regenera de golpe (tras el suelo
          // nuevo, si se dispersó).
          clearNetwork();
          phase = PHASE_WAIT;
          layerAlpha = 0;
          sporeLift = 0;
          beginSoilChange(now);
        }
        break;
      }
      case PHASE_FADE_OUT: {
        const p = clamp01(elapsed / REDUCED_FADE_MS);
        layerAlpha = fadeFromAlpha * (1 - p);
        sporeLift = fadeFromLift * (1 - p);
        if (p >= 1) {
          clearNetwork();
          phase = PHASE_WAIT;
          layerAlpha = 0;
          sporeLift = 0;
          // Movimiento reducido: el suelo cambia de golpe, sin fundido.
          windy = false;
          beginSoilChange(now);
        }
        break;
      }
      case PHASE_SOIL: {
        const p = clamp01(elapsed / SOIL_FADE_MS);
        // La capa acumulada lleva el suelo nuevo: se funde encima del viejo.
        layerAlpha = smooth(p);
        sporeLift = 0;
        if (p >= 1) finishSoilChange();
        break;
      }
      case PHASE_WAIT:
        layerAlpha = 0;
        sporeLift = 0;
        break;
      case PHASE_FADE_IN: {
        const p = clamp01(elapsed / (reducedMotion ? REDUCED_FADE_MS : SPORE_FADE_IN_MS));
        layerAlpha = smooth(p);
        sporeLift = 0;
        if (p >= 1) {
          phase = PHASE_IDLE;
          layerAlpha = 1;
          // Una dispersión que llegó con las esporas ya sueltas no deja la ráfaga para la
          // próxima esporulación.
          windy = false;
        }
        break;
      }
      default:
        layerAlpha = 1;
        sporeLift = 0;
        break;
    }
  }

  // -------------------------------------------------------------------------------------
  // Lectura del estado

  function readState(state: GameState): void {
    pulseGlow = 1 + FOXFIRE_GLOW_PER_RANK * state.adaptations.foxfire;
    let weighted = 0;
    let highest = -1;
    for (const [tier, id] of GENERATOR_IDS.entries()) {
      const owned = state.owned[id];
      if (owned > 0) {
        weighted += owned * (tier + 1) * (tier + 1);
        highest = tier;
      }
    }
    wantTarget = segmentTarget(weighted);

    wantBiome = state.forest.biome;
    wantLeg = state.forest.leg;
    const soil = SOIL_PALETTES[wantBiome];

    // Profundidad: cada nivel de generador baja la red y las esporas la ahondan un poco
    // más; Malheur y Planetario la llevan al fondo y a todo el ancho. El bioma la acorta
    // después de redondear (en el Chocó se queda cerca de la superficie, como la estera de
    // raíces), así que en el natal (×1) es exactamente la de la 1.2.
    const sporeDepth = Math.log10(1 + Math.max(0, state.spores.level));
    if (highest >= DEEPEST_TIER) {
      wantReach = soil.reach;
      wantSpread = 0.49;
    } else {
      wantReach =
        (Math.round(Math.min(0.97, 0.26 + 0.078 * (highest + 1) + 0.1 * sporeDepth) * 100) / 100) *
        soil.reach;
      wantSpread = Math.round(Math.min(0.46, 0.28 + 0.022 * (highest + 1) + 0.03 * sporeDepth) * 100) / 100;
    }

    const rhizomorphs = state.owned.rhizomorph;
    wantCordTier = rhizomorphs > 0 ? Math.min(8, 1 + Math.floor(Math.log2(rhizomorphs))) : 0;
    wantMush = mushroomsFor(state.owned.mushroom);
    wantRings = ringsFor(state.owned.fairyRing);
    wantTrees = treesFor(state.owned.motherTree);
    wantForest = forestFor(state.owned.ancientForest);
    // Una red por partida y, desde el primer destino, otra familia de redes por tramo.
    const sporulations = state.stats.sporulations;
    wantSeed =
      wantLeg === 0 ? mixSeed(seed, sporulations) : mixSeed(mixSeed(seed, LEG_SALT + wantLeg), sporulations);

    const decades = num.log10(num.add(num.ONE, derived(state).production));
    pulseRate =
      Number.isFinite(decades) && decades > 0 ? Math.min(PULSE_RATE_MAX, PULSE_RATE_PER_DECADE * decades) : 0;

    rainOn = false;
    stormOn = false;
    for (const effect of state.effects) {
      if (effect.remaining <= 0) continue;
      if (effect.kind === 'downpour') rainOn = true;
      if (effect.kind === 'storm') stormOn = true;
    }
    const drop = state.rain.drop;
    if (drop) {
      lastDropX = clamp01(drop.x);
      lastDropY = clamp01(drop.y);
    }
  }

  /** Copia los parámetros pedidos a los del horneado; dice si la capa debe rehornearse. */
  function applyParams(): boolean {
    const changed =
      reach !== wantReach ||
      spread !== wantSpread ||
      cordTier !== wantCordTier ||
      mushCount !== wantMush ||
      ringCount !== wantRings ||
      treeCount !== wantTrees ||
      forestCount !== wantForest;
    reach = wantReach;
    spread = wantSpread;
    cordTier = wantCordTier;
    // Con más rizomorfos los cordones se alargan y, desde 8, también siguen la primera bifurcación.
    cordMaxOrder = cordTier >= 4 ? 1 : 0;
    cordMaxHop = 4 + 5 * cordTier;
    mushCount = wantMush;
    ringCount = wantRings;
    treeCount = wantTrees;
    forestCount = wantForest;
    return changed;
  }

  function regrowInstant(): void {
    resetNetworkData(wantSeed);
    applyParams();
    while (count < wantTarget && addSegment()) drawn[count - 1] = 1;
    growFrom = count;
    clearPulses();
    rebake();
  }

  // -------------------------------------------------------------------------------------
  // Interfaz pública

  const view: NetworkView = {
    resize() {
      if (destroyed) return;
      const rect = canvas.getBoundingClientRect();
      const nextDpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const nextW = Math.max(0, Math.round(rect.width * nextDpr));
      const nextH = Math.max(0, Math.round(rect.height * nextDpr));
      if (nextW === W && nextH === H && nextDpr === dpr) return;
      W = nextW;
      H = nextH;
      dpr = nextDpr;
      canvas.width = W;
      canvas.height = H;
      ready = W >= MIN_PIXELS && H >= MIN_PIXELS;
      // Un lienzo de 0 px (pestaña o panel ocultos) no dibuja nada hasta tener tamaño.
      bgCanvas.width = ready ? W : 0;
      bgCanvas.height = ready ? H : 0;
      layerCanvas.width = ready ? W : 0;
      layerCanvas.height = ready ? H : 0;
      // Cambiar el tamaño borra la capa con el suelo que se estaba fundiendo: el cambio se da
      // por terminado aquí (el fondo se pinta abajo, una sola vez) y la red nueva brota sobre
      // el suelo nuevo. Sin transición en marcha, el fondo toma ya el bioma del estado.
      if (phase === PHASE_SOIL) {
        bgBiome = soilBiome;
        phase = PHASE_WAIT;
        layerAlpha = 0;
      } else if (!sporePending && phase === PHASE_IDLE) {
        bgBiome = wantBiome;
      }
      if (!ready) return;
      paintSprite(creamSprite, MICELIO_RGB);
      paintSprite(glowSprite, FUEGO_FATUO_RGB);
      paintBackground(bg, bgBiome);
      stormGradient = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      stormGradient.addColorStop(0, `rgba(${MICELIO_RGB}, 1)`);
      stormGradient.addColorStop(1, `rgba(${MICELIO_RGB}, 0)`);
      rainCount = Math.min(RAIN_CAP, Math.round((W * H) / (dpr * dpr * RAIN_AREA_PER_STREAK)));
      seedRain();
      rebake();
    },

    sync(state) {
      if (destroyed) return;
      readState(state);
      const sporulations = state.stats.sporulations;
      // Un tramo nuevo es una dispersión aunque su evento no haya llegado; si además esporuló,
      // es la misma animación.
      if (lastLeg >= 0 && wantLeg !== lastLeg) requestSporulation(true);
      else if (lastSporulations >= 0 && sporulations > lastSporulations) requestSporulation(false);
      lastLeg = wantLeg;
      lastSporulations = sporulations;

      if (!ready) {
        // Sin lienzo no hay suelo que fundir: el próximo cambio de tamaño ya pinta el nuevo.
        bgBiome = wantBiome;
      } else if (
        bgBiome !== wantBiome &&
        !sporePending &&
        (phase === PHASE_IDLE || phase === PHASE_FADE_IN)
      ) {
        // Un cambio de bioma pasa siempre por la transición, aunque su aviso se haya perdido:
        // regenerar aquí de golpe dejaría la red nueva sobre el suelo viejo.
        requestSporulation(true);
      }

      // Durante la esporulación la red vieja se queda quieta hasta disolverse, y la nueva
      // espera a que termine de cambiar el suelo.
      if (
        sporePending ||
        phase === PHASE_GLOW ||
        phase === PHASE_DISSOLVE ||
        phase === PHASE_FADE_OUT ||
        phase === PHASE_SOIL
      )
        return;
      if (phase === PHASE_WAIT) {
        // La red se disolvió antes de que llegara la dispersión: falta cambiar el suelo.
        if (beginSoilChange(performance.now())) return;
        regrowInstant();
        phase = PHASE_FADE_IN;
        phaseStart = performance.now();
        return;
      }
      // Primera lectura, otra partida o una red más pequeña (guardado importado): de golpe.
      if (firstSync || wantSeed !== netSeed || wantTarget < count) {
        firstSync = false;
        regrowInstant();
        return;
      }
      if (applyParams()) rebake();
      if (wantTarget > count) grow(!reducedMotion);
      if (pendingMotes > 0) spawnMotes();
    },

    onEvent(event) {
      if (destroyed) return;
      switch (event.type) {
        case 'click':
          spawnPulse();
          break;
        case 'buyGenerator':
          pendingMotes = Math.min(MOTES_MAX, pendingMotes + 3 + Math.min(7, event.count));
          break;
        case 'achievement':
          if (!reducedMotion) {
            restartAchievementGlow(performance.now());
            spawnShimmer();
          }
          break;
        case 'rainCaught':
        case 'rainFell':
          if (!reducedMotion) spawnDroplets();
          break;
        case 'sporulate':
          requestSporulation(false);
          break;
        case 'disperse':
          // El evento llega antes que la próxima lectura del estado: el destino se toma de él
          // para que el suelo cambie aunque la red termine de disolverse antes de esa lectura.
          wantBiome = event.to;
          requestSporulation(true);
          break;
        default:
          break;
      }
    },

    frame(now) {
      if (destroyed) return;
      const dt = lastNow < 0 ? 0 : Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      if (!ready) {
        // Sin lienzo no hay nada que orquestar: la red se regenera en la próxima lectura en
        // vez de quedarse congelada a media esporulación hasta que vuelva a tener tamaño, y el
        // suelo cambia de golpe (el próximo cambio de tamaño lo pinta).
        if (
          sporePending ||
          phase === PHASE_GLOW ||
          phase === PHASE_DISSOLVE ||
          phase === PHASE_FADE_OUT ||
          phase === PHASE_SOIL
        ) {
          sporePending = false;
          windy = false;
          clearNetwork();
          phase = PHASE_WAIT;
        }
        bgBiome = wantBiome;
        return;
      }

      const growing = advanceGrowth(now);
      updatePhase(now);
      // Durante el fundido la capa lleva el suelo nuevo: el brillo del logro lo encendería.
      const lift = phase === PHASE_SOIL ? 0 : Math.max(sporeLift, achievementLift(now));
      const storm = stormIntensity(now);

      if (pulseRate > 0 && canPulse()) {
        pulseAcc += pulseRate * dt;
        while (pulseAcc >= 1) {
          pulseAcc -= 1;
          spawnPulse();
        }
      }

      const animated =
        growing ||
        phase !== PHASE_IDLE ||
        lift > 0 ||
        storm > 0 ||
        rainFade > 0 ||
        (rainOn && !reducedMotion) ||
        pulseActive > 0 ||
        particles.activeCount() > 0;
      // Un frame más tras la última animación borra su rastro; después, nada que redibujar.
      if (!animated && !needsDraw && !lastFrameAnimated) return;
      lastFrameAnimated = animated;
      needsDraw = false;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(bgCanvas, 0, 0);
      if (layerAlpha > 0.001) {
        ctx.globalAlpha = layerAlpha;
        ctx.drawImage(layerCanvas, 0, 0);
        if (lift > 0.001) {
          // Suma la capa sobre sí misma: la red brilla sin cambiar de forma.
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = lift * layerAlpha;
          ctx.drawImage(layerCanvas, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (storm > 0 && stormGradient) {
        ctx.globalAlpha = storm * STORM_ALPHA;
        ctx.fillStyle = stormGradient;
        ctx.fillRect(0, 0, W, H);
      }
      updateAndDrawRain(dt);
      updateAndDrawPulses(dt);
      particles.update(dt);
      particles.draw(ctx, W, H, dpr, creamSprite, glowSprite);
      ctx.globalAlpha = 1;
    },

    setReducedMotion(on) {
      if (destroyed) return;
      reducedMotion = on;
      if (!on) return;
      particles.clear();
      clearPulses();
      rainFade = 0;
      stormStart = -Infinity;
      achievementStart = -Infinity;
      pendingMotes = 0;
      finishGrowth();
      if (phase === PHASE_GLOW || phase === PHASE_DISSOLVE) startReducedFade(performance.now());
      else if (phase === PHASE_SOIL) finishSoilChange();
      windy = false;
      needsDraw = true;
    },

    isTransitioning() {
      return ready && (sporePending || phase !== PHASE_IDLE);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      ready = false;
      particles.clear();
      clearPulses();
      // Liberar la memoria de los lienzos fuera de pantalla sin esperar al recolector.
      bgCanvas.width = 0;
      bgCanvas.height = 0;
      layerCanvas.width = 0;
      layerCanvas.height = 0;
      creamSprite.width = 0;
      creamSprite.height = 0;
      glowSprite.width = 0;
      glowSprite.height = 0;
    },
  };

  view.resize();
  return view;
}

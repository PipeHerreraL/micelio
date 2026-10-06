/**
 * Cómo se ven las adaptaciones cosméticas de los votos (fase 10, bloque B) en el lienzo de la red:
 * Esporada (el color de las esporas al esporular), Cordones negros (los rizomorfos) e Higróforos
 * (setas color de cera en la superficie). Solo tonos, tamaños y el trazo de un cordón, para que se
 * prueben sin lienzo; render/network.ts los usa al hornear la capa y al pintar el sprite de las
 * esporas, nunca en cada frame.
 *
 * Con rango 0 nada cambia: las esporas son del crema del micelio y los cordones se trazan como
 * siempre. Ningún tono es el rebozuelo (#E8A93A), el acento de compras de la interfaz.
 */

/**
 * Esporas por rango de Esporada, en «r, g, b» para el degradado del sprite: el crema del micelio
 * (rango 0, como en la 1.5), rosa, herrumbre y púrpura negruzca, colores de esporada reales. El
 * púrpura está aclarado hasta 3:1 contra la hojarasca y el humus de cada suelo
 * (tests/palettes.test.ts): el de una esporada de verdad no se vería sobre la tierra oscura.
 */
export const SPORE_PRINT_TONES = ['#EFE6D2', '#E8B4A8', '#B5683C', '#8C6385'] as const;

/** Tono de las esporas con `rank` rangos de Esporada, como «r, g, b». */
export function sporePrintRgb(rank: number): string {
  const tone = SPORE_PRINT_TONES[Math.min(Math.max(0, rank), SPORE_PRINT_TONES.length - 1)] ?? '#EFE6D2';
  return [1, 3, 5].map((i) => Number.parseInt(tone.slice(i, i + 2), 16)).join(', ');
}

/**
 * Filo de los Cordones negros: el crema del micelio, como la luz de borde de los troncos. Su alfa
 * no es el de los troncos (0,14): con 0,62 el filo queda a 3:1 o más contra la hojarasca, el humus y
 * el primer horizonte de cada suelo (el peor, el horizonte gris ceniza de la taiga, 3,21), y el
 * cordón negro se lee sobre la tierra oscura.
 */
export const CORD_RIM_TONE = '#EFE6D2';
export const CORD_RIM_ALPHA = 0.62;
/** Ancho del filo a cada lado del núcleo, en píxeles CSS. */
export const CORD_RIM_CSS = 0.75;
/**
 * Núcleo del cordón por rango, cada vez más oscuro. Es opaco: volver a trazarlo encima de un filo
 * (el del cordón siguiente, en la misma unión) deja el mismo color, sin oscurecer el cordón.
 */
export const CORD_CORE_TONES = ['#2E2219', '#1A130E', '#0B0806'] as const;
/**
 * El núcleo engorda un 15 % del ancho del cordón por rango. Con un 20 %, en el tercer rango los
 * cordones tapaban casi toda la red fina de alrededor (mirado en el navegador).
 */
const CORD_CORE_GROWTH = 0.15;

/** Ancho del núcleo con `rank` rangos de Cordones negros, para un cordón de ancho `width`. */
export function cordCoreWidth(width: number, rank: number): number {
  return width * (1 + CORD_CORE_GROWTH * rank);
}

/** Tono del núcleo con `rank` rangos (≥ 1). */
export function cordCoreTone(rank: number): string {
  return CORD_CORE_TONES[Math.min(Math.max(1, rank), CORD_CORE_TONES.length) - 1] ?? '#0B0806';
}

/** Traza el filo crema de un cordón negro: un trazo más ancho que su núcleo, por debajo de él. */
export function strokeCordRim(
  c: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  rank: number,
  dpr: number,
): void {
  c.strokeStyle = CORD_RIM_TONE;
  c.globalAlpha = CORD_RIM_ALPHA;
  c.lineWidth = cordCoreWidth(width, rank) + 2 * CORD_RIM_CSS * dpr;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

/** Traza el núcleo oscuro y opaco de un cordón negro, encima de su filo. */
export function strokeCordCore(
  c: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  rank: number,
): void {
  c.strokeStyle = cordCoreTone(rank);
  c.globalAlpha = 1;
  c.lineWidth = cordCoreWidth(width, rank);
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

/**
 * Higróforos: carmín (como Hygrocybe punicea) y amarillo limón (como H. chlorophana). El carmín
 * está aclarado hasta 3:1 contra la hojarasca de cada suelo; el amarillo tira a verde, lejos del
 * naranja del rebozuelo.
 */
export const WAXCAP_TONES = ['#D0344A', '#E0CE45'] as const;
/** Setas por rango: 3, 6 y 9. */
export const WAXCAPS_PER_RANK = 3;
export const WAXCAP_MAX = 3 * WAXCAPS_PER_RANK;

/** Higróforos en la superficie con `rank` rangos. */
export function waxcapCount(rank: number): number {
  return Math.min(WAXCAP_MAX, Math.max(0, rank) * WAXCAPS_PER_RANK);
}

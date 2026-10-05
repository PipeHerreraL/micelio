/**
 * Suelos del canvas por bioma (docs/ROADMAP.md, fase 8): colores, geometría de los horizontes,
 * hojarasca y siluetas de cada bosque. Son constantes de módulo para que el render no cree
 * ningún objeto al cambiar de bioma.
 *
 * El contraste del micelio (#EFE6D2) y del fuego fatuo (#B8EFC4) sobre cada franja se midió al
 * diseñar la fase 8: el peor caso sigue siendo la arcilla del natal (4,66 y 4,46), y todas las
 * franjas de los demás suelos quedan por encima, también con los hilos y las lentes de hielo
 * encima. tests/palettes.test.ts lo comprueba para cada color nuevo.
 *
 * Las muestras de suelo y el suelo de respaldo de `.stage__soil` (`[data-biome]` en
 * src/ui/styles.css) copian colores de aquí: si cambia uno, cambia en los dos sitios.
 *
 * El rebozuelo (#E8A93A) no aparece en ninguna paleta: es el acento de compras de la
 * interfaz, y en el canvas competiría con los botones (ARCHITECTURE.md §11).
 */
import type { BiomeId } from '../data/biomes.ts';

/**
 * Grosor medio de la hojarasca (≈ 7 % de la altura, PROMPT.md §14). Es el mismo en todos los
 * biomas: las setas, los árboles y la raíz de la red se apoyan en esa frontera y así no se
 * mueven al cambiar de suelo.
 */
export const LITTER_DEPTH = 0.072;

/** Abedul entre los troncos lejanos de la taiga: corteza clara, casi borrada por la distancia. */
export const BIRCH_TONE = '#BDB5A6';
export const BIRCH_ALPHA = 0.18;

/** Una pasada de matas sobre la hojarasca (musgo, liquen), después de las hojas. */
export interface SoilTuft {
  tones: readonly string[];
  /** Fracción del número de hojas. */
  share: number;
  alpha: number;
}

/**
 * Lo que se recorta en la hojarasca: troncos (los bosques), hierba alta con un roble solo
 * (pradera) o arbustos enanos con un pingo al fondo (tundra).
 */
export type SilhouetteKind = 'trees' | 'grass' | 'shrubs';

/** Hilos finos y claros en el subsuelo, como el pseudomicelio de carbonato del chernozem. */
export interface SoilThreads {
  tone: string;
  alpha: number;
  /** En (0, 1], como `leafDensity`. */
  density: number;
}

/** Lentes de hielo horizontales en el horizonte más hondo, como en el permafrost. */
export interface SoilLenses {
  tone: string;
  alpha: number;
  /** En (0, 1], como `leafDensity`. */
  density: number;
}

export interface SoilPalette {
  /** Fronteras hojarasca/humus, humus/horizonte medio y medio/profundo (fracciones de la altura). */
  horizons: readonly [number, number, number];
  /**
   * Dónde empieza el degradado profundo (fracción de la altura): `horizons[2] − 0,06`. Se
   * guarda en vez de calcularse porque 0,68 − 0,06 da 0,6200000000000001 y el natal debe
   * pintar exactamente lo mismo que en la 1.2.1, que usaba 0,62 literal.
   */
  deepStart: number;
  litter: string;
  humusTop: string;
  humus: string;
  band: string;
  deepTop: string;
  deepMid: string;
  deepBottom: string;
  leafTones: readonly string[];
  leafVein: string;
  /** Largo de la hoja: [mínimo, rango] en múltiplos del tamaño base. */
  leafLength: readonly [number, number];
  /** Ancho de la hoja: [mínimo, rango] en múltiplos de su largo. */
  leafWidth: readonly [number, number];
  veinChance: number;
  leafDensity: number;
  tufts: readonly SoilTuft[];
  speckDark: string;
  speckLight: string;
  pebbleTones: readonly string[];
  silhouette: string;
  distantSilhouette: string;
  /** Multiplica el medio ancho de los troncos lejanos. */
  distantWidth: number;
  /** Cada cuántos troncos lejanos hay un abedul (0 = ninguno). */
  birchEvery: number;
  /** Multiplica el medio ancho del Árbol madre. */
  treeWidth: number;
  /** Raíces tablares en la base del Árbol madre. */
  buttress: boolean;
  /** Multiplica la profundidad que alcanza la red. */
  reach: number;
  silhouetteKind: SilhouetteKind;
  /** null = sin hilos: los suelos de la 1.3–1.5 pintan lo mismo que antes. */
  threads: SoilThreads | null;
  /** null = sin lentes de hielo (todos menos la tundra). */
  lenses: SoilLenses | null;
}

const NATAL: SoilPalette = {
  horizons: [LITTER_DEPTH, 0.34, 0.68],
  deepStart: 0.62,
  litter: '#2A1F16',
  humusTop: '#1F1711',
  humus: '#261C15',
  band: '#4A3424',
  deepTop: '#5A3B26',
  deepMid: '#6E4630',
  deepBottom: '#8C5A35',
  leafTones: ['#1E1610', '#271D14', '#33261A', '#3D2C1E', '#4A3424', '#553C27'],
  leafVein: '#5C4430',
  leafLength: [0.65, 0.8],
  leafWidth: [0.26, 0.2],
  veinChance: 0.5,
  leafDensity: 1,
  tufts: [],
  speckDark: '#120C08',
  speckLight: '#C9A57E',
  pebbleTones: ['#6B4A31', '#7E5838', '#9A7150'],
  silhouette: '#0E0A07',
  distantSilhouette: '#110C08',
  distantWidth: 1,
  birchEvery: 0,
  treeWidth: 1,
  buttress: false,
  reach: 1,
  silhouetteKind: 'trees',
  threads: null,
  lenses: null,
};

/**
 * Podzol: un horizonte O grueso (mor), un E estrecho y gris ceniza que el ácido lavó, el Bh
 * oscuro y el Bs color óxido, y abajo el till glaciar. Acículas en lugar de hojas, sin nervio.
 */
const TAIGA: SoilPalette = {
  horizons: [LITTER_DEPTH, 0.25, 0.47],
  deepStart: 0.41,
  litter: '#221C16',
  humusTop: '#15110D',
  humus: '#1C1612',
  band: '#5E5A54',
  deepTop: '#3A2216',
  deepMid: '#6B3A1E',
  deepBottom: '#6E604E',
  leafTones: ['#1A1510', '#2B2117', '#3E2D1C', '#55391F'],
  // Sin uso: las acículas no llevan nervio (veinChance 0). Se deja un tono de la propia
  // hojarasca para que, si alguien sube veinChance, no aparezca un color ajeno al suelo.
  leafVein: '#55391F',
  leafLength: [0.9, 0.7],
  leafWidth: [0.1, 0.04],
  veinChance: 0,
  leafDensity: 1,
  tufts: [
    { tones: ['#2F3A26', '#3B4A2E'], share: 0.15, alpha: 0.8 },
    { tones: ['#9FA38C'], share: 0.03, alpha: 0.35 },
  ],
  speckDark: '#0E0C0A',
  speckLight: '#B9B2A4',
  pebbleTones: ['#5F5B55', '#77716A', '#8E877D'],
  silhouette: '#0C0D0D',
  distantSilhouette: '#0F1010',
  distantWidth: 0.7,
  birchEvery: 4,
  treeWidth: 0.8,
  buttress: false,
  reach: 1,
  silhouetteKind: 'trees',
  threads: null,
  lenses: null,
};

/**
 * Ultisol del Chocó: un A delgado (la selva recicla la hoja en meses, de ahí la hojarasca más
 * rala) y un B rojo de metros por los óxidos de hierro. Hoja ancha. La red se queda más cerca
 * de la superficie, como la estera de raíces que retiene los nutrientes.
 */
const CHOCO: SoilPalette = {
  horizons: [LITTER_DEPTH, 0.16, 0.4],
  deepStart: 0.34,
  litter: '#1F1712',
  humusTop: '#1A120D',
  humus: '#2A1912',
  band: '#5A2617',
  deepTop: '#6E2E1B',
  deepMid: '#86391F',
  deepBottom: '#8F4A26',
  leafTones: ['#17110C', '#251A12', '#3A2416', '#4A2A18', '#2F3A22', '#7A3A1E'],
  leafVein: '#5A3A24',
  leafLength: [1.2, 0.6],
  leafWidth: [0.35, 0.15],
  veinChance: 0.5,
  leafDensity: 0.7,
  tufts: [],
  speckDark: '#120A07',
  speckLight: '#D08A5A',
  pebbleTones: ['#5A2A16', '#7A3B1E', '#A0522D'],
  silhouette: '#0B0E0A',
  distantSilhouette: '#0E100C',
  distantWidth: 1.3,
  birchEvery: 0,
  treeWidth: 1,
  buttress: true,
  reach: 0.85,
  silhouetteKind: 'trees',
  threads: null,
  lenses: null,
};

/**
 * Chernozem de la pradera: un horizonte A negro y grueso (siglos de raíces de hierba), una franja
 * parda de transición y abajo el loess color canela con hilos finos de pseudomicelio, carbonato
 * que parece hifas. Su tono (#D9D2C3, más gris que el micelio) y su alfa baja (≤ 0,18) evitan que
 * se confundan con la red. Hojarasca de hierba seca: briznas largas y finas, sin nervio. El loess
 * es más oscuro que uno real para que la red se lea encima: con los hilos, 4,61 contra el fuego
 * fatuo en el tramo más claro.
 */
const PRAIRIE: SoilPalette = {
  horizons: [LITTER_DEPTH, 0.46, 0.74],
  deepStart: 0.68,
  litter: '#2B2618',
  humusTop: '#121110',
  humus: '#181614',
  band: '#3B2E22',
  deepTop: '#4E3A2A',
  deepMid: '#5A4430',
  deepBottom: '#62493A',
  leafTones: ['#2A2516', '#3A3320', '#4A4129', '#5A4F32', '#685B3A'],
  // Sin uso: las briznas no llevan nervio (veinChance 0), como las acículas de la taiga.
  leafVein: '#5A4F32',
  leafLength: [1.2, 0.9],
  leafWidth: [0.07, 0.04],
  veinChance: 0,
  leafDensity: 1,
  tufts: [{ tones: ['#2F3A22', '#3C4A2A'], share: 0.08, alpha: 0.75 }],
  speckDark: '#0B0A08',
  speckLight: '#C9B79A',
  pebbleTones: ['#4F4234', '#5E4F3E', '#6E5C48'],
  silhouette: '#0D0C08',
  distantSilhouette: '#15130C',
  distantWidth: 1,
  birchEvery: 0,
  // El roble solo de la pradera: más ancho que los troncos del bosque.
  treeWidth: 1.35,
  buttress: false,
  reach: 1,
  silhouetteKind: 'grass',
  threads: { tone: '#D9D2C3', alpha: 0.16, density: 0.6 },
  lenses: null,
};

/**
 * Criosol de la tundra: turba fina, la capa activa gris azulada (se deshiela cada verano) y, desde
 * 0,58, el permafrost con lentes de hielo horizontales. La red no baja del permafrost: `reach`
 * 0,55 la deja justo encima. Musgo y matas de liquen pálido sobre una hojarasca de hojas diminutas
 * (abedul enano, sauces rastreros).
 */
const TUNDRA: SoilPalette = {
  horizons: [LITTER_DEPTH, 0.2, 0.58],
  deepStart: 0.52,
  litter: '#1F1E17',
  humusTop: '#14120E',
  humus: '#1D1915',
  band: '#434A4E',
  deepTop: '#2E3439',
  deepMid: '#38424A',
  deepBottom: '#404C55',
  leafTones: ['#1C1C14', '#26271B', '#313224', '#4A3526', '#5A3A28'],
  leafVein: '#4A3526',
  leafLength: [0.45, 0.35],
  leafWidth: [0.45, 0.2],
  veinChance: 0.2,
  leafDensity: 0.75,
  tufts: [
    { tones: ['#2E3826', '#38452C'], share: 0.18, alpha: 0.8 },
    { tones: ['#A8AD95', '#BDBFA6'], share: 0.08, alpha: 0.45 },
  ],
  speckDark: '#0B0C0C',
  speckLight: '#B7BDB8',
  pebbleTones: ['#55595A', '#6B6F6F', '#808483'],
  silhouette: '#0B0C0C',
  distantSilhouette: '#101213',
  distantWidth: 1,
  birchEvery: 0,
  // Ancho de la copa de los arbustos enanos.
  treeWidth: 1.5,
  buttress: false,
  reach: 0.55,
  silhouetteKind: 'shrubs',
  threads: null,
  lenses: { tone: '#CFDDE2', alpha: 0.18, density: 0.55 },
};

export const SOIL_PALETTES: Readonly<Record<BiomeId, SoilPalette>> = {
  natal: NATAL,
  taiga: TAIGA,
  choco: CHOCO,
  prairie: PRAIRIE,
  tundra: TUNDRA,
};

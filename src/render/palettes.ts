/**
 * Suelos del canvas por bioma (docs/ROADMAP.md, fase 8): colores, geometría de los horizontes,
 * hojarasca y siluetas de cada bosque. Son constantes de módulo para que el render no cree
 * ningún objeto al cambiar de bioma.
 *
 * El contraste del micelio (#EFE6D2) y del fuego fatuo (#B8EFC4) sobre cada franja se midió al
 * diseñar la fase 8: el peor caso sigue siendo la arcilla del natal (4,66 y 4,46), y todas las
 * franjas de la taiga y del Chocó quedan por encima. Un color nuevo debe medirse igual.
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
};

export const SOIL_PALETTES: Readonly<Record<BiomeId, SoilPalette>> = {
  natal: NATAL,
  taiga: TAIGA,
  choco: CHOCO,
};

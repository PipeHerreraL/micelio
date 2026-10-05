import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BIOME_IDS } from '../src/data/biomes.ts';
import { BIRCH_TONE, LITTER_DEPTH, SOIL_PALETTES, type SoilPalette } from '../src/render/palettes.ts';

const MICELIO = '#EFE6D2';
const FUEGO_FATUO = '#B8EFC4';

/** Luminancia relativa de un #RRGGBB (WCAG 2). */
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** `top` pintado con alfa `alpha` sobre `base`, redondeado a #RRGGBB como lo pinta el lienzo. */
function over(base: string, top: string, alpha: number): string {
  const channel = (hex: string, i: number): number => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const mixed = [0, 1, 2].map((i) =>
    Math.round(channel(base, i) * (1 - alpha) + channel(top, i) * alpha)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${mixed.join('')}`;
}

/** Las franjas del suelo sobre las que crece la red, de la hojarasca al fondo. */
function strips(p: SoilPalette): string[] {
  return [p.litter, p.humusTop, p.humus, p.band, p.deepTop, p.deepMid, p.deepBottom];
}

/** Todos los colores de una paleta, recorriendo listas, matas e hilos (la silueta es un nombre). */
function tonesOf(palette: SoilPalette): string[] {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach(visit);
  };
  const { silhouetteKind: _kind, ...colors } = palette;
  visit(colors);
  return out;
}

describe('paletas del suelo', () => {
  it('la paleta natal repite exactamente las constantes de la 1.2.1', () => {
    // Copiadas a mano de src/render/network.ts antes de la fase 8: el natal no debe cambiar
    // ni un tono al actualizar.
    expect(SOIL_PALETTES.natal).toEqual({
      horizons: [0.072, 0.34, 0.68],
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
      // Las claves de la fase 10 no pintan nada nuevo en el natal: troncos, sin hilos ni lentes.
      silhouetteKind: 'trees',
      threads: null,
      lenses: null,
    });
  });

  it('el degradado profundo del natal empieza en 0,62 literal, no en 0,68 − 0,06', () => {
    // 0,68 − 0,06 da 0,6200000000000001: calcularlo movería el degradado de la 1.2.1.
    expect(SOIL_PALETTES.natal.deepStart).toBe(0.62);
    expect(0.68 - 0.06).not.toBe(0.62);
  });

  it('los suelos de la 1.3–1.5 se recortan con troncos y no tienen hilos ni lentes', () => {
    for (const id of ['natal', 'taiga', 'choco'] as const) {
      expect(SOIL_PALETTES[id].silhouetteKind).toBe('trees');
      expect(SOIL_PALETTES[id].threads).toBeNull();
      expect(SOIL_PALETTES[id].lenses).toBeNull();
    }
  });

  it('la pradera tiene hierba e hilos de pseudomicelio; la tundra, arbustos, lentes de hielo y una red corta', () => {
    const prairie = SOIL_PALETTES.prairie;
    expect(prairie.silhouetteKind).toBe('grass');
    // Más gris que el micelio y tenue: no se confunde con las hifas (#EFE6D2).
    expect(prairie.threads).toEqual({ tone: '#D9D2C3', alpha: 0.16, density: 0.6 });
    expect(prairie.lenses).toBeNull();
    const tundra = SOIL_PALETTES.tundra;
    expect(tundra.silhouetteKind).toBe('shrubs');
    expect(tundra.threads).toBeNull();
    expect(tundra.lenses?.alpha).toBeLessThanOrEqual(0.18);
    // La red no baja del permafrost: se queda por encima de la última frontera.
    expect(tundra.reach).toBe(0.55);
    expect(tundra.horizons[2]).toBe(0.58);
  });

  it('hay una paleta por bioma y todas tienen las mismas claves que la natal', () => {
    expect(Object.keys(SOIL_PALETTES).sort()).toEqual([...BIOME_IDS].sort());
    const natalKeys = Object.keys(SOIL_PALETTES.natal).sort();
    for (const id of BIOME_IDS) expect(Object.keys(SOIL_PALETTES[id]).sort()).toEqual(natalKeys);
  });

  it('los horizontes crecen dentro de (0, 1) y la hojarasca está a la misma altura en todos los biomas', () => {
    for (const id of BIOME_IDS) {
      const [litter, middle, deep] = SOIL_PALETTES[id].horizons;
      expect(litter).toBe(LITTER_DEPTH);
      expect(litter).toBeGreaterThan(0);
      expect(middle).toBeGreaterThan(litter);
      expect(deep).toBeGreaterThan(middle);
      expect(deep).toBeLessThan(1);
    }
  });

  it('el degradado profundo empieza 0,06 por encima de la última frontera', () => {
    expect(SOIL_PALETTES.taiga.deepStart).toBe(0.41);
    expect(SOIL_PALETTES.choco.deepStart).toBe(0.34);
    for (const id of BIOME_IDS) {
      const p = SOIL_PALETTES[id];
      expect(p.deepStart).toBeCloseTo(p.horizons[2] - 0.06, 12);
    }
  });

  it('todos los tonos son colores #RRGGBB y ninguno es el rebozuelo #E8A93A', () => {
    const all = [BIRCH_TONE, ...BIOME_IDS.flatMap((id) => tonesOf(SOIL_PALETTES[id]))];
    expect(all.length).toBeGreaterThan(60);
    for (const tone of all) {
      expect(tone).toMatch(/^#[0-9A-F]{6}$/i);
      expect(tone.toUpperCase()).not.toBe('#E8A93A');
    }
  });

  it('las fracciones de hojas, matas y alcance están en (0, 1] y los anchos son positivos', () => {
    for (const id of BIOME_IDS) {
      const p = SOIL_PALETTES[id];
      for (const share of [p.leafDensity, p.reach, ...p.tufts.flatMap((t) => [t.share, t.alpha])]) {
        expect(share).toBeGreaterThan(0);
        expect(share).toBeLessThanOrEqual(1);
      }
      expect(p.veinChance).toBeGreaterThanOrEqual(0);
      expect(p.veinChance).toBeLessThanOrEqual(1);
      expect(p.distantWidth).toBeGreaterThan(0);
      expect(p.treeWidth).toBeGreaterThan(0);
      expect(Number.isInteger(p.birchEvery) && p.birchEvery >= 0).toBe(true);
      expect(p.leafTones.length).toBeGreaterThan(0);
      expect(p.pebbleTones.length).toBeGreaterThan(0);
      for (const tuft of p.tufts) expect(tuft.tones.length).toBeGreaterThan(0);
    }
  });

  it('ningún color del suelo deja la red peor de lo que la dejaba la arcilla del natal', () => {
    // El peor caso de la 1.2: el fuego fatuo sobre la arcilla del fondo del natal, 4,46.
    const floor = contrast(SOIL_PALETTES.natal.deepBottom, FUEGO_FATUO);
    expect(floor).toBeCloseTo(4.459, 3);
    for (const id of BIOME_IDS) {
      const p = SOIL_PALETTES[id];
      const tones = [...strips(p)];
      // Los hilos y las lentes cambian el color de debajo: se mide lo que queda pintado.
      if (p.threads) {
        for (const base of [p.band, p.deepTop, p.deepMid, p.deepBottom]) {
          tones.push(over(base, p.threads.tone, p.threads.alpha));
        }
      }
      if (p.lenses) {
        for (const base of [p.deepTop, p.deepMid, p.deepBottom])
          tones.push(over(base, p.lenses.tone, p.lenses.alpha));
      }
      for (const tone of tones) {
        expect(contrast(tone, MICELIO), `${id} ${tone} y el micelio`).toBeGreaterThanOrEqual(floor);
        expect(contrast(tone, FUEGO_FATUO), `${id} ${tone} y el fuego fatuo`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('cada bioma tiene su muestra de suelo en styles.css, con su humus y su horizonte medio', () => {
    // Si falta el bloque, la muestra de la sección Viento y de la Crónica sale sin color.
    const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
    for (const id of BIOME_IDS) {
      const block = new RegExp(`\\[data-biome='${id}'\\] \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
      const p = SOIL_PALETTES[id];
      expect(block, id).toContain(`--soil-1: ${p.humus.toLowerCase()};`);
      expect(block, id).toContain(`--soil-2: ${p.band.toLowerCase()};`);
      expect(block, id).toContain('--biome-accent:');
    }
  });
});

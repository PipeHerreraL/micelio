import { describe, expect, it } from 'vitest';
import { BIOME_IDS } from '../src/data/biomes.ts';
import { BIRCH_TONE, LITTER_DEPTH, SOIL_PALETTES, type SoilPalette } from '../src/render/palettes.ts';

/** Todos los textos de una paleta (colores), recorriendo listas y matas. */
function tonesOf(palette: SoilPalette): string[] {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach(visit);
  };
  visit(palette);
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
    });
  });

  it('el degradado profundo del natal empieza en 0,62 literal, no en 0,68 − 0,06', () => {
    // 0,68 − 0,06 da 0,6200000000000001: calcularlo movería el degradado de la 1.2.1.
    expect(SOIL_PALETTES.natal.deepStart).toBe(0.62);
    expect(0.68 - 0.06).not.toBe(0.62);
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
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/data/achievements.ts';
import { GENERATORS } from '../src/data/generators.ts';
import { MUTATIONS } from '../src/data/mutations.ts';
import { NEWS } from '../src/data/news.ts';
import { UPGRADES } from '../src/data/upgrades.ts';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import { CATALOGS } from '../src/i18n/index.ts';

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

describe('catálogos de idioma', () => {
  const locales = Object.entries(CATALOGS);
  const baseKeys = Object.keys(es).sort();

  it('todos los idiomas tienen exactamente las mismas claves que el español', () => {
    for (const [, catalog] of locales) expect(Object.keys(catalog).sort()).toEqual(baseKeys);
  });

  it('ningún texto está vacío', () => {
    for (const [locale, catalog] of locales) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(value.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('cada texto tiene los mismos marcadores en todos los idiomas', () => {
    for (const key of baseKeys) {
      const expected = placeholders(es[key as keyof typeof es]);
      for (const [locale, catalog] of locales) {
        expect(placeholders(catalog[key as keyof typeof es]), `${locale}:${key}`).toEqual(expected);
      }
    }
  });

  it('cada plural tiene su forma «one» y su forma «other»', () => {
    for (const key of baseKeys) {
      if (key.endsWith('.one')) expect(baseKeys).toContain(`${key.slice(0, -4)}.other`);
      if (key.endsWith('.other')) expect(baseKeys).toContain(`${key.slice(0, -6)}.one`);
    }
  });

  it('los datos del juego solo guardan claves y todas existen en el catálogo', () => {
    const keys = new Set(baseKeys);
    const required: string[] = [];
    for (const g of GENERATORS) {
      required.push(
        `gen.${g.id}.name`,
        `gen.${g.id}.flavor`,
        `gen.${g.id}.unit.one`,
        `gen.${g.id}.unit.other`,
      );
    }
    for (const u of UPGRADES) required.push(`upg.${u.id}.name`, `upg.${u.id}.flavor`);
    for (const m of MUTATIONS) required.push(`mut.${m.id}.name`, `mut.${m.id}.desc`);
    for (const a of ACHIEVEMENTS) {
      required.push(`ach.${a.id}.name`);
      if (a.secret) required.push(`ach.${a.id}.desc`);
    }
    for (const n of NEWS) required.push(`news.${n.id}`);
    for (const key of required) expect(keys.has(key), key).toBe(true);
  });

  it('el Anillo de hadas y el Árbol madre conservan su nombre acordado en inglés', () => {
    expect(en['gen.fairyRing.name']).toBe('Fairy ring');
    expect(en['gen.motherTree.name']).toBe('Mother tree');
  });
});

/**
 * Rangos `unicode-range` del subconjunto `latin` de una fuente de @fontsource. Las hojas
 * `latin-400.css` que importa main.ts no declaran rango (cargan solo ese subconjunto), así
 * que el rango se lee del bloque `latin` de la hoja completa `400.css`.
 */
function latinRanges(pkg: string): [number, number][] {
  const css = readFileSync(new URL(`../node_modules/@fontsource/${pkg}/400.css`, import.meta.url), 'utf8');
  const block = css.split('@font-face').find((b) => b.includes(`files/${pkg}-latin-400-normal`));
  const match = block?.match(/unicode-range:\s*([^;]+);/);
  if (!match?.[1]) throw new Error(`Sin unicode-range latin para ${pkg}`);
  return match[1].split(',').map((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, '').split('-');
    const start = Number.parseInt(from ?? '', 16);
    return [start, to ? Number.parseInt(to, 16) : start];
  });
}

describe('cobertura de las fuentes', () => {
  // Las mismas familias (y el mismo subconjunto) que importa src/main.ts.
  const fonts = ['source-sans-3', 'im-fell-english'].map(latinRanges);

  it('cada carácter de cada idioma lo cubren las fuentes importadas', () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      // Se recorre por puntos de código, que es lo que cubre unicode-range.
      const chars = new Set<string>();
      for (const text of Object.values(catalog)) for (const char of text) chars.add(char);
      for (const char of chars) {
        const code = char.codePointAt(0) ?? 0;
        for (const ranges of fonts) {
          const covered = ranges.some(([a, b]) => code >= a && code <= b);
          expect(covered, `${locale}: «${char}» U+${code.toString(16).toUpperCase()}`).toBe(true);
        }
      }
    }
  });
});

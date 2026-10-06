import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/data/achievements.ts';
import { ADAPTATIONS } from '../src/data/adaptations.ts';
import { BIOME_ADAPTATIONS, BIOMES, DESTINATION_IDS } from '../src/data/biomes.ts';
import { GENERATORS } from '../src/data/generators.ts';
import { MUTATIONS } from '../src/data/mutations.ts';
import { NEWS } from '../src/data/news.ts';
import { UPGRADES } from '../src/data/upgrades.ts';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import { plasmodiumEn } from '../src/i18n/partners/plasmodium.en.ts';
import { plasmodiumEs } from '../src/i18n/partners/plasmodium.es.ts';
import { PLASMODIUM_ACHIEVEMENT_IDS, PLASMODIUM_UPGRADES } from '../src/data/plasmodium.ts';
import { PLATES } from '../src/data/plasmodium-plates.ts';
import { biomeNewsEn } from '../src/i18n/news/biomes/en.ts';
import { biomeNewsEs } from '../src/i18n/news/biomes/es.ts';
import { newsEn } from '../src/i18n/news/en.ts';
import { newsEs } from '../src/i18n/news/es.ts';

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

// El inglés llega aparte en el juego (i18n/index.ts); aquí se importan los dos directamente.
const CATALOGS = { es, en };

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
      if (a.secret || a.reveal) required.push(`ach.${a.id}.desc`);
    }
    // Viento de esporas (fases 8 y 10): cada bioma y cada adaptación de bioma con sus textos.
    for (const b of BIOMES) required.push(`biome.${b.id}.name`, `biome.${b.id}.soil`, `biome.${b.id}.here`);
    for (const b of DESTINATION_IDS) {
      required.push(
        `biome.${b}.go`,
        `biome.${b}.style`,
        `badapt.group.${b}`,
        `badapt.needLevel.${b}`,
        `chapter.${b}.arrive.title`,
        `chapter.${b}.arrive.line1`,
        `chapter.${b}.arrive.line2`,
        `chapter.${b}.colonize.title`,
        `chapter.${b}.colonize.line1`,
        `chapter.${b}.colonize.line2`,
      );
    }
    for (const a of BIOME_ADAPTATIONS) {
      required.push(`badapt.${a.id}.name`, `badapt.${a.id}.desc`);
      if (a.effect.kind === 'autoClicks')
        required.push(`badapt.${a.id}.effect.one`, `badapt.${a.id}.effect.other`);
      else required.push(`badapt.${a.id}.effect`);
    }
    // Adaptaciones de la red y cosméticas de los votos (fases 7 y 10): nombre, ciencia y efecto; las
    // cosméticas, además, qué las abre y un color de Esporada por rango.
    for (const a of ADAPTATIONS)
      required.push(`adapt.${a.id}.name`, `adapt.${a.id}.desc`, `adapt.${a.id}.effect`);
    required.push('adapt.group.vows', 'adapt.lockedVow');
    for (let rank = 1; rank <= (ADAPTATIONS.find((a) => a.id === 'sporePrint')?.max ?? 0); rank += 1) {
      required.push(`adapt.sporePrint.color.${rank}`);
    }
    for (const key of required) expect(keys.has(key), key).toBe(true);
  });

  it('cada texto que cambia en un bioma sustituye a una clave que existe', () => {
    const keys = new Set(baseKeys);
    for (const key of baseKeys) {
      const match = new RegExp(`^(.*)\\.(${DESTINATION_IDS.join('|')})$`).exec(key);
      if (match?.[1] && (match[1].startsWith('gen.') || match[1].startsWith('upg.'))) {
        expect(keys.has(match[1]), key).toBe(true);
      }
    }
  });

  it('el Anillo de hadas y el Árbol madre conservan su nombre acordado en inglés', () => {
    expect(en['gen.fairyRing.name']).toBe('Fairy ring');
    expect(en['gen.motherTree.name']).toBe('Mother tree');
  });
});

describe('catálogos de las noticias (llegan aparte)', () => {
  // El del sotobosque y el de los biomas, que solo se descarga tras dispersar (i18n/news/index.ts).
  const NEWS_CATALOGS: Record<string, Readonly<Record<string, string>>> = {
    es: { ...newsEs, ...biomeNewsEs },
    en: { ...newsEn, ...biomeNewsEn },
  };
  const ids = new Set(NEWS.map((n) => n.id));
  const destinations = new Set<string>(DESTINATION_IDS);
  /** Las que solo pueden salir tras dispersar una vez: en un destino, con una dispersión o de vuelta en casa. */
  const afterDispersal = new Set(
    NEWS.filter((n) => ['biome', 'dispersals', 'returned'].includes(n.when.kind)).map((n) => n.id),
  );

  it('cada noticia tiene su texto en los dos idiomas, ninguno vacío y sin marcadores', () => {
    for (const [locale, catalog] of Object.entries(NEWS_CATALOGS)) {
      for (const id of ids) expect(catalog[id]?.trim().length ?? 0, `${locale}:${id}`).toBeGreaterThan(0);
      for (const [key, text] of Object.entries(catalog))
        expect(placeholders(text), `${locale}:${key}`).toEqual([]);
    }
    expect(Object.keys(newsEn).sort()).toEqual(Object.keys(newsEs).sort());
    expect(Object.keys(biomeNewsEn).sort()).toEqual(Object.keys(biomeNewsEs).sort());
  });

  it('las noticias que piden haber dispersado van en el catálogo de los biomas, y ninguna otra', () => {
    // El teletipo solo descarga ese catálogo tras dispersar: una que faltara en él no saldría nunca
    // en un destino, y una de más pesaría en la descarga de quien no ha salido del natal.
    for (const id of ids) {
      expect(id in biomeNewsEs, id).toBe(afterDispersal.has(id));
      expect(id in newsEs, id).toBe(!afterDispersal.has(id));
    }
  });

  it('las claves de más son versiones de una noticia para un destino, en el catálogo de los biomas', () => {
    for (const key of Object.keys(newsEs)) expect(ids.has(key), key).toBe(true);
    for (const key of Object.keys(biomeNewsEs)) {
      if (ids.has(key)) continue;
      const cut = key.lastIndexOf('.');
      expect(ids.has(key.slice(0, cut)), key).toBe(true);
      expect(destinations.has(key.slice(cut + 1)), key).toBe(true);
    }
  });

  it('cada destino tiene al menos doce noticias propias, y dos que salen nada más llegar', () => {
    for (const biome of DESTINATION_IDS) {
      const own = NEWS.flatMap((n) => (n.when.kind === 'biome' && n.when.biome === biome ? [n.when] : []));
      expect(own.length, biome).toBeGreaterThanOrEqual(12);
      const onArrival = own.filter((w) => w.level === undefined && w.owned === undefined);
      expect(onArrival.length, biome).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('catálogos del plasmodio (fase 9)', () => {
  const PARTNER: Record<string, Readonly<Record<string, string>>> = { es: plasmodiumEs, en: plasmodiumEn };
  const baseKeys = Object.keys(plasmodiumEs).sort();

  it('los dos idiomas tienen las mismas claves, ningún texto vacío y los mismos marcadores', () => {
    expect(Object.keys(plasmodiumEn).sort()).toEqual(baseKeys);
    for (const [locale, catalog] of Object.entries(PARTNER)) {
      for (const key of baseKeys) {
        const text = catalog[key] ?? '';
        expect(text.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
        expect(placeholders(text), `${locale}:${key}`).toEqual(
          placeholders(plasmodiumEs[key as keyof typeof plasmodiumEs]),
        );
      }
    }
  });

  it('cada plural tiene su forma «one» y su forma «other»', () => {
    for (const key of baseKeys) {
      if (key.endsWith('.one')) expect(baseKeys).toContain(`${key.slice(0, -4)}.other`);
      if (key.endsWith('.other')) expect(baseKeys).toContain(`${key.slice(0, -6)}.one`);
    }
  });

  it('las claves que nombran los datos existen: placas, mejoras, logros y láminas', () => {
    const keys = new Set(baseKeys);
    const main = new Set(Object.keys(es));
    for (const plate of PLATES) {
      for (const k of ['name', 'intro', 'goal'])
        expect(keys.has(`plate.${plate.id}.${k}`), plate.id).toBe(true);
      for (const k of ['title', 'line1', 'line2'])
        expect(keys.has(`chapter.${plate.id}.${k}`), plate.id).toBe(true);
    }
    for (const u of PLASMODIUM_UPGRADES) {
      expect(keys.has(`pupg.${u.id}.name`), u.id).toBe(true);
      expect(keys.has(`pupg.${u.id}.desc`), u.id).toBe(true);
      expect(keys.has(`pupg.${u.id}.effect`) || keys.has(`pupg.${u.id}.effect.other`), u.id).toBe(true);
    }
    for (const id of PLASMODIUM_ACHIEVEMENT_IDS) {
      expect(main.has(`pach.${id}.name`), id).toBe(true);
      expect(main.has(`pach.${id}.desc`), id).toBe(true);
    }
  });

  it('ningún texto usa signos fuera del estilo de la casa (≤, ≥, flechas)', () => {
    for (const catalog of [plasmodiumEs, plasmodiumEn, es, en, newsEs, newsEn, biomeNewsEs, biomeNewsEn]) {
      for (const [key, text] of Object.entries(catalog)) expect(/[≤≥→←↑↓]/.test(text), key).toBe(false);
    }
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
    const all = {
      ...CATALOGS,
      'plasmodio-es': plasmodiumEs,
      'plasmodio-en': plasmodiumEn,
      'noticias-es': newsEs,
      'noticias-en': newsEn,
      'noticias-biomas-es': biomeNewsEs,
      'noticias-biomas-en': biomeNewsEn,
    };
    for (const [locale, catalog] of Object.entries(all)) {
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

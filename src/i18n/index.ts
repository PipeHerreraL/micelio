/**
 * Traducción: idioma activo, búsqueda de claves, interpolación con marcadores con nombre y
 * plurales con Intl.PluralRules. Sumar un idioma es añadir un catálogo y registrarlo en
 * `CATALOGS`; nada más del código cambia.
 */
import type { Locale, Notation } from '../core/state.ts';
import { en } from './en.ts';
import { es, type Catalog, type MessageKey } from './es.ts';
import {
  formatExact,
  formatNumber,
  formatPercent,
  roundTo,
  suffixFor,
  SUFFIXES,
  SUFFIX_FROM,
  type Suffix,
} from './format.ts';

export type { Catalog, MessageKey } from './es.ts';

export const CATALOGS: Readonly<Record<Locale, Catalog>> = { es, en };
export const DEFAULT_LOCALE: Locale = 'es';

/** Claves base de los plurales: las que tienen hermanas `.one` y `.other`. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}.other` ? Base : never;
}[MessageKey];

export type Params = Record<string, string | number>;

let locale: Locale = DEFAULT_LOCALE;
let catalog: Catalog = es;
let notation: Notation = 'names';
let pluralRules = new Intl.PluralRules(locale);

export function getLocale(): Locale {
  return locale;
}

/** Cambia el idioma activo. Quien llama actualiza `<html lang>` y repinta. */
export function setLocale(next: Locale, override?: Catalog): void {
  locale = next;
  catalog = override ?? CATALOGS[next];
  pluralRules = new Intl.PluralRules(next);
}

export function setNotation(next: Notation): void {
  notation = next;
}

export function getNotation(): Notation {
  return notation;
}

/**
 * Idioma inicial: primero el guardado en Ajustes, luego `navigator.languages` (por
 * prefijo: «en-GB» → en) y, si no hay coincidencia, español.
 */
export function detectLocale(saved: Locale | null, languages: readonly string[]): Locale {
  if (saved) return saved;
  for (const lang of languages) {
    const base = lang.toLowerCase().split('-')[0];
    if (base === 'es' || base === 'en') return base;
  }
  return DEFAULT_LOCALE;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Si el catálogo activo tiene esta clave (para textos que solo existen en algunos biomas). */
export function hasMessage(key: string): key is MessageKey {
  return Object.hasOwn(catalog, key);
}

/** Texto de una clave en el idioma activo. */
export function t(key: MessageKey, params?: Params): string {
  return interpolate(catalog[key], params);
}

/** Texto plural: elige `.one` u `.other` según el idioma; `{count}` se formatea solo. */
export function tp(base: PluralKey, count: number, params?: Params): string {
  const category = pluralRules.select(count);
  const key = (category === 'one' ? `${base}.one` : `${base}.other`) as MessageKey;
  return t(key, { count: formatCountOf(count), ...params });
}

/**
 * Entero con separadores del idioma activo. Desde el millón, como fmt: con nombre de juego idle
 * («44,1 sextillones») y no con todas sus cifras («44.108.702.360.816.946.000.000…», que se veía en
 * la cartela del bioma con un nivel de esporas muy alto; ARCHITECTURE.md §4.24).
 */
export function formatCount(value: number): string {
  if (Math.abs(value) >= SUFFIX_FROM) return fmt(value);
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/**
 * Una cuenta delante de un nombre («{count} esporas»): con nombre de magnitud el español pide «de»
 * («2 millones de esporas»); el inglés, no. Con la notación científica no hay nombre.
 */
export function formatCountOf(value: number): string {
  const text = formatCount(value);
  return Math.abs(value) >= SUFFIX_FROM && /\p{L}$/u.test(text) ? t('num.countOf', { count: text }) : text;
}

/**
 * Un bono como porcentaje sin decimales («+12 %»). Desde un millón por ciento, con nombre: con un
 * nivel de esporas muy alto el bono se leía «+6.640.783.086.353.596.400.000 %».
 */
export function formatBonus(fraction: number): string {
  const percent = fraction * 100;
  if (Math.abs(percent) < SUFFIX_FROM) return formatPercent(fraction, locale, 0);
  return t('num.percent', { value: fmt(percent) });
}

/** Nombre del orden de magnitud en el idioma activo, en singular o plural según la mantisa. */
function magnitudeName(suffix: Suffix, mantissa: number): string {
  const category = pluralRules.select(mantissa);
  return t(category === 'one' ? `num.name.${suffix}.one` : `num.name.${suffix}.other`);
}

/** Cantidad de balance formateada con el idioma y la notación activos. */
export function fmt(value: number): string {
  return formatNumber(value, locale, notation, magnitudeName);
}

/**
 * Tooltip de un número grande (PROMPT.md §13): la cifra entera («1.234.567.890») y, si en
 * pantalla va con sufijo corto, también su nombre («mil millones»). Null si no hace falta.
 */
export function numberTooltip(value: number): string | null {
  const suffix = suffixFor(value);
  if (!suffix) return null;
  const exact = formatExact(value, locale);
  if (notation !== 'suffix') return exact;
  const mantissa = Math.abs(value) / 10 ** (3 * (SUFFIXES.indexOf(suffix) + 2));
  return t('num.tooltip', { exact, long: magnitudeName(suffix, roundTo(mantissa, 2)) });
}

/**
 * Líneas de tooltip que explican los números grandes de una fila: «1,5 millones = 1.500.000».
 * Ignora los que se muestran completos.
 */
export function numberDetails(...values: number[]): string[] {
  const lines: string[] = [];
  for (const value of values) {
    const tip = numberTooltip(value);
    if (tip) lines.push(`${fmt(value)} = ${tip}`);
  }
  return lines;
}

// ---------------------------------------------------------------------------------------
// Pseudoidioma de desarrollo: alarga los textos un 40 % para detectar cortes.

const ACCENTED: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', n: 'ñ', A: 'Á', E: 'É' };

/** Versión «pseudo» de un texto: acentos, un 40 % más largo y marcadores intactos. */
export function pseudoize(text: string): string {
  const pieces = text.split(PLACEHOLDER);
  // split con un grupo de captura alterna texto y nombres de marcador.
  const out = pieces
    .map((piece, i) => (i % 2 === 1 ? `{${piece}}` : piece.replace(/[aeiounAE]/g, (c) => ACCENTED[c] ?? c)))
    .join('');
  const extra = Math.ceil(text.length * 0.4);
  return `[${out}${' ·'.repeat(Math.ceil(extra / 2)).slice(0, extra)}]`;
}

export function pseudoCatalog(base: Catalog): Catalog {
  const out = {} as Catalog;
  for (const key of Object.keys(base) as MessageKey[]) out[key] = pseudoize(base[key]);
  return out;
}

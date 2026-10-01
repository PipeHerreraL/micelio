/**
 * Traducción: idioma activo, búsqueda de claves, interpolación con marcadores con nombre y
 * plurales con Intl.PluralRules. Sumar un idioma es añadir un catálogo y registrarlo en
 * `CATALOGS`; nada más del código cambia.
 */
import type { Locale, Notation } from '../core/state.ts';
import { en } from './en.ts';
import { es, type Catalog, type MessageKey } from './es.ts';
import { formatNumber, formatScientific, suffixFor, type Suffix } from './format.ts';

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
let notation: Notation = 'suffix';
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

/** Texto de una clave en el idioma activo. */
export function t(key: MessageKey, params?: Params): string {
  return interpolate(catalog[key], params);
}

/** Texto plural: elige `.one` u `.other` según el idioma; `{count}` se formatea solo. */
export function tp(base: PluralKey, count: number, params?: Params): string {
  const category = pluralRules.select(count);
  const key = (category === 'one' ? `${base}.one` : `${base}.other`) as MessageKey;
  return t(key, { count: formatCount(count), ...params });
}

/** Entero con separadores del idioma activo. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/** Cantidad de balance formateada con el idioma y la notación activos. */
export function fmt(value: number): string {
  return formatNumber(value, locale, notation);
}

const LONG_NAME_KEYS: Record<Suffix, MessageKey> = {
  M: 'num.long.M',
  B: 'num.long.B',
  T: 'num.long.T',
  Qa: 'num.long.Qa',
  Qi: 'num.long.Qi',
  Sx: 'num.long.Sx',
  Sp: 'num.long.Sp',
  Oc: 'num.long.Oc',
  No: 'num.long.No',
  Dc: 'num.long.Dc',
};

/**
 * Tooltip de un número grande: notación científica y nombre largo en el idioma activo
 * («1,23e9 · mil millones»). Null si el número no necesita explicación.
 */
export function numberTooltip(value: number): string | null {
  const suffix = notation === 'suffix' ? suffixFor(value) : null;
  if (suffix) {
    return t('num.tooltip', { scientific: formatScientific(value, locale), long: t(LONG_NAME_KEYS[suffix]) });
  }
  return null;
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

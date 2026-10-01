/**
 * Formato de números, duraciones y fechas con Intl en el idioma activo (PROMPT.md §13).
 * Funciones puras: reciben el idioma y la notación, así que se prueban sin DOM.
 *
 * - Hasta 999 999 se muestran completos.
 * - Desde 1e6, por defecto con el nombre del orden de magnitud al estilo de los juegos
 *   idle («1,5 millones», «1.5 Million»); también con sufijos cortos (M, B, T…),
 *   científica o ingeniería según Ajustes.
 * - Los nombres llegan hasta 1e63 (ARCHITECTURE.md §4.24); desde 1e66, científica siempre.
 * - Sin ceros de relleno: «1 millón», no «1,00 millones».
 */
import type { Notation } from '../core/state.ts';

/** Sufijos cortos desde 1e6 (índice 0) hasta 1e63 (índice 19). Iguales en todos los idiomas. */
export const SUFFIXES = [
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
  'Ud',
  'Dd',
  'Td',
  'Qad',
  'Qid',
  'Sxd',
  'Spd',
  'Ocd',
  'Nod',
  'Vg',
] as const;
export type Suffix = (typeof SUFFIXES)[number];

/** Desde aquí se usan nombres o sufijos (o la notación elegida). */
export const SUFFIX_FROM = 1e6;
/** Desde aquí, científica siempre: se acabaron los nombres. */
export const SCIENTIFIC_FROM = 1e66;

/**
 * Nombre del orden de magnitud para la notación de nombres. Lo da el catálogo del idioma;
 * recibe la mantisa ya redondeada para elegir singular o plural («1 millón», «2 millones»).
 */
export type MagnitudeName = (suffix: Suffix, mantissa: number) => string;

const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, maxFraction: number): Intl.NumberFormat {
  const key = `${locale}|${maxFraction}`;
  let f = formatters.get(key);
  if (!f) {
    // Agrupación por defecto del idioma: en español, 1234 va sin separador y 12.345 con él.
    // Sin decimales mínimos: «1 millón» y no «1,00 millones».
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: maxFraction });
    formatters.set(key, f);
  }
  return f;
}

/** Decimales para un valor menor que 1e6: más precisión cuanto más pequeño. */
function smallDecimals(abs: number): number {
  if (abs < 1) return 2;
  if (abs < 100) return 1;
  return 0;
}

/** Decimales para una mantisa entre 1 y 999.x: tres cifras significativas. */
function mantissaDecimals(mantissa: number): number {
  if (mantissa < 10) return 2;
  if (mantissa < 100) return 1;
  return 0;
}

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

interface Split {
  mantissa: number;
  exponent: number;
  decimals: number;
}

/** Separa en mantisa y exponente (múltiplo de `step`), corrigiendo el redondeo a 1000 o a 10. */
function split(abs: number, step: 1 | 3): Split {
  let exponent = Math.floor(Math.log10(abs) / step) * step;
  let mantissa = abs / 10 ** exponent;
  // Math.log10 puede quedarse un pelo corto (log10(1e15) = 14.999…): se corrige aquí.
  if (mantissa >= 10 ** step) {
    exponent += step;
    mantissa = abs / 10 ** exponent;
  }
  const limit = 10 ** step;
  let decimals = step === 1 ? 2 : mantissaDecimals(mantissa);
  let rounded = roundTo(mantissa, decimals);
  if (rounded >= limit) {
    exponent += step;
    mantissa = abs / 10 ** exponent;
    decimals = step === 1 ? 2 : mantissaDecimals(mantissa);
    rounded = roundTo(mantissa, decimals);
  }
  return { mantissa: rounded, exponent, decimals };
}

function scientific(abs: number, locale: string, step: 1 | 3): string {
  const s = split(abs, step);
  return `${numberFormat(locale, s.decimals).format(s.mantissa)}e${s.exponent}`;
}

/**
 * Formatea una cantidad para mostrarla. `notation` solo afecta a valores desde 1e6.
 * Con la notación `names` hace falta `nameOf`; sin él se usan los sufijos cortos.
 */
export function formatNumber(
  value: number,
  locale: string,
  notation: Notation = 'names',
  nameOf?: MagnitudeName,
): string {
  if (Number.isNaN(value)) return '—';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);

  if (abs < SUFFIX_FROM) {
    const decimals = smallDecimals(abs);
    const rounded = roundTo(abs, decimals);
    // 999 999.6 redondea a 1 000 000: ese ya se escribe con nombre o sufijo.
    if (rounded < SUFFIX_FROM) return sign + numberFormat(locale, decimals).format(rounded);
  }

  if (abs >= SCIENTIFIC_FROM || notation === 'scientific') return sign + scientific(abs, locale, 1);
  if (notation === 'engineering') return sign + scientific(abs, locale, 3);

  const s = split(abs, 3);
  const suffix = SUFFIXES[s.exponent / 3 - 2];
  if (!suffix) return sign + scientific(abs, locale, 1);
  const mantissa = numberFormat(locale, s.decimals).format(s.mantissa);
  // «mil millones» no se parte en dos líneas: los espacios del nombre tampoco separan.
  const label = notation === 'names' && nameOf ? nameOf(suffix, s.mantissa).replace(/ /g, '\u00a0') : suffix;
  return `${sign}${mantissa}\u00a0${label}`;
}

/** Sufijo que le corresponde a un valor desde 1e6, o null si no lleva. */
export function suffixFor(value: number): Suffix | null {
  const abs = Math.abs(value);
  if (!Number.isFinite(abs) || abs >= SCIENTIFIC_FROM) return null;
  // Decide con el valor redondeado, igual que formatNumber: 999 999.6 se escribe «1 M»
  // y necesita su tooltip (BUG-JOURNAL #1).
  if (abs < SUFFIX_FROM && roundTo(abs, smallDecimals(abs)) < SUFFIX_FROM) return null;
  const s = split(abs, 3);
  return SUFFIXES[s.exponent / 3 - 2] ?? null;
}

/** Notación científica completa («1,23e9»). */
export function formatScientific(value: number, locale: string): string {
  if (!Number.isFinite(value) || value === 0) return formatNumber(value, locale, 'suffix');
  return (value < 0 ? '−' : '') + scientific(Math.abs(value), locale, 1);
}

/** Hasta aquí un número se puede escribir entero sin perder cifras en coma flotante. */
const EXACT_UP_TO = 1e21;

/**
 * La cifra entera con separadores («1.234.567.890») para el tooltip de un número grande;
 * por encima de 1e21 las cifras de un double ya no son exactas y se usa la científica.
 */
export function formatExact(value: number, locale: string): string {
  if (!Number.isFinite(value) || Math.abs(value) >= EXACT_UP_TO) return formatScientific(value, locale);
  return numberFormat(locale, 0).format(Math.round(value));
}

/** Entero con separadores del idioma (unidades, clics). */
export function formatInteger(value: number, locale: string): string {
  return numberFormat(locale, 0).format(Math.floor(value));
}

/** Porcentaje: 0.125 → «12.5 %» o «12,5 %» según el idioma. */
export function formatPercent(fraction: number, locale: string, maxDecimals = 1): string {
  const key = `${locale}|pct|${maxDecimals}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: maxDecimals });
    formatters.set(key, f);
  }
  return f.format(fraction);
}

type DurationUnit = 'day' | 'hour' | 'minute' | 'second';
const UNIT_SECONDS: readonly [DurationUnit, number][] = [
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

const unitFormatters = new Map<string, Intl.NumberFormat>();

function unitFormat(locale: string, unit: DurationUnit): Intl.NumberFormat {
  const key = `${locale}|${unit}`;
  let f = unitFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' });
    unitFormatters.set(key, f);
  }
  return f;
}

/**
 * Duración con las dos unidades más grandes: «1 min 20 s», «2 h 5 min», «3 d 4 h».
 * Menos de un segundo se muestra como «1 s» para no prometer «0 s» a un botón.
 */
export function formatDuration(seconds: number, locale: string): string {
  if (!Number.isFinite(seconds)) return '∞';
  const total = Math.max(1, Math.ceil(seconds));
  const first = UNIT_SECONDS.findIndex(([, size]) => total >= size);
  const parts: string[] = [];
  const major = UNIT_SECONDS[first];
  if (!major) return unitFormat(locale, 'second').format(total);
  const majorAmount = Math.floor(total / major[1]);
  parts.push(unitFormat(locale, major[0]).format(majorAmount));
  // La segunda unidad solo si es la contigua y no es cero: «1 h 5 min», nunca «1 h 5 s».
  const minor = UNIT_SECONDS[first + 1];
  if (minor) {
    const minorAmount = Math.floor((total - majorAmount * major[1]) / minor[1]);
    if (minorAmount > 0) parts.push(unitFormat(locale, minor[0]).format(minorAmount));
  }
  return parts.join(' ');
}

/**
 * Factor sin el signo «×», con hasta dos decimales y la coma del idioma: 1,25; 0,5; 5. El «×»
 * lo pone el texto, para que cada idioma decida dónde va.
 */
export function formatFactor(value: number, locale: string): string {
  const key = `${locale}|factor`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: true });
    formatters.set(key, f);
  }
  return f.format(value);
}

/** Día sin hora («3 de octubre de 2026»): la Crónica fecha bosques, no minutos. */
export function formatDay(timestamp: number, locale: string, timeZone?: string): string {
  const date = new Date(timestamp);
  // Una fecha imposible (el validador ya las rechaza) no debe tumbar una vista: Intl lanza.
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(date);
}

/** Fecha y hora en el idioma activo. */
export function formatDate(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(timestamp),
  );
}

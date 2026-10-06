/**
 * Piezas comunes de los simuladores (scripts/simulate.ts y, desde la fase 9, el del
 * plasmodio): semillas, estadística, formato de tiempos, filas de métricas y la escritura de un
 * bloque entre marcas de docs/BALANCE.md sin tocar el resto del archivo.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Semillas de todos los escenarios: las mismas en cada simulador para comparar corridas. */
export const SEEDS = [11, 23, 37, 41, 53, 67, 79, 83, 97];

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return Number.NaN;
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? Number.NaN)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function clock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
}

export function hours(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  return `${(seconds / 3600).toFixed(2)} h`;
}

export interface Metric {
  name: string;
  target: string;
  values: (number | null)[];
  format: (v: number | null) => string;
  pass: (median: number) => boolean;
  /** Si es true, `pass` se aplica a cada valor (la peor semilla) y no a la mediana. */
  every?: boolean;
}

export function present(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null && Number.isFinite(v));
}

/** Mediana entre semillas de la partida i (solo las semillas que la jugaron). */
export function runMedians(perSeed: readonly (readonly number[] | undefined)[]): number[] {
  const longest = Math.max(0, ...perSeed.map((runs) => runs?.length ?? 0));
  const out: number[] = [];
  for (let i = 0; i < longest; i += 1) {
    const values = perSeed.map((runs) => runs?.[i]).filter((v): v is number => v !== undefined);
    // Una partida que solo jugaron una o dos semillas no dice nada de la mediana.
    if (values.length * 2 >= perSeed.length) out.push(median(values));
  }
  return out;
}

/**
 * Lo que las medianas por partida necesitan de un ciclo del ciclo libre (`CycleLeg`, en
 * scripts/sim-play.ts): sus partidas y cuántas de las primeras son la espera para pagar la siembra.
 */
export interface PlayedCycle {
  runs: readonly number[];
  waits: number;
}

/**
 * Medianas por partida de unos ciclos, contadas desde la siembra; `withoutGoal` deja fuera la
 * última, la que cumple la meta. La partida de espera (la que paga la siembra, si la hay) no entra
 * en esos índices: en el bioma que abre la vuelta ocupaba el primero y desplazaba los demás, y cada
 * mediana mezclaba la cuarta partida de unos ciclos con la tercera de otros. Así la más larga de la
 * primera vuelta del Chocó salía en 56:52 cuando, alineada, era 1:04:24 (BUG-JOURNAL #28).
 */
export function cycleRunMedians(cycles: readonly (PlayedCycle | null)[], withoutGoal = false): number[] {
  return runMedians(cycles.map((c) => (c ? c.runs.slice(c.waits, withoutGoal ? -1 : undefined) : undefined)));
}

/**
 * La partida de espera, aparte: la mediana de las de los ciclos que la tuvieron (null si ninguno).
 * Cuenta en «la más larga» (la especificación de la fase 10, §6) y no en «la más corta»: como la que
 * cumple la meta, termina en cuanto alcanza para sembrar, no con la regla de §17.
 */
export function waitRunMedian(cycles: readonly (PlayedCycle | null)[]): number | null {
  const waits = cycles.flatMap((c) => (c ? c.runs.slice(0, c.waits) : []));
  return waits.length > 0 ? median(waits) : null;
}

/** La partida más larga de unos ciclos: la mayor de sus medianas por partida, con la de espera. */
export function longestCycleRun(cycles: readonly (PlayedCycle | null)[]): number | null {
  const medians = [...cycleRunMedians(cycles), ...present([waitRunMedian(cycles)])];
  return medians.length > 0 ? Math.max(...medians) : null;
}

export function row(metric: Metric): { line: string; ok: boolean } {
  const values = present(metric.values);
  const m = median(values);
  const ok =
    values.length === metric.values.length &&
    (metric.every === true ? values.every(metric.pass) : metric.pass(m));
  const range =
    values.length > 0 ? `${metric.format(Math.min(...values))}–${metric.format(Math.max(...values))}` : '—';
  return {
    line: `| ${metric.name} | ${metric.target} | ${metric.format(m)} | ${range} | ${ok ? 'cumple' : '**no cumple**'} |`,
    ok,
  };
}

/**
 * Sustituye en `path` lo que hay entre `startMark` y `endMark` (marcas incluidas) por `block`,
 * que debe empezar y terminar con esas marcas. Sin marcas, añade el bloque al final; sin archivo,
 * crea uno con un título.
 */
export function writeBlock(path: URL, startMark: string, endMark: string, block: string): void {
  let doc: string;
  try {
    doc = readFileSync(path, 'utf8');
  } catch {
    doc = '# Balance\n';
  }
  const start = doc.indexOf(startMark);
  const end = doc.indexOf(endMark);
  const next =
    start >= 0 && end > start
      ? doc.slice(0, start) + block + doc.slice(end + endMark.length)
      : `${doc.trimEnd()}\n\n${block}\n`;
  writeFileSync(path, next);
}

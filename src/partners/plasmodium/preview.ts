/**
 * Previsualizar una colocación: copia el plasmodio, pone los copos, corre unos pasos del modelo y
 * puntúa la red. Lo usan la Quimiotaxis (el sitio sugerido) y el bot del simulador, como
 * previewGenerator en la red: la regla de qué red es mejor vive una sola vez.
 */
import { modelStep } from './flow.ts';
import { previewGraph } from './graph.ts';
import { measureOn, type PlateSnapshot } from './metrics.ts';
import { respreadTubes } from './actions.ts';
import { DELTA_BASE, HUMIDITY_FACTOR } from '../../data/plasmodium.ts';
import { delta, foodLimit, plateDef, type PlasmodiumState } from './state.ts';

/** Puntos por cumplir el objetivo: pesan más que cualquier red que no lo cumpla. */
export const MEETS_BONUS = 1000;

/** Copia de `p` con `foods` y `lamps` en la placa abierta (re-extendida si cambiaron); null sin placa. */
function draftWith(
  p: Readonly<PlasmodiumState>,
  foods: readonly number[],
  lamps: readonly number[],
): PlasmodiumState | null {
  const draft = structuredClone(p) as PlasmodiumState;
  const record = draft.plates[draft.plate];
  if (!record) return null;
  const changed = record.foods.join() !== foods.join() || record.lamps.join() !== lamps.join();
  record.foods = [...foods];
  record.lamps = [...lamps];
  if (changed) respreadTubes(draft);
  return draft;
}

function scoreOf(snap: Readonly<PlateSnapshot>): number {
  return (snap.meets ? MEETS_BONUS : 0) + snap.score;
}

/**
 * Puntuación de la red de la placa abierta con `foods` y `lamps` tras `steps` pasos del modelo:
 * MEETS_BONUS si cumple el objetivo, más copos unidos × calidad. No toca `p`.
 */
export function previewScore(
  p: Readonly<PlasmodiumState>,
  foods: readonly number[],
  lamps: readonly number[],
  steps: number,
): number {
  const draft = draftWith(p, foods, lamps);
  if (!draft) return 0;
  const g = previewGraph(draft.plate);
  for (let i = 0; i < steps; i += 1) modelStep(draft, g);
  return scoreOf(measureOn(draft, g));
}

/** Pasos de la previsualización de la Quimiotaxis (los mismos que el bot del simulador). */
export const SUGGEST_STEPS = 150;
/** Δ con el que se midieron SUGGEST_STEPS: Humedad 2, con la que el bot llega a la Fusión. */
const SUGGEST_DELTA = DELTA_BASE * HUMIDITY_FACTOR ** 2;

/**
 * Hasta dónde mira la Quimiotaxis si una colocación completa aún no cumple: SUGGEST_STEPS escalados
 * con Δ, el mismo tramo de adaptación que miden 150 pasos con Humedad 2 (150 con Humedad 2, 225
 * con 1 y 338 con 0). Con Humedad 0 (Δ = 0,1) la Fusión se funde en el paso 235 y lleva 60 pasos
 * cumpliendo en el 384: con 150 pasos ningún cuarto copo cumplía y la sugerencia llevaba a una red
 * sin fundir.
 */
export function suggestHorizon(p: Readonly<PlasmodiumState>): number {
  return Math.ceil(SUGGEST_STEPS * (SUGGEST_DELTA / delta(p)));
}

/** Sitios libres de la placa abierta para un copo nuevo: ni fijos, ni bloqueados, ni ocupados. */
export function freeSites(p: Readonly<PlasmodiumState>): number[] {
  const def = plateDef(p.plate);
  const record = p.plates[p.plate];
  const used = [...(record?.foods ?? []), ...(record?.lamps ?? [])];
  const out: number[] = [];
  for (let i = 0; i < def.x.length; i += 1) {
    if (!def.blocked.includes(i) && !def.fixedFoods.includes(i) && !used.includes(i)) out.push(i);
  }
  return out;
}

/**
 * Desempate de la Quimiotaxis: a igual puntuación, el sitio más cerca del centro de la placa (por
 * celda de distancia, mucho menos que cualquier diferencia real de puntuación). Sin él, el primer
 * copo de una placa sin copos fijos (Tronco, Archipiélago), donde todos los sitios valen 0 porque
 * un copo solo no mueve flujo, se sugería siempre en el sitio 0, una esquina, y la red que salía de
 * ahí no cumplía.
 */
const CENTER_TIE_BREAK = 1e-6;

function centerDistance(plate: number, site: number): number {
  const def = plateDef(plate);
  return Math.hypot((def.x[site] ?? 0) - def.cols / 2, (def.y[site] ?? 0) - def.rows / 2);
}

/**
 * Puntuación de poner el siguiente copo en `site` (la Quimiotaxis prueba un sitio por frame): la
 * red a los SUGGEST_STEPS pasos y, si la colocación ya completa los copos del objetivo pero aún no
 * cumple, también a suggestHorizon pasos. Cumplir a los 150 pasos gana a cumplir más tarde, así que
 * la sugerencia solo cambia cuando ningún sitio cumplía a los 150 (y nunca con Humedad 2).
 *
 * Se descartó escalar con Δ todos los copos: medido copo a copo (cuatro placas, Humedad 0–2, con y
 * sin Memoria, 2/30/120 s entre copos), arreglaba la Fusión pero dejaba de cumplir en el Tronco con
 * Humedad 1 y en el Archipiélago con Memoria: con más pasos la red de los primeros copos converge a
 * un árbol, los sitios empatan y gana el de número menor.
 *
 * Coste medido por llamada en la Fusión (Node 24, escritorio, mediana de 230 llamadas): 0,7–1 ms
 * con 150 pasos, como antes; 1,8–2,2 ms cuando mira hasta 338 (Humedad 0), lo que solo pasa en el
 * copo que completa el objetivo y en los sitios que no cumplen a los 150. Con la CPU ×4 de un
 * móvil medio, unos 8 ms en cada uno de esos frames (≤ 28 por búsqueda).
 */
export function suggestionScore(p: Readonly<PlasmodiumState>, site: number): number {
  return rawSuggestionScore(p, site) - CENTER_TIE_BREAK * centerDistance(p.plate, site);
}

function rawSuggestionScore(p: Readonly<PlasmodiumState>, site: number): number {
  const record = p.plates[p.plate];
  const draft = draftWith(p, [...(record?.foods ?? []), site], record?.lamps ?? []);
  if (!draft) return 0;
  const g = previewGraph(draft.plate);
  for (let i = 0; i < SUGGEST_STEPS; i += 1) modelStep(draft, g);
  // La instantánea es compartida por placa: lo que hace falta se copia antes de volver a medir.
  const soon = measureOn(draft, g);
  if (soon.meets) return MEETS_BONUS + scoreOf(soon);
  const score = soon.score;
  const horizon = suggestHorizon(p);
  if (soon.playerFoods < plateDef(draft.plate).foods || horizon <= SUGGEST_STEPS) return score;
  for (let i = SUGGEST_STEPS; i < horizon; i += 1) modelStep(draft, g);
  const later = measureOn(draft, g);
  return later.meets ? scoreOf(later) : score;
}

/**
 * Quimiotaxis: el mejor sitio para el siguiente copo (a igualdad, el más cerca del centro), o null
 * si no quedan copos por poner.
 */
export function suggestSite(p: Readonly<PlasmodiumState>): number | null {
  if ((p.plates[p.plate]?.foods.length ?? 0) >= foodLimit(p, p.plate)) return null;
  let best: number | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const site of freeSites(p)) {
    const v = suggestionScore(p, site);
    if (v > bestScore) {
      bestScore = v;
      best = site;
    }
  }
  return best;
}

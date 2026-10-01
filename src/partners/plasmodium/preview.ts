/**
 * Previsualizar una colocación: copia el plasmodio, pone los copos, corre unos pasos del modelo y
 * puntúa la red. Lo usan la Quimiotaxis (el sitio sugerido) y el bot del simulador, como
 * previewGenerator en la red: la regla de qué red es mejor vive una sola vez.
 */
import { modelStep } from './flow.ts';
import { previewGraph } from './graph.ts';
import { measureOn } from './metrics.ts';
import { respreadTubes } from './actions.ts';
import { foodLimit, plateDef, type PlasmodiumState } from './state.ts';

/** Puntos por cumplir el objetivo: pesan más que cualquier red que no lo cumpla. */
export const MEETS_BONUS = 1000;

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
  const draft = structuredClone(p) as PlasmodiumState;
  const record = draft.plates[draft.plate];
  if (!record) return 0;
  const changed = record.foods.join() !== foods.join() || record.lamps.join() !== lamps.join();
  record.foods = [...foods];
  record.lamps = [...lamps];
  if (changed) respreadTubes(draft);
  const g = previewGraph(draft.plate);
  for (let i = 0; i < steps; i += 1) modelStep(draft, g);
  const snap = measureOn(draft, g);
  return (snap.meets ? MEETS_BONUS : 0) + snap.score;
}

/** Pasos de la previsualización de la Quimiotaxis (los mismos que el bot del simulador). */
export const SUGGEST_STEPS = 150;

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

/** Puntuación de poner el siguiente copo en `site` (la Quimiotaxis prueba un sitio por frame). */
export function suggestionScore(p: Readonly<PlasmodiumState>, site: number): number {
  const record = p.plates[p.plate];
  return previewScore(p, [...(record?.foods ?? []), site], record?.lamps ?? [], SUGGEST_STEPS);
}

/**
 * Quimiotaxis: el mejor sitio para el siguiente copo (a igualdad, el de número menor), o null si
 * no quedan copos por poner.
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

/**
 * Previsualizar una colocación: copia el plasmodio, pone los copos, corre unos pasos del modelo y
 * puntúa la red. Lo usan la Quimiotaxis (el sitio sugerido) y el bot del simulador, como
 * previewGenerator en la red: la regla de qué red es mejor vive una sola vez.
 */
import { modelStep } from './flow.ts';
import { previewGraph } from './graph.ts';
import { measureOn } from './metrics.ts';
import { respreadTubes } from './actions.ts';
import type { PlasmodiumState } from './state.ts';

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

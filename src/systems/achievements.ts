/**
 * Logros: se comprueban cada segundo de juego y tras cada compra. Son permanentes y
 * cada uno suma al multiplicador global, así que otorgar uno invalida la caché.
 */
import { ACHIEVEMENTS, type AchievementDef } from '../data/achievements.ts';
import { emit } from '../core/events.ts';
import * as num from '../core/num.ts';
import { derived, invalidate } from '../core/selectors.ts';
import type { GameState } from '../core/state.ts';

function isMet(state: GameState, def: AchievementDef): boolean {
  const c = def.condition;
  switch (c.kind) {
    case 'owned':
      return state.owned[c.id] >= c.count;
    case 'lifetime':
      return num.gte(state.lifetimeEarned, c.amount);
    case 'production':
      return num.gte(derived(state).production, c.amount);
    case 'clicks':
      return state.stats.clicks >= c.count;
    case 'drops':
      return state.stats.drops >= c.count;
    case 'sporulations':
      return state.stats.sporulations >= c.count;
    case 'idle':
      return state.stats.idleClickTime >= c.seconds;
    case 'away':
      // Lo otorga el sistema offline al volver, con el hueco real.
      return false;
  }
}

/** Otorga un logro si aún no se tenía. Devuelve si fue nuevo. */
export function grantAchievement(state: GameState, id: string): boolean {
  if (state.achievements.includes(id)) return false;
  state.achievements.push(id);
  invalidate(state);
  emit({ type: 'achievement', id });
  return true;
}

/** Revisa todos los logros pendientes y otorga los que se cumplen. */
export function checkAchievements(state: GameState): void {
  for (const def of ACHIEVEMENTS) {
    if (state.achievements.includes(def.id)) continue;
    if (isMet(state, def)) grantAchievement(state, def.id);
  }
}

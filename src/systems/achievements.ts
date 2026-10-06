/**
 * Logros: se comprueban cada segundo de juego y tras cada compra. Son permanentes y
 * cada uno suma al multiplicador global, así que otorgar uno invalida la caché.
 */
import { ACHIEVEMENTS, type AchievementDef } from '../data/achievements.ts';
import { BIOME_ADAPTATIONS, DESTINATION_IDS, isDestinationId } from '../data/biomes.ts';
import { emit } from '../core/events.ts';
import { isColonized, isReturnClosed } from '../core/forest.ts';
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
    case 'dispersals':
      return state.forest.leg >= c.count;
    case 'colonized':
      return isColonized(state, c.biome);
    case 'biomeAdaptationsMaxed':
      // Cada destino tiene adaptaciones (tests/journey.test.ts lo exige): un bioma sin ellas lo
      // cumpliría en vacío y daría el logro y su +1 % a cualquiera, también en el natal.
      return DESTINATION_IDS.some((biome) =>
        BIOME_ADAPTATIONS.every((a) => a.biome !== biome || state.biomeAdaptations[a.id] >= a.max),
      );
    case 'biomeLevel':
      // En un destino y no «fuera del tramo 0»: en El regreso el linaje vive en el natal, y
      // «Echar raíces» es lejos de él.
      return isDestinationId(state.forest.biome) && state.spores.level >= c.level;
    case 'returned':
      return isReturnClosed(state);
    case 'cycles':
      return state.cycle.done >= c.count;
    case 'vowRecord':
      // Del récord y no del ciclo vigente: un voto roto no cuenta, y el logro queda aunque el récord
      // se mejore después con otros votos (los récords son por combinación y no se borran).
      return state.records.some((record) => c.vows.every((vow) => record.vows.includes(vow)));
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

/**
 * Logros (PROMPT.md §11): cada uno da +1 % de producción global (+2 % con Simbiosis
 * antigua). Son permanentes. El texto vive en src/i18n con las claves `ach.<id>.name`;
 * la descripción se arma con plantillas según la condición, salvo los secretos, que
 * tienen la suya (`ach.<id>.desc`).
 */
import { DESTINATION_IDS, type DestinationId } from './biomes.ts';
import { GENERATORS, type GeneratorId } from './generators.ts';

export type AchievementCondition =
  | { kind: 'owned'; id: GeneratorId; count: number }
  | { kind: 'lifetime'; amount: number }
  | { kind: 'production'; amount: number }
  | { kind: 'clicks'; count: number }
  | { kind: 'drops'; count: number }
  | { kind: 'sporulations'; count: number }
  /** Segundos de juego abierto (en primer plano) sin hacer clic. */
  | { kind: 'idle'; seconds: number }
  /** Segundos fuera del juego entre dos sesiones (lo otorga el sistema offline). */
  | { kind: 'away'; seconds: number }
  /** Viento de esporas (fase 8): dispersiones hechas. */
  | { kind: 'dispersals'; count: number }
  | { kind: 'colonized'; biome: DestinationId }
  /** Algún bioma con todas sus adaptaciones al máximo (uno sin adaptaciones no cuenta). */
  | { kind: 'biomeAdaptationsMaxed' }
  /** Nivel de esporas local en un destino (nunca en el natal, tampoco en El regreso). */
  | { kind: 'biomeLevel'; level: number }
  /** El regreso cumplido (fase 10): la Crónica tiene la entrada del tramo 5. */
  | { kind: 'returned' };

export interface AchievementDef {
  id: string;
  condition: AchievementCondition;
  secret?: boolean;
  /**
   * 'actOne': no se lista ni se cuenta hasta cerrar el Acto I. Verlos desde el minuto uno
   * destriparía el final del Acto I.
   */
  reveal?: 'actOne';
}

export const OWNED_ACHIEVEMENT_COUNTS: readonly number[] = [1, 50, 100];
export const LIFETIME_ACHIEVEMENTS: readonly number[] = [1e3, 1e6, 1e9, 1e12, 1e15];
export const PRODUCTION_ACHIEVEMENTS: readonly number[] = [10, 1e3, 1e5, 1e7, 1e9];
export const CLICK_ACHIEVEMENTS: readonly number[] = [100, 1000, 10000];
export const DROP_ACHIEVEMENTS: readonly number[] = [1, 10, 50];
export const SPORULATION_ACHIEVEMENTS: readonly number[] = [1, 5, 10];
/** Paciencia de hongo: 10 minutos sin hacer clic con el juego abierto. */
export const IDLE_ACHIEVEMENT_SECONDS = 600;
/** Sin prisa: volver tras 8 horas. */
export const AWAY_ACHIEVEMENT_SECONDS = 8 * 3600;
/**
 * Echar raíces: nivel local 1000 lejos del natal, una partida o dos después de colonizar. Es una
 * meta larga para cuando ya no quedan destinos.
 */
export const BIOME_LEVEL_ACHIEVEMENT = 1000;

function build(): AchievementDef[] {
  const list: AchievementDef[] = [];
  for (const gen of GENERATORS) {
    for (const count of OWNED_ACHIEVEMENT_COUNTS) {
      list.push({ id: `own.${gen.id}.${count}`, condition: { kind: 'owned', id: gen.id, count } });
    }
  }
  LIFETIME_ACHIEVEMENTS.forEach((amount, i) => {
    list.push({ id: `lifetime.${i + 1}`, condition: { kind: 'lifetime', amount } });
  });
  PRODUCTION_ACHIEVEMENTS.forEach((amount, i) => {
    list.push({ id: `production.${i + 1}`, condition: { kind: 'production', amount } });
  });
  CLICK_ACHIEVEMENTS.forEach((count, i) => {
    list.push({ id: `clicks.${i + 1}`, condition: { kind: 'clicks', count } });
  });
  DROP_ACHIEVEMENTS.forEach((count, i) => {
    list.push({ id: `drops.${i + 1}`, condition: { kind: 'drops', count } });
  });
  SPORULATION_ACHIEVEMENTS.forEach((count, i) => {
    list.push({ id: `sporulations.${i + 1}`, condition: { kind: 'sporulations', count } });
  });
  list.push({
    id: 'secret.patience',
    condition: { kind: 'idle', seconds: IDLE_ACHIEVEMENT_SECONDS },
    secret: true,
  });
  list.push({
    id: 'secret.noRush',
    condition: { kind: 'away', seconds: AWAY_ACHIEVEMENT_SECONDS },
    secret: true,
  });
  // Viento de esporas (fases 8 y 10). Ninguno se cumple sin dispersar, así que el natal no cambia.
  list.push({ id: 'disperse.1', condition: { kind: 'dispersals', count: 1 }, reveal: 'actOne' });
  for (const biome of DESTINATION_IDS) {
    list.push({ id: `colonize.${biome}`, condition: { kind: 'colonized', biome }, reveal: 'actOne' });
  }
  list.push({ id: 'adapt.biomeFull', condition: { kind: 'biomeAdaptationsMaxed' }, reveal: 'actOne' });
  list.push({
    id: 'biomeLevel.1',
    condition: { kind: 'biomeLevel', level: BIOME_LEVEL_ACHIEVEMENT },
    reveal: 'actOne',
  });
  list.push({ id: 'return.1', condition: { kind: 'returned' }, reveal: 'actOne' });
  return list;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = build();

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievement(id: string): AchievementDef | undefined {
  return BY_ID.get(id);
}

export function isAchievementId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

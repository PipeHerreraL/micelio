/** Eventos propios del plasmodio (los emite su modelo; main.ts los convierte en avisos). */
import type { Num } from '../../core/num.ts';
import type { PlasmodiumAchievementId } from '../../data/plasmodium.ts';

export type PlasmodiumEvent =
  /** La red empezó o dejó de cumplir el objetivo de la placa abierta. */
  | { type: 'plasmodium'; kind: 'goal'; met: boolean }
  /** La placa frontera quedó cartografiada: el plasmodio fructificó. */
  | { type: 'plasmodium'; kind: 'fruited'; plate: number }
  /** Un minuto de red estable dio más puntuación que el mapa guardado. */
  | { type: 'plasmodium'; kind: 'mapImproved'; plate: number }
  | { type: 'plasmodium'; kind: 'pulse' }
  | { type: 'plasmodium'; kind: 'achievement'; id: PlasmodiumAchievementId }
  /** Se abrió una placa: a mano (`auto` = false) o sola tras fructificar. */
  | { type: 'plasmodium'; kind: 'plateOpened'; plate: number; auto: boolean }
  /** Defensa: un valor no finito reinició la red de la placa abierta. */
  | { type: 'plasmodium'; kind: 'reset'; reason: 'nonFinite' }
  /** Se aplicó de golpe tiempo apuntado (offline, segundo plano o modelo que llegó tarde). */
  | { type: 'plasmodium'; kind: 'caughtUp'; seconds: number; gained: Num };

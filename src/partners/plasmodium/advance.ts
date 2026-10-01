/**
 * El reloj del plasmodio: segundos de modelo, Rastro, estabilidad, fructificar y el tiempo
 * aplicado de golpe. Va en el trozo que llega aparte; el núcleo de la red no lo ejecuta nunca.
 *
 * El reloj cuenta ms enteros: trocear un intervalo en llamadas más cortas da lo mismo, bit a bit,
 * mientras ninguna llamada junte más de CATCHUP_STEPPED_SECONDS segundos. Más allá, el resto se
 * cobra al ritmo final sin pasos (medido: 8 h de golpe frente a 8 h en vivo, ×1,000), y esa parte
 * nunca fructifica ni cambia la estabilidad. Es la excepción a ARCHITECTURE.md §2 (§4.29).
 */
import { emit } from '../../core/events.ts';
import * as num from '../../core/num.ts';
import type { Num } from '../../core/num.ts';
import type { GameState } from '../../core/state.ts';
import {
  CATCHUP_STEPPED_SECONDS,
  CAUGHT_UP_NOTICE_SECONDS,
  LINGER_SECONDS,
  MODEL_SECOND_MS,
  MOIST_STEPS,
  PLATE_ACHIEVEMENTS,
  STABLE_DRAIN,
  STABLE_SECONDS,
  type PlasmodiumAchievementId,
} from '../../data/plasmodium.ts';
import { PLATES } from '../../data/plasmodium-plates.ts';
import { modelStep } from './flow.ts';
import { plateGraph } from './graph.ts';
import { measure, type PlateSnapshot } from './metrics.ts';
import {
  agarFactor,
  cultureRate,
  frontier,
  plateDef,
  spreadConductivity,
  startHabituation,
  type PlasmodiumState,
} from './state.ts';

/** Suma Rastro: disponible, ganado y, si queda placa por cartografiar, hacia su meta. */
export function gainTrail(p: PlasmodiumState, amount: Num): void {
  if (!num.gt(amount, 0)) return;
  const safe = num.clamp(amount);
  p.trail = num.clamp(num.add(p.trail, safe));
  p.trailEarned = num.clamp(num.add(p.trailEarned, safe));
  if (frontier(p) !== null) p.mapping = num.clamp(num.add(p.mapping, safe));
}

export function grantPlasmodiumAchievement(p: PlasmodiumState, id: PlasmodiumAchievementId): void {
  if (p.achievements.includes(id)) return;
  p.achievements.push(id);
  emit({ type: 'plasmodium', kind: 'achievement', id });
}

/** Rastro/s de la placa abierta (sin el cultivo ni los pulsos): el mejor entre la red y su mapa. */
export function openPlateRate(p: Readonly<PlasmodiumState>, snap: Readonly<PlateSnapshot>): Num {
  const def = plateDef(p.plate);
  const factor = agarFactor(p);
  let live = def.trailRate * snap.score * factor;
  const map = p.plates[p.plate]?.map;
  if (map) live = Math.max(live, def.trailRate * map.score * factor);
  return num.clamp(live);
}

/** Rastro/s total: la placa abierta más las cartografiadas en cultivo. */
export function trailRate(p: Readonly<PlasmodiumState>, snap: Readonly<PlateSnapshot>): Num {
  return num.clamp(num.add(openPlateRate(p, snap), cultureRate(p)));
}

/**
 * Abre una placa (gratis): la red la cubre de nuevo con el temblor del azar propio, la
 * habituación vuelve a la de partida de esa placa y la colocación guardada de la placa vuelve.
 */
export function openPlateInternal(p: PlasmodiumState, plate: number, auto: boolean): void {
  p.plate = plate;
  p.conductivity = spreadConductivity(p, plate);
  p.habituation = startHabituation(plate);
  p.stableFor = 0;
  p.goalMet = false;
  p.lingerFor = 0;
  p.pulsedHere = false;
  p.step = 0;
  emit({ type: 'plasmodium', kind: 'plateOpened', plate, auto });
}

/** Defensa: si un valor no es finito, la red de la placa vuelve a cubrirla (y se avisa). */
function guardFinite(p: PlasmodiumState): void {
  let sum = 0;
  for (const d of p.conductivity) sum += d;
  for (const h of p.habituation) sum += h;
  if (Number.isFinite(sum)) return;
  p.conductivity = spreadConductivity(p, p.plate);
  p.habituation = startHabituation(p.plate);
  p.stableFor = 0;
  p.step = 0;
  emit({ type: 'plasmodium', kind: 'reset', reason: 'nonFinite' });
}

/** Avisos agrupados en una llamada a advance (la cola de eventos tiene tope: BUG familia #16). */
interface Batch {
  goalAtStart: boolean;
  mapImproved: number;
}

/** Un segundo de modelo, en el orden de ARCHITECTURE.md §4.29. */
export function stepSecond(p: PlasmodiumState, batch: Batch | null = null): PlateSnapshot {
  const g = plateGraph(p.plate);
  const steps = p.moistFor > 0 ? MOIST_STEPS : 1;
  for (let i = 0; i < steps; i += 1) modelStep(p, g);
  guardFinite(p);
  const snap = measure(p);

  gainTrail(p, trailRate(p, snap));

  const met = snap.meets;
  p.stableFor = met ? Math.min(STABLE_SECONDS, p.stableFor + 1) : Math.max(0, p.stableFor - STABLE_DRAIN);
  if (met !== p.goalMet) {
    p.goalMet = met;
    if (!batch) emit({ type: 'plasmodium', kind: 'goal', met });
  }

  p.moistFor = Math.max(0, p.moistFor - 1);
  p.pulseIn = Math.max(0, p.pulseIn - 1);
  if (p.lingerFor > 0) {
    p.lingerFor = Math.max(0, p.lingerFor - 1);
    if (p.lingerFor === 0 && p.plate + 1 < PLATES.length) {
      openPlateInternal(p, p.plate + 1, true);
      p.stats.modelSeconds += 1;
      return measure(p);
    }
  }

  const stable = p.stableFor >= STABLE_SECONDS;
  const record = p.plates[p.plate];
  if (record && stable) {
    if (!record.map && frontier(p) === p.plate && num.gte(p.mapping, plateDef(p.plate).trailGoal)) {
      record.map = mapOf(snap);
      p.mapping = 0;
      p.lingerFor = p.plate + 1 < PLATES.length ? LINGER_SECONDS : 0;
      emit({ type: 'plasmodium', kind: 'fruited', plate: p.plate });
      const achievement = PLATE_ACHIEVEMENTS[p.plate];
      if (achievement) grantPlasmodiumAchievement(p, achievement);
      if (!p.pulsedHere) grantPlasmodiumAchievement(p, 'noPulse');
    } else if (record.map && snap.score > record.map.score * 1.001) {
      // El mapa mejora siempre que se cumpla: es estado guardado, así que no depende de cuándo
      // se recargó la partida. El límite de avisos vive en la vista.
      record.map = mapOf(snap);
      if (batch) batch.mapImproved += 1;
      else emit({ type: 'plasmodium', kind: 'mapImproved', plate: p.plate });
    }
    // A prueba de cortes: con la red estable, 3 copos o más unidos y ningún tubo imprescindible.
    if (snap.joined >= 3 && snap.tolerance >= 1) grantPlasmodiumAchievement(p, 'cutProof');
  }
  p.stats.modelSeconds += 1;
  return snap;
}

function mapOf(snap: Readonly<PlateSnapshot>): NonNullable<PlasmodiumState['plates'][number]['map']> {
  return {
    score: snap.score,
    quality: snap.quality,
    cost: snap.cost,
    tolerance: snap.tolerance,
    alive: snap.alive,
    joined: snap.joined,
  };
}

/**
 * Segundos cobrados al ritmo final, sin pasos: el Rastro del último estado de la red, los
 * contadores bajan y la placa siguiente se abre al final si tocaba. No fructifica ni cambia la
 * estabilidad.
 */
function flatSeconds(p: PlasmodiumState, seconds: number): void {
  const snap = measure(p);
  gainTrail(p, num.mul(trailRate(p, snap), seconds));
  p.moistFor = Math.max(0, p.moistFor - seconds);
  p.pulseIn = Math.max(0, p.pulseIn - seconds);
  p.stats.modelSeconds += seconds;
  if (p.lingerFor > 0) {
    const opens = p.lingerFor <= seconds;
    p.lingerFor = Math.max(0, p.lingerFor - seconds);
    if (opens && p.plate + 1 < PLATES.length) openPlateInternal(p, p.plate + 1, true);
  }
}

/**
 * Avanza `ms` del reloj del socio. Los avisos de una llamada se agrupan: como mucho un cambio de
 * objetivo y una mejora de mapa; los frutos y los logros, siempre (como mucho cinco y ocho).
 */
export function advancePlasmodium(_state: GameState, p: PlasmodiumState, ms: number): void {
  if (!(ms > 0) || !Number.isInteger(ms)) return;
  p.clockMs += ms;
  const n = Math.floor(p.clockMs / MODEL_SECOND_MS);
  if (n <= 0) return;
  p.clockMs -= n * MODEL_SECOND_MS;
  const stepped = Math.min(n, CATCHUP_STEPPED_SECONDS);
  const before = p.trailEarned;
  // En vivo (un segundo por llamada) los avisos salen al momento; de golpe, agrupados.
  const batch: Batch | null = n > 1 ? { goalAtStart: p.goalMet, mapImproved: 0 } : null;
  for (let i = 0; i < stepped; i += 1) stepSecond(p, batch);
  if (n > stepped) flatSeconds(p, n - stepped);
  if (batch) {
    if (p.goalMet !== batch.goalAtStart) emit({ type: 'plasmodium', kind: 'goal', met: p.goalMet });
    if (batch.mapImproved > 0) emit({ type: 'plasmodium', kind: 'mapImproved', plate: p.plate });
  }
  if (n >= CAUGHT_UP_NOTICE_SECONDS) {
    emit({ type: 'plasmodium', kind: 'caughtUp', seconds: n, gained: num.sub(p.trailEarned, before) });
  }
}

/**
 * Acciones del jugador sobre el plasmodio (`(state, payload) => void`, como las de la red: la
 * interfaz las despacha con store.dispatch). Van en el trozo que llega aparte. Cada una valida
 * antes de mutar: una entrada imposible (un sitio fijo, sin inventario, sin Rastro) no cambia nada.
 */
import { emit } from '../../core/events.ts';
import * as num from '../../core/num.ts';
import type { GameState } from '../../core/state.ts';
import {
  FLOW_FACTORS,
  PULSE_COOLDOWN,
  PULSE_STEPS,
  PULSE_TRAIL_SECONDS,
  RESPREAD,
  isPlasmodiumUpgradeId,
  type PlasmodiumUpgradeId,
} from '../../data/plasmodium.ts';
import { gainTrail, grantPlasmodiumAchievement, openPlateInternal, openPlateRate } from './advance.ts';
import { modelStep } from './flow.ts';
import { plateGraph } from './graph.ts';
import { measure } from './metrics.ts';
import {
  foodLimit,
  isFlowAvailable,
  isPlateAvailable,
  isUpgradeAvailable,
  lampLimit,
  plateDef,
  spreadConductivity,
  upgradeCost,
  type FlowLevel,
  type PlasmodiumState,
} from './state.ts';

export type PlateTool = 'food' | 'lamp' | 'remove';

/**
 * Re-expansión: al cambiar copos, lámparas o caudal el plasmodio vuelve a extenderse y cada tubo
 * sube a max(D, 0,3). Sin esto el modelo no revive un camino seco (medido en el prototipo).
 */
export function respreadTubes(p: PlasmodiumState): void {
  for (let e = 0; e < p.conductivity.length; e += 1) {
    if ((p.conductivity[e] ?? 0) < RESPREAD) p.conductivity[e] = RESPREAD;
  }
}

/** Qué hace la herramienta en un sitio de la placa abierta (para la interfaz y para placeItem). */
export type SiteAction =
  | 'placeFood'
  | 'placeLamp'
  | 'remove'
  | 'toFood'
  | 'toLamp'
  | 'noFood'
  | 'noLamp'
  | 'fixed'
  | 'blocked'
  | 'empty'
  | 'foodLocked';

export function siteAction(p: Readonly<PlasmodiumState>, site: number, tool: PlateTool): SiteAction {
  const def = plateDef(p.plate);
  if (def.fixedFoods.includes(site)) return 'fixed';
  if (def.blocked.includes(site)) return 'blocked';
  const record = p.plates[p.plate];
  const hasFood = record?.foods.includes(site) ?? false;
  const hasLamp = record?.lamps.includes(site) ?? false;
  if (tool === 'remove') return hasFood || hasLamp ? 'remove' : 'empty';
  if (tool === 'food') {
    if (hasFood) return 'remove';
    if (foodLimit(p, p.plate) === 0) return 'foodLocked';
    if ((record?.foods.length ?? 0) >= foodLimit(p, p.plate)) return 'noFood';
    return hasLamp ? 'toFood' : 'placeFood';
  }
  if (hasLamp) return 'remove';
  if ((record?.lamps.length ?? 0) >= lampLimit(p, p.plate)) return 'noLamp';
  return hasFood ? 'toLamp' : 'placeLamp';
}

/** Usa la herramienta en un sitio de la placa abierta: poner, cambiar o quitar. Mover es gratis. */
export function placeItem(state: GameState, payload: { site: number; tool: PlateTool }): void {
  const p = state.partners.plasmodium;
  if (!p) return;
  const { site, tool } = payload;
  if (!Number.isInteger(site) || site < 0 || site >= plateDef(p.plate).x.length) return;
  const record = p.plates[p.plate];
  if (!record) return;
  const action = siteAction(p, site, tool);
  const withoutSite = (list: number[]): number[] => list.filter((s) => s !== site);
  switch (action) {
    case 'placeFood':
    case 'toFood':
      record.lamps = withoutSite(record.lamps);
      record.foods = [...record.foods, site];
      grantPlasmodiumAchievement(p, 'firstOat');
      break;
    case 'placeLamp':
    case 'toLamp':
      record.foods = withoutSite(record.foods);
      record.lamps = [...record.lamps, site];
      break;
    case 'remove':
      record.foods = withoutSite(record.foods);
      record.lamps = withoutSite(record.lamps);
      break;
    default:
      return;
  }
  p.stats.placements += 1;
  respreadTubes(p);
}

/**
 * Dar un pulso: el citoplasma va y viene, la red se adapta PULSE_STEPS pasos de golpe y deja
 * PULSE_TRAIL_SECONDS segundos del Rastro de la placa abierta. Uno cada PULSE_COOLDOWN segundos de
 * modelo: como mucho dobla el Rastro, sin premiar pulsar sin parar. No cambia la estabilidad ni
 * fructifica (eso solo pasa en un segundo de modelo).
 */
export function pulse(state: GameState): void {
  const p = state.partners.plasmodium;
  if (!p || p.pulseIn > 0) return;
  const g = plateGraph(p.plate);
  for (let i = 0; i < PULSE_STEPS; i += 1) modelStep(p, g);
  gainTrail(p, num.mul(openPlateRate(p, measure(p)), PULSE_TRAIL_SECONDS));
  p.pulseIn = PULSE_COOLDOWN;
  p.pulsedHere = true;
  p.stats.pulses += 1;
  emit({ type: 'plasmodium', kind: 'pulse' });
}

/** Caudal de la placa abierta: solo con el caudal abierto y en una placa ya cartografiada. */
export function setFlow(state: GameState, payload: { flow: FlowLevel }): void {
  const p = state.partners.plasmodium;
  const record = p?.plates[p.plate];
  if (!p || !record?.map || !isFlowAvailable(p)) return;
  if (!Number.isInteger(payload.flow) || payload.flow < 0 || payload.flow >= FLOW_FACTORS.length) return;
  if (record.flow === payload.flow) return;
  record.flow = payload.flow;
  respreadTubes(p);
}

/** Extender de nuevo: la red cubre otra vez la placa. La habituación, la colocación y el Rastro no cambian. */
export function respread(state: GameState): void {
  const p = state.partners.plasmodium;
  if (!p) return;
  p.conductivity = spreadConductivity(p, p.plate);
}

/** Abre una placa disponible (gratis). La de la red que se deja no se guarda; su colocación sí. */
export function openPlate(state: GameState, payload: { plate: number }): void {
  const p = state.partners.plasmodium;
  if (!p || payload.plate === p.plate || !isPlateAvailable(p, payload.plate)) return;
  openPlateInternal(p, payload.plate, false);
}

export function buyPlasmodiumUpgrade(state: GameState, payload: { id: PlasmodiumUpgradeId }): void {
  const p = state.partners.plasmodium;
  if (!p || !isPlasmodiumUpgradeId(payload.id) || !isUpgradeAvailable(p, payload.id)) return;
  const cost = upgradeCost(p, payload.id);
  if (cost === null || num.lt(p.trail, cost)) return;
  p.trail = num.max(num.ZERO, num.sub(p.trail, cost));
  p.upgrades[payload.id] += 1;
}

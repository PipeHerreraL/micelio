/**
 * Un paso del modelo de flujo del plasmodio (Tero et al. 2010), con fuente por turno e integrador
 * exponencial. Es el algoritmo del prototipo con el que se midieron los umbrales y la economía
 * (ARCHITECTURE.md §4.29), en el mismo orden:
 *
 * 1. Con menos de dos copos no pasa nada (no hay flujo que adaptar).
 * 2. El contador de pasos sube y elige la fuente por turno: foods[step % F]. La fuente inyecta I0
 *    y cada otro copo extrae I0/(F − 1), con I0 = 1,5·√(F − 1) × caudal.
 * 3. Laplaciana Σ c_e (p_i − p_j) = b con c_e = D_e/L_e, el primer sumidero a presión 0;
 *    eliminación gaussiana sin pivoteo (simétrica y definida positiva porque D ≥ D_FLOOR).
 * 4. Q_e = c_e (p_a − p_b) y la respuesta f = |Q|^γ / (1 + |Q|^γ).
 * 5. Habituación, sobre una copia: la que viaja con el flujo por las aristas con sustancia (η) y el
 *    contagio por fusión (ζ), que solo sube.
 * 6. Conductividad, integrada de forma exacta con la habituación de antes del paso:
 *    D ← D* + (D − D*)·e^(−Δ·a), D* = f/a, a = r(1 + λ·luz) [+ r·β(1 − h̄) con sustancia]
 *    [×2 sin flujo con Memoria externa]; después D en [D_FLOOR, 1].
 *
 * No crea objetos: todo el espacio de trabajo está en el grafo de la placa.
 */
import {
  D_FLOOR,
  DECAY,
  GAMMA,
  I0_SCALE,
  LIGHT_LAMBDA,
  MAX_STEP,
  MEMORY_FACTOR,
  NOFLOW,
  SUBSTANCE_BETA,
} from '../../data/plasmodium.ts';
import type { PlateGraph } from './graph.ts';
import { delta, flowFactor, type PlasmodiumState } from './state.ts';

let failures = 0;

/** Pasos en que el solver rechazó la matriz (lo lee el simulador; no se guarda). */
export function solverFailures(): number {
  return failures;
}

/** Copos de la placa abierta en `work.foods`: los fijos primero, luego los del jugador. Devuelve F. */
export function loadFoods(p: Readonly<PlasmodiumState>, g: PlateGraph): number {
  const foods = g.work.foods;
  let count = 0;
  for (const f of g.def.fixedFoods) foods[count++] = f;
  for (const f of p.plates[p.plate]?.foods ?? []) foods[count++] = f;
  return count;
}

/** Luz de cada arista en `work.light`: la fija de la placa más la de las lámparas del jugador. */
export function loadLight(p: Readonly<PlasmodiumState>, g: PlateGraph): void {
  const lamps = p.plates[p.plate]?.lamps ?? [];
  const n = g.n;
  for (let e = 0; e < g.m; e += 1) {
    let lit = g.baseLight[e] ?? 0;
    if (!lit) {
      const a = g.ea[e] ?? 0;
      const b = g.eb[e] ?? 0;
      for (const l of lamps) {
        if (g.lampReach[a * n + l] || g.lampReach[b * n + l]) {
          lit = 1;
          break;
        }
      }
    }
    g.work.light[e] = lit;
  }
}

/** Resuelve las presiones con `source` como fuente. false si un pivote no es positivo y finito. */
function solve(
  p: Readonly<PlasmodiumState>,
  g: PlateGraph,
  foodCount: number,
  source: number,
  i0: number,
): boolean {
  const n = g.n;
  const { mat: A, rhs: b, pressure, foods } = g.work;
  const D = p.conductivity;
  A.fill(0);
  b.fill(0);
  for (let e = 0; e < g.m; e += 1) {
    const c = (D[e] ?? 0) / (g.len[e] ?? 1);
    const i = g.ea[e] ?? 0;
    const j = g.eb[e] ?? 0;
    A[i * n + i] = (A[i * n + i] ?? 0) + c;
    A[j * n + j] = (A[j * n + j] ?? 0) + c;
    A[i * n + j] = (A[i * n + j] ?? 0) - c;
    A[j * n + i] = (A[j * n + i] ?? 0) - c;
  }
  const sinks = foodCount - 1;
  let ground = -1;
  for (let k = 0; k < foodCount; k += 1) {
    const food = foods[k] ?? 0;
    if (food === source) b[food] = (b[food] ?? 0) + i0;
    else {
      b[food] = (b[food] ?? 0) - i0 / sinks;
      if (ground < 0) ground = food;
    }
  }
  // p_ground = 0: fila identidad y columna a cero (la simetría se conserva).
  for (let k = 0; k < n; k += 1) {
    A[ground * n + k] = 0;
    A[k * n + ground] = 0;
  }
  A[ground * n + ground] = 1;
  b[ground] = 0;
  for (let k = 0; k < n; k += 1) {
    const piv = A[k * n + k] ?? 0;
    if (!(piv > 0) || !Number.isFinite(piv)) return false;
    for (let i = k + 1; i < n; i += 1) {
      const fac = (A[i * n + k] ?? 0) / piv;
      if (fac === 0) continue;
      for (let j = k; j < n; j += 1) A[i * n + j] = (A[i * n + j] ?? 0) - fac * (A[k * n + j] ?? 0);
      b[i] = (b[i] ?? 0) - fac * (b[k] ?? 0);
    }
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = b[i] ?? 0;
    for (let j = i + 1; j < n; j += 1) s -= (A[i * n + j] ?? 0) * (pressure[j] ?? 0);
    pressure[i] = s / (A[i * n + i] ?? 1);
  }
  for (let i = 0; i < n; i += 1) if (!Number.isFinite(pressure[i] ?? 0)) return false;
  return true;
}

/**
 * Un paso del modelo sobre la placa abierta. Escribe la conductividad y la habituación del estado
 * y deja el flujo del paso en `g.work.flow`. Devuelve false si no había flujo (menos de dos copos).
 */
export function modelStep(p: PlasmodiumState, g: PlateGraph): boolean {
  const F = loadFoods(p, g);
  if (F < 2) return false;
  loadLight(p, g);
  const work = g.work;
  const D = p.conductivity;
  const hab = p.habituation;
  const dt = delta(p);
  const memory = p.upgrades.memory > 0;

  // Con el tope, el turno no puede quedarse clavado (MAX_STEP); escrito así, un NaN también vuelve.
  p.step = p.step < MAX_STEP ? p.step + 1 : 1;
  const source = work.foods[p.step % F] ?? 0;
  const i0 = I0_SCALE * Math.sqrt(F - 1) * flowFactor(p, p.plate);
  const ok = solve(p, g, F, source, i0);
  if (!ok) failures += 1;
  for (let e = 0; e < g.m; e += 1) {
    const q = ok
      ? ((D[e] ?? 0) / (g.len[e] ?? 1)) *
        ((work.pressure[g.ea[e] ?? 0] ?? 0) - (work.pressure[g.eb[e] ?? 0] ?? 0))
      : 0;
    work.flow[e] = q;
    const abs = Math.abs(q);
    const qg = abs > 0 ? abs ** GAMMA : 0;
    work.response[e] = qg / (1 + qg);
  }

  const habRate = g.def.habRate;
  const spreadRate = g.def.spreadRate;
  const hasHab = habRate > 0 || spreadRate > 0;
  if (hasHab) {
    // La habituación viaja con el citoplasma: cuenta el flujo, no el grosor. Como el flujo entre
    // copos está forzado (Kirchhoff), siempre hay un camino que se habitúa: ninguna placa queda
    // sin salida aunque los tubos con sustancia estén secos.
    for (let i = 0; i < g.n; i += 1) work.habNext[i] = hab[i] ?? 0;
    for (let e = 0; e < g.m; e += 1) {
      const fq = work.response[e] ?? 0;
      if (fq === 0) continue;
      const a = g.ea[e] ?? 0;
      const b = g.eb[e] ?? 0;
      // Propia: el flujo que cruza la sustancia habitúa a los dos extremos (Boisseau et al. 2016).
      if (g.substance[e] && habRate > 0) {
        work.habNext[a] = (work.habNext[a] ?? 0) + dt * habRate * fq;
        work.habNext[b] = (work.habNext[b] ?? 0) + dt * habRate * fq;
      }
      // Fusión: sube hacia la del vecino (Vogel y Dussutour 2016). Solo sube: lo aprendido no se
      // diluye al fundirse.
      if (spreadRate > 0) {
        const diff = (hab[b] ?? 0) - (hab[a] ?? 0);
        if (diff > 0) work.habNext[a] = (work.habNext[a] ?? 0) + dt * spreadRate * fq * diff;
        else if (diff < 0) work.habNext[b] = (work.habNext[b] ?? 0) - dt * spreadRate * fq * diff;
      }
    }
  }

  for (let e = 0; e < g.m; e += 1) {
    const fq = work.response[e] ?? 0;
    let a = DECAY * (1 + LIGHT_LAMBDA * (work.light[e] ?? 0));
    if (g.substance[e]) {
      a += DECAY * SUBSTANCE_BETA * (1 - 0.5 * ((hab[g.ea[e] ?? 0] ?? 0) + (hab[g.eb[e] ?? 0] ?? 0)));
    }
    // La Memoria externa no toca los tubos con sustancia: secarlos antes de que el plasmodio se
    // acostumbre hacía imposibles el Puente y la Fusión (medido: la Fusión no cumplía ni con la
    // colocación que sugiere la Quimiotaxis).
    if (memory && fq < NOFLOW && !g.substance[e]) a *= MEMORY_FACTOR;
    // Solución exacta de dD/dt = f − a·D con f constante en el paso: el equilibrio de Tero (f/a),
    // estable con cualquier Δ (nunca negativa ni oscilante).
    const target = fq / a;
    let d = target + ((D[e] ?? 0) - target) * Math.exp(-dt * a);
    if (d < D_FLOOR) d = D_FLOOR;
    else if (d > 1) d = 1;
    D[e] = d;
  }

  if (hasHab) {
    for (let i = 0; i < g.n; i += 1) {
      const h = work.habNext[i] ?? 0;
      hab[i] = h > 1 ? 1 : h;
    }
  }
  return true;
}

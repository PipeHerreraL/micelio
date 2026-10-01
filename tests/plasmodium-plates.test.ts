import { describe, expect, it } from 'vitest';
import { PLATES, type PlateDef } from '../src/data/plasmodium-plates.ts';
import { compareWithData } from '../scripts/plasmodium-plates.ts';

/**
 * Datos de las cinco placas (src/data/plasmodium-plates.ts): son literales, así que una errata
 * (una arista repetida, un sitio fuera de rango, dos botones que se tocan) solo la ve esta prueba.
 */

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Cruce propio de dos aristas que no comparten extremo. */
function edgesCross(p: PlateDef, e: readonly [number, number], f: readonly [number, number]): boolean {
  const [a, b] = e;
  const [c, d] = f;
  if (a === c || a === d || b === c || b === d) return false;
  const xy = (i: number): [number, number] => [p.x[i] ?? 0, p.y[i] ?? 0];
  const d1 = cross(...xy(a), ...xy(b), ...xy(c));
  const d2 = cross(...xy(a), ...xy(b), ...xy(d));
  const d3 = cross(...xy(c), ...xy(d), ...xy(a));
  const d4 = cross(...xy(c), ...xy(d), ...xy(b));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function connected(p: PlateDef): boolean {
  const n = p.x.length;
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length > 0) {
    const u = stack.pop() ?? 0;
    for (const [a, b] of p.edges) {
      const v = a === u ? b : b === u ? a : -1;
      if (v >= 0 && !seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return seen.size === n;
}

describe('datos de las placas', () => {
  it('son cinco y en el orden del recorrido', () => {
    expect(PLATES.map((p) => p.id)).toEqual(['log', 'maze', 'archipelago', 'bitterBridge', 'fusion']);
  });

  for (const p of PLATES) {
    describe(p.id, () => {
      const n = p.x.length;

      it('como mucho 28 sitios y 61 aristas, con coordenadas dentro de la placa', () => {
        expect(n).toBeLessThanOrEqual(28);
        expect(p.y).toHaveLength(n);
        expect(p.edges.length).toBeLessThanOrEqual(61);
        for (let i = 0; i < n; i += 1) {
          expect(p.x[i]).toBeGreaterThan(0);
          expect(p.x[i]).toBeLessThan(p.cols);
          expect(p.y[i]).toBeGreaterThan(0);
          expect(p.y[i]).toBeLessThan(p.rows);
        }
      });

      it('un grafo plano y conexo, sin bucles ni aristas repetidas', () => {
        const keys = new Set<string>();
        for (const [a, b] of p.edges) {
          expect(a).not.toBe(b);
          expect(Math.min(a, b)).toBeGreaterThanOrEqual(0);
          expect(Math.max(a, b)).toBeLessThan(n);
          keys.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
        }
        expect(keys.size).toBe(p.edges.length);
        let crossings = 0;
        for (let i = 0; i < p.edges.length; i += 1) {
          for (let j = i + 1; j < p.edges.length; j += 1) {
            const e = p.edges[i];
            const f = p.edges[j];
            if (e && f && edgesCross(p, e, f)) crossings += 1;
          }
        }
        expect(crossings).toBe(0);
        expect(connected(p)).toBe(true);
      });

      it('copos fijos, sitios bloqueados, aristas con sustancia y sitios habituados en rango y sin repetir', () => {
        for (const list of [p.fixedFoods, p.blocked, p.habituated]) {
          expect(new Set(list).size).toBe(list.length);
          for (const i of list) expect(i).toBeLessThan(n);
        }
        expect(new Set(p.substanceEdges).size).toBe(p.substanceEdges.length);
        for (const e of p.substanceEdges) expect(e).toBeLessThan(p.edges.length);
        expect(p.fixedFoods.some((i) => p.blocked.includes(i))).toBe(false);
        expect(p.substance === 'none').toBe(p.substanceEdges.length === 0);
      });

      it('con la celda mínima, los botones de 44 px de los sitios no se solapan ni se salen', () => {
        let gap = Number.POSITIVE_INFINITY;
        let margin = Number.POSITIVE_INFINITY;
        for (let i = 0; i < n; i += 1) {
          const x = p.x[i] ?? 0;
          const y = p.y[i] ?? 0;
          margin = Math.min(margin, x, y, p.cols - x, p.rows - y);
          for (let j = i + 1; j < n; j += 1) {
            gap = Math.min(gap, Math.hypot(x - (p.x[j] ?? 0), y - (p.y[j] ?? 0)));
          }
        }
        expect(Math.max(44 / gap, 22 / margin)).toBeLessThanOrEqual(p.cellMin);
      });
    });
  }

  it('el Laberinto es una rejilla de 7×4 cuyas aristas solo unen celdas vecinas', () => {
    const maze = PLATES[1];
    if (!maze) throw new Error('falta el Laberinto');
    expect(maze.grid).toBe(true);
    expect(maze.x).toHaveLength(28);
    for (let i = 0; i < 28; i += 1) {
      expect(Math.floor(maze.x[i] ?? -1)).toBe(i % 7);
      expect(Math.floor(maze.y[i] ?? -1)).toBe(Math.floor(i / 7));
    }
    for (const [a, b] of maze.edges) {
      const dx = Math.abs((a % 7) - (b % 7));
      const dy = Math.abs(Math.floor(a / 7) - Math.floor(b / 7));
      expect(dx + dy).toBe(1);
    }
    expect(maze.fixedFoods).toEqual([0, 27]);
    expect(maze.extraFoods).toBe(false);
  });

  it('en el Puente amargo la quinina está justo en las aristas que cruzan el río', () => {
    const bridge = PLATES[3];
    if (!bridge) throw new Error('falta el Puente');
    const crossing = bridge.edges
      .map(([a, b], e) => (((bridge.x[a] ?? 0) - 3.5) * ((bridge.x[b] ?? 0) - 3.5) < 0 ? e : -1))
      .filter((e) => e >= 0);
    expect(bridge.substanceEdges).toEqual(crossing);
    expect(bridge.habituated).toEqual([]);
  });

  it('en la Fusión toda la placa lleva sal y solo la mitad izquierda empieza habituada', () => {
    const fusion = PLATES[4];
    if (!fusion) throw new Error('falta la Fusión');
    expect(fusion.substanceEdges).toHaveLength(fusion.edges.length);
    const left = fusion.x.map((x, i) => (x < 3.5 ? i : -1)).filter((i) => i >= 0);
    expect(fusion.habituated).toEqual(left);
    // El de la derecha solo aprende al fundirse.
    expect(fusion.habRate).toBe(0);
    expect(fusion.spreadRate).toBeGreaterThan(0);
    // Un copo fijo a cada lado.
    expect(fusion.fixedFoods.map((i) => (fusion.x[i] ?? 0) < 3.5)).toEqual([true, false]);
  });

  it('el generador de scripts/plasmodium-plates.ts reproduce los datos (procedencia)', () => {
    expect(compareWithData()).toEqual([]);
  });
});

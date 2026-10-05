import { describe, expect, it } from 'vitest';
import { disperse, sporulate } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { SOIL_PALETTES } from '../src/render/palettes.ts';
import {
  PLANETARY_LINKS,
  drawPlanetaryBand,
  planetaryLit,
  planetaryStrips,
  showsPlanetaryBand,
} from '../src/render/planetary-band.ts';
import { checkActOne, checkColonization } from '../src/systems/journey.ts';

/**
 * La banda de la Red planetaria (fase 10, El regreso): qué franjas lleva, cuántos enlaces enciende
 * y que se dibuja con ellos. La imagen en sí se mira en el navegador (tests/e2e); aquí, un contexto
 * falso cuenta los trazos encendidos y los fondos de las franjas.
 */

const NOW = Date.UTC(2026, 9, 5);

/** Del Acto I al natal del tramo 5 por el camino del juego: Chocó → taiga → tundra → pradera. */
function inReturn(): GameState {
  const s = createState(77, NOW);
  s.mutations = [...MUTATION_IDS];
  s.achievements = ['own.planetary.1'];
  s.spores = { level: 1941, available: 2025 };
  checkActOne(s);
  const path = ['choco', 'taiga', 'tundra', 'prairie', 'natal'] as const;
  path.forEach((to, i) => {
    disperse(s, { to, now: NOW + (i + 1) * 10_000 });
    if (to === 'natal') return;
    s.spores.level = 500;
    checkColonization(s, NOW + (i + 1) * 10_000 + 5000);
  });
  drain();
  return s;
}

/** Contexto 2D falso: anota cada trazo con su alfa y el color de cada rectángulo relleno. */
function fakeContext(): { ctx: CanvasRenderingContext2D; strokes: number[]; rects: unknown[] } {
  const strokes: number[] = [];
  const rects: unknown[] = [];
  const props: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(props, {
    get(target, key) {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key];
      return (): void => {
        if (key === 'stroke') strokes.push(target.globalAlpha as number);
        if (key === 'fillRect') rects.push(target.fillStyle);
      };
    },
    set(target, key, value: unknown) {
      if (typeof key === 'string') target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes, rects };
}

describe('la banda de la Red planetaria', () => {
  it('lleva el natal y los cuatro destinos en el orden del viaje, y solo se ve en el natal del tramo 5', () => {
    const s = inReturn();
    expect(planetaryStrips(s)).toEqual(['natal', 'choco', 'taiga', 'tundra', 'prairie']);
    expect(showsPlanetaryBand(s)).toBe(true);
    const fourth = createState(1, NOW);
    expect(showsPlanetaryBand(fourth)).toBe(false);
  });

  it('enciende un enlace en los niveles 125, 250 y 375, y el cuarto al cumplir El regreso', () => {
    const s = inReturn();
    const lit = (level: number): number => {
      s.spores.level = level;
      return planetaryLit(s);
    };
    expect([0, 124, 125, 249, 250, 374, 375, 499].map(lit)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    // E = ⌊18,75 · √(3,7632e16 / 4,8e13)⌋ = 525: la esporulación que cumple El regreso.
    s.spores.level = 0;
    s.forest.earned = 3.7632e16;
    s.lifetimeEarned = 1e17;
    s.runEarned = 2.88e14;
    sporulate(s, { now: NOW + 90_000 });
    expect(s.chronicle).toHaveLength(6);
    expect(planetaryLit(s)).toBe(PLANETARY_LINKS);
    expect(PLANETARY_LINKS).toBe(4);
  });

  it('dibuja tantos enlaces encendidos como pide, y con fondo pinta el suelo de cada franja', () => {
    const strips = planetaryStrips(inReturn()).map((id) => SOIL_PALETTES[id]);
    const rect = { x: 0, y: 0, w: 500, h: 96 };
    for (const lit of [0, 2, 4]) {
      const { ctx, strokes } = fakeContext();
      drawPlanetaryBand(ctx, rect, strips, lit, { dpr: 1, backdrop: false });
      // Los enlaces encendidos van a 0,9 de alfa; nada más se traza con ese alfa.
      expect(strokes.filter((a) => a === 0.9)).toHaveLength(lit);
    }
    const withBackdrop = fakeContext();
    drawPlanetaryBand(withBackdrop.ctx, rect, strips, 4, { dpr: 1, backdrop: true });
    for (const p of strips) expect(withBackdrop.rects).toContain(p.band);
    const onStage = fakeContext();
    drawPlanetaryBand(onStage.ctx, rect, strips, 4, { dpr: 1, backdrop: false });
    for (const p of strips) expect(onStage.rects).not.toContain(p.band);
  });
});

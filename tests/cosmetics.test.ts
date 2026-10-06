import { beforeEach, describe, expect, it } from 'vitest';
import { buyAdaptation, disperse, nextAdaptationCost, renounceVow } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import type { GameState } from '../src/core/state.ts';
import { ADAPTATION_IDS, ADAPTATIONS, getAdaptation } from '../src/data/adaptations.ts';
import {
  CORD_CORE_TONES,
  CORD_RIM_ALPHA,
  CORD_RIM_CSS,
  CORD_RIM_TONE,
  cordCoreTone,
  cordCoreWidth,
  sporePrintRgb,
  strokeCordCore,
  strokeCordRim,
  waxcapCount,
} from '../src/render/cosmetics.ts';
import { parseSave, SAVE_VERSION } from '../src/systems/save.ts';
import { CYCLE_NOW, HOUR, reachLevel, returnClosed, sownIn } from './cycle-states.ts';

/**
 * Las adaptaciones cosméticas de los votos (fase 10, bloque B): Esporada, Cordones negros e
 * Higróforos. Se abren con un récord que lleve su voto: la compra y el guardado lo deciden con la
 * misma regla. Los estados se construyen con acciones (tests/cycle-states.ts). El contraste de sus
 * colores contra el suelo está en tests/palettes.test.ts.
 */

const NOW = CYCLE_NOW;
const SOWN_AT = NOW + 60 * HOUR;
const SAVED_AT = NOW + 1000 * HOUR;

beforeEach(() => {
  drain();
});

/** Ciclo 2 en la taiga; el primero, en la pradera con «sin lluvia», cumplido con su récord. */
function afterNoRainRecord(): GameState {
  const s = sownIn('prairie', SOWN_AT, ['noRain']);
  reachLevel(s, 520, NOW + 62 * HOUR);
  disperse(s, { to: 'taiga', now: NOW + 63 * HOUR });
  drain();
  s.spores.available = 5000;
  return s;
}

function loads(state: GameState): boolean {
  return parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: SAVED_AT, state })).ok;
}

describe('adaptaciones cosméticas de los votos (fase 10)', () => {
  it('cada una cuesta 300·2^r esporas, tiene tres rangos y la abre su voto', () => {
    expect(ADAPTATIONS.map((a) => a.id)).toEqual([...ADAPTATION_IDS]);
    expect(
      ['sporePrint', 'blackCords', 'waxcaps'].map((id) => {
        const def = getAdaptation(id as 'sporePrint');
        return [def.baseCost, def.growth, def.max, def.unlock];
      }),
    ).toEqual([
      [300, 2, 3, 'noRain'],
      [300, 2, 3, 'autoOnly'],
      [300, 2, 3, 'noMutations'],
    ]);
    // Las de la red no esperan a ningún voto.
    for (const id of ['apicalBody', 'sclerotium', 'hydraulicLift', 'deepTorpor', 'foxfire'] as const) {
      expect(getAdaptation(id).unlock, id).toBeUndefined();
    }
  });

  it('sin un récord con su voto, comprar una cosmética no hace nada aunque sobren esporas', () => {
    const s = returnClosed();
    s.spores.available = 5000;
    const before = structuredClone(s);
    for (const id of ['sporePrint', 'blackCords', 'waxcaps'] as const) buyAdaptation(s, { id });
    expect(s).toEqual(before);
    expect(drain()).toEqual([]);
  });

  it('con el récord de su voto se compra: 300, 600 y 1.200 esporas, y del tercer rango no pasa', () => {
    const s = afterNoRainRecord();
    expect(nextAdaptationCost(s, 'sporePrint')).toBe(300);
    buyAdaptation(s, { id: 'sporePrint' });
    expect(s.adaptations.sporePrint).toBe(1);
    expect(s.spores.available).toBe(4700);
    expect(drain()).toEqual([{ type: 'buyAdaptation', id: 'sporePrint', rank: 1 }]);
    buyAdaptation(s, { id: 'sporePrint' });
    buyAdaptation(s, { id: 'sporePrint' });
    expect(s.spores.available).toBe(5000 - 300 - 600 - 1200);
    expect(nextAdaptationCost(s, 'sporePrint')).toBeNull();
    buyAdaptation(s, { id: 'sporePrint' });
    expect(s.adaptations.sporePrint).toBe(3);
    // Las otras dos piden su propio voto: con este récord siguen cerradas.
    buyAdaptation(s, { id: 'blackCords' });
    buyAdaptation(s, { id: 'waxcaps' });
    expect([s.adaptations.blackCords, s.adaptations.waxcaps]).toEqual([0, 0]);
  });

  it('un récord con varios votos abre la de cada uno; un voto roto antes de cumplir no abre la suya', () => {
    const s = sownIn('natal', SOWN_AT, ['noRain', 'autoOnly', 'noMutations']);
    renounceVow(s, { vow: 'autoOnly' });
    reachLevel(s, 520, NOW + 62 * HOUR);
    drain();
    s.spores.available = 5000;
    for (const id of ['sporePrint', 'blackCords', 'waxcaps'] as const) buyAdaptation(s, { id });
    expect([s.adaptations.sporePrint, s.adaptations.blackCords, s.adaptations.waxcaps]).toEqual([1, 0, 1]);
  });

  it('el guardado rechaza un rango sin el récord de su voto y acepta el que se compró con él', () => {
    const s = afterNoRainRecord();
    buyAdaptation(s, { id: 'sporePrint' });
    drain();
    expect(loads(s)).toBe(true);
    const cords = structuredClone(s);
    cords.adaptations.blackCords = 1;
    expect(loads(cords)).toBe(false);
    const waxcaps = structuredClone(s);
    waxcaps.adaptations.waxcaps = 2;
    expect(loads(waxcaps)).toBe(false);
    // Tres rangos como mucho, también con su récord.
    const over = structuredClone(s);
    over.adaptations.sporePrint = 4;
    expect(loads(over)).toBe(false);
    // Sin ningún récord, ni siquiera la del voto que se está jurando ahora.
    const sworn = sownIn('tundra', SOWN_AT, ['noRain']);
    sworn.adaptations.sporePrint = 1;
    expect(loads(sworn)).toBe(false);
    sworn.adaptations.sporePrint = 0;
    expect(loads(sworn)).toBe(true);
  });
});

describe('cómo se ven en el lienzo (fase 10)', () => {
  it('sin Esporada las esporas son del crema del micelio de siempre; cada rango, otro color', () => {
    expect(sporePrintRgb(0)).toBe('239, 230, 210');
    const tones = [0, 1, 2, 3].map(sporePrintRgb);
    expect(new Set(tones).size).toBe(4);
    // Un rango fuera de la tabla (solo en un guardado editado, que no valida) no rompe el dibujo.
    expect(sporePrintRgb(7)).toBe(sporePrintRgb(3));
  });

  it('los higróforos son 3, 6 y 9 por rango, y ninguno sin la cosmética', () => {
    expect([0, 1, 2, 3].map(waxcapCount)).toEqual([0, 3, 6, 9]);
  });

  it('el cordón negro engorda y se oscurece con cada rango, y su filo crema lo rodea por fuera', () => {
    [2.3, 2.6, 2.9].forEach((width, i) => {
      expect(cordCoreWidth(2, i + 1)).toBeCloseTo(width, 12);
    });
    expect([1, 2, 3].map(cordCoreTone)).toEqual([...CORD_CORE_TONES]);
    const luminance = (hex: string): number =>
      [1, 3, 5].reduce((sum, i) => sum + Number.parseInt(hex.slice(i, i + 2), 16), 0);
    expect(luminance(cordCoreTone(2))).toBeLessThan(luminance(cordCoreTone(1)));
    expect(luminance(cordCoreTone(3))).toBeLessThan(luminance(cordCoreTone(2)));

    const strokes: { style: unknown; alpha: unknown; width: number }[] = [];
    const props: Record<string, unknown> = {};
    const ctx = new Proxy(props, {
      get(target, key) {
        if (typeof key !== 'string') return undefined;
        if (key in target) return target[key];
        return (): void => {
          if (key === 'stroke') {
            strokes.push({
              style: target.strokeStyle,
              alpha: target.globalAlpha,
              width: Number(target.lineWidth),
            });
          }
        };
      },
      set(target, key, value: unknown) {
        if (typeof key === 'string') target[key] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    strokeCordRim(ctx, 0, 0, 10, 10, 2, 3, 2);
    strokeCordCore(ctx, 0, 0, 10, 10, 2, 3);
    // Filo: el núcleo (2,9 px) más 0,75 px CSS a cada lado con dpr 2. Núcleo opaco: volver a
    // trazarlo sobre un filo deja el mismo color.
    expect(strokes.map(({ style, alpha }) => [style, alpha])).toEqual([
      [CORD_RIM_TONE, CORD_RIM_ALPHA],
      ['#0B0806', 1],
    ]);
    expect(strokes[0]?.width).toBeCloseTo(2.9 + 2 * CORD_RIM_CSS * 2, 12);
    expect(strokes[1]?.width).toBeCloseTo(2.9, 12);
  });
});

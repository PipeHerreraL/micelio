// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measure } from '../src/partners/plasmodium/metrics.ts';
import { createPlasmodium, type PlasmodiumState } from '../src/partners/plasmodium/state.ts';
import { computeLayout } from '../src/partners/plasmodium/view/plate-layout.ts';
import { createPlateRender, type PlateRender } from '../src/partners/plasmodium/view/plate-render.ts';

/**
 * Lienzo de la placa del plasmodio sin navegador (spec de la fase 9, §13). happy-dom no tiene
 * contexto 2D: sin él todo debe ser inerte. Con un contexto falso que cuenta llamadas se comprueba
 * cuándo se dibuja: reducir movimiento, el tope de ritmo de la red, la ola del pulso y los
 * esporangios. La imagen en sí se mira en el navegador (tests/e2e).
 */

/** Colores del lienzo que identifican una capa en las llamadas (plate-render.ts). */
const WAVE = '#fff4d2';
const SPORE_HEAD = '#b9b2a6';

interface FakeContext {
  calls: Record<string, number>;
  /** fillStyle de cada `fill()`, en orden. */
  fills: unknown[];
  ctx: object;
}

const contexts: FakeContext[] = [];

function fakeContext(): FakeContext {
  const calls: Record<string, number> = {};
  const fills: unknown[] = [];
  const props: Record<string, unknown> = {};
  const gradient = { addColorStop: (): void => undefined };
  const ctx = new Proxy(props, {
    get(target, key) {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key];
      return (): unknown => {
        calls[key] = (calls[key] ?? 0) + 1;
        if (key === 'fill') fills.push(target.fillStyle);
        return key === 'createRadialGradient' ? gradient : undefined;
      };
    },
    set(target, key, value: unknown) {
      if (typeof key === 'string') target[key] = value;
      return true;
    },
  });
  return { calls, fills, ctx };
}

/** Cada lienzo recibe su contexto falso: [0] el visible, [1] el fondo y [2] la red. */
function useFakeContexts(): void {
  const fake = (): object => {
    const c = fakeContext();
    contexts.push(c);
    return c.ctx;
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    fake as unknown as HTMLCanvasElement['getContext'],
  );
}

function count(c: FakeContext | undefined, method: string): number {
  return c?.calls[method] ?? 0;
}

function fillsOf(c: FakeContext | undefined, color: string): number {
  return c ? c.fills.filter((f) => f === color).length : 0;
}

interface Setup {
  canvas: HTMLCanvasElement;
  render: PlateRender;
  p: PlasmodiumState;
  main: FakeContext | undefined;
  bg: FakeContext | undefined;
  net: FakeContext | undefined;
}

/** Tronco caído en el panel de escritorio, con lienzo visible y contextos falsos. */
function setup(reduced: boolean, visible = true): Setup {
  useFakeContexts();
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const layout = computeLayout(0, 468, 600);
  const size = visible ? layout : { width: 0, height: 0 };
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    width: size.width,
    height: size.height,
  } as DOMRect);
  const render = createPlateRender(canvas);
  render.setReducedMotion(reduced);
  render.setLayout(layout);
  const p = createPlasmodium(7);
  render.sync(p, measure(p));
  const [main, bg, net] = contexts;
  return { canvas, render, p, main, bg, net };
}

afterEach(() => {
  vi.restoreAllMocks();
  contexts.length = 0;
  document.body.replaceChildren();
});

describe('lienzo de la placa sin contexto 2D', () => {
  it('crear, sincronizar, recibir eventos, dibujar, cambiar de tamaño y destruir no lanza', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const render = createPlateRender(canvas);
    const p = createPlasmodium(3);
    p.plates[0]?.foods.push(0, 19);
    const run = (): void => {
      render.setLayout(computeLayout(0, 468, 600));
      render.resize();
      render.sync(p, measure(p));
      render.onEvent({ type: 'plasmodium', kind: 'pulse' });
      render.onEvent({ type: 'plasmodium', kind: 'fruited', plate: 0 });
      render.onEvent({ type: 'plasmodium', kind: 'plateOpened', plate: 0, auto: false });
      render.setSuggestion(4);
      render.setHover(5, 'lamp');
      render.setReducedMotion(true);
      render.frame(0);
      render.frame(16);
      render.setLayout(computeLayout(0, 300, 600));
      render.frame(32);
    };
    expect(run).not.toThrow();
    expect(() => {
      render.destroy();
      run();
      render.destroy();
    }).not.toThrow();
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('lienzo de la placa con contexto', () => {
  it('con un lienzo de 0 px no dibuja nada', () => {
    const { render, main, canvas } = setup(false, false);
    render.frame(0);
    render.frame(16);
    expect(canvas.width).toBe(0);
    expect(count(main, 'drawImage')).toBe(0);
  });

  it('el lienzo toma el tamaño de la disposición con la densidad de píxeles', () => {
    const { canvas } = setup(true);
    // Tronco apaisado en 468 px: celda de 93,6 px, 5 × 4 celdas; devicePixelRatio 1 en happy-dom.
    expect(canvas.style.width).toBe('468px');
    expect(canvas.width).toBe(468);
    expect(canvas.height).toBe(374);
  });

  it('con reducir movimiento, un frame sin cambios no vuelve a dibujar', () => {
    const { render, main } = setup(true);
    render.frame(0);
    expect(count(main, 'drawImage')).toBe(2);
    render.frame(16);
    render.frame(32);
    expect(count(main, 'drawImage')).toBe(2);
    render.setSuggestion(3);
    render.frame(48);
    expect(count(main, 'drawImage')).toBe(4);
    render.setSuggestion(3);
    render.frame(64);
    expect(count(main, 'drawImage')).toBe(4);
    render.setHover(5, 'food');
    render.frame(80);
    expect(count(main, 'drawImage')).toBe(6);
  });

  it('en movimiento normal el vaivén redibuja cada frame mientras haya tubos vivos', () => {
    const { render, main } = setup(false);
    render.frame(0);
    render.frame(16);
    render.frame(32);
    expect(count(main, 'drawImage')).toBe(6);
  });

  it('la red se rehace al cambiar el paso del modelo, como mucho cada 250 ms', () => {
    const { render, p, net } = setup(true);
    render.frame(0);
    expect(count(net, 'clearRect')).toBe(1);
    p.step += 1;
    p.conductivity[0] = 0.5;
    render.sync(p, measure(p));
    render.frame(100);
    expect(count(net, 'clearRect')).toBe(1);
    render.frame(300);
    expect(count(net, 'clearRect')).toBe(2);
    render.sync(p, measure(p));
    render.frame(700);
    expect(count(net, 'clearRect')).toBe(2);
  });

  it('colocar un copo rehace el fondo y la red al instante, sin esperar al tope de ritmo', () => {
    const { render, p, bg, net } = setup(true);
    render.frame(0);
    p.plates[0]?.foods.push(3);
    render.sync(p, measure(p));
    render.frame(50);
    expect(count(bg, 'clearRect')).toBe(2);
    expect(count(net, 'clearRect')).toBe(2);
  });

  it('la ola del pulso dura 1,2 s y sale como mucho una vez cada 3 s', () => {
    const { render, p, main } = setup(false);
    p.plates[0]?.foods.push(0, 19);
    render.sync(p, measure(p));
    render.onEvent({ type: 'plasmodium', kind: 'pulse' });
    render.frame(0);
    render.frame(600);
    expect(fillsOf(main, WAVE)).toBe(2);
    render.frame(1300);
    expect(fillsOf(main, WAVE)).toBe(2);
    // Otro pulso a los 2 s: dentro de los 3 s del anterior, no hay ola.
    render.onEvent({ type: 'plasmodium', kind: 'pulse' });
    render.frame(2000);
    render.frame(2100);
    expect(fillsOf(main, WAVE)).toBe(2);
    render.onEvent({ type: 'plasmodium', kind: 'pulse' });
    render.frame(3100);
    expect(fillsOf(main, WAVE)).toBe(3);
  });

  it('con reducir movimiento el pulso no dibuja ola', () => {
    const { render, p, main } = setup(true);
    p.plates[0]?.foods.push(0, 19);
    render.sync(p, measure(p));
    render.onEvent({ type: 'plasmodium', kind: 'pulse' });
    render.frame(0);
    render.frame(600);
    expect(fillsOf(main, WAVE)).toBe(0);
  });

  it('al cartografiar la placa los esporangios crecen en 2 s; con reducir movimiento, al instante', () => {
    const map = { score: 1.4, quality: 0.7, cost: 1.2, tolerance: 0.4, alive: 9, joined: 2 };
    for (const reduced of [false, true]) {
      const { render, p, main } = setup(reduced);
      p.plates[0]?.foods.push(0, 19);
      render.sync(p, measure(p));
      render.frame(0);
      const record = p.plates[0];
      if (record) record.map = map;
      render.sync(p, measure(p));
      render.onEvent({ type: 'plasmodium', kind: 'fruited', plate: 0 });
      render.frame(100);
      expect(fillsOf(main, SPORE_HEAD) > 0).toBe(reduced);
      render.frame(1100);
      render.frame(2200);
      expect(fillsOf(main, SPORE_HEAD)).toBeGreaterThan(0);
      render.destroy();
      vi.restoreAllMocks();
      contexts.length = 0;
    }
  });
});

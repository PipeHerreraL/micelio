import { beforeEach, describe, expect, it } from 'vitest';
import { drain } from '../src/core/events.ts';
import { derived, invalidate } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import {
  applyBackground,
  applyOffline,
  offlineCapSeconds,
  offlineEfficiency,
} from '../src/systems/offline.ts';

const HOUR_MS = 3600 * 1000;

/**
 * Partida con 10 Rizomorfos y nada más: 10 unidades × 1 N/s, sin hitos (10 < 25), sin
 * mejoras, sin logros ni esporas, así que el multiplicador global es 1 y P = 10 N/s.
 */
function stateWithTenNps(): GameState {
  const state = createState(42, 0);
  state.owned.rhizomorph = 10;
  invalidate(state);
  return state;
}

function withWinterSleep(state: GameState): GameState {
  state.mutations.push('winterSleep');
  invalidate(state);
  return state;
}

beforeEach(() => {
  // La cola de eventos es de módulo: se vacía para que cada prueba vea solo los suyos.
  drain();
});

describe('eficiencia y límite del progreso offline', () => {
  it('sin Sueño invernal la eficiencia es del 50 % y el límite de 8 horas', () => {
    const state = createState(1, 0);
    expect(offlineEfficiency(state)).toBeCloseTo(0.5, 10);
    // 8 h × 3600 s = 28 800 s
    expect(offlineCapSeconds(state)).toBe(28800);
  });

  it('con Sueño invernal la eficiencia es del 100 % y el límite de 24 horas', () => {
    const state = withWinterSleep(createState(1, 0));
    expect(offlineEfficiency(state)).toBeCloseTo(1, 10);
    // 24 h × 3600 s = 86 400 s
    expect(offlineCapSeconds(state)).toBe(86400);
  });

  it('una hora offline sin mutaciones cobra la mitad de la producción', () => {
    const state = stateWithTenNps();
    const report = applyOffline(state, 0, HOUR_MS);
    // 10 N/s × 3600 s × 0.5 = 18 000
    expect(report.elapsed).toBeCloseTo(3600, 10);
    expect(report.effective).toBeCloseTo(3600, 10);
    expect(report.efficiency).toBeCloseTo(0.5, 10);
    expect(report.gained).toBeCloseTo(18000, 6);
    expect(report.capped).toBe(false);
    expect(state.nutrients).toBeCloseTo(18000, 6);
    expect(state.runEarned).toBeCloseTo(18000, 6);
    expect(state.lifetimeEarned).toBeCloseTo(18000, 6);
  });

  it('una hora offline con Sueño invernal cobra la producción completa', () => {
    const state = withWinterSleep(stateWithTenNps());
    const report = applyOffline(state, 0, HOUR_MS);
    // 10 N/s × 3600 s × 1 = 36 000
    expect(report.efficiency).toBeCloseTo(1, 10);
    expect(report.gained).toBeCloseTo(36000, 6);
    expect(state.nutrients).toBeCloseTo(36000, 6);
  });

  it('más de 8 horas offline se recortan a 8 y el informe lo marca como recortado', () => {
    const state = stateWithTenNps();
    const report = applyOffline(state, 0, 10 * HOUR_MS);
    // Hueco real: 10 h = 36 000 s; efectivo: 28 800 s
    // 10 N/s × 28 800 s × 0.5 = 144 000
    expect(report.elapsed).toBeCloseTo(36000, 10);
    expect(report.effective).toBeCloseTo(28800, 10);
    expect(report.gained).toBeCloseTo(144000, 6);
    expect(report.capped).toBe(true);
    expect(state.nutrients).toBeCloseTo(144000, 6);
  });

  it('exactamente 8 horas offline no cuentan como recortadas', () => {
    const state = stateWithTenNps();
    const report = applyOffline(state, 0, 8 * HOUR_MS);
    // 10 N/s × 28 800 s × 0.5 = 144 000
    expect(report.effective).toBeCloseTo(28800, 10);
    expect(report.gained).toBeCloseTo(144000, 6);
    expect(report.capped).toBe(false);
  });

  it('con Sueño invernal más de 24 horas se recortan a 24', () => {
    const state = withWinterSleep(stateWithTenNps());
    const report = applyOffline(state, 0, 30 * HOUR_MS);
    // Hueco real: 30 h = 108 000 s; efectivo: 86 400 s
    // 10 N/s × 86 400 s × 1 = 864 000
    expect(report.elapsed).toBeCloseTo(108000, 10);
    expect(report.effective).toBeCloseTo(86400, 10);
    expect(report.gained).toBeCloseTo(864000, 6);
    expect(report.capped).toBe(true);
  });

  it('con Sueño invernal 20 horas offline se cobran enteras, sin recorte', () => {
    const state = withWinterSleep(stateWithTenNps());
    const report = applyOffline(state, 0, 20 * HOUR_MS);
    // 20 h = 72 000 s < 86 400 s; 10 N/s × 72 000 s × 1 = 720 000
    expect(report.effective).toBeCloseTo(72000, 10);
    expect(report.gained).toBeCloseTo(720000, 6);
    expect(report.capped).toBe(false);
  });
});

describe('reloj que retrocede', () => {
  it('si ahora es anterior al guardado no se gana nada y el hueco es cero', () => {
    const state = stateWithTenNps();
    // El reloj del sistema retrocedió una hora respecto al guardado.
    const report = applyOffline(state, 5 * HOUR_MS, 4 * HOUR_MS);
    expect(report.elapsed).toBe(0);
    expect(report.effective).toBe(0);
    expect(report.gained).toBe(0);
    expect(report.capped).toBe(false);
    expect(state.nutrients).toBe(0);
    expect(state.lifetimeEarned).toBe(0);
  });

  it('un reloj que retrocede no otorga Sin prisa aunque el salto sea de horas', () => {
    const state = stateWithTenNps();
    applyOffline(state, 20 * HOUR_MS, 0);
    expect(state.achievements).not.toContain('secret.noRush');
  });
});

describe('segundo plano frente a offline', () => {
  it('volver de segundo plano cobra al 100 % y cuenta como tiempo jugado', () => {
    const state = stateWithTenNps();
    const gained = applyBackground(state, 100);
    // 10 N/s × 100 s × 1 = 1000
    expect(gained).toBeCloseTo(1000, 6);
    expect(state.nutrients).toBeCloseTo(1000, 6);
    expect(state.stats.runTime).toBeCloseTo(100, 10);
    expect(state.stats.totalTime).toBeCloseTo(100, 10);
  });

  it('el progreso offline no cuenta como tiempo jugado', () => {
    const state = stateWithTenNps();
    applyOffline(state, 0, 100 * 1000);
    // 10 N/s × 100 s × 0.5 = 500, pero el reloj de juego no se mueve
    expect(state.nutrients).toBeCloseTo(500, 6);
    expect(state.stats.runTime).toBe(0);
    expect(state.stats.totalTime).toBe(0);
  });

  it('el segundo plano usa el mismo límite de 8 horas que offline', () => {
    const state = stateWithTenNps();
    const gained = applyBackground(state, 10 * 3600);
    // Recorte a 28 800 s; 10 N/s × 28 800 s × 1 = 288 000
    expect(gained).toBeCloseTo(288000, 6);
    expect(state.stats.runTime).toBeCloseTo(28800, 10);
  });

  it('un intervalo negativo en segundo plano no gana nada ni suma tiempo', () => {
    const state = stateWithTenNps();
    const gained = applyBackground(state, -50);
    expect(gained).toBe(0);
    expect(state.nutrients).toBe(0);
    expect(state.stats.runTime).toBe(0);
  });
});

describe('Aguacero repartido en tramos', () => {
  function withDownpour(state: GameState, remaining: number): GameState {
    state.effects.push({ kind: 'downpour', remaining, duration: 60 });
    invalidate(state);
    return state;
  }

  it('al 100 % se cobra ×5 solo mientras dura el Aguacero y ×1 el resto', () => {
    const state = withDownpour(stateWithTenNps(), 30);
    // Comprobación previa: con el Aguacero activo P = 10 × 5 = 50 N/s
    expect(derived(state).production).toBeCloseTo(50, 10);
    const gained = applyBackground(state, 100);
    // 10 × 5 × 30 + 10 × 70 = 1500 + 700 = 2200
    expect(gained).toBeCloseTo(2200, 6);
    expect(state.nutrients).toBeCloseTo(2200, 6);
  });

  it('offline con Sueño invernal reparte el Aguacero igual que en segundo plano', () => {
    const state = withDownpour(withWinterSleep(stateWithTenNps()), 30);
    const report = applyOffline(state, 0, 100 * 1000);
    // 10 × 5 × 30 + 10 × 70 = 2200, por eficiencia 1
    expect(report.gained).toBeCloseTo(2200, 6);
  });

  it('offline base aplica la eficiencia del 50 % a los dos tramos', () => {
    const state = withDownpour(stateWithTenNps(), 30);
    const report = applyOffline(state, 0, 100 * 1000);
    // (10 × 5 × 30 + 10 × 70) × 0.5 = 2200 × 0.5 = 1100
    expect(report.gained).toBeCloseTo(1100, 6);
  });

  it('el Aguacero que dura más que el hueco cobra todo a ×5 y conserva lo que le queda', () => {
    const state = withDownpour(stateWithTenNps(), 60);
    const gained = applyBackground(state, 20);
    // 10 × 5 × 20 = 1000; quedan 60 − 20 = 40 s
    expect(gained).toBeCloseTo(1000, 6);
    expect(state.effects).toHaveLength(1);
    expect(state.effects[0]?.remaining).toBeCloseTo(40, 10);
  });

  it('un Aguacero agotado durante el hueco se retira y deja de multiplicar', () => {
    const state = withDownpour(stateWithTenNps(), 30);
    applyBackground(state, 100);
    // 30 − 100 = −70 s: el efecto ya no está y E vuelve a 1
    expect(state.effects).toHaveLength(0);
    expect(derived(state).eventMultiplier).toBe(1);
  });

  it('la Tormenta también descuenta el hueco aunque no toque la producción', () => {
    const state = stateWithTenNps();
    state.effects.push({ kind: 'storm', remaining: 12, duration: 12 });
    invalidate(state);
    const gained = applyBackground(state, 5);
    // La Tormenta multiplica el clic, no la producción: 10 × 5 = 50; quedan 12 − 5 = 7 s
    expect(gained).toBeCloseTo(50, 6);
    expect(state.effects[0]?.remaining).toBeCloseTo(7, 10);
  });
});

describe('lluvia durante el tiempo aplicado', () => {
  it('la gota visible se evapora sin efecto y se sortea una espera nueva', () => {
    const state = stateWithTenNps();
    state.rain.drop = { x: 0.5, y: 0.5, remaining: 8 };
    state.rain.nextIn = 0;
    applyOffline(state, 0, HOUR_MS);
    expect(state.rain.drop).toBeNull();
    // La espera nueva cae en el intervalo [120, 300) s de PROMPT.md §9
    expect(state.rain.nextIn).toBeGreaterThanOrEqual(120);
    expect(state.rain.nextIn).toBeLessThan(300);
    // Evaporarse no es atraparla
    expect(state.stats.drops).toBe(0);
    expect(state.effects).toHaveLength(0);
  });

  it('la cuenta atrás de la lluvia no avanza offline ni hace caer gotas', () => {
    const state = stateWithTenNps();
    state.rain.nextIn = 150;
    applyOffline(state, 0, HOUR_MS);
    // Una hora (3600 s) habría agotado de sobra los 150 s si la lluvia avanzara
    expect(state.rain.nextIn).toBeCloseTo(150, 10);
    expect(state.rain.drop).toBeNull();
    expect(drain().some((e) => e.type === 'rainSpawn')).toBe(false);
  });

  it('la cuenta atrás de la lluvia tampoco avanza al volver de segundo plano', () => {
    const state = stateWithTenNps();
    state.rain.nextIn = 150;
    applyBackground(state, 600);
    expect(state.rain.nextIn).toBeCloseTo(150, 10);
    expect(state.rain.drop).toBeNull();
  });
});

describe('logro Sin prisa', () => {
  it('se otorga al volver tras exactamente 8 horas', () => {
    const state = createState(7, 0);
    applyOffline(state, 0, 8 * HOUR_MS);
    expect(state.achievements).toContain('secret.noRush');
    expect(drain()).toContainEqual({ type: 'achievement', id: 'secret.noRush' });
  });

  it('se otorga por el hueco real aunque supere el límite y se recorte', () => {
    const state = createState(7, 0);
    const report = applyOffline(state, 0, 30 * HOUR_MS);
    expect(report.capped).toBe(true);
    expect(state.achievements).toContain('secret.noRush');
  });

  it('no se otorga un segundo antes de las 8 horas', () => {
    const state = createState(7, 0);
    // 8 h − 1 s = 28 799 s
    applyOffline(state, 0, 8 * HOUR_MS - 1000);
    expect(state.achievements).not.toContain('secret.noRush');
  });

  it('no se otorga dos veces si se vuelve a estar fuera 8 horas', () => {
    const state = createState(7, 0);
    applyOffline(state, 0, 8 * HOUR_MS);
    applyOffline(state, 8 * HOUR_MS, 16 * HOUR_MS);
    expect(state.achievements.filter((id) => id === 'secret.noRush')).toHaveLength(1);
  });
});

describe('autocompra al volver', () => {
  it('la autocompra corre una sola vez y después de cobrar lo ganado', () => {
    const state = stateWithTenNps();
    state.mutations.push('instinct');
    state.autobuy.generators.hypha = true;
    state.autobuy.threshold = 1;
    invalidate(state);
    applyOffline(state, 0, HOUR_MS);
    // Se empezó con 0 nutrientes: si comprara antes de cobrar no alcanzaría para nada.
    // Cobro: 10 × 3600 × 0.5 = 18 000; una Hifa cuesta 10 (C0 = 10, n = 0).
    // Si corriera una vez por segundo compraría muchas más; corre una sola vez: 1 Hifa.
    expect(state.owned.hypha).toBe(1);
    // 18 000 − 10 = 17 990
    expect(state.nutrients).toBeCloseTo(17990, 6);
    const buys = drain().filter((e) => e.type === 'buyGenerator');
    expect(buys).toEqual([{ type: 'buyGenerator', id: 'hypha', count: 1 }]);
  });

  it('sin la mutación Instinto los interruptores de autocompra no compran nada', () => {
    const state = stateWithTenNps();
    state.autobuy.generators.hypha = true;
    state.autobuy.threshold = 1;
    applyOffline(state, 0, HOUR_MS);
    expect(state.owned.hypha).toBe(0);
    expect(state.nutrients).toBeCloseTo(18000, 6);
  });
});

// BUG-JOURNAL #3: «Sin prisa» solo se daba al cargar una partida, no al volver a una pestaña
// que había pasado la noche en segundo plano.
describe('«Sin prisa» al volver de segundo plano', () => {
  it('volver tras 10 horas en segundo plano otorga «Sin prisa»', () => {
    const state = createState(5, Date.UTC(2026, 9, 1));
    applyBackground(state, 10 * 3600);
    expect(state.achievements).toContain('secret.noRush');
  });

  it('una hora en segundo plano o un reloj que retrocede no lo otorgan', () => {
    const state = createState(5, Date.UTC(2026, 9, 1));
    applyBackground(state, 3600);
    applyBackground(state, -50);
    expect(state.achievements).not.toContain('secret.noRush');
  });
});

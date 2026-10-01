import { describe, expect, it } from 'vitest';
import {
  bulkCost,
  clickValue,
  globalMultiplier,
  sporeFactor,
  adaptationCost,
  maxAffordable,
  milestonesReached,
  nextMilestone,
  nutrientsForSpores,
  previousMilestone,
  sporesFor,
  unitCost,
} from '../src/core/formulas.ts';

/**
 * Coste de k unidades sumado una a una con la definición C(n) = C0 (1 − d) 1.15^n, sin
 * pasar por la forma cerrada de bulkCost: así las comprobaciones de maxAffordable no
 * dependen de la misma fórmula que se prueba.
 */
function costOneByOne(baseCost: number, owned: number, count: number, discount: number): number {
  let total = 0;
  for (let i = 0; i < count; i += 1) total += baseCost * (1 - discount) * 1.15 ** (owned + i);
  return total;
}

/** Fondos repartidos en escala geométrica (1, 1.37, 1.37², …) para recorrer muchos tamaños. */
const FUNDS_GRID: readonly number[] = Array.from({ length: 70 }, (_, i) => 1.37 ** i);

describe('unitCost: coste de la siguiente unidad', () => {
  it('la primera Hifa cuesta su coste base', () => {
    expect(unitCost(10, 0, 0)).toBeCloseTo(10, 10);
  });

  it('cada unidad poseída encarece la siguiente un 15 %', () => {
    // 10 · 1.15 = 11.5
    expect(unitCost(10, 1, 0)).toBeCloseTo(11.5, 10);
    // 10 · 1.15² = 10 · 1.3225 = 13.225
    expect(unitCost(10, 2, 0)).toBeCloseTo(13.225, 10);
    // 1.15⁵ = 2.0113571875; 1.15¹⁰ = 2.0113571875² = 4.04555773570791 → ·10
    expect(unitCost(10, 10, 0)).toBeCloseTo(40.4555773570791, 8);
  });

  it('el descuento d = 0.1 abarata un 10 % el coste', () => {
    // 10 · 0.9 = 9
    expect(unitCost(10, 0, 0.1)).toBeCloseTo(9, 10);
    // 10 · 0.9 · 1.15³ = 9 · 1.520875 = 13.687875
    expect(unitCost(10, 3, 0.1)).toBeCloseTo(13.687875, 10);
    // 120 · 0.9 · 1.3225 = 108 · 1.3225 = 142.83
    expect(unitCost(120, 2, 0.1)).toBeCloseTo(142.83, 10);
  });

  it('acepta otra tasa de crecimiento', () => {
    // 100 · 2³ = 800
    expect(unitCost(100, 3, 0, 2)).toBeCloseTo(800, 10);
  });
});

describe('bulkCost: coste de un lote', () => {
  it('comprar cero unidades o una cantidad negativa no cuesta nada', () => {
    expect(bulkCost(10, 0, 0, 0)).toBe(0);
    expect(bulkCost(10, 5, -3, 0.1)).toBe(0);
  });

  it('un lote de una unidad cuesta lo mismo que esa unidad', () => {
    // 120 · 1.15⁵ = 120 · 2.0113571875 = 241.3628625
    expect(bulkCost(120, 5, 1, 0)).toBeCloseTo(241.3628625, 8);
  });

  it('un lote cuesta la suma de sus unidades una a una', () => {
    // 10 + 11.5 + 13.225 = 34.725
    expect(bulkCost(10, 0, 3, 0)).toBeCloseTo(34.725, 10);
    // 0.9 · (10 · 1.15² + 10 · 1.15³) = 0.9 · (13.225 + 15.20875) = 0.9 · 28.43375 = 25.590375
    expect(bulkCost(10, 2, 2, 0.1)).toBeCloseTo(25.590375, 10);
  });

  it('diez Hifas desde cero cuestan unos 203.04 N', () => {
    // 10 · (1.15¹⁰ − 1) / 0.15 = 10 · 3.04555773570791 / 0.15 = 203.037182380527
    expect(bulkCost(10, 0, 10, 0)).toBeCloseTo(203.0372, 4);
  });

  it('con el descuento de Quitina ligera el lote de diez Hifas cuesta el 90 %', () => {
    // 0.9 · 203.037182380527 = 182.733464142474
    expect(bulkCost(10, 0, 10, 0.1)).toBeCloseTo(182.7335, 4);
  });

  it('acepta otra tasa de crecimiento', () => {
    // 1 + 2 + 4 = 7
    expect(bulkCost(1, 0, 3, 0, 2)).toBeCloseTo(7, 10);
  });
});

describe('maxAffordable: máximo comprable', () => {
  it('no compra nada si los nutrientes no alcanzan para la primera unidad', () => {
    expect(maxAffordable(10, 0, 0, 0)).toBe(0);
    // La primera Hifa cuesta 10
    expect(maxAffordable(10, 0, 0, 9.99)).toBe(0);
    // Con d = 0.1 la primera cuesta 9
    expect(maxAffordable(10, 0, 0.1, 8.99)).toBe(0);
  });

  it('con justo el coste de una unidad se compra exactamente una', () => {
    expect(maxAffordable(10, 0, 0, 10)).toBe(1);
    // 10 · 0.9 = 9
    expect(maxAffordable(10, 0, 0.1, 9)).toBe(1);
  });

  it('en la frontera exacta del lote de dos se compran las dos', () => {
    // 10 + 11.5 = 21.5
    expect(maxAffordable(10, 0, 0, 21.5)).toBe(2);
    expect(maxAffordable(10, 0, 0, 21.49)).toBe(1);
    // 9 + 10.35 = 19.35
    expect(maxAffordable(10, 0, 0.1, 19.35)).toBe(2);
    expect(maxAffordable(10, 0, 0.1, 19.34)).toBe(1);
  });

  it('con los nutrientes justos para un lote se compra exactamente ese lote', () => {
    // La frontera la fija el mismo coste que cobra la compra, sea cual sea su redondeo
    for (const [baseCost, owned, discount] of [
      [10, 0, 0],
      [10, 0, 0.1],
      [120, 7, 0],
      [1300, 20, 0.1],
    ] as const) {
      for (let k = 1; k <= 30; k += 1) {
        expect(maxAffordable(baseCost, owned, discount, bulkCost(baseCost, owned, k, discount))).toBe(k);
      }
    }
  });

  // En el borde exacto se compara contra la forma cerrada C(n, k), que es lo que se cobra
  // (PROMPT.md §7); 34.725 no tiene double exacto, así que se prueba a ambos lados.
  it('el máximo de Hifas pasa de dos a tres al cruzar el coste de tres (34.725)', () => {
    // 10 + 11.5 + 13.225 = 34.725; la cuarta costaría 15.20875 más (49.93375 en total)
    expect(maxAffordable(10, 0, 0, 34.72)).toBe(2);
    expect(maxAffordable(10, 0, 0, 34.73)).toBe(3);
    expect(maxAffordable(10, 0, 0, 49.93)).toBe(3);
  });

  it('alrededor del lote de diez Hifas el máximo pasa de nueve a diez', () => {
    // Nueve: 10 · (1.15⁹ − 1) / 0.15 ≈ 167.86; diez ≈ 203.0372; once ≈ 243.49
    expect(maxAffordable(10, 0, 0, 203.03)).toBe(9);
    expect(maxAffordable(10, 0, 0, 203.04)).toBe(10);
    // Con d = 0.1, diez cuestan 0.9 · 203.0372 ≈ 182.7335
    expect(maxAffordable(10, 0, 0.1, 182.73)).toBe(9);
    expect(maxAffordable(10, 0, 0.1, 182.74)).toBe(10);
  });

  it('con 1e12 N se compran 167 Hifas desde cero', () => {
    // ⌊log_1.15(1e12 · 0.15 / 10 + 1)⌋ = ⌊ln(1.5e10) / ln(1.15)⌋ = ⌊23.4313 / 0.139762⌋
    // = ⌊167.65⌋ = 167
    expect(maxAffordable(10, 0, 0, 1e12)).toBe(167);
  });

  it('funciona igual con muchas unidades poseídas', () => {
    // Con 100 Hifas la siguiente cuesta c = 10 · 1.15¹⁰⁰ ≈ 1.1743e7. Dos cuestan 2.15 c y
    // tres 3.4725 c, así que con 2.5 c se compran dos.
    expect(maxAffordable(10, 100, 0, 2.5 * 1.1743e7)).toBe(2);
  });

  it('el máximo comprable nunca supera los nutrientes', () => {
    for (const [baseCost, owned, discount] of [
      [10, 0, 0],
      [10, 0, 0.1],
      [120, 7, 0],
      [1300, 20, 0.1],
    ] as const) {
      for (const funds of FUNDS_GRID) {
        const k = maxAffordable(baseCost, owned, discount, funds);
        expect(costOneByOne(baseCost, owned, k, discount)).toBeLessThanOrEqual(funds);
      }
    }
  });

  it('el máximo comprable es máximo: una unidad más ya no alcanza', () => {
    for (const [baseCost, owned, discount] of [
      [10, 0, 0],
      [10, 0, 0.1],
      [120, 7, 0],
      [1300, 20, 0.1],
    ] as const) {
      for (const funds of FUNDS_GRID) {
        const k = maxAffordable(baseCost, owned, discount, funds);
        expect(costOneByOne(baseCost, owned, k + 1, discount)).toBeGreaterThan(funds);
      }
    }
  });
});

describe('hitos de generador', () => {
  it('cuenta los hitos alcanzados justo antes, en y después de los umbrales', () => {
    expect(milestonesReached(0)).toBe(0);
    expect(milestonesReached(24)).toBe(0);
    expect(milestonesReached(25)).toBe(1);
    // 25 y 50
    expect(milestonesReached(50)).toBe(2);
    // Los nueve: 25, 50, 100, 150, 200, 250, 300, 350 y 400
    expect(milestonesReached(400)).toBe(9);
    expect(milestonesReached(401)).toBe(9);
  });

  it('el siguiente hito es el primer umbral aún no alcanzado, o ninguno al final', () => {
    expect(nextMilestone(0)).toBe(25);
    expect(nextMilestone(24)).toBe(25);
    expect(nextMilestone(25)).toBe(50);
    expect(nextMilestone(399)).toBe(400);
    expect(nextMilestone(400)).toBeNull();
    expect(nextMilestone(401)).toBeNull();
  });

  it('el hito anterior es el último umbral alcanzado, o 0 si no hay ninguno', () => {
    expect(previousMilestone(0)).toBe(0);
    expect(previousMilestone(24)).toBe(0);
    expect(previousMilestone(25)).toBe(25);
    expect(previousMilestone(49)).toBe(25);
    expect(previousMilestone(400)).toBe(400);
    expect(previousMilestone(401)).toBe(400);
  });

  it('acepta umbrales propios', () => {
    expect(milestonesReached(15, [10, 20])).toBe(1);
    expect(nextMilestone(15, [10, 20])).toBe(20);
    expect(previousMilestone(15, [10, 20])).toBe(10);
  });
});

describe('sporesFor: esporas por nutrientes de vida', () => {
  it('con k = 15, 1e8 de vida dan 15 esporas y 4e8 dan 30', () => {
    // ⌊15 · √1⌋ = 15
    expect(sporesFor(1e8, 15)).toBe(15);
    // ⌊15 · √4⌋ = 30
    expect(sporesFor(4e8, 15)).toBe(30);
    // ⌊15 · √9⌋ = 45
    expect(sporesFor(9e8, 15)).toBe(45);
  });

  it('sin nutrientes de vida no hay esporas', () => {
    expect(sporesFor(0, 15)).toBe(0);
    expect(sporesFor(-5, 15)).toBe(0);
  });

  it('justo por debajo de 1e8 todavía son 14 esporas', () => {
    // 15 · √0.99999999 ≈ 14.99999993 → 14
    expect(sporesFor(99_999_999, 15)).toBe(14);
  });

  it('redondea hacia abajo', () => {
    // 15 · √2.25 = 15 · 1.5 = 22.5 → 22
    expect(sporesFor(2.25e8, 15)).toBe(22);
  });

  it('con Esporas aladas (k = 18.75) 1e8 de vida dan 18 esporas', () => {
    // ⌊18.75 · 1⌋ = 18
    expect(sporesFor(1e8, 18.75)).toBe(18);
    // ⌊18.75 · 2⌋ = 37
    expect(sporesFor(4e8, 18.75)).toBe(37);
  });
});

describe('nutrientsForSpores: inversa de sporesFor', () => {
  it('devuelve los nutrientes de vida calculados a mano', () => {
    // 1e8 · (15 / 15)² = 1e8
    expect(nutrientsForSpores(15, 15)).toBeCloseTo(1e8, 4);
    // 1e8 · 2² = 4e8
    expect(nutrientsForSpores(30, 15)).toBeCloseTo(4e8, 4);
    // 1e8 / 225 = 444 444.444…
    expect(nutrientsForSpores(1, 15)).toBeCloseTo(444_444.4444, 3);
    // 1e8 · (18 / 18.75)² = 1e8 · 0.96² = 1e8 · 0.9216 = 9.216e7
    expect(nutrientsForSpores(18, 18.75)).toBeCloseTo(9.216e7, 4);
    expect(nutrientsForSpores(0, 15)).toBe(0);
  });

  it('aplicar sporesFor a los nutrientes de n esporas devuelve exactamente n', () => {
    for (const k of [15, 18.75]) {
      for (const n of [0, 1, 2, 7, 14, 15, 18, 30, 31, 99, 100, 1000, 12_345]) {
        expect(sporesFor(nutrientsForSpores(n, k), k)).toBe(n);
      }
    }
  });

  it('un poco menos de los nutrientes de n esporas aún da n − 1', () => {
    for (const k of [15, 18.75]) {
      for (const n of [1, 2, 7, 15, 31, 100, 1000]) {
        // Una millonésima menos: √(1 − 1e-6) ≈ 1 − 5e-7, así que queda n − 5e-7 n
        expect(sporesFor(nutrientsForSpores(n, k) * (1 - 1e-6), k)).toBe(n - 1);
      }
    }
  });
});

describe('globalMultiplier: multiplicador global', () => {
  it('sin bonos el multiplicador global es 1', () => {
    expect(globalMultiplier(1, 0, 0.01, [], 1)).toBeCloseTo(1, 10);
  });

  it('el factor de esporas multiplica la producción', () => {
    // Nivel 50 sin madurez: 1 + 0.01 · 50 = 1.5
    expect(globalMultiplier(1.5, 0, 0.01, [], 1)).toBeCloseTo(1.5, 10);
  });

  it('factor de esporas, logros y mejoras globales se multiplican', () => {
    // (1 + 0.1) · (1 + 0.05) · 1.1 · 1.15 = 1.155 · 1.265 = 1.461075
    expect(globalMultiplier(1.1, 5, 0.01, [1.1, 1.15], 1)).toBeCloseTo(1.461075, 10);
  });

  it('el Aguacero multiplica todo por 5', () => {
    // Solo el evento: 1 · 5 = 5
    expect(globalMultiplier(1, 0, 0.01, [], 5)).toBeCloseTo(5, 10);
    // (1 + 0.2) · (1 + 0.02 · 3) · (1.1 · 1.15 · 1.2 · 1.25) · 5
    // = 1.2 · 1.06 · 1.8975 · 5 = 1.272 · 1.8975 · 5 = 2.41362 · 5 = 12.0681
    expect(globalMultiplier(1.2, 3, 0.02, [1.1, 1.15, 1.2, 1.25], 5)).toBeCloseTo(12.0681, 10);
  });
});

describe('sporeFactor: madurez de la red', () => {
  it('hasta el umbral cada nivel de esporas da un 1 %', () => {
    // 1 + 0.01 · 800 = 9
    expect(sporeFactor(800, 1000, 0.5)).toBeCloseTo(9, 10);
    // Justo en el umbral: 1 + 0.01 · 1000 = 11
    expect(sporeFactor(1000, 1000, 0.5)).toBeCloseTo(11, 10);
  });

  it('por encima del umbral cada nivel aporta menos y la curva no salta en el umbral', () => {
    // 1 + 0.01 · 1000 · (4000 / 1000)^0.5 = 1 + 10 · 2 = 21 (lineal daría 41)
    expect(sporeFactor(4000, 1000, 0.5)).toBeCloseTo(21, 10);
    // Un nivel por encima del umbral apenas cambia el factor: continuidad.
    expect(sporeFactor(1001, 1000, 0.5) - sporeFactor(1000, 1000, 0.5)).toBeLessThan(0.01);
  });
});

describe('adaptationCost: coste de cada rango', () => {
  it('el coste crece con el factor del rango y se redondea hacia arriba', () => {
    // 100 · 2^0 = 100; 100 · 2^3 = 800; 150 · 2.5^1 = 375; 150 · 2.5^2 = 937.5 → 938
    expect(adaptationCost(100, 2, 0)).toBe(100);
    expect(adaptationCost(100, 2, 3)).toBe(800);
    expect(adaptationCost(150, 2.5, 1)).toBe(375);
    expect(adaptationCost(150, 2.5, 2)).toBe(938);
  });
});

describe('clickValue: nutrientes por clic', () => {
  it('sin porcentaje de producción el clic vale su multiplicador', () => {
    expect(clickValue(1, 0, 1000)).toBeCloseTo(1, 10);
  });

  it('el clic suma el porcentaje de la producción por segundo', () => {
    // 2 + 0.01 · 1000 = 12
    expect(clickValue(2, 0.01, 1000)).toBeCloseTo(12, 10);
    // 4 + 0.03 · 250 = 11.5
    expect(clickValue(4, 0.03, 250)).toBeCloseTo(11.5, 10);
    // Tormenta eléctrica: 4 · 500 + 0.06 · 1e4 = 2000 + 600 = 2600
    expect(clickValue(2000, 0.06, 1e4)).toBeCloseTo(2600, 10);
  });

  it('sin producción el porcentaje no aporta nada', () => {
    expect(clickValue(2, 0.06, 0)).toBeCloseTo(2, 10);
  });
});

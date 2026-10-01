import { describe, expect, it } from 'vitest';
import * as num from '../src/core/num.ts';

describe('num', () => {
  it('solo acepta como válidos los números finitos y no negativos', () => {
    expect(num.isValid(0)).toBe(true);
    expect(num.isValid(1.5e299)).toBe(true);
    expect(num.isValid(-1)).toBe(false);
    expect(num.isValid(Number.NaN)).toBe(false);
    expect(num.isValid(Number.POSITIVE_INFINITY)).toBe(false);
    expect(num.isValid('12')).toBe(false);
  });

  it('el logaritmo en base 1.15 de 1.15 al cubo es 3', () => {
    expect(num.logBase(1.15 ** 3, 1.15)).toBeCloseTo(3, 10);
  });

  it('parse rechaza lo que no sea una cantidad válida', () => {
    expect(num.parse(42)).toBe(42);
    expect(num.parse(Number.NaN)).toBeNull();
    expect(num.parse(null)).toBeNull();
  });
});

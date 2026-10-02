import { describe, expect, it } from 'vitest';
import { MIN_PANEL_PX, shouldUnpin, type PinInputs } from '../src/ui/pinning.ts';

/** Cuándo la franja de arriba deja de fijarse (ARCHITECTURE.md §4.30). */

/** iPhone 14 con la barra de Safari: 664 px, cabecera con esporas (106) y escenario (173). */
const PHONE: PinInputs = {
  narrow: true,
  fresh: false,
  partners: false,
  typing: false,
  viewport: 664,
  zone: 279,
  bars: 57,
};

describe('franja fija', () => {
  it('en un teléfono en vertical se fija: al panel le quedan 328 px', () => {
    expect(PHONE.viewport - PHONE.zone - PHONE.bars).toBe(328);
    expect(shouldUnpin(PHONE)).toBe(false);
  });

  it('en un móvil en horizontal (740 × 360) no se fija: al panel le quedarían 63 px', () => {
    expect(shouldUnpin({ ...PHONE, viewport: 360, zone: 240 })).toBe(true);
  });

  it('se fija si al panel le quedan justo los px mínimos, y no con uno menos', () => {
    const zone = PHONE.viewport - PHONE.bars - MIN_PANEL_PX;
    expect(shouldUnpin({ ...PHONE, zone })).toBe(false);
    expect(shouldUnpin({ ...PHONE, zone: zone + 1 })).toBe(true);
  });

  it('no se fija en Socios ni con un campo de texto enfocado', () => {
    expect(shouldUnpin({ ...PHONE, partners: true })).toBe(true);
    expect(shouldUnpin({ ...PHONE, typing: true })).toBe(true);
  });

  it('en escritorio y en la partida nueva no cambia nada', () => {
    expect(shouldUnpin({ ...PHONE, narrow: false, partners: true, viewport: 300 })).toBe(false);
    expect(shouldUnpin({ ...PHONE, fresh: true, viewport: 300 })).toBe(false);
  });
});

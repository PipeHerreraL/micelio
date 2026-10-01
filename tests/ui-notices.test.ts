// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { announce, createLiveRegion } from '../src/ui/live.ts';
import { createToastContainer, toast } from '../src/ui/toasts.ts';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('avisos', () => {
  it('un aviso fijo no se desaloja aunque lleguen muchos avisos pasajeros', () => {
    const container = createToastContainer();
    document.body.append(container);
    toast('No se puede guardar', { kind: 'warning', duration: 0 });
    for (let i = 0; i < 6; i += 1) toast(`Logro ${i}`);
    // El fijo sigue y solo quedan los 3 pasajeros más recientes.
    expect(container.textContent).toContain('No se puede guardar');
    expect(container.querySelectorAll('.toast:not(.toast--sticky)')).toHaveLength(3);
  });

  it('un aviso fijo trae un botón para cerrarlo', () => {
    const container = createToastContainer();
    document.body.append(container);
    toast('Otra pestaña', { kind: 'warning', duration: 0 });
    const close = container.querySelector<HTMLButtonElement>('.toast__close');
    expect(close).not.toBeNull();
    close?.click();
    expect(container.querySelectorAll('.toast')).toHaveLength(0);
  });
});

describe('región aria-live', () => {
  it('los avisos que llegan juntos se leen todos, no solo el último', () => {
    vi.useFakeTimers();
    const region = createLiveRegion('Avisos');
    document.body.append(region);
    announce('Logro: Primer filamento');
    announce('Logro: Maraña');
    announce('Logro: Cabellera de la tierra');
    vi.advanceTimersByTime(60);
    expect(region.textContent).toBe('Logro: Primer filamento Logro: Maraña Logro: Cabellera de la tierra');
  });
});

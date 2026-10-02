// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

/**
 * Integración del socio con el juego (fase 9, revisión): lo que pasa alrededor de su código, que
 * llega aparte. Que un error suyo no pare el bucle, que tras un fallo el panel no se rehaga en
 * cada refresco, que los textos sigan al idioma aunque lleguen tarde, que los avisos de objetivo
 * no se lean caducados y que la cabecera publique su altura para la placa.
 *
 * Cada prueba carga los módulos de nuevo (vi.resetModules): el estado de carga de los socios, sus
 * catálogos y sus modelos registrados viven en el módulo y no deben pasar de una prueba a otra.
 */

type Where = 'create' | 'update' | 'frame' | 'onEvent';

const control = vi.hoisted(() => ({
  /** Dónde lanza la vista falsa del socio (un fallo de su código, p. ej. al medir la red). */
  throwIn: null as Where | null,
  /** Rótulos fijos de cada vista creada (se escriben una vez, como en la vista real). */
  views: [] as { goal: string; destroyed: boolean }[],
  /** Texto del socio con el módulo de catálogos de la prueba en curso. */
  text: (_key: string): string => '',
  /** El catálogo inglés llega cuando se resuelva esta promesa (null: enseguida). */
  enGate: null as Promise<void> | null,
  enFails: false,
  enAttempts: 0,
}));

// La vista del socio, falsa: escribe sus rótulos al nacer y puede lanzar donde diga la prueba.
vi.mock('../src/partners/plasmodium/view/plasmodium-view.ts', () => ({
  createPartnerView: () => {
    if (control.throwIn === 'create') throw new Error('fallo al crear la vista');
    const record = { goal: control.text('goal.title'), destroyed: false };
    control.views.push(record);
    const title = document.createElement('h3');
    title.id = 'partner-plasmodium-title';
    title.tabIndex = -1;
    title.textContent = control.text('name');
    const goal = document.createElement('p');
    goal.className = 'fake-view__goal';
    goal.textContent = record.goal;
    const root = document.createElement('div');
    root.append(title, goal);
    const maybeThrow = (where: Where): void => {
      if (control.throwIn === where) throw new Error(`fallo del modelo en ${where}`);
    };
    return {
      root,
      update: () => {
        maybeThrow('update');
      },
      frame: () => {
        maybeThrow('frame');
      },
      onEvent: () => {
        maybeThrow('onEvent');
      },
      setReducedMotion: () => undefined,
      destroy: () => {
        record.destroyed = true;
      },
    };
  },
}));

// El catálogo inglés con retraso o fallo a voluntad; cuenta cada intento de traerlo.
vi.mock('../src/i18n/partners/plasmodium.en.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/i18n/partners/plasmodium.en.ts')>();
  return {
    get plasmodiumEn() {
      control.enAttempts += 1;
      return (control.enGate ?? Promise.resolve()).then(() => {
        if (control.enFails) throw new Error('no llegaron los textos (en)');
        return actual.plasmodiumEn;
      });
    },
  };
});

const NOW = Date.UTC(2026, 9, 1);

async function fresh() {
  vi.resetModules();
  const i18n = await import('../src/i18n/index.ts');
  const catalogs = await import('../src/i18n/partners/index.ts');
  const loader = await import('../src/ui/partner-loader.ts');
  const registry = await import('../src/partners/registry.ts');
  const { createPartnersTab } = await import('../src/ui/tab-partners.ts');
  const { createStore } = await import('../src/ui/store.ts');
  const { createState } = await import('../src/core/state.ts');
  const { createPlasmodium } = await import('../src/partners/plasmodium/state.ts');
  const { plasmodiumEs } = await import('../src/i18n/partners/plasmodium.es.ts');
  const { plasmodiumEn } = await vi.importActual<typeof import('../src/i18n/partners/plasmodium.en.ts')>(
    '../src/i18n/partners/plasmodium.en.ts',
  );
  control.text = (key) => catalogs.partnerText('plasmodium', key);
  i18n.setLocale('es');

  function storeWithPlasmodium() {
    const state = createState(3, NOW);
    state.partners.plasmodium = createPlasmodium(5);
    return createStore(state);
  }

  function mountTab(store = storeWithPlasmodium()) {
    const tab = createPartnersTab(store, {
      reducedMotion: () => true,
      toAchievements: () => undefined,
      rereadPlate: () => undefined,
      saveAndReload: () => undefined,
    });
    document.body.append(tab.root);
    return tab;
  }

  return { i18n, catalogs, loader, registry, plasmodiumEs, plasmodiumEn, storeWithPlasmodium, mountTab };
}

const reloadButton = (root: HTMLElement): HTMLButtonElement | undefined =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Recargar la página');

/** Deja correr las promesas y los import() pendientes. */
async function settle(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

let consoleError: MockInstance;

beforeEach(() => {
  control.throwIn = null;
  control.views = [];
  control.enGate = null;
  control.enFails = false;
  control.enAttempts = 0;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.style.removeProperty('--hud-h');
  consoleError.mockRestore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('errores del código del socio', () => {
  it.each<Where>(['create', 'update', 'frame', 'onEvent'])(
    'un error de la vista en %s no sale del bucle: el socio se da de baja y la sección ofrece recargar',
    async (where) => {
      const { loader, registry, mountTab } = await fresh();
      if (where === 'create') control.throwIn = 'create';
      const tab = mountTab();
      tab.update();
      await vi.waitFor(() => {
        expect(control.views.length > 0 || loader.partnerLoadStatus('plasmodium') === 'failed').toBe(true);
      });
      control.throwIn = where;
      // Varios refrescos y frames seguidos, como el bucle de main.ts: ninguno lanza.
      expect(() => {
        for (let i = 0; i < 5; i += 1) {
          tab.update();
          tab.frame(i * 16);
          tab.onEvent({ type: 'plasmodium', kind: 'pulse' });
        }
      }).not.toThrow();
      expect(loader.partnerLoadStatus('plasmodium')).toBe('failed');
      expect(registry.partnerRuntime('plasmodium')).toBeNull();
      expect(reloadButton(tab.root)).toBeDefined();
      expect(control.views.every((v) => v.destroyed)).toBe(true);
      // Se registra una sola vez, por muchas veces que se llegue al fallo.
      expect(consoleError).toHaveBeenCalledTimes(1);
      tab.destroy();
    },
  );

  it('un aviso del socio que lanza no sale de main.ts: no hay aviso y el socio se da de baja', async () => {
    const { loader, registry } = await fresh();
    registry.registerPartnerRuntime({
      id: 'plasmodium',
      advance: () => undefined,
      notice: () => {
        throw new Error('fallo del aviso');
      },
    });
    let notice: unknown = 'sin llamar';
    expect(() => {
      notice = loader.partnerNoticeFor({ type: 'plasmodium', kind: 'goal', met: true });
    }).not.toThrow();
    expect(notice).toBeNull();
    expect(registry.partnerRuntime('plasmodium')).toBeNull();
    expect(loader.partnerLoadStatus('plasmodium')).toBe('failed');
  });
});

describe('tras un fallo del socio', () => {
  it('los refrescos no reintentan la carga: el mismo botón «Recargar» sigue en su sitio y con el foco', async () => {
    const { loader, mountTab } = await fresh();
    const tab = mountTab();
    tab.update();
    await vi.waitFor(() => {
      expect(loader.partnerLoadStatus('plasmodium')).toBe('ready');
      expect(control.views).toHaveLength(1);
    });
    loader.markPartnerFailed('plasmodium');
    const button = reloadButton(tab.root);
    expect(button).toBeDefined();
    button?.focus();
    for (let i = 0; i < 10; i += 1) {
      tab.update();
      await settle(3);
    }
    expect(reloadButton(tab.root)).toBe(button);
    expect(button?.isConnected).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(loader.partnerLoadStatus('plasmodium')).toBe('failed');
    tab.destroy();
  });
});

describe('idioma de los textos del socio', () => {
  it('cambiar de idioma con la carga del socio en vuelo también trae el catálogo del idioma nuevo', async () => {
    const { i18n, catalogs, loader } = await fresh();
    const first = loader.loadPartner('plasmodium', 'es');
    // El jugador pasa a inglés antes de que llegue el código del socio (rebuildApp).
    i18n.setLocale('en');
    await loader.loadPartner('plasmodium', 'en');
    await first;
    expect(loader.partnerLoadStatus('plasmodium')).toBe('ready');
    expect(catalogs.isPartnerCatalogReady('plasmodium', 'en')).toBe(true);
    expect(catalogs.partnerText('plasmodium', 'goal.title')).toBe('Goal');
  });

  it('la vista del socio nace con el catálogo del idioma activo aunque llegue después que su código', async () => {
    const { i18n, catalogs, loader, mountTab } = await fresh();
    await loader.loadPartner('plasmodium', 'es');
    i18n.setLocale('en');
    let arrive = (): void => undefined;
    control.enGate = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const tab = mountTab();
    tab.update();
    // El código de la vista ya está; el catálogo inglés, no.
    await settle();
    expect(control.views).toHaveLength(0);
    arrive();
    await vi.waitFor(() => {
      expect(control.views).toHaveLength(1);
    });
    expect(catalogs.isPartnerCatalogReady('plasmodium', 'en')).toBe(true);
    expect(control.views[0]?.goal).toBe('Goal');
    expect(tab.root.querySelector('.fake-view__goal')?.textContent).toBe('Goal');
    tab.destroy();
  });

  it('si la vista nació con el catálogo anterior, se rehace en cuanto llega el del idioma activo', async () => {
    const { i18n, catalogs, loader, plasmodiumEn, mountTab } = await fresh();
    await loader.loadPartner('plasmodium', 'es');
    i18n.setLocale('en');
    control.enFails = true;
    const tab = mountTab();
    tab.update();
    await vi.waitFor(() => {
      expect(control.views).toHaveLength(1);
    });
    // Sin el inglés, nace con el español (se conserva el anterior hasta que llegue el nuevo).
    expect(control.views[0]?.goal).toBe('Objetivo');
    tab.root.querySelector<HTMLElement>('#partner-plasmodium-title')?.focus();
    // Llega más tarde (otro intento, p. ej. la lámina de una placa).
    catalogs.providePartnerCatalog('plasmodium', 'en', plasmodiumEn);
    tab.update();
    expect(control.views).toHaveLength(2);
    expect(control.views[0]?.destroyed).toBe(true);
    expect(tab.root.querySelector('.fake-view__goal')?.textContent).toBe('Goal');
    // Rehacerla no deja el foco en <body>.
    expect(document.activeElement?.id).toBe('partner-plasmodium-title');
    tab.update();
    expect(control.views).toHaveLength(2);
    tab.destroy();
  });

  it('con el socio listo, un catálogo que no llega no deja una promesa rechazada sin atender', async () => {
    const { i18n, loader } = await fresh();
    await loader.loadPartner('plasmodium', 'es');
    i18n.setLocale('en');
    control.enFails = true;
    await expect(loader.loadPartner('plasmodium', 'en')).resolves.toBeUndefined();
    await expect(loader.loadPartner('plasmodium', 'en')).resolves.toBeUndefined();
    // Registrado una vez por idioma, no en cada intento.
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('la lámina de una placa pide el catálogo una vez por idioma y, si no llega, sale con el anterior', async () => {
    const { i18n, loader } = await fresh();
    await loader.loadPartner('plasmodium', 'es');
    i18n.setLocale('en');
    control.enFails = true;
    control.enAttempts = 0;
    let ready = false;
    // main.ts pregunta en cada refresco (10 Hz) mientras la lámina está pendiente.
    for (let i = 0; i < 10; i += 1) {
      ready = loader.partnerChapterReady('plasmodium', i18n.getLocale());
      await settle(2);
    }
    expect(control.enAttempts).toBe(1);
    expect(ready).toBe(true);
  });

  it('la lámina de una placa espera al catálogo del idioma mientras está en camino', async () => {
    const { i18n, loader } = await fresh();
    await loader.loadPartner('plasmodium', 'es');
    i18n.setLocale('en');
    let arrive = (): void => undefined;
    control.enGate = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    expect(loader.partnerChapterReady('plasmodium', 'en')).toBe(false);
    await settle();
    expect(loader.partnerChapterReady('plasmodium', 'en')).toBe(false);
    arrive();
    await settle();
    expect(loader.partnerChapterReady('plasmodium', 'en')).toBe(true);
  });
});

describe('avisos de objetivo y de mapa del socio', () => {
  async function gate(options: { modal?: boolean } = {}) {
    vi.useFakeTimers({ now: 0 });
    const { createPartnerNoticeGate } = await import('../src/ui/partner-notice-gate.ts');
    const world = { modal: options.modal ?? false, goalMet: false as boolean | null };
    const said: string[] = [];
    const notices = createPartnerNoticeGate({
      now: () => Date.now(),
      modalOpen: () => world.modal,
      goalMet: () => world.goalMet,
      deliver: (event) => {
        said.push(event.kind === 'goal' ? `goal:${String(event.met)}` : event.kind);
        return true;
      },
    });
    /** El modelo cambia el objetivo y lo emite. */
    const goal = (met: boolean): void => {
      world.goalMet = met;
      notices.offer({ type: 'plasmodium', kind: 'goal', met });
    };
    return { world, said, notices, goal };
  }

  it('con un modal abierto el objetivo no se anuncia ni gasta el tope; al cerrarlo se dice el vigente', async () => {
    const { world, said, notices, goal } = await gate({ modal: true });
    goal(true);
    vi.advanceTimersByTime(4000);
    goal(false);
    expect(said).toEqual([]);
    world.modal = false;
    notices.modalClosed();
    // Se dice el estado de ahora, no el «cumple» caducado.
    expect(said).toEqual(['goal:false']);
    notices.dispose();
  });

  it('al cerrar el modal no se repite un objetivo que ya estaba dicho', async () => {
    const { world, said, notices, goal } = await gate();
    goal(true);
    vi.advanceTimersByTime(20_000);
    world.modal = true;
    goal(false);
    goal(true);
    world.modal = false;
    notices.modalClosed();
    expect(said).toEqual(['goal:true']);
    notices.dispose();
  });

  it('lo que la placa ampliada ya dijo del objetivo no se repite al cerrarla', async () => {
    const { world, said, notices, goal } = await gate();
    const { noteGoalAnnounced } = await import('../src/ui/partner-notice-gate.ts');
    goal(true);
    vi.advanceTimersByTime(20_000);
    world.modal = true;
    goal(false);
    // La vista lo dijo en la región propia del diálogo.
    noteGoalAnnounced(false);
    world.modal = false;
    notices.modalClosed();
    expect(said).toEqual(['goal:true']);
    notices.dispose();
  });

  it('un mapa mejorado con un modal abierto no se avisa ni gasta el tope de 10 s', async () => {
    const { world, said, notices } = await gate({ modal: true });
    notices.offer({ type: 'plasmodium', kind: 'mapImproved', plate: 0 });
    expect(said).toEqual([]);
    world.modal = false;
    notices.modalClosed();
    vi.advanceTimersByTime(1000);
    notices.offer({ type: 'plasmodium', kind: 'mapImproved', plate: 0 });
    expect(said).toEqual(['mapImproved']);
    notices.dispose();
  });

  it('el tope de 10 s no se traga el último cambio de objetivo: al terminar la ventana se dice el vigente', async () => {
    const { said, notices, goal } = await gate();
    goal(true);
    vi.advanceTimersByTime(3000);
    // Un copo nuevo rehízo la red y el objetivo se pierde a los 3 s.
    goal(false);
    expect(said).toEqual(['goal:true']);
    vi.advanceTimersByTime(6999);
    expect(said).toEqual(['goal:true']);
    vi.advanceTimersByTime(1);
    expect(said).toEqual(['goal:true', 'goal:false']);
    notices.dispose();
  });

  it('si el objetivo vuelve dentro de la ventana a lo último dicho, no se repite', async () => {
    const { said, notices, goal } = await gate();
    goal(true);
    vi.advanceTimersByTime(3000);
    goal(false);
    vi.advanceTimersByTime(2000);
    goal(true);
    vi.advanceTimersByTime(10_000);
    expect(said).toEqual(['goal:true']);
    notices.dispose();
  });
});

describe('cabecera', () => {
  it('la altura real de la cabecera queda en --hud-h y solo se escribe cuando cambia', async () => {
    const observers: { callback: () => void; targets: Element[]; disconnected: boolean }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private readonly record: (typeof observers)[number];
        constructor(callback: () => void) {
          this.record = { callback, targets: [], disconnected: false };
          observers.push(this.record);
        }
        observe(target: Element): void {
          this.record.targets.push(target);
        }
        unobserve(): void {}
        disconnect(): void {
          this.record.disconnected = true;
        }
      },
    );
    vi.resetModules();
    const { setLocale } = await import('../src/i18n/index.ts');
    const { createState } = await import('../src/core/state.ts');
    const { createStore } = await import('../src/ui/store.ts');
    const { createApp } = await import('../src/ui/app.ts');
    setLocale('es');
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(host, createStore(createState(3, NOW)), {
      initialTab: 'generators',
      onTabChange: () => undefined,
      onAbsorb: () => undefined,
      nav: {
        toWind: () => undefined,
        toAdaptations: () => undefined,
        toCore: () => undefined,
        toPartner: () => undefined,
      },
      partners: {
        reducedMotion: () => true,
        toAchievements: () => undefined,
        rereadPlate: () => undefined,
        saveAndReload: () => undefined,
      },
    });
    const hud = host.querySelector<HTMLElement>('.layout__hud');
    const watcher = observers.find((o) => hud !== null && o.targets.includes(hud));
    expect(watcher).toBeDefined();
    let height = 104.4;
    if (hud) hud.getBoundingClientRect = () => ({ height }) as DOMRect;
    const setProperty = vi.spyOn(document.documentElement.style, 'setProperty');
    watcher?.callback();
    expect(document.documentElement.style.getPropertyValue('--hud-h')).toBe('105px');
    watcher?.callback();
    expect(setProperty.mock.calls.filter(([name]) => name === '--hud-h')).toHaveLength(1);
    height = 64;
    watcher?.callback();
    expect(document.documentElement.style.getPropertyValue('--hud-h')).toBe('64px');
    app.destroy();
    expect(watcher?.disconnected).toBe(true);
    setProperty.mockRestore();
  });
});

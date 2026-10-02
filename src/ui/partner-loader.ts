/**
 * Carga aparte del código de los socios (docs/ROADMAP.md, fase 9; ARCHITECTURE.md §4.29): el
 * modelo y el catálogo del idioma se precargan en reposo en cuanto hay un socio, para que crezca
 * aunque nunca se abra Socios; la vista, al abrir la pestaña. Una partida sin socios no descarga
 * nada de esto.
 *
 * Un trozo que no llega (despliegue nuevo, sin red) no rompe nada: el tiempo del socio sigue
 * apuntado con su tope (systems/partners.ts) y el panel ofrece recargar la página.
 */
import type { Locale } from '../core/state.ts';
import { ensurePartnerCatalog } from '../i18n/partners/index.ts';
import { PARTNER_IDS, type PartnerId } from '../partners/ids.ts';
import { registerPartnerRuntime } from '../partners/registry.ts';
import type { PartnerRuntime } from '../partners/types.ts';
import type { PartnerViewModule } from './partner-view.ts';
import type { Store } from './store.ts';

export type PartnerLoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

const RUNTIME_LOADERS: { readonly [K in PartnerId]: () => Promise<PartnerRuntime> } = {
  plasmodium: () => import('../partners/plasmodium/plasmodium-runtime.ts').then((m) => m.plasmodiumRuntime),
};

const VIEW_LOADERS: { readonly [K in PartnerId]: () => Promise<PartnerViewModule> } = {
  plasmodium: () => import('../partners/plasmodium/view/plasmodium-view.ts'),
};

const status = new Map<PartnerId, PartnerLoadStatus>();
const inFlight = new Map<PartnerId, Promise<void>>();
const listeners = new Set<() => void>();

function setStatus(id: PartnerId, next: PartnerLoadStatus): void {
  if (status.get(id) === next) return;
  status.set(id, next);
  for (const listener of listeners) listener();
}

/** Avisa cuando cambia el estado de carga de algún socio. Devuelve la función para dejar de escuchar. */
export function onPartnerLoadChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function partnerLoadStatus(id: PartnerId): PartnerLoadStatus {
  return status.get(id) ?? 'idle';
}

/** El modelo de un socio lanzó y se dio de baja (main.ts): el panel lo dice y ofrece recargar. */
export function markPartnerFailed(id: PartnerId): void {
  setStatus(id, 'failed');
}

/**
 * Modelo + catálogo del idioma; registra el modelo cuando llegan los dos. Idempotente: si ya está
 * listo, solo asegura el catálogo de `locale`; tras un fallo se puede reintentar.
 */
export function loadPartner(id: PartnerId, locale: Locale): Promise<void> {
  if (partnerLoadStatus(id) === 'ready') return ensurePartnerCatalog(id, locale);
  let promise = inFlight.get(id);
  if (!promise) {
    setStatus(id, 'loading');
    promise = Promise.all([RUNTIME_LOADERS[id](), ensurePartnerCatalog(id, locale)])
      .then(([runtime]) => {
        registerPartnerRuntime(runtime);
        setStatus(id, 'ready');
      })
      .catch((error: unknown) => {
        console.error(`Micelio: no se pudo cargar el socio ${id}.`, error);
        setStatus(id, 'failed');
      })
      .finally(() => inFlight.delete(id));
    inFlight.set(id, promise);
  }
  return promise;
}

const viewModules = new Map<PartnerId, Promise<PartnerViewModule>>();

/** La vista del socio (al abrir Socios). Un fallo se puede reintentar. */
export function loadPartnerView(id: PartnerId): Promise<PartnerViewModule> {
  let promise = viewModules.get(id);
  if (!promise) {
    promise = VIEW_LOADERS[id]().catch((error: unknown) => {
      viewModules.delete(id);
      throw error;
    });
    viewModules.set(id, promise);
  }
  return promise;
}

/**
 * Tras el primer frame, en reposo (requestIdleCallback con 2 s de plazo, o 1 s de espera donde no
 * existe), precarga el modelo y el catálogo de cada socio que ya haya llegado.
 */
export function schedulePartnerPreload(store: Store, locale: () => Locale): void {
  const run = (): void => {
    for (const id of PARTNER_IDS) {
      if (store.state.partners[id] !== null && partnerLoadStatus(id) === 'idle')
        void loadPartner(id, locale());
    }
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 2000 });
  else window.setTimeout(run, 1000);
}

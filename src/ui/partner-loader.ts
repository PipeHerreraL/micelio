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
import { ensurePartnerCatalog, hasPartnerCatalog, isPartnerCatalogReady } from '../i18n/partners/index.ts';
import { PARTNER_IDS, type PartnerId } from '../partners/ids.ts';
import {
  partnerRuntime,
  registerPartnerRuntime,
  unregisterPartnerRuntime,
  type PartnerEvent,
} from '../partners/registry.ts';
import type { PartnerNotice, PartnerRuntime } from '../partners/types.ts';
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
/** Carga en curso y el idioma con que se pidió (solo trae el catálogo de ese idioma). */
const inFlight = new Map<PartnerId, { promise: Promise<void>; locale: Locale }>();
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

const reportedFailures = new Set<PartnerId>();

/**
 * Un error del código del socio (su modelo en el bucle, su vista o su aviso): se registra una vez,
 * el modelo se da de baja (su tiempo vuelve a quedar pendiente, con su tope) y el panel ofrece
 * recargar. Ningún error del socio para el bucle de la red ni hace perder la partida.
 */
export function reportPartnerFailure(id: PartnerId, error: unknown): void {
  if (!reportedFailures.has(id)) {
    reportedFailures.add(id);
    console.error(`Micelio: el código del socio ${id} falló.`, error);
  }
  unregisterPartnerRuntime(id);
  markPartnerFailed(id);
}

/**
 * El aviso de un evento del socio (main.ts), escrito por su propio código: si lanza, el socio se
 * da de baja como si hubiera fallado su modelo y no hay aviso. Sin modelo cargado, tampoco.
 */
export function partnerNoticeFor(event: PartnerEvent): PartnerNotice | null {
  try {
    return partnerRuntime(event.type)?.notice(event) ?? null;
  } catch (error) {
    reportPartnerFailure(event.type, error);
    return null;
  }
}

const reportedCatalogs = new Set<string>();

/**
 * Un catálogo que no llega no tiene más arreglo que recargar, y quien lo pide sigue con el
 * anterior (i18n/partners): se registra una vez por idioma en vez de dejar un rechazo sin atender.
 */
function catalogFailed(id: PartnerId, locale: Locale, error: unknown): void {
  const key = `${id}:${locale}`;
  if (reportedCatalogs.has(key)) return;
  reportedCatalogs.add(key);
  console.error(`Micelio: no llegaron los textos del socio ${id} (${locale}).`, error);
}

function ensureCatalog(id: PartnerId, locale: Locale): Promise<void> {
  return ensurePartnerCatalog(id, locale).catch((error: unknown) => {
    catalogFailed(id, locale, error);
  });
}

/**
 * Modelo + catálogo del idioma; registra el modelo cuando llegan los dos. Idempotente: si ya está
 * listo, solo asegura el catálogo de `locale`; tras un fallo se puede reintentar. Nunca rechaza:
 * el fallo queda en el estado de carga (o, si solo falta el catálogo, se sigue con el anterior).
 */
export function loadPartner(id: PartnerId, locale: Locale): Promise<void> {
  if (partnerLoadStatus(id) === 'ready') return ensureCatalog(id, locale);
  const current = inFlight.get(id);
  if (current) {
    // La carga en curso solo trae el catálogo del idioma con que se pidió: si entretanto cambió
    // el idioma, el nuevo se pide detrás; si no, el panel se quedaría en el idioma anterior.
    if (current.locale === locale) return current.promise;
    return current.promise.then(() => ensureCatalog(id, locale));
  }
  setStatus(id, 'loading');
  const promise = Promise.all([RUNTIME_LOADERS[id](), ensurePartnerCatalog(id, locale)])
    .then(([runtime]) => {
      registerPartnerRuntime(runtime);
      setStatus(id, 'ready');
    })
    .catch((error: unknown) => {
      console.error(`Micelio: no se pudo cargar el socio ${id}.`, error);
      setStatus(id, 'failed');
    })
    .finally(() => inFlight.delete(id));
  inFlight.set(id, { promise, locale });
  return promise;
}

/** Intento de catálogo para las láminas: uno por socio e idioma. */
const chapterCatalogs = new Map<string, 'pending' | 'failed'>();

/**
 * ¿Puede salir ya una lámina del socio (main.ts lo pregunta en cada refresco)? Espera al catálogo
 * del idioma, que se pide una sola vez por idioma. Si no llega, sale con el anterior cuando lo hay
 * (se conserva hasta que llegue el nuevo); sin ninguno, la lámina sigue pendiente en el estado y
 * sale al recargar.
 */
export function partnerChapterReady(id: PartnerId, locale: Locale): boolean {
  if (isPartnerCatalogReady(id, locale)) return true;
  const key = `${id}:${locale}`;
  const attempt = chapterCatalogs.get(key);
  if (attempt === undefined) {
    chapterCatalogs.set(key, 'pending');
    ensurePartnerCatalog(id, locale).catch((error: unknown) => {
      catalogFailed(id, locale, error);
      chapterCatalogs.set(key, 'failed');
    });
    return false;
  }
  return attempt === 'failed' && hasPartnerCatalog(id);
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

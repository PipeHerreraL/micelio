/**
 * Textos de los socios (docs/ROADMAP.md, fase 9). Cada socio tiene su catálogo por idioma, que
 * llega aparte con import() y solo para el idioma activo: el paquete inicial no carga los textos
 * de un socio que aún no ha llegado (presupuesto de JS, ARCHITECTURE.md §7).
 *
 * Al cambiar de idioma se conserva el catálogo anterior hasta que llega el nuevo: los avisos nunca
 * salen vacíos (BUG familia de la crítica de la fase 9).
 */
import type { Locale } from '../../core/state.ts';
import type { PartnerId } from '../../partners/ids.ts';
import { formatCount, getLocale, interpolate, pseudoize, type Params } from '../index.ts';

type PartnerCatalog = Readonly<Record<string, string>>;

const LOADERS: { readonly [K in PartnerId]: Readonly<Record<Locale, () => Promise<PartnerCatalog>>> } = {
  plasmodium: {
    es: () => import('./plasmodium.es.ts').then((m) => m.plasmodiumEs),
    en: () => import('./plasmodium.en.ts').then((m) => m.plasmodiumEn),
  },
};

const loaded = new Map<string, PartnerCatalog>();
const pending = new Map<string, Promise<void>>();
/** Catálogo en uso por socio: el del idioma activo en cuanto llega; mientras, el anterior. */
const active = new Map<PartnerId, PartnerCatalog>();
let pseudo = false;

const keyOf = (id: PartnerId, locale: Locale): string => `${id}:${locale}`;

/** Modo de desarrollo `?pseudo`: los textos de los socios también se alargan y acentúan. */
export function setPartnerPseudo(on: boolean): void {
  pseudo = on;
}

/** Descarga el catálogo del socio para `locale` (una vez; un fallo deja reintentar). */
export function ensurePartnerCatalog(id: PartnerId, locale: Locale): Promise<void> {
  const key = keyOf(id, locale);
  const done = loaded.get(key);
  if (done) {
    if (locale === getLocale()) active.set(id, done);
    return Promise.resolve();
  }
  let promise = pending.get(key);
  if (!promise) {
    promise = LOADERS[id][locale]()
      .then((catalog) => {
        const ready = pseudo
          ? Object.fromEntries(Object.entries(catalog).map(([k, v]) => [k, pseudoize(v)]))
          : catalog;
        loaded.set(key, ready);
        if (locale === getLocale() || !active.has(id)) active.set(id, ready);
      })
      .finally(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}

export function isPartnerCatalogReady(id: PartnerId, locale: Locale): boolean {
  return loaded.has(keyOf(id, locale));
}

/** Hay algún catálogo del socio en uso: el del idioma activo o, mientras no llega, el anterior. */
export function hasPartnerCatalog(id: PartnerId): boolean {
  return active.has(id);
}

/** Pone a mano un catálogo ya cargado (pruebas: happy-dom no resuelve import() del trozo). */
export function providePartnerCatalog(id: PartnerId, locale: Locale, catalog: PartnerCatalog): void {
  loaded.set(keyOf(id, locale), catalog);
  if (locale === getLocale() || !active.has(id)) active.set(id, catalog);
}

/** Texto de un socio en el idioma activo (o el último cargado); '' si aún no hay catálogo. */
export function partnerText(id: PartnerId, key: string, params?: Params): string {
  const template = active.get(id)?.[key];
  return template === undefined ? '' : interpolate(template, params);
}

/** Plural: elige `.one` u `.other` con las reglas del idioma activo; `{count}` se formatea solo. */
export function partnerPlural(id: PartnerId, base: string, count: number, params?: Params): string {
  const category = new Intl.PluralRules(getLocale()).select(count);
  return partnerText(id, category === 'one' ? `${base}.one` : `${base}.other`, {
    count: formatCount(count),
    ...params,
  });
}

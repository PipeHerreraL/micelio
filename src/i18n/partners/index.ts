/**
 * Textos de los socios (docs/ROADMAP.md, fase 9). Cada socio tiene su catálogo por idioma, que
 * llega aparte con import() y solo para el idioma activo: el paquete inicial no carga los textos
 * de un socio que aún no ha llegado (presupuesto de JS, ARCHITECTURE.md §7).
 *
 * Al cambiar de idioma se conserva el catálogo anterior hasta que llega el nuevo: los avisos nunca
 * salen vacíos (BUG familia de la crítica de la fase 9). El cargador es el común
 * (../lazy-catalog.ts), uno por socio.
 */
import type { Locale } from '../../core/state.ts';
import type { PartnerId } from '../../partners/ids.ts';
import { formatCount, getLocale, interpolate, pseudoize, type Params } from '../index.ts';
import { createLazyCatalog, type LazyCatalog } from '../lazy-catalog.ts';

type PartnerCatalog = Readonly<Record<string, string>>;

const CATALOGS: { readonly [K in PartnerId]: LazyCatalog<PartnerCatalog> } = {
  plasmodium: createLazyCatalog<PartnerCatalog>(
    {
      es: () => import('./plasmodium.es.ts').then((m) => m.plasmodiumEs),
      en: () => import('./plasmodium.en.ts').then((m) => m.plasmodiumEn),
    },
    getLocale,
  ),
};

/** Modo de desarrollo `?pseudo`: los textos de los socios también se alargan y acentúan. */
export function setPartnerPseudo(on: boolean): void {
  for (const catalog of Object.values(CATALOGS)) catalog.setTransform(on ? pseudoize : null);
}

/** Descarga el catálogo del socio para `locale` (una vez; un fallo deja reintentar). */
export function ensurePartnerCatalog(id: PartnerId, locale: Locale): Promise<void> {
  return CATALOGS[id].ensure(locale);
}

export function isPartnerCatalogReady(id: PartnerId, locale: Locale): boolean {
  return CATALOGS[id].get(locale) !== undefined;
}

/** Hay algún catálogo del socio en uso: el del idioma activo o, mientras no llega, el anterior. */
export function hasPartnerCatalog(id: PartnerId): boolean {
  return CATALOGS[id].active() !== null;
}

/** Pone a mano un catálogo ya cargado (pruebas: happy-dom no resuelve import() del trozo). */
export function providePartnerCatalog(id: PartnerId, locale: Locale, catalog: PartnerCatalog): void {
  CATALOGS[id].provide(locale, catalog);
}

/** Texto de un socio en el idioma activo (o el último cargado); '' si aún no hay catálogo. */
export function partnerText(id: PartnerId, key: string, params?: Params): string {
  const template = CATALOGS[id].active()?.[key];
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

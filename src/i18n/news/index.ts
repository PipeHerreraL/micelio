/**
 * Textos de las noticias del sotobosque (src/data/news.ts). Llegan aparte con import(), solo los
 * del idioma activo: con más de cien frases en dos idiomas, el JS inicial no cabía en su tope
 * (ARCHITECTURE.md §7). Mismo patrón que los textos de los socios (../partners/index.ts): al
 * cambiar de idioma se siguen usando los del anterior hasta que llegan los nuevos.
 */
import type { Locale } from '../../core/state.ts';
import { pseudoize } from '../index.ts';

type NewsCatalog = Readonly<Record<string, string>>;

const LOADERS: Readonly<Record<Locale, () => Promise<NewsCatalog>>> = {
  es: () => import('./es.ts').then((m) => m.newsEs),
  en: () => import('./en.ts').then((m) => m.newsEn),
};

const loaded = new Map<Locale, NewsCatalog>();
const pending = new Map<Locale, Promise<void>>();
/** Catálogo en uso: el del idioma activo en cuanto llega; mientras, el anterior. */
let active: NewsCatalog | null = null;
let activeLocale: Locale | null = null;
let pseudo = false;

/** Modo de desarrollo `?pseudo`: las noticias también se alargan y acentúan. */
export function setNewsPseudo(on: boolean): void {
  pseudo = on;
}

/** Descarga las noticias de `locale` (una vez; un fallo deja reintentar) y las pone en uso. */
export function ensureNewsCatalog(locale: Locale): Promise<void> {
  const done = loaded.get(locale);
  if (done) {
    active = done;
    activeLocale = locale;
    return Promise.resolve();
  }
  let promise = pending.get(locale);
  if (!promise) {
    promise = LOADERS[locale]()
      .then((catalog) => {
        const ready = pseudo
          ? Object.fromEntries(Object.entries(catalog).map(([k, v]) => [k, pseudoize(v)]))
          : catalog;
        loaded.set(locale, ready);
        provideNewsCatalog(locale, ready);
      })
      .finally(() => pending.delete(locale));
    pending.set(locale, promise);
  }
  return promise;
}

/** Las noticias en uso son las de `locale`. */
export function isNewsCatalogReady(locale: Locale): boolean {
  return activeLocale === locale;
}

/** Pone a mano un catálogo (pruebas: happy-dom no resuelve el import() del trozo). */
export function provideNewsCatalog(locale: Locale, catalog: NewsCatalog): void {
  loaded.set(locale, catalog);
  active = catalog;
  activeLocale = locale;
}

/**
 * Texto de una noticia, con su versión del bioma si la tiene (como biomeText); '' si aún no hay
 * catálogo.
 */
export function newsText(id: string, biome: string): string {
  if (!active) return '';
  return active[`${id}.${biome}`] ?? active[id] ?? '';
}

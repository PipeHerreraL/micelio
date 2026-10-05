/**
 * Textos de las noticias del sotobosque (src/data/news.ts). Llegan aparte con import(), solo los
 * del idioma activo: con más de cien frases en dos idiomas, el JS inicial no cabía en su tope
 * (ARCHITECTURE.md §7). Mismo cargador que los textos de los socios y el inglés de la interfaz
 * (../lazy-catalog.ts): al cambiar de idioma se siguen usando los del anterior hasta que llegan los
 * nuevos.
 */
import type { Locale } from '../../core/state.ts';
import { getLocale, pseudoize } from '../index.ts';
import { createLazyCatalog } from '../lazy-catalog.ts';

type NewsCatalog = Readonly<Record<string, string>>;

const news = createLazyCatalog<NewsCatalog>(
  {
    es: () => import('./es.ts').then((m) => m.newsEs),
    en: () => import('./en.ts').then((m) => m.newsEn),
  },
  getLocale,
);

/** Modo de desarrollo `?pseudo`: las noticias también se alargan y acentúan. */
export function setNewsPseudo(on: boolean): void {
  news.setTransform(on ? pseudoize : null);
}

/** Descarga las noticias de `locale` (una vez; un fallo deja reintentar) y las pone en uso. */
export function ensureNewsCatalog(locale: Locale): Promise<void> {
  return news.ensure(locale);
}

/** Las noticias en uso son las de `locale`. */
export function isNewsCatalogReady(locale: Locale): boolean {
  return news.activeLocale() === locale;
}

/** Pone a mano un catálogo (pruebas: happy-dom no resuelve el import() del trozo). */
export function provideNewsCatalog(locale: Locale, catalog: NewsCatalog): void {
  news.provide(locale, catalog);
}

/**
 * Texto de una noticia, con su versión del bioma si la tiene (como biomeText); '' si aún no hay
 * catálogo.
 */
export function newsText(id: string, biome: string): string {
  const active = news.active();
  if (!active) return '';
  return active[`${id}.${biome}`] ?? active[id] ?? '';
}

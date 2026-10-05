/**
 * Cargador común de los catálogos que llegan aparte con import(): las noticias y los textos de cada
 * socio. Con todo en el JS inicial no cabía en su tope (ARCHITECTURE.md §7).
 *
 * - Cada idioma se pide una vez; un fallo deja reintentar.
 * - Al cambiar de idioma, el catálogo en uso sigue siendo el anterior hasta que llega el nuevo: los
 *   textos nunca salen vacíos. Uno que llega tarde solo pasa a usarse si es el del idioma activo (o
 *   si aún no había ninguno): ir y volver de idioma deprisa no deja en uso el que se abandonó.
 */
import type { Locale } from '../core/state.ts';

type Texts = Readonly<Record<string, string>>;

export interface LazyCatalog<C extends Texts> {
  /** Descarga el catálogo de `locale` (una vez) y lo pone en uso si toca. Rechaza si no llega. */
  ensure(locale: Locale): Promise<void>;
  /** El de `locale`, si ya llegó. */
  get(locale: Locale): C | undefined;
  /** El catálogo en uso, o null si aún no llegó ninguno. */
  active(): C | null;
  /** Idioma del catálogo en uso. */
  activeLocale(): Locale | null;
  /** Pone a mano un catálogo ya cargado (pruebas: happy-dom no resuelve el import() del trozo). */
  provide(locale: Locale, catalog: C): void;
  /** Transformación de lo que llegue desde ahora (el pseudoidioma de desarrollo, `?pseudo`). */
  setTransform(transform: ((text: string) => string) | null): void;
}

/**
 * @param loaders el import() de cada idioma.
 * @param currentLocale el idioma activo de la interfaz (i18n/index.ts), que decide cuál se usa.
 */
export function createLazyCatalog<C extends Texts>(
  loaders: Readonly<Record<Locale, () => Promise<C>>>,
  currentLocale: () => Locale,
): LazyCatalog<C> {
  const loaded = new Map<Locale, C>();
  const pending = new Map<Locale, Promise<void>>();
  let inUse: C | null = null;
  let inUseLocale: Locale | null = null;
  let transform: ((text: string) => string) | null = null;

  function offer(locale: Locale, catalog: C): void {
    if (locale === currentLocale() || inUse === null) {
      inUse = catalog;
      inUseLocale = locale;
    }
  }

  function provide(locale: Locale, catalog: C): void {
    loaded.set(locale, catalog);
    offer(locale, catalog);
  }

  return {
    ensure(locale) {
      const done = loaded.get(locale);
      if (done) {
        offer(locale, done);
        return Promise.resolve();
      }
      let promise = pending.get(locale);
      if (!promise) {
        promise = loaders[locale]()
          .then((catalog) => {
            const map = transform;
            provide(
              locale,
              map ? (Object.fromEntries(Object.entries(catalog).map(([k, v]) => [k, map(v)])) as C) : catalog,
            );
          })
          .finally(() => pending.delete(locale));
        pending.set(locale, promise);
      }
      return promise;
    },
    get: (locale) => loaded.get(locale),
    active: () => inUse,
    activeLocale: () => inUseLocale,
    provide,
    setTransform(next) {
      transform = next;
    },
  };
}

import { describe, expect, it, vi } from 'vitest';
import type { Locale } from '../src/core/state.ts';
import { createLazyCatalog } from '../src/i18n/lazy-catalog.ts';

/**
 * Catálogos que llegan aparte (fase 10): las noticias y los textos de los socios comparten el
 * cargador de src/i18n/lazy-catalog.ts.
 */

type Texts = Readonly<Record<string, string>>;

/** Una descarga que la prueba deja llegar cuando quiere. */
function gate<T>(value: T) {
  let arrive = (): void => undefined;
  const promise = new Promise<T>((resolve) => {
    arrive = () => {
      resolve(value);
    };
  });
  return { promise, arrive };
}

const ES: Texts = { hello: 'hola' };
const EN: Texts = { hello: 'hello' };

/** Un cargador con el idioma activo en manos de la prueba. */
function setup(loaders: Record<Locale, () => Promise<Texts>>) {
  const current = { locale: 'es' as Locale };
  const catalog = createLazyCatalog(loaders, () => current.locale);
  return { catalog, current };
}

describe('cargador común de catálogos', () => {
  it('pide cada idioma una sola vez, aunque se pida otra vez mientras llega o después', async () => {
    const en = vi.fn(() => Promise.resolve(EN));
    const { catalog, current } = setup({ es: () => Promise.resolve(ES), en });
    current.locale = 'en';
    await Promise.all([catalog.ensure('en'), catalog.ensure('en')]);
    await catalog.ensure('en');
    expect(en).toHaveBeenCalledTimes(1);
    expect(catalog.get('en')).toBe(EN);
  });

  it('una descarga fallida rechaza y deja reintentar', async () => {
    let attempt = 0;
    const { catalog, current } = setup({
      es: () => Promise.resolve(ES),
      en: () => {
        attempt += 1;
        return attempt === 1 ? Promise.reject(new Error('sin red')) : Promise.resolve(EN);
      },
    });
    current.locale = 'en';
    await expect(catalog.ensure('en')).rejects.toThrow('sin red');
    expect(catalog.get('en')).toBeUndefined();
    await catalog.ensure('en');
    expect(catalog.get('en')).toBe(EN);
    expect(catalog.activeLocale()).toBe('en');
  });

  it('al cambiar de idioma sigue en uso el anterior hasta que llega el nuevo', async () => {
    const download = gate(EN);
    const { catalog, current } = setup({ es: () => Promise.resolve(ES), en: () => download.promise });
    catalog.provide('es', ES);
    current.locale = 'en';
    const arriving = catalog.ensure('en');
    expect(catalog.active()).toBe(ES);
    download.arrive();
    await arriving;
    expect(catalog.active()).toBe(EN);
    expect(catalog.activeLocale()).toBe('en');
  });

  it('un catálogo que llega cuando ya se volvió al idioma anterior no se pone en uso', async () => {
    const download = gate(EN);
    const { catalog, current } = setup({ es: () => Promise.resolve(ES), en: () => download.promise });
    catalog.provide('es', ES);
    current.locale = 'en';
    const arriving = catalog.ensure('en');
    // El jugador vuelve al español antes de que llegue el inglés.
    current.locale = 'es';
    await catalog.ensure('es');
    download.arrive();
    await arriving;
    expect(catalog.active()).toBe(ES);
    expect(catalog.activeLocale()).toBe('es');
    // Pero ya llegó: pasar otra vez a inglés no lo vuelve a pedir.
    current.locale = 'en';
    await catalog.ensure('en');
    expect(catalog.active()).toBe(EN);
  });

  it('sin ningún catálogo en uso, el primero que llega se usa aunque sea de otro idioma', async () => {
    const { catalog } = setup({ es: () => Promise.resolve(ES), en: () => Promise.resolve(EN) });
    await catalog.ensure('en');
    expect(catalog.active()).toBe(EN);
  });

  it('el pseudoidioma transforma cada texto de lo que llega', async () => {
    const { catalog } = setup({ es: () => Promise.resolve(ES), en: () => Promise.resolve(EN) });
    catalog.setTransform((text) => `[${text}]`);
    await catalog.ensure('es');
    expect(catalog.active()).toEqual({ hello: '[hola]' });
  });
});

describe('noticias del sotobosque', () => {
  it('volver al español antes de que lleguen las noticias en inglés deja en uso las españolas', async () => {
    const actual = await vi.importActual<typeof import('../src/i18n/news/en.ts')>('../src/i18n/news/en.ts');
    const download = gate(actual.newsEn);
    // El import() del trozo inglés devuelve el catálogo cuando la prueba lo deja llegar.
    vi.doMock('../src/i18n/news/en.ts', () => ({
      get newsEn() {
        return download.promise;
      },
    }));
    vi.resetModules();
    const i18n = await import('../src/i18n/index.ts');
    const news = await import('../src/i18n/news/index.ts');
    const { newsEs } = await import('../src/i18n/news/es.ts');
    news.provideNewsCatalog('es', newsEs);
    i18n.setLocale('en');
    const late = news.ensureNewsCatalog('en');
    i18n.setLocale('es');
    await news.ensureNewsCatalog('es');
    download.arrive();
    await late;
    // Antes, la inglesa que llegaba tarde se ponía en uso y el teletipo se quedaba sin noticias
    // hasta su siguiente turno (20 s).
    expect(news.isNewsCatalogReady('es')).toBe(true);
    vi.doUnmock('../src/i18n/news/en.ts');
  });
});

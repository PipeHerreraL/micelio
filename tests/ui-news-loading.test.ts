// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState } from '../src/core/state.ts';
import { NEWS_INTERVAL } from '../src/data/news.ts';
import { setLocale } from '../src/i18n/index.ts';
import { newsEn } from '../src/i18n/news/en.ts';
import { newsEs } from '../src/i18n/news/es.ts';
import { provideNewsCatalog } from '../src/i18n/news/index.ts';
import { createNewsTicker } from '../src/ui/news.ts';

/**
 * Teletipo de noticias mientras sus textos llegan aparte (src/i18n/news): la descarga se sustituye
 * por una que falla siempre, como sin red y sin service worker.
 */

const ensure = vi.hoisted(() => vi.fn(() => Promise.reject(new Error('sin red'))));
vi.mock('../src/i18n/news/index.ts', async (original) => ({
  ...(await original<typeof import('../src/i18n/news/index.ts')>()),
  ensureNewsCatalog: ensure,
}));

afterEach(() => {
  setLocale('es');
});

const state = createState(3, Date.UTC(2026, 9, 1));

describe('noticias que aún no llegan', () => {
  it('tras un fallo de la descarga no se reintenta en cada refresco, sino en el turno siguiente', () => {
    setLocale('es');
    const ticker = createNewsTicker();
    // El juego refresca cada 100 ms: antes, cada refresco era otra descarga fallida.
    for (let now = 0; now < 5000; now += 100) ticker.update(state, now);
    expect(ensure).toHaveBeenCalledTimes(1);
    ticker.update(state, NEWS_INTERVAL * 1000);
    expect(ensure).toHaveBeenCalledTimes(2);
  });

  it('al cambiar de idioma no sale una noticia en el anterior mientras llegan las del nuevo', () => {
    provideNewsCatalog('es', newsEs);
    setLocale('en');
    // Al cambiar de idioma la interfaz se reconstruye con un teletipo nuevo.
    const ticker = createNewsTicker();
    const text = (): string => ticker.root.querySelector('.news__text')?.textContent ?? '';
    ticker.update(state, 0);
    expect(text()).toBe('');
    provideNewsCatalog('en', newsEn);
    ticker.update(state, 100);
    expect(Object.values(newsEn)).toContain(text());
  });
});

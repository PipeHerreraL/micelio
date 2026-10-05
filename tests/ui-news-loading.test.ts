// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { disperse } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import { createState } from '../src/core/state.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { NEWS_INTERVAL } from '../src/data/news.ts';
import { loadLocale, setLocale } from '../src/i18n/index.ts';
import { newsEn } from '../src/i18n/news/en.ts';
import { newsEs } from '../src/i18n/news/es.ts';
import { provideNewsCatalog } from '../src/i18n/news/index.ts';
import { checkActOne } from '../src/systems/journey.ts';
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

// El catálogo inglés de la interfaz llega aparte: sin él, setLocale('en') se queda en español.
beforeAll(async () => {
  await loadLocale('en');
});

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

describe('noticias de los biomas que aún no llegan (fase 10)', () => {
  it('en el natal no se piden; tras dispersar se piden y, mientras no lleguen, no sale ninguna noticia', () => {
    setLocale('es');
    provideNewsCatalog('es', newsEs);
    ensure.mockClear();
    const text = (ticker: { root: HTMLElement }): string =>
      ticker.root.querySelector('.news__text')?.textContent ?? '';
    const natal = createNewsTicker();
    natal.update(state, 0);
    expect(text(natal)).not.toBe('');
    expect(ensure).not.toHaveBeenCalledWith('es', true);

    // En la taiga, construida con acciones.
    const taiga = createState(51, Date.UTC(2026, 9, 1));
    taiga.mutations = [...MUTATION_IDS];
    taiga.achievements = ['own.planetary.1'];
    taiga.stats.sporulations = 9;
    taiga.spores = { level: 1941, available: 2025 };
    checkActOne(taiga);
    disperse(taiga, { to: 'taiga', now: Date.UTC(2026, 9, 1) + 1000 });
    drain();
    const ticker = createNewsTicker();
    // Sin las de los biomas, la piña o el abeto viejo saldrían con el texto del natal: se espera a que
    // lleguen, turno tras turno, aunque las del sotobosque ya estén.
    for (let turn = 0; turn < 50; turn += 1) {
      ticker.update(taiga, turn * NEWS_INTERVAL * 1000);
      expect(text(ticker)).toBe('');
    }
    expect(ensure).toHaveBeenCalledWith('es', true);
  });
});

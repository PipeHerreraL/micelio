// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state.ts';
import { NEWS_INTERVAL } from '../src/data/news.ts';
import { newsEs } from '../src/i18n/news/es.ts';
import { provideNewsCatalog } from '../src/i18n/news/index.ts';
import { createNewsTicker } from '../src/ui/news.ts';

/** Teletipo de noticias con los textos que llegan aparte (src/i18n/news). */

describe('noticias del sotobosque', () => {
  it('sin textos todavía no gasta el turno: en cuanto llegan, sale una noticia sin esperar 20 s', () => {
    const state = createState(3, Date.UTC(2026, 9, 1));
    const ticker = createNewsTicker();
    const text = (): string => ticker.root.querySelector('.news__text')?.textContent ?? '';
    // happy-dom no resuelve el import() del trozo: el primer refresco no encuentra textos.
    ticker.update(state, 0);
    expect(text()).toBe('');
    provideNewsCatalog('es', newsEs);
    ticker.update(state, 100);
    expect(Object.values(newsEs)).toContain(text());
    // Y la siguiente, a los 20 s.
    const first = text();
    ticker.update(state, 100 + (NEWS_INTERVAL - 1) * 1000);
    expect(text()).toBe(first);
  });
});

/**
 * Noticias del sotobosque (PROMPT.md §12): una línea al pie que cambia cada 12 s, elegida
 * entre las noticias que el progreso ya desbloqueó. No es una región aria-live: cambia sola
 * y anunciarla interrumpiría.
 */
import * as num from '../core/num.ts';
import type { GameState } from '../core/state.ts';
import { NEWS, NEWS_INTERVAL, type NewsDef } from '../data/news.ts';
import { t, type MessageKey } from '../i18n/index.ts';
import { h, restartAnimation, setText } from './dom.ts';

function unlocked(state: GameState, def: NewsDef): boolean {
  const c = def.when;
  switch (c.kind) {
    case 'always':
      return true;
    case 'lifetime':
      return num.gte(state.lifetimeEarned, c.amount);
    case 'owned':
      return state.owned[c.id] >= c.count;
    case 'sporulations':
      return state.stats.sporulations >= c.count;
    case 'drops':
      return state.stats.drops >= c.count;
  }
}

export interface NewsTicker {
  root: HTMLElement;
  /** Avanza el reloj del ticker; `now` en ms. */
  update(state: GameState, now: number): void;
}

export function createNewsTicker(): NewsTicker {
  const text = h('p', { class: 'news__text' });
  const root = h('div', { class: 'news' }, [h('p', { class: 'news__label', text: t('news.label') }), text]);
  let nextAt = 0;
  const recent: string[] = [];

  return {
    root,
    update(state, now) {
      if (now < nextAt) return;
      nextAt = now + NEWS_INTERVAL * 1000;
      const pool = NEWS.filter((n) => unlocked(state, n));
      // Al azar entre las desbloqueadas, evitando repetir las últimas que se vieron.
      const fresh = pool.filter((n) => !recent.includes(n.id));
      const candidates = fresh.length > 0 ? fresh : pool;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (!pick) return;
      recent.push(pick.id);
      if (recent.length > Math.min(8, pool.length - 1)) recent.shift();
      setText(text, t(`news.${pick.id}` as MessageKey));
      restartAnimation(text, 'is-fresh');
    },
  };
}

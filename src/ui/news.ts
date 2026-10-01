/**
 * Noticias del sotobosque (PROMPT.md §12): una línea al pie que cambia cada 12 s, elegida
 * entre las noticias que el progreso ya desbloqueó. No es una región aria-live: cambia sola
 * y anunciarla interrumpiría.
 */
import * as num from '../core/num.ts';
import type { GameState } from '../core/state.ts';
import { mappedCount } from '../partners/plasmodium/state.ts';
import { BIOME_NEWS_SHARE, NEWS, NEWS_INTERVAL, type NewsDef } from '../data/news.ts';
import { t, type MessageKey } from '../i18n/index.ts';
import { biomeText } from './biome-text.ts';
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
    case 'biome':
      return (
        state.forest.biome === c.biome &&
        state.spores.level >= (c.level ?? 0) &&
        (c.owned === undefined || state.owned[c.owned.id] >= c.owned.count)
      );
    case 'dispersals':
      return state.forest.leg >= c.count;
    case 'partner': {
      const p = state.partners[c.id];
      return p !== null && (c.mapped === undefined || mappedCount(p) >= c.mapped);
    }
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
      // Al azar entre las desbloqueadas, evitando repetir las últimas que se vieron. En un bioma,
      // la mitad de las veces sale una de las suyas (las del natal son muchas más).
      const fresh = pool.filter((n) => !recent.includes(n.id));
      const local = fresh.filter((n) => n.when.kind === 'biome');
      const candidates =
        local.length > 0 && Math.random() < BIOME_NEWS_SHARE ? local : fresh.length > 0 ? fresh : pool;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (!pick) return;
      recent.push(pick.id);
      if (recent.length > Math.min(8, pool.length - 1)) recent.shift();
      setText(text, biomeText(state, `news.${pick.id}` as MessageKey));
      restartAnimation(text, 'is-fresh');
    },
  };
}

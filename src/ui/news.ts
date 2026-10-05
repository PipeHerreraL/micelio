/**
 * Noticias del sotobosque (PROMPT.md §12): una línea al pie que cambia cada 20 s, elegida
 * entre las noticias que el progreso ya desbloqueó. No es una región aria-live: cambia sola
 * y anunciarla interrumpiría.
 */
import { dispersalCount } from '../core/forest.ts';
import { RETURN_LEG } from '../data/biomes.ts';
import * as num from '../core/num.ts';
import type { GameState } from '../core/state.ts';
import { mappedCount } from '../partners/plasmodium/state.ts';
import { BIOME_NEWS_SHARE, NEWS, NEWS_INTERVAL, type NewsDef } from '../data/news.ts';
import { ensureNewsCatalog, isNewsCatalogReady, newsText } from '../i18n/news/index.ts';
import { getLocale, t } from '../i18n/index.ts';
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
    case 'returned':
      return state.forest.leg >= RETURN_LEG;
  }
}

/**
 * Las noticias de los biomas (i18n/news/biomes) solo hacen falta tras dispersar una vez: cada una pide
 * un destino o una dispersión, o es la versión de otra para un destino (lo comprueba i18n.test). Una
 * partida que no salió del natal no las descarga.
 */
export function needsBiomeNews(state: GameState): boolean {
  return dispersalCount(state) > 0;
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
  /** Cuándo se puede volver a pedir los textos: tras un fallo, no antes del turno siguiente. */
  let retryAt = 0;
  const recent: string[] = [];

  return {
    root,
    update(state, now) {
      if (now < nextAt) return;
      // Los textos llegan aparte (i18n/news). Hasta que lleguen los del idioma activo no se gasta
      // el turno de la noticia ni sale una en el idioma anterior; se vuelve a mirar en el
      // siguiente refresco. Una descarga fallida no se repite en cada refresco (BUG-JOURNAL #17).
      // Tras dispersar también hacen falta las de los biomas: sin ellas, en un destino la piña o el
      // abeto viejo saldrían con su texto del natal.
      const locale = getLocale();
      const biomes = needsBiomeNews(state);
      if (!isNewsCatalogReady(locale, biomes) && now >= retryAt) {
        retryAt = now + NEWS_INTERVAL * 1000;
        void ensureNewsCatalog(locale, biomes).catch(() => undefined);
      }
      if (!isNewsCatalogReady(locale, biomes)) return;
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
      setText(text, newsText(pick.id, state.forest.biome));
      restartAnimation(text, 'is-fresh');
    },
  };
}

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disperse } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import { invalidate } from '../src/core/selectors.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { NEWS_INTERVAL } from '../src/data/news.ts';
import { biomeNewsEs } from '../src/i18n/news/biomes/es.ts';
import { newsEs } from '../src/i18n/news/es.ts';
import { newsText, provideBiomeNewsCatalog, provideNewsCatalog } from '../src/i18n/news/index.ts';
import { checkActOne, checkColonization } from '../src/systems/journey.ts';
import { createNewsTicker } from '../src/ui/news.ts';

/** Teletipo de noticias con los textos que llegan aparte (src/i18n/news). */

const NOW = Date.UTC(2026, 9, 1);

afterEach(() => {
  vi.restoreAllMocks();
  drain();
});

/** En la pradera, tercer destino, construido con acciones (taiga y Chocó colonizados). */
function inPrairie(): GameState {
  const s = createState(51, NOW);
  s.mutations = [...MUTATION_IDS];
  s.achievements = ['own.planetary.1'];
  s.stats.sporulations = 9;
  s.spores = { level: 1941, available: 2025 };
  checkActOne(s);
  const colonize = (now: number): void => {
    s.spores.level = Math.max(s.spores.level, 500);
    checkColonization(s, now);
    invalidate(s);
  };
  disperse(s, { to: 'taiga', now: NOW + 1000 });
  colonize(NOW + 2000);
  disperse(s, { to: 'choco', now: NOW + 3000 });
  colonize(NOW + 4000);
  disperse(s, { to: 'prairie', now: NOW + 5000 });
  return s;
}

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

describe('noticias de los biomas (fase 10)', () => {
  it('en la pradera, en cuanto llegan las noticias de los biomas, sale una de las suyas', () => {
    const state = inPrairie();
    expect(state.forest.biome).toBe('prairie');
    provideNewsCatalog('es', newsEs);
    const ticker = createNewsTicker();
    const text = (): string => ticker.root.querySelector('.news__text')?.textContent ?? '';
    // Con el azar a 0 toca una del bioma, y la primera de las que ya se pueden ver.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    ticker.update(state, 0);
    expect(text()).toBe('');
    provideBiomeNewsCatalog('es', biomeNewsEs);
    ticker.update(state, 100);
    expect(text()).toBe(biomeNewsEs['prairie.arrival']);
  });

  it('en la pradera y la tundra, la piña es una bellota y un arándano, y en el natal sigue siendo una piña', () => {
    provideNewsCatalog('es', newsEs);
    provideBiomeNewsCatalog('es', biomeNewsEs);
    expect(newsText('pineCone', 'prairie')).toBe(
      'Cae una bellota sobre la red. La red la incluye en sus planes.',
    );
    expect(newsText('pineCone', 'tundra')).toBe(
      'Cae un arándano sobre la red. La red lo incluye en sus planes.',
    );
    expect(newsText('pineCone', 'natal')).toBe(newsEs.pineCone);
    // Las del catálogo de los biomas no tienen versión del natal: salen tal cual.
    expect(newsText('postcard', 'natal')).toBe(biomeNewsEs.postcard);
  });
});

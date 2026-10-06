import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buyGenerator } from '../src/core/actions.ts';
import { vowActive } from '../src/core/forest.ts';
import { createState, hasMutation, ownsMutation, type GameState } from '../src/core/state.ts';
import { isFromNewerGame, parseSave, serializeSave, SAVE_VERSION } from '../src/systems/save.ts';
import { GAME_VERSION } from '../src/version.ts';
import { withV7Additions } from './save-v7-additions.ts';

/**
 * Guardado v7 (fase 10): entra entero de una vez, con las claves cuyas reglas llegan después
 * (el ciclo libre, los récords, las adaptaciones de la pradera y la tundra y las cosméticas), que
 * hasta entonces solo valen vacías. Así ninguna v7 escrita por un commit intermedio deja de cargar
 * en la versión final.
 */

const NOW = Date.UTC(2026, 9, 4);
const SAVED_AT = NOW + 15_000;

/** Un estado de hoy sin lo que añade la v7: lo que escribía la 1.5. */
function v6State(state: GameState): Record<string, unknown> {
  const { cycle: _cycle, records: _records, ...rest } = state;
  const biomeAdaptations: Record<string, number> = { ...state.biomeAdaptations };
  for (const id of ['ringFront', 'glomalin', 'pilobolus', 'dwarfBirch', 'snowMold', 'lichen'])
    Reflect.deleteProperty(biomeAdaptations, id);
  const adaptations: Record<string, number> = { ...state.adaptations };
  for (const id of ['sporePrint', 'blackCords', 'waxcaps']) Reflect.deleteProperty(adaptations, id);
  return { ...rest, biomeAdaptations, adaptations };
}

function loads(mutate: (raw: Record<string, unknown>) => void): boolean {
  const raw = JSON.parse(JSON.stringify(createState(3, NOW))) as Record<string, unknown>;
  mutate(raw);
  return parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: SAVED_AT, state: raw })).ok;
}

describe('migración 6 → 7', () => {
  it('solo añade las claves nuevas, vacías: lo demás queda igual', () => {
    const state = createState(5, NOW);
    state.spores = { level: 812, available: 340 };
    state.adaptations.apicalBody = 7;
    state.adaptations.deepTorpor = 2;
    state.seen = ['tab.generators', 'chapter.act1'];
    const v6 = v6State(state);
    const result = parseSave(JSON.stringify({ version: 6, savedAt: SAVED_AT, state: v6 }));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.save.version).toBe(7);
    expect(result.save.state).toEqual(withV7Additions(v6));
    expect(result.save.state).toEqual(state);
  });

  it('un guardado 6 con las adaptaciones rotas sigue rechazándose', () => {
    const v6 = v6State(createState(6, NOW));
    v6.biomeAdaptations = 'nada';
    expect(parseSave(JSON.stringify({ version: 6, savedAt: SAVED_AT, state: v6 }))).toEqual({
      ok: false,
      error: 'invalid',
    });
  });
});

describe('validación de las claves de la v7 en una partida nueva', () => {
  it('una partida nueva va y vuelve idéntica, con el ciclo sin empezar y sin récords', () => {
    const state = createState(7, NOW);
    expect(state.cycle).toEqual({ stays: 0, done: 0, vows: [], woken: [] });
    expect(state.records).toEqual([]);
    const result = parseSave(serializeSave(state, SAVED_AT));
    expect(result).toEqual({
      ok: true,
      save: { version: SAVE_VERSION, savedAt: SAVED_AT, state },
      partnersReset: [],
    });
  });

  it('en una partida nueva no cargan un ciclo empezado, un récord, un voto ni una mutación despierta', () => {
    // El ciclo libre y los votos ya tienen sus reglas (tests/cycle.test.ts y tests/vows.test.ts):
    // solo hay ciclos y récords tras El regreso, y votos en un ciclo empezado.
    expect(loads((s) => Object.assign(s.cycle as object, { stays: 1 }))).toBe(false);
    expect(loads((s) => Object.assign(s.cycle as object, { done: 1 }))).toBe(false);
    expect(loads((s) => Object.assign(s.cycle as object, { vows: ['noRain'] }))).toBe(false);
    expect(loads((s) => Object.assign(s.cycle as object, { woken: ['soilMemory'] }))).toBe(false);
    expect(
      loads((s) => {
        s.records = [{ biome: 'taiga', vows: [], time: 1000, runs: 4, at: NOW }];
      }),
    ).toBe(false);
  });

  it('cada clave nueva que falta, o que no tiene su forma, hace el guardado inválido', () => {
    for (const field of ['cycle', 'records'] as const) {
      expect(
        loads((s) => Reflect.deleteProperty(s, field)),
        field,
      ).toBe(false);
    }
    expect(loads((s) => (s.cycle = []))).toBe(false);
    expect(loads((s) => (s.records = {}))).toBe(false);
    expect(loads((s) => Reflect.deleteProperty(s.biomeAdaptations as object, 'lichen'))).toBe(false);
    expect(loads((s) => Reflect.deleteProperty(s.adaptations as object, 'waxcaps'))).toBe(false);
  });

  it('una cosmética con rango sin el récord de su voto no carga, y la pradera sin visitar no enseña nada; Cuerpo apical sigue sin tope', () => {
    // Las cosméticas piden un récord con su voto (tests/cosmetics.test.ts): una partida nueva no tiene.
    expect(loads((s) => Object.assign(s.adaptations as object, { sporePrint: 1 }))).toBe(false);
    // Las de la pradera y la tundra ya tienen definición (fase 10): rigen las reglas de siempre.
    expect(loads((s) => Object.assign(s.biomeAdaptations as object, { ringFront: 1 }))).toBe(false);
    // Cuerpo apical no tiene tope (max: null): un rango alto es legítimo.
    expect(loads((s) => Object.assign(s.adaptations as object, { apicalBody: 40 }))).toBe(true);
  });
});

describe('guardado v7 del commit 5 de la fase 10 (tests/fixtures/save-v7-c5.json)', () => {
  /**
   * El muro de la 1.5 migrado y guardado por el código que trajo la v7. Desde entonces debe cargar
   * igual en cada versión: los commits siguientes añaden reglas, no claves.
   */
  const text = readFileSync(new URL('./fixtures/save-v7-c5.json', import.meta.url), 'utf8');
  const raw = JSON.parse(text) as { version: number; savedAt: number; game: string; state: GameState };

  it('carga sin cambios ni socios rehechos y vuelve a guardarse idéntico', () => {
    expect(raw.version).toBe(7);
    const result = parseSave(text);
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.partnersReset).toEqual([]);
    expect(result.save.state).toEqual(raw.state);
    expect(JSON.parse(serializeSave(result.save.state, raw.savedAt))).toEqual({ ...raw, game: GAME_VERSION });
  });

  it('es el muro: en el Chocó colonizado tras la taiga, con el plasmodio', () => {
    expect(raw.state.forest).toMatchObject({ biome: 'choco', leg: 2 });
    expect(raw.state.chronicle.map((e) => [e.biome, e.leg])).toEqual([
      ['natal', 0],
      ['taiga', 1],
      ['choco', 2],
    ]);
    expect(raw.state.partners.plasmodium).not.toBeNull();
  });
});

describe('guardado v7 de la 1.6.0 (tests/fixtures/save-v7.json)', () => {
  /**
   * El muro de la 1.5 (save-v7-c5.json) jugado con acciones hasta un ciclo libre a medias, con votos,
   * cargado en el navegador por el build de la 1.6.0, con sus láminas cerradas, y guardado por él (lo
   * que dejó en localStorage, formateado con Prettier como los demás). Es lo que escribirán los
   * jugadores de la versión publicada: las siguientes deben cargarlo sin perder nada.
   */
  const text = readFileSync(new URL('./fixtures/save-v7.json', import.meta.url), 'utf8');
  const raw = JSON.parse(text) as { version: number; savedAt: number; game: string; state: GameState };

  it('carga sin cambios ni socios rehechos y vuelve a guardarse idéntico, con la versión del juego', () => {
    expect([raw.version, raw.game]).toEqual([7, '1.6.0']);
    const result = parseSave(text);
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.partnersReset).toEqual([]);
    expect(result.save.state).toEqual(raw.state);
    expect(JSON.parse(serializeSave(result.save.state, raw.savedAt))).toEqual({ ...raw, game: GAME_VERSION });
  });

  it('es un ciclo libre a medias con votos, mutaciones despiertas, récords con votos y cosméticas', () => {
    const { state } = raw;
    expect(state.forest).toMatchObject({ biome: 'choco', leg: 5 });
    expect(state.chronicle.map((e) => e.biome)).toEqual([
      'natal',
      'taiga',
      'choco',
      'prairie',
      'tundra',
      'natal',
    ]);
    expect(state.cycle).toMatchObject({ stays: 3, done: 2, vows: ['autoOnly', 'noMutations'] });
    expect(state.cycle.woken).toHaveLength(6);
    expect(state.records.map((r) => [r.biome, r.vows])).toEqual([
      ['natal', []],
      ['tundra', ['noRain', 'noMutations']],
    ]);
    expect([state.adaptations.sporePrint, state.adaptations.waxcaps]).toEqual([1, 1]);
    expect([state.biomeAdaptations.glomalin, state.biomeAdaptations.dwarfBirch]).toEqual([1, 1]);
    expect(state.partners.plasmodium).not.toBeNull();
  });

  it('al cargarlo rigen sus votos: el árbol a medio despertar y las compras del jugador negadas', () => {
    const result = parseSave(text);
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    const state = result.save.state;
    expect([hasMutation(state, 'instinct'), hasMutation(state, 'beyondForest')]).toEqual([true, false]);
    expect(ownsMutation(state, 'beyondForest')).toBe(true);
    expect(vowActive(state, 'autoOnly')).toBe(true);
    const before = structuredClone(state);
    buyGenerator(state, { id: 'hypha', amount: 1 });
    expect(state).toEqual(before);
  });

  it('la 1.5 no lo pisa: lo ve escrito por una versión posterior', () => {
    expect(isFromNewerGame(text, '1.5.0')).toBe(true);
    expect(isFromNewerGame(text, '1.6.0')).toBe(false);
  });
});

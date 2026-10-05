import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { disperseBlock, markSeen, sporeGain } from '../src/core/actions.ts';
import { destinations, isActOneClosed, sporeScale, sporulateRequirement } from '../src/core/forest.ts';
import { derived } from '../src/core/selectors.ts';
import type { GameState } from '../src/core/state.ts';
import { DISPERSE_COST } from '../src/data/biomes.ts';
import { SPORE_SOFTCAP_BASE } from '../src/data/prestige.ts';
import { mappedCount } from '../src/partners/plasmodium/state.ts';
import { offlineCapSeconds } from '../src/systems/offline.ts';
import { parseSave, serializeSave } from '../src/systems/save.ts';
import { pendingChapter } from '../src/ui/chapter.ts';
import { GAME_VERSION } from '../src/version.ts';
import { withV7Additions } from './save-v7-additions.ts';

/**
 * Guardados reales de la 1.5 (fase 10): seis partidas que escribió el código de la v1.5.0 jugando
 * solo con acciones (scripts/fixtures-1.5.ts), cada una con lo que la 1.5 calculaba de ella. Una
 * versión nueva que los cargue debe calcular lo mismo: así «quien juega hoy no pierde ninguna
 * cifra» se compara con la 1.5 publicada y no con el código nuevo consigo mismo.
 */

const FIXTURES = [
  'before-act-one',
  'act-one-floor',
  'taiga',
  'choco-colonized',
  'wall',
  'wall-fusion',
] as const;
type Fixture = (typeof FIXTURES)[number];

/** Lo que la 1.5 calculaba de cada guardado, ya cargado. */
interface ValuesOf15 {
  production: number;
  clickValue: number;
  sporeGain: number;
  sporulateRequirement: number;
  sporeScale: number;
  offlineCapSeconds: number;
  disperseBlock: string | null;
}

/** `save-v6-*.values.json`: esos valores, con la versión y el commit que los calcularon. */
interface ValuesFile extends ValuesOf15 {
  game: string;
  commit: string;
}

/**
 * Lo único que cambia a propósito desde la 1.5 (fase 10): en el muro se abren la pradera y la
 * tundra, así que el viaje deja de estar bloqueado por falta de destinos. Lo demás, igual.
 */
const CHANGED_SINCE_15: Partial<Record<Fixture, Partial<ValuesOf15>>> = {
  wall: { disperseBlock: null },
  'wall-fusion': { disperseBlock: null },
};

function fixtureText(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function load(name: Fixture): GameState {
  const result = parseSave(fixtureText(`save-v6-${name}.json`));
  if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
  return result.save.state;
}

function valuesNow(state: GameState): ValuesOf15 {
  const d = derived(state);
  return {
    production: d.production,
    clickValue: d.clickValue,
    sporeGain: sporeGain(state),
    sporulateRequirement: sporulateRequirement(state),
    sporeScale: sporeScale(state),
    offlineCapSeconds: offlineCapSeconds(state),
    disperseBlock: disperseBlock(state),
  };
}

/** Crónica como (bioma, tramo), del Acto I al último bosque colonizado. */
function journeyOf(state: GameState): [string, number][] {
  return state.chronicle.map((e) => [e.biome, e.leg]);
}

describe.each(FIXTURES)('guardado real de la 1.5 «%s»', (name) => {
  it('migra a la v7 solo con las claves nuevas, sin socios rehechos, y se guarda así', () => {
    const text = fixtureText(`save-v6-${name}.json`);
    const raw = JSON.parse(text) as {
      version: number;
      savedAt: number;
      game: string;
      state: Record<string, unknown>;
    };
    expect(raw.game).toBe('1.5.0');
    expect(raw.version).toBe(6);
    const result = parseSave(text);
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.partnersReset).toEqual([]);
    // Campo a campo: lo de la 1.5 tal cual y lo que añade la v7, escrito a mano.
    const v7 = withV7Additions(raw.state);
    expect(result.save.state).toEqual(v7);
    expect(JSON.parse(serializeSave(result.save.state, raw.savedAt))).toEqual({
      ...raw,
      version: 7,
      game: GAME_VERSION,
      state: v7,
    });
  });

  it('da la misma producción, clic, esporas, requisito, escala, tope sin conexión y viaje que la 1.5', () => {
    const values = fixtureText(`save-v6-${name}.values.json`);
    const { game: _game, commit: _commit, ...of15 } = JSON.parse(values) as ValuesFile;
    expect(valuesNow(load(name))).toEqual({ ...of15, ...CHANGED_SINCE_15[name] });
  });
});

describe('cada guardado de la 1.5 es la partida que dice su nombre', () => {
  it('antes del Acto I: en el natal, sin Crónica ni socios', () => {
    const state = load('before-act-one');
    expect(state.forest).toMatchObject({ biome: 'natal', leg: 0 });
    expect(state.chronicle).toEqual([]);
    expect(state.partners.plasmodium).toBeNull();
    expect(state.stats.sporulations).toBeGreaterThan(0);
  });

  it('Acto I cerrado sin dispersar: el suelo de esporas de una partida de la 1.1 sigue rigiendo en el natal', () => {
    const state = load('act-one-floor');
    expect(state.forest).toMatchObject({ biome: 'natal', leg: 0 });
    expect(journeyOf(state)).toEqual([['natal', 0]]);
    expect(state.sporeFloor).toBeGreaterThan(SPORE_SOFTCAP_BASE);
    expect(state.sporeFloor).toBe(state.spores.level);
    expect(derived(state).sporeThreshold).toBe(state.sporeFloor);
  });

  it('en la taiga, primer destino, sin colonizar y con el plasmodio', () => {
    const state = load('taiga');
    expect(state.forest).toMatchObject({ biome: 'taiga', leg: 1 });
    expect(journeyOf(state)).toEqual([['natal', 0]]);
    expect(state.partners.plasmodium).not.toBeNull();
  });

  it('el Chocó primero, colonizado, con la taiga por delante y el viaje pagado', () => {
    const state = load('choco-colonized');
    expect(state.forest).toMatchObject({ biome: 'choco', leg: 1 });
    expect(journeyOf(state)).toEqual([
      ['natal', 0],
      ['choco', 1],
    ]);
    expect(state.spores.available).toBeGreaterThanOrEqual(DISPERSE_COST);
  });

  it('en el muro, la 1.5 no dejaba dispersar por falta de destinos; ahora ofrece la pradera y la tundra', () => {
    for (const name of ['wall', 'wall-fusion'] as const) {
      const of15 = JSON.parse(fixtureText(`save-v6-${name}.values.json`)) as ValuesFile;
      expect(of15.disperseBlock).toBe('noDestination');
      const state = load(name);
      expect(destinations(state)).toEqual(['prairie', 'tundra']);
      expect(disperseBlock(state)).toBeNull();
    }
  });

  it('en el muro, la lámina «Donde acaban los árboles» sale al cargar, sin marca de la migración, y una sola vez', () => {
    const state = load('wall');
    // Las láminas de la 1.5 ya se vieron (también la colonización del Chocó).
    expect(state.seen).toContain('chapter.colonize.choco');
    expect(state.seen).not.toContain('chapter.ring2');
    expect(pendingChapter(state)).toEqual({ kind: 'ring2' });
    markSeen(state, { key: 'chapter.ring2' });
    expect(pendingChapter(state)).toBeNull();
  });

  it('en el muro: taiga y Chocó colonizados, nivel > 1000, linaje ×4 y el plasmodio con dos placas', () => {
    const state = load('wall');
    expect(state.forest).toMatchObject({ biome: 'choco', leg: 2 });
    expect(journeyOf(state)).toEqual([
      ['natal', 0],
      ['taiga', 1],
      ['choco', 2],
    ]);
    expect(isActOneClosed(state)).toBe(true);
    expect(state.spores.level).toBeGreaterThan(1000);
    expect(state.spores.available).toBeGreaterThanOrEqual(DISPERSE_COST);
    expect(derived(state).lineage).toBe(4);
    const p = state.partners.plasmodium;
    expect(p && mappedCount(p)).toBe(2);
  });

  it('en el muro con el plasmodio en la Fusión, la última placa, y la partida en inglés', () => {
    const state = load('wall-fusion');
    expect(state.forest).toMatchObject({ biome: 'choco', leg: 2 });
    expect(journeyOf(state)).toEqual([
      ['natal', 0],
      ['taiga', 1],
      ['choco', 2],
    ]);
    expect(state.spores.level).toBeGreaterThan(1000);
    expect(state.spores.available).toBeGreaterThanOrEqual(DISPERSE_COST);
    expect(state.partners.plasmodium?.plate).toBe(4);
    expect(state.settings.locale).toBe('en');
  });
});

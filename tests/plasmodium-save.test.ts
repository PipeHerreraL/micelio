import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { disperse, sporulate } from '../src/core/actions.ts';
import { drain } from '../src/core/events.ts';
import { createState, type GameState } from '../src/core/state.ts';
import { MUTATION_IDS } from '../src/data/mutations.ts';
import { PLATES } from '../src/data/plasmodium-plates.ts';
import {
  createPlasmodium,
  spreadConductivity,
  startHabituation,
  type PlasmodiumState,
} from '../src/partners/plasmodium/state.ts';
import { checkActOne } from '../src/systems/journey.ts';
import {
  BACKUP_KEY,
  PARTNER_BACKUP_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  importSave,
  exportSave,
  loadGame,
  parseSave,
  saveGame,
  serializeSave,
  type StorageLike,
} from '../src/systems/save.ts';

/**
 * Guardado de los socios (docs/ROADMAP.md, fase 9): la migración 5 → 6, la validación del
 * plasmodio y lo que pasa cuando su bloque no vale (al cargar, al guardar y al importar).
 */

const NOW = Date.UTC(2026, 9, 1);
const SAVED_AT = NOW + 15_000;

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

beforeEach(() => {
  drain();
});

/** Un plasmodio con el Tronco cartografiado y el Laberinto abierto, Rastro y una mejora. */
function richPlasmodium(): PlasmodiumState {
  const p = createPlasmodium(77);
  p.plates[0] = {
    foods: [7, 1, 16, 18],
    lamps: [],
    flow: 1,
    map: { score: 2.9, quality: 0.74, cost: 1.18, tolerance: 0.75, alive: 9, joined: 4 },
  };
  p.plate = 1;
  p.conductivity = spreadConductivity(p, 1);
  p.habituation = startHabituation(1);
  p.plates[1] = { foods: [], lamps: [12], flow: 1, map: null };
  p.trail = 3000;
  p.trailEarned = 5e6;
  p.mapping = 1e5;
  p.stableFor = 12;
  p.goalMet = true;
  p.pulseIn = 2;
  p.moistFor = 4.5;
  p.upgrades.agar = 7;
  p.upgrades.oats = 1;
  p.achievements = ['firstOat', 'log'];
  p.clockMs = 450;
  p.pendingMs = 90_000;
  p.step = 321;
  p.stats = { pulses: 40, placements: 9, modelSeconds: 1900 };
  return p;
}

function withPlasmodium(p: PlasmodiumState | null = richPlasmodium()): GameState {
  const s = createState(5, NOW);
  s.partners.plasmodium = p;
  return s;
}

function textOf(state: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: SAVED_AT, state });
}

function loads(mutate: (p: PlasmodiumState) => void): boolean {
  const p = richPlasmodium();
  mutate(p);
  return parseSave(textOf(withPlasmodium(p))).ok;
}

/** Texto de un guardado de la versión 5 hecho a partir de un estado actual. */
function v5Text(state: GameState): string {
  const { partners: _p, ...rest } = state;
  const { mode: _m, ...autobuy } = state.autobuy;
  return JSON.stringify({ version: 5, savedAt: SAVED_AT, state: { ...rest, autobuy } });
}

describe('migración 5 → 6', () => {
  it('un guardado de la 1.3 carga con los socios sin llegar, la autocompra por umbral y lo demás igual', () => {
    const state = createState(9, NOW);
    state.lifetimeEarned = 4e9;
    state.forest.earned = 4e9;
    state.autobuy.threshold = 0.1;
    state.autobuy.upgrades = true;
    const result = parseSave(v5Text(state));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.save.state).toEqual(state);
    expect(result.save.state.partners).toEqual({ plasmodium: null });
    expect(result.save.state.autobuy.mode).toBe('threshold');
  });

  it('un guardado de la versión 5 sin autocompra válida sigue rechazándose', () => {
    const raw = JSON.parse(v5Text(createState(9, NOW))) as { state: Record<string, unknown> };
    raw.state.autobuy = 'nada';
    expect(parseSave(JSON.stringify(raw))).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('guardado de la 1.4', () => {
  /**
   * Un guardado versión 6 real (tests/fixtures/save-v6.json, hecho con la 1.4). Si la forma del
   * estado cambia sin subir la versión y sin migración, esta prueba falla: así ninguna partida
   * de la 1.4 se pierde al actualizar (crítica de la fase 9, hallazgo 14).
   */
  it('carga sin cambios y vuelve a guardarse idéntico, con el plasmodio y su red', () => {
    const text = readFileSync(new URL('./fixtures/save-v6.json', import.meta.url), 'utf8');
    const raw = JSON.parse(text) as { savedAt: number; state: unknown };
    const result = parseSave(text);
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.partnersReset).toEqual([]);
    expect(result.save.state).toEqual(raw.state);
    expect(result.save.state.partners.plasmodium?.plates[0]?.foods).toEqual([7, 1, 16, 18]);
    expect(JSON.parse(serializeSave(result.save.state, raw.savedAt))).toEqual(JSON.parse(text));
  });
});

describe('validación del plasmodio', () => {
  it('un plasmodio con su placa, su red y sus mapas va y vuelve idéntico', () => {
    const state = withPlasmodium();
    const result = parseSave(serializeSave(state, SAVED_AT));
    expect(result).toEqual({
      ok: true,
      save: { version: SAVE_VERSION, savedAt: SAVED_AT, state },
      partnersReset: [],
    });
  });

  it('un plasmodio recién llegado también va y vuelve idéntico', () => {
    const state = withPlasmodium(createPlasmodium(3));
    const result = parseSave(serializeSave(state, SAVED_AT));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.save.state.partners.plasmodium).toEqual(createPlasmodium(3));
  });

  it('rechaza números no finitos, negativos o fuera de rango en la red y los mapas', () => {
    expect(loads((p) => (p.conductivity[0] = Number.NaN))).toBe(false);
    expect(loads((p) => (p.conductivity[0] = 0))).toBe(false);
    expect(loads((p) => (p.conductivity[0] = 1.5))).toBe(false);
    expect(loads((p) => (p.habituation[0] = -0.1))).toBe(false);
    expect(loads((p) => (p.habituation[0] = 2))).toBe(false);
    expect(loads((p) => Object.assign(p.plates[0]?.map ?? {}, { tolerance: 1.2 }))).toBe(false);
    expect(loads((p) => Object.assign(p.plates[0]?.map ?? {}, { score: Number.POSITIVE_INFINITY }))).toBe(
      false,
    );
    expect(loads((p) => Object.assign(p.plates[0]?.map ?? {}, { alive: 999 }))).toBe(false);
  });

  it('rechaza ids de mejora o de logro desconocidos y niveles por encima del tope', () => {
    expect(loads((p) => (p.upgrades.memory = 2))).toBe(false);
    expect(loads((p) => (p.upgrades.agar = 2.5))).toBe(false);
    expect(loads((p) => Reflect.deleteProperty(p.upgrades, 'agar'))).toBe(false);
    expect(loads((p) => Object.assign(p, { achievements: ['log', 'volar'] }))).toBe(false);
  });

  it('rechaza copos o lámparas repetidos, juntos en un sitio, fijos, bloqueados o por encima del límite', () => {
    expect(loads((p) => Object.assign(p.plates[0] ?? {}, { foods: [7, 7] }))).toBe(false);
    expect(loads((p) => Object.assign(p.plates[2] ?? {}, { foods: [3], lamps: [3] }))).toBe(false);
    // El Laberinto no admite copos; el 0 es un copo fijo.
    expect(loads((p) => Object.assign(p.plates[1] ?? {}, { foods: [5] }))).toBe(false);
    expect(loads((p) => Object.assign(p.plates[1] ?? {}, { lamps: [0] }))).toBe(false);
    // En el Archipiélago, el sitio 4 tiene luz fija.
    expect(loads((p) => Object.assign(p.plates[2] ?? {}, { foods: [4] }))).toBe(false);
    // Tronco: 4 copos + 1 de Avena = 5 como mucho.
    expect(loads((p) => Object.assign(p.plates[0] ?? {}, { foods: [1, 2, 3, 5, 6, 7] }))).toBe(false);
    expect(loads((p) => Object.assign(p.plates[0] ?? {}, { foods: [1, 2, 3, 5, 6] }))).toBe(true);
    expect(loads((p) => Object.assign(p.plates[0] ?? {}, { foods: [20] }))).toBe(false);
  });

  it('rechaza una placa abierta sin la anterior cartografiada y mapas que no forman un prefijo', () => {
    expect(
      loads((p) => {
        p.plate = 2;
        p.conductivity = new Array<number>(PLATES[2]?.edges.length ?? 0).fill(1);
        p.habituation = new Array<number>(PLATES[2]?.x.length ?? 0).fill(0);
      }),
    ).toBe(false);
    expect(
      loads((p) => {
        const map = p.plates[0]?.map ?? null;
        Object.assign(p.plates[2] ?? {}, { map });
      }),
    ).toBe(false);
    expect(loads((p) => (p.plates.length = 4))).toBe(false);
  });

  it('rechaza un pendiente mayor que el tope o con decimales, y un reloj fuera de 0–999', () => {
    expect(loads((p) => (p.pendingMs = 24 * 3600 * 1000 + 1))).toBe(false);
    expect(loads((p) => (p.pendingMs = 10.5))).toBe(false);
    expect(loads((p) => (p.clockMs = 1000))).toBe(false);
    expect(loads((p) => (p.clockMs = -1))).toBe(false);
  });

  it('rechaza un Rastro disponible o una cartografía mayores que el ganado', () => {
    expect(loads((p) => (p.trail = 6e6))).toBe(false);
    expect(loads((p) => (p.mapping = 6e6))).toBe(false);
    expect(loads((p) => (p.trailEarned = -1))).toBe(false);
  });

  it('rechaza contadores fuera de rango', () => {
    expect(loads((p) => (p.stableFor = 61))).toBe(false);
    expect(loads((p) => (p.pulseIn = 4))).toBe(false);
    expect(loads((p) => (p.pulseIn = 1.5))).toBe(false);
    expect(loads((p) => (p.moistFor = 31))).toBe(false);
    expect(loads((p) => (p.lingerFor = 61))).toBe(false);
    expect(loads((p) => (p.rngSeed = 2 ** 32))).toBe(false);
    expect(loads((p) => Object.assign(p, { goalMet: 'sí' }))).toBe(false);
  });

  it('la apertura sola pendiente en una placa sin mapa, o en la última, carga en 0 sin rechazar el guardado', () => {
    // Sin esto, el modelo abría una placa no disponible y cada guardado devolvía el socio a este
    // mismo bloque: su progreso no se guardaba nunca.
    const lingerAfterLoad = (mutate: (p: PlasmodiumState) => void): number | undefined => {
      const p = richPlasmodium();
      mutate(p);
      const result = parseSave(textOf(withPlasmodium(p)));
      if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
      return result.save.state.partners.plasmodium?.lingerFor;
    };
    // El Laberinto, abierto y sin cartografiar.
    expect(lingerAfterLoad((p) => (p.lingerFor = 5))).toBe(0);
    // La Fusión cartografiada: no hay placa siguiente.
    expect(
      lingerAfterLoad((p) => {
        for (const record of p.plates)
          record.map = { score: 2, quality: 0.7, cost: 1.2, tolerance: 0.8, alive: 9, joined: 3 };
        p.plate = 4;
        p.conductivity = spreadConductivity(p, 4);
        p.habituation = startHabituation(4);
        p.lingerFor = 5;
      }),
    ).toBe(0);
    // El Tronco cartografiado y abierto: la espera es legítima y se conserva.
    expect(
      lingerAfterLoad((p) => {
        p.plate = 0;
        p.conductivity = spreadConductivity(p, 0);
        p.habituation = startHabituation(0);
        p.lingerFor = 30;
      }),
    ).toBe(30);
  });

  it('un contador de pasos imposible carga reiniciado en 0 sin rechazar el guardado', () => {
    const stepAfterLoad = (step: number): number | undefined => {
      const p = richPlasmodium();
      p.step = step;
      const result = parseSave(textOf(withPlasmodium(p)));
      if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
      return result.save.state.partners.plasmodium?.step;
    };
    expect(stepAfterLoad(2 ** 53)).toBe(0);
    expect(stepAfterLoad(1e300)).toBe(0);
    expect(stepAfterLoad(1e9)).toBe(1e9);
  });

  it('una red de otra longitud repara la placa abierta sin perder Rastro, mapas ni logros', () => {
    const p = richPlasmodium();
    p.conductivity = p.conductivity.slice(0, 5);
    const result = parseSave(textOf(withPlasmodium(p)));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    const loaded = result.save.state.partners.plasmodium;
    expect(loaded?.conductivity).toEqual(new Array<number>(PLATES[1]?.edges.length ?? 0).fill(1));
    expect(loaded?.habituation).toEqual(startHabituation(1));
    expect(loaded?.stableFor).toBe(0);
    expect(loaded?.step).toBe(0);
    expect(loaded?.trail).toBe(3000);
    expect(loaded?.plates[0]?.map).toEqual(p.plates[0]?.map);
    expect(loaded?.achievements).toEqual(['firstOat', 'log']);
  });

  it('las propiedades desconocidas del socio y las claves de socio desconocidas se descartan', () => {
    const state = withPlasmodium();
    const raw = JSON.parse(textOf(state)) as { state: { partners: Record<string, unknown> } };
    Object.assign(raw.state.partners.plasmodium as object, { trampa: 1 });
    raw.state.partners.claro = { pendingMs: 0 };
    const result = parseSave(JSON.stringify(raw));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.save.state.partners).toEqual({ plasmodium: richPlasmodium() });
  });
});

describe('un socio que no vale', () => {
  function badText(): string {
    const p = richPlasmodium();
    p.trail = 9e9;
    return textOf(withPlasmodium(p));
  }

  it('al cargar, el plasmodio vuelve a empezar, el texto va al respaldo y la red carga entera', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, badText());
    const result = loadGame(storage);
    if (result.kind !== 'loaded') throw new Error(`se esperaba loaded y llegó '${result.kind}'`);
    expect(result.partnersReset).toEqual(['plasmodium']);
    expect(result.save.state.partners.plasmodium).toBeNull();
    expect(result.save.state.lifetimeEarned).toBe(0);
    expect(storage.getItem(BACKUP_KEY)).toBe(badText());
  });

  it('un bloque de socios que no es objeto también deja respaldo y aviso', () => {
    const raw = JSON.parse(textOf(withPlasmodium())) as { state: Record<string, unknown> };
    raw.state.partners = 'roto';
    const text = JSON.stringify(raw);
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, text);
    const result = loadGame(storage);
    if (result.kind !== 'loaded') throw new Error(`se esperaba loaded y llegó '${result.kind}'`);
    expect(result.partnersReset).toEqual(['plasmodium']);
    expect(storage.getItem(BACKUP_KEY)).toBe(text);
    expect(parseSave(text).ok).toBe(false);
  });

  it('un plasmodio inválido en memoria no impide guardar la red: vuelve al último válido', () => {
    const storage = new MemoryStorage();
    const state = withPlasmodium();
    expect(saveGame(storage, state, SAVED_AT)).toBe('saved');
    const good = structuredClone(state.partners.plasmodium);
    state.lifetimeEarned = 123;
    state.forest.earned = 123;
    if (state.partners.plasmodium) state.partners.plasmodium.mapping = 1e300;
    expect(saveGame(storage, state, SAVED_AT + 1000)).toBe('restored');
    // En memoria vuelve el último bloque bueno; la red sigue con lo nuevo.
    expect(state.partners.plasmodium).toEqual(good);
    const loaded = loadGame(storage);
    if (loaded.kind !== 'loaded') throw new Error(`se esperaba loaded y llegó '${loaded.kind}'`);
    expect(loaded.save.state.lifetimeEarned).toBe(123);
    expect(loaded.save.state.partners.plasmodium).toEqual(good);
    expect(storage.getItem(PARTNER_BACKUP_KEY)).toContain('"mapping":1e+300');
  });

  it('sin un bloque bueno anterior, el socio inválido vuelve a null y la red se guarda', () => {
    const storage = new MemoryStorage();
    const state = createState(6, NOW);
    expect(saveGame(storage, state, SAVED_AT)).toBe('saved');
    const p = createPlasmodium(1);
    p.stableFor = 99;
    state.partners.plasmodium = p;
    expect(saveGame(storage, state, SAVED_AT + 1)).toBe('restored');
    expect(state.partners.plasmodium).toBeNull();
  });

  it('una red con un valor imposible sigue sin guardarse', () => {
    const storage = new MemoryStorage();
    const state = withPlasmodium();
    state.nutrients = Number.NaN;
    expect(saveGame(storage, state, SAVED_AT)).toBe('invalid');
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });

  it('importar un guardado con un socio inválido avisa y trae la red', () => {
    const p = richPlasmodium();
    p.trail = 9e9;
    const result = importSave(exportSave(withPlasmodium(p), SAVED_AT));
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.partnersReset).toEqual(['plasmodium']);
    expect(result.save.state.partners.plasmodium).toBeNull();
  });
});

describe('reinicios', () => {
  /** Natal con el Acto I cerrado, una partida que puede esporular y el plasmodio en su placa. */
  function readyState(): GameState {
    const s = createState(21, NOW);
    s.mutations = [...MUTATION_IDS];
    s.achievements = ['own.planetary.1'];
    s.stats.sporulations = 9;
    s.spores = { level: 1941, available: 2025 };
    checkActOne(s);
    s.runEarned = 1e9;
    s.lifetimeEarned = 1e13;
    s.forest.earned = 1e13;
    s.partners.plasmodium = richPlasmodium();
    drain();
    return s;
  }

  it('esporular no toca el estado del plasmodio', () => {
    const s = readyState();
    const before = structuredClone(s.partners);
    sporulate(s, { now: NOW + 5000 });
    expect(s.stats.sporulations).toBe(10);
    expect(s.partners).toEqual(before);
  });

  it('dispersar tampoco', () => {
    const s = readyState();
    const before = structuredClone(s.partners);
    disperse(s, { to: 'taiga', now: NOW + 5000 });
    expect(s.forest.biome).toBe('taiga');
    expect(s.partners).toEqual(before);
  });
});

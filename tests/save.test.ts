import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { createState, type GameState } from '../src/core/state.ts';
import {
  BACKUP_KEY,
  IMPORT_MAX_CHARS,
  SAVE_KEY,
  SAVE_VERSION,
  TAB_KEY,
  claimTab,
  exportSave,
  importSave,
  isTakenByOtherTab,
  loadGame,
  parseSave,
  saveGame,
  serializeSave,
  wipeGame,
  type LoadResult,
  type Migration,
  type SaveFile,
  type StorageLike,
} from '../src/systems/save.ts';

// ---------------------------------------------------------------------------------------
// Utilidades

/** Marca de tiempo fija (ms): la lógica nunca lee el reloj, así que las pruebas tampoco. */
const NOW = 1_700_000_000_000;
/** El guardado se escribe 15 s después de empezar: 1 700 000 000 000 + 15 000. */
const SAVED_AT = 1_700_000_015_000;

/** localStorage en memoria: un Map con la interfaz mínima que usa save.ts. */
class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();

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

/**
 * Almacenamiento lleno: se puede leer lo que ya había, pero cada escritura lanza como lo
 * hace Safari en modo privado o un localStorage sin cuota.
 */
class FullStorage implements StorageLike {
  readonly writes: string[] = [];
  private readonly stored: string | null;

  constructor(stored: string | null = null) {
    this.stored = stored;
  }

  getItem(_key: string): string | null {
    return this.stored;
  }

  setItem(key: string, _value: string): void {
    this.writes.push(key);
    throw new DOMException('cuota superada', 'QuotaExceededError');
  }

  removeItem(_key: string): void {
    throw new DOMException('cuota superada', 'QuotaExceededError');
  }
}

/** Almacenamiento bloqueado por completo (cookies desactivadas): hasta leer lanza. */
class BlockedStorage implements StorageLike {
  getItem(_key: string): string | null {
    throw new DOMException('acceso denegado', 'SecurityError');
  }

  setItem(_key: string, _value: string): void {
    throw new DOMException('acceso denegado', 'SecurityError');
  }

  removeItem(_key: string): void {
    throw new DOMException('acceso denegado', 'SecurityError');
  }
}

/**
 * Una partida avanzada que toca todos los campos del estado, con decimales, listas,
 * efectos activos, una gota en pantalla y ajustes distintos de los de fábrica. Cada
 * llamada devuelve un objeto nuevo: sirve como valor esperado independiente.
 */
function richState(): GameState {
  const s = createState(42, NOW);
  s.nutrients = 1234.5;
  s.runEarned = 5000.25;
  s.lifetimeEarned = 98765.125;
  s.owned.hypha = 12;
  s.owned.mushroom = 3;
  s.upgrades = ['sensitiveTouch'];
  s.spores = { level: 7, available: 2 };
  s.mutations = ['soilMemory'];
  s.achievements = ['own.hypha.1', 'secret.patience'];
  s.effects = [{ kind: 'downpour', remaining: 12.5, duration: 30 }];
  s.rain = { nextIn: 45.5, drop: { x: 0.25, y: 0.75, remaining: 4 } };
  s.autobuy.generators.hypha = true;
  s.autobuy.threshold = 0.1;
  s.autobuy.upgrades = true;
  s.stats = {
    runTime: 3600,
    totalTime: 7200.5,
    startedAt: NOW,
    runStartedAt: NOW + 1000,
    maxNps: 87.75,
    clicks: 150,
    drops: 4,
    sporulations: 1,
    idleClickTime: 12.25,
  };
  s.settings = {
    locale: 'es',
    notation: 'scientific',
    sound: false,
    volume: 0.6,
    reducedMotion: true,
    buyAmount: 'max',
  };
  // Texto con tildes, eñes, diéresis y un carácter por encima de U+00FF (la raya «—»).
  s.seen = ['año', 'pingüino', 'raíz—hifa', 'panel.mutations'];
  s.rngSeed = 123_456_789;
  return s;
}

/** Texto de guardado con el formato actual y un estado modificado por `mutate`. */
function saveTextWith(mutate: (s: GameState) => void): string {
  const s = richState();
  mutate(s);
  return JSON.stringify({ version: SAVE_VERSION, savedAt: SAVED_AT, state: s });
}

/** Base64 calculado con Buffer de Node: una implementación ajena a save.ts. */
function b64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

function expectLoaded(result: LoadResult): SaveFile {
  if (result.kind !== 'loaded') throw new Error(`se esperaba 'loaded' y llegó '${result.kind}'`);
  return result.save;
}

// ---------------------------------------------------------------------------------------
// Claves y formato

describe('claves de almacenamiento', () => {
  it('usa las claves que fija la especificación', () => {
    expect(SAVE_KEY).toBe('micelio:save');
    expect(BACKUP_KEY).toBe('micelio:save:backup');
    expect(TAB_KEY).toBe('micelio:tab');
  });
});

// ---------------------------------------------------------------------------------------
// Guardar y cargar

describe('guardar y cargar', () => {
  it('guardar y cargar devuelve el estado completo idéntico y la marca savedAt', () => {
    const storage = new MemoryStorage();
    expect(saveGame(storage, richState(), SAVED_AT)).toBe('saved');

    const save = expectLoaded(loadGame(storage));
    expect(save).toStrictEqual({ version: SAVE_VERSION, savedAt: SAVED_AT, state: richState() });
  });

  it('una partida nueva recién creada también sobrevive al viaje de ida y vuelta', () => {
    const storage = new MemoryStorage();
    expect(saveGame(storage, createState(7, NOW), NOW)).toBe('saved');

    const save = expectLoaded(loadGame(storage));
    expect(save.savedAt).toBe(NOW);
    expect(save.state).toStrictEqual(createState(7, NOW));
  });

  it('lo escrito en micelio:save es JSON con version, savedAt y state', () => {
    const storage = new MemoryStorage();
    saveGame(storage, richState(), SAVED_AT);

    const text = storage.data.get('micelio:save');
    expect(typeof text).toBe('string');
    const file = JSON.parse(text ?? '') as { version: unknown; savedAt: unknown; state: unknown };
    expect(file.version).toBe(SAVE_VERSION);
    expect(file.savedAt).toBe(SAVED_AT);
    expect(file.state).toStrictEqual(richState());
  });

  it('guardar no modifica el estado que recibe', () => {
    const state = richState();
    saveGame(new MemoryStorage(), state, SAVED_AT);
    expect(state).toStrictEqual(richState());
  });

  it('los números con decimales vuelven exactos', () => {
    const storage = new MemoryStorage();
    const state = richState();
    // 0.1 + 0.2 = 0.30000000000000004 en coma flotante: JSON debe conservar cada bit.
    state.nutrients = 0.1 + 0.2;
    saveGame(storage, state, SAVED_AT);

    const save = expectLoaded(loadGame(storage));
    expect(save.state.nutrients).toBeCloseTo(0.3, 15);
    expect(save.state.nutrients).toBe(0.30000000000000004);
  });

  it('sin guardado previo la carga devuelve empty', () => {
    expect(loadGame(new MemoryStorage())).toStrictEqual({ kind: 'empty' });
  });

  it('sin almacenamiento la carga devuelve unavailable', () => {
    expect(loadGame(null)).toStrictEqual({ kind: 'unavailable' });
  });

  it('si leer el almacenamiento lanza, la carga devuelve unavailable sin lanzar', () => {
    expect(loadGame(new BlockedStorage())).toStrictEqual({ kind: 'unavailable' });
  });

  it('con el almacenamiento lleno saveGame devuelve false sin lanzar', () => {
    const storage = new FullStorage();
    expect(saveGame(storage, richState(), SAVED_AT)).toBe('failed');
    // Lo intentó en la clave correcta.
    expect(storage.writes).toStrictEqual(['micelio:save']);
  });

  it('sin almacenamiento saveGame devuelve false', () => {
    expect(saveGame(null, richState(), SAVED_AT)).toBe('failed');
  });

  it('con el almacenamiento bloqueado saveGame devuelve false sin lanzar', () => {
    expect(saveGame(new BlockedStorage(), richState(), SAVED_AT)).toBe('failed');
  });

  it('un segundo guardado reemplaza al primero', () => {
    const storage = new MemoryStorage();
    saveGame(storage, richState(), NOW);
    const later = richState();
    later.nutrients = 9999;
    saveGame(storage, later, SAVED_AT);

    const save = expectLoaded(loadGame(storage));
    expect(save.savedAt).toBe(SAVED_AT);
    expect(save.state.nutrients).toBe(9999);
  });

  it('borrar la partida quita micelio:save y deja la copia de respaldo', () => {
    const storage = new MemoryStorage();
    storage.setItem('micelio:save:backup', 'copia vieja');
    saveGame(storage, richState(), SAVED_AT);

    wipeGame(storage);
    expect(storage.data.has('micelio:save')).toBe(false);
    expect(storage.data.get('micelio:save:backup')).toBe('copia vieja');
    expect(loadGame(storage)).toStrictEqual({ kind: 'empty' });
  });

  it('borrar la partida con el almacenamiento roto o ausente no lanza', () => {
    expect(() => {
      wipeGame(new FullStorage());
    }).not.toThrow();
    expect(() => {
      wipeGame(null);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------
// Guardados dañados

describe('guardados dañados', () => {
  /** Carga `text` desde un almacenamiento en memoria y comprueba la copia de respaldo. */
  function loadCorrupt(text: string): LoadResult {
    const storage = new MemoryStorage();
    storage.setItem('micelio:save', text);
    const result = loadGame(storage);
    // El texto dañado se copia tal cual, carácter a carácter, para poder recuperarlo.
    expect(storage.data.get('micelio:save:backup')).toBe(text);
    return result;
  }

  it('un JSON roto se carga como corrupt y se copia a la clave de respaldo', () => {
    expect(loadCorrupt('{"version":1,"savedAt":')).toStrictEqual({
      kind: 'corrupt',
      error: 'json',
      backedUp: true,
    });
  });

  it('un texto vacío en micelio:save cuenta como dañado, no como ausente', () => {
    expect(loadCorrupt('')).toStrictEqual({ kind: 'corrupt', error: 'json', backedUp: true });
  });

  it('un JSON que no es un objeto de guardado se carga como corrupt por su forma', () => {
    expect(loadCorrupt('[1,2,3]')).toStrictEqual({ kind: 'corrupt', error: 'shape', backedUp: true });
    expect(loadCorrupt('null')).toStrictEqual({ kind: 'corrupt', error: 'shape', backedUp: true });
    expect(loadCorrupt('"hola"')).toStrictEqual({ kind: 'corrupt', error: 'shape', backedUp: true });
  });

  it('un guardado sin savedAt, con savedAt negativo o sin state es corrupt por su forma', () => {
    const state = richState();
    expect(loadCorrupt(JSON.stringify({ version: 1, state }))).toMatchObject({
      kind: 'corrupt',
      error: 'shape',
    });
    expect(loadCorrupt(JSON.stringify({ version: 1, savedAt: -1, state }))).toMatchObject({
      kind: 'corrupt',
      error: 'shape',
    });
    expect(loadCorrupt(JSON.stringify({ version: 1, savedAt: SAVED_AT }))).toMatchObject({
      kind: 'corrupt',
      error: 'shape',
    });
  });

  it('un NaN escrito literalmente en el texto rompe el JSON y se carga como corrupt', () => {
    const text = saveTextWith((s) => {
      s.nutrients = 777;
    }).replace('"nutrients":777', '"nutrients":NaN');
    expect(text).toContain('"nutrients":NaN');
    expect(loadCorrupt(text)).toStrictEqual({ kind: 'corrupt', error: 'json', backedUp: true });
  });

  it('un NaN que JSON convirtió en null se rechaza como estado inválido', () => {
    // JSON.stringify(NaN) escribe null: el validador debe ver que no es un número.
    const text = saveTextWith((s) => {
      s.nutrients = Number.NaN;
    });
    expect(text).toContain('"nutrients":null');
    expect(loadCorrupt(text)).toStrictEqual({ kind: 'corrupt', error: 'invalid', backedUp: true });
  });

  it('un número que JSON.parse lee como Infinity se rechaza como estado inválido', () => {
    // 1e999 es JSON válido, pero excede el mayor double (~1.8e308) y se lee como Infinity.
    const text = saveTextWith((s) => {
      s.lifetimeEarned = 777;
    }).replace('"lifetimeEarned":777', '"lifetimeEarned":1e999');
    expect(text).toContain('"lifetimeEarned":1e999');
    expect(loadCorrupt(text)).toStrictEqual({ kind: 'corrupt', error: 'invalid', backedUp: true });
  });

  it('las cantidades negativas se rechazan como estado inválido', () => {
    const cases: ((s: GameState) => void)[] = [
      (s) => {
        s.nutrients = -1;
      },
      (s) => {
        s.owned.hypha = -3;
      },
      (s) => {
        s.spores.level = -1;
      },
      (s) => {
        s.stats.clicks = -10;
      },
      (s) => {
        s.stats.maxNps = -0.5;
      },
    ];
    for (const mutate of cases) {
      expect(loadCorrupt(saveTextWith(mutate))).toStrictEqual({
        kind: 'corrupt',
        error: 'invalid',
        backedUp: true,
      });
    }
  });

  it('un conteo de unidades con decimales se rechaza', () => {
    const text = saveTextWith((s) => {
      s.owned.hypha = 2.5;
    });
    expect(loadCorrupt(text)).toMatchObject({ kind: 'corrupt', error: 'invalid' });
  });

  it('un id de mejora desconocido se rechaza como estado inválido', () => {
    const text = saveTextWith((s) => {
      s.upgrades = ['sensitiveTouch', 'mejoraInventada'];
    });
    expect(loadCorrupt(text)).toStrictEqual({ kind: 'corrupt', error: 'invalid', backedUp: true });
  });

  it('ids desconocidos de mutación o de logro se rechazan como estado inválido', () => {
    const badMutation = saveTextWith((s) => {
      (s.mutations as string[]).push('alasDeMurcielago');
    });
    const badAchievement = saveTextWith((s) => {
      s.achievements.push('own.hypha.999');
    });
    expect(loadCorrupt(badMutation)).toMatchObject({ kind: 'corrupt', error: 'invalid' });
    expect(loadCorrupt(badAchievement)).toMatchObject({ kind: 'corrupt', error: 'invalid' });
  });

  it('un generador renombrado con un id desconocido deja al conocido sin conteo y se rechaza', () => {
    const text = saveTextWith((s) => {
      const owned = s.owned as Record<string, number>;
      owned.hyphae = 12;
      delete owned.hypha;
    });
    expect(loadCorrupt(text)).toStrictEqual({ kind: 'corrupt', error: 'invalid', backedUp: true });
  });

  it('un generador desconocido de más nunca llega al estado cargado', () => {
    // Comportamiento actual: el validador reconstruye `owned` solo con los ids conocidos y
    // descarta el resto en vez de rechazar el guardado entero.
    const storage = new MemoryStorage();
    storage.setItem(
      'micelio:save',
      saveTextWith((s) => {
        (s.owned as Record<string, number>).dragon = 5;
      }),
    );
    const save = expectLoaded(loadGame(storage));
    expect(Object.keys(save.state.owned)).not.toContain('dragon');
    expect(save.state.owned).toStrictEqual(richState().owned);
  });

  it('las propiedades desconocidas del estado se descartan al cargar', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'micelio:save',
      saveTextWith((s) => {
        Object.assign(s, { hack: '<img src=x onerror=alert(1)>' });
        Object.assign(s.settings, { theme: 'neón' });
      }),
    );
    const save = expectLoaded(loadGame(storage));
    expect(save.state).toStrictEqual(richState());
  });

  it('cada campo obligatorio que falta hace el guardado inválido', () => {
    const fields = [
      'nutrients',
      'runEarned',
      'lifetimeEarned',
      'owned',
      'upgrades',
      'spores',
      'mutations',
      'achievements',
      'effects',
      'rain',
      'autobuy',
      'stats',
      'settings',
      'seen',
      'rngSeed',
    ] as const;
    for (const field of fields) {
      const text = saveTextWith((s) => {
        Reflect.deleteProperty(s, field);
      });
      expect({ field, result: loadCorrupt(text) }).toStrictEqual({
        field,
        result: { kind: 'corrupt', error: 'invalid', backedUp: true },
      });
    }
  });

  it('un campo anidado que falta hace el guardado inválido', () => {
    const missingIdle = saveTextWith((s) => {
      Reflect.deleteProperty(s.stats, 'idleClickTime');
    });
    const missingVolume = saveTextWith((s) => {
      Reflect.deleteProperty(s.settings, 'volume');
    });
    const missingDrop = saveTextWith((s) => {
      Reflect.deleteProperty(s.rain, 'drop');
    });
    const missingAutobuyFlag = saveTextWith((s) => {
      Reflect.deleteProperty(s.autobuy.generators, 'planetary');
    });
    for (const text of [missingIdle, missingVolume, missingDrop, missingAutobuyFlag]) {
      expect(loadCorrupt(text)).toStrictEqual({ kind: 'corrupt', error: 'invalid', backedUp: true });
    }
  });

  it('valores fuera de rango en ajustes, lluvia o semilla se rechazan', () => {
    const cases: ((s: GameState) => void)[] = [
      (s) => {
        s.settings.volume = 1.5;
      },
      (s) => {
        s.rain.drop = { x: 1.2, y: 0.5, remaining: 3 };
      },
      (s) => {
        // La semilla es un entero de 32 bits sin signo: 2^32 = 4 294 967 296 ya no cabe.
        s.rngSeed = 4_294_967_296;
      },
      (s) => {
        s.seen = ['x'.repeat(65)];
      },
    ];
    for (const mutate of cases) {
      expect(loadCorrupt(saveTextWith(mutate))).toMatchObject({ kind: 'corrupt', error: 'invalid' });
    }
  });

  it('las marcas y mejoras repetidas se cargan una sola vez', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'micelio:save',
      saveTextWith((s) => {
        s.upgrades = ['sensitiveTouch', 'sensitiveTouch'];
        s.seen = ['año', 'año', 'pingüino'];
      }),
    );
    const save = expectLoaded(loadGame(storage));
    expect(save.state.upgrades).toStrictEqual(['sensitiveTouch']);
    expect(save.state.seen).toStrictEqual(['año', 'pingüino']);
  });

  it('si ni la copia de respaldo cabe, devuelve corrupt con backedUp false sin lanzar', () => {
    const storage = new FullStorage('{roto');
    expect(loadGame(storage)).toStrictEqual({ kind: 'corrupt', error: 'json', backedUp: false });
    expect(storage.writes).toStrictEqual(['micelio:save:backup']);
  });

  it('un guardado correcto posterior no borra la copia de respaldo', () => {
    const storage = new MemoryStorage();
    storage.setItem('micelio:save', '{roto');
    expect(loadGame(storage)).toMatchObject({ kind: 'corrupt' });

    saveGame(storage, createState(1, NOW), NOW);
    expect(storage.data.get('micelio:save:backup')).toBe('{roto');
    expect(expectLoaded(loadGame(storage)).state).toStrictEqual(createState(1, NOW));
  });

  it('un guardado de una versión más nueva que el juego va a la copia de respaldo', () => {
    // Un guardado de la versión siguiente a la actual viene de un juego más nuevo.
    const text = JSON.stringify({ version: SAVE_VERSION + 1, savedAt: SAVED_AT, state: richState() });
    expect(loadCorrupt(text)).toStrictEqual({ kind: 'corrupt', error: 'version', backedUp: true });
  });
});

// ---------------------------------------------------------------------------------------
// Migraciones

describe('migraciones', () => {
  it('la migración real 1 → 2 pasa la notación de sufijos (la de antes por defecto) a nombres', () => {
    const v1 = (notation: string): string => {
      const state = richState();
      return JSON.stringify({
        version: 1,
        savedAt: SAVED_AT,
        state: { ...state, settings: { ...state.settings, notation } },
      });
    };
    const fromSuffix = parseSave(v1('suffix'));
    expect(fromSuffix.ok && fromSuffix.save.state.settings.notation).toBe('names');
    expect(fromSuffix.ok && fromSuffix.save.version).toBe(SAVE_VERSION);
    // Quien eligió científica la conserva.
    const fromScientific = parseSave(v1('scientific'));
    expect(fromScientific.ok && fromScientific.save.state.settings.notation).toBe('scientific');
  });

  /**
   * Guardado de la versión 1 de un formato imaginario en el que `stats` aún no tenía
   * `idleClickTime`: la migración 1 → 2 debe añadirlo para que el validador lo acepte.
   */
  function legacyV1Text(): string {
    const current = richState();
    const { idleClickTime: _removed, ...oldStats } = current.stats;
    return JSON.stringify({
      version: 1,
      savedAt: SAVED_AT,
      state: { ...current, stats: oldStats, seen: ['año'] },
    });
  }

  interface MigratingState {
    stats: Record<string, unknown>;
    seen: string[];
  }

  /** Tabla de migraciones de prueba que anota la versión que recibe cada paso. */
  function makeMigrations(calls: number[]): Record<number, Migration> {
    return {
      // 1 → 2: aparece stats.idleClickTime, que arranca en 10 s.
      1: (raw) => {
        calls.push(raw.version as number);
        const state = raw.state as MigratingState;
        return {
          ...raw,
          state: { ...state, stats: { ...state.stats, idleClickTime: 10 }, seen: [...state.seen, 'v2'] },
        };
      },
      // 2 → 3: idleClickTime pasa a contarse en tercios de segundo (se multiplica por 3).
      2: (raw) => {
        calls.push(raw.version as number);
        const state = raw.state as MigratingState;
        const idle = state.stats.idleClickTime as number;
        return {
          ...raw,
          state: {
            ...state,
            stats: { ...state.stats, idleClickTime: idle * 3 },
            seen: [...state.seen, 'v3'],
          },
        };
      },
    };
  }

  it('aplica en orden las migraciones 1 y 2 a un guardado de la versión 1', () => {
    const calls: number[] = [];
    const result = parseSave(legacyV1Text(), makeMigrations(calls), 3);
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);

    // Cada paso recibe el guardado con la versión de la que parte.
    expect(calls).toStrictEqual([1, 2]);
    expect(result.save.version).toBe(3);
    expect(result.save.savedAt).toBe(SAVED_AT);
    // (0 ausente → 10 por la migración 1) × 3 por la migración 2 = 30. En orden inverso no
    // habría valor que multiplicar.
    expect(result.save.state.stats.idleClickTime).toBe(30);
    expect(result.save.state.seen).toStrictEqual(['año', 'v2', 'v3']);
    // El resto del estado pasa intacto.
    expect(result.save.state.nutrients).toBe(1234.5);
    expect(result.save.state.owned.hypha).toBe(12);
  });

  it('un guardado de la versión 2 solo aplica la migración 2', () => {
    const calls: number[] = [];
    const migrations: Record<number, Migration> = {
      1: () => {
        throw new Error('la migración 1 no debía correr');
      },
      2: (raw) => {
        calls.push(raw.version as number);
        return raw;
      },
    };
    const text = JSON.stringify({ version: 2, savedAt: SAVED_AT, state: richState() });
    const result = parseSave(text, migrations, 3);
    expect(result).toStrictEqual({
      ok: true,
      save: { version: 3, savedAt: SAVED_AT, state: richState() },
      partnersReset: [],
    });
    expect(calls).toStrictEqual([2]);
  });

  it('un guardado ya en la versión de destino no pasa por ninguna migración', () => {
    const migrations: Record<number, Migration> = {
      1: () => {
        throw new Error('no debía correr');
      },
    };
    const text = JSON.stringify({ version: 2, savedAt: SAVED_AT, state: richState() });
    expect(parseSave(text, migrations, 2)).toStrictEqual({
      ok: true,
      save: { version: 2, savedAt: SAVED_AT, state: richState() },
      partnersReset: [],
    });
  });

  it('un guardado de una versión más nueva que el destino se rechaza', () => {
    const text = JSON.stringify({ version: 4, savedAt: SAVED_AT, state: richState() });
    expect(parseSave(text, makeMigrations([]), 3)).toStrictEqual({ ok: false, error: 'version' });
  });

  it('versiones que no son enteros positivos se rechazan', () => {
    for (const version of [0, -1, 1.5, '1', null]) {
      const text = JSON.stringify({ version, savedAt: SAVED_AT, state: richState() });
      expect({ version, result: parseSave(text, makeMigrations([]), 3) }).toStrictEqual({
        version,
        result: { ok: false, error: 'version' },
      });
    }
  });

  it('si falta un paso de migración el guardado se rechaza', () => {
    const full = makeMigrations([]);
    const onlyFirst: Record<number, Migration> = { 1: full[1] ?? ((raw) => raw) };
    const onlySecond: Record<number, Migration> = { 2: full[2] ?? ((raw) => raw) };
    expect(parseSave(legacyV1Text(), onlyFirst, 3)).toStrictEqual({ ok: false, error: 'migration' });
    expect(parseSave(legacyV1Text(), onlySecond, 3)).toStrictEqual({ ok: false, error: 'migration' });
  });

  it('una migración que lanza se rechaza sin propagar la excepción', () => {
    const migrations: Record<number, Migration> = {
      1: () => {
        throw new TypeError('campo inesperado');
      },
    };
    expect(parseSave(legacyV1Text(), migrations, 2)).toStrictEqual({ ok: false, error: 'migration' });
  });

  it('una migración que pierde savedAt se rechaza', () => {
    const migrations: Record<number, Migration> = {
      1: (raw) => {
        const { savedAt: _lost, ...rest } = raw;
        return rest;
      },
    };
    expect(parseSave(legacyV1Text(), migrations, 2)).toStrictEqual({ ok: false, error: 'migration' });
  });

  it('si el estado migrado sigue sin ser válido, el error es invalid', () => {
    // Sin la migración que añade idleClickTime, el formato 2 queda incompleto.
    const migrations: Record<number, Migration> = { 1: (raw) => raw };
    expect(parseSave(legacyV1Text(), migrations, 2)).toStrictEqual({ ok: false, error: 'invalid' });
  });

  it('con la tabla real, un guardado actual se lee sin migrar', () => {
    const result = parseSave(serializeSave(richState(), SAVED_AT));
    expect(result).toStrictEqual({
      ok: true,
      save: { version: SAVE_VERSION, savedAt: SAVED_AT, state: richState() },
      partnersReset: [],
    });
  });
});

// ---------------------------------------------------------------------------------------
// Exportar e importar

describe('exportar e importar', () => {
  it('importar lo exportado devuelve el mismo estado y la misma marca de tiempo', () => {
    const text = exportSave(richState(), SAVED_AT);
    expect(importSave(text)).toStrictEqual({
      ok: true,
      save: { version: SAVE_VERSION, savedAt: SAVED_AT, state: richState() },
      partnersReset: [],
    });
  });

  it('lo exportado es Base64 puro, sin caracteres fuera del alfabeto', () => {
    const text = exportSave(richState(), SAVED_AT);
    expect(text).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    // Base64 produce bloques de 4 caracteres.
    expect(text.length % 4).toBe(0);
  });

  it('las tildes, eñes y rayas del estado se codifican como UTF-8 y vuelven intactas', () => {
    const state = richState();
    state.seen = ['año', 'pingüino', 'raíz—hifa'];
    const text = exportSave(state, SAVED_AT);

    // Decodificado con Buffer (ajeno a save.ts): «año» en UTF-8 es 61 C3 B1 6F.
    const bytes = Buffer.from(text, 'base64');
    expect(bytes.includes(Buffer.from([0x61, 0xc3, 0xb1, 0x6f]))).toBe(true);
    // «—» (U+2014) en UTF-8 es E2 80 94.
    expect(bytes.includes(Buffer.from([0xe2, 0x80, 0x94]))).toBe(true);
    expect(bytes.toString('utf8')).toContain('"seen":["año","pingüino","raíz—hifa"]');

    const result = importSave(text);
    if (!result.ok) throw new Error(`se esperaba ok y llegó '${result.error}'`);
    expect(result.save.state.seen).toStrictEqual(['año', 'pingüino', 'raíz—hifa']);
    expect(result.save.state).toStrictEqual(state);
  });

  it('importa un Base64 de un guardado escrito por otra implementación', () => {
    const text = b64(serializeSave(richState(), SAVED_AT));
    expect(importSave(text)).toStrictEqual({
      ok: true,
      save: { version: SAVE_VERSION, savedAt: SAVED_AT, state: richState() },
      partnersReset: [],
    });
  });

  it('los espacios y saltos de línea que añade el portapapeles no impiden importar', () => {
    const text = exportSave(richState(), SAVED_AT);
    const wrapped = `  ${text.slice(0, 40)}\n${text.slice(40, 90)}\r\n\t${text.slice(90)}  \n`;
    expect(importSave(wrapped)).toStrictEqual({
      ok: true,
      save: { version: SAVE_VERSION, savedAt: SAVED_AT, state: richState() },
      partnersReset: [],
    });
  });

  it('un texto vacío o solo con espacios da el error empty', () => {
    expect(importSave('')).toStrictEqual({ ok: false, error: 'empty' });
    expect(importSave('   \n\t  ')).toStrictEqual({ ok: false, error: 'empty' });
  });

  it('un texto de más de 200 000 caracteres da el error tooLarge sin decodificarlo', () => {
    expect(IMPORT_MAX_CHARS).toBe(200_000);
    expect(importSave('A'.repeat(200_001))).toStrictEqual({ ok: false, error: 'tooLarge' });
  });

  it('un texto de exactamente 200 000 caracteres no se rechaza por tamaño', () => {
    // 200 000 «A» son Base64 válido (200 000 / 4 = 50 000 bloques) de 150 000 bytes nulos,
    // que no son JSON.
    expect(importSave('A'.repeat(200_000))).toStrictEqual({ ok: false, error: 'json' });
  });

  it('los espacios no cuentan para el tope de tamaño', () => {
    const text = exportSave(richState(), SAVED_AT);
    const padded = `${' '.repeat(200_001)}${text}`;
    expect(importSave(padded)).toMatchObject({ ok: true });
  });

  it('un texto que no es Base64 da el error base64', () => {
    expect(importSave('¡esto no es base64!')).toStrictEqual({ ok: false, error: 'base64' });
    // Base64url usa «-» y «_», que atob no acepta.
    expect(importSave('ab-_')).toStrictEqual({ ok: false, error: 'base64' });
    // Cinco caracteres: un bloque y un carácter suelto que no codifica ningún byte.
    expect(importSave('abcde')).toStrictEqual({ ok: false, error: 'base64' });
  });

  it('un Base64 válido de bytes que no son UTF-8 da el error encoding', () => {
    // «//4=» son los bytes FF FE: 111111 111111 111000 → «/», «/», «4» y relleno.
    expect(importSave('//4=')).toStrictEqual({ ok: false, error: 'encoding' });
  });

  it('un Base64 válido de un texto que no es JSON da el error json', () => {
    // «hola» = 68 6F 6C 61 → «aG9sYQ==».
    expect(importSave('aG9sYQ==')).toStrictEqual({ ok: false, error: 'json' });
  });

  it('un Base64 válido de un JSON con la forma equivocada da el error shape', () => {
    // «[1,2]» = 5B 31 2C 32 5D → «WzEsMl0=».
    expect(importSave('WzEsMl0=')).toStrictEqual({ ok: false, error: 'shape' });
    expect(importSave(b64('{"version":1,"state":{}}'))).toStrictEqual({ ok: false, error: 'shape' });
  });

  it('un Base64 válido de un guardado con estado inválido da el error invalid', () => {
    expect(importSave(b64('{"version":1,"savedAt":0,"state":{}}'))).toStrictEqual({
      ok: false,
      error: 'invalid',
    });
    const negative = saveTextWith((s) => {
      s.nutrients = -100;
    });
    expect(importSave(b64(negative))).toStrictEqual({ ok: false, error: 'invalid' });
  });

  it('un Base64 válido de un guardado de una versión futura da el error version', () => {
    const future = JSON.stringify({ version: 99, savedAt: SAVED_AT, state: richState() });
    expect(importSave(b64(future))).toStrictEqual({ ok: false, error: 'version' });
  });

  it('ningún texto inválido hace lanzar a importSave', () => {
    const inputs = ['', ' ', '====', 'A', '\u0000', '😀', '{}', 'e30=', 'bnVsbA==', 'A'.repeat(200_001)];
    for (const input of inputs) {
      expect(() => importSave(input)).not.toThrow();
      expect(importSave(input).ok).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------
// Dos pestañas

describe('dos pestañas', () => {
  it('claimTab escribe el id de la pestaña en micelio:tab', () => {
    const storage = new MemoryStorage();
    claimTab(storage, 'tab-a');
    expect(storage.data.get('micelio:tab')).toBe('tab-a');
  });

  it('la última pestaña en reclamar se queda con el guardado', () => {
    const storage = new MemoryStorage();
    claimTab(storage, 'tab-a');
    claimTab(storage, 'tab-b');
    expect(storage.data.get('micelio:tab')).toBe('tab-b');
  });

  it('claimTab no lanza sin almacenamiento o con el almacenamiento lleno', () => {
    expect(() => {
      claimTab(null, 'tab-a');
    }).not.toThrow();
    const full = new FullStorage();
    expect(() => {
      claimTab(full, 'tab-a');
    }).not.toThrow();
    expect(full.writes).toStrictEqual(['micelio:tab']);
  });

  it('otra pestaña que escribe su id en micelio:tab toma el guardado', () => {
    expect(isTakenByOtherTab('micelio:tab', 'tab-b', 'tab-a')).toBe(true);
  });

  it('el evento de la propia pestaña no cuenta como toma', () => {
    expect(isTakenByOtherTab('micelio:tab', 'tab-a', 'tab-a')).toBe(false);
  });

  it('borrar micelio:tab no cuenta como toma', () => {
    expect(isTakenByOtherTab('micelio:tab', null, 'tab-a')).toBe(false);
  });

  it('los cambios en otras claves no cuentan como toma', () => {
    expect(isTakenByOtherTab('micelio:save', 'tab-b', 'tab-a')).toBe(false);
    expect(isTakenByOtherTab('micelio:save:backup', 'tab-b', 'tab-a')).toBe(false);
  });

  it('vaciar todo el almacenamiento (clave null) no cuenta como toma', () => {
    // localStorage.clear() dispara un evento storage con key null.
    expect(isTakenByOtherTab(null, null, 'tab-a')).toBe(false);
  });

  it('el evento que produce claimTab en otra pestaña se detecta como toma', () => {
    const storage = new MemoryStorage();
    claimTab(storage, 'tab-b');
    const newValue = storage.getItem('micelio:tab');
    expect(isTakenByOtherTab('micelio:tab', newValue, 'tab-a')).toBe(true);
    expect(isTakenByOtherTab('micelio:tab', newValue, 'tab-b')).toBe(false);
  });
});

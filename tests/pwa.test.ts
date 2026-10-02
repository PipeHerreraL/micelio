import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  serviceWorkerSource,
  serviceWorkerVersion,
  shouldPrecache,
  type ServiceWorkerOptions,
} from '../scripts/service-worker.ts';

/** App instalable (ARCHITECTURE.md §4.31): manifiesto, iconos y service worker. */

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

const manifest = JSON.parse(
  readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
) as {
  id: string;
  name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: ManifestIcon[];
};

/** Ancho y alto de un PNG, de su cabecera IHDR. */
function pngSize(path: string): [number, number] {
  const data = readFileSync(new URL(`../public/${path}`, import.meta.url));
  expect(data.subarray(1, 4).toString('ascii'), path).toBe('PNG');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

describe('manifiesto e iconos', () => {
  it('se instala como app a pantalla completa desde la raíz del juego', () => {
    // El id se resuelve contra el origen, no contra el manifiesto: «./» sería todo
    // pipeherreral.github.io. No se puede cambiar una vez instalada.
    expect(manifest.id).toBe('/micelio/');
    expect(manifest.name).toBe('Micelio');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.display).toBe('standalone');
  });

  it('cada icono existe y mide lo que dice; hay uno de 512 «maskable» para Android', () => {
    for (const icon of manifest.icons) {
      if (icon.type === 'image/svg+xml') continue;
      const [w, h] = pngSize(icon.src);
      expect(`${String(w)}x${String(h)}`, icon.src).toBe(icon.sizes);
    }
    expect(manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true);
    expect(pngSize('icons/apple-touch-icon.png')).toEqual([180, 180]);
  });

  it('index.html enlaza el manifiesto y el icono del iPhone con la ruta base', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('href="%BASE_URL%manifest.webmanifest"');
    expect(html).toContain('href="%BASE_URL%icons/apple-touch-icon.png"');
  });
});

describe('service worker', () => {
  it('guarda todo lo del juego salvo lo que no hace falta sin conexión', () => {
    expect(shouldPrecache('index.html')).toBe(true);
    expect(shouldPrecache('assets/plasmodium-view-abc.js')).toBe(true);
    expect(shouldPrecache('assets/source-sans-3-latin-400-normal-x.woff2')).toBe(true);
    expect(shouldPrecache('assets/source-sans-3-latin-400-normal-x.woff')).toBe(false);
    expect(shouldPrecache('.vite/manifest.json')).toBe(false);
    expect(shouldPrecache('sw.js')).toBe(false);
  });

  it('el código generado es JavaScript válido y nombra cada archivo y su versión', () => {
    const source = serviceWorkerSource({
      version: 'abc123',
      files: ['index.html', 'assets/a.js'],
      entry: 'assets/a.js',
    });
    // Compilar sin ejecutar: un error de sintaxis dejaría el juego sin service worker.
    expect(() => new Script(source)).not.toThrow();
    expect(source).toContain("'micelio-abc123'");
    expect(source).toContain('"./assets/a.js"');
    // Nunca se salta la espera: una página abierta no se queda sin los trozos de su versión.
    expect(source).not.toContain('skipWaiting');
    // Sin ignoreVary, Chromium no encontraba los scripts de módulo en la caché (piden con Origin).
    expect(source).toContain('ignoreVary: true');
  });

  it('la versión cambia con la lista o con lo que no lleva hash, y no con el orden de la lista', () => {
    const icon = new Uint8Array([1, 2, 3]);
    const v = serviceWorkerVersion(['a', 'b'], ['<html>', icon]);
    expect(serviceWorkerVersion(['b', 'a'], ['<html>', icon])).toBe(v);
    expect(serviceWorkerVersion(['a', 'c'], ['<html>', icon])).not.toBe(v);
    expect(serviceWorkerVersion(['a', 'b'], ['<html lang>', icon])).not.toBe(v);
    // Un icono nuevo con el mismo nombre también da otra versión: si no, nadie lo recibiría.
    expect(serviceWorkerVersion(['a', 'b'], ['<html>', new Uint8Array([1, 2, 4])])).not.toBe(v);
  });
});

// ---------------------------------------------------------------------------------------
// El service worker por dentro: su código corre en una caja con la caché y la red simuladas.

const ORIGIN = 'https://juego.test';
const ENTRY = 'assets/index-abc.js';
const PAGE = `<script type="module" src="/micelio/${ENTRY}"></script>`;

interface FakeResponse {
  body: string;
  text(): Promise<string>;
}

function response(body: string): FakeResponse {
  return { body, text: () => Promise.resolve(body) };
}

interface WorkerEnv {
  /** Lo que devuelve el servidor (o un error de red si no hay entrada). */
  server?: Record<string, string>;
  /** La red nunca responde (señal débil). */
  hang?: boolean;
  /** La caché del navegador falla al leer. */
  brokenCache?: boolean;
}

/** Arranca el service worker de `options` y devuelve cómo hablarle. */
function startWorker(env: WorkerEnv, options: Partial<ServiceWorkerOptions> = {}) {
  const stored = new Map<string, FakeResponse>();
  const requested: { url: string; cache?: string }[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const resolveUrl = (target: string | { url: string }): string =>
    new URL(typeof target === 'string' ? target : target.url, `${ORIGIN}/micelio/sw.js`).href;
  const fetchFake = (target: string | { url: string }): Promise<FakeResponse> => {
    if (env.hang) return new Promise(() => undefined);
    const path = new URL(resolveUrl(target)).pathname.replace('/micelio/', '');
    const body = env.server?.[path === '' ? 'index.html' : path];
    return body === undefined
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve(response(body));
  };
  const cache = {
    addAll: async (requests: { url: string; cache?: string }[]) => {
      for (const request of requests) {
        requested.push(request);
        stored.set(resolveUrl(request), await fetchFake(request));
      }
    },
    match: (target: string) => Promise.resolve(stored.get(resolveUrl(target))),
  };
  const context = {
    self: {
      location: { origin: ORIGIN },
      clients: { claim: () => Promise.resolve() },
      addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    },
    caches: {
      open: () => Promise.resolve(cache),
      keys: () => Promise.resolve([]),
      match: (target: string | { url: string }) =>
        env.brokenCache
          ? Promise.reject(new Error('Unexpected internal error'))
          : Promise.resolve(stored.get(resolveUrl(target))),
    },
    fetch: fetchFake,
    Request: class {
      readonly url: string;
      readonly cache: string | undefined;
      constructor(url: string, init?: { cache?: string }) {
        this.url = url;
        this.cache = init?.cache;
      }
    },
    Response: { error: () => response('error de red') },
    URL,
    setTimeout,
    clearTimeout,
  };
  const source = serviceWorkerSource({
    version: 'v1',
    files: ['index.html', ENTRY],
    entry: ENTRY,
    ...options,
  });
  new Script(source).runInNewContext(context);
  return {
    stored,
    requested,
    install(): Promise<unknown> {
      let done: Promise<unknown> = Promise.resolve();
      listeners.get('install')?.({ waitUntil: (p: Promise<unknown>) => (done = p) });
      return done;
    },
    async open(path: string, mode = 'navigate'): Promise<string> {
      let answer: Promise<FakeResponse> | undefined;
      listeners.get('fetch')?.({
        request: { method: 'GET', url: `${ORIGIN}/micelio/${path}`, mode },
        respondWith: (p: Promise<FakeResponse>) => (answer = p),
      });
      if (!answer) throw new Error('El service worker no respondió');
      return (await answer).body;
    },
  };
}

describe('service worker por dentro', () => {
  it('al instalarse pide cada archivo al servidor, no a la caché HTTP', async () => {
    const worker = startWorker({ server: { 'index.html': PAGE, [ENTRY]: 'js' } });
    await worker.install();
    expect(worker.requested.map((r) => r.cache)).toEqual(['reload', 'reload']);
    expect(worker.stored.size).toBe(2);
  });

  it('no se instala si el servidor aún da el index.html de otra versión', async () => {
    // Sin conexión, ese index.html pediría scripts que no están en la caché: pantalla en blanco.
    const worker = startWorker({
      server: { 'index.html': '<script src="/micelio/assets/index-viejo.js">', [ENTRY]: 'js' },
    });
    await expect(worker.install()).rejects.toThrow('otra versión');
  });

  it('sin red, la página sale de la copia guardada', async () => {
    const env: WorkerEnv = { server: { 'index.html': PAGE, [ENTRY]: 'js' } };
    const worker = startWorker(env);
    await worker.install();
    env.server = {};
    expect(await worker.open('')).toBe(PAGE);
  });

  it('si la red no responde, la página sale de la copia pasado el plazo', async () => {
    const env: WorkerEnv = { server: { 'index.html': PAGE, [ENTRY]: 'js' } };
    const worker = startWorker(env, { navigationTimeoutMs: 20 });
    await worker.install();
    env.hang = true;
    expect(await worker.open('')).toBe(PAGE);
  });

  it('con red, la página siempre es la del servidor', async () => {
    const env: WorkerEnv = { server: { 'index.html': PAGE, [ENTRY]: 'js' } };
    const worker = startWorker(env);
    await worker.install();
    env.server = { 'index.html': 'versión nueva' };
    expect(await worker.open('')).toBe('versión nueva');
  });

  it('si la caché del navegador falla, los archivos llegan de la red', async () => {
    // Antes, todo daba error de red y el juego no abría ni con conexión.
    const worker = startWorker({ server: { [ENTRY]: 'js de la red' }, brokenCache: true });
    expect(await worker.open(ENTRY, 'no-cors')).toBe('js de la red');
  });
});

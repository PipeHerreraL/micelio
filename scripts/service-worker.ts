/**
 * Service worker de la app instalable (ARCHITECTURE.md §4.31). Lo genera el build (vite.config.ts)
 * con la lista exacta de archivos, para jugar sin conexión. Sin dependencias: Workbox haría lo
 * mismo con mucho más código.
 *
 * - Al instalarse guarda en caché todo el juego (los trozos que llegan aparte también), pedido de
 *   nuevo al servidor y no a la caché HTTP, y comprueba que index.html es el de su versión.
 * - Páginas: primero la red (con conexión siempre se ve la última versión publicada) y, sin red o
 *   si no responde en unos segundos, la copia guardada.
 * - Lo demás (archivos con hash en el nombre, iconos): primero la caché; si la caché falla, la red.
 * - Un service worker nuevo espera a que se cierre el juego para activarse (sin skipWaiting): una
 *   página abierta nunca se queda sin los trozos de su versión a mitad de partida.
 * - Nunca toca el guardado (localStorage).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Lo que no hace falta sin conexión: el manifiesto de Vite, mapas y las .woff (hay .woff2). */
export function shouldPrecache(file: string): boolean {
  return !file.startsWith('.vite/') && !file.endsWith('.map') && !file.endsWith('.woff') && file !== 'sw.js';
}

export interface ServiceWorkerOptions {
  version: string;
  /** Lo que se guarda, con rutas relativas a la raíz del sitio. */
  files: readonly string[];
  /** Script de entrada de esta versión: su index.html tiene que nombrarlo. */
  entry: string;
  /** Cuánto se espera a la red al abrir el juego antes de usar la copia guardada (ms). */
  navigationTimeoutMs?: number;
}

/** Código del service worker. */
export function serviceWorkerSource({
  version,
  files,
  entry,
  navigationTimeoutMs = 4000,
}: ServiceWorkerOptions): string {
  const list = JSON.stringify(files.map((f) => `./${f}`));
  return `/* Generado por scripts/service-worker.ts: no editar. */
const CACHE = 'micelio-${version}';
const FILES = ${list};
const ENTRY = ${JSON.stringify(entry)};
const NAVIGATION_TIMEOUT_MS = ${String(navigationTimeoutMs)};
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // cache: 'reload': sin él, addAll toma lo que haya en la caché HTTP (GitHub Pages da 10
      // minutos) y con dos despliegues seguidos guardaba el index.html del anterior.
      await cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' })));
      // Si el servidor aún da el index.html de otra versión, esta no se instala (se reintenta en
      // la próxima visita): sin conexión, sus scripts no estarían en la caché.
      const page = await cache.match('./index.html');
      if (!page || !(await page.text()).includes(ENTRY)) throw new Error('index.html de otra versión');
    }),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('micelio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // ignoreVary: los scripts de módulo piden con Origin y la precarga no; con «Vary: Origin» del
  // servidor, Chromium no los encontraba y sin conexión el juego no arrancaba. Una caché que falla
  // (el navegador la dañó) cuenta como vacía: con conexión el juego sigue abriendo.
  const cached = (target) => caches.match(target, { ignoreVary: true }).catch(() => undefined);
  if (request.mode === 'navigate') {
    // Con señal débil la red puede tardar decenas de segundos en fallar: pasado el plazo, la copia.
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const settle = (response) => {
          if (settled || !response) return;
          settled = true;
          resolve(response);
        };
        const timer = setTimeout(() => cached('./index.html').then(settle), NAVIGATION_TIMEOUT_MS);
        fetch(request).then(
          (response) => {
            clearTimeout(timer);
            settle(response);
          },
          () => {
            clearTimeout(timer);
            cached('./index.html').then((hit) => settle(hit || Response.error()));
          },
        );
      }),
    );
    return;
  }
  event.respondWith(cached(request).then((hit) => hit || fetch(request)));
});
`;
}

/**
 * Versión: un resumen de la lista y del contenido de lo que no lleva hash en el nombre (index.html
 * y lo de public/). Si solo cambiara un icono, sin esto sw.js saldría igual y quien ya tiene el
 * juego instalado seguiría viendo el viejo, que se sirve primero de la caché.
 */
export function serviceWorkerVersion(
  files: readonly string[],
  unhashed: readonly (string | Uint8Array)[],
): string {
  const hash = createHash('sha256').update([...files].sort().join('\n'));
  for (const content of unhashed) hash.update(createHash('sha256').update(content).digest());
  return hash.digest('hex').slice(0, 12);
}

function listPublic(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? listPublic(path, root)
      : [relative(root, path).split(sep).join('/')];
  });
}

/** Plugin de Vite: escribe sw.js junto a index.html con todo lo del build y lo de public/. */
export function serviceWorkerPlugin(publicDir: string): Plugin {
  return {
    name: 'micelio-service-worker',
    apply: 'build',
    // Al final: index.html lo emite el plugin de HTML de Vite en su propio generateBundle; antes,
    // la lista salía sin la página y sin conexión no se podía abrir el juego.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      const html = index?.type === 'asset' ? String(index.source) : '';
      const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry);
      if (!entry) this.error('El build no tiene script de entrada.');
      const publicFiles = listPublic(publicDir).filter(shouldPrecache).sort();
      const files = [...Object.keys(bundle), ...publicFiles].filter(shouldPrecache).sort();
      const unhashed = [html, ...publicFiles.map((file) => readFileSync(join(publicDir, file)))];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource({
          version: serviceWorkerVersion(files, unhashed),
          files,
          entry: entry.fileName,
        }),
      });
    },
  };
}

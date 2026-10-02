/**
 * Service worker de la app instalable (ARCHITECTURE.md §4.31). Lo genera el build (vite.config.ts)
 * con la lista exacta de archivos, para jugar sin conexión. Sin dependencias: Workbox haría lo
 * mismo con mucho más código.
 *
 * - Al instalarse guarda en caché todo el juego (los trozos que llegan aparte también).
 * - Páginas: primero la red (con conexión siempre se ve la última versión publicada) y, sin red,
 *   la copia guardada.
 * - Lo demás (archivos con hash en el nombre, iconos): primero la caché.
 * - Un service worker nuevo espera a que se cierre el juego para activarse (sin skipWaiting): una
 *   página abierta nunca se queda sin los trozos de su versión a mitad de partida.
 * - Nunca toca el guardado (localStorage).
 */
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Lo que no hace falta sin conexión: el manifiesto de Vite, mapas y las .woff (hay .woff2). */
export function shouldPrecache(file: string): boolean {
  return !file.startsWith('.vite/') && !file.endsWith('.map') && !file.endsWith('.woff') && file !== 'sw.js';
}

/** Código del service worker para `files` (rutas relativas a la raíz del sitio). */
export function serviceWorkerSource(version: string, files: readonly string[]): string {
  const list = JSON.stringify(files.map((f) => `./${f}`));
  return `/* Generado por scripts/service-worker.ts: no editar. */
const CACHE = 'micelio-${version}';
const FILES = ${list};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
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
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('./index.html', { ignoreVary: true }).then((hit) => hit || Response.error()),
      ),
    );
    return;
  }
  // ignoreVary: los scripts de módulo piden con Origin y la precarga no; con «Vary: Origin» del
  // servidor, Chromium no los encontraba y sin conexión el juego no arrancaba.
  event.respondWith(caches.match(request, { ignoreVary: true }).then((hit) => hit || fetch(request)));
});
`;
}

/** Versión: un resumen de la lista y del contenido de index.html (los demás llevan hash en el nombre). */
export function serviceWorkerVersion(files: readonly string[], indexHtml: string): string {
  return createHash('sha256')
    .update([...files].sort().join('\n'))
    .update(indexHtml)
    .digest('hex')
    .slice(0, 12);
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
      const files = [...Object.keys(bundle), ...listPublic(publicDir)].filter(shouldPrecache).sort();
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(serviceWorkerVersion(files, html), files),
      });
    },
  };
}

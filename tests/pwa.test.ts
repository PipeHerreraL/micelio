import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { serviceWorkerSource, serviceWorkerVersion, shouldPrecache } from '../scripts/service-worker.ts';

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
    const source = serviceWorkerSource('abc123', ['index.html', 'assets/a.js']);
    // Compilar sin ejecutar: un error de sintaxis dejaría el juego sin service worker.
    expect(() => new Script(source)).not.toThrow();
    expect(source).toContain("'micelio-abc123'");
    expect(source).toContain('"./assets/a.js"');
    // Nunca se salta la espera: una página abierta no se queda sin los trozos de su versión.
    expect(source).not.toContain('skipWaiting');
    // Sin ignoreVary, Chromium no encontraba los scripts de módulo en la caché (piden con Origin).
    expect(source).toContain('ignoreVary: true');
  });

  it('la versión cambia con la lista o con index.html, y no con el orden', () => {
    const v = serviceWorkerVersion(['a', 'b'], '<html>');
    expect(serviceWorkerVersion(['b', 'a'], '<html>')).toBe(v);
    expect(serviceWorkerVersion(['a', 'c'], '<html>')).not.toBe(v);
    expect(serviceWorkerVersion(['a', 'b'], '<html lang>')).not.toBe(v);
  });
});

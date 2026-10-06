/**
 * micelio-bundle.json, en la raíz del build de la app (ARCHITECTURE.md §4.34): la versión del juego
 * y el nivel nativo que necesita (`minNative`, el `level` de android/native.json del árbol del que
 * salió). La app lo lee del paquete de su .apk y del de cada carpeta descargada antes de servirlos,
 * comprueba que el de un zip dice lo mismo que su manifiesto firmado, y scripts/ota-pack.ts lo copia
 * al payload. Solo en `--mode native`: en la web no sirve de nada.
 */
import type { Plugin } from 'vite';

export const BUNDLE_INFO_FILE = 'micelio-bundle.json';

export function bundleInfoSource(version: string, minNative: number): string {
  return JSON.stringify({ version, minNative });
}

export function nativeBundlePlugin(version: string, minNative: number): Plugin {
  return {
    name: 'micelio-bundle',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: BUNDLE_INFO_FILE,
        source: bundleInfoSource(version, minNative),
      });
    },
  };
}

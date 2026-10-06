/**
 * El nivel nativo de la app de Android (ARCHITECTURE.md §4.34). `android/native.json` dice qué nivel
 * de la parte nativa (el Java, el manifiesto, Gradle y Capacitor) tiene este árbol: Gradle lo pone en
 * `BuildConfig.NATIVE_LEVEL` y el build de la app lo escribe como `minNative` en su
 * micelio-bundle.json (scripts/native-bundle.ts). Una app no usa un paquete descargado que pida un
 * nivel mayor que el suyo: ese paquete necesita otro .apk.
 *
 * La huella resume esa parte nativa. Si cambia, tests/native-surface.test.ts falla y obliga a decidir
 * si la web nueva necesita el cambio (se sube `level`) o no; la huella no decide sola.
 *
 * - Solo lo que sigue git, o seguiría en el siguiente commit (`git ls-files` con los nuevos que no
 *   ignora): `cap sync` genera res/xml/config.xml y capacitor-cordova-android-plugins/, que git
 *   ignora y que en el CI no existen al correr las pruebas.
 * - El contenido sale del árbol de trabajo, no del índice, para que un cambio sin preparar también
 *   cuente, y con los finales de línea en LF: la misma huella en Windows y en Linux.
 * - Más las versiones de `@capacitor/*` de package-lock.json, que fijan el Java de Capacitor
 *   (node_modules no se commitea).
 *
 * Uso: node scripts/native-fingerprint.ts
 *   Escribe en android/native.json la huella de este árbol y no toca `level`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NATIVE_JSON = 'android/native.json';

/**
 * Lo nativo: lo que va dentro del .apk o decide cómo se compila. android/native.json queda fuera
 * (la huella no puede incluirse a sí misma), y también android/app/src/debug/ y src/test/, que no
 * llegan al .apk publicado.
 */
export const NATIVE_PATHS = [
  'android/app/src/main/',
  'android/app/build.gradle',
  'android/app/capacitor.build.gradle',
  'android/build.gradle',
  'android/variables.gradle',
  'android/capacitor.settings.gradle',
  'capacitor.config.ts',
] as const;

/**
 * Las claves y las URL del actualizador: rotar una clave cambia qué paquetes se aceptan, no lo que
 * un paquete puede pedirle al Java, así que no pide un nivel nuevo.
 */
const EXCLUDED = new Set(['android/app/src/main/res/raw/micelio_ota.json']);

const byBytes = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

export interface NativeInfo {
  /** Entero desde 1. */
  level: number;
  /** La huella anotada; null si falta o no son 64 hex (la orden la escribe). */
  fingerprint: string | null;
}

/** android/native.json. Lanza si `level` no es un entero desde 1: Gradle hace lo mismo. */
export function readNativeInfo(root: string): NativeInfo {
  const value = JSON.parse(readFileSync(join(root, NATIVE_JSON), 'utf8')) as unknown;
  const fields = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const { level, fingerprint } = fields;
  if (typeof level !== 'number' || !Number.isSafeInteger(level) || level < 1) {
    throw new Error(`El level de ${NATIVE_JSON} no es un entero desde 1.`);
  }
  return {
    level,
    fingerprint: typeof fingerprint === 'string' && /^[0-9a-f]{64}$/.test(fingerprint) ? fingerprint : null,
  };
}

/** Los archivos nativos que existen en el árbol de trabajo, en orden de bytes. */
export function nativeFiles(root: string): string[] {
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...NATIVE_PATHS],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  // Un archivo en conflicto sale una vez por versión, y uno borrado sin preparar sigue en el índice.
  return [...new Set(listed.split('\0'))]
    .filter((path) => path !== '' && !EXCLUDED.has(path) && existsSync(join(root, path)))
    .sort(byBytes);
}

/**
 * CRLF a LF, salvo en un binario: con un NUL en los primeros 8000 bytes, el criterio con el que git
 * decide no tocar los finales de línea de un archivo (sus PNG llegan igual a Windows y a Linux).
 */
function withLf(data: Buffer): Buffer {
  if (data.subarray(0, 8000).includes(0)) return data;
  return Buffer.from(data.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
}

/** Las versiones de los paquetes `@capacitor/*` de package-lock.json, en orden de bytes. */
function capacitorVersions(root: string): [string, string][] {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
    packages?: Record<string, { version?: unknown }>;
  };
  return Object.entries(lock.packages ?? {})
    .filter(([path]) => /(^|\/)node_modules\/@capacitor\/[^/]+$/.test(path))
    .map(([path, info]): [string, string] => [path, String(info.version)])
    .sort(([a], [b]) => byBytes(a, b));
}

/** La huella de la parte nativa del árbol en `root`: SHA-256 en hex. */
export function nativeFingerprint(root: string): string {
  const hash = createHash('sha256');
  // Una línea JSON por registro: ningún nombre de archivo puede hacerse pasar por otro registro.
  for (const path of nativeFiles(root)) {
    const digest = createHash('sha256')
      .update(withLf(readFileSync(join(root, path))))
      .digest('hex');
    hash.update(`${JSON.stringify(['file', path, digest])}\n`);
  }
  for (const [path, version] of capacitorVersions(root)) {
    hash.update(`${JSON.stringify(['npm', path, version])}\n`);
  }
  return hash.digest('hex');
}

/** Escribe la huella del árbol en android/native.json, sin tocar `level`. Devuelve si cambió. */
export function updateFingerprint(root: string): boolean {
  const { level, fingerprint } = readNativeInfo(root);
  const current = nativeFingerprint(root);
  if (current === fingerprint) return false;
  writeFileSync(join(root, NATIVE_JSON), `${JSON.stringify({ level, fingerprint: current }, null, 2)}\n`);
  return true;
}

if (import.meta.main) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const changed = updateFingerprint(root);
  const { level } = readNativeInfo(root);
  console.log(
    changed
      ? `${NATIVE_JSON}: huella nueva, nivel ${level} sin cambiar. Si la web nueva necesita este ` +
          'cambio nativo, sube level a mano.'
      : `${NATIVE_JSON} ya lleva la huella de este árbol (nivel ${level}).`,
  );
}

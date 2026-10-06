import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, PluginOption } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { BUNDLE_INFO_FILE, nativeBundlePlugin } from '../scripts/native-bundle.ts';
import {
  NATIVE_JSON,
  NATIVE_PATHS,
  nativeFiles,
  nativeFingerprint,
  readNativeInfo,
  updateFingerprint,
} from '../scripts/native-fingerprint.ts';
import viteConfig from '../vite.config.ts';

/**
 * El nivel nativo de la app (ARCHITECTURE.md §4.34): android/native.json, su huella y el
 * micelio-bundle.json del build de la app.
 */

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary: string[] = [];

afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

const CHANGED =
  'La parte nativa cambió. Si la web nueva necesita el cambio, sube `level` en android/native.json; ' +
  'en los dos casos, actualiza `fingerprint` con `node scripts/native-fingerprint.ts`.';

/** Un package-lock.json mínimo con estas versiones, como las escribe npm. */
function lock(versions: Record<string, string>): string {
  const packages: Record<string, { version: string }> = { '': { version: '1.6.0' } };
  for (const [name, version] of Object.entries(versions)) packages[`node_modules/${name}`] = { version };
  return JSON.stringify({ name: 'micelio', lockfileVersion: 3, packages }, null, 2);
}

// Un PNG de verdad lleva CRLF en su cabecera y NUL en los primeros bytes.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

/** Lo mínimo de cada sitio que entra en la huella, y algo de lo que no. */
const BASE: Record<string, string | Buffer> = {
  'android/app/src/main/AndroidManifest.xml': '<manifest/>\n',
  'android/app/src/main/java/a/MainActivity.java': 'class MainActivity {\n}\n',
  'android/app/src/main/res/mipmap-hdpi/ic_launcher.png': PNG,
  'android/app/src/main/res/raw/micelio_ota.json': '{"keys":{}}\n',
  'android/app/src/test/java/a/SomeTest.java': 'class SomeTest {}\n',
  'android/app/build.gradle': "apply plugin: 'com.android.application'\n",
  'android/app/capacitor.build.gradle': 'android {}\n',
  'android/build.gradle': 'buildscript {}\n',
  'android/variables.gradle': 'ext {}\n',
  'android/capacitor.settings.gradle': "include ':capacitor-android'\n",
  'android/native.json': '{ "level": 3 }\n',
  'capacitor.config.ts': 'export default {};\n',
  'src/main.ts': 'export {};\n',
  'package-lock.json': lock({
    '@capacitor/android': '8.5.2',
    '@capacitor/cli': '8.5.2',
    '@capacitor/core': '8.5.2',
    vite: '8.3.1',
  }),
};

function write(dir: string, path: string, data: string | Buffer): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), data);
}

/**
 * Un repositorio temporal con BASE añadido al índice y los .gitignore de android/ de verdad, que son
 * los que dejan fuera lo que genera `cap sync`. Así ninguna prueba toca el árbol de trabajo real.
 */
function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'micelio-native-'));
  temporary.push(dir);
  for (const path of ['android/.gitignore', 'android/app/.gitignore']) {
    write(dir, path, readFileSync(join(root, path)));
  }
  for (const [path, data] of Object.entries(BASE)) write(dir, path, data);
  // Sin core.autocrlf: lo que se prueba es la lectura del árbol, no la conversión de git.
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('add', '-A');
  return dir;
}

describe('android/native.json', () => {
  it('lleva la huella de la parte nativa de este árbol', () => {
    expect(nativeFingerprint(root), CHANGED).toBe(readNativeInfo(root).fingerprint);
  });

  it('el nivel es un entero desde 1, y una huella mal escrita se lee como ninguna', () => {
    const dir = repo();
    for (const level of ['0', '1.5', '"1"', 'null']) {
      write(dir, NATIVE_JSON, `{ "level": ${level} }\n`);
      expect(() => readNativeInfo(dir), level).toThrow(/level/);
    }
    write(dir, NATIVE_JSON, '{ "level": 2, "fingerprint": "ABC" }\n');
    expect(readNativeInfo(dir)).toEqual({ level: 2, fingerprint: null });
  });

  it('la orden escribe la huella del árbol y no toca el nivel', () => {
    const dir = repo();
    expect(updateFingerprint(dir)).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, NATIVE_JSON), 'utf8'))).toEqual({
      level: 3,
      fingerprint: nativeFingerprint(dir),
    });
    expect(updateFingerprint(dir)).toBe(false);
  });
});

describe('la huella de la parte nativa', () => {
  it('no cambia con lo que genera cap sync y git ignora: config.xml, los complementos de Cordova, los assets', () => {
    const dir = repo();
    const before = nativeFingerprint(dir);
    write(dir, 'android/app/src/main/res/xml/config.xml', '<widget/>\n');
    write(dir, 'android/capacitor-cordova-android-plugins/build.gradle', '// generado\n');
    write(dir, 'android/app/src/main/assets/public/index.html', '<!doctype html>\n');
    write(dir, 'android/app/src/main/assets/capacitor.config.json', '{}\n');
    expect(nativeFingerprint(dir)).toBe(before);
    expect(nativeFiles(dir).filter((path) => path.includes('config.xml'))).toEqual([]);
  });

  it('no cambia con los finales de línea en CRLF; un binario se compara byte a byte', () => {
    const dir = repo();
    const before = nativeFingerprint(dir);
    write(dir, 'android/app/src/main/java/a/MainActivity.java', 'class MainActivity {\r\n}\r\n');
    write(dir, 'android/app/build.gradle', "apply plugin: 'com.android.application'\r\n");
    expect(nativeFingerprint(dir)).toBe(before);
    write(
      dir,
      'android/app/src/main/res/mipmap-hdpi/ic_launcher.png',
      Buffer.from(PNG.toString('latin1').replace('\r\n', '\n'), 'latin1'),
    );
    expect(nativeFingerprint(dir)).not.toBe(before);
  });

  it('cuenta un cambio sin preparar, un archivo nuevo sin añadir a git y uno borrado', () => {
    const fingerprints = new Set<string>();
    const edits: ((dir: string) => void)[] = [
      () => undefined,
      (dir) => {
        write(dir, 'android/app/src/main/java/a/MainActivity.java', 'class MainActivity { int x; }\n');
      },
      (dir) => {
        write(dir, 'android/app/src/main/java/a/OtaService.java', 'class OtaService {}\n');
      },
      (dir) => {
        unlinkSync(join(dir, 'android/app/src/main/AndroidManifest.xml'));
      },
    ];
    for (const edit of edits) {
      const dir = repo();
      edit(dir);
      fingerprints.add(nativeFingerprint(dir));
    }
    expect(fingerprints.size).toBe(edits.length);
  });

  it('cuenta cada archivo de Gradle de la lista y capacitor.config.ts', () => {
    const before = nativeFingerprint(repo());
    const listed = NATIVE_PATHS.filter((path) => !path.endsWith('/'));
    expect(listed.length).toBe(6);
    for (const path of listed) {
      const dir = repo();
      write(dir, path, `${readFileSync(join(dir, path), 'utf8')}// otro\n`);
      expect(nativeFingerprint(dir), path).not.toBe(before);
    }
  });

  it('no cuentan la configuración del actualizador, las pruebas de Java, el juego ni native.json', () => {
    const dir = repo();
    const before = nativeFingerprint(dir);
    write(dir, 'android/app/src/main/res/raw/micelio_ota.json', '{"keys":{"1f3a9c0b":"x"}}\n');
    write(dir, 'android/app/src/test/java/a/SomeTest.java', 'class SomeTest { int y; }\n');
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    write(dir, NATIVE_JSON, '{ "level": 4 }\n');
    expect(nativeFingerprint(dir)).toBe(before);
  });

  it('cuenta la versión de cada paquete @capacitor/ de package-lock.json, y no la de otro paquete', () => {
    const versions = {
      '@capacitor/android': '8.5.2',
      '@capacitor/cli': '8.5.2',
      '@capacitor/core': '8.5.2',
      vite: '8.3.1',
    };
    const dir = repo();
    const before = nativeFingerprint(dir);
    write(dir, 'package-lock.json', lock({ ...versions, vite: '8.4.0' }));
    expect(nativeFingerprint(dir)).toBe(before);
    for (const name of ['@capacitor/android', '@capacitor/core', '@capacitor/cli']) {
      write(dir, 'package-lock.json', lock({ ...versions, [name]: '8.6.0' }));
      expect(nativeFingerprint(dir), name).not.toBe(before);
    }
  });
});

/** Los complementos de Vite del build en ese modo, sin anidar. */
function pluginsOf(mode: string): Plugin[] {
  const flat = (options: readonly PluginOption[]): Plugin[] =>
    options.flatMap((option) => {
      if (Array.isArray(option)) return flat(option);
      return option && typeof option === 'object' && 'name' in option ? [option] : [];
    });
  return flat(viteConfig({ mode, command: 'build' }).plugins ?? []);
}

/** Lo que un complemento emite en `generateBundle`, como nombre → contenido. */
function emittedBy(plugin: Plugin): Map<string, string> {
  const files = new Map<string, string>();
  const context = {
    emitFile(file: { type: string; fileName?: string; source?: unknown }): string {
      if (file.type === 'asset' && typeof file.source === 'string')
        files.set(file.fileName ?? '', file.source);
      return '';
    },
  };
  const hook = plugin.generateBundle;
  const handler = typeof hook === 'function' ? hook : hook?.handler;
  void handler?.call(context as never, {} as never, {}, true);
  return files;
}

describe('micelio-bundle.json', () => {
  it('el build de la app lo escribe con la versión de package.json y el nivel de android/native.json', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    const emitted = new Map(pluginsOf('native').flatMap((plugin) => [...emittedBy(plugin)]));
    expect(JSON.parse(emitted.get(BUNDLE_INFO_FILE) ?? 'null')).toEqual({
      version: pkg.version,
      minNative: readNativeInfo(root).level,
    });
  });

  it('dice la versión y el nivel que recibe, en el formato que leen el Java y ota-pack', () => {
    // El nivel de este árbol es 1: con otro se ve que el complemento no lo fija por su cuenta.
    const emitted = emittedBy(nativeBundlePlugin('1.7.3', 7));
    expect([...emitted.keys()]).toEqual([BUNDLE_INFO_FILE]);
    expect(emitted.get(BUNDLE_INFO_FILE)).toBe('{"version":"1.7.3","minNative":7}');
  });

  it('el build de la web no lo lleva', () => {
    const names = pluginsOf('production').map((plugin) => plugin.name);
    expect(names).toContain('micelio-service-worker');
    expect(names).not.toContain('micelio-bundle');
  });
});

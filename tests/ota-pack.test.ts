import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, inflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { goodBundleFiles } from '../scripts/ota-fixtures.ts';
import { checkPayload, LIMITS, PAYLOAD_DRAFT_NAME, sha256Hex, ZIP_NAME } from '../scripts/ota-manifest.ts';
import {
  collectFiles,
  ignoreMatcher,
  packFiles,
  verifyZip,
  type PackFile,
  type ZipReason,
} from '../scripts/ota-pack.ts';
import type { Payload } from '../scripts/ota-manifest.ts';

/** El paquete de las actualizaciones de la app (ARCHITECTURE.md §4.34): scripts/ota-pack.ts. */

const fixtures = new URL('./fixtures/ota/zips/', import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary: string[] = [];

afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

/** Una carpeta temporal con estos archivos, creados en este orden. */
function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'micelio-ota-'));
  temporary.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

interface ReadEntry {
  name: string;
  flags: number;
  method: number;
  time: number;
  date: number;
  crc: number;
  size: number;
  localExtra: number;
  centralExtra: number;
  comment: number;
  content: Buffer;
}

/**
 * Un lector mínimo, escrito aquí y no en el script, para no dar por bueno el zip con el mismo código
 * que lo escribe: el directorio central, la cabecera local de cada entrada y su deflate.
 */
function readEntries(zip: Buffer): ReadEntry[] {
  const end = zip.byteLength - 22;
  expect(zip.readUInt32LE(end), 'fin del directorio central').toBe(0x06054b50);
  expect(zip.readUInt16LE(end + 20), 'comentario del zip').toBe(0);
  const out: ReadEntry[] = [];
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i += 1) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const localExtra = zip.readUInt16LE(local + 28);
    const start = local + 30 + zip.readUInt16LE(local + 26) + localExtra;
    const compressed = zip.subarray(start, start + zip.readUInt32LE(at + 20));
    out.push({
      name: zip.toString('utf8', at + 46, at + 46 + nameLength),
      flags: zip.readUInt16LE(at + 8),
      method: zip.readUInt16LE(at + 10),
      time: zip.readUInt16LE(at + 12),
      date: zip.readUInt16LE(at + 14),
      crc: zip.readUInt32LE(at + 16),
      size: zip.readUInt32LE(at + 24),
      localExtra,
      centralExtra: zip.readUInt16LE(at + 30),
      comment: zip.readUInt16LE(at + 32),
      content: inflateRawSync(compressed),
    });
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return out;
}

const files = (paths: string[]): PackFile[] =>
  paths.map((path, i) => ({ path, data: Buffer.from(`// ${path}\n`.repeat(i + 1)) }));

describe('el zip del paquete', () => {
  it('los mismos archivos dan el mismo zip byte a byte, vengan en el orden que vengan', () => {
    const input = files(['index.html', 'assets/a.js', 'assets/b.css', 'icons/i.png', 'cordova.js']);
    const zip = packFiles(input).zip;
    expect(packFiles(input).zip.equals(zip)).toBe(true);
    expect(packFiles([...input].reverse()).zip.equals(zip)).toBe(true);

    const contents = Object.fromEntries(input.map(({ path, data }) => [path, Buffer.from(data).toString()]));
    const forward = folder(contents);
    const backward = folder(Object.fromEntries(Object.entries(contents).reverse()));
    expect(packFiles(collectFiles(forward)).zip.equals(zip)).toBe(true);
    expect(packFiles(collectFiles(backward)).zip.equals(zip)).toBe(true);
  });

  it('las entradas van en orden de bytes, con fecha 1980-01-01, deflate y sin campos extra, comentarios ni carpetas', () => {
    const input = files([
      'index.html',
      'b.js',
      'assets/x.js',
      'B.js',
      'assets-y.js',
      'a/b/c.txt',
      'cordova.js',
    ]);
    input.push({ path: 'empty.js', data: Buffer.alloc(0) });
    const entries = readEntries(packFiles(input).zip);
    // En orden de bytes: «B» antes que «a», y «-» (0x2d) antes que «/» (0x2f).
    expect(entries.map(({ name }) => name)).toEqual([
      'B.js',
      'a/b/c.txt',
      'assets-y.js',
      'assets/x.js',
      'b.js',
      'cordova.js',
      'empty.js',
      'index.html',
    ]);
    for (const entry of entries) {
      const original = input.find(({ path }) => path === entry.name)?.data ?? Buffer.alloc(1);
      expect(entry.method, entry.name).toBe(8);
      expect(entry.flags, entry.name).toBe(0x0800);
      expect([entry.time, entry.date], entry.name).toEqual([0, (1 << 5) | 1]);
      expect([entry.localExtra, entry.centralExtra, entry.comment], entry.name).toEqual([0, 0, 0]);
      expect(entry.content.equals(original), entry.name).toBe(true);
      expect(entry.size, entry.name).toBe(original.byteLength);
      expect(entry.crc, entry.name).toBe(crc32(original));
    }
  });

  it('deja fuera lo que aapt no mete en el .apk, en cualquier componente de la ruta', () => {
    const kept = ['index.html', 'a/b.scc.js', 'cvs.txt', 'x~y', 'assets/app.js', 'thumbs.db.txt'];
    const left = [
      '.vite/manifest.json',
      'CVS/x',
      'sub/cvs/y',
      'a/thumbs.db',
      'icons/Thumbs.DB',
      'x~',
      'b.scc',
      '.DS_Store',
      'assets/.hidden.js',
      'Picasa.ini',
    ];
    const dir = folder(Object.fromEntries([...kept, ...left].map((path) => [path, path])));
    expect(
      collectFiles(dir)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([...kept].sort());
  });

  it('los términos <dir> y <file> de aapt solo valen para carpetas o para archivos', () => {
    const ignored = ignoreMatcher('!.svn:<dir>_*:<file>*.tmp');
    expect(ignored('_build', true)).toBe(true);
    expect(ignored('_build', false)).toBe(false);
    expect(ignored('a.TMP', false)).toBe(true);
    expect(ignored('a.tmp', true)).toBe(false);
    expect(ignored('.SVN', true)).toBe(true);
  });

  it('no empaqueta lo que la app rechazaría', () => {
    expect(() => packFiles(files(['index.html', '../x.js']))).toThrow();
    expect(() => packFiles(files(['index.html', 'assets\\x.js']))).toThrow();
    expect(() => packFiles(files(['index.html', 'index.html']))).toThrow();
    expect(() =>
      packFiles(
        Array.from({ length: LIMITS.files + 1 }, (_, i) => ({ path: String(i), data: Buffer.alloc(0) })),
      ),
    ).toThrow(/1000/);
    expect(() => packFiles([{ path: 'big.bin', data: Buffer.alloc(LIMITS.unpackedBytes + 1) }])).toThrow(
      /31457280/,
    );
  });

  it('good.zip de las fixtures es lo que ota-pack escribe con sus archivos (también en el CI)', () => {
    // Si falla después de actualizar Node, el deflate de su zlib cambió: el PC que firma y el CI ya
    // no dan el mismo zip, y ota-sign.ps1 se negaría a firmar. Se regeneran las fixtures y se usa el
    // mismo Node en los dos sitios.
    expect(packFiles(goodBundleFiles()).zip.equals(readFileSync(new URL('good.zip', fixtures)))).toBe(true);
  });
});

describe('lo que la app comprueba de un zip descargado', () => {
  const cases = (
    JSON.parse(readFileSync(new URL('cases.json', fixtures), 'utf8')) as {
      cases: { name: string; zip: string; verdict: 'ok' | ZipReason; payload: Payload }[];
    }
  ).cases;

  it('cada zip de las fixtures da el veredicto que espera', () => {
    expect(cases.length).toBeGreaterThan(10);
    for (const item of cases) {
      const verdict = verifyZip(readFileSync(new URL(item.zip, fixtures)), item.payload);
      expect(verdict.ok ? 'ok' : verdict.reason, item.name).toBe(item.verdict);
    }
  });

  it('el payload de cada caso pasa la comprobación del manifiesto: el zip es lo único que falla', () => {
    for (const { name, payload } of cases) {
      const checked = checkPayload({ ...payload }, { app: payload.app, channel: 'stable', urlPrefix: '' });
      expect(typeof checked === 'string' ? checked : 'ok', name).toBe('ok');
    }
  });
});

describe('la orden ota-pack', () => {
  const script = join(root, 'scripts', 'ota-pack.ts');
  const run = (...args: string[]): string =>
    execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });

  it('escribe el zip y el borrador del payload, con la versión y el nivel de micelio-bundle.json', () => {
    const dir = folder({
      'index.html': '<!doctype html>\n',
      'micelio-bundle.json': '{"version":"1.6.7","minNative":3}',
      'assets/app.js': 'export {};\n',
      '.vite/manifest.json': '{}',
    });
    const out = folder({});
    run(dir, out);
    const zip = readFileSync(join(out, ZIP_NAME));
    const draft = JSON.parse(readFileSync(join(out, PAYLOAD_DRAFT_NAME), 'utf8')) as Payload;
    expect(draft).toMatchObject({
      app: 'io.github.pipeherreral.micelio',
      channel: 'stable',
      version: '1.6.7',
      minNative: 3,
      url: 'https://github.com/PipeHerreraL/micelio/releases/download/v1.6.7/micelio-web.zip',
      size: zip.byteLength,
      sha256: sha256Hex(zip),
    });
    expect(draft.files.map(([path]) => path)).toEqual(['assets/app.js', 'index.html', 'micelio-bundle.json']);
    expect(verifyZip(zip, draft)).toEqual({ ok: true });
  });

  it('sin micelio-bundle.json falla y no escribe nada', () => {
    const dir = folder({ 'index.html': '<!doctype html>\n' });
    const out = join(dir, 'salida');
    expect(() => run(dir, out)).toThrow(/micelio-bundle\.json/);
    expect(readdirSync(dir)).toEqual(['index.html']);
  });
});

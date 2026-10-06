/**
 * El paquete de una actualización de la app de Android (ARCHITECTURE.md §4.34): el `assets/public/`
 * del .apk en un zip determinista, el borrador de su payload y la comprobación que hace la app antes
 * de usar un zip descargado.
 *
 * - Los mismos archivos dan el mismo zip, en Windows y en Linux: entradas en orden de bytes, fecha
 *   fija (1980-01-01), deflate de nivel 9, sin campos extra, sin comentario y sin entradas de
 *   carpeta. scripts/ota-sign.ps1 compila en el PC del dueño desde la etiqueta local y exige el zip
 *   del CI byte a byte antes de firmarlo.
 * - Deja fuera lo que aapt no mete en el .apk: la regla `ignoreAssetsPattern` de
 *   android/app/build.gradle, leída de ahí y aplicada a cada componente de la ruta (una carpeta
 *   ignorada se lleva todo lo que tiene dentro). En el CI se empaqueta lo extraído del .apk y en el
 *   PC `assets/public/` tras `cap sync`, que todavía no pasó por ese filtro: los dos dan lo mismo.
 * - `verifyZip` hace lo que el Java de la app (`OtaZip`) con un zip descargado, con los mismos
 *   motivos y sobre las mismas fixtures (tests/fixtures/ota/zips/).
 *
 * Uso: node scripts/ota-pack.ts <carpeta> <salida>
 *   Escribe <salida>/micelio-web.zip y <salida>/micelio-web.payload.json (el payload del canal
 *   `stable`, sin firmar), con la versión y el nivel nativo de <carpeta>/micelio-bundle.json.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import {
  buildPayload,
  LIMITS,
  PAYLOAD_DRAFT_NAME,
  payloadBytes,
  payloadUrl,
  sha256Hex,
  ZIP_NAME,
  type FileEntry,
  type Payload,
} from './ota-manifest.ts';

export interface PackFile {
  /** Ruta dentro del paquete, con `/`. */
  path: string;
  data: Uint8Array;
}

export interface Pack {
  zip: Buffer;
  /** `[ruta, tamaño, sha256]` de cada archivo, en el orden del zip. */
  files: FileEntry[];
}

/** Una entrada tal cual se escribe: sin comprobar nada (las fixtures escriben zips malignos con esto). */
export interface RawZipEntry {
  name: string;
  /** 0: guardado; 8: deflate. */
  method: number;
  crc: number;
  compressed: Uint8Array;
  /** El tamaño descomprimido que declaran las cabeceras. */
  size: number;
  /** Por omisión, solo el de los nombres en UTF-8. */
  flags?: number;
}

export interface ZipEntryInfo {
  /** null si el nombre no es UTF-8 válido. */
  name: string | null;
  flags: number;
  method: number;
  size: number;
  data: Buffer;
}

export type ZipReason = 'size' | 'sha256' | 'files' | 'zipPath' | 'bundle';
export type ZipVerdict = { ok: true } | { ok: false; reason: ZipReason };

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const ZIP_VERSION = 20;
// Bit 11: los nombres van en UTF-8.
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
// Formato MS-DOS: hora 00:00:00 y fecha 1980-01-01, la primera que admite.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * Un nombre que la app acepta: relativo, sin `\` ni NUL y sin componentes vacíos, `.` ni `..`. Así
 * ninguna entrada puede escribir fuera de su carpeta, ni en un teléfono anterior a Android 14 (que
 * no lo valida por su cuenta).
 */
export function isSafeEntryName(name: string): boolean {
  if (name.includes('\\') || name.includes('\0')) return false;
  return name.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** La regla de android/app/build.gradle, para que el zip del PC sea el del .apk. */
export function readIgnoreAssetsPattern(
  gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8'),
): string {
  const match = /ignoreAssetsPattern\s*=\s*'([^']*)'/.exec(gradle);
  if (!match?.[1]) {
    throw new Error('android/app/build.gradle no define ignoreAssetsPattern entre comillas simples.');
  }
  return match[1];
}

/**
 * Si aapt deja fuera un archivo o una carpeta con ese nombre (AaptAssets.cpp, `isHidden`, que el
 * Android Gradle Plugin repite en `PatternBasedFileFilter`): términos separados por `:`; un `!`
 * delante solo quita el aviso; `<dir>` o `<file>` limitan a carpetas o a archivos; `prefijo*`,
 * `*sufijo` o el nombre entero, sin distinguir mayúsculas.
 */
export function ignoreMatcher(pattern: string): (name: string, isDirectory: boolean) => boolean {
  const tokens = pattern.split(':').filter((token) => token !== '');
  return (name, isDirectory) => {
    const lower = name.toLowerCase();
    return tokens.some((raw) => {
      let token = (raw.startsWith('!') ? raw.slice(1) : raw).toLowerCase();
      if (token.startsWith('<dir>')) {
        if (!isDirectory) return false;
        token = token.slice('<dir>'.length);
      }
      if (token.startsWith('<file>')) {
        if (isDirectory) return false;
        token = token.slice('<file>'.length);
      }
      if (token.startsWith('*')) return lower.endsWith(token.slice(1));
      if (token.length > 1 && token.endsWith('*')) return lower.startsWith(token.slice(0, -1));
      return lower === token;
    });
  };
}

/** Los archivos de una carpeta, sin lo que aapt deja fuera. */
export function collectFiles(root: string, ignored = ignoreMatcher(readIgnoreAssetsPattern())): PackFile[] {
  const out: PackFile[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = prefix + entry.name;
      const isDirectory = entry.isDirectory();
      // Un enlace dependería de la máquina: en el PC y en el CI saldrían zips distintos.
      if (!isDirectory && !entry.isFile()) {
        throw new Error(`${path}: ni archivo ni carpeta; no se empaqueta.`);
      }
      if (ignored(entry.name, isDirectory)) continue;
      if (isDirectory) walk(join(dir, entry.name), `${path}/`);
      else out.push({ path, data: readFileSync(join(dir, entry.name)) });
    }
  };
  walk(root, '');
  return out;
}

/** El zip de un paquete. Lanza si la app lo rechazaría. */
export function packFiles(input: readonly PackFile[]): Pack {
  const names = new Set<string>();
  let unpacked = 0;
  for (const { path, data } of input) {
    if (!isSafeEntryName(path)) throw new Error(`${path}: la app rechaza ese nombre.`);
    if (names.has(path)) throw new Error(`${path}: repetido.`);
    names.add(path);
    unpacked += data.byteLength;
  }
  // Antes de comprimir nada: con 30 MiB no hace falta esperar al deflate para saber que no vale.
  if (names.size > LIMITS.files) throw new Error(`${names.size} archivos: la app acepta ${LIMITS.files}.`);
  if (unpacked > LIMITS.unpackedBytes) {
    throw new Error(`${unpacked} bytes: la app acepta ${LIMITS.unpackedBytes}.`);
  }

  const sorted = [...input].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const zip = writeZip(
    sorted.map(({ path, data }) => ({
      name: path,
      method: 8,
      crc: crc32(data),
      compressed: deflateRawSync(data, { level: 9 }),
      size: data.byteLength,
    })),
  );
  if (zip.byteLength > LIMITS.zipBytes) {
    throw new Error(`El zip mide ${zip.byteLength} bytes: la app acepta ${LIMITS.zipBytes}.`);
  }
  return { zip, files: sorted.map(({ path, data }) => [path, data.byteLength, sha256Hex(data)]) };
}

/** Escribe las entradas en ese orden, sin ZIP64 (nada del juego se le acerca). */
export function writeZip(entries: readonly RawZipEntry[]): Buffer {
  if (entries.length > 0xffff) throw new Error('Demasiadas entradas para un zip sin ZIP64.');
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(ZIP_VERSION, 4);
    local.writeUInt16LE(entry.flags ?? UTF8_FLAG, 6);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(entry.crc, 14);
    local.writeUInt32LE(entry.compressed.byteLength, 18);
    local.writeUInt32LE(entry.size, 22);
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(ZIP_VERSION, 4);
    central.writeUInt16LE(ZIP_VERSION, 6);
    central.writeUInt16LE(entry.flags ?? UTF8_FLAG, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.compressed.byteLength, 20);
    central.writeUInt32LE(entry.size, 24);
    central.writeUInt16LE(name.byteLength, 28);
    // Campos extra, comentario, disco y atributos a 0: nada que dependa de la máquina.
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, Buffer.from(entry.compressed));
    centrals.push(central, name);
    offset += local.byteLength + name.byteLength + entry.compressed.byteLength;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/**
 * Las entradas de un zip, leídas de su directorio central (como `ZipFile` en Java, no de las
 * cabeceras locales), o null si no se puede leer.
 */
export function readZip(zip: Buffer): ZipEntryInfo[] | null {
  let end = -1;
  for (let at = zip.byteLength - 22; at >= Math.max(0, zip.byteLength - 22 - 0xffff); at -= 1) {
    if (zip.readUInt32LE(at) === END_OF_CENTRAL && at + 22 + zip.readUInt16LE(at + 20) === zip.byteLength) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;
  const count = zip.readUInt16LE(end + 10);
  const size = zip.readUInt32LE(end + 12);
  const start = zip.readUInt32LE(end + 16);
  if (zip.readUInt16LE(end + 4) !== 0 || zip.readUInt16LE(end + 6) !== 0) return null;
  if (zip.readUInt16LE(end + 8) !== count || start + size > end) return null;

  const entries: ZipEntryInfo[] = [];
  let at = start;
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > start + size || zip.readUInt32LE(at) !== CENTRAL_HEADER) return null;
    const nameLength = zip.readUInt16LE(at + 28);
    const next = at + 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    const compressedSize = zip.readUInt32LE(at + 20);
    const local = zip.readUInt32LE(at + 42);
    if (next > start + size || local + 30 > start || zip.readUInt32LE(local) !== LOCAL_HEADER) return null;
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    if (dataStart + compressedSize > start) return null;
    let name: string | null;
    try {
      name = utf8.decode(zip.subarray(at + 46, at + 46 + nameLength));
    } catch {
      name = null;
    }
    entries.push({
      name,
      flags: zip.readUInt16LE(at + 8),
      method: zip.readUInt16LE(at + 10),
      size: zip.readUInt32LE(at + 24),
      data: zip.subarray(dataStart, dataStart + compressedSize),
    });
    at = next;
  }
  return at === start + size ? entries : null;
}

/**
 * Lo que la app comprueba de un zip descargado contra su payload, ya verificado, en este orden:
 *   1. Mide `size` (`size`) y su SHA-256 es `sha256` (`sha256`): lo que se mide al descargar.
 *   2. Se lee del directorio central (si no, `files`), con como mucho 1000 entradas (`size`).
 *   3. Cada nombre es UTF-8, cumple `isSafeEntryName` y no se repite (`zipPath`).
 *   4. Los nombres son exactamente los de `files`, y cada archivo, sin cifrar, guardado o con
 *      deflate, da su tamaño y su SHA-256 contados al descomprimir, sin fiarse de las cabeceras
 *      (`files`). Nunca se descomprime más de un byte por encima de lo firmado: una bomba se corta
 *      ahí.
 *   5. `index.html` y `micelio-bundle.json` están en la raíz, y este dice la `version` y el
 *      `minNative` del payload (`bundle`).
 * Java añade lo que solo existe en disco: cada ruta canónica dentro del destino y el fsync.
 */
export function verifyZip(zip: Buffer, payload: Payload): ZipVerdict {
  const fail = (reason: ZipReason): ZipVerdict => ({ ok: false, reason });
  if (zip.byteLength !== payload.size) return fail('size');
  if (sha256Hex(zip) !== payload.sha256) return fail('sha256');
  const entries = readZip(zip);
  if (!entries) return fail('files');
  if (entries.length > LIMITS.files) return fail('size');

  const seen = new Set<string>();
  for (const { name } of entries) {
    if (name === null || !isSafeEntryName(name) || seen.has(name)) return fail('zipPath');
    seen.add(name);
  }
  const expected = new Map(payload.files.map(([path, size, sha256]) => [path, { size, sha256 }]));
  if (entries.length !== payload.files.length) return fail('files');
  let bundle: Buffer | null = null;
  for (const entry of entries) {
    const want = entry.name === null ? undefined : expected.get(entry.name);
    if (!want || (entry.flags & ENCRYPTED_FLAG) !== 0) return fail('files');
    let data: Buffer;
    try {
      if (entry.method === 0) data = entry.data;
      else if (entry.method === 8) data = inflateRawSync(entry.data, { maxOutputLength: want.size + 1 });
      else return fail('files');
    } catch {
      // Datos rotos, o más de lo firmado: inflateRawSync se corta en maxOutputLength.
      return fail('files');
    }
    if (data.byteLength !== want.size || sha256Hex(data) !== want.sha256) return fail('files');
    if (entry.name === 'micelio-bundle.json') bundle = data;
  }

  if (!expected.has('index.html') || !bundle) return fail('bundle');
  let info: unknown;
  try {
    info = JSON.parse(utf8.decode(bundle));
  } catch {
    return fail('bundle');
  }
  const fields = (typeof info === 'object' && info !== null ? info : {}) as Record<string, unknown>;
  if (fields.version !== payload.version || fields.minNative !== payload.minNative) return fail('bundle');
  return { ok: true };
}

/** La versión y el nivel nativo que el build escribió en micelio-bundle.json. */
function bundleInfo(files: readonly PackFile[]): { version: string; minNative: number } {
  const file = files.find(({ path }) => path === 'micelio-bundle.json');
  if (!file) throw new Error('Falta micelio-bundle.json en la raíz: ¿se compiló con --mode native?');
  const info = JSON.parse(Buffer.from(file.data).toString('utf8')) as {
    version?: unknown;
    minNative?: unknown;
  };
  if (typeof info.version !== 'string' || typeof info.minNative !== 'number') {
    throw new Error('micelio-bundle.json no tiene version y minNative.');
  }
  return { version: info.version, minNative: info.minNative };
}

function main(args: readonly string[]): void {
  const [dir, out] = args;
  if (args.length !== 2 || !dir || !out) {
    console.error('Uso: node scripts/ota-pack.ts <carpeta> <salida>');
    process.exitCode = 2;
    return;
  }
  const files = collectFiles(dir);
  const { version, minNative } = bundleInfo(files);
  const pack = packFiles(files);
  const payload = buildPayload({
    channel: 'stable',
    version,
    minNative,
    url: payloadUrl(version),
    zip: pack.zip,
    files: pack.files,
  });
  // Lo mismo que hará la app: un paquete que no pase aquí no debe llegar a firmarse.
  const verdict = verifyZip(pack.zip, payload);
  if (!verdict.ok) throw new Error(`La app rechazaría este zip (${verdict.reason}).`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, ZIP_NAME), pack.zip);
  writeFileSync(join(out, PAYLOAD_DRAFT_NAME), payloadBytes(payload));
  console.log(
    `${ZIP_NAME}: ${payload.version} (nivel nativo ${payload.minNative}), ${pack.files.length} archivos, ` +
      `${payload.size} bytes (${payload.unpacked} sin comprimir), sha256 ${payload.sha256}`,
  );
}

if (import.meta.main) main(process.argv.slice(2));

/**
 * Fixtures de las actualizaciones (tests/fixtures/ota/), compartidas por Vitest y por JUnit: los dos
 * lados del formato comprueban los mismos manifiestos y los mismos zips, cada uno con el veredicto
 * que espera (ARCHITECTURE.md §4.34).
 *
 * - config.json: una configuración como micelio_ota.json, con las claves públicas de prueba.
 * - versions.json: qué versiones acepta la app y cómo se ordenan (también `compareGameVersions`).
 * - manifests/: un manifiesto por caso y cases.json con su veredicto (`ok`, o el motivo de
 *   scripts/ota-manifest.ts).
 * - zips/: good.zip, que es lo que escribe ota-pack, los zips malignos y cases.json, con el payload
 *   contra el que se comprueba cada uno y su veredicto (scripts/ota-pack.ts, `verifyZip`).
 *
 * Firma con tres pares P-256 efímeros, creados en memoria en cada corrida y nunca escritos: `test`
 * (la clave que la app conoce), `new` (una rotación, que también conoce) y `other` (una ajena). Solo
 * se guardan las públicas que la app conoce. Por eso los manifiestos cambian en cada corrida; los
 * zips, no (tests/ota-pack.test.ts rehace good.zip y lo compara byte a byte).
 *
 * Antes de escribir, cada caso pasa por los verificadores de Node y tiene que dar su veredicto.
 * Quedan fuera dos casos que no cabrían: un manifiesto de más de 64 KiB y un payload de más de 1000
 * archivos (que ya no cabe en 64 KiB); las pruebas los construyen en memoria.
 *
 * Uso: node scripts/ota-fixtures.ts (reescribe tests/fixtures/ota/ y le pasa Prettier)
 */
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import * as prettier from 'prettier';
import {
  APP_ID,
  buildPayload,
  keyIdOf,
  LIMITS,
  manifestText,
  payloadBytes,
  payloadUrl,
  RELEASE_URL_PREFIX,
  sha256Hex,
  signatureFor,
  signPayload,
  spkiBase64,
  verifyManifest,
  type Manifest,
  type ManifestReason,
  type Payload,
  type SignatureEntry,
} from './ota-manifest.ts';
import {
  packFiles,
  verifyZip,
  writeZip,
  type PackFile,
  type RawZipEntry,
  type ZipReason,
} from './ota-pack.ts';

const OUT = fileURLToPath(new URL('../tests/fixtures/ota/', import.meta.url));

export const FIXTURE_VERSION = '1.6.2';
export const FIXTURE_NATIVE_LEVEL = 1;

/**
 * El paquete bueno: lo mínimo que la app exige, un script que deflate comprime de verdad, un
 * archivo vacío (como cordova.js) y bytes que no se dejan comprimir (como un icono).
 */
export function goodBundleFiles(): PackFile[] {
  const script = Array.from(
    { length: 120 },
    (_, i) => `export const spore${String(i)} = 'micelio-${String(i % 7)}';\n`,
  ).join('');
  const noise: Buffer[] = [];
  for (let block = Buffer.from('micelio'); noise.length < 16;) {
    block = Buffer.from(sha256Hex(block), 'hex');
    noise.push(block);
  }
  return [
    {
      path: 'index.html',
      data: Buffer.from(
        '<!doctype html>\n<html lang="es">\n<head><meta charset="utf-8"><title>Micelio</title>\n' +
          '<script type="module" src="./assets/index-fixture.js"></script></head>\n<body></body>\n</html>\n',
      ),
    },
    {
      path: 'micelio-bundle.json',
      data: Buffer.from(JSON.stringify({ version: FIXTURE_VERSION, minNative: FIXTURE_NATIVE_LEVEL })),
    },
    { path: 'assets/index-fixture.js', data: Buffer.from(script) },
    { path: 'assets/index-fixture.css', data: Buffer.from('body{margin:0;background:#1b1410}\n') },
    { path: 'cordova.js', data: Buffer.alloc(0) },
    { path: 'icons/noise.png', data: Buffer.concat(noise) },
  ];
}

type Verdict<R> = 'ok' | R;

interface ManifestCase {
  name: string;
  file: string;
  description: string;
  verdict: Verdict<ManifestReason>;
  version?: string;
  keyIds?: string[];
  text: string;
}

interface ZipCase {
  name: string;
  zip: string;
  description: string;
  verdict: Verdict<ZipReason>;
  payload: Payload;
}

const rawEntry = (name: string, data: Uint8Array): RawZipEntry => ({
  name,
  method: 8,
  crc: crc32(data),
  compressed: deflateRawSync(data, { level: 9 }),
  size: data.byteLength,
});

function manifestCases(keys: Record<'test' | 'new' | 'other', KeyObject>, good: Payload): ManifestCase[] {
  const bytes = payloadBytes(good);
  // Un payload con un campo cambiado, en el orden de siempre (también con tipos que Payload no admite).
  const variant = (changes: Record<string, unknown>): Buffer =>
    Buffer.from(JSON.stringify({ ...good, ...changes }), 'utf8');
  // `files` con un campo del primer archivo cambiado (0: la ruta, 1: el tamaño).
  const withFirstFile = (field: 0 | 1, value: unknown): Record<string, unknown> => ({
    files: good.files.map((entry, i) =>
      i === 0 ? entry.map((item, j) => (j === field ? value : item)) : entry,
    ),
  });
  const signed = (payload: Uint8Array, signers: KeyObject[] = [keys.test]): Manifest =>
    signPayload(payload, signers);
  const withSignatures = (signatures: SignatureEntry[]): Manifest => ({ ...signed(bytes), signatures });
  const ok = (name: string, description: string, manifest: Manifest, keyIds: string[]): ManifestCase => ({
    name,
    file: `${name}.json`,
    description,
    verdict: 'ok',
    version: good.version,
    keyIds,
    text: manifestText(manifest),
  });
  const bad = (
    name: string,
    description: string,
    verdict: ManifestReason,
    manifest: Manifest | string,
    extension = 'json',
  ): ManifestCase => ({
    name,
    file: `${name}.${extension}`,
    description,
    verdict,
    text: typeof manifest === 'string' ? manifest : manifestText(manifest),
  });
  const domainSignature = (domain: string): SignatureEntry => ({
    keyId: keyIdOf(keys.test),
    sig: sign('sha256', Buffer.concat([Buffer.from(domain, 'utf8'), bytes]), {
      key: keys.test,
      dsaEncoding: 'der',
    }).toString('base64'),
  });
  const tampered = signed(bytes);
  tampered.payload = variant({ version: '1.6.3' }).toString('base64');
  // Los bits sobrantes del último carácter a 1: un decodificador indulgente (el de Node, el de Java)
  // lee los mismos bytes, y la firma verificaría. Un espacio al final del JSON fuerza el relleno.
  const nonCanonical = signed(bytes.length % 3 === 0 ? Buffer.concat([bytes, Buffer.from(' ')]) : bytes);
  const last = nonCanonical.payload.indexOf('=') - 1;
  nonCanonical.payload =
    nonCanonical.payload.slice(0, last) +
    BASE64_ALPHABET.charAt(BASE64_ALPHABET.indexOf(nonCanonical.payload.charAt(last)) | 1) +
    nonCanonical.payload.slice(last + 1);
  const fullText = manifestText(signed(bytes));
  const big = (size: number, files = good.files): Buffer => variant({ size, files, unpacked: sum(files) });
  const bigFile = (bytesOver: number): Payload['files'] => [
    ...good.files,
    ['assets/big.bin', LIMITS.unpackedBytes - good.unpacked + bytesOver, good.sha256],
  ];

  return [
    ok('ok-one-key', 'Firmado con la clave de la app.', signed(bytes), [keyIdOf(keys.test)]),
    ok(
      'ok-unknown-and-known',
      'Una firma de una clave ajena y otra de la de la app: basta la conocida.',
      signed(bytes, [keys.other, keys.test]),
      [keyIdOf(keys.test)],
    ),
    ok(
      'ok-two-keys',
      'Firmado con las dos claves que conoce la app (rotación): se anotan las dos, en orden.',
      signed(bytes, [keys.test, keys.new]),
      [keyIdOf(keys.test), keyIdOf(keys.new)],
    ),
    ok('ok-new-key-only', 'Firmado solo con la clave nueva de la rotación.', signed(bytes, [keys.new]), [
      keyIdOf(keys.new),
    ]),
    ok(
      'ok-same-key-twice',
      'Dos firmas válidas de la misma clave: se anota una vez.',
      signed(bytes, [keys.test, keys.test]),
      [keyIdOf(keys.test)],
    ),
    ok(
      'ok-eight-signatures',
      'Ocho firmas, el tope: siete de una clave ajena y la última de la app.',
      signed(bytes, [...Array<KeyObject>(LIMITS.signatures - 1).fill(keys.other), keys.test]),
      [keyIdOf(keys.test)],
    ),
    ok(
      'ok-size-at-limit',
      'El zip mide justo el tope (10 MiB).',
      signed(variant({ size: LIMITS.zipBytes })),
      [keyIdOf(keys.test)],
    ),
    ok(
      'ok-unpacked-at-limit',
      'Descomprimido mide justo el tope (30 MiB).',
      signed(big(good.size, bigFile(0))),
      [keyIdOf(keys.test)],
    ),
    bad(
      'unknown-key',
      'Firmado solo con una clave que la app no conoce.',
      'signature',
      signed(bytes, [keys.other]),
    ),
    bad('tampered-payload', 'La versión cambiada después de firmar.', 'signature', tampered),
    bad(
      'no-domain',
      'Firmado sin el prefijo «micelio-ota-v1\\n».',
      'signature',
      withSignatures([domainSignature('')]),
    ),
    bad(
      'other-domain',
      'Firmado con otro prefijo («micelio-ota-v2\\n»).',
      'signature',
      withSignatures([domainSignature('micelio-ota-v2\n')]),
    ),
    bad(
      'signature-not-base64',
      'La única firma no es base64.',
      'signature',
      withSignatures([{ keyId: keyIdOf(keys.test), sig: 'no es base64' }]),
    ),
    bad(
      'signature-relabelled',
      'La firma de una clave ajena con el keyId de la de la app.',
      'signature',
      withSignatures([{ ...signatureFor(bytes, keys.other), keyId: keyIdOf(keys.test) }]),
    ),
    bad('no-signatures', 'Sin firmas.', 'signature', withSignatures([])),
    bad(
      'too-many-signatures',
      'Nueve firmas, una más que el tope, aunque la última sea buena.',
      'format',
      signed(bytes, [...Array<KeyObject>(LIMITS.signatures).fill(keys.other), keys.test]),
    ),
    bad(
      'not-json',
      'JSON cortado a la mitad.',
      'format',
      fullText.slice(0, Math.floor(fullText.length / 2)),
      'txt',
    ),
    bad('not-object', 'JSON que no es un objeto.', 'format', '[1, 2, 3]\n'),
    bad('format-2', 'Otro formato, sin pedir el .apk nuevo.', 'format', { ...signed(bytes), format: 2 }),
    bad('min-format-2', 'Un formato que esta app ya no entiende: pide el .apk nuevo.', 'minFormat', {
      ...signed(bytes),
      format: 2,
      minFormat: 2,
    }),
    bad('payload-base64url', 'El payload en base64url, no en base64.', 'format', {
      ...signed(bytes),
      payload: bytes.toString('base64url'),
    }),
    bad(
      'payload-base64-noncanonical',
      'El payload en base64 con los bits de relleno a 1 (los mismos bytes para un decodificador indulgente).',
      'format',
      nonCanonical,
    ),
    bad(
      'payload-not-json',
      'El payload firmado no es JSON.',
      'format',
      signed(Buffer.from('no es json', 'utf8')),
    ),
    bad('other-app', 'Para otra app.', 'app', signed(variant({ app: 'io.github.otra.app' }))),
    bad(
      'staging',
      'Del canal staging, en una app del canal stable.',
      'channel',
      signed(variant({ channel: 'staging' })),
    ),
    bad(
      'version-patch-100',
      'Parche 100: no cabe en el versionCode.',
      'version',
      signed(variant({ version: '1.6.100' })),
    ),
    bad(
      'min-native-2',
      'Pide un nivel nativo que este .apk no tiene.',
      'minNative',
      signed(variant({ minNative: 2 })),
    ),
    bad(
      'other-url',
      'El zip fuera de las releases del repositorio.',
      'url',
      signed(variant({ url: 'https://example.com/micelio-web.zip' })),
    ),
    bad(
      'size-over-limit',
      'El zip pasa del tope por un byte.',
      'size',
      signed(variant({ size: LIMITS.zipBytes + 1 })),
    ),
    bad('size-string', 'El tamaño como texto.', 'size', signed(variant({ size: String(good.size) }))),
    bad(
      'unpacked-mismatch',
      '«unpacked» no es la suma de los archivos.',
      'size',
      signed(variant({ unpacked: good.unpacked + 1 })),
    ),
    bad(
      'unpacked-over-limit',
      'Descomprimido pasa del tope por un byte.',
      'size',
      signed(big(good.size, bigFile(1))),
    ),
    bad(
      'sha256-uppercase',
      'El SHA-256 del zip en mayúsculas.',
      'sha256',
      signed(variant({ sha256: good.sha256.toUpperCase() })),
    ),
    bad(
      'files-short-entry',
      'Un archivo sin su SHA-256.',
      'files',
      signed(variant({ files: [good.files[0]?.slice(0, 2), ...good.files.slice(1)] })),
    ),
    bad(
      'files-long-entry',
      'Un archivo con un cuarto campo.',
      'files',
      signed(variant({ files: [[...(good.files[0] ?? []), 'x'], ...good.files.slice(1)] })),
    ),
    bad(
      'files-fraction-size',
      'Un archivo que mide 1,5 bytes.',
      'files',
      signed(variant(withFirstFile(1, 1.5))),
    ),
    bad(
      'files-negative-size',
      'Un archivo que mide -1 bytes.',
      'files',
      signed(variant(withFirstFile(1, -1))),
    ),
    bad('files-empty-path', 'Un archivo sin ruta.', 'files', signed(variant(withFirstFile(0, '')))),
  ];
}

const sum = (files: Payload['files']): number => files.reduce((total, [, size]) => total + size, 0);
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function zipCases(good: PackFile[], goodZip: Buffer, goodPayload: Payload): (ZipCase & { data: Buffer })[] {
  const payloadFor = (data: Buffer, files: readonly PackFile[]): Payload =>
    buildPayload({
      channel: 'stable',
      version: FIXTURE_VERSION,
      minNative: FIXTURE_NATIVE_LEVEL,
      url: payloadUrl(FIXTURE_VERSION),
      zip: data,
      files: files.map(({ path, data: content }) => [path, content.byteLength, sha256Hex(content)]),
    });
  // Un zip escrito a mano con estas entradas, descrito por estos archivos.
  const crafted = (
    name: string,
    description: string,
    verdict: Verdict<ZipReason>,
    entries: RawZipEntry[],
    described: readonly PackFile[],
  ): ZipCase & { data: Buffer } => {
    const data = writeZip(entries);
    return { name, zip: `${name}.zip`, description, verdict, payload: payloadFor(data, described), data };
  };
  const entries = (files: readonly PackFile[]): RawZipEntry[] =>
    files.map(({ path, data }) => rawEntry(path, data));
  // good.zip con 4 bytes cambiados en `at` (que recibe dónde empieza el directorio central): lo que
  // `readZip` (y `OtaZip.readEntries`) no deben leer como un zip, aunque el resto se pueda leer.
  const patched = (
    name: string,
    description: string,
    at: (directoryStart: number) => number,
    value: (directoryStart: number) => number,
  ): ZipCase & { data: Buffer } => {
    const data = Buffer.from(goodZip);
    const start = data.readUInt32LE(data.byteLength - 22 + 16);
    data.writeUInt32LE(value(start), at(start));
    return { name, zip: `${name}.zip`, description, verdict: 'files', payload: payloadFor(data, good), data };
  };
  const extra = (path: string): PackFile => ({ path, data: Buffer.from('export {};\n') });
  const index = good.find(({ path }) => path === 'index.html');
  if (!index) throw new Error('El paquete bueno no tiene index.html.');
  const withExtra = (path: string): PackFile[] => [...good, extra(path)];
  // Empieza por el index.html firmado: solo lo delata contar los bytes, no su SHA-256.
  const bomb = Buffer.concat([index.data, Buffer.alloc(LIMITS.unpackedBytes + 1024 * 1024)]);
  const css = 'assets/index-fixture.css';
  const withoutCss = good.filter(({ path }) => path !== css);
  const renamedCss = good.map((file) =>
    file.path === css ? { ...file, path: 'assets/index-fixture.CSS' } : file,
  );
  const changedIndex = Buffer.from(index.data);
  changedIndex[0] = 0x3c ^ 0x01;
  const withoutIndex = good.filter(({ path }) => path !== 'index.html');
  // El paquete bueno con otro micelio-bundle.json.
  const withBundle = (version: string, minNative: number): PackFile[] =>
    good.map((file) =>
      file.path === 'micelio-bundle.json'
        ? { path: file.path, data: Buffer.from(JSON.stringify({ version, minNative })) }
        : file,
    );
  const tooMany: RawZipEntry[] = Array.from({ length: LIMITS.files + 1 }, (_, i) => ({
    name: String(i),
    method: 0,
    crc: 0,
    compressed: Buffer.alloc(0),
    size: 0,
  }));

  return [
    {
      name: 'good',
      zip: 'good.zip',
      description: 'Lo que escribe ota-pack.',
      verdict: 'ok',
      payload: goodPayload,
      data: goodZip,
    },
    {
      name: 'size-mismatch',
      zip: 'good.zip',
      description: 'El payload firma otro tamaño.',
      verdict: 'size',
      payload: { ...goodPayload, size: goodPayload.size + 1 },
      data: goodZip,
    },
    {
      name: 'sha256-mismatch',
      zip: 'good.zip',
      description: 'El payload firma otro SHA-256.',
      verdict: 'sha256',
      payload: { ...goodPayload, sha256: sha256Hex('otro zip') },
      data: goodZip,
    },
    crafted(
      'dotdot',
      'Una entrada «../x.js».',
      'zipPath',
      entries(withExtra('../x.js')),
      withExtra('../x.js'),
    ),
    crafted('absolute', 'Una entrada «/x.js».', 'zipPath', entries(withExtra('/x.js')), withExtra('/x.js')),
    crafted(
      'backslash',
      'Una entrada «assets\\x.js».',
      'zipPath',
      entries(withExtra('assets\\x.js')),
      withExtra('assets\\x.js'),
    ),
    // No «nul.zip»: Windows reserva ese nombre y git no puede leer el archivo.
    crafted(
      'name-with-nul',
      'Una entrada con un NUL en el nombre.',
      'zipPath',
      entries(withExtra('assets/x\0.js')),
      withExtra('assets/x\0.js'),
    ),
    crafted(
      'dot-segment',
      'Una entrada «./x.js».',
      'zipPath',
      entries(withExtra('./x.js')),
      withExtra('./x.js'),
    ),
    crafted(
      'duplicate',
      'index.html dos veces.',
      'zipPath',
      [...entries(good), rawEntry('index.html', index.data)],
      good,
    ),
    crafted(
      'extra-file',
      'Un archivo que no está en «files».',
      'files',
      entries(withExtra('assets/extra.js')),
      good,
    ),
    crafted(
      'changed-content',
      'index.html con un byte distinto del firmado (mismo tamaño).',
      'files',
      entries(good.map((file) => (file === index ? { ...file, data: changedIndex } : file))),
      good,
    ),
    crafted('missing-file', 'Falta un archivo de «files».', 'files', entries(withoutCss), good),
    crafted(
      'renamed-file',
      'Tantos archivos como «files», pero uno con otro nombre.',
      'files',
      entries(renamedCss),
      good,
    ),
    crafted(
      'stored',
      'index.html guardado sin comprimir (método 0): vale como deflate.',
      'ok',
      entries(good).map((entry) =>
        entry.name === 'index.html' ? { ...entry, method: 0, compressed: index.data } : entry,
      ),
      good,
    ),
    crafted(
      'unknown-method',
      'index.html con un método de compresión que la app no lee (12, bzip2).',
      'files',
      entries(good).map((entry) => (entry.name === 'index.html' ? { ...entry, method: 12 } : entry)),
      good,
    ),
    crafted(
      'encrypted',
      'index.html marcado como cifrado.',
      'files',
      entries(good).map((entry) => (entry.name === 'index.html' ? { ...entry, flags: 0x0801 } : entry)),
      good,
    ),
    crafted(
      'longer-file',
      'index.html con un byte más que lo firmado tras su contenido, y las cabeceras dicen su tamaño.',
      'files',
      entries(good).map((entry) =>
        entry.name === 'index.html'
          ? {
              ...entry,
              compressed: deflateRawSync(Buffer.concat([index.data, Buffer.from('\n')]), { level: 9 }),
            }
          : entry,
      ),
      good,
    ),
    crafted(
      'bomb',
      'index.html sigue con 31 MiB de ceros tras su contenido firmado, y las cabeceras dicen su tamaño.',
      'files',
      entries(good).map((entry) =>
        entry.name === 'index.html' ? { ...entry, compressed: deflateRawSync(bomb, { level: 9 }) } : entry,
      ),
      good,
    ),
    crafted('too-many', `${String(LIMITS.files + 1)} entradas vacías.`, 'size', tooMany, good),
    patched(
      'local-header-signature',
      'La cabecera local de la primera entrada sin su firma; todo lo demás se lee bien.',
      () => 0,
      () => 0,
    ),
    patched(
      'data-past-directory',
      'Los datos de la primera entrada, según el directorio central, se meten en el propio directorio.',
      (start) => start + 20,
      (start) => start,
    ),
    crafted('no-index', 'Sin index.html.', 'bundle', entries(withoutIndex), withoutIndex),
    crafted(
      'bundle-version',
      'micelio-bundle.json dice otra versión que el payload.',
      'bundle',
      entries(withBundle('1.6.9', FIXTURE_NATIVE_LEVEL)),
      withBundle('1.6.9', FIXTURE_NATIVE_LEVEL),
    ),
    crafted(
      'bundle-min-native',
      'micelio-bundle.json pide otro nivel nativo que el payload.',
      'bundle',
      entries(withBundle(FIXTURE_VERSION, FIXTURE_NATIVE_LEVEL + 1)),
      withBundle(FIXTURE_VERSION, FIXTURE_NATIVE_LEVEL + 1),
    ),
  ];
}

async function formatted(path: string, text: string): Promise<string> {
  const options = await prettier.resolveConfig(path);
  return prettier.format(text, { ...options, filepath: path });
}

async function writeFixtures(out: string): Promise<void> {
  const pair = (): KeyObject => generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  const keys = { test: pair(), new: pair(), other: pair() };
  const config = {
    manifestUrl: 'https://github.com/PipeHerreraL/micelio/releases/latest/download/micelio-web.json',
    urlPrefix: RELEASE_URL_PREFIX,
    channel: 'stable',
    checkIntervalSeconds: 3600,
    keys: { [keyIdOf(keys.test)]: spkiBase64(keys.test), [keyIdOf(keys.new)]: spkiBase64(keys.new) },
  };
  const rules = { keys: config.keys, app: APP_ID, channel: config.channel, urlPrefix: config.urlPrefix };

  const good = goodBundleFiles();
  const pack = packFiles(good);
  const goodPayload = buildPayload({
    channel: 'stable',
    version: FIXTURE_VERSION,
    minNative: FIXTURE_NATIVE_LEVEL,
    url: payloadUrl(FIXTURE_VERSION),
    zip: pack.zip,
    files: pack.files,
  });

  const files = new Map<string, string | Buffer>();
  const manifests = manifestCases(keys, goodPayload);
  for (const item of manifests) {
    const path = join(out, 'manifests', item.file);
    const text = item.file.endsWith('.json') ? await formatted(path, item.text) : item.text;
    const verdict = verifyManifest(text, { ...rules, nativeLevel: FIXTURE_NATIVE_LEVEL });
    const got = verdict.ok ? 'ok' : verdict.reason;
    if (got !== item.verdict) throw new Error(`${item.file}: da ${got}, se esperaba ${item.verdict}.`);
    files.set(path, text);
  }
  const zips = zipCases(good, pack.zip, goodPayload);
  for (const item of zips) {
    const verdict = verifyZip(item.data, item.payload);
    const got = verdict.ok ? 'ok' : verdict.reason;
    if (got !== item.verdict) throw new Error(`${item.name}: da ${got}, se esperaba ${item.verdict}.`);
    files.set(join(out, 'zips', item.zip), item.data);
  }

  const json = async (path: string, value: unknown): Promise<void> => {
    files.set(path, await formatted(path, JSON.stringify(value)));
  };
  await json(join(out, 'config.json'), config);
  await json(join(out, 'versions.json'), VERSIONS);
  await json(join(out, 'manifests', 'cases.json'), {
    app: APP_ID,
    nativeLevel: FIXTURE_NATIVE_LEVEL,
    keyRoles: { test: keyIdOf(keys.test), new: keyIdOf(keys.new), other: keyIdOf(keys.other) },
    cases: manifests.map(({ text: _text, ...rest }) => rest),
  });
  await json(join(out, 'zips', 'cases.json'), {
    cases: zips.map(({ data: _data, ...rest }) => rest),
  });

  for (const dir of ['manifests', 'zips']) {
    rmSync(join(out, dir), { recursive: true, force: true });
    mkdirSync(join(out, dir), { recursive: true });
  }
  for (const [path, data] of files) writeFileSync(path, data);
  console.log(`${String(files.size)} archivos en ${out}`);
}

/**
 * Qué versiones acepta la app y cómo se ordenan. `compare` vale también para `compareGameVersions`
 * (src/version.ts), que es más indulgente con la forma pero ordena igual.
 */
const VERSIONS = {
  valid: ['0.0.0', '1.6.1', '1.6.40', '1.99.99', '300000.0.0', '999999999.99.99'],
  invalid: [
    '',
    '1',
    '1.6',
    '1.6.1.0',
    'v1.6.1',
    '1.6.1-debug',
    '1.6.1-rc.1',
    ' 1.6.1',
    '1.6.1 ',
    '1.6.1\n',
    '01.6.1',
    '1.06.1',
    '1.6.01',
    '1.100.0',
    '1.6.100',
    '1000000000.0.0',
    '-1.6.1',
    '+1.6.1',
    '1..1',
    '1.6.',
    '\u0661.\u0666.\u0661',
  ],
  compare: [
    ['1.6.1', '1.6.1', 0],
    ['1.6.1', '1.6.2', -1],
    ['1.6.2', '1.6.10', -1],
    ['1.6.40', '1.6.4', 1],
    ['1.10.0', '1.9.99', 1],
    ['2.0.0', '1.99.99', 1],
    ['1.6.14', '1.6.15', -1],
    ['0.0.0', '0.0.1', -1],
    ['300000.0.0', '1.6.1', 1],
    ['999999999.99.99', '999999999.99.98', 1],
  ],
};

if (import.meta.main) await writeFixtures(OUT);

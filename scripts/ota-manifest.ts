/**
 * El manifiesto de las actualizaciones de la app de Android (ARCHITECTURE.md §4.34), del lado de
 * Node: arma el payload de un paquete, lo firma y lo verifica con las mismas reglas, en el mismo
 * orden y con los mismos motivos que el Java de la app (`OtaManifest`). Los dos lados comprueban las
 * mismas fixtures (tests/fixtures/ota/, que escribe scripts/ota-fixtures.ts): si uno cambia una
 * regla sin el otro, una prueba falla.
 *
 * El manifiesto, formato 1, fijo mientras haya apps que solo lo entienden (uno nuevo se publica con
 * otro nombre, y `minFormat` solo puede pedir el .apk nuevo):
 *
 *   { "format": 1, "minFormat": 1, "payload": "<base64>", "signatures": [{ "keyId": …, "sig": … }] }
 *
 * Cada firma es ECDSA P-256 / SHA-256, en DER, de "micelio-ota-v1\n" seguido de los bytes exactos del
 * payload: la app parsea los mismos bytes que verificó (no hay canonización) y el prefijo hace que
 * una firma de esta clave no valga para nada más. Basta con que verifique una firma de una clave que
 * la app conoce: con la lista se rota la clave sin dejar atrás a los .apk que solo conocen la vieja.
 *
 * Qué se comprueba, en orden (entre paréntesis, el motivo que la app anota en `lastError`):
 *   1. Como mucho 64 KiB de UTF-8 con un objeto JSON (`format`).
 *   2. `minFormat` mayor que 1: hace falta el .apk nuevo (`minFormat`). Va fuera de lo firmado y por
 *      eso solo puede mostrar un aviso.
 *   3. `format` y `minFormat` son 1, `payload` es base64 canónico y `signatures` es una lista de hasta
 *      8 `{ keyId, sig }` (`format`).
 *   4. Alguna firma de una clave conocida verifica (`signature`).
 *   5. El payload es un objeto JSON (`format`).
 *   6. `app` (`app`) y `channel` (`channel`) son los de la app; `version` es X.Y.Z con menor y parche
 *      hasta 99 (`version`); `minNative` es un entero ≥ 1 que no pasa del nivel del .apk
 *      (`minNative`); `url` empieza por el prefijo de la configuración (`url`); `size` no pasa de
 *      10 MiB (`size`); `sha256` va en hex minúscula (`sha256`); `files` es una lista de
 *      `[ruta, tamaño, sha256]` (`files`) de como mucho 1000 archivos, y `unpacked` es la suma de sus
 *      tamaños, hasta 30 MiB (`size`).
 * Lo que depende del estado de la app (mayor que la versión servida, la base y la pendiente; no
 * fallida antes) solo lo mira Java. El zip, scripts/ota-pack.ts (`verifyZip`).
 */
import { createHash, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

/** El `applicationId` de la versión publicada; la de depuración lo compara sin su `.debug`. */
export const APP_ID = 'io.github.pipeherreral.micelio';
/** De dónde se aceptan zips en la release (`urlPrefix` de micelio_ota.json). */
export const RELEASE_URL_PREFIX = 'https://github.com/PipeHerreraL/micelio/releases/download/';
export const ZIP_NAME = 'micelio-web.zip';
/** El payload del canal `stable`, sin firmar, que el CI adjunta a la release para que el dueño lo compare. */
export const PAYLOAD_DRAFT_NAME = 'micelio-web.payload.json';
export const SIGNATURE_DOMAIN = 'micelio-ota-v1\n';
export const MANIFEST_FORMAT = 1;

/** Topes de la app: los mismos en Java. Un paquete que no cabe no se firma (`buildPayload`). */
export const LIMITS = {
  manifestBytes: 64 * 1024,
  // El zip de la 1.6.0 mide unos 750 kB: diez veces más de margen sin dejar que una descarga
  // llene el teléfono.
  zipBytes: 10 * 1024 * 1024,
  files: 1000,
  unpackedBytes: 30 * 1024 * 1024,
  // Una rotación pide dos; el tope acota el trabajo de verificar un manifiesto ajeno.
  signatures: 8,
} as const;

export type FileEntry = [path: string, size: number, sha256: string];

export interface Payload {
  app: string;
  channel: string;
  version: string;
  minNative: number;
  url: string;
  size: number;
  sha256: string;
  unpacked: number;
  files: FileEntry[];
}

export interface SignatureEntry {
  keyId: string;
  sig: string;
}

export interface Manifest {
  format: number;
  minFormat: number;
  payload: string;
  signatures: SignatureEntry[];
}

export type ManifestReason =
  | 'format'
  | 'minFormat'
  | 'signature'
  | 'app'
  | 'channel'
  | 'version'
  | 'minNative'
  | 'url'
  | 'size'
  | 'sha256'
  | 'files';

export type ManifestVerdict =
  { ok: true; payload: Payload; keyIds: string[] } | { ok: false; reason: ManifestReason };

export interface PayloadRules {
  app: string;
  channel: string;
  urlPrefix: string;
  /** El nivel nativo del .apk; sin él no se compara `minNative` con nada. */
  nativeLevel?: number;
}

export interface VerifyOptions extends PayloadRules {
  /** keyId → clave pública (SPKI DER en base64), como en micelio_ota.json. */
  keys: Readonly<Record<string, string>>;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
// Sin ceros a la izquierda: una versión es un solo texto (también es el nombre de su carpeta en la
// app). Menor y parche hasta 99, como el versionCode de android/app/build.gradle; la mayor hasta
// nueve cifras, que caben en un int de Java.
const OTA_VERSION = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]?)\.(0|[1-9][0-9]?)$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
// Con el BOM dentro, como lo trata org.json en la app: un BOM delante del JSON no es JSON.
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export const sha256Hex = (data: Uint8Array | string): string =>
  createHash('sha256').update(data).digest('hex');

/** La versión de un paquete como la entiende la app, o null si no tiene esa forma exacta. */
export function parseOtaVersion(text: string): [number, number, number] | null {
  const match = OTA_VERSION.exec(text);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Base64 estándar con relleno, y solo en su forma canónica (los bits sobrantes a 0): el
 * decodificador de Node acepta cualquier cosa, y el de la app (`OtaBase64`) no.
 */
export function strictBase64(text: string): Buffer | null {
  if (!BASE64.test(text)) return null;
  const data = Buffer.from(text, 'base64');
  return data.toString('base64') === text ? data : null;
}

/** Los 8 primeros hex del SHA-256 de la clave pública en SPKI DER. */
export function keyIdOf(key: KeyObject): string {
  return sha256Hex(spkiOf(key)).slice(0, 8);
}

/** La clave pública en SPKI DER y base64, como va en micelio_ota.json. */
export function spkiBase64(key: KeyObject): string {
  return spkiOf(key).toString('base64');
}

function spkiOf(key: KeyObject): Buffer {
  const publicKey = key.type === 'private' ? createPublicKey(key) : key;
  return publicKey.export({ type: 'spki', format: 'der' });
}

/** La URL del zip de una versión, fijada a su etiqueta: un manifiesto no sirve con el zip de otra release. */
export function payloadUrl(version: string, prefix = RELEASE_URL_PREFIX): string {
  return `${prefix}v${version}/${ZIP_NAME}`;
}

/** Los bytes que se firman: JSON compacto con los campos en este orden. */
export function payloadBytes(payload: Payload): Buffer {
  const { app, channel, version, minNative, url, size, sha256, unpacked, files } = payload;
  return Buffer.from(
    JSON.stringify({ app, channel, version, minNative, url, size, sha256, unpacked, files }),
    'utf8',
  );
}

export interface PayloadInput {
  app?: string;
  channel: string;
  version: string;
  minNative: number;
  url: string;
  zip: Uint8Array;
  files: readonly FileEntry[];
}

/** El payload de un zip. Lanza si la app lo rechazaría: mejor fallar al empaquetar que repartirlo. */
export function buildPayload(input: PayloadInput): Payload {
  const app = input.app ?? APP_ID;
  const candidate = {
    app,
    channel: input.channel,
    version: input.version,
    minNative: input.minNative,
    url: input.url,
    size: input.zip.byteLength,
    sha256: sha256Hex(input.zip),
    unpacked: input.files.reduce((total, [, size]) => total + size, 0),
    files: input.files.map((entry): FileEntry => [...entry]),
  };
  const checked = checkPayload(candidate, { app, channel: input.channel, urlPrefix: '' });
  if (typeof checked === 'string') {
    throw new Error(`La app rechazaría este paquete (${checked}): ${input.version}, ${input.url}.`);
  }
  return checked;
}

/** La firma de una clave privada sobre el payload, con el prefijo de dominio. */
export function signatureFor(payload: Uint8Array, privateKey: KeyObject): SignatureEntry {
  const sig = sign('sha256', Buffer.concat([Buffer.from(SIGNATURE_DOMAIN, 'utf8'), payload]), {
    key: privateKey,
    dsaEncoding: 'der',
  });
  return { keyId: keyIdOf(privateKey), sig: sig.toString('base64') };
}

/** El manifiesto de un payload, firmado con cada clave, en ese orden. */
export function signPayload(payload: Uint8Array, privateKeys: readonly KeyObject[]): Manifest {
  return {
    format: MANIFEST_FORMAT,
    minFormat: MANIFEST_FORMAT,
    payload: Buffer.from(payload).toString('base64'),
    signatures: privateKeys.map((key) => signatureFor(payload, key)),
  };
}

export const manifestText = (manifest: Manifest): string => `${JSON.stringify(manifest, null, 2)}\n`;

/** Las claves de la configuración. Una mal escrita es un error nuestro, no del manifiesto: lanza. */
function loadKeys(keys: Readonly<Record<string, string>>): Map<string, KeyObject> {
  const out = new Map<string, KeyObject>();
  for (const [keyId, spki] of Object.entries(keys)) {
    const data = strictBase64(spki);
    const key = data ? createPublicKey({ key: data, format: 'der', type: 'spki' }) : null;
    if (key?.asymmetricKeyDetails?.namedCurve !== 'prime256v1' || keyIdOf(key) !== keyId) {
      throw new Error(`La clave ${keyId} de la configuración no es una pública P-256 con ese keyId.`);
    }
    out.set(keyId, key);
  }
  return out;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;

function parseObject(data: Uint8Array): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(utf8.decode(data));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** Verifica un manifiesto descargado (ver el orden arriba). */
export function verifyManifest(input: Uint8Array | string, options: VerifyOptions): ManifestVerdict {
  const fail = (reason: ManifestReason): ManifestVerdict => ({ ok: false, reason });
  const keys = loadKeys(options.keys);
  const bytes = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  if (bytes.byteLength > LIMITS.manifestBytes) return fail('format');
  const outer = parseObject(bytes);
  if (!outer) return fail('format');
  const { format, minFormat, payload, signatures } = outer;
  if (isCount(minFormat, 1) && minFormat > MANIFEST_FORMAT) return fail('minFormat');
  if (format !== MANIFEST_FORMAT || minFormat !== MANIFEST_FORMAT || typeof payload !== 'string') {
    return fail('format');
  }
  const data = strictBase64(payload);
  if (!data || !Array.isArray(signatures) || signatures.length > LIMITS.signatures) return fail('format');
  const entries: SignatureEntry[] = [];
  for (const entry of signatures as unknown[]) {
    if (!isRecord(entry) || typeof entry.keyId !== 'string' || typeof entry.sig !== 'string') {
      return fail('format');
    }
    entries.push({ keyId: entry.keyId, sig: entry.sig });
  }

  const signed = Buffer.concat([Buffer.from(SIGNATURE_DOMAIN, 'utf8'), data]);
  const keyIds: string[] = [];
  for (const { keyId, sig } of entries) {
    const key = keys.get(keyId);
    const der = strictBase64(sig);
    // Se anotan todas las claves que verifican: la app descarta el paquete si retira una de ellas.
    if (!key || !der || keyIds.includes(keyId)) continue;
    let valid = false;
    try {
      valid = verify('sha256', signed, { key, dsaEncoding: 'der' }, der);
    } catch {
      // Un DER mal formado no es una firma válida: se pasa a la siguiente.
    }
    if (valid) keyIds.push(keyId);
  }
  if (keyIds.length === 0) return fail('signature');

  const body = parseObject(data);
  if (!body) return fail('format');
  const checked = checkPayload(body, options);
  return typeof checked === 'string' ? fail(checked) : { ok: true, payload: checked, keyIds };
}

/** Los campos del payload (paso 6), o el motivo del primero que falla. */
export function checkPayload(value: Record<string, unknown>, rules: PayloadRules): Payload | ManifestReason {
  const { app, channel, version, minNative, url, size, sha256, files, unpacked } = value;
  if (app !== rules.app) return 'app';
  if (channel !== rules.channel) return 'channel';
  if (typeof version !== 'string' || !parseOtaVersion(version)) return 'version';
  if (!isCount(minNative, 1) || (rules.nativeLevel !== undefined && minNative > rules.nativeLevel)) {
    return 'minNative';
  }
  if (typeof url !== 'string' || !url.startsWith(rules.urlPrefix)) return 'url';
  if (!isCount(size, 1) || size > LIMITS.zipBytes) return 'size';
  if (typeof sha256 !== 'string' || !SHA256_HEX.test(sha256)) return 'sha256';
  if (!Array.isArray(files)) return 'files';
  if (files.length > LIMITS.files) return 'size';
  const entries: FileEntry[] = [];
  let total = 0;
  for (const entry of files as unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 3) return 'files';
    const [path, bytes, hash] = entry as unknown[];
    if (typeof path !== 'string' || path === '' || !isCount(bytes, 0)) return 'files';
    if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) return 'files';
    entries.push([path, bytes, hash]);
    total += bytes;
  }
  if (!isCount(unpacked, 0) || unpacked !== total || unpacked > LIMITS.unpackedBytes) return 'size';
  return { app, channel, version, minNative, url, size, sha256, unpacked, files: entries };
}

/**
 * Los bytes de la frase de la clave, como los teclea el dueño: en NFC (una «ñ» puede llegar
 * compuesta o descompuesta según de dónde se pegue) y sin el salto de línea final que deja la
 * consola. Ningún otro espacio se toca: es parte de la frase.
 */
export function passphraseBytes(typed: string): Buffer {
  return Buffer.from(typed.normalize('NFC').replace(/(?:\r\n|\n|\r)$/, ''), 'utf8');
}

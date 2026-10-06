import { createHash, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { goodBundleFiles } from '../scripts/ota-fixtures.ts';
import {
  APP_ID,
  buildPayload,
  checkPayload,
  keyIdOf,
  LIMITS,
  manifestText,
  parseOtaVersion,
  passphraseBytes,
  payloadBytes,
  payloadUrl,
  RELEASE_URL_PREFIX,
  signPayload,
  spkiBase64,
  verifyManifest,
  type FileEntry,
  type Manifest,
  type ManifestReason,
  type VerifyOptions,
} from '../scripts/ota-manifest.ts';
import { packFiles } from '../scripts/ota-pack.ts';
import { compareGameVersions } from '../src/version.ts';

/** El manifiesto firmado de las actualizaciones de la app (ARCHITECTURE.md §4.34): scripts/ota-manifest.ts. */

const fixtures = new URL('./fixtures/ota/', import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, fixtures), 'utf8'));

interface Config {
  channel: string;
  urlPrefix: string;
  keys: Record<string, string>;
}

interface ManifestCases {
  app: string;
  nativeLevel: number;
  keyRoles: Record<'test' | 'new' | 'other', string>;
  cases: {
    name: string;
    file: string;
    verdict: 'ok' | ManifestReason;
    version?: string;
    keyIds?: string[];
  }[];
}

const newKey = (): KeyObject => generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
const appKey = newKey();
const otherKey = newKey();
const options: VerifyOptions = {
  keys: { [keyIdOf(appKey)]: spkiBase64(appKey) },
  app: APP_ID,
  channel: 'stable',
  urlPrefix: RELEASE_URL_PREFIX,
};

const pack = packFiles(goodBundleFiles());
const payload = buildPayload({
  channel: 'stable',
  version: '1.6.2',
  minNative: 1,
  url: payloadUrl('1.6.2'),
  zip: pack.zip,
  files: pack.files,
});
const bytes = payloadBytes(payload);

const verdictOf = (manifest: Manifest | string, rules = options): string => {
  const verdict = verifyManifest(typeof manifest === 'string' ? manifest : manifestText(manifest), rules);
  return verdict.ok ? 'ok' : verdict.reason;
};
const resigned = (changes: Record<string, unknown>): Manifest =>
  signPayload(Buffer.from(JSON.stringify({ ...payload, ...changes })), [appKey]);

describe('el manifiesto firmado', () => {
  it('un manifiesto firmado con la clave de la app verifica y devuelve su payload y su clave', () => {
    const verdict = verifyManifest(manifestText(signPayload(bytes, [appKey])), options);
    expect(verdict).toEqual({ ok: true, payload, keyIds: [keyIdOf(appKey)] });
  });

  it('basta una firma de una clave conocida, aunque la otra sea de una ajena', () => {
    expect(verdictOf(signPayload(bytes, [otherKey, appKey]))).toBe('ok');
    expect(verdictOf(signPayload(bytes, [otherKey]))).toBe('signature');
  });

  it('un byte cambiado, otro prefijo, otra app u otro canal no pasan', () => {
    const manifest = signPayload(bytes, [appKey]);
    const changed = Buffer.from(bytes);
    changed[changed.indexOf('1.6.2') + 4] = '3'.charCodeAt(0);
    expect(verdictOf({ ...manifest, payload: changed.toString('base64') })).toBe('signature');

    const withDomain = (domain: string): Manifest => ({
      ...manifest,
      signatures: [
        {
          keyId: keyIdOf(appKey),
          sig: sign('sha256', Buffer.concat([Buffer.from(domain), bytes]), {
            key: appKey,
            dsaEncoding: 'der',
          }).toString('base64'),
        },
      ],
    });
    expect(verdictOf(withDomain('micelio-ota-v1\n'))).toBe('ok');
    expect(verdictOf(withDomain('micelio-ota-v2\n'))).toBe('signature');
    expect(verdictOf(withDomain(''))).toBe('signature');

    expect(verdictOf(resigned({ app: `${APP_ID}.debug` }))).toBe('app');
    expect(verdictOf(resigned({ channel: 'staging' }))).toBe('channel');
    expect(verdictOf(resigned({ channel: 'staging' }), { ...options, channel: 'staging' })).toBe('ok');
  });

  it('base64 o JSON rotos son «format», y también un manifiesto de más de 64 KiB (justo 64 KiB, no)', () => {
    const manifest = signPayload(bytes, [appKey]);
    expect(verdictOf({ ...manifest, payload: `${manifest.payload.slice(0, -1)}!` })).toBe('format');
    expect(verdictOf({ ...manifest, payload: bytes.toString('base64url') })).toBe('format');
    expect(verdictOf(manifestText(manifest).slice(0, 100))).toBe('format');
    expect(verdictOf('﻿' + manifestText(manifest))).toBe('format');

    // Un campo de más, que se ignora, hasta llegar al tope exacto.
    const sized = (total: number): string => {
      const base = JSON.stringify({ ...manifest, padding: '' });
      return JSON.stringify({ ...manifest, padding: 'x'.repeat(total - Buffer.byteLength(base)) });
    };
    expect(Buffer.byteLength(sized(LIMITS.manifestBytes))).toBe(65536);
    expect(verdictOf(sized(LIMITS.manifestBytes))).toBe('ok');
    expect(verdictOf(sized(LIMITS.manifestBytes + 1))).toBe('format');
  });

  it('cada manifiesto de las fixtures da el veredicto que espera', () => {
    const config = readJson('config.json') as Config;
    const { app, nativeLevel, keyRoles, cases } = readJson('manifests/cases.json') as ManifestCases;
    expect(Object.keys(config.keys).sort()).toEqual([keyRoles.test, keyRoles.new].sort());
    expect(cases.length).toBeGreaterThan(25);
    for (const item of cases) {
      const verdict = verifyManifest(readFileSync(new URL(`manifests/${item.file}`, fixtures)), {
        ...config,
        app,
        nativeLevel,
      });
      if (verdict.ok) {
        expect(
          { verdict: 'ok', version: verdict.payload.version, keyIds: verdict.keyIds },
          item.name,
        ).toEqual({
          verdict: item.verdict,
          version: item.version,
          keyIds: item.keyIds,
        });
      } else expect(verdict.reason, item.name).toBe(item.verdict);
    }
  });

  it('más de 1000 archivos en el payload se rechazan por tamaño (no caben en una fixture de 64 KiB)', () => {
    const many = (count: number): FileEntry[] =>
      Array.from({ length: count }, (_, i): FileEntry => [`f${String(i)}`, 1, payload.sha256]);
    const rules = { app: APP_ID, channel: 'stable', urlPrefix: '' };
    expect(checkPayload({ ...payload, files: many(1000), unpacked: 1000 }, rules)).not.toBeTypeOf('string');
    expect(checkPayload({ ...payload, files: many(1001), unpacked: 1001 }, rules)).toBe('size');
  });

  it('no se arma el payload de un paquete que la app rechazaría', () => {
    const input = { channel: 'stable', version: '1.6.2', minNative: 1, url: payloadUrl('1.6.2') };
    expect(() => buildPayload({ ...input, version: '1.6.100', zip: pack.zip, files: pack.files })).toThrow(
      /version/,
    );
    expect(() => buildPayload({ ...input, minNative: 0, zip: pack.zip, files: pack.files })).toThrow(
      /minNative/,
    );
    expect(() => buildPayload({ ...input, zip: new Uint8Array(0), files: pack.files })).toThrow(/size/);
  });

  it('el keyId son los 8 primeros hex del SHA-256 de la clave pública en SPKI DER', () => {
    const spki = createPublicKey(appKey).export({ type: 'spki', format: 'der' });
    expect(keyIdOf(appKey)).toBe(createHash('sha256').update(spki).digest('hex').slice(0, 8));
    expect(keyIdOf(createPublicKey(appKey))).toBe(keyIdOf(appKey));
  });

  it('el id de la app es el de android/app/build.gradle y capacitor.config.ts', () => {
    const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    expect(read('android/app/build.gradle')).toContain(`applicationId "${APP_ID}"`);
    expect(read('capacitor.config.ts')).toContain(`appId: '${APP_ID}'`);
  });
});

describe('versiones', () => {
  const versions = readJson('versions.json') as {
    valid: string[];
    invalid: string[];
    compare: [string, string, number][];
  };

  it('la app acepta las versiones válidas de versions.json y rechaza las demás', () => {
    for (const version of versions.valid) expect(parseOtaVersion(version), version).not.toBeNull();
    for (const version of versions.invalid)
      expect(parseOtaVersion(version), JSON.stringify(version)).toBeNull();
  });

  it('compareGameVersions ordena como espera versions.json', () => {
    for (const [a, b, expected] of versions.compare) {
      expect(Math.sign(compareGameVersions(a, b)), `${a} frente a ${b}`).toBe(expected);
      expect(Math.sign(compareGameVersions(b, a)), `${b} frente a ${a}`).toBe(-expected || 0);
    }
  });
});

describe('la frase de la clave', () => {
  it('da los mismos bytes compuesta o descompuesta y con el salto de línea de la consola', () => {
    const expected = Buffer.from('contrase\u00f1a', 'utf8');
    for (const typed of [
      'contrase\u00f1a',
      'contrasen\u0303a',
      'contrase\u00f1a\r\n',
      'contrasen\u0303a\n',
    ]) {
      expect(passphraseBytes(typed).equals(expected), JSON.stringify(typed)).toBe(true);
    }
  });

  it('solo quita el último salto: los demás espacios son parte de la frase', () => {
    expect(passphraseBytes(' contraseña').toString()).toBe(' contraseña');
    expect(passphraseBytes('contraseña ').toString()).toBe('contraseña ');
    expect(passphraseBytes('contraseña\n\n').toString()).toBe('contraseña\n');
  });
});

describe('las fixtures', () => {
  it('no guardan ninguna clave privada, y la ajena no está en la configuración', () => {
    const walk = (dir: URL): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(new URL(`${entry.name}/`, dir)) : [new URL(entry.name, dir).href],
      );
    for (const file of walk(fixtures)) {
      expect(readFileSync(new URL(file)).includes('PRIVATE'), file).toBe(false);
    }
    const { keyRoles } = readJson('manifests/cases.json') as ManifestCases;
    expect(Object.keys((readJson('config.json') as Config).keys)).not.toContain(keyRoles.other);
  });
});

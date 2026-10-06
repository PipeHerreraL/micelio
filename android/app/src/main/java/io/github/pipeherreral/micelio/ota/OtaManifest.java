package io.github.pipeherreral.micelio.ota;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.PublicKey;
import java.security.Signature;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * El manifiesto de una actualización (ARCHITECTURE.md §4.34), del lado de la app: las mismas reglas,
 * en el mismo orden y con los mismos motivos que `verifyManifest` en scripts/ota-manifest.ts, que
 * firma y prueba el formato en Node. Los dos lados comprueban tests/fixtures/ota/manifests/.
 *
 * Formato 1, fijo mientras haya apps que solo lo entienden:
 *
 *   { "format": 1, "minFormat": 1, "payload": "<base64>", "signatures": [{ "keyId": …, "sig": … }] }
 *
 * Cada firma es ECDSA P-256 / SHA-256, en DER, de "micelio-ota-v1\n" seguido de los bytes exactos
 * del payload: aquí se parsean los mismos bytes que se verificaron.
 *
 * El orden y los motivos (`lastError`): tamaño y JSON (`format`); `minFormat` mayor que 1, que solo
 * puede pedir el .apk nuevo porque va fuera de lo firmado (`minFormat`); `format`, payload en base64
 * canónico y hasta 8 firmas (`format`); alguna firma de una clave conocida (`signature`); el payload
 * es un objeto (`format`); `app`, `channel`, `version` (también la regla del estado de la app:
 * {@link Rules#gate}), `minNative`, `url`, `size`, `sha256` y `files` (como `checkPayload`).
 */
final class OtaManifest {
    static final int FORMAT = 1;
    static final byte[] SIGNATURE_DOMAIN = "micelio-ota-v1\n".getBytes(StandardCharsets.UTF_8);
    // Los topes de LIMITS en scripts/ota-manifest.ts: un paquete que no cabe no se firma.
    static final int MAX_MANIFEST_BYTES = 64 * 1024;
    static final long MAX_ZIP_BYTES = 10L * 1024 * 1024;
    static final int MAX_FILES = 1000;
    static final long MAX_UNPACKED_BYTES = 30L * 1024 * 1024;
    static final int MAX_SIGNATURES = 8;
    private static final Pattern SHA256_HEX = Pattern.compile("[0-9a-f]{64}");

    private OtaManifest() {}

    /** Un archivo del paquete: ruta con `/`, tamaño y SHA-256 en hex minúscula. */
    static final class FileEntry {
        final String path;
        final long size;
        final String sha256;

        FileEntry(String path, long size, String sha256) {
            this.path = path;
            this.size = size;
            this.sha256 = sha256;
        }

        /** Una entrada `[ruta, tamaño, sha256]` de `files`, o null si no tiene esa forma. */
        static FileEntry parse(Object value) {
            List<Object> entry = OtaJson.asArray(value);
            if (entry == null || entry.size() != 3) return null;
            String path = OtaJson.asString(entry.get(0));
            long size = OtaJson.asCount(entry.get(1), 0);
            String sha256 = OtaJson.asString(entry.get(2));
            if (path == null || path.isEmpty() || size < 0 || !isSha256(sha256)) return null;
            return new FileEntry(path, size, sha256);
        }

        List<Object> toJson() {
            List<Object> out = new ArrayList<>(3);
            out.add(path);
            out.add(size);
            out.add(sha256);
            return out;
        }
    }

    static final class Payload {
        final String app;
        final String channel;
        final String version;
        final int minNative;
        final String url;
        final long size;
        final String sha256;
        final long unpacked;
        final List<FileEntry> files;

        Payload(String app, String channel, String version, int minNative, String url, long size, String sha256,
                long unpacked, List<FileEntry> files) {
            this.app = app;
            this.channel = channel;
            this.version = version;
            this.minNative = minNative;
            this.url = url;
            this.size = size;
            this.sha256 = sha256;
            this.unpacked = unpacked;
            this.files = Collections.unmodifiableList(new ArrayList<>(files));
        }
    }

    /** Lo que decide el estado de la app: mayor que la versión servida, la base y la pendiente, y no fallida antes. */
    interface VersionGate {
        boolean accepts(String version);
    }

    static final class Rules {
        final String app;
        final String channel;
        final String urlPrefix;
        final int nativeLevel;
        final Map<String, PublicKey> keys;
        /** null: solo la forma de la versión (las fixtures no tienen estado). */
        final VersionGate gate;

        Rules(String app, String channel, String urlPrefix, int nativeLevel, Map<String, PublicKey> keys,
                VersionGate gate) {
            this.app = app;
            this.channel = channel;
            this.urlPrefix = urlPrefix;
            this.nativeLevel = nativeLevel;
            this.keys = keys;
            this.gate = gate;
        }
    }

    static final class Verdict {
        /** null si el manifiesto vale. */
        final String reason;
        /** La versión del payload firmado, si se llegó a leer: el aviso de `minNative` es por versión. */
        final String version;
        final Payload payload;
        /** Todas las claves cuya firma verificó, en orden: la app descarta el paquete si retira una. */
        final List<String> keyIds;

        private Verdict(String reason, String version, Payload payload, List<String> keyIds) {
            this.reason = reason;
            this.version = version;
            this.payload = payload;
            this.keyIds = keyIds;
        }

        boolean isOk() {
            return reason == null;
        }

        static Verdict fail(String reason) {
            return new Verdict(reason, null, null, Collections.<String>emptyList());
        }
    }

    static Verdict verify(byte[] manifest, Rules rules) {
        if (manifest.length > MAX_MANIFEST_BYTES) return Verdict.fail("format");
        Map<String, Object> outer = parseObject(manifest);
        if (outer == null) return Verdict.fail("format");
        long minFormat = OtaJson.asCount(outer.get("minFormat"), 1);
        if (minFormat > FORMAT) return Verdict.fail("minFormat");
        String payloadText = OtaJson.asString(outer.get("payload"));
        if (OtaJson.asCount(outer.get("format"), 1) != FORMAT || minFormat != FORMAT || payloadText == null) {
            return Verdict.fail("format");
        }
        byte[] data = OtaBase64.decode(payloadText);
        List<Object> signatures = OtaJson.asArray(outer.get("signatures"));
        if (data == null || signatures == null || signatures.size() > MAX_SIGNATURES) return Verdict.fail("format");
        List<String[]> entries = new ArrayList<>();
        for (Object item : signatures) {
            Map<String, Object> entry = OtaJson.asObject(item);
            String keyId = entry == null ? null : OtaJson.asString(entry.get("keyId"));
            String sig = entry == null ? null : OtaJson.asString(entry.get("sig"));
            if (keyId == null || sig == null) return Verdict.fail("format");
            entries.add(new String[] {keyId, sig});
        }

        List<String> keyIds = new ArrayList<>();
        for (String[] entry : entries) {
            PublicKey key = rules.keys.get(entry[0]);
            byte[] der = OtaBase64.decode(entry[1]);
            if (key == null || der == null || keyIds.contains(entry[0])) continue;
            if (verifies(key, data, der)) keyIds.add(entry[0]);
        }
        if (keyIds.isEmpty()) return Verdict.fail("signature");

        Map<String, Object> body = parseObject(data);
        if (body == null) return Verdict.fail("format");
        return checkPayload(body, rules, keyIds);
    }

    /** Los campos del payload, o el motivo del primero que falla (`checkPayload` en Node). */
    static Verdict checkPayload(Map<String, Object> body, Rules rules, List<String> keyIds) {
        if (!rules.app.equals(body.get("app"))) return Verdict.fail("app");
        if (!rules.channel.equals(body.get("channel"))) return Verdict.fail("channel");
        String version = OtaJson.asString(body.get("version"));
        if (!OtaVersion.isValid(version)) return Verdict.fail("version");
        if (rules.gate != null && !rules.gate.accepts(version)) return Verdict.fail("version");
        long minNative = OtaJson.asCount(body.get("minNative"), 1);
        if (minNative < 0 || minNative > rules.nativeLevel) {
            return new Verdict("minNative", version, null, Collections.<String>emptyList());
        }
        String url = OtaJson.asString(body.get("url"));
        if (url == null || !url.startsWith(rules.urlPrefix)) return Verdict.fail("url");
        long size = OtaJson.asCount(body.get("size"), 1);
        if (size < 0 || size > MAX_ZIP_BYTES) return Verdict.fail("size");
        String sha256 = OtaJson.asString(body.get("sha256"));
        if (!isSha256(sha256)) return Verdict.fail("sha256");
        List<Object> files = OtaJson.asArray(body.get("files"));
        if (files == null) return Verdict.fail("files");
        if (files.size() > MAX_FILES) return Verdict.fail("size");
        List<FileEntry> entries = new ArrayList<>(files.size());
        long total = 0;
        for (Object item : files) {
            FileEntry entry = FileEntry.parse(item);
            if (entry == null) return Verdict.fail("files");
            entries.add(entry);
            // Sin desbordar: 1000 archivos de como mucho 2^53 bytes caben en un long.
            total += entry.size;
        }
        long unpacked = OtaJson.asCount(body.get("unpacked"), 0);
        if (unpacked < 0 || unpacked != total || unpacked > MAX_UNPACKED_BYTES) return Verdict.fail("size");
        Payload payload = new Payload(
                rules.app, rules.channel, version, (int) minNative, url, size, sha256, unpacked, entries);
        return new Verdict(null, version, payload, Collections.unmodifiableList(keyIds));
    }

    static boolean isSha256(String text) {
        return text != null && SHA256_HEX.matcher(text).matches();
    }

    private static Map<String, Object> parseObject(byte[] data) {
        try {
            return OtaJson.asObject(OtaJson.parse(data));
        } catch (OtaJson.Invalid e) {
            return null;
        }
    }

    private static boolean verifies(PublicKey key, byte[] payload, byte[] der) {
        try {
            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initVerify(key);
            signature.update(SIGNATURE_DOMAIN);
            signature.update(payload);
            return signature.verify(der);
        } catch (GeneralSecurityException | RuntimeException e) {
            // Un DER mal formado no es una firma válida (algún proveedor lanza en vez de devolver
            // false): se pasa a la siguiente.
            return false;
        }
    }
}

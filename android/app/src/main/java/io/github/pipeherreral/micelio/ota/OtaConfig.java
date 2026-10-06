package io.github.pipeherreral.micelio.ota;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * La configuración del actualizador, que va en el .apk (res/raw/micelio_ota.json; ARCHITECTURE.md
 * §4.34): de dónde se pide el manifiesto, de dónde se aceptan zips, el canal, cada cuánto se busca y
 * las claves públicas (keyId → SPKI DER en base64). Sin claves o sin URL, el actualizador queda
 * inerte, como en el .apk hasta que el dueño crea la clave.
 *
 * Una configuración mal escrita es un error nuestro, no del manifiesto: {@link #parse} lanza, como
 * `loadKeys` en scripts/ota-manifest.ts, y quien llama deja el actualizador inerte.
 */
final class OtaConfig {
    // La cabecera SPKI de una clave P-256 (id-ecPublicKey con la curva prime256v1) seguida de
    // BIT STRING de 66 bytes: lo que exporta Node con { type: 'spki', format: 'der' }. Una clave de
    // otra curva, o comprimida, no la tiene.
    private static final byte[] P256_SPKI_HEADER = {
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, (byte) 0x86, 0x48, (byte) 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08,
        0x2a, (byte) 0x86, 0x48, (byte) 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00, 0x04
    };
    private static final int P256_SPKI_LENGTH = 91;

    final String manifestUrl;
    final String urlPrefix;
    final String channel;
    final long checkIntervalSeconds;
    /** keyId → clave, en el orden del archivo. */
    final Map<String, PublicKey> keys;

    private OtaConfig(String manifestUrl, String urlPrefix, String channel, long checkIntervalSeconds,
            Map<String, PublicKey> keys) {
        this.manifestUrl = manifestUrl;
        this.urlPrefix = urlPrefix;
        this.channel = channel;
        this.checkIntervalSeconds = checkIntervalSeconds;
        this.keys = Collections.unmodifiableMap(keys);
    }

    static OtaConfig parse(byte[] json) {
        Map<String, Object> root;
        try {
            root = OtaJson.asObject(OtaJson.parse(json));
        } catch (OtaJson.Invalid e) {
            root = null;
        }
        if (root == null) throw new IllegalArgumentException("micelio_ota.json no es un objeto JSON.");
        String manifestUrl = OtaJson.asString(root.get("manifestUrl"));
        String urlPrefix = OtaJson.asString(root.get("urlPrefix"));
        String channel = OtaJson.asString(root.get("channel"));
        long interval = OtaJson.asCount(root.get("checkIntervalSeconds"), 0);
        Map<String, Object> keyTexts = OtaJson.asObject(root.get("keys"));
        if (manifestUrl == null || urlPrefix == null || channel == null || channel.isEmpty() || interval < 0
                || keyTexts == null) {
            throw new IllegalArgumentException("A micelio_ota.json le falta un campo o tiene uno de otro tipo.");
        }
        // Sin la barra final, el prefijo de las releases aceptaría también releases/download-otra/….
        if (!urlPrefix.isEmpty() && !urlPrefix.endsWith("/")) {
            throw new IllegalArgumentException("urlPrefix debe acabar en «/»: " + urlPrefix);
        }
        Map<String, PublicKey> keys = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : keyTexts.entrySet()) {
            String spki = OtaJson.asString(entry.getValue());
            if (spki == null) throw new IllegalArgumentException("La clave " + entry.getKey() + " no es texto.");
            keys.put(entry.getKey(), publicKey(entry.getKey(), spki));
        }
        return new OtaConfig(manifestUrl, urlPrefix, channel, interval, keys);
    }

    /** Si busca actualizaciones: sin claves no podría verificar nada, y sin URL no tiene dónde buscar. */
    boolean isActive() {
        return !keys.isEmpty() && !manifestUrl.isEmpty() && !urlPrefix.isEmpty();
    }

    /** La clave pública P-256 de un SPKI en base64, si es una y su keyId es el anotado. */
    static PublicKey publicKey(String keyId, String spkiBase64) {
        byte[] spki = OtaBase64.decode(spkiBase64);
        if (spki == null || spki.length != P256_SPKI_LENGTH
                || !Arrays.equals(Arrays.copyOf(spki, P256_SPKI_HEADER.length), P256_SPKI_HEADER)) {
            throw new IllegalArgumentException("La clave " + keyId + " no es una pública P-256 en SPKI.");
        }
        if (!keyIdOf(spki).equals(keyId)) {
            throw new IllegalArgumentException("La clave " + keyId + " tiene otro keyId: " + keyIdOf(spki) + ".");
        }
        try {
            return KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(spki));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("La clave " + keyId + " no se puede leer.", e);
        }
    }

    /** Los 8 primeros hex del SHA-256 de la clave pública en SPKI DER, como `keyIdOf` en Node. */
    static String keyIdOf(byte[] spki) {
        return OtaFiles.hex(OtaFiles.sha256().digest(spki)).substring(0, 8);
    }
}

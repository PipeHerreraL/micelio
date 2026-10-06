package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertNotNull;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Las fixtures que comparten Node y Java (tests/fixtures/ota/, las escribe scripts/ota-fixtures.ts)
 * y lo que las pruebas necesitan para firmar en memoria. Gradle pasa la carpeta en
 * `micelio.otaFixtures`; sin Gradle, se busca desde android/app.
 */
final class Fixtures {
    static final String APP_ID = "io.github.pipeherreral.micelio";
    static final String URL_PREFIX = "https://github.com/PipeHerreraL/micelio/releases/download/";

    private Fixtures() {}

    static File dir() {
        String path = System.getProperty("micelio.otaFixtures");
        File dir = new File(path != null ? path : "../../tests/fixtures/ota");
        if (!dir.isDirectory()) throw new IllegalStateException("No están las fixtures en " + dir.getAbsolutePath());
        return dir;
    }

    static File file(String path) {
        return new File(dir(), path);
    }

    static byte[] bytes(String path) throws IOException {
        return Files.readAllBytes(file(path).toPath());
    }

    static Map<String, Object> object(String path) throws Exception {
        Map<String, Object> value = OtaJson.asObject(OtaJson.parse(bytes(path)));
        assertNotNull(path, value);
        return value;
    }

    static List<Map<String, Object>> cases(String path) throws Exception {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : OtaJson.asArray(object(path).get("cases"))) out.add(OtaJson.asObject(item));
        return out;
    }

    static OtaConfig config() throws IOException {
        return OtaConfig.parse(bytes("config.json"));
    }

    /**
     * El keyId de una de las claves de las fixtures (`test`, `new` u `other`): cambian en cada corrida
     * de scripts/ota-fixtures.ts, así que ninguna prueba los escribe a mano.
     */
    static String keyRole(String role) throws Exception {
        String keyId = OtaJson.asString(OtaJson.asObject(object("manifests/cases.json").get("keyRoles")).get(role));
        assertNotNull(role, keyId);
        return keyId;
    }

    /** El payload de una fixture tal cual, sin las comprobaciones de OtaManifest (como `verifyZip`). */
    static OtaManifest.Payload payload(Map<String, Object> json) {
        List<OtaManifest.FileEntry> files = new ArrayList<>();
        for (Object item : OtaJson.asArray(json.get("files"))) files.add(OtaManifest.FileEntry.parse(item));
        return new OtaManifest.Payload(
                (String) json.get("app"),
                (String) json.get("channel"),
                (String) json.get("version"),
                (int) OtaJson.asCount(json.get("minNative"), 0),
                (String) json.get("url"),
                OtaJson.asCount(json.get("size"), 0),
                (String) json.get("sha256"),
                OtaJson.asCount(json.get("unpacked"), 0),
                files);
    }

    static KeyPair newKey() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        return generator.generateKeyPair();
    }

    static String keyId(PublicKey key) {
        return OtaConfig.keyIdOf(key.getEncoded());
    }

    static Map<String, PublicKey> keys(KeyPair... pairs) {
        Map<String, PublicKey> out = new LinkedHashMap<>();
        for (KeyPair pair : pairs) out.put(keyId(pair.getPublic()), pair.getPublic());
        return out;
    }

    static String base64(byte[] data) {
        return Base64.getEncoder().encodeToString(data);
    }

    /** La firma DER de "micelio-ota-v1\n" + payload, como `signatureFor` en Node. */
    static String sign(PrivateKey key, byte[] payload) throws Exception {
        Signature signature = Signature.getInstance("SHA256withECDSA");
        signature.initSign(key);
        signature.update(OtaManifest.SIGNATURE_DOMAIN);
        signature.update(payload);
        return base64(signature.sign());
    }

    /** Un manifiesto del formato 1 con una firma de cada clave, en ese orden. */
    static byte[] manifest(byte[] payload, KeyPair... signers) throws Exception {
        List<Object> signatures = new ArrayList<>();
        for (KeyPair pair : signers) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("keyId", keyId(pair.getPublic()));
            entry.put("sig", sign(pair.getPrivate(), payload));
            signatures.add(entry);
        }
        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("format", 1);
        manifest.put("minFormat", 1);
        manifest.put("payload", base64(payload));
        manifest.put("signatures", signatures);
        return OtaJson.write(manifest).getBytes(StandardCharsets.UTF_8);
    }

    /** El payload de good.zip (zips/cases.json) en JSON compacto, como lo firma Node. */
    static byte[] goodPayloadJson() throws Exception {
        Object payload = cases("zips/cases.json").get(0).get("payload");
        return OtaJson.write(longs(payload)).getBytes(StandardCharsets.UTF_8);
    }

    /** Lo que lee OtaJson, listo para volver a escribirse: los números (Double) a Long y NULL a null. */
    @SuppressWarnings("unchecked")
    static Object longs(Object value) {
        if (value instanceof Double) return OtaJson.asInteger(value);
        if (value instanceof Map) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : ((Map<String, Object>) value).entrySet()) {
                out.put(entry.getKey(), longs(entry.getValue()));
            }
            return out;
        }
        if (value instanceof List) {
            List<Object> out = new ArrayList<>();
            for (Object item : (List<Object>) value) out.add(longs(item));
            return out;
        }
        return value == OtaJson.NULL ? null : value;
    }
}

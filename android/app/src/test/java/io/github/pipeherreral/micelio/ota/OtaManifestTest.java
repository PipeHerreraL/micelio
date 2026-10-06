package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.PublicKey;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/**
 * El manifiesto firmado, del lado de Java: los manifiestos que firma Node (tests/fixtures/ota/manifests/)
 * dan aquí el mismo veredicto, y los casos que no caben en una fixture se firman en memoria.
 */
public class OtaManifestTest {
    private static OtaManifest.Rules rules(Map<String, PublicKey> keys, OtaManifest.VersionGate gate) {
        return new OtaManifest.Rules(Fixtures.APP_ID, "stable", Fixtures.URL_PREFIX, 1, keys, gate);
    }

    private static String verdictOf(byte[] manifest, OtaManifest.Rules rules) {
        OtaManifest.Verdict verdict = OtaManifest.verify(manifest, rules);
        return verdict.isOk() ? "ok" : verdict.reason;
    }

    /** Cada manifiesto de las fixtures da el veredicto que espera Node, con su versión y sus claves. */
    @Test
    public void everyFixtureManifestGetsItsVerdict() throws Exception {
        OtaConfig config = Fixtures.config();
        Map<String, Object> table = Fixtures.object("manifests/cases.json");
        OtaManifest.Rules rules = new OtaManifest.Rules((String) table.get("app"), config.channel, config.urlPrefix,
                (int) OtaJson.asCount(table.get("nativeLevel"), 1), config.keys, null);
        List<Map<String, Object>> cases = Fixtures.cases("manifests/cases.json");
        assertTrue(cases.size() > 25);
        for (Map<String, Object> item : cases) {
            String name = (String) item.get("name");
            OtaManifest.Verdict verdict =
                    OtaManifest.verify(Fixtures.bytes("manifests/" + item.get("file")), rules);
            if (!verdict.isOk()) {
                assertEquals(name, item.get("verdict"), verdict.reason);
                continue;
            }
            assertEquals(name, item.get("verdict"), "ok");
            assertEquals(name, item.get("version"), verdict.payload.version);
            assertEquals(name, item.get("keyIds"), new ArrayList<Object>(verdict.keyIds));
        }
    }

    /** El payload que devuelve es el firmado, campo a campo. */
    @Test
    public void returnsTheSignedPayload() throws Exception {
        OtaConfig config = Fixtures.config();
        OtaManifest.Verdict verdict =
                OtaManifest.verify(Fixtures.bytes("manifests/ok-one-key.json"), rules(config.keys, null));
        OtaManifest.Payload expected = Fixtures.payload(
                OtaJson.asObject(Fixtures.cases("zips/cases.json").get(0).get("payload")));
        OtaManifest.Payload payload = verdict.payload;
        assertEquals(Arrays.asList(expected.app, expected.channel, expected.version, expected.minNative, expected.url,
                        expected.size, expected.sha256, expected.unpacked),
                Arrays.asList(payload.app, payload.channel, payload.version, payload.minNative, payload.url,
                        payload.size, payload.sha256, payload.unpacked));
        assertEquals(expected.files.size(), payload.files.size());
        for (int i = 0; i < payload.files.size(); i++) {
            assertEquals(expected.files.get(i).toJson(), payload.files.get(i).toJson());
        }
    }

    /** Un manifiesto de justo 64 KiB vale; uno de un byte más es «format» (el campo de más se ignora). */
    @Test
    public void manifestsOverSixtyFourKibAreRejected() throws Exception {
        KeyPair key = Fixtures.newKey();
        byte[] payload = Fixtures.goodPayloadJson();
        Map<String, Object> manifest = OtaJson.asObject(OtaJson.parse(Fixtures.manifest(payload, key)));
        assertEquals("ok", verdictOf(sized(manifest, 64 * 1024), rules(Fixtures.keys(key), null)));
        assertEquals("format", verdictOf(sized(manifest, 64 * 1024 + 1), rules(Fixtures.keys(key), null)));
    }

    private static byte[] sized(Map<String, Object> manifest, int total) {
        Map<String, Object> copy = new LinkedHashMap<>(manifest);
        copy.put("format", 1);
        copy.put("minFormat", 1);
        copy.put("padding", "");
        int base = OtaJson.write(copy).getBytes(StandardCharsets.UTF_8).length;
        StringBuilder padding = new StringBuilder();
        for (int i = base; i < total; i++) padding.append('x');
        copy.put("padding", padding.toString());
        byte[] out = OtaJson.write(copy).getBytes(StandardCharsets.UTF_8);
        assertEquals(total, out.length);
        return out;
    }

    /** Basta una firma de una clave conocida; una clave repetida se anota una vez y un DER roto no lanza. */
    @Test
    public void oneKnownSignatureIsEnough() throws Exception {
        KeyPair app = Fixtures.newKey();
        KeyPair other = Fixtures.newKey();
        byte[] payload = Fixtures.goodPayloadJson();
        OtaManifest.Rules rules = rules(Fixtures.keys(app), null);
        assertEquals("ok", verdictOf(Fixtures.manifest(payload, other, app), rules));
        assertEquals("signature", verdictOf(Fixtures.manifest(payload, other), rules));

        OtaManifest.Verdict twice = OtaManifest.verify(Fixtures.manifest(payload, app, app), rules);
        assertEquals(Collections.singletonList(Fixtures.keyId(app.getPublic())), twice.keyIds);

        // Un DER que no es una firma, con el keyId de la app, y detrás la firma buena.
        String good = new String(Fixtures.manifest(payload, app), StandardCharsets.UTF_8);
        String keyId = Fixtures.keyId(app.getPublic());
        String broken = good.replace(
                "\"signatures\":[", "\"signatures\":[{\"keyId\":\"" + keyId + "\",\"sig\":\"MAA=\"},");
        assertEquals("ok", verdictOf(broken.getBytes(StandardCharsets.UTF_8), rules));
    }

    /** Hasta 8 firmas (una rotación pide dos); con 9 el manifiesto es «format», como en Node. */
    @Test
    public void atMostEightSignatures() throws Exception {
        KeyPair app = Fixtures.newKey();
        KeyPair other = Fixtures.newKey();
        byte[] payload = Fixtures.goodPayloadJson();
        OtaManifest.Rules rules = rules(Fixtures.keys(app), null);
        KeyPair[] eight = {other, other, other, other, other, other, other, app};
        assertEquals("ok", verdictOf(Fixtures.manifest(payload, eight), rules));
        KeyPair[] nine = {other, other, other, other, other, other, other, other, app};
        assertEquals("format", verdictOf(Fixtures.manifest(payload, nine), rules));
    }

    /** Un número escrito 1.0 es el entero 1, como en JS: el mismo payload vale en los dos lados. */
    @Test
    public void integralNumbersWrittenWithDecimalsCount() throws Exception {
        KeyPair app = Fixtures.newKey();
        String payload = new String(Fixtures.goodPayloadJson(), StandardCharsets.UTF_8)
                .replace("\"minNative\":1,", "\"minNative\":1.0,");
        assertTrue(payload.contains("1.0"));
        byte[] manifest = Fixtures.manifest(payload.getBytes(StandardCharsets.UTF_8), app);
        assertEquals("ok", verdictOf(manifest, rules(Fixtures.keys(app), null)));
    }

    /** Más de 1000 archivos en el payload son «size», como en Node (no caben en una fixture de 64 KiB). */
    @Test
    public void moreThanAThousandFilesAreRejectedBySize() throws Exception {
        Map<String, Object> body = new LinkedHashMap<>(
                OtaJson.asObject(OtaJson.parse(Fixtures.goodPayloadJson())));
        String sha256 = (String) body.get("sha256");
        for (int count : new int[] {1000, 1001}) {
            List<Object> files = new ArrayList<>();
            for (int i = 0; i < count; i++) files.add(Arrays.<Object>asList("f" + i, 1.0, sha256));
            body.put("files", files);
            body.put("unpacked", (double) count);
            OtaManifest.Verdict verdict = OtaManifest.checkPayload(
                    body, rules(Collections.<String, PublicKey>emptyMap(), null), Collections.<String>emptyList());
            assertEquals(String.valueOf(count), count == 1000 ? null : "size", verdict.reason);
        }
    }

    /**
     * La regla del estado de la app (mayor que la servida, la base y la pendiente; no fallida) va
     * antes que `minNative`: un manifiesto viejo que pide otro .apk no avisa de nada. Si es nueva, el
     * aviso sabe de qué versión es.
     */
    @Test
    public void theStateRuleRunsBeforeMinNative() throws Exception {
        OtaConfig config = Fixtures.config();
        byte[] needsApk = Fixtures.bytes("manifests/min-native-2.json");
        OtaManifest.Verdict old = OtaManifest.verify(needsApk, rules(config.keys, version -> false));
        assertEquals("version", old.reason);
        OtaManifest.Verdict fresh = OtaManifest.verify(needsApk, rules(config.keys, version -> true));
        assertEquals("minNative", fresh.reason);
        assertEquals("1.6.2", fresh.version);

        byte[] good = Fixtures.bytes("manifests/ok-one-key.json");
        List<String> asked = new ArrayList<>();
        OtaManifest.Verdict gated =
                OtaManifest.verify(good, rules(config.keys, version -> asked.add(version) && false));
        assertEquals("version", gated.reason);
        assertEquals(Collections.singletonList("1.6.2"), asked);
        assertNull(OtaManifest.verify(good, rules(config.keys, version -> true)).reason);
        assertNotNull(OtaManifest.verify(good, rules(config.keys, version -> true)).payload);
    }
}

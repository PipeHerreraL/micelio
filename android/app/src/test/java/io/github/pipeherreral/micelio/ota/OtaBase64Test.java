package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import java.util.Base64;
import java.util.Map;
import java.util.Random;
import org.junit.Test;

/** El base64 propio de la app (la API 24 no tiene java.util.Base64): estándar, con relleno y canónico. */
public class OtaBase64Test {
    /** Da los mismos bytes que el decodificador de Java con todo texto canónico, de 0 a 64 bytes. */
    @Test
    public void decodesCanonicalBase64LikeJava() {
        Random random = new Random(1);
        for (int length = 0; length <= 64; length++) {
            byte[] data = new byte[length];
            random.nextBytes(data);
            String text = Base64.getEncoder().encodeToString(data);
            assertArrayEquals(text, data, OtaBase64.decode(text));
        }
    }

    /** Rechaza lo que el de Node acepta pero no es canónico: bits de relleno a 1, base64url, sin relleno. */
    @Test
    public void rejectsNonCanonicalText() {
        // «aQ==» es «i»; «aR==» da lo mismo para un decodificador indulgente (el de Java incluido).
        assertArrayEquals(new byte[] {'i'}, OtaBase64.decode("aQ=="));
        assertNotNull(Base64.getDecoder().decode("aR=="));
        for (String text : new String[] {
            "aR==", "aWl=", "aQ", "aQ=", "a===", "====", "ab=c", "a-_b", "-w==", "_w==", "aQ==\n", " aQ==",
            "aQ ==", "aQ==aQ=="
        }) {
            assertNull(text, OtaBase64.decode(text));
        }
    }

    /** El payload no canónico de las fixtures, que Node rechaza, también se rechaza aquí. */
    @Test
    public void rejectsTheNonCanonicalPayloadOfTheFixtures() throws Exception {
        Map<String, Object> manifest = Fixtures.object("manifests/payload-base64-noncanonical.json");
        assertNull(OtaBase64.decode((String) manifest.get("payload")));
        Map<String, Object> good = Fixtures.object("manifests/ok-one-key.json");
        assertNotNull(OtaBase64.decode((String) good.get("payload")));
    }
}

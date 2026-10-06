package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.Map;
import org.junit.Test;

/** La configuración del .apk (res/raw/micelio_ota.json): claves P-256 con su keyId, o el actualizador inerte. */
public class OtaConfigTest {
    private static OtaConfig parse(String json) {
        return OtaConfig.parse(json.getBytes(StandardCharsets.UTF_8));
    }

    private static String config(String keys) {
        return "{\"manifestUrl\":\"https://github.com/PipeHerreraL/micelio/releases/latest/download/micelio-web.json\","
                + "\"urlPrefix\":\"" + Fixtures.URL_PREFIX + "\",\"channel\":\"stable\",\"checkIntervalSeconds\":3600,"
                + "\"keys\":" + keys + "}";
    }

    private static void assertRejected(String json) {
        try {
            parse(json);
            fail("Debería rechazar " + json);
        } catch (IllegalArgumentException expected) {
            // Lo que se espera.
        }
    }

    /** Lee la configuración de las fixtures, con las dos claves que conoce la app y sus keyId de Node. */
    @Test
    public void readsTheFixtureConfiguration() throws Exception {
        OtaConfig config = Fixtures.config();
        assertEquals(Arrays.asList(Fixtures.keyRole("test"), Fixtures.keyRole("new")),
                Arrays.asList(config.keys.keySet().toArray()));
        assertEquals("stable", config.channel);
        assertEquals(Fixtures.URL_PREFIX, config.urlPrefix);
        assertEquals(3600, config.checkIntervalSeconds);
        assertTrue(config.isActive());
        for (Map.Entry<String, PublicKey> key : config.keys.entrySet()) {
            assertEquals(key.getKey(), OtaConfig.keyIdOf(key.getValue().getEncoded()));
        }
    }

    /** Sin claves o sin URL queda inerte, como el .apk hasta que el dueño crea la clave. */
    @Test
    public void withoutKeysOrUrlTheUpdaterIsInert() throws Exception {
        String testKey = Fixtures.keyRole("test");
        assertFalse(parse(config("{}")).isActive());
        assertFalse(parse(config("{}").replace(Fixtures.URL_PREFIX, "")).isActive());
        String key = (String) OtaJson.asObject(Fixtures.object("config.json").get("keys")).get(testKey);
        String withKey = config("{\"" + testKey + "\":\"" + key + "\"}");
        assertTrue(parse(withKey).isActive());
        assertFalse(parse(withKey.replace(Fixtures.URL_PREFIX, "")).isActive());
        assertFalse(parse(withKey.replaceFirst("https://[^\"]*micelio-web.json", "")).isActive());
    }

    /** Una clave anotada con otro keyId, de otra curva o en base64 no canónico es un error nuestro: lanza. */
    @Test
    public void rejectsKeysThatAreNotWhatTheyClaim() throws Exception {
        String testKey = Fixtures.keyRole("test");
        String spki = (String) OtaJson.asObject(Fixtures.object("config.json").get("keys")).get(testKey);
        parse(config("{\"" + testKey + "\":\"" + spki + "\"}"));
        assertRejected(config("{\"" + Fixtures.keyRole("new") + "\":\"" + spki + "\"}"));

        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp384r1"));
        byte[] p384 = generator.generateKeyPair().getPublic().getEncoded();
        assertRejected(config("{\"" + OtaConfig.keyIdOf(p384) + "\":\"" + Fixtures.base64(p384) + "\"}"));

        // 91 bytes acaban en «=»; el carácter de antes lleva 4 bits de relleno que deben ir a 0.
        char last = spki.charAt(spki.length() - 3);
        String noncanonical = spki.substring(0, spki.length() - 3) + (char) (last + 1) + "==";
        assertRejected(config("{\"" + testKey + "\":\"" + noncanonical + "\"}"));
    }

    /** Un campo que falta, de otro tipo o un prefijo sin la barra final no pasan. */
    @Test
    public void rejectsMissingOrMistypedFields() {
        assertRejected("[]");
        assertRejected("{");
        assertRejected(config("[]"));
        assertRejected(config("{}").replace("\"channel\":\"stable\",", ""));
        assertRejected(config("{}").replace("\"channel\":\"stable\"", "\"channel\":\"\""));
        assertRejected(config("{}").replace("3600", "\"3600\""));
        assertRejected(config("{}").replace("3600", "-1"));
        assertRejected(config("{}").replace("releases/download/\"", "releases/download\""));
    }
}

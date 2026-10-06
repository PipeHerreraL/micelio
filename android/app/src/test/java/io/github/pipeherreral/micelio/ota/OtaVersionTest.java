package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import java.util.List;
import java.util.Map;
import org.junit.Test;

/** Las versiones de los paquetes: las mismas que acepta y ordena Node (tests/fixtures/ota/versions.json). */
public class OtaVersionTest {
    /** Acepta las válidas de versions.json y rechaza las demás (ceros a la izquierda, parche 100…). */
    @Test
    public void acceptsAndRejectsLikeNode() throws Exception {
        Map<String, Object> versions = Fixtures.object("versions.json");
        for (Object version : OtaJson.asArray(versions.get("valid"))) {
            assertNotNull((String) version, OtaVersion.parse((String) version));
        }
        for (Object version : OtaJson.asArray(versions.get("invalid"))) {
            assertNull(OtaJson.write(version), OtaVersion.parse((String) version));
        }
        assertNull(OtaVersion.parse(null));
    }

    /** Ordena como `compareGameVersions`, en los dos sentidos. */
    @Test
    public void ordersLikeCompareGameVersions() throws Exception {
        for (Object item : OtaJson.asArray(Fixtures.object("versions.json").get("compare"))) {
            List<Object> row = OtaJson.asArray(item);
            String a = (String) row.get(0);
            String b = (String) row.get(1);
            int expected = (int) (double) (Double) row.get(2);
            assertEquals(a + " frente a " + b, expected, Integer.signum(OtaVersion.compare(a, b)));
            assertEquals(b + " frente a " + a, -expected, Integer.signum(OtaVersion.compare(b, a)));
        }
    }

    /** Comparar una versión inválida es un error de quien llama: lanza en vez de inventar un orden. */
    @Test(expected = IllegalArgumentException.class)
    public void comparingAnInvalidVersionThrows() {
        OtaVersion.compare("1.6.1", "1.6");
    }
}

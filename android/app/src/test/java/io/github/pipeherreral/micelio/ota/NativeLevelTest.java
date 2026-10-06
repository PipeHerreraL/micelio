package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import io.github.pipeherreral.micelio.BuildConfig;
import java.io.File;
import java.nio.file.Files;
import java.util.Map;
import org.junit.Test;

/**
 * El nivel nativo del .apk (ARCHITECTURE.md §4.34) sale de android/native.json, el mismo archivo del
 * que el build de la app saca el `minNative` de su paquete: si Gradle lo tomara de otro sitio, el
 * .apk aceptaría paquetes que piden una parte nativa que no tiene. Gradle pasa la ruta en
 * `micelio.nativeJson`; sin Gradle, se busca desde android/app.
 */
public class NativeLevelTest {
    @Test
    public void buildConfigCarriesTheLevelOfNativeJson() throws Exception {
        String path = System.getProperty("micelio.nativeJson");
        File file = new File(path != null ? path : "../native.json");
        Map<String, Object> json = OtaJson.asObject(OtaJson.parse(Files.readAllBytes(file.toPath())));
        assertNotNull(file.getAbsolutePath(), json);
        long level = OtaJson.asCount(json.get("level"), 1);
        assertTrue("level de android/native.json: " + json.get("level"), level >= 1);
        assertEquals(level, BuildConfig.NATIVE_LEVEL);
    }
}

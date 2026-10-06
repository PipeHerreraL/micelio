package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** El disco del actualizador: state.json atómico y tolerante, y lo que el selector mira de cada paquete. */
public class OtaStoreTest {
    @Rule
    public final TemporaryFolder temp = new TemporaryFolder();

    private final List<String> events = new ArrayList<>();
    private File dir;
    private OtaStore store;
    private OtaManifest.Payload payload;

    @Before
    public void setUp() throws Exception {
        dir = new File(temp.getRoot(), "ota");
        store = new OtaStore(dir, folder -> events.add("sync " + folder.getName() + " " + describe(folder)));
        payload = Fixtures.payload(OtaJson.asObject(Fixtures.cases("zips/cases.json").get(0).get("payload")));
    }

    /** Qué hay en la carpeta en el momento del fsync: el estado ya renombrado y ningún temporal. */
    private static String describe(File folder) {
        File state = new File(folder, OtaStore.STATE);
        try {
            return new File(folder, OtaStore.STATE + ".tmp").exists() + " " + (state.exists() ? text(state) : "-");
        } catch (IOException e) {
            return e.toString();
        }
    }

    private static String text(File file) throws IOException {
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8).trim();
    }

    private OtaState fullState() {
        OtaState state = new OtaState();
        state.active = OtaState.Bundle.of(payload, Arrays.asList("fb107a2a", "a1169a83")).withBootsWithoutReady(2);
        state.pending = new OtaState.Bundle("1.6.3", Collections.singletonList("fb107a2a"), payload.sha256,
                payload.files, 1, 0);
        state.failed.add(new OtaState.Failure("1.6.4", OtaState.FAILED_SAVE));
        state.notice = new OtaState.Notice(OtaState.NOTICE_UPDATED, "1.6.2");
        state.needsApkShown.add("1.7.0");
        state.lastCheck = new OtaClock.Stamp(1_790_000_000_000L, 123_456, 9);
        state.failedCheck = new OtaClock.Stamp(1_790_000_100_000L, 223_456, -1);
        state.checkEveryBoot = true;
        state.lastError = "sha256";
        return state;
    }

    private void writeRaw(String json) throws IOException {
        assertTrue(dir.isDirectory() || dir.mkdirs());
        Files.write(new File(dir, OtaStore.STATE).toPath(), json.getBytes(StandardCharsets.UTF_8));
    }

    /** Lo escrito se lee igual, campo a campo. */
    @Test
    public void writtenStateReadsBack() throws Exception {
        OtaState state = fullState();
        store.write(state);
        OtaState back = store.read();
        assertArrayEquals(state.toJson(), back.toJson());
        assertEquals(2, back.active.bootsWithoutReady);
        assertEquals(1, back.pending.attempts);
        assertEquals(-1, back.failedCheck.bootCount);
    }

    /**
     * Se escribe en un temporal y se renombra encima, y después hay fsync de la carpeta: en ese
     * momento el estado nuevo ya está y no queda temporal. Al crear la carpeta, también la de arriba.
     */
    @Test
    public void writesAtomicallyAndSyncsTheFolder() throws Exception {
        OtaState first = new OtaState();
        first.lastError = "uno";
        store.write(first);
        assertEquals(Arrays.asList(
                "sync ota false " + new String(first.toJson(), StandardCharsets.UTF_8).trim(),
                "sync " + temp.getRoot().getName() + " false -"), events);

        events.clear();
        OtaState second = new OtaState();
        second.lastError = "dos";
        store.write(second);
        assertEquals(Collections.singletonList(
                "sync ota false " + new String(second.toJson(), StandardCharsets.UTF_8).trim()), events);
    }

    /** Si no se puede escribir el temporal, lanza y el estado anterior sigue entero. */
    @Test
    public void aFailedWriteKeepsThePreviousState() throws Exception {
        OtaState first = fullState();
        store.write(first);
        assertTrue(new File(dir, OtaStore.STATE + ".tmp").mkdir());
        try {
            store.write(new OtaState());
            fail("Debería lanzar");
        } catch (IOException expected) {
            // Lo que se espera.
        }
        assertArrayEquals(first.toJson(), store.read().toJson());
    }

    /** Sin archivo, o con uno ilegible, el estado está vacío; un JSON que no es un objeto, también. */
    @Test
    public void missingOrUnreadableStateIsEmpty() throws Exception {
        String empty = new String(new OtaState().toJson(), StandardCharsets.UTF_8);
        assertEquals(empty, new String(store.read().toJson(), StandardCharsets.UTF_8));
        for (String json : new String[] {"", "{", "[]", "﻿{}", "null", "{\"schema\":1,"}) {
            writeRaw(json);
            assertEquals(json, empty, new String(store.read().toJson(), StandardCharsets.UTF_8));
        }
    }

    /**
     * Un campo que falta o no tiene su tipo toma su valor por defecto y uno que sobra se ignora: un
     * paquete mal anotado se olvida sin llevarse el resto.
     */
    @Test
    public void readsToleratingMissingWrongAndExtraFields() throws Exception {
        Map<String, Object> full = OtaJson.asObject(OtaJson.parse(fullState().toJson()));
        String json = OtaJson.write(Fixtures.longs(full))
                .replace("\"bootsWithoutReady\":2", "\"bootsWithoutReady\":\"2\",\"extra\":[1]")
                .replace("\"attempts\":1", "\"attempts\":-3")
                .replace("\"checkEveryBoot\":true", "\"checkEveryBoot\":\"true\"")
                .replace("\"bootCount\":-1", "\"bootCount\":null")
                .replace("\"schema\":1,", "\"future\":{\"x\":1},");
        writeRaw(json);
        OtaState state = store.read();
        assertEquals("1.6.2", state.active.version);
        assertEquals(0, state.active.bootsWithoutReady);
        assertEquals(0, state.pending.attempts);
        assertFalse(state.checkEveryBoot);
        assertNull(state.failedCheck);
        assertEquals(9, state.lastCheck.bootCount);
        assertEquals("1.6.4", state.failed.get(0).version);
        assertFalse(state.foreign);

        writeRaw(json.replace("\"sha256\":\"" + payload.sha256 + "\",\"files\"", "\"sha256\":\"x\",\"files\""));
        state = store.read();
        assertNull("un activo y un pendiente sin su SHA-256 se olvidan", state.active);
        assertNull(state.pending);
        assertEquals("1.7.0", state.needsApkShown.get(0));

        writeRaw(json.replace("[\"cordova.js\",0,", "[\"cordova.js\",-1,"));
        state = store.read();
        assertNull("un archivo mal anotado se lleva el paquete entero", state.active);
        assertNull(state.pending);

        writeRaw("{\"failed\":[{\"version\":\"1.6\"},{\"version\":\"1.6.5\",\"reason\":\"render\"},3],"
                + "\"needsApkShown\":[\"x\",\"1.8.0\"],\"notice\":{\"kind\":\"updated\"}}");
        state = store.read();
        assertEquals(1, state.failed.size());
        assertEquals(Collections.singletonList("1.8.0"), state.needsApkShown);
        assertNull(state.notice);
    }

    /** Un `schema` mayor lo escribió un Java más nuevo: el estado queda ajeno y nadie lo pisa. */
    @Test
    public void aNewerSchemaIsNeverOverwritten() throws Exception {
        String json = "{\"schema\":2,\"active\":{\"version\":\"9.0.0\"},\"whatever\":true}";
        writeRaw(json);
        OtaState state = store.read();
        assertTrue(state.foreign);
        assertNull(state.active);
        try {
            store.write(state);
            fail("Debería lanzar");
        } catch (IOException expected) {
            // Lo que se espera.
        }
        assertEquals(json, text(new File(dir, OtaStore.STATE)));
    }

    /**
     * El selector ve un paquete completo con su nivel nativo; sin carpeta, sin un archivo, con uno
     * que no mide lo anotado o con un micelio-bundle.json que no dice su versión, -1. Un byte
     * cambiado sin cambiar el tamaño solo lo ve el SHA-256.
     */
    @Test
    public void seesWhetherABundleFolderIsComplete() throws Exception {
        OtaState.Bundle bundle = OtaState.Bundle.of(payload, Collections.singletonList("fb107a2a"));
        assertEquals(-1, store.minNative(bundle));
        File folder = store.bundleDir("1.6.2");
        assertNull(OtaZip.extract(Fixtures.file("zips/good.zip"), payload, folder, f -> {}));
        assertEquals(1, store.minNative(bundle));
        assertTrue(store.intact(bundle));

        File script = new File(folder, "assets/index-fixture.js");
        try (RandomAccessFile file = new RandomAccessFile(script, "rw")) {
            file.seek(10);
            int value = file.read();
            file.seek(10);
            file.write(value ^ 1);
        }
        assertEquals(1, store.minNative(bundle));
        assertFalse(store.intact(bundle));

        try (RandomAccessFile file = new RandomAccessFile(script, "rw")) {
            file.setLength(file.length() - 1);
        }
        assertEquals(-1, store.minNative(bundle));
        assertTrue(script.delete());
        assertEquals(-1, store.minNative(bundle));
        assertFalse(store.intact(bundle));

        OtaState.Bundle other = new OtaState.Bundle("1.6.3", bundle.keyIds, bundle.sha256,
                Collections.<OtaManifest.FileEntry>emptyList(), 0, 0);
        assertTrue(store.bundleDir("1.6.3").mkdirs());
        File otherInfo = new File(store.bundleDir("1.6.3"), OtaZip.BUNDLE_INFO);
        Files.copy(new File(folder, OtaZip.BUNDLE_INFO).toPath(), otherInfo.toPath());
        assertEquals("micelio-bundle.json dice 1.6.2", -1, store.minNative(other));

        Files.write(otherInfo.toPath(),
                "{\"version\":\"1.6.3\",\"minNative\":1}".getBytes(StandardCharsets.UTF_8));
        assertEquals(1, store.minNative(other));
        OtaState.Bundle escaping = new OtaState.Bundle("1.6.3", bundle.keyIds, bundle.sha256,
                Collections.singletonList(
                        new OtaManifest.FileEntry("../1.6.2/index.html", 177, payload.files.get(4).sha256)),
                0, 0);
        assertEquals(-1, store.minNative(escaping));
        assertFalse(store.intact(escaping));

        store.delete("1.6.2");
        assertFalse(folder.exists());
    }
}

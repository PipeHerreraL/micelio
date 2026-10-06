package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** Qué sirve la app al arrancar: la regla del mayor, la prueba en dos arranques y los descartes. */
public class OtaSelectorTest {
    private static final String KEY = "fb107a2a";
    private static final String NEW_KEY = "a1169a83";
    private static final String SHA = "b4a4d60fa1fd428a1ef44a226c9bee437c689ab14ffbb771c8d88c032c8ca44a";

    @Rule
    public final TemporaryFolder temp = new TemporaryFolder();

    /** Un disco en memoria: qué carpetas están completas (con su nivel nativo) y cuáles dañadas. */
    private static final class FakeDisk implements OtaSelector.Disk {
        final Map<String, Integer> folders = new HashMap<>();
        final Set<String> damaged = new HashSet<>();
        final List<String> deleted = new ArrayList<>();
        final List<String> rechecked = new ArrayList<>();
        OtaState written;
        int writes;
        boolean failWrites;
        RuntimeException explode;

        FakeDisk with(String version) {
            folders.put(version, 1);
            return this;
        }

        @Override
        public int minNative(OtaState.Bundle bundle) {
            if (explode != null) throw explode;
            Integer level = folders.get(bundle.version);
            return level == null ? -1 : level;
        }

        @Override
        public boolean intact(OtaState.Bundle bundle) {
            rechecked.add(bundle.version);
            return !damaged.contains(bundle.version);
        }

        @Override
        public void write(OtaState state) throws IOException {
            if (failWrites) throw new IOException("disco lleno");
            writes++;
            written = state.copy();
        }

        @Override
        public void delete(String version) {
            deleted.add(version);
        }
    }

    private static OtaState.Bundle bundle(String version, String... keyIds) {
        return new OtaState.Bundle(version, Arrays.asList(keyIds), SHA,
                Collections.singletonList(new OtaManifest.FileEntry("index.html", 177, SHA)), 0, 0);
    }

    private static OtaState state(OtaState.Bundle active, OtaState.Bundle pending) {
        OtaState state = new OtaState();
        state.active = active;
        state.pending = pending;
        return state;
    }

    private static OtaSelector.Decision select(String builtin, OtaState state, FakeDisk disk, String trialInProcess) {
        return OtaSelector.select(new OtaSelector.Input(builtin, 1, new LinkedHashSet<>(Arrays.asList(KEY, NEW_KEY)),
                state, trialInProcess), disk);
    }

    private static OtaSelector.Decision select(String builtin, OtaState state, FakeDisk disk) {
        return select(builtin, state, disk, null);
    }

    private static void assertServes(String version, boolean fromBundle, boolean trial, OtaSelector.Decision decision) {
        assertEquals("versión", version, decision.version);
        assertEquals("de bundles/", fromBundle, decision.fromBundle);
        assertEquals("a prueba", trial, decision.trial);
    }

    /** Sin nada descargado (o con el actualizador inerte) sirve el integrado y no escribe nada. */
    @Test
    public void withNothingDownloadedServesTheBuiltinWithoutWriting() {
        FakeDisk disk = new FakeDisk();
        OtaSelector.Decision decision = select("1.6.1", new OtaState(), disk);
        assertServes("1.6.1", false, false, decision);
        assertEquals(0, disk.writes);
        assertFalse(decision.checkNow);
    }

    /** La regla del mayor: un activo más nuevo que el integrado se sirve, y cuenta un arranque sin ready(). */
    @Test
    public void anActiveNewerThanTheBuiltinIsServedAndCounted() {
        FakeDisk disk = new FakeDisk().with("1.6.3");
        OtaSelector.Decision decision = select("1.6.1", state(bundle("1.6.3", KEY), null), disk);
        assertServes("1.6.3", true, false, decision);
        assertEquals(1, disk.written.active.bootsWithoutReady);
        assertTrue(disk.deleted.isEmpty());
    }

    /**
     * Con un .apk igual o más nuevo que el activo gana el integrado y el paquete se borra (y el
     * pendiente que no lo pase).
     */
    @Test
    public void aBuiltinAsNewOrNewerWinsAndTheBundlesGo() {
        for (String builtin : new String[] {"1.6.3", "1.6.40"}) {
            FakeDisk disk = new FakeDisk().with("1.6.3").with("1.6.4");
            OtaSelector.Decision decision = select(builtin, state(bundle("1.6.3", KEY), bundle("1.6.4", KEY)), disk);
            if (builtin.equals("1.6.3")) {
                assertServes("1.6.4", true, true, decision);
                assertEquals(Collections.singletonList("1.6.3"), disk.deleted);
            } else {
                assertServes("1.6.40", false, false, decision);
                assertEquals(Arrays.asList("1.6.3", "1.6.4"), disk.deleted);
                assertNull(disk.written.pending);
            }
            assertNull(disk.written.active);
            assertFalse(decision.checkNow);
        }
    }

    /** Un .apk más viejo que el activo no hace retroceder el juego. */
    @Test
    public void anOlderBuiltinKeepsTheActive() {
        FakeDisk disk = new FakeDisk().with("1.6.3");
        assertServes("1.6.3", true, false, select("1.6.2", state(bundle("1.6.3", KEY), null), disk));
    }

    /** Un pendiente mayor que la base se prueba con 0 y 1 intentos, y el intento se escribe antes. */
    @Test
    public void aPendingIsTriedTwiceWritingTheAttemptFirst() {
        for (int attempts = 0; attempts < OtaSelector.MAX_ATTEMPTS; attempts++) {
            FakeDisk disk = new FakeDisk().with("1.6.3").with("1.6.4");
            OtaState state = state(bundle("1.6.3", KEY), bundle("1.6.4", KEY).withAttempts(attempts));
            OtaSelector.Decision decision = select("1.6.1", state, disk);
            assertServes("1.6.4", true, true, decision);
            assertEquals(1, disk.writes);
            assertEquals(attempts + 1, disk.written.pending.attempts);
            assertEquals("el activo no cuenta: no se sirvió", 0, disk.written.active.bootsWithoutReady);
            assertEquals(attempts, state.pending.attempts);
        }
    }

    /** Tras dos arranques sin confirmar, el pendiente falla (timeout), se borra, avisa y se sirve la base. */
    @Test
    public void afterTwoUnconfirmedBootsThePendingFails() {
        FakeDisk disk = new FakeDisk().with("1.6.3").with("1.6.4");
        OtaState state = state(bundle("1.6.3", KEY), bundle("1.6.4", KEY).withAttempts(OtaSelector.MAX_ATTEMPTS));
        OtaSelector.Decision decision = select("1.6.1", state, disk);
        assertServes("1.6.3", true, false, decision);
        assertNull(disk.written.pending);
        assertEquals("1.6.4", disk.written.failed.get(0).version);
        assertEquals(OtaState.FAILED_TIMEOUT, disk.written.failed.get(0).reason);
        assertEquals(OtaState.NOTICE_ROLLED_BACK, disk.written.notice.kind);
        assertEquals("1.6.4", disk.written.notice.version);
        assertEquals(Collections.singletonList("1.6.4"), disk.deleted);
        assertEquals(1, disk.written.active.bootsWithoutReady);
    }

    /** Si la actividad se recrea durante la prueba (el tamaño de letra), sigue a prueba sin contar otro intento. */
    @Test
    public void aTrialAlreadyRunningInThisProcessIsNotCountedAgain() {
        FakeDisk disk = new FakeDisk().with("1.6.4");
        OtaState state = state(null, bundle("1.6.4", KEY).withAttempts(OtaSelector.MAX_ATTEMPTS));
        OtaSelector.Decision decision = select("1.6.1", state, disk, "1.6.4");
        assertServes("1.6.4", true, true, decision);
        assertEquals(0, disk.writes);
        assertEquals(OtaSelector.MAX_ATTEMPTS, decision.state.pending.attempts);
    }

    /** Una versión fallida no se vuelve a probar, y un pendiente que no pasa de la base sobra. */
    @Test
    public void failedOrStalePendingsAreDropped() {
        FakeDisk disk = new FakeDisk().with("1.6.4");
        OtaState failed = state(null, bundle("1.6.4", KEY));
        failed.failed.add(new OtaState.Failure("1.6.4", OtaState.FAILED_SAVE));
        assertServes("1.6.1", false, false, select("1.6.1", failed, disk));
        assertEquals(Collections.singletonList("1.6.4"), disk.deleted);
        assertNull(disk.written.pending);

        FakeDisk stale = new FakeDisk().with("1.6.4").with("1.6.3");
        assertServes("1.6.4", true, false, select("1.6.1", state(bundle("1.6.4", KEY), bundle("1.6.3", KEY)), stale));
        assertEquals(Collections.singletonList("1.6.3"), stale.deleted);
    }

    /**
     * Se descarta (y se busca enseguida) el activo con un archivo que falta o no mide lo anotado, o con
     * un `minNative` mayor que el nivel del .apk.
     */
    @Test
    public void incompleteOrTooNativeBundlesAreDiscarded() {
        FakeDisk missing = new FakeDisk();
        OtaSelector.Decision decision = select("1.6.1", state(bundle("1.6.3", KEY), null), missing);
        assertServes("1.6.1", false, false, decision);
        assertTrue(decision.checkNow);
        assertEquals(Collections.singletonList("1.6.3"), missing.deleted);
        assertNull(missing.written.active);

        FakeDisk tooNative = new FakeDisk();
        tooNative.folders.put("1.6.3", 2);
        tooNative.folders.put("1.6.4", 2);
        decision = select("1.6.1", state(bundle("1.6.3", KEY), bundle("1.6.4", KEY)), tooNative);
        assertServes("1.6.1", false, false, decision);
        assertEquals(Arrays.asList("1.6.3", "1.6.4"), tooNative.deleted);
    }

    /**
     * Un paquete verificado con una clave que el .apk ya no conoce se descarta, aunque sea el
     * 300000.0.0 (el .apk de rescate tras filtrarse la clave). En una rotación, uno firmado con las dos
     * sigue mientras el .apk conozca las dos.
     */
    @Test
    public void bundlesFromARetiredKeyAreDiscardedWhateverTheirNumber() {
        FakeDisk disk = new FakeDisk().with("300000.0.0");
        OtaSelector.Decision decision = select("1.6.14", state(bundle("300000.0.0", "0ld0ld00"), null), disk);
        assertServes("1.6.14", false, false, decision);
        assertTrue(decision.checkNow);
        assertEquals(Collections.singletonList("300000.0.0"), disk.deleted);

        FakeDisk both = new FakeDisk().with("1.6.15");
        assertServes("1.6.15", true, false, select("1.6.14", state(bundle("1.6.15", KEY, NEW_KEY), null), both));
        FakeDisk retired = new FakeDisk().with("1.6.15");
        OtaState rotated = state(bundle("1.6.15", "0ld0ld00", NEW_KEY), null);
        assertServes("1.6.14", false, false, select("1.6.14", rotated, retired));
        FakeDisk none = new FakeDisk().with("1.6.15");
        assertServes("1.6.14", false, false, select("1.6.14", state(bundle("1.6.15"), null), none));
    }

    /** Si el intento no se puede escribir (disco lleno), no hay prueba: se sirve la base y el pendiente espera. */
    @Test
    public void anUnwrittenAttemptMeansNoTrial() {
        FakeDisk disk = new FakeDisk().with("1.6.3").with("1.6.4");
        disk.failWrites = true;
        OtaSelector.Decision decision = select("1.6.1", state(bundle("1.6.3", KEY), bundle("1.6.4", KEY)), disk);
        assertServes("1.6.3", true, false, decision);
        assertEquals(0, decision.state.pending.attempts);
        assertTrue(disk.deleted.isEmpty());

        FakeDisk onlyBuiltin = new FakeDisk().with("1.6.4");
        onlyBuiltin.failWrites = true;
        assertServes("1.6.1", false, false, select("1.6.1", state(null, bundle("1.6.4", KEY)), onlyBuiltin));
    }

    /** Si el estado no se puede escribir, no se borra ninguna carpeta: el estado del disco aún la nombra. */
    @Test
    public void noFolderIsDeletedUnlessTheStateWasWritten() {
        FakeDisk disk = new FakeDisk().with("1.6.4");
        disk.failWrites = true;
        OtaSelector.Decision decision = select("1.6.5", state(bundle("1.6.3", KEY), bundle("1.6.4", KEY)), disk);
        assertServes("1.6.5", false, false, decision);
        assertTrue(disk.deleted.isEmpty());

        disk.failWrites = false;
        select("1.6.5", state(bundle("1.6.3", KEY), bundle("1.6.4", KEY)), disk);
        assertEquals(Arrays.asList("1.6.3", "1.6.4"), disk.deleted);
    }

    /** Un estado de un Java más nuevo hace servir el integrado sin escribir ni borrar nada. */
    @Test
    public void aForeignStateServesTheBuiltinAndTouchesNothing() {
        OtaState foreign = OtaState.parse("{\"schema\":2}".getBytes(StandardCharsets.UTF_8));
        FakeDisk disk = new FakeDisk().with("9.0.0");
        OtaSelector.Decision decision = select("1.6.1", foreign, disk);
        assertServes("1.6.1", false, false, decision);
        assertSame(foreign, decision.state);
        assertEquals(0, disk.writes);
        assertTrue(disk.deleted.isEmpty());
    }

    /**
     * Con cualquier excepción a mitad, choose() sirve el integrado, sin estado (no se escribe nada)
     * y con el error.
     */
    @Test
    public void anExceptionMidwayServesTheBuiltin() {
        FakeDisk disk = new FakeDisk().with("1.6.3");
        disk.explode = new IllegalStateException("roto");
        OtaSelector.Input input = new OtaSelector.Input("1.6.1", 1, Collections.singleton(KEY),
                state(bundle("1.6.3", KEY), null), null);
        OtaSelector.Decision decision = OtaSelector.choose(input, disk);
        assertServes("1.6.1", false, false, decision);
        assertNull(decision.state);
        assertSame(disk.explode, decision.error);
        assertEquals(0, disk.writes);

        OtaSelector.Decision invalid = OtaSelector.choose(
                new OtaSelector.Input("1.6", 1, Collections.singleton(KEY), new OtaState(), null), new FakeDisk());
        assertEquals("1.6", invalid.version);
        assertFalse(invalid.fromBundle);
        assertNotNull(invalid.error);
    }

    /**
     * Al tercer arranque seguido sin ready() del activo se recalculan sus SHA-256: intacto, se sigue
     * sirviendo y se busca en cada arranque (y no se recalcula más); dañado, se descarta, se sirve el
     * integrado y se busca ya, sin marcarlo fallido (se vuelve a bajar).
     */
    @Test
    public void aConfirmedVersionThatStopsStartingIsRecheckedOnTheThirdBoot() {
        FakeDisk disk = new FakeDisk().with("1.6.12");
        OtaState state = state(bundle("1.6.12", KEY).withBootsWithoutReady(1), null);
        OtaSelector.Decision second = select("1.6.1", state, disk);
        assertTrue(disk.rechecked.isEmpty());
        OtaSelector.Decision third = select("1.6.1", second.state, disk);
        assertServes("1.6.12", true, false, third);
        assertEquals(Collections.singletonList("1.6.12"), disk.rechecked);
        assertTrue(third.state.checkEveryBoot);
        assertFalse(third.checkNow);
        select("1.6.1", third.state, disk);
        assertEquals("no se recalcula en cada arranque", 1, disk.rechecked.size());

        FakeDisk damaged = new FakeDisk().with("1.6.12");
        damaged.damaged.add("1.6.12");
        OtaState broken = state(bundle("1.6.12", KEY).withBootsWithoutReady(2), null);
        OtaSelector.Decision dropped = select("1.6.1", broken, damaged);
        assertServes("1.6.1", false, false, dropped);
        assertTrue(dropped.checkNow);
        assertEquals(Collections.singletonList("1.6.12"), damaged.deleted);
        assertTrue(dropped.state.failed.isEmpty());
        assertFalse(dropped.state.checkEveryBoot);
    }

    /** Buscar en cada arranque es por un activo concreto: si se va (gana el integrado, o se descarta), se acaba. */
    @Test
    public void checkingOnEveryBootEndsWithTheActive() {
        for (boolean discarded : new boolean[] {false, true}) {
            FakeDisk disk = discarded ? new FakeDisk() : new FakeDisk().with("1.6.12");
            OtaState state = state(bundle("1.6.12", KEY).withBootsWithoutReady(5), null);
            state.checkEveryBoot = true;
            OtaSelector.Decision decision = select(discarded ? "1.6.1" : "1.6.12", state, disk);
            assertServes(discarded ? "1.6.1" : "1.6.12", false, false, decision);
            assertFalse(decision.state.checkEveryBoot);
            assertFalse(disk.written.checkEveryBoot);
        }
    }

    /** Un estado con el mismo número de activo y de pendiente olvida el pendiente sin borrar la carpeta del activo. */
    @Test
    public void theFolderOfTheServedBundleIsNeverDeleted() {
        FakeDisk disk = new FakeDisk().with("1.6.3");
        OtaSelector.Decision decision = select("1.6.1", state(bundle("1.6.3", KEY), bundle("1.6.3", KEY)), disk);
        assertServes("1.6.3", true, false, decision);
        assertNull(disk.written.pending);
        assertTrue(disk.deleted.isEmpty());
    }

    /** Las versiones fallidas y los avisos de .apk que no pasan de la base se olvidan: las listas no crecen sin fin. */
    @Test
    public void failuresAndApkNoticesUpToTheBaseAreForgotten() {
        FakeDisk disk = new FakeDisk().with("1.6.4");
        OtaState state = state(bundle("1.6.4", KEY), null);
        state.failed.add(new OtaState.Failure("1.6.2", OtaState.FAILED_ERROR));
        state.failed.add(new OtaState.Failure("1.6.5", OtaState.FAILED_RENDER));
        state.needsApkShown.addAll(Arrays.asList("1.6.3", "1.7.0"));
        select("1.6.1", state, disk);
        assertEquals(1, disk.written.failed.size());
        assertEquals("1.6.5", disk.written.failed.get(0).version);
        assertEquals(Collections.singletonList("1.7.0"), disk.written.needsApkShown);
    }

    /**
     * Con el disco de verdad: el activo se sirve mientras sus archivos están, y uno truncado (un corte
     * de luz) lo descarta y se lleva su carpeta.
     */
    @Test
    public void withTheRealDiskATruncatedFileDiscardsTheActive() throws Exception {
        OtaStore store = new OtaStore(new File(temp.getRoot(), "ota"), dir -> {});
        OtaManifest.Payload payload =
                Fixtures.payload(OtaJson.asObject(Fixtures.cases("zips/cases.json").get(0).get("payload")));
        assertNull(OtaZip.extract(Fixtures.file("zips/good.zip"), payload, store.bundleDir("1.6.2"), dir -> {}));
        OtaState state = new OtaState();
        state.active = OtaState.Bundle.of(payload, Collections.singletonList(KEY));
        store.write(state);

        OtaSelector.Input input = new OtaSelector.Input("1.6.1", 1, Collections.singleton(KEY), store.read(), null);
        assertServes("1.6.2", true, false, OtaSelector.choose(input, store));
        assertEquals(1, store.read().active.bootsWithoutReady);

        try (RandomAccessFile file = new RandomAccessFile(new File(store.bundleDir("1.6.2"), "index.html"), "rw")) {
            file.setLength(10);
        }
        input = new OtaSelector.Input("1.6.1", 1, Collections.singleton(KEY), store.read(), null);
        OtaSelector.Decision decision = OtaSelector.choose(input, store);
        assertServes("1.6.1", false, false, decision);
        assertNull(store.read().active);
        assertFalse(store.bundleDir("1.6.2").exists());
    }
}

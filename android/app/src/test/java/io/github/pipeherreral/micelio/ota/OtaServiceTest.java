package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyPair;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * El actualizador en marcha, con el reloj, los hilos y la red simulados: la carrera entre ready() y el
 * reloj, el primer plano, los descartes, la limpieza de restos, «Usar ahora» con una descarga en curso,
 * el disco lleno y dos escritores a la vez.
 */
public class OtaServiceTest {
    private static final String MANIFEST_URL =
            "https://github.com/PipeHerreraL/micelio/releases/latest/download/micelio-web.json";
    private static final long WALL = 1_790_000_000_000L;
    private static final long MINUTE = 60_000;

    @Rule
    public final TemporaryFolder temp = new TemporaryFolder();

    private final ManualSerial serial = new ManualSerial();
    private final Queue<Runnable> network = new ArrayDeque<>();
    private final FakeHttp http = new FakeHttp();
    private final FakeHost host = new FakeHost();
    // Las dos actividades de una recreación durante una prueba (trialAcrossARecreation).
    private final FakeHost staleHost = new FakeHost();
    private final FakeHost liveHost = new FakeHost();
    private OtaService.Session stale;
    private final List<String> logs = new ArrayList<>();
    private final List<String> downloaded = new ArrayList<>();
    private KeyPair key;
    private File dir;
    private OtaStore store;
    private OtaService service;

    @Before
    public void setUp() throws Exception {
        key = Fixtures.newKey();
        dir = new File(temp.getRoot(), "ota");
        store = new OtaStore(dir, folder -> {});
    }

    /** Ninguna tarea del hilo lanzó: un error ahí se anota y no pasa de ahí, así que lo mira cada prueba. */
    @After
    public void nothingThrewInTheServiceThread() {
        for (String line : logs) assertFalse(line, line.startsWith("Error en el hilo"));
    }

    // ---- Lo que simula el sistema ----

    /** El hilo del servicio, a mano: cada tarea corre cuando la prueba lleva el reloj a su hora. */
    private static final class ManualSerial implements OtaService.Serial {
        long now;
        private long order;
        private final List<long[]> keys = new ArrayList<>();
        private final List<Runnable> tasks = new ArrayList<>();

        @Override
        public void execute(Runnable task) {
            add(now, task);
        }

        @Override
        public OtaService.Cancellable schedule(Runnable task, long delayMillis) {
            long[] entry = add(now + delayMillis, task);
            return () -> remove(entry);
        }

        @Override
        public <T> T call(Callable<T> task) throws Exception {
            runDue();
            return task.call();
        }

        /** Corre lo que toca hasta ahora, también lo que eso encole para ahora. */
        void runDue() {
            for (Runnable task = next(now); task != null; task = next(now)) task.run();
        }

        /** Avanza el reloj, corriendo cada tarea a su hora. */
        void advance(long millis) {
            long end = now + millis;
            for (long[] entry = first(end); entry != null; entry = first(end)) {
                now = Math.max(now, entry[0]);
                Runnable task = tasks.get(keys.indexOf(entry));
                remove(entry);
                task.run();
            }
            now = end;
        }

        private long[] add(long time, Runnable task) {
            long[] entry = {time, order++};
            keys.add(entry);
            tasks.add(task);
            return entry;
        }

        private void remove(long[] entry) {
            int at = keys.indexOf(entry);
            if (at < 0) return;
            keys.remove(at);
            tasks.remove(at);
        }

        private long[] first(long limit) {
            long[] best = null;
            for (long[] entry : keys) {
                if (entry[0] > limit) continue;
                if (best == null || entry[0] < best[0] || (entry[0] == best[0] && entry[1] < best[1])) best = entry;
            }
            return best;
        }

        private Runnable next(long limit) {
            long[] entry = first(limit);
            if (entry == null) return null;
            Runnable task = tasks.get(keys.indexOf(entry));
            remove(entry);
            return task;
        }
    }

    /** La red: el manifiesto publicado y los zips por URL, y cada petición en orden. */
    private static class FakeHttp implements OtaService.Http {
        final List<String> requests = new ArrayList<>();
        final Map<String, byte[]> files = new HashMap<>();
        OtaService.Fetched manifest = new OtaService.Fetched(404, null);

        void publish(Fixtures.Release release, byte[] signedManifest) {
            manifest = new OtaService.Fetched(200, signedManifest);
            files.put(release.url, release.zip);
        }

        @Override
        public OtaService.Fetched fetch(String url, int maxBytes, OtaService.Cancel cancel) {
            requests.add(url);
            return url.equals(MANIFEST_URL) ? manifest : new OtaService.Fetched(404, null);
        }

        @Override
        public String download(String url, File dest, long size, String sha256, OtaService.Cancel cancel) {
            requests.add(url);
            // Cortada con «Usar ahora» mientras esperaba su turno: como una conexión cerrada.
            if (cancel.isCancelled()) return "network";
            byte[] data = files.get(url);
            if (data == null) return "network";
            try (FileOutputStream out = new FileOutputStream(dest)) {
                out.write(data, 0, (int) Math.min(size, data.length));
            } catch (IOException error) {
                return "disk";
            }
            if (data.length != size) return "size";
            return OtaFiles.hex(OtaFiles.sha256().digest(data)).equals(sha256) ? null : "sha256";
        }
    }

    private static final class FakeHost implements OtaService.Host {
        int recreated;
        int finished;
        /** La actividad vieja de una recreación: como en ActivityHost, recreate() y finish() no hacen nada. */
        boolean destroyed;

        @Override
        public void recreate() {
            if (!destroyed) recreated++;
        }

        @Override
        public void finish() {
            if (!destroyed) finished++;
        }
    }

    private OtaConfig config(long intervalSeconds) {
        return OtaConfig.parse(("{\"manifestUrl\":\"" + MANIFEST_URL + "\",\"urlPrefix\":\"" + Fixtures.URL_PREFIX
                + "\",\"channel\":\"stable\",\"checkIntervalSeconds\":" + intervalSeconds + ",\"keys\":{\""
                + Fixtures.keyId(key.getPublic()) + "\":\"" + Fixtures.base64(key.getPublic().getEncoded()) + "\"}}")
                .getBytes(StandardCharsets.UTF_8));
    }

    /** Un proceso nuevo: otro servicio sobre la misma carpeta. */
    private OtaService start(String builtin, OtaConfig config) {
        service = new OtaService(dir, config, builtin, 1, Fixtures.APP_ID, "1.6.1-debug",
                () -> new OtaClock.Stamp(WALL + serial.now, serial.now, 7), serial, network::add, http,
                folder -> {}, (message, error) -> logs.add(message));
        service.addListener(downloaded::add);
        return service;
    }

    private OtaService start(String builtin) {
        return start(builtin, config(3600));
    }

    /** Corre la red y el hilo del servicio hasta que no quede nada por hacer ahora. */
    private void settle() {
        do {
            while (!network.isEmpty()) network.poll().run();
            serial.runDue();
        } while (!network.isEmpty());
    }

    /** Un paquete ya descomprimido en bundles/ y anotado como pendiente (o activo), como lo deja una descarga. */
    private OtaState.Bundle onDisk(Fixtures.Release release, boolean active, int count) throws Exception {
        OtaManifest.Payload payload = release.parsed();
        File zip = temp.newFile("v" + release.version + ".zip");
        Files.write(zip.toPath(), release.zip);
        assertNull(OtaZip.extract(zip, payload, store.bundleDir(release.version), folder -> {}));
        OtaState state = store.read();
        String keyId = Fixtures.keyId(key.getPublic());
        OtaState.Bundle bundle = OtaState.Bundle.of(payload, Collections.singletonList(keyId));
        if (active) state.active = bundle.withBootsWithoutReady(count);
        else state.pending = bundle.withAttempts(count);
        store.write(state);
        return bundle;
    }

    private List<String> ready(OtaService.Session session) {
        List<String> out = new ArrayList<>();
        service.ready(session, (result, notice) ->
                out.add(result + (notice == null ? "" : " " + notice.kind + " " + notice.version)));
        serial.runDue();
        return out;
    }

    private List<String> checkNow() {
        List<String> out = new ArrayList<>();
        service.checkNow((result, version) -> out.add(result + (version == null ? "" : " " + version)));
        settle();
        return out;
    }

    /** Lo que impide escribir state.json: una carpeta donde va su temporal. */
    private File blockWrites() {
        File blocker = new File(dir, OtaStore.STATE + ".tmp");
        assertTrue(blocker.mkdirs());
        return blocker;
    }

    /**
     * La 1.6.2 a prueba en una actividad que se recrea a los 10 s (otro tamaño de letra): la vieja queda
     * destruida y la nueva, con su propia actividad, vuelve a servirla a prueba. Devuelve el arranque de
     * la nueva; el de la vieja queda en {@link #stale}.
     */
    private OtaService.Session trialAcrossARecreation() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        start("1.6.1");
        stale = service.select(staleHost);
        service.resumed(stale);
        serial.advance(10_000);
        service.paused(stale);
        staleHost.destroyed = true;
        OtaService.Session live = service.select(liveHost);
        assertTrue(live.trial);
        service.resumed(live);
        return live;
    }

    /**
     * La prueba terminó sin confirmarse (el reloj, o un aviso del arranque viejo): la actividad viva vuelve
     * a arrancar, una vez, y lo que sirve entonces es la base, que guarda. Hasta que arranca, sigue sin
     * guardar.
     */
    private void theLiveActivityGoesBackToTheBase(OtaService.Session live) throws Exception {
        assertEquals("la actividad viva vuelve a arrancar", 1, liveHost.recreated);
        assertEquals(Collections.singletonList(OtaService.TOO_LATE), ready(live));
        assertTrue(service.bootJson(live).startsWith("{\"trial\":true,"));
        assertEquals("una sola vez", 1, liveHost.recreated);
        liveHost.destroyed = true;
        OtaService.Session base = service.select(new FakeHost());
        assertFalse(base.trial);
        assertEquals("1.6.1", base.version);
        assertTrue(service.bootJson(base).startsWith("{\"trial\":false,"));
    }

    // ---- La carrera entre ready() y el reloj ----

    /**
     * Con 30 s de primer plano sin ready(), la versión falla y la actividad se recrea; un ready() que
     * llega después es «tooLate».
     */
    @Test
    public void whenTheClockWinsALateReadyIsTooLate() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        assertTrue(session.trial);
        assertEquals("1.6.2", session.version);
        assertEquals(store.bundleDir("1.6.2"), session.folder);
        assertEquals("el intento se escribe antes de servirla", 1, store.read().pending.attempts);

        service.resumed(session);
        serial.advance(OtaService.TRIAL_MILLIS - 1);
        assertEquals(0, host.recreated);
        serial.advance(1);
        assertEquals(1, host.recreated);
        OtaState state = store.read();
        assertNull(state.pending);
        assertEquals(1, state.failed.size());
        assertEquals(OtaState.FAILED_TIMEOUT, state.failed.get(0).reason);
        assertEquals(OtaState.NOTICE_ROLLED_BACK + " 1.6.2", state.notice.kind + " " + state.notice.version);
        assertFalse(store.bundleDir("1.6.2").exists());

        assertEquals(Collections.singletonList(OtaService.TOO_LATE), ready(session));
        assertEquals("el aviso queda para el arranque que sigue", OtaState.NOTICE_ROLLED_BACK,
                store.read().notice.kind);
        OtaService.Session next = service.select(host);
        assertFalse(next.trial);
        assertEquals("1.6.1", next.version);
        assertNull(next.folder);

        // Una versión fallida no se vuelve a probar: el mismo manifiesto ya no la descarga.
        Fixtures.Release again = Fixtures.release("1.6.2", 1);
        http.publish(again, again.manifest(key));
        assertEquals(Collections.singletonList(OtaService.NONE), checkNow());
        assertEquals(Collections.singletonList(MANIFEST_URL), http.requests);
        assertEquals("version", store.read().lastError);
    }

    /** ready() a los 29,9 s confirma (y lo dice con el aviso «updated»); el reloj ya no hace nada. */
    @Test
    public void aReadyBeforeTheClockConfirmsAndTheClockDoesNothing() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        service.resumed(session);
        serial.advance(OtaService.TRIAL_MILLIS - 100);
        assertEquals(Collections.singletonList("confirmed updated 1.6.2"), ready(session));

        OtaState state = store.read();
        assertEquals("1.6.2", state.active.version);
        assertNull(state.pending);
        assertTrue(state.failed.isEmpty());
        assertNull("el aviso ya va en la respuesta", state.notice);
        serial.advance(10 * MINUTE);
        assertEquals(0, host.recreated);
        assertTrue(store.read().failed.isEmpty());

        List<Boolean> trial = new ArrayList<>();
        service.status(session, status -> trial.add(status.trial));
        serial.runDue();
        assertEquals(Collections.singletonList(false), trial);
        assertEquals("ya no está a prueba", Collections.singletonList(OtaService.NOT_TRIAL),
                ready(service.select(host)));
    }

    /** El reloj solo cuenta el primer plano: 20 s, una hora en segundo plano y 10 s más. */
    @Test
    public void theClockOnlyCountsTheForeground() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        service.resumed(session);
        serial.advance(20_000);
        service.paused(session);
        serial.advance(60 * MINUTE);
        service.resumed(session);
        serial.advance(9_999);
        assertEquals(0, host.recreated);
        serial.advance(1);
        assertEquals(1, host.recreated);
        assertTrue(store.read().hasFailed("1.6.2"));
    }

    /**
     * Si la actividad se recrea durante la prueba (otro tamaño de letra), vuelve a servirla sin contar
     * otro intento, y el reloj sigue su cuenta; al vencer, vuelve a arrancar la actividad nueva.
     */
    @Test
    public void recreatingDuringATrialKeepsTheClockAndCountsNoAttempt() throws Exception {
        OtaService.Session live = trialAcrossARecreation();
        assertEquals(1, store.read().pending.attempts);
        serial.advance(19_999);
        assertEquals(0, liveHost.recreated);
        serial.advance(1);
        assertEquals(OtaState.FAILED_TIMEOUT, store.read().failed.get(0).reason);
        theLiveActivityGoesBackToTheBase(live);
    }

    /**
     * Una recarga de la página tras confirmar, en la misma actividad («Recargar» del aviso del idioma, o
     * el de los socios), vuelve a leer MicelioBoot y vuelve a llamar a ready(): lee que ya no está a
     * prueba, y ready() vuelve a responder «confirmed», así que guarda. Con «tooLate» no guardaría nunca
     * más en esa actividad (ningún reloj actúa ya, y Atrás no la cierra).
     */
    @Test
    public void aReloadAfterConfirmingIsNoLongerOnTrialAndMaySave() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        assertTrue(service.bootJson(session).startsWith("{\"trial\":true,"));
        service.resumed(session);
        serial.advance(2_000);
        assertEquals(Collections.singletonList("confirmed updated 1.6.2"), ready(session));

        assertTrue(service.bootJson(session), service.bootJson(session).startsWith("{\"trial\":false,"));
        assertEquals("el aviso ya se dio", Collections.singletonList(OtaService.CONFIRMED), ready(session));
        List<Boolean> trial = new ArrayList<>();
        service.status(session, status -> trial.add(status.trial));
        serial.runDue();
        assertEquals(Collections.singletonList(false), trial);
        serial.advance(10 * MINUTE);
        assertEquals(0, host.recreated);
        assertEquals("1.6.2", store.read().active.version);
        assertTrue(store.read().failed.isEmpty());
    }

    /**
     * La actividad se recrea (otro tamaño de letra) justo cuando su JS llama a ready(). Si ese ready()
     * llega después de elegir el arranque de la nueva, confirma la versión, y la nueva, que la sirvió a
     * prueba, también puede guardar: lee que ya no está a prueba, y su ready() da el aviso.
     */
    @Test
    public void aStaleReadyAfterTheRecreationLetsTheNewStartSave() throws Exception {
        OtaService.Session live = trialAcrossARecreation();
        assertEquals("el arranque viejo no da por visto el aviso",
                Collections.singletonList(OtaService.CONFIRMED), ready(stale));

        assertTrue(service.bootJson(live), service.bootJson(live).startsWith("{\"trial\":false,"));
        assertEquals(Collections.singletonList("confirmed updated 1.6.2"), ready(live));
        serial.advance(10 * MINUTE);
        assertEquals(0, liveHost.recreated);
        assertEquals("1.6.2", store.read().active.version);
    }

    /**
     * Disco lleno: una confirmación que no se puede escribir responde «tooLate» y recrea, sin dar la
     * versión por fallida; el selector no empieza una prueba cuyo intento no se puede anotar, y la
     * vuelve a probar cuando se puede.
     */
    @Test
    public void aFullDiskNeverConfirmsNorStartsATrialAndFailsNothing() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        File blocker = blockWrites();
        assertEquals(Collections.singletonList(OtaService.TOO_LATE), ready(session));
        assertEquals(1, host.recreated);
        assertTrue("una recarga antes de recrear sigue sin guardar",
                service.bootJson(session).startsWith("{\"trial\":true,"));
        assertEquals(Collections.singletonList(OtaService.TOO_LATE), ready(session));

        OtaService.Session base = service.select(host);
        assertFalse(base.trial);
        assertEquals("1.6.1", base.version);
        assertTrue(blocker.delete());
        OtaService.Session retried = service.select(host);
        assertTrue(retried.trial);
        OtaState state = store.read();
        assertEquals(2, state.pending.attempts);
        assertTrue(state.failed.isEmpty());
        assertEquals(Collections.singletonList("confirmed updated 1.6.2"), ready(retried));
    }

    /**
     * El ready() de la actividad vieja de una recreación llega tras elegir la nueva, con el disco lleno: la
     * confirmación no se escribe, y la que vuelve a arrancar es la nueva, que si no seguiría sirviendo la
     * versión sin guardar y sin reloj.
     */
    @Test
    public void aStaleReadyThatCannotConfirmRestartsTheLiveActivity() throws Exception {
        OtaService.Session live = trialAcrossARecreation();
        blockWrites();
        assertEquals(Collections.singletonList(OtaService.TOO_LATE), ready(stale));
        assertTrue("no es culpa de la versión", store.read().failed.isEmpty());
        theLiveActivityGoesBackToTheBase(live);
    }

    // ---- Rechazar y la caída del renderizador ----

    /** reject('save') retira la versión a prueba con su aviso; fuera de prueba no hace nada. */
    @Test
    public void rejectRetiresOnlyAVersionOnTrial() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        service.reject(session, OtaState.FAILED_SAVE);
        serial.runDue();
        assertEquals(1, host.recreated);
        OtaState state = store.read();
        assertEquals(OtaState.FAILED_SAVE, state.failed.get(0).reason);
        assertEquals(OtaState.NOTICE_SAVE_REJECTED, state.notice.kind);
        assertNull(state.pending);

        OtaService.Session base = service.select(host);
        service.reject(base, OtaState.FAILED_ERROR);
        serial.runDue();
        assertEquals(1, host.recreated);
        assertEquals(1, store.read().failed.size());
    }

    /**
     * Un renderizador caído: a prueba, la versión falla («render»); si no, se recrea la actividad; con
     * tres caídas en un minuto, se cierra en vez de entrar en bucle.
     */
    @Test
    public void aCrashedRendererFailsTheTrialAndNeverLoops() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        service.renderGone(session);
        serial.runDue();
        assertEquals(OtaState.FAILED_RENDER, store.read().failed.get(0).reason);
        assertEquals(1, host.recreated);

        OtaService.Session base = service.select(host);
        serial.advance(10_000);
        service.renderGone(base);
        serial.runDue();
        assertEquals(2, host.recreated);
        serial.advance(10_000);
        service.renderGone(base);
        serial.runDue();
        assertEquals(2, host.recreated);
        assertEquals(1, host.finished);

        serial.advance(MINUTE);
        service.renderGone(base);
        serial.runDue();
        assertEquals("pasado el minuto, se recrea otra vez", 3, host.recreated);
    }

    /**
     * Un reject() de la actividad vieja de una recreación que llega tras elegir la nueva (Capacitor
     * reparte las llamadas que ya estaban en cola al cerrarse): la versión falla y vuelve a arrancar la
     * nueva. Con «save», la nueva también rechaza antes de montar, y su reject() ya no decide nada: sin
     * volver a arrancarla, se quedaría en la pantalla de carga.
     */
    @Test
    public void aStaleRejectForTheSaveRestartsTheLiveActivity() throws Exception {
        OtaService.Session live = trialAcrossARecreation();
        service.reject(stale, OtaState.FAILED_SAVE);
        serial.runDue();
        OtaState state = store.read();
        assertEquals(OtaState.FAILED_SAVE, state.failed.get(0).reason);
        assertEquals(OtaState.NOTICE_SAVE_REJECTED, state.notice.kind);
        theLiveActivityGoesBackToTheBase(live);
    }

    /** Lo mismo con un error antes de confirmar: si no, la nueva jugaría sin guardar y sin aviso. */
    @Test
    public void aStaleRejectForAnErrorRestartsTheLiveActivity() throws Exception {
        OtaService.Session live = trialAcrossARecreation();
        service.reject(stale, OtaState.FAILED_ERROR);
        serial.runDue();
        OtaState state = store.read();
        assertEquals(OtaState.FAILED_ERROR, state.failed.get(0).reason);
        assertEquals(OtaState.NOTICE_ROLLED_BACK, state.notice.kind);
        theLiveActivityGoesBackToTheBase(live);
    }

    /** Y con la caída del renderizador de la actividad vieja. */
    @Test
    public void aStaleRendererCrashRestartsTheLiveActivity() throws Exception {
        OtaService.Session live = trialAcrossARecreation();
        service.renderGone(stale);
        serial.runDue();
        assertEquals(OtaState.FAILED_RENDER, store.read().failed.get(0).reason);
        assertEquals(0, liveHost.finished);
        theLiveActivityGoesBackToTheBase(live);
    }

    // ---- Los restos y el estado ajeno ----

    /**
     * La primera vez en el proceso se borran la descarga a medias, las carpetas de descompresión y los
     * paquetes que el estado no nombra; nunca más en ese proceso, porque podría ser una descarga en curso.
     */
    @Test
    public void leftoversAreCollectedOncePerProcess() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), true, 0);
        File download = new File(dir, OtaService.DOWNLOAD);
        File staging = new File(dir, OtaService.STAGING_PREFIX + "1.6.9");
        File orphan = store.bundleDir("9.9.9");
        File temporary = new File(dir, OtaStore.STATE + ".tmp");
        assertTrue(download.createNewFile());
        assertTrue(new File(staging, "assets").mkdirs());
        assertTrue(new File(orphan, "index.html").getParentFile().mkdirs());
        assertTrue(new File(orphan, "index.html").createNewFile());
        assertTrue(temporary.createNewFile());

        start("1.6.1");
        OtaService.Session session = service.select(host);
        assertEquals("1.6.2", session.version);
        assertFalse(download.exists());
        assertFalse(staging.exists());
        assertFalse(orphan.exists());
        assertFalse(temporary.exists());
        assertTrue(store.bundleDir("1.6.2").isDirectory());

        assertTrue(staging.mkdirs());
        service.select(host);
        assertTrue("una descarga en curso no se toca al recrear", staging.exists());
    }

    /** Un estado de un Java más nuevo: se sirve el integrado y no se toca nada, ni sus carpetas. */
    @Test
    public void aStateFromANewerJavaIsNeverTouched() throws Exception {
        assertTrue(dir.mkdirs());
        byte[] foreign = "{\"schema\":2,\"active\":{\"version\":\"9.0.0\"}}".getBytes(StandardCharsets.UTF_8);
        Files.write(new File(dir, OtaStore.STATE).toPath(), foreign);
        File folder = store.bundleDir("9.0.0");
        assertTrue(folder.mkdirs());
        assertTrue(new File(dir, OtaService.DOWNLOAD).createNewFile());

        start("1.6.1");
        OtaService.Session session = service.select(host);
        assertEquals("1.6.1", session.version);
        assertFalse(session.trial);
        assertEquals(Collections.singletonList(OtaService.NOT_TRIAL), ready(session));
        assertEquals(Collections.singletonList(OtaService.NONE), checkNow());
        service.resumed(session);
        serial.advance(MINUTE);
        assertTrue(http.requests.isEmpty());
        assertTrue(folder.isDirectory());
        assertTrue(new File(dir, OtaService.DOWNLOAD).exists());
        assertArrayEquals(foreign, Files.readAllBytes(new File(dir, OtaStore.STATE).toPath()));
    }

    /** Si el selector falla, se sirve el integrado y no se escribe nada más en ese proceso. */
    @Test
    public void aFailedSelectorWritesNothingForTheRestOfTheProcess() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        byte[] before = Files.readAllBytes(new File(dir, OtaStore.STATE).toPath());
        start("no es una versión");
        OtaService.Session session = service.select(host);
        assertFalse(session.trial);
        assertNull(session.folder);
        assertEquals(Collections.singletonList(OtaService.NOT_TRIAL), ready(session));
        assertEquals(Collections.singletonList(OtaService.NONE), checkNow());
        assertFalse(service.select(host).trial);
        assertArrayEquals(before, Files.readAllBytes(new File(dir, OtaStore.STATE).toPath()));
        assertTrue(logs.toString(), logs.get(0).startsWith("El selector falló"));
    }

    // ---- Buscar y descargar ----

    /**
     * 15 s después de volver al primer plano busca, verifica, descarga y deja el pendiente con su aviso;
     * el siguiente arranque lo prueba. Con el intervalo de una hora, no vuelve a buscar antes.
     */
    @Test
    public void aCheckDownloadsTheNewVersionForTheNextStart() throws Exception {
        Fixtures.Release release = Fixtures.release("1.6.2", 1);
        http.publish(release, release.manifest(key));
        start("1.6.1");
        OtaService.Session session = service.select(host);
        // Lo que deja un corte entre el renameTo y la escritura del estado: se borra antes de mover.
        File stale = new File(store.bundleDir("1.6.2"), "old.js");
        assertTrue(stale.getParentFile().mkdirs());
        assertTrue(stale.createNewFile());
        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS - 1);
        assertTrue(http.requests.isEmpty());
        serial.advance(1);
        settle();
        assertEquals(Arrays.asList(MANIFEST_URL, release.url), http.requests);
        assertEquals(Collections.singletonList("1.6.2"), downloaded);
        OtaState state = store.read();
        assertEquals("1.6.2", state.pending.version);
        assertEquals(Collections.singletonList(Fixtures.keyId(key.getPublic())), state.pending.keyIds);
        assertEquals(WALL + OtaService.CHECK_DELAY_MILLIS, state.lastCheck.wall);
        assertNull(state.lastError);
        assertEquals(1, store.minNative(state.pending));
        assertFalse(stale.exists());
        assertFalse(new File(dir, OtaService.DOWNLOAD).exists());
        assertFalse(new File(dir, OtaService.STAGING_PREFIX + "1.6.2").exists());

        service.paused(session);
        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        assertEquals("el intervalo no ha pasado", 2, http.requests.size());
        service.paused(session);
        serial.advance(60 * MINUTE);
        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        settle();
        assertEquals(MANIFEST_URL, http.requests.get(2));

        start("1.6.1");
        OtaService.Session next = service.select(host);
        assertTrue(next.trial);
        assertEquals("1.6.2", next.version);
    }

    /** Un manifiesto rechazado no veta la versión, no baja el zip y deja el motivo; luego llega el bueno. */
    @Test
    public void aRejectedManifestDownloadsNothingAndVetoesNothing() throws Exception {
        Fixtures.Release release = Fixtures.release("1.6.2", 1);
        http.publish(release, release.manifest(Fixtures.newKey()));
        start("1.6.1");
        service.select(host);
        assertEquals(Collections.singletonList(OtaService.FAILED), checkNow());
        assertEquals(Collections.singletonList(MANIFEST_URL), http.requests);
        OtaState state = store.read();
        assertEquals("signature", state.lastError);
        assertTrue(state.failed.isEmpty());

        http.publish(release, release.manifest(key));
        assertEquals(Collections.singletonList("ready 1.6.2"), checkNow());
        assertEquals("1.6.2", store.read().pending.version);
    }

    /** Un manifiesto de un formato que este Java no entiende (`minFormat` va fuera de lo firmado). */
    private static OtaService.Fetched newerFormat() {
        return new OtaService.Fetched(200, "{\"format\":2,\"minFormat\":2}".getBytes(StandardCharsets.UTF_8));
    }

    /** La búsqueda sola de 15 s después de volver al primer plano, hasta el final. */
    private void searchByItself(OtaService.Session session) {
        service.paused(session);
        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        settle();
    }

    /** El aviso que queda guardado para el arranque siguiente, como «tipo versión», o null. */
    private String storedNotice() {
        OtaState.Notice notice = store.read().notice;
        return notice == null ? null : notice.kind + " " + notice.version;
    }

    /**
     * Un paquete que pide otro .apk no se descarga. Si lo encuentra una búsqueda sola, su aviso queda
     * para el arranque siguiente (status() al montar; ready() lo da por visto), una sola vez por versión;
     * lo mismo el de un formato que pide otra app, una sola vez.
     */
    @Test
    public void aVersionThatNeedsANewApkIsAnnouncedOnce() throws Exception {
        Fixtures.Release release = Fixtures.release("1.6.2", 2);
        http.publish(release, release.manifest(key));
        start("1.6.1", config(0));
        OtaService.Session session = service.select(host);
        searchByItself(session);
        assertEquals(Collections.singletonList(MANIFEST_URL), http.requests);
        assertEquals(OtaState.NOTICE_NEEDS_APK + " 1.6.2", storedNotice());
        OtaService.Session latest = service.select(host);
        assertEquals("un arranque que ya no es el último no los da por vistos",
                Collections.singletonList(OtaService.NOT_TRIAL), ready(session));
        assertNotNull(storedNotice());
        assertEquals(Collections.singletonList("notTrial needsApk 1.6.2"), ready(latest));
        assertNull(storedNotice());

        searchByItself(latest);
        assertEquals(2, http.requests.size());
        assertNull("una vez por versión", storedNotice());
        assertEquals(Collections.singletonList("1.6.2"), store.read().needsApkShown);

        http.manifest = newerFormat();
        searchByItself(latest);
        assertEquals(OtaState.NOTICE_NEEDS_APK_FORMAT + " ", storedNotice());
        assertEquals(Collections.singletonList("notTrial needsApkFormat "), ready(latest));
        searchByItself(latest);
        assertEquals(4, http.requests.size());
        assertNull("una sola vez", storedNotice());
    }

    /**
     * Si lo encuentra «Buscar ahora», el aviso lo da el JS con la respuesta (§5.3 de la especificación) y
     * no queda guardado: el arranque siguiente lo volvería a sacar. Tampoco queda el que una búsqueda sola
     * hubiera guardado ya para la misma versión, y lo mismo con el formato que pide otra app.
     */
    @Test
    public void aNewApkFoundByCheckNowIsShownByItsAnswerAndNotStored() throws Exception {
        Fixtures.Release release = Fixtures.release("1.6.2", 2);
        http.publish(release, release.manifest(key));
        start("1.6.1", config(0));
        service.select(host);
        assertEquals(Collections.singletonList("needsApk 1.6.2"), checkNow());
        assertNull(storedNotice());
        assertEquals(Collections.singletonList("1.6.2"), store.read().needsApkShown);
        OtaService.Session next = service.select(host);
        assertEquals("nada que mostrar al arrancar", Collections.singletonList(OtaService.NOT_TRIAL), ready(next));

        Fixtures.Release newer = Fixtures.release("1.6.3", 2);
        byte[] newerManifest = newer.manifest(key);
        http.publish(newer, newerManifest);
        searchByItself(next);
        assertEquals(OtaState.NOTICE_NEEDS_APK + " 1.6.3", storedNotice());
        Fixtures.Release other = Fixtures.release("1.6.4", 2);
        http.publish(other, other.manifest(key));
        assertEquals(Collections.singletonList("needsApk 1.6.4"), checkNow());
        assertEquals("el de otra versión aún no se dio", OtaState.NOTICE_NEEDS_APK + " 1.6.3", storedNotice());
        http.publish(newer, newerManifest);
        assertEquals(Collections.singletonList("needsApk 1.6.3"), checkNow());
        assertNull("ya lo dio la respuesta", storedNotice());

        http.manifest = newerFormat();
        assertEquals(Collections.singletonList(OtaService.NEEDS_APK), checkNow());
        assertTrue(store.read().needsApkFormatShown);
        assertNull(storedNotice());
        searchByItself(next);
        assertNull("y ya se dio", storedNotice());
    }

    /** Sin respuesta, reintenta a los 10 min, no antes; un 404 cuenta como respuesta. */
    @Test
    public void withoutAnAnswerItRetriesTenMinutesLater() throws Exception {
        http.manifest = new OtaService.Fetched(-1, null);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        settle();
        assertEquals(1, http.requests.size());
        assertEquals("network", store.read().lastError);
        assertNull(store.read().lastCheck);

        service.paused(session);
        serial.advance(5 * MINUTE);
        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        assertEquals(1, http.requests.size());
        service.paused(session);
        serial.advance(5 * MINUTE);
        http.manifest = new OtaService.Fetched(404, null);
        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        settle();
        assertEquals(2, http.requests.size());
        assertNotNull(store.read().lastCheck);
        assertNull(store.read().failedCheck);
    }

    /** checkNow(): nada publicado, un error del servidor, sin claves y durante una prueba. */
    @Test
    public void checkNowSaysWhatItFound() throws Exception {
        start("1.6.1");
        service.select(host);
        assertEquals(Collections.singletonList(OtaService.NONE), checkNow());
        http.manifest = new OtaService.Fetched(500, null);
        assertEquals(Collections.singletonList(OtaService.FAILED), checkNow());

        start("1.6.1", OtaConfig.parse(("{\"manifestUrl\":\"" + MANIFEST_URL + "\",\"urlPrefix\":\""
                + Fixtures.URL_PREFIX + "\",\"channel\":\"stable\",\"checkIntervalSeconds\":0,\"keys\":{}}")
                .getBytes(StandardCharsets.UTF_8)));
        service.select(host);
        assertEquals("sin claves no llegará nada", Collections.singletonList(OtaService.NONE), checkNow());
        assertEquals(2, http.requests.size());

        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        start("1.6.1");
        assertTrue(service.select(host).trial);
        assertEquals(Collections.singletonList(OtaService.FAILED), checkNow());
        assertEquals(2, http.requests.size());
    }

    /**
     * «Usar ahora» con otra versión bajando: la descarga se corta sin dejar restos, la actividad se
     * recrea con la pendiente a prueba, y la siguiente comprobación (a los 10 min) completa la otra.
     */
    @Test
    public void useNowCutsTheDownloadInProgressAndResumesItLater() throws Exception {
        Fixtures.Release first = Fixtures.release("1.6.2", 1);
        http.publish(first, first.manifest(key));
        start("1.6.1", config(0));
        OtaService.Session session = service.select(host);
        assertEquals(Collections.singletonList("ready 1.6.2"), checkNow());

        Fixtures.Release second = Fixtures.release("1.6.3", 1);
        http.publish(second, second.manifest(key));
        List<String> results = new ArrayList<>();
        service.checkNow((result, version) -> results.add(result));
        serial.runDue();
        network.poll().run();
        serial.runDue();
        assertEquals(Arrays.asList(MANIFEST_URL, first.url, MANIFEST_URL), http.requests);
        assertEquals("la descarga espera su turno en la red", 1, network.size());

        List<String> applied = new ArrayList<>();
        service.applyNow(session, () -> applied.add("hecho"));
        serial.runDue();
        assertEquals(Collections.singletonList("hecho"), applied);
        assertEquals(1, host.recreated);
        assertEquals(Collections.singletonList(OtaService.FAILED), results);
        settle();
        assertFalse(new File(dir, OtaService.DOWNLOAD).exists());
        assertFalse(new File(dir, OtaService.STAGING_PREFIX + "1.6.3").exists());
        assertFalse(store.bundleDir("1.6.3").exists());
        assertEquals("1.6.2", store.read().pending.version);
        assertNotNull(store.read().failedCheck);

        OtaService.Session trial = service.select(host);
        assertTrue(trial.trial);
        assertEquals(Collections.singletonList("confirmed updated 1.6.2"), ready(trial));
        service.resumed(trial);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        settle();
        assertNull("antes de 10 min no vuelve a buscar", store.read().pending);
        service.paused(trial);
        serial.advance(10 * MINUTE);
        service.resumed(trial);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        settle();
        assertEquals("1.6.3", store.read().pending.version);
        assertEquals(Arrays.asList("1.6.2", "1.6.3"), downloaded);
    }

    /** Lo que el JS lee de forma síncrona: si está a prueba y qué versiones corren. */
    @Test
    public void bootJsonSaysWhatThisStartServes() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), false, 0);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        assertEquals("{\"trial\":true,\"version\":\"1.6.2\",\"builtin\":\"1.6.1\",\"apk\":\"1.6.1-debug\","
                + "\"nativeLevel\":1}", service.bootJson(session));
    }

    /**
     * Dos escritores a la vez, con hilos de verdad: una descarga que termina mientras ready() pone a 0
     * los arranques sin confirmar del activo. Las dos cosas quedan en disco.
     */
    @Test
    public void twoWritersAtOnceBothLand() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), true, 0);
        Fixtures.Release next = Fixtures.release("1.6.3", 1);
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        FakeHttp slow = new FakeHttp() {
            @Override
            public String download(String url, File dest, long size, String sha256, OtaService.Cancel cancel) {
                started.countDown();
                try {
                    assertTrue(release.await(10, TimeUnit.SECONDS));
                } catch (InterruptedException error) {
                    throw new IllegalStateException(error);
                }
                return super.download(url, dest, size, sha256, cancel);
            }
        };
        slow.publish(next, next.manifest(key));
        ExecutorService net = Executors.newSingleThreadExecutor();
        OtaService.Threads threads = new OtaService.Threads("prueba");
        try {
            service = new OtaService(dir, config(3600), "1.6.1", 1, Fixtures.APP_ID, "1.6.1",
                    () -> new OtaClock.Stamp(System.currentTimeMillis(), System.nanoTime() / 1_000_000, 7), threads,
                    net, slow, folder -> {}, (message, error) -> {});
            OtaService.Session session = service.select(host);
            assertEquals("1.6.2", session.version);
            assertEquals(1, store.read().active.bootsWithoutReady);

            CountDownLatch checked = new CountDownLatch(1);
            service.checkNow((result, version) -> checked.countDown());
            assertTrue(started.await(10, TimeUnit.SECONDS));
            CountDownLatch answered = new CountDownLatch(1);
            service.ready(session, (result, notice) -> answered.countDown());
            assertTrue(answered.await(10, TimeUnit.SECONDS));
            release.countDown();
            assertTrue(checked.await(10, TimeUnit.SECONDS));

            OtaState state = threads.call(() -> store.read());
            assertEquals("1.6.3", state.pending.version);
            assertEquals(0, state.active.bootsWithoutReady);
        } finally {
            net.shutdownNow();
        }
    }

    /**
     * Al confirmar, la carpeta del activo anterior se borra en el acto, y deja de buscarse en cada
     * arranque el arreglo que se esperaba para él.
     */
    @Test
    public void confirmingDeletesThePreviousActive() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), true, 0);
        onDisk(Fixtures.release("1.6.3", 1), false, 0);
        OtaState broken = store.read();
        broken.checkEveryBoot = true;
        store.write(broken);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        assertEquals("1.6.3", session.version);
        assertEquals(Collections.singletonList("confirmed updated 1.6.3"), ready(session));
        assertFalse(store.bundleDir("1.6.2").exists());
        assertEquals("1.6.3", store.read().active.version);
        assertFalse(store.read().checkEveryBoot);
        assertTrue(store.bundleDir("1.6.3").isDirectory());
    }

    /**
     * Un activo intacto que dejó de arrancar tres veces se sigue sirviendo y se busca en cada vuelta al
     * primer plano, sin el intervalo; un arranque que sí llega a ready() no lo apaga, porque el fallo
     * suele depender de la partida.
     */
    @Test
    public void anIntactActiveThatStoppedStartingIsLookedForEveryTime() throws Exception {
        onDisk(Fixtures.release("1.6.2", 1), true, OtaSelector.BOOTS_BEFORE_RECHECK - 1);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        assertEquals("1.6.2", session.version);
        assertTrue(store.read().checkEveryBoot);
        assertEquals(Collections.singletonList(OtaService.NOT_TRIAL), ready(session));
        OtaState state = store.read();
        assertEquals(0, state.active.bootsWithoutReady);
        assertTrue(state.checkEveryBoot);

        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        settle();
        service.paused(session);
        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        settle();
        assertEquals("cada vuelta, aunque haya respuesta", Arrays.asList(MANIFEST_URL, MANIFEST_URL), http.requests);
    }

    /**
     * Un activo con un archivo dañado (al tercer arranque sin ready()) se descarta y se busca al
     * instante, sin esperar a los 15 s ni al intervalo: la misma versión se vuelve a bajar.
     */
    @Test
    public void aDamagedActiveIsDroppedAndLookedForAtOnce() throws Exception {
        Fixtures.Release release = Fixtures.release("1.6.2", 1);
        onDisk(release, true, OtaSelector.BOOTS_BEFORE_RECHECK - 1);
        File index = new File(store.bundleDir("1.6.2"), "index.html");
        byte[] damaged = Files.readAllBytes(index.toPath());
        damaged[0] ^= 1;
        Files.write(index.toPath(), damaged);
        OtaState state = store.read();
        state.lastCheck = new OtaClock.Stamp(WALL, 0, 7);
        store.write(state);
        http.publish(release, release.manifest(key));
        start("1.6.1");
        OtaService.Session session = service.select(host);
        assertEquals("1.6.1", session.version);
        settle();
        assertEquals(Arrays.asList(MANIFEST_URL, release.url), http.requests);
        assertEquals("1.6.2", store.read().pending.version);
    }

    /**
     * «Usar ahora» que llega cuando la descarga ya terminó pero aún no se anotó: se descarta, porque la
     * actividad ya va a recrearse con la versión que había esperando.
     */
    @Test
    public void useNowBeforeTheDownloadIsRecordedDropsIt() throws Exception {
        Fixtures.Release first = Fixtures.release("1.6.2", 1);
        http.publish(first, first.manifest(key));
        start("1.6.1", config(0));
        OtaService.Session session = service.select(host);
        assertEquals(Collections.singletonList("ready 1.6.2"), checkNow());
        Fixtures.Release second = Fixtures.release("1.6.3", 1);
        http.publish(second, second.manifest(key));
        service.checkNow((result, version) -> {});
        serial.runDue();
        network.poll().run();
        serial.runDue();
        service.applyNow(session, () -> {});
        network.poll().run();
        assertTrue(new File(dir, OtaService.STAGING_PREFIX + "1.6.3").isDirectory());
        serial.runDue();
        assertEquals(1, host.recreated);
        assertFalse(new File(dir, OtaService.STAGING_PREFIX + "1.6.3").exists());
        assertFalse(store.bundleDir("1.6.3").exists());
        assertEquals("1.6.2", store.read().pending.version);
        assertEquals(Collections.singletonList("1.6.2"), downloaded);
    }

    /** Una versión que no pasa de la servida (el integrado o el activo) no se descarga. */
    @Test
    public void aVersionNotNewerThanTheServedOneIsNotDownloaded() throws Exception {
        Fixtures.Release older = Fixtures.release("1.6.1", 1);
        http.publish(older, older.manifest(key));
        start("1.6.2", config(0));
        service.select(host);
        assertEquals(Collections.singletonList(OtaService.NONE), checkNow());
        assertEquals("version", store.read().lastError);

        onDisk(Fixtures.release("1.6.3", 1), true, 0);
        Fixtures.Release same = Fixtures.release("1.6.3", 1);
        http.publish(same, same.manifest(key));
        start("1.6.2", config(0));
        assertEquals("1.6.3", service.select(host).version);
        assertEquals(Collections.singletonList(OtaService.NONE), checkNow());
        assertEquals(Arrays.asList(MANIFEST_URL, MANIFEST_URL), http.requests);
    }

    /** Con una pendiente más nueva, una versión anterior a ella no se descarga: la pendiente sigue. */
    @Test
    public void aVersionOlderThanThePendingIsNotDownloaded() throws Exception {
        Fixtures.Release newer = Fixtures.release("1.6.3", 1);
        http.publish(newer, newer.manifest(key));
        start("1.6.1", config(0));
        service.select(host);
        assertEquals(Collections.singletonList("ready 1.6.3"), checkNow());
        Fixtures.Release older = Fixtures.release("1.6.2", 1);
        http.publish(older, older.manifest(key));
        assertEquals(Collections.singletonList("ready 1.6.3"), checkNow());
        assertEquals(Arrays.asList(MANIFEST_URL, newer.url, MANIFEST_URL), http.requests);
        assertEquals("1.6.3", store.read().pending.version);
        assertEquals("version", store.read().lastError);
    }

    /**
     * Si una prueba empieza mientras baja otra versión (la actividad se recrea), la descarga se corta:
     * podría sustituir al pendiente que se está probando y borrar su carpeta.
     */
    @Test
    public void aTrialStartingDropsTheDownloadInProgress() throws Exception {
        Fixtures.Release first = Fixtures.release("1.6.2", 1);
        http.publish(first, first.manifest(key));
        start("1.6.1", config(0));
        service.select(host);
        assertEquals(Collections.singletonList("ready 1.6.2"), checkNow());
        Fixtures.Release second = Fixtures.release("1.6.3", 1);
        http.publish(second, second.manifest(key));
        List<String> results = new ArrayList<>();
        service.checkNow((result, version) -> results.add(result));
        serial.runDue();
        network.poll().run();
        serial.runDue();
        assertEquals(1, network.size());

        OtaService.Session trial = service.select(host);
        assertTrue(trial.trial);
        assertEquals(Collections.singletonList(OtaService.FAILED), results);
        settle();
        assertFalse(store.bundleDir("1.6.3").exists());
        assertEquals("1.6.2", store.read().pending.version);
        assertEquals(1, store.minNative(store.read().pending));
        assertEquals(Collections.singletonList("confirmed updated 1.6.2"), ready(trial));
    }

    /**
     * Lo que no se puede escribir sigue siendo cierto en este proceso: un fallo de red con el disco
     * lleno también espera sus 10 min antes de volver a buscar.
     */
    @Test
    public void whatCannotBeWrittenStillHoldsInThisProcess() throws Exception {
        http.manifest = new OtaService.Fetched(-1, null);
        start("1.6.1");
        OtaService.Session session = service.select(host);
        assertTrue(dir.mkdirs());
        blockWrites();
        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        settle();
        assertEquals(1, http.requests.size());
        service.paused(session);
        serial.advance(5 * MINUTE);
        service.resumed(session);
        serial.advance(OtaService.CHECK_DELAY_MILLIS);
        settle();
        assertEquals(1, http.requests.size());
        assertFalse(new File(dir, OtaStore.STATE).exists());
    }
}

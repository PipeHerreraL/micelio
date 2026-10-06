package io.github.pipeherreral.micelio.ota;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * El actualizador en marcha (ARCHITECTURE.md §4.34): uno por proceso, único dueño del estado en
 * memoria y único que escribe en `ota/`. Todo cambio de estado (elegir al arrancar, confirmar,
 * rechazar, vencer el reloj, terminar una descarga) pasa por un solo hilo ({@link Serial}), de uno en
 * uno, y cada decisión se escribe antes de responder o de actuar: confirmar y vencer el reloj no pueden
 * pasar los dos, y un `recreate()` (que vuelve a pasar por `onCreate` en el mismo proceso) no se cruza
 * con una descarga en curso. La red va en otro hilo y entrega su resultado a este.
 *
 * Sin Android: el reloj, los hilos, la red, el fsync de las carpetas y la actividad le llegan desde
 * fuera, así que JUnit lo prueba entero (OtaServiceTest); OtaAndroid le da los de verdad.
 *
 * El JS de cada arranque ({@link Session}) pregunta y avisa por el complemento: `ready()` tras el primer
 * frame (confirma una versión a prueba), `reject()` si no entiende la partida o falla antes, `status()`,
 * `checkNow()` y `applyNow()` («Usar ahora»). Además, Java busca solo 15 s después de cada vuelta al
 * primer plano, sin depender del JS del paquete en uso.
 */
final class OtaService {
    /**
     * Primer plano que tiene una versión a prueba para confirmar. 30 s: el arranque ya espera hasta 8 s
     * el catálogo del idioma (LOCALE_TIMEOUT_MS en src/main.ts), y capgo usa 30 s como mínimo con un
     * paquete recién aplicado.
     */
    static final long TRIAL_MILLIS = 30_000;
    /** Tras volver al primer plano se busca a los 15 s, no al instante: el arranque no compite con la red. */
    static final long CHECK_DELAY_MILLIS = 15_000;
    /** Tres caídas del renderizador en un minuto: se cierra la actividad en vez de recrearla en bucle. */
    static final int RENDER_CRASHES = 3;
    static final long RENDER_WINDOW_MILLIS = 60_000;

    static final String DOWNLOAD = "download.tmp";
    static final String STAGING_PREFIX = "staging-";

    // Lo que responde ready().
    static final String CONFIRMED = "confirmed";
    static final String TOO_LATE = "tooLate";
    static final String NOT_TRIAL = "notTrial";

    // Lo que responde checkNow().
    static final String READY = "ready";
    static final String NONE = "none";
    static final String NEEDS_APK = "needsApk";
    static final String FAILED = "failed";

    /** El motivo de una descarga que «Usar ahora» cortó: no es un error del paquete. */
    private static final String CANCELLED = "cancelled";

    /** El hilo de los cambios de estado: uno solo, en orden. */
    interface Serial {
        void execute(Runnable task);

        Cancellable schedule(Runnable task, long delayMillis);

        /** Corre `task` en el hilo y espera su resultado (el hilo principal, al arrancar). */
        <T> T call(Callable<T> task) throws Exception;
    }

    interface Cancellable {
        void cancel();
    }

    interface Clock {
        OtaClock.Stamp now();
    }

    interface Log {
        void log(String message, Throwable error);
    }

    /** La actividad de un arranque: lo único que el servicio le pide es volver a arrancar o cerrarse. */
    interface Host {
        void recreate();

        void finish();
    }

    /** Quien quiere saber que hay una versión descargada (el complemento, que avisa al JS). */
    interface Listener {
        void downloaded(String version);
    }

    interface ReadyCallback {
        /** `notice`: el aviso que el JS tiene que mostrar ahora (`updated` al confirmar), o null. */
        void done(String result, OtaState.Notice notice);
    }

    interface CheckCallback {
        void done(String result, String version);
    }

    interface StatusCallback {
        void done(Status status);
    }

    /** La red (OtaDownloader en la app). Corre en su propio hilo. */
    interface Http {
        /** Un GET con como mucho `maxBytes` + 1 bytes de cuerpo: si llegan todos, el cuerpo es más grande. */
        Fetched fetch(String url, int maxBytes, Cancel cancel);

        /**
         * Descarga a `dest` como mucho `size` bytes con su SHA-256. Devuelve null si llegó entero y es
         * el firmado; si no, el motivo: `size`, `sha256`, `network` (sin respuesta, otro código o
         * cortada) o `disk`.
         */
        String download(String url, File dest, long size, String sha256, Cancel cancel);
    }

    static final class Fetched {
        /** El código HTTP, o -1 sin respuesta (red, tiempo agotado, una redirección que no se sigue). */
        final int status;
        /** El cuerpo de un 200; null con cualquier otro código. */
        final byte[] body;

        Fetched(int status, byte[] body) {
            this.status = status;
            this.body = body;
        }
    }

    /** Cortar una comprobación en curso: «Usar ahora» no espera a que acabe una descarga. */
    static final class Cancel {
        private volatile boolean cancelled;
        private volatile Runnable onCancel;

        void cancel() {
            cancelled = true;
            Runnable action = onCancel;
            if (action != null) action.run();
        }

        boolean isCancelled() {
            return cancelled;
        }

        /** Lo que hay que hacer al cortar (cerrar la conexión abierta); si ya se cortó, en el acto. */
        void onCancel(Runnable action) {
            onCancel = action;
            if (cancelled) action.run();
        }
    }

    /** Lo que se decidió para un arranque (una actividad), y lo que su JS lee de forma síncrona. */
    static final class Session {
        final int number;
        /** La versión servida; "" si ni siquiera se pudo leer la del integrado. */
        final String version;
        /** La carpeta del paquete servido, o null para el integrado (assets/public). */
        final File folder;
        /** Si se sirvió a prueba. Que siga sin decidir lo dice el servicio. */
        final boolean trial;
        final Host host;
        /**
         * Su versión a prueba ya se confirmó en este proceso, por este arranque o por el de la actividad
         * que se recreó en él. Lo escribe el hilo del servicio y lo lee MicelioBoot desde el del WebView.
         */
        private volatile boolean confirmed;

        Session(int number, String version, File folder, boolean trial, Host host) {
            this.number = number;
            this.version = version == null ? "" : version;
            this.folder = folder;
            this.trial = trial;
            this.host = host;
        }

        /** Si su JS debe seguir sin guardar: a prueba y sin confirmar (también si la prueba ya falló). */
        boolean holdsSave() {
            return trial && !confirmed;
        }
    }

    /** Lo que responde `status()`. */
    static final class Status {
        final boolean trial;
        final String version;
        final String builtin;
        final String apk;
        final int nativeLevel;
        /** La versión descargada que se usará en el siguiente arranque, o null. */
        final String pending;
        final OtaState.Notice notice;
        final String lastError;

        Status(boolean trial, String version, String builtin, String apk, int nativeLevel, String pending,
                OtaState.Notice notice, String lastError) {
            this.trial = trial;
            this.version = version;
            this.builtin = builtin;
            this.apk = apk;
            this.nativeLevel = nativeLevel;
            this.pending = pending;
            this.notice = notice;
            this.lastError = lastError;
        }
    }

    /** La versión que se prueba en este proceso, sin decidir aún. */
    private static final class Trial {
        final String version;
        final OtaTrialWatch watch = new OtaTrialWatch(TRIAL_MILLIS);
        /** Los arranques que la sirvieron: más de uno si la actividad se recreó durante la prueba. */
        final List<Session> sessions = new ArrayList<>();
        Cancellable timer;

        Trial(String version) {
            this.version = version;
        }
    }

    /** La comprobación en curso (manifiesto y, si vale, descarga), y quien espera su resultado. */
    private static final class Check {
        final Cancel cancel = new Cancel();
        final List<CheckCallback> waiting = new ArrayList<>();
    }

    private final File dir;
    private final OtaStore store;
    /** null o sin claves: inerte, no busca nada (y el selector descarta cualquier paquete). */
    private final OtaConfig config;
    private final String builtin;
    private final int nativeLevel;
    /** El applicationId sin `.debug`: el `app` que firma el manifiesto. */
    private final String app;
    private final String apk;
    private final Set<String> keyIds;
    private final Clock clock;
    private final Serial serial;
    private final Executor network;
    private final Http http;
    private final OtaFiles.DirSync dirSync;
    private final Log log;
    private final List<Listener> listeners = new CopyOnWriteArrayList<>();

    // Todo lo que sigue solo se toca desde el hilo de Serial.
    private OtaState state;
    private boolean leftoversCollected;
    /** El selector falló en este proceso: se sirve el integrado y no se escribe nada hasta el siguiente. */
    private boolean broken;
    private int sessions;
    private Session latest;
    private Trial trial;
    private Check check;
    private Cancellable checkTimer;
    private final List<Long> renderCrashes = new ArrayList<>();

    OtaService(File dir, OtaConfig config, String builtin, int nativeLevel, String app, String apk, Clock clock,
            Serial serial, Executor network, Http http, OtaFiles.DirSync dirSync, Log log) {
        this.dir = dir;
        this.store = new OtaStore(dir, dirSync);
        this.config = config;
        this.builtin = builtin;
        this.nativeLevel = nativeLevel;
        this.app = app;
        this.apk = apk;
        this.keyIds = config == null ? Collections.<String>emptySet() : new LinkedHashSet<>(config.keys.keySet());
        this.clock = clock;
        this.serial = serial;
        this.network = network;
        this.http = http;
        this.dirSync = dirSync;
        this.log = log;
        this.state = store.read();
    }

    // ---- Lo que piden la actividad y el complemento ----

    /**
     * Qué sirve un arranque: lo decide el selector en el hilo del servicio y el que llama (el hilo
     * principal, en `onCreate`) espera. La primera vez en el proceso recoge antes los restos.
     */
    Session select(Host host) throws Exception {
        return serial.call(() -> selectNow(host));
    }

    void resumed(Session session) {
        run(() -> {
            if (trial != null) {
                trial.watch.resume(clock.now().elapsed);
                armTrialTimer(trial);
            }
            cancelCheckTimer();
            checkTimer = serial.schedule(guarded(() -> {
                checkTimer = null;
                if (isDue()) startCheck(null);
            }), CHECK_DELAY_MILLIS);
        });
    }

    void paused(Session session) {
        run(() -> {
            if (trial != null) {
                trial.watch.pause(clock.now().elapsed);
                if (trial.timer != null) trial.timer.cancel();
                trial.timer = null;
            }
            cancelCheckTimer();
        });
    }

    /**
     * El JS arrancó bien (tras su primer frame). Con una versión a prueba sin decidir, la confirma, y
     * solo responde `confirmed` si la confirmación quedó escrita; si el reloj ganó, `tooLate`. Si ya la
     * confirmó otro ready() de este proceso (la página se recargó, o es la actividad vieja o la nueva
     * de una recreación), vuelve a responder `confirmed`. Sin prueba, `notTrial`. En los dos últimos
     * casos el activo deja de contar arranques sin `ready()`. Con `confirmed` o `notTrial`, los avisos
     * quedan vistos: los de `status()` los mostró el JS al montar, y el que haya ahora (`updated` al
     * confirmar) va en la respuesta.
     */
    void ready(Session session, ReadyCallback callback) {
        serial.execute(() -> {
            String result;
            OtaState.Notice notice = null;
            try {
                result = readyNow(session);
                if (!TOO_LATE.equals(result) && session == latest && writable()) {
                    notice = state.notice;
                    if (notice != null) {
                        OtaState next = state.copy();
                        next.notice = null;
                        save(next);
                    }
                }
            } catch (Throwable error) {
                log.log("ready() falló", error);
                // Sin prueba o ya confirmada, el JS puede guardar; a prueba, sigue sin guardar y el reloj decide.
                result = session.holdsSave() ? TOO_LATE : session.trial ? CONFIRMED : NOT_TRIAL;
            }
            callback.done(result, notice);
        });
    }

    /** El JS de una versión a prueba no entiende la partida (`save`) o falló antes de confirmar (`error`). */
    void reject(Session session, String reason) {
        run(() -> {
            if (!isUndecidedTrial(session)) return;
            boolean save = OtaState.FAILED_SAVE.equals(reason);
            List<Session> served = failTrial(save ? OtaState.FAILED_SAVE : OtaState.FAILED_ERROR,
                    save ? OtaState.NOTICE_SAVE_REJECTED : OtaState.NOTICE_ROLLED_BACK);
            session.host.recreate();
            recreateServed(served, session);
        });
    }

    /**
     * Se cayó el renderizador. El complemento ya devolvió `true` (con `false`, Android cierra la app y
     * puede perder lo que Chromium aún no llevó a disco). A prueba, la versión falla (`render`); sin
     * prueba, la actividad vuelve a arrancar, y eso cuenta como un arranque sin `ready()`. Con tres
     * caídas en un minuto, se cierra en vez de entrar en bucle.
     */
    void renderGone(Session session) {
        run(() -> {
            long now = clock.now().elapsed;
            for (int i = renderCrashes.size() - 1; i >= 0; i--) {
                if (now - renderCrashes.get(i) >= RENDER_WINDOW_MILLIS) renderCrashes.remove(i);
            }
            renderCrashes.add(now);
            List<Session> served = isUndecidedTrial(session)
                    ? failTrial(OtaState.FAILED_RENDER, OtaState.NOTICE_ROLLED_BACK)
                    : Collections.<Session>emptyList();
            if (renderCrashes.size() >= RENDER_CRASHES) {
                log.log("El renderizador se cayó " + RENDER_CRASHES + " veces en un minuto: se cierra", null);
                session.host.finish();
            } else {
                session.host.recreate();
            }
            recreateServed(served, session);
        });
    }

    void status(Session session, StatusCallback callback) {
        serial.execute(() -> {
            String pending = state.pending == null ? null : state.pending.version;
            callback.done(new Status(isUndecidedTrial(session), session.version, builtin == null ? "" : builtin, apk,
                    nativeLevel, pending, state.notice, state.lastError));
        });
    }

    /** «Buscar ahora»: sin mirar el intervalo; si ya hay una comprobación en curso, espera a esa. */
    void checkNow(CheckCallback callback) {
        serial.execute(() -> {
            try {
                if (!canCheck()) {
                    // Sin claves no llegará nunca nada: no hay versión más nueva para esta app.
                    callback.done(writable() && trial != null ? FAILED : NONE, null);
                    return;
                }
                startCheck(callback);
            } catch (Throwable error) {
                log.log("checkNow() falló", error);
                callback.done(FAILED, null);
            }
        });
    }

    /**
     * «Usar ahora» (el JS ya guardó): corta la descarga en curso, que se reanuda en la siguiente
     * comprobación, y vuelve a arrancar la actividad si hay una versión descargada esperando.
     */
    void applyNow(Session session, Runnable done) {
        serial.execute(() -> {
            try {
                cancelCheck();
                OtaState.Bundle pending = state.pending;
                if (writable() && pending != null && !state.hasFailed(pending.version)
                        && newer(pending.version, session.version)) {
                    session.host.recreate();
                }
            } catch (Throwable error) {
                log.log("applyNow() falló", error);
            }
            done.run();
        });
    }

    void addListener(Listener listener) {
        listeners.add(listener);
    }

    void removeListener(Listener listener) {
        listeners.remove(listener);
    }

    /**
     * Lo que el JS lee de forma síncrona al evaluar main.ts (`MicelioBoot.boot()`), sin E/S. Se pide en
     * cada carga de la página, desde el hilo del WebView, así que solo lee campos finales o `volatile`:
     * tras confirmar dice `trial: false`, y una recarga ya no retiene el guardado.
     */
    String bootJson(Session session) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("trial", session.holdsSave());
        info.put("version", session.version);
        info.put("builtin", builtin == null ? "" : builtin);
        info.put("apk", apk);
        info.put("nativeLevel", nativeLevel);
        return OtaJson.write(info);
    }

    // ---- Al arrancar ----

    private Session selectNow(Host host) {
        if (!leftoversCollected) {
            leftoversCollected = true;
            collectLeftovers();
        }
        OtaSelector.Decision decision;
        if (broken) {
            decision = new OtaSelector.Decision(builtin, false, false, false, null, null);
        } else {
            decision = OtaSelector.choose(new OtaSelector.Input(builtin, nativeLevel, keyIds, state,
                    trial == null ? null : trial.version), store);
            if (decision.state == null) {
                broken = true;
                log.log("El selector falló: el integrado, y nada escrito en este proceso", decision.error);
            } else {
                state = decision.state;
            }
        }
        if (decision.trial) {
            if (trial == null || !trial.version.equals(decision.version)) trial = new Trial(decision.version);
            // Nada se descarga mientras se prueba: la descarga podría sustituir al pendiente que se prueba.
            cancelCheck();
        } else if (trial != null) {
            endTrial();
        }
        Session session = new Session(++sessions, decision.version,
                decision.fromBundle ? store.bundleDir(decision.version) : null, decision.trial, host);
        if (decision.trial) trial.sessions.add(session);
        latest = session;
        log.log("Arranque " + session.number + ": " + (decision.fromBundle ? "paquete " : "integrado ")
                + session.version + (decision.trial ? ", a prueba" : ""), null);
        // Se descartó el activo (archivos dañados, una clave retirada): se busca al instante, sin el intervalo.
        if (decision.checkNow && canCheck()) startCheck(null);
        return session;
    }

    /**
     * Lo que un proceso anterior dejó a medias: la descarga, las carpetas de descompresión y los
     * paquetes que el estado no nombra (un corte entre el renameTo y la escritura del estado). Solo la
     * primera vez en el proceso: después, una de esas carpetas puede ser la de una descarga en curso.
     */
    private void collectLeftovers() {
        // Lo dejó un Java más nuevo: no se toca nada suyo.
        if (state.foreign) return;
        OtaFiles.deleteTree(new File(dir, DOWNLOAD));
        OtaFiles.deleteTree(new File(dir, OtaStore.STATE + ".tmp"));
        File[] children = dir.listFiles();
        if (children != null) {
            for (File child : children) {
                if (child.getName().startsWith(STAGING_PREFIX)) OtaFiles.deleteTree(child);
            }
        }
        File[] bundles = new File(dir, "bundles").listFiles();
        if (bundles == null) return;
        for (File folder : bundles) {
            String name = folder.getName();
            boolean named = (state.active != null && state.active.version.equals(name))
                    || (state.pending != null && state.pending.version.equals(name));
            if (!named) {
                log.log("Se borra la carpeta huérfana bundles/" + name, null);
                OtaFiles.deleteTree(folder);
            }
        }
    }

    // ---- La versión a prueba ----

    private boolean isUndecidedTrial(Session session) {
        return session.trial && trial != null && trial.version.equals(session.version);
    }

    private String readyNow(Session session) {
        if (!session.holdsSave()) {
            OtaState.Bundle active = state.active;
            if (writable() && active != null && active.version.equals(session.version)
                    && active.bootsWithoutReady != 0) {
                OtaState next = state.copy();
                next.active = active.withBootsWithoutReady(0);
                // Aunque no se escriba, en este proceso es cierto; la siguiente escritura lo lleva al disco.
                save(next);
            }
            // checkEveryBoot sigue: si el activo dejó de arrancar con sus archivos intactos, el fallo es
            // de su código y suele depender de la partida (llegar a la tundra); que esta vez arranque no
            // lo arregla. Solo lo apaga otra versión activa, o perder esta.
            return session.trial ? CONFIRMED : NOT_TRIAL;
        }
        if (!isUndecidedTrial(session)) return TOO_LATE;
        OtaState.Bundle pending = state.pending;
        if (pending == null || !pending.version.equals(trial.version)) {
            // No debería pasar: el pendiente solo cambia en este hilo, y nunca durante una prueba. Si
            // pasa, la actividad vuelve a arrancar con lo que el selector decida.
            List<Session> served = endTrial();
            session.host.recreate();
            recreateServed(served, session);
            return TOO_LATE;
        }
        OtaState next = state.copy();
        String previous = next.active == null ? null : next.active.version;
        next.active = pending.withAttempts(0).withBootsWithoutReady(0);
        next.pending = null;
        // El arreglo que se esperaba en cada arranque era para el activo anterior.
        next.checkEveryBoot = false;
        next.forgetUpTo(pending.version);
        // El aviso va en la respuesta de ready(): este mismo arranque lo muestra.
        next.notice = new OtaState.Notice(OtaState.NOTICE_UPDATED, pending.version);
        if (!persist(next)) {
            // Sin la confirmación escrita no hay versión confirmada. Tampoco es culpa de la versión (un
            // disco lleno), así que no se da por fallida: se deja de probar en este proceso y la
            // actividad vuelve a arrancar con la base, que guarda; el selector la volverá a probar
            // mientras le queden intentos.
            log.log("No se pudo escribir la confirmación de " + pending.version, null);
            List<Session> served = endTrial();
            session.host.recreate();
            recreateServed(served, session);
            return TOO_LATE;
        }
        // Todos los arranques que la sirvieron pueden guardar ya: también la actividad nueva de una
        // recreación, cuyo ready() puede llegar después del de la vieja.
        for (Session served : trial.sessions) served.confirmed = true;
        endTrial();
        if (previous != null && !previous.equals(pending.version)) store.delete(previous);
        log.log("Confirmada la versión " + pending.version, null);
        return CONFIRMED;
    }

    private void armTrialTimer(Trial current) {
        if (current.timer != null) current.timer.cancel();
        current.timer = serial.schedule(guarded(() -> {
            // Al decidir la prueba su temporizador se cancela; esto solo cubre que no llegara a tiempo.
            if (trial != current) return;
            current.timer = null;
            long left = current.watch.remaining(clock.now().elapsed);
            if (left > 0) {
                // Se programó con lo que faltaba al volver al primer plano; si el reloj del hilo se
                // adelantó, se vuelve a esperar lo que queda.
                if (current.watch.isRunning()) armTrialTimer(current);
                return;
            }
            recreateServed(failTrial(OtaState.FAILED_TIMEOUT, OtaState.NOTICE_ROLLED_BACK), null);
        }), current.watch.remaining(clock.now().elapsed));
    }

    /**
     * La versión a prueba falla: se anota (antes de recrear la actividad), se borra su carpeta y queda
     * el aviso. Si no se puede escribir, el estado en memoria ya no la sirve en este proceso, y el
     * siguiente arranque en frío la cuenta como un intento más. Devuelve los arranques que la sirvieron.
     */
    private List<Session> failTrial(String reason, String noticeKind) {
        String version = trial.version;
        List<Session> served = endTrial();
        OtaState next = state.copy();
        next.failed.add(new OtaState.Failure(version, reason));
        next.notice = new OtaState.Notice(noticeKind, version);
        boolean pending = next.pending != null && next.pending.version.equals(version);
        if (pending) next.pending = null;
        boolean written = persist(next);
        if (!written) state = next;
        if (written && pending) store.delete(version);
        log.log("La versión " + version + " falló (" + reason + ")", null);
        return served;
    }

    /** Deja de probar en este proceso. Devuelve los arranques que servían la prueba (ninguno si no había). */
    private List<Session> endTrial() {
        if (trial == null) return Collections.emptyList();
        if (trial.timer != null) trial.timer.cancel();
        List<Session> served = trial.sessions;
        trial = null;
        return served;
    }

    /**
     * Una prueba terminó sin confirmarse: vuelve a arrancar cada actividad que la servía, salvo `handled`
     * (de esa ya se ocupó quien llama), para que sirva la base. Todas, no solo la que avisó: si la
     * actividad se recreó durante la prueba, el aviso (un reject() o la caída del renderizador) puede
     * llegar de la vieja después de elegir la nueva, porque Capacitor reparte las llamadas que ya estaban
     * en cola aunque cierre su hilo; y la nueva seguiría sirviendo la versión sin guardar, sin que su
     * ready() ni su reject() decidan ya nada y sin reloj. En una actividad destruida no hace nada.
     */
    private static void recreateServed(List<Session> served, Session handled) {
        for (Session other : served) {
            if (other != handled) other.host.recreate();
        }
    }

    // ---- Buscar y descargar ----

    /** Si puede buscar: con claves, sin prueba en curso, y con un estado que se puede escribir. */
    private boolean canCheck() {
        return writable() && config != null && config.isActive() && trial == null;
    }

    /** Si toca buscar sola (§3.5 de la especificación): ver OtaClock. */
    private boolean isDue() {
        return canCheck() && check == null && OtaClock.isDue(state, clock.now(), config.checkIntervalSeconds);
    }

    private void startCheck(CheckCallback callback) {
        if (check != null) {
            if (callback != null) check.waiting.add(callback);
            return;
        }
        Check current = new Check();
        if (callback != null) current.waiting.add(callback);
        check = current;
        network.execute(() -> {
            Fetched fetched;
            try {
                fetched = http.fetch(config.manifestUrl, OtaManifest.MAX_MANIFEST_BYTES, current.cancel);
            } catch (Throwable error) {
                log.log("No se pudo pedir el manifiesto", error);
                fetched = new Fetched(-1, null);
            }
            Fetched result = fetched;
            run(() -> manifestArrived(current, result));
        });
    }

    private void manifestArrived(Check current, Fetched fetched) {
        // Cortada mientras llegaba («Usar ahora», o empezó una prueba): ya respondió `failed`.
        if (check != current) return;
        OtaState next = state.copy();
        OtaClock.recordCheck(next, fetched.status, clock.now());
        if (fetched.status == 404) {
            // Ninguna versión publicada con manifiesto: no es un error.
            next.lastError = null;
            save(next);
            finishCheck(current, NONE, null);
            return;
        }
        if (fetched.status != 200 || fetched.body == null) {
            next.lastError = "network";
            save(next);
            log.log("Manifiesto: sin respuesta o código " + fetched.status + "; se reintenta en 10 min", null);
            finishCheck(current, FAILED, null);
            return;
        }
        OtaManifest.Verdict verdict = OtaManifest.verify(fetched.body, new OtaManifest.Rules(
                app, config.channel, config.urlPrefix, nativeLevel, config.keys, this::accepts));
        if (verdict.isOk()) {
            save(next);
            download(current, verdict.payload, verdict.keyIds);
            return;
        }
        // Un rechazo no marca nada como fallido: si no, quien sirviera un zip roto vetaría una versión buena.
        String result = FAILED;
        String version = null;
        if ("minFormat".equals(verdict.reason)) {
            if (!next.needsApkFormatShown) {
                next.needsApkFormatShown = true;
                next.notice = new OtaState.Notice(OtaState.NOTICE_NEEDS_APK_FORMAT, "");
            }
            result = NEEDS_APK;
        } else if ("minNative".equals(verdict.reason)) {
            version = verdict.version;
            if (!next.needsApkShown.contains(version)) {
                next.needsApkShown.add(version);
                next.notice = new OtaState.Notice(OtaState.NOTICE_NEEDS_APK, version);
            }
            result = NEEDS_APK;
        } else if ("version".equals(verdict.reason)) {
            result = NONE;
        }
        next.lastError = verdict.reason;
        save(next);
        log.log("Manifiesto rechazado: " + verdict.reason, null);
        finishCheck(current, result, version);
    }

    /**
     * La regla del estado de la app: mayor que la servida y que la pendiente, y no fallida antes. Sin una
     * prueba en curso (y sin ella no se busca), lo servido es la base, el mayor entre el integrado y el
     * activo: el selector no sirve otra cosa.
     */
    private boolean accepts(String version) {
        if (state.hasFailed(version)) return false;
        if (state.pending != null && !newer(version, state.pending.version)) return false;
        return latest != null && newer(version, latest.version);
    }

    /** Si `version` es posterior a `than`; una que no es válida (un "" sin integrado) no cuenta. */
    private static boolean newer(String version, String than) {
        return !OtaVersion.isValid(than) || OtaVersion.compare(version, than) > 0;
    }

    private void download(Check current, OtaManifest.Payload payload, List<String> keyIds) {
        File temp = new File(dir, DOWNLOAD);
        File staging = new File(dir, STAGING_PREFIX + payload.version);
        network.execute(() -> {
            String reason;
            try {
                if (!dir.isDirectory() && !dir.mkdirs()) {
                    reason = "disk";
                } else {
                    reason = http.download(payload.url, temp, payload.size, payload.sha256, current.cancel);
                    if (reason == null && !current.cancel.isCancelled()) {
                        reason = OtaZip.extract(temp, payload, staging, dirSync);
                    }
                }
            } catch (Throwable error) {
                log.log("La descarga de " + payload.version + " falló", error);
                reason = "disk";
            } finally {
                OtaFiles.deleteTree(temp);
            }
            if (current.cancel.isCancelled()) reason = CANCELLED;
            // Con un motivo no queda nada a medias en disco, desde este mismo hilo: la siguiente
            // comprobación puede usar la misma carpeta.
            if (reason != null) OtaFiles.deleteTree(staging);
            String outcome = reason;
            run(() -> downloadArrived(current, payload, keyIds, staging, outcome));
        });
    }

    private void downloadArrived(Check current, OtaManifest.Payload payload, List<String> keyIds, File staging,
            String reason) {
        // Una prueba que empieza corta la comprobación (selectNow), y sin prueba nada más cambia la base
        // ni el pendiente mientras se descarga (hay una sola comprobación a la vez): la versión sigue
        // valiendo si la comprobación sigue siendo la de ahora. Si no, la cortaron después de que la
        // red acabara.
        if (reason == null && check != current) reason = CANCELLED;
        if (reason == null) reason = install(payload, keyIds, staging);
        if (reason != null) {
            OtaFiles.deleteTree(staging);
            OtaState next = state.copy();
            if (!CANCELLED.equals(reason)) next.lastError = reason;
            // Una descarga cortada (la red o «Usar ahora») se reintenta a los 10 min, como un manifiesto
            // sin respuesta: el manifiesto ya respondió y, si no, no se volvería a buscar hasta el intervalo.
            if ("network".equals(reason) || CANCELLED.equals(reason)) next.failedCheck = clock.now();
            save(next);
            log.log("La descarga de " + payload.version + " no se usa: " + reason, null);
            if (check == current) finishCheck(current, FAILED, null);
            return;
        }
        log.log("Descargada la versión " + payload.version + ": se usará en el siguiente arranque", null);
        for (Listener listener : listeners) {
            try {
                listener.downloaded(payload.version);
            } catch (RuntimeException error) {
                // Solo se pierde el aviso al JS: la versión ya está anotada y se usará al arrancar.
                log.log("El aviso de la descarga falló", error);
            }
        }
        finishCheck(current, READY, payload.version);
    }

    /**
     * Pasa `staging-<v>` a `bundles/<v>` y anota el pendiente. El destino se borra antes (lo deja un
     * corte entre el renameTo y la escritura del estado), y el renameTo pasa por el fsync de su carpeta
     * antes de escribir el estado que lo nombra.
     */
    private String install(OtaManifest.Payload payload, List<String> keyIds, File staging) {
        File target = store.bundleDir(payload.version);
        File bundles = target.getParentFile();
        try {
            boolean created = !bundles.isDirectory();
            if (created && !bundles.mkdirs()) return "disk";
            OtaFiles.deleteTree(target);
            if (target.exists() || !staging.renameTo(target)) return "disk";
            dirSync.sync(bundles);
            if (created) dirSync.sync(dir);
        } catch (IOException error) {
            log.log("No se pudo mover el paquete " + payload.version, error);
            OtaFiles.deleteTree(target);
            return "disk";
        }
        OtaState next = state.copy();
        OtaState.Bundle previous = next.pending;
        next.pending = OtaState.Bundle.of(payload, keyIds);
        next.lastError = null;
        if (!persist(next)) {
            OtaFiles.deleteTree(target);
            return "disk";
        }
        if (previous != null && !previous.version.equals(payload.version)) store.delete(previous.version);
        return null;
    }

    private void finishCheck(Check current, String result, String version) {
        if (check == current) check = null;
        if (NONE.equals(result) && state.pending != null && !state.hasFailed(state.pending.version)) {
            // Lo más nuevo que hay ya está descargado: se usará al arrancar.
            result = READY;
            version = state.pending.version;
        }
        for (CheckCallback callback : current.waiting) callback.done(result, version);
    }

    /** Corta la comprobación en curso; quien la esperaba recibe `failed`. */
    private void cancelCheck() {
        Check current = check;
        if (current == null) return;
        check = null;
        current.cancel.cancel();
        finishCheck(current, FAILED, null);
    }

    private void cancelCheckTimer() {
        if (checkTimer != null) checkTimer.cancel();
        checkTimer = null;
    }

    // ---- El estado en disco ----

    /** Si se puede escribir: el estado no es de un Java más nuevo y el selector no falló en este proceso. */
    private boolean writable() {
        return !state.foreign && !broken;
    }

    /** Escribe `next` y, solo si quedó escrito, lo adopta. */
    private boolean persist(OtaState next) {
        if (!writable()) return false;
        try {
            store.write(next);
        } catch (IOException error) {
            log.log("No se pudo escribir el estado", error);
            return false;
        }
        state = next;
        return true;
    }

    /** Escribe `next` y lo adopta aunque no se pueda escribir: es cierto en este proceso. */
    private void save(OtaState next) {
        if (!persist(next) && writable()) state = next;
    }

    // ---- Hilos ----

    /** Una tarea en el hilo del servicio, con lo que lance anotado en logcat. */
    private void run(Runnable task) {
        serial.execute(guarded(task));
    }

    /**
     * Un error en una tarea del hilo se anota y no pasa de ahí: lo que se pierde es esa operación, no el
     * estado (cada cambio se prepara en una copia y solo se adopta entero).
     */
    private Runnable guarded(Runnable task) {
        return () -> {
            try {
                task.run();
            } catch (Throwable error) {
                log.log("Error en el hilo del actualizador", error);
            }
        };
    }

    /** El {@link Serial} de la app: un hilo con su cola y sus esperas. */
    static final class Threads implements Serial {
        private final ScheduledExecutorService executor;
        private volatile Thread thread;

        Threads(String name) {
            executor = Executors.newSingleThreadScheduledExecutor(task -> {
                Thread created = new Thread(task, name);
                // En Android da igual; en las pruebas, la JVM puede acabar sin esperar a este hilo.
                created.setDaemon(true);
                thread = created;
                return created;
            });
        }

        @Override
        public void execute(Runnable task) {
            executor.execute(task);
        }

        @Override
        public Cancellable schedule(Runnable task, long delayMillis) {
            ScheduledFuture<?> future = executor.schedule(task, delayMillis, TimeUnit.MILLISECONDS);
            return () -> future.cancel(false);
        }

        @Override
        public <T> T call(Callable<T> task) throws Exception {
            if (Thread.currentThread() == thread) return task.call();
            try {
                return executor.submit(task).get();
            } catch (ExecutionException wrapped) {
                Throwable cause = wrapped.getCause();
                if (cause instanceof Exception) throw (Exception) cause;
                throw wrapped;
            }
        }
    }
}

package io.github.pipeherreral.micelio.ota;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

/**
 * Qué paquete sirve la app al arrancar (ARCHITECTURE.md §4.34). Corre en `MainActivity.onCreate`,
 * antes de crear el WebView; el disco le llega por {@link Disk}, así que las pruebas lo cubren sin
 * Android.
 *
 *   1. Se descarta (carpeta y entrada del estado) todo paquete verificado con una clave que el .apk
 *      ya no conoce, con un archivo que falta o no mide lo anotado, con un micelio-bundle.json que
 *      no dice su versión o con un `minNative` mayor que el nivel del .apk.
 *   2. La base es el mayor entre el integrado y el activo: instalar un .apk más viejo que el último
 *      paquete no hace retroceder el juego. Con un .apk igual o más nuevo, el activo sobra.
 *   3. Un pendiente mayor que la base y no fallido se sirve a prueba: sin contar otro intento si ya
 *      lo está en este proceso (la actividad se recreó); fallido tras dos arranques sin confirmar;
 *      y si no, solo si el intento quedó escrito, porque una prueba sin anotar podría repetirse sin
 *      fin. Cualquier otro pendiente se borra.
 *   4. Servir el activo cuenta un arranque sin `ready()`. Al tercero seguido se recalculan sus
 *      SHA-256: con un archivo dañado se descarta (y se vuelve a bajar, porque no falló); intacto, es
 *      un fallo del código y se busca en cada arranque hasta que llegue el arreglo. No se vuelve al
 *      integrado a ciegas: la partida ya avanzó con esa versión y la anterior quizá no la entienda.
 */
final class OtaSelector {
    /** Arranques que se prueba una versión antes de darla por fallida. */
    static final int MAX_ATTEMPTS = 2;
    /** Arranques seguidos del activo sin `ready()` antes de comprobar sus archivos. */
    static final int BOOTS_BEFORE_RECHECK = 3;

    private OtaSelector() {}

    /** Lo que el selector necesita del disco (OtaStore en la app). */
    interface Disk {
        /**
         * El `minNative` de la carpeta del paquete si está completa (cada archivo existe y mide lo
         * anotado) y su micelio-bundle.json dice su versión; -1 si no.
         */
        int minNative(OtaState.Bundle bundle);

        /** Si cada archivo tiene el SHA-256 anotado. */
        boolean intact(OtaState.Bundle bundle);

        void write(OtaState state) throws IOException;

        void delete(String version);
    }

    static final class Input {
        /** La versión del paquete del .apk (assets/public/micelio-bundle.json). */
        final String builtin;
        final int nativeLevel;
        /** Los keyId de las claves del .apk. */
        final Set<String> keyIds;
        final OtaState state;
        /** La versión que este proceso ya sirve a prueba, o null. */
        final String trialInProcess;

        Input(String builtin, int nativeLevel, Set<String> keyIds, OtaState state, String trialInProcess) {
            this.builtin = builtin;
            this.nativeLevel = nativeLevel;
            this.keyIds = keyIds;
            this.state = state;
            this.trialInProcess = trialInProcess;
        }
    }

    static final class Decision {
        final String version;
        /** Si se sirve de `bundles/<version>/`; si no, el integrado (assets/public). */
        final boolean fromBundle;
        final boolean trial;
        /** Buscar ya, sin esperar al intervalo: se descartó un activo. */
        final boolean checkNow;
        /** El estado tras decidir; null si el selector falló y nada debe escribirse en este proceso. */
        final OtaState state;
        /** Por qué se sirvió el integrado sin decidir (solo con {@link #choose}), para logcat. */
        final Throwable error;

        Decision(String version, boolean fromBundle, boolean trial, boolean checkNow, OtaState state, Throwable error) {
            this.version = version;
            this.fromBundle = fromBundle;
            this.trial = trial;
            this.checkNow = checkNow;
            this.state = state;
            this.error = error;
        }
    }

    /**
     * {@link #select} con la red de seguridad del arranque: con cualquier excepción se sirve el
     * integrado y el estado queda en null (no se escribe nada). Un fallo del selector nunca deja la
     * app sin abrir.
     */
    static Decision choose(Input input, Disk disk) {
        try {
            return select(input, disk);
        } catch (Throwable error) {
            return new Decision(input.builtin, false, false, false, null, error);
        }
    }

    static Decision select(Input input, Disk disk) {
        if (!OtaVersion.isValid(input.builtin)) {
            throw new IllegalArgumentException("El integrado no tiene una versión válida: " + input.builtin);
        }
        OtaState state = input.state;
        if (state.foreign) return new Decision(input.builtin, false, false, false, state, null);
        OtaState next = state.copy();
        List<String> doomed = new ArrayList<>();
        boolean checkNow = false;

        OtaState.Bundle active = next.active;
        if (active != null && !isUsable(active, input, disk)) {
            doomed.add(active.version);
            active = null;
            checkNow = true;
        }
        OtaState.Bundle pending = next.pending;
        if (pending != null && !isUsable(pending, input, disk)) {
            doomed.add(pending.version);
            pending = null;
        }
        if (active != null && OtaVersion.compare(active.version, input.builtin) <= 0) {
            doomed.add(active.version);
            active = null;
        }
        if (active == null) {
            next.active = null;
            next.checkEveryBoot = false;
        }
        next.pending = pending;
        String base = active != null ? active.version : input.builtin;
        next.forgetUpTo(base);

        if (pending != null) {
            boolean eligible = OtaVersion.compare(pending.version, base) > 0 && !next.hasFailed(pending.version);
            if (eligible && pending.version.equals(input.trialInProcess)) {
                tryWrite(state, next, doomed, disk);
                return new Decision(pending.version, true, true, checkNow, next, null);
            }
            if (eligible && pending.attempts < MAX_ATTEMPTS) {
                next.pending = pending.withAttempts(pending.attempts + 1);
                if (tryWrite(state, next, doomed, disk)) {
                    return new Decision(pending.version, true, true, checkNow, next, null);
                }
                // Sin el intento anotado no hay prueba: se sirve la base y el pendiente espera.
                next.pending = pending;
            } else {
                if (eligible) {
                    next.failed.add(new OtaState.Failure(pending.version, OtaState.FAILED_TIMEOUT));
                    next.notice = new OtaState.Notice(OtaState.NOTICE_ROLLED_BACK, pending.version);
                }
                doomed.add(pending.version);
                next.pending = null;
            }
        }

        if (active != null) {
            int boots = active.bootsWithoutReady + 1;
            next.active = active.withBootsWithoutReady(boots);
            if (boots >= BOOTS_BEFORE_RECHECK && !next.checkEveryBoot) {
                if (disk.intact(active)) {
                    next.checkEveryBoot = true;
                } else {
                    doomed.add(active.version);
                    next.active = null;
                    active = null;
                    checkNow = true;
                }
            }
        }
        // Si no se puede escribir se sirve igual: la base no está a prueba.
        tryWrite(state, next, doomed, disk);
        return active != null
                ? new Decision(active.version, true, false, checkNow, next, null)
                : new Decision(input.builtin, false, false, checkNow, next, null);
    }

    /** Un paquete que este .apk puede servir (paso 1). */
    private static boolean isUsable(OtaState.Bundle bundle, Input input, Disk disk) {
        if (bundle.keyIds.isEmpty() || !input.keyIds.containsAll(bundle.keyIds)) return false;
        int minNative = disk.minNative(bundle);
        return minNative >= 1 && minNative <= input.nativeLevel;
    }

    /**
     * Escribe el estado si cambió (con el actualizador inerte, el arranque no escribe nada) y, solo
     * si quedó escrito, borra las carpetas descartadas: si no, el estado del disco aún las nombra. Si
     * el proceso muere entre las dos cosas, las carpetas que el estado ya no nombra se recogen como
     * restos al arrancar. Nunca borra la de un paquete que el estado sigue nombrando (un estado con
     * el mismo número de activo y de pendiente no se lleva el activo).
     */
    private static boolean tryWrite(OtaState before, OtaState next, List<String> doomed, Disk disk) {
        if (!Arrays.equals(before.toJson(), next.toJson())) {
            try {
                disk.write(next);
            } catch (IOException e) {
                return false;
            }
        }
        for (String version : doomed) {
            boolean named = (next.active != null && next.active.version.equals(version))
                    || (next.pending != null && next.pending.version.equals(version));
            if (!named) disk.delete(version);
        }
        return true;
    }
}

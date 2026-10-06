package io.github.pipeherreral.micelio.ota;

/**
 * Cuándo toca buscar una versión nueva (ARCHITECTURE.md §4.34). Cada momento se anota con tres
 * relojes: la hora de pared, `SystemClock.elapsedRealtime()` (no salta si alguien cambia la hora,
 * pero vuelve a 0 al reiniciar el teléfono) y el número de arranque del sistema
 * (`Settings.Global.BOOT_COUNT`, API 24). Dentro del mismo arranque manda `elapsedRealtime`; entre
 * arranques, la hora de pared, y una hora que retrocede cuenta como caducada: si no, adelantar el
 * reloj para cobrar progreso y devolverlo apagaría las búsquedas hasta alcanzar la hora adelantada.
 */
final class OtaClock {
    /** Tras un fallo de red, un tiempo agotado o un error del servidor, se reintenta a los 10 min. */
    static final long RETRY_MILLIS = 10 * 60 * 1000;

    private OtaClock() {}

    static final class Stamp {
        final long wall;
        final long elapsed;
        /** -1 si el sistema no lo dio. */
        final long bootCount;

        Stamp(long wall, long elapsed, long bootCount) {
            this.wall = wall;
            this.elapsed = elapsed;
            this.bootCount = bootCount;
        }
    }

    /** Si desde `since` pasaron al menos `millis` (o la hora de pared retrocedió, en otro arranque). */
    static boolean passed(Stamp since, Stamp now, long millis) {
        if (since.bootCount >= 0 && since.bootCount == now.bootCount && now.elapsed >= since.elapsed) {
            return now.elapsed - since.elapsed >= millis;
        }
        return now.wall - since.wall >= millis || now.wall < since.wall;
    }

    /**
     * Si toca buscar sola: no antes de 10 min tras un fallo (también con `checkEveryBoot`: insistir
     * sin red no ayuda); sí en cuanto pasan, con `checkEveryBoot` (una versión confirmada que dejó
     * de arrancar, §3.4), si nunca se buscó o si pasó el intervalo desde la última respuesta.
     */
    static boolean isDue(OtaState state, Stamp now, long intervalSeconds) {
        if (state.failedCheck != null) return passed(state.failedCheck, now, RETRY_MILLIS);
        if (state.checkEveryBoot || state.lastCheck == null) return true;
        return passed(state.lastCheck, now, intervalSeconds * 1000);
    }

    /**
     * Anota el resultado de pedir el manifiesto. Una respuesta (200, con cualquier veredicto, o 404:
     * no hay ninguno publicado) cuenta como comprobación; sin respuesta (`status` -1), con un error
     * del servidor o con cualquier otro código (un 403 o un 429 de GitHub) se reintenta en 10 min.
     */
    static void recordCheck(OtaState state, int status, Stamp now) {
        if (status == 200 || status == 404) {
            state.lastCheck = now;
            state.failedCheck = null;
        } else {
            state.failedCheck = now;
        }
    }
}

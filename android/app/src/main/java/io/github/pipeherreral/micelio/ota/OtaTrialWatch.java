package io.github.pipeherreral.micelio.ota;

/**
 * El tiempo de primer plano de una versión a prueba (ARCHITECTURE.md §4.34): suma lo que pasa entre
 * cada `onResume` y su `onPause`, medido con `SystemClock.elapsedRealtime()`, que no salta si alguien
 * cambia la hora. Solo cuenta el primer plano: una versión que el jugador abre y deja en segundo plano
 * no se da por fallida mientras no se mira. Sigue contando si la actividad se recrea durante la prueba
 * (otro tamaño de letra, por ejemplo): es una por proceso, no por actividad.
 */
final class OtaTrialWatch {
    private final long limit;
    /** Lo sumado en los primeros planos ya cerrados. */
    private long counted;
    /** El `elapsedRealtime` del último `onResume`, o -1 en segundo plano. */
    private long resumedAt = -1;

    OtaTrialWatch(long limitMillis) {
        this.limit = limitMillis;
    }

    void resume(long now) {
        if (resumedAt < 0) resumedAt = now;
    }

    void pause(long now) {
        if (resumedAt < 0) return;
        // Un reloj que va hacia atrás no resta: elapsedRealtime no lo hace, pero no cuesta nada.
        counted += Math.max(0, now - resumedAt);
        resumedAt = -1;
    }

    boolean isRunning() {
        return resumedAt >= 0;
    }

    /** Lo que falta para vencer, en milisegundos de primer plano; 0 si ya venció. */
    long remaining(long now) {
        long open = resumedAt < 0 ? 0 : Math.max(0, now - resumedAt);
        return Math.max(0, limit - counted - open);
    }
}

package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Cuándo toca buscar: el intervalo con tres relojes, la hora que retrocede y el reintento tras un fallo. */
public class OtaClockTest {
    private static final long HOUR = 3600;
    private static final long HOUR_MS = HOUR * 1000;
    private static final long DAY_MS = 24 * HOUR_MS;

    private static OtaClock.Stamp at(long wall, long elapsed, long bootCount) {
        return new OtaClock.Stamp(wall, elapsed, bootCount);
    }

    private static OtaState checkedAt(OtaClock.Stamp stamp) {
        OtaState state = new OtaState();
        state.lastCheck = stamp;
        return state;
    }

    /** Si nunca se buscó, toca; con un intervalo de 0 (la configuración de prueba), siempre. */
    @Test
    public void neverCheckedOrZeroIntervalIsDue() {
        assertTrue(OtaClock.isDue(new OtaState(), at(0, 0, 1), HOUR));
        OtaClock.Stamp now = at(100 * DAY_MS, 5000, 3);
        assertTrue(OtaClock.isDue(checkedAt(now), now, 0));
    }

    /** En el mismo arranque manda elapsedRealtime: cambiar la hora del teléfono no adelanta ni retrasa nada. */
    @Test
    public void withinOneBootElapsedTimeDecides() {
        OtaState state = checkedAt(at(100 * DAY_MS, 10_000, 7));
        assertFalse(OtaClock.isDue(state, at(100 * DAY_MS + HOUR_MS, 10_000 + HOUR_MS - 1, 7), HOUR));
        assertFalse(OtaClock.isDue(state, at(200 * DAY_MS, 10_000 + 60_000, 7), HOUR));
        assertFalse(OtaClock.isDue(state, at(50 * DAY_MS, 10_000 + 60_000, 7), HOUR));
        assertTrue(OtaClock.isDue(state, at(100 * DAY_MS, 10_000 + HOUR_MS, 7), HOUR));
    }

    /** En otro arranque, la hora de pared: toca si avanzó el intervalo. */
    @Test
    public void acrossBootsWallTimeDecides() {
        OtaState state = checkedAt(at(100 * DAY_MS, 10_000, 7));
        assertFalse(OtaClock.isDue(state, at(100 * DAY_MS + HOUR_MS - 1, 20_000, 8), HOUR));
        assertTrue(OtaClock.isDue(state, at(100 * DAY_MS + HOUR_MS, 20_000, 8), HOUR));
    }

    /**
     * Una última búsqueda «en el futuro» (se adelantó el reloj y se devolvió) cuenta como caducada
     * en otro arranque: si no, las búsquedas se apagarían hasta alcanzar la hora adelantada.
     */
    @Test
    public void aLastCheckInTheFutureIsExpiredOnAnotherBoot() {
        OtaState state = checkedAt(at(400 * DAY_MS, 10_000, 7));
        assertTrue(OtaClock.isDue(state, at(100 * DAY_MS, 20_000, 8), HOUR));
    }

    /** Sin número de arranque, o con un elapsedRealtime que retrocede, no se fía de elapsedRealtime. */
    @Test
    public void unknownOrInconsistentBootsFallBackToWallTime() {
        OtaState unknown = checkedAt(at(100 * DAY_MS, 10_000, -1));
        assertTrue(OtaClock.isDue(unknown, at(100 * DAY_MS + HOUR_MS, 10_001, -1), HOUR));
        assertFalse(OtaClock.isDue(unknown, at(100 * DAY_MS + 1, 10_000 + HOUR_MS, -1), HOUR));

        OtaState rewound = checkedAt(at(100 * DAY_MS, 10_000_000, 7));
        assertTrue(OtaClock.isDue(rewound, at(100 * DAY_MS + HOUR_MS, 5_000, 7), HOUR));
    }

    /** Con `checkEveryBoot` (un activo que dejó de arrancar) toca siempre, sin el tope de una hora. */
    @Test
    public void checkEveryBootIsAlwaysDue() {
        OtaClock.Stamp now = at(100 * DAY_MS, 10_000, 7);
        OtaState state = checkedAt(now);
        state.checkEveryBoot = true;
        assertTrue(OtaClock.isDue(state, now, HOUR));
    }

    /** Tras un fallo de red no se insiste en 10 min (tampoco con `checkEveryBoot`); después, toca. */
    @Test
    public void afterAFailureItWaitsTenMinutes() {
        OtaClock.Stamp failure = at(100 * DAY_MS, 10_000, 7);
        OtaState state = new OtaState();
        state.failedCheck = failure;
        state.checkEveryBoot = true;
        assertFalse(OtaClock.isDue(state, at(100 * DAY_MS, 10_000 + OtaClock.RETRY_MILLIS - 1, 7), HOUR));
        assertTrue(OtaClock.isDue(state, at(100 * DAY_MS, 10_000 + OtaClock.RETRY_MILLIS, 7), HOUR));

        // Aunque la última respuesta sea reciente (falló un «Buscar ahora»), se reintenta a los 10 min.
        state.lastCheck = at(100 * DAY_MS, 9_000, 7);
        state.checkEveryBoot = false;
        assertTrue(OtaClock.isDue(state, at(100 * DAY_MS, 10_000 + OtaClock.RETRY_MILLIS, 7), HOUR));
        // Y una hora que retrocede en otro arranque tampoco lo bloquea.
        assertTrue(OtaClock.isDue(state, at(10 * DAY_MS, 1_000, 8), HOUR));
    }

    /** Un 200 o un 404 cuentan como búsqueda; sin respuesta, un 5xx, un 403 o un 429, se reintenta. */
    @Test
    public void onlyAnAnswerCountsAsACheck() {
        OtaClock.Stamp before = at(1, 1, 1);
        OtaClock.Stamp now = at(2, 2, 1);
        for (int status : new int[] {200, 404}) {
            OtaState state = checkedAt(before);
            state.failedCheck = before;
            OtaClock.recordCheck(state, status, now);
            assertSame(now, state.lastCheck);
            assertNull(state.failedCheck);
        }
        for (int status : new int[] {-1, 500, 502, 503, 403, 429, 301}) {
            OtaState state = checkedAt(before);
            OtaClock.recordCheck(state, status, now);
            assertSame(before, state.lastCheck);
            assertSame(now, state.failedCheck);
        }
    }
}

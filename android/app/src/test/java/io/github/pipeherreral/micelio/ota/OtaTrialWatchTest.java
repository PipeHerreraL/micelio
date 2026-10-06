package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** El reloj de una versión a prueba: solo suma el primer plano. */
public class OtaTrialWatchTest {
    /** Dos onResume seguidos (sin onPause entre medias) no pierden lo que ya se contaba. */
    @Test
    public void aSecondResumeKeepsCounting() {
        OtaTrialWatch watch = new OtaTrialWatch(30_000);
        watch.resume(0);
        watch.resume(10_000);
        assertEquals(10_000, watch.remaining(20_000));
    }

    /** Lo de segundo plano no cuenta, y un reloj que fuera hacia atrás no devuelve tiempo. */
    @Test
    public void onlyTheForegroundCounts() {
        OtaTrialWatch watch = new OtaTrialWatch(30_000);
        assertEquals(30_000, watch.remaining(5_000));
        watch.resume(5_000);
        assertTrue(watch.isRunning());
        watch.pause(25_000);
        assertFalse(watch.isRunning());
        assertEquals(10_000, watch.remaining(1_000_000));
        watch.resume(2_000_000);
        watch.pause(1_999_000);
        assertEquals(10_000, watch.remaining(3_000_000));
        watch.resume(3_000_000);
        assertEquals(0, watch.remaining(3_010_000));
        assertEquals(0, watch.remaining(4_000_000));
    }
}

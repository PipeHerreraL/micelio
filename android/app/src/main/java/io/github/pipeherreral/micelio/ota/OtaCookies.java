package io.github.pipeherreral.micelio.ota;

import java.io.IOException;
import java.net.CookieHandler;
import java.net.URI;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Que el actualizador no mande ni guarde cookies (ARCHITECTURE.md §4.34: sin cookies ni
 * identificadores). `HttpURLConnection` pasa por el `CookieHandler` del proceso, y Capacitor instala uno
 * con cada `Bridge` (CapacitorCookies.load(), aunque el complemento esté apagado: `enabled` solo gobierna
 * document.cookie en el JS) que guarda cada Set-Cookie en el almacén persistente del WebView y la manda
 * en las peticiones siguientes. GitHub responde con `_octo`, un identificador que dura un año: cada
 * búsqueda lo llevaría.
 *
 * Este manejador se pone delante del del proceso y le deja todo lo demás: solo calla con el hilo que
 * está pidiendo algo para el actualizador ({@link #enter}).
 */
final class OtaCookies extends CookieHandler {
    private static final ThreadLocal<Boolean> UPDATER = new ThreadLocal<>();
    private final CookieHandler process;

    private OtaCookies(CookieHandler process) {
        this.process = process;
    }

    /** Lo que pida este hilo hasta {@link #leave} es del actualizador. */
    static void enter() {
        UPDATER.set(Boolean.TRUE);
    }

    static void leave() {
        UPDATER.remove();
    }

    /**
     * Se pone delante del manejador del proceso si aún no lo está, y devuelve el que queda (null si no
     * hay ninguno). Hace falta antes de cada conexión: Capacitor vuelve a poner el suyo con cada
     * actividad nueva, también a mitad de una descarga.
     */
    static synchronized CookieHandler install() {
        CookieHandler current = CookieHandler.getDefault();
        if (current == null || current instanceof OtaCookies) return current;
        CookieHandler guard = new OtaCookies(current);
        CookieHandler.setDefault(guard);
        return guard;
    }

    private static boolean isUpdater() {
        return Boolean.TRUE.equals(UPDATER.get());
    }

    @Override
    public Map<String, List<String>> get(URI uri, Map<String, List<String>> requestHeaders) throws IOException {
        if (isUpdater()) return Collections.emptyMap();
        return process.get(uri, requestHeaders);
    }

    @Override
    public void put(URI uri, Map<String, List<String>> responseHeaders) throws IOException {
        if (!isUpdater()) process.put(uri, responseHeaders);
    }
}

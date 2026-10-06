package io.github.pipeherreral.micelio.ota;

import android.webkit.JavascriptInterface;

/**
 * `window.MicelioBoot` (ARCHITECTURE.md §4.34): lo que el JS lee de forma síncrona al evaluar main.ts,
 * antes de cargar la partida, para saber si esta versión está a prueba y no debe escribir nada del
 * guardado. El complemento lo añade en su `load()`, que el `Bridge` llama antes de cargar la página: un
 * objeto inyectado antes de la carga está desde el primer script.
 *
 * Devuelve un texto ya hecho al arrancar, sin E/S: el WebView lo llama desde un hilo suyo, en segundo
 * plano. Solo dice qué versión corre; el WebView solo carga https://localhost (las URL de fuera las abre
 * Android aparte), así que no hay otra página que pueda leerlo.
 */
public final class MicelioBootInterface {
    private final String boot;

    MicelioBootInterface(String boot) {
        this.boot = boot;
    }

    /** JSON: `{ trial, version, builtin, apk, nativeLevel }` de este arranque. */
    @JavascriptInterface
    public String boot() {
        return boot;
    }
}

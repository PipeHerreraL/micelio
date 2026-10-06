package io.github.pipeherreral.micelio.ota;

import android.os.Build;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * El complemento `MicelioUpdater` (ARCHITECTURE.md §4.34): lo que el JS de la app (src/native/, solo en
 * el build native) pregunta y avisa al actualizador. Uno por actividad: Capacitor lo crea con cada
 * `Bridge`, y cada uno habla por el arranque de su actividad.
 *
 *   status()    { trial, version, builtin, apk, nativeLevel, pending, notice, lastError }
 *   ready()     { result: 'confirmed' | 'tooLate' | 'notTrial', notice }: tras el primer frame. El JS
 *               solo vuelve a guardar con `confirmed` o `notTrial`; `notice` es el aviso que toca
 *               mostrar ahora (`updated` al confirmar), y desde aquí los avisos cuentan como vistos.
 *               Una versión ya confirmada responde `confirmed` otra vez (una recarga de la página).
 *   reject({ reason: 'save' | 'error' })  la versión a prueba no entiende la partida o falló antes.
 *   checkNow()  { result: 'ready' | 'none' | 'needsApk' | 'failed', version? }. Con `needsApk`, el aviso
 *               lo da el JS con esta respuesta (ota.needsApk con `version`; sin ella, ota.needsApkFormat):
 *               no queda en el `notice` de status() del arranque siguiente, que es para lo que encuentra
 *               la búsqueda sola.
 *   applyNow()  «Usar ahora», con la partida ya guardada: corta la descarga y recrea si hay versión.
 *   evento 'downloaded' { version }
 *
 * En su `load()` (dentro del constructor del `Bridge`, antes de cargar la página) añade
 * `window.MicelioBoot` y un `WebViewListener` para la caída del renderizador.
 */
@CapacitorPlugin(name = "MicelioUpdater")
public class MicelioUpdaterPlugin extends Plugin {
    private OtaService.Session session;
    private OtaService.Listener listener;

    @Override
    public void load() {
        session = OtaAndroid.session(getActivity());
        OtaService service = OtaAndroid.service();
        try {
            getBridge().getWebView().addJavascriptInterface(new MicelioBootInterface(session), "MicelioBoot");
        } catch (RuntimeException error) {
            // Sin MicelioBoot el JS no guarda nada (falla cerrada) y, a prueba, el reloj retira la versión.
            Log.e(OtaAndroid.TAG, "No se pudo añadir MicelioBoot", error);
        }
        getBridge().addWebViewListener(new WebViewListener() {
            // El WebView solo lo llama desde Android 8 (API 26); antes, el renderizador corre dentro de
            // la app y una caída la cierra, como siempre.
            @RequiresApi(api = Build.VERSION_CODES.O)
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.w(OtaAndroid.TAG, "Se cayó el renderizador del arranque " + session.number);
                OtaService current = OtaAndroid.service();
                if (current != null) current.renderGone(session);
                else session.host.recreate();
                // true: el proceso sigue, y con él el localStorage que Chromium aún no llevó a disco.
                return true;
            }
        });
        if (service != null) {
            listener = version -> {
                JSObject data = new JSObject();
                data.put("version", version);
                notifyListeners("downloaded", data);
            };
            service.addListener(listener);
        }
    }

    @Override
    protected void handleOnDestroy() {
        OtaService service = OtaAndroid.service();
        if (service != null && listener != null) service.removeListener(listener);
    }

    @PluginMethod
    public void status(PluginCall call) {
        OtaService service = OtaAndroid.service();
        if (service == null) {
            // Sin servicio se sirvió el paquete del .apk, sin prueba.
            call.resolve(status(OtaAndroid.fallbackStatus(session)));
            return;
        }
        service.status(session, status -> call.resolve(status(status)));
    }

    @PluginMethod
    public void ready(PluginCall call) {
        OtaService service = OtaAndroid.service();
        if (service == null) {
            JSObject out = new JSObject();
            out.put("result", OtaService.NOT_TRIAL);
            out.put("notice", JSObject.NULL);
            call.resolve(out);
            return;
        }
        service.ready(session, (result, notice) -> {
            JSObject out = new JSObject();
            out.put("result", result);
            out.put("notice", notice(notice));
            call.resolve(out);
        });
    }

    @PluginMethod
    public void reject(PluginCall call) {
        String reason = call.getString("reason");
        if (!OtaState.FAILED_SAVE.equals(reason) && !OtaState.FAILED_ERROR.equals(reason)) {
            call.reject("reason debe ser 'save' o 'error'");
            return;
        }
        OtaService service = OtaAndroid.service();
        if (service != null) service.reject(session, reason);
        call.resolve();
    }

    @PluginMethod
    public void checkNow(PluginCall call) {
        OtaService service = OtaAndroid.service();
        if (service == null) {
            JSObject out = new JSObject();
            out.put("result", OtaService.NONE);
            call.resolve(out);
            return;
        }
        service.checkNow((result, version) -> {
            JSObject out = new JSObject();
            out.put("result", result);
            if (version != null) out.put("version", version);
            call.resolve(out);
        });
    }

    @PluginMethod
    public void applyNow(PluginCall call) {
        OtaService service = OtaAndroid.service();
        if (service == null) {
            call.resolve();
            return;
        }
        service.applyNow(session, call::resolve);
    }

    private static JSObject status(OtaService.Status status) {
        JSObject out = new JSObject();
        out.put("trial", status.trial);
        out.put("version", status.version);
        out.put("builtin", status.builtin);
        out.put("apk", status.apk);
        out.put("nativeLevel", status.nativeLevel);
        out.put("pending", status.pending == null ? JSObject.NULL : status.pending);
        out.put("notice", notice(status.notice));
        out.put("lastError", status.lastError == null ? JSObject.NULL : status.lastError);
        return out;
    }

    private static Object notice(OtaState.Notice notice) {
        if (notice == null) return JSObject.NULL;
        JSObject out = new JSObject();
        out.put("kind", notice.kind);
        out.put("version", notice.version);
        return out;
    }
}

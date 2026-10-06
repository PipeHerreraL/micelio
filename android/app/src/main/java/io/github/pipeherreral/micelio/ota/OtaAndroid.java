package io.github.pipeherreral.micelio.ota;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.util.Log;
import com.getcapacitor.Bridge;
import com.getcapacitor.ServerPath;
import io.github.pipeherreral.micelio.BuildConfig;
import io.github.pipeherreral.micelio.R;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.IOException;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.Executors;

/**
 * El actualizador dentro de Android (ARCHITECTURE.md §4.34): crea el {@link OtaService} del proceso con
 * los relojes, los hilos, la red y el disco de verdad, y lo une a `MainActivity` y al complemento.
 *
 * `MainActivity` llama a {@link #serverPath} en su `onCreate`, antes de `super.onCreate()`: el `Bridge`
 * se crea con esa carpeta y carga la página una sola vez. Nunca lanza: con cualquier fallo se sirve el
 * paquete del .apk (`public` de los assets) y la app abre igual.
 */
public final class OtaAndroid {
    static final String TAG = "MicelioOta";
    private static final String BUILTIN_INFO = Bridge.DEFAULT_WEB_ASSET_DIR + "/" + OtaZip.BUNDLE_INFO;
    // La configuración y micelio-bundle.json miden unos cientos de bytes; el tope solo acota la memoria.
    private static final int MAX_CONFIG_BYTES = 64 * 1024;

    // Se crea en el hilo principal y lo leen también los hilos del complemento.
    private static volatile OtaService service;
    /** El arranque de cada actividad viva. Solo desde el hilo principal. */
    private static final Map<Activity, OtaService.Session> SESSIONS = new WeakHashMap<>();

    private OtaAndroid() {}

    /** La carpeta que sirve esta actividad: un paquete descargado o el del .apk. */
    public static ServerPath serverPath(Activity activity) {
        OtaService.Session session;
        try {
            session = service(activity).select(new ActivityHost(activity));
        } catch (Throwable error) {
            Log.e(TAG, "El actualizador falló al arrancar: se sirve el paquete del .apk", error);
            session = new OtaService.Session(0, readBuiltin(activity), null, false, new ActivityHost(activity));
        }
        SESSIONS.put(activity, session);
        if (session.folder == null) return new ServerPath(ServerPath.PathType.ASSET_PATH, Bridge.DEFAULT_WEB_ASSET_DIR);
        return new ServerPath(ServerPath.PathType.BASE_PATH, session.folder.getAbsolutePath());
    }

    public static void resumed(Activity activity) {
        OtaService.Session session = SESSIONS.get(activity);
        if (service != null && session != null) service.resumed(session);
    }

    public static void paused(Activity activity) {
        OtaService.Session session = SESSIONS.get(activity);
        if (service != null && session != null) service.paused(session);
    }

    public static void destroyed(Activity activity) {
        SESSIONS.remove(activity);
    }

    /** El servicio del proceso, o null si no se pudo crear (el complemento responde sin él). */
    static OtaService service() {
        return service;
    }

    /** El arranque de una actividad; uno sin prueba con el integrado si no pasó por {@link #serverPath}. */
    static OtaService.Session session(Activity activity) {
        OtaService.Session session = SESSIONS.get(activity);
        return session != null ? session : new OtaService.Session(0, "", null, false, new ActivityHost(activity));
    }

    /** `MicelioBoot.boot()` de un arranque; sin servicio, uno sin prueba con lo que dice el .apk. */
    static String bootJson(OtaService.Session session) {
        OtaService current = service;
        if (current != null) return current.bootJson(session);
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("trial", false);
        info.put("version", session.version);
        info.put("builtin", session.version);
        info.put("apk", BuildConfig.VERSION_NAME);
        info.put("nativeLevel", BuildConfig.NATIVE_LEVEL);
        return OtaJson.write(info);
    }

    /** `status()` sin servicio: se sirvió el paquete del .apk, sin prueba ni nada descargado. */
    static OtaService.Status fallbackStatus(OtaService.Session session) {
        return new OtaService.Status(false, session.version, session.version, BuildConfig.VERSION_NAME,
                BuildConfig.NATIVE_LEVEL, null, null, null);
    }

    private static synchronized OtaService service(Context context) {
        if (service == null) {
            Context app = context.getApplicationContext();
            ContentResolver resolver = app.getContentResolver();
            File dir = new File(app.getNoBackupFilesDir(), "ota");
            OtaService.Clock clock = () -> new OtaClock.Stamp(System.currentTimeMillis(), SystemClock.elapsedRealtime(),
                    Settings.Global.getInt(resolver, Settings.Global.BOOT_COUNT, -1));
            OtaService.Log log = (message, error) -> {
                if (error == null) Log.i(TAG, message);
                else Log.w(TAG, message, error);
            };
            // El de depuración se instala al lado (io.github.pipeherreral.micelio.debug) y acepta los
            // mismos manifiestos que la app que imita.
            String appId = BuildConfig.APPLICATION_ID.replaceAll("\\.debug$", "");
            service = new OtaService(dir, readConfig(app), readBuiltin(app), BuildConfig.NATIVE_LEVEL, appId,
                    BuildConfig.VERSION_NAME, clock, new OtaService.Threads("MicelioOta"),
                    Executors.newSingleThreadExecutor(task -> new Thread(task, "MicelioOta-red")), new OtaDownloader(),
                    OtaAndroid::syncDir, log);
        }
        return service;
    }

    /** res/raw/micelio_ota.json; null (inerte) si falta o está mal escrita, que es un error nuestro. */
    private static OtaConfig readConfig(Context context) {
        try (InputStream in = context.getResources().openRawResource(R.raw.micelio_ota)) {
            return OtaConfig.parse(readAll(in));
        } catch (IOException | RuntimeException error) {
            Log.e(TAG, "micelio_ota.json no se puede leer: el actualizador queda inerte", error);
            return null;
        }
    }

    /** La versión del paquete del .apk (assets/public/micelio-bundle.json), o null si no se puede leer. */
    private static String readBuiltin(Context context) {
        try (InputStream in = context.getAssets().open(BUILTIN_INFO)) {
            return OtaJson.asString(OtaJson.asObject(OtaJson.parse(readAll(in))).get("version"));
        } catch (IOException | OtaJson.Invalid | RuntimeException error) {
            Log.e(TAG, "El .apk no dice la versión de su paquete: se sirve sin elegir", error);
            return null;
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        for (int n = in.read(buffer); n >= 0; n = in.read(buffer)) {
            out.write(buffer, 0, n);
            if (out.size() > MAX_CONFIG_BYTES) throw new IOException("Más de " + MAX_CONFIG_BYTES + " bytes");
        }
        return out.toByteArray();
    }

    /**
     * `fsync` de una carpeta, para que un renameTo o un archivo nuevo sobrevivan a un corte de luz:
     * java.io no abre carpetas y java.nio.file es de la API 26, así que va por `android.system.Os`.
     */
    private static void syncDir(File dir) throws IOException {
        FileDescriptor fd = null;
        try {
            fd = Os.open(dir.getPath(), OsConstants.O_RDONLY, 0);
            Os.fsync(fd);
        } catch (ErrnoException error) {
            // Algún sistema de archivos no admite fsync de una carpeta (EINVAL): no hay nada más que
            // hacer, y lo que hubiera que llevar a disco ya está pedido. Cualquier otro error, sí cuenta.
            if (error.errno != OsConstants.EINVAL) throw new IOException(error);
        } finally {
            if (fd != null) {
                try {
                    Os.close(fd);
                } catch (ErrnoException error) {
                    // Cerrar un descriptor de solo lectura no pierde nada.
                }
            }
        }
    }

    /** La actividad, sin retenerla: el servicio vive tanto como el proceso. */
    private static final class ActivityHost implements OtaService.Host {
        private final WeakReference<Activity> activity;

        ActivityHost(Activity activity) {
            this.activity = new WeakReference<>(activity);
        }

        @Override
        public void recreate() {
            onUiThread(true);
        }

        @Override
        public void finish() {
            onUiThread(false);
        }

        private void onUiThread(boolean recreate) {
            Activity target = activity.get();
            if (target == null) return;
            target.runOnUiThread(() -> {
                if (target.isFinishing() || target.isDestroyed()) return;
                if (recreate) target.recreate();
                else target.finish();
            });
        }
    }
}

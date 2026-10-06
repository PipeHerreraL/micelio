package io.github.pipeherreral.micelio.ota;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Map;

/**
 * El disco del actualizador, `getNoBackupFilesDir()/ota/` (fuera de la copia de Android: una
 * restauración no apunta a carpetas que no existen):
 *
 *   state.json            el estado ({@link OtaState})
 *   bundles/<versión>/    el paquete activo y el pendiente, como mucho
 *
 * `state.json` se escribe entero en un temporal con `fsync`, se renombra encima y se hace `fsync`
 * de la carpeta: tras un corte de luz queda el estado anterior o el nuevo, nunca uno a medias. Es
 * también el disco del selector de arranque.
 */
final class OtaStore implements OtaSelector.Disk {
    static final String STATE = "state.json";
    // Unos 8 kB con dos paquetes de 30 archivos; el tope solo acota la memoria si algo lo engorda.
    private static final int MAX_STATE_BYTES = 1024 * 1024;

    private final File dir;
    private final OtaFiles.DirSync dirSync;

    OtaStore(File dir, OtaFiles.DirSync dirSync) {
        this.dir = dir;
        this.dirSync = dirSync;
    }

    File bundleDir(String version) {
        return new File(new File(dir, "bundles"), version);
    }

    /** El estado guardado; vacío si no hay o no se puede leer (ver {@link OtaState#parse}). */
    OtaState read() {
        byte[] data;
        try {
            data = OtaFiles.readAll(new File(dir, STATE), MAX_STATE_BYTES);
        } catch (IOException e) {
            // No existe (la primera vez) o no se puede leer: lo mismo que un JSON ilegible.
            return new OtaState();
        }
        return data == null ? new OtaState() : OtaState.parse(data);
    }

    @Override
    public void write(OtaState state) throws IOException {
        if (state.foreign) throw new IOException("El estado es de un Java más nuevo: no se pisa.");
        boolean created = !dir.isDirectory();
        if (created && !dir.mkdirs()) throw new IOException("No se pudo crear " + dir);
        File temp = new File(dir, STATE + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(state.toJson());
            // Ninguna prueba falla si se quita (aceptado: JUnit no puede simular un corte de luz). Sin él,
            // el renameTo podría llegar al disco antes que los datos y dejar un state.json vacío.
            out.getFD().sync();
        }
        if (!temp.renameTo(new File(dir, STATE))) throw new IOException("No se pudo renombrar " + temp);
        dirSync.sync(dir);
        if (created) dirSync.sync(dir.getParentFile());
    }

    @Override
    public int minNative(OtaState.Bundle bundle) {
        File folder = bundleDir(bundle.version);
        if (!folder.isDirectory()) return -1;
        for (OtaManifest.FileEntry entry : bundle.files) {
            // El estado lo escribe la app, pero una ruta suya nunca sale de la carpeta del paquete.
            if (!OtaZip.isSafeEntryName(entry.path)) return -1;
            File file = new File(folder, entry.path);
            if (!file.isFile() || file.length() != entry.size) return -1;
        }
        Map<String, Object> info = OtaZip.readBundleInfo(folder);
        if (info == null || !bundle.version.equals(info.get("version"))) return -1;
        long minNative = OtaJson.asCount(info.get("minNative"), 1);
        return minNative > Integer.MAX_VALUE ? -1 : (int) minNative;
    }

    @Override
    public boolean intact(OtaState.Bundle bundle) {
        File folder = bundleDir(bundle.version);
        try {
            for (OtaManifest.FileEntry entry : bundle.files) {
                if (!OtaZip.isSafeEntryName(entry.path)) return false;
                if (!OtaFiles.sha256Hex(new File(folder, entry.path)).equals(entry.sha256)) return false;
            }
        } catch (IOException e) {
            // Un archivo que no se deja leer está tan dañado como uno que cambió.
            return false;
        }
        return true;
    }

    @Override
    public void delete(String version) {
        OtaFiles.deleteTree(bundleDir(version));
    }
}

package io.github.pipeherreral.micelio.ota;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** Lo que comparten la lectura del estado, los paquetes y el zip: SHA-256, lecturas acotadas y borrar. */
final class OtaFiles {
    /**
     * `fsync` de una carpeta, para que un `renameTo` o un archivo nuevo sobrevivan a un corte de luz.
     * En Android va con `android.system.Os` (java.io no abre carpetas y java.nio.file es de la API 26);
     * las pruebas pasan la suya.
     */
    interface DirSync {
        void sync(File dir) throws IOException;
    }

    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private OtaFiles() {}

    static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            // Todo Android lo trae desde la API 1.
            throw new IllegalStateException(e);
        }
    }

    static String hex(byte[] bytes) {
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            out[2 * i] = HEX[(bytes[i] >> 4) & 0xf];
            out[2 * i + 1] = HEX[bytes[i] & 0xf];
        }
        return new String(out);
    }

    static String sha256Hex(File file) throws IOException {
        MessageDigest digest = sha256();
        byte[] buffer = new byte[64 * 1024];
        try (InputStream in = new FileInputStream(file)) {
            for (int n = in.read(buffer); n >= 0; n = in.read(buffer)) digest.update(buffer, 0, n);
        }
        return hex(digest.digest());
    }

    /** El archivo entero, o null si mide más de `max` bytes: nada que se lea aquí debería. */
    static byte[] readAll(File file, int max) throws IOException {
        if (file.length() > max) return null;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        try (InputStream in = new FileInputStream(file)) {
            for (int n = in.read(buffer); n >= 0; n = in.read(buffer)) {
                out.write(buffer, 0, n);
                // El tamaño puede cambiar entre length() y la lectura.
                if (out.size() > max) return null;
            }
        }
        return out.toByteArray();
    }

    /**
     * Borra un archivo o una carpeta con todo lo que tiene. Lo que no se pueda borrar lo recoge el
     * siguiente arranque.
     */
    static void deleteTree(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteTree(child);
        }
        // Un fallo aquí deja restos, no estado a medias: nadie usa una carpeta que el estado no nombra.
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}

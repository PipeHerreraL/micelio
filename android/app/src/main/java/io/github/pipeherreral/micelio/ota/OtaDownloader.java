package io.github.pipeherreral.micelio.ota;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.security.MessageDigest;

/**
 * La red del actualizador (ARCHITECTURE.md §4.34), con `HttpURLConnection` y nada más: el manifiesto
 * (`fetch`) y el zip (`download`). Lo que GitHub ve es lo que se ve aquí:
 *
 * - `User-Agent` fijo, `Micelio`, y ninguna cabecera más que diga algo del teléfono o de la partida.
 *   Sin cookies: `HttpURLConnection` solo las manda con un `CookieHandler` por defecto, y Capacitor
 *   solo lo instala con CapacitorCookies activado, que la app no usa (capacitor.config.ts).
 * - Las redirecciones se siguen a mano, hasta cinco y también entre servidores (GitHub hace dos hasta
 *   su almacén de archivos), nunca de HTTPS a HTTP y nunca a otro esquema.
 * - 15 s para conectar y 30 s sin recibir nada; «Usar ahora» corta la conexión en el acto.
 * - Sin compresión de transporte: los bytes que se cuentan son los del archivo firmado.
 *
 * El zip se cuenta y se resume (SHA-256) al vuelo, y se corta en cuanto pasa del tamaño firmado:
 * nunca se escribe en disco más de lo que el manifiesto dijo.
 */
final class OtaDownloader implements OtaService.Http {
    static final String USER_AGENT = "Micelio";
    static final int MAX_REDIRECTS = 5;
    static final int CONNECT_TIMEOUT_MILLIS = 15_000;
    static final int READ_TIMEOUT_MILLIS = 30_000;

    /** Un fallo al escribir en disco, para no confundirlo con uno de la red al leer. */
    private static final class DiskFailure extends IOException {
        private static final long serialVersionUID = 1L;

        DiskFailure(IOException cause) {
            super(cause);
        }
    }

    @Override
    public OtaService.Fetched fetch(String url, int maxBytes, OtaService.Cancel cancel) {
        HttpURLConnection connection = null;
        try {
            connection = open(url, cancel);
            if (connection == null) return new OtaService.Fetched(-1, null);
            int status = connection.getResponseCode();
            if (status != 200) return new OtaService.Fetched(status, null);
            ByteArrayOutputStream body = new ByteArrayOutputStream();
            try (InputStream in = connection.getInputStream()) {
                // Un byte más que el tope: quien lo lee sabe que el cuerpo no cabía.
                copy(in, body, maxBytes + 1L, null);
            }
            return new OtaService.Fetched(200, body.toByteArray());
        } catch (IOException error) {
            return new OtaService.Fetched(-1, null);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override
    public String download(String url, File dest, long size, String sha256, OtaService.Cancel cancel) {
        HttpURLConnection connection = null;
        try {
            connection = open(url, cancel);
            if (connection == null || connection.getResponseCode() != 200) return "network";
            // Un servidor que anuncia más de lo firmado ya no vale: ni se empieza.
            if (connection.getContentLengthLong() > size) return "size";
            MessageDigest digest = OtaFiles.sha256();
            try (InputStream in = connection.getInputStream()) {
                OutputStream out;
                try {
                    out = new FileOutputStream(dest);
                } catch (IOException error) {
                    return "disk";
                }
                try {
                    if (copy(in, out, size, digest) != size) return "size";
                } finally {
                    try {
                        out.close();
                    } catch (IOException error) {
                        // Lo escrito ya pasó por write(): un fallo al cerrar no cambia lo que se comprueba
                        // después (OtaZip vuelve a medir el archivo y su SHA-256).
                    }
                }
                // Lo firmado ya llegó entero: si queda algo más, el zip no es el firmado.
                if (in.read() >= 0) return "size";
            }
            return OtaFiles.hex(digest.digest()).equals(sha256) ? null : "sha256";
        } catch (DiskFailure error) {
            return "disk";
        } catch (IOException error) {
            // También una descarga que «Usar ahora» cortó: el servicio lo distingue por su Cancel.
            return "network";
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** Copia como mucho `max` bytes y devuelve cuántos copió. Un fallo al escribir sale como {@link DiskFailure}. */
    private static long copy(InputStream in, OutputStream out, long max, MessageDigest digest) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        while (total < max) {
            int n = in.read(buffer, 0, (int) Math.min(buffer.length, max - total));
            if (n < 0) break;
            try {
                out.write(buffer, 0, n);
            } catch (IOException error) {
                throw new DiskFailure(error);
            }
            if (digest != null) digest.update(buffer, 0, n);
            total += n;
        }
        return total;
    }

    /**
     * La conexión de la respuesta final, tras seguir las redirecciones, o null si una no se sigue (más
     * de cinco, sin `Location`, a otro esquema o de HTTPS a HTTP).
     */
    private static HttpURLConnection open(String url, OtaService.Cancel cancel) throws IOException {
        URL current;
        try {
            current = new URL(url);
        } catch (MalformedURLException error) {
            return null;
        }
        if (!isWebScheme(current)) return null;
        for (int redirects = 0; ; redirects++) {
            if (cancel.isCancelled()) throw new IOException("Cortada");
            HttpURLConnection connection = (HttpURLConnection) current.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
            connection.setReadTimeout(READ_TIMEOUT_MILLIS);
            connection.setUseCaches(false);
            connection.setRequestProperty("User-Agent", USER_AGENT);
            connection.setRequestProperty("Accept-Encoding", "identity");
            cancel.onCancel(connection::disconnect);
            int status = connection.getResponseCode();
            if (!isRedirect(status)) return connection;
            String location = connection.getHeaderField("Location");
            connection.disconnect();
            if (location == null || redirects >= MAX_REDIRECTS) return null;
            URL next;
            try {
                next = new URL(current, location);
            } catch (MalformedURLException error) {
                return null;
            }
            if (!isAllowedRedirect(current, next)) return null;
            current = next;
        }
    }

    private static boolean isRedirect(int status) {
        return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
    }

    private static boolean isWebScheme(URL url) {
        return "https".equals(url.getProtocol()) || "http".equals(url.getProtocol());
    }

    /** Solo a HTTP o HTTPS, y nunca de HTTPS a HTTP: la descarga no baja a texto claro por el camino. */
    static boolean isAllowedRedirect(URL from, URL to) {
        if (!isWebScheme(to)) return false;
        return !("https".equals(from.getProtocol()) && "http".equals(to.getProtocol()));
    }
}

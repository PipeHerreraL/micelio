package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieHandler;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * La red del actualizador contra un servidor HTTP mínimo en 127.0.0.1: las redirecciones, lo que dice
 * de sí en cada petición, el tope del manifiesto y que la descarga nunca escribe más de lo firmado.
 */
public class OtaDownloaderTest {
    @Rule
    public final TemporaryFolder temp = new TemporaryFolder();

    private final OtaDownloader downloader = new OtaDownloader();
    private TinyServer server;

    @Before
    public void setUp() throws IOException {
        server = new TinyServer();
    }

    @After
    public void tearDown() throws IOException {
        server.socket.close();
    }

    /** Un servidor HTTP/1.1 mínimo: una respuesta por ruta y cada petición con sus cabeceras, en orden. */
    private static final class TinyServer {
        final ServerSocket socket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        final Map<String, byte[]> routes = new ConcurrentHashMap<>();
        final List<String> requests = Collections.synchronizedList(new ArrayList<String>());
        /** La Set-Cookie de las rutas que se definan desde aquí, o null: como GitHub, que pone `_octo`. */
        String setCookie;

        TinyServer() throws IOException {
            Thread thread = new Thread(this::serve, "servidor de prueba");
            thread.setDaemon(true);
            thread.start();
        }

        String url(String path) {
            return "http://127.0.0.1:" + socket.getLocalPort() + path;
        }

        /** `length` -1: sin Content-Length (el cuerpo acaba al cerrar la conexión). */
        void route(String path, int status, String location, byte[] body, long length) {
            StringBuilder head = new StringBuilder("HTTP/1.1 " + status + " X\r\nConnection: close\r\n");
            if (location != null) head.append("Location: ").append(location).append("\r\n");
            if (setCookie != null) head.append("Set-Cookie: ").append(setCookie).append("\r\n");
            if (length >= 0) head.append("Content-Length: ").append(length).append("\r\n");
            byte[] start = head.append("\r\n").toString().getBytes(StandardCharsets.UTF_8);
            byte[] response = new byte[start.length + body.length];
            System.arraycopy(start, 0, response, 0, start.length);
            System.arraycopy(body, 0, response, start.length, body.length);
            routes.put(path, response);
        }

        void body(String path, byte[] body) {
            route(path, 200, null, body, body.length);
        }

        void redirect(String path, String location) {
            route(path, 302, location, new byte[0], 0);
        }

        /** Lee la petición y cierra sin responder nada: como una red que se corta. */
        void hangUp(String path) {
            routes.put(path, new byte[0]);
        }

        private void serve() {
            while (!socket.isClosed()) {
                try (Socket client = socket.accept()) {
                    String request = readHead(client.getInputStream());
                    requests.add(request);
                    String path = request.split(" ")[1];
                    byte[] response = routes.get(path);
                    if (response == null) {
                        response = "HTTP/1.1 404 X\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
                                .getBytes(StandardCharsets.UTF_8);
                    }
                    // Una respuesta vacía (hangUp) no escribe nada: solo se cierra la conexión.
                    OutputStream out = client.getOutputStream();
                    out.write(response);
                    out.flush();
                } catch (IOException | RuntimeException error) {
                    // El socket se cerró al acabar la prueba, o el cliente cortó: nada que responder.
                }
            }
        }

        private static String readHead(InputStream in) throws IOException {
            ByteArrayOutputStream head = new ByteArrayOutputStream();
            int matched = 0;
            for (int b = in.read(); b >= 0; b = in.read()) {
                head.write(b);
                matched = (b == "\r\n\r\n".charAt(matched)) ? matched + 1 : (b == '\r' ? 1 : 0);
                if (matched == 4) break;
            }
            return head.toString("UTF-8");
        }
    }

    private static byte[] bytes(int length) {
        byte[] out = new byte[length];
        for (int i = 0; i < length; i++) out[i] = (byte) (i * 31);
        return out;
    }

    private static String sha256(byte[] data) {
        return OtaFiles.hex(OtaFiles.sha256().digest(data));
    }

    /**
     * Sigue las redirecciones de GitHub (dos, una con ruta relativa y otra absoluta) y en cada petición
     * solo dice que es Micelio: ni cookies ni otro User-Agent, y sin compresión de transporte.
     */
    @Test
    public void followsRedirectsAndSaysOnlyThatItIsMicelio() {
        byte[] manifest = "{\"format\":1}".getBytes(StandardCharsets.UTF_8);
        server.redirect("/latest/m.json", "/download/v1.6.2/m.json");
        server.redirect("/download/v1.6.2/m.json", server.url("/assets/m.json"));
        server.body("/assets/m.json", manifest);
        OtaService.Fetched fetched = downloader.fetch(server.url("/latest/m.json"), 1024, new OtaService.Cancel());
        assertEquals(200, fetched.status);
        assertArrayEquals(manifest, fetched.body);
        assertEquals(3, server.requests.size());
        for (String request : server.requests) {
            String lower = request.toLowerCase(Locale.ROOT);
            assertTrue(request, lower.contains("\r\nuser-agent: micelio\r\n"));
            assertTrue(request, lower.contains("\r\naccept-encoding: identity\r\n"));
            assertFalse(request, lower.contains("\r\ncookie:"));
        }
    }

    /**
     * Ni manda ni guarda las cookies del proceso. En la app siempre hay un CookieHandler por defecto
     * (CapacitorCookies.load() lo instala aunque el complemento esté apagado) que guarda cada Set-Cookie
     * en el almacén persistente del WebView y lo manda después: GitHub responde con `_octo`, un
     * identificador que dura un año. Lo que no es del actualizador sigue pasando por él.
     */
    @Test
    public void neitherSendsNorKeepsTheProcessCookies() throws Exception {
        CookieHandler before = CookieHandler.getDefault();
        CookieManager process = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        CookieHandler.setDefault(process);
        try {
            // Otra parte del proceso ya tiene una cookie de este servidor.
            server.setCookie = "_octo=GH1.1.123.456; Path=/";
            server.body("/otro", new byte[0]);
            assertFalse(otherGetSendsTheCookie());
            assertEquals("[_octo=GH1.1.123.456]", process.getCookieStore().getCookies().toString());

            server.setCookie = "_gh_sess=sesion; Path=/";
            byte[] zip = bytes(1000);
            server.redirect("/latest/m.json", server.url("/assets/m.json"));
            server.body("/assets/m.json", "{}".getBytes(StandardCharsets.UTF_8));
            server.redirect("/download/z.zip", server.url("/assets/z.zip"));
            server.body("/assets/z.zip", zip);
            server.requests.clear();
            assertEquals(200, downloader.fetch(server.url("/latest/m.json"), 1024, new OtaService.Cancel()).status);
            assertTrue("el resto del proceso sigue con sus cookies", otherGetSendsTheCookie());
            assertNull(downloader.download(server.url("/download/z.zip"), temp.newFile("download.tmp"), zip.length,
                    sha256(zip), new OtaService.Cancel()));
            assertTrue(otherGetSendsTheCookie());

            assertEquals(6, server.requests.size());
            for (String request : server.requests) {
                if (request.startsWith("GET /otro ")) continue;
                assertFalse(request, request.toLowerCase(Locale.ROOT).contains("\r\ncookie:"));
            }
            assertEquals("no guarda las que recibe", "[_octo=GH1.1.123.456]",
                    process.getCookieStore().getCookies().toString());
        } finally {
            CookieHandler.setDefault(before);
        }
    }

    /** Un GET que no es del actualizador, como el de otra parte del proceso: si llevó la cookie. */
    private boolean otherGetSendsTheCookie() throws IOException {
        int before = server.requests.size();
        HttpURLConnection connection = (HttpURLConnection) new URL(server.url("/otro")).openConnection();
        try {
            assertEquals(200, connection.getResponseCode());
        } finally {
            connection.disconnect();
        }
        return server.requests.get(before).contains("\r\nCookie: _octo=GH1.1.123.456\r\n");
    }

    /** Hasta cinco redirecciones; la sexta ya no se sigue y cuenta como sin respuesta. */
    @Test
    public void followsAtMostFiveRedirects() {
        for (int i = 0; i < 6; i++) server.redirect("/r" + i, "/r" + (i + 1));
        server.body("/r6", "{}".getBytes(StandardCharsets.UTF_8));
        assertEquals(200, downloader.fetch(server.url("/r1"), 1024, new OtaService.Cancel()).status);
        server.requests.clear();
        assertEquals(-1, downloader.fetch(server.url("/r0"), 1024, new OtaService.Cancel()).status);
        assertEquals(6, server.requests.size());
    }

    /** Un 404 o un 500 vuelven tal cual, sin cuerpo; una redirección a otro esquema no se sigue. */
    @Test
    public void statusCodesComeBackAsTheyAre() {
        assertEquals(404, downloader.fetch(server.url("/nada"), 1024, new OtaService.Cancel()).status);
        server.route("/error", 500, null, new byte[0], 0);
        OtaService.Fetched error = downloader.fetch(server.url("/error"), 1024, new OtaService.Cancel());
        assertEquals(500, error.status);
        assertNull(error.body);
        server.redirect("/ftp", "ftp://127.0.0.1/m.json");
        assertEquals(-1, downloader.fetch(server.url("/ftp"), 1024, new OtaService.Cancel()).status);
        server.redirect("/file", "file:///etc/passwd");
        assertEquals(-1, downloader.fetch(server.url("/file"), 1024, new OtaService.Cancel()).status);
        assertEquals(-1, downloader.fetch("file:///etc/passwd", 1024, new OtaService.Cancel()).status);
    }

    /** Nunca de HTTPS a HTTP; de HTTP a HTTPS, o entre servidores, sí. */
    @Test
    public void redirectsNeverGoFromHttpsToHttp() throws Exception {
        URL https = new URL("https://github.com/a");
        URL http = new URL("http://10.0.2.2:8787/a");
        assertFalse(OtaDownloader.isAllowedRedirect(https, new URL("http://github.com/b")));
        assertTrue(OtaDownloader.isAllowedRedirect(https, new URL("https://objects.githubusercontent.com/b")));
        assertTrue(OtaDownloader.isAllowedRedirect(http, new URL("http://10.0.2.2:8787/b")));
        assertTrue(OtaDownloader.isAllowedRedirect(http, https));
    }

    /** Un manifiesto más grande que el tope llega con un byte de más: quien lo lee sabe que no cabía. */
    @Test
    public void aBodyOverTheCapComesBackOneByteLonger() {
        server.route("/m.json", 200, null, bytes(5000), -1);
        OtaService.Fetched fetched = downloader.fetch(server.url("/m.json"), 100, new OtaService.Cancel());
        assertEquals(101, fetched.body.length);
    }

    /** Lo descargado es lo firmado, comprobado con su SHA-256 al vuelo. */
    @Test
    public void downloadsTheSignedBytes() throws Exception {
        byte[] zip = bytes(70_000);
        server.body("/z.zip", zip);
        File dest = temp.newFile("download.tmp");
        assertNull(downloader.download(server.url("/z.zip"), dest, zip.length, sha256(zip), new OtaService.Cancel()));
        assertArrayEquals(zip, Files.readAllBytes(dest.toPath()));
        assertEquals("sha256", downloader.download(server.url("/z.zip"), dest, zip.length, sha256(new byte[1]),
                new OtaService.Cancel()));
    }

    /**
     * Más de lo firmado se corta en el tamaño firmado, sin escribir un byte de más; si el servidor ya lo
     * anuncia, ni se empieza. Menos de lo firmado tampoco vale.
     */
    @Test
    public void neverWritesPastTheSignedSize() throws Exception {
        byte[] zip = bytes(200);
        byte[] signed = new byte[100];
        System.arraycopy(zip, 0, signed, 0, 100);
        File dest = new File(temp.getRoot(), "download.tmp");
        server.route("/sin-longitud.zip", 200, null, zip, -1);
        assertEquals("size", downloader.download(server.url("/sin-longitud.zip"), dest, 100, sha256(signed),
                new OtaService.Cancel()));
        assertTrue(dest.length() <= 100);

        assertTrue(dest.delete());
        server.body("/anunciado.zip", zip);
        assertEquals("size", downloader.download(server.url("/anunciado.zip"), dest, 100, sha256(signed),
                new OtaService.Cancel()));
        assertFalse(dest.exists());

        server.body("/corto.zip", signed);
        assertEquals("size", downloader.download(server.url("/corto.zip"), dest, 200, sha256(zip),
                new OtaService.Cancel()));
    }

    /** Sin respuesta, con otro código o cortada con «Usar ahora»: «network», y nada que usar. */
    @Test
    public void aFailedOrCutDownloadIsNetwork() throws Exception {
        File dest = new File(temp.getRoot(), "download.tmp");
        assertEquals("network", downloader.download(server.url("/nada.zip"), dest, 10, sha256(new byte[10]),
                new OtaService.Cancel()));
        OtaService.Cancel cancel = new OtaService.Cancel();
        cancel.cancel();
        server.body("/z.zip", bytes(10));
        assertEquals("network", downloader.download(server.url("/z.zip"), dest, 10, sha256(bytes(10)), cancel));
        // Sin respuesta: la conexión se cierra antes de la primera línea. No se prueba con el servidor
        // cerrado, porque en Linux su cierre se cruzaba con el accept() en curso y llegó a responder.
        server.hangUp("/corta.zip");
        assertEquals("network", downloader.download(server.url("/corta.zip"), dest, 10, sha256(bytes(10)),
                new OtaService.Cancel()));
        assertEquals(-1, downloader.fetch(server.url("/corta.zip"), 1024, new OtaService.Cancel()).status);
    }
}

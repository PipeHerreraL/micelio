package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.CRC32;
import java.util.zip.Deflater;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** El zip descargado, del lado de Java: los zips malignos de las fixtures dan el veredicto de `verifyZip` en Node. */
public class OtaZipTest {
    @Rule
    public final TemporaryFolder temp = new TemporaryFolder();

    private final List<File> synced = new ArrayList<>();
    private final OtaFiles.DirSync recorder = synced::add;

    /** Cada zip de las fixtures da el veredicto que espera Node; con uno malo, no queda nada en disco. */
    @Test
    public void everyFixtureZipGetsItsVerdict() throws Exception {
        List<Map<String, Object>> cases = Fixtures.cases("zips/cases.json");
        assertTrue(cases.size() > 20);
        for (Map<String, Object> item : cases) {
            String name = (String) item.get("name");
            OtaManifest.Payload payload = Fixtures.payload(OtaJson.asObject(item.get("payload")));
            File dest = new File(temp.getRoot(), "staging-" + name);
            String reason = OtaZip.extract(Fixtures.file("zips/" + item.get("zip")), payload, dest, recorder);
            assertEquals(name, item.get("verdict"), reason == null ? "ok" : reason);
            assertEquals(name, reason == null, dest.exists());
        }
    }

    /** Lo descomprimido es lo firmado, y cada carpeta pasa por fsync (los archivos, al escribirse). */
    @Test
    public void extractsTheSignedFilesAndSyncsEveryFolder() throws Exception {
        Map<String, Object> good = Fixtures.cases("zips/cases.json").get(0);
        OtaManifest.Payload payload = Fixtures.payload(OtaJson.asObject(good.get("payload")));
        File dest = new File(temp.getRoot(), "staging-1.6.2");
        assertNull(OtaZip.extract(Fixtures.file("zips/good.zip"), payload, dest, recorder));
        for (OtaManifest.FileEntry entry : payload.files) {
            File file = new File(dest, entry.path);
            assertEquals(entry.path, entry.size, file.length());
            assertEquals(entry.path, entry.sha256, OtaFiles.sha256Hex(file));
        }
        assertEquals(payload.files.size(), countFiles(dest));
        assertEquals(new HashSet<>(Arrays.asList(dest, new File(dest, "assets"), new File(dest, "icons"))),
                new HashSet<>(synced));
    }

    /**
     * Una bomba (31 MiB de ceros tras el index.html firmado) o un archivo con un byte de más se
     * cortan en el tamaño firmado: nunca se escribe un byte de más.
     */
    @Test
    public void aBombIsCutAtTheSignedSize() throws Exception {
        for (Map<String, Object> item : Fixtures.cases("zips/cases.json")) {
            if (!item.get("name").equals("bomb") && !item.get("name").equals("longer-file")) continue;
            OtaManifest.Payload payload = Fixtures.payload(OtaJson.asObject(item.get("payload")));
            OtaManifest.FileEntry want = null;
            for (OtaManifest.FileEntry entry : payload.files) if (entry.path.equals("index.html")) want = entry;
            try (RandomAccessFile file = new RandomAccessFile(Fixtures.file("zips/" + item.get("zip")), "r")) {
                OtaZip.Entry index = null;
                for (OtaZip.Entry entry : OtaZip.readEntries(file)) if ("index.html".equals(entry.name)) index = entry;
                CountingStream counter = new CountingStream();
                assertFalse((String) item.get("name"), OtaZip.copy(file, index, want, counter));
                assertTrue(item.get("name") + ": " + counter.count, counter.count <= want.size);
            }
        }
    }

    /** Un archivo guardado sin comprimir con un byte de más tampoco se escribe de más. */
    @Test
    public void aStoredEntryLongerThanSignedIsCut() throws Exception {
        byte[] content = "micelio micelio micelio micelio".getBytes(StandardCharsets.UTF_8);
        OtaManifest.FileEntry want = entry(content);
        File stored = temp.newFile("stored.bin");
        byte[] longer = Arrays.copyOf(content, content.length + 1);
        longer[content.length] = '!';
        Files.write(stored.toPath(), longer);
        try (RandomAccessFile file = new RandomAccessFile(stored, "r")) {
            CountingStream counter = new CountingStream();
            assertFalse(OtaZip.copy(file, new OtaZip.Entry("x", 0, 0, 0, content.length + 1), want, counter));
            assertTrue(String.valueOf(counter.count), counter.count <= content.length);
            assertTrue(OtaZip.copy(file, new OtaZip.Entry("x", 0, 0, 0, content.length), want, new CountingStream()));
        }
    }

    /**
     * Un deflate cortado antes de su final se rechaza aunque ya haya dado todos los bytes: Node dice
     * «unexpected end of file», y los dos lados tienen que dar el mismo veredicto.
     */
    @Test
    public void aDeflateStreamCutBeforeItsEndIsRejected() throws Exception {
        byte[] content = "micelio micelio micelio micelio".getBytes(StandardCharsets.UTF_8);
        Deflater deflater = new Deflater(9, true);
        deflater.setInput(content);
        byte[] buffer = new byte[256];
        // Un bloque con todo el contenido, cerrado con SYNC_FLUSH, y luego el bloque final vacío.
        int body = deflater.deflate(buffer, 0, buffer.length, Deflater.SYNC_FLUSH);
        deflater.finish();
        int total = body + deflater.deflate(buffer, body, buffer.length - body);
        deflater.end();
        File full = temp.newFile("full.bin");
        Files.write(full.toPath(), Arrays.copyOf(buffer, total));
        try (RandomAccessFile file = new RandomAccessFile(full, "r")) {
            assertTrue(OtaZip.copy(file, new OtaZip.Entry("x", 0, 8, 0, total), entry(content), new CountingStream()));
            CountingStream counter = new CountingStream();
            assertFalse(OtaZip.copy(file, new OtaZip.Entry("x", 0, 8, 0, body), entry(content), counter));
            assertEquals("lo cortado ya dio todos los bytes", content.length, counter.count);
        }
    }

    private static OtaManifest.FileEntry entry(byte[] content) {
        return new OtaManifest.FileEntry("x", content.length, OtaFiles.hex(OtaFiles.sha256().digest(content)));
    }

    /** Cuenta lo que se escribe, sin guardarlo. */
    private static final class CountingStream extends OutputStream {
        long count;

        @Override
        public void write(int b) {
            count++;
        }

        @Override
        public void write(byte[] b, int offset, int length) {
            count += length;
        }
    }

    /** Lo que había en la carpeta de destino (un corte a medias) se borra antes de descomprimir. */
    @Test
    public void clearsLeftoversInTheDestination() throws Exception {
        Map<String, Object> good = Fixtures.cases("zips/cases.json").get(0);
        OtaManifest.Payload payload = Fixtures.payload(OtaJson.asObject(good.get("payload")));
        File dest = new File(temp.getRoot(), "staging-1.6.2");
        assertTrue(new File(dest, "old").mkdirs());
        assertTrue(new File(dest, "old/stale.js").createNewFile());
        assertNull(OtaZip.extract(Fixtures.file("zips/good.zip"), payload, dest, recorder));
        assertFalse(new File(dest, "old").exists());
    }

    /** «a» y «a/b» no caben a la vez en disco: el zip se rechaza por sus rutas. */
    @Test
    public void aNameThatIsBothFileAndFolderIsRejected() throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<>();
        files.put("a", "x".getBytes(StandardCharsets.UTF_8));
        files.put("a/b", "y".getBytes(StandardCharsets.UTF_8));
        files.put("index.html", "<!doctype html>".getBytes(StandardCharsets.UTF_8));
        files.put("micelio-bundle.json", "{\"version\":\"1.6.2\",\"minNative\":1}".getBytes(StandardCharsets.UTF_8));
        File zip = temp.newFile("conflict.zip");
        Files.write(zip.toPath(), storedZip(files));
        File dest = new File(temp.getRoot(), "staging");
        assertEquals("zipPath", OtaZip.extract(zip, payloadOf(zip, files), dest, recorder));
        assertFalse(dest.exists());

        files.remove("a");
        Files.write(zip.toPath(), storedZip(files));
        assertNull(OtaZip.extract(zip, payloadOf(zip, files), dest, recorder));
    }

    /** Un fallo del disco (no se puede crear la carpeta, o su fsync) es «disk», y no deja nada a medias. */
    @Test
    public void diskFailuresAreReportedAsDisk() throws Exception {
        Map<String, Object> good = Fixtures.cases("zips/cases.json").get(0);
        OtaManifest.Payload payload = Fixtures.payload(OtaJson.asObject(good.get("payload")));
        File blocker = temp.newFile("blocker");
        assertEquals("disk", OtaZip.extract(Fixtures.file("zips/good.zip"), payload, new File(blocker, "x"), recorder));

        File dest = new File(temp.getRoot(), "staging");
        OtaFiles.DirSync failing = dir -> {
            throw new IOException("fsync");
        };
        assertEquals("disk", OtaZip.extract(Fixtures.file("zips/good.zip"), payload, dest, failing));
        assertFalse(dest.exists());
    }

    /** Los nombres que ninguna entrada puede tener, para que nada se escriba fuera de su carpeta. */
    @Test
    public void safeNamesStayInsideTheFolder() {
        for (String name : new String[] {"index.html", "assets/index.js", "a/b/c.png", "..a", "a..", ".vite"}) {
            assertTrue(name, OtaZip.isSafeEntryName(name));
        }
        for (String name : new String[] {
            "", "/a", "a/", "a//b", "./a", "a/./b", "../a", "a/..", "a/../b", "a\\b", "\\a", "a\0b", ".", ".."
        }) {
            assertFalse(name, OtaZip.isSafeEntryName(name));
        }
    }

    private static int countFiles(File dir) {
        int count = 0;
        for (File child : dir.listFiles()) count += child.isDirectory() ? countFiles(child) : 1;
        return count;
    }

    private static OtaManifest.Payload payloadOf(File zip, Map<String, byte[]> files) throws IOException {
        List<OtaManifest.FileEntry> entries = new ArrayList<>();
        long unpacked = 0;
        for (Map.Entry<String, byte[]> file : files.entrySet()) {
            entries.add(new OtaManifest.FileEntry(file.getKey(), file.getValue().length,
                    OtaFiles.hex(OtaFiles.sha256().digest(file.getValue()))));
            unpacked += file.getValue().length;
        }
        return new OtaManifest.Payload(Fixtures.APP_ID, "stable", "1.6.2", 1, Fixtures.URL_PREFIX + "v1.6.2/x.zip",
                zip.length(), OtaFiles.sha256Hex(zip), unpacked, Collections.unmodifiableList(entries));
    }

    /** Un zip mínimo, sin comprimir, con las entradas en ese orden (las fixtures no tienen este caso). */
    private static byte[] storedZip(Map<String, byte[]> files) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ByteArrayOutputStream directory = new ByteArrayOutputStream();
        for (Map.Entry<String, byte[]> file : files.entrySet()) {
            byte[] name = file.getKey().getBytes(StandardCharsets.UTF_8);
            byte[] data = file.getValue();
            CRC32 crc = new CRC32();
            crc.update(data);
            int offset = out.size();
            out.write(header(30, 0x04034b50, 20, 0x0800, 0, (int) crc.getValue(), data.length, name.length, -1));
            out.write(name);
            out.write(data);
            int crcValue = (int) crc.getValue();
            directory.write(header(46, 0x02014b50, 20, 0x0800, 0, crcValue, data.length, name.length, offset));
            directory.write(name);
        }
        int start = out.size();
        out.write(directory.toByteArray());
        ByteBuffer end = ByteBuffer.allocate(22).order(ByteOrder.LITTLE_ENDIAN);
        end.putInt(0x06054b50).putShort((short) 0).putShort((short) 0);
        end.putShort((short) files.size()).putShort((short) files.size());
        end.putInt(directory.size()).putInt(start).putShort((short) 0);
        out.write(end.array());
        return out.toByteArray();
    }

    /** La cabecera local (30 bytes) o la del directorio central (46), con los campos que usa la app. */
    private static byte[] header(int length, int signature, int version, int flags, int method, int crc, int size,
            int nameLength, int offset) {
        ByteBuffer header = ByteBuffer.allocate(length).order(ByteOrder.LITTLE_ENDIAN);
        header.putInt(signature).putShort((short) version);
        if (length == 46) header.putShort((short) version);
        header.putShort((short) flags).putShort((short) method).putInt(0).putInt(crc).putInt(size).putInt(size);
        header.putShort((short) nameLength).putShort((short) 0);
        if (length == 46) header.putShort((short) 0).putShort((short) 0).putShort((short) 0).putInt(0).putInt(offset);
        return header.array();
    }
}

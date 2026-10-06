package io.github.pipeherreral.micelio.ota;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;

/**
 * Comprueba un zip descargado contra su payload, ya verificado, y lo descomprime: lo que
 * `verifyZip` en scripts/ota-pack.ts, en el mismo orden y con los mismos motivos, sobre las mismas
 * fixtures (tests/fixtures/ota/zips/):
 *
 *   1. Mide `size` (`size`) y su SHA-256 es `sha256` (`sha256`).
 *   2. Se lee del directorio central (si no se puede, `files`), con como mucho 1000 entradas (`size`).
 *   3. Cada nombre es UTF-8, seguro y no se repite (`zipPath`).
 *   4. Los nombres son exactamente los de `files`, y cada archivo, sin cifrar, guardado o con deflate,
 *      da su tamaño y su SHA-256 contados al escribirlo, sin fiarse de las cabeceras (`files`). Nunca
 *      se escribe un byte más de lo firmado: una bomba se corta ahí.
 *   5. `index.html` y `micelio-bundle.json` están en la raíz, y este dice la `version` y el
 *      `minNative` del payload (`bundle`).
 *
 * Además, lo que solo existe en disco: cada ruta canónica queda dentro del destino (`zipPath`), y
 * `fsync` de cada archivo y de cada carpeta (`disk`, como cualquier fallo de E/S).
 *
 * Descartado `java.util.zip.ZipFile`: cambia entre versiones de Android (Android 14 ya rechaza `..`
 * con su propia excepción, y cómo trata un nombre repetido depende de la versión), y el motivo
 * tiene que ser el mismo en todos los teléfonos y en las pruebas.
 */
final class OtaZip {
    static final String BUNDLE_INFO = "micelio-bundle.json";
    private static final int LOCAL_HEADER = 0x04034b50;
    private static final int CENTRAL_HEADER = 0x02014b50;
    private static final int END_OF_CENTRAL = 0x06054b50;
    private static final int ENCRYPTED_FLAG = 0x0001;
    // micelio-bundle.json mide unos 30 bytes; el tope solo acota la memoria.
    private static final int MAX_BUNDLE_INFO_BYTES = 64 * 1024;

    private OtaZip() {}

    static final class Entry {
        /** null si el nombre no es UTF-8 válido. */
        final String name;
        final int flags;
        final int method;
        final long dataStart;
        final long compressedSize;

        Entry(String name, int flags, int method, long dataStart, long compressedSize) {
            this.name = name;
            this.flags = flags;
            this.method = method;
            this.dataStart = dataStart;
            this.compressedSize = compressedSize;
        }
    }

    /**
     * Un nombre que la app acepta: relativo, sin `\` ni NUL y sin componentes vacíos, `.` ni `..`.
     * Así ninguna entrada escribe fuera de su carpeta, tampoco en un teléfono anterior a Android 14.
     */
    static boolean isSafeEntryName(String name) {
        if (name.indexOf('\\') >= 0 || name.indexOf('\0') >= 0) return false;
        // -1: split no descarta los componentes vacíos del final («a/»).
        for (String part : name.split("/", -1)) {
            if (part.isEmpty() || part.equals(".") || part.equals("..")) return false;
        }
        return true;
    }

    /**
     * Comprueba `zip` y lo descomprime en `dest`, que se vacía antes. Devuelve null si vale, o el
     * motivo; con un motivo, `dest` queda borrado.
     */
    static String extract(File zip, OtaManifest.Payload payload, File dest, OtaFiles.DirSync dirSync) {
        OtaFiles.deleteTree(dest);
        String reason;
        try {
            reason = extractInto(zip, payload, dest, dirSync);
        } catch (IOException e) {
            reason = "disk";
        }
        if (reason != null) OtaFiles.deleteTree(dest);
        return reason;
    }

    private static String extractInto(File zip, OtaManifest.Payload payload, File dest, OtaFiles.DirSync dirSync)
            throws IOException {
        if (zip.length() != payload.size) return "size";
        if (!OtaFiles.sha256Hex(zip).equals(payload.sha256)) return "sha256";
        try (RandomAccessFile file = new RandomAccessFile(zip, "r")) {
            List<Entry> entries = readEntries(file);
            if (entries == null) return "files";
            if (entries.size() > OtaManifest.MAX_FILES) return "size";
            Set<String> seen = new HashSet<>();
            for (Entry entry : entries) {
                if (entry.name == null || !isSafeEntryName(entry.name) || !seen.add(entry.name)) return "zipPath";
            }
            Map<String, OtaManifest.FileEntry> expected = new HashMap<>();
            for (OtaManifest.FileEntry want : payload.files) expected.put(want.path, want);
            if (entries.size() != payload.files.size()) return "files";

            if (!dest.mkdirs()) throw new IOException("No se pudo crear " + dest);
            String root = dest.getCanonicalPath() + File.separator;
            Set<File> dirs = new LinkedHashSet<>();
            dirs.add(dest);
            for (Entry entry : entries) {
                OtaManifest.FileEntry want = expected.get(entry.name);
                if (want == null || (entry.flags & ENCRYPTED_FLAG) != 0) return "files";
                if (entry.method != 0 && entry.method != 8) return "files";
                File target = new File(dest, entry.name);
                if (!target.getCanonicalPath().startsWith(root)) return "zipPath";
                File parent = target.getParentFile();
                // «a» y «a/b» a la vez: un nombre es archivo y carpeta, y no cabe en disco.
                if (!parent.isDirectory() && !parent.mkdirs()) return "zipPath";
                for (File dir = parent; !dir.equals(dest); dir = dir.getParentFile()) dirs.add(dir);
                try (FileOutputStream out = new FileOutputStream(target)) {
                    if (!copy(file, entry, want, out)) return "files";
                    out.getFD().sync();
                }
            }

            if (!expected.containsKey("index.html") || !expected.containsKey(BUNDLE_INFO)) return "bundle";
            Map<String, Object> info = readBundleInfo(dest);
            if (info == null || !payload.version.equals(info.get("version"))
                    || OtaJson.asCount(info.get("minNative"), 1) != payload.minNative) {
                return "bundle";
            }
            // Cada archivo ya pasó por fsync al escribirse; faltan las carpetas que los nombran.
            for (File dir : dirs) dirSync.sync(dir);
            return null;
        }
    }

    /** El micelio-bundle.json de una carpeta (`version` y `minNative`), o null si no se puede leer. */
    static Map<String, Object> readBundleInfo(File folder) {
        try {
            byte[] data = OtaFiles.readAll(new File(folder, BUNDLE_INFO), MAX_BUNDLE_INFO_BYTES);
            return data == null ? null : OtaJson.asObject(OtaJson.parse(data));
        } catch (IOException | OtaJson.Invalid e) {
            return null;
        }
    }

    /**
     * Escribe una entrada contando tamaño y SHA-256; false si no es la firmada o sus datos están
     * rotos. Nunca escribe más de `want.size` bytes.
     */
    static boolean copy(RandomAccessFile file, Entry entry, OtaManifest.FileEntry want, OutputStream out)
            throws IOException {
        MessageDigest digest = OtaFiles.sha256();
        byte[] input = new byte[64 * 1024];
        byte[] output = new byte[64 * 1024];
        long written = 0;
        long remaining = entry.compressedSize;
        file.seek(entry.dataStart);
        if (entry.method == 0) {
            if (remaining != want.size) return false;
            while (remaining > 0) {
                int n = (int) Math.min(input.length, remaining);
                file.readFully(input, 0, n);
                remaining -= n;
                out.write(input, 0, n);
                digest.update(input, 0, n);
                written += n;
            }
        } else {
            Inflater inflater = new Inflater(true);
            try {
                while (!inflater.finished()) {
                    if (inflater.needsInput()) {
                        // Cortado antes del final del deflate: Node dice «unexpected end of file».
                        if (remaining == 0) return false;
                        int n = (int) Math.min(input.length, remaining);
                        file.readFully(input, 0, n);
                        remaining -= n;
                        inflater.setInput(input, 0, n);
                    }
                    int n;
                    try {
                        n = inflater.inflate(output);
                    } catch (DataFormatException e) {
                        return false;
                    }
                    // Sin salida, sin pedir datos y sin acabar: un diccionario, que un zip no lleva.
                    if (n == 0 && !inflater.needsInput() && !inflater.finished()) return false;
                    written += n;
                    if (written > want.size) return false;
                    out.write(output, 0, n);
                    digest.update(output, 0, n);
                }
                // Lo que sigue al final del deflate se ignora, como en Node.
            } finally {
                inflater.end();
            }
        }
        return written == want.size && OtaFiles.hex(digest.digest()).equals(want.sha256);
    }

    /** Las entradas del directorio central, o null si no se puede leer (`readZip` en Node). */
    static List<Entry> readEntries(RandomAccessFile file) throws IOException {
        long length = file.length();
        if (length < 22) return null;
        // El final del directorio central lleva detrás un comentario de hasta 65535 bytes.
        int tailLength = (int) Math.min(length, 22 + 0xffff);
        byte[] tail = new byte[tailLength];
        file.seek(length - tailLength);
        file.readFully(tail);
        int end = -1;
        for (int at = tailLength - 22; at >= 0; at--) {
            if (u32(tail, at) == END_OF_CENTRAL && at + 22 + u16(tail, at + 20) == tailLength) {
                end = at;
                break;
            }
        }
        if (end < 0) return null;
        long endOffset = length - tailLength + end;
        int count = u16(tail, end + 10);
        long size = u32(tail, end + 12);
        long start = u32(tail, end + 16);
        if (u16(tail, end + 4) != 0 || u16(tail, end + 6) != 0) return null;
        if (u16(tail, end + 8) != count || start + size > endOffset) return null;

        byte[] directory = new byte[(int) size];
        file.seek(start);
        file.readFully(directory);
        byte[] local = new byte[30];
        List<Entry> entries = new ArrayList<>(count);
        int at = 0;
        for (int i = 0; i < count; i++) {
            if (at + 46 > size || u32(directory, at) != CENTRAL_HEADER) return null;
            int nameLength = u16(directory, at + 28);
            long next = (long) at + 46 + nameLength + u16(directory, at + 30) + u16(directory, at + 32);
            long compressedSize = u32(directory, at + 20);
            long localOffset = u32(directory, at + 42);
            if (next > size || localOffset + 30 > start) return null;
            file.seek(localOffset);
            file.readFully(local);
            if (u32(local, 0) != LOCAL_HEADER) return null;
            long dataStart = localOffset + 30 + u16(local, 26) + u16(local, 28);
            if (dataStart + compressedSize > start) return null;
            String name = utf8(directory, at + 46, nameLength);
            entries.add(new Entry(name, u16(directory, at + 8), u16(directory, at + 10), dataStart, compressedSize));
            at = (int) next;
        }
        return at == size ? entries : null;
    }

    private static String utf8(byte[] data, int offset, int length) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(data, offset, length))
                    .toString();
        } catch (CharacterCodingException e) {
            return null;
        }
    }

    private static int u16(byte[] data, int at) {
        return (data[at] & 0xff) | (data[at + 1] & 0xff) << 8;
    }

    private static long u32(byte[] data, int at) {
        return u16(data, at) | (long) u16(data, at + 2) << 16;
    }
}

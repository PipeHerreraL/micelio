package io.github.pipeherreral.micelio.ota;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * El estado del actualizador, `getNoBackupFilesDir()/ota/state.json` (ARCHITECTURE.md §4.34): qué
 * paquete está confirmado (`active`), cuál espera a probarse (`pending`), qué versiones fallaron, el
 * aviso que el JS aún no mostró y cuándo se buscó por última vez.
 *
 * La lectura es tolerante: un campo que falta o no tiene su tipo toma su valor por defecto (un
 * paquete mal anotado se olvida, y su carpeta se recoge como resto), uno que sobra se ignora y un
 * JSON ilegible cuenta como vacío. Un `schema` mayor lo escribió un Java más nuevo (se instaló un
 * .apk más viejo encima): el estado queda {@link #foreign} y nadie lo pisa.
 */
final class OtaState {
    static final int SCHEMA = 1;

    // Avisos para el JS (`notice.kind`).
    static final String NOTICE_UPDATED = "updated";
    static final String NOTICE_ROLLED_BACK = "rolledBack";
    static final String NOTICE_SAVE_REJECTED = "saveRejected";
    static final String NOTICE_NEEDS_APK = "needsApk";
    static final String NOTICE_NEEDS_APK_FORMAT = "needsApkFormat";

    // Por qué falló una versión a prueba (`failed[].reason`).
    static final String FAILED_TIMEOUT = "timeout";
    static final String FAILED_ERROR = "error";
    static final String FAILED_SAVE = "save";
    static final String FAILED_RENDER = "render";

    /** Un paquete descomprimido en `bundles/<version>/`, con lo que se verificó al bajarlo. */
    static final class Bundle {
        final String version;
        /** Las claves cuya firma verificó: si el .apk retira una, el paquete se descarta. */
        final List<String> keyIds;
        /** El SHA-256 del zip del que salió. */
        final String sha256;
        final List<OtaManifest.FileEntry> files;
        /** Arranques que lo sirvieron a prueba (solo el pendiente). */
        final int attempts;
        /** Arranques seguidos que lo sirvieron sin `ready()` (solo el activo). */
        final int bootsWithoutReady;

        Bundle(String version, List<String> keyIds, String sha256, List<OtaManifest.FileEntry> files, int attempts,
                int bootsWithoutReady) {
            this.version = version;
            this.keyIds = Collections.unmodifiableList(new ArrayList<>(keyIds));
            this.sha256 = sha256;
            this.files = Collections.unmodifiableList(new ArrayList<>(files));
            this.attempts = attempts;
            this.bootsWithoutReady = bootsWithoutReady;
        }

        static Bundle of(OtaManifest.Payload payload, List<String> keyIds) {
            return new Bundle(payload.version, keyIds, payload.sha256, payload.files, 0, 0);
        }

        Bundle withAttempts(int value) {
            return new Bundle(version, keyIds, sha256, files, value, bootsWithoutReady);
        }

        Bundle withBootsWithoutReady(int value) {
            return new Bundle(version, keyIds, sha256, files, attempts, value);
        }
    }

    static final class Failure {
        final String version;
        final String reason;

        Failure(String version, String reason) {
            this.version = version;
            this.reason = reason;
        }
    }

    static final class Notice {
        final String kind;
        /** "" con `needsApkFormat`, que no es de una versión. */
        final String version;

        Notice(String kind, String version) {
            this.kind = kind;
            this.version = version;
        }
    }

    /** Lo escribió un Java más nuevo: se sirve el integrado y no se escribe nada. */
    boolean foreign;
    Bundle active;
    Bundle pending;
    final List<Failure> failed = new ArrayList<>();
    Notice notice;
    /** Versiones cuyo aviso `needsApk` ya se dio: una vez por versión. */
    final List<String> needsApkShown = new ArrayList<>();
    /** La última respuesta del servidor (200 o 404). */
    OtaClock.Stamp lastCheck;
    /** El último fallo al pedir el manifiesto desde esa respuesta: se reintenta 10 min después. */
    OtaClock.Stamp failedCheck;
    /** Busca en cada vuelta al primer plano: el activo dejó de arrancar con sus archivos intactos. */
    boolean checkEveryBoot;
    /** El motivo del último rechazo o fallo, para las pruebas y logcat. */
    String lastError;

    OtaState copy() {
        OtaState copy = new OtaState();
        copy.foreign = foreign;
        copy.active = active;
        copy.pending = pending;
        copy.failed.addAll(failed);
        copy.notice = notice;
        copy.needsApkShown.addAll(needsApkShown);
        copy.lastCheck = lastCheck;
        copy.failedCheck = failedCheck;
        copy.checkEveryBoot = checkEveryBoot;
        copy.lastError = lastError;
        return copy;
    }

    boolean hasFailed(String version) {
        for (Failure failure : failed) {
            if (failure.version.equals(version)) return true;
        }
        return false;
    }

    /**
     * Olvida las versiones fallidas y los avisos de .apk de versiones que no pasan de la base: ningún
     * manifiesto las puede ofrecer (tienen que ser mayores que ella), así que las listas no crecen
     * sin fin.
     */
    void forgetUpTo(String base) {
        for (int i = failed.size() - 1; i >= 0; i--) {
            if (OtaVersion.compare(failed.get(i).version, base) <= 0) failed.remove(i);
        }
        for (int i = needsApkShown.size() - 1; i >= 0; i--) {
            if (OtaVersion.compare(needsApkShown.get(i), base) <= 0) needsApkShown.remove(i);
        }
    }

    static OtaState parse(byte[] json) {
        OtaState state = new OtaState();
        Map<String, Object> root;
        try {
            root = OtaJson.asObject(OtaJson.parse(json));
        } catch (OtaJson.Invalid e) {
            return state;
        }
        if (root == null) return state;
        if (OtaJson.asCount(root.get("schema"), 1) > SCHEMA) {
            state.foreign = true;
            return state;
        }
        state.active = bundle(root.get("active"));
        state.pending = bundle(root.get("pending"));
        for (Object item : list(root.get("failed"))) {
            Map<String, Object> failure = OtaJson.asObject(item);
            if (failure == null) continue;
            String version = OtaJson.asString(failure.get("version"));
            String reason = OtaJson.asString(failure.get("reason"));
            if (OtaVersion.isValid(version) && reason != null) state.failed.add(new Failure(version, reason));
        }
        Map<String, Object> notice = OtaJson.asObject(root.get("notice"));
        if (notice != null) {
            String kind = OtaJson.asString(notice.get("kind"));
            String version = OtaJson.asString(notice.get("version"));
            if (kind != null && !kind.isEmpty() && version != null) state.notice = new Notice(kind, version);
        }
        for (Object item : list(root.get("needsApkShown"))) {
            String version = OtaJson.asString(item);
            if (OtaVersion.isValid(version)) state.needsApkShown.add(version);
        }
        state.lastCheck = stamp(root.get("lastCheck"));
        state.failedCheck = stamp(root.get("failedCheck"));
        state.checkEveryBoot = Boolean.TRUE.equals(root.get("checkEveryBoot"));
        state.lastError = OtaJson.asString(root.get("lastError"));
        return state;
    }

    byte[] toJson() {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("schema", SCHEMA);
        root.put("active", active == null ? null : bundleJson(active, "bootsWithoutReady", active.bootsWithoutReady));
        root.put("pending", pending == null ? null : bundleJson(pending, "attempts", pending.attempts));
        List<Object> failures = new ArrayList<>();
        for (Failure failure : failed) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("version", failure.version);
            item.put("reason", failure.reason);
            failures.add(item);
        }
        root.put("failed", failures);
        if (notice == null) {
            root.put("notice", null);
        } else {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("kind", notice.kind);
            item.put("version", notice.version);
            root.put("notice", item);
        }
        root.put("needsApkShown", new ArrayList<Object>(needsApkShown));
        root.put("lastCheck", stampJson(lastCheck));
        root.put("failedCheck", stampJson(failedCheck));
        root.put("checkEveryBoot", checkEveryBoot);
        root.put("lastError", lastError);
        return (OtaJson.write(root) + "\n").getBytes(StandardCharsets.UTF_8);
    }

    private static List<Object> list(Object value) {
        List<Object> list = OtaJson.asArray(value);
        return list == null ? Collections.emptyList() : list;
    }

    private static Bundle bundle(Object value) {
        Map<String, Object> bundle = OtaJson.asObject(value);
        if (bundle == null) return null;
        String version = OtaJson.asString(bundle.get("version"));
        String sha256 = OtaJson.asString(bundle.get("sha256"));
        List<Object> keyItems = OtaJson.asArray(bundle.get("keyIds"));
        List<Object> fileItems = OtaJson.asArray(bundle.get("files"));
        if (!OtaVersion.isValid(version) || !OtaManifest.isSha256(sha256) || keyItems == null || fileItems == null) {
            return null;
        }
        List<String> keyIds = new ArrayList<>();
        for (Object item : keyItems) {
            String keyId = OtaJson.asString(item);
            if (keyId == null) return null;
            keyIds.add(keyId);
        }
        List<OtaManifest.FileEntry> files = new ArrayList<>();
        for (Object item : fileItems) {
            OtaManifest.FileEntry entry = OtaManifest.FileEntry.parse(item);
            if (entry == null) return null;
            files.add(entry);
        }
        return new Bundle(version, keyIds, sha256, files, count(bundle.get("attempts")),
                count(bundle.get("bootsWithoutReady")));
    }

    private static int count(Object value) {
        return (int) Math.min(Integer.MAX_VALUE, Math.max(0, OtaJson.asCount(value, 0)));
    }

    private static Map<String, Object> bundleJson(Bundle bundle, String counter, int value) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", bundle.version);
        out.put("keyIds", new ArrayList<Object>(bundle.keyIds));
        out.put("sha256", bundle.sha256);
        List<Object> files = new ArrayList<>();
        for (OtaManifest.FileEntry entry : bundle.files) files.add(entry.toJson());
        out.put("files", files);
        out.put(counter, value);
        return out;
    }

    private static OtaClock.Stamp stamp(Object value) {
        Map<String, Object> stamp = OtaJson.asObject(value);
        if (stamp == null) return null;
        Long wall = OtaJson.asInteger(stamp.get("wall"));
        Long elapsed = OtaJson.asInteger(stamp.get("elapsed"));
        Long bootCount = OtaJson.asInteger(stamp.get("bootCount"));
        if (wall == null || elapsed == null || bootCount == null) return null;
        return new OtaClock.Stamp(wall, elapsed, bootCount);
    }

    private static Map<String, Object> stampJson(OtaClock.Stamp stamp) {
        if (stamp == null) return null;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("wall", stamp.wall);
        out.put("elapsed", stamp.elapsed);
        out.put("bootCount", stamp.bootCount);
        return out;
    }
}

package io.github.pipeherreral.micelio.ota;

/**
 * Base64 estándar (RFC 4648 §4), con relleno y solo en su forma canónica: lo que `strictBase64` en
 * scripts/ota-manifest.ts. Propio porque `java.util.Base64` es de la API 26 y la app arranca en la
 * 24, y `android.util.Base64` no existe en las pruebas locales (es un esqueleto vacío).
 */
final class OtaBase64 {
    private OtaBase64() {}

    /** Los bytes, o null si el texto no es base64 canónico (un carácter de más, sin relleno, base64url…). */
    static byte[] decode(String text) {
        int length = text.length();
        if (length % 4 != 0) return null;
        int padding = 0;
        if (length > 0 && text.charAt(length - 1) == '=') padding = text.charAt(length - 2) == '=' ? 2 : 1;
        byte[] out = new byte[length / 4 * 3 - padding];
        int bits = 0;
        int count = 0;
        int written = 0;
        for (int i = 0; i < length - padding; i++) {
            int value = valueOf(text.charAt(i));
            if (value < 0) return null;
            bits = (bits << 6) | value;
            count += 6;
            if (count >= 8) {
                count -= 8;
                out[written++] = (byte) (bits >>> count);
                bits &= (1 << count) - 1;
            }
        }
        // Los bits que sobran antes del relleno van a 0: si no, otros textos darían los mismos bytes
        // (un decodificador indulgente, como el de Node, los ignora).
        return bits == 0 ? out : null;
    }

    private static int valueOf(char c) {
        if (c >= 'A' && c <= 'Z') return c - 'A';
        if (c >= 'a' && c <= 'z') return c - 'a' + 26;
        if (c >= '0' && c <= '9') return c - '0' + 52;
        if (c == '+') return 62;
        if (c == '/') return 63;
        return -1;
    }
}

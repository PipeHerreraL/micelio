package io.github.pipeherreral.micelio.ota;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * La versión de un paquete: `X.Y.Z` sin ceros a la izquierda (una versión es un solo texto, que
 * también nombra su carpeta), con menor y parche hasta 99 como el versionCode de
 * android/app/build.gradle, y la mayor hasta nueve cifras, que caben en un int. La misma regla que
 * `parseOtaVersion` en scripts/ota-manifest.ts, y el mismo orden que `compareGameVersions`
 * (src/version.ts): los dos lados comprueban tests/fixtures/ota/versions.json.
 */
final class OtaVersion {
    // `[0-9]` y no `\d`: solo cifras ASCII. Con matches(), el texto entero, sin un salto final.
    private static final Pattern FORM =
            Pattern.compile("(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]?)\\.(0|[1-9][0-9]?)");

    private OtaVersion() {}

    /** [mayor, menor, parche], o null si no tiene esa forma exacta. */
    static int[] parse(String text) {
        if (text == null) return null;
        Matcher match = FORM.matcher(text);
        if (!match.matches()) return null;
        return new int[] {
            Integer.parseInt(match.group(1)), Integer.parseInt(match.group(2)), Integer.parseInt(match.group(3))
        };
    }

    static boolean isValid(String text) {
        return parse(text) != null;
    }

    /** Negativo si `a` es anterior, positivo si es posterior. Las dos deben ser válidas: lanza si no. */
    static int compare(String a, String b) {
        int[] left = parse(a);
        int[] right = parse(b);
        if (left == null || right == null) {
            throw new IllegalArgumentException("Versión no válida: " + (left == null ? a : b));
        }
        for (int i = 0; i < 3; i++) {
            if (left[i] != right[i]) return Integer.compare(left[i], right[i]);
        }
        return 0;
    }
}

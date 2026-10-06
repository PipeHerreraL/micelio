package io.github.pipeherreral.micelio.ota;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JSON estricto (RFC 8259), como `JSON.parse` en Node: el manifiesto, el payload firmado,
 * micelio-bundle.json, la configuración y el estado se leen aquí igual que en
 * scripts/ota-manifest.ts, y las fixtures compartidas dan el mismo veredicto en los dos lados.
 *
 * Descartado org.json: el de Android acepta lo que Node rechaza (comentarios, comillas simples,
 * texto sin comillas), su recursión no tiene tope (64 KiB de `[` en un manifiesto agotan la pila) y
 * en las pruebas locales es otra implementación que la del teléfono.
 *
 * Objetos: LinkedHashMap (con una clave repetida gana la última, como en JS); listas: ArrayList;
 * números: Double (como en JS, que es lo que compara `Number.isSafeInteger`); null: {@link #NULL}.
 */
final class OtaJson {
    /** El estado es lo más hondo que se lee (4 niveles); el tope solo corta un manifiesto malicioso. */
    static final int MAX_DEPTH = 32;
    // 2^53 − 1: el mayor entero que un double guarda sin perder unidades (Number.MAX_SAFE_INTEGER).
    private static final double MAX_SAFE_INTEGER = 9007199254740991.0;
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    static final Object NULL = new Object() {
        @Override
        public String toString() {
            return "null";
        }
    };

    static final class Invalid extends Exception {
        Invalid() {
            super("JSON no válido");
        }
    }

    private OtaJson() {}

    /** UTF-8 estricto: un byte mal formado no es JSON. Un BOM delante tampoco, como en Node. */
    static Object parse(byte[] utf8) throws Invalid {
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(utf8))
                    .toString();
        } catch (CharacterCodingException e) {
            throw new Invalid();
        }
        return parse(text);
    }

    static Object parse(String text) throws Invalid {
        Parser parser = new Parser(text);
        parser.skipSpace();
        Object value = parser.value(0);
        parser.skipSpace();
        if (parser.at != text.length()) throw new Invalid();
        return value;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> asObject(Object value) {
        return value instanceof Map ? (Map<String, Object>) value : null;
    }

    @SuppressWarnings("unchecked")
    static List<Object> asArray(Object value) {
        return value instanceof List ? (List<Object>) value : null;
    }

    static String asString(Object value) {
        return value instanceof String ? (String) value : null;
    }

    /** El valor de un número entero seguro (`Number.isSafeInteger`), o null si no lo es. */
    static Long asInteger(Object value) {
        if (!(value instanceof Double)) return null;
        double number = (Double) value;
        if (number != Math.rint(number) || Math.abs(number) > MAX_SAFE_INTEGER) return null;
        return (long) number;
    }

    /** Un entero seguro y ≥ min (min ≥ 0), o -1: lo que `isCount` en scripts/ota-manifest.ts. */
    static long asCount(Object value, long min) {
        Long number = asInteger(value);
        return number == null || number < min ? -1 : number;
    }

    /** JSON compacto de mapas, listas, textos, enteros, booleanos y null: lo que escribe el estado. */
    static String write(Object value) {
        StringBuilder out = new StringBuilder();
        write(out, value);
        return out.toString();
    }

    private static void write(StringBuilder out, Object value) {
        if (value == null || value == NULL) {
            out.append("null");
        } else if (value instanceof String) {
            quote(out, (String) value);
        } else if (value instanceof Boolean || value instanceof Integer || value instanceof Long) {
            out.append(value);
        } else if (value instanceof Map) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                if (!first) out.append(',');
                first = false;
                quote(out, (String) entry.getKey());
                out.append(':');
                write(out, entry.getValue());
            }
            out.append('}');
        } else if (value instanceof List) {
            out.append('[');
            boolean first = true;
            for (Object item : (List<?>) value) {
                if (!first) out.append(',');
                first = false;
                write(out, item);
            }
            out.append(']');
        } else {
            throw new IllegalArgumentException("No se escribe en JSON: " + value.getClass());
        }
    }

    private static void quote(StringBuilder out, String text) {
        out.append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"' || c == '\\') {
                out.append('\\').append(c);
            } else if (c < 0x20) {
                out.append("\\u00").append(HEX[c >> 4]).append(HEX[c & 0xf]);
            } else {
                out.append(c);
            }
        }
        out.append('"');
    }

    private static final class Parser {
        private final String text;
        int at;

        Parser(String text) {
            this.text = text;
        }

        void skipSpace() {
            while (at < text.length()) {
                char c = text.charAt(at);
                if (c != ' ' && c != '\t' && c != '\n' && c != '\r') return;
                at++;
            }
        }

        private char peek() throws Invalid {
            if (at >= text.length()) throw new Invalid();
            return text.charAt(at);
        }

        private char next() throws Invalid {
            char c = peek();
            at++;
            return c;
        }

        private boolean isDigit() {
            return at < text.length() && text.charAt(at) >= '0' && text.charAt(at) <= '9';
        }

        Object value(int depth) throws Invalid {
            if (depth > MAX_DEPTH) throw new Invalid();
            switch (peek()) {
                case '{':
                    return object(depth + 1);
                case '[':
                    return array(depth + 1);
                case '"':
                    return string();
                case 't':
                    return literal("true", Boolean.TRUE);
                case 'f':
                    return literal("false", Boolean.FALSE);
                case 'n':
                    return literal("null", NULL);
                default:
                    return number();
            }
        }

        private Map<String, Object> object(int depth) throws Invalid {
            at++;
            Map<String, Object> object = new LinkedHashMap<>();
            skipSpace();
            if (peek() == '}') {
                at++;
                return object;
            }
            while (true) {
                skipSpace();
                if (peek() != '"') throw new Invalid();
                String key = string();
                skipSpace();
                if (next() != ':') throw new Invalid();
                skipSpace();
                object.put(key, value(depth));
                skipSpace();
                char c = next();
                if (c == '}') return object;
                if (c != ',') throw new Invalid();
            }
        }

        private List<Object> array(int depth) throws Invalid {
            at++;
            List<Object> array = new ArrayList<>();
            skipSpace();
            if (peek() == ']') {
                at++;
                return array;
            }
            while (true) {
                skipSpace();
                array.add(value(depth));
                skipSpace();
                char c = next();
                if (c == ']') return array;
                if (c != ',') throw new Invalid();
            }
        }

        private String string() throws Invalid {
            at++;
            StringBuilder out = new StringBuilder();
            while (true) {
                char c = next();
                if (c == '"') return out.toString();
                if (c < 0x20) throw new Invalid();
                if (c != '\\') {
                    out.append(c);
                    continue;
                }
                char escape = next();
                switch (escape) {
                    case '"':
                    case '\\':
                    case '/':
                        out.append(escape);
                        break;
                    case 'b':
                        out.append('\b');
                        break;
                    case 'f':
                        out.append('\f');
                        break;
                    case 'n':
                        out.append('\n');
                        break;
                    case 'r':
                        out.append('\r');
                        break;
                    case 't':
                        out.append('\t');
                        break;
                    case 'u':
                        int code = 0;
                        for (int i = 0; i < 4; i++) code = code * 16 + hexDigit(next());
                        out.append((char) code);
                        break;
                    default:
                        throw new Invalid();
                }
            }
        }

        // Solo cifras ASCII: Character.digit también acepta las de otros alfabetos.
        private static int hexDigit(char c) throws Invalid {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            throw new Invalid();
        }

        private Object literal(String word, Object value) throws Invalid {
            if (!text.startsWith(word, at)) throw new Invalid();
            at += word.length();
            return value;
        }

        private Double number() throws Invalid {
            int start = at;
            if (at < text.length() && text.charAt(at) == '-') at++;
            if (at < text.length() && text.charAt(at) == '0') {
                at++;
            } else if (isDigit()) {
                while (isDigit()) at++;
            } else {
                throw new Invalid();
            }
            if (at < text.length() && text.charAt(at) == '.') {
                at++;
                if (!isDigit()) throw new Invalid();
                while (isDigit()) at++;
            }
            if (at < text.length() && (text.charAt(at) == 'e' || text.charAt(at) == 'E')) {
                at++;
                if (at < text.length() && (text.charAt(at) == '+' || text.charAt(at) == '-')) at++;
                if (!isDigit()) throw new Invalid();
                while (isDigit()) at++;
            }
            // Redondea al double más cercano, como JS: 1.0, 1e0 y 1 son el mismo número.
            return Double.parseDouble(text.substring(start, at));
        }
    }
}

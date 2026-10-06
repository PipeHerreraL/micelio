package io.github.pipeherreral.micelio.ota;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.fail;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** El JSON estricto de la app: acepta y rechaza lo mismo que `JSON.parse` en Node. */
public class OtaJsonTest {
    private static Object parse(String text) throws OtaJson.Invalid {
        return OtaJson.parse(text.getBytes(StandardCharsets.UTF_8));
    }

    private static void assertInvalid(String text) {
        try {
            parse(text);
            fail("Debería rechazar " + text);
        } catch (OtaJson.Invalid expected) {
            // Lo que se espera.
        }
    }

    /** Lee objetos, listas, textos con escapes y números, que son Double como en JS. */
    @Test
    public void parsesValidJsonLikeNode() throws Exception {
        Map<String, Object> value = OtaJson.asObject(
                parse(" {\"a\": [1, 2.5, -0, 1e2, 1E-2, true, false, null], \"b\": \"x\\u00f1\\n\\\"\\/\"}\r\n"));
        List<Object> a = OtaJson.asArray(value.get("a"));
        assertEquals(Arrays.<Object>asList(1.0, 2.5, -0.0, 100.0, 0.01, true, false), a.subList(0, 7));
        assertSame(OtaJson.NULL, a.get(7));
        assertEquals("xñ\n\"/", value.get("b"));
    }

    /** Rechaza lo que Node rechaza, aunque el org.json de Android lo aceptaría. */
    @Test
    public void rejectsWhatNodeRejects() {
        for (String text : new String[] {
            "", " ", "{", "{}x", "{} {}", "[1,]", "{\"a\":1,}", "01", "1.", ".5", "+1", "-", "1e", "--1",
            "\"\t\"", "'a'", "{a:1}", "{\"a\"=1}", "[1;2]", "// c\n{}", "/* c */{}", "# c\n{}", "\"\\x\"",
            "\"\\u12G4\"", "\"\\u０１２３\"", "NaN", "Infinity", "tru", "nul", "\"abc", "\uFEFF{}", "0x10"
        }) {
            assertInvalid(text);
        }
    }

    /** UTF-8 mal formado no es JSON (un nombre o un texto cortado a mitad de carácter). */
    @Test
    public void rejectsMalformedUtf8() {
        for (byte[] bytes : new byte[][] {
            {'"', (byte) 0xc3, '"'},
            {'"', (byte) 0xc0, (byte) 0x80, '"'},
            {'"', (byte) 0xed, (byte) 0xa0, (byte) 0x80, '"'}
        }) {
            try {
                OtaJson.parse(bytes);
                fail("Debería rechazar " + Arrays.toString(bytes));
            } catch (OtaJson.Invalid expected) {
                // Lo que se espera.
            }
        }
    }

    /** Con una clave repetida gana la última, como en JS, y un escape de un surrogate suelto vale. */
    @Test
    public void lastDuplicateKeyWinsAndLoneSurrogatesAreText() throws Exception {
        assertEquals(2.0, OtaJson.asObject(parse("{\"a\":1,\"a\":2}")).get("a"));
        assertEquals("\ud800", parse("\"\\ud800\""));
    }

    /** 64 KiB de «[» en un manifiesto no agotan la pila: se cortan en el tope de profundidad. */
    @Test
    public void deepNestingIsRejectedWithoutExhaustingTheStack() throws Exception {
        StringBuilder deep = new StringBuilder();
        for (int i = 0; i < 64 * 1024; i++) deep.append('[');
        assertInvalid(deep.toString());

        StringBuilder ok = new StringBuilder();
        for (int i = 0; i < OtaJson.MAX_DEPTH; i++) ok.append('[');
        ok.append('1');
        for (int i = 0; i < OtaJson.MAX_DEPTH; i++) ok.append(']');
        parse(ok.toString());
        assertInvalid("[" + ok + "]");
    }

    /** Un entero es lo que `Number.isSafeInteger` acepta: 1.0 y 1e0 sí; 1.5, "1" y 2^53, no. */
    @Test
    public void countsAreSafeIntegersLikeNode() throws Exception {
        assertEquals(1, OtaJson.asCount(parse("1.0"), 1));
        assertEquals(1, OtaJson.asCount(parse("1e0"), 1));
        assertEquals(9007199254740991L, OtaJson.asCount(parse("9007199254740991"), 0));
        assertEquals(0, OtaJson.asCount(parse("-0"), 0));
        for (String text : new String[] {"1.5", "\"1\"", "9007199254740992", "1e400", "-1", "true", "null"}) {
            assertEquals(text, -1, OtaJson.asCount(parse(text), 0));
        }
        assertEquals(-1, OtaJson.asCount(parse("0"), 1));
        assertEquals(Long.valueOf(-5), OtaJson.asInteger(parse("-5")));
        assertNull(OtaJson.asInteger(parse("0.5")));
    }

    /** Lo que escribe el estado se vuelve a leer igual, con comillas, barras y caracteres de control. */
    @Test
    public void writtenJsonReadsBack() throws Exception {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("text", "comillas \" barra \\ salto \n tab \t nul \u0000 ñ");
        value.put("list", Arrays.<Object>asList(1L, -2, true, null, "x"));
        value.put("empty", new LinkedHashMap<String, Object>());
        String json = OtaJson.write(value);
        assertEquals("{\"text\":\"comillas \\\" barra \\\\ salto \\u000a tab \\u0009 nul \\u0000 ñ\","
                + "\"list\":[1,-2,true,null,\"x\"],\"empty\":{}}", json);
        Map<String, Object> back = OtaJson.asObject(OtaJson.parse(json));
        assertEquals(value.get("text"), back.get("text"));
        assertEquals(Arrays.<Object>asList(1.0, -2.0, true, OtaJson.NULL, "x"), back.get("list"));
    }
}

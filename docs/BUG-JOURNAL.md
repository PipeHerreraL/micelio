# Diario de bugs

Cada entrada es un fallo que costó caro encontrar una vez. **Léelo antes de tocar la zona
correspondiente.**

El formato es siempre el mismo, y el campo que importa es el último:

- **Síntoma**: lo que se veía desde fuera. Suele no parecerse en nada a la causa.
- **Causa**: lo que pasaba en realidad.
- **Arreglo**: qué cambió y dónde.
- **Qué lo sostiene**: la prueba que impide que vuelva. Si dice «nada», puede volver mañana.

Ninguna entrada se borra, aunque el código se haya movido.

---

## Índice

| #   | Zona | Bug |
| --- | ---- | --- |

---

<a id="1"></a>

## 1. Un contador que muestra «1.00 M» no tiene tooltip al pasar encima

**Zona:** `src/i18n/format.ts`

**Síntoma.** Con 999 999.6 N el contador ya dice «1.00 M», pero el tooltip que explica el
sufijo («1.00e6 · millones») no aparece. Solo pasa en la franja [999 999.5, 1e6), así que en
juego se ve un instante y se confunde con un parpadeo.

**Causa.** `formatNumber` redondea primero y luego decide si lleva sufijo; `suffixFor`
comparaba el valor crudo con 1e6 antes de redondear. Las dos funciones escribían la misma
regla de dos maneras.

**Arreglo.** `suffixFor` decide con el mismo redondeo que `formatNumber`
(`roundTo(abs, smallDecimals(abs))`) antes de comprobar el límite inferior.

**Qué lo sostiene.** `tests/format.test.ts` → «el sufijo de 999 999.6 coincide con el «M» que
muestra el formato». Falla sin el arreglo (comprobado: devolvía `null`).

**Qué aprender.** Si dos funciones deciden lo mismo, que lo decidan con el mismo código.

---

## Bugs sin nada que los sostenga

Pueden volver. Se listan para que se vea.

| #   | Qué falta |
| --- | --------- |

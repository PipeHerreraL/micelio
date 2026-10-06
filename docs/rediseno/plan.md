> **Decisiones del usuario (2026-10-06), que mandan sobre el resto del plan:**
>
> 1. El rediseño sale **aparte, después de la 1.6.0** (no es un bloque de la 1.6.0). Orden previsto:
>    1.6.1 = actualizaciones automáticas del juego en la app de Android; 1.6.2 = este rediseño (que
>    así llegará solo a quien tenga la app).
> 2. La franja fija de arriba **no se compacta** al desplazar: se queda como pidió en la 1.4.2. Fuera
>    el cambio P3 «franja fija compacta».
> 3. Icono de nutrientes: **variante D «Canto acuñado»** (elegida el 2026-10-06): cara de moneda con su
>    canto en media luna y la N recortada con el nudo del corazón del núcleo en la diagonal. SVG
>    pequeño (un trazado del color del texto) y versión rica dorada para 24 px o más, en
>    `ux/icono-moneda/comparacion/` (archivos `d-*`). Sustituye al «Núcleo» de la sección del icono.

# Plan definitivo de rediseño de Micelio: menos texto, Socios claro, la «N» como icono y el árbol sin desborde

_Director de diseño · 2026-10-05 · versión final tras la crítica de 32 hallazgos. Rama `fase-10` solo
leída (otros agentes trabajan en ella; HEAD `fd0c72b`, con la interfaz de los votos del bloque B ya en
commit). Todo lo citado está en esta carpeta (`ux/`): `textos/`, `socios/`, `arbol/`, `icono/`,
`critica/`, `critica-experiencia/`, `director/` y `final/` (lo nuevo de esta versión: los textos
corregidos, medidos, en `final/correcciones.json`, y el script que los mide). La página para
enseñarlo es `informe.html`. El plan anterior queda en `plan.md`; la sección 11 dice qué hallazgo
cambió qué, con su comprobación._

> **Aviso de alcance.** La petición que disparó esta ronda fue otra: «¿es posible hacer que las
> actualizaciones del apk sean automáticas?». Este plan no la responde. La respuesta va en el informe
> (sección «Tu pregunta del .apk») y en el resumen que devuelvo: sí se puede; lo más rápido es
> Obtainium, sin tocar el juego, y después un aviso de versión nueva dentro de la app.

---

## 1. Resumen para ti

1. El juego explica demasiado y en mal sitio. Hay descripciones de 61 palabras, y en Socios, en un móvil de 375 px, «qué hay que hacer» aparece tras más de 500 palabras.
2. La regla nueva: primero lo que hace cada cosa, con su cifra, en una frase corta. La ciencia sigue entera, plegada en «La ciencia». Las reglas del juego nunca se esconden ahí.
3. En Socios, el objetivo va arriba en cuatro pasos, todos a la vista desde el principio: «Pon 4 copos», «El plasmodio une los copos», «Mantén la red estable 1 min» y «Cartografía · sigue sola». El mapa avanza desde el primer Rastro y es la parte larga, así que no se esconde.
4. La barra de herramientas pasa a botones de icono con rótulo corto (Copos, Lámpara, Quitar) y Pulso. Cabe en una fila en las cinco placas, en español y en inglés. El Caudal sale de la barra.
5. En un móvil de 375 × 667 se tocan las placas 1 y 2. Las placas 3 a 5 son más altas que la pantalla y se juegan en lista. A 412 × 915 se tocan las cinco.
6. El árbol de mutaciones va a 4 columnas en todas las pantallas, sin salirse. Cada casilla dice nombre, estado y precio. La ficha de abajo dice el efecto y qué falta («Requiere: …», «Faltan 5 esporas»), o «Despertar» si el voto la dejó dormida.
7. La «N» pasa a ser un icono propio, el núcleo en pequeño, con una pista la primera vez. El lector de pantalla dirá «nutrientes».
8. Todo se prueba también con la letra grande del sistema (130 % y 200 %), que el .apk hereda de Android. Los avisos dejan de tapar los botones de abajo.
9. Se hace en 15 commits pequeños, cada uno con sus pruebas y sus documentos, sin pasarse del peso permitido. El CSS inicial está a 0,6 kB de su tope y se mide en cada paso.
10. Te hago tres preguntas: cuándo publicarlo, si compactar la franja de arriba y qué icono prefieres.

---

## 2. Reglas de escritura del juego (para AGENTS.md)

Bloque listo para pegar en `AGENTS.md`, dentro de «Reglas de código», justo después de «Idioma». Sale
de la auditoría de textos (`textos/propuesta.md` §3), con los cambios del director y de la crítica:

- La descripción de una mutación es una descripción normal: va en la ficha, no en la casilla.
- La ciencia va en `<details>` y las definiciones en ⓘ, para que todo el juego pliegue igual.
- Las reglas de juego nunca van en «La ciencia» (hallazgo 14).
- El dato cabe en una línea de 375 px con su peor valor, no con el marcador contado como 4 caracteres
  (hallazgo 21, BUG-JOURNAL #25).
- Se separa lo que vigila la prueba de lo que se revisa a mano (hallazgo 21).

```markdown
### Textos de la interfaz

El jugador escanea; no lee (NN/g, «How Users Read on the Web»). Lo importante va primero, en una
frase corta, y lo demás espera a un toque.

| Tipo                                                | Regla                                                                                                                                                                                                              | Ejemplo                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Botón                                               | Verbo delante, ≤ 4 palabras y ≤ 24 caracteres, sin dos puntos. Si la fila ya dice el objeto, el botón dice solo el verbo y el nombre completo va en `aria-label`, **empezando por el texto visible** (WCAG 2.5.3). | «Mutar» · aria «Mutar Instinto»                |
| Etiqueta o título                                   | ≤ 6 palabras y ≤ 32 caracteres. Las dos primeras palabras la distinguen de sus vecinas.                                                                                                                            | «Hasta el hito»                                |
| Dato                                                | «Etiqueta: valor (umbral)», ≤ 10 palabras y ≤ 45 caracteres **con el valor más largo posible**: una línea a 375 px. El umbral dice su dirección («al menos», «como mucho»).                                        | «Calidad: 0,61 (al menos 0,66)»                |
| Paso (lista de pasos)                               | Verbo delante y quién actúa, ≤ 6 palabras, una línea.                                                                                                                                                              | «El plasmodio une los copos»                   |
| Instrucción (intro, pista, objetivo)                | Verbo delante, ≤ 15 palabras y ≤ 95 caracteres, una idea.                                                                                                                                                          | «Sube de rango con las esporas que te sobran.» |
| Descripción (mutación, adaptación, mejora, vínculo) | El efecto y su cifra delante, ≤ 12 palabras y ≤ 80 caracteres. Las excepciones de juego van aquí, no en «La ciencia».                                                                                              | «Anillo de hadas ×1,5 por rango.»              |
| La ciencia (`*.science`)                            | ≤ 40 palabras, con la cita (autor y año). Siempre plegada. Solo la cita y el porqué biológico.                                                                                                                     | —                                              |
| Cómo funciona (`*.more`)                            | ≤ 60 palabras, plegado. La mecánica larga que no hace falta para el siguiente toque.                                                                                                                               | —                                              |
| Ayuda ⓘ (`*.help`)                                  | ≤ 30 palabras y ≤ 2 frases. Define un término; nunca es lo único que dice cómo avanzar.                                                                                                                            | —                                              |
| Logro                                               | Imperativo, ≤ 15 palabras.                                                                                                                                                                                         | «Gana 1.000 nutrientes en toda tu vida»        |
| Regla de bioma                                      | «Elemento ×factor: consecuencia», ≤ 10 palabras.                                                                                                                                                                   | «Lluvia ×1/3: …»                               |
| Lámina                                              | Párrafos de ≤ 25 palabras; lámina de ≤ 80 palabras (cabe en 375 × 667 sin desplazar); una cita.                                                                                                                    | —                                              |
| Aviso efímero                                       | ≤ 12 palabras y ≤ 70 caracteres: dos líneas a 375 px.                                                                                                                                                              | —                                              |
| Error                                               | Qué pasó + qué hacer, ≤ 20 palabras.                                                                                                                                                                               | —                                              |
| Confirmación                                        | Título: pregunta de ≤ 5 palabras. Cuerpo en listas paralelas «Pierdes: / Conservas:».                                                                                                                              | —                                              |
| Sabor (`*.flavor`)                                  | ≤ 15 palabras, solo en tooltip, sin datos de juego.                                                                                                                                                                | —                                              |
| Solo para el lector                                 | ≤ 25 palabras. Nunca una instrucción que quien ve no tenga.                                                                                                                                                        | —                                              |

Estilo:

- **Una idea por frase.** Un punto y coma suele unir dos: pártelas.
- **Imperativo** en instrucciones y logros; en los pasos, el verbo y quién actúa.
- **Factores con ×** en todo el juego: ×2, ×½, ×1,5, ×1/3. Nunca «multiplica por 1,5». Solo caracteres
  del subconjunto latino de las fuentes (½ sí; ⅓ no).
- **Un término por concepto:** «copo», «sitio», «bucle», «offline», «resistente a cortes», «Pierdes /
  Conservas». Antes de inventar un nombre, busca si ya existe (y que no sea ya otra cosa del juego).
- **Nutrientes:** en cifras de la interfaz (contador, precios, producción), el número y el icono
  (`createAmount`). En prosa y en lo que es solo texto (`aria-label`, tooltip, aviso), la palabra
  (`{nutrients}` → `nutrientsText()`). Nunca «N» como unidad.
- **Toda cifra lleva su unidad visible** mientras esa unidad no tenga icono: «50 de Rastro», no «50».
- **Cuenta en la pantalla real:** 375 px dan unos 45 caracteres por línea. Prueba con `?pseudo` (+40 %),
  en inglés y con la letra del sistema al 130 %.

Qué se pliega (dos niveles como mucho; nunca un tercero):

- **La ciencia** (`<details>`, «La ciencia»): la cita y el porqué biológico.
- **Cómo funciona** (`<details>`): la mecánica larga.
- **ⓘ** (se abre al tocar; se cierra con Esc o tocando fuera): la definición de un término.
- **Nada esencial** solo en un tooltip, un ⓘ, un pliegue o el lector: lo que hace falta para avanzar
  se ve, y una regla de juego nunca va en «La ciencia».

Qué vigila `tests/ui-text.test.ts`:

- El tipo de cada clave sale de `tests/text-kinds.ts` (patrones y una tabla explícita). Una clave sin
  tipo hace fallar la prueba con su nombre: añádela allí. No hay tipo por defecto.
- Palabras y caracteres por tipo, en español y en inglés, con cada marcador sustituido por su peor
  valor (el nombre de magnitud más largo, el nombre más largo del catálogo…).
- Con expresiones regulares: botón sin dos puntos, «multiplica por», «N» como unidad, «≤».
- Las excepciones van en la prueba con su motivo. La lista solo encoge: falla si una excepción ya cumple.

Lo que revisa quien escribe, sin prueba: verbo delante, una idea por frase, las dos primeras palabras,
un término por concepto y nada solo para el lector.
```

Fuentes de cada regla: NN/g, «How Users Read on the Web» (1997), «First 2 Words» (2009), «Progressive
Disclosure» (2006), «Minimize Cognitive Load» (2013), «Tooltip Guidelines» (2019) e «Icon Usability»
(2014); GOV.UK, «Writing for GOV.UK» y «Sentence length: why 25 words is our limit» (2014); GOV.UK Design
System, «Details» y «Task list»; Apple HIG, «Alerts» y «Onboarding»; Material, «Snackbars», «Dialogs» y
«Writing»; WCAG 2.2: 1.3.3, 1.4.1, 1.4.4, 1.4.10, 1.4.13, 2.4.6, 2.4.11, 2.5.3, 3.2.4 y 3.3.2. Las URL
están en `textos/propuesta.md` §8.

---

## 3. Cambios priorizados

Impacto: cuánto cambia la experiencia de quien juega en el móvil. Esfuerzo: commits y riesgo
técnico. P1 se hace primero; P3 queda para después del bloque.

| #   | Prio.   | Cambio                                                                                                                     | Impacto · esfuerzo | Por qué                                                                                                                                     | Antes                                       | Después                                                                                                                      |
| --- | ------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | P1      | Socios: barra de herramientas que cabe en una fila en las cinco placas                                                     | Alto · bajo        | A 375 × 667 la barra ocupa 3 filas y la placa del tutorial no se toca. Con lámparas (placas 2–5), una fila de texto no cabe (406 px en 309) | 158 px; se juega en una lista de 20 filas   | Iconos con rótulo y Pulso: ≤ 52 px; con la línea del paso, ≤ 78 px. Placas 1 y 2 tocables a 375 × 667; las cinco a 412 × 915 |
| 2   | P1      | Reglas de escritura en AGENTS.md y una prueba que las vigila                                                               | Alto · medio       | Sin regla escrita, cada bloque vuelve a escribir largo                                                                                      | 125 textos (13 %) se pasan; nada lo detecta | Regla con fuente; registro de tipos; la prueba falla con un texto nuevo largo o sin tipo                                     |
| 3   | P1      | Árbol de mutaciones compacto con ficha y sus cinco estados                                                                 | Alto · medio       | 576 px de árbol en 343 px de hueco: 5 de 12 casillas fuera, sin pista (WCAG 1.4.10)                                                         | Desplazamiento lateral de 233 px a 375      | 4 columnas en todas las pantallas; la ficha dice qué falta o «Despertar»                                                     |
| 4   | P1      | Socios: el objetivo primero, en cuatro pasos, y la regla en la placa                                                       | Alto · medio       | Lo que hay que hacer llega al final, y nada dice que la cartografía es la parte larga                                                       | 93 palabras hasta el primer toque           | ~39; cuatro pasos con estado en texto; aviso del primer toque y leyenda                                                      |
| 5   | P1      | Descripciones: el efecto delante, la ciencia plegada y las reglas de juego a la vista                                      | Alto · medio       | Las 12 adaptaciones de bioma ponen la cita antes del efecto                                                                                 | `flow.desc` 61 palabras                     | ≤ 12 palabras visibles; 553 palabras de ciencia, plegadas                                                                    |
| 6   | P2      | La «N» como icono en cifras, la palabra en prosa y una pista la primera vez                                                | Medio · bajo       | «2,4 billones N» se lee como texto; el lector dice «ene»                                                                                    | «781 billones N»                            | «781 billones» + icono; lector: «781 billones de nutrientes»                                                                 |
| 7   | P2      | Un aviso a la vista, encima de lo que va pegado abajo                                                                      | Medio · bajo       | Hasta 3 avisos apilados tapan el panel, y taparían «Mutar» (WCAG 2.4.11)                                                                    | 3 tarjetas apiladas en el sitio de la ficha | Una a la vista, sobre la ficha o la barra; el lector oye cada nombre                                                         |
| 8   | P2      | Resto de textos: intros, pistas, láminas, confirmaciones, botones, etiquetas                                               | Medio · medio      | Láminas que no caben (tundra: 150 palabras), «Lámpara 0 de 0», tres nombres para «offline»                                                  | 6.585 palabras visibles                     | ≈ 5.454; ninguna lámina pasa de 80                                                                                           |
| 9   | P2      | Socios: lo avanzado, cuando hace falta (sin menú nuevo)                                                                    | Medio · medio      | Desde el primer minuto salen Mejoras, «Con tu red», cuatro «cerrada hasta…», Logros y herramientas a 0                                      | 431 palabras al llegar (412 px)             | ~57; Mejoras al tener Rastro; lo demás plegado                                                                               |
| 10  | P2      | La letra grande del sistema: árbol y pruebas al 130 % y al 200 %                                                           | Medio · bajo       | El .apk hereda el tamaño de letra de Android; al 130 % el boceto parte nombres en 4 líneas y al 160 % vuelve el desborde                    | Sin probar                                  | Lista a partir de un ancho en em; pruebas en e2e                                                                             |
| 11  | P2      | Esporular sin repetir la cabecera                                                                                          | Medio · bajo       | Dos cifras distintas para la misma pregunta                                                                                                 | Dos umbrales                                | Un umbral con su barra                                                                                                       |
| 12  | P3      | Contraste 3:1 en bordes y líneas; estado por forma y texto                                                                 | Bajo · bajo        | `--arcilla` sobre `--humus` da 2,88:1 (WCAG 1.4.11)                                                                                         | Líneas casi invisibles                      | ≥ 3:1; candado o marca además del color                                                                                      |
| 13  | P3      | La barra de pestañas avisa de que se desliza                                                                               | Bajo · bajo        | «Soc…» sale cortada y parece desborde                                                                                                       | Corte seco                                  | Borde difuminado; la pestaña activa siempre a la vista                                                                       |
| 14  | P3      | Franja fija compacta al desplazar y cabecera de una línea                                                                  | Alto · medio       | Lo fijo ocupa el 53 % de 375 × 667, y más con letra grande. **Pendiente de la pregunta 2**                                                  | Primer «Comprar» en y = 629                 | Franja de ~64 px con el núcleo tocable                                                                                       |
| 15  | Después | Un botón principal por pantalla, «Comprar todas», escritorio más ancho, Logros por categorías, icono de esporas en precios | Medio · medio      | Crítica H6, H7 y H10                                                                                                                        | —                                           | Fuera de este bloque                                                                                                         |

---

## 4. Textos: cómo se aplica la propuesta

**Fuente única:** `director/textos-final.md` (y `.json`), más las correcciones de esta versión en
`final/correcciones.json` (38 claves, medidas con `final/correcciones.mjs`: todas cumplen el §2 en los
dos idiomas con su peor valor). Si una clave está en los dos, manda `final/correcciones.json`. Antes de
C0, `director/fusionar-textos.mjs` genera un único archivo con clave y valor exactos en los dos idiomas.
Las 12 filas cuya columna «es» es una instrucción («visible «Dispersar»; aria-label: …») pasan a dos
claves con valor (por ejemplo, `biome.go.short` y `biome.sow.short`) (hallazgo 31).

Suma: 245 claves de la tabla, más 21 nuevas y 17 corregidas de `final/correcciones.json`.

**Cómo se aplica:**

1. **Español e inglés en el mismo commit.** El tipo `Catalog` ya lo obliga.
2. **Por zonas, con la interfaz que las usa** (sección 8). Cada commit quita sus claves de la lista de
   excepciones de `tests/ui-text.test.ts`.
3. **Marcadores nuevos:** `{nutrients}` y `{rate}`. En la interfaz los rellena `createRich()` (cifra e
   icono); en texto plano, `nutrientsText()`. Como `interpolate()` deja `{nutrients}` tal cual si la
   llamada pasa `{ value }`, hay dos pruebas (hallazgo 22): una unitaria que recorre cada clave con
   `{nutrients}` o `{rate}` y comprueba que su llamada usa `nutrientsText` o `createRich`, y una e2e que
   falla si algún texto visible contiene «{» en las partidas de `PHONES`.
4. **Las pruebas que cambian, por commit:** se sacan con un grep del texto actual sobre `tests/`
   (`textos/usage.mjs`) y van nombradas en el §8. Ninguna se borra ni se debilita; cuando una cambia a
   propósito, el commit lo dice. Las conocidas hoy:
   - `smoke.spec.ts:9,18,23` («0 N», «10 N», «0,1 N/s»);
   - `ui-cycle.test.ts:76–78` y `wall.spec.ts:46` (el `textContent` «Sembrar en …» de `.wind__go`);
   - `ui-wind.test.ts` (17 claves del Viento, `needLevel` y las reglas de la tundra);
   - `maturity.spec.ts:49` («Madurez de la red: hasta el nivel 1000»);
   - `ui-plasmodium.test.ts:326,349,388,396` («Confirmar: extender de nuevo», «Sitio 7 · fila» y las
     cadenas de #16);
   - `ui-notices.test.ts:19` (3 avisos a la vista);
   - `ui-vows.test.ts:71,98,226–251` y `cycle.spec.ts:113,291,300,376–382`, del bloque B (siembra,
     `wind.confirm.keepAsleep` y despertar desde el nodo);
   - `touch-scroll.spec.ts:68` (#14) y `regressions.spec.ts:143` (#9);
   - `journey.test.ts` (reglas de lluvia).

**Qué se pliega en «La ciencia»** (`<details>`, cerrado, una clave `*.science` de ≤ 40 palabras, solo
la cita y el porqué):

- Las 12 adaptaciones de bioma (`badapt.*.science`).
- 4 adaptaciones de la red (`adapt.apicalBody`, `sclerotium`, `hydraulicLift`, `foxfire`).
- 6 mejoras del plasmodio (`pupg.agar`, `oats`, `humidity`, `dormancy`, `chemotaxis`, `memory`).
- 2 vínculos (`link.pruning`, `link.shortPath`) y el caudal (`flow.science`).

**Reglas de juego que salen de «La ciencia»** (hallazgo 14):

- `pupg.memory.desc`: «Tubos vacíos: se secan ×2, salvo con quinina o sal.», y en su línea de efecto
  (`pupg.memory.effect`): «Red más barata y menos tolerante a cortes.»
- `flow.locked`, visible en una placa sin cartografiar: «Aquí va en Medio hasta cartografiarla.»

**«Cómo funciona»:** `wind.cycle.more` y `autobuy.payback.more`.

**ⓘ que se abre al tocar** (`infoButton` del plasmodio, ya accesible):

- `trail.help` y `mapping.help`, esta corregida: «El Rastro cartografía la placa. Con el mapa completo y
  la red estable, fructifica.» La de la tabla decía «con la red cumpliendo», y es falso: `gainTrail`
  suma a la cartografía sin mirar el objetivo (`advance.ts:41–47`).
- `goal.hold.help`, `goal.quality.help`, `goal.cost.help` y `goal.tolerance.help`: debajo de la placa,
  junto a las condiciones (sección 5), no dentro de los pasos.

**Pasa a verse:**

- Las 5 presentaciones de placa, como subtítulo de una frase de 45 caracteres o menos («Madera húmeda:
  aquí aprende a unir la comida.»; las cinco, en `final/correcciones.json`).
- `flow.locked`, como motivo del Caudal cerrado.
- `trail.label` («Rastro»), en la cabecera y en los precios. El plan anterior la borraba por no tener uso.
- `coach.tap` y `coach.pulse`, avisos de primera vez en la placa.
- «Cómo se juega» (`howto.1–3`), abierto bajo la placa hasta cartografiar la primera.

**Se borra:**

- `meta.titleWithValue` (sin uso).
- `hud.nutrients`, `hud.perSecond` y `gen.cost`: la cifra la pinta `createAmount()`.
- `chapter.plasmodium.arrive.line4`, que pasa a `line3`.
- `plasmodium:step.shape` y `step.shape.maze`, sustituidas por `step.link` y `step.link.maze`.
- Frases repetidas: lo que viaja contigo en `wind.intro`; la exportación duplicada en
  `settings.install.ios`; «mientras el juego está abierto»; «estadísticas de vida y ajustes» en las
  confirmaciones (también en `wind.confirm.keepAsleep`, del bloque B: cambia `ui-vows.test.ts:98`).
- **No se borran** las cuatro `badapt.needLevel.*`: `i18n.test.ts:82` y `biome-adaptations.ts:131`
  piden una por bioma, y el texto repetido apenas pesa comprimido (hallazgo 28).

**Dónde chocaban las propuestas y qué se decidió:**

| Clave                                       | Decisión                                                                                                 | Por qué                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `mut.soilMemory.desc`                       | «Empiezas con 100 nutrientes y 10 Hifas.»                                                                | La versión corta, con la palabra en prosa                                                                                   |
| `plasmodium:goal.quality` y `goal.shortest` | «Calidad: {value} (al menos {target})» y «Longitud: ×{value} el camino más corto (como mucho ×{target})» | Dicen la dirección; BUG-JOURNAL #16. La línea del paso usa las mismas palabras                                              |
| `plasmodium:mapping.help`                   | «El Rastro cartografía la placa. Con el mapa completo y la red estable, fructifica.»                     | La cartografía no espera al objetivo (`advance.ts:46`); fructifica con el mapa y 60 s de estabilidad (`advance.ts:135–138`) |
| `plasmodium:net.stalled`                    | «¿La red no mejora? Mueve un copo o extiéndela de nuevo.»                                                | Corta, con las dos salidas reales                                                                                           |
| `plasmodium:plate.respread.desc`            | «Vuelve a cubrir la placa. Conservas copos, lámparas y Rastro.»                                          | Visible bajo «Extender de nuevo»                                                                                            |
| `plasmodium:pupg.*`                         | Efecto visible y ciencia en «La ciencia»; las excepciones de juego, visibles                             | Un solo patrón                                                                                                              |
| `plasmodium:tool.food`                      | «Copos» (no «Avena» ni «Copo de avena»)                                                                  | Un nombre por cosa: el paso dice «Pon 4 copos»                                                                              |
| `plasmodium:coach.tap` y `howto.1`          | «Toca un sitio para poner un copo.» · «Elige Copos y toca un sitio de la placa.»                         | «Sitio» ya es el nombre del lector y de la lista (30 claves y `ui-plasmodium.test.ts:349`)                                  |
| `plasmodium:legend.loop` y `flow.science`   | «Bucle», no «anillo»                                                                                     | «Anillo» es el generador Anillo de hadas; «lazo» es, en grafos, una arista a sí mismo; «ciclo» es el ciclo libre            |
| `biome.tundra.rule.rain`                    | «Lluvia ×1/3: el triple de tiempo entre gotas.»                                                          | ⅓ (U+2153) no está en las fuentes: `i18n.test.ts` fallaría                                                                  |
| Descripciones de mutación                   | Regla de descripción normal (≤ 12 palabras)                                                              | Van en la ficha, no en la casilla                                                                                           |

**Lo que no se toca:** las noticias, los nombres de números (`num.*`) y el panel de desarrollo. Los
títulos de lámina y una cita por lámina se quedan.

---

## 5. Socios: el rediseño elegido

El del boceto `socios/boceto.html` (capturas en `socios/despues/`), con los textos finales y estos
cambios sobre el boceto: cuatro pasos, la barra de iconos con rótulo, la unidad del Rastro, alturas
fijas y ningún menú nuevo.

**Orden de arriba abajo a 375 px:**

1. **Cabecera de una línea:** «Plasmodio · Tronco caído · placa 1 de 5». Cuando el Rastro pasa de 0,
   aparece «Rastro 64 · +0,6/s» (con la palabra: el Rastro no tiene icono). Al final, un ⓘ con la
   ficha: especie, «protista» y la intro de la pestaña.
2. **Subtítulo de la placa** (`plate.*.intro`), una frase de 45 caracteres o menos.
3. **Objetivo en cuatro pasos**, todos a la vista desde el principio (`<ol>`, nombre accesible: el
   título «Objetivo»; descripción: `plate.*.goal`):
   1. «Pon 4 copos» (no sale si la placa no pide copos, como el Laberinto).
   2. «El plasmodio une los copos» (en el Laberinto, «El plasmodio deja el camino corto»). Dice quién
      actúa: el jugador espera y no busca una herramienta para dibujar tubos.
   3. «Mantén la red estable 1 min». Nunca «Aguanta» ni «Hold», que en un móvil se leen como «mantén
      pulsado».
   4. «Cartografía 12 % · sigue sola». Avanza desde el primer Rastro (`advance.ts:46`) y es la parte
      larga: 4,3 millones de Rastro en la placa 1 y de 4 a 6 h para las cinco.

   Cada paso dice su estado en texto: «hecho», «ahora», «falta»; el 3, «se vacía» si la red deja de
   cumplir (la estabilidad baja 2 por segundo); el 4, «sigue sola». El paso actual lleva
   `aria-current="step"`. **Cada fila tiene alto fijo, en una línea** (`white-space: nowrap`): la lista no
   crece mientras se juega (hallazgo 8). La barra de calidad y las condiciones con su ⓘ no se
   despliegan aquí: van bajo la placa (punto 7).

4. **Barra pegajosa:**
   - Un control segmentado de herramientas: botones de 48 × 64 px como mínimo, con icono y cuenta en
     una línea y el rótulo corto debajo, a 12 px: «Copos 4», «Lámpara 1» (solo si la placa da alguna) y
     «Quitar». Cada uno con su nombre accesible («Copos: te quedan 4 de 4») y `aria-pressed`.
   - «Pulso» a la derecha, de ancho fijo. Aparece con dos copos; en espera lleva `aria-disabled` y la
     cuenta atrás dentro del mismo ancho.
   - El Caudal **no** va en la barra: se queda bajo la placa (punto 7).
   - Bajo la fila, la línea del paso actual, de 24 px y una línea, con la dirección de la meta (§4):
     «Paso 2 · Calidad 0,61 (al menos 0,66)», o en el Laberinto «Paso 2 · Longitud ×1,40 (como mucho
     ×1,20)». Medida con su peor valor: 45 caracteres en español y 43 en inglés.
   - **Alto de la barra con su línea: 78 px como mucho**, en las cinco placas, en español, en inglés y
     con `?pseudo`, y el mismo antes y después de que aparezca Pulso.
   - Ancho a 375 px: 3 × 64 + 96 + 3 × 6 = 306 px de 343 (con `?pseudo`, ~330).
5. **Placa:**
   - Tocable si `computeLayout` le da sitio. En vertical pide `columnas × cellMin` de alto: Tronco 370,
     Laberinto 378, Archipiélago 456, Puente amargo 532 y Fusión 490 px. A 375 × 667 quedan
     667 − 107 (cabecera) − 72 (pestañas) − 78 (barra) − 24 = 386 px: **caben Tronco y Laberinto; las
     placas 3 a 5 se juegan en lista**. Ampliar no las salva a ese tamaño: la placa ampliada mide 293 × 407 px, y
     en vertical da celdas de 73 px de ancho y 58 de alto, por debajo de su `cellMin` (70–76). A 412 × 915 caben las cinco.
   - Solo en la placa 1 y hasta el primer copo, un sitio late con el aviso «Toca un sitio para poner un
     copo.» (`role="status"`, quieto con `prefers-reduced-motion`). La primera vez que sale Pulso, el
     mismo aviso dice «Pulso: adelanta 3 pasos. Uno cada 30 s.»
   - Con dos copos aparece la leyenda «Lleva comida: engorda · Vacío: se seca · Bucle: aguanta un corte».
6. **Pista de atasco:** «¿La red no mejora? Mueve un copo o extiéndela de nuevo.», solo si se atasca.
7. **Bajo la placa:**
   - Los botones que ya existen (`plasmodium__actions`): Ampliar (si sirve), Ver como lista y Extender
     de nuevo, con su descripción visible y su confirmación. **No hay menú «Más»** (hallazgo 26): los
     botones ya están ahí, con el foco probado (#19), y el menú sumaba JS a un paquete en 19,2 de 20 kB.
   - Las condiciones con su ⓘ (calidad con su barra y su muesca, coste, tolerancia, estabilidad).
   - El Caudal, desde la primera placa cartografiada. En una placa sin cartografiar se ve en Medio, con
     `aria-disabled` y su motivo visible: «Aquí va en Medio hasta cartografiarla.»
   - «Cómo se juega» (`howto.1–3`): **abierto hasta cartografiar la primera placa; después, plegado**.
8. **Mejoras**, cuando hay Rastro o alguna comprada. El efecto delante, «La ciencia» plegada y el precio
   con su unidad: «Comprar · 50 de Rastro». Si no llega, el botón dice el verbo y lo que falta.
9. **Plegados** (`<details>`, cerrados): «Con tu red · 1 de 3 activa», «Placas · 1 de 5» y «Logros del
   plasmodio · 0 de 8».

**Llegada:** la lámina baja de 96 a 44 palabras en tres frases, y el botón dice «Darle avena». La
ciencia que queda: una sola célula con muchos núcleos y los trenes de Tokio (Tero y colegas, 2010, en
la lámina de la placa 3).

**La lista de sitios** aparece si se pide («Ver como lista») o si la placa no cabe tocable: a 320 px,
en horizontal, con zoom o con letra grande, y a 375 × 667 en las placas 3 a 5. Las filas se acortan
(«Sitio 4 · fila 4, columna 4 · vacío · 4 tubos»).

**Teclado:** flechas, Enter o Espacio, y 1, 2 y 3 para las herramientas. En escritorio (≥ 768 px, como
`core.keyHint`) se ve la línea «Flechas y Enter en la placa; 1, 2 y 3 cambian de herramienta.»
(hallazgo 15).

**Accesibilidad:**

- Pasos en `<ol>` con `aria-current` y estado en texto (WCAG 1.4.1).
- Los avisos de primera vez no roban el foco (WCAG 4.1.3) y no se mueven con `prefers-reduced-motion`
  (WCAG 2.3.3).
- Nombres accesibles que empiezan por la etiqueta visible (WCAG 2.5.3).
- `scroll-margin-top` igual a la cabecera más la barra pegajosa (WCAG 2.4.11).
- Objetivos táctiles de 44 px o más (WCAG 2.5.8; Apple HIG 44 pt; Material 48 dp).
- Los iconos de la barra llevan rótulo visible: pocos iconos se entienden solos (NN/g, «Icon Usability»).

**Medido en el boceto (placa 1):**

|                                | Antes                       | Después                                                              |
| ------------------------------ | --------------------------- | -------------------------------------------------------------------- |
| Palabras hasta el primer toque | 93                          | ~39 (31 del boceto, más el cuarto paso y los pasos 2 y 3 más largos) |
| Palabras visibles al llegar    | 431 a 412 px · 778 a 375 px | ~57                                                                  |
| Barra de herramientas          | 158 px                      | ≤ 52 px; ≤ 78 con la línea del paso                                  |

Fuentes: GOV.UK, «Writing for GOV.UK» y Design System «Task list»; Apple HIG, «Onboarding»; NN/g,
«Onboarding Tutorials vs. Contextual Help», «Progressive Disclosure», «Minimize Cognitive Load» e «Icon
Usability».

---

## 6. Árbol de mutaciones: la opción elegida

**La opción 3: árbol compacto con ficha** (`arbol/opcion-3.html`, capturas `arbol/capturas/opcion-3-*`).

**Por qué:**

- Es la única que enseña el árbol entero en ~1,6 ventanas, sin desplazamiento lateral y sin perder el
  dibujo, que es parte de la identidad del juego.
- Las otras dos lo pierden o lo esconden:

  | Opción                | Alto         | Problema                                                         |
  | --------------------- | ------------ | ---------------------------------------------------------------- |
  | 1, niveles apilados   | 3,9 ventanas | Las dependencias solo se leen en texto                           |
  | 2, acordeón por ramas | —            | Esconde ramas, salta al abrir y cerrar, y diverge del escritorio |

- Recorta el texto de cada casilla, que es lo que pediste: el efecto pasa a la ficha.
- Elegir y luego «Mutar» evita comprar lo que no era (BUG-JOURNAL #21).

**Cómo queda:**

- **4 columnas en todas las pantallas**, sin `min-width`. Las posiciones de `src/data/mutations.ts`
  (`col`, `row`, que solo usa `tab-mutations.ts`) se sustituyen por las de 4 columnas: una sola tabla.
  Se retiran el `:has()` que ensancha el panel a 470 px y la letra de 12 px sin volver al fallo de
  1024 px: con 4 columnas, el panel de 360 px da casillas de ~76 px, como el móvil (hallazgo 25).
- Casillas de 81 × 58 px a 375 px (78 × 58 a 360), con `min-height`, no alto fijo, y sin
  `hyphens: auto`: con letra grande, la casilla crece en vez de partir la palabra.
- **Con letra grande,** una consulta de contenedor en em (`.mut-tree__scroll` con
  `container-type: inline-size`) pasa el árbol a lista, en orden de lectura y sin líneas. El umbral se
  mide: al 100 % cabe; al 130 % «Absorción profunda» ya se parte en 4 líneas (`critica-experiencia/`).
- **Cada casilla dice nombre y estado**, y su nombre accesible lleva estado y unidad (hallazgo 3):

  | Estado                          | Casilla                                | Nombre accesible                           |
  | ------------------------------- | -------------------------------------- | ------------------------------------------ |
  | Comprable                       | Precio con el icono de espora          | «Instinto, 10 esporas»                     |
  | Sin esporas                     | Precio atenuado                        | «Instinto, 10 esporas»                     |
  | Bloqueada                       | Candado y precio                       | «Instinto superior, bloqueada, 60 esporas» |
  | Adquirida                       | Marca                                  | «Instinto, adquirida»                      |
  | Dormida (voto «sin mutaciones») | Borde discontinuo y «dormida» en texto | «Memoria del suelo, dormida, 1 espora»     |

- **La ficha** va pegada sobre la barra de pestañas. Dice el nombre, el efecto (≤ 12 palabras), una
  línea de motivo y el botón:

  | Estado      | Motivo visible                                                                   | Botón                                                            |
  | ----------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
  | Comprable   | —                                                                                | «Mutar» con su precio (aria «Mutar Instinto, 10 esporas»)        |
  | Sin esporas | «Faltan 5 esporas»                                                               | «Mutar» con `aria-disabled`                                      |
  | Bloqueada   | «Requiere: Más allá del bosque y Esporas aladas» (`mut.requires`)                | «Mutar» con `aria-disabled`                                      |
  | Adquirida   | «Adquirida»                                                                      | Ninguno                                                          |
  | Dormida     | «Esporas de este ciclo para despertar: 3» o «Despierta antes: Memoria del suelo» | «Despertar» (aria `mut.wake`), con `aria-disabled` si falta algo |

  La línea `.mut__budget` del bloque B sigue encima del árbol mientras hay voto (hallazgo 4).

- **Al abrir la pestaña** queda elegida la primera comprable; si no hay, la primera disponible, y si
  tampoco, la última comprada.
- **Tras «Mutar» o «Despertar»** la elección se queda en esa mutación: la ficha dice «Adquirida» y el
  botón queda inerte (`aria-disabled`) 0,9 s, como en #21. Nunca se elige otra sola, salvo al abrir la
  pestaña. Dos toques seguidos compran una sola mutación (hallazgo 7).
- **La ficha deja de ir pegada** y pasa debajo del árbol si el hueco no deja ver dos filas de casillas
  por encima de ella (con letra grande, o si el panel baja de `MIN_PANEL_PX`).
- **Árbol completo:** con las 12 compradas y **ninguna dormida**, todo se pliega en un `<details>`
  «Árbol completo», para que las Adaptaciones queden arriba. Con alguna dormida, el árbol sigue abierto.
- Los avisos se colocan por encima de la ficha (sección 8, C11).

**Teclado y lector:**

- El árbol es un `role="listbox"` («Árbol de mutaciones») con 12 `role="option"` y `aria-selected`
  (no `aria-pressed`). Un solo punto de tabulación; las flechas lo recorren y la elección sigue al foco
  (patrón APG de lista de selección única). Tab lleva a «Mutar».
- La opción enfocada se describe con el efecto de la ficha (`aria-describedby`). La ficha no lleva
  `aria-live`: el lector ya oye la opción y no la oye dos veces.
- Tras «Mutar», el foco se queda en el botón de la ficha (BUG-JOURNAL #5).
- En escritorio se ve «Flechas para recorrer el árbol; Tab para ir a «Mutar».» (hallazgo 15).
- `scroll-margin-bottom` igual a la ficha más la barra (WCAG 2.4.11).

**Código:**

- `src/data/mutations.ts`: posiciones de 4 columnas (12 valores, con su `span`).
- `src/ui/tab-mutations.ts`: la posición por variables CSS; la lista de selección; la ficha con los
  cinco estados; la elección que se queda tras comprar. Comprar y despertar pasan del nodo a la ficha,
  así que `ui-vows.test.ts:226–251` y `cycle.spec.ts:376–382` cambian a propósito en el mismo commit.
- `src/ui/styles.css`: fuera `min-width: 36rem`, el bloque del `:has()` y la letra de 12 px; 4 columnas,
  la ficha pegada con `bottom: calc(57px + var(--sab))` y líneas con contraste de 3:1. El CSS que se
  sustituye se borra en el mismo commit.
- Claves nuevas: `mut.buy.short` («Mutar»), `mut.wake.short` («Despertar»), `mut.missing.*`,
  `mut.option`, `mut.keys` y «Árbol completo».

**En Mejoras no hay desborde** (medido a 360, 375, 412, 768, 1024 y 1280 px, y en el juego publicado
hasta el 160 % de letra). Lo que puede parecerlo es la barra de pestañas (cambio 13).

Fuentes: WCAG 2.2, 1.4.4, 1.4.10 (la excepción de los diagramas no cubre esconder casillas con botones),
2.5.8 y 2.4.11; NN/g, «Horizontal Attention Leans Left», «Progressive Disclosure» y «Accordions on
Mobile»; WAI-ARIA APG, «Listbox» y tabindex móvil; Apple HIG 44 pt; Material 3 48 dp.

---

## 7. Icono de nutrientes (y otras unidades)

**Diseño elegido: «Núcleo»** (`director/icono-revision.html`, capturas `director/icono-*.png`).

Es el corazón del núcleo con cinco hifas que salen en línea recta y ondean un poco, como los filamentos
de `core-art.ts`. Cuadrícula de 16 × 16 con trazo de 1,5 en `currentColor`:

```text
path   M10.12 5.09Q11.52 5.36 12.17 2.26M11.42 9.11Q12.03 8.06 14.18 10.01M8.00 11.60Q6.70 12.21 8.00 15.10M4.58 9.11Q4.71 10.32 1.82 10.01M5.88 5.09Q6.58 3.83 3.83 2.26
circle cx 8, cy 8, r 2.8 (relleno)
```

**Por qué este y no el «Remolino»:**

- El Remolino tiene giro: a 12–16 px se ve un molinete con ganchos y puede recordar a una cruz gamada
  (`director/icono-revision-x3.png`). El Núcleo no gira.
- No se confunde con la espora, el clic de Mejoras ni la gota (`director/icono-familia-x3.png`).
- **Riesgo que queda:** a 12–14 px puede leerse como sol, estrella o asterisco («37,2 millones ✶» en
  un botón parece una llamada a nota; `director/icono-revision-real.png`).
- **Contraste:** hereda el color del texto: de 7,3:1 en el precio a 13,4:1 en el contador (WCAG 1.4.11).

**Dónde va el icono y dónde la palabra:**

- **Icono, siempre detrás de la cifra:** el contador y el ritmo; «Faltan X para la siguiente espora»;
  precios de generadores y mejoras; «X/s por unidad · en total»; «+X/s · +X por clic»; el número que
  sale del núcleo; Esporular.
- **Palabra** (`nutrientsText()`): nombres accesibles, tooltips, avisos de lluvia, informe offline,
  logros, descripciones y «Producción máxima».

**Cómo se enseña** (NN/g, «Icon Usability»: pocos iconos se entienden sin rótulo). `core.hint` se oculta
con la primera Hifa (`hud.ts:140`) y el tooltip del contador es `null` por debajo de un millón
(`i18n/index.ts:163–166`), así que el plan anterior no lo enseñaba (hallazgo 11). Ahora:

- **Una pista de primera vez** (`createHint`, con «Entendido» y el foco de #8): «Este icono son tus
  nutrientes: los absorbes y los gastas.» Sale con la primera Hifa a quien empieza, y al cargar la 1.6
  a quien viene de la 1.5. Sin pulsación larga.
- **El tooltip del contador empieza siempre por «Nutrientes»**, también por debajo de un millón.
- Cada toque al núcleo saca «+X» y el icono.
- **Prueba de cinco segundos** con 3–5 personas antes de publicar: el contador, y el icono a 12 px dentro
  de un botón, preguntando también si se lee como asterisco.
- **Si la prueba falla**, el contador lleva un rótulo fijo «nutrientes». No va de entrada: suma una línea
  a la franja fija, que ya ocupa el 53 % de 375 × 667 y crece con letra grande (familia de #20 y #25).

**Accesibilidad:**

- Cada cantidad es una unidad que no se parte: la cifra, el SVG (`aria-hidden="true"`,
  `focusable="false"`) y un texto oculto con « de nutrientes» o « nutrientes».
- En los ritmos, «/s» se oculta al lector y el texto oculto añade «por segundo».
- Comprobado en la maqueta: el lector oye «Comprar 1 Hifa 37,2 millones de nutrientes».
- WCAG 1.1.1, 1.3.1 y 2.5.3. La cifra nunca pasa al `aria-label` del botón.

**Plan técnico:**

- `src/ui/icons.ts`: `nutrientIcon()`. `draw()` acepta el viewBox de 16 y el trazo de 1,5.
- `src/ui/amount.ts` (nuevo, prototipo en `icono/prototipo/amount.ts`): `createAmount(kind)` y
  `createRich(host)`, que solo cambian lo que cambió.
- `src/i18n/index.ts`: `nutrientsText(value)`, con la misma regla del «de» que `formatCountOf`.
- Claves: `unit.nutrients`, `unit.nutrients.one`, `unit.nutrients.afterName`, `unit.perSecond`,
  `unit.perSecond.short` y `hint.nutrientIcon`.
- CSS: `.amount { white-space: nowrap }` y `.unit` (1em, `vertical-align: -0.12em`). El icono es 4,1 px
  más ancho que « N»: `--fit` de `.counter__value` pasa de 8,6 a ~8,8, y la prueba de #25 se amplía a
  360 px con el nombre de magnitud más largo (hallazgo 22).
- Peso (prototipo, cota superior): 0,87 kB de JS y 0,11 kB de CSS. Medido hoy en `dist` (23:09, con el
  bloque B): JS inicial 86,9 de 95 kB → ~87,8; CSS inicial 8,4 de 9 kB.

**Otras unidades:**

- **Esporas: sí, en un segundo paso,** en precios (árbol, siembra del Viento) y en la cabecera, con
  `uiIcon('spore')`, que hoy no se usa.
- **Rastro: no por ahora**, pero con la palabra siempre: «Rastro 64», «50 de Rastro» (hallazgo 12).
- **Nunca:** linaje, nivel, partidas, clics, gotas, tiempo y %.

---

## 8. Plan de implementación

**Dónde:** un «bloque C, claridad» de la fase 10, en una rama propia desde `fase-10` (HEAD `fd0c72b` o
posterior): `fase-10-claridad`.

- La interfaz de los votos (bloque B) ya está en commit (`fd0c72b`, 22:58). C0 puede entrar ya, con las
  claves del bloque B medidas y clasificadas.
- Los commits van **en orden, de uno en uno**: C2, C3 y C11 tocan los mismos archivos que el bloque B.
  La rama se rebasa sobre `fase-10` antes de cada commit.
- Cada commit lleva sus documentos (AGENTS.md, «Documentación»): la entrada del BUG-JOURNAL del bug que
  corrige, con el número que toque al rebasar, y el cambio de ARCHITECTURE si contradice algo. C14 solo
  actualiza STATUS y ROADMAP (hallazgo 32).

**Antes de cada commit**, la lista de AGENTS.md:

```text
npm test · npm run lint · npm run build · npm run test:e2e · npm run budget
```

Las e2e corren en los cinco perfiles, a `PHONES` (375 × 667 y 412 × 915), con `?pseudo` y, donde se
indica, con la letra al 130 % y al 200 % (`html { font-size }`: el juego usa rem en todas sus letras).

**Peso, medido hoy** (`node scripts/budget.ts` sobre el `dist` de las 23:09): JS inicial 86,9 de 95 kB ·
CSS inicial 8,4 de 9 · JS del plasmodio 19,2 de 20 · CSS del plasmodio 1,3 de 3 · `en.ts` 16,7 de 18 ·
`plasmodium.es.ts` 5,4 de 7. La tabla de textos los rebaja (aproximado, JSON comprimido): `es.ts`
−0,7 kB, `en.ts` −0,6 kB y los catálogos del plasmodio −0,3 kB cada uno.

| #   | Commit (mensaje en español, dice por qué)                                                         | Qué cambia                                                                                                                                                                                                                                                                                                                                                                                                                                     | Pruebas que necesita                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0  | Reglas de escritura de la interfaz y una prueba que las vigila                                    | `AGENTS.md` (bloque del §2). `tests/text-kinds.ts`: el tipo de cada clave, por patrón y por tabla; una clave sin tipo falla con su nombre. `tests/ui-text.test.ts`: umbrales del §2 en es y en, con cada marcador sustituido por su peor valor; las expresiones regulares del §2. Excepciones recalculadas desde el árbol del commit, por idioma, con motivo; falla si una ya cumple. El registro vive en `tests/` para no pesar en el paquete | La prueba nace en verde sobre HEAD. Falla al añadir un texto largo, una clave sin tipo o «N» como unidad, en es y en en                                                                                                                                                                                                                                                                                                                                                                                  |
| C1  | Socios: la barra de herramientas cabe en una fila en las cinco placas, para que la placa se toque | Control segmentado de iconos con rótulo (Copos, Lámpara, Quitar) y Pulso de ancho fijo; Lámpara oculta con total 0; el Caudal se queda bajo la placa; `tool.food` «Copos», `pulse.button` «Pulso», `tool.food.label`                                                                                                                                                                                                                           | Unitaria de `computeLayout` con las alturas reales (cabecera 107, barra 78). e2e: barra ≤ 52 px y ≤ 78 con la línea, en las cinco placas, es, en y `?pseudo`, con el mismo alto antes y después de Pulso; a 375 × 667, Tronco y Laberinto tocables (sin `.is-image`); a 412 × 915, las cinco. Cambian `plasmodium.spec.ts` y `ui-plasmodium.test.ts` (nombres de herramientas). `npm run budget`                                                                                                         |
| C2  | El árbol de mutaciones ya no se sale de la pantalla en el móvil                                   | 4 columnas en `mutations.ts`; casilla con nombre, estado y precio; lista de selección; ficha con los cinco estados, su motivo y «Mutar» o «Despertar»; la elección se queda tras comprar. BUG-JOURNAL #26 y ARCHITECTURE en este commit                                                                                                                                                                                                        | `cutOff('.tab--mutations')` vacío a 360, 375 y 412 con `?pseudo`; **falla sin el arreglo**. Nombre accesible de cada estado. Ficha de una bloqueada con «Requiere: …». Dos clics seguidos en «Mutar» compran una sola. Con el voto «sin mutaciones»: casilla «dormida», ficha con «Despertar» y su presupuesto. `layout-stability.spec.ts`: el alto no cambia al comprar. Se reescriben a propósito `ui-vows.test.ts:226–251` y `cycle.spec.ts:376–382`. Budget de CSS                                   |
| C3  | Árbol: teclado, árbol completo plegado y letra grande                                             | Teclado de la lista; línea de teclado en escritorio; «Árbol completo» plegado solo sin dormidas; fuera el `:has()` de 470 px; consulta de contenedor en em; ficha no pegada si no se ven dos filas                                                                                                                                                                                                                                             | e2e de teclado: flechas, Tab a «Mutar» y foco tras comprar (#5). Foco no tapado (WCAG 2.4.11). A 1024 × 768: ningún nombre partido a mitad de palabra y `cutOff` vacío. Al 130 % y al 200 % a 375: sin desplazamiento lateral y nombres enteros. Con voto y todo comprado, el árbol sigue abierto. `touch-scroll.spec.ts` (#14) cambia a propósito: un caso con el `<details>` abierto y otro desde su `summary`                                                                                         |
| C4  | La N de nutrientes pasa a ser un icono en el contador                                             | `nutrientIcon()`, `amount.ts`, `nutrientsText()`, claves `unit.*`; contador, ritmo y número del núcleo; pista de primera vez y tooltip «Nutrientes» siempre                                                                                                                                                                                                                                                                                    | Unitarias de `nutrientsText` (es y en) y del SVG oculto al lector. e2e: `smoke.spec.ts` actualizado; ningún texto visible con «{»; prueba de #25 a 360 y 375 con el nombre de magnitud más largo; la pista sale una vez y devuelve el foco (#8). Budget                                                                                                                                                                                                                                                  |
| C5  | La N, icono en las cifras y palabra en las frases, en todo el juego                               | Generadores, Mejoras, Esporular, `hud.nextSpore` (con `createRich`), y la palabra en logros, lluvia, offline, adaptaciones y estadísticas                                                                                                                                                                                                                                                                                                      | «Ninguna clave usa N como unidad» sin excepciones. La unitaria de llamadas de `{nutrients}` y `{rate}`. `getByRole('button', { name: /de nutrientes/ })`. Cambiar de idioma rehace las plantillas. Budget                                                                                                                                                                                                                                                                                                |
| C6  | Socios: el objetivo en cuatro pasos, encima de la placa                                           | Cabecera de una línea con ⓘ y «Rastro X · +Y/s»; subtítulo; `<ol>` de cuatro pasos de alto fijo; línea del paso; condiciones y barra de calidad bajo la placa; `mapping.help` corregida. Antes, un prototipo en la rama mide el JS del plasmodio                                                                                                                                                                                               | e2e a 375 × 667: el paso actual en la primera pantalla; ≤ 40 palabras visibles antes del primer sitio; el paso 4 a la vista desde el primer copo; con los pasos 1–3 hechos y el mapa a medias, el paso 4 dice «sigue sola». `layout-stability.spec.ts`: la caja de la placa no se mueve al pasar del paso 1 al 2 ni al cumplir el 3. Unitaria: la línea de longitud contiene «como mucho» / «at most». #16 sigue cubierta (cambian las cadenas de `ui-plasmodium.test.ts:388,396`). Budget del plasmodio |
| C7  | Socios: la placa enseña su regla                                                                  | Avisos de primera vez (`coach.tap`, `coach.pulse`); leyenda con dos copos y «Bucle»                                                                                                                                                                                                                                                                                                                                                            | e2e: el aviso sale en la placa 1 nueva y se va al poner un copo; no tapa ningún sitio; sin animación con `reducedMotion: 'reduce'`. Budget                                                                                                                                                                                                                                                                                                                                                               |
| C8  | Socios: lo avanzado, cuando hace falta                                                            | Mejoras al tener Rastro, con «de Rastro» en los precios; `<details>` de Con tu red, Placas y Logros; «Cómo se juega» abierto hasta la primera placa cartografiada; el Caudal bajo la placa con `flow.locked`; lámina de llegada de 44 palabras; «Darle avena»; la lista de sitios solo si se pide o no cabe                                                                                                                                    | e2e: ≤ 60 palabras visibles al llegar a 375; `<summary>` con nombre propio; «Cómo se juega» abierto en la placa 1 y plegado tras cartografiarla; «Ampliar la placa» y #19 sin cambios. Budget del plasmodio                                                                                                                                                                                                                                                                                              |
| C9  | Descripciones: el efecto primero y la ciencia plegada                                             | `scienceDetails()` en el paquete principal; adaptaciones, adaptaciones de bioma, mejoras y vínculos del plasmodio, caudal; reglas de juego fuera de «La ciencia»; reglas de bioma con «×»                                                                                                                                                                                                                                                      | Unitaria: cada `*.science` conserva su cita, en es y en. `journey.test.ts` y `ui-wind.test.ts` actualizados. e2e: «La ciencia» se abre con teclado y cada `summary` tiene nombre distinto                                                                                                                                                                                                                                                                                                                |
| C10 | Textos: intros, pistas, láminas, confirmaciones y botones                                         | El resto de la tabla. Láminas ≤ 80 palabras. «Pierdes / Conservas». Botones verbo + nombre con `aria-label`. «offline» único. Sonido como interruptor con estado. Esporular con un umbral. «Lluvia ×1/3»                                                                                                                                                                                                                                       | e2e: la lámina de la tundra cabe en 375 × 667; el sonido expone su estado; Esporular sin la frase repetida. Cambian a propósito `ui-cycle.test.ts`, `wall.spec.ts`, `maturity.spec.ts`, `ui-vows.test.ts:71,98` y `cycle.spec.ts`. Excepciones de C0 en las declaradas                                                                                                                                                                                                                                   |
| C11 | Un aviso a la vista, encima de lo que va pegado abajo                                             | La ficha del árbol y la barra de Socios publican su alto en `--bottom-dock`; `.toasts` se coloca encima. Cola en `toasts.ts`: uno a la vista, logros simultáneos agrupados («3 logros nuevos»); la región viva sigue anunciando cada logro por su nombre                                                                                                                                                                                       | e2e: tres logros a la vista dan una tarjeta; con la ficha visible, la caja del aviso no se cruza con «Mutar» tras pulsarlo; en Socios, no tapa la última fila de sitios. La prueba de #9 sigue igual («Logro: Sin prisa»). Cambia `ui-notices.test.ts:19`                                                                                                                                                                                                                                                |
| C12 | Contraste de 3:1 en bordes y líneas, y la barra de pestañas avisa de que se desliza               | Tokens de borde y línea; estado por forma; borde difuminado; la pestaña activa se trae a la vista moviendo solo `tablist.scrollLeft`                                                                                                                                                                                                                                                                                                           | Unitaria de contraste sobre los tokens. e2e: la pestaña activa visible a 375 tras cambiar, y `window.scrollY` igual antes y después, a 375 y a 820                                                                                                                                                                                                                                                                                                                                                       |
| C13 | (Solo si dices sí a la pregunta 2) La franja de arriba se compacta al desplazar                   | `pinning.ts` y CSS: escenario de ~64 px con el núcleo tocable; cabecera de una línea; «Esporularías ahora» pasa a Esporular                                                                                                                                                                                                                                                                                                                    | `layout-stability.spec.ts` y regresiones de #20 y #25; el primer «Comprar» visible a 375 × 667; también al 130 %                                                                                                                                                                                                                                                                                                                                                                                         |
| C14 | Estado y hoja de ruta del bloque C                                                                | STATUS y ROADMAP                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Presupuestos (hallazgos 18 y 19):**

- **CSS inicial (8,4 de 9 kB).** Sustituir el CSS del árbol por el del boceto entero suma ~0,1 kB
  comprimido (medido: el boceto lleva además su andamiaje de página, así que es cota superior). Lo
  previsto de C2 a C13 ronda +0,5 kB: justo en el tope. Cada commit borra el CSS que sustituye (el
  `min-width: 36rem`, el `:has()`, la letra de 12 px) y mide su build. Si uno pasa de 9 kB, ese commit
  sube el tope a 10 kB con la cifra medida en ARCHITECTURE §7; no se descubre con el CI en rojo.
- **JS del plasmodio (19,2 de 20 kB).** Sin menú «Más», lo nuevo es la lista de pasos, la línea del paso,
  el control segmentado y la leyenda. Las piezas que sirven a todo el juego (el aviso de primera vez,
  `scienceDetails`, los iconos) van al paquete principal, que tiene 8,1 kB libres. Antes de C6 se mide
  un prototipo; si no cabe, C6 sube el tope a 21 kB con la cifra medida, en ARCHITECTURE §7.

---

## 9. Riesgos

1. **Choques con lo que se escribe en `fase-10`.** La interfaz de los votos ya está en commit; puede
   llegar más (documentos, ajustes). Mitigación: commits en orden, rebase antes de cada uno, y las
   pruebas del bloque B que cambian, nombradas en el commit que las cambia.
2. **Peso.** CSS inicial a 0,6 kB del tope y plasmodio a 0,8 kB. Mitigación: la sección 8.
3. **Saltos de la interfaz (BUG-JOURNAL #21 y #25).** Pasos de alto fijo, línea del paso de una línea,
   casillas con alto mínimo, ficha con su motivo reservado y Pulso de ancho fijo.
   `layout-stability.spec.ts` lo vigila.
4. **La placa a 375 × 667.** Con la cabecera a 107 px, el Laberinto cabe con 8 px de margen. Si la línea
   del paso o la cabecera crecen, pasa a lista a mitad de partida. Mitigación: alturas fijas y la
   unitaria de `computeLayout`.
5. **Letra grande del sistema.** El .apk la hereda (`MainActivity.java` no fija `setTextZoom`). Se
   respeta, no se fija al 100 % (WCAG 1.4.4), y queda escrito en ARCHITECTURE. Mitigación: pruebas al
   130 y al 200 %, la lista del árbol y de la placa como respaldo.
6. **Foco y lector (BUG-JOURNAL #5, #8 y #15).** Ficha, lista de selección, `<details>`, avisos de
   primera vez: cada pieza lleva su prueba de foco. No hay menú nuevo.
7. **Comprar en dos pasos en el árbol.** Cambia la costumbre. Mitigación: la comprable ya viene elegida.
8. **La ciencia, menos vista.** Mitigación: una cita por lámina a la vista, «La ciencia» a un toque y el
   teletipo igual.
9. **El icono no se reconoce** o se lee como asterisco. Mitigación: pista, tooltip, lector y la prueba
   de cinco segundos; si falla, rótulo fijo.
10. **WebKit (iPhone).** `<details>`, `position: sticky` y consultas de contenedor se comportan
    distinto. Se prueba en `mobile-webkit`; no hay iPhone físico (deuda conocida).
11. **Los jugadores del .apk no ven nada de esto hasta que instalen el nuevo a mano.** Es la pregunta
    que hiciste; respuesta en el informe.

---

## 10. Preguntas para ti

1. **¿Cuándo sale?**
   - **(A, recomendada)** Dentro de la 1.6.0, como bloque C, después de los votos (ya en commit). Un solo
     cambio de interfaz para los jugadores y una sola reinstalación del .apk.
   - **(B)** Una 1.6.1 justo después de la 1.6.0, que sale antes.
2. **¿Compactamos la franja de arriba al desplazar?** En la 1.4.2 pediste que el contador y el núcleo se
   quedaran fijos. Hoy ocupan el 53 % de un móvil de 375 × 667, y más con la letra del sistema grande.
   - **(Recomendado) Sí:** al bajar, una franja de ~64 px con el núcleo pequeño, que se sigue pudiendo
     tocar. Arriba del todo, todo vuelve a su tamaño.
   - **No:** se queda como está, y la ficha del árbol tiene menos sitio.
3. **¿Qué icono para los nutrientes?**
   - **(Recomendado) «Núcleo»:** el corazón con cinco hifas que ondean, como el botón.
   - **«Remolino»:** brazos curvados hacia el mismo lado; a tamaño pequeño puede recordar a una cruz gamada.

---

## 11. Revisión de la crítica: qué se aceptó y por qué

Cada hallazgo se comprobó en el repositorio (`fase-10`, HEAD `fd0c72b`), en el `dist` de las 23:09 o en
los bocetos. Veredictos: 28 aceptados (cuatro con un ajuste propio), 4 aceptados en parte y ninguno rechazado.

| #   | Hallazgo                                                             | Veredicto                  | Comprobación                                                                                                                                                                                                                                                                                                                                        | Dónde queda                                                                                                                                 |
| --- | -------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Los pasos esconden cómo se termina la placa                          | Acepta                     | `gainTrail` suma a `mapping` sin mirar el objetivo (`advance.ts:41–47`); fructifica con `mapping ≥ trailGoal` y 60 s estables (`advance.ts:135–138`); 4,3 millones en la placa 1 (`plasmodium-plates.ts:100`)                                                                                                                                       | §5: cuatro pasos a la vista; `mapping.help`, `howto.3` y `step.hold` corregidas                                                             |
| 2   | La barra en una fila no cabe desde la placa 2                        | Acepta, con otra cifra     | `barra.mjs` repetido: 280, 406 y 385 px para 309 libres; lámparas en las placas 2–5; el Caudal es un grupo de 3 con rótulo y nota (`plasmodium-view.ts:277–300`). La barra de 64 px que proponía no basta: con la línea del paso, el Laberinto (378) no cabría                                                                                      | §5: iconos con rótulo; barra ≤ 52 px y ≤ 78 con la línea; Caudal bajo la placa                                                              |
| 3   | El árbol pierde el requisito y el estado                             | Acepta                     | `opcion-3.html:232–251`: candado sin texto y `aria-pressed`; el juego ya tiene `mut.requires` y `mut.locked.label`                                                                                                                                                                                                                                  | §6: lista de selección, nombre con estado y unidad, ficha con motivo                                                                        |
| 4   | Faltan las dormidas y el árbol se pliega cuando hay que despertarlas | Acepta                     | `tab-mutations.ts` (`fd0c72b`) tiene `asleep` y `drowsy`, `wakeBudget` y `mut.wake*`; una dormida sigue comprada                                                                                                                                                                                                                                    | §6: cinco estados; «Árbol completo» solo sin dormidas                                                                                       |
| 5   | Con letra grande vuelve el desborde                                  | Acepta                     | `MainActivity.java` no llama a `setTextZoom`; el WebView sigue la letra del sistema; `zoom.json`: al 130 % se parten nombres y al 160 % hay 63 px de desplazamiento lateral; el juego usa rem (ningún `font-size` en px)                                                                                                                            | §6 y C3: consulta de contenedor, `min-height`, sin `hyphens`; pruebas al 130 y 200 %; ARCHITECTURE: se respeta la letra del sistema         |
| 6   | Los avisos aparecen encima de la ficha                               | Acepta                     | `.toasts` a `bottom: 76px` y `z-index: 60` en el móvil (`styles.css:2301–2305`); la ficha, a 57 px                                                                                                                                                                                                                                                  | C11: `--bottom-dock`                                                                                                                        |
| 7   | Tras «Mutar», un segundo toque compra otra                           | Acepta                     | Patrón de #21                                                                                                                                                                                                                                                                                                                                       | §6: la elección se queda; botón inerte 0,9 s; e2e de dos clics                                                                              |
| 8   | Los pasos crecen encima de la placa                                  | Acepta                     | El plan desplegaba barra y condiciones dentro del paso 2                                                                                                                                                                                                                                                                                            | §5: filas de alto fijo; condiciones bajo la placa; prueba de la caja de la placa                                                            |
| 9   | La línea del paso no dice la dirección                               | Acepta, con otra redacción | `goal.shortest` va «como mucho»                                                                                                                                                                                                                                                                                                                     | `step.line.*` con «al menos» y «como mucho», las palabras de `goal.quality` y `goal.shortest` (un término por concepto, no «meta: … o más») |
| 10  | El paso 2 no dice quién actúa; «Cómo se juega» plegado               | Acepta                     | `textos-final.json` (`howto.title`) dice «abierto hasta cartografiar la primera» y el §5 decía «plegado siempre»; `pulse.desc` es solo para el lector                                                                                                                                                                                               | «El plasmodio une los copos»; «Cómo se juega» abierto hasta la primera placa; `coach.pulse`                                                 |
| 11  | El icono se queda sin quien lo enseñe                                | Acepta en parte            | `hud.ts:140` oculta `core.hint` con la primera Hifa; `numberTooltip` es `null` bajo un millón; la pulsación larga es la única vía táctil. Se acepta la pista de primera vez, el tooltip siempre con «Nutrientes» y la prueba a 12 px. El rótulo fijo se deja como respaldo: suma una línea a una franja que ya ocupa el 53 % (familia de #20 y #25) | §7                                                                                                                                          |
| 12  | El Rastro se queda sin unidad                                        | Acepta                     | `trail.label` («Rastro») existe; el plan la borraba por no tener uso                                                                                                                                                                                                                                                                                | §5: «Rastro 64 · +0,6/s» y «50 de Rastro»; `trail.label` se usa                                                                             |
| 13  | Cinco nombres para tres cosas                                        | Acepta en parte            | «Copo» y «bucle», sí. Entre «círculo» y «sitio», «sitio»: ya está en 30 claves del lector y en `ui-plasmodium.test.ts:349`. «Lazo» no: en grafos es una arista a sí mismo; «ciclo» tampoco: es el ciclo libre                                                                                                                                       | §4 y `final/correcciones.json`                                                                                                              |
| 14  | Reglas de juego escondidas en «La ciencia»                           | Acepta                     | `flow.science` y `pupg.memory.science` de la tabla llevaban reglas                                                                                                                                                                                                                                                                                  | §4: `pupg.memory.desc`, `pupg.memory.effect` y `flow.locked`                                                                                |
| 15  | Los atajos solo los conoce el lector                                 | Acepta                     | `.core__keyhint` se oculta por debajo de 768 px; `plate.help.keys` es solo para el lector; `role="group"` no anuncia flechas                                                                                                                                                                                                                        | `plate.keys` y `mut.keys` visibles en escritorio; `role="listbox"`                                                                          |
| 16  | C6 exige la placa tocable en las cinco a 375 × 667                   | Acepta                     | `computeLayout` en vertical: 370, 378, 456, 532 y 490 px de alto para 381–386 libres. Ampliada a 375 × 667 tampoco: 293 × 407 px dan celdas de 73 × 58 px, bajo su `cellMin` (70–76)                                                                                                                                                                | §5 y C1/C6: dos placas a 375 × 667, cinco a 412 × 915; unitaria de `computeLayout`                                                          |
| 17  | El árbol choca con los votos del bloque B                            | Acepta en parte            | Desde `fd0c72b` (22:58) los votos están en commit: ya no hay 119 líneas sin commit ni pruebas sin seguimiento. Sigue valiendo lo demás: cinco estados y dos pruebas del bloque B que cambian a propósito                                                                                                                                            | §6, C2 y §8 (commits en orden)                                                                                                              |
| 18  | El CSS inicial está a 0,55 kB del tope                               | Acepta en parte            | `budget.ts` hoy: 8,4 de 9. Pero cambiar el CSS del árbol por el del boceto suma ~0,1 kB (medido), así que C2 solo no debería fallar; el riesgo es la suma de C2–C13                                                                                                                                                                                 | §8, «Presupuestos»                                                                                                                          |
| 19  | El JS del plasmodio se pasa en C6 o C7                               | Acepta                     | 19,2 de 20; la compensación de C8 no quitaba JS                                                                                                                                                                                                                                                                                                     | §8: sin menú «Más», piezas comunes al paquete principal, prototipo medido antes de C6                                                       |
| 20  | La prueba de textos de C0 no nace en verde                           | Acepta, con otro sitio     | `rules.mjs` usa umbrales distintos del §2 (mutación 10/45, confirmación 12/75, lámina por clave) y clasifica por defecto. El registro va en `tests/`, no en `src/i18n/`, para no pesar en el paquete                                                                                                                                                | §2 y C0                                                                                                                                     |
| 21  | Reglas no comprobables, y la de una línea no evita #25               | Acepta                     | `rules.mjs` cuenta cada marcador como 4 caracteres; el §2 decía «≤ 55 caracteres» con 45 por línea                                                                                                                                                                                                                                                  | §2: dato ≤ 45 con el peor valor; expresiones regulares; lista de revisión                                                                   |
| 22  | Renombrar marcadores falla en silencio                               | Acepta                     | `interpolate()` deja el marcador si falta el valor (`i18n/index.ts:94–99`)                                                                                                                                                                                                                                                                          | §4.3 y C4/C5                                                                                                                                |
| 23  | Faltan pruebas en la lista                                           | Acepta                     | Comprobadas las líneas citadas en `ui-cycle`, `ui-notices`, `maturity`, `wall`, `ui-plasmodium`, `ui-vows` y `cycle.spec`                                                                                                                                                                                                                           | §4.4 y §8                                                                                                                                   |
| 24  | C3 rompe la prueba de #14                                            | Acepta                     | `touch-scroll.spec.ts:68` y `scrolledFrom` lanza un error sin caja                                                                                                                                                                                                                                                                                  | C3                                                                                                                                          |
| 25  | Quitar el `:has()` parte los nombres entre 1024 y ~1380 px           | Acepta                     | `styles.css:295–303` lo documenta                                                                                                                                                                                                                                                                                                                   | §6: 4 columnas en todas las pantallas (76 px a 1024); prueba a 1024 × 768                                                                   |
| 26  | El menú «Más» rompe #19 y la vuelta del foco                         | Acepta, y se quita el menú | Tres pruebas pulsan «Ampliar la placa»; `onClose` enfoca `expandButton`. Los botones ya viven bajo la placa (`plasmodium__actions`)                                                                                                                                                                                                                 | §5: sin menú                                                                                                                                |
| 27  | C11 rompe #9 y el aviso tapa la ficha                                | Acepta                     | `regressions.spec.ts:143` espera «Logro: Sin prisa»                                                                                                                                                                                                                                                                                                 | C11: se agrupa lo que se ve; la región viva dice cada nombre                                                                                |
| 28  | `badapt.needLevel` en una clave rompe `i18n.test.ts`                 | Acepta                     | `i18n.test.ts:82` y `biome-adaptations.ts:131`                                                                                                                                                                                                                                                                                                      | §4: se quedan las cuatro                                                                                                                    |
| 29  | `scrollIntoView` mueve la página en la tableta                       | Acepta                     | `.tabs__list` es `sticky` entre 768 y 1023 px                                                                                                                                                                                                                                                                                                       | C12: solo `scrollLeft`; `scrollY` igual                                                                                                     |
| 30  | «⅓» no está en las fuentes                                           | Acepta                     | Rangos de `@fontsource` (subconjunto latino): ⅓ no está en ninguna de las dos; ½ y × sí. Revisada la tabla entera: ⅓ es el único carácter sin cubrir                                                                                                                                                                                                | «Lluvia ×1/3»; regla en el §2                                                                                                               |
| 31  | La tabla final no se puede aplicar tal cual                          | Acepta                     | 12 filas con instrucciones en vez de texto; `flow.locked` quedaba muerta; intros de 56–77 caracteres y dos frases                                                                                                                                                                                                                                   | §4: claves exactas; `flow.locked` como motivo; intros de una frase ≤ 45 (`final/correcciones.json`)                                         |
| 32  | Dejar los documentos para C14 va contra AGENTS.md                    | Acepta                     | `AGENTS.md:132–136`                                                                                                                                                                                                                                                                                                                                 | §8: documentos en cada commit; C14 solo STATUS y ROADMAP                                                                                    |

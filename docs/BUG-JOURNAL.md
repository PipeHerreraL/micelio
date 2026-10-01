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

| #         | Zona                          | Bug                                                                                        |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| [1](#1)   | `src/i18n/format.ts`          | Un contador que muestra «1.00 M» no tiene tooltip al pasar encima                          |
| [2](#2)   | `src/core/actions.ts`         | Al esporular con una gota en pantalla cae otra gota al instante                            |
| [3](#3)   | `src/systems/offline.ts`      | «Sin prisa» no se otorga al volver a una pestaña tras una noche en segundo plano           |
| [4](#4)   | `src/main.ts`                 | Una pestaña abierta en segundo plano pierde todo el tiempo hasta que se mira               |
| [5](#5)   | `src/ui/tab-upgrades.ts`      | Comprar una mejora con el teclado deja el foco perdido en la página                        |
| [6](#6)   | `src/main.ts`, `styles.css`   | El número flotante del clic no aparece en escritorio                                       |
| [7](#7)   | `src/ui/rain-drop.ts`         | En el móvil, tocar la gota absorbe en vez de atraparla                                     |
| [8](#8)   | `src/ui/hint.ts`              | Cerrar un aviso de primera vez con el teclado deja el foco perdido                         |
| [9](#9)   | `src/ui/live.ts`, `toasts.ts` | Los logros ganados offline no se anuncian ni se ven tras el informe «Mientras no estabas…» |
| [10](#10) | `src/main.ts`                 | Cambiar de idioma borra el aviso de que la partida no se está guardando                    |
| [11](#11) | `src/main.ts`                 | Importar o borrar dice «hecho» pero no guarda si el guardado estaba bloqueado              |
| [12](#12) | `src/ui/styles.css`           | En escritorio la página se desplaza hacia una franja vacía                                 |

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

<a id="2"></a>

## 2. Al esporular con una gota en pantalla cae otra gota al instante

**Zona:** `src/core/actions.ts` (`sporulate`)

**Síntoma.** Si había una gota visible al esporular, en el siguiente tick aparecía otra con sus
12 s completos y su aviso, en mitad del momento de la esporulación.

**Causa.** Al aparecer una gota, `updateRain` deja `rain.nextIn` en 0. `sporulate` solo hacía
`rain.drop = null`, así que la cuenta atrás seguía en 0 y el siguiente tick soltaba otra gota.
La prueba de reinicio no lo veía porque montaba la gota sin poner `nextIn` a 0.

**Arreglo.** `sporulate` llama a `evaporateDrop`, que quita la gota y sortea un intervalo nuevo.

**Qué lo sostiene.** `tests/actions.test.ts` → «esporular con una gota en pantalla no hace caer
otra gota en el siguiente tick». Falla sin el arreglo (comprobado).

---

<a id="3"></a>

## 3. «Sin prisa» no se otorga al volver a una pestaña tras una noche en segundo plano

**Zona:** `src/systems/offline.ts` (`applyBackground`)

**Síntoma.** Quien cerraba la pestaña y volvía 10 horas después conseguía «Sin prisa»; quien la
dejaba en segundo plano el mismo tiempo, no.

**Causa.** Solo `applyOffline` (al cargar) miraba el hueco real.

**Arreglo.** `applyBackground` otorga el logro con el hueco sin recortar, como `applyOffline`.

**Qué lo sostiene.** `tests/offline.test.ts` → «volver tras 10 horas en segundo plano otorga
«Sin prisa»». Falla sin el arreglo (comprobado).

---

<a id="4"></a>

## 4. Una pestaña abierta en segundo plano pierde todo el tiempo hasta que se mira

**Zona:** `src/main.ts` (arranque)

**Síntoma.** Abrir el juego con clic central (o que el navegador restaure la pestaña) y mirarla
tres horas después no daba nada por esas tres horas; cerrarla sin mirarla las perdía también.

**Causa.** `hiddenAt` solo se fijaba con un `visibilitychange` a oculta, que no llega si la
página ya nace oculta. Sin frames el estado se queda quieto, y al mostrarse no había hueco que
aplicar; el guardado de `pagehide` se fechaba con la hora real.

**Arreglo.** `hiddenAt` arranca en la hora de arranque si `document.hidden` es cierto.

**Qué lo sostiene.** Nada automático: el arranque toca el DOM. Ver la tabla de abajo.

---

<a id="5"></a>

## 5. Comprar una mejora con el teclado deja el foco perdido en la página

**Zona:** `src/ui/tab-upgrades.ts`

**Síntoma.** Tras comprar una mejora con Enter, el foco caía en `<body>`; el siguiente Espacio
absorbía en vez de comprar.

**Causa.** Al cambiar la lista de mejoras disponibles se rehacen las tarjetas y el botón
enfocado sale del documento.

**Arreglo.** `build()` recuerda qué tarjeta tenía el foco y lo devuelve a la misma mejora, a la
que ocupó su lugar o al panel.

**Qué lo sostiene.** `tests/ui-upgrades.test.ts` (con DOM simulado de happy-dom) → «tras
comprar una mejora, el foco sigue en una tarjeta de la lista». Falla sin el arreglo (comprobado).

---

<a id="6"></a>

## 6. El número flotante del clic no aparece en escritorio

**Zona:** `src/main.ts`, `src/ui/styles.css`

**Síntoma.** En escritorio, absorber no mostraba el «+1» flotante; en móvil salía tapado por el
núcleo.

**Causa.** La capa de números vivía dentro del escenario, que recorta (`overflow: hidden`), y en
escritorio el núcleo está en la columna izquierda, fuera de él.

**Arreglo.** La capa es fija sobre toda la página y los números se colocan en coordenadas de
viewport sobre el núcleo.

**Qué lo sostiene.** Nada automático. Ver la tabla de abajo.

---

<a id="7"></a>

## 7. En el móvil, tocar la gota absorbe en vez de atraparla

**Zona:** `src/ui/rain-drop.ts`

**Síntoma.** Cerca de una de cada cinco gotas caía debajo del núcleo, del contador o de los
efectos, que en móvil y tableta están encima del escenario: el toque absorbía.

**Causa.** La lógica sortea la posición sin saber de pantallas, y el escenario es un contexto de
apilamiento propio, así que la gota siempre quedaba debajo de esas capas.

**Arreglo.** La interfaz comprueba si la gota cae bajo algo que tapa el escenario y la mueve a
un hueco libre. El estado no cambia.

**Qué lo sostiene.** Nada automático. Ver la tabla de abajo.

---

<a id="8"></a>

## 8. Cerrar un aviso de primera vez con el teclado deja el foco perdido

**Zona:** `src/ui/hint.ts`

**Síntoma.** Tras pulsar «Entendido» con Enter, el foco caía en `<body>` y el siguiente Espacio
absorbía en vez de actuar en el panel. Misma familia que el #5.

**Causa.** El aviso se ocultaba con su botón enfocado dentro.

**Arreglo.** Antes de ocultarse, si contiene el foco, lo pasa al panel de la pestaña.

**Qué lo sostiene.** `tests/ui-hint.test.ts` (happy-dom). Falla sin el arreglo (comprobado por el
agente que lo escribió).

---

<a id="9"></a>

## 9. Los logros ganados offline no se anuncian ni se ven tras el informe «Mientras no estabas…»

**Zona:** `src/ui/live.ts`, `src/ui/toasts.ts`, `src/ui/modal.ts`

**Síntoma.** Al volver tras 8 horas, «Sin prisa» y otros logros se anunciaban mientras el modal
estaba abierto: la región aria-live era inerte y los avisos caducaban detrás del velo.

**Causa.** `showModal()` vuelve inerte todo lo que está fuera del diálogo.

**Arreglo.** Con un modal abierto, los anuncios y los avisos pasajeros esperan y salen al
cerrarlo (`onModalClosed`).

**Qué lo sostiene.** Nada en el repositorio (se probó con pruebas temporales). Ver la tabla.

---

<a id="10"></a>

## 10. Cambiar de idioma borra el aviso de que la partida no se está guardando

**Zona:** `src/main.ts`

**Síntoma.** Con el aviso fijo de «otra pestaña» o de guardado dañado en pantalla, cambiar de
idioma o notación (o importar, o borrar) lo hacía desaparecer, y con él su botón de recargar,
aunque el guardado seguía bloqueado.

**Causa.** El contenedor de avisos y la región aria-live vivían dentro de la interfaz que se
reconstruye.

**Arreglo.** Se crean una vez en `main.ts`, fuera de lo que se reconstruye, y los avisos fijos
se vuelven a mostrar en el idioma nuevo.

**Qué lo sostiene.** Nada automático. Ver la tabla.

---

<a id="11"></a>

## 11. Importar o borrar dice «hecho» pero no guarda si el guardado estaba bloqueado

**Zona:** `src/main.ts`

**Síntoma.** Con el guardado bloqueado (guardado dañado sin copia, u otra pestaña), importar o
borrar mostraban el aviso de éxito pero no escribían nada.

**Causa.** `saveNow()` no decía si había guardado, y el bloqueo no distinguía su motivo.

**Arreglo.** `blockedBy` recuerda si el bloqueo es por guardado dañado o por otra pestaña;
importar y borrar levantan solo el primero, y el aviso de éxito sale solo si se guardó.

**Qué lo sostiene.** Nada automático. Ver la tabla.

---

<a id="12"></a>

## 12. En escritorio la página se desplaza hacia una franja vacía

**Zona:** `src/ui/styles.css`

**Síntoma.** En escritorio se podía desplazar la página unos 455 px hacia abajo, a una franja de
humus vacía.

**Causa.** Los textos `.visually-hidden` de las pestañas son `position: absolute` y escapaban del
contenedor con desplazamiento del panel, alargando la página.

**Arreglo.** `.tabs__panels` es `position: relative` y `.visually-hidden` no tiene márgenes ni
bordes que sumen.

**Qué lo sostiene.** Nada automático. Ver la tabla.

---

## Bugs sin nada que los sostenga

Pueden volver. Se listan para que se vea.

| #         | Qué falta                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------- |
| [4](#4)   | Una prueba de navegador que arranque la página oculta y la muestre tras un hueco simulado       |
| [6](#6)   | Una prueba visual que haga clic en el núcleo en escritorio y busque el número flotante          |
| [7](#7)   | Una prueba de navegador a 390 px que fuerce gotas en el centro y haga clic sobre ellas          |
| [9](#9)   | Una prueba de DOM que abra un modal, emita un logro y compruebe que el anuncio sale al cerrarlo |
| [10](#10) | Una prueba de navegador que muestre el aviso de otra pestaña y cambie de idioma                 |
| [11](#11) | Una prueba que separe el bloqueo de guardado de `main.ts` en un módulo probable                 |
| [12](#12) | Una prueba visual que compare `scrollHeight` con la altura de la ventana en escritorio          |

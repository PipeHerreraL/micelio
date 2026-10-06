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

| #         | Zona                                                                      | Bug                                                                                        |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [1](#1)   | `src/i18n/format.ts`                                                      | Un contador que muestra «1.00 M» no tiene tooltip al pasar encima                          |
| [2](#2)   | `src/core/actions.ts`                                                     | Al esporular con una gota en pantalla cae otra gota al instante                            |
| [3](#3)   | `src/systems/offline.ts`                                                  | «Sin prisa» no se otorga al volver a una pestaña tras una noche en segundo plano           |
| [4](#4)   | `src/main.ts`                                                             | Una pestaña abierta en segundo plano pierde todo el tiempo hasta que se mira               |
| [5](#5)   | `src/ui/tab-upgrades.ts`                                                  | Comprar una mejora con el teclado deja el foco perdido en la página                        |
| [6](#6)   | `src/main.ts`, `styles.css`                                               | El número flotante del clic no aparece en escritorio                                       |
| [7](#7)   | `src/ui/rain-drop.ts`                                                     | En el móvil, tocar la gota absorbe en vez de atraparla                                     |
| [8](#8)   | `src/ui/hint.ts`                                                          | Cerrar un aviso de primera vez con el teclado deja el foco perdido                         |
| [9](#9)   | `src/ui/live.ts`, `toasts.ts`                                             | Los logros ganados offline no se anuncian ni se ven tras el informe «Mientras no estabas…» |
| [10](#10) | `src/main.ts`                                                             | Cambiar de idioma borra el aviso de que la partida no se está guardando                    |
| [11](#11) | `src/main.ts`                                                             | Importar o borrar dice «hecho» pero no guarda si el guardado estaba bloqueado              |
| [12](#12) | `src/ui/styles.css`                                                       | En escritorio la página se desplaza hacia una franja vacía                                 |
| [13](#13) | `src/main.ts`, `src/ui/app.ts`                                            | Tras borrar la partida no se puede importar un respaldo sin absorber antes                 |
| [14](#14) | `src/ui/styles.css`                                                       | En el móvil, deslizar sobre los generadores o las mejoras no desplaza la página            |
| [15](#15) | `src/ui/tab-partners.ts`                                                  | «Ver la placa» dejaba el foco en `<body>` en cuanto llegaba la vista del plasmodio         |
| [16](#16) | `src/partners/plasmodium/view/plasmodium-view.ts`                         | La calidad de la red se leía «0,66» junto a «falta»                                        |
| [17](#17) | `src/ui/tab-partners.ts`, `src/ui/partner-loader.ts`, `src/main.ts`       | Un error del código del plasmodio podía parar el juego entero                              |
| [18](#18) | `src/partners/plasmodium/state.ts`, `src/partners/plasmodium/advance.ts`  | Un guardado editado podía dejar al plasmodio sin guardarse para siempre                    |
| [19](#19) | `src/partners/plasmodium/view/plasmodium.css`, `plasmodium-view.ts`       | La placa ampliada no volvía a su tamaño al cerrarla                                        |
| [20](#20) | `src/ui/app.ts`, `src/ui/pinning.ts`, `src/ui/styles.css`                 | En el móvil, al bajar a las pestañas no había con qué absorber                             |
| [21](#21) | `src/ui/tab-generators.ts`, `src/ui/tab-upgrades.ts`, `src/ui/styles.css` | Comprar un generador o una mejora hacía saltar la lista                                    |
| [22](#22) | `src/i18n/index.ts`                                                       | El nivel de esporas se leía con todas sus cifras                                           |
| [23](#23) | `scripts/service-worker.ts`                                               | Sin conexión, la app instalada no arrancaba                                                |
| [24](#24) | `src/systems/save.ts`, `src/main.ts`                                      | Una versión vieja, sin conexión, podía pisar la partida de una más nueva                   |
| [25](#25) | `src/ui/hud.ts`, `src/i18n/`                                              | En el móvil, la franja fija de arriba saltaba a mitad de partida                           |
| [26](#26) | `src/i18n/` (`caption.compact`)                                           | En el móvil, la cartela partía «Selva del Chocó · 312/500» con el «·» al principio         |
| [27](#27) | `src/ui/wind.ts`, `src/core/forest.ts`                                    | Viento daba como récord del bioma el de otros votos                                        |
| [28](#28) | `scripts/sim-report.ts`                                                   | El simulador escondía partidas de más de una hora en el Chocó del ciclo libre              |
| [29](#29) | `src/systems/save.ts`, `src/systems/cycle.ts`                             | Un guardado con tantos ciclos cumplidos como empezados dejaba de guardarse al cumplir      |

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

**Qué lo sostiene.** `tests/e2e/regressions.spec.ts` → «una pestaña que arranca oculta recibe el tiempo que estuvo oculta al mostrarse» (Playwright, con reloj falso y la página oculta al nacer). Falla sin el arreglo (comprobado).

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

**Qué lo sostiene.** `tests/e2e/regressions.spec.ts` → «el número flotante del clic se ve sobre el núcleo, sin recortarse». Falla sin el arreglo (comprobado).

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

**Qué lo sostiene.** `tests/e2e/regressions.spec.ts` → «en el móvil la gota que cae en el centro no queda debajo del núcleo y se puede atrapar» (Pixel 7 e iPhone 14 emulados). Falla sin el arreglo (comprobado).

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

**Qué lo sostiene.** `tests/e2e/regressions.spec.ts` → «los logros ganados offline se anuncian al cerrar el informe «Mientras no estabas…»». Falla sin el arreglo (comprobado).

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

**Qué lo sostiene.** `tests/e2e/regressions.spec.ts` → «el aviso de otra pestaña sobrevive a cambiar de idioma» (dos páginas del mismo contexto). Falla si se vacía el contenedor al reconstruir (comprobado).

---

<a id="11"></a>

## 11. Importar o borrar dice «hecho» pero no guarda si el guardado estaba bloqueado

**Zona:** `src/main.ts`

**Síntoma.** Con el guardado bloqueado (guardado dañado sin copia, u otra pestaña), importar o
borrar mostraban el aviso de éxito pero no escribían nada.

**Causa.** `saveNow()` no decía si había guardado, y el bloqueo no distinguía su motivo.

**Arreglo.** `blockedBy` recuerda si el bloqueo es por guardado dañado o por otra pestaña;
importar y borrar levantan solo el primero, y el aviso de éxito sale solo si se guardó.

**Qué lo sostiene.** `tests/e2e/regressions.spec.ts` → «borrar la partida tras un guardado dañado sin copia sí guarda la partida nueva». Falla sin el arreglo (comprobado).

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

**Qué lo sostiene.** `tests/e2e/regressions.spec.ts` → «en escritorio la página no se desplaza más allá de la ventana». Falla sin el arreglo (comprobado).

---

<a id="13"></a>

## 13. Tras borrar la partida no se puede importar un respaldo sin absorber antes

**Zona:** `src/main.ts` (`wipeGame`), `src/ui/app.ts`

**Síntoma.** Después de «Borrar partida» la interfaz volvía a la de partida nueva, sin pestañas.
Quien borraba para importar un respaldo tenía que hacer cinco clics en el núcleo antes de
poder volver a Ajustes. Lo encontró la primera prueba de Playwright, no una persona.

**Causa.** Borrar crea un estado nuevo con `seen` vacío, y la interfaz de partida nueva
esconde el panel hasta que aparece el primer generador.

**Arreglo.** Borrar conserva la marca de Ajustes (`tab.settings`) y deja esa pestaña abierta;
la interfaz de partida nueva solo se usa si Ajustes aún no se había visto.

**Qué lo sostiene.** `tests/e2e/regressions.spec.ts` → «tras borrar la partida, Ajustes sigue a
mano para importar un respaldo» y `tests/e2e/smoke.spec.ts` → «exportar e importar devuelve la
misma partida». Falla sin el arreglo (comprobado).

---

<a id="14"></a>

## 14. En el móvil, deslizar sobre los generadores o las mejoras no desplaza la página

**Zona:** `src/ui/styles.css` (`.tabs__panels`)

**Síntoma.** Lo reportó el usuario en su teléfono: deslizar hacia arriba o hacia abajo solo
movía la página si el dedo empezaba fuera de las pestañas (el escenario, el contador). Sobre
la lista de generadores, las mejoras, el árbol o Ajustes no se movía nada, tocara o no un
botón de compra. En tableta pasaba lo mismo.

**Causa.** `.tabs__panels` tenía `overflow-y: auto` y `overscroll-behavior: contain` en todos
los tamaños. En escritorio el panel tiene altura fija y se desplaza solo; en tableta y móvil la
fila de la rejilla es `auto`, el panel mide lo que su contenido y no tiene nada que desplazar.
Aun así el navegador lo trataba como contenedor de desplazamiento, y `contain` impedía que el
gesto pasara a la página: el deslizamiento se perdía.

**Arreglo.** `overflow-y` y `overscroll-behavior` del panel solo se aplican desde 1024 px. En
tableta y móvil se desplaza la página entera.

**Qué lo sostiene.** `tests/e2e/touch-scroll.spec.ts` → «en móvil, deslizar sobre el contenido
de cualquier pestaña desplaza la página» y la misma prueba a 820 px («en tableta, …»). Desliza
el dedo con eventos táctiles reales (protocolo de Chromium, perfil Pixel 7) sobre Generadores,
Mejoras, Mutaciones y Ajustes. Falla sin el arreglo (comprobado: la página se queda en 0 px).
WebKit no expone ese protocolo, así que en iPhone el arreglo se apoya en la misma regla de CSS
pero no tiene prueba propia.

<a id="15"></a>

## 15. «Ver la placa» dejaba el foco en `<body>` en cuanto llegaba la vista del plasmodio

**Zona:** `src/ui/tab-partners.ts` (familia de #5 y #8)

**Síntoma.** Lo encontró la prueba de navegador antes de publicar la fase 9: tras la lámina de
llegada, «Ver la placa» llevaba a Socios y enfocaba el título del plasmodio, pero un momento
después el foco caía en `<body>`. Con el teclado, el siguiente Espacio absorbía en lugar de
actuar sobre el panel.

**Causa.** Mientras el código del socio llega aparte, la sección muestra un título provisional
con el mismo id (`#partner-plasmodium-title`). Al llegar la vista, la sección se rehacía con
`replaceChildren` y el título enfocado salía del documento.

**Arreglo.** Antes de rehacer la sección (vista o error de carga), si el foco estaba dentro se
vuelve a poner en el título nuevo con el mismo id.

**Qué lo sostiene.** `tests/e2e/plasmodium.spec.ts` → «la lámina de llegada sale una vez,
también tras el offline, y «Ver la placa» lleva a Socios»: comprueba que el título queda
enfocado. Falló sin el arreglo (primera corrida de la fase 9).

<a id="16"></a>

## 16. La calidad de la red se leía «0,66» junto a «falta»

**Zona:** `src/partners/plasmodium/view/plasmodium-view.ts` (familia de #1)

**Síntoma.** Lo encontró la revisión adversarial de la fase 9: con una calidad de 0,6596 en el
Tronco, el objetivo decía «Calidad de la red: 0,66 (objetivo: 0,66 o más) · falta» y la barra de
estabilidad no se llenaba, a veces durante más de 10 minutos. En el Laberinto, «1,10 (objetivo:
1,1 o menos) · falta».

**Causa.** La cifra se mostraba redondeada a dos decimales y el objetivo se decidía con el valor
sin redondear.

**Arreglo.** La calidad se muestra truncada hacia abajo y la longitud hacia arriba, al número de
decimales que se ven, y el umbral del Laberinto con dos decimales: lo que se lee cumple si y solo si
el objetivo se cumple.

**Qué lo sostiene.** `tests/ui-plasmodium.test.ts` → «una calidad de 0,6588 se lee «0,65 … falta»
y no «0,66 … falta»» y «en el Laberinto una longitud de 1,104 se lee «1,11 … falta», con el
objetivo a dos decimales». Fallan sin el arreglo.

<a id="17"></a>

## 17. Un error del código del plasmodio podía parar el juego entero

**Zona:** `src/ui/tab-partners.ts`, `src/ui/partner-loader.ts`, `src/main.ts`

**Síntoma.** Lo encontró la revisión adversarial de la fase 9, con un fallo simulado en la medida
de la red. La protección cubría el avance del modelo, pero la vista y los avisos del socio corrían
sin ella dentro del frame: la excepción salía de `frame()` y el bucle de la red se detenía hasta
recargar. Y tras un fallo, la pestaña Socios reintentaba la carga en cada refresco (10 veces por
segundo): el panel parpadeaba, el botón «Recargar la página» se rehacía y el foco caía en `<body>`.

**Causa.** El socio es código que llega aparte y puede fallar (un despliegue nuevo, un error), pero
solo una de sus tres entradas al bucle estaba protegida; y el panel pedía la carga siempre que el
estado no fuera «listo», también después de «falló».

**Arreglo.** La creación, el refresco, el frame y los eventos de la vista, y los avisos del modelo,
van en `try/catch`: un fallo da de baja al socio una sola vez, marca «falló» y deja el panel con
su botón de recargar. Tras un fallo no hay reintentos automáticos.

**Qué lo sostiene.** `tests/ui-partners-integration.test.ts` → «un error de la vista en create,
update, frame y onEvent no sale del bucle: el socio se da de baja y la sección ofrece recargar»,
«un aviso del socio que lanza no sale de main.ts: no hay aviso y el socio se da de baja» y «los
refrescos no reintentan la carga: el mismo botón «Recargar» sigue en su sitio y con el foco».
Fallan sin el arreglo.

<a id="18"></a>

## 18. Un guardado editado podía dejar al plasmodio sin guardarse para siempre

**Zona:** `src/partners/plasmodium/state.ts`, `src/partners/plasmodium/advance.ts`

**Síntoma.** Lo encontró la revisión adversarial de la fase 9 con un buscador de estados que pasan
la validación: un guardado con el Tronco sin cartografiar y «la placa siguiente se abre sola en
5 s» cargaba sin aviso; a los 5 s el modelo abría una placa no disponible, cada guardado devolvía
el plasmodio a su último bloque bueno (el mismo bloque roto) y el progreso del plasmodio no se
guardaba nunca más. Con un contador de pasos de 2^53 o más, la fuente del flujo dejaba de rotar y la
placa no cumplía nunca.

**Causa.** El validador comprobaba cada campo en su rango, pero no la espera de apertura contra el
mapa de la placa abierta, ni el contador de pasos contra un tope realista; y el modelo abría la
placa siguiente sin preguntar si estaba disponible.

**Arreglo.** Esos dos campos se reparan al cargar (a 0, sin rechazar el guardado: no se pierde
nada más), el contador de pasos tiene tope en el modelo, y la placa siguiente solo se abre si está
disponible.

**Qué lo sostiene.** `tests/plasmodium-save.test.ts` → «la apertura sola pendiente en una placa sin
mapa, o en la última, carga en 0 sin rechazar el guardado» y «un contador de pasos imposible carga
reiniciado en 0 sin rechazar el guardado»; `tests/plasmodium-model.test.ts` → «la espera de la
apertura sola no abre una placa sin la anterior cartografiada». Fallan sin el arreglo.

<a id="19"></a>

## 19. La placa ampliada no volvía a su tamaño al cerrarla

**Zona:** `src/partners/plasmodium/view/plasmodium.css`, `plasmodium-view.ts` (familia de #5 y #8)

**Síntoma.** Lo encontró la revisión adversarial de la fase 9 en Chromium: tras «Ampliar la placa»
y cerrar, o al estrechar la ventana, la placa seguía con el ancho grande, desbordaba el panel (que
pasaba a desplazarse en horizontal) y «Ampliar» desaparecía; el diálogo devolvía el foco a ese
botón oculto y el siguiente Espacio absorbía. Además la placa ampliada no cabía en el diálogo.

**Causa.** La columna de la rejilla crecía con el lienzo (`min-width: auto`), así que el ancho
medido para disponer la placa dependía del propio lienzo y el error se sostenía solo. El diálogo
seguía con el ancho máximo de los modales (32rem).

**Arreglo.** `min-width: 0` en el contenedor de la placa y `minmax(0, 1fr)` en la columna; el
diálogo de la placa ampliada con su propio ancho máximo, el mismo con el que se calcula la placa;
al cerrar, si «Ampliar» ya no sirve, el foco va al título.

**Qué lo sostiene.** `tests/e2e/plasmodium.spec.ts` → «ampliar la placa y cerrarla la devuelve al
ancho del panel, con el foco en «Ampliar»» y «al estrechar la ventana, la placa se encoge con el
panel». Fallan sin el arreglo.

<a id="20"></a>

## 20. En el móvil, al bajar a las pestañas no había con qué absorber

**Zona:** `src/ui/app.ts`, `src/ui/pinning.ts`, `src/ui/styles.css` (`.layout__top`)

**Síntoma.** Lo reportó el usuario en su teléfono tras la versión 1.4.0: al desplazarse hasta los
generadores o las mejoras, el núcleo se iba con el escenario y para absorber había que volver
arriba. En tableta pasaba lo mismo.

**Causa.** Por debajo de 1024 px la página entera se desplaza (#14) y el núcleo vive en el
escenario, arriba del todo. Solo el contador es fijo; nada sustituía al núcleo al perderlo de vista.

**Arreglo.** ~~Un «núcleo de bolsillo»: el mismo botón, de 64 px, fijo abajo a la derecha, que
aparecía mientras el núcleo no se veía (1.4.1).~~ El usuario no lo quería: pidió que la franja de
arriba, con el núcleo y el arte, se quedara fija y solo se desplazara el panel. Desde 1.4.2,
`.layout__top` es `sticky` por debajo de 1024 px, con el escenario más bajo para dejar sitio al
panel; `src/ui/pinning.ts` vuelve a la disposición de antes en Socios, con un campo de texto
enfocado y cuando al panel le quedarían menos de 200 px (ARCHITECTURE.md §4.30).

**Qué lo sostiene.** `tests/e2e/layout-stability.spec.ts` → «al bajar hasta el final de la lista,
la franja con el núcleo se queda arriba y se absorbe sin volver» (los dos móviles y, en los perfiles
de escritorio, 820 × 1180 y 768 × 1024), «en horizontal, sin sitio para el panel, la franja no se
fija», «en el móvil, escribir en Ajustes suelta la franja», «en tableta, con la lista abajo, la
barra de pestañas sigue bajo la franja» y «en el móvil, los efectos van sobre el escenario»;
`tests/e2e/plasmodium.spec.ts` → «en Socios la franja de arriba se va al bajar y la placa queda
entera y sin tapar»; `tests/ui-pinning.test.ts`. La primera falla sin el arreglo (el núcleo se
movía 365–1.052 px). Las pruebas del núcleo de bolsillo se fueron con él.

<a id="21"></a>

## 21. Comprar un generador o una mejora hacía saltar la lista

**Zona:** `src/ui/tab-generators.ts`, `src/ui/tab-upgrades.ts`, `src/ui/styles.css`

**Síntoma.** Lo reportó el usuario en su teléfono tras la versión 1.4.0: al comprar, los botones
cambiaban de tamaño y el juego «saltaba». Medido a 375 px: el botón de compra pasaba de 48 a 63 px
al dejar de llegar (la espera, «en 48 s», iba en una tercera línea) y todas las filas de abajo
bajaban 15 px; al volver a llegar, subían. Una mejora comprada desaparecía de golpe, todo lo de
abajo subía 96 px y un segundo toque compraba la mejora que llegaba bajo el dedo.

**Causa.** Cuatro, que se sumaban. La espera solo existía sin nutrientes suficientes, en su propia
línea. El texto de producción de cada fila cambia al comprar (cifras y porcentajes de todas las
filas) y pasaba de dos líneas a una o al revés (20 px, medido en WebKit a 390 px). La lista de
mejoras se rehacía entera al cambiar qué mejoras había. Y con la página más corta que la ventana,
la rejilla repartía el sobrante entre la cabecera, los efectos y el pie: al acortarse la lista,
todo lo de arriba bajaba 3,6 px.

**Arreglo.** Con el botón a todo lo ancho, coste y espera comparten línea; a tres columnas, la
espera reserva su línea aunque se llegue. El texto de producción reserva dos líneas. La lista de
mejoras cambia solo las tarjetas que entran o salen: la comprada se queda 0,9 s en su sitio como
«Comprada», inerte y con su alto fijado, y se pliega en 0,22 s; las nuevas se despliegan ya
pintadas; el foco pasa a la siguiente sin desplazar la página, y «No hay mejoras» espera a que se
pliegue la última. En móvil y tableta el panel ocupa el sobrante de la página (`1fr`).

**Qué lo sostiene.** `tests/e2e/layout-stability.spec.ts` → «comprar un generador hasta no llegar no
cambia la altura de los botones ni mueve las filas» (con el botón a todo lo ancho y a tres
columnas) y «una mejora recién comprada se queda en su sitio como «Comprada» y un segundo toque no
compra la de abajo», en los cinco perfiles; `tests/ui-upgrades.test.ts` → «la recién comprada se
queda en su sitio como «Comprada», sin poder pulsarse, y luego se pliega», «una tarjeta nueva se
mide para desplegarse con sus textos ya puestos» y «al comprar la última, «No hay mejoras» no
aparece encima de la comprada hasta que se pliega». Fallan sin el arreglo.

<a id="22"></a>

## 22. El nivel de esporas se leía con todas sus cifras

**Zona:** `src/i18n/index.ts` (`formatCount`, `tp`)

**Síntoma.** Lo vio el usuario en la cartela del bioma, en el móvil: «Acto I cumplido · nivel
44.108.702.360.816.946.000.000.000.000.000.000…», que además se salía de la cartela.

**Causa.** Las cantidades pasan por `fmt` (nombres de juego idle, §4.24), pero las cuentas
(niveles, esporas, clics, rangos) pasaban por `formatCount`, que escribía el entero entero.

**Arreglo.** `formatCount` escribe con nombre desde el millón, como `fmt`. En los plurales con nombre
detrás, el español lleva «de» («2 millones de esporas»); el inglés no.

**Qué lo sostiene.** `tests/format.test.ts` → «un nivel de esporas enorme se escribe con nombre de
magnitud, no con todas sus cifras» y «una cuenta de millones lleva «de» en español y nada en
inglés». Fallan sin el arreglo.

<a id="23"></a>

## 23. Sin conexión, la app instalada no arrancaba

**Zona:** `scripts/service-worker.ts` (v1.5.0)

**Síntoma.** Lo encontró la prueba de navegador antes de publicar: con el service worker ya
instalado, sin red y al recargar, la página salía en blanco. En Chromium, la página llegaba pero
los scripts y la hoja de estilos daban `net::ERR_FAILED`; en Firefox, ni la página.

**Causa.** Dos. El plugin que escribe `sw.js` corría antes que el de HTML de Vite, así que
`index.html` no entraba en la lista de lo que se guarda (y la versión no dependía de él). Y el
servidor manda `Vary: Origin`: los scripts de módulo se piden con `Origin` y la precarga sin él, y
Chromium, que respeta `Vary`, no los encontraba en la caché.

**Arreglo.** El plugin corre al final (`enforce: 'post'`) y las búsquedas en la caché ignoran
`Vary` (los archivos son estáticos y llevan el hash en el nombre).

**Qué lo sostiene.** `tests/e2e/pwa.spec.ts` → «sin conexión el juego vuelve a cargar, con su
partida y con lo que llega aparte» (Chromium y Firefox); `tests/pwa.test.ts` → «el código generado
es JavaScript válido y nombra cada archivo y su versión» (comprueba `ignoreVary`). Fallan sin el
arreglo.

---

<a id="24"></a>

## 24. Una versión vieja, sin conexión, podía pisar la partida de una más nueva

**Zona:** `src/systems/save.ts`, `src/main.ts` (v1.5.0, antes de publicarla)

**Síntoma.** Lo encontró la revisión, antes de que ocurriera: con el juego instalado, se recarga
con conexión y se juega a la versión nueva (que migra el guardado), y luego se abre sin conexión.
El service worker sirve la versión anterior, que da el guardado por dañado, lo copia a la de
respaldo, empieza una partida nueva y el autoguardado la escribe encima. De vuelta en línea, la
partida está vacía.

**Causa.** El service worker nuevo espera a que se cierre el juego para activarse (sin
skipWaiting), y una recarga no lo cierra: la caché activa sigue siendo la de la versión anterior.
Y la carga trataba igual un guardado roto que uno que no entiende porque es más nuevo.

**Arreglo.** Cada guardado lleva la versión del juego que lo escribió (`game`). Si no se entiende
y viene de un formato o de una versión posteriores, la carga devuelve `newer`: ni copia ni
partida encima, el juego no guarda nada (tampoco al borrar o importar) y un aviso pide recargar
con conexión.

**Qué lo sostiene.** `tests/save.test.ts` → «guardados de un juego más nuevo» (fallan sin el
arreglo); `tests/e2e/regressions.spec.ts` → «una versión anterior no pisa la partida que guardó
una más nueva, ni al borrar».

---

<a id="25"></a>

## 25. En el móvil, la franja fija de arriba saltaba a mitad de partida

**Zona:** `src/ui/hud.ts`, `src/i18n/` (familia de #20 y #21)

**Síntoma.** Lo encontró la revisión de capturas a 375 px antes de cerrar la interfaz de la fase 10:
la línea «Faltan 945 billones N en este bosque para la siguiente espora» cabía en una línea, y
«Faltan 1,99 mil millones N en este bosque…», no. Al cambiar el nombre de la cifra a mitad de
partida, la franja fija de arriba (#20) crecía o encogía 19 px y todo el panel de debajo saltaba. En
los ciclos de la fase 10 las cifras viven justo en esa frontera (unos mil billones en el Chocó).

**Causa.** El contador usaba el texto de Esporular, con «en este bosque», que a 375 px cabía o no
según el largo del nombre de la magnitud (a 360 px no cabía nunca).

**Arreglo.** El contador tiene su texto, más corto (`hud.nextSpore`, sin «en este bosque», que sigue
en Esporular): de 360 a 412 px cabe en una línea con cualquier nombre hasta «mil sextillones».

**Qué lo sostiene.** `tests/e2e/cycle.spec.ts` → «a 375 px, la franja fija de arriba no cambia de
alto con el nombre de la cifra de la siguiente espora» (cinco perfiles, con los 1,56 mil billones de
un ciclo en el Chocó). Falla sin el arreglo (comprobado: dos líneas en los cinco perfiles).

---

<a id="26"></a>

## 26. En el móvil, la cartela partía «Selva del Chocó · 312/500» con el «·» al principio

**Zona:** `src/i18n/es.ts` y `en.ts`, `caption.compact` y `caption.compactDone` (desde la 1.4.2)

**Síntoma.** Lo encontró la revisión de capturas a 375 px de la fase 10: la línea compacta de la
cartela se partía en dos con el separador al principio del segundo renglón («Selva del Chocó» /
«· 312/500»; en inglés, igual con «Chocó rainforest»). A 412 px el que se quedaba solo era «nivel»:
«Bosque natal · nivel» / «1941».

**Causa.** En el móvil la cartela termina antes del núcleo (ARCHITECTURE.md §4.30) y su texto
cabe en unos 95 px a 375 px, así que la línea compacta casi nunca cabe entera, y el navegador la
parte por cualquier espacio: también por los del separador y por el que va entre «nivel» y su
cifra.

**Arreglo.** Espacios duros en el catálogo: el «·» va pegado al nombre y «nivel» a su cifra, así
que el renglón se parte después del separador o dentro del nombre. La cifra sigue sin espacios
duros (#22: «44,1 mil sextillones» se parte por sus palabras). Descartado: pegar también la cifra
al «·», que en inglés dejaba «rainforest · 312/500» en un solo trozo más ancho que la cartela
(medido en Chromium: se salía 5 px). A 375 px, «Chocó rainforest» ocupa ahora tres renglones.

**Qué lo sostiene.** `tests/e2e/wind.spec.ts` → «a 375 px (y a 412 px), la línea compacta de la
cartela no se parte en su separador ni deja «nivel» sin su cifra» (cinco perfiles, en español y en
inglés, y que el texto no se salga de la cartela). Falla sin el arreglo (comprobado en los diez).

---

<a id="27"></a>

## 27. Viento daba como récord del bioma el de otros votos

**Zona:** `src/ui/wind.ts` (filas de sembrar) y `src/core/forest.ts` (`recordFor`, antes `bestRecord`)

**Síntoma.** Lo encontró la revisión del bloque B de la fase 10: con un ciclo de la taiga cumplido en
1 h con «sin lluvia» y otro en 3 h sin votos, la fila «Sembrar en la taiga» decía «Récord: 1 h»
aunque no hubiera ningún voto marcado. Un ciclo sin votos no puede batir ese tiempo: el voto rebaja
la meta.

**Causa.** La fila leía `bestRecord`, el mejor tiempo del bioma con cualquier combinación de votos.
Los récords se comparan dentro de cada combinación (D12 de la especificación de la fase 10), y
`writeRecord` ya los escribía así; solo la lectura de Viento los mezclaba.

**Arreglo.** `recordFor(records, biome, vows)` da el récord de una combinación exacta, y lo leen la
escritura del récord y las filas de sembrar. Cada fila dice el de los votos marcados para el
próximo ciclo: sin votos, «Récord: …» como antes; con votos, «Récord con estos votos: …» o «Aún sin
récord con estos votos». Descartado: el mejor del bioma con sus votos al lado («…, en 1 partida
(sin lluvia y sin mutaciones)»), que seguía mezclando metas distintas y a 375 px pasaba a dos
líneas (medido en los cinco perfiles; «Récord con estos votos: 1 h 12 min, en 12 partidas» cabe en
una).

**Qué lo sostiene.** `tests/ui-vows.test.ts` → «cada fila de sembrar dice el récord de los votos
marcados, no el mejor del bioma con otros votos» (falla sin el arreglo: comprobado, «Récord: 1 h, en
1 partida» en vez de «Récord: 3 h, en 2 partidas»), y `tests/e2e/cycle.spec.ts` → «a 375 px (y a
412 px), cada fila de sembrar dice el récord de los votos marcados y sigue compacta» (cinco
perfiles; las filas siguen en 110–150 px con la línea más larga).

---

<a id="28"></a>

## 28. El simulador escondía partidas de más de una hora en el Chocó del ciclo libre

**Zona:** `scripts/sim-report.ts` (`cycleRunMedians`, antes en `scripts/simulate.ts`)

**Síntoma.** Lo encontró la revisión final de la 1.6.0: BALANCE.md daba la partida más larga de la
primera vuelta del ciclo en el Chocó en 56:52 (objetivo ≤ 60 min), pero 22 de sus 36 ciclos tenían
alguna partida de más de una hora, y la mediana de la cuarta partida, contada bien, era 1:04:24. En la
calibración se había visto «saltar» a 1:08:01 al guardar esporas durante El regreso, y se atribuyó a
que el bot empezaba la vuelta con menos adaptaciones. STATUS, ROADMAP y ARCHITECTURE prometían que
ninguna partida del ciclo pasaba de una hora de mediana, y la que más importaba sí pasaba.

**Causa.** Cada ciclo guarda sus partidas en una lista con la de espera (la que paga la siembra)
delante, y la mediana por partida se tomaba índice a índice entre ciclos. En el bioma que abre la
vuelta, con espera en las nueve semillas, el índice 3 era la tercera partida de verdad: la mediana de
«la cuarta» mezclaba 27 cuartas con 9 terceras (de unos 36 min). Sin esperas, guardando durante El
regreso, los índices se alineaban y salía la cifra real: el salto era sobre todo la medida.

**Arreglo.** Las medianas por partida del ciclo se cuentan desde la siembra; la partida de espera va
aparte, con su propia columna en la tabla, y cuenta en la más larga (como pide la especificación) pero
no en la más corta (como la que cumple la meta, termina cuando alcanza, no con la regla de §17). Con
la medida buena el Chocó no cumplía, y se recalibró (docs/BALANCE.md): R 5e14 y requisito 5,5 R, con
la más larga en 58:45. La palanca que daba la especificación, subir el requisito, iba al revés: con
7 R la cuarta partida cargaba con más nivel y llegaba a 1:09:23.

**Qué lo sostiene.** `tests/sim-report.test.ts` → «la partida de espera no desplaza las demás: la
cuarta de cada ciclo se compara con la cuarta», «la espera va aparte, con la mediana de los ciclos que
la tuvieron, y cuenta en la más larga» y las otras dos. Fallan sin el arreglo (comprobado: la más larga
salía en 50 min en vez de 64,5).

**Qué aprender.** Una mediana por índice solo compara lo mismo si el índice significa lo mismo en
todas las series. Cuando una cifra cambia mucho por algo que no debería moverla, primero hay que
sospechar de la medida.

---

<a id="29"></a>

## 29. Un guardado con tantos ciclos cumplidos como empezados dejaba de guardarse al cumplir

**Zona:** `src/systems/save.ts` (`validateCycle`) y `src/systems/cycle.ts` (`checkCycleDone`) (familia
de #18)

**Síntoma.** Lo encontró la revisión final de la 1.6.0 con un buscador de estados (perturbaciones
que el validador acepta seguidas de acciones legales): `tests/fixtures/save-v7.json` (ciclo 3, dos
cumplidos, nivel 184) editado con tres cumplidos se importaba sin aviso y se guardaba. Al cumplir ese
ciclo quedaban cuatro cumplidos de tres empezados, y desde ahí cada autoguardado y el de `pagehide`
devolvían `'invalid'` (el aviso de guardado dañado) hasta la siguiente siembra, y otra vez al cumplir
cada ciclo después. Quien seguía esporulando en el bosque cumplido y cerraba la pestaña perdía lo
hecho desde el último guardado bueno. En una partida jugada no pasa: los buscadores sin
perturbaciones validaron en cada paso.

**Causa.** El validador solo pedía `done ≤ stays`. En el juego, con el ciclo en curso sin cumplir,
`done ≤ stays − 1`: sembrar pone el nivel en 0 y suma un empezado, y cumplir suma uno al cruzar 500,
una vez por ciclo. El validador aceptaba un estado desde el que el juego no podía seguir guardando, y
su prueba lo daba por bueno.

**Arreglo.** Al cargar, con un ciclo empezado y el nivel por debajo de la meta, `done` se repara a
`stays − 1` como mucho, sin rechazar el guardado: es solo presentación (el contador de la Crónica y
de Estadísticas, y el logro del primer ciclo, que ya se ganó). Si con eso un récord se queda sin
ciclo cumplido, el guardado se rechaza: repararlo dejaría otro estado que no se puede guardar.
Además, `checkCycleDone` nunca deja más cumplidos que empezados.

**Qué lo sostiene.** `tests/cycle.test.ts` → «un guardado con tantos cumplidos como empezados y el
ciclo en curso sin cumplir carga con uno menos y, al cumplirlo, se sigue guardando» y «el primer
ciclo sin cumplir con uno cumplido y un récord no carga: el récord pide un ciclo cumplido». Fallan sin
el arreglo (comprobado: cargaba con dos cumplidos de dos, y el segundo caso cargaba).

**Qué aprender.** Como en #18: un validador que comprueba cada campo en su rango puede aceptar un
estado que el juego nunca produce y desde el que ya no puede guardar. Hay que validar contra lo que
el juego hace, no solo contra los límites de cada campo.

---

## Bugs sin nada que los sostenga

Pueden volver. Se listan para que se vea.

| #   | Qué falta |
| --- | --------- |

Ninguno a 2026-10-01: desde la llegada de Playwright (`tests/e2e/`), todos los bugs del diario
tienen una prueba que falla sin su arreglo.

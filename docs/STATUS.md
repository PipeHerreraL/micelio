# En qué punto vamos

_Actualizado: 2026-10-02. Versión 1.5.0._

Este archivo responde una sola pregunta: **si me siento ahora mismo, ¿qué hago?**
Todo lo demás vive en otro lado y se enlaza desde aquí. Se actualiza al cerrar un
bloque de trabajo, no en cada commit.

- `AGENTS.md`: cómo trabajamos aquí. Léelo antes de tocar nada.
- `docs/BUG-JOURNAL.md`: los 24 fallos que ya costaron caro encontrar.
- `ARCHITECTURE.md`: el plan, con lo que resultó equivocado tachado.
- `docs/BALANCE.md`: tabla de valores y resultados del simulador.

---

## Estado por fase

| Fase | Qué                                                                                  | Estado                 |
| ---- | ------------------------------------------------------------------------------------ | ---------------------- |
| 0    | Plan, documentos raíz, repositorio y CI                                              | hecho                  |
| 1    | Núcleo jugable: estado, bucle, clic, 8 generadores, formato, guardado, offline, sim  | hecho (v0.1.0)         |
| 2    | Profundidad: mejoras, hitos, sinergias, logros, lluvia, estadísticas, noticias       | hecho (v0.2.0)         |
| 3    | Prestigio: Esporular, mutaciones, generadores 9 y 10, autocompra                     | hecho (v0.3.0)         |
| 4    | Pulido: canvas, sonido, responsive, accesibilidad, ajustes, exportar, inglés         | hecho (v0.4.0)         |
| 5    | Balance y entrega: campaña en el simulador, BALANCE.md, README, GitHub Pages, v1.0.0 | hecho (v0.5.0, v1.0.0) |

## Modelo de `GameState`

Un único objeto plano y serializable; la definición al día está en `src/core/state.ts`. Los
valores derivados (N/s, valor del clic, multiplicadores) no viven en el estado: se calculan en
`src/core/selectors.ts` con caché por estado e invalidación explícita (ARCHITECTURE.md §4.6).
El guardado es `{ version, savedAt, state }` en `localStorage['micelio:save']`, versión 6. Desde
la fase 9, `state.partners` guarda los socios (el plasmodio, con su placa, su red y su Rastro);
su estado y su validación viven en `src/partners/`.

## Lo último que se hizo

- **v1.5.0, instaladores para el móvil (petición del usuario):** el juego se instala como app
  desde el navegador (Android e iPhone), funciona sin conexión, y en Android hay además un .apk
  hecho con Capacitor que GitHub Actions firma y adjunta a cada release. Iconos generados por
  código a partir del núcleo. Para hacer sitio, las noticias llegan aparte: el JS inicial bajó de
  94,6 a 86,4 kB (ARCHITECTURE.md §4.31). Dos revisiones antes de publicar encontraron 23 fallos,
  todos arreglados; el más grave, que una versión vieja abierta sin conexión podía pisar una
  partida más nueva (BUG-JOURNAL #24).

- **v1.4.2, peticiones del usuario:** el núcleo de bolsillo no era lo que quería. Ahora, por
  debajo de 1024 px, la franja de arriba (contador y escenario con el núcleo y el arte) se queda
  fija y solo se desplaza el panel, con el escenario más bajo para dejarle sitio; en Socios, al
  escribir y en horizontal vuelve la disposición de antes (ARCHITECTURE.md §4.30, BUG-JOURNAL
  #20). Las cuentas grandes (el nivel de esporas en la cartela) se escriben con nombre y no con
  todas sus cifras (#22). Las noticias del sotobosque se quedan 20 s (antes 12) y hay 25 más,
  verificadas con fuentes.

- **v1.4.1, peticiones del usuario en el móvil:** ~~al bajar a las pestañas aparece un «núcleo de
  bolsillo» abajo a la derecha para seguir absorbiendo~~ (sustituido en 1.4.2), y comprar un generador
  o una mejora ya no hace saltar la lista: los botones miden lo mismo lleguen o no, y la mejora
  comprada se queda un momento como «Comprada» antes de plegarse (#21). ARCHITECTURE.md §4.30.

- **Fase 9 de la hoja de ruta (El Plasmodio, v1.4.0):** a los 5 min de la primera partida tras
  el Acto I llega el plasmodio de _Physarum polycephalum_, el primer **socio**, con su pestaña
  Socios. El jugador pone copos de avena y lámparas en cinco placas (del Tronco caído a la
  Fusión) y el modelo de flujo de Tero adapta la red; su moneda es el Rastro y da a la red la
  Poda (autocompra por amortización) y el Camino corto (ritmo de esporas). Su código llega aparte
  y nunca lo ejecuta el simulador de la red. Guardado versión 6: ninguna partida pierde nada
  (ARCHITECTURE.md §4.29).
- `npm run sim` mide también el plasmodio: 17 de 17 (las cinco placas en 4,65 h activo, el
  pasivo a 1,88 veces y un jugador ingenuo a 1,12); la red sigue en 42 de 42. 671 pruebas
  unitarias y 131 de navegador en los cinco perfiles; ~165 fps con la placa a la vista (159 con la
  CPU ×4).
- Una crítica del diseño destapó tres trampas que se corrigieron antes de programar (caudal,
  Memoria externa y Fusión), y una revisión adversarial confirmó 24 hallazgos, todos corregidos
  (BUG-JOURNAL #16–#19).
- Petición del usuario: la cantidad de compra **Hito** lleva cada generador justo hasta su
  siguiente hito.

- **Fase 8 de la hoja de ruta (Viento de esporas I, v1.3.0):** con el árbol completo y una
  Red planetaria se cierra el Acto I y el linaje puede dispersarse a la taiga o a la selva
  del Chocó, cada una con sus reglas, su suelo dibujado, tres adaptaciones propias y noticias.
  El nivel de esporas vuelve a 0 en cada bioma (las esporas salen de los nutrientes del
  bosque) y colonizar (nivel 500) da linaje ×2 y una entrada en la nueva pestaña Crónica.
  Guardado versión 5: ninguna partida 1.x pierde nada (ARCHITECTURE.md §4.28).
- El simulador juega el viaje en los dos órdenes: 42 de 42 objetivos (partidas de 21–29 min,
  colonizar en 2,1–3,2 h). 472 pruebas unitarias y 88 de navegador en los cinco perfiles;
  ~131 fps en el natal y en la taiga.
- Una revisión adversarial por dimensiones confirmó 20 hallazgos, todos corregidos (el más
  serio, un fallo del bot del simulador que había falseado la primera calibración).
- **v1.2.1:** en el móvil y en la tableta, deslizar sobre la lista de generadores, las mejoras
  o cualquier otra pestaña ya desplaza la página (BUG-JOURNAL #14). Solo en escritorio el
  panel de pestañas se desplaza por su cuenta.
- **Fase 7 de la hoja de ruta (Madurez de la red, v1.2.0):** por encima del nivel 1000 cada
  nivel de esporas aporta menos; las partidas de la 1.x que ya pasaban ese nivel conservan su
  bono (guardado versión 4). Cinco Adaptaciones repetibles debajo del árbol de mutaciones.
  Esporular muestra el bono efectivo y explica la madurez con texto.
- Con la regla de §17 ninguna partida de la 1 a la 16 baja de 6:25 (antes 2:46); el simulador
  cumple 21 de 21 objetivos. 395 pruebas unitarias y 67 de navegador.
- **Fase 6 (v1.1.0):** techo numérico, reinicios declarativos, historial de partidas y campaña
  larga en el simulador.

## Definición de terminado (PROMPT.md §22)

| Requisito                                                                               | Estado                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Se juega hasta la tercera esporulación sin bugs que bloqueen (acelerador de desarrollo) | Cumple: cinco esporulaciones seguidas con el panel de desarrollo a ×1000                                                                                                                        |
| El simulador cumple los objetivos de ritmo de §17                                       | Cumple: 18 de 18 (`docs/BALANCE.md`)                                                                                                                                                            |
| Funciona en Chrome, Firefox y Safari, escritorio y móvil, español e inglés              | Cumple con un matiz: Chromium, Firefox y WebKit (el motor de Safari), de escritorio y con móvil emulado, en los dos idiomas, en local y en CI. No se probó en un Safari ni en un iPhone físicos |
| El guardado resiste recargar, cerrar la pestaña, exportar e importar                    | Cumple: pruebas unitarias y de navegador                                                                                                                                                        |
| 60 fps estables y consola limpia                                                        | Cumple: ver «Fluidez medida»; consola limpia en el build de producción                                                                                                                          |
| Lint, pruebas y build en verde, también en GitHub Actions; publicado en Pages           | Cumple: CI con lint, 373 pruebas unitarias, build y 57 pruebas de navegador; juego en <https://pipeherreral.github.io/micelio/>                                                                 |
| `docs/STATUS.md`, `docs/BALANCE.md` y el README al día                                  | Cumple                                                                                                                                                                                          |

## Lo que sigue, en orden

La hoja de ruta está en [`docs/ROADMAP.md`](ROADMAP.md).

1. **Fase 10 — Viento de esporas II (v1.6.0):** pradera, tundra, el epílogo «El regreso» y el
   ciclo libre, que resuelve el muro que hoy queda tras colonizar el último bioma.
2. **Fase 11 — Tiempo profundo (v1.7.0):** las eras geológicas.

## Deuda conocida

- Las pruebas de navegador usan móvil emulado, no dispositivos físicos.
- La medición de fps es en escritorio (con la CPU frenada como aproximación al móvil).
- Dos objetivos del viaje quedan cerca del límite: el Chocó como segundo destino se coloniza
  en 2,06 h (objetivo ≥ 2 h) y el pasivo de la taiga segunda tarda 2,48 veces el activo
  (objetivo ≤ 2,5). Si un cambio de balance los mueve, el §14.4 de la especificación de la
  fase 8 dice qué palanca tocar (`docs/BALANCE.md`).
- La transición del suelo al dispersar (deduplicación de la esporulación, cambio de tamaño a
  mitad del fundido) se verificó con un arnés fuera del repo, no con una prueba del repo.
- El JS inicial pesa 86,4 kB de 95 (`npm run budget`): las noticias ya llegan aparte. Si hace falta
  más sitio, las coordenadas de las placas del plasmodio (unos 3 kB comprimidos) pueden salir a su
  propio trozo.
- La app de Android (.apk) se compiló y se comprobó en GitHub Actions (paquete, versión y firma),
  pero no se ha probado en un teléfono de verdad, ni la app instalable del iPhone. Desde 2027
  Google exigirá desarrolladores verificados también para los .apk descargados (antes, solo en
  Brasil, Indonesia, Singapur y Tailandia): habrá que registrar la app o pasar a Google Play.
- `npm audit` avisa de tres vulnerabilidades moderadas en `uuid`, que llega por la herramienta de
  Xcode del CLI de Capacitor: es solo de desarrollo y no entra en el juego ni en el .apk.
- La franja fija del móvil se probó con móviles emulados; la barra del navegador que aparece y se
  esconde (svh frente a lvh) hay que verla en un teléfono de verdad.
- Vaciar 1.200 s de modelo del plasmodio es un tirón de una vez al abrir o al volver: 20–27 ms en
  frío en escritorio, unos 100 ms en un móvil medio (ARCHITECTURE.md §7). Si molesta, la parte
  paso a paso se puede repartir entre frames.
- La Quimiotaxis aún no siempre lleva a una red que cumple con copos muy seguidos (2 s) en la
  Fusión con Humedad 0, ni en algunos casos con Memoria (medido en la revisión de la fase 9).
- El plasmodio no se probó en un iPhone físico.

## Cómo se entrega el trabajo

Rama única `main`, commits pequeños en verde. Cada fase cierra con lint, pruebas y
build en verde, commit, push, etiqueta `v0.N.0` y release.

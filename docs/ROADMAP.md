# Hoja de ruta después de la 1.0

_Decidida el 2026-10-01. Sale de una exploración de diseño con cinco direcciones, tres
jueces (experiencia de juego, coste técnico, balance) y una síntesis; las cifras marcadas
«prototipo» las midieron esos agentes con copias del simulador y hay que volver a medirlas
con `scripts/simulate.ts` antes de dar cada fase por buena._

## Diagnóstico

- **Las partidas se encogen.** El bono del nivel de esporas es lineal (+1 % por nivel) y la
  campaña duplica el nivel en cada partida. Las partidas 2 a 5 duran unos 28 min; de la 6 a la
  10 caen a 16:30, 13:51, 10:26, 8:00 y 5:53 (`docs/BALANCE.md`), y en la 16 a unos 3 min
  (prototipo).
- **Las esporas sobran.** El árbol de mutaciones cuesta 287 esporas y se completa al empezar
  la partida 7 (unas 2,9 h). Tras la partida 10 quedan unas 7.800 esporas sin uso.
- **El contenido se acaba a las 3–4 h de juego.**

## Decisiones del usuario

1. **Viento de esporas recorre biomas reales y, después, eras geológicas.**
2. **El primer modo no fúngico es el Plasmodio** (un moho mucilaginoso, que es un protista).
3. **Primero más contenido (Viento) y después el modo no fúngico.**
4. **Hay partidas avanzadas de la 1.0 que cuidar:** el rendimiento decreciente del nivel de
   esporas empieza en el nivel 1000 (no en 200), y hay que volver a medirlo.
5. **Game+ en la versión siguiente a la fase 10** (2026-10-04): volver a los biomas ya colonizados
   en escalones más difíciles, con premios que el ciclo libre no da. Va en la 1.7.0 como fase 11, y
   las eras geológicas pasan a la fase 12 (1.8.0). No cambia nada de la fase 10.
6. **Dos entregas pequeñas antes del game+** (2026-10-06): la 1.6.1 trae las actualizaciones del
   juego dentro de la app de Android y la 1.6.2 rediseña la interfaz y los textos. Nada de eso
   entra en la 1.6.0.

## Reglas comunes

- Nada nuevo mete en `computeDerived` un factor que cambie con el tiempo: los efectos entre
  sistemas dependen de valores lentos (al esporular, al comprar, al cambiar de etapa).
- Cada sistema nuevo tiene su moneda y su `rngSeed` propios; sus logros no suman al +1 %
  global.
- Todo sumidero de esporas crece ×2 por nivel, al ritmo del ingreso. Excepción medida:
  Dispersar cuesta 300 fijas, porque el ingreso por bioma es plano (el nivel vuelve a 0); por lo
  mismo, sembrar en el ciclo libre (fase 10) también cuesta 300 fijas. Y despertar una mutación
  dormida con el voto «sin mutaciones» (fase 10) cuesta lo de siempre, fijo: es un gasto por ciclo,
  que vuelve en cada ciclo con el voto y se paga con las esporas de ese ciclo, y el ingreso de un
  ciclo también es plano (el árbol entero, 287 esporas, cabe en las unas 500 de un ciclo).
  Los logros de Viento sí suman al +1 %: Viento no es un sistema con moneda propia
  (ARCHITECTURE.md §4.28).
- Cada fase es jugable y publicable sola, con su migración de guardado y sus objetivos en el
  simulador. Las 18 métricas de PROMPT.md §17 deben seguir cumpliéndose.

## Fases

La 1.5.0 no es una fase: son los instaladores para el móvil, que pidió el usuario antes de la
fase 10 (ARCHITECTURE.md §4.31). Desde ahí, cada fase sube una versión menor más. Tampoco son
fases la 1.6.1 y la 1.6.2, que el usuario pidió entre la fase 10 y la 11: suben el parche.

| Fase | Versión | Contenido                                                           | Tamaño |
| ---- | ------- | ------------------------------------------------------------------- | ------ |
| 6    | 1.1.0   | Cimientos (hecha)                                                   | S      |
| 7    | 1.2.0   | Madurez de la red y Adaptaciones (hecha)                            | M      |
| 8    | 1.3.0   | Viento I: fin del Acto I, Dispersar, taiga, Chocó y Crónica (hecha) | L      |
| 9    | 1.4.0   | El Plasmodio y la estructura de socios (hecha)                      | L      |
| 10   | 1.6.0   | Viento II: pradera, tundra, «El regreso» y ciclo libre (hecha)      | M      |
| —    | 1.6.1   | Actualizaciones del juego dentro de la app de Android               | —      |
| —    | 1.6.2   | Rediseño de la interfaz y los textos                                | —      |
| 11   | 1.7.0   | Game+: los biomas otra vez, en escalones más difíciles              | M      |
| 12   | 1.8.0   | Tiempo profundo: las eras geológicas                                | L      |

### Fase 6 — Cimientos (S)

- **Guardia contra números no finitos.** Si una cantidad llegara a `Infinity`, el guardado la
  escribiría como `null` y la partida se trataría como dañada. Hoy no ocurre (el techo de 10
  esporulaciones es 2,4e13), pero las campañas largas pueden alcanzarlo.
- **Reinicios declarativos.** Una tabla dice qué campos reinicia cada capa (esporular, y luego
  dispersar y pasar de era), con una prueba que clasifica cada clave de `createState()` para
  que un campo nuevo no se olvide (la familia del BUG-JOURNAL #2).
- **Simulador de campañas largas** (20 esporulaciones, dentro de `npm run sim`) y una segunda
  política del bot: esporular cuando se maximizan las esporas por minuto, no solo con la regla
  `max(10, nivel)`.
- **Historial de partidas** (duración, esporas, bioma) para la Crónica y las estadísticas.

### Fase 7 — Madurez de la red (M)

- Por encima de un umbral S0, cada nivel de esporas aporta menos:
  `factor = S ≤ S0 ? 1 + 0,01·S : 1 + 0,01·S0·(S/S0)^β`, continuo en S0. **S0 base = 1000**
  (decisión 4). β a fijar con el simulador (el prototipo con S0 = 200 midió β = 0,5).
- **Adaptaciones** repetibles, pagadas con esporas disponibles, en la pestaña Mutaciones al
  completar el árbol: _Cuerpo apical_ (sube S0 ×1,2 por rango; coste 100·2^r), _Esclerocio_
  (arrancar con más nutrientes), _Redistribución hidráulica_ (gota más larga), _Letargo
  profundo_ (offline más largo) y _Fuego de zorro_ (cosmético).
- La interfaz muestra el bono efectivo (hoy `tab-sporulate.ts` calcula `nivel × 1 %` a mano).
- Objetivo: con S0 = 1000, ningún jugador avanzado ve un recorte brusco, y las partidas
  largas dejan de caer por debajo de 10 min.
- **Resultado (v1.2.0):** ninguna partida existente pierde bono (la migración guarda su nivel
  como suelo lineal). Con la regla de §17, la partida más corta de la 1 a la 16 dura 6:25
  (antes 2:46) y sobra el 44 % de las esporas (antes casi todas). Con la del mejor ritmo nada
  cambia: ese jugador esporula pronto, su nivel apenas pasa de 100 y sus partidas ya rondaban
  los 10 min. Desde la partida 16 de la regla de §17 hay un muro; lo resuelve Dispersar.

### Fase 8 — Viento de esporas I (L)

- Al completar el árbol y tener una Red planetaria se cierra el **Acto I** con una lámina y
  aparece **Dispersar**: el linaje viaja a otro bioma; el nivel de esporas vuelve a 0 y las
  mutaciones viajan en las esporas.
- Biomas de esta fase: **taiga** (Red micorrícica y Árbol madre rinden más, llueve menos) y
  **selva del Chocó** (llueve más, el Rocío rinde más). Cada uno con 3 adaptaciones propias,
  paleta de horizontes en el canvas y noticias.
- **Crónica**: una entrada por bioma colonizado (nivel local ≥ 500).
- Las esporas se calculan con los nutrientes del bosque actual (`forest.earned`), no con los
  de toda la vida; sin esto el prototipo dio 11.330 esporas de golpe.
- Objetivos (prototipo, a medir): partidas de 20–33 min dentro de un bioma; colonizar en
  2–3,5 h.
- **Resultado (v1.3.0):** 42 de 42 objetivos en `npm run sim`. El Acto I se cierra a las
  3,3 h y ningún viaje pide partidas de espera. Partidas de 21–29 min de mediana (la más
  corta, de 13 min o más), colonizar en 2,1–3,2 h y el pasivo a 1,55–2,48 veces el activo, en
  los dos órdenes. Escalas del prototipo (taiga 1e11, Chocó 2e11) con ×3,5 en el segundo
  destino (con ×3 el Chocó segundo bajaba de 2 h). Ninguna partida 1.x pierde nada al
  actualizar (guardado versión 5). Ver ARCHITECTURE.md §4.28. Riesgos: el Chocó segundo
  (2,06 h) y el pasivo de la taiga segunda (2,48×) quedan cerca del límite; y sin destinos,
  tras el último bioma cada partida se alarga (hasta 1 h 6 min la cuarta en el orden
  Chocó→taiga): lo resuelve el ciclo libre de la fase 10.

### Fase 9 — El Plasmodio (L)

- _Physarum polycephalum_: sin cerebro, conecta copos de avena con redes comparables a la de
  trenes de Tokio (Tero et al., 2010) y resuelve laberintos (Nakagaki et al., 2000).
- El jugador coloca copos y lámparas en una placa y mira cómo la red engrosa los tubos útiles
  y deja secar los inútiles (modelo de flujo de Tero). Moneda propia: **Rastro**.
- Cinco láminas: Tronco caído, Laberinto, Archipiélago, Puente amargo (habituación a la
  quinina) y Fusión (dos plasmodios se funden y uno hereda la habituación del otro).
- Llega como primer **socio**: un registro común (`partners`) con su estado, validación,
  avance y offline, una pestaña nueva para los socios y su código cargado aparte.
- Conexión con la red, sin impuestos: correspondencias de calidad de vida en ambos sentidos.
- **Resultado (v1.4.0):** 17 de 17 objetivos en `npm run sim:plasmodio` y la red sigue en 42 de 42. El plasmodio llega a las 3,42 h de mediana (5 min dentro de la primera partida tras el
  Acto I); las cinco placas, en 4,65 h activo (el Tronco en 27 min, cada placa siguiente en
  38–81 min), el pasivo a 1,88 veces y un jugador ingenuo que coloca al azar (y sigue la
  Quimiotaxis cuando la compra) a 1,12 veces. 8 h de golpe dan el Rastro de 8 h en vivo. Tres
  trampas medidas y evitadas antes de publicar: el caudal solo en placas cartografiadas, la
  Memoria externa sin secar tubos con sustancia y la Fusión con sal en toda la placa para que
  el contagio importe. Ninguna partida 1.x pierde nada al actualizar (guardado versión 6, con
  un guardado real de la 1.4 como prueba). Ver ARCHITECTURE.md §4.29. Desviaciones: el JS
  inicial pesa 89,5 kB (estimado 65) y el del plasmodio 18,6 kB (estimado 12–15).

### Fase 10 — Viento de esporas II (M)

- **Pradera** (los Anillos de hadas rinden mucho más) y **tundra** (producción a la mitad,
  offline de 48 h: el bioma paciente).
- Epílogo **«El regreso»**: el bosque natal mil años después, con la Red planetaria dibujada
  uniendo las siluetas de los biomas.
- **Ciclo libre** con votos opcionales (sin lluvia, solo autocompra, sin mutaciones) que dan
  récords en la Crónica y adaptaciones cosméticas.
- **Decisiones del usuario (2026-10-04):** la tundra rinde entera lo que pasa de 8 h de una
  ausencia (el «deshielo», con el perfil ausente como objetivo) y la 1.6.0 sale en una sola
  entrega con los dos bloques: A (pradera, tundra, El regreso y ciclo libre con récords, que ya
  resuelve el muro) y B (votos y adaptaciones cosméticas).
- **Resultado (v1.6.0), bloque A:** pradera y tundra forman un segundo anillo que se abre con la
  taiga y el Chocó colonizados, así que los tramos 1–2 quedan idénticos bit a bit; sus tramos
  colonizan en 2,18–3,13 h con partidas de 21–31 min de mediana, y la mediana de cada partida no
  pasa de una hora (la más larga, 58:49, en la pradera tercera). El regreso es un tramo jugable más,
  al natal mil años después, que se cumple en 2,36–2,66 h; después, sembrar cualquiera de los cinco
  biomas por 300 esporas, con R y linaje fijos: la primera vuelta del ciclo dura 2,29–2,99 h por
  bioma, el régimen estable 1,46–2,03 h, y tampoco ahí la mediana de una partida pasa de una hora
  (contada desde la siembra; en la revisión final, el simulador escondía una de 1:04:24 en el Chocó
  y se recalibró: BUG-JOURNAL #28).
  Quien está hoy en el muro carga con los dos biomas nuevos abiertos y sin perder una cifra
  (guardado versión 7). Ver ARCHITECTURE.md §4.32.
- **Bloque B:** los votos se juran al sembrar y se pueden romper, nunca añadir; cada uno rebaja la
  meta del ciclo con un factor por bioma, calibrado con el simulador para que ningún voto suelto
  acorte el ciclo (en el régimen estable tardan 1,03–1,31 veces el ciclo sin votos) y para que las
  partidas de la primera siembra tras El regreso no pasen de 50 min (la especificación pedía 45: sin
  votos, las de la pradera y la tundra ya duran allí 39–40 min). Con «solo autocompra» la Poda no
  rige; con «sin mutaciones» el árbol se despierta con las esporas del ciclo. Cada voto mantenido
  hasta cumplir abre una adaptación cosmética (Esporada, Cordones negros e Higróforos). Ver
  ARCHITECTURE.md §4.33.
- `npm run sim`: 126 de 126 objetivos (los 39 de antes, idénticos; 3 redefinidos; 77 del bloque A,
  con el perfil ausente; 7 de los votos) y 17 de 17 del plasmodio. Riesgos: el Chocó del ciclo, al
  límite en las dos direcciones (la más larga de la primera vuelta en 58:45, el estable con
  partidas de 15:18 de mediana); las partidas de espera, en 1 de mediana, justo en su objetivo; y
  los tres votos juntos en la pradera, que tardan 0,95–0,99 veces el ciclo sin votos (aceptado: la
  especificación solo los acota por arriba).

### 1.6.1 — Actualizaciones dentro de la app (petición del usuario)

Decidida el 2026-10-06. Hoy, para tener una versión nueva en la app de Android hay que descargar e
instalar otra vez el .apk.

- La app descarga el código web de cada release y lo usa en el arranque siguiente (o al pulsar
  «Usar ahora»), sin reinstalar el .apk; solo un cambio en la parte nativa pide otro. ~~Con el
  plugin libre `@capgo/capacitor-updater` en modo propio, sin su nube: el paquete va firmado y sale
  de las releases de GitHub.~~
- **Decisiones del usuario (2026-10-06)**, tras investigar capgo y sus alternativas y una revisión
  adversarial del diseño: **un complemento propio** en Java, sin dependencias, en vez de capgo
  (escribe en el `localStorage` de la partida cada 15 s, su firma no cubre la versión y lo que la
  revisión pidió habría que construirlo igual por fuera de él), y **el paquete se firma en el PC del
  dueño**, no en GitHub Actions, para que la cuenta de GitHub sola no llegue a las partidas. El
  paquete sigue saliendo de las releases de GitHub. Diseño y descartes: ARCHITECTURE.md §4.34.
- ~~Antes de nada, comprobar que la partida se conserva al actualizar: el origen sigue siendo
  `https://localhost`, así que `localStorage` debería ser el mismo, pero hay que verlo en un
  teléfono.~~ La partida se conserva: el origen sigue siendo `https://localhost` (Capacitor cambia
  la carpeta que sirve, no el origen: comprobado en su código), una versión a prueba no escribe nada
  del guardado, la que no entiende la partida se retira sola y una anterior nunca pisa una más nueva
  (BUG-JOURNAL #32, también en la web). Lo comprueban emuladores de Android en el CI de cada cambio
  y el teléfono del usuario: con la app de depuración por USB y, con la 1.6.2 publicada, en la de
  verdad.
- Se trabaja en la rama `ota-1.6.1`, con PR en borrador, porque los emuladores y el .apk tienen que
  correr en el CI antes de publicar (AGENTS.md, «Git»).
- Quien tenga la 1.5.0 o la 1.6.0 instala una vez el .apk de la 1.6.1 encima; desde la 1.6.2, las
  versiones llegan solas. Mientras tanto, quien quiera que el .apk se actualice solo puede usar
  Obtainium (README); después, solo hará falta para los cambios en la parte nativa.

### 1.6.2 — Rediseño de la interfaz y los textos (petición del usuario)

Decidida el 2026-10-06, para después de la 1.6.1. El plan, aprobado por el usuario el mismo día,
está en [`docs/rediseno/plan.md`](rediseno/plan.md) (manda su caja de decisiones; los textos, el icono
y el boceto de Socios, en la misma carpeta). Lo que pidió:

- Textos más cortos, con la ciencia plegada.
- Socios con el objetivo en cuatro pasos.
- El árbol de mutaciones a cuatro columnas, con una ficha para cada nodo.
- Un icono para los nutrientes.

### Fase 11 — Game+ (M)

Petición del usuario (2026-10-04), para la versión siguiente a la fase 10. Diseño por hacer; lo que
pidió:

- **Volver a los biomas anteriores en escalones** (game+1, game+2…), cada uno más difícil que el
  anterior: meta y escala más altas y alguna regla nueva.
- **Premios que el ciclo libre no da:** mejoras permanentes o una moneda propia (con su `rngSeed`
  propio si la hay, como pide la regla común).
- No cambia nada de la fase 10: el ciclo libre y sus récords siguen como están.
- Riesgo ya medido en esta hoja de ruta: un premio multiplicativo pasivo acorta todas las partidas
  (ver la fase 12); el simulador tendrá que medir cada escalón.

### Fase 12 — Tiempo profundo (L)

- Una capa por encima de los biomas: la red se repliega en un esclerocio mientras el paisaje
  cambia (bosque tras el fuego, ladera volcánica, morrena glaciar, turbera) y recoloniza.
  Moneda propia: **Esclerocios**, para un árbol de la sucesión.
- Generador 11 con _Prototaxites_ (presentado como hipótesis: durante décadas se creyó un
  hongo gigante y hoy se discute).
- Riesgo medido en el prototipo: cualquier premio multiplicativo pasivo acorta las partidas;
  solo un nodo multiplica (×1,1) y el resto es comodidad o contenido.

## Pospuesto o descartado

- **Atlas de redes** (arrecife, hormiguero y otras redes como modos con interfaz propia):
  atractivo, pero XL y su sumidero se agota hacia la esporulación 15. El Plasmodio entra como
  primer socio sobre una estructura más pequeña; otros socios pueden sumarse después.
- **El Claro** (sucesión de un claro de bosque): buen candidato a segundo socio.
- **Dosel, Mantillo, Quórum, El año del bosque:** metían factores que cambian con el tiempo
  en `computeDerived`.

## Estimación

Unas 18–22 h de juego más sobre las 3–4 h actuales. Solo la Madurez (con S0 = 200) y el primer
bioma se midieron en prototipo; lo demás es estimación. El JS inicial pasaría de unos 52 kB a
unos 65 kB comprimidos, más el Plasmodio en carga aparte (unos 12–15 kB).

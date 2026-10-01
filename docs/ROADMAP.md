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

## Reglas comunes

- Nada nuevo mete en `computeDerived` un factor que cambie con el tiempo: los efectos entre
  sistemas dependen de valores lentos (al esporular, al comprar, al cambiar de etapa).
- Cada sistema nuevo tiene su moneda y su `rngSeed` propios; sus logros no suman al +1 %
  global.
- Todo sumidero de esporas crece ×2 por nivel, al ritmo del ingreso.
- Cada fase es jugable y publicable sola, con su migración de guardado y sus objetivos en el
  simulador. Las 18 métricas de PROMPT.md §17 deben seguir cumpliéndose.

## Fases

| Fase | Versión | Contenido                                                   | Tamaño |
| ---- | ------- | ----------------------------------------------------------- | ------ |
| 6    | 1.1.0   | Cimientos (hecha)                                           | S      |
| 7    | 1.2.0   | Madurez de la red y Adaptaciones                            | M      |
| 8    | 1.3.0   | Viento I: fin del Acto I, Dispersar, taiga, Chocó y Crónica | L      |
| 9    | 1.4.0   | El Plasmodio y la estructura de socios                      | L      |
| 10   | 1.5.0   | Viento II: pradera, tundra, «El regreso» y ciclo libre      | M      |
| 11   | 1.6.0   | Tiempo profundo: las eras geológicas                        | L      |

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

### Fase 10 — Viento de esporas II (M)

- **Pradera** (los Anillos de hadas rinden mucho más) y **tundra** (producción a la mitad,
  offline de 48 h: el bioma paciente).
- Epílogo **«El regreso»**: el bosque natal mil años después, con la Red planetaria dibujada
  uniendo las siluetas de los biomas.
- **Ciclo libre** con votos opcionales (sin lluvia, solo autocompra, sin mutaciones) que dan
  récords en la Crónica y adaptaciones cosméticas.

### Fase 11 — Tiempo profundo (L)

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

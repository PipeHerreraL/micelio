# Arquitectura

_Versión 1 de este documento. La numeración es del documento, no del juego._

Este es el plan: qué se decidió y por qué. **Conserva las correcciones.** Cuando algo
resulta equivocado se tacha y se explica, no se borra: un plan que solo registra sus
aciertos deja de servir para decidir, porque ya no se distingue lo razonado de lo
afortunado.

---

## 1. Qué es

Micelio es un juego idle para navegador, de escritorio y móvil, en español e inglés.
El jugador es una red de hongos que crece bajo el suelo de un bosque: absorbe nutrientes
con clics, compra generadores que producen solos, multiplica la producción con mejoras,
hitos y logros, y al madurar esporula para empezar de nuevo con bonos permanentes.

La especificación completa está en `PROMPT.md`. Este documento registra cómo se
implementa y las decisiones que la especificación dejó abiertas.

**Fuera de alcance en la versión 1:** backend, cuentas, multijugador, monetización,
anuncios, analítica, imágenes o audio externos e idiomas distintos de español e inglés.

## 2. La restricción que lo decide todo

**La lógica es pura, determinista y se prueba sin DOM.** Cuando dos opciones son
equivalentes, gana la que mantiene `src/core` libre de DOM, de reloj y de azar no
sembrado. Eso es lo que permite que el simulador de balance juegue partidas completas
con exactamente las mismas fórmulas que el jugador, y que el progreso offline sea un
cálculo y no una repetición de ticks. **Excepción (fase 9):** el modelo del plasmodio repite
hasta 1.200 segundos paso a paso al aplicar tiempo de golpe; ver §4.29.

En la práctica:

- `src/core`, `src/data`, `src/systems` y `src/partners` (salvo sus vistas) nunca llaman a
  `Math.random` ni a `Date.now` (ESLint lo prohíbe). El tiempo entra como parámetro; el azar pasa por `src/core/rng.ts`.
- La UI solo lee el estado y despacha acciones `(state, payload) => void`.
- La presentación (DOM, canvas, audio) nunca es la fuente de verdad de nada.

## 3. La forma

```text
main.ts ──► bucle: acumulador de 50 ms ──► core/tick ──► estado
   │                                          │
   │                                          └─► core/events (cola) ──► ui/avisos, audio, render
   ├─► requestAnimationFrame ──► render/ (canvas) y ui/ (como máximo 10 Hz)
   └─► systems/save (cada 15 s, visibilitychange, pagehide, tras esporular)
```

- `core/`: estado, fórmulas, selectores con caché, acciones, tick y cola de eventos.
  **No** sabe que existe un navegador.
- `data/`: tablas de balance y claves de texto. **No** contiene lógica ni texto visible.
- `systems/`: guardado, offline, lluvia, autocompra y logros. Puede tocar `localStorage`
  (solo `save.ts`), pero nada de DOM.
- `ui/`: componentes que crean su DOM una vez y luego solo cambian los nodos cuyo valor
  cambió. **No** calculan balance: preguntan a los selectores.
- `render/`: canvas de la red y partículas. Lee el estado; nunca lo escribe.
- `audio/`: síntesis con Web Audio. Reacciona a eventos.
- `i18n/`: catálogos y formato con `Intl`. Ningún texto visible vive fuera de aquí. Los
  catálogos de cada socio llegan aparte (`i18n/partners/`).
- `partners/` (fase 9): los socios. Su núcleo va en el paquete inicial; su modelo y su vista
  llegan aparte con `import()` y nunca los ejecuta el simulador de la red (§4.29).

## 4. Decisiones

### 4.1 Sin framework de UI (React descartado)

**Elegido:** TypeScript puro con componentes mínimos (`{ root, update, destroy }`) que
crean el DOM una vez y escriben `textContent` o atributos solo cuando el valor cambia.

**Descartado: React.** El estado cambia 20 veces por segundo; React reconciliaría el
árbol completo en cada tick aunque solo cambien tres números, y para evitarlo habría que
memoizar casi todo. Además suma unos 45 kB comprimidos a un presupuesto de 150 kB. La
interfaz de un idle es casi estática con pocos nodos vivos: lo que React resuelve no es
el problema que tenemos.

**Lo revisaríamos si** la interfaz pasara a tener formularios complejos o mucho estado
local de componentes.

### 4.2 Canvas 2D sin motor (Phaser descartado)

**Elegido:** Canvas 2D propio para la red y Web Audio para el sonido.

**Descartado: Phaser.** Es un motor de escenas, físicas y sprites para un juego que es
sobre todo interfaz: botones, números y pestañas accesibles que deben ser `<button>`
reales. Phaser dibuja todo en canvas (sin accesibilidad nativa), pesa más de 300 kB y
duplicaría el bucle de juego. La única pieza gráfica es una red procedural que cabe en un
módulo.

### 4.3 Números nativos detrás de `src/core/num.ts`

**Elegido:** `type Num = number` y todas las operaciones de balance (`add`, `mul`, `pow`,
`log`, comparaciones, serialización) en `src/core/num.ts`. Los conteos enteros (unidades
poseídas, clics) son `number` normales.

**Por qué:** el simulador muestra que el balance no pasa de `1e300` en las primeras 10
esporulaciones (ver `docs/BALANCE.md`), así que `break_eternity.js` sería peso muerto hoy.
Encapsular las operaciones deja la migración en un solo archivo.

**Lo revisaríamos si** la campaña del simulador supera `1e300` antes de la décima
esporulación.

### 4.4 TypeScript ejecutado por Node, sin `tsx`

**Elegido:** `npm run sim` ejecuta `node scripts/simulate.ts` con el borrado de tipos
nativo de Node 24. Por eso los imports relativos llevan extensión `.ts`
(`allowImportingTsExtensions`) y el código solo usa sintaxis borrable
(`erasableSyntaxOnly`: sin `enum` ni `namespace`).

**Descartado: `tsx` o `vite-node`.** Serían una dependencia más para algo que Node ya hace.

### 4.5 TypeScript 6.0, no 7.0

**Elegido:** TypeScript `~6.0.3`.

**Por qué:** `typescript-eslint` 8.71 exige `typescript <6.1`. TypeScript 7 (el port
nativo) aún no es compatible con el linter con tipos.

**Lo revisaríamos cuando** `typescript-eslint` acepte TypeScript 7.

### 4.6 Selectores con caché por estado e invalidación explícita

**Elegido:** `src/core/selectors.ts` guarda los derivados en un `WeakMap<GameState, Derived>`.
Cada acción que cambia un multiplicador (compra, evento, logro, esporulación, carga y, desde
la fase 8, dispersar, colonizar y comprar una adaptación de bioma) llama a `invalidate(state)`. Un estado nuevo (carga, simulador) arranca sin caché. Los socios (fase 9) no
invalidan: ningún selector los lee.

**Por qué no un campo `rev` en el estado:** ensuciaría el guardado con un dato de caché.
**Por qué no recalcular siempre:** el bucle corre a 20 Hz y la UI pide derivados a 10 Hz;
recalcular 10 generadores es barato, pero la regla de la especificación existe para que no
crezca sin control cuando se sumen sinergias y logros.

**Riesgo:** olvidar una invalidación da un N/s viejo. Lo sostienen las pruebas de
`tests/selectors.test.ts`, que comparan el valor en caché con un cálculo sin caché tras
cada acción.

### 4.7 Cola de eventos del núcleo

**Elegido:** `src/core/events.ts` es una cola (`emit`, `drain`) de eventos planos
(`achievement`, `purchase`, `rainSpawn`, `rainCaught`, `effectEnd`, `sporulate` y, desde la
fase 8, `actOneClosed`, `colonized`, `disperse` y `rainFell`; desde la fase 9,
`partnerUnlocked` y los eventos propios de cada socio, como `{ type: 'plasmodium', kind }`…). El
núcleo emite; `main.ts` vacía la cola en cada frame y reparte a avisos, sonido y canvas.

**Por qué:** las acciones mantienen la firma `(state, payload) => void` y el núcleo no
importa nada de presentación. El simulador simplemente vacía y descarta la cola.

### 4.8 Reloj de juego y lluvia

- El bucle mide el tiempo real con `performance.now()` y lo convierte en pasos fijos de
  50 ms. Nunca se cuentan ticks para medir tiempo.
- La lluvia usa una cuenta atrás (`rain.nextIn`) que **solo avanza con ticks en vivo**. Al
  aplicar tiempo de forma analítica (offline o pestaña oculta) la gota visible se evapora y
  la cuenta atrás no avanza: así no hay lluvia offline ni gotas acumuladas.
- El intervalo entre gotas se sortea uniforme entre 120 y 300 s (÷1.3 con Olfato de
  lluvia) y empieza a contar cuando la gota anterior se resuelve (atrapada o evaporada).
- **Tormenta eléctrica** multiplica por 500 el valor completo del clic (`V`), no solo `M`:
  así sigue importando en partidas avanzadas, donde `M` es despreciable frente a `qP`.
- **Rocío** usa la producción actual (`P`), que ya incluye cualquier evento activo.
  ~~En la práctica no se solapan: el intervalo mínimo entre gotas (92 s con Olfato) supera la
  duración máxima del Aguacero (90 s con Tormenta perfecta).~~
  **Corrección (fase 8):** en el Chocó llueve el doble (46 s de espera mínima con Olfato) y sí
  se solapan; se mantuvo la producción con evento porque así se midió el balance del Chocó.
  En el natal sigue sin pasar.

### 4.9 Repositorio público y GitHub Pages

**Elegido:** repositorio `micelio` **público** con licencia MIT, publicado en
<https://pipeherreral.github.io/micelio/> con origen GitHub Actions.

~~**Elegido por el usuario:** repositorio `micelio` **privado** con licencia MIT.~~

**Corrección (2026-10-01):** el repositorio se creó privado, pero GitHub respondió
«Your current plan does not support GitHub Pages for this repository» al activar Pages con
la cuenta gratuita. El usuario decidió hacerlo público. Público, además, los minutos de
Actions no se facturan.

### 4.10 Tiempo aplicado de forma analítica

`applyElapsed(state, seconds, efficiency)` reparte el intervalo en tramos: mientras dure
un Aguacero activo, `E = 5`; el resto, `E = 1`. Así una pestaña oculta durante un Aguacero
recibe exactamente lo que habría producido en vivo. Se usa igual para offline (eficiencia
0.5 o 1 y límite 8 h o 24 h) y para volver de segundo plano (eficiencia 1, mismo límite).

- El tiempo en segundo plano cuenta como tiempo jugado (el juego seguía abierto); el
  offline no.
- La producción sin evento sale del selector (`productionWithoutEvent`) y no dividiendo la
  total por `E`: desde la fase 8, los clics automáticos de las Hormigas cortadoras no se
  multiplican igual que los generadores.
- Un intervalo negativo (reloj que retrocede) se trata como cero.
- «Sin prisa» se otorga por el hueco real, no por el recortado al límite.
- Desde la fase 9, los socios reciben su tiempo **antes** que la red, con su propio tope y su
  eficiencia (`applyPartnersElapsed`): un socio que llega al final del tiempo de la red no recibe
  el tiempo en que no existía.

### 4.11 Revelación permanente

Un generador revelado (silueta o completo) queda registrado en `seen` y no vuelve a
ocultarse, ni al gastar ni al esporular: el jugador ya lo descubrió. Las pestañas siguen la
misma regla.

### 4.12 `<dialog>` nativo para los modales

`showModal()` da foco atrapado, `Esc` y fondo inerte sin código propio, y funciona en
Chrome, Firefox y Safari ≥ 15.4.

### 4.13 Fuentes autoalojadas

`@fontsource/im-fell-english` (títulos, regular e itálica para nombres científicos) y
`@fontsource/source-sans-3` (interfaz, 400 y 600), solo el subconjunto `latin`
(U+0000–00FF más puntuación general), que cubre las tildes, la eñe, `¿ ¡ « »` y `…` de
ambos idiomas. Una prueba (`tests/i18n.test.ts`) verifica que cada carácter de los
catálogos cae dentro del `unicode-range` de las fuentes importadas.

### 4.15 Qué aparece y cuándo

- Al empezar solo se ven el núcleo, el contador y la indicación (PROMPT.md §12).
- Generadores, Estadísticas y Ajustes aparecen juntos con el primer generador en silueta
  (5 N, a los cinco clics). Ajustes no necesita aparecer antes: el sonido está mudo hasta la
  primera interacción y `prefers-reduced-motion` se respeta sin tocar nada.
- Mejoras, Logros, Esporular y Mutaciones siguen la regla de la especificación.
- Las pestañas y los generadores revelados quedan en `seen` y no vuelven a ocultarse (§4.11).

### 4.16 Botón que no alcanza: `aria-disabled`, no `disabled`

Un botón de compra sin fondos sigue siendo enfocable y legible: dice «en 1 min 20 s» con
texto (nada depende solo del color) y su tooltip sigue disponible con el teclado. Un
`disabled` real lo sacaría del orden de tabulación y el lector de pantalla no llegaría a
saber cuánto falta.

### 4.17 Autocompra del más caro al más barato

El umbral (10 %, 50 % o 100 % de los nutrientes) se evalúa con los nutrientes de cada
momento. Si se recorriera de la Hifa hacia arriba, las unidades baratas gastarían primero y
el generador caro casi nunca entraría en el umbral.

### 4.18 Guardado con la pestaña oculta

Con la pestaña oculta el estado no avanza (no hay frames). Si el guardado periódico se
fechara con la hora real, al cerrar la pestaña después se perdería el tiempo que estuvo
oculta. Por eso: al ocultarse se guarda y se anota la hora; mientras siga oculta no hay
guardado periódico, y cualquier guardado (por ejemplo, `pagehide`) usa esa hora.

### 4.19 Máximo comprable en el borde exacto

`maxAffordable` se verifica contra la forma cerrada `C(n, k)`, que es lo que se cobra al
comprar un lote (PROMPT.md §7). En coma flotante esa forma puede quedar un ulp por encima
de la suma unidad a unidad (34.72500000000001 frente a 34.725 para tres Hifas), así que justo
en el borde «Máx» puede comprar una unidad menos que tres compras sueltas. Se decidió no
añadir tolerancia: «Máx» nunca debe ofrecer un lote que luego `spend` rechace, y en juego
los nutrientes crecen 20 veces por segundo, así que el borde exacto dura un instante.

### 4.20 Agrupación de cifras según el idioma

`Intl.NumberFormat` con la agrupación por defecto de cada idioma: en español «1234» va sin
separador y «12.345» con él (norma de la RAE para cuatro cifras); en inglés, «1,234».

### 4.21 Esporas siempre a la vista

Desde que aparece la pestaña Esporular, el contador muestra debajo de N/s cuántas esporas
darías ahora y cuántos nutrientes ~~de vida~~ del bosque faltan para la siguiente (fase 8: las
esporas salen de los nutrientes del bosque actual, §4.28). La especificación pide
que se vea «siempre»; meterlo solo en la pestaña obligaría a abrirla para saberlo.

### 4.22 La gota nunca cae debajo del núcleo

En móvil y tableta el núcleo está encima del escenario. La lógica sortea la posición de la
gota sin saber de pantallas (está en `src/systems`), así que la interfaz la refleja al otro
lado si cae a menos de 44 px del borde del núcleo. El estado no cambia: solo dónde se dibuja.
Desde la fase 8 esquiva también la cartela del bioma, en la esquina del escenario.

### 4.23 Noticias al azar en la interfaz

El ticker elige al azar entre las noticias desbloqueadas evitando repetir las últimas. Usa
`Math.random` porque vive en `src/ui`: no afecta al estado ni al simulador.

### 4.24 Números con nombres de juego idle (petición del usuario)

~~Desde 1e6, sufijos cortos (M, B, T… hasta Dc); desde 1e36, notación científica siempre
(PROMPT.md §13).~~

**Corrección (2026-10-01, a pedido del usuario):** la notación por defecto escribe el nombre del
orden de magnitud, como en los juegos idle: «1,5 millones», «2,3 mil millones» en español
(escala larga, la correcta en español) y «1.5 Million», «2.3 Billion» en inglés. Los nombres
llegan hasta 1e63 (vigintillion / mil decillones), así que en partida no aparece la notación
exponencial: el balance de 10 esporulaciones no pasa de 1e14 (ver `docs/BALANCE.md`). Desde 1e66
se vuelve a la científica. Sin ceros de relleno: «1 millón», no «1,00 millones».

- En Ajustes se puede elegir sufijos cortos (M, B…), científica o ingeniería.
- El tooltip de un número grande da la cifra entera («1.500.000.000»); con sufijos cortos,
  también el nombre largo.
- Los guardados de la versión 1 tenían «suffix» por defecto: la migración 1 → 2 los pasa a
  nombres y respeta científica e ingeniería.

### 4.25 Pruebas de navegador con Playwright

**Elegido:** `@playwright/test` con cinco perfiles: Chromium, Firefox y WebKit (el motor de
Safari) en escritorio, y Pixel 7 e iPhone 14 emulados. Corren contra el build de producción
(`vite preview`), siembran partidas en `localStorage` antes de cargar y usan el reloj falso de
Playwright para el tiempo en segundo plano. En local, Chromium es el Edge de Windows (sin
descarga); en CI, el Chromium de Playwright.

**Por qué:** siete bugs del diario solo se reproducían con un navegador real (foco, capas,
visibilidad, `storage` entre pestañas). La primera corrida encontró uno nuevo (#13).

**Lo que mide y lo que no:** `npm run perf` mide frames con una partida avanzada. El WebKit de
Playwright en Windows da unos 50 fps incluso con una página vacía (tope del motor en ese
sistema, no del juego); Safari en un iPhone real no se ha probado.

### 4.26 Cimientos para crecer: techo, reinicios declarativos e historial (fase 6)

- **Techo numérico.** `num.clamp` deja toda cantidad entre 0 y `num.CEILING` (1e300), y `gain`
  la aplica. Por encima de ~1.8e308 un `number` es `Infinity`, que JSON escribe como `null`: la
  partida pasaría por dañada al cargar. Además, `saveGame` valida el texto antes de escribirlo y
  devuelve `invalid` sin tocar el último guardado bueno; la interfaz lo avisa una vez.
- **Reinicios declarativos.** `src/core/resets.ts` clasifica cada campo de `GameState` como
  `run`, `life` o `custom` para cada capa de reinicio. El tipo obliga a clasificar todas las
  claves y una prueba compara los campos `run` con una partida nueva. Las capas que llegan
  (dispersar, pasar de era) añaden su propia tabla en vez de repetir asignaciones a mano.
- **Historial de partidas.** `history` guarda las últimas 50 partidas (esporulación, duración,
  esporas y fecha) para la Crónica y las estadísticas. Guardado versión 3, con migración.
- **Campaña larga en el simulador.** `npm run sim` juega también 20 esporulaciones con dos
  reglas: la de PROMPT.md §17 y la del mejor ritmo de esporas por minuto, que es la que haría un
  jugador que optimiza y la que debe guiar el balance de la fase 7.

### 4.27 Madurez de la red y Adaptaciones (fase 7)

- **Fórmula.** El factor del nivel de esporas S es `1 + 0,01·S` hasta el umbral S0 y
  `1 + 0,01·S0·(S/S0)^β` por encima, continuo en S0 (`sporeFactor`, `src/core/formulas.ts`).
  S0 = 1000·1,1^r, con r el rango de Cuerpo apical; β = 0,5.
- **S0 = 1000 y no 200** (lo que midió el prototipo): decisión del usuario para no recortar
  las partidas avanzadas de la 1.x. Además, la migración 3 → 4 guarda en `sporeFloor` el nivel
  de quien ya pasaba del umbral, y el umbral efectivo es el mayor de los dos: **ninguna
  partida existente pierde bono al actualizar**; solo los niveles nuevos rinden menos.
- **Cuerpo apical más débil que en el prototipo** (300·2^r esporas y umbral ×1,1 por rango, no
  100·2^r y ×1,2). Con los valores del prototipo, el bot llegaba a la partida 9 con miles de
  esporas sobrantes, compraba 6 o 7 rangos de golpe y el umbral dejaba de morder: las
  partidas 9 a 13 seguían en 6–9 min. Medido con la campaña larga (`docs/BALANCE.md`).
- **Adaptaciones horizontales:** Esclerocio (arrancar con 10^(3+r) N), Redistribución
  hidráulica (gota +2 s por rango), Letargo profundo (offline +6 h por rango) y Fuego de zorro
  (solo cosmético). Aparecen con el árbol completo, en la pestaña Mutaciones.
- **Lo que no arregla, a propósito:** con la regla de §17 (esporular al duplicar el nivel),
  desde la partida 16 cada partida se alarga mucho. Ese muro es la señal para Dispersar, que
  llega en la fase 8 y devuelve el nivel a 0 en cada bioma.

### 4.28 Viento de esporas I: biomas, Dispersar y Crónica (fase 8)

- **El bosque vive en el estado.** `forest` (bioma, tramo, nutrientes ganados allí y marcas de
  llegada), `chronicle` (una entrada por bosque cerrado) y `biomeAdaptations`. Lo colonizado y
  lo visitado no se guardan aparte: se deducen de la Crónica (`src/core/forest.ts`), así la
  regla vive en un solo sitio. Guardado versión 5; la migración deja toda partida 1.x en el
  natal con `forest.earned` = nutrientes de vida, y la validación cruza bosque, Crónica, rangos
  e historial.
- **Las esporas salen de los nutrientes del bosque**, con requisito y escala por bosque:
  1e8 en el natal; en un destino, R = escala del bioma · 3,5^(tramo − 1) (taiga 1e11, Chocó
  2e11). Con los de toda la vida, el prototipo daba 11.330 esporas de golpe al llegar. En el
  natal los dos valen lo mismo bit a bit, y el simulador da idéntico en las 21 métricas de
  antes.
- **Linaje:** producción ×2 por bioma colonizado fuera del natal. Sin él, el segundo bioma
  tardaba 4–5,5 h. Todos los factores nuevos (bioma, adaptaciones de bioma, linaje, obreras)
  cambian solo al dispersar, comprar o colonizar, que invalidan: ninguno cambia con el tiempo
  (ROADMAP, reglas comunes).
- **El Acto I y la colonización los decide el núcleo** (`src/systems/journey.ts`), no la
  interfaz: el tick lo comprueba una vez por segundo y el tiempo analítico al final, así el
  simulador y una partida 1.x lo ven sin pantalla. El Acto I mira el logro de la Red
  planetaria y no `owned` (que se reinicia al esporular): una partida 1.x que ya la tuvo lo
  cierra al cargar. Son las dos únicas funciones que escriben en la Crónica, una entrada por
  tramo como mucho: el tope se pone donde se construye.
- **Dispersar esporula si la partida puede** y esas esporas ayudan a pagar el viaje: el Acto I
  se cierra a mitad de partida, y obligar a esporular y luego dispersar eran dos confirmaciones
  y dos animaciones seguidas. Reinicia con su propia tabla (`DISPERSE_RESET`), con la lluvia
  del destino desde la llegada. Esporular conserva su sorteo de lluvia de siempre (solo si
  había gota), para que el azar del natal no cambie.
- **Dos excepciones a las reglas comunes del ROADMAP, a propósito:** Dispersar cuesta 300
  esporas fijas (el nivel vuelve a 0 en cada bioma, así que el ingreso por bioma es plano y un
  coste fijo ya va a su ritmo; con 300 y luego 600 hacía falta una partida más de espera), y
  los cinco logros de Viento suman al +1 % como los demás: Viento no es un sistema nuevo con
  moneda propia, usa esporas y el azar común, y ninguno de esos logros se alcanza sin dispersar.
- **Adaptaciones de bioma:** tres por bioma, ×2 por rango, con el nivel local que pide cada
  rango (colonizar los abre todos). Se aprenden en su bioma y valen en todos: en esta versión no
  se vuelve a un bioma, y una compra que caducara al irse castigaría haberla hecho.
- **Chocó:** la gota que nadie atrapa cae sola y aplica su efecto, pero solo al expirar con el
  juego abierto; `evaporateDrop` (offline, segundo plano, esporular) sigue sin efecto, o una
  partida nueva empezaría con un Aguacero heredado. No cuenta como atrapada: «Atrapa N gotas»
  sigue siendo verdad. Las Hormigas cortadoras suman clics automáticos a la producción (el N/s
  visible, el offline y el segundo plano los cobran sin código aparte) y el clic del jugador
  no las ve, para que no se realimenten.
- **Textos que cambian por bioma:** no se renombran generadores (romperían logros y
  costumbres); en la selva baja no hay abetos ni otoño, así que el Chocó sustituye seis
  textos con claves `<clave>.choco` (`biomeText`, `src/ui/biome-text.ts`).
- **Láminas en cola calculada del estado** (`src/ui/chapter.ts`): salen igual tras offline,
  migración o recarga, esperan a que no haya otro modal ni animación y navegan en `onClose`,
  cuando el `<dialog>` ya devolvió el foco.
- **La regla del mejor ritmo no guía el balance del viaje.** En un bioma esporula muy a
  menudo y coloniza la taiga mucho más tarde que la de §17 (ver la línea informativa de
  `docs/BALANCE.md`): no es la mejor estrategia para colonizar.
- **Descartado:** renombrar generadores por bioma; R por tramo ×25/×220 (las partidas del segundo
  bioma bajaban a 9 min); bajar la escala del primer destino (7e10 y 1,2e11 con ×4,5), que solo
  compensaba un fallo del bot del simulador: tras el Acto I gastaba en Cuerpo apical las esporas
  que un jugador lleva al viaje. Corregido el bot, valen las escalas del prototipo con ×3,5.

### 4.29 El Plasmodio y la estructura de socios (fase 9)

- **Un socio es otro organismo con su propia moneda, su propio azar y sus propios logros**
  (`src/partners/`). Cada uno tiene dos mitades: el núcleo (paquete inicial: validar su estado,
  decidir cuándo llega, apuntar su tiempo y dar ventajas a la red) y el modelo y la vista, que
  llegan aparte con `import()` (`src/ui/partner-loader.ts`). Una partida sin socio no descarga
  nada de esto. Sumar un socio es añadir su estado, su núcleo, su cargador y su unión de eventos
  en `src/partners/registry.ts`; el núcleo de la red no cambia.
- **El socio no toca la red.** No entra en `computeDerived`, no invalida la caché (§4.6), sus
  logros viven en su estado y no suman al +1 %, y su semilla sale de la común con `mixSeed` sin
  avanzarla. El núcleo de la red solo comprueba la llegada (tick y tiempo analítico, como el
  Acto I); el tiempo del socio lo apunta `main.ts` y lo avanza su modelo. El simulador de la red
  nunca ejecuta un modelo de socio, y `npm run sim` comprueba además que la red sale idéntica,
  minuto a minuto, con un plasmodio con sus dos ventajas y la lluvia en la placa.
- **Guardado versión 6.** `partners` es `life` en las dos tablas de reinicio: reiniciarlo sería
  un impuesto a esporular. Un socio que no valida no hace perder la red: al cargar vuelve a
  empezar (copia de respaldo y aviso), al importar se avisa en la confirmación, y al guardar
  vuelve a su último bloque válido y la red se guarda igual (`saveGame` devuelve `restored`).
  `tests/fixtures/save-v6.json` es un guardado real de la 1.4: si la forma cambia sin migración,
  su prueba falla.
- **El modelo es el de Tero y colegas (2010)** con fuente por turno e integrador exponencial
  (`src/partners/plasmodium/flow.ts`), en el mismo orden que el prototipo con el que se midieron
  umbrales y economía. Las cinco placas son datos literales (`src/data/plasmodium-plates.ts`)
  generados una vez con el generador del prototipo; `scripts/plasmodium-plates.ts` conserva su
  procedencia y una prueba comprueba que los reproduce. Así no hay placas sin solución ni grafos
  distintos entre navegadores, y el guardado se valida sin el modelo.
- **Reloj propio en ms enteros.** Trocear un intervalo da lo mismo bit a bit. **Excepción a §2:**
  el tiempo aplicado de golpe repite hasta 1.200 segundos de modelo paso a paso y cobra el resto
  al ritmo final, que nunca fructifica ni cambia la estabilidad; 8 h de golpe dan el Rastro de 8 h
  en vivo con un error menor del 0,1 %, y vaciar 1.200 s cuesta 8–10 ms de mediana en escritorio, 20–27 ms la primera vez (en frío, justo al llegar el modelo): un tirón aceptado de una vez al abrir o al volver (§7).
  Un modelo puramente analítico no podía decir cuándo una red se adapta y cumple el objetivo.
  Mientras el modelo no ha llegado, el tiempo queda pendiente (con su tope de 8 h, o 24 h con
  Latencia) y se guarda; el modelo avanza sobre una copia que solo se conserva si termina, y un
  fallo lo da de baja sin parar el bucle. Los avisos de una llamada se agrupan: la cola de
  eventos tiene tope (§4.7).
- **Llega en una partida posterior a la del Acto I, a los 5 min** (en un bioma, a los 5 min de
  la partida): la primera calma tras la autocompra y sin tres láminas seguidas. Medido con
  `npm run sim`: a las 3,42 h de mediana.
- **Trampas que el diseño evita, medidas:** el caudal solo se cambia en placas ya
  cartografiadas (con Alto la referencia no cumplía en cuatro placas); la Memoria externa no seca
  los tubos con sustancia (la Fusión no se cumplía ni con la colocación de la Quimiotaxis); «A
  prueba de cortes» pide la red estable (la placa empieza cubierta y sin puentes, así que con tres
  copos se ganaba en el primer segundo); la Fusión lleva sal en toda la placa y el plasmodio de la
  derecha solo aprende al fundirse (con la sal repartida al azar el contagio no influía).
- **Correspondencias, solo de calidad de vida:** Poda (la autocompra por amortización con
  `bestPurchase`, la regla del bot), Camino corto (el ritmo de esporas en Esporular, sin
  recomendar nada: §4.28 midió que el mejor ritmo no es la mejor regla para colonizar) y Lluvia
  en la placa (`main.ts` despacha `noteFungalEvent`; `systems/rain.ts` no cambia).
- **La placa es accesible sin el lienzo:** cada sitio es un botón de 44 px con su contenido y su
  acción en el nombre, con foco itinerante, flechas, 1, 2 y 3 para la herramienta, y una vista de
  lista. La celda nunca baja de la mínima medida en los datos (`cellMin`) ni deja la herramienta
  fuera de la pantalla en móvil; si no cabe, se pasa a la lista. La placa ampliada tiene su propia
  región `aria-live` (con un `<dialog>` abierto, la global espera). Rehacer sitios, Atlas o la
  sección de carga nunca deja el foco en `<body>`.
- **Presupuesto por paquete** comprobado en CI con el manifiesto de Vite (`scripts/budget.ts`,
  §7): se atribuye por cómo se importa, no por el nombre del archivo.
- **Descartado:** fuente sorteada en cada paso (parpadeo de hasta 0,31 en las cifras y placas que
  no convergían), media de todas las fuentes y 240 pasos grandes (no casaban con la fuente por
  turno), integrador de Euler, histéresis del tubo vivo, placas sembradas por jugador, miniaturas
  en el Atlas y un selector de socios que con uno solo no se vería.

### 4.14 Dependencias

| Paquete                                                    | Por qué                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `vite`                                                     | Servidor de desarrollo y build estático                                                |
| `typescript`                                               | Tipos en modo estricto                                                                 |
| `vitest`                                                   | Pruebas sin DOM, comparte la configuración de Vite                                     |
| `eslint`, `@eslint/js`, `typescript-eslint`, `globals`     | Lint con tipos                                                                         |
| `prettier`, `eslint-config-prettier`                       | Formato, sin pelear con ESLint                                                         |
| `@types/node`                                              | Tipos para el simulador y las pruebas                                                  |
| `happy-dom`                                                | DOM simulado para las pocas pruebas de interfaz (foco, listas); el resto corre sin DOM |
| `@playwright/test`                                         | Pruebas de navegador en Chromium, Firefox y WebKit (§4.25)                             |
| `@fontsource/im-fell-english`, `@fontsource/source-sans-3` | Fuentes autoalojadas (§4.13)                                                           |

## 5. Datos

Todo el estado de una partida es un `GameState` (ver `docs/STATUS.md`). Vive en
`localStorage` bajo `micelio:save` como `{ version, savedAt, state }`. No hay datos
personales: nada sale del navegador.

- Cada cambio de formato sube `version` y añade `migrations[n]` (de n a n + 1).
- Si el guardado está dañado, se copia a `micelio:save:backup` y se empieza de cero.

## 6. Entrada no confiable

El juego no tiene servidor, pero sí dos entradas que no controla:

1. **El texto de importar partida.** Puede venir de cualquier sitio. Se decodifica
   (Base64 → `TextDecoder`), se parsea con `JSON.parse` dentro de `try`, y pasa por el mismo
   validador que la carga: estructura, tipos, números finitos y no negativos, ids conocidos.
   Se limita a 200 kB antes de decodificar. Nada del texto se inserta como HTML.
2. **El contenido de `localStorage`.** Otra pestaña, una extensión o una versión anterior
   pueden haberlo escrito. Pasa por migraciones y validación; si falla, copia de respaldo y
   partida nueva.

## 7. Presupuestos

| Operación                                       | Presupuesto                   | Medido                                                                                                                                                 | Cómo                                    |
| ----------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| JavaScript del build                            | < 150 kB comprimido           | 89.5 kB inicial + 18.6 kB del plasmodio (fase 9; 76.4 kB en la fase 8)                                                                                 | `npm run build` (gzip que informa Vite) |
| JS inicial (guarda por paquete)                 | ≤ 95 kB comprimido            | 89.5 kB                                                                                                                                                | `npm run budget`, también en CI         |
| JS del plasmodio (modelo, acciones y vista)     | ≤ 20 kB comprimido            | 18.6 kB (estimado ~15 kB en el diseño)                                                                                                                 | `npm run budget`                        |
| Catálogo de un socio (un idioma)                | ≤ 7 kB comprimido             | 5.4 kB (es), 5.3 kB (en)                                                                                                                               | `npm run budget`                        |
| Vaciar 1.200 s de modelo del plasmodio          | un tirón al abrir o al volver | 8–10 ms de mediana en caliente y 20–27 ms en frío en la Fusión (Node, escritorio); ×4–5 en un móvil medio                                              | a mano con `advancePlasmodium` (fase 9) |
| Rastro del plasmodio                            | < 1e63 (nombres de idle)      | 6.0e17                                                                                                                                                 | `npm run sim:plasmodio`                 |
| Frame                                           | 60 fps estables               | ~165 fps (límite de la pantalla) en el natal, la taiga y con la placa del Puente amargo a la vista; 159 fps con la CPU frenada ×4 (fase 9, Edge local) | `npm run perf`                          |
| Partículas vivas                                | ≤ 200 (pool)                  | —                                                                                                                                                      | Tope en `render/particles.ts`           |
| Segmentos de la red                             | ≤ 2000                        | —                                                                                                                                                      | Tope en `render/network.ts`             |
| Refresco de números en pantalla                 | ≤ 10 Hz                       | —                                                                                                                                                      | Limitador en `main.ts`                  |
| Balance en 10 esporulaciones                    | < 1e300                       | 2.4e13                                                                                                                                                 | `npm run sim`                           |
| Balance del viaje (dos biomas y 4 partidas más) | < 1e63 (nombres de idle)      | 7.4e17                                                                                                                                                 | `npm run sim`                           |

## 8. Escala

Un solo jugador por navegador. El guardado pesa pocos kB. El crecimiento que importa es
el de los números (cubierto en §4.3) y el de la red dibujada (topes en §7).

## 9. Fases

Ver `docs/STATUS.md` para el estado al día y `PROMPT.md` §21 para la definición de cada fase.

## 10. Estructura del repositorio

```text
src/core/      estado, fórmulas, selectores, acciones, tick (sin DOM, sin reloj, sin azar libre)
src/data/      tablas de balance y claves de texto (sin lógica, sin texto visible)
src/systems/   guardado, offline, lluvia, autocompra, logros
src/ui/        componentes, pestañas, tooltips, modales, avisos
src/render/    canvas de la red y partículas
src/audio/     sonidos sintetizados
src/i18n/      catálogos (es.ts base, en.ts; partners/ los de cada socio) y formato con Intl
src/partners/  socios (fase 9): registro, núcleo de cada uno y, aparte, su modelo y su vista
scripts/       simuladores de balance (red y plasmodio), presupuesto de JS, procedencia de placas
tests/         pruebas de Vitest
docs/          STATUS, BUG-JOURNAL, BALANCE
```

## 11. Plan visual

Antes de maquetar. Revisado contra `PROMPT.md` §14.

**Paleta** (tokens CSS en `:root`):

| Token           | Hex     | Uso                                                   |
| --------------- | ------- | ----------------------------------------------------- |
| `--humus`       | #261C15 | Fondo, horizonte superior                             |
| `--tierra`      | #4A3424 | Paneles, horizontes medios                            |
| `--arcilla`     | #8C5A35 | Horizonte profundo, bordes (nunca texto sobre humus)  |
| `--micelio`     | #EFE6D2 | Hifas, texto principal                                |
| `--rebozuelo`   | #E8A93A | Botones de compra y acción (texto humus encima), foco |
| `--fuego-fatuo` | #B8EFC4 | Solo pulsos de producción y gotas                     |

Derivados: `--micelio-tenue` (micelio al 72 % sobre tierra, ≥ 4.5:1) para texto
secundario; paneles con borde de 1 px `--arcilla` y sin sombras grises. Las tarjetas de
generador no son tarjetas: son filas separadas por un filete, como un índice de libro.

**Tipografía:** IM Fell English para títulos y nombres de generadores (aire de lámina
naturalista); Source Sans 3 para la interfaz. Cifras con `tabular-nums`. Nada en mayúsculas
sostenidas.

**Boceto (escritorio ≥ 1024 px):**

```text
┌──────────────┬──────────────────────────────────┬─────────────────────────┐
│ 1.23 M N     │  ~ hojarasca ~~~~~ setas ~ ♣ ~~   │ Generadores Mejoras …   │
│ 4.5 k N/s    │  ── horizonte A ───────────────   │ ─────────────────────── │
│              │      ╲╱ red ╲╱╲                   │ [ico] Hifa        × 12  │
│   (núcleo)   │  ── horizonte B ── ╲╱ ─────────   │  0.1 N/s · 3 % ▬▬▬▭    │
│              │          ╲╱╲  ·  (gota)           │        [Comprar 1 Hifa] │
│ Aguacero 42s │  ── horizonte C (arcilla) ─────   │ …                       │
├──────────────┴──────────────────────────────────┴─────────────────────────┤
│ Noticias del sotobosque: Una lombriz denuncia que el suelo está…          │
└───────────────────────────────────────────────────────────────────────────┘
```

**Tableta (768–1023 px):** canvas arriba (40 vh) con el núcleo encima; contador y N/s sobre
el canvas; pestañas debajo. **Móvil (< 768 px):** contador y N/s fijos arriba, canvas
reducido con el núcleo, contenido de la pestaña, barra de pestañas fija abajo; objetivos
táctiles ≥ 44 px.

**Movimiento:** solo la esporulación está orquestada. Lo demás responde a acciones: brote
de filamentos al comprar, onda y número flotante al hacer clic, campanilla visual del logro
y aparición de la gota.

Dispersar (fase 8) es una variante de ese único momento orquestado, no un segundo: el mismo
brillo, pero las esporas salen con el viento hacia un lado, el suelo del bioma nuevo se funde
sobre el viejo y brota la red. Con «reducir movimiento», el cambio de suelo es instantáneo.

---

## Correcciones

Ninguna todavía.

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
- `render/`: canvas de la red y partículas; desde la fase 10, también la banda de la Red planetaria
  y las cosméticas. Lee el estado; nunca lo escribe.
- `audio/`: síntesis con Web Audio. Reacciona a eventos.
- `i18n/`: catálogos y formato con `Intl`. Ningún texto visible vive fuera de aquí. Los
  catálogos de cada socio llegan aparte (`i18n/partners/`), y también las noticias (`news/`, y
  `news/biomes/` solo tras dispersar) y el inglés de la interfaz (`en.ts`, fase 10).
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
0.5 o 1 y límite ~~8 h o 24 h~~ `offlineCapSeconds`) y para volver de segundo plano (eficiencia 1,
mismo límite). **Corrección (fase 10):** el límite ya no era solo 8 h o 24 h (Sueño invernal) desde
la fase 7: suma 6 h por rango del Letargo profundo y, desde la fase 10, las horas del bioma (la
tundra, +24 h) y 12 h por rango del Liquen. Y en la tundra, de una ausencia ya recortada al límite,
lo que pasa de 8 h rinde sin el ×0,5 del bioma: `applyOffline` y `applyBackground` le pasan a
`applyElapsed` esos segundos de deshielo (`thawSeconds`), fuera de los derivados (§4.32).

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

Petición del usuario tras la 1.4.1: más noticias y más tiempo para leerlas. ~~Cada 12 s, con unas
40 frases del bosque natal (PROMPT.md §12).~~ Cada noticia se queda 20 s, y el bosque natal tiene 25
más (74), mitad datos de micología y mitad humor, repartidas por todo el progreso para que también
lleguen nuevas en la partida avanzada.

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
- Las cuentas (niveles, esporas, clics) también: hasta 999.999 con todas sus cifras y desde el
  millón como las cantidades («44,1 sextillones», no «44.108.702.360.816.946.000.000…», que se
  vio en la cartela del bioma). En español, delante de un nombre llevan «de»: «2 millones de
  esporas» (`num.countOf`, solo con nombre de magnitud).

### 4.25 Pruebas de navegador con Playwright

**Elegido:** `@playwright/test` con cinco perfiles: Chromium, Firefox y WebKit (el motor de
Safari) en escritorio, y Pixel 7 e iPhone 14 emulados. ~~Corren contra el build de producción
(`vite preview`),~~ Corren contra el build de producción (`vite preview`), salvo unas pocas que abren
el servidor de desarrollo, siembran partidas en `localStorage` antes de cargar y usan el reloj falso
de Playwright para el tiempo en segundo plano. **Corrección (fase 10):** `playwright.config.ts`
levanta también el servidor de desarrollo (`vite`; `DEV_URL` en `tests/e2e/helpers.ts`): el
pseudoidioma (`?pseudo`, textos un 40 % más largos) no llega al build, y la transición del suelo al
sembrar y las cosméticas en el lienzo importan módulos del juego en la página. En local, Chromium es
el Edge de Windows (sin descarga); en CI, el Chromium de Playwright.

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
  1e8 en el natal; en un destino, ~~R = escala del bioma · 3,5^(tramo − 1)~~ R = escala del bioma ·
  `LEG_SCALE[tramo]` (taiga 1e11, Chocó 2e11). **Corrección (fase 10):** una potencia de 3,5 no
  servía para los tramos 3 y 4 (no había escala de tundra para tercera y cuarta); la tabla da lo
  mismo bit a bit en los tramos 1–2 (§4.32). Con los de toda la vida, el prototipo daba 11.330
  esporas de golpe al llegar. En el natal los dos valen lo mismo bit a bit, y el simulador da
  idéntico en las 21 métricas de antes.
- **Linaje:** producción ×2 por bioma colonizado fuera del natal. Sin él, el segundo bioma
  tardaba 4–5,5 h. Todos los factores nuevos (bioma, adaptaciones de bioma, linaje, obreras)
  cambian solo al dispersar, comprar o colonizar, que invalidan: ninguno cambia con el tiempo
  (ROADMAP, reglas comunes).
- **El Acto I y la colonización los decide el núcleo** (`src/systems/journey.ts`), no la
  interfaz: el tick lo comprueba una vez por segundo y el tiempo analítico al final, así el
  simulador y una partida 1.x lo ven sin pantalla. El Acto I mira el logro de la Red
  planetaria y no `owned` (que se reinicia al esporular): una partida 1.x que ya la tuvo lo
  cierra al cargar. Son las ~~dos~~ únicas funciones que escriben en la Crónica, una entrada por
  tramo como mucho: el tope se pone donde se construye. **Corrección (fase 10):** son tres, con
  `checkReturn`, que escribe la de El regreso en el tramo 5 (§4.32).
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
  rango (colonizar los abre todos). Se aprenden en su bioma y valen en todos: ~~en esta versión no
  se vuelve a un bioma, y~~ una compra que caducara al irse castigaría haberla hecho.
  **Corrección (fase 10):** sí se vuelve (El regreso al natal y, en el ciclo libre, a cualquier
  bioma, §4.32); la regla se queda por la otra razón.
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

### 4.30 El núcleo siempre a mano y compras sin saltos (peticiones del usuario, v1.4.1 y v1.4.2)

- ~~**Núcleo de bolsillo (1.4.1).** Por debajo de 1024 px la página entera se desplaza
  (BUG-JOURNAL #14) y el núcleo se va con el escenario. Un segundo botón (`.core-dock`, 64 px) aparece abajo a la
  derecha, encima de la barra de pestañas en el móvil, mientras menos de la mitad del núcleo se
  vea fuera de la cabecera y la barra fijas. Lo decide un `IntersectionObserver` con esas dos
  alturas como margen negativo, rehecho cuando cambian (la cabecera mide 47–107 px según sus
  líneas). Es fijo: aparecer no mueve nada; la página reserva abajo su hueco (salvo en la partida
  nueva, sin pestañas) y, donde se tocan (< 444 px), los avisos suben por encima. Absorbe igual
  que el núcleo, con su nombre; el número y el pulso salen del botón pulsado, y Espacio pulsa el
  que se ve. La capa de números va por encima de él (z-index 16 frente a 15). No aparece en Socios
  (la placa del plasmodio se dimensiona para llenar la pantalla y tapaba los sitios de su esquina)
  ni con el foco del teclado en las pestañas (se absorbe con Espacio y tapaba el control enfocado).~~
- **Corrección (1.4.2, a pedido del usuario):** no quería un botón que se moviera, sino que la
  franja de arriba (contador y escenario con el núcleo y el arte) se quedara fija y solo se
  desplazara el panel. Por debajo de 1024 px, `.layout__top` (cabecera, escenario, núcleo y
  efectos) es `sticky` arriba y la página pasa por debajo; en escritorio es `display: contents` y
  la rejilla no cambia. Para que quepa, el escenario fijo baja: `clamp(150px, 26svh, 240px)` en
  el móvil (antes 34vh) y `clamp(260px, 38svh, 440px)` en tableta (antes 46vh), en svh para que no
  cambie al esconderse la barra del navegador. Con la cabecera de las esporas (106 px), un iPhone
  14 con la barra de Safari (390 × 664) deja 328 px al panel. Los efectos van sobre el escenario
  (compactos en el móvil, a la izquierda del núcleo): fijos, la cuenta de la Tormenta se ve
  mientras se toca y que empiecen o terminen no mueve el panel. En tableta la barra de pestañas
  se pega bajo la franja. `src/ui/pinning.ts` vuelve a la disposición de antes (solo la cabecera
  fija, mismas filas: nada se mueve) en tres casos: en Socios (la placa se dimensiona para llenar
  la pantalla y pasaría a lista), con un campo de texto enfocado (el teclado dejaba el campo de
  importar debajo de la franja) y cuando 100svh menos la franja y las barras deja menos de 200 px
  al panel (un móvil en horizontal, zoom, pantalla partida). Al cambiar de pestaña el jugador con
  la lista bajada, la nueva empieza justo bajo lo fijo; ~~`scroll-padding-top` evita que el foco
  quede debajo~~ un `scroll-margin-top` en lo del panel (`--fixed-top`) evita que el foco quede
  debajo. **Corrección (1.6.0):** era margen y no relleno desde antes (con `scroll-padding`, enfocar
  algo que ya está en lo fijo desplazaba la lista), y en el móvil hay también un `scroll-margin-bottom`
  (`--fixed-bottom`, la barra de pestañas de abajo): sin él, las láminas que llevan a otra pestaña
  dejaban el título enfocado bajo la barra en WebKit (BUG-JOURNAL #31). Esas láminas llevan el
  título arriba, bajo lo fijo, y no al borde más cercano. Una crítica previa con tres enfoques cambió el diseño: escenario más bajo, efectos
  dentro de la franja, respaldo automático en vez de dos columnas en horizontal, barra de pestañas
  pegada en tableta.
- **Lo que cambia con el estado no cambia la altura.** Un botón de compra a todo lo ancho lleva
  coste y espera en una línea; el texto de producción de cada generador reserva dos líneas; en
  móvil y tableta el panel ocupa el sobrante de la página (`1fr`), en vez de repartirlo entre las
  filas `auto`; a tres columnas la espera reserva su línea. La lista de mejoras se reconcilia por
  clave: la comprada se queda 0,9 s como «Comprada», inerte (un segundo toque no compra la
  siguiente) y con su alto fijado, y se pliega en 0,22 s; las nuevas se despliegan ya pintadas.
  Con refrescos separados más de 1 s (otra pestaña, la ventana oculta) se rehace sin animar, para
  no enseñar como recién comprado lo que compró la autocompra entretanto.
- **Descartado:** ~~el escenario pegajoso (en un teléfono se comía un tercio de la pantalla)~~
  (es lo que pidió el usuario en 1.4.2, con el escenario más bajo y el respaldo de `pinning.ts`),
  el núcleo en la cabecera (lejos del pulgar), el panel con desplazamiento propio (la barra del
  navegador no se escondería y vuelve el riesgo de #14) y dos columnas en horizontal (el núcleo no
  cabía en 740 × 300 y las fórmulas de tamaño suponen el escenario a todo lo ancho).

### 4.31 Instaladores para el móvil (petición del usuario, v1.5.0)

- **App instalable (PWA), para Android y el iPhone:** `public/manifest.webmanifest`, los iconos y un
  service worker que deja jugar sin conexión. Sin cuentas ni tiendas. En Android la app instalada
  comparte la partida con la web (mismo origen); en el iPhone, la de la pantalla de inicio guarda
  aparte de Safari, y Ajustes lo dice (exportar e importar).
- **Service worker propio, sin Workbox** (`scripts/service-worker.ts`): un plugin de Vite escribe
  `sw.js` con la lista exacta del build (también lo que llega aparte). Páginas primero de la red
  (con conexión se ve siempre la última versión), lo demás primero de la caché, nunca se salta la
  espera (una página abierta no se queda sin los trozos de su versión) y nunca toca el guardado.
  Solo en el build de la web: en desarrollo guardaría lo que se edita. Las pruebas de navegador lo
  bloquean salvo `tests/e2e/pwa.spec.ts`. Tras la revisión: al instalarse pide cada archivo al
  servidor (`cache: 'reload'`; la caché HTTP de Pages dura 10 minutos) y no se instala si
  `index.html` no nombra su script de entrada; con señal débil, la página sale de la copia a los
  4 s; una caché rota cuenta como vacía; y su versión depende también del contenido de `public/`.
  `tests/pwa.test.ts` ejecuta su código con la caché y la red simuladas.
- **Una versión vieja nunca pisa una partida más nueva.** Sin skipWaiting, quien recarga con
  conexión juega a la versión nueva, pero la caché activa sigue siendo la anterior: sin conexión,
  vuelve la vieja. Por eso cada guardado lleva `game` (§5) y, si la versión que carga no lo entiende
  y es posterior, no guarda nada hasta recargar con conexión, ni al borrar o importar.
- **App de Android con Capacitor 8** (`capacitor.config.ts`, `android/`): `vite build --mode native`
  (rutas relativas, sin service worker) servido desde `https://localhost` dentro de la app. El
  código del juego no importa nada de Capacitor. El `appId`, el esquema y el host no cambian nunca:
  son la identidad de la app y el origen de su guardado. `.github/workflows/android.yml` compila en
  cada cambio y, al publicar una release, firma con la clave del proyecto (secretos del
  repositorio; la crea `scripts/android-keystore.ps1` en el PC del dueño) y adjunta `micelio.apk`.
  `versionCode` sale de `package.json` (1.5.0 → 10500) y solo puede subir; menor y parche hasta 99.
- **La clave de firma es la partida de los jugadores de Android:** con otra, una actualización no
  se instala encima y desinstalar borra el guardado. El script nunca crea una segunda clave (se
  detiene si GitHub ya tiene una) y escribe la huella del certificado en
  `android/signing-cert.sha256`; el workflow no adjunta un .apk firmado con otra. La clave solo se
  usa al publicar: en cada cambio se compila la de depuración, con otro paquete (`.debug`), que se
  instala al lado y no estorba. El trabajo que compila no puede escribir en el repositorio; adjuntar
  va en un trabajo aparte. El orden de publicación está en AGENTS.md («Versiones»).
- **Atrás** deja el juego en segundo plano (`MainActivity`), sin plugin: en Android 7 a 11 cerraba
  la actividad.
- **De borde a borde** (Android 15+, con SystemBars de Capacitor): `--sat`, `--sab`, `--sal` y
  `--sar` en `styles.css`, con el respaldo que recomienda Capacitor (sus variables o `env()`); la
  franja fija y la cabecera se pegan bajo la barra de estado y `pinning.ts` la cuenta. En la web
  normal valen 0.
- **Iconos generados por código**, como todo el arte: el dibujo del núcleo vive en
  `src/ui/core-art.ts` (lo usan el botón y los iconos) y `scripts/icons.ts` lo rasteriza con el
  Chromium de Playwright: PWA (192, 512, «maskable»), iPhone (180), favicon SVG y, en Android, las
  cinco densidades del lanzador, el icono adaptable con su capa monocroma y las pantallas de
  arranque.
- **Para hacer sitio**, las noticias del sotobosque llegan aparte (`src/i18n/news/`), como los
  textos del plasmodio: el JS inicial bajó de 94,6 a 86,4 kB.
- **Descartado:** Workbox (más código que el service worker entero), `@capacitor/assets` (fija
  `sharp` 0.32 con avisos de seguridad y no se publica desde 2024), las tiendas por ahora (Google
  Play pide una prueba cerrada con testers y la App Store la cuenta de 99 USD al año: decisión del
  usuario, iOS queda para más adelante) y guardar con el plugin Preferences de Capacitor
  (añadiría JS; el .apk usa `localStorage`, con la copia de seguridad de Android activada).

### 4.32 Viento de esporas II: pradera, tundra, El regreso y ciclo libre (fase 10, bloque A)

Resuelve el muro de la 1.5: tras el último bioma no quedaba destino y cada partida se alargaba
(hasta 1 h 6 min la cuarta; docs/ROADMAP.md, fase 8). El bloque B (votos y cosméticas) está en
§4.33, y la 1.6.0 sale con los dos (decisión del usuario).

- **Dos anillos de destinos.** La pradera y la tundra (`ring: 2`) solo se ofrecen con la taiga y el
  Chocó colonizados (`openRing`, `destinations`): cada anillo se recorre entero y en orden. Así los
  tramos 1–2 son los de la 1.3–1.5 bit a bit (sus 16 objetivos salen idénticos), y cada bioma nuevo
  se calibra solo de tercero y de cuarto, en cuatro órdenes. El validador exige a cada tramo, en el
  bosque y en la Crónica, un bioma de su anillo: la pradera en el tramo 1 cambiaría su R.
  Descartado: el orden libre (con cuatro destinos ninguna escala servía en todas las posiciones; la
  tundra primera tardaba 7,5–11 h en el prototipo).
- **R de los destinos por tabla:** `LEG_SCALE = [1, 1, 3.5, 12.25, 61.25]` (corrige §4.28): con
  ×3,5 compuesto no había escala de tundra que sirviera de tercera y de cuarta (34:08 y 18:54 de
  mediana). Pradera 8,1e10 (con los 9e10 del prototipo, la última partida de la pradera tercera
  pasaba de la hora) y tundra 3,5e9.
- **Las reglas de bioma nuevas son datos** (`src/data/biomes.ts`). `productionFactor` (tundra ×0,5)
  lo aplica `generatorBiomeFactor` a todos los generadores y se dice una vez en las reglas, no en
  cada fila de la tienda; fuera de la tundra vale 1 y las cifras no cambian ni en el último bit. Las
  horas del bioma (`offlineHours`: tundra +24 h, solo mientras se vive allí) y el efecto nuevo
  `offlineHours` del Liquen (+12 h por rango, en todos los biomas, como toda adaptación de bioma)
  se suman en `offlineCapSeconds`, fuera de los derivados, como el Letargo profundo.
- **Deshielo** (pregunta 1 del usuario). Sin él, la tundra rinde fuera del juego 0,5 · min(H, tope),
  nunca más que otro bioma, aunque se presente como el bioma de quien vuelve de vez en cuando. Con
  él, de una ausencia ya recortada al tope, lo que pasa de `thawAfterHours` (8 h, solo en la tundra)
  rinde sin el ×0,5. Se cobra en `applyOffline` y en `applyBackground` (en el móvil el sistema
  cierra o congela la app sin preguntar), nunca en `computeDerived`: mirar rinde lo de siempre y una
  ausencia corta también, así que cerrar y volver a abrir no da nada. El informe de la ausencia lo
  dice (`offline.thaw`). Ciencia: en la tundra alpina de Niwot Ridge (Colorado), la biomasa
  microbiana del suelo llega a su máximo del año bajo la nieve, y casi toda es de hongos (Schadt,
  Martin, Lipson y Schmidt, 2003, _Science_ 301: 1359–1361). Descartado: que fuera del juego no
  rigiera el ×0,5 (cerrar y abrir rendiría el doble que mirar) y llevar el Liquen solo a la tundra.
- **Perfil ausente, objetivo con el deshielo:** sesiones de 20 min del perfil activo y H horas
  fuera, cobradas con `applyOffline`. Los días son ausencias × H: los minutos jugados no cuentan,
  porque con las mismas sesiones decidirían unos minutos de la última. Con 24 h la tundra tercera
  tarda lo que la pradera (2,0 días; 3,0 sin el deshielo) y con 48 h empatan con él y sin él (4,0).
  La especificación pedía que con 48 h ganara la tundra y no se puede (las dos colonizan en la
  tercera sesión; hacerlo en la segunda pediría de 5 a 190 veces los nutrientes que deja la primera
  ausencia), así que ese objetivo es una guarda «≤». Decisión aceptada.
- **La lámina «Donde acaban los árboles»** (`chapter.ring2`) entra en la cola calculada del estado
  (§4.28) tras la colonización que cierra el primer anillo, que se deduce de la Crónica: quien llega
  de la 1.5 al muro la ve al cargar, una vez, sin ninguna marca de la migración. La colonización que
  la precede no ofrece «Ver el viento» (saldrían dos seguidos), y las llegadas a la pradera y la
  tundra llevan el antetítulo del Acto III. La cola solo recorre los tramos 1–4 (`legBiomes`): en un
  ciclo, sembrar un destino ya visitado volvía a encolar sus láminas.
- **El regreso es el tramo 5** (`RETURN_LEG = JOURNEY_LEGS + 1 = MAX_LEG`) y el ciclo libre vive
  entero en él. Nada que lea `leg === 0` (el requisito de 1e8, el suelo lineal de la 1.x, el Acto I)
  ni los tramos 1–4 cambia, y la Crónica se queda en seis entradas. Partir cuesta lo de siempre, y
  en el natal rigen una R fija (`cycleScale`, 4,8e13: con los 6,3e13 del prototipo las partidas de
  un orden pasaban de 35 min de mediana) y un requisito en múltiplos de ella (`cycleRequirement`,
  6 R). `sporeFloor` sigue rigiendo solo en el tramo 0. El linaje cuenta destinos colonizados y no
  entradas de la Crónica: El regreso no lo sube de ×16. Descartados: un id `return` en `BIOME_IDS`
  (rompía las paletas y la sal del suelo, y debe ser el mismo bosque), un tramo que creciera con
  cada ciclo (la Crónica no tendría tope) y un epílogo sin juego (dejaba otra vez al jugador sin
  destino).
- **`checkReturn` es la tercera y última escritora de la Crónica** (con `checkActOne` y
  `checkColonization`, §4.28): escribe la sexta entrada una sola vez, en la esporulación que lleva
  el nivel del natal a 500 en el tramo 5 con cinco entradas. Se escribe al cumplirlo y no al llegar,
  para que el epílogo se cumpla.
- **`windTargets` es la única lectura de adónde lleva el viento:** 'journey' (los destinos que
  quedan), 'return' con el cuarto colonizado y 'cycle' (los cinco biomas) con El regreso cumplido;
  durante El regreso, nada. La leen Viento, las láminas y `disperse`, que solo acepta un bioma de esa
  lista. `disperseBlock` pide primero cerrar el bosque actual (colonizarlo o cumplir El regreso):
  siempre queda algo por delante.
- **`forestGoal`** responde una vez qué persigue el bosque actual (el Acto I, colonizar, nada más,
  El regreso, nada más tras cumplirlo, el ciclo n o el ciclo cumplido) y lo leen la cartela, Viento
  y la Crónica. En el tramo 5 «la Crónica tiene la entrada de este tramo» no significa
  «colonizado»; `isForestColonized` se queda en el núcleo y la interfaz ya no lo lee. «Ciclo
  cumplido» no se guarda: el nivel solo cambia al esporular y vuelve a 0 al sembrar, así que
  `stays > 0` con el nivel en 500 o más lo dice.
- **La regla de la meta** (`completesGoal`): en El regreso y en un ciclo sin cumplir, la
  esporulación que lleva el nivel de menos de 500 a 500 o más lo cumple. El botón y la confirmación
  de Esporular lo dicen, y el bot del simulador esporula entonces, aunque el nivel no se duplique.
  Con la regla de §17 sola el nivel pasaba 256 → 512 y la última partida cargaba con el 74 % de los
  nutrientes del ciclo (1:30 h en el prototipo); con la regla y unas 6 R de requisito la cola se
  reparte en dos partidas parecidas. En los tramos 0–4 siempre es falsa: las métricas publicadas no
  se mueven. Supone que el jugador esporula al llegar; quien no, tendrá una última partida más
  larga, como antes.
- **El ciclo libre.** Con El regreso cumplido, Dispersar se llama Sembrar y lleva a cualquiera de
  los cinco biomas, también al actual (los récords son por bioma: repetir uno es la forma de
  mejorarlo), por `SOW_COST` = 300 fijas. Es la misma excepción medida de Dispersar (§4.28): con R
  y linaje ×16 fijos el ingreso de un ciclo es plano (unas 500 esporas brutas, unas 200 netas), y un
  coste creciente acabaría sin poder pagarse. `departureCost` dice lo que cuesta partir (hoy 300 en
  los dos casos). Sembrar esporula antes si la partida puede, deja el nivel en 0, suma
  `cycle.stays` y aplica la R y el requisito fijos del bioma. `dispersalCount = leg + stays` es la
  semilla de la red y lo que lanza la transición del suelo: sembrar el mismo bioma cambia de red.
  Los cuatro logros nuevos (colonizar la pradera y la tundra, El regreso y el primer ciclo) suman al
  +1 % por la regla de Viento (§4.28). Descartados: R y linaje que crecieran con los ciclos (el techo
  de 1e63 llegaría hacia el ciclo 150, estimación), un ciclo sin volver el nivel a 0 (el muro otra
  vez) y exigir cumplir antes de irse (ataría cada ciclo a 2–4 h).
- **Sumideros de esporas** (la regla común del ROADMAP: crecen ×2 por nivel, al ritmo del ingreso).
  Las adaptaciones de bioma y las cosméticas (§4.33) la cumplen, ×2 por rango. Dos excepciones, a
  propósito y por la misma razón: sembrar, 300 fijas (arriba), y despertar una mutación dormida con
  «sin mutaciones», a su coste de siempre (§4.33). Las dos son gastos por ciclo, que vuelven en
  cada ciclo, y el ingreso de un ciclo es plano (R y linaje fijos: unas 500 esporas brutas). Un
  coste que creciera con los ciclos acabaría por no pagarse; despertar, además, solo gasta esporas
  del ciclo (`wakeBudget`), y el árbol entero (287) cabe en ellas.
- **Cumplir y récords** (`src/systems/cycle.ts`). `checkCycleDone` actúa en la esporulación que
  lleva el nivel a 500 en un ciclo, también en la que `disperse` hace antes de sembrar (si no,
  cumplir al partir se perdía). Suma `cycle.done` y escribe o mejora en su sitio el récord de
  (bioma, votos): uno por combinación, 36 como mucho por construcción, cinco sin votos. El tiempo es
  de reloj desde la llegada, `max(0, ahora − llegada)`: medido en tiempo jugado, cerrar el juego
  (sin conexión al 100 % con Sueño invernal) daría récords que no se jugaron. Un tiempo negativo
  que llegue en un guardado (un reloj que retrocedió, una partida importada de otro dispositivo) se
  repara a 0 al cargar en vez de rechazarse: es solo presentación, y rechazarlo bloquearía el
  guardado para siempre, porque ese récord sería el mejor y nunca se reemplazaría (precedente:
  BUG-JOURNAL #18). Igual con los ciclos cumplidos: con el ciclo en curso sin cumplir son como mucho
  uno menos que los empezados, y un guardado editado con tantos como empezados se repara al cargar;
  cargado tal cual, cumplir dejaba más cumplidos que empezados y ningún guardado siguiente validaba
  (BUG-JOURNAL #29). Los récords son personales: quien atrasa el reloj se engaña a sí mismo y el
  juego no se rompe por ello. `cycle` y `records` son `custom` en las dos tablas de reinicio:
  esporular y sembrar pueden escribirlos.
- **Avisos y no láminas en el ciclo.** Las láminas tienen claves fijas (`chapter.ring2`,
  `chapter.return.arrive`, `chapter.return.close`); cumplir un ciclo o batir un récord da aviso,
  anuncio y acorde, para que `seen` no crezca con los ciclos.
- **La banda de la Red planetaria** (`src/render/planetary-band.ts`, función pura): cinco franjas
  en el orden del viaje, con el suelo y la silueta de cada bioma (`silhouetteKind`), y una línea de
  micelio cuyos enlaces se encienden en los niveles 125, 250 y 375 y al cumplir. En la lámina «La
  red planetaria» es un lienzo decorativo a lo ancho del modal (96 px de alto), la imagen que pide
  el ROADMAP, legible a 375 px. En el escenario sustituye al bosque lejano mientras se vive en el
  natal del tramo 5, con alto mínimo de 28 px CSS; en el móvil la tapan en parte el núcleo y la
  cartela (aceptado: la imagen entera está en la lámina, que se relee desde la Crónica).
- **Viento en el móvil.** A 375 px quedan unos 290 px de panel bajo la franja fija (§4.30), así que
  cada fila de destino mide 110–150 px: la cabecera (suelo, nombre y estilo o récord) es el
  `<summary>` que despliega las reglas, y el motivo para no partir se dice una vez sobre la lista.
  Estadísticas cuenta los ciclos como número y los récords van en una lista de la Crónica, nunca en
  un `dl.stats`, cuya columna de valores crece con su contenido. Las pruebas de navegador lo miden a
  375 × 667 y 412 × 915 en los cinco perfiles, también con el pseudoidioma.
- **Guardado versión 7, entero de una vez** (§5). `isStayValid` cruza el tramo 5 con `cycle`: con
  cinco entradas (El regreso en curso) el linaje vive en el natal y no hay ciclos; con seis, sin
  ciclos sigue en el natal y solo un ciclo empezado lo lleva a otro bioma. El natal es el tramo 0 o
  el 5, y la sexta entrada de la Crónica es el natal, con fecha y sin partida. Deuda menor e inocua:
  la migración 4 → 5 construye las claves de las doce adaptaciones de bioma de hoy (también las seis
  de la fase 10) y la 6 → 7 las vuelve a poner a 0; ninguna podía tener rango antes.
- **El bot en el tramo 5** (`scripts/sim-play.ts`). Aplica la regla de la meta; en los tramos 0–4,
  la de §17 sin cambios. Guarda las 300 esporas del viaje con el bosque colonizado y algo por
  delante, y en el ciclo libre todo el ciclo, para la siembra siguiente; durante El regreso no
  guarda nada, y la primera siembra espera una partida (12–22 min) en casi todas las semillas: las
  partidas de espera quedan en 1 de mediana, su objetivo. Guardando también durante El regreso
  bajaban a 0, pero el bot empezaba la primera vuelta con menos adaptaciones ~~y sin esa partida
  corta, y la más larga del Chocó pasaba a 1:08:01 (medido en la fase 10)~~ y las partidas de la
  tundra pasaban de 35 min de mediana (35:56). **Corrección (revisión final de la 1.6.0):** el salto
  del Chocó de 56:52 a 1:08:01 era casi todo de la medida, no del juego: con la partida de espera
  delante, la mediana por partida mezclaba la cuarta partida de unos ciclos con la tercera de otros,
  y sin espera salía la cifra de verdad (BUG-JOURNAL #28); sin guardar, alineada, era 1:04:24. La
  primera vuelta del ciclo empieza en un bioma distinto en cada orden del viaje (cada bioma sale en
  cuatro posiciones; el natal nunca la abre, porque acaba de cerrar El regreso) y la métrica de cada
  bioma es la mediana de sus apariciones por las semillas. El régimen estable vuelve a jugar la
  misma vuelta sobre una copia, con las adaptaciones de bioma al máximo, compradas por la acción con
  las esporas de cada rango inyectadas (las disponibles no cambian): es el final de juego, cuando ya
  nada crece. Una partida de espera para pagar una siembra cuenta en el ciclo siguiente y en su
  partida más larga, pero no ocupa el lugar de ninguna otra: las medianas por partida se cuentan
  desde la siembra (`cycleRunMedians`, `scripts/sim-report.ts`).
- **Ciclo calibrado** (`cycleScale` y `cycleRequirement`, con el simulador): natal 4,8e13 y 6 R,
  taiga 4,6e13 y 5 R, ~~Chocó 5,4e14 y 6 R~~ Chocó 5e14 y 5,5 R, pradera 3,7e13 y 6 R, tundra 4,6e12
  y 6 R. El Chocó queda al límite en las dos direcciones (~~la más larga de la primera vuelta en
  56:52 y el estable con partidas de 15:21 de mediana~~ la más larga de la primera vuelta en 58:45,
  el estable con partidas de 15:18 de mediana y su primera en 10:15); si hubiera que elegir, manda la
  más larga ≤ 60 min, que es el muro que la fase resuelve. **Corrección (revisión final de la
  1.6.0):** con la medida alineada (BUG-JOURNAL #28), 5,4e14 y 6 R daban 1:04:24 y no cumplían. La
  palanca no es solo la R: la más larga es la cuarta partida y el requisito decide cuánto nivel
  carga. Subirlo a 7 R, como proponía la especificación, la alargaba a 1:09:23; bajarlo a 5 R la
  dejaba en 59:04, pero la primera partida del estable bajaba a 9:36. La R y el requisito nuevos
  cambian el estado del que sale la matriz de votos del estable, y tres factores se ajustaron
  (§4.33).
- **El simulador se reparte entre hilos** (`scripts/sim-pool.ts`, `sim-worker.ts`). Cada orden del
  primer anillo (un prefijo) se juega una vez por semilla y se ramifica, sobre copias, en los del
  segundo; las tareas (partida suelta, campaña, natal, trozo de viaje, perfil ausente, vuelta del
  ciclo) se reparten entre `worker_threads`, y `SIM_WORKERS` fija cuántos (por omisión, los núcleos
  lógicos menos uno; 0, todo en el hilo principal). Cada tarea recibe y devuelve JSON plano, así que
  lo que sale no depende del reparto: lo comprueba `tests/sim-pool.test.ts`, también con el prefijo
  y la rama en hilos distintos. Con los cuatro órdenes, El regreso y dos vueltas del ciclo,
  `npm run sim` tarda unos 2,5 min en 11 hilos, y el del plasmodio 1 min más (objetivo: 10 min en
  el PC del usuario). La especificación pedía un hilo por orden; con nueve semillas por orden, el
  reparto por tareas aprovecha más núcleos y da lo mismo.
- **El inglés de la interfaz llega aparte** (para hacer sitio: el JS inicial no cabía en sus 95 kB
  con lo que traía la fase, §7). `src/i18n/lazy-catalog.ts` es el cargador común del inglés, las
  noticias y los textos de los socios. `main.ts` espera al catálogo antes de montar si el idioma
  guardado es el inglés (montar en español y rehacer sería un parpadeo en cada arranque), como mucho
  8 s; si no llega, se juega en español con un aviso fijo y la partida sigue pidiendo inglés, y si
  llega tarde, la siguiente reconstrucción lo pone y quita el aviso. **No se promete el
  reintento:** en Chromium, un `import()` fallido se queda en el mapa de módulos del documento, así
  que volver a elegir English en Ajustes falla igual y solo recargar lo recupera.
- **Las noticias de los biomas llegan en su propio trozo** (`src/i18n/news/biomes/`): todo lo que
  solo puede salir tras dispersar (condiciones 'biome', 'dispersals' y 'returned'). El teletipo lo
  pide con `dispersalCount > 0` y, mientras no llega, no saca ninguna noticia: sin él, en un destino
  saldría una del natal que allí es falsa (la piña en la pradera). Si el trozo falla (en Chromium,
  hasta recargar, por lo mismo), el teletipo se queda sin noticias en ese destino: mejor nada que un
  texto falso. Quien no ha salido del natal no lo descarga.

### 4.33 Votos y adaptaciones cosméticas (fase 10, bloque B)

Un voto quita algo durante un ciclo libre y rebaja la meta para compensar: cambia cómo se juega un
ciclo, no cuánto dura, y cada combinación tiene su propio récord. Sale en la 1.6.0 con el bloque A
(decisión del usuario) y no cambió la forma del guardado: solo añadió reglas (§5).

- **Se juran al sembrar, se rompen y nunca se añaden.** `disperse` lleva `vows` en el orden de
  `VOW_IDS` y solo con los que el bioma ofrece (el Chocó no tiene «sin lluvia»: Lloró está entre los
  lugares más lluviosos del planeta); El regreso va sin votos. Duran hasta cumplir el ciclo,
  romperlos o irse. `renounceVow` quita uno, con confirmación; añadir a mitad de ciclo no existe,
  porque falsearía el récord. Los vigentes son siempre un subconjunto de los jurados y la lista
  jurada no se guarda: el récord lleva los que se mantuvieron. Descartados: interruptores que se
  ponen y se quitan, votos fijos hasta cumplir y bajar el nivel meta (cambiaría el sentido de
  «nivel 500»).
- **`vowGoal`, un factor de R por voto y bioma** (`src/data/biomes.ts`), que se multiplican
  (`vowGoalFactor`; los tres en el natal, ×0,03). Sin votos la R es la de siempre, bit a bit. La
  confirmación de sembrar dice la meta que dejan («esporular aquí pide el 21 % de los nutrientes»).
  Romper sube R y conserva el nivel: las esporas que da E(L) con la R nueva pueden quedar por debajo
  de él, y la meta sube de verdad. Un factor por bioma porque lo que quita cada voto pesa distinto en
  cada uno: con uno común, la taiga sin lluvia salía más rápida que sin votos.
- **«Sin lluvia»:** `tick` no llama a `updateRain`, así que no cae ninguna gota ni se consume azar.
  Una gota guardada con el voto solo sale de un guardado editado y se repara a null al cargar.
- **«Solo autocompra»:** las compras del jugador (`buyGenerator`, `buyUpgrade`) se niegan y la
  autocompra, que pasa por `purchaseGenerator` y `purchaseUpgrade`, compra todo con el umbral del
  jugador aunque no tenga Instinto ni los interruptores encendidos, también sin conexión. **La Poda
  no rige con el voto** (`isPaybackActive` es falso): compraba casi como el bot y el voto acortaba el
  ciclo (a 0,63–0,85 veces, en el prototipo), así que habría sido la forma más rápida de sacar
  récords. La interfaz bloquea con su motivo los botones de compra, los interruptores y el modo de la
  Poda; lo guardado vuelve al romper el voto o cumplir el ciclo.
- **«Sin mutaciones»: dos preguntas, no una.** `ownsMutation` dice «comprada» (el árbol, el Acto I,
  las Adaptaciones y lo que se puede comprar) y `hasMutation`, «el efecto rige» (producción, lluvia,
  sin conexión, autocompra y desbloqueos). Con el voto las compradas duermen: `wakeMutation`
  despierta una por lo de siempre en esporas disponibles, con sus requisitos despiertos y solo con
  esporas del ciclo (`wakeBudget`: el nivel, que empezó en 0, menos lo ya despertado; se deduce y no
  se guarda). Ese coste fijo es una excepción a «todo sumidero crece ×2 por nivel»: el gasto es por
  ciclo y el ingreso de un ciclo es plano (§4.32, sumideros). Romper el voto, cumplir o sembrar las despierta todas. Mientras duermen no hay Red
  planetaria (su fila sigue en su sitio, dormida y con su motivo), Herencia ni Instinto, el sin
  conexión vuelve a 50 % y 8 h y k a 15. Confundir las dos preguntas dejaría recomprar una dormida o
  cerrar mal el Acto I: hay una prueba por cada sitio que las lee. Al pie de la letra, sin despertar
  nada, los ciclos duraban de 8,6 a 25,6 h en el prototipo.
- **Nada cambia con el tiempo** (docs/ROADMAP.md, reglas comunes): `cycle.vows` y `cycle.woken`
  solo cambian al sembrar, romper, despertar y cumplir, y las cuatro invalidan los derivados (§4.6).
- **El guardado** valida los votos en un ciclo empezado y sin cumplir, del bioma, sin repetir y en
  orden (el orden es la clave del récord: uno desordenado duplicaría casillas); las despiertas, solo
  con «sin mutaciones», compradas, cerradas por requisitos y sin costar más que el nivel; y los votos
  de cada récord.
- **Cuatro logros** (uno por voto y los tres juntos) suman al +1 % por la regla de Viento (§4.28).
  Leen `hasVowRecord`, del récord y no del ciclo vigente: un voto roto no cuenta y lo ganado no se
  pierde.
- **Las cosméticas** (Esporada, Cordones negros e Higróforos) son adaptaciones con `unlock` (su
  voto), 300·2^r esporas y tres rangos, 2.100 cada una: unos 10 ciclos por cosmética con las ~200
  esporas netas de un ciclo, que así siguen teniendo en qué gastarse. Una sola regla,
  `isAdaptationOpen` (un récord con su voto), niega la compra y rechaza un guardado con un rango sin
  derecho. Solo cambian el dibujo (`src/render/cosmetics.ts`, puro y probado sin lienzo): las
  esporas de la esporulación toman el color de su rango (crema con 0, como siempre); los rizomorfos,
  un núcleo opaco más grueso y oscuro por rango sobre un filo crema de alfa 0,62 (con el 0,14 de la
  luz de borde de los troncos no se leía; así queda a 3:1 o más contra la hojarasca, el humus y el
  primer horizonte de los cinco suelos); y la superficie, setas carmín y limón con su propio azar
  (los adornos de siempre no se mueven), nunca del rebozuelo, que es el acento de compra. Ningún
  objeto nuevo por frame, y el bot las ignora, como a Fuego de zorro. Descartados: gratis y 1000·2^r
  (unos 33 ciclos por cosmética). Deuda aceptada: la Esporada no deja elegir color.
- **La interfaz, sin pestañas nuevas** (§4.32): en Viento, los interruptores de los votos
  (`aria-pressed`), que viven en la interfaz hasta sembrar (cada fila de sembrar dice el récord de
  la combinación marcada, `recordFor`: los récords no se mezclan; BUG-JOURNAL #27), y bajo el
  progreso los vigentes con su botón de romper: la confirmación empieza en «Mantener el voto», y al
  romper el foco pasa al siguiente o al estado del ciclo, nunca a `<body>` (BUG-JOURNAL #5, #8 y
  #15), y a la vista: antes de mover el foco tras romper o sembrar, Viento repinta la pestaña entera,
  porque la interfaz se refresca cada 100 ms y lo que cambiaba después movía la página en WebKit y
  dejaba el foco bajo la franja fija (BUG-JOURNAL #30). El árbol dormido se atenúa y cada nodo dice «dormida» y se despierta desde sí mismo.
  Estadísticas cuenta los votos como número (la lista vive en Viento, para no aplastar la columna de
  etiquetas a 375 px), la Crónica dice los votos de cada récord y las cosméticas van bajo las
  Adaptaciones, cerradas con su motivo.
- **El bot y la calibración.** Sobre el orden T‑C‑P‑U, cada combinación se siembra desde El regreso
  recién cumplido (la primera siembra) y, aparte, desde el final de la primera vuelta con las
  adaptaciones de bioma al máximo (el régimen estable), y se compara semilla a semilla con el ciclo
  sin votos del mismo estado; «solo autocompra», con los tres umbrales. El bot despierta mutaciones
  en el orden de la tabla y con «sin lluvia» no atrapa gotas. Sus 630 ciclos llenan los hilos que
  quedaban libres: `npm run sim` tarda lo mismo que antes (154–160 s en 11 hilos). La iteración del
  prototipo que la especificación ponía antes de programar los votos se hizo con el simulador real,
  porque la regla de la meta, El regreso y el ciclo ya estaban en el juego. `vowGoal` (sin lluvia /
  solo autocompra / sin mutaciones): natal 0,15 / 0,38 / 0,53; taiga 0,33 / 0,56 / ~~0,71~~ 0,8;
  Chocó — / 0,7 / 0,35; pradera 0,35 / ~~0,44~~ 0,46 / 0,59; tundra ~~0,38~~ 0,44 / 0,36 / 0,62.
  Con los de partida (0,4, 0,6 y 0,6), «sin lluvia» en el natal tardaba 2,04 veces lo que sin votos
  y «sin mutaciones» en la taiga, 0,96. Manda que ningún voto suelto acorte el ciclo estable (el
  peor, 1,03 veces); por eso las partidas de la primera siembra tras El regreso tienen como objetivo
  50 min y no los 45 de la especificación (la peor, 48:46, la tundra con solo autocompra: sin votos,
  la pradera y la tundra ya duran allí 39–40 min). Los tres votos juntos en la pradera tardan
  ~~0,85–0,89~~ 0,95–0,99 veces el ciclo sin votos (lo que quitan se solapa: sin lluvia, Olfato de
  lluvia y Tormenta perfecta ya no pesan); subir sus factores sueltos sacaría la primera siembra de su
  objetivo, y la especificación solo los acota por arriba. Aceptado. **Corrección (revisión final de
  la 1.6.0):** al recalibrar el Chocó (§4.32) cambió el estado del que sale la matriz del estable, y
  la taiga «sin mutaciones» quedaba en 0,98 veces el ciclo sin votos, la tundra «sin lluvia» en 0,99
  y la pradera «solo autocompra» en 1,00: con los tres factores nuevos, 1,11, 1,06 y 1,07, y sus
  primeras siembras en 39:10, 40:25 y 47:20. Que un cambio en un bioma mueva hasta una décima los
  votos de los otros es lo que deja este objetivo al límite.

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
| `@capacitor/core`, `@capacitor/android`, `@capacitor/cli`  | App de Android (§4.31); el juego no las importa: solo el proyecto `android/`           |

## 5. Datos

Todo el estado de una partida es un `GameState` (ver `docs/STATUS.md`). Vive en
`localStorage` bajo `micelio:save` como `{ version, savedAt, game, state }`. No hay datos
personales: nada sale del navegador.

- Cada cambio de formato sube `version` y añade `migrations[n]` (de n a n + 1).
- `game` es la versión del juego que guardó (desde la 1.5.0). Si un guardado no se entiende y viene
  de un formato o de una versión del juego posteriores, no se toca: el juego no guarda nada y pide
  recargar con conexión (§4.31, BUG-JOURNAL #24).
- Si el guardado está dañado, se copia a `micelio:save:backup` y se empieza de cero.
- **Versión 7 (fase 10), entera de una vez.** `cycle`, `records`, las seis adaptaciones de la
  pradera y la tundra y las tres cosméticas de los votos entraron con su forma completa en el primer
  commit que tocó el guardado, también las claves cuyas reglas llegaban después, que hasta entonces
  solo validaban vacías (los votos, las mutaciones despiertas y los rangos cosméticos, hasta el
  bloque B). Un push a `main` publica, y una v7 escrita por una versión intermedia dejaría de cargar
  en la final; así tampoco hizo falta otra versión del guardado para los votos.
  `tests/fixtures/save-v7-c5.json`, escrito por ese primer commit, debe cargar en todos los que
  siguen, y `tests/fixtures/save-v7.json`, guardado por el build de la 1.6.0 (un ciclo libre a medias
  con votos y mutaciones despiertas, récords con votos y cosméticas), debe cargar y volver a
  guardarse idéntico en todas las versiones que vengan. La migración 6 → 7 solo añade claves (el bosque, la Crónica, los niveles, las esporas,
  `seen` y los socios no se tocan) y se compara campo a campo con una v7 escrita a mano; los seis
  guardados reales de la 1.5 (`tests/fixtures/save-v6-*.json`) dan, ya migrados, las cifras que
  calculaba la 1.5. La validación del tramo 5 está en §4.32. La 1.5 no pisa una v7: su
  `isFromNewerGame` ve `version: 7`, posterior a la suya.

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

| Operación                                                        | Presupuesto                   | Medido                                                                                                                                                                                                                                                                                                                                                                                                                    | Cómo                                    |
| ---------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| JavaScript del build                                             | < 150 kB comprimido           | 89.2 kB inicial + 19.3 kB del plasmodio (v1.6.0, medido tras la revisión final; antes, 89.0). Con los catálogos que llegan aparte, quien juega en español descarga 122.8 kB y quien juega en inglés 139.5 kB (bloque A de la fase 10: 84.3 kB inicial, 117.9 y 133.2 kB; fase 9: 89.5 + 18.6; fase 8: 76.4)                                                                                                               | `npm run build` (gzip que informa Vite) |
| JS inicial (guarda por paquete)                                  | ≤ 95 kB comprimido            | 88.5 kB (v1.6.0, tras la revisión final; 88.3 kB antes de ella: los votos y las cosméticas sumaron 4.6 kB; 83.7 kB con el bloque A, 74.0 kB al sacar el inglés, 86.4 kB en la v1.5.0, 94.6 kB en la v1.4.2)                                                                                                                                                                                                               | `npm run budget`, también en CI         |
| CSS inicial                                                      | ≤ 9 kB comprimido             | 8.4 kB (v1.6.0; 7.8 kB en la v1.5.0; cada bioma suma ~0.1 kB)                                                                                                                                                                                                                                                                                                                                                             | `npm run budget`                        |
| JS del plasmodio (modelo, acciones y vista)                      | ≤ 20 kB comprimido            | 19.2 kB (medido en la fase 10; aquí decía 18.6 kB, la cifra de la fase 9; estimado ~15 kB en el diseño)                                                                                                                                                                                                                                                                                                                   | `npm run budget`                        |
| Catálogo de un socio (un idioma)                                 | ≤ 7 kB comprimido             | 5.4 kB (es), 5.3 kB (en)                                                                                                                                                                                                                                                                                                                                                                                                  | `npm run budget`                        |
| Catálogo de noticias (un idioma)                                 | ≤ 7 kB comprimido             | del sotobosque 4.0 kB (es) y 3.7 kB (en); de los biomas (`news/biomes`, solo tras dispersar) 4.8 kB (es) y 4.5 kB (en). En la v1.5.0, todas juntas: 5.8 y 5.5 kB                                                                                                                                                                                                                                                          | `npm run budget`                        |
| Catálogo de la interfaz en inglés                                | ≤ 18 kB comprimido            | 17.2 kB en la v1.6.0 (17.1 kB antes de la revisión final), cerca de su tope (15.9 kB con el bloque A, 13.1 kB al sacarlo; el español sigue en el JS inicial: es el idioma por defecto)                                                                                                                                                                                                                                    | `npm run budget`                        |
| .apk de Android                                                  | —                             | 5.0 MB                                                                                                                                                                                                                                                                                                                                                                                                                    | `.github/workflows/android.yml`         |
| Vaciar 1.200 s de modelo del plasmodio                           | un tirón al abrir o al volver | 8–10 ms de mediana en caliente y 20–27 ms en frío en la Fusión (Node, escritorio); ×4–5 en un móvil medio                                                                                                                                                                                                                                                                                                                 | a mano con `advancePlasmodium` (fase 9) |
| Rastro del plasmodio                                             | < 1e63 (nombres de idle)      | 6.0e17                                                                                                                                                                                                                                                                                                                                                                                                                    | `npm run sim:plasmodio`                 |
| Frame                                                            | 60 fps estables               | ~165 fps (límite de la pantalla) en el natal, la taiga y con la placa del Puente amargo a la vista; 159 fps con la CPU frenada ×4 (fase 9, Edge local). Fase 10, en la tundra, en El regreso y en un ciclo con las tres cosméticas al tercer rango: ~165 fps en Chromium, Firefox y el Pixel 7 (162–165 con la CPU ×4); WebKit y el iPhone 14, 49–59 fps, con la mediana del frame en 15–16 ms como el natal en ese motor | `npm run perf`                          |
| Partículas vivas                                                 | ≤ 200 (pool)                  | —                                                                                                                                                                                                                                                                                                                                                                                                                         | Tope en `render/particles.ts`           |
| Segmentos de la red                                              | ≤ 2000                        | —                                                                                                                                                                                                                                                                                                                                                                                                                         | Tope en `render/network.ts`             |
| Refresco de números en pantalla                                  | ≤ 10 Hz                       | —                                                                                                                                                                                                                                                                                                                                                                                                                         | Limitador en `main.ts`                  |
| Balance en 10 esporulaciones                                     | < 1e300                       | 2.3e13                                                                                                                                                                                                                                                                                                                                                                                                                    | `npm run sim`                           |
| Balance del viaje (cuatro destinos, El regreso y el ciclo libre) | < 1e63 (nombres de idle)      | 1.01e18 con dos vueltas del ciclo libre (v1.6.0; 1.08e18 antes de recalibrar el Chocó; 7.4e17 en la fase 8, con dos biomas y 4 partidas más); crece lineal con los ciclos                                                                                                                                                                                                                                                 | `npm run sim`                           |
| Simulador de la red (`npm run sim`)                              | ≤ 10 min en el PC del usuario | 154–189 s en 11 hilos y 60–63 s el del plasmodio (v1.6.0, con la matriz de votos; la última corrida, 189 s + 60 s; 154 s + 65 s con el bloque A; 165 s + 64 s en un hilo en la fase 9)                                                                                                                                                                                                                                    | `npm run sim`                           |

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
src/render/    canvas de la red, partículas, la banda de la Red planetaria y las cosméticas
src/audio/     sonidos sintetizados
src/i18n/      catálogos (es.ts base; en.ts, news/, news/biomes/ y partners/ llegan aparte) y
               formato con Intl
src/partners/  socios (fase 9): registro, núcleo de cada uno y, aparte, su modelo y su vista
scripts/       simuladores de balance (red, repartida entre hilos, y plasmodio), presupuesto de JS,
               procedencia de placas, guardados reales de la 1.5
tests/         pruebas de Vitest; tests/e2e/, de Playwright; tests/fixtures/, guardados reales
docs/          STATUS, BUG-JOURNAL, BALANCE, ROADMAP y rediseno/ (el plan aprobado de la 1.6.2)
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
táctiles ≥ 44 px. ~~Al bajar a las pestañas, el núcleo de bolsillo queda abajo a la derecha
(§4.30).~~ Desde 1.4.2 el contador y el escenario con el núcleo se quedan fijos arriba y solo se
desplaza el panel (§4.30).

**Movimiento:** solo la esporulación está orquestada. Lo demás responde a acciones: brote
de filamentos al comprar, onda y número flotante al hacer clic, campanilla visual del logro
y aparición de la gota.

Dispersar (fase 8) es una variante de ese único momento orquestado, no un segundo: el mismo
brillo, pero las esporas salen con el viento hacia un lado, el suelo del bioma nuevo se funde
sobre el viejo y brota la red. Con «reducir movimiento», el cambio de suelo es instantáneo.

---

## Correcciones

Se tachan en su sitio, con lo que las sustituye al lado. Dónde están:

- §4.8 (fase 8): en el Chocó la lluvia y el Aguacero sí se solapan; el Rocío sigue usando la
  producción con el evento.
- §4.9 (2026-10-01): el repositorio es público y no privado: con la cuenta gratuita, GitHub Pages
  no publicaba desde uno privado.
- §4.10 (fase 10): el límite sin conexión suma el Letargo profundo, el bioma y el Liquen, y en la
  tundra el tiempo aplicado cobra el deshielo.
- §4.21 (fase 8): las esporas salen de los nutrientes del bosque actual, no de los de vida.
- §4.23 (tras la 1.4.1): cada noticia se queda 20 s y no 12, y el bosque natal tiene 74 frases.
- §4.24 (2026-10-01): la notación por defecto escribe el nombre del orden de magnitud («1,5
  millones») y no sufijos cortos, que siguen en Ajustes; la científica empieza en 1e66, no en 1e36.
- §4.25 (fase 10): unas pocas pruebas de navegador corren contra el servidor de desarrollo.
- §4.28 (fase 10): la R de los destinos es una tabla por tramo, no una potencia de 3,5; las
  escritoras de la Crónica son tres, no dos; y sí se vuelve a un bioma.
- §4.32 y §4.33 (revisión final de la 1.6.0): el salto del Chocó a 1:08:01 era de la medida del
  simulador (BUG-JOURNAL #28); el Chocó del ciclo pasa a 5e14 y 5,5 R, y suben tres factores de voto.
- §4.30 y §11 (1.4.2): el núcleo de bolsillo, sustituido por la franja fija de arriba; el
  escenario pegajoso, que §4.30 descartaba, es lo que se eligió.
- §4.30 (1.6.0): lo que evita que el foco quede bajo lo fijo es un margen, no un relleno, y hay uno
  también para la barra de pestañas del móvil.

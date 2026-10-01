# Micelio — prompt para crear un videojuego idle desde cero

Oct 1, 2026 · @Juan

## 1. Rol y objetivo

Eres un desarrollador senior de videojuegos web y diseñador de sistemas incrementales. Vas a construir desde cero **Micelio**, un juego idle completo para navegador (escritorio y móvil), siguiendo esta especificación.

El resultado debe sentirse como un juego terminado, no como una demo técnica: ritmo bien balanceado, respuesta satisfactoria a cada acción e identidad visual propia.

Donde esta especificación no llegue, decide con criterio de diseño y registra la decisión en `ARCHITECTURE.md`. Los números de este documento usan notación de programación: punto decimal y `1e6` = un millón.

## 2. Visión del juego

**Concepto:** el jugador es una red de hongos que crece bajo el suelo de un bosque. Empieza como un solo filamento que absorbe nutrientes y termina conectando bosques enteros. Al madurar, libera esporas y vuelve a empezar, cada vez más fuerte.

**Fantasía del jugador:** cultivar algo vivo, enorme e invisible, y saber que la red sigue creciendo mientras no miras.

**Tono:** contemplativo y cálido, con humor suave; nada de estética de casino. Textos breves con datos reales sobre hongos: micorrizas, anillos de hadas, el *Armillaria* de Oregón. Si un dato está en discusión científica, preséntalo como creencia o folclore.

**Pilares de diseño:**

1. Siempre hay una meta visible a menos de 2–3 minutos.
2. Cada compra se nota: número, sonido sutil y cambio visible en la red.
3. El progreso offline es real; el juego activo se premia, pero no se exige.
4. Revelación progresiva: la interfaz empieza casi vacía y crece con el jugador.

## 3. Alcance

**Incluye:** clic y producción pasiva, 10 generadores, mejoras, hitos, logros, un evento aleatorio (Lluvia), prestigio (Esporular) con árbol de mutaciones, autocompra y progreso offline. También guardado local con exportar e importar, estadísticas, ajustes, ticker de noticias, visualización procedural en canvas, sonido sintetizado y diseño responsive y accesible, en español e inglés.

**No incluye:** backend, cuentas, multijugador, monetización, anuncios ni analítica. Tampoco imágenes ni audio externos: todo el arte y el sonido se generan con código. Otros idiomas quedan para después, pero sumarlos no debe tocar código (sección 19).

## 4. Stack técnico y restricciones

- Vite + TypeScript en modo `strict`, sin `any`.
- Sin framework de UI: TypeScript puro con componentes mínimos que crean el DOM una vez y solo actualizan los nodos que cambian. Nunca reconstruyas el DOM con `innerHTML` en cada tick.
- Canvas 2D para la red y Web Audio API para el sonido.
- Vitest, ESLint y Prettier, más un flujo de GitHub Actions que ejecuta lint, pruebas y build en cada push.
- Números con `number` nativo y todas sus operaciones encapsuladas en `src/core/num.ts`, para poder migrar a `break_eternity.js` sin tocar el resto. El balance no debe superar `1e300` en las primeras 10 esporulaciones.
- Fuentes autoalojadas con `@fontsource` (ver sección 14).
- Build estático en `dist/`, publicado en GitHub Pages (sección 20).

Registra en `ARCHITECTURE.md` por qué se descartaron React (re-renderizar 20 veces por segundo sin necesidad) y Phaser (un motor de escenas para un juego que es sobre todo interfaz).

## 5. Arquitectura y bucle de juego

La lógica es pura, determinista y se prueba sin DOM. La presentación solo lee el estado y despacha acciones.

```text
AGENTS.md            acuerdo de trabajo: convenciones, idioma y comandos
CLAUDE.md            tres líneas que apuntan a AGENTS.md
ARCHITECTURE.md      decisiones, alternativas descartadas y por qué
docs/STATUS.md       en qué punto va el proyecto y qué sigue
docs/BUG-JOURNAL.md  síntoma, causa, arreglo y qué prueba lo sostiene
docs/BALANCE.md      tabla final de valores y resultados del simulador
src/
  core/        estado, fórmulas, tick y acciones (sin DOM)
  data/        generadores, mejoras, logros, mutaciones y noticias (solo datos)
  systems/     guardado, offline, lluvia, autocompra y logros
  ui/          componentes, pestañas, tooltips, modales y avisos
  render/      canvas de la red y partículas
  audio/       sonidos sintetizados
  i18n/        textos visibles: es.ts (base) y en.ts
  main.ts      arranque y bucle principal
scripts/simulate.ts   simulador de balance
tests/
```

- Un único `GameState` serializable, sin clases ni funciones dentro.
- Las acciones son funciones `(state, payload) => void`; la UI nunca modifica el estado directamente.
- Todo número de balance vive en `src/data/`, con un comentario que diga de dónde salió (por ejemplo, la corrida del simulador que lo fijó).
- Los valores derivados (N/s, multiplicadores) se calculan en selectores con caché y se invalidan solo cuando algo cambia: compra, evento, logro o esporulación.

**Bucle:** lógica a paso fijo de 50 ms (20 Hz) con acumulador y render con `requestAnimationFrame`. Los números en pantalla se refrescan como máximo 10 veces por segundo. Mide el tiempo con marcas de tiempo, nunca contando ticks; al volver de segundo plano, aplica el tiempo transcurrido de forma analítica (sección 11).

Si tienes la skill `project-foundations`, úsala para los documentos raíz sin repetir su entrevista: las respuestas están en este prompt.

## 6. Bucle principal y recursos

Absorber con clic → comprar generadores → producción pasiva → mejoras e hitos que multiplican → generadores mayores → Esporular → nueva partida con bonos permanentes y mutaciones.

- **Nutrientes (N):** moneda principal. Se llevan tres totales: actuales, ganados en la partida y ganados en toda la vida.
- **Esporas:** moneda de prestigio. Cada esporulación suma al **nivel de esporas** (bono permanente) y a las **esporas disponibles** (se gastan en mutaciones). Gastar esporas no baja el nivel.

## 7. Generadores

Diez generadores, todos con crecimiento de coste r = 1.15. Los valores vienen de un simulador de referencia (sección 17): tómalos como punto de partida.

| # | Generador | Texto de la tarjeta | Coste base (N) | Producción base (N/s) | Disponible |
| --- | --- | --- | --- | --- | --- |
| 1 | Hifa | Un filamento más fino que un cabello. Todo empieza aquí. | 10 | 0.1 | Desde el inicio |
| 2 | Rizomorfo | Cordones de hifas que viajan lejos en busca de alimento. | 120 | 1 | Desde el inicio |
| 3 | Primordio | El botón diminuto que un día será seta. | 1300 | 9 | Desde el inicio |
| 4 | Seta | Lo único que el mundo ve de ti. | 1.4e4 | 55 | Desde el inicio |
| 5 | Anillo de hadas | Un círculo de setas que el folclore atribuye a las hadas. | 1.6e5 | 320 | Desde el inicio |
| 6 | Red micorrícica | Azúcares de las raíces a cambio de agua y minerales. | 1.8e6 | 1800 | Desde el inicio |
| 7 | Árbol madre | Un abeto viejo en el centro de la red. La ciencia aún discute cuánto comparte. | 2.2e7 | 1.05e4 | Desde el inicio |
| 8 | Bosque milenario | Ya no se sabe dónde termina el bosque y dónde empiezas tú. | 3e8 | 6.5e4 | Desde el inicio |
| 9 | Gigante de Malheur | Como el *Armillaria ostoyae* de Oregón: kilómetros de un solo individuo. | 5e9 | 4.2e5 | Tras la primera esporulación |
| 10 | Red planetaria | Bajo cada pradera y cada bosque, un mismo pulso. | 9e10 | 2.9e6 | Con la mutación Más allá del bosque |

Coste de la siguiente unidad con n poseídas y descuento d por mutaciones:

```latex
C(n) = C_0 \, (1 - d) \, r^{n}
```

Coste de k unidades de golpe y máximo comprable con F nutrientes:

```latex
C(n, k) = C_0 \, (1 - d) \, r^{n} \, \frac{r^{k} - 1}{r - 1}
\qquad
k_{\max} = \left\lfloor \log_{r}\!\left( \frac{F \, (r - 1)}{C_0 \, (1 - d) \, r^{n}} + 1 \right) \right\rfloor
```

Verifica k\_max contra C(n, k) y réstale uno si el redondeo lo dejó por encima de F.

## 8. Clic, mejoras e hitos

**Absorber:** cada clic o toque sobre el núcleo de la red da V nutrientes; también funciona con Espacio o Enter. La respuesta es un número flotante, una onda y un pulso que recorre la red.

```latex
V = M + q \, P
```

M es el producto de los multiplicadores de clic (base 1) y q la suma de porcentajes de N/s por clic.

**Mejoras de generador:** cuatro por generador, 40 en total, cada una ×2 a ese generador. Aparecen al poseer 1, 10, 25 y 50 unidades y cuestan 10, 100, 1000 y 1e5 veces su coste base. Dales nombres temáticos; para la Hifa, por ejemplo: Quitina flexible, Punta de crecimiento, Anastomosis e Hifas aéreas.

**Hitos:** al llegar a 25, 50, 100, 150, 200, 250, 300, 350 y 400 unidades de un generador, su producción se duplica. Cada fila muestra una barra hacia el siguiente hito.

**Mejoras de clic, globales y sinergias** ("N ganados" se refiere a la partida actual):

| Mejora | Tipo | Aparece con | Coste (N) | Efecto |
| --- | --- | --- | --- | --- |
| Tacto sensible | Clic | 100 N ganados | 500 | Clic ×2 |
| Quimiotropismo | Clic | 5e3 N ganados | 2e4 | +1 % de N/s por clic |
| Humus fértil | Global | 1e4 N ganados | 2.5e4 | Producción ×1.10 |
| Impulsos eléctricos | Clic | 5e5 N ganados | 2e6 | +2 % de N/s por clic |
| Hojarasca de otoño | Global | 1e6 N ganados | 2.5e6 | Producción ×1.15 |
| Corro de brujas | Sinergia | 50 Setas | 2e7 | Cada Seta da +0.5 % a los Anillos de hadas |
| Absorción voraz | Clic | 5e7 N ganados | 2e8 | Clic ×2 |
| Compost ancestral | Global | 1e8 N ganados | 2.5e8 | Producción ×1.20 |
| Intercambio de azúcares | Sinergia | 10 Árboles madre | 5e8 | Cada Árbol madre da +1 % a las Redes micorrícicas |
| Ciclo del carbono | Global | 1e10 N ganados | 2.5e10 | Producción ×1.25 |

Muestra solo las mejoras disponibles, ordenadas por coste, con un tooltip que diga el efecto exacto y cuánto subirá la producción («+12.4 N/s»).

**Producción total:**

```latex
P = G \sum_{i} p_i \, n_i \, 2^{\,u_i + h_i} \, s_i
\qquad
G = (1 + 0.01 \, S)\,(1 + a \, L) \prod_{j} g_j \cdot E
```

p\_i es la producción base, n\_i las unidades, u\_i las mejoras ×2 compradas, h\_i los hitos y s\_i las sinergias. S es el nivel de esporas, L los logros, a = 0.01 (0.02 con Simbiosis antigua), g\_j las mejoras globales y E el evento activo (5 durante el Aguacero, 1 sin evento).

## 9. Evento aleatorio: Lluvia

Cada 2–5 minutos cae una gota en un punto al azar de la zona de juego; dura 12 s y luego se evapora. Al tocarla se sortea un efecto:

| Efecto | Probabilidad | Resultado |
| --- | --- | --- |
| Aguacero | 55 % | Producción ×5 durante 60 s |
| Rocío | 35 % | Ganas al instante lo menor entre el 12 % de tus nutrientes y 12 minutos de producción |
| Tormenta eléctrica | 10 % | Clic ×500 durante 12 s |

- Los efectos activos se ven con icono, nombre y cuenta atrás.
- No hay lluvia offline ni gotas acumuladas.
- Para el texto de la Tormenta: en Japón se ha experimentado con descargas eléctricas para aumentar la cosecha de setas.

## 10. Esporular (prestigio) y mutaciones

Esporular se habilita cuando la partida suma 1e8 nutrientes ganados. Las esporas dependen de L, los nutrientes ganados en toda la vida:

```latex
E(L) = \left\lfloor k \sqrt{L / 10^{8}} \right\rfloor \qquad k = 15
```

Al esporular ganas E(L) − S esporas, donde S es tu nivel actual. Cada nivel da +1 % de producción global.

- **Se reinicia:** nutrientes, generadores, mejoras, hitos y efectos activos.
- **Se conserva:** nivel y esporas disponibles, mutaciones, logros, estadísticas de vida y ajustes.
- La confirmación muestra las esporas que ganarás, el bono actual frente al nuevo y lo que se pierde. Al confirmar, la red se ilumina y se deshace en partículas durante 2–3 s.
- La interfaz muestra siempre cuántas esporas darías ahora y cuántos nutrientes faltan para la siguiente.

**Árbol de mutaciones** (permanentes; se pagan con esporas disponibles):

| Mutación | Coste (esporas) | Requiere | Efecto |
| --- | --- | --- | --- |
| Memoria del suelo | 1 | — | Empiezas cada partida con 100 N y 10 Hifas |
| Quitina ligera | 3 | Memoria del suelo | Generadores 10 % más baratos (d = 0.10) |
| Absorción profunda | 3 | Memoria del suelo | El clic suma +3 % de N/s |
| Olfato de lluvia | 5 | Absorción profunda | La lluvia aparece un 30 % más seguido |
| Sueño invernal | 5 | Memoria del suelo | Offline al 100 % (base 50 %) y hasta 24 h (base 8 h) |
| Instinto | 10 | Quitina ligera | Autocompra de generadores |
| Tormenta perfecta | 15 | Olfato de lluvia | Los efectos de la lluvia duran un 50 % más |
| Simbiosis antigua | 20 | Absorción profunda | Cada logro da +2 % en vez de +1 % |
| Más allá del bosque | 25 | Instinto | Desbloquea la Red planetaria |
| Esporas aladas | 40 | Simbiosis antigua | k pasa de 15 a 18.75 (+25 % de esporas) |
| Instinto superior | 60 | Instinto | Autocompra de mejoras |
| Herencia | 100 | Más allá del bosque y Esporas aladas | Empiezas cada partida con 10 unidades de los cuatro primeros generadores |

Dibuja el árbol con sus conexiones; los nodos bloqueados se ven en silueta, con su requisito.

## 11. Logros, autocompra y progreso offline

**Logros:** unos 50, cada uno con +1 % de producción global. Son permanentes y avisan con una notificación breve.

- Poseer 1, 50 y 100 unidades de cada generador.
- Nutrientes de vida: 1e3, 1e6, 1e9, 1e12 y 1e15.
- Producción: 10, 1e3, 1e5, 1e7 y 1e9 N/s.
- Clics: 100, 1000 y 10000; gotas atrapadas: 1, 10 y 50; esporulaciones: 1, 5 y 10.
- Secretos, ocultos hasta conseguirlos: Paciencia de hongo (10 minutos sin hacer clic con el juego abierto) y Sin prisa (volver tras 8 horas).

**Autocompra** (mutación Instinto): un interruptor por generador. Cada segundo compra una unidad si cuesta menos del 10 %, 50 % o 100 % de los nutrientes, según elija el jugador. Instinto superior hace lo mismo con las mejoras.

**Progreso offline:**

- Al cargar, calcula el tiempo desde el último guardado. Base: 50 % de eficiencia y límite de 8 h; Sueño invernal lo sube a 100 % y 24 h.
- Cálculo analítico, no tick a tick: ganancia = N/s × segundos efectivos × eficiencia. Offline no hay lluvia; la autocompra se ejecuta una vez al volver.
- Si pasaron más de 60 s, muestra el modal «Mientras no estabas…» con el tiempo, los nutrientes ganados y una frase temática.
- Pestaña en segundo plano: al volver, aplica el tiempo al 100 % (el juego seguía abierto), con el mismo límite.
- Si el reloj del sistema retrocede, ignora el intervalo negativo.

## 12. Revelación progresiva y noticias del sotobosque

- Al empezar solo se ven el núcleo, el contador y la indicación «Toca para absorber nutrientes».
- Un generador aparece en silueta («???») al tener el 50 % de su coste, y completo al poder comprarlo.
- Cada pestaña aparece cuando tiene contenido: Mejoras con la primera mejora, Logros con el primero, Esporular al 25 % del requisito y Mutaciones tras la primera esporulación.
- La primera vez de cada sistema, un mensaje breve en contexto; nada de tutoriales largos.

**Noticias del sotobosque:** una línea al pie que cambia cada 12 s, con unas 40 frases que se desbloquean con el progreso. Tono de ejemplo:

- «Una lombriz denuncia que el suelo está sospechosamente organizado.»
- «Se recomienda no pisar los anillos de hadas. Por si acaso.»
- «Los robles del norte cierran un acuerdo: azúcar a cambio de fósforo.»
- «Recolectores reportan setas en lugares imposibles. Las setas no hacen comentarios.»

## 13. Interfaz

**Escritorio (≥ 1024 px):** el corte del suelo ocupa el centro y es el protagonista. A la izquierda van el contador de nutrientes, N/s, el núcleo para clic y los efectos activos. A la derecha, las pestañas: Generadores, Mejoras, Esporular, Mutaciones, Logros, Estadísticas y Ajustes. Al pie, el ticker.

**Tableta (768–1023 px):** canvas arriba y pestañas debajo.

**Móvil (< 768 px):** una columna con contador y N/s fijos arriba, canvas reducido con el núcleo y barra de pestañas abajo. Objetivos táctiles de 44 px como mínimo; tooltips por toque o pulsación larga, nunca solo con hover.

**Fila de generador:** icono SVG propio, nombre, cantidad, producción unitaria y total, porcentaje del total de N/s, barra al siguiente hito y botón de compra. Si no alcanza, el botón dice cuánto falta en tiempo («en 1 min 20 s»). Selector global de cantidad: ×1, ×10, ×100 y Máx.

**Números:** todo el formato usa `Intl.NumberFormat` con el idioma activo. Hasta 999 999 se muestran completos. Desde 1e6 se usan sufijos de juegos idle (M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc) con un tooltip que da la notación científica y el nombre largo en el idioma activo («mil millones» para B). Desde 1e36, notación científica; en Ajustes se elige sufijos, científica o ingeniería.

**Ajustes:** idioma, notación, sonido y volumen, reducir movimiento, exportar e importar partida y borrar partida (escribiendo BORRAR para confirmar).

**Estadísticas:** nutrientes de la partida y de vida, N/s máximo, clics, gotas, esporulaciones, tiempo jugado (partida y total) y fecha de inicio.

**Textos:** voz activa y verbos claros. Un botón dice lo que hace («Comprar 10 Hifas», «Esporular») y su aviso repite el verbo («Esporulaste: +15 esporas»).

## 14. Dirección de arte y sonido

El protagonista es un corte vertical del suelo: hojarasca arriba, horizontes de tierra debajo y la red creciendo en ellos. Cuanto más progresa el jugador, más hondo llega la red.

| Token | Hex | Uso |
| --- | --- | --- |
| `--humus` | #261C15 | Fondo y horizonte superior |
| `--tierra` | #4A3424 | Paneles y horizontes medios |
| `--arcilla` | #8C5A35 | Horizonte profundo y bordes; nunca texto sobre humus (2.9:1) |
| `--micelio` | #EFE6D2 | Hifas y texto principal (13.4:1 sobre humus) |
| `--rebozuelo` | #E8A93A | Acento de compras y acciones, con texto humus encima (8.1:1) |
| `--fuego-fatuo` | #B8EFC4 | Solo pulsos de producción y gotas de lluvia |

**Tipografía:** dos familias libres, autoalojadas y claramente distintas. Títulos con aire de libro naturalista antiguo (por ejemplo, IM Fell English) e interfaz con una sans humanista muy legible (por ejemplo, Source Sans 3). Toda cifra que cambia usa `font-variant-numeric: tabular-nums` para no bailar. Evita Inter, Roboto y Arial.

**Canvas de la red:**

- Crecimiento procedural por ramificación (caminata aleatoria con bifurcaciones), con tope de segmentos (por ejemplo, 2000).
- Cada compra hace brotar filamentos nuevos; la densidad y la profundidad crecen con el progreso.
- Pulsos `--fuego-fatuo` recorren la red con frecuencia proporcional al logaritmo de N/s, con tope.
- Setas y anillos brotan en la superficie; los Árboles madre son siluetas unidas a la red.
- La red acumulada se dibuja en un canvas fuera de pantalla; encima solo se animan los pulsos.

**Movimiento:** un único momento orquestado, la esporulación. El resto del movimiento responde a acciones del jugador: compra, clic, logro y gota. Nada de animaciones de entrada en cada panel.

**Evita:** emojis, librerías genéricas de iconos, tarjetas idénticas con la misma sombra gris, etiquetas en mayúsculas sostenidas y flechas decorativas en botones. Si tienes la skill `frontend-design`, úsala. Antes de maquetar, escribe un plan visual breve (paleta, tipografía y un boceto ASCII) y revísalo contra esta sección.

**Sonido:** Web Audio sintetizado y suave: «plop» al clic con tono algo aleatorio, campanilla al comprar, acorde al lograr algo y goteo cuando aparece la lluvia. Volumen bajo por defecto, silenciable y mudo hasta la primera interacción.

## 15. Guardado y persistencia

La partida se guarda sola en `localStorage`, con la clave `micelio:save`, y ningún error del juego debe hacerla perder.

- **Cuándo:** cada 15 s, al ocultarse la pestaña (`visibilitychange`), al salir (`pagehide`) y justo después de esporular.
- **Formato:** `{ version, savedAt, state }`. `savedAt` es la marca de tiempo que usa el progreso offline (sección 11).
- **Migraciones:** cada cambio de formato sube `version` y añade `migrations[n]`, que lleva un guardado de la versión n a la n + 1. Al cargar se aplican en orden.
- **Validación al cargar:** estructura, tipos y números finitos (ni `NaN` ni `Infinity`). Si el guardado está dañado, cópialo a `micelio:save:backup`, avisa y empieza una partida nueva sin romper nada.
- **Sin almacenamiento:** si `localStorage` falla o está lleno, el juego sigue funcionando y avisa una sola vez que no puede guardar.
- **Dos pestañas:** al abrir, cada pestaña escribe su id en `micelio:tab`. Las demás lo detectan con el evento `storage`, dejan de guardar y ofrecen recargar.

**Exportar e importar** (desde Ajustes):

- Exportar produce un texto Base64 del guardado y un botón Copiar. Codifica con `TextEncoder`: `btoa` directo falla con tildes y eñes.
- Importar valida el texto, muestra un resumen (nutrientes de vida, nivel de esporas y fecha) y pide confirmación antes de reemplazar la partida.
- Un texto inválido muestra un error claro y no toca la partida actual.

## 16. Rendimiento y accesibilidad

El juego corre a 60 fps estables en un portátil corriente y en un móvil de gama media, y se puede jugar entero con teclado.

**Rendimiento:**

- Partículas en un pool de objetos con tope (por ejemplo, 200). El bucle de render no crea objetos nuevos en cada frame.
- Canvas con `devicePixelRatio` limitado a 2. Con la pestaña oculta no se dibuja nada; la lógica se pone al día al volver (sección 11).
- Valores derivados en caché con invalidación explícita (sección 5); nada se recalcula entero en cada tick.
- Sin fugas ni listeners duplicados: cada componente se da de baja al destruirse. La memoria se estabiliza tras 10 minutos de juego; compruébalo con las herramientas del navegador.
- El JavaScript del build pesa menos de 150 kB comprimido, sin contar fuentes.

**Accesibilidad:**

- Todo lo interactivo es un `<button>` real con texto o `aria-label`, incluidos el núcleo de clic y las gotas de lluvia. El canvas es decorativo y lleva `aria-hidden`.
- Orden de tabulación lógico y foco visible con un anillo `--rebozuelo` (8.1:1 sobre humus).
- Contraste AA en todo el texto; la paleta de la sección 14 ya lo cumple. Nada depende solo del color: un botón sin fondos suficientes también lo dice con texto.
- Una región `aria-live` en modo `polite` anuncia solo logros, lluvia y esporulación. Nunca el contador, que cambia 10 veces por segundo.
- `prefers-reduced-motion` y el ajuste «Reducir movimiento» quitan partículas y sacudidas, vuelven instantáneas las transiciones y reducen la esporulación a un fundido breve.
- Ningún efecto destella más de 3 veces por segundo, tampoco la Tormenta eléctrica.
- El diseño aguanta el zoom del navegador al 200 % sin cortar contenido, y el sonido nunca da información que no esté también en pantalla.

## 17. Balance: simulador y objetivos de ritmo

El balance se valida con un simulador, no a ojo: `scripts/simulate.ts` (`npm run sim`) juega partidas completas sin interfaz y escribe los resultados en `docs/BALANCE.md`.

- Importa `src/core` y `src/data`: las mismas fórmulas del juego, sin copias. Avanza el tiempo a pasos de 1 s.
- Todo el azar de la lógica pasa por un generador con semilla inyectable; `src/core` y `src/systems` nunca llaman a `Math.random`.
- Corre 9 semillas por escenario y reporta medianas y rango.
- **Perfil activo:** 5 clics/s los primeros 15 min y luego 2 clics/s; atrapa todas las gotas.
- **Perfil pasivo:** 5 clics/s el primer minuto y después ninguno; no atrapa gotas.
- **Bot comprador:** elige la compra con menor suma de espera hasta poder pagarla y amortización (coste ÷ aumento de ingresos por segundo, clic incluido).
- **Campaña:** esporula cuando la ganancia de esporas es al menos max(10, nivel actual) y compra mutaciones en el orden de la tabla en cuanto le alcanzan.

Objetivos con el perfil activo salvo que se indique otro. Tiempos de juego en min:s; referencia = mediana de 9 semillas, con el rango entre paréntesis.

| Métrica | Objetivo | Referencia |
| --- | --- | --- |
| Primer Rizomorfo | < 1 min | 0:30 |
| Primer Primordio | 3–5 min | 3:43 |
| Primera Seta | 7–10 min | 8:26 |
| Primer Anillo de hadas | 14–20 min | 17:12 |
| Primera Red micorrícica | 24–32 min | 27:28 |
| Esporular disponible en la partida 1 | 30–45 min | 40:37 (30:00–50:35) |
| Esporas de la primera esporulación | 12–18 | 15 |
| Partida 2 hasta Esporular disponible, con 15 esporas y las 4 primeras mutaciones | Al menos 40 % más rápida que la 1 | 21:05 (48 % más rápida) |
| Perfil pasivo hasta Esporular disponible | Como mucho 2.5 veces el activo | 76:10 (1.9 veces) |
| Primer Gigante de Malheur, en tiempo acumulado | 2–3.5 h | 2.9 h (2.6–3.3) |
| Duración mediana de cada una de las 8 primeras partidas de la campaña | Al menos 10 min | La más corta, la 8.ª: 11:57 |

La referencia sale de un prototipo en Python con estas tablas, logros aproximados y la lluvia de la sección 9. Con +2 % por nivel de esporas, las partidas 6 a 8 bajaban de 10 min; por eso el bono es +1 %.

Tu simulador manda. Si un objetivo falla, ajusta la palanca más cercana (generadores y mejoras para la partida 1; esporas y mutaciones para las siguientes), vuelve a simular y anota en `docs/BALANCE.md` qué cambiaste y por qué.

## 18. Calidad, pruebas y convenciones

Cada fórmula del núcleo tiene pruebas, y ninguna fase se cierra con lint, pruebas o build en rojo.

**Pruebas con Vitest**, como mínimo de:

- Coste de una unidad y de un lote, y máximo comprable.
- Producción con mejoras, hitos y sinergias, y valor del clic.
- Progreso offline: eficiencia, límite y reloj que retrocede.
- Fórmula de esporas y qué conserva o reinicia la esporulación.
- Guardado, carga, migraciones y guardados dañados.
- Formato de números en sus cambios de escala (999 999, 1e6 y 1e36).

**Convenciones:**

- Cada prueba se nombra por el comportamiento que garantiza («el máximo comprable nunca supera los nutrientes») y compara contra valores calculados a mano, no contra la misma fórmula.
- Cada bug corregido entra en `docs/BUG-JOURNAL.md` con síntoma, causa y arreglo, más una prueba que falla sin el arreglo.
- `npm run lint`, `npm test` y `npm run build` terminan sin errores ni advertencias, y la consola del navegador queda limpia.
- Identificadores en inglés; comentarios, documentos, descripciones de pruebas y mensajes de commit en español.
- Ningún texto visible vive fuera de `src/i18n/`.
- Cada dependencia nueva se justifica en `ARCHITECTURE.md`; la lista de partida es la de la sección 4.
- Commits pequeños, uno por cambio con sentido, y cada uno deja el proyecto en verde.

## 19. Idiomas

El juego sale en español e inglés, y sumar un idioma debe costar solo un archivo de traducción.

- **Catálogos:** `src/i18n/es.ts` es la base y de sus claves sale un tipo; `en.ts` debe cumplirlo, así que una clave que falte rompe la compilación.
- **Datos sin texto:** `src/data/` guarda claves (`gen.hypha.name`), nunca nombres en español. Igual para mejoras, logros, mutaciones y noticias.
- **Detección:** primero el idioma guardado en Ajustes, luego `navigator.languages` y, si no hay coincidencia, español. El cambio es instantáneo: no recarga ni toca la partida, y actualiza `<html lang>`.
- **Frases completas:** interpolación con marcadores con nombre (`{count}`, `{name}`) y plurales con `Intl.PluralRules`. Nunca armes frases pegando trozos: el orden de las palabras cambia entre idiomas.
- **Formato:** números, fechas y duraciones con `Intl` en el idioma activo. Los nombres largos de los sufijos («mil millones», «billion») viven en cada catálogo.
- **Adaptar, no calcar:** nombres, tarjetas y noticias conservan el tono y el humor, y los datos sobre hongos siguen siendo veraces. El Anillo de hadas es *Fairy ring* y el Árbol madre, *Mother tree*.
- **Todo es texto:** también se traducen `aria-label`, avisos, el título de la página y la meta descripción.
- **Control:** una prueba verifica que todos los idiomas tienen las mismas claves, sin cadenas vacías y con los mismos marcadores. En desarrollo, un pseudoidioma alarga los textos un 40 % para detectar cortes; comprueba además que las fuentes cubren cada idioma.

## 20. Repositorio en GitHub y despliegue

El proyecto vive en un repositorio de GitHub desde el primer commit, con CI en cada push y el juego publicado en GitHub Pages.

- **Antes de crear nada en GitHub,** confirma con el usuario en una sola pregunta el nombre del repositorio (`micelio` por defecto), la visibilidad y la licencia. Con una cuenta gratuita, GitHub Pages exige un repositorio público.
- **Arranque:** `git init` con rama `main`, `.gitignore` de Node (`node_modules`, `dist`, `coverage`, `.env`) y la versión de Node fijada en `.nvmrc` y en `engines` de `package.json`. Tras el primer commit, `gh repo create` con `--source .`, `--push` y una descripción.
- **Sin acceso a GitHub:** si `gh` no está instalado o autenticado, no pidas tokens ni contraseñas. Dale al usuario los pasos exactos (`gh auth login`) y sigue en local hasta poder subir.
- **CI** (`.github/workflows/ci.yml`): `npm ci`, lint, pruebas y build en cada push y en cada pull request, con caché de npm.
- **Despliegue:** cada push a `main` que pase el CI publica `dist/` con las acciones oficiales de Pages (`actions/upload-pages-artifact` y `actions/deploy-pages`). Activa Pages con origen GitHub Actions, por ejemplo con `gh api`.
- **Ruta base:** configura `base` de Vite como `/<nombre-del-repo>/` (o `/` con dominio propio); si no, los recursos no cargan.
- **Versiones:** al cerrar la fase N, etiqueta `v0.N.0` y crea un release con su resumen. Cuando se cumpla la definición de terminado, `v1.0.0`.
- **README:** enlace al juego publicado, insignia del CI y cómo jugar, desarrollar y desplegar.
- **Higiene:** ningún secreto en el repositorio (el juego no necesita ninguno) y Dependabot mensual para npm y GitHub Actions.

## 21. Plan de trabajo por fases

Trabaja en cinco fases y no empieces una sin cerrar la anterior.

Antes de escribir código, deja en `docs/STATUS.md` un plan breve: el modelo de `GameState`, los archivos que vas a crear y el orden. Al cerrar cada fase, corre lint, pruebas y build, haz commit y push, actualiza `docs/STATUS.md` y resume en 3 a 5 líneas qué quedó y qué sigue.

1. **Núcleo jugable:** repositorio en GitHub con documentos raíz y CI (sección 20), `GameState`, bucle, clic, los 8 primeros generadores, selector ×1/×10/×100/Máx, formato de números, guardado y offline, con todos los textos en el catálogo desde el primer día. Incluye una primera versión de `scripts/simulate.ts` con el perfil activo. **Aceptación:** se juegan 10 minutos sin errores y, al recargar, la partida sigue donde estaba.
2. **Profundidad:** mejoras, hitos, sinergias, logros, lluvia, estadísticas, noticias y revelación progresiva. **Aceptación:** siempre hay una meta visible, los logros sobreviven a una recarga y el simulador cumple los objetivos de la partida 1.
3. **Prestigio:** Esporular, árbol de mutaciones, generadores 9 y 10, y autocompra. **Aceptación:** se esporula, se compran mutaciones y todo sobrevive a una recarga.
4. **Pulido:** canvas de la red, microinteracciones, sonido, diseño responsive, accesibilidad, ajustes, exportar e importar, y la traducción completa al inglés. **Aceptación:** se siente terminado en escritorio y en móvil, y cumple las secciones 16 y 19.
5. **Balance y entrega:** campaña completa en el simulador, ajuste fino, `docs/BALANCE.md`, README y el juego publicado en GitHub Pages. **Aceptación:** se cumplen los objetivos de la sección 17 y la definición de terminado de la sección 22.

## 22. Definición de terminado y reglas de colaboración

Micelio está terminado cuando se cumple toda esta lista:

- [ ] Se juega hasta la tercera esporulación sin bugs que bloqueen. Para probarlo, usa un acelerador de tiempo que exista solo en desarrollo.
- [ ] El simulador cumple los objetivos de ritmo de la sección 17.
- [ ] Funciona en Chrome, Firefox y Safari, en escritorio y en móvil, en español y en inglés.
- [ ] El guardado resiste recargar, cerrar la pestaña, exportar e importar.
- [ ] 60 fps estables y consola limpia.
- [ ] Lint, pruebas y build en verde, también en GitHub Actions, y el juego publicado en GitHub Pages.
- [ ] `docs/STATUS.md`, `docs/BALANCE.md` y el README están al día.

**Reglas:**

- Ante una ambigüedad, decide con criterio, anótalo en `ARCHITECTURE.md` y sigue. Pregunta solo si la decisión sería difícil de revertir.
- No reduzcas el alcance en silencio: si algo no cabe, dilo y propón una alternativa.
- No inventes resultados: si no corriste una prueba o el simulador, dilo.

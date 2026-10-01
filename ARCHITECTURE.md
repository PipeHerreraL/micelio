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
cálculo y no una repetición de ticks.

En la práctica:

- `src/core`, `src/data` y `src/systems` nunca llaman a `Math.random` ni a `Date.now`
  (ESLint lo prohíbe). El tiempo entra como parámetro; el azar pasa por `src/core/rng.ts`.
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
- `i18n/`: catálogos y formato con `Intl`. Ningún texto visible vive fuera de aquí.

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
Cada acción que cambia un multiplicador (compra, evento, logro, esporulación, carga) llama
a `invalidate(state)`. Un estado nuevo (carga, simulador) arranca sin caché.

**Por qué no un campo `rev` en el estado:** ensuciaría el guardado con un dato de caché.
**Por qué no recalcular siempre:** el bucle corre a 20 Hz y la UI pide derivados a 10 Hz;
recalcular 10 generadores es barato, pero la regla de la especificación existe para que no
crezca sin control cuando se sumen sinergias y logros.

**Riesgo:** olvidar una invalidación da un N/s viejo. Lo sostienen las pruebas de
`tests/selectors.test.ts`, que comparan el valor en caché con un cálculo sin caché tras
cada acción.

### 4.7 Cola de eventos del núcleo

**Elegido:** `src/core/events.ts` es una cola (`emit`, `drain`) de eventos planos
(`achievement`, `purchase`, `rainSpawn`, `rainCaught`, `effectEnd`, `sporulate`…). El
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
- **Rocío** usa la producción actual (`P`), que ya incluye cualquier evento activo. En la
  práctica no se solapan: el intervalo mínimo entre gotas (92 s con Olfato) supera la
  duración máxima del Aguacero (90 s con Tormenta perfecta).

### 4.9 Repositorio privado y GitHub Pages

**Elegido por el usuario:** repositorio `micelio` **privado** con licencia MIT.

**Consecuencia:** con una cuenta gratuita, GitHub Pages no publica desde repositorios
privados y los minutos de Actions se facturan (2000 gratis al mes). El flujo de despliegue
está listo; si GitHub rechaza activar Pages, la alternativa es hacer público el repositorio
(la licencia MIT ya lo permite) o pasar a un plan de pago.

### 4.10 Tiempo aplicado de forma analítica

`applyElapsed(state, seconds, efficiency)` reparte el intervalo en tramos: mientras dure
un Aguacero activo, `E = 5`; el resto, `E = 1`. Así una pestaña oculta durante un Aguacero
recibe exactamente lo que habría producido en vivo. Se usa igual para offline (eficiencia
0.5 o 1 y límite 8 h o 24 h) y para volver de segundo plano (eficiencia 1, mismo límite).

- El tiempo en segundo plano cuenta como tiempo jugado (el juego seguía abierto); el
  offline no.
- Un intervalo negativo (reloj que retrocede) se trata como cero.
- «Sin prisa» se otorga por el hueco real, no por el recortado al límite.

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

### 4.14 Dependencias

| Paquete                                                    | Por qué                                            |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `vite`                                                     | Servidor de desarrollo y build estático            |
| `typescript`                                               | Tipos en modo estricto                             |
| `vitest`                                                   | Pruebas sin DOM, comparte la configuración de Vite |
| `eslint`, `@eslint/js`, `typescript-eslint`, `globals`     | Lint con tipos                                     |
| `prettier`, `eslint-config-prettier`                       | Formato, sin pelear con ESLint                     |
| `@types/node`                                              | Tipos para el simulador y las pruebas              |
| `@fontsource/im-fell-english`, `@fontsource/source-sans-3` | Fuentes autoalojadas (§4.13)                       |

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

| Operación                       | Presupuesto         | Medido | Cómo                          |
| ------------------------------- | ------------------- | ------ | ----------------------------- |
| JavaScript del build            | < 150 kB comprimido | —      | `npm run build` + gzip        |
| Frame                           | 60 fps estables     | —      | Herramientas del navegador    |
| Partículas vivas                | ≤ 200 (pool)        | —      | Tope en `render/particles.ts` |
| Segmentos de la red             | ≤ 2000              | —      | Tope en `render/network.ts`   |
| Refresco de números en pantalla | ≤ 10 Hz             | —      | Limitador en `main.ts`        |
| Balance en 10 esporulaciones    | < 1e300             | —      | `npm run sim`                 |

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
src/i18n/      catálogos (es.ts base, en.ts) y formato con Intl
scripts/       simulador de balance
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

---

## Correcciones

Ninguna todavía.

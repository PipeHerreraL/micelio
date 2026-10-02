# Cómo trabajamos en este repositorio

Este es el acuerdo de trabajo. Está escrito para **cualquier asistente de IA** (Claude,
Codex, Cursor, Copilot, Gemini) y para cualquier persona que se sume. No depende de
ninguna herramienta en particular.

Si algo aquí contradice lo que te parece razonable, gana este documento. Si crees que el
documento está mal, dilo y cámbialo **aquí**, no solo en tu cabeza.

---

## Primero: el contexto en treinta segundos

Micelio es un juego idle para navegador (escritorio y móvil, español e inglés): una red de
hongos que crece bajo el suelo. Vite + TypeScript estricto sin framework de UI, Canvas 2D
y Web Audio; sin backend. La especificación completa está en `PROMPT.md`.

**La frase que decide entre dos opciones iguales:** la lógica es pura y determinista y se
prueba sin DOM. El simulador de balance y el progreso offline dependen de eso.

- `ARCHITECTURE.md`: el plan, qué se decidió y por qué, con las correcciones tachadas.
- `docs/STATUS.md`: **dónde estamos**. Empieza aquí si acabas de llegar.
- `docs/BUG-JOURNAL.md`: cada bug que ya costó un día. Léelo antes de tocar nada.
- `docs/BALANCE.md`: la tabla de valores y lo que dijo el simulador.
- `README.md`: cómo jugar, desarrollar y desplegar.

---

## Antes de escribir código

1. **Lee `docs/BUG-JOURNAL.md`.** Las zonas delicadas son el guardado
   (`src/systems/save.ts`), el tiempo aplicado de forma analítica
   (`src/systems/offline.ts`) y la invalidación de la caché de selectores
   (`src/core/selectors.ts`).
2. **Busca el comentario antes de cambiar una constante.** Todo número de balance vive en
   `src/data/` con un comentario que dice de dónde salió (normalmente, la corrida del
   simulador que lo fijó). Si lo cambias, vuelve a correr `npm run sim` y anota el cambio
   en `docs/BALANCE.md`.
3. **Si vas a borrar algo que parece innecesario, averigua por qué está.**
   `git log -S` sobre la línea suele contar la historia.

---

## Reglas de código

### Idioma

- **Identificadores** (variables, funciones, tipos, archivos, claves de i18n): inglés.
- **Comentarios, documentos, descripciones de pruebas y mensajes de commit:** español.
- **Texto visible:** solo en `src/i18n/` (`es.ts` es la base; `en.ts` debe cumplir su
  tipo). `src/data/` guarda claves (`gen.hypha.name`), nunca texto.
- No mezcles idiomas dentro de un identificador.

### Determinismo

- `src/core`, `src/data` y `src/systems` nunca llaman a `Math.random` ni a `Date.now`
  (ESLint lo impide). El azar pasa por `src/core/rng.ts`; el tiempo entra como parámetro.
- Las acciones son `(state, payload) => void`. La UI nunca escribe el estado directamente.
- Toda acción que cambia un multiplicador llama a `invalidate(state)`.

### Números

- Las cantidades de balance (nutrientes, costes, producción) usan las operaciones de
  `src/core/num.ts`, no aritmética suelta: así migrar a `break_eternity.js` toca un archivo.
- Los conteos enteros (unidades, clics) son `number` normales.

### DOM

- Los componentes crean su DOM una vez y luego solo cambian lo que cambió. Nunca
  `innerHTML` en cada tick.
- Todo lo interactivo es un `<button>` real con texto o `aria-label`.
- Cada componente que añade listeners los quita en `destroy()`.

### Comentarios

Un comentario explica **por qué**, nunca **qué**. Siempre merecen uno: una constante que
salió de una medición o del simulador, una elección entre dos caminos (y cuál se descartó),
y cualquier tolerancia a datos mal formados (qué los produce en la realidad).

### Errores

- Ningún error del juego puede hacer perder la partida: el guardado se escribe en
  `try/catch` y una carga fallida deja copia de respaldo.
- Un error tragado en silencio necesita un comentario que diga qué se pierde.
- Nada de `!` (aserción no nula) sobre datos que vienen de `localStorage` o de importar.

### Pruebas

- Una prueba se escribe **para el caso que falló**, y su nombre dice el comportamiento:
  «el máximo comprable nunca supera los nutrientes», no «test kMax».
- Compara contra valores calculados a mano, no contra la misma fórmula.
- Antes de dar un bug por arreglado, **comprueba que la prueba falla sin el arreglo**.

### Rendimiento

- El bucle de render no crea objetos en cada frame: pools con tope.
- Mide antes de optimizar y muestra el número.

---

## Antes de cerrar un cambio: la lista

### Corrección

- [ ] `npm test` en verde.
- [ ] `npm run lint` limpio (ESLint sin advertencias y Prettier).
- [ ] `npm run build` sin errores ni advertencias.
- [ ] Si tocaste interfaz: `npm run test:e2e` en verde.
- [ ] Hay una prueba nueva por cada bug corregido, y **falla sin el arreglo**.
- [ ] Si tocaste balance: `npm run sim` y `docs/BALANCE.md` al día.

### Seguridad

Entradas no confiables: **el texto de importar partida** y **el contenido de
`localStorage`**. Para cada cambio que las toque:

- [ ] ¿Pasa todo por el validador de `src/systems/save.ts` (estructura, tipos, números
      finitos, ids conocidos) antes de llegar al estado?
- [ ] ¿Algún dato importado termina en `innerHTML`? Debe ir por `textContent`.
- [ ] ¿Se acota el tamaño antes de decodificar?

### Errores y datos

- [ ] ¿Un fallo a mitad deja el estado a medias? Valida antes de mutar.
- [ ] ¿Qué pasa si el jugador cierra la pestaña justo ahí? (`pagehide` guarda.)

### Deuda técnica

- [ ] ¿Hay una regla escrita en dos sitios? Una de las copias se desviará.
- [ ] ¿Queda código muerto? Bórralo; la historia lo guarda.

### Documentación

- [ ] Cada bug corregido tiene su entrada en `docs/BUG-JOURNAL.md`.
- [ ] Si el cambio contradice `ARCHITECTURE.md`, **corrige el documento** y deja visible
      lo que decía antes.
- [ ] El mensaje de commit explica **por qué**, en español.

---

## Versiones

`0.FASE.PARCHE` mientras se construyó (`v0.1.0` al cerrar la fase 1, etc.) y `v1.0.0`
cuando se cumplió la definición de terminado de `PROMPT.md` §22. Desde ahí, cada fase de
`docs/ROADMAP.md` sube la versión menor (`v1.1.0` la fase 6, `v1.2.0` la fase 7…). La versión vive en
`package.json` y en la etiqueta de git, y deben coincidir. Un cambio en el formato del
guardado sube `SAVE_VERSION` y añade una migración: los guardados viejos siempre cargan. Cada
guardado lleva además la versión del juego que lo escribió: una versión anterior (la que el service
worker sirve sin conexión) no pisa nunca uno más nuevo.

Publicar una versión, en este orden, para que el enlace al .apk de Ajustes (que apunta a la última
release) nunca dé 404:

1. Subir la etiqueta (`git push origin vX.Y.Z`) y crear la release como **prerelease**: el workflow
   de Android compila desde la etiqueta, comprueba la clave (`android/signing-cert.sha256`) y
   adjunta `micelio.apk`.
2. Con el .apk adjunto, quitarle la marca de prerelease y marcarla como la última.
3. Subir `main`: el CI publica la web en Pages.

---

## Git

- Rama única `main`. Commits pequeños, uno por cambio con sentido, y cada uno deja el
  proyecto en verde.
- El mensaje explica **por qué**. Si arregla un bug: síntoma, causa y qué lo sostiene.
- El CI (`.github/workflows/ci.yml`) corre lint, pruebas y build en cada push y pull
  request; un push a `main` que pasa publica en GitHub Pages.

---

## Comandos

```text
npm run dev      servidor de desarrollo (con el acelerador de tiempo de desarrollo)
npm test         pruebas con Vitest
npm run lint     ESLint sin advertencias y Prettier en modo comprobación
npm run format   aplica Prettier
npm run build    comprobación de tipos y build estático en dist/
npm run sim      simulador de balance; escribe docs/BALANCE.md
npm run test:e2e pruebas de navegador (Playwright: Chromium, Firefox, WebKit, móvil)
npm run perf     mide fps con una partida avanzada (local, no en CI)
```

En desarrollo, `?pseudo` en la URL activa el pseudoidioma (textos un 40 % más largos) y el
panel de desarrollo permite acelerar el tiempo; ninguno de los dos llega al build.

---

## Lo que no hacemos

- **React u otro framework de UI.** Reconciliar 20 veces por segundo para cambiar tres
  números; ver `ARCHITECTURE.md` §4.1.
- **Phaser u otro motor.** El juego es interfaz accesible, no escenas; §4.2.
- **`Math.random` o `Date.now` en la lógica.** Rompe el simulador y las pruebas.
- **Texto visible fuera de `src/i18n/`.** Sumar un idioma debe costar un archivo.
- **Emojis, librerías de iconos genéricas o mayúsculas sostenidas.** Identidad visual
  propia; ver `ARCHITECTURE.md` §11.

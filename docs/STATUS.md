# En qué punto vamos

_Actualizado: 2026-10-01. Versión 1.2.1._

Este archivo responde una sola pregunta: **si me siento ahora mismo, ¿qué hago?**
Todo lo demás vive en otro lado y se enlaza desde aquí. Se actualiza al cerrar un
bloque de trabajo, no en cada commit.

- `AGENTS.md`: cómo trabajamos aquí. Léelo antes de tocar nada.
- `docs/BUG-JOURNAL.md`: los 13 fallos que ya costaron caro encontrar.
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
El guardado es `{ version, savedAt, state }` en `localStorage['micelio:save']`, versión 4.

## Lo último que se hizo

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

1. **Fase 8 — Viento de esporas I (v1.3.0):** fin del Acto I, Dispersar (el nivel vuelve a 0
   en cada bioma), taiga, selva del Chocó y Crónica. Convierte el muro de la partida 16 en el
   siguiente capítulo.
2. **Fase 9 — El Plasmodio (v1.4.0):** el primer modo no fúngico.

## Deuda conocida

- Las pruebas de navegador usan móvil emulado, no dispositivos físicos.
- La medición de fps es en escritorio (con la CPU frenada como aproximación al móvil).

## Cómo se entrega el trabajo

Rama única `main`, commits pequeños en verde. Cada fase cierra con lint, pruebas y
build en verde, commit, push, etiqueta `v0.N.0` y release.

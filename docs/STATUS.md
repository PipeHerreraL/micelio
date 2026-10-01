# En qué punto vamos

_Actualizado: 2026-10-01. Versión 0.5.0._

Este archivo responde una sola pregunta: **si me siento ahora mismo, ¿qué hago?**
Todo lo demás vive en otro lado y se enlaza desde aquí. Se actualiza al cerrar un
bloque de trabajo, no en cada commit.

- `AGENTS.md`: cómo trabajamos aquí. Léelo antes de tocar nada.
- `docs/BUG-JOURNAL.md`: los 12 fallos que ya costaron caro encontrar.
- `ARCHITECTURE.md`: el plan, con lo que resultó equivocado tachado.
- `docs/BALANCE.md`: tabla de valores y resultados del simulador.

---

## Estado por fase

| Fase | Qué                                                                                  | Estado         |
| ---- | ------------------------------------------------------------------------------------ | -------------- |
| 0    | Plan, documentos raíz, repositorio y CI                                              | hecho          |
| 1    | Núcleo jugable: estado, bucle, clic, 8 generadores, formato, guardado, offline, sim  | hecho (v0.1.0) |
| 2    | Profundidad: mejoras, hitos, sinergias, logros, lluvia, estadísticas, noticias       | hecho (v0.2.0) |
| 3    | Prestigio: Esporular, mutaciones, generadores 9 y 10, autocompra                     | hecho (v0.3.0) |
| 4    | Pulido: canvas, sonido, responsive, accesibilidad, ajustes, exportar, inglés         | hecho (v0.4.0) |
| 5    | Balance y entrega: campaña en el simulador, BALANCE.md, README, GitHub Pages, v1.0.0 | hecho (v0.5.0) |

## Modelo de `GameState`

Un único objeto plano y serializable; la definición al día está en `src/core/state.ts`. Los
valores derivados (N/s, valor del clic, multiplicadores) no viven en el estado: se calculan en
`src/core/selectors.ts` con caché por estado e invalidación explícita (ARCHITECTURE.md §4.6).
El guardado es `{ version, savedAt, state }` en `localStorage['micelio:save']`, versión 2.

## Lo último que se hizo

- **Fase 4 cerrada.** Canvas de la red (corte del suelo, ramificación con semilla, setas,
  anillos y árboles madre, pulsos, lluvia, esporulación orquestada) y sonido sintetizado.
  Pestaña Ajustes con idioma y notación al instante, sonido y volumen, reducir movimiento,
  exportar e importar con confirmación y borrar partida.
- **Revisión adversarial final** (6 dimensiones, 54 hallazgos, 36 confirmados y corregidos):
  accesibilidad con teclado, avisos detrás de modales, textos que concuerdan, guardado
  bloqueado, columnas de escritorio, cifras tabulares. Bugs #8 a #12 en el diario.
- **Definición de terminado, partida real con el acelerador de desarrollo** (×1000): cinco
  esporulaciones seguidas, diez mutaciones compradas y nueve gotas atrapadas sin errores; la
  consola del build de producción queda limpia.
- 373 pruebas en verde; el simulador cumple 18 de 18 objetivos; JS de 52 kB comprimido.

## Definición de terminado (PROMPT.md §22)

| Requisito                                                                               | Estado                                                                                                                                        |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Se juega hasta la tercera esporulación sin bugs que bloqueen (acelerador de desarrollo) | Cumple: cinco esporulaciones seguidas en Chromium con el panel de desarrollo a ×1000                                                          |
| El simulador cumple los objetivos de ritmo de §17                                       | Cumple: 18 de 18 (`docs/BALANCE.md`)                                                                                                          |
| Funciona en Chrome, Firefox y Safari, escritorio y móvil, español e inglés              | **Parcial:** probado en Chromium de escritorio y con emulación de móvil y tableta, en los dos idiomas. Firefox y Safari reales no se probaron |
| El guardado resiste recargar, cerrar la pestaña, exportar e importar                    | Cumple: pruebas de guardado, migración, exportar e importar; recarga y borrado probados a mano                                                |
| 60 fps estables y consola limpia                                                        | Consola limpia en el build de producción. Fps: coste de JS medido (0,06 ms por frame en el canvas), sin perfil en un móvil real               |
| Lint, pruebas y build en verde, también en GitHub Actions; publicado en Pages           | Cumple: CI en verde en cada push y juego en <https://pipeherreral.github.io/micelio/>                                                         |
| `docs/STATUS.md`, `docs/BALANCE.md` y el README al día                                  | Cumple                                                                                                                                        |

Por eso esta entrega es `v0.5.0` y no `v1.0.0`: la versión 1.0.0 queda para cuando se pruebe
en Firefox y Safari reales (y, si se puede, en un móvil de gama media).

## Lo que sigue, en orden

1. **Probar en Firefox y Safari reales** (escritorio y móvil) y etiquetar `v1.0.0` si no hay
   problemas. Playwright podría automatizarlo con Firefox y WebKit, pero hoy no es dependencia.
2. **Cubrir con pruebas** los bugs de la tabla «sin nada que los sostenga» del diario.

## Deuda conocida

- Sin pruebas de navegador reales: los bugs #4, #6, #7, #9, #10, #11 y #12 solo están cubiertos
  por revisión manual.
- Los 60 fps se midieron como coste de JS por frame (0,06 ms de media en el canvas), no con un
  perfil de navegador en un móvil de gama media.

## Cómo se entrega el trabajo

Rama única `main`, commits pequeños en verde. Cada fase cierra con lint, pruebas y
build en verde, commit, push, etiqueta `v0.N.0` y release.

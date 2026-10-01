# Balance

Tabla final de valores y resultados del simulador (`npm run sim`, `scripts/simulate.ts`).
El simulador juega partidas completas con las mismas fórmulas del juego (importa
`src/core`, `src/data` y `src/systems`), a pasos de 1 s, con 9 semillas por escenario.

- **Perfil activo:** 5 clics/s los primeros 15 min y luego 2 clics/s; atrapa todas las gotas.
- **Perfil pasivo:** 5 clics/s el primer minuto y después ninguno; no atrapa gotas.
- **Bot comprador:** elige la compra con menor suma de espera hasta poder pagarla y
  amortización (coste ÷ aumento de ingresos por segundo, clic incluido).
- **Campaña:** esporula cuando la ganancia de esporas es al menos max(10, nivel actual) y
  compra mutaciones en el orden de la tabla en cuanto le alcanzan.

## Cambios de balance

Cada ajuste se anota aquí con qué se cambió, por qué y qué corrida lo validó.

| Fecha      | Cambio                                                                                                                           | Motivo                                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-01 | Ninguno: se adoptan las tablas de PROMPT.md §7, §8, §9 y §10 tal cual.                                                           | La primera corrida cumplió los 18 objetivos de la sección 17 (ver abajo).                                                                                                                                                              |
| 2026-10-01 | Madurez de la red: S0 = 1000, β = 0,5; Cuerpo apical 300·2^r esporas y umbral ×1,1 por rango (el prototipo usaba 100·2^r y ×1,2) | Con los valores del prototipo los rangos comprados de golpe anulaban la madurez; con estos, ninguna partida de la 1 a la 16 baja de 6 min con la regla de §17 (antes, 2:46) y sobra menos del 50 % de las esporas. 21 de 21 objetivos. |

## Resultados de la última corrida

<!-- sim:start -->

_Generado por `npm run sim` (9 semillas por escenario, pasos de 1 s, 32.9 s de cómputo). No editar a mano entre estas marcas._

### Objetivos de ritmo (PROMPT.md §17)

Perfil activo salvo que se indique otro. Tiempos de juego en min:s; mediana de las semillas y rango.

| Métrica                                                                           | Objetivo                   | Mediana | Rango         | Estado |
| --------------------------------------------------------------------------------- | -------------------------- | ------- | ------------- | ------ |
| Primer Rizomorfo                                                                  | < 1 min                    | 0:30    | 0:30–0:30     | cumple |
| Primer Primordio                                                                  | 3–5 min                    | 3:47    | 3:35–4:10     | cumple |
| Primera Seta                                                                      | 7–10 min                   | 8:08    | 3:39–9:53     | cumple |
| Primer Anillo de hadas                                                            | 14–20 min                  | 17:00   | 11:27–19:09   | cumple |
| Primera Red micorrícica                                                           | 24–32 min                  | 27:24   | 24:21–32:28   | cumple |
| Esporular disponible en la partida 1                                              | 30–45 min                  | 40:56   | 36:34–45:25   | cumple |
| Esporas de la primera esporulación                                                | 12–18                      | 15      | 15–15         | cumple |
| Partida 2 hasta Esporular disponible (15 esporas y 4 mutaciones)                  | ≥ 40 % más rápida que la 1 | 42 %    | 35 %–66 %     | cumple |
| Perfil pasivo hasta Esporular disponible                                          | ≤ 2.5 × el activo          | 1.85 ×  | 1.66 ×–2.07 × | cumple |
| Primer Gigante de Malheur (tiempo acumulado)                                      | 2–3.5 h                    | 2.77 h  | 2.55 h–3.03 h | cumple |
| Duración de la partida 1 de la campaña                                            | ≥ 10 min                   | 40:56   | 36:34–45:25   | cumple |
| Duración de la partida 2 de la campaña                                            | ≥ 10 min                   | 27:29   | 14:44–32:53   | cumple |
| Duración de la partida 3 de la campaña                                            | ≥ 10 min                   | 29:52   | 18:57–42:35   | cumple |
| Duración de la partida 4 de la campaña                                            | ≥ 10 min                   | 29:46   | 17:05–37:19   | cumple |
| Duración de la partida 5 de la campaña                                            | ≥ 10 min                   | 27:54   | 11:17–34:47   | cumple |
| Duración de la partida 6 de la campaña                                            | ≥ 10 min                   | 16:30   | 8:56–20:38    | cumple |
| Duración de la partida 7 de la campaña                                            | ≥ 10 min                   | 13:51   | 7:23–20:01    | cumple |
| Duración de la partida 8 de la campaña                                            | ≥ 10 min                   | 10:26   | 4:59–14:21    | cumple |
| Campaña larga, regla §17: partida más corta de la 1 a la 16 (mediana por partida) | ≥ 6 min                    | 6:25    | 6:25–6:25     | cumple |
| Campaña larga, regla del mejor ritmo: partida más corta de la 1 a la 20           | ≥ 8 min                    | 8:49    | 8:49–8:49     | cumple |
| Campaña larga, regla §17: esporas sin gastar al final, sobre las ganadas          | < 50 %                     | 44 %    | 39 %–49 %     | cumple |

**Techo numérico:** el mayor valor visto en 10 esporulaciones fue 23,4 billones N (muy por debajo del límite de 1e300 de `number`).

**Resultado:** 21 de 21 objetivos cumplidos.

### Campaña (perfil activo, 10 esporulaciones)

| Partida | Duración (mediana) | Esporas ganadas (mediana) | Nivel al empezar | Mutaciones al empezar |
| ------- | ------------------ | ------------------------- | ---------------- | --------------------- |
| 1       | 40:56              | 15                        | 0                | 0                     |
| 2       | 27:29              | 15                        | 15               | 4                     |
| 3       | 29:52              | 30                        | 30               | 6                     |
| 4       | 29:46              | 60                        | 60               | 7                     |
| 5       | 27:54              | 120                       | 120              | 9                     |
| 6       | 16:30              | 241                       | 240              | 11                    |
| 7       | 13:51              | 481                       | 481              | 12                    |
| 8       | 10:26              | 972                       | 962              | 12                    |
| 9       | 9:47               | 1952                      | 1941             | 12                    |
| 10      | 9:09               | 4043                      | 3893             | 12                    |

### Campaña larga (perfil activo, 20 esporulaciones)

Mediana de 9 semillas por partida. La regla max(10, nivel) es la de PROMPT.md §17; la del mejor ritmo esporula cuando las esporas por minuto de la partida dejan de subir.

| Partida | Regla max(10, nivel): duración | Acumulado | Nivel al empezar | Regla del mejor ritmo: duración | Acumulado | Nivel al empezar |
| ------- | ------------------------------ | --------- | ---------------- | ------------------------------- | --------- | ---------------- |
| 1       | 40:56                          | 0.68 h    | 0                | 42:08                           | 0.70 h    | 0                |
| 2       | 27:29                          | 1.14 h    | 15               | 22:19                           | 1.03 h    | 15               |
| 3       | 29:52                          | 1.59 h    | 30               | 20:27                           | 1.36 h    | 23               |
| 4       | 29:46                          | 2.13 h    | 60               | 20:07                           | 1.68 h    | 29               |
| 5       | 27:54                          | 2.45 h    | 120              | 17:08                           | 2.04 h    | 34               |
| 6       | 16:30                          | 2.78 h    | 240              | 22:42                           | 2.33 h    | 38               |
| 7       | 13:51                          | 3.00 h    | 481              | 16:35                           | 2.56 h    | 42               |
| 8       | 10:26                          | 3.24 h    | 962              | 15:11                           | 2.80 h    | 45               |
| 9       | 9:47                           | 3.34 h    | 1941             | 12:48                           | 3.11 h    | 50               |
| 10      | 9:09                           | 3.48 h    | 3893             | 14:52                           | 3.33 h    | 54               |
| 11      | 11:48                          | 3.69 h    | 7971             | 12:40                           | 3.55 h    | 57               |
| 12      | 8:55                           | 3.84 h    | 16152            | 12:03                           | 3.70 h    | 64               |
| 13      | 12:26                          | 4.04 h    | 34581            | 11:03                           | 3.91 h    | 74               |
| 14      | 6:25                           | 4.16 h    | 69194            | 9:46                            | 4.10 h    | 78               |
| 15      | 13:40                          | 4.39 h    | 138434           | 9:40                            | 4.24 h    | 80               |
| 16      | 30:45                          | 4.97 h    | 276922           | 10:05                           | 4.33 h    | 101              |
| 17      | 50:38                          | 5.82 h    | 553860           | 9:56                            | 4.56 h    | 103              |
| 18      | 1:50:19                        | 7.60 h    | 1108065          | 8:49                            | 4.71 h    | 107              |
| 19      | 2:51:07                        | 10.68 h   | 2216346          | 9:44                            | 4.87 h    | 123              |
| 20      | 5:59:37                        | 16.72 h   | 4432699          | 11:57                           | 5.02 h    | 125              |

Esporas sin gastar al final (mediana, sobre las ganadas): 44 % con max(10, nivel) y 18 % con el mejor ritmo. Techo de las campañas largas: 27 trillones N.

### Generadores

| #   | Generador       | Coste base (N)  | Producción base (N/s) | Desbloqueo              |
| --- | --------------- | --------------- | --------------------- | ----------------------- |
| 1   | `hypha`         | 10              | 0,1                   | inicio                  |
| 2   | `rhizomorph`    | 120             | 1                     | inicio                  |
| 3   | `primordium`    | 1300            | 9                     | inicio                  |
| 4   | `mushroom`      | 14.000          | 55                    | inicio                  |
| 5   | `fairyRing`     | 160.000         | 320                   | inicio                  |
| 6   | `mycorrhiza`    | 1,8 millones    | 1800                  | inicio                  |
| 7   | `motherTree`    | 22 millones     | 10.500                | inicio                  |
| 8   | `ancientForest` | 300 millones    | 65.000                | inicio                  |
| 9   | `malheur`       | 5 mil millones  | 420.000               | 1 esporulación          |
| 10  | `planetary`     | 90 mil millones | 2,9 millones          | mutación `beyondForest` |

Mejoras: 50 (40 de generador y 10 de clic, globales y sinergias), ver `src/data/upgrades.ts`.

<!-- sim:end -->

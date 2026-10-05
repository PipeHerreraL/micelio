# Balance

Tabla final de valores y resultados del simulador (`npm run sim`, `scripts/simulate.ts`; desde la
fase 9, también el del plasmodio, `scripts/simulate-plasmodium.ts`, en su propio bloque al final).
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

| Fecha      | Cambio                                                                                                                                                                                                                                                                                                                                                                                                | Motivo                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-01 | Ninguno: se adoptan las tablas de PROMPT.md §7, §8, §9 y §10 tal cual.                                                                                                                                                                                                                                                                                                                                | La primera corrida cumplió los 18 objetivos de la sección 17 (ver abajo).                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-01 | Madurez de la red: S0 = 1000, β = 0,5; Cuerpo apical 300·2^r esporas y umbral ×1,1 por rango (el prototipo usaba 100·2^r y ×1,2)                                                                                                                                                                                                                                                                      | Con los valores del prototipo los rangos comprados de golpe anulaban la madurez; con estos, ninguna partida de la 1 a la 16 baja de 6 min con la regla de §17 (antes, 2:46) y sobra menos del 50 % de las esporas. 21 de 21 objetivos.                                                                                                                                                                                                 |
| 2026-10-01 | Viento de esporas (fase 8): taiga ×5 en Red micorrícica y Árbol madre y lluvia a la mitad; Chocó con el doble de lluvia, Rocío de al menos 300 s y la gota que cae sola; R 1e11 (taiga) y 2e11 (Chocó) como primer destino y ×3,5 en el segundo; linaje ×2 por bioma colonizado; Dispersar 300 esporas                                                                                                | Con el ×3 del prototipo, el Chocó como segundo destino se colonizaba en 1,90 h. Una primera calibración (7e10 y 1,2e11 con ×4,5) compensaba un fallo del bot, que tras el Acto I gastaba en Cuerpo apical las esporas del viaje; corregido el bot, 42 de 42: partidas de 21–29 min de mediana, colonizar en 2,1–3,2 h y el pasivo a 1,55–2,48 veces el activo.                                                                         |
| 2026-10-01 | El Plasmodio (fase 9): cinco placas fijas con umbral 0,9 × la peor de 9 semillas; Rastro/s = 10^placa · copos unidos · calidad · 1,5^Agar; metas 4,3e6 a 6e17; pulso de 3 pasos y 3 s de Rastro cada 3 s; costes y topes del prototipo; la Fusión con sal en toda la placa y aprendizaje solo por contagio; la Memoria externa sin secar tubos con sustancia; el caudal solo en placas cartografiadas | Valores del prototipo del modelo; el simulador, con el código del juego, da 17 de 17: las cinco placas en 4,65 h activo, el pasivo a 1,88 veces y el ingenuo a 1,12. Sin las tres correcciones de diseño, la Fusión no se cumplía con la Memoria, el caudal Alto dejaba cuatro placas sin poder cumplir y el contagio de la Fusión no influía.                                                                                         |
| 2026-10-05 | Viento de esporas II (fase 10), primeros valores (C7): pradera con R 9e10, Anillo de hadas ×6 y lluvia a la mitad; tundra con R 3,5e9, producción ×0,5, lluvia a un tercio y +24 h de tope sin conexión; las dos forman un segundo anillo que se abre con la taiga y el Chocó colonizados; R de los tramos 3 y 4 ×12,25 y ×61,25                                                                      | Los 39 objetivos de antes salen idénticos y los tres que cambian de sentido (esperas, esporas sin gastar al colonizar el cuarto bioma, techo) siguen cumpliendo: 42 de 42. Sin las adaptaciones de la pradera y la tundra, que llegan después, los tramos 3 y 4 se informan: colonizar en 2,59–3,44 h, partidas de 23:53–35:03 de mediana, pasivo a 1,81–2,32 veces; la pradera tercera tiene la partida más larga en 1:01:25–1:03:51. |

## Resultados de la última corrida

<!-- sim:start -->

_Generado por `npm run sim` (9 semillas por escenario, pasos de 1 s, 62.3 s de cómputo en 11 hilos). No editar a mano entre estas marcas._

### Objetivos de ritmo (PROMPT.md §17)

Perfil activo salvo que se indique otro. Tiempos de juego en min:s; mediana de las semillas y rango.

| Métrica                                                                                       | Objetivo                   | Mediana        | Rango                         | Estado |
| --------------------------------------------------------------------------------------------- | -------------------------- | -------------- | ----------------------------- | ------ |
| Primer Rizomorfo                                                                              | < 1 min                    | 0:30           | 0:30–0:30                     | cumple |
| Primer Primordio                                                                              | 3–5 min                    | 3:47           | 3:35–4:10                     | cumple |
| Primera Seta                                                                                  | 7–10 min                   | 8:08           | 3:39–9:53                     | cumple |
| Primer Anillo de hadas                                                                        | 14–20 min                  | 17:00          | 11:27–19:09                   | cumple |
| Primera Red micorrícica                                                                       | 24–32 min                  | 27:24          | 24:21–32:28                   | cumple |
| Esporular disponible en la partida 1                                                          | 30–45 min                  | 40:56          | 36:34–45:25                   | cumple |
| Esporas de la primera esporulación                                                            | 12–18                      | 15             | 15–15                         | cumple |
| Partida 2 hasta Esporular disponible (15 esporas y 4 mutaciones)                              | ≥ 40 % más rápida que la 1 | 42 %           | 35 %–66 %                     | cumple |
| Perfil pasivo hasta Esporular disponible                                                      | ≤ 2.5 × el activo          | 1.85 ×         | 1.66 ×–2.07 ×                 | cumple |
| Primer Gigante de Malheur (tiempo acumulado)                                                  | 2–3.5 h                    | 2.77 h         | 2.55 h–3.03 h                 | cumple |
| Duración de la partida 1 de la campaña                                                        | ≥ 10 min                   | 40:56          | 36:34–45:25                   | cumple |
| Duración de la partida 2 de la campaña                                                        | ≥ 10 min                   | 27:29          | 14:44–32:53                   | cumple |
| Duración de la partida 3 de la campaña                                                        | ≥ 10 min                   | 29:52          | 18:57–42:35                   | cumple |
| Duración de la partida 4 de la campaña                                                        | ≥ 10 min                   | 29:46          | 17:05–37:19                   | cumple |
| Duración de la partida 5 de la campaña                                                        | ≥ 10 min                   | 27:54          | 11:17–34:47                   | cumple |
| Duración de la partida 6 de la campaña                                                        | ≥ 10 min                   | 16:30          | 8:56–20:38                    | cumple |
| Duración de la partida 7 de la campaña                                                        | ≥ 10 min                   | 13:51          | 7:23–20:01                    | cumple |
| Duración de la partida 8 de la campaña                                                        | ≥ 10 min                   | 10:26          | 4:59–14:21                    | cumple |
| Campaña larga, regla §17: partida más corta de la 1 a la 16 (mediana por partida)             | ≥ 6 min                    | 6:25           | 6:25–6:25                     | cumple |
| Campaña larga, regla del mejor ritmo: partida más corta de la 1 a la 20                       | ≥ 8 min                    | 8:49           | 8:49–8:49                     | cumple |
| Campaña larga, regla §17: esporas sin gastar al final, sobre las ganadas                      | < 50 %                     | 44 %           | 39 %–49 %                     | cumple |
| Viento: cierre del Acto I (tiempo acumulado)                                                  | 2,5–3,5 h                  | 3.31 h         | 3.11 h–3.48 h                 | cumple |
| Viento: partidas de espera para pagar un viaje (tras el Acto I o tras colonizar)              | ≤ 1                        | 0              | 0–1                           | cumple |
| Viento taiga→Chocó, taiga (primer destino): partidas hasta colonizar (todas)                  | 20–33 min                  | 28:48          | 5:32–1:15:14                  | cumple |
| Viento taiga→Chocó, taiga (primer destino): partida más corta (mediana por partida)           | ≥ 10 min                   | 20:58          | 20:58–20:58                   | cumple |
| Viento taiga→Chocó, taiga (primer destino): tiempo para colonizar                             | 2–3,5 h                    | 3.24 h         | 2.67 h–3.51 h                 | cumple |
| Viento taiga→Chocó, taiga (primer destino): pasivo hasta colonizar                            | ≤ 2,5 × el activo          | 2.25 ×         | 2.07 ×–2.73 ×                 | cumple |
| Viento taiga→Chocó, Chocó (segundo destino): partidas hasta colonizar (todas)                 | 20–33 min                  | 21:30          | 2:37–39:19                    | cumple |
| Viento taiga→Chocó, Chocó (segundo destino): partida más corta (mediana por partida)          | ≥ 10 min                   | 13:52          | 13:52–13:52                   | cumple |
| Viento taiga→Chocó, Chocó (segundo destino): tiempo para colonizar                            | 2–3,5 h                    | 2.06 h         | 1.71 h–2.55 h                 | cumple |
| Viento taiga→Chocó, Chocó (segundo destino): pasivo hasta colonizar                           | ≤ 2,5 × el activo          | 1.79 ×         | 1.34 ×–1.92 ×                 | cumple |
| Viento Chocó→taiga, Chocó (primer destino): partidas hasta colonizar (todas)                  | 20–33 min                  | 29:01          | 13:24–48:04                   | cumple |
| Viento Chocó→taiga, Chocó (primer destino): partida más corta (mediana por partida)           | ≥ 10 min                   | 21:49          | 21:49–21:49                   | cumple |
| Viento Chocó→taiga, Chocó (primer destino): tiempo para colonizar                             | 2–3,5 h                    | 2.85 h         | 2.22 h–3.43 h                 | cumple |
| Viento Chocó→taiga, Chocó (primer destino): pasivo hasta colonizar                            | ≤ 2,5 × el activo          | 1.55 ×         | 1.43 ×–1.99 ×                 | cumple |
| Viento Chocó→taiga, taiga (segundo destino): partidas hasta colonizar (todas)                 | 20–33 min                  | 22:59          | 2:29–1:03:28                  | cumple |
| Viento Chocó→taiga, taiga (segundo destino): partida más corta (mediana por partida)          | ≥ 10 min                   | 15:24          | 15:24–15:24                   | cumple |
| Viento Chocó→taiga, taiga (segundo destino): tiempo para colonizar                            | 2–3,5 h                    | 2.48 h         | 2.40 h–3.40 h                 | cumple |
| Viento Chocó→taiga, taiga (segundo destino): pasivo hasta colonizar                           | ≤ 2,5 × el activo          | 2.48 ×         | 1.84 ×–2.68 ×                 | cumple |
| Viento: esporas sin gastar al colonizar el último bioma, sobre las ganadas en toda la campaña | < 50 %                     | 2 %            | 0 %–5 %                       | cumple |
| Viento: techo numérico (campaña y 4 partidas tras el último bioma)                            | < 1e63                     | 1,65 trillones | 1,65 trillones–1,65 trillones | cumple |
| Viento: guardados inválidos tras esporular, dispersar o colonizar                             | 0                          | 0              | 0–0                           | cumple |

**Techo numérico:** el mayor valor visto en 10 esporulaciones fue 23,4 billones N (muy por debajo del límite de 1e300 de `number`).

**Resultado:** 42 de 42 objetivos cumplidos.

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

### Viento de esporas (perfil activo, regla de §17)

Natal hasta el Acto I y después los cuatro destinos, en los cuatro órdenes que permiten los anillos (el primero entero y en cualquier orden antes del segundo; cada orden del primero se juega una vez por semilla y se ramifica, sobre copias, en los del segundo); mediana de 9 semillas. El bot dispersa al empezar partida, compra al llegar las adaptaciones de bioma abiertas y, entre partidas, mutaciones y adaptaciones guardando 300 esporas para el viaje cuando hay destino por delante.

| Orden                      | Bioma   | Partidas hasta colonizar (mediana de cada una) | Todas (mediana) | Colonizar | Nivel al colonizar | Acumulado |
| -------------------------- | ------- | ---------------------------------------------- | --------------- | --------- | ------------------ | --------- |
| taiga→Chocó                | taiga   | 25:10, 20:58, 25:13, 38:22, 38:38, 45:06       | 28:48           | 3.24 h    | 576                | 6.53 h    |
| taiga→Chocó                | Chocó   | 13:52, 19:00, 19:37, 27:25, 27:05, 27:12       | 21:30           | 2.06 h    | 664                | 8.76 h    |
| Chocó→taiga                | Chocó   | 23:50, 21:49, 29:15, 34:14, 31:29, 32:29       | 29:01           | 2.85 h    | 751                | 6.17 h    |
| Chocó→taiga                | taiga   | 15:28, 15:24, 20:50, 26:16, 44:16, 47:00       | 22:59           | 2.48 h    | 576                | 8.57 h    |
| taiga→Chocó→pradera→tundra | pradera | 11:56, 14:31, 24:44, 43:06, 49:11, 1:03:51     | 29:30           | 3.41 h    | 576                | 12.20 h   |
| taiga→Chocó→pradera→tundra | tundra  | 17:29, 16:52, 24:39, 32:33, 39:09, 36:40       | 23:53           | 2.67 h    | 576                | 14.87 h   |
| taiga→Chocó→tundra→pradera | tundra  | 19:10, 20:50, 29:49, 37:34, 44:08, 45:02       | 30:32           | 3.30 h    | 578                | 12.00 h   |
| taiga→Chocó→tundra→pradera | pradera | 15:35, 16:30, 29:01, 35:03, 47:26, 1:02:01     | 31:46           | 3.39 h    | 587                | 15.40 h   |
| Chocó→taiga→pradera→tundra | pradera | 14:05, 15:40, 29:19, 45:41, 47:58, 1:01:25     | 31:30           | 3.35 h    | 576                | 12.09 h   |
| Chocó→taiga→pradera→tundra | tundra  | 17:56, 21:21, 24:35, 31:50, 31:12, 36:38       | 24:35           | 2.59 h    | 576                | 14.62 h   |
| Chocó→taiga→tundra→pradera | tundra  | 25:35, 24:18, 36:42, 36:37, 43:38, 44:08       | 35:03           | 3.44 h    | 580                | 12.11 h   |
| Chocó→taiga→tundra→pradera | pradera | 9:48, 15:51, 23:54, 39:44, 46:26, 52:57        | 26:31           | 3.21 h    | 592                | 15.22 h   |

Tramos del segundo anillo (informativos hasta que lleguen las adaptaciones de la pradera y la tundra; sus objetivos serán: partidas de 20–33 min, la más corta ≥ 10 min, la más larga ≤ 60 min, colonizar en 2–3,5 h y el pasivo ≤ 2,5 × el activo). «Más corta» y «más larga» son medianas por partida; entre paréntesis, las semillas que colonizaron.

| Orden                      | Bioma                    | Partidas (todas, mediana) | Más corta | Más larga | Colonizar       | Pasivo |
| -------------------------- | ------------------------ | ------------------------- | --------- | --------- | --------------- | ------ |
| taiga→Chocó→pradera→tundra | pradera (tercer destino) | 29:30                     | 11:56     | 1:03:51   | 3.41 h (9 de 9) | 2.23 × |
| taiga→Chocó→pradera→tundra | tundra (cuarto destino)  | 23:53                     | 16:52     | 39:09     | 2.67 h (9 de 9) | 2.00 × |
| taiga→Chocó→tundra→pradera | tundra (tercer destino)  | 30:32                     | 19:10     | 45:02     | 3.30 h (9 de 9) | 1.93 × |
| taiga→Chocó→tundra→pradera | pradera (cuarto destino) | 31:46                     | 15:35     | 1:02:01   | 3.39 h (9 de 9) | 2.28 × |
| Chocó→taiga→pradera→tundra | pradera (tercer destino) | 31:30                     | 14:05     | 1:01:25   | 3.35 h (9 de 9) | 2.23 × |
| Chocó→taiga→pradera→tundra | tundra (cuarto destino)  | 24:35                     | 17:56     | 36:38     | 2.59 h (9 de 9) | 2.00 × |
| Chocó→taiga→tundra→pradera | tundra (tercer destino)  | 35:03                     | 24:18     | 44:08     | 3.44 h (9 de 9) | 1.81 × |
| Chocó→taiga→tundra→pradera | pradera (cuarto destino) | 26:31                     | 9:48      | 52:57     | 3.21 h (9 de 9) | 2.32 × |

Tras colonizar el último bioma no quedan destinos en esta versión; las 4 partidas siguientes son informativas:

| Orden                      | Partidas tras el último bioma (mediana de cada una) |
| -------------------------- | --------------------------------------------------- |
| taiga→Chocó→pradera→tundra | 16:15, 16:10, 23:23, 32:09                          |
| taiga→Chocó→tundra→pradera | 32:52, 38:39, 1:19:33, 2:28:47                      |
| Chocó→taiga→pradera→tundra | 20:30, 18:10, 20:35, 36:23                          |
| Chocó→taiga→tundra→pradera | 38:45, 35:50, 1:20:04, 2:31:12                      |

Regla del mejor ritmo (informativa, sin objetivo): el Acto I se cierra a las 5.96 h y la taiga se coloniza en 6.72 h (9 de 9 semillas), con partidas de 6:06 de mediana. En un bioma esa regla esporula muy a menudo y coloniza más tarde que la de §17: no es la mejor estrategia para el viaje, por eso no guía su balance (ARCHITECTURE.md §4.28).

El plasmodio (fase 9) llega a las 3.42 h de mediana (3.20 h–3.56 h): a los 5 min de la primera partida tras el Acto I (informativo).

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

<!-- sim:plasmodio:start -->

_Generado por `npm run sim:plasmodio` (9 semillas por perfil, pasos de 1 s, 66.5 s de cómputo). No editar a mano entre estas marcas._

### El plasmodio (docs/ROADMAP.md, fase 9)

Desde la llegada; mediana de las semillas y rango. El activo coloca con el bot (previsualiza cada sitio y elige entre los 3 mejores), da un pulso cada 3 s y abre la placa siguiente al momento; el pasivo da pulsos solo el primer minuto y deja que la siguiente se abra sola; el ingenuo coloca al azar, prueba otra colocación si en 10 min no cumple y, en cuanto compra la Quimiotaxis, pone los copos donde sugiere. Los tres compran igual.

| Métrica                                                                              | Objetivo  | Mediana          | Rango                             | Estado |
| ------------------------------------------------------------------------------------ | --------- | ---------------- | --------------------------------- | ------ |
| Plasmodio: Tronco caído cartografiado desde la llegada (activo)                      | 20–35 min | 27:04            | 26:44–27:43                       | cumple |
| Plasmodio: Laberinto cartografiado desde que se abre (activo)                        | 30–90 min | 38:34            | 38:27–38:45                       | cumple |
| Plasmodio: Archipiélago cartografiado desde que se abre (activo)                     | 30–90 min | 58:59            | 57:27–1:03:54                     | cumple |
| Plasmodio: Puente amargo cartografiado desde que se abre (activo)                    | 30–90 min | 1:13:29          | 1:11:12–1:16:33                   | cumple |
| Plasmodio: Fusión cartografiado desde que se abre (activo)                           | 30–90 min | 1:20:50          | 1:18:30–1:21:17                   | cumple |
| Plasmodio: las cinco placas (activo)                                                 | 4–6 h     | 4.65 h           | 4.59 h–4.75 h                     | cumple |
| Plasmodio: pasivo frente a activo, las cinco placas (cada semilla)                   | ≤ 2,5     | 1,88             | 1,85–1,89                         | cumple |
| Plasmodio: objetivo sostenido tras abrir la placa (activo, la peor placa)            | ≤ 10 min  | 6:08             | 6:06–6:08                         | cumple |
| Plasmodio: espera más larga sin comprar (activo)                                     | ≤ 22 min  | 19:38            | 19:00–19:43                       | cumple |
| Plasmodio: jugador ingenuo (al azar, recoloca a los 10 min), Tronco caído            | ≤ 45 min  | 35:55            | 31:16–49:18                       | cumple |
| Plasmodio: jugador ingenuo frente al activo, las cinco placas                        | ≤ 1,75    | 1,12             | 1,07–1,18                         | cumple |
| Plasmodio: semillas que terminan las cinco placas en 12 h (activo, pasivo e ingenuo) | 27 de 27  | 27               | 27–27                             | cumple |
| Plasmodio: Rastro máximo                                                             | < 1e63    | 602 mil billones | 602 mil billones–602 mil billones | cumple |
| Plasmodio: 8 h de golpe frente a 8 h en vivo (Rastro; 5 placas × 3 semillas)         | 0,98–1,02 | 1,000            | 1,000–1,000                       | cumple |
| Plasmodio: guardados inválidos tras cada fruto y cada compra                         | 0         | 0                | 0–0                               | cumple |
| Plasmodio: fallos del solver y valores no finitos                                    | 0         | 0                | 0–0                               | cumple |
| Plasmodio: red de hongos idéntica con y sin el socio (2 semillas × 2 esporulaciones) | sí        | sí               | sí–sí                             | cumple |

**Resultado:** 17 de 17 objetivos cumplidos.

Mediana por placa, desde que se abre:

| Placa         | Activo  | Objetivo sostenido (activo) | Pasivo  | Ingenuo |
| ------------- | ------- | --------------------------- | ------- | ------- |
| Tronco caído  | 27:04   | 1:36                        | 52:50   | 35:55   |
| Laberinto     | 38:34   | 2:11                        | 1:00:52 | 40:23   |
| Archipiélago  | 58:59   | 1:16                        | 1:59:44 | 1:11:54 |
| Puente amargo | 1:13:29 | 6:08                        | 2:19:25 | 1:20:54 |
| Fusión        | 1:20:50 | 2:32                        | 2:29:27 | 1:25:40 |

A prueba de cortes (informativo): 6 de 9 partidas activas lo consiguen, la mediana a las 1.11 h.

<!-- sim:plasmodio:end -->

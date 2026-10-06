# Micelio

[![CI](https://github.com/PipeHerreraL/micelio/actions/workflows/ci.yml/badge.svg)](https://github.com/PipeHerreraL/micelio/actions/workflows/ci.yml)

Un juego idle tranquilo para navegador: eres una red de hongos que crece bajo el suelo de un
bosque. Empiezas como un solo filamento que absorbe nutrientes y terminas conectando bosques
enteros. Al madurar, liberas esporas y vuelves a empezar, cada vez más fuerte.

**Jugar:** <https://pipeherreral.github.io/micelio/>

Funciona en escritorio y en móvil, en español y en inglés. No tiene cuentas, anuncios ni
analítica: la partida se guarda en tu navegador.

## Instalar en el móvil

- **Android, como app desde el navegador:** abre el juego en Chrome y elige «Instalar app» (o
  Ajustes → «Instalar la app»). Comparte la partida con la web y funciona sin conexión.
- **Android, con instalador:** descarga
  [micelio.apk](https://github.com/PipeHerreraL/micelio/releases/latest/download/micelio.apk) de la
  última versión y ábrelo (Android pedirá permiso para instalar apps de esa fuente). La app guarda
  su propia partida: para llevarte la de la web, expórtala en Ajustes e impórtala en la app.
- **Android, con el .apk al día solo:** [Obtainium](https://github.com/ImranR98/Obtainium), libre,
  vigila las releases de un repositorio de GitHub. Añade `https://github.com/PipeHerreraL/micelio` e
  instala la app desde ahí: te avisará de cada versión nueva y, desde Android 12, puede instalarla
  sin preguntar. Las actualizaciones conservan la partida de la app.
- **iPhone y iPad:** abre el juego en Safari, botón Compartir → «Añadir a pantalla de inicio».
  Esa app no ve la partida de Safari: expórtala antes e impórtala en ella.

## Cómo se juega

- **Absorbe** tocando el núcleo de la red (también con Espacio o Enter).
- **Compra generadores**: Hifas, Rizomorfos, Setas, Anillos de hadas… Producen solos, también
  mientras no miras (el progreso offline cuenta al 50 % y hasta 8 horas de base).
- **Mejoras e hitos** multiplican la producción: cada generador se duplica a las 25, 50, 100…
  unidades. Con la cantidad **Hito**, el botón de compra lleva justo hasta el siguiente.
- **La lluvia** cae cada pocos minutos. Atrapa la gota antes de que se evapore: Aguacero,
  Rocío o Tormenta eléctrica.
- **Esporula** cuando la partida sume 1e8 nutrientes (en el bosque natal): empiezas de nuevo con
  un bono que dura mientras sigas en ese bosque y esporas para gastar en el árbol de
  **mutaciones**.
- Con el árbol de mutaciones completo y una Red planetaria se cierra el **Acto I**: el
  **viento de esporas** puede llevar tu linaje a la **taiga** o a la **selva del Chocó**. Allí el
  nivel de esporas vuelve a 0, con reglas nuevas y tres adaptaciones propias por bioma; las
  mutaciones y las adaptaciones viajan contigo. Coloniza cada bioma (nivel 500) y queda escrito
  en la **Crónica**. Con los dos bosques colonizados se abren la **pradera** y la **tundra**, donde
  acaban los árboles.
- Tras el cuarto bioma, **El regreso** lleva tu linaje al bosque natal mil años después. Cumplido,
  empieza el **ciclo libre**: siembra el bioma que quieras, llega otra vez al nivel 500 y bate tu
  mejor tiempo en cada uno.
- Al sembrar puedes jurar **votos**: sin lluvia, solo autocompra o sin mutaciones. Cada uno quita
  algo y rebaja la meta para compensar; se pueden romper, nunca añadir, y cada combinación tiene su
  récord. Cumplir un ciclo sin romper un voto abre una **adaptación cosmética** (Esporada, Cordones
  negros, Higróforos) que solo cambia cómo se ve tu red.
- Tras el Acto I llega un vecino: el **plasmodio** de _Physarum polycephalum_, un moho
  mucilaginoso (no es un hongo). En la pestaña **Socios** pones copos de avena y lámparas en una
  placa y miras cómo une la comida con una red que engorda los tubos útiles y seca los demás.
  Su moneda es el **Rastro**; cartografía cinco placas (del Tronco caído a la Fusión) y le da a
  tu red ayudas sin quitarle nada: la Poda en la autocompra y el Camino corto en Esporular.
- En **Ajustes** puedes cambiar idioma, notación de números, sonido y movimiento, y exportar o
  importar tu partida.

## Desarrollo

Requiere Node 24 (ver `.nvmrc`).

```bash
npm install
npm run dev
```

Para las pruebas de navegador hace falta instalar los motores una vez:

```bash
npx playwright install firefox webkit
```

| Comando            | Qué hace                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| `npm run dev`      | Servidor de desarrollo con panel de desarrollo y acelerador de tiempo   |
| `npm test`         | Pruebas con Vitest                                                      |
| `npm run lint`     | ESLint sin advertencias y Prettier en modo comprobación                 |
| `npm run build`    | Comprobación de tipos y build estático en `dist/`                       |
| `npm run sim`      | Simuladores de balance (red y plasmodio); escriben `docs/BALANCE.md`    |
| `npm run budget`   | Comprueba el presupuesto de JS por paquete tras `npm run build`         |
| `npm run test:e2e` | Pruebas de navegador con Playwright (Chromium, Firefox, WebKit y móvil) |
| `npm run perf`     | Mide fps con una partida avanzada                                       |

En desarrollo, `?pseudo` en la URL activa un pseudoidioma (textos un 40 % más largos) para
detectar cortes, y `?loop` mueve el bucle aunque la pestaña esté oculta.

Antes de tocar código lee [`AGENTS.md`](AGENTS.md) (acuerdo de trabajo),
[`docs/STATUS.md`](docs/STATUS.md) (en qué punto vamos) y
[`docs/BUG-JOURNAL.md`](docs/BUG-JOURNAL.md). Las decisiones de diseño y técnicas están en
[`ARCHITECTURE.md`](ARCHITECTURE.md) y el balance en [`docs/BALANCE.md`](docs/BALANCE.md).

## Despliegue

Cada push a `main` que pasa el CI (lint, pruebas y build) publica `dist/` en GitHub Pages con
las acciones oficiales (`actions/upload-pages-artifact` y `actions/deploy-pages`). La ruta base
de Vite es `/micelio/`; con dominio propio habría que cambiarla a `/` en `vite.config.ts`.

Para publicar desde un fork: activa Pages con origen GitHub Actions
(`gh api -X POST repos/<usuario>/micelio/pages -f build_type=workflow`) y haz push a `main`.

### App de Android

`.github/workflows/android.yml` compila el .apk con Capacitor en cada cambio y, al publicar una
release, lo firma y lo adjunta como `micelio.apk`. La clave de firma se crea una sola vez, en el PC
del dueño del repositorio (necesita Java y el GitHub CLI autenticado):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\android-keystore.ps1
```

Guarda la carpeta que crea (Documentos\Micelio-firma-android) fuera del PC: sin esa clave no se
pueden publicar actualizaciones de la app. El script nunca crea una segunda clave y escribe la
huella del certificado en `android/signing-cert.sha256`, que se sube al repositorio: el workflow no
publica un .apk firmado con otra. En cada cambio se compila la versión de depuración
(`io.github.pipeherreral.micelio.debug`), que se instala al lado de la app. Para compilar en local
hacen falta JDK 21 y el Android SDK (`npm run build:android` y luego `android/gradlew
assembleDebug`). Los iconos se rehacen con `npm run icons`.

## Licencia

MIT. Todo el arte y el sonido se generan con código; las fuentes (IM Fell English y
Source Sans 3) se distribuyen bajo la SIL Open Font License.

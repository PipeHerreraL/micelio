# Micelio

[![CI](https://github.com/PipeHerreraL/micelio/actions/workflows/ci.yml/badge.svg)](https://github.com/PipeHerreraL/micelio/actions/workflows/ci.yml)

Un juego idle tranquilo para navegador: eres una red de hongos que crece bajo el suelo de un
bosque. Empiezas como un solo filamento que absorbe nutrientes y terminas conectando bosques
enteros. Al madurar, liberas esporas y vuelves a empezar, cada vez más fuerte.

**Jugar:** <https://pipeherreral.github.io/micelio/>

Funciona en escritorio y en móvil, en español y en inglés. No tiene cuentas, anuncios ni
analítica: la partida se guarda en tu navegador.

## Cómo se juega

- **Absorbe** tocando el núcleo de la red (también con Espacio o Enter).
- **Compra generadores**: Hifas, Rizomorfos, Setas, Anillos de hadas… Producen solos, también
  mientras no miras (el progreso offline cuenta al 50 % y hasta 8 horas de base).
- **Mejoras e hitos** multiplican la producción: cada generador se duplica a las 25, 50, 100…
  unidades.
- **La lluvia** cae cada pocos minutos. Atrapa la gota antes de que se evapore: Aguacero,
  Rocío o Tormenta eléctrica.
- **Esporula** cuando la partida sume 1e8 nutrientes: empiezas de nuevo con un bono permanente
  y esporas para gastar en el árbol de **mutaciones**.
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
| `npm run sim`      | Simulador de balance; escribe `docs/BALANCE.md`                         |
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

## Licencia

MIT. Todo el arte y el sonido se generan con código; las fuentes (IM Fell English y
Source Sans 3) se distribuyen bajo la SIL Open Font License.

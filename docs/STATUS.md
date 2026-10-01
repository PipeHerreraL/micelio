# En qué punto vamos

_Actualizado: 2026-10-01. Versión 0.2.0._

Este archivo responde una sola pregunta: **si me siento ahora mismo, ¿qué hago?**
Todo lo demás vive en otro lado y se enlaza desde aquí. Se actualiza al cerrar un
bloque de trabajo, no en cada commit.

- `AGENTS.md`: cómo trabajamos aquí. Léelo antes de tocar nada.
- `docs/BUG-JOURNAL.md`: los fallos que ya costaron caro encontrar.
- `ARCHITECTURE.md`: el plan, con lo que resultó equivocado tachado.
- `docs/BALANCE.md`: tabla de valores y resultados del simulador.

---

## Estado por fase

| Fase | Qué                                                                                  | Estado         |
| ---- | ------------------------------------------------------------------------------------ | -------------- |
| 0    | Plan, documentos raíz, repositorio y CI                                              | hecho          |
| 1    | Núcleo jugable: estado, bucle, clic, 8 generadores, formato, guardado, offline, sim  | hecho (v0.1.0) |
| 2    | Profundidad: mejoras, hitos, sinergias, logros, lluvia, estadísticas, noticias       | hecho (v0.2.0) |
| 3    | Prestigio: Esporular, mutaciones, generadores 9 y 10, autocompra                     | sin empezar    |
| 4    | Pulido: canvas, sonido, responsive, accesibilidad, ajustes, exportar, inglés         | sin empezar    |
| 5    | Balance y entrega: campaña en el simulador, BALANCE.md, README, GitHub Pages, v1.0.0 | sin empezar    |

## Plan antes de escribir código

### Modelo de `GameState`

Un único objeto plano, serializable con `JSON.stringify`, sin clases ni funciones.
Los valores derivados (N/s, valor del clic, multiplicadores) **no** viven aquí:
se calculan en `src/core/selectors.ts` con caché por estado e invalidación explícita.

```ts
type GeneratorId =
  | 'hypha'
  | 'rhizomorph'
  | 'primordium'
  | 'mushroom'
  | 'fairyRing'
  | 'mycorrhiza'
  | 'motherTree'
  | 'ancientForest'
  | 'malheur'
  | 'planetary';

interface GameState {
  nutrients: number; // N actuales (tipo Num de src/core/num.ts)
  runEarned: number; // N ganados en la partida
  lifetimeEarned: number; // N ganados en toda la vida
  owned: Record<GeneratorId, number>;
  upgrades: string[]; // mejoras compradas en la partida
  spores: { level: number; available: number };
  mutations: string[]; // permanentes
  achievements: string[]; // permanentes
  effects: { kind: 'downpour' | 'storm'; remaining: number; duration: number }[];
  rain: { nextIn: number; drop: { x: number; y: number; remaining: number } | null };
  autobuy: {
    generators: Record<GeneratorId, boolean>;
    threshold: 0.1 | 0.5 | 1;
    upgrades: boolean;
    timer: number;
  };
  stats: {
    runTime: number;
    totalTime: number; // segundos jugados
    startedAt: number;
    runStartedAt: number; // marcas de tiempo (ms)
    maxNps: number;
    clicks: number;
    drops: number;
    sporulations: number;
    idleClickTime: number; // segundos activos sin clic
  };
  settings: {
    locale: 'es' | 'en' | null; // null = detectar
    notation: 'suffix' | 'scientific' | 'engineering';
    sound: boolean;
    volume: number;
    reducedMotion: boolean;
    buyAmount: 1 | 10 | 100 | 'max';
  };
  seen: string[]; // revelación progresiva y avisos de primera vez
  rngSeed: number; // estado del generador con semilla (mulberry32)
}
```

El guardado envuelve el estado: `{ version, savedAt, state }` en `localStorage['micelio:save']`.

### Archivos y orden

1. Documentos raíz, configuración (Vite, TS estricto, ESLint, Prettier, Vitest), CI y repositorio.
2. `src/core/num.ts`, `rng.ts`, `state.ts`, `formulas.ts`, `selectors.ts`, `events.ts`, `actions.ts`, `tick.ts`.
3. `src/data/generators.ts` (luego `upgrades.ts`, `achievements.ts`, `mutations.ts`, `news.ts`, `rain.ts`).
4. `src/i18n/es.ts`, `en.ts`, `index.ts` (traducción) y `format.ts` (números, duraciones, fechas).
5. `src/systems/save.ts`, `offline.ts` (luego `rain.ts`, `autobuy.ts`, `achievements.ts`).
6. `src/ui/` (componentes mínimos, pestañas, tooltips, modales, avisos), `src/main.ts` (arranque y bucle).
7. `scripts/simulate.ts` con el perfil activo.
8. `tests/` por cada fórmula del núcleo.
9. Fases 2 a 5 en el orden de la tabla de arriba.

## Lo último que se hizo

- **Fase 2 cerrada.** Pestañas Mejoras, Logros y Estadísticas; gota de lluvia como botón con
  sus efectos y avisos; noticias del sotobosque; avisos de primera vez en contexto.
- **Números con nombres de juego idle** a pedido del usuario: «1,5 millones», «1.5 Million»,
  hasta 1e63, sin ceros de relleno (ARCHITECTURE.md §4.24). Guardado en versión 2 con migración.
- Revisión adversarial de las fases 1 y 2: 21 hallazgos confirmados y corregidos; seis entran
  en el diario de bugs (#2 a #7), dos con prueba de regresión y cuatro sin prueba automática
  (requieren DOM o navegador: ver la tabla del diario).
- 365 pruebas en verde; el simulador sigue cumpliendo 18 de 18 objetivos.

## Lo que sigue, en orden

1. **Fase 3 — Prestigio:** pestañas Esporular y Mutaciones (ya escritas y probadas a mano),
   generadores 9 y 10, autocompra en la interfaz.
2. **Fase 4 — Pulido:** canvas de la red y sonido (módulos en construcción), Ajustes con
   exportar/importar, responsive fino, accesibilidad y zoom al 200 %.
3. **Fase 5 — Entrega:** revisión final, README, v1.0.0.

## Deuda conocida

- Ninguna todavía.

## Cómo se entrega el trabajo

Rama única `main`, commits pequeños en verde. Cada fase cierra con lint, pruebas y
build en verde, commit, push, etiqueta `v0.N.0` y release.

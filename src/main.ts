/**
 * Arranque y bucle principal.
 *
 * - Lógica a paso fijo de 50 ms (20 Hz) con acumulador; render con requestAnimationFrame.
 * - La interfaz se refresca como máximo 10 veces por segundo.
 * - El tiempo se mide con marcas de tiempo, nunca contando ticks. Al volver de segundo
 *   plano (o tras un hueco largo entre frames), el tiempo se aplica de forma analítica.
 */
import '@fontsource/im-fell-english/latin-400.css';
import '@fontsource/im-fell-english/latin-400-italic.css';
import '@fontsource/source-sans-3/latin-400.css';
import '@fontsource/source-sans-3/latin-600.css';
import './ui/styles.css';

import { drain, type GameEvent } from './core/events.ts';
import { createState, type GameState } from './core/state.ts';
import { tick, TICK_SECONDS } from './core/tick.ts';
import { es } from './i18n/es.ts';
import { formatDuration, formatPercent } from './i18n/format.ts';
import {
  detectLocale,
  fmt,
  getLocale,
  pseudoCatalog,
  setLocale,
  setNotation,
  t,
  type MessageKey,
} from './i18n/index.ts';
import {
  applyBackground,
  applyOffline,
  OFFLINE_REPORT_THRESHOLD,
  type OfflineReport,
} from './systems/offline.ts';
import {
  claimTab,
  isTakenByOtherTab,
  loadGame,
  saveGame,
  SAVE_KEY,
  type StorageLike,
} from './systems/save.ts';
import { createApp, type App } from './ui/app.ts';
import { Disposer, h, restartAnimation } from './ui/dom.ts';
import { createFloaters } from './ui/floaters.ts';
import { openModal } from './ui/modal.ts';
import { createStore, type Store } from './ui/store.ts';
import type { TabId } from './ui/tabs.ts';
import { toast } from './ui/toasts.ts';
import { installTooltipGlobalHandlers, refreshTooltip } from './ui/tooltip.ts';

const TICK_MS = TICK_SECONDS * 1000;
/** Refresco de números en pantalla: como máximo 10 Hz (PROMPT.md §5). */
const UI_INTERVAL_MS = 100;
/** Guardado automático (PROMPT.md §15). */
const SAVE_INTERVAL_MS = 15_000;
/** Un hueco entre frames mayor que esto (suspensión, pestaña congelada) se aplica de golpe. */
const MAX_FRAME_GAP_MS = 1000;

// ---------------------------------------------------------------------------------------
// Almacenamiento

function getStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    storage.getItem(SAVE_KEY);
    return storage;
  } catch {
    return null;
  }
}

function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 1;
}

function newTabId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(randomSeed());
}

// ---------------------------------------------------------------------------------------
// Idioma

function applyLocale(state: GameState): void {
  const params = new URLSearchParams(window.location.search);
  // Pseudoidioma solo en desarrollo: alarga los textos un 40 % para detectar cortes.
  if (import.meta.env.DEV && params.has('pseudo')) {
    setLocale('es', pseudoCatalog(es));
  } else {
    setLocale(detectLocale(state.settings.locale, navigator.languages));
  }
  setNotation(state.settings.notation);
  document.documentElement.lang = getLocale();
  document.title = t('meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
}

// ---------------------------------------------------------------------------------------
// Arranque

const storage = getStorage();
const bootNow = Date.now();
const loaded = loadGame(storage);
let offlineReport: OfflineReport | null = null;
let initialState: GameState;
if (loaded.kind === 'loaded') {
  initialState = loaded.save.state;
  offlineReport = applyOffline(initialState, loaded.save.savedAt, bootNow);
} else {
  initialState = createState(randomSeed(), bootNow);
}
// Los eventos del progreso offline (logros, autocompra) no deben sonar todos de golpe al
// cargar; los logros se ven en su pestaña.
drain();

const store: Store = createStore(initialState);
applyLocale(store.state);

const globalDisposer = new Disposer();
installTooltipGlobalHandlers(globalDisposer);

const floaters = createFloaters();
let currentTab: TabId = 'generators';
const app: App = buildApp();

function buildApp(): App {
  const host = document.querySelector<HTMLElement>('#app');
  if (!host) throw new Error('Falta el contenedor #app');
  const next = createApp(host, store, {
    initialTab: currentTab,
    onTabChange: (id) => {
      currentTab = id;
    },
    onAbsorb: (button) => {
      restartAnimation(button, 'is-pulsing');
    },
  });
  next.stage.append(floaters.root);
  next.update();
  return next;
}

// ---------------------------------------------------------------------------------------
// Guardado

const tabId = newTabId();
let savingBlocked = false;
let warnedUnavailable = false;
let hiddenAt: number | null = null;

claimTab(storage, tabId);

function saveNow(): void {
  if (savingBlocked) return;
  // Con la pestaña oculta el estado no avanza: el guardado se fecha cuando se ocultó, para
  // que el progreso offline cuente todo el tiempo desde entonces.
  const savedAt = hiddenAt ?? Date.now();
  const ok = saveGame(storage, store.state, savedAt);
  if (!ok && !warnedUnavailable) {
    warnedUnavailable = true;
    toast(t('save.unavailable'), { kind: 'warning', duration: 0 });
  }
}

globalDisposer.listen(window, 'storage', (e) => {
  const event = e as StorageEvent;
  if (!savingBlocked && isTakenByOtherTab(event.key, event.newValue, tabId)) {
    savingBlocked = true;
    toast(t('save.otherTab'), {
      kind: 'warning',
      duration: 0,
      action: {
        label: t('save.reload'),
        onSelect: () => {
          window.location.reload();
        },
      },
    });
  }
});

const saveTimer = window.setInterval(() => {
  if (!document.hidden) saveNow();
}, SAVE_INTERVAL_MS);
globalDisposer.add(() => {
  window.clearInterval(saveTimer);
});

globalDisposer.listen(window, 'pagehide', saveNow);

// ---------------------------------------------------------------------------------------
// Avisos del arranque

if (loaded.kind === 'corrupt') toast(t('save.corrupt'), { kind: 'warning', duration: 0 });
if (loaded.kind === 'unavailable') {
  warnedUnavailable = true;
  toast(t('save.unavailable'), { kind: 'warning', duration: 0 });
}

const OFFLINE_FLAVORS: readonly MessageKey[] = [
  'offline.flavor.1',
  'offline.flavor.2',
  'offline.flavor.3',
  'offline.flavor.4',
  'offline.flavor.5',
];

function showOfflineReport(report: OfflineReport): void {
  const locale = getLocale();
  const flavor = OFFLINE_FLAVORS[Math.floor(report.elapsed) % OFFLINE_FLAVORS.length] ?? 'offline.flavor.1';
  const body: string[] = [
    t('offline.body', { time: formatDuration(report.elapsed, locale), value: fmt(report.gained) }),
    t('offline.efficiency', { percent: formatPercent(report.efficiency, locale, 0) }),
  ];
  if (report.capped) body.push(t('offline.capped', { cap: formatDuration(report.effective, locale) }));
  body.push(t(flavor));
  openModal({
    title: t('offline.title'),
    body: body.map((line, i) => h('p', { class: i === body.length - 1 ? 'modal__flavor' : '', text: line })),
    actions: [{ label: t('offline.close'), kind: 'primary' }],
  });
}

if (offlineReport && offlineReport.elapsed > OFFLINE_REPORT_THRESHOLD) showOfflineReport(offlineReport);

// ---------------------------------------------------------------------------------------
// Eventos del núcleo

function handleEvent(event: GameEvent): void {
  switch (event.type) {
    case 'click': {
      const rect = app.hud.coreButton.getBoundingClientRect();
      const stageRect = app.stage.getBoundingClientRect();
      floaters.show(
        `+${fmt(event.value)}`,
        rect.left + rect.width / 2 - stageRect.left,
        rect.top + rect.height * 0.25 - stageRect.top,
      );
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------------------
// Bucle

let speed = 1;
let lastFrame = performance.now();
let accumulator = 0;
let lastUi = 0;

/** Avanza la lógica `ms` milisegundos de tiempo real (en vivo, a paso fijo). */
function advance(ms: number): void {
  if (ms > MAX_FRAME_GAP_MS) {
    applyBackground(store.state, ms / 1000);
    accumulator = 0;
    return;
  }
  accumulator += ms;
  while (accumulator >= TICK_MS) {
    tick(store.state, { dt: TICK_SECONDS });
    accumulator -= TICK_MS;
  }
}

function frame(now: number): void {
  const delta = Math.max(0, now - lastFrame);
  lastFrame = now;
  advance(delta * speed);

  for (const event of drain()) handleEvent(event);

  if (now - lastUi >= UI_INTERVAL_MS) {
    lastUi = now;
    app.update();
    refreshTooltip();
  }
  requestAnimationFrame(frame);
}

globalDisposer.listen(document, 'visibilitychange', () => {
  if (document.hidden) {
    saveNow();
    hiddenAt = Date.now();
    return;
  }
  if (hiddenAt !== null) {
    // Reloj que retrocede: applyBackground ignora intervalos negativos.
    applyBackground(store.state, (Date.now() - hiddenAt) / 1000);
    hiddenAt = null;
    drain();
  }
  lastFrame = performance.now();
  accumulator = 0;
  app.update();
});

// Espacio o Enter absorben cuando el foco no está en otro control (PROMPT.md §8).
globalDisposer.listen(document, 'keydown', (e) => {
  const event = e as KeyboardEvent;
  if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target !== document.body &&
    target.closest('button, a, input, select, textarea, dialog, [tabindex]')
  ) {
    return;
  }
  event.preventDefault();
  app.hud.coreButton.click();
});

requestAnimationFrame(frame);

// ---------------------------------------------------------------------------------------
// Herramientas de desarrollo: ninguna llega al build de producción.

if (import.meta.env.DEV) {
  void import('./ui/dev.ts').then(({ createDevPanel }) => {
    document.body.append(
      createDevPanel(store, {
        setSpeed: (factor) => {
          speed = factor;
        },
        getSpeed: () => speed,
      }),
    );
  });
}

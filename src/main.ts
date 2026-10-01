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
import { markSeen } from './core/actions.ts';
import { createState, hasSeen, type GameState } from './core/state.ts';
import { getAchievement } from './data/achievements.ts';
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
  tp,
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
import { announce } from './ui/live.ts';
import { openModal } from './ui/modal.ts';
import { createSoundEngine, type SoundCue } from './audio/sound.ts';
import { toSeed } from './core/rng.ts';
import { createNetworkView, type NetworkView } from './render/network.ts';
import { createStore, type Store } from './ui/store.ts';
import { createSettingsTab, type SettingsServices } from './ui/tab-settings.ts';
import { achievementDescription, achievementName } from './ui/tab-achievements.ts';
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
// Los eventos del progreso offline (logros, autocompra) se quedan en la cola: el primer
// frame los reparte cuando la interfaz ya existe.

const store: Store = createStore(initialState);
applyLocale(store.state);

const globalDisposer = new Disposer();
installTooltipGlobalHandlers(globalDisposer);

// ---------------------------------------------------------------------------------------
// Ajustes

/** Reconstruye la interfaz (cambio de idioma o notación). El estado no se toca. */
function rebuildApp(focusId?: string): void {
  app.destroy();
  applyLocale(store.state);
  app = buildApp();
  if (focusId) document.getElementById(focusId)?.focus();
}

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

/** El ajuste «Reducir movimiento» o la preferencia del sistema. */
function motionReduced(): boolean {
  return store.state.settings.reducedMotion || reducedMotionQuery.matches;
}

function applyMotion(): void {
  document.documentElement.classList.toggle('reduce-motion', store.state.settings.reducedMotion);
  network?.setReducedMotion(motionReduced());
}

const sound = createSoundEngine();

function applySound(): void {
  sound.configure(store.state.settings.sound, store.state.settings.volume);
}
applySound();
// Mudo hasta la primera interacción (PROMPT.md §14): cada gesto intenta desbloquear el audio.
for (const type of ['pointerup', 'touchend', 'keydown', 'click']) {
  globalDisposer.listen(
    window,
    type,
    () => {
      sound.unlock();
    },
    { capture: true, passive: true },
  );
}

const settingsServices: SettingsServices = {
  rebuild: (focusId) => {
    rebuildApp(focusId);
  },
  replaceGame: (next) => {
    store.replace(next);
    saveNow();
    rebuildApp();
    applyMotion();
    applySound();
    toast(t('settings.import.done'), { kind: 'info' });
  },
  wipeGame: () => {
    // Los ajustes (idioma, sonido, movimiento) se conservan: son del jugador, no de la partida.
    const fresh = createState(randomSeed(), Date.now());
    fresh.settings = { ...store.state.settings };
    store.replace(fresh);
    saveNow();
    currentTab = 'generators';
    rebuildApp();
    toast(t('settings.wipe.done'), { kind: 'info' });
  },
  applySound: () => {
    applySound();
  },
  applyMotion: () => {
    applyMotion();
  },
};
/** Red dibujada en el canvas del escenario; se rehace con la interfaz. */
let network: NetworkView | null = null;
let canvasObserver: ResizeObserver | null = null;

const floaters = createFloaters();
let currentTab: TabId = 'generators';
let app: App = buildApp();
applyMotion();

function mountNetwork(canvas: HTMLCanvasElement): void {
  canvasObserver?.disconnect();
  network?.destroy();
  // La semilla sale del inicio de la vida: la misma partida vuelve a dibujar la misma red.
  network = createNetworkView(canvas, { seed: toSeed(store.state.stats.startedAt) });
  network.setReducedMotion(motionReduced());
  canvasObserver = new ResizeObserver(() => {
    network?.resize();
  });
  canvasObserver.observe(canvas);
  network.resize();
  network.sync(store.state);
}

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
    extraViews: (st) => [createSettingsTab(st, settingsServices)],
  });
  next.root.append(floaters.root);
  next.update(performance.now());
  mountNetwork(next.canvas);
  return next;
}

// ---------------------------------------------------------------------------------------
// Guardado

// Solo en desarrollo, `?loop` mueve el bucle con temporizadores aunque la pestaña esté
// oculta: sirve para probar desde herramientas que muestran la página en segundo plano.
const forceLoop = import.meta.env.DEV && new URLSearchParams(window.location.search).has('loop');

const tabId = newTabId();
// Un guardado dañado sin copia de respaldo no se pisa hasta que el jugador lo decida.
let savingBlocked = loaded.kind === 'corrupt' && !loaded.backedUp;
let warnedUnavailable = false;
// Una página que arranca oculta (pestaña en segundo plano, sesión restaurada) no avanza
// hasta que se muestra: cuenta desde el arranque (BUG-JOURNAL #4).
let hiddenAt: number | null = !forceLoop && document.hidden ? bootNow : null;

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

if (loaded.kind === 'corrupt') {
  if (loaded.backedUp) {
    toast(t('save.corrupt'), { kind: 'warning', duration: 0 });
  } else {
    toast(t('save.corruptNoBackup'), {
      kind: 'warning',
      duration: 0,
      action: {
        label: t('save.startFresh'),
        onSelect: () => {
          savingBlocked = false;
          saveNow();
        },
      },
    });
  }
}
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

const EFFECT_ENDED: Record<'downpour' | 'storm', MessageKey> = {
  downpour: 'rain.ended.downpour',
  storm: 'rain.ended.storm',
};

const EVENT_SOUND: Partial<Record<GameEvent['type'], SoundCue>> = {
  click: 'plop',
  buyGenerator: 'chime',
  buyUpgrade: 'chime',
  buyMutation: 'chime',
  achievement: 'chord',
  rainSpawn: 'drip',
  sporulate: 'spore',
};

function handleEvent(event: GameEvent): void {
  const locale = getLocale();
  const cue = EVENT_SOUND[event.type];
  if (cue) sound.play(cue);
  switch (event.type) {
    case 'click': {
      // Coordenadas de viewport: en escritorio el núcleo está fuera del escenario.
      const rect = app.hud.coreButton.getBoundingClientRect();
      floaters.show(`+${fmt(event.value)}`, rect.left + rect.width / 2, rect.top + rect.height * 0.25);
      break;
    }
    case 'achievement': {
      const def = getAchievement(event.id);
      if (!def) break;
      const message = t('achievement.unlocked', { name: achievementName(def) });
      toast(achievementDescription(def), { kind: 'achievement', title: message });
      announce(message);
      break;
    }
    case 'rainSpawn': {
      announce(t('rain.spawn'));
      if (!hasSeen(store.state, 'hint.rain')) {
        toast(t('hint.rain'), { kind: 'rain', duration: 8000 });
        store.dispatch(markSeen, { key: 'hint.rain' });
      }
      break;
    }
    case 'rainCaught': {
      let message: string;
      if (event.effect === 'dew') message = t('rain.caught.dew', { value: fmt(event.amount) });
      else if (event.effect === 'downpour') {
        message = t('rain.caught.downpour', { time: formatDuration(event.duration, locale) });
      } else message = t('rain.caught.storm', { time: formatDuration(event.duration, locale) });
      toast(event.effect === 'storm' ? t('rain.storm.fact') : message, {
        kind: 'rain',
        title: event.effect === 'storm' ? message : undefined,
      });
      announce(message);
      break;
    }
    case 'effectEnd':
      toast(t(EFFECT_ENDED[event.kind]), { kind: 'rain', duration: 2500 });
      break;
    case 'sporulate': {
      // Guardar justo después de esporular (PROMPT.md §15).
      saveNow();
      const message = tp('sporulate.done', event.gained);
      toast(message, { kind: 'spore' });
      announce(message);
      break;
    }
    case 'buyMutation':
      toast(t('mut.done', { name: t(`mut.${event.id}.name` as MessageKey) }), {
        kind: 'spore',
        duration: 3000,
      });
      break;
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

/** Tope de pasos por frame: si la lógica se queda atrás, se descarta el resto en vez de espiralar. */
const MAX_TICKS_PER_FRAME = 200;

/**
 * Avanza la lógica `realMs` milisegundos de tiempo real. El hueco se mide sin acelerar (solo
 * una suspensión real va por la vía analítica); el acelerador de desarrollo multiplica el
 * tiempo que se juega en vivo y, a velocidades altas, usa pasos mayores (hasta 1 s, como el
 * simulador) para que lluvia, logros y efectos sigan funcionando.
 */
function advance(realMs: number): void {
  if (realMs > MAX_FRAME_GAP_MS) {
    applyBackground(store.state, (realMs * speed) / 1000);
    accumulator = 0;
    return;
  }
  accumulator += realMs * speed;
  const stepMs = Math.min(1000, TICK_MS * Math.max(1, speed / 10));
  let steps = 0;
  while (accumulator >= stepMs && steps < MAX_TICKS_PER_FRAME) {
    tick(store.state, { dt: stepMs / 1000 });
    accumulator -= stepMs;
    steps += 1;
  }
  if (steps === MAX_TICKS_PER_FRAME) accumulator = 0;
}

const schedule = (cb: (now: number) => void): void => {
  if (forceLoop)
    window.setTimeout(() => {
      cb(performance.now());
    }, 16);
  else requestAnimationFrame(cb);
};

function frame(now: number): void {
  const delta = Math.max(0, now - lastFrame);
  lastFrame = now;
  advance(delta);

  for (const event of drain()) {
    handleEvent(event);
    network?.onEvent(event);
  }

  if (now - lastUi >= UI_INTERVAL_MS) {
    lastUi = now;
    app.update(now);
    network?.sync(store.state);
    refreshTooltip();
  }
  network?.frame(now);
  schedule(frame);
}

globalDisposer.listen(reducedMotionQuery, 'change', () => {
  applyMotion();
});

globalDisposer.listen(document, 'visibilitychange', () => {
  if (forceLoop) return;
  if (document.hidden) {
    saveNow();
    hiddenAt = Date.now();
    return;
  }
  if (hiddenAt !== null) {
    // Reloj que retrocede: applyBackground ignora intervalos negativos.
    applyBackground(store.state, (Date.now() - hiddenAt) / 1000);
    hiddenAt = null;
  }
  lastFrame = performance.now();
  accumulator = 0;
  app.update(lastFrame);
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

schedule(frame);

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

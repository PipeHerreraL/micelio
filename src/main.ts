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
  formatCount,
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
import { registerServiceWorker, watchInstall } from './ui/install.ts';
import { announce, createLiveRegion } from './ui/live.ts';
import { openModal } from './ui/modal.ts';
import { createSoundEngine, type SoundCue } from './audio/sound.ts';
import { toSeed } from './core/rng.ts';
import { createNetworkView, type NetworkView } from './render/network.ts';
import { createStore, type Store } from './ui/store.ts';
import { biomeAdaptationName, biomeName } from './ui/biome-text.ts';
import { openChapter, pendingChapter, type ChapterNav } from './ui/chapter.ts';
import { isModalOpen, onModalClosed } from './ui/modal.ts';
import type { DestinationId } from './data/biomes.ts';
import { formatFactor } from './i18n/format.ts';
import { createSettingsTab, type SettingsServices } from './ui/tab-settings.ts';
import { achievementDescription, achievementName } from './ui/tab-achievements.ts';
import type { TabId } from './ui/tabs.ts';
import { createToastContainer, removeToast, toast, type ToastOptions } from './ui/toasts.ts';
import { installTooltipGlobalHandlers, refreshTooltip } from './ui/tooltip.ts';
import { ensurePartnerCatalog, setPartnerPseudo } from './i18n/partners/index.ts';
import { ensureNewsCatalog, setNewsPseudo } from './i18n/news/index.ts';
import { PARTNER_IDS, type PartnerId } from './partners/ids.ts';
import type { PartnerEvent } from './partners/registry.ts';
import { mappedCount } from './partners/plasmodium/state.ts';
import {
  advancePartners,
  applyPartnersElapsed,
  noteFungalEvent,
  setPartnerErrorHandler,
  type ElapsedNote,
} from './systems/partners.ts';
import {
  loadPartner,
  partnerChapterReady,
  partnerNoticeFor,
  reportPartnerFailure,
  schedulePartnerPreload,
} from './ui/partner-loader.ts';
import { createPartnerNoticeGate } from './ui/partner-notice-gate.ts';

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
    setPartnerPseudo(true);
    setNewsPseudo(true);
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
let partnerNotes: ElapsedNote[] = [];
let initialState: GameState;
if (loaded.kind === 'loaded') {
  initialState = loaded.save.state;
  // Los socios reciben su tiempo antes que la red: un socio que llega al final del tiempo de la
  // red no recibe el tiempo en que no existía (systems/partners.ts). Su modelo aún no está
  // cargado: el tiempo queda pendiente y se aplica cuando llegue.
  partnerNotes = applyPartnersElapsed(
    initialState,
    Math.max(0, (bootNow - loaded.save.savedAt) / 1000),
    'offline',
  );
  offlineReport = applyOffline(initialState, loaded.save.savedAt, bootNow);
} else {
  initialState = createState(randomSeed(), bootNow);
}
// Los eventos del progreso offline (logros, autocompra) se quedan en la cola: el primer
// frame los reparte cuando la interfaz ya existe.

const store: Store = createStore(initialState);
applyLocale(store.state);

// Los avisos y la región aria-live se crean una vez, fuera de #app: rebuildApp rehace #app
// entero y con él se irían los avisos fijos de guardado y su único botón para resolverlos.
const liveRegion = createLiveRegion(t('live.region'));
document.body.append(createToastContainer(), liveRegion);

const globalDisposer = new Disposer();
installTooltipGlobalHandlers(globalDisposer);
// App instalable (ARCHITECTURE.md §4.31): el aviso de instalación de Chrome llega pronto, antes de
// que exista Ajustes; el service worker deja jugar sin conexión.
globalDisposer.add(watchInstall());
registerServiceWorker();

// ---------------------------------------------------------------------------------------
// Ajustes

/** Reconstruye la interfaz (cambio de idioma o notación). El estado no se toca. */
function rebuildApp(focusId?: string): void {
  app.destroy();
  applyLocale(store.state);
  liveRegion.setAttribute('aria-label', t('live.region'));
  app = buildApp();
  // Los textos de los socios del idioma nuevo; mientras llegan, siguen los del anterior.
  for (const id of PARTNER_IDS) {
    if (store.state.partners[id] !== null) void loadPartner(id, getLocale());
  }
  // Los avisos fijos siguen en su contenedor; se reemiten para que cambien de idioma.
  showStickyNotices();
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
  app.setReducedMotion(motionReduced());
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
    // Importar es la decisión explícita de dejar atrás el guardado dañado.
    liftCorruptBlock();
    const saved = saveNow();
    rebuildApp();
    applyMotion();
    applySound();
    confirmReplaced(saved, 'settings.import.done');
  },
  wipeGame: () => {
    // Los ajustes (idioma, sonido, movimiento) se conservan: son del jugador, no de la partida.
    const fresh = createState(randomSeed(), Date.now());
    fresh.settings = { ...store.state.settings };
    // Ajustes sigue a mano tras borrar: quien borra suele querer importar un respaldo, y sin
    // esto la interfaz volvía a la de partida nueva, sin pestañas (BUG-JOURNAL #13).
    fresh.seen = ['tab.settings', 'tabVisited.settings'];
    store.replace(fresh);
    // Borrar también es decidir empezar de nuevo sobre un guardado dañado.
    liftCorruptBlock();
    const saved = saveNow();
    currentTab = 'settings';
    rebuildApp();
    // El botón de borrar se fue con la interfaz vieja: sin esto el foco cae en <body> y el
    // siguiente Espacio absorbe sin que el jugador sepa dónde está.
    app.hud.coreButton.focus();
    confirmReplaced(saved, 'settings.wipe.done');
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

// Llevar la ventana a una pantalla con otra densidad cambia devicePixelRatio sin cambiar el
// tamaño CSS del canvas: el ResizeObserver no salta y la red se vería borrosa (o con un
// lienzo de más). La consulta solo describe la densidad actual, así que al cambiar se
// vuelve a armar con la nueva. matchMedia sirve en todos los navegadores; observar
// 'device-pixel-content-box' no existe en Safari.
let pixelRatioQuery: MediaQueryList | null = null;

function onPixelRatioChange(): void {
  network?.resize();
  watchPixelRatio();
}

function watchPixelRatio(): void {
  pixelRatioQuery?.removeEventListener('change', onPixelRatioChange);
  pixelRatioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  pixelRatioQuery.addEventListener('change', onPixelRatioChange);
}

watchPixelRatio();
globalDisposer.add(() => {
  pixelRatioQuery?.removeEventListener('change', onPixelRatioChange);
});

const floaters = createFloaters();
let currentTab: TabId = 'generators';

/** Enfoca un encabezado de la pestaña recién elegida, ya visible (en el cuadro siguiente). */
function focusHeading(id: string): void {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  });
}

/** Adónde llevan las láminas del viaje al cerrarse (ui/chapter.ts). */
const chapterNav: ChapterNav = {
  toWind: () => {
    app.tabs.select('sporulate');
    focusHeading('wind-title');
  },
  toAdaptations: (biome: DestinationId) => {
    app.tabs.select('mutations');
    focusHeading(`badapt-${biome}-title`);
  },
  toCore: () => {
    app.hud.coreButton.focus();
  },
  toPartner: (id: PartnerId, openPlate?: number) => {
    app.tabs.select('partners');
    focusHeading(`partner-${id}-title`);
    if (openPlate !== undefined) {
      // Las acciones del plasmodio llegan con su modelo (trozo aparte).
      void import('./partners/plasmodium/actions.ts').then(({ openPlate: open }) => {
        store.dispatch(open, { plate: openPlate });
      });
    }
  },
};

let app: App = buildApp();
applyMotion();

/** Lámina de una placa releída desde el Atlas del plasmodio. */
function rereadPlate(plate: number): void {
  openChapter(store, { kind: 'plate', plate }, chapterNav, { reread: true });
}

function mountNetwork(canvas: HTMLCanvasElement): void {
  canvasObserver?.disconnect();
  network?.destroy();
  // La semilla sale del inicio de la vida: la misma partida vuelve a dibujar la misma red.
  network = createNetworkView(canvas, {
    seed: toSeed(store.state.stats.startedAt),
    biome: store.state.forest.biome,
  });
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
    nav: chapterNav,
    partners: {
      reducedMotion: motionReduced,
      toAchievements: () => {
        app.tabs.select('achievements');
        focusHeading('achievements-plasmodium');
      },
      rereadPlate: (plate) => {
        rereadPlate(plate);
      },
      saveAndReload: () => {
        saveNow();
        window.location.reload();
      },
    },
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
/**
 * Por qué esta pestaña no guarda. Un guardado dañado sin copia de respaldo no se pisa hasta
 * que el jugador decida empezar de nuevo (o importe, o borre); si otra pestaña tomó el
 * guardado, esta no lo pisa nunca. Se distinguen porque solo el primero lo levanta el jugador.
 */
let blockedBy: 'corrupt' | 'otherTab' | null =
  loaded.kind === 'corrupt' && !loaded.backedUp ? 'corrupt' : null;
let warnedUnavailable = loaded.kind === 'unavailable';
let warnedInvalid = false;
let warnedRestored = false;
/** La carga tuvo que empezar de cero a un socio (copia de respaldo y aviso fijo). */
const partnersReset = loaded.kind === 'loaded' && loaded.partnersReset.length > 0;
// Una página que arranca oculta (pestaña en segundo plano, sesión restaurada) no avanza
// hasta que se muestra: cuenta desde el arranque (BUG-JOURNAL #4).
let hiddenAt: number | null = !forceLoop && document.hidden ? bootNow : null;

claimTab(storage, tabId);

/** Guarda ahora. Devuelve si la partida quedó escrita. */
function saveNow(): boolean {
  if (blockedBy) return false;
  // Con la pestaña oculta el estado no avanza: el guardado se fecha cuando se ocultó, para
  // que el progreso offline cuente todo el tiempo desde entonces.
  const savedAt = hiddenAt ?? Date.now();
  const outcome = saveGame(storage, store.state, savedAt);
  if (outcome === 'failed' && !warnedUnavailable) {
    warnedUnavailable = true;
    showStickyNotices();
  }
  if (outcome === 'restored' && !warnedRestored) {
    // Un socio tenía un valor imposible: volvió a su último estado bueno y la red se guardó.
    warnedRestored = true;
    console.warn('Micelio: un socio tenía un valor imposible; volvió a su último estado guardado.');
    toast(t('save.partnerRestored'), { kind: 'info' });
  }
  if (outcome === 'invalid' && !warnedInvalid) {
    // No debería pasar nunca: el núcleo acota las cantidades (num.clamp). Si pasa, el último
    // guardado bueno se conserva y queda constancia en la consola para poder rastrearlo.
    warnedInvalid = true;
    console.error('Micelio: el estado tiene un valor imposible; no se guardó.');
    showStickyNotices();
  }
  return outcome === 'saved' || outcome === 'restored';
}

/** El jugador decidió dejar atrás el guardado dañado: desde ahora se puede pisar. */
function liftCorruptBlock(): void {
  if (blockedBy !== 'corrupt') return;
  blockedBy = null;
  removeToast('save-corrupt-no-backup');
}

type NoticeId =
  | 'save-corrupt'
  | 'save-corrupt-no-backup'
  | 'save-other-tab'
  | 'save-unavailable'
  | 'save-invalid'
  | 'save-partner-reset';
/** Avisos fijos que el jugador cerró: no vuelven al reconstruir la interfaz. */
const dismissedNotices = new Set<NoticeId>();
const corruptBackedUp = loaded.kind === 'corrupt' && loaded.backedUp;

function notice(id: NoticeId, message: string, action?: ToastOptions['action']): void {
  if (dismissedNotices.has(id)) return;
  toast(message, {
    kind: 'warning',
    duration: 0,
    id,
    action,
    onClose: () => {
      dismissedNotices.add(id);
    },
  });
}

/**
 * Muestra los avisos fijos que siguen en pie, con el texto del idioma vigente. Se llama al
 * arrancar, cuando cambia el motivo y tras reconstruir la interfaz: un aviso ya visible se
 * sustituye en su sitio, así que cambia de idioma con todo lo demás.
 */
function showStickyNotices(): void {
  if (corruptBackedUp) notice('save-corrupt', t('save.corrupt'));
  if (blockedBy === 'corrupt') {
    notice('save-corrupt-no-backup', t('save.corruptNoBackup'), {
      label: t('save.startFresh'),
      onSelect: () => {
        liftCorruptBlock();
        saveNow();
      },
    });
  }
  if (blockedBy === 'otherTab') {
    notice('save-other-tab', t('save.otherTab'), {
      label: t('save.reload'),
      onSelect: () => {
        window.location.reload();
      },
    });
  }
  if (warnedUnavailable) notice('save-unavailable', t('save.unavailable'));
  if (warnedInvalid) notice('save-invalid', t('save.invalid'));
  if (partnersReset) notice('save-partner-reset', t('save.partnerReset'));
}

/**
 * Tras importar o borrar: confirma solo si la partida quedó guardada. Si no, decir «Partida
 * importada» haría creer al jugador que recargar la conserva; se le vuelve a mostrar por qué
 * no se guarda, aunque antes hubiera cerrado ese aviso.
 */
function confirmReplaced(saved: boolean, key: MessageKey): void {
  if (saved) {
    const message = t(key);
    toast(message, { kind: 'info' });
    announce(message);
    return;
  }
  dismissedNotices.delete('save-other-tab');
  dismissedNotices.delete('save-unavailable');
  showStickyNotices();
  announce(blockedBy === 'otherTab' ? t('save.otherTab') : t('save.unavailable'));
}

globalDisposer.listen(window, 'storage', (e) => {
  const event = e as StorageEvent;
  if (blockedBy !== 'otherTab' && isTakenByOtherTab(event.key, event.newValue, tabId)) {
    // Si estaba bloqueada por un guardado dañado, ahora manda la otra pestaña: «Empezar de
    // nuevo» ya no debe pisar lo que esa guarde.
    if (blockedBy === 'corrupt') removeToast('save-corrupt-no-backup');
    blockedBy = 'otherTab';
    showStickyNotices();
  }
});

const saveTimer = window.setInterval(() => {
  if (!document.hidden) saveNow();
}, SAVE_INTERVAL_MS);
globalDisposer.add(() => {
  window.clearInterval(saveTimer);
});

globalDisposer.listen(window, 'pagehide', () => {
  saveNow();
});

// ---------------------------------------------------------------------------------------
// Avisos del arranque

showStickyNotices();

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
  for (const note of partnerNotes) {
    if (note.seconds > 0) {
      body.push(
        t('offline.plasmodium', {
          time: formatDuration(note.seconds, locale),
          percent: formatPercent(note.efficiency, locale, 0),
        }),
      );
    }
  }
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
  buyAdaptation: 'chime',
  buyBiomeAdaptation: 'chime',
  achievement: 'chord',
  actOneClosed: 'chord',
  colonized: 'chord',
  disperse: 'wind',
  rainSpawn: 'drip',
  sporulate: 'spore',
  partnerUnlocked: 'chord',
};

/** Aviso de un evento del socio; false si no salió nada. */
function deliverPartnerNotice(event: PartnerEvent): boolean {
  // El aviso es código del socio: si lanza, el socio se da de baja y el bucle sigue.
  const notice = partnerNoticeFor(event);
  if (!notice) return false;
  if (notice.tone) {
    toast(notice.text, { kind: notice.tone, ...(notice.title ? { title: notice.title } : {}) });
  }
  if (notice.cue) sound.play(notice.cue);
  if (notice.announce) announce(notice.title ?? notice.text);
  return true;
}

/** Objetivo y mapa: uno de cada tipo cada 10 s como mucho, nunca tras un modal ni caducado. */
const partnerNotices = createPartnerNoticeGate({
  now: () => performance.now(),
  modalOpen: isModalOpen,
  goalMet: () => store.state.partners.plasmodium?.goalMet ?? null,
  deliver: deliverPartnerNotice,
});
onModalClosed(() => {
  partnerNotices.modalClosed();
});

function handlePartnerEvent(event: PartnerEvent): void {
  // Guardar justo después de cartografiar una placa, como al esporular.
  if (event.kind === 'fruited') saveNow();
  partnerNotices.offer(event);
}

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
    case 'rainFell': {
      // La gota del Chocó que nadie atrapó cayó sola: el mismo aviso, con su propio texto.
      let message: string;
      if (event.effect === 'dew') message = t('rain.fell.dew', { value: fmt(event.amount) });
      else if (event.effect === 'downpour') {
        message = t('rain.fell.downpour', { time: formatDuration(event.duration, locale) });
      } else message = t('rain.fell.storm', { time: formatDuration(event.duration, locale) });
      toast(event.effect === 'storm' ? t('rain.storm.fact') : message, {
        kind: 'rain',
        title: event.effect === 'storm' ? message : undefined,
      });
      announce(message);
      break;
    }
    case 'actOneClosed':
      // Sin aviso flotante: la lámina se abre sola en cuanto no hay otro modal.
      announce(t('actOne.announce'));
      break;
    case 'partnerUnlocked':
      // Sin aviso flotante: la lámina de llegada sale sola. El modelo empieza a llegar ya.
      announce(t('plasmodium.announce'));
      void loadPartner(event.partner, getLocale());
      break;
    case 'plasmodium':
      handlePartnerEvent(event);
      break;
    case 'colonized': {
      const message = t('wind.colonized', {
        name: biomeName(event.biome),
        factor: formatFactor(event.factor, locale),
      });
      toast(message, { kind: 'spore' });
      announce(message);
      break;
    }
    case 'disperse': {
      // Guardar justo después de dispersar, como al esporular (PROMPT.md §15).
      saveNow();
      const leaving = t('wind.leaving', { name: biomeName(event.to) });
      if (event.gained > 0) toast(tp('wind.gained', event.gained), { kind: 'spore', title: leaving });
      else toast(leaving, { kind: 'spore' });
      announce(leaving);
      break;
    }
    case 'buyBiomeAdaptation':
      toast(t('adapt.done', { name: biomeAdaptationName(event.id), rank: formatCount(event.rank) }), {
        kind: 'spore',
        duration: 3000,
      });
      break;
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
    case 'buyAdaptation':
      toast(
        t('adapt.done', { name: t(`adapt.${event.id}.name` as MessageKey), rank: formatCount(event.rank) }),
        {
          kind: 'spore',
          duration: 3000,
        },
      );
      break;
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

// ---------------------------------------------------------------------------------------
// Láminas del viaje

/** Hay una lámina abierta: entre su cierre y el evento 'close' no se abre otra (ni la misma). */
let chapterShowing = false;

/**
 * Abre la lámina pendiente cuando no hay otro modal (el informe offline y las confirmaciones
 * van primero) y terminó la animación de esporular o dispersar: la lámina de llegada sale
 * cuando ya se ve el suelo nuevo.
 */
function showPendingChapter(): void {
  if (chapterShowing || isModalOpen() || (network?.isTransitioning() ?? false)) return;
  const chapter = pendingChapter(store.state);
  if (!chapter) return;
  // La lámina de una placa espera al catálogo del idioma (pedido una vez) o, si no llega, sale con
  // el anterior.
  if (chapter.kind === 'plate' && !partnerChapterReady('plasmodium', getLocale())) return;
  chapterShowing = true;
  openChapter(store, chapter, chapterNav, {
    onClosed: () => {
      chapterShowing = false;
    },
  });
}

let speed = 1;
let lastMapped = store.state.partners.plasmodium ? mappedCount(store.state.partners.plasmodium) : 0;
/** La precarga de los socios se pide tras el primer frame. */
let preloadScheduled = false;
let lastFrame = performance.now();
let accumulator = 0;
let lastUi = 0;

/** Payload reutilizado en cada paso de lógica: el bucle no debe crear objetos. */
const tickPayload = { dt: TICK_SECONDS };

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
    // Los socios primero (ver el arranque).
    applyPartnersElapsed(store.state, (realMs * speed) / 1000, 'background');
    applyBackground(store.state, (realMs * speed) / 1000);
    accumulator = 0;
    return;
  }
  accumulator += realMs * speed;
  const stepMs = Math.min(1000, TICK_MS * Math.max(1, speed / 10));
  let steps = 0;
  while (accumulator >= stepMs && steps < MAX_TICKS_PER_FRAME) {
    tickPayload.dt = stepMs / 1000;
    tick(store.state, tickPayload);
    // El socio avanza con su propio reloj (sin su modelo, el tiempo queda pendiente).
    advancePartners(store.state, stepMs);
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
    app.onEvent(event);
    // Lluvia en la placa: cada gota del bosque humedece el agar del plasmodio.
    if (event.type === 'rainCaught' || event.type === 'rainFell') store.dispatch(noteFungalEvent, { event });
  }

  if (now - lastUi >= UI_INTERVAL_MS) {
    lastUi = now;
    // Si un fruto se perdió en una cola llena de avisos, se guarda igual.
    const mapped = store.state.partners.plasmodium ? mappedCount(store.state.partners.plasmodium) : 0;
    if (mapped > lastMapped) saveNow();
    lastMapped = mapped;
    app.update(now);
    network?.sync(store.state);
    refreshTooltip();
    showPendingChapter();
  }
  network?.frame(now);
  app.frame(now);
  if (!preloadScheduled) {
    preloadScheduled = true;
    schedulePartnerPreload(store, getLocale);
  }
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
    // Reloj que retrocede: applyBackground ignora intervalos negativos. Los socios, primero.
    applyPartnersElapsed(store.state, (Date.now() - hiddenAt) / 1000, 'background');
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

// Un error del modelo de un socio no para el bucle ni hace perder la partida: se avisa una vez,
// el modelo se da de baja (su tiempo vuelve a quedar pendiente) y el panel ofrece recargar. La
// vista (tab-partners.ts) y los avisos (deliverPartnerNotice) usan el mismo camino.
setPartnerErrorHandler(reportPartnerFailure);
// Con el idioma ya decidido: el catálogo del socio se pide junto con su modelo en la precarga.
for (const id of PARTNER_IDS) {
  if (store.state.partners[id] !== null) void ensurePartnerCatalog(id, getLocale()).catch(() => undefined);
}
// Las noticias también llegan aparte: se piden ya para que estén al primer refresco del teletipo.
void ensureNewsCatalog(getLocale()).catch(() => undefined);

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

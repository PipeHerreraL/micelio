/**
 * Instalar el juego (ARCHITECTURE.md §4.31): como app desde el navegador (PWA) o, en Android, con el
 * .apk de cada versión. Aquí se sabe en qué caso se está y se guarda el aviso de instalación de
 * Chrome (`beforeinstallprompt`), que llega una sola vez y a menudo antes de que exista Ajustes.
 */

/** El .apk de la última versión publicada (lo adjunta .github/workflows/android.yml). */
export const APK_URL = 'https://github.com/PipeHerreraL/micelio/releases/latest/download/micelio.apk';

/**
 * - native: dentro de la app de Android.
 * - installed: la app instalada desde el navegador.
 * - prompt: el navegador ofrece instalarla con un botón (Chrome, Edge…).
 * - ios: Safari del iPhone o el iPad, que solo lo hace a mano.
 * - browser: otro navegador; quizá desde su menú.
 */
export type InstallSituation = 'native' | 'installed' | 'prompt' | 'ios' | 'browser';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

/**
 * Escucha el aviso de instalación y la instalación hecha. No se cancela el aviso: el navegador
 * puede seguir ofreciendo la suya (la barra de Chrome en Android) además del botón de Ajustes.
 */
export function watchInstall(): () => void {
  const onPrompt = (event: Event): void => {
    deferred = event as BeforeInstallPromptEvent;
    notify();
  };
  const onInstalled = (): void => {
    deferred = null;
    notify();
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/** Avisa cuando cambia la situación (llega el aviso, se instala). Devuelve la baja. */
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** iPhone, iPod o iPad (que desde iPadOS 13 se presenta como un Mac con pantalla táctil). */
function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function installSituation(): InstallSituation {
  if (import.meta.env.MODE === 'native') return 'native';
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'installed';
  if (deferred) return 'prompt';
  if (isIos()) return 'ios';
  return 'browser';
}

/** Abre el diálogo de instalación del navegador. Devuelve si el jugador la aceptó. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  await event.prompt();
  const choice = await event.userChoice;
  notify();
  return choice.outcome === 'accepted';
}

/**
 * Registra el service worker que deja jugar sin conexión (scripts/service-worker.ts). Solo en el
 * build de la web: en desarrollo guardaría lo que se está editando, y en la app de Android los
 * archivos ya están en el teléfono.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || import.meta.env.MODE === 'native' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

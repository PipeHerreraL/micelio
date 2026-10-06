/**
 * Pestaña Ajustes (PROMPT.md §13, §15): idioma, notación, sonido y volumen, reducir
 * movimiento, exportar e importar partida y borrar partida (escribiendo BORRAR).
 */
import { setSetting } from '../core/actions.ts';
import { LOCALES, NOTATIONS, type GameState, type Locale, type Notation } from '../core/state.ts';
import { formatDate, formatPercent } from '../i18n/format.ts';
import { fmt, formatCount, getLocale, t, type MessageKey } from '../i18n/index.ts';
import { exportSave, importSave, type ImportError } from '../systems/save.ts';
import { biomeName } from './biome-text.ts';
import { Disposer, h, setAttr, setDisabled, setHidden, setText } from './dom.ts';
import {
  APK_URL,
  installSituation,
  isAndroid,
  onInstallChange,
  promptInstall,
  type InstallSituation,
} from './install.ts';
import { openModal } from './modal.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';

export interface SettingsServices {
  /** Reconstruye la interfaz tras cambiar la notación; luego enfoca `focusId`. */
  rebuild(focusId: string): void;
  /**
   * Cambia de idioma cuando llega su catálogo (el inglés llega aparte), reconstruye y enfoca
   * `focusId`. Si no llega, la interfaz sigue igual con un aviso. Nunca rechaza.
   */
  changeLocale(locale: Locale, focusId: string): Promise<void>;
  /** Sustituye la partida (importar) y la guarda. */
  replaceGame(next: GameState): void;
  /** Borra la partida y empieza una nueva. */
  wipeGame(): void;
  /** Aplica sonido y volumen al motor de audio. */
  applySound(): void;
  /** Aplica «Reducir movimiento» al documento y al canvas. */
  applyMotion(): void;
}

const NOTATION_KEYS: Record<Notation, MessageKey> = {
  names: 'settings.notation.names',
  suffix: 'settings.notation.suffix',
  scientific: 'settings.notation.scientific',
  engineering: 'settings.notation.engineering',
};
const LOCALE_KEYS: Record<Locale, MessageKey> = { es: 'settings.language.es', en: 'settings.language.en' };
const IMPORT_ERRORS: Record<ImportError, MessageKey> = {
  empty: 'settings.import.error.empty',
  tooLarge: 'settings.import.error.tooLarge',
  base64: 'settings.import.error.base64',
  encoding: 'settings.import.error.encoding',
  json: 'settings.import.error.json',
  shape: 'settings.import.error.shape',
  version: 'settings.import.error.version',
  newer: 'settings.import.error.newer',
  migration: 'settings.import.error.migration',
  invalid: 'settings.import.error.invalid',
};

function section(title: string, children: readonly Node[]): HTMLElement {
  return h('section', { class: 'settings__section' }, [
    h('h3', { class: 'settings__title', text: title }),
    ...children,
  ]);
}

export function createSettingsTab(store: Store, services: SettingsServices): TabView {
  const disposer = new Disposer();

  // Instalar la app (ARCHITECTURE.md §4.31): lo que se puede hacer depende del navegador.
  const installButton = h('button', {
    class: 'button',
    id: 'setting-install',
    text: t('settings.install.button'),
    attrs: { type: 'button', hidden: true },
  });
  // Enfocable desde el código: tras instalar, el botón se oculta y el foco pasa aquí (BUG-JOURNAL #5).
  const installText = h('p', {
    class: 'settings__hint',
    id: 'setting-install-text',
    attrs: { tabindex: -1 },
  });
  const apkLink = h('a', {
    class: 'button button--quiet',
    id: 'setting-install-apk',
    text: t('settings.install.apk'),
    attrs: { href: APK_URL, rel: 'noopener', hidden: true },
  });
  const apkHint = h('p', {
    class: 'settings__hint',
    text: t('settings.install.apk.hint'),
    attrs: { hidden: true },
  });
  const installSection = section(t('settings.install'), [installText, installButton, apkLink, apkHint]);
  const INSTALL_TEXT: Readonly<Record<InstallSituation, MessageKey | null>> = {
    native: null,
    installed: null,
    justInstalled: 'settings.install.justInstalled',
    prompt: null,
    ios: 'settings.install.ios',
    browser: 'settings.install.browser',
  };
  function updateInstall(): void {
    const situation = installSituation();
    // Dentro de la app (la de Android o la instalada desde el navegador) no hay nada que instalar: la
    // sección solo ocuparía sitio (petición del usuario).
    setHidden(installSection, situation === 'native' || situation === 'installed');
    const key = INSTALL_TEXT[situation];
    setHidden(installText, key === null);
    if (key) setText(installText, t(key));
    // Pulsado el botón, el navegador ya no vuelve a ofrecerlo: el foco no se queda en un botón oculto.
    if (situation !== 'prompt' && document.activeElement === installButton) installText.focus();
    setHidden(installButton, situation !== 'prompt');
    const apk = isAndroid() && (situation === 'prompt' || situation === 'ios' || situation === 'browser');
    setHidden(apkLink, !apk);
    setHidden(apkHint, !apk);
  }
  disposer.listen(installButton, 'click', () => {
    void promptInstall().then(updateInstall);
  });
  disposer.add(onInstallChange(updateInstall));

  // Idioma: los nombres de los idiomas van en su propio idioma, así que se entienden siempre.
  const localeGroup = h('div', {
    class: 'segmented',
    attrs: { role: 'group', 'aria-label': t('settings.language') },
  });
  const localeButtons = LOCALES.map((locale) => {
    const button = h('button', {
      class: 'segmented__option',
      id: `setting-locale-${locale}`,
      text: t(LOCALE_KEYS[locale]),
      attrs: { type: 'button', lang: locale },
    });
    disposer.listen(button, 'click', () => {
      // Mientras llega un catálogo, el selector espera (aria-busy) y no pide otro.
      if (localeGroup.getAttribute('aria-busy') === 'true') return;
      // Con el inglés guardado pero sin llegar al arrancar se juega en español: elegirlo lo vuelve a
      // pedir (en Chromium falla igual hasta recargar; ARCHITECTURE.md §4.32).
      if (getLocale() === locale && store.state.settings.locale === locale) return;
      setAttr(localeGroup, 'aria-busy', 'true');
      void services.changeLocale(locale, `setting-locale-${locale}`).finally(() => {
        setAttr(localeGroup, 'aria-busy', null);
      });
    });
    return { locale, button };
  });
  localeGroup.append(...localeButtons.map((b) => b.button));

  const notationButtons = NOTATIONS.map((notation) => {
    const button = h('button', {
      class: 'segmented__option segmented__option--wide',
      id: `setting-notation-${notation}`,
      text: t(NOTATION_KEYS[notation]),
      attrs: { type: 'button' },
    });
    disposer.listen(button, 'click', () => {
      if (store.state.settings.notation === notation) return;
      store.dispatch(setSetting, { key: 'notation', value: notation });
      services.rebuild(`setting-notation-${notation}`);
    });
    return { notation, button };
  });

  // El botón dice qué controla y en qué estado está: «Sonido · Activado». La palabra del
  // estado se oculta al lector: aria-pressed ya lo dice, y un nombre que cambia con el estado
  // se lee como «Sonido Silenciado, no presionado», una doble negación.
  const soundState = h('span', { class: 'toggle__state', attrs: { 'aria-hidden': 'true' } });
  const sound = h('button', { class: 'toggle', id: 'setting-sound', attrs: { type: 'button' } }, [
    h('span', { text: t('settings.sound') }),
    soundState,
  ]);
  disposer.listen(sound, 'click', () => {
    store.dispatch(setSetting, { key: 'sound', value: !store.state.settings.sound });
    services.applySound();
  });
  const volume = h('input', {
    class: 'range',
    id: 'setting-volume',
    attrs: { type: 'range', min: 0, max: 100, step: 5 },
  });
  disposer.listen(volume, 'input', () => {
    store.dispatch(setSetting, { key: 'volume', value: Number(volume.value) / 100 });
    services.applySound();
  });

  const motion = h('button', {
    class: 'toggle',
    id: 'setting-motion',
    text: t('settings.reducedMotion'),
    attrs: { type: 'button', 'aria-describedby': 'setting-motion-hint' },
  });
  disposer.listen(motion, 'click', () => {
    store.dispatch(setSetting, { key: 'reducedMotion', value: !store.state.settings.reducedMotion });
    services.applyMotion();
  });

  // Exportar
  const exportArea = h('textarea', {
    class: 'textarea',
    id: 'setting-export-text',
    attrs: { readonly: true, rows: 4, hidden: true, 'aria-label': t('settings.export'), spellcheck: 'false' },
  });
  const exportButton = h('button', {
    class: 'button button--quiet',
    text: t('settings.export'),
    attrs: { type: 'button' },
  });
  const copyButton = h('button', {
    class: 'button button--primary',
    text: t('settings.export.copy'),
    attrs: { type: 'button', hidden: true },
  });
  const exportStatus = h('p', { class: 'settings__status', attrs: { hidden: true } });
  disposer.listen(exportButton, 'click', () => {
    exportArea.value = exportSave(store.state, Date.now());
    setHidden(exportArea, false);
    setHidden(copyButton, false);
    setHidden(exportStatus, true);
    exportArea.select();
  });
  disposer.listen(copyButton, 'click', () => {
    const done = (key: MessageKey): void => {
      setText(exportStatus, t(key));
      setHidden(exportStatus, false);
    };
    const fail = (): void => {
      exportArea.focus();
      exportArea.select();
      done('settings.export.copyFailed');
    };
    let copying: Promise<void>;
    try {
      // Fuera de un contexto seguro (http://192.168.x.x con `vite --host`, algunos webviews)
      // navigator.clipboard no existe y la llamada lanza en vez de rechazar.
      copying = navigator.clipboard.writeText(exportArea.value);
    } catch {
      fail();
      return;
    }
    copying.then(() => {
      done('settings.export.copied');
    }, fail);
  });

  // Importar
  const importArea = h('textarea', {
    class: 'textarea',
    id: 'setting-import-text',
    attrs: {
      rows: 4,
      'aria-label': t('settings.import'),
      'aria-describedby': 'setting-import-error',
      placeholder: t('settings.import.hint'),
      spellcheck: 'false',
    },
  });
  const importError = h('p', {
    class: 'settings__error',
    id: 'setting-import-error',
    attrs: { hidden: true },
  });
  const importButton = h('button', {
    class: 'button button--quiet',
    text: t('settings.import.button'),
    attrs: { type: 'button' },
  });
  disposer.listen(importButton, 'click', () => {
    const result = importSave(importArea.value);
    if (!result.ok) {
      setText(importError, t(IMPORT_ERRORS[result.error]));
      setHidden(importError, false);
      importArea.focus();
      return;
    }
    setHidden(importError, true);
    const save = result.save;
    let imported = false;
    openModal({
      title: t('settings.import.confirm.title'),
      body: [
        t('settings.import.confirm.lifetime', { value: fmt(save.state.lifetimeEarned) }),
        t('settings.import.confirm.level', { level: formatCount(save.state.spores.level) }),
        // Desde la fase 8 la partida vive en un bioma: se dice cuál, para no reemplazar a ciegas.
        t('settings.import.confirm.biome', { name: biomeName(save.state.forest.biome) }),
        t('settings.import.confirm.date', { date: formatDate(save.savedAt, getLocale()) }),
        // Importar es indulgente con los socios: uno que no valida vuelve a empezar, y se dice
        // antes de confirmar (la red se importa entera).
        ...(result.partnersReset.length > 0 ? [t('settings.import.confirm.partnerReset')] : []),
        h('p', { class: 'modal__warning', text: t('settings.import.confirm.warning') }),
      ],
      actions: [
        { label: t('common.cancel'), kind: 'quiet' },
        {
          label: t('settings.import.confirm.yes'),
          kind: 'danger',
          onSelect: () => {
            imported = true;
            importArea.value = '';
            services.replaceGame(save.state);
            return undefined;
          },
        },
      ],
      // Importar reconstruye la interfaz con el modal abierto: el diálogo devuelve el foco al
      // botón Importar viejo, que ya no está en la página, y caería en <body>. 'close' llega
      // después de esa devolución, así que aquí se busca el campo nuevo por su id. Si la
      // partida importada aún no muestra Ajustes, se queda en el panel visible.
      onClose: () => {
        if (!imported) return;
        const field = document.getElementById('setting-import-text');
        field?.focus();
        if (!field || document.activeElement !== field) {
          document.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')?.focus();
        }
      },
    });
  });

  // Borrar
  const word = t('settings.wipe.word');
  const wipeInput = h('input', {
    class: 'input',
    id: 'setting-wipe-input',
    attrs: {
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-describedby': 'setting-wipe-hint',
    },
  });
  const wipeButton = h('button', {
    class: 'button button--danger',
    text: t('settings.wipe.button'),
    attrs: { type: 'button', disabled: true },
  });
  const matches = (): boolean => wipeInput.value.trim().toLocaleUpperCase(getLocale()) === word;
  disposer.listen(wipeInput, 'input', () => {
    setDisabled(wipeButton, !matches());
  });
  disposer.listen(wipeButton, 'click', () => {
    if (!matches()) return;
    wipeInput.value = '';
    setDisabled(wipeButton, true);
    services.wipeGame();
  });

  const root = h('div', { class: 'tab tab--settings' }, [
    h('div', { class: 'tab__toolbar' }, [h('h2', { class: 'tab__title', text: t('settings.title') })]),
    section(t('settings.language'), [localeGroup]),
    section(t('settings.notation'), [
      h(
        'div',
        {
          class: 'segmented segmented--stack',
          attrs: { role: 'group', 'aria-label': t('settings.notation') },
        },
        notationButtons.map((b) => b.button),
      ),
    ]),
    section(t('settings.sound'), [
      h('div', { class: 'settings__row' }, [
        sound,
        h('label', {
          class: 'settings__label',
          text: t('settings.volume'),
          attrs: { for: 'setting-volume' },
        }),
        volume,
      ]),
    ]),
    section(t('settings.reducedMotion'), [
      motion,
      h('p', { class: 'settings__hint', id: 'setting-motion-hint', text: t('settings.reducedMotion.hint') }),
    ]),
    installSection,
    section(t('settings.save.title'), [
      h('p', { class: 'settings__hint', text: t('settings.export.hint') }),
      h('div', { class: 'settings__row' }, [exportButton, copyButton]),
      exportArea,
      exportStatus,
      h('label', {
        class: 'settings__label',
        text: t('settings.import'),
        attrs: { for: 'setting-import-text' },
      }),
      importArea,
      importError,
      importButton,
    ]),
    section(t('settings.wipe'), [
      h('p', { class: 'settings__hint', id: 'setting-wipe-hint', text: t('settings.wipe.hint') }),
      h('label', {
        class: 'settings__label',
        text: t('settings.wipe.prompt', { word }),
        attrs: { for: 'setting-wipe-input' },
      }),
      h('div', { class: 'settings__row' }, [wipeInput, wipeButton]),
    ]),
  ]);

  function update(): void {
    const settings = store.state.settings;
    const active = getLocale();
    for (const { locale, button } of localeButtons)
      setAttr(button, 'aria-pressed', locale === active ? 'true' : 'false');
    for (const { notation, button } of notationButtons) {
      setAttr(button, 'aria-pressed', settings.notation === notation ? 'true' : 'false');
    }
    setAttr(sound, 'aria-pressed', settings.sound ? 'true' : 'false');
    setText(soundState, settings.sound ? t('settings.sound.on') : t('settings.sound.off'));
    const percent = String(Math.round(settings.volume * 100));
    if (document.activeElement !== volume && volume.value !== percent) volume.value = percent;
    setAttr(volume, 'aria-valuetext', formatPercent(settings.volume, getLocale(), 0));
    setDisabled(volume, !settings.sound);
    setAttr(motion, 'aria-pressed', settings.reducedMotion ? 'true' : 'false');
    updateInstall();
  }

  return {
    id: 'settings',
    root,
    update,
    destroy: () => {
      disposer.dispose();
    },
  };
}

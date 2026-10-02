/**
 * Vista del plasmodio en la pestaña Socios (docs/ROADMAP.md, fase 9). Entrada del trozo «vista»:
 * llega aparte al abrir Socios (ui/partner-loader.ts). Todo lo que dibuja la placa está también en
 * texto: los sitios son botones con su contenido y su acción en el nombre accesible, el objetivo
 * dice «cumple» o «falta» en cada condición, y nada se distingue solo por color (PROMPT.md §16).
 *
 * Refresco a 10 Hz con setText/setAttr solo si cambia; el lienzo, cada frame con la pestaña a la
 * vista. En móvil las herramientas van encima de la placa (pegajosas) y la celda se limita por la
 * altura visible: se pone un copo sin desplazar la página (crítica de la fase 9, hallazgo 5).
 */
import './plasmodium.css';
import type { GameEvent } from '../../../core/events.ts';
import * as num from '../../../core/num.ts';
import {
  D_ALIVE,
  DELTA_BASE,
  DORMANCY_CAP_SECONDS,
  FLOW_FACTORS,
  MOIST_SECONDS,
  PLASMODIUM_ACHIEVEMENT_IDS,
  PLASMODIUM_UPGRADES,
  PRUNING_MAPPED,
  PULSE_COOLDOWN,
  PULSE_STEPS,
  PULSE_TRAIL_SECONDS,
  SHORT_PATH_MAPPED,
  STABLE_SECONDS,
  type PlasmodiumUpgradeId,
} from '../../../data/plasmodium.ts';
import { PLATES } from '../../../data/plasmodium-plates.ts';
import { formatDuration, formatFactor, formatPercent } from '../../../i18n/format.ts';
import { fmt, formatCount, getLocale } from '../../../i18n/index.ts';
import { partnerPlural, partnerText } from '../../../i18n/partners/index.ts';
import { PLATE_VIEW_KEY, readPreference, writePreference } from '../../../systems/save.ts';
import { Disposer, h, setAttr, setHidden, setProgress, setText, toggleClass } from '../../../ui/dom.ts';
import { uiIcon } from '../../../ui/icons.ts';
import { announce } from '../../../ui/live.ts';
import { closeModal, isModalOpen, openModal } from '../../../ui/modal.ts';
import type { PartnerView, PartnerViewOptions } from '../../../ui/partner-view.ts';
import type { Store } from '../../../ui/store.ts';
import { noteGoalAnnounced } from '../../../ui/partner-notice-gate.ts';
import { attachTooltip } from '../../../ui/tooltip.ts';
import {
  buyPlasmodiumUpgrade,
  openPlate,
  placeItem,
  pulse,
  respread,
  setFlow,
  siteAction,
  type PlateTool,
} from '../actions.ts';
import { openPlateRate, trailRate } from '../advance.ts';
import { measure, type PlateSnapshot } from '../metrics.ts';
import { freeSites, suggestionScore } from '../preview.ts';
import {
  agarFactor,
  cultureRate,
  delta,
  effectiveFlow,
  foodLimit,
  frontier,
  isFlowAvailable,
  isPlateAvailable,
  isUpgradeAvailable,
  lampLimit,
  mappedCount,
  upgradeCost,
  type FlowLevel,
  type PlasmodiumState,
} from '../state.ts';
import { computeLayout, type PlateLayout } from './plate-layout.ts';
import { createPlateRender } from './plate-render.ts';
import { createPlateSites, TOOLS } from './plate-sites.ts';

const pt = (key: string, params?: Record<string, string | number>): string =>
  partnerText('plasmodium', key, params);

/** Segundos de modelo sin cambiar la red (y sin cumplir) para el aviso de atasco. */
const STALL_SECONDS = 300;
/** La Quimiotaxis se recalcula cada 120 s de modelo, además de con cada cambio. */
const SUGGEST_REFRESH_SECONDS = 120;
/** «Fundidos» se dice cuando lleva 10 s de modelo igual (el estado parpadea al fundirse). */
const FUSED_STEADY_SECONDS = 10;
/** Confirmación en el sitio de «Extender de nuevo»: se retira sola a los 8 s. */
const RESPREAD_CONFIRM_MS = 8000;
/** Como mucho un aviso de colocación por segundo. */
const PLACE_ANNOUNCE_GAP_MS = 1000;
/** «Ampliar» solo si la placa ampliada crece al menos un 20 %. */
const EXPAND_MIN_GROWTH = 1.2;
/** Ancho máximo del diálogo de la placa ampliada: el mismo que `.modal--plate` en plasmodium.css. */
const EXPANDED_DIALOG_MAX = 920;
/** Lo que el diálogo no deja a la placa a lo alto: título, relleno, herramientas y «Cerrar». */
const EXPANDED_CHROME_HEIGHT = 260;
/** Alto de la cabecera fija del móvil si ui/app.ts aún no publicó --hud-h (el contador solo). */
const HUD_FALLBACK = 64;
/** En la placa ampliada, como mucho un aviso de objetivo cada 10 s (el tope de ui/partner-notice-gate.ts). */
const GOAL_ANNOUNCE_GAP_MS = 10_000;

function decimal(value: number, digits = 2): string {
  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/*
 * El objetivo muestra la calidad truncada a 2 decimales y la longitud redondeada hacia arriba,
 * para que lo que se ve nunca contradiga a la decisión (que usa el valor sin redondear): con una
 * calidad de 0,6588 se leía «0,66 (objetivo: 0,66 o más) · falta» (BUG-JOURNAL #1; revisión de la
 * fase 9, F2). El 1e-9 absorbe el error de coma flotante: 0,58 × 100 da 57,999…, y un 0,58 que
 * cumple debe verse 0,58, no 0,57.
 */
function floorHundredths(value: number): number {
  return Math.floor(value * 100 + 1e-9) / 100;
}

function ceilHundredths(value: number): number {
  return Math.ceil(value * 100 - 1e-9) / 100;
}

/** Tamaño de 1rem en px (el relleno del diálogo va en rem y el jugador puede cambiar la letra). */
function remPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Espacio de la placa ampliada. El diálogo mide como mucho 920 px y deja 1rem de margen por lado
 * (plasmodium.css, `.modal--plate`); dentro, 1,5rem de relleno por lado y 1 px de borde
 * (styles.css, `.modal__frame` y `.modal`). Es la misma cuenta para disponer la placa ampliada y
 * para decidir si «Ampliar» sirve: con dos cuentas, la placa se salía del diálogo (UI-2).
 */
function expandedSize(): { width: number; height: number } {
  const rem = remPx();
  const dialog = Math.min(EXPANDED_DIALOG_MAX, window.innerWidth - 2 * rem);
  return {
    width: Math.max(0, dialog - 3 * rem - 2),
    height: Math.max(200, window.innerHeight - EXPANDED_CHROME_HEIGHT),
  };
}

/**
 * Alto real de la cabecera fija del móvil. ui/app.ts lo publica en --hud-h, en el estilo de :root
 * (el contador crece con «Esporularías ahora» y «Faltan…» hasta 104–107 px); la barra pegajosa usa
 * la misma variable. Se lee del estilo en línea, no del calculado: se consulta en cada refresco y
 * así no fuerza un recálculo de estilos.
 */
function hudHeight(): number {
  const value = Number.parseFloat(document.documentElement.style.getPropertyValue('--hud-h'));
  return Number.isFinite(value) && value > 0 ? value : HUD_FALLBACK;
}

function plateName(index: number): string {
  const def = PLATES[index];
  return def ? pt(`plate.${def.id}.name`) : '';
}

/** Un botón ⓘ con burbuja de ayuda accesible (el texto también va en su nombre). */
function infoButton(text: () => string, disposer: Disposer): HTMLButtonElement {
  const button = h('button', { class: 'info-button', attrs: { type: 'button', 'aria-label': text() } }, [
    uiIcon('info'),
  ]);
  attachTooltip(button, text, disposer, { tapToggles: true });
  return button;
}

export function createPartnerView(store: Store, options: PartnerViewOptions): PartnerView {
  const disposer = new Disposer();
  const state = (): PlasmodiumState | null => store.state.partners.plasmodium;
  let tool: PlateTool = 'food';
  let listChosen = readPreference(PLATE_VIEW_KEY) === 'list';
  let reducedMotion = options.reducedMotion;
  let layout: PlateLayout | null = null;
  /** Alto de la cabecera con el que se midió la placa en el móvil (availableSize). */
  let layoutHud = HUD_FALLBACK;
  let builtKey = '';
  let expanded = false;
  let expandToken = 0;
  let lastPlaceAnnounce = 0;
  let suggestion: number | null = null;
  let search: {
    key: string;
    sites: number[];
    index: number;
    best: number | null;
    bestScore: number;
    at: number;
  } | null = null;
  let stall = { signature: '', since: 0 };
  // value: lo que mide el modelo; display: lo que se dice, que solo cambia tras 10 s de modelo
  // estable (decisión 3). Con un solo campo, pasados los primeros 10 s cada cambio se veía al
  // instante y en la Fusión el texto alternaba cada pocos segundos (UI-10).
  let fused = { value: false, since: 0, shown: false, display: false };
  /** Último objetivo anunciado en la placa ampliada y cuándo; null si ninguno desde que se abrió. */
  let goalSaid: { met: boolean; at: number } | null = null;
  let goalTimer: number | undefined;
  let respreadArmed = false;
  let respreadTimer: number | undefined;
  let lastStep = -1;

  // ---------------------------------------------------------------------------------------
  // Cabecera

  const title = h('h3', {
    class: 'partner__title',
    id: 'partner-plasmodium-title',
    text: pt('name'),
    attrs: { tabindex: -1 },
  });
  const species = h('p', { class: 'plasmodium__species', text: pt('species') });
  const kind = h('p', { class: 'plasmodium__kind', text: pt('kind') });
  const plateLine = h('p', { class: 'plasmodium__plate' });
  const trailValue = h('span', { class: 'plasmodium__trail' });
  const trailRateText = h('span', { class: 'plasmodium__rate' });
  const trailLine = h('p', { class: 'plasmodium__trail-line' }, [
    trailValue,
    ' · ',
    trailRateText,
    ' ',
    infoButton(() => pt('trail.help'), disposer),
  ]);
  const moist = h('p', { class: 'plasmodium__moist', attrs: { hidden: true } });
  const mappingText = h('span');
  const mappingBar = h('span', { class: 'bar__fill' });
  const mappingLine = h('div', { class: 'plasmodium__mapping' }, [
    h('p', {}, [mappingText, ' ', infoButton(() => pt('mapping.help'), disposer)]),
    h('div', { class: 'bar', attrs: { 'aria-hidden': 'true' } }, [mappingBar]),
  ]);

  // ---------------------------------------------------------------------------------------
  // Herramientas, pulso y caudal (encima de la placa; pegajosas en móvil)

  const toolButtons = new Map<PlateTool, { button: HTMLButtonElement; count: HTMLElement }>();
  const toolGroup = h('div', {
    class: 'plasmodium__tools',
    attrs: { role: 'group', 'aria-label': pt('tools.label') },
  });
  for (const id of TOOLS) {
    const count = h('span', { class: 'plasmodium__tool-count' });
    const button = h(
      'button',
      { class: 'button button--quiet plasmodium__tool', attrs: { type: 'button', 'aria-pressed': 'false' } },
      [h('span', { text: pt(`tool.${id}`) }), count],
    );
    disposer.listen(button, 'click', () => {
      setTool(id);
    });
    toolButtons.set(id, { button, count });
    toolGroup.append(button);
  }
  const pulseDescId = 'plasmodium-pulse-desc';
  const pulseState = h('span', { class: 'plasmodium__pulse-state' });
  const pulseButton = h(
    'button',
    {
      class: 'button button--primary plasmodium__pulse',
      attrs: { type: 'button', 'aria-describedby': pulseDescId },
    },
    [h('span', { text: pt('pulse.button') }), pulseState],
  );
  const pulseDesc = h('p', {
    class: 'visually-hidden',
    id: pulseDescId,
    text: pt('pulse.desc', {
      steps: formatCount(PULSE_STEPS),
      time: formatDuration(PULSE_TRAIL_SECONDS, getLocale()),
      cooldown: formatDuration(PULSE_COOLDOWN, getLocale()),
    }),
  });
  disposer.listen(pulseButton, 'click', () => {
    const p = state();
    if (!p || p.pulseIn > 0) return;
    store.dispatch(pulse, undefined);
  });
  const toolbar = h('div', { class: 'plasmodium__toolbar' }, [toolGroup, pulseButton, pulseDesc]);

  const flowButtons = new Map<FlowLevel, HTMLButtonElement>();
  const flowGroup = h('div', {
    class: 'plasmodium__flow',
    attrs: { role: 'group', 'aria-label': pt('flow.label'), hidden: true },
  });
  const flowNames = ['flow.low', 'flow.medium', 'flow.high'] as const;
  FLOW_FACTORS.forEach((_, level) => {
    const button = h('button', {
      class: 'button button--quiet',
      text: pt(flowNames[level] ?? 'flow.medium'),
      attrs: { type: 'button', 'aria-pressed': 'false' },
    });
    disposer.listen(button, 'click', () => {
      store.dispatch(setFlow, { flow: level as FlowLevel });
    });
    flowButtons.set(level as FlowLevel, button);
    flowGroup.append(button);
  });
  const flowWrap = h('div', { class: 'plasmodium__flow-wrap', attrs: { hidden: true } }, [
    h('p', { class: 'plasmodium__flow-label', text: pt('flow.label') }),
    flowGroup,
    h('p', { class: 'plasmodium__note', text: pt('flow.desc') }),
  ]);

  // ---------------------------------------------------------------------------------------
  // Placa: lienzo + sitios, o lista

  const canvas = h('canvas', { class: 'plate__canvas', attrs: { 'aria-hidden': 'true' } });
  const render = createPlateRender(canvas);
  render.setReducedMotion(reducedMotion);
  const helpId = 'plasmodium-plate-help';
  const plateHelp = h('p', { class: 'visually-hidden', id: helpId, text: pt('plate.help') });
  const sites = createPlateSites({
    activate: (site) => {
      activateSite(site);
    },
    setTool: (next) => {
      setTool(next);
    },
    hover: (site) => {
      render.setHover(site, site === null ? null : tool);
    },
  });
  const plateFrame = h('div', { class: 'plate__frame' }, [canvas, sites.layer]);
  const narrowNote = h('p', { class: 'plasmodium__note', text: pt('plate.narrow'), attrs: { hidden: true } });
  /** Región de anuncios propia: dentro de la placa ampliada (un <dialog>) la global calla. */
  const localLive = h('div', { class: 'visually-hidden', attrs: { 'aria-live': 'polite', role: 'status' } });
  const plateBlock = h('div', { class: 'plate' }, [
    toolbar,
    plateFrame,
    sites.list,
    narrowNote,
    plateHelp,
    localLive,
  ]);
  const plateHome = h('div', { class: 'plate__home' }, [plateBlock]);

  const expandButton = h('button', {
    class: 'button button--quiet',
    text: pt('plate.expand'),
    attrs: { type: 'button', hidden: true },
  });
  const listButton = h('button', { class: 'button button--quiet', attrs: { type: 'button' } });
  const respreadButton = h('button', {
    class: 'button button--quiet',
    text: pt('plate.respread'),
    attrs: { type: 'button' },
  });
  const respreadCancel = h('button', {
    class: 'button button--quiet',
    text: pt('plate.respread.cancel'),
    attrs: { type: 'button', hidden: true },
  });
  const respreadDescId = 'plasmodium-respread-desc';
  setAttr(respreadButton, 'aria-describedby', respreadDescId);
  const plateActions = h('div', { class: 'plasmodium__actions' }, [
    expandButton,
    listButton,
    respreadButton,
    respreadCancel,
    h('p', { class: 'visually-hidden', id: respreadDescId, text: pt('plate.respread.desc') }),
  ]);

  const summary = h('p', { class: 'plasmodium__summary' });
  const hintLine = h('p', { class: 'plasmodium__hint', attrs: { hidden: true } });

  // ---------------------------------------------------------------------------------------
  // Objetivo

  const goalText = h('p', { class: 'plasmodium__goal' });
  const conditions = h('ul', { class: 'plasmodium__conditions' });
  const info = h('ul', { class: 'plasmodium__info' });
  const holdText = h('span');
  const holdBar = h('span', { class: 'bar__fill' });
  const hold = h('div', { class: 'plasmodium__hold' }, [
    h('p', {}, [holdText, ' ', infoButton(() => pt('goal.hold.help'), disposer)]),
    h('div', { class: 'bar', attrs: { 'aria-hidden': 'true' } }, [holdBar]),
  ]);
  const lingerText = h('p', { attrs: { hidden: true } });
  const prepareButton = h('button', {
    class: 'button button--primary',
    attrs: { type: 'button', hidden: true },
  });
  const goalSection = h(
    'section',
    { class: 'plasmodium__section', attrs: { 'aria-labelledby': 'plasmodium-goal-title' } },
    [
      h('h4', { id: 'plasmodium-goal-title', text: pt('goal.title') }),
      goalText,
      conditions,
      info,
      hold,
      lingerText,
      prepareButton,
    ],
  );

  // ---------------------------------------------------------------------------------------
  // Mejoras, «Con tu red», Atlas y logros

  const upgradesList = h('ul', { class: 'plasmodium__upgrades' });
  const upgradesSection = h(
    'section',
    { class: 'plasmodium__section', attrs: { 'aria-labelledby': 'plasmodium-upg-title' } },
    [
      h('h4', { id: 'plasmodium-upg-title', text: pt('pupg.title') }),
      h('p', { class: 'plasmodium__note', text: pt('pupg.intro') }),
      upgradesList,
    ],
  );
  const linksList = h('ul', { class: 'plasmodium__links' });
  const linksSection = h(
    'section',
    { class: 'plasmodium__section', attrs: { 'aria-labelledby': 'plasmodium-link-title' } },
    [
      h('h4', { id: 'plasmodium-link-title', text: pt('link.title') }),
      h('p', { class: 'plasmodium__note', text: pt('link.intro') }),
      linksList,
    ],
  );
  const atlasList = h('ol', { class: 'plasmodium__atlas' });
  const atlasDone = h('p', { class: 'plasmodium__note', text: pt('mapping.done'), attrs: { hidden: true } });
  const atlasSection = h(
    'section',
    { class: 'plasmodium__section', attrs: { 'aria-labelledby': 'plasmodium-atlas-title' } },
    [
      h('h4', { id: 'plasmodium-atlas-title', text: pt('atlas.title') }),
      h('p', { class: 'plasmodium__note', text: pt('atlas.intro') }),
      atlasList,
      atlasDone,
      h('p', { class: 'plasmodium__note', text: pt('plate.replay.desc') }),
    ],
  );
  const achievementsText = h('span');
  const achievementsButton = h('button', {
    class: 'button button--quiet',
    text: pt('achievements.view'),
    attrs: { type: 'button' },
  });
  disposer.listen(achievementsButton, 'click', () => {
    options.toAchievements();
  });
  const achievementsLine = h('p', { class: 'plasmodium__achievements' }, [
    achievementsText,
    ' ',
    achievementsButton,
  ]);

  const root = h('div', { class: 'plasmodium' }, [
    title,
    species,
    kind,
    plateLine,
    trailLine,
    moist,
    mappingLine,
    plateHome,
    flowWrap,
    plateActions,
    summary,
    hintLine,
    goalSection,
    upgradesSection,
    linksSection,
    atlasSection,
    achievementsLine,
  ]);

  // ---------------------------------------------------------------------------------------
  // Acciones

  function setTool(next: PlateTool): void {
    tool = next;
    for (const [id, { button }] of toolButtons)
      setAttr(button, 'aria-pressed', id === tool ? 'true' : 'false');
    const p = state();
    if (p) sites.update(p, tool, suggestion);
  }

  function say(message: string): void {
    if (!message) return;
    if (expanded) setText(localLive, message);
    else announce(message);
  }

  /**
   * Con la placa ampliada (un <dialog>) la región global es inerte y main.ts calla hasta que se
   * cierre (ui/partner-notice-gate.ts), así que los cambios de objetivo se dicen en la región propia
   * (revisión de la fase 9, F3). Se dice el estado vigente y no el del evento: si el objetivo cambia
   * dos veces dentro del tope, el aviso aplazado lee el actual y calla si volvió al ya dicho.
   */
  function sayGoal(): void {
    goalTimer = undefined;
    const p = state();
    if (!p || !expanded || goalSaid?.met === p.goalMet) return;
    const now = performance.now();
    const wait = (goalSaid?.at ?? Number.NEGATIVE_INFINITY) + GOAL_ANNOUNCE_GAP_MS - now;
    if (wait > 0) {
      goalTimer = window.setTimeout(sayGoal, wait);
      return;
    }
    goalSaid = { met: p.goalMet, at: now };
    say(pt(p.goalMet ? 'goal.met' : 'goal.lost'));
    // Al cerrar el diálogo, main.ts no lo repetirá.
    noteGoalAnnounced(p.goalMet);
  }

  function cancelGoalTimer(): void {
    if (goalTimer !== undefined) window.clearTimeout(goalTimer);
    goalTimer = undefined;
  }
  disposer.add(cancelGoalTimer);

  function activateSite(site: number): void {
    const p = state();
    if (!p) return;
    const action = siteAction(p, site, tool);
    store.dispatch(placeItem, { site, tool });
    const now = performance.now();
    if (now - lastPlaceAnnounce < PLACE_ANNOUNCE_GAP_MS) return;
    lastPlaceAnnounce = now;
    const record = p.plates[p.plate];
    const n = formatCount(site + 1);
    if (action === 'placeFood' || action === 'toFood') {
      say(
        partnerPlural('plasmodium', 'site.placed.food', foodLimit(p, p.plate) - (record?.foods.length ?? 0), {
          n,
        }),
      );
    } else if (action === 'placeLamp' || action === 'toLamp') {
      say(
        partnerPlural('plasmodium', 'site.placed.lamp', lampLimit(p, p.plate) - (record?.lamps.length ?? 0), {
          n,
        }),
      );
    } else if (action === 'remove') say(pt('site.removed', { n }));
  }

  function disarmRespread(): void {
    // «Cancelar» se oculta: si tenía el foco (la confirmación se retiró sola a los 8 s), pasa antes
    // a «Extender de nuevo», o caería en <body> (BUG-JOURNAL #5 y #8; UI-4).
    if (respreadCancel.contains(document.activeElement)) respreadButton.focus();
    respreadArmed = false;
    if (respreadTimer !== undefined) window.clearTimeout(respreadTimer);
    respreadTimer = undefined;
    setText(respreadButton, pt('plate.respread'));
    setHidden(respreadCancel, true);
  }

  disposer.listen(respreadButton, 'click', () => {
    if (!respreadArmed) {
      respreadArmed = true;
      setText(respreadButton, pt('plate.respread.confirm'));
      setHidden(respreadCancel, false);
      respreadTimer = window.setTimeout(disarmRespread, RESPREAD_CONFIRM_MS);
      return;
    }
    disarmRespread();
    store.dispatch(respread, undefined);
    say(pt('notice.respread'));
  });
  disposer.listen(respreadButton, 'blur', (e) => {
    // Perder el foco cancela, salvo que vaya a «Cancelar» (que también lo hace).
    if (e.relatedTarget !== respreadCancel && respreadArmed) disarmRespread();
  });
  disposer.listen(respreadCancel, 'click', () => {
    disarmRespread();
    respreadButton.focus();
  });
  disposer.add(() => {
    if (respreadTimer !== undefined) window.clearTimeout(respreadTimer);
  });

  disposer.listen(listButton, 'click', () => {
    listChosen = !listChosen;
    writePreference(PLATE_VIEW_KEY, listChosen ? 'list' : 'map');
    builtKey = '';
    relayout();
    listButton.focus();
  });

  disposer.listen(prepareButton, 'click', () => {
    const p = state();
    const next = p ? p.plate + 1 : -1;
    if (p && isPlateAvailable(p, next)) {
      store.dispatch(openPlate, { plate: next });
      title.focus();
    }
  });

  // ---------------------------------------------------------------------------------------
  // Disposición y placa ampliada

  function availableSize(): { width: number; height: number } {
    if (expanded) return expandedSize();
    const width = plateHome.clientWidth;
    let height: number;
    if (window.innerWidth < 768) {
      // Cabecera fija arriba (la medida, no 64: la barra pegajosa se pega bajo ella; UI-5), barra
      // de pestañas abajo y las herramientas encima de la placa.
      layoutHud = hudHeight();
      height = window.innerHeight - layoutHud - 72 - toolbar.offsetHeight - 24;
    } else {
      const panel = root.closest<HTMLElement>('.tabs__panels');
      const visible = panel && window.innerWidth >= 1024 ? panel.clientHeight : window.innerHeight;
      height = visible - toolbar.offsetHeight - 120;
    }
    return { width, height: Math.max(200, height) };
  }

  function relayout(): void {
    const p = state();
    if (!p) return;
    const { width, height } = availableSize();
    if (width <= 0) return;
    const next = computeLayout(p.plate, width, height, layout);
    const list = next.list || listChosen;
    const key = `${p.plate}|${next.orientation}|${next.list}|${next.cell.toFixed(1)}|${list}|${expanded}`;
    if (key === builtKey) return;
    builtKey = key;
    layout = next;
    plateFrame.style.width = `${next.width}px`;
    plateFrame.style.height = `${next.height}px`;
    toggleClass(plateFrame, 'is-image', list);
    render.setLayout(next);
    render.resize();
    // La lista se muestra antes de rehacer los sitios y se oculta después: si el foco estaba en un
    // sitio, build() lo pasa a la primera fila, y un <ol> aún oculto no lo recibe (UI-4).
    if (list) setHidden(sites.list, false);
    sites.build({ ...next, list }, helpId);
    if (!list) setHidden(sites.list, true);
    setHidden(narrowNote, !next.list);
    setText(listButton, pt(list ? 'plate.map' : 'plate.list'));
    setHidden(listButton, next.list);
    // «Ampliar» se decide con la placa del panel. Ampliada, la cuenta se haría consigo misma y
    // ocultaría el botón al que vuelve el foco al cerrar (UI-1). La regla del 20 % solo compara
    // dos placas interactivas: si en el panel va en lista y ampliada no, ampliar sirve (UI-6).
    if (!expanded) {
      const size = expandedSize();
      const big = computeLayout(p.plate, size.width, size.height);
      setHidden(expandButton, big.list || (!next.list && big.cell < next.cell * EXPAND_MIN_GROWTH));
    }
    sites.update(p, tool, suggestion);
  }

  const observer = new ResizeObserver(() => {
    relayout();
  });
  observer.observe(plateHome);
  disposer.add(() => {
    observer.disconnect();
  });

  disposer.listen(expandButton, 'click', () => {
    const p = state();
    if (!p) return;
    expanded = true;
    expandToken += 1;
    const token = expandToken;
    builtKey = '';
    // Lo que el jugador ya oyó antes de ampliar no se repite dentro.
    goalSaid = { met: p.goalMet, at: Number.NEGATIVE_INFINITY };
    openModal({
      title: pt('plate.expanded.title', { name: plateName(p.plate) }),
      body: [plateBlock],
      actions: [{ label: pt('plate.close'), kind: 'quiet' }],
      variant: 'modal--plate',
      onClose: () => {
        if (token !== expandToken) return;
        expanded = false;
        cancelGoalTimer();
        goalSaid = null;
        setText(localLive, '');
        plateHome.append(plateBlock);
        builtKey = '';
        relayout();
        requestAnimationFrame(() => {
          // Si en el panel «Ampliar» ya no sirve (la ventana cambió mientras tanto), el foco va al
          // título: un botón oculto lo dejaría en <body> (UI-1).
          if (expandButton.hidden) title.focus();
          else expandButton.focus();
        });
      },
    });
    requestAnimationFrame(() => {
      relayout();
    });
  });

  // ---------------------------------------------------------------------------------------
  // Quimiotaxis: un sitio por frame (≤ 28 frames), sin bloquear la interfaz

  function searchKey(p: PlasmodiumState): string {
    const record = p.plates[p.plate];
    return `${p.plate}|${record?.foods.join(',') ?? ''}|${record?.lamps.join(',') ?? ''}|${effectiveFlow(p, p.plate)}|${p.upgrades.oats}|${p.upgrades.humidity}|${p.upgrades.memory}`;
  }

  function stepSuggestion(p: PlasmodiumState): void {
    if (p.upgrades.chemotaxis === 0) return;
    const record = p.plates[p.plate];
    const full = (record?.foods.length ?? 0) >= foodLimit(p, p.plate);
    const key = searchKey(p);
    const stale = search !== null && p.stats.modelSeconds - search.at >= SUGGEST_REFRESH_SECONDS;
    if (!search || search.key !== key || stale) {
      search = full
        ? {
            key,
            sites: [],
            index: 0,
            best: null,
            bestScore: Number.NEGATIVE_INFINITY,
            at: p.stats.modelSeconds,
          }
        : {
            key,
            sites: freeSites(p),
            index: 0,
            best: null,
            bestScore: Number.NEGATIVE_INFINITY,
            at: p.stats.modelSeconds,
          };
      if (full && suggestion !== null) {
        suggestion = null;
        render.setSuggestion(null);
        sites.update(p, tool, null);
      }
    }
    if (search.index >= search.sites.length) return;
    const site = search.sites[search.index] ?? 0;
    const score = suggestionScore(p, site);
    if (score > search.bestScore) {
      search.bestScore = score;
      search.best = site;
    }
    search.index += 1;
    if (search.index === search.sites.length && suggestion !== search.best) {
      suggestion = search.best;
      render.setSuggestion(suggestion);
      sites.update(p, tool, suggestion);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Secciones que se rehacen al cambiar de estado (pocas veces)

  let upgradesKey = '';
  const upgradeRows = new Map<
    PlasmodiumUpgradeId,
    {
      level: HTMLElement;
      cost: HTMLElement;
      wait: HTMLElement;
      effect: HTMLElement;
      button: HTMLButtonElement;
    }
  >();

  function upgradeEffect(p: PlasmodiumState, id: PlasmodiumUpgradeId): string {
    const level = p.upgrades[id];
    if (level === 0) return '';
    const locale = getLocale();
    switch (id) {
      case 'agar':
        return pt('pupg.agar.effect', { factor: formatFactor(agarFactor(p), locale) });
      case 'oats':
        return partnerPlural('plasmodium', 'pupg.oats.effect', level);
      case 'lamps':
        return partnerPlural('plasmodium', 'pupg.lamps.effect', level);
      case 'humidity':
        return pt('pupg.humidity.effect', { factor: formatFactor(delta(p) / DELTA_BASE, locale) });
      case 'dormancy':
        return pt('pupg.dormancy.effect', {
          percent: formatPercent(1, locale, 0),
          time: formatDuration(DORMANCY_CAP_SECONDS, locale),
        });
      case 'chemotaxis':
        return pt('pupg.chemotaxis.effect');
      case 'memory':
        return pt('pupg.memory.effect');
    }
  }

  function rebuildUpgrades(p: PlasmodiumState): void {
    const key = PLASMODIUM_UPGRADES.filter((u) => isUpgradeAvailable(p, u.id))
      .map((u) => u.id)
      .join(',');
    if (key === upgradesKey) return;
    const keepFocus = upgradesList.contains(document.activeElement);
    upgradesKey = key;
    upgradeRows.clear();
    const rows: HTMLElement[] = [];
    for (const def of PLASMODIUM_UPGRADES) {
      if (!isUpgradeAvailable(p, def.id)) continue;
      const level = h('span', { class: 'plasmodium__upg-level' });
      const cost = h('span', { class: 'plasmodium__upg-cost' });
      const wait = h('span', { class: 'plasmodium__upg-wait' });
      const effect = h('p', { class: 'plasmodium__upg-effect' });
      const button = h('button', {
        class: 'button button--primary',
        text: pt('pupg.buy', { name: pt(`pupg.${def.id}.name`) }),
        attrs: { type: 'button' },
      });
      disposer.listen(button, 'click', () => {
        if (button.getAttribute('aria-disabled') === 'true') return;
        store.dispatch(buyPlasmodiumUpgrade, { id: def.id });
        const next = state();
        if (next) {
          say(
            pt('notice.upgrade', {
              name: pt(`pupg.${def.id}.name`),
              level: formatCount(next.upgrades[def.id]),
            }),
          );
        }
      });
      upgradeRows.set(def.id, { level, cost, wait, effect, button });
      rows.push(
        h('li', { class: 'plasmodium__upg' }, [
          h('p', { class: 'plasmodium__upg-name', text: pt(`pupg.${def.id}.name`) }),
          h('p', { class: 'plasmodium__note', text: pt(`pupg.${def.id}.desc`) }),
          effect,
          h('p', { class: 'plasmodium__upg-meta' }, [level, ' · ', cost, ' ', wait]),
          button,
        ]),
      );
    }
    upgradesList.replaceChildren(...rows);
    if (keepFocus) upgradesList.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function updateUpgrades(p: PlasmodiumState, income: number): void {
    rebuildUpgrades(p);
    const locale = getLocale();
    for (const def of PLASMODIUM_UPGRADES) {
      const row = upgradeRows.get(def.id);
      if (!row) continue;
      const cost = upgradeCost(p, def.id);
      setText(
        row.level,
        pt('pupg.level', { level: formatCount(p.upgrades[def.id]), max: formatCount(def.max) }),
      );
      setText(row.effect, upgradeEffect(p, def.id));
      setHidden(row.effect, p.upgrades[def.id] === 0);
      if (cost === null) {
        setText(row.cost, pt('pupg.maxed'));
        setText(row.wait, '');
        setText(row.button, pt('pupg.maxed'));
        setAttr(row.button, 'aria-disabled', 'true');
        continue;
      }
      setText(row.button, pt('pupg.buy', { name: pt(`pupg.${def.id}.name`) }));
      setText(row.cost, pt('pupg.cost', { value: fmt(cost) }));
      const missing = num.toNumber(num.sub(cost, p.trail));
      setText(
        row.wait,
        missing > 0 && income > 0
          ? pt('pupg.wait', { time: formatDuration(Math.ceil(missing / income), locale) })
          : '',
      );
      // Sin Rastro el botón sigue enfocable y dice por qué no: aria-disabled, no disabled.
      setAttr(row.button, 'aria-disabled', num.lt(p.trail, cost) ? 'true' : null);
    }
  }

  let linksKey = '';
  function updateLinks(p: PlasmodiumState): void {
    const mapped = mappedCount(p);
    const key = `${Math.min(mapped, SHORT_PATH_MAPPED)}|${getLocale()}`;
    if (key === linksKey) return;
    linksKey = key;
    const entries: { name: string; desc: string; need: number }[] = [
      { name: 'link.pruning.name', desc: pt('link.pruning.desc'), need: PRUNING_MAPPED },
      { name: 'link.shortPath.name', desc: pt('link.shortPath.desc'), need: SHORT_PATH_MAPPED },
      {
        name: 'link.rain.name',
        desc: pt('link.rain.desc', { time: formatDuration(MOIST_SECONDS, getLocale()) }),
        need: 0,
      },
    ];
    linksList.replaceChildren(
      ...entries.map((entry) => {
        const active = mapped >= entry.need;
        return h('li', { class: `plasmodium__link${active ? ' is-active' : ''}` }, [
          h('p', { class: 'plasmodium__link-name' }, [
            h('span', { text: pt(entry.name) }),
            ' · ',
            h('span', {
              text: active ? pt('link.active') : pt('link.locked', { name: plateName(entry.need - 1) }),
            }),
          ]),
          h('p', { class: 'plasmodium__note', text: entry.desc }),
        ]);
      }),
    );
  }

  let atlasKey = '';
  function updateAtlas(p: PlasmodiumState): void {
    // El Agar entra en la clave: «En cultivo» lo multiplica y se compra muchas veces por placa (UI-3).
    const key = `${p.plate}|${mappedCount(p)}|${p.plates.map((r) => (r.map ? r.map.score.toFixed(4) : '-')).join(',')}|${p.upgrades.agar}|${getLocale()}`;
    if (key === atlasKey) return;
    const keepFocus = atlasList.contains(document.activeElement);
    atlasKey = key;
    const locale = getLocale();
    const front = frontier(p);
    const rows = PLATES.map((def, index) => {
      const record = p.plates[index];
      const map = record?.map ?? null;
      const status =
        index === p.plate
          ? 'plate.status.current'
          : map
            ? 'plate.status.done'
            : isPlateAvailable(p, index)
              ? 'plate.status.available'
              : 'plate.status.locked';
      const children: HTMLElement[] = [
        h('p', {
          class: 'plasmodium__atlas-name',
          text: pt('plate.entry', { name: plateName(index), status: pt(status) }),
        }),
      ];
      if (map) {
        children.push(
          h('p', {
            class: 'plasmodium__note',
            text: pt('plate.best', {
              alive: formatCount(map.alive),
              cost: decimal(map.cost),
              tolerance: formatPercent(map.tolerance, locale, 0),
            }),
          }),
        );
        if (index !== p.plate) {
          const culture = def.trailRate * map.score * agarFactor(p);
          children.push(
            h('p', { class: 'plasmodium__note', text: pt('plate.culture', { value: fmt(culture) }) }),
          );
        }
      }
      const buttons: HTMLButtonElement[] = [];
      if (index !== p.plate && isPlateAvailable(p, index)) {
        const label = map
          ? pt('plate.replay.label', { name: plateName(index) })
          : pt('plate.prepare', { name: plateName(index) });
        const button = h('button', {
          class: `button ${map ? 'button--quiet' : 'button--primary'}`,
          text: map ? pt('plate.replay') : pt('plate.prepare', { name: plateName(index) }),
          attrs: { type: 'button', 'aria-label': label },
        });
        disposer.listen(button, 'click', () => {
          store.dispatch(openPlate, { plate: index });
          title.focus();
        });
        buttons.push(button);
      }
      if (map) {
        const button = h('button', {
          class: 'button button--quiet',
          text: pt('plate.reread'),
          attrs: { type: 'button', 'aria-label': pt('plate.reread.label', { name: plateName(index) }) },
        });
        disposer.listen(button, 'click', () => {
          options.rereadPlate(index);
        });
        buttons.push(button);
      }
      if (buttons.length > 0) children.push(h('p', { class: 'plasmodium__atlas-actions' }, buttons));
      return h(
        'li',
        {
          class: `plasmodium__atlas-entry${index === p.plate ? ' is-current' : ''}`,
          attrs: index === p.plate ? { 'aria-current': 'true' } : {},
        },
        children,
      );
    });
    atlasList.replaceChildren(...rows);
    setHidden(atlasDone, front !== null);
    // Rehacer el Atlas no deja el foco en <body> (BUG-JOURNAL #5): vuelve al título del socio.
    if (keepFocus) title.focus();
  }

  // ---------------------------------------------------------------------------------------
  // Refresco

  function conditionLine(text: string, ok: boolean): HTMLElement {
    return h('li', {
      class: `plasmodium__condition${ok ? ' is-ok' : ''}`,
      text: pt('goal.line', { text, state: pt(ok ? 'goal.ok' : 'goal.missing') }),
    });
  }

  let goalKey = '';
  function updateGoal(p: PlasmodiumState, snap: PlateSnapshot): void {
    const def = PLATES[p.plate];
    if (!def) return;
    const locale = getLocale();
    const hold = formatDuration(STABLE_SECONDS, locale);
    setText(goalText, pt(`plate.${def.id}.goal`, { foods: formatCount(def.foods), hold }));
    const lines: HTMLElement[] = [];
    if (def.objective === 'quality') {
      lines.push(
        conditionLine(
          pt('goal.placed', { placed: formatCount(snap.playerFoods), target: formatCount(def.foods) }),
          snap.playerFoods >= def.foods,
        ),
      );
    }
    lines.push(
      conditionLine(
        pt('goal.joined', { joined: formatCount(snap.joined), total: formatCount(snap.foods) }),
        snap.connected,
      ),
    );
    if (def.objective === 'quality') {
      lines.push(
        conditionLine(
          pt('goal.quality', {
            value: decimal(floorHundredths(snap.quality)),
            target: decimal(def.threshold),
          }),
          snap.quality >= def.threshold,
        ),
      );
    } else {
      const shortest = Number.isFinite(snap.cost) ? decimal(ceilHundredths(snap.cost)) : '—';
      // El umbral con 2 decimales, como el valor: «1,10 … falta» junto a «objetivo: 1,1» no se lee.
      lines.push(
        conditionLine(
          pt('goal.shortest', { value: shortest, target: decimal(def.threshold) }),
          snap.cost <= def.threshold,
        ),
      );
    }
    const infoLines: string[] = [];
    // Con menos de dos copos unidos no hay coste ni tolerancia que contar (ni un «∞» en pantalla).
    // En el Laberinto el coste es la misma cifra que la longitud: se redondea igual.
    if (snap.joined >= 2 && Number.isFinite(snap.cost)) {
      infoLines.push(
        pt('goal.cost', { value: decimal(ceilHundredths(snap.cost)) }),
        pt('goal.tolerance', { value: formatPercent(snap.tolerance, locale, 0) }),
      );
    }
    if (def.substance === 'quinine')
      infoLines.push(pt('goal.habituation.quinine', { value: formatPercent(snap.habituation, locale, 0) }));
    if (def.substance === 'salt') {
      infoLines.push(pt('goal.habituation.salt', { value: formatPercent(snap.habituation, locale, 0) }));
      if (fused.shown) infoLines.push(pt(fused.display ? 'goal.fused' : 'goal.notFused'));
    }
    const key = [...lines.map((l) => l.textContent), ...infoLines].join('|');
    if (key !== goalKey) {
      goalKey = key;
      conditions.replaceChildren(...lines);
      info.replaceChildren(...infoLines.map((text) => h('li', { text })));
    }
    setText(
      holdText,
      pt('goal.hold', { done: formatDuration(Math.floor(p.stableFor), locale), total: hold }),
    );
    setProgress(holdBar, p.stableFor / STABLE_SECONDS);
    const next = p.plate + 1 < PLATES.length ? p.plate + 1 : null;
    const lingering = p.lingerFor > 0 && next !== null;
    // La placa se abrió sola con el foco en «Preparar la placa»: pasa al título antes de ocultar
    // el botón, o caería en <body> (BUG-JOURNAL #5 y #8; UI-4).
    if (!lingering && prepareButton.contains(document.activeElement)) title.focus();
    setHidden(lingerText, !lingering);
    setHidden(prepareButton, !lingering);
    if (next !== null && p.lingerFor > 0) {
      setText(
        lingerText,
        pt('linger', { name: plateName(next), time: formatDuration(Math.ceil(p.lingerFor), locale) }),
      );
      setText(prepareButton, pt('plate.prepare', { name: plateName(next) }));
    }
  }

  function update(): void {
    const p = state();
    if (!p) return;
    const locale = getLocale();
    const plateChanged = layout === null || layout.plate !== p.plate;
    if (plateChanged) {
      const focusInside = sites.containsFocus();
      builtKey = '';
      relayout();
      suggestion = null;
      search = null;
      render.setSuggestion(null);
      stall = { signature: '', since: p.stats.modelSeconds };
      fused = { value: false, since: p.stats.modelSeconds, shown: false, display: false };
      // La placa cambió bajo el teclado (p. ej. se abrió sola): el foco no cae en <body>.
      if (focusInside) sites.focusFirst();
    } else if (!expanded && window.innerWidth < 768 && hudHeight() !== layoutHud) {
      // La cabecera del móvil cambió de alto sin cambiar el ancho del panel (el observador no
      // salta): la celda se vuelve a medir bajo ella.
      relayout();
    }
    const snap = measure(p);
    render.sync(p, snap);
    sites.update(p, tool, suggestion);

    setText(
      plateLine,
      pt('plateOf', {
        n: formatCount(p.plate + 1),
        total: formatCount(PLATES.length),
        name: plateName(p.plate),
      }),
    );
    const income = num.toNumber(trailRate(p, snap));
    setText(trailValue, pt('trail', { value: fmt(p.trail) }));
    setText(trailRateText, pt('trailRate', { value: fmt(income) }));
    setHidden(moist, p.moistFor <= 0);
    if (p.moistFor > 0) setText(moist, pt('moist', { time: formatDuration(Math.ceil(p.moistFor), locale) }));
    const front = frontier(p);
    setHidden(mappingLine, front === null);
    if (front !== null) {
      const goal = PLATES[front]?.trailGoal ?? 1;
      setText(
        mappingText,
        pt('mapping', { name: plateName(front), done: fmt(Math.min(p.mapping, goal)), total: fmt(goal) }),
      );
      setProgress(mappingBar, Math.min(1, p.mapping / goal));
    }

    // Herramientas e inventario.
    const record = p.plates[p.plate];
    const foodsLeft = foodLimit(p, p.plate) - (record?.foods.length ?? 0);
    const lampsLeft = lampLimit(p, p.plate) - (record?.lamps.length ?? 0);
    const counts: Record<PlateTool, string> = {
      food: pt('tool.count', { left: formatCount(foodsLeft), total: formatCount(foodLimit(p, p.plate)) }),
      lamp: pt('tool.count', { left: formatCount(lampsLeft), total: formatCount(lampLimit(p, p.plate)) }),
      remove: '',
    };
    for (const [id, { button, count }] of toolButtons) {
      setText(count, counts[id]);
      if (id === 'food')
        setAttr(
          button,
          'aria-label',
          pt('tool.food.label', { left: formatCount(foodsLeft), total: formatCount(foodLimit(p, p.plate)) }),
        );
      if (id === 'lamp')
        setAttr(
          button,
          'aria-label',
          pt('tool.lamp.label', { left: formatCount(lampsLeft), total: formatCount(lampLimit(p, p.plate)) }),
        );
      setAttr(button, 'aria-pressed', id === tool ? 'true' : 'false');
    }
    setText(
      pulseState,
      p.pulseIn > 0
        ? pt('pulse.wait', { time: formatDuration(Math.ceil(p.pulseIn), locale) })
        : pt('pulse.ready'),
    );
    setAttr(pulseButton, 'aria-disabled', p.pulseIn > 0 ? 'true' : null);

    // Caudal: solo en placas cartografiadas (la frontera corre con el Medio).
    const flowShown = isFlowAvailable(p) && (record?.map ?? null) !== null;
    setHidden(flowWrap, !flowShown);
    setHidden(flowGroup, !flowShown);
    const flow = effectiveFlow(p, p.plate);
    for (const [level, button] of flowButtons)
      setAttr(button, 'aria-pressed', level === flow ? 'true' : 'false');

    // Resumen de la red, atasco y Quimiotaxis.
    if (snap.foods < 2) setText(summary, pt('net.exploring'));
    else {
      const drying = snap.drying > 0 ? ` ${partnerPlural('plasmodium', 'net.drying', snap.drying)}` : '';
      setText(
        summary,
        `${pt('net.summary', { joined: formatCount(snap.joined), total: formatCount(snap.foods), alive: formatCount(snap.alive) })}${drying}`,
      );
    }
    if (p.step !== lastStep) {
      lastStep = p.step;
      let signature = '';
      for (let e = 0; e < p.conductivity.length; e += 1)
        if ((p.conductivity[e] ?? 0) > D_ALIVE) signature += `${e},`;
      if (signature !== stall.signature) stall = { signature, since: p.stats.modelSeconds };
      if (snap.fused !== fused.value) {
        fused.value = snap.fused;
        fused.since = p.stats.modelSeconds;
      }
      if (p.stats.modelSeconds - fused.since >= FUSED_STEADY_SECONDS) {
        fused.display = fused.value;
        fused.shown = true;
      }
    }
    const stalled = !snap.meets && snap.foods >= 2 && p.stats.modelSeconds - stall.since >= STALL_SECONDS;
    let hint = '';
    if (p.upgrades.chemotaxis > 0) {
      if (foodsLeft <= 0) hint = pt('chemotaxis.full');
      else if (suggestion !== null && search?.index === search?.sites.length)
        hint = pt('chemotaxis.suggest', { n: formatCount(suggestion + 1) });
      else hint = pt('chemotaxis.thinking');
    }
    if (stalled) hint = hint ? `${pt('net.stalled')} ${hint}` : pt('net.stalled');
    setHidden(hintLine, hint === '');
    setText(hintLine, hint);

    updateGoal(p, snap);
    updateUpgrades(p, num.toNumber(openPlateRate(p, snap)) + num.toNumber(cultureRate(p)));
    updateLinks(p);
    updateAtlas(p);
    const earned = PLASMODIUM_ACHIEVEMENT_IDS.filter((id) => p.achievements.includes(id)).length;
    // El total cuenta los secretos, como la pestaña Logros (tab-achievements.ts): restarlos daba
    // «0 de 7» aquí y «0 de 8» allí, y el total saltaba al ganar el secreto (UI-8).
    setText(
      achievementsText,
      pt('achievements.line', {
        count: formatCount(earned),
        total: formatCount(PLASMODIUM_ACHIEVEMENT_IDS.length),
      }),
    );
  }

  return {
    root,
    update,
    frame(now) {
      const p = state();
      if (!p) return;
      stepSuggestion(p);
      render.frame(now);
    },
    onEvent(event: GameEvent) {
      if (event.type !== 'plasmodium') return;
      render.onEvent(event);
      if (event.kind === 'goal' && expanded && goalTimer === undefined) sayGoal();
      if (event.kind === 'fruited' && expanded) {
        // Tras los esporangios (2 s; al instante con reducir movimiento) se cierra la placa
        // ampliada para que salga la lámina. Solo si el modal abierto sigue siendo el suyo.
        const token = expandToken;
        window.setTimeout(
          () => {
            if (expanded && token === expandToken && isModalOpen()) closeModal();
          },
          reducedMotion ? 0 : 2000,
        );
      }
      if (event.kind === 'plateOpened') {
        builtKey = '';
      }
    },
    setReducedMotion(on) {
      reducedMotion = on;
      render.setReducedMotion(on);
    },
    destroy() {
      render.destroy();
      sites.destroy();
      disposer.dispose();
    },
  };
}

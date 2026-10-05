/**
 * Láminas del viaje (docs/ROADMAP.md, fases 8 y 10): el fin del Acto I, la llegada a cada bioma y
 * su colonización, la apertura del segundo anillo y las dos de El regreso (la llegada al natal y
 * «La red planetaria» al cumplirlo); y las de los socios (fase 9): su llegada y cada placa
 * cartografiada. La cola se calcula del estado, no de los eventos: así sale igual tras el progreso
 * offline, una migración o una recarga con la lámina abierta (vuelve a salir hasta que se cierra, y
 * entonces queda en `seen`). Las claves de `seen` son fijas: ninguna crece con los ciclos.
 */
import { markSeen } from '../core/actions.ts';
import { isActOneClosed, isColonized, isReturnClosed, openRing, windTargets } from '../core/forest.ts';
import { hasSeen, type GameState } from '../core/state.ts';
import {
  COLONIZE_LEVEL,
  LINEAGE_FACTOR,
  RETURN_LEG,
  getBiome,
  isDestinationId,
  type BiomeId,
  type DestinationId,
} from '../data/biomes.ts';
import { CYCLE_GOAL_LEVEL } from '../data/cycle.ts';
import { PLATES } from '../data/plasmodium-plates.ts';
import { SOIL_PALETTES } from '../render/palettes.ts';
import { drawPlanetaryBand, planetaryLit, planetaryStrips } from '../render/planetary-band.ts';
import { formatFactor, formatPercent } from '../i18n/format.ts';
import { formatCount, getLocale, t, type MessageKey } from '../i18n/index.ts';
import { partnerText } from '../i18n/partners/index.ts';
import type { PartnerId } from '../partners/ids.ts';
import { biomeRules } from './biome-text.ts';
import { h } from './dom.ts';
import { openModal, type ModalAction } from './modal.ts';
import type { Store } from './store.ts';

export type Chapter =
  | { kind: 'act1' }
  | { kind: 'arrive'; biome: DestinationId }
  | { kind: 'colonize'; biome: DestinationId }
  /** «Donde acaban los árboles»: el primer anillo colonizado entero abre la pradera y la tundra. */
  | { kind: 'ring2' }
  /** El regreso (fase 10): la llegada al natal en el tramo 5 y, al cumplirlo, la red planetaria. */
  | { kind: 'returnArrive' }
  | { kind: 'returnClose' }
  | { kind: 'partner'; partner: PartnerId }
  | { kind: 'plate'; plate: number };

export function chapterSeenKey(chapter: Chapter): string {
  switch (chapter.kind) {
    case 'act1':
      return 'chapter.act1';
    case 'ring2':
      return 'chapter.ring2';
    case 'returnArrive':
      return 'chapter.return.arrive';
    case 'returnClose':
      return 'chapter.return.close';
    case 'partner':
      return `chapter.partner.${chapter.partner}`;
    case 'plate':
      return `chapter.plate.${PLATES[chapter.plate]?.id ?? chapter.plate}`;
    default:
      return `chapter.${chapter.kind}.${chapter.biome}`;
  }
}

/** Bioma de cada tramo del viaje, del primer destino al actual. */
function legBiomes(state: GameState): DestinationId[] {
  const out: DestinationId[] = [];
  for (let leg = 1; leg <= state.forest.leg; leg += 1) {
    const biome = leg === state.forest.leg ? state.forest.biome : state.chronicle[leg]?.biome;
    if (biome && biome !== 'natal') out.push(biome);
  }
  return out;
}

/**
 * El bosque cuya colonización abrió el segundo anillo (el último del primero en la Crónica), o
 * null si sigue cerrado. Se deduce de la Crónica, como `destinations`: así quien llega de la 1.5
 * con los dos bosques colonizados ve la lámina del anillo sin ninguna marca de la migración.
 */
function ringOneCloser(state: GameState): BiomeId | null {
  if (openRing(state) < 2) return null;
  const forests = state.chronicle.filter((e) => isDestinationId(e.biome) && getBiome(e.biome).ring === 1);
  return forests.at(-1)?.biome ?? null;
}

/**
 * La primera lámina sin ver, en el orden del viaje: Acto I; por bioma, llegada y colonización;
 * tras la colonización que cierra el primer anillo, la de «Donde acaban los árboles»; y en el
 * tramo 5, la llegada de El regreso y, cumplido, «La red planetaria».
 */
export function pendingChapter(state: GameState): Chapter | null {
  if (!isActOneClosed(state)) return null;
  const queue: Chapter[] = [{ kind: 'act1' }];
  for (const biome of legBiomes(state)) {
    queue.push({ kind: 'arrive', biome });
    if (!isColonized(state, biome)) continue;
    queue.push({ kind: 'colonize', biome });
    if (biome === ringOneCloser(state)) queue.push({ kind: 'ring2' });
  }
  if (state.forest.leg === RETURN_LEG) {
    queue.push({ kind: 'returnArrive' });
    if (isReturnClosed(state)) queue.push({ kind: 'returnClose' });
  }
  // Socios: su llegada y, por orden, cada placa cartografiada (calculado del estado: sale igual
  // tras el progreso offline o una recarga).
  const p = state.partners.plasmodium;
  if (p) {
    queue.push({ kind: 'partner', partner: 'plasmodium' });
    p.plates.forEach((record, plate) => {
      if (record.map) queue.push({ kind: 'plate', plate });
    });
  }
  return queue.find((chapter) => !hasSeen(state, chapterSeenKey(chapter))) ?? null;
}

/** Adónde puede llevar una lámina al cerrarse. Se navega en onClose, cuando el <dialog> ya
 * devolvió el foco: enfocar antes lo perdería. */
export interface ChapterNav {
  toWind(): void;
  toAdaptations(biome: DestinationId): void;
  /** Tras la lámina de llegada: el foco va al núcleo (el elemento anterior ya no existe). */
  toCore(): void;
  /** A la pestaña Socios (y, si se pide, abre esa placa del plasmodio). */
  toPartner(id: PartnerId, openPlate?: number): void;
}

export interface ChapterOptions {
  /** Releer desde la Crónica: no marca nada como visto ni navega por su cuenta. */
  reread?: boolean;
  /** Al cerrarse por cualquier vía (botón o Escape). */
  onClosed?: () => void;
}

export function openChapter(
  store: Store,
  chapter: Chapter,
  nav: ChapterNav,
  options: ChapterOptions = {},
): void {
  const state = store.state;
  let choice: 'close' | 'wind' | 'adaptations' | 'begin' | 'partner' | 'nextPlate' = 'close';
  const actions: ModalAction[] = [];
  const body: (Node | string)[] = [];
  let kicker: string;
  let title: string;
  let biome: string | undefined;
  let band: HTMLCanvasElement | null = null;

  switch (chapter.kind) {
    case 'act1':
      kicker = t('chapter.act1.kicker');
      title = t('chapter.act1.title');
      biome = 'natal';
      body.push(
        t('chapter.act1.line1'),
        h('p', { class: 'modal__quote', text: t('chapter.act1.line2') }),
        t('chapter.act1.line3'),
        t('chapter.act1.line4'),
      );
      // El foco empieza en «Seguir creciendo»: la lámina puede abrirse justo después de una
      // compra, y un Enter sostenido no debe llevar a otra pestaña sin leer.
      actions.push({ label: t('chapter.close'), kind: 'quiet', autofocus: true });
      actions.push({
        label: t('chapter.toWind'),
        kind: 'primary',
        onSelect: () => {
          choice = 'wind';
          return undefined;
        },
      });
      break;
    case 'ring2':
      kicker = t('chapter.act3.kicker');
      title = t('chapter.ring2.title');
      biome = undefined;
      body.push(
        t('chapter.ring2.line1'),
        h('p', { class: 'modal__quote', text: t('chapter.ring2.line2') }),
        t('chapter.ring2.line3'),
      );
      // Como la del Acto I: el foco en «Seguir creciendo», porque puede salir justo tras una compra.
      actions.push({ label: t('chapter.close'), kind: 'quiet', autofocus: true });
      actions.push({
        label: t('chapter.toWind'),
        kind: 'primary',
        onSelect: () => {
          choice = 'wind';
          return undefined;
        },
      });
      break;
    case 'arrive': {
      const b = chapter.biome;
      // Los biomas sin bosque son el Acto III, como la lámina que los abre.
      kicker = getBiome(b).ring === 2 ? t('chapter.act3.kicker') : t('chapter.act2.kicker');
      title = t(`chapter.${b}.arrive.title` as MessageKey);
      biome = b;
      body.push(
        t(`chapter.${b}.arrive.line1` as MessageKey),
        t(`chapter.${b}.arrive.line2` as MessageKey),
        h('h3', { class: 'modal__subtitle', text: t('chapter.rules') }),
        h(
          'ul',
          { class: 'modal__rules' },
          biomeRules(b).map((rule) => h('li', { text: rule })),
        ),
        t('chapter.goal', { goal: formatCount(COLONIZE_LEVEL) }),
        t('chapter.adaptHint'),
      );
      actions.push({
        label: t('chapter.toAdaptations'),
        kind: 'quiet',
        onSelect: () => {
          choice = 'adaptations';
          return undefined;
        },
      });
      actions.push({
        label: t('chapter.begin'),
        kind: 'primary',
        autofocus: true,
        onSelect: () => {
          choice = 'begin';
          return undefined;
        },
      });
      break;
    }
    case 'colonize': {
      const b = chapter.biome;
      kicker = t('chapter.colonize.kicker');
      title = t(`chapter.${b}.colonize.title` as MessageKey);
      biome = b;
      // El linaje que dio esta colonización, no el de hoy: solo se sale de un bosque colonizado,
      // así que al cerrar el tramo n hay n biomas colonizados (×2 cada uno). Al releer no se
      // habla del viento de ahora: la lámina cuenta aquel momento.
      const leg = state.chronicle.find((e) => e.biome === b)?.leg ?? state.forest.leg;
      body.push(
        t(`chapter.${b}.colonize.line1` as MessageKey),
        t(`chapter.${b}.colonize.line2` as MessageKey),
        t('chapter.lineage', { factor: formatFactor(LINEAGE_FACTOR ** leg, getLocale()) }),
      );
      // Lo que sigue sale de `windTargets`, como en Viento: otro destino o, tras el cuarto, casa.
      const next = options.reread ? undefined : windTargets(state)[0];
      // La colonización que cierra el primer anillo no lleva al viento: la lámina siguiente, la del
      // anillo 2, lo presenta y lleva allí (dos «Ver el viento» seguidos).
      const more = next !== undefined && !(b === ringOneCloser(state) && !hasSeen(state, 'chapter.ring2'));
      if (next) body.push(next.kind === 'return' ? t('chapter.homeward') : t('chapter.next'));
      actions.push({ label: t('chapter.close'), kind: more ? 'quiet' : 'primary', autofocus: true });
      if (more) {
        actions.push({
          label: t('chapter.toWind'),
          kind: 'primary',
          onSelect: () => {
            choice = 'wind';
            return undefined;
          },
        });
      }
      break;
    }
    case 'returnArrive':
      kicker = t('chapter.epilogue.kicker');
      title = t('chapter.return.arrive.title');
      biome = 'natal';
      body.push(
        t('chapter.return.arrive.line1'),
        h('p', { class: 'modal__quote', text: t('chapter.return.arrive.line2') }),
        t('chapter.return.arrive.line3', { goal: formatCount(CYCLE_GOAL_LEVEL) }),
      );
      // Como la llegada a un bioma: se empieza a crecer y el foco va al núcleo.
      actions.push({
        label: t('chapter.begin'),
        kind: 'primary',
        autofocus: true,
        onSelect: () => {
          choice = 'begin';
          return undefined;
        },
      });
      break;
    case 'returnClose': {
      kicker = t('chapter.epilogue.kicker');
      title = t('chapter.return.close.title');
      biome = 'natal';
      band = h('canvas', { class: 'modal__band', attrs: { 'aria-hidden': 'true' } });
      body.push(
        band,
        t('chapter.return.close.line1'),
        h('p', { class: 'modal__quote', text: t('chapter.return.close.line2') }),
        t('chapter.return.close.line3'),
      );
      // El foco en «Seguir creciendo»: la lámina sale justo tras la esporulación que cumple.
      actions.push({
        label: t('chapter.close'),
        kind: options.reread ? 'primary' : 'quiet',
        autofocus: true,
      });
      if (!options.reread) {
        actions.push({
          label: t('chapter.toCycle'),
          kind: 'primary',
          onSelect: () => {
            choice = 'wind';
            return undefined;
          },
        });
      }
      break;
    }
    case 'partner': {
      kicker = t('chapter.partner.kicker');
      title = t('chapter.plasmodium.arrive.title');
      biome = 'natal';
      body.push(
        t('chapter.plasmodium.arrive.line1'),
        h('p', { class: 'modal__quote', text: t('chapter.plasmodium.arrive.line2') }),
        t('chapter.plasmodium.arrive.line3'),
        t('chapter.plasmodium.arrive.line4'),
      );
      // El foco en «Ahora no»: la lámina puede salir justo después de una compra.
      actions.push({ label: t('chapter.later'), kind: 'quiet', autofocus: true });
      actions.push({
        label: t('chapter.toPlate'),
        kind: 'primary',
        onSelect: () => {
          choice = 'partner';
          return undefined;
        },
      });
      break;
    }
    case 'plate': {
      const def = PLATES[chapter.plate];
      const pt = (key: string, params?: Record<string, string | number>): string =>
        partnerText('plasmodium', key, params);
      const id = def?.id ?? 'log';
      const map = state.partners.plasmodium?.plates[chapter.plate]?.map ?? null;
      const locale = getLocale();
      kicker = pt('chapter.kicker', { n: formatCount(chapter.plate + 1), total: formatCount(PLATES.length) });
      title = pt(`chapter.${id}.title`);
      biome = undefined;
      body.push(
        pt(`chapter.${id}.line1`),
        h('p', { class: 'modal__quote', text: pt(`chapter.${id}.line2`) }),
      );
      if (map) {
        body.push(
          pt('chapter.map', {
            alive: formatCount(map.alive),
            cost: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(map.cost),
            tolerance: formatPercent(map.tolerance, locale, 0),
          }),
        );
      }
      if (id === 'log' || id === 'maze')
        body.push(pt('chapter.unlock', { what: pt(`chapter.${id}.unlock`) }));
      const next = PLATES[chapter.plate + 1];
      if (next) body.push(pt('chapter.next', { name: pt(`plate.${next.id}.name`) }));
      else body.push(pt('chapter.fusion.end'));
      const offerNext = next !== undefined && !options.reread;
      actions.push({ label: pt('chapter.stay'), kind: offerNext ? 'quiet' : 'primary', autofocus: true });
      if (offerNext) {
        actions.push({
          label: pt('chapter.toNext'),
          kind: 'primary',
          onSelect: () => {
            choice = 'nextPlate';
            return undefined;
          },
        });
      }
      break;
    }
  }

  openModal({
    title,
    kicker,
    biome,
    variant: 'modal--chapter',
    body,
    actions,
    onClose: () => {
      if (!options.reread) store.dispatch(markSeen, { key: chapterSeenKey(chapter) });
      options.onClosed?.();
      // Se navega en el cuadro siguiente: el <dialog> devuelve el foco al cerrarse y lo pisaría.
      requestAnimationFrame(() => {
        if (choice === 'wind') nav.toWind();
        else if (choice === 'adaptations' && (chapter.kind === 'arrive' || chapter.kind === 'colonize')) {
          nav.toAdaptations(chapter.biome);
        } else if (choice === 'partner' && chapter.kind === 'partner') nav.toPartner(chapter.partner);
        else if (choice === 'nextPlate' && chapter.kind === 'plate')
          nav.toPartner('plasmodium', chapter.plate + 1);
        else if ((chapter.kind === 'arrive' || chapter.kind === 'returnArrive') && !options.reread) {
          nav.toCore();
        }
      });
    },
  });
  // El lienzo de la red planetaria se dibuja una vez, ya con el modal abierto y medido.
  if (band) paintBand(band, state);
}

/**
 * La banda de la lámina de cierre: a lo ancho del cuerpo del modal y con el alto que le da el CSS.
 * Sin tamaño o sin lienzo (pruebas sin navegador) no dibuja nada: es decorativa (aria-hidden).
 */
function paintBand(canvas: HTMLCanvasElement, state: GameState): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (w < 2 || h < 2) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = w;
  canvas.height = h;
  const strips = planetaryStrips(state).map((id) => SOIL_PALETTES[id]);
  drawPlanetaryBand(ctx, { x: 0, y: 0, w, h }, strips, planetaryLit(state), { dpr, backdrop: true });
}

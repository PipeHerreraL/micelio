/**
 * Láminas del viaje (docs/ROADMAP.md, fase 8): el fin del Acto I, la llegada a cada bioma y su
 * colonización. La cola se calcula del estado, no de los eventos: así sale igual tras el
 * progreso offline, una migración o una recarga con la lámina abierta (vuelve a salir hasta que
 * se cierra, y entonces queda en `seen`).
 */
import { markSeen } from '../core/actions.ts';
import { destinations, isActOneClosed, isColonized } from '../core/forest.ts';
import { hasSeen, type GameState } from '../core/state.ts';
import { COLONIZE_LEVEL, LINEAGE_FACTOR, type DestinationId } from '../data/biomes.ts';
import { formatFactor } from '../i18n/format.ts';
import { formatCount, getLocale, t, type MessageKey } from '../i18n/index.ts';
import { biomeRules } from './biome-text.ts';
import { h } from './dom.ts';
import { openModal, type ModalAction } from './modal.ts';
import type { Store } from './store.ts';

export type Chapter =
  { kind: 'act1' } | { kind: 'arrive'; biome: DestinationId } | { kind: 'colonize'; biome: DestinationId };

export function chapterSeenKey(chapter: Chapter): string {
  return chapter.kind === 'act1' ? 'chapter.act1' : `chapter.${chapter.kind}.${chapter.biome}`;
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

/** La primera lámina sin ver, en el orden del viaje: Acto I, y por bioma, llegada y colonización. */
export function pendingChapter(state: GameState): Chapter | null {
  if (!isActOneClosed(state)) return null;
  const queue: Chapter[] = [{ kind: 'act1' }];
  for (const biome of legBiomes(state)) {
    queue.push({ kind: 'arrive', biome });
    if (isColonized(state, biome)) queue.push({ kind: 'colonize', biome });
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
  let choice: 'close' | 'wind' | 'adaptations' | 'begin' = 'close';
  const actions: ModalAction[] = [];
  const body: (Node | string)[] = [];
  let kicker: string;
  let title: string;
  let biome: string | undefined;

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
    case 'arrive': {
      const b = chapter.biome;
      kicker = t('chapter.act2.kicker');
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
      const more = !options.reread && destinations(state).length > 0;
      if (!options.reread) body.push(more ? t('chapter.next') : t('wind.none'));
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
        else if (choice === 'adaptations' && chapter.kind !== 'act1') nav.toAdaptations(chapter.biome);
        else if (chapter.kind === 'arrive' && !options.reread) nav.toCore();
      });
    },
  });
}

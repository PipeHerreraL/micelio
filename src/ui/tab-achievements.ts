/**
 * Pestaña Logros: todos los logros, conseguidos o por conseguir, con su condición. Los
 * secretos no dicen nada hasta conseguirse (PROMPT.md §11).
 *
 * Con el plasmodio (fase 9), sus logros van en un grupo aparte bajo los de la red, con su propio
 * contador: no suman al bono de producción, así que la línea de arriba sigue contando solo los
 * del hongo.
 */
import { isActOneClosed } from '../core/forest.ts';
import { derived } from '../core/selectors.ts';
import type { GameState } from '../core/state.ts';
import { ACHIEVEMENTS, type AchievementDef } from '../data/achievements.ts';
import {
  PLASMODIUM_ACHIEVEMENT_IDS,
  SECRET_PLASMODIUM_ACHIEVEMENTS,
  type PlasmodiumAchievementId,
} from '../data/plasmodium.ts';
import { formatPercent } from '../i18n/format.ts';
import { fmt, formatCount, getLocale, t, tp, type MessageKey, type PluralKey } from '../i18n/index.ts';
import { h, setHidden, setText } from './dom.ts';
import { createHint } from './hint.ts';
import { uiIcon } from './icons.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';

/** Descripción de la condición de un logro en el idioma activo. */
export function achievementDescription(def: AchievementDef): string {
  const c = def.condition;
  switch (c.kind) {
    case 'owned':
      return tp('achDesc.owned', c.count, { unit: tp(`gen.${c.id}.unit` as PluralKey, c.count) });
    case 'lifetime':
      return t('achDesc.lifetime', { value: fmt(c.amount) });
    case 'production':
      return t('achDesc.production', { value: fmt(c.amount) });
    case 'clicks':
      return t('achDesc.clicks', { count: new Intl.NumberFormat(getLocale()).format(c.count) });
    case 'drops':
      return tp('achDesc.drops', c.count);
    case 'sporulations':
      return tp('achDesc.sporulations', c.count);
    case 'idle':
    case 'away':
    case 'dispersals':
    case 'colonized':
    case 'biomeAdaptationsMaxed':
    case 'returned':
    case 'cycles':
    case 'vowRecord':
      return t(`ach.${def.id}.desc` as MessageKey);
    case 'biomeLevel':
      return t(`ach.${def.id}.desc` as MessageKey, { level: formatCount(c.level) });
  }
}

/**
 * Logros que se listan y se cuentan: los de Viento de esporas esperan al cierre del Acto I.
 * Uno ya conseguido se ve siempre (no puede pasar antes del Acto I, pero un guardado importado
 * no debe esconder lo que tiene).
 */
export function visibleAchievements(state: GameState): readonly AchievementDef[] {
  const open = isActOneClosed(state);
  return ACHIEVEMENTS.filter((def) => !def.reveal || open || state.achievements.includes(def.id));
}

export function achievementName(def: AchievementDef): string {
  return t(`ach.${def.id}.name` as MessageKey);
}

/** Id del encabezado del grupo del plasmodio: «Ver en Logros» (pestaña Socios) lleva el foco aquí. */
export const PLASMODIUM_ACHIEVEMENTS_ID = 'achievements-plasmodium';

/** Una entrada de la lista: conseguida o no, y oculta si es secreta y aún no se consiguió. */
function achievementItem(done: boolean, secret: boolean, name: string, desc: string): HTMLLIElement {
  const hidden = secret && !done;
  return h('li', { class: `ach${done ? ' is-done' : ''}${hidden ? ' is-secret' : ''}` }, [
    h('span', { class: 'ach__mark', attrs: { 'aria-hidden': 'true' } }, [
      uiIcon(done ? 'achievements' : 'lock'),
    ]),
    h('span', { class: 'ach__body' }, [
      h('span', { class: 'ach__name', text: hidden ? t('achievements.secret') : name }),
      h('span', { class: 'ach__desc', text: hidden ? t('achievements.secret.hint') : desc }),
    ]),
    // El estado se dice con texto, no solo con el color o el icono.
    h('span', {
      class: 'visually-hidden',
      text: done ? t('achievements.status.done') : t('achievements.status.locked'),
    }),
  ]);
}

const pachName = (id: PlasmodiumAchievementId): string => t(`pach.${id}.name` as MessageKey);
const pachDesc = (id: PlasmodiumAchievementId): string => t(`pach.${id}.desc` as MessageKey);

export function createAchievementsTab(store: Store): TabView {
  const progress = h('p', { class: 'tab__intro tabular' });
  const list = h('ul', { class: 'ach-list' });
  const hint = createHint(store, 'hint.achievements', t('hint.achievements'));

  // Del plasmodio: encabezado enfocable con tabindex=-1 (destino de «Ver en Logros»).
  const partnerProgress = h('p', { class: 'tab__intro tabular' });
  const partnerList = h('ul', { class: 'ach-list' });
  const partnerGroup = h(
    'section',
    { class: 'ach-partner', attrs: { hidden: true, 'aria-labelledby': PLASMODIUM_ACHIEVEMENTS_ID } },
    [
      h('h3', {
        class: 'settings__title ach-partner__title',
        id: PLASMODIUM_ACHIEVEMENTS_ID,
        text: t('achievements.partner.plasmodium.title'),
        attrs: { tabindex: -1 },
      }),
      h('p', { class: 'tab__intro', text: t('achievements.partner.intro') }),
      partnerProgress,
      partnerList,
    ],
  );

  const root = h('div', { class: 'tab tab--achievements' }, [
    h('div', { class: 'tab__toolbar' }, [h('h2', { class: 'tab__title', text: t('achievements.title') })]),
    hint.root,
    progress,
    list,
    partnerGroup,
  ]);
  let builtFor = '';
  let partnerBuiltFor = -1;

  function build(defs: readonly AchievementDef[], owned: ReadonlySet<string>): void {
    list.replaceChildren(
      ...defs.map((def) =>
        achievementItem(
          owned.has(def.id),
          def.secret === true,
          achievementName(def),
          achievementDescription(def),
        ),
      ),
    );
  }

  function buildPartner(owned: readonly PlasmodiumAchievementId[]): void {
    partnerList.replaceChildren(
      ...PLASMODIUM_ACHIEVEMENT_IDS.map((id) =>
        achievementItem(
          owned.includes(id),
          SECRET_PLASMODIUM_ACHIEVEMENTS.includes(id),
          pachName(id),
          pachDesc(id),
        ),
      ),
    );
  }

  function updatePartner(state: GameState): void {
    const p = state.partners.plasmodium;
    setHidden(partnerGroup, p === null);
    if (p === null) {
      partnerBuiltFor = -1;
      return;
    }
    const count = p.achievements.length;
    // Se rehace al ganar un logro del plasmodio, no en cada refresco.
    if (count !== partnerBuiltFor) {
      partnerBuiltFor = count;
      buildPartner(p.achievements);
    }
    setText(
      partnerProgress,
      t('achievements.partner.progress', {
        count: formatCount(count),
        total: formatCount(PLASMODIUM_ACHIEVEMENT_IDS.length),
      }),
    );
  }

  function update(): void {
    const state = store.state;
    const count = state.achievements.length;
    const visible = visibleAchievements(state);
    // Se rehace al ganar un logro o al aparecer los del Acto I, no en cada refresco.
    const key = `${count}/${visible.length}`;
    if (key !== builtFor) {
      builtFor = key;
      build(visible, new Set(state.achievements));
    }
    setText(
      progress,
      t('achievements.progress', {
        count,
        total: visible.length,
        percent: formatPercent(count * derived(state).achievementBonus, getLocale(), 0),
      }),
    );
    hint.update(count > 0);
    updatePartner(state);
  }

  return {
    id: 'achievements',
    root,
    update,
    destroy: () => {
      hint.destroy();
    },
  };
}

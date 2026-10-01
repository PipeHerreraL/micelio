/**
 * Pestaña Logros: todos los logros, conseguidos o por conseguir, con su condición. Los
 * secretos no dicen nada hasta conseguirse (PROMPT.md §11).
 */
import { isActOneClosed } from '../core/forest.ts';
import { derived } from '../core/selectors.ts';
import type { GameState } from '../core/state.ts';
import { ACHIEVEMENTS, type AchievementDef } from '../data/achievements.ts';
import { formatPercent } from '../i18n/format.ts';
import { fmt, formatCount, getLocale, t, tp, type MessageKey, type PluralKey } from '../i18n/index.ts';
import { h, setText } from './dom.ts';
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

export function createAchievementsTab(store: Store): TabView {
  const progress = h('p', { class: 'tab__intro tabular' });
  const list = h('ul', { class: 'ach-list' });
  const hint = createHint(store, 'hint.achievements', t('hint.achievements'));
  const root = h('div', { class: 'tab tab--achievements' }, [
    h('div', { class: 'tab__toolbar' }, [h('h2', { class: 'tab__title', text: t('achievements.title') })]),
    hint.root,
    progress,
    list,
  ]);
  let builtFor = '';

  function build(defs: readonly AchievementDef[], owned: ReadonlySet<string>): void {
    list.replaceChildren(
      ...defs.map((def) => {
        const done = owned.has(def.id);
        const hidden = def.secret === true && !done;
        return h('li', { class: `ach${done ? ' is-done' : ''}${hidden ? ' is-secret' : ''}` }, [
          h('span', { class: 'ach__mark', attrs: { 'aria-hidden': 'true' } }, [
            uiIcon(done ? 'achievements' : 'lock'),
          ]),
          h('span', { class: 'ach__body' }, [
            h('span', { class: 'ach__name', text: hidden ? t('achievements.secret') : achievementName(def) }),
            h('span', {
              class: 'ach__desc',
              text: hidden ? t('achievements.secret.hint') : achievementDescription(def),
            }),
          ]),
          // El estado se dice con texto, no solo con el color o el icono.
          h('span', {
            class: 'visually-hidden',
            text: done ? t('achievements.status.done') : t('achievements.status.locked'),
          }),
        ]);
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

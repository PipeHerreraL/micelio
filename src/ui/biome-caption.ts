/**
 * Cartela del escenario (docs/ROADMAP.md, fase 8): en qué bioma vive el linaje y cuánto falta
 * para colonizarlo. Aparece con el Acto I. En escritorio y tableta son dos líneas; en móvil, una
 * línea compacta (oculta al lector) y las dos líneas completas solo para el lector, que el CSS
 * esconde a la vista. No es interactiva: `pointer-events: none` y la gota la esquiva (app.ts).
 */
import { forestGoal, isActOneClosed } from '../core/forest.ts';
import { formatCount, t } from '../i18n/index.ts';
import { biomeName, biomeSoil } from './biome-text.ts';
import { h, setHidden, setProgress, setText } from './dom.ts';
import type { Store } from './store.ts';
import { forestGoalFill, forestProgressText } from './wind.ts';

export interface BiomeCaption {
  root: HTMLElement;
  update(): void;
}

export function createBiomeCaption(store: Store): BiomeCaption {
  const place = h('p', { class: 'caption__place' });
  const progress = h('p', { class: 'caption__progress tabular' });
  const fill = h('span', { class: 'bar__fill' });
  const bar = h('span', { class: 'bar bar--thin caption__bar', attrs: { 'aria-hidden': 'true' } }, [fill]);
  const compact = h('p', { class: 'caption__compact tabular', attrs: { 'aria-hidden': 'true' } });
  const root = h('div', { class: 'caption', attrs: { hidden: true } }, [
    h('div', { class: 'caption__lines' }, [place, progress, bar]),
    compact,
  ]);
  let builtFor = '';

  return {
    root,
    update() {
      const state = store.state;
      const open = isActOneClosed(state);
      setHidden(root, !open);
      if (!open) return;
      const biome = state.forest.biome;
      if (biome !== builtFor) {
        builtFor = biome;
        root.dataset.biome = biome;
        setText(place, t('caption.place', { name: biomeName(biome), soil: biomeSoil(biome) }));
      }
      const goal = forestGoal(state);
      // En la línea compacta, estrecha en el móvil, «44,1 mil sextillones» puede partirse: fmt une
      // cifra y nombre con espacios duros y se salía de la cartela.
      const level = formatCount(goal.level).replace(/\u00a0/g, ' ');
      setText(progress, forestProgressText(goal));
      const filled = forestGoalFill(goal);
      setHidden(bar, filled === null);
      if (filled !== null) setProgress(fill, filled);
      setText(
        compact,
        'goal' in goal
          ? t('caption.compact', { name: biomeName(biome), level, goal: formatCount(goal.goal) })
          : t('caption.compactDone', { name: biomeName(biome), level }),
      );
    },
  };
}

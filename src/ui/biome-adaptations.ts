/**
 * Adaptaciones de bioma (docs/ROADMAP.md, fase 8): un grupo por bioma visitado, dentro de la
 * sección Adaptaciones de la pestaña Mutaciones, con el del bioma actual primero (el ritmo del
 * bioma depende de comprarlas al llegar). Mismo patrón que las de la red: un <button> real que
 * dice lo que hace, `aria-disabled` y el motivo con texto.
 */
import { buyBiomeAdaptation } from '../core/actions.ts';
import {
  biomeAdaptationGate,
  biomeAdaptationLevelNeeded,
  nextBiomeAdaptationCost,
  visitedBiomes,
} from '../core/forest.ts';
import {
  BIOME_ADAPTATIONS,
  DESTINATION_IDS,
  type BiomeAdaptationDef,
  type DestinationId,
} from '../data/biomes.ts';
import { formatCount, t, tp, type MessageKey } from '../i18n/index.ts';
import { biomeAdaptationDesc, biomeAdaptationEffect, biomeAdaptationName } from './biome-text.ts';
import { Disposer, h, setAttr, setHidden, setText, toggleClass } from './dom.ts';
import { createHint } from './hint.ts';
import type { Store } from './store.ts';
import { soilSwatch } from './wind.ts';

interface Row {
  def: BiomeAdaptationDef;
  button: HTMLButtonElement;
  rank: HTMLElement;
  effect: HTMLElement;
  cost: HTMLElement;
  why: HTMLElement;
}

interface Group {
  biome: DestinationId;
  root: HTMLElement;
  rows: Row[];
}

export interface BiomeAdaptationsView {
  root: HTMLElement;
  /** Si hay algún grupo a la vista (para el encabezado «De la red»). */
  update(): boolean;
  destroy(): void;
}

export function createBiomeAdaptations(store: Store): BiomeAdaptationsView {
  const disposer = new Disposer();
  const hint = createHint(store, 'hint.biomeAdaptations', t('hint.biomeAdaptations'));
  const root = h('div', { class: 'badapt' }, [hint.root]);

  // Un grupo por bioma con adaptaciones: uno sin ellas (la pradera y la tundra hasta que lleguen
  // las suyas, fase 10) sería un título sin nada debajo.
  const learnable = DESTINATION_IDS.filter((biome) => BIOME_ADAPTATIONS.some((def) => def.biome === biome));
  const groups: Group[] = learnable.map((biome) => {
    const rows = BIOME_ADAPTATIONS.filter((def) => def.biome === biome).map((def): Row => {
      const label = t('adapt.buy', { name: biomeAdaptationName(def.id) });
      const rank = h('span', { class: 'adapt__rank tabular' });
      const effect = h('span', { class: 'adapt__effect', id: `badapt-${def.id}-effect` });
      const cost = h('span', { class: 'adapt__cost tabular', id: `badapt-${def.id}-cost` });
      const why = h('span', { class: 'adapt__why', id: `badapt-${def.id}-why`, attrs: { hidden: true } });
      const button = h(
        'button',
        { class: 'adapt__buy button', attrs: { type: 'button', 'aria-label': label } },
        [h('span', { text: label }), cost],
      );
      disposer.listen(button, 'click', () => {
        if (button.getAttribute('aria-disabled') === 'true') return;
        store.dispatch(buyBiomeAdaptation, { id: def.id });
      });
      return { def, button, rank, effect, cost, why };
    });
    const groupRoot = h('section', { class: 'badapt__group', attrs: { hidden: true } }, [
      h('h4', { class: 'badapt__title', id: `badapt-${biome}-title`, attrs: { tabindex: -1 } }, [
        soilSwatch(biome),
        h('span', { text: t(`badapt.group.${biome}` as MessageKey) }),
      ]),
      h(
        'ul',
        { class: 'adapt-list' },
        rows.map((row) =>
          h('li', { class: 'adapt__row' }, [
            h('div', { class: 'adapt__body' }, [
              h('span', { class: 'adapt__name' }, [
                h('span', { text: biomeAdaptationName(row.def.id) }),
                row.rank,
              ]),
              h('span', { class: 'adapt__desc', text: biomeAdaptationDesc(row.def.id) }),
              row.effect,
              row.why,
            ]),
            row.button,
          ]),
        ),
      ),
    ]);
    root.append(groupRoot);
    return { biome, root: groupRoot, rows };
  });

  let orderedFor = '';

  return {
    root,
    update() {
      const state = store.state;
      const visited = visitedBiomes(state);
      // El grupo del bioma actual va primero. Se reordena solo al cambiar de bioma, que ocurre
      // con el foco en el modal de dispersar: mover nodos no se lleva el foco de nadie.
      const current = state.forest.biome;
      if (current !== orderedFor) {
        orderedFor = current;
        const sorted = [...groups].sort((a, b) => Number(b.biome === current) - Number(a.biome === current));
        for (const group of sorted) root.append(group.root);
      }
      let anyVisible = false;
      for (const group of groups) {
        const visible = visited.includes(group.biome);
        setHidden(group.root, !visible);
        anyVisible ||= visible;
        if (!visible) continue;
        for (const row of group.rows) {
          const id = row.def.id;
          const owned = state.biomeAdaptations[id];
          const gate = biomeAdaptationGate(state, id);
          const price = nextBiomeAdaptationCost(state, id);
          setText(row.rank, t('adapt.rankOf', { rank: formatCount(owned), max: formatCount(row.def.max) }));
          setText(row.effect, biomeAdaptationEffect(state, id));
          setText(row.cost, price === null ? t('adapt.maxed') : tp('mut.cost', price));
          const reason =
            gate === 'level'
              ? t(`badapt.needLevel.${group.biome}` as MessageKey, {
                  level: formatCount(biomeAdaptationLevelNeeded(state, id)),
                })
              : null;
          setHidden(row.why, reason === null);
          if (reason !== null) setText(row.why, reason);
          const ready = gate === null && price !== null && state.spores.available >= price;
          setAttr(row.button, 'aria-disabled', ready ? 'false' : 'true');
          // Un motivo oculto citado por id se leería igual: solo se citan las partes visibles.
          setAttr(
            row.button,
            'aria-describedby',
            [row.effect.id, row.cost.id, ...(reason === null ? [] : [row.why.id])].join(' '),
          );
          toggleClass(row.button, 'button--primary', ready);
          toggleClass(row.button, 'is-unaffordable', !ready);
        }
      }
      hint.update(anyVisible);
      return anyVisible;
    },
    destroy: () => {
      disposer.dispose();
      hint.destroy();
    },
  };
}

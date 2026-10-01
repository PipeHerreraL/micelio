/**
 * Pestaña Mutaciones (PROMPT.md §10): el árbol dibujado con sus conexiones. Los nodos
 * bloqueados se ven en silueta, con su requisito. Las conexiones se calculan a partir de la
 * posición real de los nodos, así que el árbol sigue bien dibujado al cambiar el ancho.
 */
import { buyMutation, isMutationAvailable } from '../core/actions.ts';
import { hasMutation } from '../core/state.ts';
import { MUTATIONS, getMutation, type MutationDef, type MutationId } from '../data/mutations.ts';
import { getLocale, t, tp, type MessageKey } from '../i18n/index.ts';
import { Disposer, h, setAttr, setHidden, setText, svg, toggleClass } from './dom.ts';
import { createHint } from './hint.ts';
import type { Store } from './store.ts';
import type { TabView } from './tabs.ts';
import { attachTooltip } from './tooltip.ts';

const nameOf = (id: MutationId): string => t(`mut.${id}.name` as MessageKey);
const descOf = (id: MutationId): string => t(`mut.${id}.desc` as MessageKey);

type NodeState = 'owned' | 'available' | 'locked';

interface TreeNode {
  def: MutationDef;
  button: HTMLButtonElement;
  status: HTMLElement;
  cost: HTMLElement;
  requires: HTMLElement;
  /** Ids de las partes visibles que pueden describir el botón a un lector de pantalla. */
  parts: { desc: string; cost: string; requires: string };
  /** Estado con el que se escribieron el nombre y la descripción accesibles. */
  shown: NodeState | null;
}

function requirementText(def: MutationDef): string {
  const list = new Intl.ListFormat(getLocale(), { style: 'long', type: 'conjunction' });
  return t('mut.requires', { names: list.format(def.requires.map(nameOf)) });
}

export function createMutationsTab(store: Store): TabView {
  const disposer = new Disposer();
  const available = h('p', { class: 'mut__available tabular' });
  const lines = svg('svg', { class: 'mut-tree__lines', 'aria-hidden': 'true', focusable: 'false' });
  const tree = h('div', { class: 'mut-tree' });
  tree.append(lines);
  const hint = createHint(store, 'hint.mutations', t('hint.mutations'));
  const root = h('div', { class: 'tab tab--mutations' }, [
    h('div', { class: 'tab__toolbar' }, [
      h('h2', { class: 'tab__title', text: t('mutations.title') }),
      available,
    ]),
    hint.root,
    h('p', { class: 'tab__intro', text: t('mutations.intro') }),
    h('div', { class: 'mut-tree__scroll' }, [tree]),
  ]);

  // El DOM va en el orden de lectura del dibujo (fila y luego columna) para que el tabulador
  // recorra el árbol como se ve (PROMPT.md §16). MUTATIONS no se reordena: es el orden de la
  // tabla de §10 y el de compra del simulador.
  const visualOrder = [...MUTATIONS].sort((a, b) => a.row - b.row || a.col - b.col);
  const nodes: TreeNode[] = visualOrder.map((def) => {
    const parts = {
      desc: `mut-${def.id}-desc`,
      cost: `mut-${def.id}-cost`,
      requires: `mut-${def.id}-requires`,
    };
    const requirement = def.requires.length ? requirementText(def) : '';
    const status = h('span', { class: 'mut__status' });
    const cost = h('span', { class: 'mut__cost tabular', id: parts.cost, text: tp('mut.cost', def.cost) });
    const requires = h('span', { class: 'mut__requires', id: parts.requires, text: requirement });
    const button = h('button', { class: 'mut', attrs: { type: 'button' } }, [
      h('span', { class: 'mut__name', text: nameOf(def.id) }),
      h('span', { class: 'mut__desc', id: parts.desc, text: descOf(def.id) }),
      cost,
      requires,
      status,
    ]);
    button.style.gridColumn = String(def.col + 1);
    button.style.gridRow = String(def.row + 1);
    disposer.listen(button, 'click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      store.dispatch(buyMutation, { id: def.id });
    });
    attachTooltip(
      button,
      () => {
        const lines = [nameOf(def.id), descOf(def.id), tp('mut.cost', def.cost)];
        // El nodo bloqueado muestra su requisito; el tooltip también, para el ratón y el teclado.
        if (requirement && stateOf(def.id) === 'locked') lines.push(requirement);
        return lines;
      },
      disposer,
    );
    tree.append(button);
    return { def, button, status, cost, requires, parts, shown: null };
  });

  /** Redibuja las conexiones entre nodos según su posición actual. */
  function drawLines(): void {
    const box = tree.getBoundingClientRect();
    if (box.width === 0) return;
    lines.setAttribute('viewBox', `0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}`);
    const paths: SVGElement[] = [];
    for (const node of nodes) {
      const child = node.button.getBoundingClientRect();
      for (const req of node.def.requires) {
        const parent = nodes.find((n) => n.def.id === req)?.button.getBoundingClientRect();
        if (!parent) continue;
        const x1 = parent.left + parent.width / 2 - box.left;
        const y1 = parent.bottom - box.top;
        const x2 = child.left + child.width / 2 - box.left;
        const y2 = child.top - box.top;
        const mid = (y1 + y2) / 2;
        const owned = hasMutation(store.state, req) && hasMutation(store.state, node.def.id);
        paths.push(
          svg('path', {
            d: `M${x1.toFixed(1)} ${y1.toFixed(1)}C${x1.toFixed(1)} ${mid.toFixed(1)} ${x2.toFixed(1)} ${mid.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
            class: owned ? 'mut-tree__line is-owned' : 'mut-tree__line',
          }),
        );
      }
    }
    lines.replaceChildren(...paths);
  }

  const observer = new ResizeObserver(() => {
    drawLines();
  });
  observer.observe(tree);
  disposer.add(() => {
    observer.disconnect();
  });

  let ownedSignature = '';

  function stateOf(id: MutationId): NodeState {
    if (hasMutation(store.state, id)) return 'owned';
    return isMutationAvailable(store.state, id) ? 'available' : 'locked';
  }

  /**
   * Nombre y descripción accesibles según el estado. El aria-label sustituye al contenido del
   * botón, así que lo que se ve (efecto, coste, requisito) llega por aria-describedby, que
   * apunta solo a las partes visibles en ese estado: una parte oculta citada por id se leería
   * igual. Se conservan los ids ajenos, porque el tooltip añade y quita el suyo.
   */
  function labelNode(node: TreeNode, nodeState: NodeState): void {
    const name = nameOf(node.def.id);
    setAttr(
      node.button,
      'aria-label',
      nodeState === 'owned'
        ? t('mut.owned.label', { name })
        : nodeState === 'locked'
          ? t('mut.locked.label', { name })
          : t('mut.buy', { name }),
    );
    const { desc, cost, requires } = node.parts;
    const visible = nodeState === 'owned' ? [desc] : nodeState === 'locked' ? [cost, requires] : [desc, cost];
    const own: readonly string[] = [desc, cost, requires];
    const others = (node.button.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && !own.includes(id));
    setAttr(node.button, 'aria-describedby', [...visible, ...others].join(' '));
  }

  function update(): void {
    const state = store.state;
    setText(available, tp('sporulate.available', state.spores.available));
    for (const node of nodes) {
      const id = node.def.id;
      const nodeState = stateOf(id);
      node.button.dataset.state = nodeState;
      const affordable = nodeState === 'available' && state.spores.available >= getMutation(id).cost;
      setAttr(node.button, 'aria-disabled', affordable ? 'false' : 'true');
      toggleClass(node.button, 'is-affordable', affordable);
      if (node.shown !== nodeState) {
        node.shown = nodeState;
        labelNode(node, nodeState);
      }
      setText(
        node.status,
        nodeState === 'owned' ? t('mut.owned') : nodeState === 'locked' ? t('mut.locked') : '',
      );
      setHidden(node.cost, nodeState === 'owned');
      setHidden(node.requires, nodeState !== 'locked');
    }
    const signature = state.mutations.join('|');
    if (signature !== ownedSignature) {
      ownedSignature = signature;
      drawLines();
    }
    hint.update(state.spores.available > 0 && state.mutations.length === 0);
  }

  return {
    id: 'mutations',
    root,
    update,
    destroy: () => {
      disposer.dispose();
      hint.destroy();
    },
  };
}

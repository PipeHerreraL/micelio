/**
 * Versión del juego (la de package.json). La pone el build (`define` en vite.config.ts); fuera de
 * Vite, en los scripts que Node ejecuta directamente, no existe y vale ''.
 */
declare const __GAME_VERSION__: string | undefined;

export const GAME_VERSION: string = typeof __GAME_VERSION__ === 'string' ? __GAME_VERSION__ : '';

/**
 * Compara dos versiones «mayor.menor.parche»: negativo si `a` es anterior, positivo si es
 * posterior. Si alguna no tiene esa forma, 0: no se sabe cuál es más nueva.
 */
export function compareGameVersions(a: string, b: string): number {
  const pa = /^(\d+)\.(\d+)\.(\d+)$/.exec(a);
  const pb = /^(\d+)\.(\d+)\.(\d+)$/.exec(b);
  if (!pa || !pb) return 0;
  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

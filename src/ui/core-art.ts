/**
 * El dibujo del núcleo, un nudo de hifas que irradia desde el centro, como geometría pura
 * (viewBox 0 0 80 80). Lo usan el botón del juego (hud.ts) y los iconos de la app, que
 * scripts/icons.ts genera con este mismo código: el arte del juego sale siempre del código.
 */

export const CORE_SIZE = 80;
export const CORE_HALO_RADIUS = 36;
export const CORE_HEART_RADIUS = 10;

/** Los nueve filamentos, como `d` de un <path>: curvas que salen del corazón hacia el halo. */
export function coreStrands(): string[] {
  const strands: string[] = [];
  const count = 9;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const r1 = 9;
    const r2 = 30 + (i % 3) * 4;
    const bend = a + 0.35 * (i % 2 === 0 ? 1 : -1);
    const x1 = 40 + Math.cos(a) * r1;
    const y1 = 40 + Math.sin(a) * r1;
    const cx = 40 + Math.cos(bend) * (r2 * 0.6);
    const cy = 40 + Math.sin(bend) * (r2 * 0.6);
    const x2 = 40 + Math.cos(a) * r2;
    const y2 = 40 + Math.sin(a) * r2;
    strands.push(
      `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    );
  }
  return strands;
}

/** Colores del icono: los de la paleta (styles.css, `:root`), escritos aquí porque no hay CSS. */
export const ICON_COLORS = {
  humusHondo: '#1b140f',
  humus: '#261c15',
  tierra: '#4a3424',
  arcilla: '#8c5a35',
  micelio: '#efe6d2',
  centre: '#5a4030',
} as const;

export interface CoreIconOptions {
  /** Lado del icono en px. */
  size: number;
  /** Fracción del lado que ocupa el halo (1 = de borde a borde). */
  scale: number;
  /** Fondo: el degradado del botón a todo el cuadrado, o transparente (primer plano adaptable). */
  background: 'gradient' | 'none';
}

/**
 * El núcleo como SVG en texto, con sus colores y sin CSS, para rasterizarlo (scripts/icons.ts) o
 * usarlo tal cual (favicon). Los trazos se ensanchan un poco en los tamaños pequeños: a 48 px, la
 * línea de 1,6 del juego se perdía.
 */
export function coreIconSvg({ size, scale, background }: CoreIconOptions): string {
  const c = ICON_COLORS;
  const art = size * scale;
  const k = art / CORE_SIZE;
  const offset = (size - art) / 2;
  const strand = (size < 100 ? 2.2 : 1.8).toFixed(1);
  const fill =
    background === 'gradient'
      ? `<defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${c.centre}"/>` +
        `<stop offset="0.55" stop-color="${c.tierra}"/><stop offset="1" stop-color="${c.humusHondo}"/></radialGradient></defs>` +
        `<rect width="${String(size)}" height="${String(size)}" fill="url(#g)"/>`
      : '';
  const paths = coreStrands()
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${c.micelio}" stroke-width="${strand}" stroke-linecap="round" opacity="0.9"/>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}" viewBox="0 0 ${String(size)} ${String(size)}">` +
    fill +
    `<g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${k.toFixed(4)})">` +
    `<circle cx="40" cy="40" r="${String(CORE_HALO_RADIUS)}" fill="none" stroke="${c.arcilla}" stroke-width="1" stroke-dasharray="2 3"/>` +
    paths +
    `<circle cx="40" cy="40" r="${String(CORE_HEART_RADIUS)}" fill="${c.micelio}"/>` +
    `</g></svg>`
  );
}

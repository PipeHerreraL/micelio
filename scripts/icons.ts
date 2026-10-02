/**
 * Iconos de la app (v1.5.0): salen del dibujo del núcleo (src/ui/core-art.ts), como el resto del
 * arte del juego, y se rasterizan con el Chromium de Playwright (ya es dependencia de desarrollo).
 * Los PNG se guardan en el repositorio; se rehacen con `npm run icons` si cambia el dibujo.
 *
 * - public/icons/: favicon (SVG), iconos de la PWA (192 y 512; «maskable» con zona segura) y el de
 *   la pantalla de inicio del iPhone (180).
 * - android/app/src/main/res/: lanzador de Android en cada densidad, el primer plano y la capa
 *   monocroma del icono adaptable, y las pantallas de arranque (si existe el proyecto de Android).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { coreIconSvg, ICON_COLORS, type CoreIconOptions } from '../src/ui/core-art.ts';

interface Target extends CoreIconOptions {
  file: string;
  /** Recorte circular (icono redondo de Android). */
  round?: boolean;
}

/** Una imagen rectangular ya compuesta (pantallas de arranque de Android). */
interface Picture {
  file: string;
  width: number;
  height: number;
  svg: string;
}

/** Halo a todo lo ancho menos un margen: en los iconos «any» y en el del iPhone. */
const FULL = 0.86;
/**
 * Zona segura de un icono «maskable»: un círculo del 80 % del lado. El halo (diámetro 72 de 80)
 * cabe en él con scale 0.8 · 80/72 ≈ 0.88 del círculo: se usa 0.66 del lado para dejar aire.
 */
const MASKABLE = 0.66;
/** Icono adaptable de Android: lienzo de 108 dp con la zona segura en los 66 dp del centro. */
const ADAPTIVE = 0.58;

const PUBLIC_TARGETS: Target[] = [
  { file: 'public/icons/icon-192.png', size: 192, scale: FULL, background: 'gradient' },
  { file: 'public/icons/icon-512.png', size: 512, scale: FULL, background: 'gradient' },
  { file: 'public/icons/icon-maskable-512.png', size: 512, scale: MASKABLE, background: 'gradient' },
  { file: 'public/icons/apple-touch-icon.png', size: 180, scale: FULL, background: 'gradient' },
];

/** Densidades de Android: lado del lanzador (48 dp) y del primer plano adaptable (108 dp) en px. */
const DENSITIES: readonly [string, number][] = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

const RES = 'android/app/src/main/res';

function androidTargets(): Target[] {
  if (!existsSync(RES)) return [];
  return DENSITIES.flatMap(([name, k]): Target[] => [
    { file: `${RES}/mipmap-${name}/ic_launcher.png`, size: 48 * k, scale: FULL, background: 'gradient' },
    {
      file: `${RES}/mipmap-${name}/ic_launcher_round.png`,
      size: 48 * k,
      scale: FULL * 0.92,
      background: 'gradient',
      round: true,
    },
    // Icono adaptable: el dibujo sobre transparente; el fondo es el degradado de
    // drawable/micelio_icon_background.xml.
    {
      file: `${RES}/mipmap-${name}/ic_launcher_foreground.png`,
      size: 108 * k,
      scale: ADAPTIVE,
      background: 'none',
    },
    // Iconos temáticos (Android 13+): la misma silueta en blanco; el sistema la tiñe.
    {
      file: `${RES}/mipmap-${name}/ic_launcher_monochrome.png`,
      size: 108 * k,
      scale: ADAPTIVE,
      background: 'none',
      tone: 'white',
    },
  ]);
}

/**
 * Pantallas de arranque de Android 11 y anteriores (splash.png en drawable y drawable-land/port-<densidad>): el núcleo sobre el
 * fondo del juego, en los mismos tamaños que traía la plantilla de Capacitor. Desde Android 12 el
 * sistema la compone él con el icono y windowSplashScreenBackground (values/styles.xml).
 */
function androidSplashes(): Picture[] {
  if (!existsSync(RES)) return [];
  return readdirSync(RES)
    .filter((dir) => dir.startsWith('drawable') && existsSync(`${RES}/${dir}/splash.png`))
    .map((dir) => {
      const file = `${RES}/${dir}/splash.png`;
      const data = readFileSync(file);
      const width = data.readUInt32BE(16);
      const height = data.readUInt32BE(20);
      const art = Math.round(Math.min(width, height) * 0.4);
      const x = Math.round((width - art) / 2);
      const y = Math.round((height - art) / 2);
      const inner = coreIconSvg({ size: art, scale: 1, background: 'none' }).replace(
        '<svg ',
        `<svg x="${String(x)}" y="${String(y)}" `,
      );
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">` +
        `<rect width="100%" height="100%" fill="${ICON_COLORS.humus}"/>${inner}</svg>`;
      return { file, width, height, svg };
    });
}

function page(svg: string): string {
  return `<!doctype html><html><body style="margin:0;background:transparent"><div style="display:inline-block;line-height:0">${svg}</div></body></html>`;
}

const browser = await chromium.launch(process.env.CI ? {} : { channel: 'msedge' });
const context = await browser.newContext({ deviceScaleFactor: 1 });
const tab = await context.newPage();
const pictures: Picture[] = [
  ...[...PUBLIC_TARGETS, ...androidTargets()].map((t) => ({
    file: t.file,
    width: t.size,
    height: t.size,
    svg:
      t.round === true
        ? `<div style="border-radius:50%;overflow:hidden">${coreIconSvg(t)}</div>`
        : coreIconSvg(t),
  })),
  ...androidSplashes(),
];
for (const p of pictures) {
  await tab.setViewportSize({ width: p.width, height: p.height });
  await tab.setContent(page(p.svg));
  const png = await tab.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: p.width, height: p.height },
  });
  mkdirSync(dirname(p.file), { recursive: true });
  writeFileSync(p.file, png);
}
await browser.close();

writeFileSync(
  'public/icons/favicon.svg',
  `${coreIconSvg({ size: 64, scale: FULL, background: 'gradient' })}\n`,
);
console.log(`${String(pictures.length + 1)} imágenes (fondo ${ICON_COLORS.humusHondo}).`);

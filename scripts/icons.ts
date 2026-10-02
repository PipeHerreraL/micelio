/**
 * Iconos de la app (v1.5.0): salen del dibujo del núcleo (src/ui/core-art.ts), como el resto del
 * arte del juego, y se rasterizan con el Chromium de Playwright (ya es dependencia de desarrollo).
 * Los PNG se guardan en el repositorio; se rehacen con `npm run icons` si cambia el dibujo.
 *
 * - public/icons/: favicon (SVG), iconos de la PWA (192 y 512; «maskable» con zona segura) y el de
 *   la pantalla de inicio del iPhone (180).
 * - android/app/src/main/res/: lanzador de Android en cada densidad, el primer plano del icono
 *   adaptable y la pantalla de arranque (si existe el proyecto de Android).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { coreIconSvg, ICON_COLORS, type CoreIconOptions } from '../src/ui/core-art.ts';

interface Target extends CoreIconOptions {
  file: string;
  /** Recorte circular (icono redondo de Android). */
  round?: boolean;
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

function androidTargets(): Target[] {
  const res = 'android/app/src/main/res';
  if (!existsSync(res)) return [];
  return DENSITIES.flatMap(([name, k]) => [
    { file: `${res}/mipmap-${name}/ic_launcher.png`, size: 48 * k, scale: FULL, background: 'gradient' },
    {
      file: `${res}/mipmap-${name}/ic_launcher_round.png`,
      size: 48 * k,
      scale: FULL * 0.92,
      background: 'gradient',
      round: true,
    },
    {
      file: `${res}/mipmap-${name}/ic_launcher_foreground.png`,
      size: 108 * k,
      scale: ADAPTIVE,
      background: 'none',
    },
  ]);
}

function page(svg: string, round: boolean): string {
  const clip = round ? 'border-radius:50%;overflow:hidden;' : '';
  return `<!doctype html><html><body style="margin:0;background:transparent"><div style="${clip}display:inline-block;line-height:0">${svg}</div></body></html>`;
}

const browser = await chromium.launch(process.env.CI ? {} : { channel: 'msedge' });
const context = await browser.newContext({ deviceScaleFactor: 1 });
const tab = await context.newPage();
const targets = [...PUBLIC_TARGETS, ...androidTargets()];
for (const t of targets) {
  await tab.setViewportSize({ width: t.size, height: t.size });
  await tab.setContent(page(coreIconSvg(t), t.round === true));
  const png = await tab.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: t.size, height: t.size },
  });
  mkdirSync(dirname(t.file), { recursive: true });
  writeFileSync(t.file, png);
}
await browser.close();

writeFileSync(
  'public/icons/favicon.svg',
  `${coreIconSvg({ size: 64, scale: FULL, background: 'gradient' })}\n`,
);
console.log(`${String(targets.length + 1)} iconos (fondo ${ICON_COLORS.humusHondo}).`);

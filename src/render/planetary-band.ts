/**
 * La Red planetaria (fase 10, El regreso): cinco franjas en el orden del viaje, cada una con el suelo
 * y la silueta de su bioma, unidas por una línea de micelio con nodos. Los enlaces se encienden con el
 * nivel de El regreso (125, 250 y 375) y el cuarto al cumplirlo; cumplido, la banda queda entera.
 *
 * Una sola función de dibujo para la capa horneada del escenario (render/network.ts) y el lienzo de
 * la lámina de cierre (ui/chapter.ts). Es decorativa: lo que muestra está en el texto de la lámina y
 * de la Crónica. Solo se dibuja al hornear o una vez en la lámina, así que no corre en el bucle de
 * render; aun así no sortea nada, para que la misma partida dibuje siempre la misma banda.
 */
import { isReturnClosed } from '../core/forest.ts';
import type { GameState } from '../core/state.ts';
import { HOME_BIOME, RETURN_LEG, type BiomeId } from '../data/biomes.ts';
import { BIRCH_ALPHA, BIRCH_TONE, type SoilPalette } from './palettes.ts';

/** Niveles de El regreso que encienden los tres primeros enlaces; el cuarto, cumplirlo. */
export const PLANETARY_LINK_LEVELS: readonly number[] = [125, 250, 375];
/** Enlaces entre las cinco franjas. */
export const PLANETARY_LINKS = PLANETARY_LINK_LEVELS.length + 1;

/** El mismo crema de las hifas (render/network.ts). */
const MICELIO = '#EFE6D2';
/** Dónde está el suelo en la banda (fracción del alto): encima, las siluetas; debajo, la red. */
const GROUND = 0.72;

/** La banda se ve en el escenario mientras el linaje vive en el natal del tramo 5. */
export function showsPlanetaryBand(state: Readonly<GameState>): boolean {
  return state.forest.leg === RETURN_LEG && state.forest.biome === HOME_BIOME;
}

/** Biomas de las franjas: el natal y los destinos de la Crónica, en el orden del viaje. */
export function planetaryStrips(state: Readonly<GameState>): BiomeId[] {
  const out: BiomeId[] = [HOME_BIOME];
  for (const entry of state.chronicle) if (entry.leg >= 1 && entry.leg < RETURN_LEG) out.push(entry.biome);
  return out;
}

/** Enlaces encendidos: los de los niveles alcanzados en El regreso y, cumplido, todos. */
export function planetaryLit(state: Readonly<GameState>): number {
  if (isReturnClosed(state)) return PLANETARY_LINKS;
  if (state.forest.leg !== RETURN_LEG) return 0;
  let lit = 0;
  for (const level of PLANETARY_LINK_LEVELS) if (state.spores.level >= level) lit += 1;
  return lit;
}

export interface BandRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BandOptions {
  dpr: number;
  /**
   * Con fondo, cada franja pinta su suelo (la lámina, sobre el marrón del modal); sin él, solo las
   * siluetas, tenues como el bosque lejano, sobre la hojarasca del escenario.
   */
  backdrop: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Dibuja la banda en `rect` (px del lienzo). `strips` son las paletas de las franjas en el orden del
 * viaje; `lit`, cuántos enlaces están encendidos (0–4).
 */
export function drawPlanetaryBand(
  ctx: CanvasRenderingContext2D,
  rect: BandRect,
  strips: readonly SoilPalette[],
  lit: number,
  options: BandOptions,
): void {
  const n = strips.length;
  if (n === 0 || rect.w <= 0 || rect.h <= 0) return;
  const { dpr, backdrop } = options;
  const sw = rect.w / n;
  const ground = rect.y + rect.h * GROUND;
  const above = ground - rect.y;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i += 1) {
    const p = strips[i];
    if (!p) continue;
    const x0 = rect.x + i * sw;
    if (backdrop) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.band;
      ctx.fillRect(x0, rect.y, sw, above);
      ctx.fillStyle = p.humus;
      ctx.fillRect(x0, ground, sw, rect.y + rect.h - ground);
    }
    drawSilhouette(ctx, p, x0, sw, rect.y, ground, dpr, backdrop);
  }
  drawLinks(ctx, rect, n, sw, ground, lit, dpr);
  ctx.restore();
}

/** Lo que crece en cada franja, con el vocabulario del escenario: troncos, hierba o arbustos. */
function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  p: SoilPalette,
  x0: number,
  sw: number,
  top: number,
  ground: number,
  dpr: number,
  backdrop: boolean,
): void {
  const tall = ground - top;
  const color = backdrop ? p.silhouette : p.distantSilhouette;
  const alpha = backdrop ? 1 : 0.4;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  if (p.silhouetteKind === 'grass') {
    // Hierba alta y un roble solo.
    ctx.lineWidth = Math.max(dpr, sw * 0.012);
    ctx.beginPath();
    for (let j = 0; j < 9; j += 1) {
      const foot = x0 + sw * (0.06 + 0.11 * j);
      const lean = Math.sin(j * 2.3) * sw * 0.03;
      ctx.moveTo(foot, ground);
      ctx.quadraticCurveTo(
        foot + lean * 0.3,
        ground - tall * 0.2,
        foot + lean,
        ground - tall * (0.3 + 0.1 * Math.sin(j)),
      );
    }
    ctx.stroke();
    const ox = x0 + sw * 0.62;
    const half = clamp(sw * 0.035, dpr, 5 * dpr);
    ctx.fillRect(ox - half, ground - tall * 0.55, half * 2, tall * 0.55);
    ctx.beginPath();
    ctx.ellipse(ox, ground - tall * 0.68, sw * 0.17, tall * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (p.silhouetteKind === 'shrubs') {
    // Un pingo al fondo y arbustos enanos a ras de suelo.
    const px = x0 + sw * 0.62;
    ctx.globalAlpha = alpha * 0.7;
    ctx.beginPath();
    ctx.moveTo(px - sw * 0.3, ground);
    ctx.quadraticCurveTo(px, ground - tall * 1.15, px + sw * 0.3, ground);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha;
    for (const at of [0.15, 0.38, 0.86]) {
      ctx.beginPath();
      ctx.ellipse(x0 + sw * at, ground, sw * 0.08, tall * 0.16, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  // Troncos: con un abedul entre ellos en la taiga y raíces tablares en el Chocó.
  const half = clamp(sw * 0.035 * p.distantWidth, dpr, 6 * dpr);
  for (let k = 0; k < 3; k += 1) {
    const cx = x0 + sw * (0.2 + 0.3 * k);
    const birch = p.birchEvery > 0 && k === 1;
    ctx.fillStyle = birch ? BIRCH_TONE : color;
    ctx.globalAlpha = birch ? (backdrop ? 0.55 : BIRCH_ALPHA) : alpha;
    ctx.beginPath();
    ctx.moveTo(cx - half * 0.75, top);
    ctx.lineTo(cx + half * 0.75, top);
    ctx.lineTo(cx + half * 1.2, ground);
    ctx.lineTo(cx - half * 1.2, ground);
    ctx.closePath();
    ctx.fill();
    if (p.buttress && !birch) {
      ctx.beginPath();
      ctx.moveTo(cx - half, ground - tall * 0.3);
      ctx.lineTo(cx - half * 3.2, ground);
      ctx.lineTo(cx + half * 3.2, ground);
      ctx.lineTo(cx + half, ground - tall * 0.3);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
}

/**
 * La red: un nodo bajo cada franja y un enlace entre cada dos, encendidos de izquierda a derecha.
 * Los apagados se ven tenues para que se lea el camino que falta.
 */
function drawLinks(
  ctx: CanvasRenderingContext2D,
  rect: BandRect,
  n: number,
  sw: number,
  ground: number,
  lit: number,
  dpr: number,
): void {
  const depth = rect.y + rect.h - ground;
  const nodeY = (i: number): number => ground + depth * (0.45 + (i % 2 === 0 ? -0.12 : 0.12));
  const nodeX = (i: number): number => rect.x + sw * (i + 0.5);
  ctx.strokeStyle = MICELIO;
  ctx.fillStyle = MICELIO;
  for (let k = 0; k < n - 1; k += 1) {
    const on = k < lit;
    ctx.globalAlpha = on ? 0.9 : 0.22;
    ctx.lineWidth = (on ? 1.8 : 1) * dpr;
    const x1 = nodeX(k);
    const x2 = nodeX(k + 1);
    ctx.beginPath();
    ctx.moveTo(x1, nodeY(k));
    ctx.quadraticCurveTo((x1 + x2) / 2, ground + depth * 0.85, x2, nodeY(k + 1));
    ctx.stroke();
  }
  const radius = clamp(depth * 0.12, 1.5 * dpr, 3.5 * dpr);
  for (let i = 0; i < n; i += 1) {
    const on = i <= lit;
    const x = nodeX(i);
    const y = nodeY(i);
    // Dos hifas cortas que bajan del nodo: la red sigue más allá de lo que se ve.
    ctx.globalAlpha = on ? 0.4 : 0.15;
    ctx.lineWidth = 0.8 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - sw * 0.08, y + depth * 0.3);
    ctx.moveTo(x, y);
    ctx.lineTo(x + sw * 0.06, y + depth * 0.35);
    ctx.stroke();
    ctx.globalAlpha = on ? 0.95 : 0.3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

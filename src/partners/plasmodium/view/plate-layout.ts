/**
 * Disposición de la placa en pantalla: apaisada, girada (vertical) o lista. Pura: recibe el
 * espacio disponible y devuelve el tamaño de la celda y del lienzo, en px CSS.
 *
 * Regla (crítica de la fase 9, hallazgos 5 y 10): los botones de los sitios miden 44 px y la celda
 * nunca baja de la mínima de la placa (`cellMin`, medida en los datos), así que no se solapan ni se
 * salen. La celda también se limita por la altura visible, para no tener que desplazarse entre la
 * herramienta y el sitio. Si ni apaisada ni girada cabe, se pasa a la lista. La orientación tiene
 * histéresis: un cambio de 17 px (la barra de desplazamiento) no la hace oscilar.
 */
import { PLATES, type PlateDef } from '../../../data/plasmodium-plates.ts';

export type PlateOrientation = 'landscape' | 'portrait';

export interface PlateLayout {
  plate: number;
  orientation: PlateOrientation;
  /** No cabe con sitios de 44 px: el lienzo es solo imagen y los sitios se eligen en la lista. */
  list: boolean;
  /** Lado de la celda en px CSS. */
  cell: number;
  /** Tamaño del lienzo en px CSS. */
  width: number;
  height: number;
}

/** Celda máxima: más grande no ayuda y la placa se comería el panel. */
export const MAX_CELL = 96;
/** Margen de histéresis al elegir orientación (px). */
export const ORIENTATION_HYSTERESIS = 24;

function plateOf(index: number): PlateDef {
  const def = PLATES[index];
  if (!def) throw new Error(`Placa desconocida: ${index}`);
  return def;
}

/**
 * Elige la disposición para un ancho y un alto disponibles (px CSS). `previous` (de la misma
 * placa) aplica la histéresis: se conserva su orientación mientras siga cabiendo con margen.
 */
export function computeLayout(
  plate: number,
  width: number,
  height: number,
  previous: PlateLayout | null = null,
): PlateLayout {
  const def = plateOf(plate);
  const cellFor = (orientation: PlateOrientation): number => {
    const across = orientation === 'landscape' ? def.cols : def.rows;
    const along = orientation === 'landscape' ? def.rows : def.cols;
    return Math.min(MAX_CELL, width / across, height / along);
  };
  const fits = (orientation: PlateOrientation, margin: number): boolean =>
    cellFor(orientation) >= def.cellMin + margin;
  // Histéresis: desde la vertical solo se vuelve a la apaisada con 24 px de holgura en total.
  const previousOrientation =
    previous && previous.plate === plate && !previous.list ? previous.orientation : null;
  const landscapeMargin = previousOrientation === 'portrait' ? ORIENTATION_HYSTERESIS / def.cols : 0;
  let orientation: PlateOrientation | null = null;
  if (fits('landscape', landscapeMargin)) orientation = 'landscape';
  else if (fits('portrait', 0)) orientation = 'portrait';
  if (orientation) {
    const cell = cellFor(orientation);
    return sized(plate, orientation, false, cell);
  }
  // Lista: el lienzo se dibuja girado como imagen, al ancho disponible.
  const cell = Math.max(1, Math.min(MAX_CELL, width / def.rows));
  return sized(plate, 'portrait', true, cell);
}

function sized(plate: number, orientation: PlateOrientation, list: boolean, cell: number): PlateLayout {
  const def = plateOf(plate);
  const cols = orientation === 'landscape' ? def.cols : def.rows;
  const rows = orientation === 'landscape' ? def.rows : def.cols;
  return { plate, orientation, list, cell, width: cols * cell, height: rows * cell };
}

/**
 * Posición de un punto de la placa (en celdas) en el lienzo (px CSS). Girada 90° en sentido
 * horario: x' = filas − y, y' = x.
 */
export function toScreen(layout: PlateLayout, x: number, y: number): { x: number; y: number } {
  const def = plateOf(layout.plate);
  if (layout.orientation === 'landscape') return { x: x * layout.cell, y: y * layout.cell };
  return { x: (def.rows - y) * layout.cell, y: x * layout.cell };
}

/** Posición de un sitio en el lienzo (px CSS). */
export function sitePosition(layout: PlateLayout, site: number): { x: number; y: number } {
  const def = plateOf(layout.plate);
  return toScreen(layout, def.x[site] ?? 0, def.y[site] ?? 0);
}

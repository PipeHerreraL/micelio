/**
 * Las cinco placas del plasmodio (docs/ROADMAP.md, fase 9), iguales para todos los jugadores.
 *
 * Datos literales: se generaron una vez con el generador del prototipo del modelo
 * (scripts/plasmodium-plates.ts conserva su procedencia) con la semilla mediana de las 9 medidas,
 * y las coordenadas redondeadas a 3 decimales. El juego nunca las regenera: así no hay placas sin
 * solución, el grafo es el mismo en todos los navegadores y el guardado se valida sin el modelo.
 *
 * Coordenadas en celdas (cols × rows, celda de lado 1). Cada nodo es un sitio. Las aristas son
 * los tubos posibles; la placa es un grafo plano y conexo (tests/plasmodium-plates.test.ts).
 *
 * Números de balance medidos sobre estas placas (scratchpad de la fase 9, ARCHITECTURE.md §4.29):
 * - threshold: 0,9 × la peor calidad sostenida de 9 semillas del generador (en el Laberinto, la
 *   longitud relativa al camino más corto).
 * - trailGoal (G): Rastro que hay que dejar con la placa como frontera para cartografiarla; marca el
 *   ritmo de 4–6 h del plasmodio completo.
 * - trailRate: Rastro/s por copo unido y unidad de calidad, 10^placa.
 * - habRate (η) y spreadRate (ζ): habituación propia por paso con flujo y contagio por fusión.
 */

export type PlateId = 'log' | 'maze' | 'archipelago' | 'bitterBridge' | 'fusion';
/** quality: calidad ≥ umbral; length: longitud ≤ umbral (solo queda el camino corto). */
export type PlateObjective = 'quality' | 'length';
export type PlateSubstance = 'none' | 'quinine' | 'salt';

export interface PlateDef {
  id: PlateId;
  cols: number;
  rows: number;
  /** Rejilla regular (Laberinto): el fondo dibuja paredes entre celdas vecinas sin arista. */
  grid: boolean;
  x: readonly number[];
  y: readonly number[];
  edges: readonly (readonly [number, number])[];
  /** Copos que pone la placa (no se pueden quitar). */
  fixedFoods: readonly number[];
  /** Sitios con luz fija (mar y sierra): no admiten nada y sus aristas se secan ×4. */
  blocked: readonly number[];
  substance: PlateSubstance;
  /** Índices de las aristas con quinina o sal. */
  substanceEdges: readonly number[];
  /** Sitios que empiezan con habituación 1. */
  habituated: readonly number[];
  /** Copos del jugador que pide el objetivo y que da la placa sin mejoras. */
  foods: number;
  /** La Avena suma copos aquí (no en el Laberinto). */
  extraFoods: boolean;
  /** Lámparas que da la placa sin mejoras. */
  lamps: number;
  objective: PlateObjective;
  threshold: number;
  trailGoal: number;
  trailRate: number;
  habRate: number;
  spreadRate: number;
  /** Celda mínima (px) para que los botones de 44 px de los sitios no se solapen ni se salgan. */
  cellMin: number;
}

export const PLATES: readonly PlateDef[] = [
  // Tronco caído: el tutorial. Sobre corteza, sin lámparas; 4 copos. Semilla del generador: 79;
  // celda mínima 74 px.
  // prettier-ignore
  {
    id: 'log',
    cols: 5,
    rows: 4,
    grid: false,
    x: [
      0.705, 1.36, 2.492, 3.55, 4.496, 0.586, 1.499, 2.454, 3.492, 4.351,
      0.548, 1.366, 2.32, 3.572, 4.596, 0.566, 1.306, 2.613, 3.366, 4.634,
    ],
    y: [
      0.35, 0.479, 0.487, 0.577, 0.659, 1.533, 1.707, 1.391, 1.361, 1.411,
      2.557, 2.294, 2.431, 2.631, 2.424, 3.563, 3.601, 3.375, 3.695, 3.338,
    ],
    edges: [
      [6, 11], [0, 1], [15, 16], [4, 9], [3, 8], [17, 18], [10, 11], [8, 9], [2, 7], [14, 19],
      [5, 6], [3, 4], [11, 12], [12, 17], [6, 7], [10, 15], [5, 10], [7, 8], [9, 14], [13, 14],
      [7, 12], [2, 3], [13, 18], [5, 11], [6, 12], [1, 2], [3, 9], [0, 5], [13, 17], [1, 6],
      [12, 13], [13, 19], [10, 16], [1, 5], [11, 16], [18, 19], [16, 17], [2, 8], [8, 14], [4, 14],
      [0, 2],
    ],
    fixedFoods: [],
    blocked: [],
    substance: 'none',
    substanceEdges: [],
    habituated: [],
    foods: 4,
    extraFoods: true,
    lamps: 0,
    objective: 'quality',
    threshold: 0.66,
    trailGoal: 4.3e6,
    trailRate: 1,
    habRate: 0,
    spreadRate: 0,
    cellMin: 74,
  },
  // Laberinto: rejilla de 7×4; las paredes son los pares de celdas vecinas sin arista. La avena ya
  // está puesta en la entrada (0) y la salida (27). Semilla del generador: 79; celda mínima 54 px.
  // prettier-ignore
  {
    id: 'maze',
    cols: 7,
    rows: 4,
    grid: true,
    x: [
      0.568, 1.481, 2.486, 3.519, 4.554, 5.408, 6.455, 0.502, 1.477, 2.522,
      3.583, 4.545, 5.514, 6.558, 0.597, 1.558, 2.513, 3.574, 4.509, 5.442,
      6.59, 0.479, 1.437, 2.477, 3.482, 4.561, 5.558, 6.584,
    ],
    y: [
      0.589, 0.485, 0.446, 0.579, 0.439, 0.459, 0.452, 1.41, 1.438, 1.477,
      1.409, 1.514, 1.436, 1.547, 2.434, 2.59, 2.454, 2.41, 2.414, 2.523,
      2.501, 3.438, 3.553, 3.547, 3.55, 3.561, 3.515, 3.581,
    ],
    edges: [
      [0, 7], [7, 14], [14, 21], [21, 22], [15, 22], [15, 16], [16, 23], [23, 24], [24, 25], [25, 26],
      [26, 27], [20, 27], [19, 20], [18, 19], [17, 18], [10, 17], [9, 10], [8, 9], [1, 8], [1, 2],
      [2, 3], [3, 4], [4, 5], [5, 6], [6, 13], [12, 13], [11, 12], [8, 15], [18, 25], [16, 17],
      [5, 12], [19, 26],
    ],
    fixedFoods: [0, 27],
    blocked: [],
    substance: 'none',
    substanceEdges: [],
    habituated: [],
    foods: 0,
    extraFoods: false,
    lamps: 1,
    objective: 'length',
    threshold: 1.1,
    trailGoal: 1.6e8,
    trailRate: 10,
    habRate: 0,
    spreadRate: 0,
    cellMin: 54,
  },
  // Archipiélago: los sitios 4 y 5 (sierra) y 7, 8 y 14 (mar) tienen luz fija; sus aristas se secan
  // ×4. Semilla del generador: 41; celda mínima 76 px.
  // prettier-ignore
  {
    id: 'archipelago',
    cols: 6,
    rows: 4,
    grid: false,
    x: [
      0.603, 1.458, 2.622, 3.594, 4.677, 5.708, 0.324, 1.684, 2.681, 3.618,
      4.284, 5.378, 0.5, 1.357, 2.343, 3.492, 4.669, 5.628, 0.475, 1.605,
      2.701, 3.398, 4.291, 5.443,
    ],
    y: [
      0.671, 0.46, 0.536, 0.526, 0.499, 0.554, 1.382, 1.342, 1.581, 1.365,
      1.405, 1.525, 2.309, 2.61, 2.324, 2.51, 2.316, 2.682, 3.32, 3.386,
      3.589, 3.556, 3.341, 3.469,
    ],
    edges: [
      [9, 10], [20, 21], [0, 6], [17, 23], [13, 19], [8, 14], [3, 9], [0, 1], [12, 13], [1, 7],
      [21, 22], [6, 12], [8, 9], [2, 3], [4, 10], [10, 16], [12, 18], [7, 8], [5, 11], [13, 14],
      [16, 17], [4, 5], [2, 8], [15, 21], [11, 16], [3, 4], [16, 22], [10, 11], [19, 20], [3, 10],
      [18, 19], [13, 18], [9, 15], [15, 22], [22, 23], [14, 15], [1, 2], [7, 14], [11, 17], [2, 7],
      [4, 11], [0, 7], [14, 19], [14, 20], [15, 20], [6, 7], [16, 23], [7, 12], [6, 18],
    ],
    fixedFoods: [],
    blocked: [4, 5, 7, 8, 14],
    substance: 'none',
    substanceEdges: [],
    habituated: [],
    foods: 5,
    extraFoods: true,
    lamps: 1,
    objective: 'quality',
    threshold: 0.64,
    trailGoal: 3.3e12,
    trailRate: 100,
    habRate: 0,
    spreadRate: 0,
    cellMin: 76,
  },
  // Puente amargo: las 5 aristas que cruzan el río (x = 3,5) llevan quinina; la habituación empieza
  // en 0. Semilla del generador: 83; celda mínima 76 px.
  // prettier-ignore
  {
    id: 'bitterBridge',
    cols: 7,
    rows: 4,
    grid: false,
    x: [
      0.472, 1.54, 2.39, 3.489, 4.427, 5.329, 6.498, 0.46, 1.699, 2.293,
      3.601, 4.661, 5.619, 6.407, 0.716, 1.283, 2.366, 3.583, 4.551, 5.486,
      6.563, 0.562, 1.596, 2.49, 3.515, 4.376, 5.468, 6.32,
    ],
    y: [
      0.334, 0.376, 0.58, 0.564, 0.53, 0.454, 0.307, 1.677, 1.438, 1.528,
      1.301, 1.572, 1.307, 1.335, 2.386, 2.588, 2.448, 2.509, 2.673, 2.698,
      2.305, 3.516, 3.673, 3.513, 3.317, 3.294, 3.283, 3.317,
    ],
    edges: [
      [19, 26], [8, 9], [14, 15], [18, 25], [3, 10], [7, 14], [12, 13], [17, 24], [26, 27], [24, 25],
      [1, 2], [5, 12], [4, 5], [22, 23], [9, 16], [18, 19], [3, 4], [2, 9], [17, 18], [13, 20],
      [11, 12], [6, 13], [19, 27], [20, 27], [23, 24], [21, 22], [4, 11], [0, 1], [16, 23], [1, 8],
      [15, 16], [25, 26], [10, 11], [2, 3], [18, 26], [2, 8], [11, 18], [17, 25], [4, 10], [15, 22],
      [14, 21], [19, 20], [15, 21], [5, 6], [10, 17], [8, 16], [7, 15], [7, 8], [5, 11], [9, 10],
      [6, 12], [0, 7], [12, 20], [16, 22], [17, 23], [3, 9], [0, 8], [7, 21], [6, 20],
    ],
    fixedFoods: [7, 20],
    blocked: [],
    substance: 'quinine',
    substanceEdges: [4, 16, 24, 49, 54],
    habituated: [],
    foods: 3,
    extraFoods: true,
    lamps: 2,
    objective: 'quality',
    threshold: 0.58,
    trailGoal: 1.3e15,
    trailRate: 1000,
    habRate: 0.02,
    spreadRate: 0,
    cellMin: 76,
  },
  // Fusión: sal en las 61 aristas. Los 13 sitios con x < 3,5 empiezan habituados (el plasmodio de la
  // izquierda ya cruzó sal) y el de la derecha solo aprende al fundirse (η = 0, ζ = 0,3). Medido
  // sobre esta placa: con la referencia cumple a los 384 pasos, los dos copos fijos se separan en el
  // paso 1 y se funden en el 235; sin contagio no cumple nunca. Semilla del generador: 41; celda
  // mínima 70 px.
  // prettier-ignore
  {
    id: 'fusion',
    cols: 7,
    rows: 4,
    grid: false,
    x: [
      0.544, 1.483, 2.564, 3.623, 4.359, 5.672, 6.355, 0.569, 1.592, 2.641,
      3.453, 4.68, 5.713, 6.445, 0.317, 1.381, 2.599, 3.595, 4.509, 5.375,
      6.389, 0.7, 1.69, 2.438, 3.55, 4.354, 5.563, 6.427,
    ],
    y: [
      0.357, 0.593, 0.659, 0.362, 0.569, 0.688, 0.486, 1.29, 1.522, 1.667,
      1.694, 1.6, 1.453, 1.471, 2.486, 2.309, 2.615, 2.501, 2.687, 2.284,
      2.381, 3.658, 3.289, 3.65, 3.561, 3.658, 3.298, 3.629,
    ],
    edges: [
      [5, 6], [12, 13], [3, 4], [5, 12], [24, 25], [9, 10], [8, 15], [10, 17], [22, 23], [12, 19],
      [13, 20], [26, 27], [17, 18], [0, 7], [1, 8], [9, 16], [18, 19], [0, 1], [11, 19], [18, 25],
      [6, 13], [16, 17], [2, 9], [19, 20], [15, 22], [19, 26], [11, 12], [16, 23], [7, 8], [21, 22],
      [8, 9], [17, 24], [14, 15], [4, 11], [1, 2], [5, 13], [11, 18], [2, 3], [23, 24], [16, 22],
      [12, 20], [1, 7], [18, 26], [7, 14], [10, 11], [14, 21], [20, 26], [20, 27], [10, 16], [15, 16],
      [25, 26], [18, 24], [2, 8], [4, 5], [3, 10], [4, 10], [15, 21], [17, 23], [21, 23], [0, 2],
      [25, 27],
    ],
    fixedFoods: [14, 20],
    blocked: [],
    substance: 'salt',
    substanceEdges: [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
      40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
      60,
    ],
    habituated: [0, 1, 2, 7, 8, 9, 10, 14, 15, 16, 21, 22, 23],
    foods: 4,
    extraFoods: true,
    lamps: 2,
    objective: 'quality',
    threshold: 0.63,
    trailGoal: 6e17,
    trailRate: 10000,
    habRate: 0,
    spreadRate: 0.3,
    cellMin: 70,
  },
];

export const PLATE_IDS: readonly PlateId[] = PLATES.map((p) => p.id);

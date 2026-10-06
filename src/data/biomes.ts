/**
 * Viento de esporas (docs/ROADMAP.md, fases 8 y 10): biomas, constantes del viaje y adaptaciones
 * de bioma. Solo datos; el texto vive en src/i18n (`biome.<id>.*`, `badapt.<id>.*`).
 *
 * Los valores de la taiga y el Chocó salen del prototipo de balance de la fase 8 (9 semillas,
 * perfil activo, regla de PROMPT.md §17) y los de la pradera y la tundra, del de la fase 10 (C7,
 * mismas reglas); `npm run sim` confirma sus objetivos (docs/BALANCE.md). Las cifras de los
 * comentarios son de esos prototipos salvo donde se dice «simulador»: explican por qué se eligió
 * cada valor frente a sus alternativas, que el simulador no vuelve a medir.
 */
import type { VowId } from './cycle.ts';
import type { GeneratorId } from './generators.ts';
import { SPORE_SCALE } from './prestige.ts';
import type { RainEffectDef } from './rain.ts';

/**
 * Los biomas nuevos van al final: la sal del grano del suelo es la posición en esta lista
 * (render/network.ts), y la de los de antes no debe cambiar.
 */
export const BIOME_IDS = ['natal', 'taiga', 'choco', 'prairie', 'tundra'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];
export type DestinationId = Exclude<BiomeId, 'natal'>;
export const HOME_BIOME = 'natal' satisfies BiomeId;
/** Por anillos y, dentro de cada uno, en el orden en que se ofrecen (ver `ringOfLeg`). */
export const DESTINATION_IDS: readonly DestinationId[] = ['taiga', 'choco', 'prairie', 'tundra'];

export interface BiomeDef {
  id: BiomeId;
  /**
   * R del bioma cuando es el primer destino: requisito para esporular (N ganados en la partida)
   * y escala de la fórmula de esporas E = ⌊k √(L / R)⌋. El natal usa las constantes de
   * prestige.ts (hoy, ambas 1e8).
   */
  scale: number;
  /** Multiplicador de producción por generador; los que no aparecen rinden ×1. */
  production: Readonly<Partial<Record<GeneratorId, number>>>;
  /** Factor de la espera entre gotas: > 1 llueve menos, < 1 llueve más. */
  rainInterval: number;
  /** Probabilidades de los efectos de la gota; null = las de data/rain.ts. */
  rainEffects: readonly RainEffectDef[] | null;
  /** Segundos de producción que el Rocío da como mínimo (0 = sin mínimo). */
  dewFloorSeconds: number;
  /** La gota que no se atrapa cae sola al evaporarse (con el juego abierto) y aplica su efecto. */
  dropFallsAlone: boolean;
  /**
   * Anillo del viaje (fase 10): 0 el natal, 1 los bosques (taiga y Chocó) y 2 los biomas sin
   * bosque (pradera y tundra). Un anillo se abre cuando el anterior está colonizado entero.
   */
  ring: 0 | 1 | 2;
  /**
   * Factor de todos los generadores, constante del bioma (tundra 0,5). Se dice una vez en las
   * reglas y no en cada fila de la tienda, a diferencia de `production`.
   */
  productionFactor: number;
  /** Horas que suma al tope sin conexión mientras se vive aquí (tundra 24). */
  offlineHours: number;
  /**
   * Deshielo (tundra 8): de una ausencia más larga que estas horas, lo que pasa de ellas rinde sin
   * `productionFactor`. null = nunca. Ver systems/offline.ts.
   */
  thawAfterHours: number | null;
  /** R fija del tramo 5 (El regreso y el ciclo libre): requisito y escala de esporas allí. */
  cycleScale: number;
  /** Requisito para esporular en el tramo 5, en múltiplos de `cycleScale`. */
  cycleRequirement: number;
  /**
   * Factor de la R del ciclo por cada voto vigente (fase 10, bloque B): un voto quita algo y rebaja
   * la meta para compensar, y cuánto pesa lo que quita depende del bioma (con un factor común, la
   * taiga sin lluvia salía más rápida que sin votos). Un voto que no aparece no se ofrece aquí. Se
   * calibra en el régimen estable para que ningún voto acorte el ciclo (≥ 1,0× sin votos, también
   * «solo autocompra» con su umbral más rápido): si no, el voto sería la forma más rápida de sacar
   * récords. Con los de partida de la especificación (0,4, 0,6 y 0,6), en el natal «sin lluvia»
   * tardaba 2,04 veces lo que sin votos y en la taiga «sin mutaciones», 0,96 (simulador).
   */
  vowGoal: Readonly<Partial<Record<VowId, number>>>;
}

/**
 * Chocó: el doble de gotas con la mitad de probabilidad de Tormenta por gota, así que por hora
 * caen las mismas tormentas que en el natal. Sin este ajuste, las tormentas (×500 al clic)
 * dominaban: las partidas medianas bajaban a 22 min con el pasivo a 1,22× del activo.
 */
export const CHOCO_RAIN_EFFECTS: readonly RainEffectDef[] = [
  { kind: 'downpour', chance: 0.55, duration: 60 },
  { kind: 'dew', chance: 0.4, duration: 0 },
  { kind: 'storm', chance: 0.05, duration: 12 },
];

export const BIOMES: readonly BiomeDef[] = [
  {
    id: 'natal',
    scale: SPORE_SCALE,
    production: {},
    rainInterval: 1,
    rainEffects: null,
    dewFloorSeconds: 0,
    dropFallsAlone: false,
    ring: 0,
    productionFactor: 1,
    offlineHours: 0,
    thawAfterHours: null,
    // El regreso (y el natal en el ciclo libre), con la regla de la meta en el bot. Requisito 6: con
    // 3, el nivel pasaba 256 → 512 en la última partida, que cargaba con el 74 % de los nutrientes
    // y duraba 1:30 h (prototipo R). Escala: con la del prototipo, 6,3e13, El regreso se cumplía en
    // 2,94–3,12 h y las partidas de un orden pasaban de 35 min de mediana (35:50); con 5,2e13, aún
    // 35:05; con 4,8e13, 2,36–2,66 h, partidas de 26:47–30:53 y la más larga en 37:28–51:31
    // (simulador, los cuatro órdenes). En el ciclo libre, la misma: la primera vuelta lo cumple en
    // 2,29 h con partidas de 26:00 y la más larga en 41:59 (simulador).
    cycleScale: 4.8e13,
    cycleRequirement: 6,
    // Votos: aquí la lluvia pesa más que en ningún sitio (la Tormenta multiplica el clic ×500), y «sin
    // lluvia» pide ×0,15. Con factores que dejaban cada voto cerca de 1,0× en el régimen estable (0,12,
    // 0,25 y 0,45), los tres juntos tardaban 0,72 veces el ciclo sin votos; con estos, cada voto suelto
    // cuesta 1,10–1,28 y los tres juntos, 1,12–1,18 (simulador).
    vowGoal: { noRain: 0.15, autoOnly: 0.38, noMutations: 0.53 },
  },
  {
    // Red micorrícica y Árbol madre ×5: con ×3 las partidas medianas duraban 36:22 y colonizar,
    // 3,71 h (prototipo). Espera entre gotas ×2: con ×1,5 el pasivo tardaba 2,64 veces lo que el
    // activo. Escala: ver LEG_SCALE.
    id: 'taiga',
    scale: 1e11,
    production: { mycorrhiza: 5, motherTree: 5 },
    rainInterval: 2,
    rainEffects: null,
    dewFloorSeconds: 0,
    dropFallsAlone: false,
    ring: 1,
    productionFactor: 1,
    offlineHours: 0,
    thawAfterHours: null,
    // Ciclo libre (fase 10), valores de partida del prototipo R: con R ×1 la partida más larga de
    // la primera vuelta duraba 1:12–1:15; con 4,6e13 (×0,6) y requisito 5, 45:02–48:59. En el
    // simulador, 50:08 (contada desde la siembra, BUG-JOURNAL #28), partidas de 28:37 y el ciclo en
    // 2,59 h; en el régimen estable la más corta (sin la que cumple la meta) queda en 10:12, al borde
    // de los 10 min.
    cycleScale: 4.6e13,
    cycleRequirement: 5,
    // Votos: cada uno cuesta 1,06–1,11 veces el ciclo sin votos en el régimen estable, y los tres
    // juntos, 1,09–1,13 (simulador; con los factores justos para 1,0×, los tres daban 0,90). «Sin
    // mutaciones» era ×0,71: al recalibrar el Chocó (1.6.0) cambió el estado del que sale la matriz del
    // estable y ese voto quedaba en 0,98; con ×0,78, 1,11; con ×0,8, también 1,11, y su primera siembra
    // en 39:10.
    vowGoal: { noRain: 0.33, autoOnly: 0.56, noMutations: 0.8 },
  },
  {
    // Escala mayor que la de la taiga: la bonificación de la taiga cae en generadores medios y la
    // del Chocó en la lluvia, que rinde más en cuanto hay producción. El Rocío normal casi no
    // pesa (depende de las reservas): con ×1, ×2,5 o ×6, las partidas quedaban en 31–35 min;
    // el mínimo de 300 s de producción es lo que lo hace notar. Sin la gota que cae sola, el
    // pasivo tardaba 5,88 veces lo que el activo.
    id: 'choco',
    scale: 2e11,
    production: {},
    rainInterval: 0.5,
    rainEffects: CHOCO_RAIN_EFFECTS,
    dewFloorSeconds: 300,
    dropFallsAlone: true,
    ring: 1,
    productionFactor: 1,
    offlineHours: 0,
    thawAfterHours: null,
    // Ciclo libre: al límite en las dos direcciones, como ya decía el prototipo R. La más larga de la
    // primera vuelta es la cuarta partida, y el requisito decide cuánto nivel carga: con 5,4e14 y 6 R,
    // 1:04:24 (contada desde la siembra; la medida de antes, con la partida de espera delante, daba
    // 56:52, BUG-JOURNAL #28); con 7 R, como proponía la especificación, 1:09:23 (la cuarta carga más
    // nivel); con 5 R, 59:04, pero la primera partida del régimen estable bajaba a 9:36. Con 5e14 y
    // 6 R, el estable tenía partidas de 14:50 de mediana, por debajo de 15 min. Con 5e14 y 5,5 R, la
    // más larga en 58:45, el estable en 15:18 y su primera partida en 10:15 (simulador). Si hubiera
    // que elegir, manda la más larga ≤ 60 min: es el muro que la fase resuelve.
    cycleScale: 5e14,
    cycleRequirement: 5.5,
    // Votos: sin «sin lluvia» (Lloró está entre los lugares más lluviosos del planeta). Con «solo
    // autocompra» a ×1, el ciclo estable tardaba 1,35 veces el de sin votos con el umbral más rápido;
    // con ×0,7, 1,04 (y 1,35 con el umbral del 10 %). «Sin mutaciones» a ×0,6 tardaba 1,49; con ×0,35,
    // 1,07 (simulador).
    vowGoal: { autoOnly: 0.7, noMutations: 0.35 },
  },
  {
    // Chernozem. El motor es un generador barato, el quinto: Anillo de hadas ×6, medido también
    // con el pasivo, que tarda 2,17–2,34 veces el activo (simulador, mediana de cada orden; en el
    // prototipo C7, 2,23–2,42). En C7, con ×10 la partida más corta bajaba a 9:22, y con ×25 se
    // colonizaba en 1,19 h con partidas de 8 min. La lluvia es la palanca del pasivo: con la espera
    // ×1 tardaba 3,3–3,8 veces el activo (C7; la pradera existe donde llueve demasiado poco para un
    // bosque). Escala: con 9e10 (C7) la pradera tercera tenía la partida más larga en
    // 1:00:17–1:03:02, por encima de la hora; con 8,1e10 queda en 58:13–58:49 y coloniza en
    // 3,11–3,13 h, y la cuarta en 2,91–2,96 h (simulador).
    id: 'prairie',
    scale: 8.1e10,
    production: { fairyRing: 6 },
    rainInterval: 2,
    rainEffects: null,
    dewFloorSeconds: 0,
    dropFallsAlone: false,
    ring: 2,
    productionFactor: 1,
    offlineHours: 0,
    thawAfterHours: null,
    // Ciclo libre: con 4e13 (R) las partidas de la primera vuelta duraban 35:34 de mediana, por
    // encima de 35 min; con 3,7e13, 32:05, el ciclo en 2,99 h y la más larga en 55:26 (simulador).
    cycleScale: 3.7e13,
    cycleRequirement: 6,
    // Votos: al límite entre dos objetivos. En el régimen estable cada voto cuesta 1,06–1,12 veces
    // el ciclo sin votos (con el umbral más rápido); en la primera siembra tras El regreso, sus
    // partidas duran 46:10–47:20 (≤ 50 min). Con factores más bajos (0,28, 0,36 y 0,5) las partidas
    // bajaban a 39–41 min, pero el estable quedaba en 0,90–0,97: el voto acortaba el ciclo. Por eso
    // los tres juntos tardan 0,95–0,99 veces el de sin votos: subir los sueltos alargaría la primera
    // siembra pasado su objetivo. «Solo autocompra» era ×0,44: al recalibrar el Chocó (1.6.0) quedaba
    // en 1,00 con el umbral más rápido; con ×0,46, 1,07 (simulador).
    vowGoal: { noRain: 0.35, autoOnly: 0.46, noMutations: 0.59 },
  },
  {
    // Criosol. «Producción a la mitad, offline de 48 h» (ROADMAP): quien llega aquí tiene Sueño
    // invernal (24 h) y el bioma suma 24; sumar y no fijar en 48 deja algo también a quien tiene
    // Letargo profundo. Llueve un tercio (desierto polar): el pasivo tarda 1,94–2,01 veces el activo
    // (simulador, mediana de cada orden; en C7, 1,90–2,01). Escala: la tundra tercera coloniza en
    // 2,81–2,95 h y la cuarta, en 2,18–2,41 h (simulador; en C7, la cuarta en 2,18–2,46 h).
    //
    // Deshielo tras 8 h: sin él, la tundra fuera del juego rinde 0,5 · min(H, tope), nunca más que
    // otro bioma, y quien vuelve cada día tardaba 3 días en colonizarla frente a 2 de la pradera;
    // con él, 2 y 2 (simulador, perfil ausente). Una ausencia corta (cambiar de app, cerrar y abrir)
    // sigue rindiendo lo mismo que mirar: lo que se premia es irse una noche o más. Que fuera del
    // juego no rigiera el ×0,5 se descartó: en el móvil el sistema cierra la app al cambiar de
    // tarea, y cerrar y abrir rendiría el doble que mirar.
    id: 'tundra',
    scale: 3.5e9,
    production: {},
    rainInterval: 3,
    rainEffects: null,
    dewFloorSeconds: 0,
    dropFallsAlone: false,
    ring: 2,
    productionFactor: 0.5,
    offlineHours: 24,
    thawAfterHours: 8,
    // Ciclo libre: con 5e12 (R) las partidas de la primera vuelta duraban 35:01 de mediana; con
    // 4,6e12, 34:17 y el ciclo en 2,97 h (simulador).
    cycleScale: 4.6e12,
    cycleRequirement: 6,
    // Votos: como la pradera, al límite entre dos objetivos. «Solo autocompra» cuesta 1,04 veces en
    // el estable y sus partidas duran 48:46 en la primera siembra tras El regreso; con ×0,27 bajaban a
    // 43:21 y el estable quedaba en 0,93 (simulador). «Sin lluvia» era ×0,38: al recalibrar el Chocó
    // (1.6.0) quedaba en 0,99; con ×0,42, 1,04; con ×0,44, 1,06 y su primera siembra en 40:25.
    vowGoal: { noRain: 0.44, autoOnly: 0.36, noMutations: 0.62 },
  },
];

/**
 * R de un destino = su escala × LEG_SCALE[tramo] (la posición 0, el natal, no se usa: rige
 * prestige.ts). Es una tabla y no una potencia: con ×3,5 compuesto no había escala de tundra que
 * sirviera de tercera y de cuarta (partidas de 34:08 de tercera y de 18:54 de cuarta).
 *
 * Del primer destino al segundo, ×3,5: taiga 1e11 y luego 3,5e11; Chocó 2e11 y luego 7e11, los de
 * la 1.3–1.5 bit a bit. Con el ×3 del prototipo, el Chocó como segundo destino se colonizaba en
 * 1,90 h, por debajo del objetivo de 2 h; con ×3,5, en 2,06 h, y la taiga segunda en 2,48 h
 * (simulador). Con ×10 y linaje ×2, la taiga segunda tardaba 4,74 h (prototipo).
 *
 * Tramos 3 y 4 (fase 10): ×3,5 hasta el tercero y ×5 del tercero al cuarto (C7). Subir el factor
 * de crecimiento en lugar de escribir la tabla movía el Chocó segundo y la taiga segunda, que ya
 * están al borde de sus objetivos.
 */
export const LEG_SCALE: readonly number[] = [1, 1, 3.5, 12.25, 61.25];
/** Nivel local de esporas que coloniza un bioma (ROADMAP). Con 300, el Chocó segundo bajaba de 2 h. */
export const COLONIZE_LEVEL = 500;
/**
 * Esporas disponibles que cuesta dispersar. Fijo, a diferencia de los demás sumideros (×2 por
 * nivel): el nivel vuelve a 0 en cada bioma, así que el ingreso de esporas por bioma es plano
 * (576–742 al colonizar). Con 300 y luego 600 hacía falta una partida más de espera.
 */
export const DISPERSE_COST = 300;
/**
 * Linaje: producción ×2 por cada bioma colonizado fuera del natal (ρ = 2^c). Sin él, con R ×3,
 * el segundo bioma tardaba 4,0–5,5 h en colonizarse.
 */
export const LINEAGE_FACTOR = 2;
/** Tramos del viaje: uno por destino. */
export const JOURNEY_LEGS = DESTINATION_IDS.length;
/**
 * El regreso (fase 10): tras el cuarto destino, el linaje vuelve al natal en el tramo 5, y el
 * ciclo libre vive en ese mismo tramo. Así nada que lea `leg === 0` (el requisito de 1e8, el suelo
 * lineal de la 1.x, el Acto I) ni los tramos 1–4 cambia, y la Crónica se queda en seis entradas.
 * Se descartó un tramo que creciera con cada ciclo: la Crónica no tendría tope.
 */
export const RETURN_LEG = JOURNEY_LEGS + 1;
/** Tramos posibles: 0 = natal, uno por destino y El regreso. */
export const MAX_LEG = RETURN_LEG;
/**
 * Mitad del Acto I: haber tenido alguna vez una Red planetaria. Es el logro y no `owned`
 * porque `owned` se reinicia al esporular y el logro no: una partida 1.x que ya tuvo una Red
 * planetaria cierra el Acto I al cargar sin repetir nada.
 */
export const ACT_ONE_ACHIEVEMENT = 'own.planetary.1';

/** Las de la pradera y la tundra (fase 10) tienen su clave en el guardado desde la v7. */
export const BIOME_ADAPTATION_IDS = [
  'rockEating',
  'seedlingNetwork',
  'trehalose',
  'gongylidia',
  'leafcutters',
  'rootMat',
  'ringFront',
  'glomalin',
  'pilobolus',
  'dwarfBirch',
  'snowMold',
  'lichen',
] as const;
export type BiomeAdaptationId = (typeof BIOME_ADAPTATION_IDS)[number];

export type BiomeAdaptationEffect =
  /** Producción de los generadores × perRank^rango. */
  | { kind: 'generators'; targets: readonly GeneratorId[]; perRank: number }
  /** Unidades de regalo al empezar cada partida: perRank · rango. */
  | { kind: 'startUnits'; target: GeneratorId; perRank: number }
  /** Segundos extra del Aguacero: perRank · rango. */
  | { kind: 'downpourSeconds'; perRank: number }
  /** Clics automáticos por segundo, sin Tormenta: perRank · rango. */
  | { kind: 'autoClicks'; perRank: number }
  /** Rocío × perRank^rango. */
  | { kind: 'dew'; perRank: number }
  /** Horas de tope sin conexión, en todos los biomas: perRank · rango. */
  | { kind: 'offlineHours'; perRank: number };

export interface BiomeAdaptationDef {
  id: BiomeAdaptationId;
  /** Bioma donde se aprende. Una vez aprendida vale en todos. */
  biome: DestinationId;
  /** Coste del primer rango, en esporas. */
  baseCost: number;
  /** ×2 por rango: la regla común de los sumideros de esporas. */
  growth: number;
  max: number;
  /**
   * Nivel local que pide cada rango en su bioma (posición 0 = rango 1). Colonizarlo los abre
   * todos. Así el bioma se aprende mientras se vive en él y no de golpe al llegar.
   */
  rankLevels: readonly number[];
  effect: BiomeAdaptationEffect;
}

/**
 * Lo que pesa cada una, medido quitándola (primer bioma; el bot compra las demás): sin ninguna,
 * las partidas medianas duran 41:13 en la taiga y 43:51 en el Chocó (colonizar, 4,71 y 4,07 h);
 * con todas, 25:33 y 31:02.
 */
export const BIOME_ADAPTATIONS: readonly BiomeAdaptationDef[] = [
  {
    // Sin ella, partidas de 36:07 y colonizar en 4,04 h.
    id: 'rockEating',
    biome: 'taiga',
    baseCost: 100,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'generators', targets: ['mycorrhiza', 'motherTree'], perRank: 1.25 },
  },
  {
    // Sin ella, 31:19 y 3,35 h.
    id: 'seedlingNetwork',
    biome: 'taiga',
    baseCost: 150,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'startUnits', target: 'mycorrhiza', perRank: 3 },
  },
  {
    // Sin ella, 29:19 y 3,29 h.
    id: 'trehalose',
    biome: 'taiga',
    baseCost: 200,
    growth: 2,
    max: 2,
    rankLevels: [0, 150],
    effect: { kind: 'downpourSeconds', perRank: 10 },
  },
  {
    // Sin ella, 32:49 y 3,23 h.
    id: 'gongylidia',
    biome: 'choco',
    baseCost: 100,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'generators', targets: ['fairyRing'], perRank: 1.5 },
  },
  {
    // Sin ella, 31:41 y 3,06 h.
    id: 'leafcutters',
    biome: 'choco',
    baseCost: 150,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'autoClicks', perRank: 1 },
  },
  {
    // Sin ella, 39:35 y 3,85 h: es la que hace notar el Rocío del Chocó.
    id: 'rootMat',
    biome: 'choco',
    baseCost: 200,
    growth: 2,
    max: 2,
    rankLevels: [0, 150],
    effect: { kind: 'dew', perRank: 2 },
  },
  // Pradera y tundra (fase 10): los efectos medidos en el prototipo C7, con los mismos costes y
  // niveles que las de los bosques. Cambiar un efecto invalida la calibración de los tramos 3 y 4.
  {
    // El motor de la pradera es el Anillo de hadas: su adaptación lo empuja como los Gongilidios.
    id: 'ringFront',
    biome: 'prairie',
    baseCost: 150,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'generators', targets: ['fairyRing'], perRank: 1.5 },
  },
  {
    // Con +10 s de Aguacero por rango, como la Trehalosa, el pasivo pasaba de 2,5 veces el activo.
    id: 'glomalin',
    biome: 'prairie',
    baseCost: 100,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'generators', targets: ['mycorrhiza'], perRank: 1.25 },
  },
  {
    id: 'pilobolus',
    biome: 'prairie',
    baseCost: 200,
    growth: 2,
    max: 2,
    rankLevels: [0, 150],
    effect: { kind: 'autoClicks', perRank: 1 },
  },
  {
    id: 'dwarfBirch',
    biome: 'tundra',
    baseCost: 100,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'generators', targets: ['mycorrhiza', 'ancientForest'], perRank: 1.25 },
  },
  {
    id: 'snowMold',
    biome: 'tundra',
    baseCost: 150,
    growth: 2,
    max: 3,
    rankLevels: [0, 75, 300],
    effect: { kind: 'startUnits', target: 'motherTree', perRank: 2 },
  },
  {
    // No acelera el perfil activo: es la adaptación del que vuelve de vez en cuando, y vale en
    // todos los biomas como las demás (llevarla solo a la tundra rompería esa regla).
    id: 'lichen',
    biome: 'tundra',
    baseCost: 200,
    growth: 2,
    max: 2,
    rankLevels: [0, 150],
    effect: { kind: 'offlineHours', perRank: 12 },
  },
];

const BIOME_BY_ID = new Map(BIOMES.map((b) => [b.id, b]));
const ADAPTATION_BY_ID = new Map(BIOME_ADAPTATIONS.map((a) => [a.id, a]));

export function getBiome(id: BiomeId): BiomeDef {
  const def = BIOME_BY_ID.get(id);
  if (!def) throw new Error(`Bioma desconocido: ${id}`);
  return def;
}

export function isBiomeId(value: unknown): value is BiomeId {
  return typeof value === 'string' && BIOME_BY_ID.has(value as BiomeId);
}

export function isDestinationId(value: unknown): value is DestinationId {
  return isBiomeId(value) && value !== HOME_BIOME;
}

/**
 * Anillo del bioma de un tramo del viaje (1 en adelante), o -1 fuera del viaje. Como los anillos
 * se recorren enteros y en orden, el destino del tramo n es del anillo del n-ésimo de
 * DESTINATION_IDS: los tramos 1–2 van a un bosque y los 3–4, a un bioma sin bosque.
 */
export function ringOfLeg(leg: number): number {
  const id = DESTINATION_IDS[leg - 1];
  return id === undefined ? -1 : getBiome(id).ring;
}

export function getBiomeAdaptation(id: BiomeAdaptationId): BiomeAdaptationDef {
  const def = ADAPTATION_BY_ID.get(id);
  if (!def) throw new Error(`Adaptación de bioma desconocida: ${id}`);
  return def;
}

export function isBiomeAdaptationId(value: unknown): value is BiomeAdaptationId {
  return typeof value === 'string' && ADAPTATION_BY_ID.has(value as BiomeAdaptationId);
}

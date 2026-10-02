/**
 * Números del plasmodio (docs/ROADMAP.md, fase 9): el modelo de flujo, el reloj, el Rastro, las
 * mejoras y los logros propios. Cada constante dice de dónde sale. «Medido» quiere decir medido con
 * el prototipo del modelo sobre las placas fijas (src/data/plasmodium-plates.ts) o con
 * `npm run sim` (docs/BALANCE.md, bloque del plasmodio). Ver ARCHITECTURE.md §4.29.
 */

// ---------------------------------------------------------------------------------------
// Modelo de flujo (Tero et al. 2010, con fuente por turno e integrador exponencial)

/** Exponente de la respuesta al flujo f(q) = q^γ / (1 + q^γ). Tero et al. (2010). */
export const GAMMA = 1.8;
/**
 * Tasa de secado r. Medido con r = 1 y Δ = 0,1 (el código del juego desde la placa recién abierta,
 * semillas 3, 7 y 11, con las colocaciones de referencia de tests/plasmodium-model.test.ts): la red
 * se estabiliza en 2–10 min de modelo (Archipiélago 2, Tronco 3, Fusión 6, Puente 10). La
 * excepción es el Puente con la Memoria externa y la colocación de la Quimiotaxis: cumple a los
 * ~14 min y se estabiliza a los ~17.
 */
export const DECAY = 1;
/** La luz multiplica el secado por 1 + λ = 4: el plasmodio rehúye la luz. Medido. */
export const LIGHT_LAMBDA = 3;
/**
 * Secado extra de un tubo con sustancia sin habituar (×61): su equilibrio queda por debajo de
 * D_ALIVE, así que el tubo no se sostiene hasta que el plasmodio se acostumbra. Medido.
 */
export const SUBSTANCE_BETA = 60;
/**
 * Memoria externa: los tubos sin flujo se secan el doble de rápido (Reid et al. 2012), salvo los que
 * llevan sustancia. Medido sobre las placas fijas con la colocación de referencia (como DECAY): el
 * objetivo llega a los 44 s en el Tronco (sin ella, 130) y a los 31 s en el Archipiélago (59); en
 * el Puente poda más (red más barata y menos tolerante): la referencia ya no cumple, y la que
 * sugiere la Quimiotaxis cumple casi siempre (19 de 20 temblores poniendo los copos uno a uno, con
 * 30 s entre copos y Humedad 0; puesta de una vez, con algún temblor no cumple).
 */
export const MEMORY_FACTOR = 2;
/** f(|Q|) por debajo de esto cuenta como «sin flujo» para la Memoria externa. */
export const NOFLOW = 0.01;
/** La placa empieza cubierta: todas las aristas con D = 1. */
export const D0 = 1;
/** Suelo de la conductividad: la laplaciana sigue siendo definida positiva y el solver no falla. */
export const D_FLOOR = 1e-4;
/** Un tubo está vivo por encima de esto (sin histéresis: con la fuente por turno no parpadea). */
export const D_ALIVE = 0.05;
/** «Se está secando»: D en (D_DRYING, D_ALIVE]. */
export const D_DRYING = 0.01;
/**
 * Re-expansión al cambiar copos, lámparas o caudal: cada tubo sube a max(D, 0,3). Sin esto el
 * modelo no revive un camino seco (medido: 13 de 27 historias del Tronco bajo el umbral; con 0,3,
 * ninguna).
 */
export const RESPREAD = 0.3;
/** Temblor de D al abrir o extender la placa: rompe empates simétricos con el azar propio. */
export const OPEN_JITTER = 0.02;
/** Una lámpara alumbra las aristas con algún extremo a esta distancia (en celdas). */
export const LAMP_RADIUS = 0.75;
/** I0 = 1,5·√(F − 1): la redundancia de la red se mantiene al sumar copos. Medido. */
export const I0_SCALE = 1.5;
/** Caudal Bajo, Medio (por defecto) y Alto: multiplica I0. Solo en placas ya cartografiadas. */
export const FLOW_FACTORS = [0.5, 1, 2] as const;
/** Caudal con el que se cartografía (la frontera siempre lo usa): Medio. */
export const DEFAULT_FLOW = 1;
/** Δ por paso del modelo. Medido. */
export const DELTA_BASE = 0.1;
/** Humedad: Δ × 1,5 por nivel. Medido. */
export const HUMIDITY_FACTOR = 1.5;
/** Tope de Δ (el integrador es estable con cualquier Δ; el tope mantiene el ritmo medido). */
export const DELTA_MAX = 0.3;

// ---------------------------------------------------------------------------------------
// Reloj, pulso, estabilidad y tiempo aplicado de golpe

/** Un segundo de modelo, en ms del reloj del socio (enteros: sin deriva de coma flotante). */
export const MODEL_SECOND_MS = 1000;
/**
 * Tope del contador de pasos de una placa, que solo reparte el turno de la fuente: al pasarlo
 * vuelve a empezar, y es inocuo. En juego no se alcanza (sube 1–2 por segundo de modelo y vuelve a
 * 0 en cada placa: son más de 15 años). Protege de un guardado editado: desde 2^53, step + 1 ya no
 * cambia, la fuente queda fija y la placa no cumple nunca (Number.isSafeInteger no basta: 2^53 − 1
 * pasa y se clava al primer paso).
 */
export const MAX_STEP = 1e9;
/**
 * Segundos que se aplican paso a paso en una sola llamada; el resto va al ritmo final. Medido: con
 * 1.200 el Rastro de 8 h de golpe sale a ×1,000 del de 8 h en vivo (con 600, entre 0,64 y 1,14).
 * Coste de vaciar 8 h (Node 24, escritorio, un proceso nuevo por medida): en caliente, 8–10 ms de
 * mediana en la Fusión, con máximos de 17–21 ms; la primera llamada, en frío, 20–27 ms en la Fusión
 * y el Puente. La fría es la del arranque (llega el trozo del modelo y vacía el pendiente en un
 * frame): más de un frame en escritorio y unos 100 ms con la CPU ×4 de un móvil medio, un tirón
 * único al volver. Es la excepción a ARCHITECTURE.md §2 (§4.29).
 */
export const CATCHUP_STEPPED_SECONDS = 1200;
/** Vaciar al menos esto de golpe da el aviso «Mientras no estabas, el plasmodio dejó…». */
export const CAUGHT_UP_NOTICE_SECONDS = 60;
/** Segundos seguidos cumpliendo el objetivo para fructificar (y para mejorar un mapa). */
export const STABLE_SECONDS = 60;
/** Al fallar el objetivo, la estabilidad baja 2 por segundo: un tropiezo no lo borra todo. */
export const STABLE_DRAIN = 2;
/** Pulso: adelanta 3 pasos de adaptación, deja 3 s de Rastro y se recarga en 3 s. */
export const PULSE_STEPS = 3;
export const PULSE_TRAIL_SECONDS = 3;
export const PULSE_COOLDOWN = 3;
/** Lluvia en la placa: una gota del bosque humedece el agar 30 s (2 pasos por segundo). */
export const MOIST_SECONDS = 30;
export const MOIST_STEPS = 2;
/** Tras fructificar, la placa siguiente se abre sola a los 60 s de modelo. */
export const LINGER_SECONDS = 60;

/** Llega en una partida posterior a la del Acto I, a los 5 min de esa partida. */
export const ARRIVAL_RUN_SECONDS = 300;

/** Tope del tiempo apuntado sin estar en vivo: 8 h, o 24 h con Latencia. */
export const OFFLINE_CAP_SECONDS = 8 * 3600;
export const DORMANCY_CAP_SECONDS = 24 * 3600;
/** Eficiencia offline: 50 %, o 100 % con Latencia. En vivo y en segundo plano, 100 %. */
export const OFFLINE_EFFICIENCY = 0.5;
/** Tope del pendiente guardado (el mayor de los topes). */
export const MAX_PENDING_MS = DORMANCY_CAP_SECONDS * 1000;

/** Sal de la semilla propia: mixSeed(rngSeed, sal), leyendo la común sin avanzarla. */
export const PLASMODIUM_SEED_SALT = 0x504c4153;

// ---------------------------------------------------------------------------------------
// Rastro y mejoras

/** Agar nutritivo: Rastro × 1,5 por nivel (con ×2 en 4 niveles se agotaban los sumideros). Medido. */
export const AGAR_FACTOR = 1.5;

export type PlasmodiumUpgradeId =
  'agar' | 'oats' | 'lamps' | 'humidity' | 'dormancy' | 'chemotaxis' | 'memory';

export interface PlasmodiumUpgradeDef {
  id: PlasmodiumUpgradeId;
  /** Coste del nivel n: base × 2^n, en Rastro. */
  baseCost: number;
  max: number;
  /** Placas cartografiadas para que aparezca. */
  fromMapped: number;
}

/** Costes, topes y apariciones medidos con el bot del simulador (docs/BALANCE.md). */
export const PLASMODIUM_UPGRADES: readonly PlasmodiumUpgradeDef[] = [
  // Sin tope práctico: el bot de npm run sim:plasmodio compra 5–16 niveles por placa (16, 5, 14, 9
  // y 9; 5 en el Laberinto), casi igual en los tres perfiles y las 9 semillas.
  { id: 'agar', baseCost: 50, max: 60, fromMapped: 0 },
  // +1 copo por nivel (no en el Laberinto).
  { id: 'oats', baseCost: 2000, max: 3, fromMapped: 0 },
  { id: 'lamps', baseCost: 5e6, max: 2, fromMapped: 1 },
  { id: 'humidity', baseCost: 1e7, max: 2, fromMapped: 1 },
  // Offline al 100 % y tope de 24 h.
  { id: 'dormancy', baseCost: 5e7, max: 1, fromMapped: 1 },
  // Marca el sitio sugerido para el siguiente copo.
  { id: 'chemotaxis', baseCost: 1e8, max: 1, fromMapped: 2 },
  // Poda: la red converge antes (ver MEMORY_FACTOR).
  { id: 'memory', baseCost: 1e11, max: 1, fromMapped: 2 },
];

export const PLASMODIUM_UPGRADE_IDS: readonly PlasmodiumUpgradeId[] = PLASMODIUM_UPGRADES.map((u) => u.id);

export function getPlasmodiumUpgrade(id: PlasmodiumUpgradeId): PlasmodiumUpgradeDef {
  const def = PLASMODIUM_UPGRADES.find((u) => u.id === id);
  if (!def) throw new Error(`Mejora del plasmodio desconocida: ${id}`);
  return def;
}

export function isPlasmodiumUpgradeId(value: unknown): value is PlasmodiumUpgradeId {
  return PLASMODIUM_UPGRADE_IDS.includes(value as PlasmodiumUpgradeId);
}

// ---------------------------------------------------------------------------------------
// Logros propios: no suman al +1 % global (docs/ROADMAP.md, reglas comunes)

export type PlasmodiumAchievementId =
  'firstOat' | 'log' | 'maze' | 'archipelago' | 'bitter' | 'fusion' | 'cutProof' | 'noPulse';

export const PLASMODIUM_ACHIEVEMENT_IDS: readonly PlasmodiumAchievementId[] = [
  'firstOat',
  'log',
  'maze',
  'archipelago',
  'bitter',
  'fusion',
  'cutProof',
  'noPulse',
];

/** Los secretos no se muestran hasta conseguirlos. */
export const SECRET_PLASMODIUM_ACHIEVEMENTS: readonly PlasmodiumAchievementId[] = ['noPulse'];

/** Logro de cartografiar cada placa, en el orden de PLATES. */
export const PLATE_ACHIEVEMENTS: readonly PlasmodiumAchievementId[] = [
  'log',
  'maze',
  'archipelago',
  'bitter',
  'fusion',
];

export function isPlasmodiumAchievementId(value: unknown): value is PlasmodiumAchievementId {
  return PLASMODIUM_ACHIEVEMENT_IDS.includes(value as PlasmodiumAchievementId);
}

// ---------------------------------------------------------------------------------------
// Correspondencias con la red de hongos

/** Poda: la autocompra puede elegir por amortización desde 1 placa cartografiada. */
export const PRUNING_MAPPED = 1;
/** Camino corto: Esporular muestra el ritmo de esporas desde 2 placas cartografiadas. */
export const SHORT_PATH_MAPPED = 2;
/** El caudal se puede cambiar desde 2 placas cartografiadas (y solo en placas con mapa). */
export const FLOW_MAPPED = 2;
/** Compras por segundo como mucho en el modo de amortización de la autocompra. */
export const PAYBACK_MAX_PER_SECOND = 10;

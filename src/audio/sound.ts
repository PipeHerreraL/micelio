/**
 * Motor de sonido sintetizado (PROMPT.md §14). Todo sale de osciladores y ruido de Web
 * Audio: sin archivos que descargar ni licencias que rastrear, y el build no crece.
 * El sonido solo acompaña lo que ya se ve en pantalla (§16); nunca es la única pista.
 */

export type SoundCue = 'plop' | 'chime' | 'chord' | 'drip' | 'spore' | 'wind';

export interface SoundEngine {
  /**
   * Llamar en cada interacción del jugador (pointerup/click, touchend, keydown): crea o
   * reanuda el AudioContext. Antes de esto el juego está mudo. Un pointerdown táctil no
   * cuenta como gesto para el navegador (solo pointerup/touchend lo hacen), así que
   * engancharlo solo ahí deja el juego mudo en móvil. Llamarlo de más es inocuo.
   */
  unlock(): void;
  /** Activa/desactiva y fija el volumen (0..1, el del ajuste). */
  configure(enabled: boolean, volume: number): void;
  play(cue: SoundCue): void;
  destroy(): void;
}

// Con el volumen por defecto (0.35) la mezcla queda cerca de −20 dBFS: se oye, pero por
// debajo de un vídeo o una llamada que suenen a la vez. Un juego idle pasa horas abierto.
const MASTER_FACTOR = 0.6;

// Las rampas exponenciales no pueden llegar a cero; por debajo de esto ya no se oye la cola.
const SILENT = 0.0001;

// Programar un poco por delante evita que el ataque caiga en el pasado cuando el hilo
// principal llega tarde, que se oiría como un chasquido.
const LOOKAHEAD = 0.01;

// Separación mínima entre dos disparos del mismo sonido, en ms. El clic rápido pasa de
// 15 por segundo y la autocompra puede comprar decenas de cosas en un tick: sin tope, los
// sonidos se apilan en un zumbido áspero.
const MIN_GAP_MS: Record<SoundCue, number> = {
  plop: 50,
  chime: 170,
  chord: 400,
  drip: 120,
  spore: 1500,
  wind: 3000,
};

// Respaldo por si coinciden muchos sonidos largos (acordes, esporulación): más voces no
// suman información y sí carga de CPU en móviles.
const MAX_VOICES = 24;

// Margen tras pedir resume() en el que aún se acepta programar con el contexto detenido,
// en ms. Cubre el plop del primer clic (resume() resuelve un poco después del gesto) sin
// dejar que una reanudación que nunca llega acumule sonidos para soltarlos de golpe.
const RESUME_GRACE_MS = 250;

// Sonidos que pueden quedar en cola con el contexto detenido. Si el navegador no llega a
// arrancarlo, sus voces nunca terminan y ocupan hueco para siempre; y si arranca, todo lo
// encolado suena a la vez. Con uno solo se conserva el primer plop y nada más.
const MAX_QUEUED = 1;

// Duración del búfer de ruido compartido. Se crea una vez; cada uso arranca en un punto
// al azar para que el mismo ruido repetido no acabe sonando a patrón.
const NOISE_SECONDS = 2;

// Campanilla: la razón 2.76 es inarmónica (la de una barra metálica) y es lo que separa
// una campanilla de un pitido de órgano. Los parciales altos se apagan antes, como en
// una campana real.
const CHIME_PARTIALS: readonly { ratio: number; amp: number; decay: number }[] = [
  { ratio: 1, amp: 0.22, decay: 0.7 },
  { ratio: 2.76, amp: 0.07, decay: 0.45 },
  { ratio: 5.4, amp: 0.025, decay: 0.25 },
];

// Tres alturas de una pentatónica (mi, fa sostenido, la): una racha de compras no repite
// siempre la misma nota y cualquier combinación sigue siendo consonante.
const CHIME_ROOTS: readonly number[] = [659.25, 739.99, 880];

// Do mayor en posición abierta (do4, sol4, mi5): cálido y amplio sin llegar a chillón.
const CHORD_NOTES: readonly number[] = [261.63, 392.0, 659.25];

// La mayor grave (la2, mi3, la3, do sostenido4): consonante y lo bastante bajo para
// sonar a algo que se suelta bajo tierra.
const SPORE_NOTES: readonly number[] = [110, 164.81, 220, 277.18];

interface AudioGlobal {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/** Nodos de un sonido: se desconectan todos cuando terminan sus fuentes. */
interface Voice {
  readonly ctx: AudioContext;
  readonly nodes: AudioNode[];
  readonly sources: AudioScheduledSourceNode[];
}

type CueBuilder = (v: Voice, out: AudioNode, t: number, noise: AudioBuffer) => void;

function audioContextCtor(): typeof AudioContext | undefined {
  // Safari antiguo solo expone el prefijo; sin Web Audio (o en las pruebas con Node) no
  // hay ninguno y el motor queda mudo sin fallar.
  const g: AudioGlobal = globalThis;
  return g.AudioContext ?? g.webkitAudioContext;
}

function pick(list: readonly number[], fallback: number): number {
  return list[Math.floor(Math.random() * list.length)] ?? fallback;
}

/** Factor de afinación al azar en [1 − spread, 1 + spread]. */
function wobble(spread: number): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

function gainNode(v: Voice, dest: AudioNode): GainNode {
  const g = v.ctx.createGain();
  g.connect(dest);
  v.nodes.push(g);
  return g;
}

function filterNode(
  v: Voice,
  dest: AudioNode,
  type: BiquadFilterType,
  freq: number,
  q: number,
): BiquadFilterNode {
  const f = v.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(dest);
  v.nodes.push(f);
  return f;
}

function tone(
  v: Voice,
  dest: AudioNode,
  type: OscillatorType,
  freq: number,
  start: number,
  stop: number,
): OscillatorNode {
  const o = v.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  o.connect(dest);
  o.start(start);
  o.stop(stop);
  v.nodes.push(o);
  v.sources.push(o);
  return o;
}

function noiseSource(v: Voice, dest: AudioNode, buffer: AudioBuffer, start: number, stop: number): void {
  const s = v.ctx.createBufferSource();
  s.buffer = buffer;
  // En bucle: el soplo largo de la esporulación dura más que el búfer.
  s.loop = true;
  s.connect(dest);
  s.start(start, Math.random() * buffer.duration);
  s.stop(stop);
  v.nodes.push(s);
  v.sources.push(s);
}

/** Ataque lineal desde cero y caída exponencial: el perfil de algo que se pulsa o golpea. */
function pluck(param: AudioParam, start: number, attack: number, peak: number, end: number): void {
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(peak, start + attack);
  param.exponentialRampToValueAtTime(SILENT, end);
}

/** Crecida y desvanecimiento exponenciales: el oído las percibe como una curva pareja. */
function swell(param: AudioParam, start: number, top: number, peak: number, end: number): void {
  param.setValueAtTime(SILENT, start);
  param.exponentialRampToValueAtTime(peak, top);
  param.exponentialRampToValueAtTime(SILENT, end);
}

const plop: CueBuilder = (v, out, t, noise) => {
  // Tono algo distinto en cada clic (±8 %): cien clics idénticos cansan; variados suenan
  // a burbujas.
  const r = wobble(0.08);
  const body = gainNode(v, out);
  pluck(body.gain, t, 0.005, 0.5, t + 0.13);
  const o = tone(v, body, 'sine', 420 * r, t, t + 0.14);
  // La caída rápida de tono es lo que convierte un seno en burbuja y no en pitido.
  o.frequency.exponentialRampToValueAtTime(150 * r, t + 0.09);

  // Un roce de ruido muy corto da el «contacto» orgánico del dedo.
  const touch = gainNode(v, out);
  pluck(touch.gain, t, 0.002, 0.06, t + 0.03);
  const band = filterNode(v, touch, 'bandpass', 2200 * r, 1.5);
  noiseSource(v, band, noise, t, t + 0.04);
};

const chime: CueBuilder = (v, out, t) => {
  const root = pick(CHIME_ROOTS, 880);
  for (const p of CHIME_PARTIALS) {
    const g = gainNode(v, out);
    pluck(g.gain, t, 0.003, p.amp, t + p.decay);
    tone(v, g, 'sine', root * p.ratio, t, t + p.decay + 0.02);
  }
};

const chord: CueBuilder = (v, out, t) => {
  const end = t + 1.5;
  const warm = filterNode(v, out, 'lowpass', 1600, 0.7);
  CHORD_NOTES.forEach((freq, i) => {
    // Un rasgueo de 40 ms entre notas suena tocado a mano, no a acorde de máquina.
    const start = t + i * 0.04;
    const g = gainNode(v, warm);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.1, start + 0.18);
    g.gain.exponentialRampToValueAtTime(SILENT, end);
    tone(v, g, 'triangle', freq, start, end + 0.02);
    // Un segundo oscilador desafinado unos cents: el batido lento da calidez.
    const twin = tone(v, g, 'sine', freq, start, end + 0.02);
    twin.detune.value = 7;
  });
};

function bloop(v: Voice, dest: AudioNode, t: number, r: number, peak: number): void {
  const g = gainNode(v, dest);
  pluck(g.gain, t, 0.004, peak, t + 0.12);
  const o = tone(v, g, 'sine', 500 * r, t, t + 0.13);
  // Una gota que cae en agua resuena subiendo de tono: la cavidad de aire se cierra.
  o.frequency.exponentialRampToValueAtTime(1300 * r, t + 0.07);
}

const drip: CueBuilder = (v, out, t) => {
  const r = wobble(0.05);
  bloop(v, out, t, r, 0.3);
  // Eco: la misma gota más débil y apagada, como si rebotara en una cavidad del suelo.
  const far = filterNode(v, out, 'lowpass', 1400, 0.7);
  bloop(v, far, t + 0.16, r, 0.07);
};

const spore: CueBuilder = (v, out, t, noise) => {
  const top = t + 1.2;
  const end = t + 2.5;

  // Ruido filtrado cuyo filtro se abre y se cierra: el soplo de las esporas al soltarse.
  const air = gainNode(v, out);
  swell(air.gain, t, top, 0.12, end);
  const band = filterNode(v, air, 'bandpass', 400, 0.8);
  band.frequency.setValueAtTime(400, t);
  band.frequency.exponentialRampToValueAtTime(1600, top);
  band.frequency.exponentialRampToValueAtTime(500, end);
  noiseSource(v, band, noise, t, end + 0.05);

  const pad = gainNode(v, out);
  swell(pad.gain, t, top, 0.07, end);
  const low = filterNode(v, pad, 'lowpass', 900, 0.7);
  for (const freq of SPORE_NOTES) tone(v, low, 'triangle', freq, t, end + 0.05);
};

/**
 * Ráfaga de dispersar (fase 8): solo ruido, sin notas, con el filtro abriéndose de grave a medio.
 * Crece despacio durante el brillo de la red y llega a su máximo con la ráfaga de esporas (~1 s
 * después del evento, ver render/network.ts), así suena a viento que se lleva algo y no a golpe.
 */
const wind: CueBuilder = (v, out, t, noise) => {
  const top = t + 1.1;
  const end = t + 2.4;
  const air = gainNode(v, out);
  swell(air.gain, t, top, 0.14, end);
  const band = filterNode(v, air, 'bandpass', 300, 0.8);
  band.frequency.setValueAtTime(300, t);
  band.frequency.exponentialRampToValueAtTime(900, top);
  band.frequency.exponentialRampToValueAtTime(450, end);
  noiseSource(v, band, noise, t, end + 0.05);
};

const CUES: Record<SoundCue, CueBuilder> = { plop, chime, chord, drip, spore, wind };

export function createSoundEngine(): SoundEngine {
  let ctx: AudioContext | null = null;
  let bus: AudioNode | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let enabled = true;
  let volume = 0.35;
  let gestureSeen = false;
  let resumeRequestedAt = -Infinity;
  let queued = 0;
  let destroyed = false;
  let voices = 0;
  const lastPlayed: Record<SoundCue, number> = {
    plop: -Infinity,
    chime: -Infinity,
    chord: -Infinity,
    drip: -Infinity,
    spore: -Infinity,
    wind: -Infinity,
  };

  function level(): number {
    return enabled ? volume * MASTER_FACTOR : 0;
  }

  function applyLevel(): void {
    if (ctx === null || master === null) return;
    const now = ctx.currentTime;
    const g = master.gain;
    g.cancelScheduledValues(now);
    if (!enabled) {
      g.setValueAtTime(0, now);
      return;
    }
    // Rampa corta: arrastrar el deslizador de volumen a saltos se oiría como chasquidos.
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(level(), now + 0.03);
  }

  function resume(c: AudioContext): void {
    // «interrupted» (Safari en iOS tras una llamada) también se recupera con resume().
    if (c.state === 'running' || c.state === 'closed') return;
    resumeRequestedAt = performance.now();
    // Se pide en cada gesto aunque haya otra petición pendiente: sin gesto válido Chrome
    // no rechaza la promesa, la deja colgada para siempre, y solo una llamada hecha con
    // activación del usuario arranca el contexto. Repetirla es inocuo: al arrancar se
    // resuelven todas las pendientes.
    c.resume().then(
      () => undefined,
      () => undefined,
    );
  }

  function ensureContext(): AudioContext | null {
    if (ctx !== null) return ctx;
    const Ctor = audioContextCtor();
    if (Ctor === undefined) return null;
    let c: AudioContext;
    try {
      c = new Ctor();
    } catch {
      // Algunos navegadores lanzan al superar su cupo de contextos de audio; solo se
      // pierde el sonido.
      return null;
    }

    // Compresión suave en el bus: si coinciden compra, logro y gota, el pico no salta
    // de golpe por encima del resto de la mezcla.
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    const m = c.createGain();
    m.gain.value = level();
    comp.connect(m);
    m.connect(c.destination);

    // Al arrancar, lo encolado ya está sonando: se libera el cupo de la cola para la
    // próxima vez que el navegador detenga el contexto.
    c.addEventListener('statechange', () => {
      if (c.state === 'running') queued = 0;
    });

    const length = Math.floor(c.sampleRate * NOISE_SECONDS);
    const buf = c.createBuffer(1, length, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    ctx = c;
    bus = comp;
    master = m;
    noise = buf;
    return c;
  }

  function track(v: Voice): void {
    voices += 1;
    let pending = v.sources.length;
    const finished = (): void => {
      pending -= 1;
      if (pending > 0) return;
      for (const node of v.nodes) node.disconnect();
      voices = Math.max(0, voices - 1);
    };
    for (const s of v.sources) s.addEventListener('ended', finished, { once: true });
  }

  return {
    unlock(): void {
      if (destroyed) return;
      gestureSeen = true;
      // Con el sonido silenciado no se abre el dispositivo de audio: en portátiles y
      // móviles mantenerlo despierto gasta batería sin motivo.
      if (!enabled) return;
      const c = ensureContext();
      if (c !== null) resume(c);
    },

    configure(on: boolean, vol: number): void {
      enabled = on;
      volume = Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 0;
      applyLevel();
      // Activar el sonido desde Ajustes es un clic: si ya hubo gesto, se puede abrir el
      // contexto aquí sin esperar a otra interacción.
      if (enabled && gestureSeen && !destroyed) {
        const c = ensureContext();
        if (c !== null) resume(c);
      }
    },

    play(cue: SoundCue): void {
      if (ctx === null || bus === null || noise === null || !enabled || volume <= 0) return;
      // Reloj de pared y no currentTime: este no avanza con el contexto suspendido.
      const now = performance.now();
      // Programar con el contexto detenido haría sonar todo de golpe al reanudar; solo se
      // admite lo justo para no perder el sonido del gesto que lo está despertando.
      const running = ctx.state === 'running';
      if (!running && (queued >= MAX_QUEUED || now - resumeRequestedAt > RESUME_GRACE_MS)) return;
      if (voices >= MAX_VOICES) return;
      if (now - lastPlayed[cue] < MIN_GAP_MS[cue]) return;
      lastPlayed[cue] = now;

      const v: Voice = { ctx, nodes: [], sources: [] };
      try {
        CUES[cue](v, bus, ctx.currentTime + LOOKAHEAD, noise);
      } catch {
        // Un fallo de Web Audio solo pierde este sonido; el juego no debe enterarse.
        for (const node of v.nodes) node.disconnect();
        return;
      }
      track(v);
      if (!running) queued += 1;
    },

    destroy(): void {
      destroyed = true;
      const c = ctx;
      ctx = null;
      bus = null;
      master = null;
      noise = null;
      voices = 0;
      queued = 0;
      if (c === null || c.state === 'closed') return;
      // Cerrar libera el dispositivo de audio; si falla, el navegador lo libera al
      // descargar la página.
      c.close().then(
        () => undefined,
        () => undefined,
      );
    },
  };
}

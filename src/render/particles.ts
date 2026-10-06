/**
 * Partículas del canvas de la red: un pool de tamaño fijo (PROMPT.md §16).
 *
 * Todo vive en arreglos tipados reservados al crear el pool. Generar, mover y dibujar no
 * crea objetos, así que el recolector de basura no interrumpe la animación. Las posiciones
 * van normalizadas a [0, 1] para que un cambio de tamaño no las descoloque.
 */

/** Tono micelio (motas, brillo de logro, esporas). */
export const PARTICLE_CREAM = 0;
/** Tono fuego fatuo: reservado a la lluvia (ARCHITECTURE.md §11). */
export const PARTICLE_GLOW = 1;
/** Las esporas de la esporulación: crema, o el color de la Esporada (fase 10). */
export const PARTICLE_SPORE = 2;

/** Opacidad máxima: las partículas acompañan, no tapan la red. */
const PARTICLE_ALPHA = 0.85;
/** El sprite tiene halo: se dibuja unas veces más grande que el núcleo de la partícula. */
const SPRITE_SPREAD = 2.6;

export interface ParticlePool {
  /**
   * Activa una partícula. Con el pool lleno reutiliza la ranura más antigua según el cursor
   * circular, así que nunca crece más allá del tope.
   */
  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    ay: number,
    life: number,
    size: number,
    tone: number,
  ): void;
  update(dt: number): void;
  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
    cream: CanvasImageSource,
    glow: CanvasImageSource,
    spore: CanvasImageSource,
  ): void;
  clear(): void;
  activeCount(): number;
}

export function createParticlePool(capacity: number): ParticlePool {
  const px = new Float32Array(capacity);
  const py = new Float32Array(capacity);
  const vx = new Float32Array(capacity);
  const vy = new Float32Array(capacity);
  const ay = new Float32Array(capacity);
  const age = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const size = new Float32Array(capacity);
  const tone = new Uint8Array(capacity);
  const on = new Uint8Array(capacity);
  let active = 0;
  let cursor = 0;

  return {
    spawn(x, y, svx, svy, say, slife, ssize, stone) {
      if (capacity === 0 || slife <= 0) return;
      let slot = -1;
      for (let n = 0; n < capacity; n++) {
        const k = (cursor + n) % capacity;
        if (on[k] === 0) {
          slot = k;
          break;
        }
      }
      if (slot < 0) slot = cursor;
      else active++;
      px[slot] = x;
      py[slot] = y;
      vx[slot] = svx;
      vy[slot] = svy;
      ay[slot] = say;
      age[slot] = 0;
      life[slot] = slife;
      size[slot] = ssize;
      tone[slot] = stone;
      on[slot] = 1;
      cursor = (slot + 1) % capacity;
    },

    update(dt) {
      if (active === 0) return;
      for (let k = 0; k < capacity; k++) {
        if (on[k] !== 1) continue;
        const a = (age[k] ?? 0) + dt;
        if (a >= (life[k] ?? 0)) {
          on[k] = 0;
          active--;
          continue;
        }
        age[k] = a;
        const v = (vy[k] ?? 0) + (ay[k] ?? 0) * dt;
        vy[k] = v;
        px[k] = (px[k] ?? 0) + (vx[k] ?? 0) * dt;
        py[k] = (py[k] ?? 0) + v * dt;
      }
    },

    draw(ctx, width, height, scale, cream, glow, spore) {
      if (active === 0) return;
      for (let k = 0; k < capacity; k++) {
        if (on[k] !== 1) continue;
        const total = life[k] ?? 1;
        // Campana suave: aparece y se apaga sin parpadeos (PROMPT.md §16).
        const bell = Math.sin((Math.PI * (age[k] ?? 0)) / total);
        if (bell <= 0) continue;
        const r = (size[k] ?? 1) * scale * SPRITE_SPREAD;
        ctx.globalAlpha = bell * PARTICLE_ALPHA;
        const t = tone[k];
        ctx.drawImage(
          t === PARTICLE_GLOW ? glow : t === PARTICLE_SPORE ? spore : cream,
          (px[k] ?? 0) * width - r,
          (py[k] ?? 0) * height - r,
          r * 2,
          r * 2,
        );
      }
      ctx.globalAlpha = 1;
    },

    clear() {
      on.fill(0);
      active = 0;
    },

    activeCount() {
      return active;
    },
  };
}

/**
 * Tope de los avisos de objetivo y de mapa de un socio (main.ts): como mucho uno de cada tipo cada
 * 10 s (docs/ROADMAP.md, fase 9), sin que el tope deje al lector con un estado falso.
 *
 * - Con un modal abierto no se avisa ni se gasta el tope: la región aria-live global es inerte y
 *   el aviso se leería al cerrar, quizá ya caducado. La placa ampliada (un modal) dice los cambios
 *   de objetivo en su propia región.
 * - Un objetivo que se calla (por el tope o por el modal) no se pierde: al terminar la ventana, o
 *   al cerrarse el modal, se anuncia el estado vigente si difiere del último anunciado. «Cumple» y
 *   enseguida «ya no cumple» no puede quedarse en «cumple».
 * - Un mapa mejorado que se calla sí se pierde: es un dato más de la placa, que ya lo muestra.
 */
import type { PartnerEvent } from '../partners/registry.ts';

/** Mínimo entre dos avisos del mismo tipo (spec §12.4). */
const PARTNER_NOTICE_GAP_MS = 10_000;

/**
 * Lo último que se dijo del objetivo, se dijera aquí o en la región propia de la placa ampliada
 * (que lo anota con noteGoalAnnounced): al cerrar el diálogo no se repite lo que ya se oyó dentro.
 */
let lastGoal: boolean | null = null;

/** La vista del socio dijo el objetivo en su propia región (placa ampliada). */
export function noteGoalAnnounced(met: boolean): void {
  lastGoal = met;
}

export interface PartnerNoticeGateDeps {
  /** Reloj en ms (performance.now en el juego). */
  now(): number;
  modalOpen(): boolean;
  /** El objetivo vigente del socio; null si no hay socio. */
  goalMet(): boolean | null;
  /** Avisa (toast, sonido, anuncio). false si no salió nada (sin catálogo): el tope no se gasta. */
  deliver(event: PartnerEvent): boolean;
}

export interface PartnerNoticeGate {
  /** Un evento de objetivo o de mapa; los demás se avisan sin tope. */
  offer(event: PartnerEvent): void;
  /** El último modal se cerró (ui/modal.ts, onModalClosed). */
  modalClosed(): void;
  dispose(): void;
}

export function createPartnerNoticeGate(deps: PartnerNoticeGateDeps): PartnerNoticeGate {
  const lastAt = new Map<string, number>();
  /** Un cambio de objetivo se calló y falta decir el estado vigente. */
  let goalOwed = false;
  let timer: number | undefined;

  const sinceLast = (kind: string): number => deps.now() - (lastAt.get(kind) ?? Number.NEGATIVE_INFINITY);

  function send(event: PartnerEvent): void {
    if (!deps.deliver(event)) return;
    lastAt.set(event.kind, deps.now());
    if (event.kind === 'goal') {
      lastGoal = event.met;
      goalOwed = false;
    }
  }

  /** Dice el objetivo vigente si se calló un cambio y ya se puede. */
  function settle(): void {
    window.clearTimeout(timer);
    timer = undefined;
    if (!goalOwed || deps.modalOpen()) return;
    const wait = PARTNER_NOTICE_GAP_MS - sinceLast('goal');
    if (wait > 0) {
      timer = window.setTimeout(settle, wait);
      return;
    }
    goalOwed = false;
    const met = deps.goalMet();
    if (met === null || met === lastGoal) return;
    send({ type: 'plasmodium', kind: 'goal', met });
  }

  return {
    offer(event) {
      if (event.kind !== 'goal' && event.kind !== 'mapImproved') {
        deps.deliver(event);
        return;
      }
      const held = deps.modalOpen() || sinceLast(event.kind) < PARTNER_NOTICE_GAP_MS;
      if (!held) {
        send(event);
        return;
      }
      if (event.kind === 'goal') {
        goalOwed = true;
        if (timer === undefined) settle();
      }
    },
    modalClosed() {
      settle();
    },
    dispose() {
      window.clearTimeout(timer);
      timer = undefined;
    },
  };
}

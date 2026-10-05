/**
 * Reparto del simulador de la red entre hilos (fase 10): el viaje pasa de dos órdenes a cuatro y
 * se alarga con El regreso y el ciclo, y en un solo hilo `npm run sim` ya tardaba 165 s. Medido
 * en el PC del usuario (6 núcleos, 12 hilos lógicos): 169 s con 1 hilo, 58 s con 4 y 36 s con 11.
 *
 * Cada tarea de scripts/sim-play.ts es una función pura de su entrada, que le llega copiada (el
 * structured clone de `postMessage`); el resultado vuelve igual. Así lo que sale no depende de
 * cuántos hilos haya ni de cuál juegue cada tarea: tests/sim-pool.test.ts lo comprueba con 1 y 4
 * hilos. Con 0 hilos las tareas corren en el hilo principal con las mismas copias (pruebas y
 * depuración).
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { runTask, type SimTask, type SimTaskResult } from './sim-play.ts';

export interface SimPool {
  /** Juega la tarea en el primer hilo libre, por orden de llegada. */
  run<T extends SimTask>(task: T): Promise<SimTaskResult<T>>;
  /** Cierra los hilos. Hay que llamarlo siempre, también si una tarea falló: si no, Node no sale. */
  close(): Promise<void>;
}

/** Lo que devuelve un hilo por cada tarea (scripts/sim-worker.ts). */
export type WorkerReply =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

interface Pending {
  id: number;
  task: SimTask;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Hilos de `npm run sim`: `SIM_WORKERS` si está (0 = en el hilo principal), y si no, uno menos que
 * los núcleos lógicos, porque el hilo principal solo reparte y espera.
 */
export function poolSize(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['SIM_WORKERS'];
  if (raw === undefined || raw === '') return Math.max(1, availableParallelism() - 1);
  const size = Number(raw);
  if (!Number.isInteger(size) || size < 0) throw new Error(`SIM_WORKERS debe ser un entero ≥ 0: «${raw}»`);
  return size;
}

export function createPool(size: number): SimPool {
  return size === 0 ? inlinePool() : threadPool(size);
}

function inlinePool(): SimPool {
  return {
    run<T extends SimTask>(task: T): Promise<SimTaskResult<T>> {
      // Las mismas copias que hace postMessage: la tarea no toca el objeto de quien llama, y el
      // estado empieza sin la caché de derivados, como en un hilo.
      return Promise.resolve().then(
        () => structuredClone(runTask(structuredClone(task))) as SimTaskResult<T>,
      );
    },
    close: () => Promise.resolve(),
  };
}

function threadPool(size: number): SimPool {
  const queue: Pending[] = [];
  const idle: Worker[] = [];
  const busy = new Map<Worker, Pending>();
  const workers: Worker[] = [];
  let nextId = 0;
  let closed = false;

  /** Hace fallar todo lo pendiente: un informe con tareas de menos no se escribe. */
  const failAll = (error: Error): void => {
    closed = true;
    for (const job of [...busy.values(), ...queue.splice(0)]) job.reject(error);
    busy.clear();
  };

  const spawn = (): Worker => {
    const worker = new Worker(new URL('./sim-worker.ts', import.meta.url));
    worker.on('message', (reply: WorkerReply) => {
      const job = busy.get(worker);
      busy.delete(worker);
      idle.push(worker);
      if (job?.id !== reply.id) {
        failAll(new Error(`Respuesta ${reply.id} de un hilo que no tenía esa tarea`));
        return;
      }
      if (reply.ok) job.resolve(reply.result);
      else job.reject(new Error(reply.error));
      dispatch();
    });
    // Un error fuera de una tarea (el hilo no arrancó, se quedó sin memoria) tumba el hilo, y sin
    // él podría quedar una tarea esperando para siempre.
    worker.on('error', failAll);
    workers.push(worker);
    return worker;
  };

  const dispatch = (): void => {
    while (queue.length > 0 && !closed) {
      const worker = idle.pop() ?? (workers.length < size ? spawn() : undefined);
      if (!worker) return;
      const job = queue.shift();
      if (!job) return;
      busy.set(worker, job);
      worker.postMessage({ id: job.id, task: job.task });
    }
  };

  return {
    run<T extends SimTask>(task: T): Promise<SimTaskResult<T>> {
      if (closed) return Promise.reject(new Error('El reparto del simulador ya está cerrado'));
      return new Promise<unknown>((resolve, reject) => {
        queue.push({ id: nextId, task, resolve, reject });
        nextId += 1;
        dispatch();
      }) as Promise<SimTaskResult<T>>;
    },
    async close(): Promise<void> {
      failAll(new Error('El reparto del simulador se cerró'));
      await Promise.all(workers.map((w) => w.terminate()));
    },
  };
}

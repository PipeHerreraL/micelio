/**
 * Un hilo del simulador de la red (scripts/sim-pool.ts): juega cada tarea que le llega y devuelve
 * el resultado, o el error con su traza para que la corrida falle con él.
 */
import { parentPort } from 'node:worker_threads';
import { runTask, type SimTask } from './sim-play.ts';
import type { WorkerReply } from './sim-pool.ts';

const port = parentPort;
if (!port) throw new Error('scripts/sim-worker.ts solo corre como hilo de scripts/sim-pool.ts');

port.on('message', (message: { id: number; task: SimTask }) => {
  let reply: WorkerReply;
  try {
    reply = { id: message.id, ok: true, result: runTask(message.task) };
  } catch (error) {
    reply = {
      id: message.id,
      ok: false,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    };
  }
  port.postMessage(reply);
});

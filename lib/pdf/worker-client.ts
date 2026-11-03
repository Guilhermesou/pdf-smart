import {
  isWorkerResponse,
  type WorkerRequest,
  type WorkerResponse,
} from './worker-protocol';
import type { ExportProgress } from './runtime';
export const WORKER_TIMEOUT_MS = 120_000;

/** One in-flight request per worker; all terminal paths detach handlers and timers. */
export function requestWorker(
  worker: Worker,
  request: WorkerRequest,
  options: {
    expected: 'ready' | 'result' | 'ocr-result';
    ocrProgress?: (stage: string, percent: number) => void;
    signal: AbortSignal;
    progress?: (progress: ExportProgress) => void;
    transfer?: Transferable[];
    timeoutMs?: number;
  },
): Promise<
  Exclude<WorkerResponse, { type: 'progress' | 'error' | 'ocr-progress' }>
> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      reject(error);
    };
    const abort = () => fail(new Error('Operação encerrada.'));
    const timer = setTimeout(
      () =>
        fail(new Error('O worker de PDF excedeu o prazo de processamento.')),
      options.timeoutMs ?? WORKER_TIMEOUT_MS,
    );
    if (options.signal.aborted) {
      abort();
      return;
    }
    options.signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (settled) return;
      const response = event.data;
      if (!isWorkerResponse(response)) {
        fail(new Error('Resposta inválida do worker.'));
        return;
      }
      if (response.type === 'ocr-progress') {
        try {
          options.ocrProgress?.(response.stage, response.percent);
        } catch (error) {
          fail(error);
        }
        return;
      }
      if (response.type === 'progress') {
        try {
          options.progress?.(response.progress);
        } catch (error) {
          fail(error);
        }
        return;
      }
      if (response.type === 'error') {
        fail(new Error(response.error));
        return;
      }
      if (response.type !== options.expected) {
        fail(new Error('Resposta inesperada do worker.'));
        return;
      }
      settled = true;
      cleanup();
      resolve(response);
    };
    worker.onerror = () => fail(new Error('Falha no worker de PDF.'));
    worker.onmessageerror = () =>
      fail(new Error('Não foi possível ler a resposta do worker.'));
    try {
      worker.postMessage(request, options.transfer ?? []);
    } catch (error) {
      fail(error);
    }
  });
}

import {
  createWorker,
  PSM,
  type Worker as TesseractWorker,
} from 'tesseract.js';
import { isOcrRequest, type WorkerResponse } from './worker-protocol';
const stages: Record<string, string> = {
  'loading tesseract core': 'Carregando motor OCR',
  'initializing tesseract': 'Inicializando OCR',
  'loading language traineddata': 'Carregando modelo de idioma',
  'initializing api': 'Preparando leitura',
  'recognizing text': 'Reconhecendo carimbo e texto',
};
/** Host logic is independently testable; only the entry point references a Worker global. */
export function createOcrWorkerHost(
  post: (response: WorkerResponse) => void,
  create = createWorker,
) {
  let worker: TesseractWorker | undefined;
  return {
    dispose: async () => {
      const previous = worker;
      worker = undefined;
      await previous?.terminate();
    },
    handle: async (data: unknown) => {
      try {
        if (!isOcrRequest(data)) throw new Error('Pedido de OCR inválido.');
        if (data.type === 'ocr-start') {
          await worker?.terminate();
          worker = undefined;
          worker = await create('eng', 1, {
            ...data.assets,
            workerBlobURL: false,
            errorHandler: () => {},
            logger: (event) =>
              post({
                type: 'ocr-progress',
                stage: stages[event.status] ?? 'Preparando OCR',
                percent: Math.min(
                  100,
                  Math.max(0, Math.round(event.progress * 100)),
                ),
              }),
          });
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          });
        } else {
          if (!worker) throw new Error('OCR não inicializado.');
          if (data.type === 'ocr-parameters')
            await worker.setParameters(data.parameters);
          else {
            const { data: result } = await worker.recognize(data.image);
            post({
              type: 'ocr-result',
              data: { text: result.text, confidence: result.confidence },
            });
            return;
          }
        }
        post({ type: 'ready', ready: true });
      } catch (error) {
        await worker?.terminate();
        worker = undefined;
        post({
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

import { isTauri, invoke } from '@tauri-apps/api/core';
import {
  nativeOcrEngine,
  type NativeResult,
  emptyOcrDiagnostics,
  type OcrEngine,
} from './native-ocr';
export type OcrAssets = {
  workerPath: string;
  corePath: string;
  langPath: string;
};
/** Asset locations are injected here so a desktop host can supply bundled OCR. */
async function createWebOcrWorker(
  onProgress: (stage: string, percent: number) => void,
  assets: OcrAssets = {
    workerPath: new URL('/ocr/worker.min.js', window.location.origin).href,
    corePath: new URL('/ocr/core', window.location.origin).href,
    langPath: isTauri()
      ? new URL('/ocr/lang', window.location.origin).href
      : 'https://tessdata.projectnaptha.com/4.0.0',
  },
) {
  const { createWorker, PSM } = await import('tesseract.js');
  const stages: Record<string, string> = {
    'loading tesseract core': 'Carregando motor OCR',
    'initializing tesseract': 'Inicializando OCR',
    'loading language traineddata': 'Carregando modelo de idioma',
    'initializing api': 'Preparando leitura',
    'recognizing text': 'Reconhecendo carimbo e texto',
  };
  const worker = await createWorker('eng', 1, {
    ...assets,
    errorHandler: () => {},
    logger: (event) =>
      onProgress(
        stages[event.status] ?? 'Preparando OCR',
        Math.min(100, Math.max(0, Math.round(event.progress * 100))),
      ),
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const stats = emptyOcrDiagnostics();
    return {
      recognize: async (canvas: HTMLCanvasElement) => {
        const started = performance.now();
        stats.tesseractCalls++;
        try {
          return await worker.recognize(canvas);
        } finally {
          stats.tesseractMs += performance.now() - started;
        }
      },
      setParameters: worker.setParameters,
      terminate: worker.terminate,
      diagnostics: () => ({ ...stats }),
    };
  } catch (error) {
    await worker.terminate();
    throw error;
  }
}

export async function createOcrWorker(
  onProgress: (stage: string, percent: number) => void,
  preference: 'auto' | 'tesseract' = 'auto',
): Promise<OcrEngine> {
  const fallback = () => createWebOcrWorker(onProgress);
  if (preference === 'auto' && isTauri()) {
    try {
      return await nativeOcrEngine(
        (command, args) => invoke<NativeResult>(command, args),
        onProgress,
        fallback,
      );
    } catch (error) {
      const web = await fallback();
      const diagnostics = web.diagnostics;
      web.diagnostics = () => ({
        ...(diagnostics?.() ?? emptyOcrDiagnostics()),
        fallbackReason: String(error),
      });
      onProgress('OCR nativo indisponível · preparando alternativa', 0);
      return web;
    }
  }
  return fallback();
}

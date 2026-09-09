export type OcrAssets = {
  workerPath: string;
  corePath: string;
  langPath: string;
};
/** Asset locations are injected here so a desktop host can supply bundled OCR. */
export async function createOcrWorker(
  onProgress: (stage: string, percent: number) => void,
  assets: OcrAssets = {
    workerPath: new URL('/ocr/worker.min.js', window.location.origin).href,
    corePath: new URL('/ocr/core', window.location.origin).href,
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
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
    return worker;
  } catch (error) {
    await worker.terminate();
    throw error;
  }
}

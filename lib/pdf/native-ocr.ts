import { canvasBlob } from './runtime';
export type NativeResult = {
  text: string;
  confidence: number;
  engine: string;
  acceleration:
    | 'system'
    | 'neural-engine-available'
    | 'neural-engine-requested'
    | 'system-fallback';
  error?: string;
  elapsedMs?: number;
};
export type OcrDiagnostics = {
  appleCalls: number;
  tesseractCalls: number;
  appleMs: number;
  tesseractMs: number;
  transferMs: number;
  neuralRequests: number;
  fallbackReason?: string;
};
export const emptyOcrDiagnostics = (): OcrDiagnostics => ({
  appleCalls: 0,
  tesseractCalls: 0,
  appleMs: 0,
  tesseractMs: 0,
  transferMs: 0,
  neuralRequests: 0,
});
export type OcrEngine = {
  diagnostics?: () => OcrDiagnostics;
  recognize: (
    canvas: HTMLCanvasElement,
  ) => Promise<{ data: { text: string; confidence: number } }>;
  setParameters: (parameters: {
    tessedit_pageseg_mode: import('tesseract.js').PSM;
  }) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};
export type NativeInvoke = (
  command: string,
  args: { image: string | null },
) => Promise<NativeResult>;
export async function nativeOcrEngine(
  invoke: NativeInvoke,
  progress: (stage: string, percent: number) => void,
  fallback: () => Promise<OcrEngine>,
): Promise<OcrEngine> {
  const probe = await invoke('native_ocr', { image: null });
  if (probe.error || probe.engine !== 'apple-vision')
    throw Error(probe.error ?? 'Motor não disponível');
  progress(
    probe.acceleration === 'neural-engine-available'
      ? 'Apple Vision · Neural Engine disponível'
      : 'Apple Vision · seleção automática',
    100,
  );
  const stats = emptyOcrDiagnostics();
  let web: OcrEngine | undefined;
  let parameters: Parameters<OcrEngine['setParameters']>[0] | undefined;
  return {
    diagnostics: () => ({
      ...stats,
      tesseractCalls: web?.diagnostics?.().tesseractCalls ?? 0,
      tesseractMs: web?.diagnostics?.().tesseractMs ?? 0,
    }),
    async recognize(canvas) {
      if (web) return web.recognize(canvas);
      try {
        const started = performance.now();
        progress('Apple Vision · preparando imagem', 0);
        const blob = await canvasBlob(canvas, 'image/png');
        const image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        progress('Apple Vision · reconhecendo texto', 0);
        const result = await invoke('native_ocr', { image });
        const elapsed = performance.now() - started;
        stats.appleCalls++;
        stats.appleMs += result.elapsedMs ?? 0;
        stats.transferMs += Math.max(0, elapsed - (result.elapsedMs ?? 0));
        if (result.error) throw Error(result.error);
        if (result.acceleration === 'neural-engine-requested')
          stats.neuralRequests++;
        progress(
          result.acceleration === 'neural-engine-requested'
            ? 'Apple Vision · Neural Engine solicitado'
            : 'Apple Vision · processamento automático',
          100,
        );
        return { data: { text: result.text, confidence: result.confidence } };
      } catch (error) {
        stats.fallbackReason =
          error instanceof Error ? error.message : String(error);
        progress('Motor nativo indisponível · usando OCR alternativo', 0);
        web = await fallback();
        if (parameters) await web.setParameters(parameters);
        return web.recognize(canvas);
      }
    },
    async setParameters(next) {
      parameters = next;
      await web?.setParameters(next);
    },
    async terminate() {
      await web?.terminate();
    },
  };
}

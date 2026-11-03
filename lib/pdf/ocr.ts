import { isTauri, invoke } from '@tauri-apps/api/core';
import {
  nativeOcrEngine,
  type NativeResult,
  emptyOcrDiagnostics,
  type OcrEngine,
} from './native-ocr';
import { requestWorker } from './worker-client';
import { withAbort } from './runtime';
import type { OcrAssets } from './worker-protocol';
export type { OcrAssets } from './worker-protocol';

async function createWebOcrWorker(
  onProgress: (stage: string, percent: number) => void,
  signal: AbortSignal,
  assets: OcrAssets = {
    workerPath: new URL('/ocr/worker.min.js', window.location.origin).href,
    corePath: new URL('/ocr/core', window.location.origin).href,
    langPath: new URL('/ocr/lang', window.location.origin).href,
  },
): Promise<OcrEngine> {
  if (signal.aborted) throw new Error('Operação encerrada.');
  const host = new Worker(new URL('./ocr.worker.ts', import.meta.url), {
    type: 'module',
  });
  let available = true;
  const request = async (
    data: import('./worker-protocol').OcrRequest,
    expected: 'ready' | 'ocr-result',
  ) => {
    if (!available) throw new Error('O motor OCR foi encerrado nesta análise.');
    try {
      return await requestWorker(host, data, {
        expected,
        signal,
        timeoutMs: 30_000,
        ocrProgress: onProgress,
      });
    } catch (error) {
      available = false;
      throw error;
    }
  };
  try {
    await request({ type: 'ocr-start', assets }, 'ready');
    const stats = emptyOcrDiagnostics();
    return {
      recognize: async (canvas) => {
        if (!available)
          throw new Error('O motor OCR foi encerrado nesta análise.');
        const started = performance.now();
        stats.tesseractCalls++;
        try {
          // Encoding is bounded by the analysis canvas size and avoids a missing toBlob callback.
          const result = await request(
            { type: 'ocr-recognize', image: canvas.toDataURL('image/png') },
            'ocr-result',
          );
          if (result.type !== 'ocr-result')
            throw new Error('Leitura OCR indisponível.');
          return { data: result.data };
        } finally {
          stats.tesseractMs += performance.now() - started;
        }
      },
      setParameters: (parameters) =>
        request({ type: 'ocr-parameters', parameters }, 'ready'),
      terminate: async () => {
        available = false;
        host.terminate();
      },
      diagnostics: () => ({ ...stats }),
    };
  } catch (error) {
    host.terminate();
    throw error;
  }
}

export async function createOcrWorker(
  onProgress: (stage: string, percent: number) => void,
  preference: 'auto' | 'tesseract' = 'auto',
  signal = new AbortController().signal,
): Promise<OcrEngine> {
  const fallback = () => createWebOcrWorker(onProgress, signal);
  if (preference === 'auto' && isTauri()) {
    try {
      return await nativeOcrEngine(
        (command, args) =>
          withAbort(invoke<NativeResult>(command, args), signal),
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

import { createOcrWorker } from './ocr';
import { evaluatePage } from './evaluate-page';
import type { PageItem, AnalysisProgress, AnalysisOptions } from './types';
import { yieldTask } from './runtime';
import { analysisCache } from './analysis-cache';
import { recognizeScanStamp, scanRegion, scanNeedsReview } from './scan';
import { shouldRunOcr, withoutPageNumbers, type Verdict } from './detection';
export async function analyzePages(
  pages: PageItem[],
  options: AnalysisOptions,
  onProgress: (s: string) => void,
  cancel: { current: boolean },
  onPage: ((page: PageItem, index: number) => void) | undefined,
  onDetail: ((progress: AnalysisProgress) => void) | undefined,
  renderPage: (page: PageItem, width: number) => Promise<HTMLCanvasElement>,
) {
  let worker:
    | Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>
    | undefined;
  const result: PageItem[] = [];
  const started = performance.now();
  let cachedPages = 0;
  let lastDetailTime = 0;
  const detail = (stage: string, pageProgress?: number, force = false) => {
    const now = performance.now();
    if (force || now - lastDetailTime > 100) {
      lastDetailTime = now;
      onDetail?.({
        current: activePage,
        completed: result.length,
        total: pages.length,
        page: result[activePage - 1] ?? pages[activePage - 1],
        stage,
        pageProgress,
        elapsedSeconds: Math.floor((performance.now() - started) / 1000),
        cachedPages,
      });
    }
  };
  let failed = 0,
    ocrUnavailable = false,
    activePage = 0;
  try {
    for (let i = 0; i < pages.length; i++) {
      if (cancel.current) break;
      const p = pages[i];
      activePage = i + 1;
      onProgress(`Analisando página ${i + 1} de ${pages.length}`);
      detail('Inspeção visual', undefined, true);
      await yieldTask();
      const ink = options.ignoreBorders ? (p.interiorInk ?? p.ink) : p.ink;
      let ocrStatus: Verdict['ocrStatus'] = options.ocr
        ? 'not-needed'
        : 'disabled';
      let scanReview = false;
      let scanMetrics: { ink: number; paleInk: number } | undefined;
      const key = `${p.source}:${p.index}`;
      const cached = analysisCache.get(key) ?? {};
      let reused = false;
      let text = p.text,
        confidence = 100;
      // Searchable scans can contain an OCR layer describing bleed-through.
      // Inspect rendered evidence before applying the extracted-text OCR gate.
      if (options.scanMode && p.source) {
        if (cached.visual) {
          scanMetrics = cached.visual;
          scanReview = scanNeedsReview(
            withoutPageNumbers(p.text),
            cached.visual.ink,
            cached.visual.boxArea,
            true,
          );
          reused = true;
        } else {
          const visual = await renderPage({ ...p, rotation: 0 }, 700);
          try {
            const metrics = scanRegion(
              visual
                .getContext('2d')!
                .getImageData(0, 0, visual.width, visual.height).data,
              visual.width,
              visual.height,
            );
            scanReview = scanNeedsReview(
              withoutPageNumbers(p.text),
              metrics.ink,
              metrics.boxArea,
              true,
            );
            scanMetrics = metrics;
            cached.visual = metrics;
          } finally {
            visual.width = 0;
          }
        }
      }
      if (options.ocr && (scanReview || shouldRunOcr(text, ink)) && p.source) {
        try {
          const ocrKey = options.scanMode ? 'scanOcr' : 'plainOcr';
          let recognized = cached[ocrKey];
          if (recognized) {
            reused = true;
            detail('Reutilizando leitura anterior', undefined, true);
          } else {
            if (ocrUnavailable)
              throw new Error('OCR indisponível nesta análise.');
            if (!worker) {
              onProgress('Preparando reconhecimento de carimbos…');
              detail('Preparando OCR', undefined, true);
              worker = await createOcrWorker((stage, percent) =>
                detail(stage, percent),
              );
            }
            detail('Preparando imagem para leitura', undefined, true);
            const canvas = await renderPage({ ...p, rotation: 0 }, 1500);
            try {
              recognized = options.scanMode
                ? await recognizeScanStamp(
                    worker,
                    canvas,
                    (w, h) => {
                      const c = document.createElement('canvas');
                      c.width = w;
                      c.height = h;
                      return c;
                    },
                    withoutPageNumbers(p.text),
                    () => cancel.current,
                    true,
                  )
                : { ...(await worker.recognize(canvas)), review: false };
              if (!cancel.current) cached[ocrKey] = recognized;
            } finally {
              canvas.width = 0;
            }
          }
          const { data } = recognized;
          scanReview = recognized.review;
          if ('scan' in recognized) scanMetrics = recognized.scan;
          const nativeText = withoutPageNumbers(p.text);
          text = nativeText ? nativeText + '\n' + data.text : data.text;
          ocrStatus = 'done';
          confidence = data.confidence;
        } catch {
          failed++;
          ocrStatus = 'failed';
          if (!worker) ocrUnavailable = true;
        }
      }
      analysisCache.set(key, cached);
      if (reused) cachedPages++;
      const last = {
        ...p,
        verdict: evaluatePage(p, {
          text,
          ink,
          tolerance: options.tolerance,
          confidence,
          ocrStatus,
          scanReview,
          scanMetrics,
        }),
      };
      result.push(last);
      onPage?.(last, i);
      detail('Concluída', 100, true);
    }
  } finally {
    await worker?.terminate();
  }
  return { pages: result, failed };
}

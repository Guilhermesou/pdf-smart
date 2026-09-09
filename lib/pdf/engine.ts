import {
  canvasBlob,
  paintBeforeWork,
  yieldTask,
  exportPayload,
  pruneResources,
  type ExportProgress,
} from './runtime';
import { recognizeScanStamp, looksLikeBleedThrough, scanRegion, scanNeedsReview } from './scan';
import {
  classify,
  measureInk,
  measureInteriorInk,
  shouldRunOcr,
  withoutPageNumbers,
  type Verdict,
} from './detection';
import type { PDFDocumentProxy } from 'pdfjs-dist';
export type PageItem = {
  id: string;
  source: string | null;
  index: number;
  rotation: number;
  thumb: string;
  text: string;
  ink: number;
  interiorInk?: number;
  verdict?: Verdict;
};
export type Source = {
  name: string;
  file: File;
  doc: PDFDocumentProxy;
  destroy: () => Promise<void>;
};
export const sources = new Map<string, Source>();
const thumbnailUrls = new Set<string>();
export function releaseUnusedResources(
  pages: PageItem[],
  history: PageItem[][],
) {
  pruneResources(sources, thumbnailUrls, pages, history, (url) =>
    URL.revokeObjectURL(url),
  );
}
export function disposeResources() {
  releaseUnusedResources([], []);
}
export type AnalysisProgress = {
  current: number;
  completed: number;
  total: number;
  page: PageItem;
  stage: string;
  pageProgress?: number;
};

export async function importPdf(file: File, progress: (s: string) => void) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: '/pdf/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdf/standard_fonts/',
    wasmUrl: '/pdf/wasm/',
  });
  task.onPassword = () => {
    void task.destroy();
  };
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch {
    throw new Error(
      'Não foi possível abrir ' +
        file.name +
        '. Verifique se é um PDF válido e sem senha.',
    );
  }
  const source = crypto.randomUUID(),
    pages: PageItem[] = [];
  try {
    for (let index = 0; index < doc.numPages; index++) {
      progress(`Abrindo ${file.name} · ${index + 1}/${doc.numPages}`);
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({
        scale: 500 / page.getViewport({ scale: 1 }).width,
      });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        background: 'rgb(255,255,255)',
      }).promise;
      const content = await page.getTextContent();
      const text = content.items
        .map((x) => ('str' in x ? x.str + (x.hasEOL ? '\n' : '') : ''))
        .join(' ');
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const ink = measureInk(pixels);
      const interiorInk = measureInteriorInk(
        pixels,
        canvas.width,
        canvas.height,
      );
      pages.push({
        id: crypto.randomUUID(),
        source,
        index,
        rotation: 0,
        thumb: '',
        text,
        ink,
        interiorInk,
      });
      const thumb = document.createElement('canvas');
      thumb.width = 220;
      thumb.height = Math.max(
        1,
        Math.round((canvas.height / canvas.width) * 220),
      );
      thumb
        .getContext('2d')!
        .drawImage(canvas, 0, 0, thumb.width, thumb.height);
      const url = URL.createObjectURL(await canvasBlob(thumb));
      thumbnailUrls.add(url);
      pages[pages.length - 1].thumb = url;
      thumb.width = 0;
      canvas.width = 0;
      page.cleanup();
      await new Promise((r) => setTimeout(r, 0));
    }
    await doc.cleanup();
    sources.set(source, {
      name: file.name,
      file,
      doc,
      destroy: () => task.destroy(),
    });
    return pages;
  } catch (e) {
    for (const p of pages) {
      URL.revokeObjectURL(p.thumb);
      thumbnailUrls.delete(p.thumb);
    }
    await task.destroy();
    throw e;
  }
}
export async function renderPage(p: PageItem, width = 1300) {
  const canvas = document.createElement('canvas');
  if (!p.source) {
    canvas.width = 595;
    canvas.height = 842;
    const c = canvas.getContext('2d')!;
    c.fillStyle = 'white';
    c.fillRect(0, 0, 595, 842);
    return canvas;
  }
  const page = await sources.get(p.source)!.doc.getPage(p.index + 1);
  const viewport = page.getViewport({
    scale: width / page.getViewport({ scale: 1 }).width,
    rotation: page.rotate + p.rotation,
  });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  try {
    await page.render({
      canvas,
      canvasContext: canvas.getContext('2d')!,
      viewport,
      background: 'rgb(255,255,255)',
    }).promise;
    return canvas;
  } catch (error) {
    canvas.width = 0;
    throw error;
  } finally {
    page.cleanup();
  }
}
export async function analyze(
  pages: PageItem[],
  options: {
    ocr: boolean;
    tolerance: number;
    ignoreBorders?: boolean;
    scanMode?: boolean;
  },
  onProgress: (s: string) => void,
  cancel: { current: boolean },
  onPage?: (page: PageItem, index: number) => void,
  onDetail?: (progress: AnalysisProgress) => void,
) {
  let worker:
    | Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>
    | undefined;
  const result: PageItem[] = [];
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
      let text = p.text,
        confidence = 100;
      // Searchable scans can contain an OCR layer describing bleed-through.
      // Inspect rendered evidence before applying the extracted-text OCR gate.
      if (options.scanMode && p.source) {
        const visual = await renderPage({ ...p, rotation: 0 }, 700);
        try {
          const metrics = scanRegion(
            visual.getContext('2d')!.getImageData(0, 0, visual.width, visual.height).data,
            visual.width,
            visual.height,
          );
          scanReview = scanNeedsReview(withoutPageNumbers(p.text), metrics.ink, metrics.boxArea, true);
          scanMetrics = metrics;
        } finally {
          visual.width = 0;
        }
      }
      if (options.ocr && (scanReview || shouldRunOcr(text, ink)) && p.source) {
        try {
          if (ocrUnavailable)
            throw new Error('OCR indisponível nesta análise.');
          if (!worker) {
            onProgress('Preparando reconhecimento de carimbos…');
            detail('Preparando OCR', undefined, true);
            const { createWorker, PSM } = await import('tesseract.js');
            worker = await createWorker('eng', 1, {
              workerPath: new URL('/ocr/worker.min.js', window.location.origin)
                .href,
              corePath: new URL('/ocr/core', window.location.origin).href,
              errorHandler: () => {},
              logger: (event) =>
                detail(
                  'Reconhecimento de texto',
                  Math.min(100, Math.max(0, Math.round(event.progress * 100))),
                ),
              langPath: 'https://tessdata.projectnaptha.com/4.0.0',
            });
            await worker.setParameters({
              tessedit_pageseg_mode: PSM.SPARSE_TEXT,
            });
          }
          const canvas = await renderPage({ ...p, rotation: 0 }, 1500);
          try {
            const recognized = options.scanMode
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
            const { data } = recognized;
            scanReview = recognized.review;
            if ('scan' in recognized) scanMetrics = recognized.scan;
            // Preserve extracted native text; OCR must not erase real content.
            const nativeText = withoutPageNumbers(p.text);
            text = nativeText ? nativeText + '\n' + data.text : data.text;
            ocrStatus = 'done';
            confidence = data.confidence;
          } finally {
            canvas.width = 0;
          }
        } catch {
          failed++;
          ocrStatus = 'failed';
          if (!worker) ocrUnavailable = true;
        }
      }
      result.push({
        ...p,
        verdict: {
          ...classify(text, ink, options.tolerance, confidence),
          ocrStatus,
          recognizedText: text.slice(0, 500),
          darkInk: scanMetrics?.ink,
          paleInk: scanMetrics?.paleInk,
        },
      });
      const last = result[result.length - 1];
      if (scanReview && last.verdict?.kind === 'content') {
        last.verdict.kind = 'sparse';
        last.verdict.reason =
          'Poucas marcas escuras concentradas, compatíveis com carimbo ou assinatura. OCR inconclusivo; revise a página inteira.';
      }
      if (
        last.verdict &&
        last.verdict.kind !== 'stamp' &&
        scanMetrics &&
        looksLikeBleedThrough(scanReview, scanMetrics.ink, scanMetrics.paleInk)
      ) {
        last.verdict.kind = 'bleed';
        last.verdict.reason =
          'Predominam marcas claras com poucos traços escuros concentrados. Pode ser transparência da frente, mas também conteúdo desbotado: confira a página inteira antes de excluir.';
      }
      if (scanReview && withoutPageNumbers(p.text).trim() && last.verdict && last.verdict.kind !== 'content') {
        last.verdict.kind = 'bleed';
        last.verdict.reason =
          'Imagem com poucas marcas escuras, mas o PDF contém texto extraído. Pode ser OCR da transparência da frente ou conteúdo claro: revise a página inteira.';
      }
      if (last.verdict?.kind === 'blank' && p.ink - ink > 0.001) {
        last.verdict.kind = 'sparse';
        last.verdict.reason =
          'Interior vazio; marcas nas bordas foram desconsideradas. Revise a página inteira.';
      }
      onPage?.(last, i);
      detail('Concluída', 100, true);
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    await worker?.terminate();
  }
  return { pages: result, failed };
}
export async function exportPdf(
  pages: PageItem[],
  onProgress?: (progress: ExportProgress) => void,
) {
  await paintBeforeWork();
  return new Promise<Uint8Array>((resolve, reject) => {
    const worker = new Worker(new URL('./export.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e) => {
      if (e.data.progress) {
        onProgress?.(e.data.progress);
        return;
      }
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.bytes);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('Não foi possível gerar o PDF.'));
    };
    try {
      worker.postMessage(exportPayload(pages, sources));
    } catch (e) {
      worker.terminate();
      reject(e);
    }
  });
}

export async function pageSize(p: PageItem): Promise<[number, number]> {
  if (!p.source) return p.rotation % 180 ? [841.89, 595.28] : [595.28, 841.89];
  const page = await sources.get(p.source)!.doc.getPage(p.index + 1);
  const view = page.getViewport({
    scale: 1,
    rotation: page.rotate + p.rotation,
  });
  return [view.width, view.height];
}

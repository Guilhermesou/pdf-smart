import {
  canvasBlob,
  paintBeforeWork,
  exportPayload,
  pruneResources,
  type ExportProgress,
} from './runtime';
import { measureInk, measureInteriorInk } from './detection';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  PageItem,
  Source,
  AnalysisProgress,
  AnalysisOptions,
} from './types';
export type { PageItem, Source, AnalysisProgress } from './types';
import { analyzePages } from './analysis';
import { analysisCache } from './analysis-cache';
export const sources = new Map<string, Source>();
const thumbnailUrls = new Set<string>();
export function releaseUnusedResources(
  pages: PageItem[],
  history: PageItem[][],
) {
  pruneResources(sources, thumbnailUrls, pages, history, (url) =>
    URL.revokeObjectURL(url),
  );
  analysisCache.retainSources(new Set(sources.keys()));
}
export function disposeResources() {
  releaseUnusedResources([], []);
}
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
      const thumb = document.createElement('canvas');
      try {
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
      } finally {
        thumb.width = 0;
        canvas.width = 0;
        page.cleanup();
      }
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
export function analyze(
  pages: PageItem[],
  options: AnalysisOptions,
  onProgress: (message: string) => void,
  cancel: { current: boolean },
  onPage?: (page: PageItem, index: number) => void,
  onDetail?: (progress: AnalysisProgress) => void,
) {
  return analyzePages(
    pages,
    options,
    onProgress,
    cancel,
    onPage,
    onDetail,
    renderPage,
  );
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

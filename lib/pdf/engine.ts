import {
  canvasBlob,
  withAbort,
  paintBeforeWork,
  exportPayload,
  type ExportProgress,
} from './runtime';
import { measureInk, measureInteriorInk } from './detection';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageItem, AnalysisProgress, AnalysisOptions } from './types';
export type { PageItem, Source, AnalysisProgress } from './types';
import { analyzePages } from './analysis';
import { SessionResources } from './session-resources';
import { requestWorker } from './worker-client';
/** Factory: documents, cache and active jobs belong to this instance alone. */
export function createPdfSession() {
  const resources = new SessionResources();
  const { sources, thumbnailUrls } = resources;
  const signal = resources.signal;
  const thumbCache = new Map<
    string,
    { thumb: string; ink: number; interiorInk: number }
  >();
  const thumbPending = new Map<
    string,
    Promise<{ thumb: string; ink: number; interiorInk: number }>
  >();
  function checked<T extends unknown[]>(
    callback: ((...args: T) => void) | undefined,
  ) {
    return (...args: T) => {
      if (!signal.aborted) callback?.(...args);
    };
  }
  async function renderThumbnail(
    p: PageItem,
  ): Promise<{ thumb: string; ink: number; interiorInk: number }> {
    if (p.thumb) {
      return {
        thumb: p.thumb,
        ink: p.ink >= 0 ? p.ink : 0,
        interiorInk: p.interiorInk ?? (p.ink >= 0 ? p.ink : 0),
      };
    }
    if (!p.source) {
      return { thumb: '', ink: 0, interiorInk: 0 };
    }
    const key = `${p.source}:${p.index}`;
    const cached = thumbCache.get(key);
    if (cached) return cached;
    const pending = thumbPending.get(key);
    if (pending) return pending;

    const task = (async () => {
      resources.assertOpen();
      const source = sources.get(p.source!);
      if (!source) throw new Error('Arquivo de origem indisponível.');
      const page = await source.doc.getPage(p.index + 1);
      resources.assertOpen();
      const unscaled = page.getViewport({ scale: 1 });
      const targetWidth = 220;
      const scale = targetWidth / Math.max(1, unscaled.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

      const rendering = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        background: 'rgb(255,255,255)',
      });

      const abortRender = () => rendering.cancel();
      signal.addEventListener('abort', abortRender, { once: true });

      try {
        await rendering.promise;
        resources.assertOpen();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const ink = measureInk(pixels);
        const interiorInk = measureInteriorInk(pixels, canvas.width, canvas.height);
        const blob = await withAbort(canvasBlob(canvas, 'image/webp', 0.8), signal);
        resources.assertOpen();
        const url = URL.createObjectURL(blob);
        resources.addThumbnail(url);
        const result = { thumb: url, ink, interiorInk };
        thumbCache.set(key, result);
        return result;
      } finally {
        signal.removeEventListener('abort', abortRender);
        canvas.width = 0;
        page.cleanup();
        thumbPending.delete(key);
      }
    })();

    thumbPending.set(key, task);
    return task;
  }
  async function importPdf(
    file: File,
    progress: (s: string) => void,
    onPages?: (pages: PageItem[]) => void,
  ) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
    const bytes = new Uint8Array(await withAbort(file.arrayBuffer(), signal));
    resources.assertOpen();
    const task = pdfjs.getDocument({
      data: bytes,
      cMapUrl: '/pdf/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdf/standard_fonts/',
      wasmUrl: '/pdf/wasm/',
    });
    let destruction: Promise<void> | undefined;
    const destroyTask = () => (destruction ??= task.destroy());
    const abortLoading = () => {
      void destroyTask().catch(() => {});
    };
    signal.addEventListener('abort', abortLoading, { once: true });
    let passwordAttempts = 0;
    task.onPassword = (
      callback: (password: string) => void,
      reason: number,
    ) => {
      passwordAttempts++;
      if (passwordAttempts > 3) {
        void destroyTask().catch(() => {});
        return;
      }
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        const msg =
          reason === 2
            ? `Senha incorreta para "${file.name}". Digite novamente:`
            : `O arquivo "${file.name}" está protegido por senha. Digite a senha para abrir:`;
        const pwd = window.prompt(msg);
        if (pwd !== null && pwd.length > 0) {
          callback(pwd);
          return;
        }
      }
      void destroyTask().catch(() => {});
    };
    let doc: PDFDocumentProxy;
    try {
      doc = await task.promise;
    } catch {
      signal.removeEventListener('abort', abortLoading);
      await destroyTask();
      throw new Error(
        'Não foi possível abrir ' +
          file.name +
          '. Verifique se é um PDF válido e sem senha.',
      );
    }
    const source = crypto.randomUUID(),
      pages: PageItem[] = [];
    if (signal.aborted) {
      await destroyTask();
      throw new Error('Operação encerrada.');
    }
    resources.addSource(source, {
      name: file.name,
      file,
      doc,
      destroy: destroyTask,
    });
    try {
      for (let index = 0; index < doc.numPages; index++) {
        pages.push({
          id: crypto.randomUUID(),
          source,
          index,
          rotation: 0,
          thumb: '',
          text: '',
          ink: -1,
        });
      }

      const initialBatch = Math.min(12, doc.numPages);
      for (let index = 0; index < initialBatch; index++) {
        resources.assertOpen();
        progress(`Abrindo ${file.name} · ${index + 1}/${doc.numPages}`);
        const p = pages[index];
        const page = await doc.getPage(index + 1);
        try {
          const content = await page.getTextContent();
          p.text = content.items
            .map((x) => ('str' in x ? x.str + (x.hasEOL ? '\n' : '') : ''))
            .join(' ');
        } finally {
          page.cleanup();
        }
        const thumbRes = await renderThumbnail(p);
        p.thumb = thumbRes.thumb;
        p.ink = thumbRes.ink;
        p.interiorInk = thumbRes.interiorInk;
        if (index === 0 || index === initialBatch - 1) {
          onPages?.([...pages]);
        }
      }

      if (doc.numPages > initialBatch) {
        for (let index = initialBatch; index < doc.numPages; index++) {
          resources.assertOpen();
          const p = pages[index];
          const page = await doc.getPage(index + 1);
          try {
            const content = await page.getTextContent();
            p.text = content.items
              .map((x) => ('str' in x ? x.str + (x.hasEOL ? '\n' : '') : ''))
              .join(' ');
          } finally {
            page.cleanup();
          }
          if ((index + 1) % 25 === 0 || index === doc.numPages - 1) {
            progress(
              `Lendo texto de ${file.name} · ${index + 1}/${doc.numPages}`,
            );
            onPages?.([...pages]);
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      }
      await doc.cleanup();
      return pages;
    } catch (e) {
      for (const p of pages) {
        if (p.thumb) {
          URL.revokeObjectURL(p.thumb);
          thumbnailUrls.delete(p.thumb);
        }
      }
      sources.delete(source);
      await destroyTask();
      throw e;
    } finally {
      signal.removeEventListener('abort', abortLoading);
    }
  }
  async function renderPage(p: PageItem, width = 1300) {
    const canvas = document.createElement('canvas');
    if (!p.source) {
      canvas.width = 595;
      canvas.height = 842;
      const c = canvas.getContext('2d')!;
      c.fillStyle = 'white';
      c.fillRect(0, 0, 595, 842);
      return canvas;
    }
    resources.assertOpen();
    const source = sources.get(p.source);
    if (!source) throw new Error('Arquivo de origem indisponível.');
    const page = await source.doc.getPage(p.index + 1);
    resources.assertOpen();
    const viewport = page.getViewport({
      scale: width / page.getViewport({ scale: 1 }).width,
      rotation: page.rotate + p.rotation,
    });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const rendering = page.render({
      canvas,
      canvasContext: canvas.getContext('2d')!,
      viewport,
      background: 'rgb(255,255,255)',
    });
    const abortRender = () => rendering.cancel();
    signal.addEventListener('abort', abortRender, { once: true });
    try {
      await rendering.promise;
      resources.assertOpen();
      return canvas;
    } catch (error) {
      canvas.width = 0;
      throw error;
    } finally {
      signal.removeEventListener('abort', abortRender);
      page.cleanup();
    }
  }
  function analyze(
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
      checked(onProgress),
      {
        get current() {
          return signal.aborted || cancel.current;
        },
      },
      checked(onPage),
      checked(onDetail),
      renderPage,
      resources.cache,
      signal,
    );
  }
  async function exportPdf(
    pages: PageItem[],
    onProgress?: (progress: ExportProgress) => void,
    sharedWorker?: Worker,
    numbering?: import('./worker-protocol').PageNumberingOptions,
    watermark?: import('./worker-protocol').WatermarkOptions,
    normalizeA4?: boolean,
  ) {
    await paintBeforeWork();
    resources.assertOpen();
    const worker =
      sharedWorker ??
      new Worker(new URL('./export.worker.ts', import.meta.url), {
        type: 'module',
      });
    try {
      const response = await requestWorker(
        worker,
        {
          type: 'export',
          ...exportPayload(pages, sources),
          reuseSource: !!sharedWorker,
          numbering,
          watermark,
          normalizeA4,
        },
        { signal, expected: 'result', progress: checked(onProgress) },
      );
      if (response.type !== 'result')
        throw new Error('Resultado de exportação indisponível.');
      return response.bytes;
    } finally {
      if (!sharedWorker) worker.terminate();
    }
  }

  async function pageSize(p: PageItem): Promise<[number, number]> {
    if (!p.source)
      return p.rotation % 180 ? [841.89, 595.28] : [595.28, 841.89];
    resources.assertOpen();
    const source = sources.get(p.source);
    if (!source) throw new Error('Arquivo de origem indisponível.');
    const page = await source.doc.getPage(p.index + 1);
    resources.assertOpen();
    const view = page.getViewport({
      scale: 1,
      rotation: page.rotate + p.rotation,
    });
    return [view.width, view.height];
  }

  /** Reuse one parsed source across consecutive parts, bounded to one document. */
  async function exportPdfParts(
    pages: PageItem[],
    every: number,
    onPart: (bytes: Uint8Array, part: number) => void,
    onProgress?: (progress: ExportProgress, part: number) => void,
  ) {
    if (!Number.isSafeInteger(every) || every < 1)
      throw new Error('Divisão inválida.');
    resources.assertOpen();
    const worker = new Worker(new URL('./export.worker.ts', import.meta.url), {
      type: 'module',
    });
    try {
      for (let start = 0; start < pages.length; start += every) {
        const part = Math.floor(start / every) + 1;
        const bytes = await exportPdf(
          pages.slice(start, start + every),
          (progress) => onProgress?.(progress, part),
          worker,
        );
        resources.assertOpen();
        onPart(bytes, part);
      }
    } finally {
      worker.terminate();
    }
  }

  return {
    signal,
    importPdf: (
      file: File,
      progress: (message: string) => void,
      onPages?: (pages: PageItem[]) => void,
    ) =>
      resources.run(() => importPdf(file, checked(progress), checked(onPages))),
    renderPage: (page: PageItem, width?: number) =>
      resources.run(() => renderPage(page, width)),
    renderThumbnail: (page: PageItem) =>
      resources.run(() => renderThumbnail(page)),
    pageSize: (page: PageItem) => resources.run(() => pageSize(page)),
    analyze: (...args: Parameters<typeof analyze>) =>
      resources.run(() => analyze(...args)),
    exportPdf: (...args: Parameters<typeof exportPdf>) =>
      resources.run(() => exportPdf(...args)),
    exportPdfParts: (...args: Parameters<typeof exportPdfParts>) =>
      resources.run(() => exportPdfParts(...args)),
    run: <T>(operation: () => Promise<T>) => resources.run(operation),
    assertOpen: () => resources.assertOpen(),
    releaseUnusedResources: (pages: PageItem[], history: PageItem[][]) => {
      resources.retain(pages, history);
      for (const key of thumbCache.keys()) {
        const sourceId = key.split(':')[0];
        if (!sources.has(sourceId)) {
          thumbCache.delete(key);
        }
      }
    },
    disposeResources: () => {
      thumbCache.clear();
      thumbPending.clear();
      return resources.dispose();
    },
  };
}

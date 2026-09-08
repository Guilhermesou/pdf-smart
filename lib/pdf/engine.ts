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
export type Source = { name: string; bytes: Uint8Array; doc: PDFDocumentProxy };
export const sources = new Map<string, Source>();
export async function importPdf(file: File, progress: (s: string) => void) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({
    data: bytes.slice(),
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
        thumb: canvas.toDataURL('image/webp', 0.8),
        text,
        ink,
        interiorInk,
      });
      canvas.width = 0;
      page.cleanup();
      await new Promise((r) => setTimeout(r, 0));
    }
    sources.set(source, { name: file.name, bytes, doc });
    return pages;
  } catch (e) {
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
  await page.render({
    canvas,
    canvasContext: canvas.getContext('2d')!,
    viewport,
    background: 'rgb(255,255,255)',
  }).promise;
  page.cleanup();
  return canvas;
}
export async function analyze(
  pages: PageItem[],
  options: { ocr: boolean; tolerance: number; ignoreBorders?: boolean },
  onProgress: (s: string) => void,
  cancel: { current: boolean },
) {
  let worker:
    | Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>
    | undefined;
  const result: PageItem[] = [];
  let failed = 0,
    ocrUnavailable = false,
    activePage = 0;
  try {
    for (let i = 0; i < pages.length; i++) {
      if (cancel.current) break;
      const p = pages[i];
      activePage = i + 1;
      onProgress(`Analisando página ${i + 1} de ${pages.length}`);
      const ink = options.ignoreBorders ? (p.interiorInk ?? p.ink) : p.ink;
      let ocrStatus: Verdict['ocrStatus'] = options.ocr
        ? 'not-needed'
        : 'disabled';
      let text = p.text,
        confidence = 100;
      if (options.ocr && shouldRunOcr(text, ink) && p.source) {
        try {
          if (ocrUnavailable)
            throw new Error('OCR indisponível nesta análise.');
          if (!worker) {
            onProgress('Preparando reconhecimento de carimbos…');
            const { createWorker, PSM } = await import('tesseract.js');
            worker = await createWorker('eng', 1, {
              workerPath: new URL('/ocr/worker.min.js', window.location.origin)
                .href,
              corePath: new URL('/ocr/core', window.location.origin).href,
              errorHandler: () => {},
              logger: (event) =>
                onProgress(
                  `OCR · página ${activePage}/${pages.length} · ${Math.round(event.progress * 100)}%`,
                ),
              langPath: 'https://tessdata.projectnaptha.com/4.0.0',
            });
            await worker.setParameters({
              tessedit_pageseg_mode: PSM.SPARSE_TEXT,
            });
          }
          const canvas = await renderPage({ ...p, rotation: 0 }, 1500);
          const { data } = await worker.recognize(canvas);
          // Preserve extracted native text; OCR must not erase real content.
          const nativeText = withoutPageNumbers(p.text);
          text = nativeText ? nativeText + '\n' + data.text : data.text;
          ocrStatus = 'done';
          confidence = data.confidence;
          canvas.width = 0;
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
        },
      });
      const last = result[result.length - 1];
      if (last.verdict?.kind === 'blank' && p.ink - ink > 0.001) {
        last.verdict.kind = 'sparse';
        last.verdict.reason =
          'Interior vazio; marcas nas bordas foram desconsideradas. Revise a página inteira.';
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    await worker?.terminate();
  }
  return { pages: result, failed };
}
export function exportPdf(pages: PageItem[]) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const worker = new Worker(new URL('./export.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.bytes);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('Não foi possível gerar o PDF.'));
    };
    worker.postMessage({
      pages,
      sources: Object.fromEntries(
        [...new Set(pages.map((p) => p.source).filter(Boolean))].map((id) => [
          id,
          sources.get(id!)!.bytes,
        ]),
      ),
    });
  });
}

import type {
  PageItem,
  AnalysisOptions,
  AnalysisProgress,
} from '../../../lib/pdf/types';
import type { ExportProgress } from '../../../lib/pdf/runtime';

/** Application ports. Implementations own PDF libraries, workers and file output. */
export interface EditorServices {
  readonly signal: AbortSignal;
  importPdf(
    this: void,
    file: File,
    progress: (message: string) => void,
    onPages?: (pages: PageItem[]) => void,
  ): Promise<PageItem[]>;
  analyze(
    this: void,
    pages: PageItem[],
    options: AnalysisOptions,
    progress: (message: string) => void,
    cancel: { current: boolean },
    onPage?: (page: PageItem, index: number) => void,
    onDetail?: (progress: AnalysisProgress) => void,
  ): Promise<{ pages: PageItem[]; failed: number }>;
  exportPdf(
    this: void,
    pages: PageItem[],
    progress?: (progress: ExportProgress) => void,
    sharedWorker?: Worker,
    numbering?: import('../../../lib/pdf/worker-protocol').PageNumberingOptions,
  ): Promise<Uint8Array>;
  exportPdfParts(
    this: void,
    pages: PageItem[],
    every: number,
    onPart: (bytes: Uint8Array, part: number) => void,
    progress?: (progress: ExportProgress, part: number) => void,
  ): Promise<void>;
  compressPages(
    this: void,
    pages: PageItem[],
    progress: (message: string) => void,
    cancelled: () => boolean,
  ): Promise<Uint8Array>;
  renderPage(
    this: void,
    page: PageItem,
    width?: number,
  ): Promise<HTMLCanvasElement>;
  renderThumbnail(
    this: void,
    page: PageItem,
  ): Promise<{ thumb: string; ink: number; interiorInk?: number }>;
  releaseUnusedResources(
    this: void,
    pages: PageItem[],
    history: PageItem[][],
  ): void;
  disposeResources(this: void): Promise<void>;
  saveBytes(this: void, bytes: Uint8Array, filename: string): void | Promise<unknown>;
}

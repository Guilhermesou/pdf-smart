import type { Verdict } from './detection';
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
export type AnalysisProgress = {
  current: number;
  completed: number;
  total: number;
  page: PageItem;
  stage: string;
  pageProgress?: number;
  elapsedSeconds?: number;
  cachedPages?: number;
};

export type AnalysisOptions = {
  ocr: boolean;
  tolerance: number;
  ignoreBorders?: boolean;
  scanMode?: boolean;
};

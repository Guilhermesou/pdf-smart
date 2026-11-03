import type { ExportPageRef, ExportProgress } from './runtime';

export type ExportRequest = {
  type: 'export';
  pages: ExportPageRef[];
  sources: Record<string, Blob | Uint8Array>;
  reuseSource?: boolean;
};
export type CompressionRequest =
  | { type: 'start' }
  | {
      type: 'page';
      jpeg: ArrayBuffer | Uint8Array;
      width: number;
      height: number;
    }
  | { type: 'save' };
export type OcrAssets = {
  workerPath: string;
  corePath: string;
  langPath: string;
};
export type OcrRequest =
  | { type: 'ocr-start'; assets: OcrAssets }
  | { type: 'ocr-recognize'; image: string }
  | {
      type: 'ocr-parameters';
      parameters: { tessedit_pageseg_mode: import('tesseract.js').PSM };
    };
export type WorkerRequest = ExportRequest | CompressionRequest | OcrRequest;
export type WorkerResponse =
  | { type: 'progress'; progress: ExportProgress }
  | { type: 'ready'; ready: true }
  | { type: 'result'; bytes: Uint8Array }
  | { type: 'error'; error: string }
  | { type: 'ocr-progress'; stage: string; percent: number }
  | { type: 'ocr-result'; data: { text: string; confidence: number } };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function isExportRequest(value: unknown): value is ExportRequest {
  if (
    !record(value) ||
    value.type !== 'export' ||
    !Array.isArray(value.pages) ||
    !record(value.sources)
  )
    return false;
  if (value.reuseSource !== undefined && typeof value.reuseSource !== 'boolean')
    return false;
  return (
    value.pages.every(
      (page) =>
        record(page) &&
        (page.source === null || typeof page.source === 'string') &&
        integer(page.index) &&
        typeof page.rotation === 'number' &&
        Number.isFinite(page.rotation) &&
        page.rotation % 90 === 0,
    ) &&
    Object.values(value.sources).every(
      (file) => file instanceof Blob || file instanceof Uint8Array,
    )
  );
}
export function isCompressionRequest(
  value: unknown,
): value is CompressionRequest {
  if (!record(value)) return false;
  if (value.type === 'start' || value.type === 'save') return true;
  return (
    value.type === 'page' &&
    (value.jpeg instanceof ArrayBuffer || value.jpeg instanceof Uint8Array) &&
    typeof value.width === 'number' &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height) &&
    value.height > 0
  );
}
export function isOcrRequest(value: unknown): value is OcrRequest {
  if (!record(value)) return false;
  switch (value.type) {
    case 'ocr-start': {
      const assets = value.assets;
      return (
        record(assets) &&
        ['workerPath', 'corePath', 'langPath'].every(
          (key) => typeof assets[key] === 'string',
        )
      );
    }
    case 'ocr-recognize':
      return (
        typeof value.image === 'string' &&
        value.image.startsWith('data:image/png;base64,') &&
        value.image.length <= 24_000_000
      );
    case 'ocr-parameters':
      return (
        record(value.parameters) &&
        typeof value.parameters.tessedit_pageseg_mode === 'string' &&
        /^(?:[0-9]|1[0-3])$/.test(value.parameters.tessedit_pageseg_mode)
      );
    default:
      return false;
  }
}
export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!record(value)) return false;
  switch (value.type) {
    case 'ocr-progress':
      return (
        typeof value.stage === 'string' &&
        typeof value.percent === 'number' &&
        Number.isFinite(value.percent) &&
        value.percent >= 0 &&
        value.percent <= 100
      );
    case 'ocr-result':
      return (
        record(value.data) &&
        typeof value.data.text === 'string' &&
        typeof value.data.confidence === 'number' &&
        Number.isFinite(value.data.confidence) &&
        value.data.confidence >= 0 &&
        value.data.confidence <= 100
      );
    case 'ready':
      return value.ready === true;
    case 'result':
      return value.bytes instanceof Uint8Array && value.bytes.length > 0;
    case 'error':
      return typeof value.error === 'string';
    case 'progress': {
      const progress = value.progress;
      return (
        record(progress) &&
        ['loading', 'copying', 'saving'].includes(String(progress.phase)) &&
        integer(progress.completed) &&
        integer(progress.total) &&
        progress.total > 0 &&
        progress.completed <= progress.total
      );
    }
    default:
      return false;
  }
}

import { performance } from 'node:perf_hooks';
import { exportPayload } from '../lib/pdf/runtime.ts';
const bytes = new Uint8Array(64 * 1024 * 1024),
  file = new Blob([bytes]),
  pages = Array.from({ length: 600 }, (_, index) => ({
    source: 'a',
    index,
    rotation: 0,
    thumb: 'data:image/webp;base64,' + 'a'.repeat(5000),
    text: 'OCR sample'.repeat(100),
  }));
const oldPayload = { pages, sources: { a: bytes } },
  newPayload = exportPayload(pages, new Map([['a', { file }]]));
const time = (payload) => {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    global.gc?.();
    const start = performance.now();
    structuredClone(payload);
    samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b)[2];
};
console.log(
  JSON.stringify(
    {
      fixture: 'Synthetic 64 MiB PDF + 600 page records',
      oldCloneMedianMs: time(oldPayload),
      newCloneMedianMs: time(newPayload),
      thumbnailPixelsPerPage: { before: 500 * 707, after: 220 * 311 },
      visibleCardsUpperBound: 36,
      totalPages: 600,
    },
    null,
    2,
  ),
);

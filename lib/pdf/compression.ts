import { requestWorker } from './worker-client';
import { canvasBlob, yieldTask, withAbort } from './runtime';
import type { PageItem } from './types';

/** One acknowledged page at a time prevents a backlog of full-resolution images. */
export async function compressPages(
  pages: PageItem[],
  onProgress: (message: string) => void,
  cancelled: () => boolean,
  renderer: {
    renderPage: (page: PageItem, width?: number) => Promise<HTMLCanvasElement>;
    pageSize: (page: PageItem) => Promise<[number, number]>;
    signal: AbortSignal;
  },
) {
  const worker = new Worker(new URL('./compress.worker.ts', import.meta.url), {
    type: 'module',
  });
  const request = (
    data: import('./worker-protocol').CompressionRequest,
    expected: 'ready' | 'result',
    transfer: Transferable[] = [],
  ) =>
    requestWorker(worker, data, {
      signal: renderer.signal,
      expected,
      transfer,
    });
  const checkCancelled = () => {
    if (cancelled() || renderer.signal.aborted)
      throw new Error('Compressão cancelada.');
  };
  try {
    checkCancelled();
    await request({ type: 'start' }, 'ready');
    for (const [index, page] of pages.entries()) {
      checkCancelled();
      onProgress(`Comprimindo página ${index + 1}/${pages.length}`);
      const canvas = await renderer.renderPage(page, 1200);
      try {
        const jpeg = await (
          await withAbort(
            canvasBlob(canvas, 'image/jpeg', 0.65),
            renderer.signal,
          )
        ).arrayBuffer();
        const [width, height] = await renderer.pageSize(page);
        checkCancelled();
        await request({ type: 'page', jpeg, width, height }, 'ready', [jpeg]);
      } finally {
        canvas.width = 0;
      }
      await yieldTask();
    }
    checkCancelled();
    onProgress('Finalizando compressão…');
    const result = await request({ type: 'save' }, 'result');
    checkCancelled();
    if (result.type !== 'result')
      throw new Error('Arquivo comprimido indisponível.');
    return result.bytes;
  } finally {
    worker.terminate();
  }
}

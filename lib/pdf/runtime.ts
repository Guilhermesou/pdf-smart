/** Let React commit and the browser paint before starting a costly operation. */
export function paintBeforeWork(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve();
      }
    };
    const timer = setTimeout(finish, 100);
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(() => requestAnimationFrame(finish));
    else setTimeout(finish, 0);
  });
}
export function canvasBlob(
  canvas: HTMLCanvasElement,
  type = 'image/webp',
  quality = 0.8,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('Não foi possível preparar a imagem.')),
      type,
      quality,
    ),
  );
}
/** Reject promptly on session close, without leaving a subscription behind. */
export async function withAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error('Operação encerrada.'));
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
/** Bound asynchronous host operations, including callbacks that never arrive. */
export async function withTimeout<T>(
  operation: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export type ExportProgress = {
  phase: 'loading' | 'copying' | 'saving';
  completed: number;
  total: number;
};
export function exportMessage(progress: ExportProgress) {
  return progress.phase === 'loading'
    ? `Lendo arquivo para exportação · ${progress.completed}/${progress.total} páginas`
    : progress.phase === 'saving'
      ? 'Finalizando arquivo PDF…'
      : `Montando PDF · ${progress.completed}/${progress.total} páginas`;
}

export function yieldTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
export type ExportPageRef = {
  source: string | null;
  index: number;
  rotation: number;
};
export function exportPayload(
  pages: ExportPageRef[],
  sources: Map<string, { file: Blob }>,
) {
  const refs = pages.map(({ source, index, rotation }) => ({
    source,
    index,
    rotation,
  }));
  const files: Record<string, Blob> = {};
  for (const page of refs)
    if (page.source && !files[page.source]) {
      const file = sources.get(page.source)?.file;
      if (!file) throw new Error('Arquivo de origem indisponível.');
      files[page.source] = file;
    }
  return { pages: refs, sources: files };
}
export function virtualWindow(
  total: number,
  columns: number,
  rowHeight: number,
  top: number,
  height: number,
) {
  const rows = Math.ceil(total / columns),
    startRow = Math.max(
      0,
      Math.min(Math.max(0, rows - 1), Math.floor(top / rowHeight) - 1),
    ),
    endRow = Math.min(rows, Math.ceil((top + height) / rowHeight) + 1);
  return {
    start: startRow * columns,
    end: Math.max(startRow * columns, Math.min(total, endRow * columns)),
    offset: startRow * rowHeight,
    height: rows * rowHeight,
  };
}
export function pruneResources(
  sources: Map<string, { destroy: () => Promise<void> }>,
  urls: Set<string>,
  pages: { source: string | null; thumb: string }[],
  history: { source: string | null; thumb: string }[][],
  revoke: (url: string) => void,
) {
  const ids = new Set<string | null>(),
    retainedUrls = new Set<string>();
  const retain = (page: { source: string | null; thumb: string }) => {
    ids.add(page.source);
    retainedUrls.add(page.thumb);
  };
  pages.forEach(retain);
  for (const snapshot of history) snapshot.forEach(retain);
  for (const [id, source] of sources)
    if (!ids.has(id)) {
      sources.delete(id);
      void source.destroy().catch(() => {});
    }
  for (const url of urls)
    if (!retainedUrls.has(url)) {
      revoke(url);
      urls.delete(url);
    }
}
